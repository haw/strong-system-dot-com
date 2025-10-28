import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface Day3StackProps extends cdk.StackProps {
  readonly userName: string;
}

export class Day3Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Day3StackProps) {
    super(scope, id, props);

    const { userName } = props;

    // S3バケット作成（ファイル保存用）
    // bucketNameを指定せず、CDKに自動生成させる（グローバル一意性を保証）
    const filesBucket = new s3.Bucket(this, 'FilesBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
    });

    // VPC作成
    const vpc = new ec2.Vpc(this, 'Day3Vpc', {
      vpcName: `${userName}-day3-vpc`,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
      natGateways: 0,
    });

    // セキュリティグループ作成
    const securityGroup = new ec2.SecurityGroup(this, 'Day3AppSg', {
      vpc,
      securityGroupName: `day3-app-sg-${userName}`,
      description: 'Security group for Day 3 application',
      allowAllOutbound: true,
    });

    // インバウンドルール追加
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3000),
      'App Server'
    );

    // IAMロール作成（SSM + S3アクセス用）
    const role = new iam.Role(this, 'Day3Ec2Role', {
      roleName: `day3-ec2-role-${userName}`,
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    // S3バケットへの読み書き権限を付与
    filesBucket.grantReadWrite(role);

    // S3用Gateway型VPCエンドポイント作成（無料、セキュリティ向上）
    const s3Endpoint = vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // Ubuntu 24.04 LTS AMI
    const machineImage = ec2.MachineImage.lookup({
      name: 'ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*',
      owners: ['099720109477'], // Canonical
    });

    // ユーザーデータ
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -e',
      '',
      '# ログファイル設定',
      'LOG_FILE="/var/log/userdata.log"',
      'exec > >(tee -a ${LOG_FILE}) 2>&1',
      '',
      'echo "=========================================="',
      'echo "Day 3: EC2 Setup Script Started"',
      'echo "Timestamp: $(date)"',
      'echo "=========================================="',
      '',
      '# SWAPファイルの作成（t3.micro用メモリ対策）',
      'echo "[1/9] Creating SWAP file for t3.micro instance..."',
      'dd if=/dev/zero of=/swapfile bs=128M count=16',
      'chmod 600 /swapfile',
      'mkswap /swapfile',
      'swapon /swapfile',
      'echo \'/swapfile swap swap defaults 0 0\' >> /etc/fstab',
      '',
      '# Docker GPGキーの追加',
      'echo "[2/9] Adding Docker\'s official GPG key..."',
      'apt-get update',
      'apt-get install -y ca-certificates curl',
      'install -m 0755 -d /etc/apt/keyrings',
      'curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc',
      'chmod a+r /etc/apt/keyrings/docker.asc',
      '',
      '# Dockerリポジトリの追加',
      'echo "[3/9] Adding Docker repository to Apt sources..."',
      'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \\"${UBUNTU_CODENAME:-$VERSION_CODENAME}\\") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null',
      '',
      '# Dockerのインストール',
      'echo "[4/9] Installing Docker..."',
      'apt-get update',
      'apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin',
      '',
      '# ubuntuユーザーをdockerグループに追加',
      'echo "[5/9] Adding ubuntu user to docker group..."',
      'usermod -aG docker ubuntu',
      '',
      '# Node.js 22.xのインストール',
      'echo "[6/9] Installing Node.js 22.x..."',
      'curl -fsSL https://deb.nodesource.com/setup_22.x | bash -',
      'apt-get install -y nodejs',
      '',
      '# リポジトリのクローン',
      'echo "[7/9] Cloning repository..."',
      'cd /home/ubuntu',
      'sudo -u ubuntu git clone https://github.com/haw/strong-system-dot-com.git',
      'cd strong-system-dot-com',
      '',
      '# Docker Composeでdb-server、ldap-serverを起動（Day 3スタート地点: MinIOはS3に移行済み）',
      'echo "[8/9] Starting db-server and ldap-server with Docker Compose..."',
      'sudo -u ubuntu docker compose up -d db-server ldap-server',
      '',
      '# app-serverをEC2で直接実行',
      'echo "[9/9] Setting up app-server..."',
      'cd /home/ubuntu/strong-system-dot-com/app-server',
      '',
      '# .envファイルを作成（Day 3スタート地点: S3使用、MySQLコンテナ使用）',
      'cat > .env << EOF',
      'NODE_ENV=production',
      'PORT=3000',
      'DB_HOST=127.0.0.1',
      'DB_USER=root',
      'DB_PASSWORD=password',
      'DB_NAME=employee_db',
      'LDAP_SERVER=127.0.0.1',
      'LDAP_PORT=389',
      `AWS_REGION=${this.region}`,
      `S3_BUCKET_NAME=${filesBucket.bucketName}`,
      'USE_AWS_S3=true',
      'EOF',
      '',
      '# .envファイルの所有者をubuntuに変更',
      'chown ubuntu:ubuntu .env',
      '',
      '# npm install',
      'sudo -u ubuntu npm install',
      '',
      '# PM2をグローバルインストール',
      'npm install -g pm2',
      '',
      '# PM2でアプリ起動',
      'sudo -u ubuntu pm2 start server.js --name app',
      'sudo -u ubuntu pm2 save',
      'sudo -u ubuntu pm2 startup systemd -u ubuntu --hp /home/ubuntu',
      '',
      'echo "=========================================="',
      'echo "Day 3: EC2 Setup Script Completed"',
      'echo "Timestamp: $(date)"',
      'echo "=========================================="',
      '',
      '# Get public IP using IMDSv2',
      'TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" -s)',
      'PUBLIC_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/public-ipv4)',
      '',
      'echo ""',
      'echo "Application URLs:"',
      'echo "  - Employee Management System: http://${PUBLIC_IP}:3000"',
      'echo ""',
      'echo "Note: Make sure to configure Security Group to allow the following ports:"',
      'echo "  - 22/TCP (SSH)"',
      'echo "  - 3000/TCP (App Server)"'
    );

    // EC2インスタンス作成
    const instance = new ec2.Instance(this, 'Day3AppServer', {
      instanceName: `day3-app-server-${userName}`,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage,
      securityGroup,
      role,
      userData,
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(12, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
      requireImdsv2: true,
    });

    // Outputs
    new cdk.CfnOutput(this, 'S3BucketName', {
      value: filesBucket.bucketName,
      description: 'S3 Bucket Name for files',
    });

    new cdk.CfnOutput(this, 'VpcId', {
      value: vpc.vpcId,
      description: 'VPC ID',
    });

    new cdk.CfnOutput(this, 'S3EndpointId', {
      value: s3Endpoint.vpcEndpointId,
      description: 'S3 Gateway VPC Endpoint ID',
    });

    new cdk.CfnOutput(this, 'InstanceId', {
      value: instance.instanceId,
      description: 'EC2 Instance ID',
    });

    new cdk.CfnOutput(this, 'InstancePublicIp', {
      value: instance.instancePublicIp,
      description: 'EC2 Instance Public IP',
    });

    new cdk.CfnOutput(this, 'ApplicationUrl', {
      value: `http://${instance.instancePublicIp}:3000`,
      description: 'Employee Management System URL',
    });
  }
}
