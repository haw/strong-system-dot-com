# Day 1: オンプレミス環境をクラウドへ

## 目標

DockerコンテナをEC2で動作させ、VPC、EC2、セキュリティグループの基本を理解する。

## 前提条件

- AWSアカウント
- AWSマネジメントコンソールへのアクセス権限

## 所要時間

約30分

## 重要: リソース名の命名規則

**すべてのリソース名に `-{あなたの名前}` を付けてください。**

例: `day1-vpc-tanaka`, `day1-app-sg-suzuki`, `day1-app-server-yamada`

共有AWSアカウントを使用するため、名前の重複を避ける必要があります。

---

## 手順

### 1. VPC作成

1. AWSマネジメントコンソールで **VPC** サービスを開く
2. 左メニューから **VPC** を選択
3. **VPCを作成** ボタンをクリック
4. 以下の設定を入力：
   - **作成するリソース**: VPCなど
   - **名前タグ**: `day1-vpc-{あなたの名前}` (例: `day1-vpc-tanaka`)
   - **IPv4 CIDR ブロック**: `10.0.0.0/16`
   - **IPv6 CIDR ブロック**: IPv6 CIDR ブロックなし
   - **テナンシー**: デフォルト
   - **アベイラビリティーゾーン (AZ) の数**: 2
   - **パブリックサブネットの数**: 2
   - **プライベートサブネットの数**: 2
   - **NATゲートウェイ**: なし
   - **VPCエンドポイント**: なし
5. **VPCを作成** ボタンをクリック

**作成されるリソース:**
- VPC (10.0.0.0/16)
- パブリックサブネット × 2 (10.0.0.0/24, 10.0.1.0/24)
- プライベートサブネット × 2 (10.0.128.0/24, 10.0.129.0/24)
- インターネットゲートウェイ
- ルートテーブル (パブリック用、プライベート用)

---

### 2. セキュリティグループ作成

1. 左メニューから **セキュリティグループ** を選択
2. **セキュリティグループを作成** ボタンをクリック
3. 以下の設定を入力：
   - **セキュリティグループ名**: `day1-app-sg-{あなたの名前}` (例: `day1-app-sg-tanaka`)
   - **説明**: `Security group for Day 1 application`
   - **VPC**: `day1-vpc-{あなたの名前}` を選択

4. **インバウンドルール** を追加：

| タイプ | プロトコル | ポート範囲 | ソース | 説明 |
|--------|-----------|-----------|--------|------|
| カスタムTCP | TCP | 3000 | 0.0.0.0/0 | App Server 1 |
| カスタムTCP | TCP | 3001 | 0.0.0.0/0 | App Server 2 |
| カスタムTCP | TCP | 9000 | 0.0.0.0/0 | MinIO API |
| カスタムTCP | TCP | 9001 | 0.0.0.0/0 | MinIO Console |

5. **セキュリティグループを作成** ボタンをクリック

---

### 3. IAMロール作成

1. AWSマネジメントコンソールで **IAM** サービスを開く
2. 左メニューから **ロール** を選択
3. **ロールを作成** ボタンをクリック
4. **信頼されたエンティティタイプ**: AWSのサービス
5. **ユースケース**: EC2
6. **次へ** ボタンをクリック
7. ポリシーを検索: `AmazonSSMManagedInstanceCore`
8. チェックボックスを選択
9. **次へ** ボタンをクリック
10. **ロール名**: `day1-ec2-role-{あなたの名前}` (例: `day1-ec2-role-tanaka`)
11. **ロールを作成** ボタンをクリック

---

### 4. EC2インスタンス作成

1. AWSマネジメントコンソールで **EC2** サービスを開く
2. **インスタンスを起動** ボタンをクリック

#### 基本設定

- **名前**: `day1-app-server-{あなたの名前}` (例: `day1-app-server-tanaka`)
- **アプリケーションおよび OS イメージ (Amazon マシンイメージ)**: 
  - **クイックスタート**: Ubuntu
  - **Amazon マシンイメージ (AMI)**: Ubuntu Server 24.04 LTS (HVM), SSD Volume Type
  - **アーキテクチャ**: 64 ビット (x86)

#### インスタンスタイプ

- **インスタンスタイプ**: t2.micro

#### キーペア

- **キーペア名**: キーペアなしで続行

#### ネットワーク設定

- **VPC**: `day1-vpc-{あなたの名前}`
- **サブネット**: パブリックサブネット (10.0.0.0/24 または 10.0.1.0/24)
- **パブリック IP の自動割り当て**: 有効化
- **ファイアウォール (セキュリティグループ)**: 既存のセキュリティグループを選択
  - `day1-app-sg-{あなたの名前}` を選択

#### ストレージを設定

- **ルートボリューム**: 
  - **サイズ**: 12 GiB
  - **ボリュームタイプ**: gp3

#### 高度な詳細

- **IAM インスタンスプロファイル**: `day1-ec2-role-{あなたの名前}`
- **ユーザーデータ**: 以下のスクリプトをコピー&ペースト

