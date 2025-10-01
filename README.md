# ストロングシステム社内管理システム（開発環境）

このリポジトリは、架空の会社「ストロングシステム株式会社」の社内管理システムを再現した開発環境です。**このシステムは架空の会社の架空のシステム例であり、実在の企業や製品とは関係ありません。**

## システム概要

このシステムは以下の2つの主要コンポーネントで構成されています：

1. **従業員情報管理システム**
   - 社員の基本情報管理（氏名、社員番号、部署、役職、連絡先情報）
   - シンプルな検索・一覧表示機能
   - 基本的なCRUD操作

2. **社内ファイル共有システム**（準備中）
   - プロジェクト文書管理
   - 技術資料ライブラリ
   - 社内規定文書管理
   - 営業資料管理

## 技術スタック

- **アプリケーションサーバー**: Node.js v22.17.1 + Express
- **データベースサーバー**: MySQL 8.4
- **オブジェクトストレージ**: MinIO（S3互換）
- **認証サーバー**: OpenLDAP
- **コンテナ管理**: Docker Compose

## 環境構築手順

### 前提条件

- Docker と Docker Compose がインストールされていること
- 最小システム要件: 2コア以上、4GB以上のメモリ、10GB以上の空き容量

### 手順

1. リポジトリをクローンします（または、このディレクトリを含むリポジトリをクローンします）

2. コンテナをビルドします
   ```bash
   docker compose build
   ```

3. コンテナを起動します
   ```bash
   docker compose up -d
   ```

4. 以下のURLでアプリケーションにアクセスできます
   - 従業員情報管理システム: http://localhost:3000
   - MinIO管理コンソール: http://localhost:9001

## ログイン情報

### 従業員情報管理システム（LDAP認証）

以下のテストユーザーでログインできます：

| ユーザー名 | パスワード |
|------------|------------|
| admin      | admin      |
| user1      | password   |
| testuser   | password123|
| demo       | demo       |

### MinIO管理コンソール

| ユーザー名  | パスワード  |
|-------------|-------------|
| minioadmin  | minioadmin  |

## コンテナ構成

- **app-server-1**: アプリケーションサーバー1（Node.js + Express）- ポート3000
- **app-server-2**: アプリケーションサーバー2（Node.js + Express）- ポート3001
- **db-server**: データベースサーバー（MySQL 8.4）- ポート3306
- **minio**: オブジェクトストレージ（S3互換）- ポート9000（API）、9001（Web Console）
- **ldap-server**: 認証サーバー（OpenLDAP）- ポート1389

## トラブルシューティング

### コンテナが起動しない場合

1. ログを確認します
   ```bash
   docker compose logs
   ```

2. 特定のコンテナのログを確認します
   ```bash
   docker compose logs app-server-1
   ```

3. ポートの競合がないか確認します
   ```bash
   netstat -tuln | grep 3000
   ```

### データベース接続エラーの場合

1. データベースコンテナが起動しているか確認します
   ```bash
   docker compose ps db-server
   ```

2. データベースに直接接続してみます
   ```bash
   docker compose exec db-server mysql -uroot -ppassword -e "SELECT 1"
   ```

## コンテナの停止方法

```bash
docker compose down
```

データボリュームも含めて完全に削除する場合：
```bash
docker compose down -v
```

## ライセンス

このプロジェクトは教育・研修目的で提供されています。