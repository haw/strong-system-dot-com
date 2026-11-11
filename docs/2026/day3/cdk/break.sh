#!/usr/bin/env bash
# Day 3 の自学用：このフォルダの CDK で作った1人分の環境に、Day 3 の障害を入れる。
# Day 3 だけで使う。Day 4 では使わない。
#
#   bash break.sh {名前} {リージョン}
#
# 何を変えるかは、画面に出さない。ハンズオンで探すため、このファイルの続きは読まずに実行する。
set -euo pipefail

if [ $# -ne 2 ]; then
    echo "使い方: bash break.sh {名前} {リージョン}   例: bash break.sh tanaka us-west-2" >&2
    exit 1
fi
NAME=$1
REGION=$2
PREFIX='day3-2026'
STACK="$PREFIX-$NAME"
POLICY_NAME="$PREFIX-read-my-params"
APP_DIR='/home/ubuntu/strong-system-dot-com/docs/2026/app'
IAM_WAIT_SECONDS=30

command -v jq > /dev/null || { echo 'jq が見つかりません。CloudShell で実行してください。' >&2; exit 1; }

if ! aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" > /dev/null 2>&1; then
    echo "リージョン $REGION にスタック $STACK が見つかりません。何も変えていません。" >&2
    exit 1
fi

account=$(aws sts get-caller-identity --query Account --output text)
echo "アカウント $account、リージョン $REGION の $STACK に、Day 3 の障害を入れます。"
read -r -p '続けますか？ (y/N) ' answer
if [ "$answer" != 'y' ] && [ "$answer" != 'Y' ]; then
    echo '何も変えていません。'
    exit 0
fi

output_of() {
    aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
        --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

endpoint=$(output_of DbEndpoint)
rds_sg=$(output_of RdsSecurityGroupId)
app_sg=$(output_of AppSecurityGroupId)
instance=$(output_of InstanceId)
param_path="/$PREFIX/$NAME/db"
role="$PREFIX-ec2-role-$NAME"

# 1. EC2 のロール：自分のパラメータ以外を拒否する Deny の、/db を /database に書き換える。
policy=$(aws iam get-role-policy --role-name "$role" --policy-name "$POLICY_NAME" \
    --query PolicyDocument --output json)
broken_policy=$(jq -c '(.Statement[] | select(.Sid == "DenyOtherParams") | .NotResource) |=
    ((if type == "array" then . else [.] end) | map(sub("/db(?<rest>(/\\*)?)$"; "/database\(.rest)")))' \
    <<< "$policy")
if [ "$(jq -c . <<< "$policy")" != "$broken_policy" ]; then
    aws iam put-role-policy --role-name "$role" --policy-name "$POLICY_NAME" \
        --policy-document "$broken_policy" > /dev/null
fi

# 2. 接続先のホスト名：-db- を -bd- にする。
aws ssm put-parameter --region "$REGION" --name "$param_path/host" \
    --type String --value "${endpoint/-db-/-bd-}" --overwrite > /dev/null

# 3. RDS のセキュリティグループ：アプリのセキュリティグループからの 3306 を消す。
aws ec2 revoke-security-group-ingress --region "$REGION" --group-id "$rds_sg" \
    --ip-permissions "IpProtocol=tcp,FromPort=3306,ToPort=3306,UserIdGroupPairs=[{GroupId=$app_sg}]" \
    > /dev/null 2>&1 || true

# 4. パスワード：最後の1文字の大文字・小文字を入れ替える。
password=$(aws ssm get-parameter --region "$REGION" --name "$param_path/password" \
    --with-decryption --query Parameter.Value --output text)
last=${password: -1}
case "$last" in
    [a-z]) wrong="${password%?}$(tr '[:lower:]' '[:upper:]' <<< "$last")" ;;
    [A-Z]) wrong="${password%?}$(tr '[:upper:]' '[:lower:]' <<< "$last")" ;;
    *) wrong="${password}0" ;;
esac
aws ssm put-parameter --region "$REGION" --name "$param_path/password" \
    --type SecureString --value "$wrong" --overwrite > /dev/null

# IAM の変更が効くのを待ってから、アプリを作り直して設定を読み直させる。
echo "反映を待っています（${IAM_WAIT_SECONDS}秒）..."
sleep "$IAM_WAIT_SECONDS"
aws ssm send-command --region "$REGION" --instance-ids "$instance" \
    --document-name AWS-RunShellScript \
    --parameters "commands=[\"cd $APP_DIR && sudo -u ubuntu docker compose up -d --force-recreate --no-deps app\"]" \
    > /dev/null

echo '障害を入れました。5分ほど待ってから、Day 3 の手順書を始めてください。'
