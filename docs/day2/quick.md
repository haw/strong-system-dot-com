# Day 2: ストレージのクラウド化（クイックスタート版）

## 目標

- Day 1完成形をCDKで自動構築
- MinIOからS3への移行を体験

## 所要時間

約15分

---

## 前提条件

- IAMユーザーに以下の権限が付与されていること：
  - `PowerUserAccess`
  - `IAMFullAccess`

---

## 手順

### 1. CloudShellを起動

1. AWSマネジメントコンソールにログイン
2. 画面右上のCloudShellアイコンをクリック
3. CloudShellが起動するまで待つ（初回は1-2分）

---

### 2. Node.js 22のセットアップ

```bash
# nvmのインストール
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc

# Node.js 22のインストール
nvm install 22
nvm use 22
node -v  # v22.x.x と表示されることを確認
```

---

### 3. AWS CDK CLIのインストール

```bash
npm install -g aws-cdk
cdk --version  # バージョンが表示されることを確認
```

---

### 4. リポジトリのクローンとセットアップ

```bash
cd ~
git clone https://github.com/haw/strong-system-dot-com.git
cd strong-system-dot-com/docs/day2/cdk
npm install
```

---

### 5. CDK環境のBootstrap

**Bootstrapとは？**

CDKがAWS環境にデプロイするために必要なリソース（S3バケット、ECRリポジトリ、IAMロール）を事前準備するプロセスです。AWSアカウント×リージョンの組み合わせごとに1回だけ実行します。

```bash
npx cdk bootstrap
```

> **注意**: 既にbootstrap済みの場合は「already bootstrapped」と表示されますが、問題ありません。

---

### 6. Day 1完成形をCDKでデプロイ

```bash
npx cdk deploy -c userName={あなたの名前}
```

デプロイ完了まで約5-10分待つ。

---

### 7. Day 1アプリケーションの動作確認

Outputsの `ApplicationUrl` をブラウザで開く。

- ユーザー名: `admin`
- パスワード: `admin`

---

### 8. S3バケット作成

1. S3コンソールで **バケットを作成**
2. **バケット名**: `{あなたの名前}-day2-files`
3. **リージョン**: ap-northeast-1
4. **作成** ボタンをクリック

---

### 9. アプリケーションのS3設定変更

1. CDKで作成されたEC2 (`day1-app-server-{あなたの名前}`) に Session Manager で接続
2. 設定変更：

    ```bash
    cd /home/ubuntu/strong-system-dot-com
    sudo vi docker-compose.yml
    ```

    `app-server-1` と `app-server-2` の環境変数を変更：
    
    ```yaml
    - USE_AWS_S3=true
    - S3_BUCKET_NAME={あなたの名前}-day2-files
    ```

3. 再起動：

    ```bash
    docker compose down
    docker compose up -d
    ```

---

### 10. S3への移行確認

1. アプリケーションでファイルアップロード
2. S3コンソールでファイルを確認

---

## クリーンアップ

### 1. S3バケットを空にする

```bash
aws s3 rm s3://{あなたの名前}-day2-files --recursive
```

### 2. CDKスタック削除

```bash
cd ~/strong-system-dot-com/docs/day2/cdk
npx cdk destroy -c userName={あなたの名前}
```

### 3. S3バケット削除

```bash
aws s3 rb s3://{あなたの名前}-day2-files
```

---

## まとめ

- CloudShellでCDK実行環境を即座に構築
- CDKでインフラ自動構築
- MinIO → S3 移行完了

次回（Day 3）は、データベースをRDSに移行します。

---

## 参考

全手順を学びたい方は [フルスペック版](./full.md) をご覧ください。
