# Day 3 CDK - Day 2完成形インフラ構築

このCDKプロジェクトは、Day 2で完成したインフラ（MinIO→S3移行済み）を自動で構築します。

## Day 3のスタート地点

Day 2完了後の状態：
- ✅ MinIO → S3に移行済み
- ✅ app-serverはEC2で直接実行（IAMロールでS3アクセス）
- ⚠️ db-serverコンテナは稼働中（これからRDSに移行）

## 構築されるリソース

- VPC (10.0.0.0/16)
  - パブリックサブネット × 2 (AZ: 1a, 1c)
  - プライベートサブネット × 2
  - インターネットゲートウェイ
  - S3用Gateway型VPCエンドポイント（無料）
- セキュリティグループ (3000 開放)
- IAMロール (SSM + S3アクセス用)
- EC2インスタンス (Ubuntu 24.04, t3.micro, 12GB)
  - Docker + アプリケーション自動起動
  - db-server, ldap-serverコンテナ起動
  - app-serverはEC2で直接実行（S3使用）

## 前提条件

- Node.js 22.x
- AWS CLI設定済み
- 適切なIAM権限

## セットアップ

```bash
# 依存関係インストール
npm install

# TypeScriptコンパイル
npm run build

# CDK Bootstrap（初回のみ、ユーザー名指定）
npx cdk bootstrap -c userName=tanaka --verbose
```

## デプロイ

```bash
# ユーザー名を指定してデプロイ
npx cdk deploy -c userName=tanaka --verbose

# 確認なしでデプロイ
npx cdk deploy -c userName=tanaka --require-approval never --verbose
```

## 削除

```bash
# スタック削除
npx cdk destroy -c userName=tanaka --verbose
```

## 注意事項

- `userName` は必須パラメータです
- リソース名に `userName` が含まれるため、重複を避けられます
- デプロイには約5-10分かかります
- EC2のセットアップ（Docker + アプリ起動）には追加で約5分かかります

## 動作確認

デプロイ完了後、Outputsに表示されるURLにアクセス：

- Employee Management System: `http://<PublicIP>:3000`

ログ確認：

```bash
# セッションマネージャーで接続
aws ssm start-session --target <instance-id>

# ログ確認
sudo tail -f /var/log/userdata.log
```

## Day 3で実施すること

このCDKでDay 2完成形を構築した後、以下を実施します：

1. RDSインスタンスの作成
2. db-serverコンテナからRDSへのデータ移行
3. app-serverの接続先をRDSに変更
4. db-serverコンテナの停止
