# Day 2（2026）CDK：ハンズオンのスタート地点

講師が、研修の前に受講者1人につき1スタックをデプロイします。受講者は、この上に RDS 用 SG・RDS・Parameter Store のパラメータを作ります。

## 作られるもの（`{名前}` は `-c userName=` の値）

| リソース | 名前 | 内容 |
| --- | --- | --- |
| スタック | `day2-2026-{名前}` | |
| VPC | `day2-2026-vpc-{名前}` | 10.0.0.0/16。2つのAZに、パブリック /24 とプライベート /24 を1つずつ。NATなし |
| セキュリティグループ | `day2-2026-app-sg-{名前}` | 3000/tcp を `allowedCidr`（既定 0.0.0.0/0）から許可 |
| DBサブネットグループ | `day2-2026-db-subnet-group-{名前}` | プライベートサブネット2つ |
| IAMロール | `day2-2026-ec2-role-{名前}` | `AmazonSSMManagedInstanceCore` と、`/day2-2026/{名前}/db/*` だけを読める許可。ほかのパラメータは明示的に拒否 |
| EC2 | `day2-2026-app-{名前}` | Ubuntu 24.04、t3.micro、パブリックサブネット。Session Manager で接続。IMDSv2 必須（ホップ数2） |

EC2 は起動時に Docker を入れ、このリポジトリの `docs/2026/app` を `DB_SOURCE=local` で起動します。起動完了まで数分かかります。ログは EC2 の `/var/log/day2-setup.log` です。

環境（アカウントとリージョン）はコードに書いていません。デプロイ先は `AWS_REGION` で決まります。

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

## 準備（CloudShell）

```bash
git clone https://github.com/haw/strong-system-dot-com.git
cd strong-system-dot-com/docs/2026/day2/cdk
npm ci
```

受講者がいるリージョンごとに、1回だけ bootstrap します。すでに済んでいるリージョンで実行しても問題ありません。

```bash
AWS_REGION=us-west-2 npx cdk bootstrap -c userName=tanaka
```

`-c userName=` は、アプリの読み込みに必要なだけです。どの名前でも構いません。

## デプロイ（受講者1人分）

```bash
AWS_REGION=us-west-2 npx cdk deploy -c userName=tanaka --require-approval never
```

研修会場のIPだけにアプリを公開する場合は、`-c allowedCidr=203.0.113.10/32` を付けます。

出力（Outputs）の `AppUrl` を開き、「接続先：ローカル MySQL」と社員一覧が表示されれば準備完了です。

## 削除（受講者1人分）

受講者が RDS と RDS 用のセキュリティグループを削除してから実行します。残っていると、VPC とサブネットグループを削除できずに失敗します。

CloudShell を開き直すと、ホームディレクトリから始まります。CDK のフォルダに移動してから実行します。

```bash
cd ~/strong-system-dot-com/docs/2026/day2/cdk
```

```bash
AWS_REGION=us-west-2 npx cdk destroy -c userName=tanaka --force
```

## 手元でテンプレートだけ確かめる

AWS に接続せずにテンプレートを生成できます（`cdk.out/` に出力）。

```bash
CDK_OUTDIR=cdk.out CDK_CONTEXT_JSON='{"userName":"tanaka"}' \
  npx ts-node --prefer-ts-exts bin/day2-2026-cdk.ts
```
