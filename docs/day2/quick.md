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

> **重要**: CloudShellを起動する前に、必ず**東京リージョン（ap-northeast-1）**を選択してください。

1. AWSマネジメントコンソールにログイン
2. **画面右上のリージョン選択**で「**アジアパシフィック（東京）ap-northeast-1**」を選択
3. **画面左下のCloudShellアイコン**（ターミナルのようなアイコン）をクリック
4. CloudShellが起動するまで待つ（初回は1-2分）

> **なぜ東京リージョン？**: CloudShellを起動したリージョンで、CDKがインフラを作成します。東京リージョンを選択することで、日本からのアクセスが高速になります。

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
npx cdk bootstrap -c userName={あなたの名前}
```

> `userName`の値は重複しないように指定してください。例: `npx cdk bootstrap -c userName=tanaka`
> **注意**: 既にbootstrap済みの場合は「bootstrapped (no changes).」と表示されますが、問題ありません。

---

### 6. Day 1完成形をCDKでデプロイ

1. CDKデプロイを実行：

    ```bash
    npx cdk deploy -c userName={あなたの名前}
    ```

    例: `npx cdk deploy -c userName=tanaka`

2. デプロイ確認プロンプトで `y` を入力（`"--require-approval" is enabled and stack includes security-sensitive updates: 'Do you wish to deploy these changes' (y/n)`）

3. デプロイ完了まで待つ（約5-10分）

4. デプロイ完了後、Outputsに表示される情報を確認：
    - ApplicationUrl
    - InstanceId
    - InstancePublicIp
    - MinIOConsoleUrl
    - S3EndpointId
    - VpcId


5. さらにEC2インスタンスのステータスチェックが「完了」するまで待つ。  

★絵を挿入

---

### 7. Day 1アプリケーションの動作確認

Outputsの `ApplicationUrl` をブラウザで開く。

- ユーザー名: `admin`
- パスワード: `admin`

---

### 8. S3バケット作成

1. S3コンソールで **バケットを作成**
2. **バケット名**: `{あなたの名前}-day2-files` ※ グローバルで一意である必要があります
3. **リージョン**: ap-northeast-1
4. **バケットを作成** ボタンをクリック

---

### 9. アプリケーションのS3設定変更

> **注意**: MinIO使用時にアップロードしたファイルは、S3切り替え後はダウンロードできません。S3切り替え後に新規アップロードしたファイルで動作確認してください。

Day 1で作成したEC2インスタンスにアクセスし、アプリケーションの設定を変更します。

1. EC2コンソールで、CDKで作成されたインスタンス (`day1-app-server-{あなたの名前}`) を選択
2. **接続** → **セッションマネージャー** で接続
3. アプリケーションディレクトリに移動：

    ```bash
    sudo su - ubuntu
    cd /home/ubuntu/strong-system-dot-com
    ```

4. docker-compose.yml を編集(nano推奨)：

    ```bash
    nano docker-compose.yml

    or

    vi docker-compose.yml
    ```

5. `app-server-1` と `app-server-2` の環境変数を変更：

    変更前:
    ```yaml
    - S3_BUCKET_NAME=strongsystem-files-default
    - USE_AWS_S3=false
    ```

    変更後:
    ```yaml
    - S3_BUCKET_NAME={あなたの名前}-day2-files
    - USE_AWS_S3=true
    ```

    `nano`で編集する場合は、以下の操作で保存・終了してください。  
    1. Ctl + O (保存)
    2. Enter (ファイル名の確認)
    3. Ctl + C (終了)

6. コンテナを再起動：

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

### 1. S3バケットの削除

1. S3コンソールで自分のバケットを選択
2. **空にする** ボタンをクリック
3. 確認後、**削除** ボタンをクリック

### 2. CDKスタック削除

```bash
cd ~/strong-system-dot-com/docs/day2/cdk
npx cdk destroy -c userName={あなたの名前}
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
