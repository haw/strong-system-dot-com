import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface Day3StackProps extends cdk.StackProps {
  readonly userName: string;
  readonly allowedCidr: string;
}

// Day 3 のスタート地点：Day 2 を終えた状態（アプリが RDS につながって正常に動いている）。
// /day3-2026/{名前}/db/password の SecureString は CloudFormation で作れないため、講師のスクリプトがデプロイ前に作る。
// RDS のマスターパスワードはその SecureString を参照するので、テンプレートにもユーザーデータにも値は入らない。
export class Day3Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Day3StackProps) {
    super(scope, id, props);

    const { userName, allowedCidr } = props;
    const prefix = 'day3-2026';
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

    const appSg = new ec2.SecurityGroup(this, 'AppSg', {
      vpc,
      securityGroupName: `${prefix}-app-sg-${userName}`,
      description: 'Day 3 app server',
      allowAllOutbound: true,
    });
    appSg.addIngressRule(ec2.Peer.ipv4(allowedCidr), ec2.Port.tcp(3000), 'App');

    // RDS の SG：アプリの SG からの 3306 だけを許可する。
    const rdsSg = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc,
      securityGroupName: `${prefix}-rds-sg-${userName}`,
      description: 'Day 3 RDS: MySQL from app',
      allowAllOutbound: false,
    });
    rdsSg.addIngressRule(appSg, ec2.Port.tcp(3306), 'MySQL from app');

    const dbSubnetGroup = new rds.SubnetGroup(this, 'DbSubnetGroup', {
      vpc,
      subnetGroupName: `${prefix}-db-subnet-group-${userName}`,
      description: `Day 3 private subnets for ${userName}`,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // RDS for MySQL 8.4.10。Single-AZ、パブリックアクセスなし。
    const db = new rds.DatabaseInstance(this, 'Db', {
      instanceIdentifier: `${prefix}-db-${userName}`,
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_4_10 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      subnetGroup: dbSubnetGroup,
      securityGroups: [rdsSg],
      credentials: rds.Credentials.fromPassword('admin', cdk.SecretValue.ssmSecure(`${paramPath}/password`)),
      multiAz: false,
      publiclyAccessible: false,
      allocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(0),
      deleteAutomatedBackups: true,
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 接続情報（String の3つ）。password（SecureString）は講師のスクリプトが作る。
    new ssm.StringParameter(this, 'ParamHost', { parameterName: `${paramPath}/host`, stringValue: db.dbInstanceEndpointAddress });
    new ssm.StringParameter(this, 'ParamUser', { parameterName: `${paramPath}/user`, stringValue: 'admin' });
    new ssm.StringParameter(this, 'ParamName', { parameterName: `${paramPath}/name`, stringValue: 'employee_db' });

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

    // アプリのログを送る CloudWatch Logs のロググループ。ログを送るのは EC2 上の Docker なので、EC2 のロールに書く権限を付ける。
    const appLogGroup = new logs.LogGroup(this, 'AppLogs', {
      logGroupName: `/${prefix}/${userName}/app`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    appLogGroup.grantWrite(role);

    const machineImage = ec2.MachineImage.fromSsmParameter(
      '/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id',
    );

    // Day 2 のアプリを使う。最初から RDS（DB_SOURCE=ssm）につなぐ。ローカルの MySQL コンテナは使わない。
    const appDir = '/home/ubuntu/strong-system-dot-com/docs/2026/day2/app';
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'set -euxo pipefail',
      'exec > >(tee -a /var/log/day3-setup.log) 2>&1',
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
      'sudo -u ubuntu git clone --depth 1 https://github.com/haw/strong-system-dot-com.git /home/ubuntu/strong-system-dot-com',
      '',
      '# Day 2 で移したのと同じデータを RDS に入れる（Day 2 を終えた状態を作る）。RDS が受け付けるまで待つ。',
      '# パスワードはロールの権限で Parameter Store から読み、環境変数で渡す。ログに出さないよう、この間は set -x を止める。',
      'snap install aws-cli --classic',
      '{ set +x; } 2>/dev/null',
      `DB_PASSWORD=$(aws ssm get-parameters --region ${this.region} --names ${paramPath}/password --with-decryption --query 'Parameters[0].Value' --output text)`,
      `for i in $(seq 1 30); do docker run --rm -i -e MYSQL_PWD="$DB_PASSWORD" mysql:8.4.5 mysql -h '${db.dbInstanceEndpointAddress}' -u admin --ssl-mode=REQUIRED --default-character-set=utf8mb4 < ${appDir}/init.sql && break; echo "RDS not ready (try $i)"; sleep 20; done`,
      'unset DB_PASSWORD',
      'set -x',
      '',
      '# アプリを RDS につないで起動する。ログは CloudWatch Logs にも送る（docker-compose.cloudwatch.yml）',
      `cat > ${appDir}/.env <<'EOF'`,
      'DB_SOURCE=ssm',
      `PARAM_PREFIX=${paramPath}`,
      `AWS_REGION=${this.region}`,
      'COMPOSE_FILE=docker-compose.yml:docker-compose.cloudwatch.yml',
      `LOG_GROUP=${appLogGroup.logGroupName}`,
      'EOF',
      `chown ubuntu:ubuntu ${appDir}/.env`,
      `cd ${appDir}`,
      'sudo -u ubuntu docker compose up -d --build --no-deps app',
      '',
      'echo "Day 3 setup completed"',
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
    new cdk.CfnOutput(this, 'DbEndpoint', { value: db.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, 'RdsSecurityGroupId', { value: rdsSg.securityGroupId });
    new cdk.CfnOutput(this, 'AppSecurityGroupId', { value: appSg.securityGroupId });
    new cdk.CfnOutput(this, 'ParameterPath', { value: paramPath });
    new cdk.CfnOutput(this, 'AppLogGroup', { value: appLogGroup.logGroupName });
  }
}
