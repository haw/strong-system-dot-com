# Day 3（2026）CDK：ハンズオンのスタート地点

Day 2 を終えた状態（社員名簿のアプリが RDS につながって、正常に動いている）を、受講者1人につき1スタック作ります。Day 2 の環境とは独立していて、Day 2 を実施していなくても作れます。

## 作られるもの（`{名前}` は `-c userName=` の値）

| リソース | 名前 | 内容 |
| --- | --- | --- |
| スタック | `day3-2026-{名前}` | |
| VPC | `day3-2026-vpc-{名前}` | 10.0.0.0/16。2つのAZに、パブリック /24 とプライベート /24 を1つずつ。NATなし |
| アプリのセキュリティグループ | `day3-2026-app-sg-{名前}` | 3000/tcp を `allowedCidr`（既定 0.0.0.0/0）から許可 |
| RDSのセキュリティグループ | `day3-2026-rds-sg-{名前}` | 3306/tcp をアプリのセキュリティグループからだけ許可 |
| DBサブネットグループ | `day3-2026-db-subnet-group-{名前}` | プライベートサブネット2つ |
| RDS | `day3-2026-db-{名前}` | MySQL 8.4.10、`db.t3.micro`、Single-AZ、gp3 20GiB、パブリックアクセスなし、自動バックアップなし。マスターユーザー `admin` |
| パラメータ | `/day3-2026/{名前}/db/host`、`/user`、`/name` | String。`host` はRDSのエンドポイント |
| IAMロール | `day3-2026-ec2-role-{名前}` | `AmazonSSMManagedInstanceCore` と、`/day3-2026/{名前}/db/*` だけを読める許可。ほかのパラメータは明示的に拒否。アプリのロググループへの書き込み |
| ロググループ | `/day3-2026/{名前}/app` | CloudWatch Logs。アプリのログ（ストリーム名 `app`）。保持1週間、スタックと一緒に削除 |
| EC2 | `day3-2026-app-{名前}` | Ubuntu 24.04、t3.micro、パブリックサブネット。Session Manager で接続。IMDSv2 必須（ホップ数2） |

EC2 は起動時に Docker を入れ、Day 2 のアプリ（`docs/2026/app`）を `DB_SOURCE=ssm` で起動します。ログは、Docker の `awslogs` ログドライバーで CloudWatch Logs にも送ります（`docker-compose.cloudwatch.yml`。`.env` の `COMPOSE_FILE` で読み込む）。その前に、アプリの `init.sql`（社員10名）をRDSへ流し込みます。ログは EC2 の `/var/log/day3-setup.log` です。

EC2 では、cron（`/etc/cron.d/day3-app-traffic`）が1分ごとに社員一覧の API を呼びます。利用者のアクセスの代わりで、障害が起きるとアプリがエラーをログに出し続けます。Day 4 でも、このスタックをそのまま使います。

## Node.js を 24 にする（CloudShell、最初に1回）

CloudShell に最初から入っている Node.js は 20 系です。このまま CDK を動かすと、`NodeVersionSupportWarning` が出ます（2027年1月の第1週より後に出る AWS SDK v3 は、Node.js 22 以上が必要）。いまは警告だけで動きますが、先に 24 にしておきます。

nvm（Node.js のバージョンを切り替えるツール）を入れます。バージョンは v0.41.0 に固定します。

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh \
  | bash
```

```bash
. ~/.nvm/nvm.sh
```

```bash
nvm install 24
```

```bash
nvm alias default 24
```

```bash
node -v
```

`v24.` で始まる番号が出れば、切り替わっています。

- nvm と Node.js は、ホームディレクトリ（`~/.nvm`）に入ります。CloudShell を開き直しても残り、`~/.bashrc` に追記された設定で 24 が使われます。
- CloudShell のホームは、リージョンごとに別です。CDK を実行するリージョンの CloudShell で入れます。
- CloudShell を 120 日使わないと、ホームが消えます。間が空いたら、`node -v` で確かめます。
- すでに `npm ci` を実行したフォルダは、Node.js を切り替えたあとに `npm ci` をやり直します。

## パスワード（デプロイの前に作る）

`/day3-2026/{名前}/db/password` の SecureString は、CloudFormation では作れません。**デプロイの前に**作っておきます。値は、Day 2 の手順書で使っている研修用パスワードです。

```bash
AWS_REGION=us-west-2 aws ssm put-parameter \
  --name /day3-2026/tanaka/db/password \
  --type SecureString --value 'Tr41n-Rds2026-Kq7mZx' --overwrite
```

- RDS のマスターパスワードは、この SecureString を CloudFormation の動的参照（`{{resolve:ssm-secure:...}}`）で読みます。テンプレートには値が入りません。
- EC2 は、データを流し込むときに、ロールの権限でこの SecureString を読みます。ユーザーデータにも値は入りません。
- このパラメータはスタックの外にあるので、`cdk destroy` では消えません。スタックを消したあとに、別に消します。

## デプロイ（受講者1人分、CloudShell）

```bash
git clone https://github.com/haw/strong-system-dot-com.git
cd strong-system-dot-com/docs/2026/day3/cdk
npm ci
AWS_REGION=us-west-2 npx cdk bootstrap -c userName=tanaka   # リージョンごとに1回
AWS_REGION=us-west-2 npx cdk deploy -c userName=tanaka --require-approval never
```

RDS を作るので、デプロイには時間がかかります。終わっても、EC2 の中でデータの投入とアプリの起動が続いています。出力の `AppUrl` を開き、水色の「接続先：Amazon RDS」と社員一覧が出れば準備完了です。

## 障害を入れる（Day 3 の自学だけ）

研修では、講師が障害を入れます。研修を休んで、Day 3 のハンズオンを1人で進めるときだけ、この節を実行します。**Day 4 では実行しません。** Day 4 は、正常に動いている環境から始めます。

準備完了（`AppUrl` に社員一覧が出る）を確かめてから、CDK のフォルダで実行します。`{名前}` と `{リージョン}` は、デプロイで使ったものです。

```bash
cd ~/strong-system-dot-com/docs/2026/day3/cdk
```

```bash
bash break.sh tanaka us-west-2
```

- `続けますか？ (y/N)` と聞かれたら、`y` を入力します。
- 何を変えたかは表示しません。原因を探すのがハンズオンなので、`break.sh` の中身は読まずに実行します。
- `障害を入れました。` と出たら、5分ほど待ってから、Day 3 の手順書を始めます。CloudTrail に記録が出るまで、少し時間がかかるためです。

Day 3 のあとで、同じ環境を Day 4 に使う場合：

- Day 3 の障害を全部直して、`AppUrl` に社員一覧が出ていれば、そのまま使えます。
- 直しきれていないとき、どこを変えたか分からないときは、下の「削除」で消してから、「パスワード」と「デプロイ」をやり直します。

## 削除（受講者1人分）

CloudShell を開き直すと、ホームディレクトリから始まります。CDK のフォルダに移動してから実行します。

```bash
cd ~/strong-system-dot-com/docs/2026/day3/cdk
```

```bash
AWS_REGION=us-west-2 npx cdk destroy -c userName=tanaka --force
```

```bash
AWS_REGION=us-west-2 aws ssm delete-parameter \
  --name /day3-2026/tanaka/db/password
```

## 手元でテンプレートだけ確かめる

AWS に接続せずにテンプレートを生成できます（`cdk.out/` に出力）。

```bash
CDK_OUTDIR=cdk.out CDK_CONTEXT_JSON='{"userName":"tanaka"}' \
  npx ts-node --prefer-ts-exts bin/day3-2026-cdk.ts
```
