# Day4 CloudFormation ハンズオン（AWS Academy版）

## 概要

サーバーレスアーキテクチャ（Lambda Function URL + DynamoDB + S3 + CloudFront）をCloudFormationでデプロイします。

※ AWS Academy Sandboxの制限により、API Gateway/Cognitoは使用しません。Lambda Function URLで代替します。

## 事前準備

1. AWS Academy Sandboxにログイン
2. リージョンが **us-east-1（バージニア北部）** であることを確認
3. LabRoleのARNを確認: IAMコンソール → ロール → `LabRole` → ARNをコピー
   - 形式: `arn:aws:iam::XXXXXXXXXXXX:role/LabRole`

## 手順

### Step 1: S3バケット作成（Lambda用）

1. S3コンソールを開く
2. 「バケットを作成」をクリック
3. バケット名: `day4-lambda-YYYYMMDD-yourname`（例: `day4-lambda-20260109-taro`）
4. リージョン: us-east-1
5. 他はデフォルトのまま「バケットを作成」

### Step 2: api.zipをアップロード

1. 作成したバケットを開く
2. 「アップロード」をクリック
3. `api.zip` をアップロード

### Step 3: CloudFormationスタック作成

1. CloudFormationコンソールを開く
2. 「スタックの作成」→「新しいリソースを使用（標準）」
3. 「テンプレートファイルのアップロード」を選択
4. `template.yaml` をアップロード
5. 「次へ」

### Step 4: パラメータ入力

- スタック名: `day4-stack`
- LabRoleArn: 事前準備でコピーしたLabRoleのARN
- LambdaCodeBucket: Step 1で作成したバケット名
- 「次へ」→「次へ」→「送信」

### Step 5: デプロイ完了を待つ

- ステータスが `CREATE_COMPLETE` になるまで待機（5〜10分）
- 「出力」タブで以下を確認:
  - **FunctionUrl**: API エンドポイント
  - **CloudFrontUrl**: フロントエンドURL
  - **WebsiteBucketName**: フロントエンドアップロード先

## 動作確認（API）

CloudShellで以下を実行（URLは「出力」タブの FunctionUrl に置き換え）:

```bash
# 従業員一覧取得
curl https://xxxxxx.lambda-url.us-east-1.on.aws/employees

# 従業員登録
curl -X POST https://xxxxxx.lambda-url.us-east-1.on.aws/employees \
  -H "Content-Type: application/json" \
  -d '{"name": "山田太郎", "email": "yamada@example.com", "department": "開発部", "position": "エンジニア"}'

# 従業員一覧取得（登録確認）
curl https://xxxxxx.lambda-url.us-east-1.on.aws/employees
```

## フロントエンドのデプロイ

### Step 1: app.jsのAPI URL設定

[frontend/app.js](https://github.com/haw/strong-system-dot-com/blob/main/docs/day4/cf/academy/frontend/app.js) の1行目を編集:

```javascript
// 変更前
const API_URL = 'FUNCTION_URL_PLACEHOLDER';

// 変更後（出力タブのFunctionUrlに置き換え、末尾のスラッシュは削除）
const API_URL = 'https://xxxxxx.lambda-url.us-east-1.on.aws';
```

### Step 2: フロントエンドをS3にアップロード

1. S3コンソールで **WebsiteBucketName** のバケットを開く
2. 「アップロード」をクリック
3. 以下をアップロード:
   - [index.html](https://github.com/haw/strong-system-dot-com/blob/main/docs/day4/cf/academy/frontend/index.html)
   - `app.js`（Step 1で編集したもの）

### Step 3: フロントエンド動作確認

1. 「出力」タブの **CloudFrontUrl** にアクセス
2. 従業員の追加・編集・削除ができることを確認
3. ファイルのアップロード・ダウンロード・削除ができることを確認

## クリーンアップ

1. CloudFormationコンソールでスタックを削除
2. S3バケット（Lambda用）を空にして削除

## トラブルシューティング

### CREATE_FAILED になった場合

1. 「イベント」タブでエラー内容を確認
2. よくある原因:
   - LabRoleArnが間違っている
   - S3バケット名が間違っている
   - api.zipがアップロードされていない
   - リージョンがus-east-1以外

### CloudFrontでアクセスできない場合

- CloudFrontの反映には数分かかることがあります
- キャッシュが原因の場合は、ブラウザのキャッシュをクリアしてください

### CORSエラーが出る場合

- app.jsのAPI_URLが正しいか確認
- 末尾にスラッシュがないか確認（`https://xxx.on.aws` が正しい、`https://xxx.on.aws/` は間違い）
