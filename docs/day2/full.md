# Day 2: ストレージのクラウド化（フルスペック版）

## 目標

- Day 1完成形をCDKで自動構築
- MinIOからS3への移行を体験
- オブジェクトストレージのメリットを理解

## 所要時間

約30分

## 重要: リソース名の命名規則

**すべてのリソース名に `-{あなたの名前}` を付けてください。**

例: `cdk-exec-ec2-tanaka`, `Day1Stack-suzuki`

共有AWSアカウントを使用するため、名前の重複を避ける必要があります。

---

## 手順

- リージョンは任意のリージョンでかまいませんが、無難に「東京リージョン」を選んでください

### 1. CDK実行用EC2作成

Day 1のインフラをCDKで自動構築するため、CDKを実行するEC2を作成します。

1. AWSマネジメントコンソールで **EC2** サービスを開く
2. **インスタンスを起動** ボタンをクリック

    #### **基本設定**
    
    - **名前**: `cdk-exec-ec2-{あなたの名前}` (例: `cdk-exec-ec2-tanaka`)
    - **アプリケーションおよび OS イメージ (Amazon マシンイメージ)**: 
      - **クイックスタート**: Amazon Linux
      - **Amazon マシンイメージ (AMI)**: Amazon Linux 2023 AMI
      - **アーキテクチャ**: 64 ビット (x86)
    
    #### **インスタンスタイプ**
    
    - **インスタンスタイプ**: t3.micro
    
    #### **キーペア**
    
    - **キーペア名**: キーペアなしで続行
    
    #### **ネットワーク設定**
    
    - **VPC**: デフォルトVPC
    - **サブネット**: 任意のパブリックサブネット
    - **パブリック IP の自動割り当て**: 有効化
    - **ファイアウォール (セキュリティグループ)**: 新しいセキュリティグループを作成
      - **セキュリティグループ名**: `cdk-exec-sg-{あなたの名前}`
      - **説明**: `Security group for CDK execution EC2`
      - **インバウンドルール**: なし（Session Manager経由で接続）
    
    #### **ストレージを設定**
    
    - **ルートボリューム**: 
      - **サイズ**: 8 GiB
      - **ボリュームタイプ**: gp3
    
    #### **高度な詳細**
    
    - **IAM インスタンスプロファイル**: `cdk-execution-role` (講師が事前作成)
    - **ユーザーデータ**: 「<a href="https://github.com/haw/strong-system-dot-com/blob/main/docs/day2/assets/cdk-ec2-userdata.txt" target="_blank" rel="noopener noreferrer">assets/cdk-ec2-userdata.txt</a>」 の内容をコピー&ペースト
        - このユーザーデータで行っていること
            - Node.js 22.x のインストール
            - AWS CDK CLI のインストール
            - Git のインストール確認

3. **インスタンスを起動** ボタンをクリック

---

### 2. CDK実行環境のセットアップ

1. EC2コンソールで **インスタンス** を選択
2. 自分のインスタンス (`cdk-exec-ec2-{あなたの名前}`) を選択
3. **接続** ボタンをクリック
4. **セッションマネージャー** タブを選択
5. **接続** ボタンをクリック

6. ユーザーデータの実行完了を確認：

    ```bash
    sudo tail -f /var/log/cloud-init-output.log
    ```

    「CDK Execution EC2 Setup Completed」が表示されるまで待つ（約3分）

7. リポジトリをクローン：

    ```bash
    cd ~
    git clone https://github.com/haw/strong-system-dot-com.git
    cd strong-system-dot-com/docs/day2/cdk
    ```

8. 依存関係をインストール：

    ```bash
    npm install
    ```

9. CDK環境のBootstrap：

    **Bootstrapとは？**
    
    CDKがAWS環境にデプロイするために必要なリソース（S3バケット、ECRリポジトリ、IAMロール）を事前準備するプロセスです。AWSアカウント×リージョンの組み合わせごとに1回だけ実行します。

    ```bash
    npx cdk bootstrap -c userName={あなたの名前}
    ```

    > `userName`の値は重複しないように指定してください。例: `npx cdk bootstrap -c userName=tanaka`
    > **注意**: 既にbootstrap済みの場合は「bootstrapped (no changes).」と表示されますが、問題ありません。


---

### 3. Day 1完成形をCDKでデプロイ

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

### 4. Day 1アプリケーションの動作確認

1. Outputsの `ApplicationUrl` をブラウザで開く

    例: `http://54.123.45.67:3000`

2. ログイン画面が表示されることを確認

    - ユーザー名: `admin`
    - パスワード: `admin`

3. アプリケーションが正常に動作することを確認

4. MinIOコンソールにもアクセス確認

    Outputsの `MinIOConsoleUrl` をブラウザで開く

    - ユーザー名: `minioadmin`
    - パスワード: `minioadmin`

---

### 5. S3バケット作成

MinIOの代わりにS3を使用するため、S3バケットを作成します。

1. AWSマネジメントコンソールで **S3** サービスを開く
2. **バケットを作成** ボタンをクリック
3. 以下の設定を入力：
    - **バケット名**: `{あなたの名前}-day2-files` (例: `tanaka-day2-files`)
      - グローバルで一意である必要があります
      - 小文字、数字、ハイフンのみ使用可能
    - **AWS リージョン**: ap-northeast-1 (東京)
    - **パブリックアクセスをすべてブロック**: チェックを入れたまま
    - その他の設定はデフォルトのまま
4. **バケットを作成** ボタンをクリック

---

### 6. アプリケーションのS3設定変更

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

### 7. S3への移行確認

1. ブラウザでアプリケーションにアクセス
2. ファイルアップロード機能を試す
3. S3コンソールでバケットを確認
4. アップロードしたファイルがS3に保存されていることを確認

---

## クリーンアップ

研修終了後、以下の順序でリソースを削除してください：

### 1. S3バケットの削除

1. S3コンソールで自分のバケットを選択
2. **空にする** ボタンをクリック
3. 確認後、**削除** ボタンをクリック

### 2. CDKスタックの削除

CDK実行用EC2で実行：

```bash
cd ~/strong-system-dot-com/docs/day2/cdk
npx cdk destroy -c userName={あなたの名前}
```

### 3. CDK実行用EC2の削除

1. EC2コンソールで `cdk-exec-ec2-{あなたの名前}` を選択
2. **インスタンスの状態** → **インスタンスを終了**

---

## まとめ

- CDKでインフラを自動構築（Day 1の手動作業を5分に短縮）
- MinIOからS3への移行を体験
- オブジェクトストレージの利点を理解

次回（Day 3）は、データベースをRDSに移行します。
