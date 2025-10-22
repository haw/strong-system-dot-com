# Day 2 CDK - Day 1完成形インフラ構築

このCDKプロジェクトは、Day 1で手動構築したインフラを自動で構築します。

## 構築されるリソース

- VPC (10.0.0.0/16)
  - パブリックサブネット × 2 (AZ: 1a, 1c)
  - プライベートサブネット × 2
  - インターネットゲートウェイ
- セキュリティグループ (3000, 3001, 9000, 9001 開放)
- IAMロール (SSM用)
- EC2インスタンス (Ubuntu 24.04, t3.micro, 12GB)
  - Docker + アプリケーション自動起動

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

# CDK Bootstrap（初回のみ）
npx cdk bootstrap
```

## デプロイ

```bash
# ユーザー名を指定してデプロイ
npx cdk deploy -c userName=tanaka

# 確認なしでデプロイ
npx cdk deploy -c userName=tanaka --require-approval never
```

## 削除

```bash
# スタック削除
npx cdk destroy -c userName=tanaka
```

## 注意事項

- `userName` は必須パラメータです
- リソース名に `userName` が含まれるため、重複を避けられます
- デプロイには約5-10分かかります
- EC2のセットアップ（Docker + アプリ起動）には追加で約5分かかります

## 動作確認

デプロイ完了後、Outputsに表示されるURLにアクセス：

- Employee Management System: `http://<PublicIP>:3000`
- MinIO Console: `http://<PublicIP>:9001`

ログ確認：

```bash
# セッションマネージャーで接続
aws ssm start-session --target <instance-id>

# ログ確認
sudo tail -f /var/log/cloud-init-output.log
```
