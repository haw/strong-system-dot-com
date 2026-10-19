import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

export interface Day2StackProps extends cdk.StackProps {
  readonly userName: string;
  readonly allowedCidr: string;
}

// Day 2 のスタート地点。受講者は、この上に RDS 用 SG・RDS・Parameter Store のパラメータを作る。
export class Day2Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Day2StackProps) {
    super(scope, id, props);

    const { userName, allowedCidr } = props;
    const prefix = 'day2-2026';
    const paramPath = `/${prefix}/${userName}/db`;

    // VPC：パブリック（EC2）とプライベート（RDS）を2つのAZに。NATなし。
    const vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `${prefix}-vpc-${userName}`,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // アプリのSG。受講者が作る RDS 用 SG は、この SG からの 3306 を許可する。
    const appSg = new ec2.SecurityGroup(this, 'AppSg', {
      vpc,
      securityGroupName: `${prefix}-app-sg-${userName}`,
      description: 'Day 2 app server',
      allowAllOutbound: true,
    });
    appSg.addIngressRule(ec2.Peer.ipv4(allowedCidr), ec2.Port.tcp(3000), 'App');

    // DBサブネットグループ（プライベートサブネット2つ）。受講者は RDS 作成時に選ぶだけ。
    const dbSubnetGroup = new rds.SubnetGroup(this, 'DbSubnetGroup', {
      vpc,
      subnetGroupName: `${prefix}-db-subnet-group-${userName}`,
      description: `Day 2 private subnets for ${userName}`,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // EC2のロール：Session Manager と、自分のパラメータだけの読み取り。
    const paramArn = `arn:${this.partition}:ssm:${this.region}:${this.account}:parameter${paramPath}`;
    const role = new iam.Role(this, 'Ec2Role', {
      roleName: `${prefix}-ec2-role-${userName}`,
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')],
      inlinePolicies: {
        [`${prefix}-read-my-params`]: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: 'ReadMyDbParams',
              effect: iam.Effect.ALLOW,
              actions: ['ssm:GetParameters'],
              resources: [`${paramArn}/*`],
            }),
            // AmazonSSMManagedInstanceCore は ssm:GetParameter(s) を全パラメータに許可している。
            // 他の受講者のパラメータを読めないよう、自分のパス以外を明示的に拒否する。
            new iam.PolicyStatement({
              sid: 'DenyOtherParams',
              effect: iam.Effect.DENY,
              actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath', 'ssm:GetParameterHistory'],
              notResources: [paramArn, `${paramArn}/*`],
            }),
          ],
        }),
      },
    });

    // Ubuntu 24.04（Canonical 公開の SSM パラメータ。デプロイ時に最新の AMI を使う）
    const machineImage = ec2.MachineImage.fromSsmParameter(
      '/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id',
    );

    const appDir = '/home/ubuntu/strong-system-dot-com/docs/2026/day2/app';
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'set -euxo pipefail',
      'exec > >(tee -a /var/log/day2-setup.log) 2>&1',
      '',
      '# t3.micro のメモリ不足対策（2GBのスワップ）',
      'fallocate -l 2G /swapfile',
      'chmod 600 /swapfile',
      'mkswap /swapfile',
      'swapon /swapfile',
      "echo '/swapfile swap swap defaults 0 0' >> /etc/fstab",
      '',
      '# Docker（公式リポジトリ）',
      'apt-get update',
      'apt-get install -y ca-certificates curl git',
      'install -m 0755 -d /etc/apt/keyrings',
      'curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc',
      'chmod a+r /etc/apt/keyrings/docker.asc',
      'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list',
      'apt-get update',
      'apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin',
      'usermod -aG docker ubuntu',
      '',
      '# アプリ（社員名簿）を取得して、ローカルの MySQL コンテナで起動する',
      'sudo -u ubuntu git clone --depth 1 https://github.com/haw/strong-system-dot-com.git /home/ubuntu/strong-system-dot-com',
      `cat > ${appDir}/.env <<'EOF'`,
      'DB_SOURCE=local',
      `PARAM_PREFIX=${paramPath}`,
      `AWS_REGION=${this.region}`,
      'EOF',
      `chown ubuntu:ubuntu ${appDir}/.env`,
      `cd ${appDir}`,
      'sudo -u ubuntu docker compose up -d --build',
      '',
      'echo "Day 2 setup completed"',
    );

    const instance = new ec2.Instance(this, 'AppServer', {
      instanceName: `${prefix}-app-${userName}`,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage,
      securityGroup: appSg,
      role,
      userData,
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(16, { volumeType: ec2.EbsDeviceVolumeType.GP3 }),
        },
      ],
      httpTokens: ec2.HttpTokens.REQUIRED,
      // アプリはコンテナの中からロールの認証情報を取るため、IMDS の応答が1ホップ多く必要。
      httpPutResponseHopLimit: 2,
    });

    new cdk.CfnOutput(this, 'AppUrl', { value: `http://${instance.instancePublicIp}:3000` });
    new cdk.CfnOutput(this, 'InstanceId', { value: instance.instanceId });
    new cdk.CfnOutput(this, 'AppSecurityGroup', { value: `${prefix}-app-sg-${userName}` });
    new cdk.CfnOutput(this, 'DbSubnetGroupName', { value: dbSubnetGroup.subnetGroupName });
    new cdk.CfnOutput(this, 'ParameterPath', { value: paramPath });
  }
}
