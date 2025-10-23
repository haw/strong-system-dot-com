# Day 2: ストレージのクラウド化（フルスペック版）

## 目標

- Day 1環境をCDKで自動構築（app-serverはEC2で直接実行）
- MinIOからS3への移行を体験
- IAMロールによるセキュアなS3アクセスを理解

## 所要時間

約30分

---

## Day 2の構成

![](images/architecture.png)

Day 2では、アプリケーションをEC2で直接実行します：

```
EC2直接実行:
└── app-server (Node.js) ← IAMロールでS3アクセス

Docker Compose:
├── db-server (MySQL)
└── ldap-server (LDAP認証)
```

**メリット**: IAMロールが自動的に使えるため、認証情報の管理が不要

> **Note**: CDKが自動的にapp-serverをEC2で直接実行するように構成します。

---

## 重要: リソース名の命名規則

**すべてのリソース名に `-{あなたの名前}` を付けてください。**

例: `cdk-exec-ec2-tanaka`, `Day2Stack-suzuki`

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
            - Swap領域の作成（2GB、メモリ不足対策）
            - Node.js 22.x のインストール
            - Node.jsヒープメモリ上限の設定（1536MB）
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
    sudo su - ec2-user
    sudo cat /var/log/userdata.log
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
    npx cdk bootstrap -c userName={あなたの名前} --verbose
    ```

    > `userName`の値は重複しないように指定してください。例: `npx cdk bootstrap -c userName=tanaka --verbose`
    > **注意**: 既にbootstrap済みの場合は「bootstrapped (no changes).」と表示されますが、問題ありません。


---

### 3. 以降の手順

ここから先の手順は、クイックスタート版と共通です。

**👉 [quick.md の「6. Day 2スタート環境をCDKでデプロイ」](quick.md#6-day-2スタート環境をcdkでデプロイ)** に進んでください。

以下の手順が含まれます：
- Day 2スタート環境をCDKでデプロイ
- アプリケーションの動作確認（MinIOモード）
- S3バケット作成
- アプリケーションをS3モードに切り替え
- S3への移行確認

---

## クリーンアップ

研修終了後、以下の順序でリソースを削除してください：

### 1. S3バケットの削除

1. S3コンソールで自分のバケットを選択
2. **空にする** ボタンをクリック（「10. S3への移行確認」ですべてのファイルを削除している場合は、実施不要）
3. 確認後、**削除** ボタンをクリック

![](images/delete-s3-bucket.png)

### 2. CDKスタックの削除

CDK実行用EC2で実行：

```bash
cd ~/strong-system-dot-com/docs/day2/cdk
npx cdk destroy -c userName={あなたの名前} --verbose
```

※ `ec2-user`で実施してください。（`ec2-user`ではない場合は、`sudo su - ec2-user`）

### 3. CDK実行用EC2の削除

1. EC2コンソールで `cdk-exec-ec2-{あなたの名前}` を選択
2. **インスタンスの状態** → **インスタンスを終了**

---

## まとめ

- CDKでインフラを自動構築（Day 1の手動作業を5分に短縮）
- app-serverをEC2で直接実行（IAMロールでS3アクセス）
- MinIOからS3への移行を体験

次回（Day 3）は、データベースをRDSに移行します。
