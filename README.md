# ストロングシステム社内管理システム（開発環境）

このリポジトリは、架空の会社「ストロングシステム株式会社」の社内管理システムを再現した開発環境です。**このシステムは架空の会社の架空のシステム例であり、実在の企業や製品とは関係ありません。**

## システム概要

このシステムは以下の2つの主要コンポーネントで構成されています：

1. **従業員情報管理システム**
   - 社員の基本情報管理（氏名、社員番号、部署、役職、連絡先情報）
   - シンプルな検索・一覧表示機能
   - 基本的なCRUD操作

2. **社内ファイル共有システム**（架空）
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

4. 各サービスの起動確認
    ```bash
    docker compose ps
    ```

期待結果は、下記のコンテナが立ち上がっていること。  

- app-server-1
- app-server-2
- db-server
- ldap-server
- minio

5. 以下のURLでアプリケーションにアクセスできます
   - 従業員情報管理システム: http://localhost:3000
   - 従業員情報管理システム（レプリカ）: http://localhost:3001
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

### アプリケーションサーバー (app-server-1, app-server-2)

- ベースイメージ: Node.js v22.17.1
- 公開ポート: 3000
- 主な機能: 従業員情報管理システムのAPIとフロントエンド

### データベースサーバー (db-server)

- ベースイメージ: MySQL 8.4
- 公開ポート: 3306
- 主な機能: 従業員データとファイルメタデータの保存

### オブジェクトストレージ (minio)

- ベースイメージ: MinIO RELEASE.2023-07-21T21-12-44Z
- 公開ポート: 9000 (S3 API), 9001 (Web Console)
- 主な機能: S3互換オブジェクトストレージ（AWS S3の代替）

### 認証サーバー (ldap-server)

- ベースイメージ: OpenLDAP 1.5.0
- 公開ポート: 389 (LDAP), 636 (LDAPS)
- 主な機能: ユーザー認証

## ネットワーク構成

- ネットワーク名: employee-network
- サブネット: 自動割り当て
- IPアドレス: Docker Composeによる自動割り当て

## データの永続化

以下のDockerボリュームを使用してデータを永続化しています:

- mysql-data: MySQLデータベースのデータ
- minio-data: MinIOオブジェクトストレージのデータ
- ldap-data: LDAPサーバーのデータ
- ldap-config: LDAPサーバーの設定

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

4. リソース不足の可能性がある場合
   - Docker Desktopの設定でリソース割り当てを増やす

### データベース接続エラーの場合

1. データベースコンテナが起動しているか確認します
    ```bash
    docker compose ps db-server
    ```

2. ポートの競合がないか確認する
    ```bash
   netstat -tuln | grep <port-number>
   ```

3. データベースに直接接続してみます
    ```bash
    docker compose exec db-server mysql -uroot -ppassword -e "SELECT 1"
    ```


### オブジェクトストレージ接続エラー

1. MinIOサーバーが起動しているか確認
    ```bash
    docker compose ps minio
    ```

2. MinIOのステータスを確認
    ```bash
    curl -I http://localhost:9000/minio/health/live
    ```

3. MinIOのWebコンソールにアクセス
    - ブラウザで http://localhost:9001 にアクセス
    - ユーザー名: minioadmin
    - パスワード: minioadmin

### 認証サーバー接続エラー

1. LDAPサーバーが起動しているか確認
```bash
docker compose exec ldap-server ldapsearch -x -H ldap://localhost -b dc=strongsystem,dc=local -D "cn=admin,dc=strongsystem,dc=local" -w admin
```

## コンテナの停止方法

```bash
docker compose down
```

データボリュームも含めて完全に削除する場合：
```bash
docker compose down -v
```

## よくある質問

### Q: コンテナのデータはどこに保存されますか？
A: Dockerボリュームに保存されます。ボリュームの場所は `docker volume inspect <volume-name>` で確認できます。

### Q: 環境変数を変更するにはどうすればよいですか？
A: docker-compose.ymlファイルの各サービスの `environment` セクションを編集してください。

### Q: コンテナ内のファイルを編集するにはどうすればよいですか？
A: `docker compose exec <service-name> /bin/bash` でコンテナ内にシェルを起動し、ファイルを編集できます。
```bash
docker compose exec <service-name> /bin/bash
```

### Q: データベースのバックアップを取るにはどうすればよいですか？
A: 以下のコマンドでバックアップを取得できます。
```bash
docker compose exec db-server mysqldump -uroot -ppassword employee_db > backup.sql
```

## ライセンス

このプロジェクトは教育・研修目的で提供されています。