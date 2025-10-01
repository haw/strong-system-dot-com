# ファイル共有システム API ドキュメント

このドキュメントでは、ファイル共有システムのAPIエンドポイントについて説明します。

## 認証

すべてのAPIリクエストには、認証トークンが必要です。トークンは、`Authorization`ヘッダーに`Bearer {token}`の形式で指定します。

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

トークンは、`/api/auth/login`エンドポイントを使用して取得できます。

## フォルダ操作

### ルートフォルダの取得

```
GET /api/folders/root
```

**レスポンス例:**

```json
[
  {
    "id": "11111111-1111-1111-1111-111111111111",
    "name": "開発部",
    "path": "/開発部",
    "parent_id": "00000000-0000-0000-0000-000000000000",
    "owner_id": 1,
    "created_at": "2025-07-19T10:00:00.000Z",
    "updated_at": "2025-07-19T10:00:00.000Z"
  },
  {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "営業部",
    "path": "/営業部",
    "parent_id": "00000000-0000-0000-0000-000000000000",
    "owner_id": 2,
    "created_at": "2025-07-19T10:00:00.000Z",
    "updated_at": "2025-07-19T10:00:00.000Z"
  }
]
```

### 特定のフォルダ内のフォルダを取得

```
GET /api/folders/{folderId}/folders
```

**パラメータ:**

- `folderId`: フォルダID

**レスポンス例:**

```json
[
  {
    "id": "33333333-3333-3333-3333-333333333333",
    "name": "プロジェクトA",
    "path": "/開発部/プロジェクトA",
    "parent_id": "11111111-1111-1111-1111-111111111111",
    "owner_id": 1,
    "created_at": "2025-07-19T10:00:00.000Z",
    "updated_at": "2025-07-19T10:00:00.000Z"
  }
]
```

### 特定のフォルダ内のファイルを取得

```
GET /api/folders/{folderId}/files
```

**パラメータ:**

- `folderId`: フォルダID

**レスポンス例:**

```json
[
  {
    "id": "44444444-4444-4444-4444-444444444444",
    "name": "仕様書.pdf",
    "path": "/開発部/プロジェクトA/仕様書.pdf",
    "size": 1024000,
    "mime_type": "application/pdf",
    "owner_id": 1,
    "folder_id": "33333333-3333-3333-3333-333333333333",
    "created_at": "2025-07-19T10:00:00.000Z",
    "updated_at": "2025-07-19T10:00:00.000Z"
  }
]
```

### 新しいフォルダを作成

```
POST /api/folders
```

**リクエストボディ:**

```json
{
  "name": "新しいフォルダ",
  "parentFolderId": "11111111-1111-1111-1111-111111111111"
}
```

**レスポンス例:**

```json
{
  "id": "55555555-5555-5555-5555-555555555555",
  "name": "新しいフォルダ",
  "path": "/開発部/新しいフォルダ",
  "parent_id": "11111111-1111-1111-1111-111111111111",
  "owner_id": 1
}
```

### フォルダを削除

```
DELETE /api/folders/{folderId}
```

**パラメータ:**

- `folderId`: 削除するフォルダのID

**レスポンス例:**

```json
{
  "message": "Folder deleted successfully"
}
```

### フォルダを移動

```
PUT /api/folders/{folderId}/move
```

**パラメータ:**

- `folderId`: 移動するフォルダのID

**リクエストボディ:**

```json
{
  "targetParentFolderId": "22222222-2222-2222-2222-222222222222"
}
```

**レスポンス例:**

```json
{
  "id": "55555555-5555-5555-5555-555555555555",
  "name": "新しいフォルダ",
  "path": "/営業部/新しいフォルダ",
  "parent_id": "22222222-2222-2222-2222-222222222222",
  "owner_id": 1,
  "created_at": "2025-07-19T10:00:00.000Z",
  "updated_at": "2025-07-19T10:30:00.000Z"
}
```

## ファイル操作

### ファイルをアップロード

```
POST /api/files/upload
```

**リクエストボディ:**

マルチパートフォームデータ形式で以下のフィールドを送信します。

- `file`: アップロードするファイル
- `folderId`: アップロード先のフォルダID

**レスポンス例:**

```json
{
  "id": "66666666-6666-6666-6666-666666666666",
  "name": "報告書.docx",
  "path": "/営業部/報告書.docx",
  "size": 512000,
  "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "owner_id": 1,
  "folder_id": "22222222-2222-2222-2222-222222222222",
  "s3Location": "https://strongsystem-files-username.s3.amazonaws.com/営業部/報告書.docx"
}
```

### ファイルをダウンロード

```
GET /api/files/{fileId}/download
```

**パラメータ:**

- `fileId`: ダウンロードするファイルのID

**レスポンス:**

ファイルのバイナリデータがダウンロードされます。

### ファイルを削除

```
DELETE /api/files/{fileId}
```

**パラメータ:**

- `fileId`: 削除するファイルのID

**レスポンス例:**

```json
{
  "message": "File deleted successfully"
}
```

### ファイルを検索

```
GET /api/files/search?q={searchTerm}
```

**クエリパラメータ:**

- `q`: 検索キーワード

**レスポンス例:**

```json
[
  {
    "id": "44444444-4444-4444-4444-444444444444",
    "name": "仕様書.pdf",
    "path": "/開発部/プロジェクトA/仕様書.pdf",
    "size": 1024000,
    "mime_type": "application/pdf",
    "owner_id": 1,
    "folder_id": "33333333-3333-3333-3333-333333333333",
    "created_at": "2025-07-19T10:00:00.000Z",
    "updated_at": "2025-07-19T10:00:00.000Z"
  }
]
```

### ファイルを移動

```
PUT /api/files/{fileId}/move
```

**パラメータ:**

- `fileId`: 移動するファイルのID

**リクエストボディ:**

```json
{
  "targetFolderId": "33333333-3333-3333-3333-333333333333"
}
```

**レスポンス例:**

```json
{
  "id": "66666666-6666-6666-6666-666666666666",
  "name": "報告書.docx",
  "path": "/開発部/プロジェクトA/報告書.docx",
  "size": 512000,
  "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "owner_id": 1,
  "folder_id": "33333333-3333-3333-3333-333333333333",
  "created_at": "2025-07-19T10:00:00.000Z",
  "updated_at": "2025-07-19T10:30:00.000Z"
}
```

## エラーレスポンス

エラーが発生した場合、APIは適切なHTTPステータスコードとともに、以下の形式のJSONレスポンスを返します。

```json
{
  "error": "エラーメッセージ"
}
```

### 一般的なエラーコード

- `400 Bad Request`: リクエストパラメータが不正
- `401 Unauthorized`: 認証エラー
- `403 Forbidden`: 権限エラー
- `404 Not Found`: リソースが見つからない
- `500 Internal Server Error`: サーバー内部エラー