# Day 2 ハンズオン用アプリ（社員名簿）

社員の一覧・追加・編集・削除ができるアプリです。画面上部の「接続先」に、いまどのデータベースにつながっているかを大きく表示します。

- `DB_SOURCE=local`：同じEC2上のMySQLコンテナにつながる（オレンジ）。
- `DB_SOURCE=ssm`：Parameter Store から接続情報を読み、Amazon RDS にTLSでつながる（水色）。

## 構成

| ファイル | 内容 |
| --- | --- |
| `docker-compose.yml` | `app`（このアプリ）と `db`（MySQL 8.4.5）を起動する |
| `init.sql` | ローカルMySQLの初期データ（社員10名） |
| `server.js` | API（`/api/health`, `/api/employees`） |
| `public/` | 画面 |
| `.env.sample` | 設定の例。EC2ではCDKのユーザーデータが `.env` を作る |

## 設定（`.env`）

| 変数 | 意味 |
| --- | --- |
| `DB_SOURCE` | `local` または `ssm` |
| `PARAM_PREFIX` | Parameter Store のパス。例：`/day2-2026/tanaka/db` |
| `AWS_REGION` | Parameter Store を読むリージョン |

`DB_SOURCE=ssm` のときは、起動時に次の4つを読みます。読めなかった場合は、画面の「接続先」の下にエラーを表示します。

| パラメータ | 種類 |
| --- | --- |
| `{PARAM_PREFIX}/host` | String（RDSのエンドポイント） |
| `{PARAM_PREFIX}/user` | String |
| `{PARAM_PREFIX}/name` | String（データベース名 `employee_db`） |
| `{PARAM_PREFIX}/password` | SecureString |

パスワードは、ログにも画面にも出しません。設定を変えたら、`docker compose up -d` でアプリを作り直してください。起動時にしか読まないためです。

## 手元で動かす

```bash
cp .env.sample .env
docker compose up -d --build
```

ブラウザで `http://localhost:3000` を開きます。止めるときは `docker compose down`、データも消すときは `docker compose down -v`。
