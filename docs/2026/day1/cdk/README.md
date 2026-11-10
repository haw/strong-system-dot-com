# Day 1（2026）CDK：一人で学ぶときのスタート地点

研修を休んだ人などが、Day 1 のハンズオンを一人で行うためのものです。研修では講師が用意する教材バケットとセキュリティグループを、1人分だけ作ります。研修の当日に講師が使うものではありません。

EC2 と IAM ロールは、[ハンズオンの手順書](../)のとおり、自分で作ります。

## 作られるもの（`{名前}` は `-c userName=` の値）

| リソース | 名前 | 内容 |
| --- | --- | --- |
| スタック | `day1-2026-{名前}` | |
| セキュリティグループ | `day1-ec2-sg-{名前}` | default VPC に作る。インバウンドルールなし（Session Manager で接続するので不要） |
| S3 バケット | `day1-selfstudy-{名前}-{アカウントID}` | 教材バケット。バージョニングあり。スタックを消すと、中身ごと消える |
| 教材 | `trainees/{名前}/guide.txt`、`comparison/guide.txt` | 自分用と比較用の教材 |
| バケットポリシー | | 手順書で作るロール（`day1-ec2-role-*`）からの削除・上書き・設定変更を拒否する |

教材を置くための Lambda 関数と IAM ロールも、CDK が自動で作ります。

**東京リージョン（`ap-northeast-1`）にデプロイします。** 手順書は、教材バケットのリージョンを東京として書いてあります。EC2 も東京に作ります。

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

東京リージョンで CloudShell を開きます。

```bash
git clone https://github.com/haw/strong-system-dot-com.git
```

```bash
cd strong-system-dot-com/docs/2026/day1/cdk
```

```bash
npm ci
```

東京リージョンで、1回だけ bootstrap します。すでに済んでいる場合は、実行しても問題ありません。`tanaka` は自分の名前に置き換えます。

```bash
AWS_REGION=ap-northeast-1 npx cdk bootstrap -c userName=tanaka
```

東京リージョンに default VPC がないと、セキュリティグループを作れずに失敗します。次のコマンドで VPC の ID が出れば、あります。`None` と出たら、`aws ec2 create-default-vpc --region ap-northeast-1` で作ります。

```bash
aws ec2 describe-vpcs --region ap-northeast-1 \
  --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' --output text
```

## デプロイ

```bash
AWS_REGION=ap-northeast-1 npx cdk deploy -c userName=tanaka \
  --require-approval never
```

## 手順書の「講師から配られる値」の代わりに使う値

デプロイの最後に出る出力（Outputs）を使います。

| 手順書の項目 | 出力 | 値 |
| --- | --- | --- |
| 自分のリージョン | `Region` | `ap-northeast-1` |
| 自分の名前 | `UserName` | `-c userName=` に指定した名前 |
| 教材バケット名 | `BucketName` | `day1-selfstudy-{名前}-{アカウントID}` |
| 教材バケットのリージョン | `BucketRegion` | `ap-northeast-1` |

手順書と違うところは、次の2つです。

- 手順2のセキュリティグループは、`day1-ec2-sg` ではなく、出力の `SecurityGroupName`（`day1-ec2-sg-{名前}`）を選びます。
- 後片付けは、手順書の EC2 とロールの削除のあとに、下の「削除」も行います。

## 削除

手順書の後片付け（EC2 の終了とロールの削除）を先に済ませます。EC2 が残っていると、セキュリティグループを消せずに失敗します。

CloudShell を開き直すと、ホームディレクトリから始まります。CDK のフォルダに移動してから実行します。

```bash
cd ~/strong-system-dot-com/docs/2026/day1/cdk
```

```bash
AWS_REGION=ap-northeast-1 npx cdk destroy -c userName=tanaka --force
```

教材バケットは、中身ごと消えます。

## 手元でテンプレートだけ確かめる

AWS に接続せずにテンプレートを生成できます（`cdk.out/` に出力）。

```bash
CDK_OUTDIR=cdk.out CDK_CONTEXT_JSON='{"userName":"tanaka"}' \
  npx ts-node --prefer-ts-exts bin/day1-2026-cdk.ts
```
