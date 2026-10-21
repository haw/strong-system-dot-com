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
| IAMロール | `day3-2026-ec2-role-{名前}` | `AmazonSSMManagedInstanceCore` と、`/day3-2026/{名前}/db/*` だけを読める許可。ほかのパラメータは明示的に拒否 |
| EC2 | `day3-2026-app-{名前}` | Ubuntu 24.04、t3.micro、パブリックサブネット。Session Manager で接続。IMDSv2 必須（ホップ数2） |

EC2 は起動時に Docker を入れ、Day 2 のアプリ（`docs/2026/day2/app`）を `DB_SOURCE=ssm` で起動します。その前に、アプリの `init.sql`（社員10名）をRDSへ流し込みます。ログは EC2 の `/var/log/day3-setup.log` です。

## パスワード（デプロイの前に作る）

`/day3-2026/{名前}/db/password` の SecureString は、CloudFormation では作れません。**デプロイの前に**作っておきます。値は、Day 2 の手順書で使っている研修用パスワードです。

```bash
AWS_REGION=us-west-2 aws ssm put-parameter --name /day3-2026/tanaka/db/password \
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

## 削除（受講者1人分）

```bash
AWS_REGION=us-west-2 npx cdk destroy -c userName=tanaka --force
AWS_REGION=us-west-2 aws ssm delete-parameter --name /day3-2026/tanaka/db/password
```

## 手元でテンプレートだけ確かめる

AWS に接続せずにテンプレートを生成できます（`cdk.out/` に出力）。

```bash
CDK_OUTDIR=cdk.out CDK_CONTEXT_JSON='{"userName":"tanaka"}' npx ts-node --prefer-ts-exts bin/day3-2026-cdk.ts
```