```bash
#!/bin/bash
set -e

# ログファイル設定
LOG_FILE="/var/log/userdata.log"
exec > >(tee -a ${LOG_FILE}) 2>&1

echo "=========================================="
echo "Day 1: EC2 Setup Script Started"
echo "Timestamp: $(date)"
echo "=========================================="

# SWAPファイルの作成（t2.micro用メモリ対策）
echo "[1/7] Creating SWAP file for t2.micro instance..."
dd if=/dev/zero of=/swapfile bs=128M count=16
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile swap swap defaults 0 0' >> /etc/fstab

# Docker GPGキーの追加
echo "[2/7] Adding Docker's official GPG key..."
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# Dockerリポジトリの追加
echo "[3/7] Adding Docker repository to Apt sources..."
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# Dockerのインストール
echo "[4/7] Installing Docker..."
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# ubuntuユーザーをdockerグループに追加
echo "[5/7] Adding ubuntu user to docker group..."
usermod -aG docker ubuntu

# リポジトリのクローン
echo "[6/7] Cloning repository..."
cd /home/ubuntu
sudo -u ubuntu git clone https://github.com/haw/strong-system-dot-com.git
cd strong-system-dot-com

# Dockerコンテナのビルドと起動
echo "[7/7] Building and starting Docker containers..."
sudo -u ubuntu docker compose build
sudo -u ubuntu docker compose up -d

echo "=========================================="
echo "Day 1: EC2 Setup Script Completed"
echo "Timestamp: $(date)"
echo "=========================================="

# Get public IP using IMDSv2
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" -s)
PUBLIC_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/public-ipv4)

echo ""
echo "Application URLs:"
echo "  - Employee Management System: http://${PUBLIC_IP}:3000"
echo "  - Employee Management System (Replica): http://${PUBLIC_IP}:3001"
echo "  - MinIO Console: http://${PUBLIC_IP}:9001"
echo ""
echo "Note: Make sure to configure Security Group to allow the following ports:"
echo "  - 22/TCP (SSH)"
echo "  - 3000/TCP (App Server 1)"
echo "  - 3001/TCP (App Server 2)"
echo "  - 9000/TCP (MinIO API)"
echo "  - 9001/TCP (MinIO Console)"
```

3. **インスタンスを起動** ボタンをクリック

---

## 動作確認

### 1. インスタンスの起動確認

1. EC2コンソールで **インスタンス** を選択
2. 自分のインスタンス (`day1-app-server-{あなたの名前}`) のステータスが **実行中** になるまで待つ（約1分）
3. **ステータスチェック** が **2/2 のチェックに合格しました** になるまで待つ（約3分）

### 2. ユーザーデータ実行ログの確認

1. インスタンスを選択
2. **接続** ボタンをクリック
3. **セッションマネージャー** タブを選択
4. **接続** ボタンをクリック
5. 以下のコマンドでログを確認：

```bash
sudo su - ubuntu
sudo tail -f /var/log/cloud-init-output.log
```

6. 以下のメッセージが表示されるまで待つ（約5分）：

```
==========================================
Day 1: EC2 Setup Script Completed
Timestamp: ...
==========================================

Application URLs:
  - Employee Management System: http://xx.xx.xx.xx:3000
  - Employee Management System (Replica): http://xx.xx.xx.xx:3001
  - MinIO Console: http://xx.xx.xx.xx:9001
```

### 3. アプリケーションへのアクセス

1. ログに表示されたURLをブラウザで開く
2. 従業員情報管理システムが表示されることを確認

**ログイン情報:**
- ユーザー名: `admin`
- パスワード: `admin`

---

## トラブルシューティング

### アプリケーションにアクセスできない

**原因1: セキュリティグループの設定ミス**
- EC2コンソールでインスタンスを選択
- **セキュリティ** タブを確認
- インバウンドルールに 3000, 3001, 9000, 9001 が 0.0.0.0/0 で開放されているか確認

**原因2: ユーザーデータの実行失敗**
- セッションマネージャーで接続
- `sudo cat /var/log/cloud-init-output.log` でエラーを確認

**原因3: Dockerコンテナの起動失敗**
- セッションマネージャーで接続
- `cd /home/ubuntu/strong-system-dot-com`
- `docker compose ps` でコンテナの状態を確認
- `docker compose logs` でエラーログを確認

---

## クリーンアップ

研修終了後、以下の順序でリソースを削除してください：

1. **EC2インスタンスの削除**
   - 自分のインスタンスを選択
   - **インスタンスの状態** → **インスタンスを終了**

2. **セキュリティグループの削除**
   - 自分の `day1-app-sg-{あなたの名前}` を選択
   - **アクション** → **セキュリティグループを削除**

3. **IAMロールの削除**
   - IAMコンソールで自分の `day1-ec2-role-{あなたの名前}` を選択
   - **削除**

4. **VPCの削除**
   - VPCコンソールで自分の `day1-vpc-{あなたの名前}` を選択
   - **アクション** → **VPCを削除**
   - 関連リソース（サブネット、ルートテーブル、インターネットゲートウェイ）も自動削除されます

---

## まとめ

- VPCでプライベートネットワークを構築
- セキュリティグループでファイアウォールルールを定義
- EC2でオンプレミス環境をクラウドに移行
- ユーザーデータで自動セットアップを実現

次回（Day 2）は、MinIOからS3への移行を行います。
