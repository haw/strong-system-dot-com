# Day4 CloudFormation ハンズオン

## 概要

サーバーレスアーキテクチャ（Cognito + API Gateway + Lambda + DynamoDB + S3 + CloudFront）をCloudFormationでデプロイします。

## 事前準備

1. AWS Academy Sandboxにログイン
2. リージョンが **us-east-1（バージニア北部）** であることを確認

## 手順

### Step 1: S3バケット作成（Lambda用）

1. S3コンソールを開く
2. 「バケットを作成」をクリック
3. バケット名: `day4-lambda-YYYYMMDD-yourname`（例: `day4-lambda-20260109-taro`）
   - ※バケット名は世界で一意。日付+名前で衝突回避
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
- LambdaCodeBucket: Step 1で作成したバケット名（例: `day4-lambda-20260109-taro`）
- 「次へ」
- 「AWS CloudFormation によって IAM リソースが作成される場合があることを承認します。」にチェック
- 「次へ」
- 「送信」

### Step 5: デプロイ完了を待つ

- ステータスが `CREATE_COMPLETE` になるまで待機（5〜10分）
- 「出力」タブで以下を確認:
  - **ApiUrl**: API GatewayのURL
  - **UserPoolId**: Cognito User Pool ID
  - **UserPoolClientId**: Cognito Client ID
  - **CloudFrontUrl**: フロントエンドURL

## 動作確認

### APIテスト（CloudShell）

1. AWSコンソール右上の CloudShell アイコンをクリック
2. 以下のコマンドを実行（URLは「出力」タブの ApiUrl に置き換え）

```bash
# ユーザー登録
curl -X POST https://xxxxxx.execute-api.us-east-1.amazonaws.com/prod/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "Password123", "name": "Test User"}'
```

3. Cognitoコンソールでユーザーを確認
   - Cognito → ユーザープール → `day4-user-pool-test` → ユーザー
   - `testuser` を選択 →「アクション」→「アカウントを確認」

4. サインイン

```bash
# サインイン
curl -X POST https://xxxxxx.execute-api.us-east-1.amazonaws.com/prod/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "Password123"}'
```

### Step 6: app.jsの作成

1. [frontend/app.js.template](https://github.com/haw/strong-system-dot-com/blob/main/docs/day4/cdk/frontend/app.js.template) をダウンロードして `app.js` を作成
2. 以下の2箇所を置換（CloudFormationの「出力」タブの値を使用）:

```javascript
// 変更前
const API_URL = 'API_GATEWAY_URL_PLACEHOLDER';
const USER_POOL_ID = 'USER_POOL_ID_PLACEHOLDER';

// 変更後（例）
const API_URL = 'https://xxxxxx.execute-api.us-east-1.amazonaws.com/prod';
const USER_POOL_ID = 'us-east-1_XXXXXXXXX';
```

※ API_URLの末尾に `/` は付けない

### Step 7: フロントエンドをS3にアップロード

1. CloudFormationの「出力」タブで **WebsiteBucketName** を確認
   - ※出力にない場合は「リソース」タブで `WebsiteBucket` を探す
2. S3コンソールでそのバケットを開く
3. 以下のファイルをアップロード:
   - `frontend/index.html`
   - `frontend/app.js`（Step 6で作成したもの）

### Step 8: CloudFrontでアクセス

1. CloudFormationの「出力」タブで **CloudFrontUrl** を確認
2. ブラウザでアクセス
3. ユーザー登録 → サインイン → 従業員管理を試す

## クリーンアップ

1. CloudFormationコンソールでスタックを削除
2. S3バケット（Lambda用）を空にして削除

## トラブルシューティング

### CREATE_FAILED になった場合

1. 「イベント」タブでエラー内容を確認
2. よくある原因:
   - S3バケット名が間違っている
   - api.zipがアップロードされていない
   - リージョンがus-east-1以外
