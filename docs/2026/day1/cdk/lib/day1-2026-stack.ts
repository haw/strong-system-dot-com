import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export interface Day1StackProps extends cdk.StackProps {
  readonly userName: string;
}

// Day 1 を一人で学ぶときのスタート地点。研修では講師が day1-setup.sh で用意するものを、1人分だけ作る。
// EC2 とロールは、受講者が手順書のとおり自分で作る。
export class Day1Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Day1StackProps) {
    super(scope, id, props);

    const { userName } = props;

    // インバウンドルールのない SG（アウトバウンドはすべて許可）。Session Manager と S3 への通信に足りる。
    // VpcId を書かないので、デプロイ先リージョンの default VPC に作られる。
    // 講師が用意する共用の day1-ec2-sg と重ならないよう、名前に受講者名を付ける。
    const sg = new ec2.CfnSecurityGroup(this, 'Ec2Sg', {
      groupName: `day1-ec2-sg-${userName}`,
      groupDescription: 'Day 1 self-study: no inbound rules (Session Manager only)',
    });

    // 教材バケット。名前にアカウントIDを入れて、ほかのアカウントと重ならないようにする。
    // バージョニングを有効にする（講師用の day1-setup.sh と同じ）。スタックを消すと、中身ごと消える。
    const bucket = new s3.Bucket(this, 'TrainingDocs', {
      bucketName: `day1-selfstudy-${userName}-${cdk.Aws.ACCOUNT_ID}`,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // 手順書で作るロール（day1-ec2-role-*）からの削除・上書き・設定変更を拒否する。
    // 手順5で AmazonS3FullAccess を付けても、比較用教材の削除が拒否されることを確かめるため。
    bucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'DenyChangesFromHandsOnRoles',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: [
        's3:PutObject',
        's3:DeleteObject',
        's3:DeleteObjectVersion',
        's3:PutBucketPolicy',
        's3:DeleteBucketPolicy',
        's3:DeleteBucket',
      ],
      resources: [bucket.bucketArn, bucket.arnForObjects('*')],
      conditions: {
        ArnLike: { 'aws:PrincipalArn': `arn:${cdk.Aws.PARTITION}:iam::${cdk.Aws.ACCOUNT_ID}:role/day1-ec2-role-*` },
      },
    }));

    // 教材（講師用の day1-setup.sh と同じ内容）。
    new s3deploy.BucketDeployment(this, 'Docs', {
      destinationBucket: bucket,
      sources: [
        s3deploy.Source.data(`trainees/${userName}/guide.txt`, `${userName}さん向け業務ガイド。経費申請は翌月10日まで。\n`),
        s3deploy.Source.data('comparison/guide.txt', '比較用の架空文書。今回のアプリケーションには不要。\n'),
      ],
    });

    // 手順書の「講師から配られる値」の代わりに使う値。
    new cdk.CfnOutput(this, 'Region', { value: cdk.Aws.REGION, description: '自分のリージョン' });
    new cdk.CfnOutput(this, 'UserName', { value: userName, description: '自分の名前（リソース名に付ける）' });
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName, description: '教材バケット名' });
    new cdk.CfnOutput(this, 'BucketRegion', { value: cdk.Aws.REGION, description: '教材バケットのリージョン' });
    new cdk.CfnOutput(this, 'SecurityGroupName', { value: `day1-ec2-sg-${userName}`, description: '手順2で選ぶセキュリティグループ' });
    new cdk.CfnOutput(this, 'SecurityGroupId', { value: sg.attrGroupId });
  }
}
