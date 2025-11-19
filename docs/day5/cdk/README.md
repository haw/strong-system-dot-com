# Day 5 CDK - Kiro CLI環境構築

このCDKプロジェクトは、Kiro CLI（旧Amazon Q Developer CLI）がインストール済みのEC2インスタンスを自動で構築します。

## 構築されるリソース

- EC2インスタンス
  - OS: Ubuntu 24.04 LTS
  - インスタンスタイプ: t3.medium
  - ストレージ: 16GB (gp3)
  - VPC: デフォルトVPC
  - セキュリティグループ: デフォルトSG
- IAMロール
  - AmazonSSMManagedInstanceCore（SSM接続用）
  - PowerUserAccess（AWS操作用）
- インストール済みソフトウェア
  - AWS CLI v2
  - Kiro CLI

## 前提条件

- Node.js 22.x
- AWS CLI設定済み
- CloudShellまたはローカル環境
- デフォルトVPCが存在すること
  - 確認: `aws ec2 describe-vpcs --filters "Name=isDefault,Values=true"`
  - 存在しない場合は再作成: `aws ec2 create-default-vpc`

## セットアップ

```bash
# 依存関係インストール
npm install

# TypeScriptコンパイル
npm run build
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

## 接続方法

デプロイ完了後、Session Managerで接続：

```bash
# インスタンスIDは出力に表示されます
aws ssm start-session --target <instance-id>
```

## Kiro CLI起動

```bash
# EC2インスタンス内で実行
kiro-cli
```

## 注意事項

- `userName` は必須パラメータです
- リソース名に `userName` が含まれるため、受講者ごとに区別できます
- デプロイには約3-5分かかります
- Kiro CLIのセットアップには追加で約2-3分かかります
- キーペアは不要です（SSM経由で接続）
- セキュリティグループはデフォルトVPCのデフォルトSGを使用します

## ハンズオン例

EC2インスタンスに接続後、以下のようなプロンプトでKiro CLIを試せます：

```
「ようこそ Awesome YAMAUCHI のページへ」というタイトルで、自己紹介ページを作成してください。
私の名前は山内修、会社はストロングシステム、住んでいる場所は福岡県飯塚市です。
ページの背景は北アルプスの山並み、住んでいる場所の横には https://www.haw.co.jp/wp-content/uploads/2019/06/haw_logo_2019_06.png の写真を掲載してください。
これをバージニア北部リージョンのAmazon S3バケットにindex.htmlとして配置し、
ウェブサイトホスティング機能を有効にして、一般公開してください。
HTML以外にCSSやJSファイルを作成していただいてもかまいません。
バケット名はawesomeに続けて今日の日付を8桁 + ランダムな文字列10桁で設定してください。
サイト訪問者を楽しませるためテトリスを実装してください。
```

## トラブルシューティング

### デプロイエラー

```bash
# Bootstrap未実施の場合
npx cdk bootstrap -c userName=tanaka
```

### インスタンスが起動しない

CloudFormationコンソールでスタックのイベントを確認してください。

### Kiro CLIが起動しない

```bash
# ログ確認
sudo tail -f /var/log/cloud-init-output.log
```
