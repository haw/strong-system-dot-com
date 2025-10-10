import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface Day1StackProps extends cdk.StackProps {
  readonly userName: string;
}

export class Day1Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Day1StackProps) {
    super(scope, id, props);

    const { userName } = props;

    // VPC作成
    const vpc = new ec2.Vpc(this, 'Day1Vpc', {
      vpcName: `${userName}-day1-vpc`,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      availabilityZones: [`${this.region}a`, `${this.region}c`],
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
    const securityGroup = new ec2.SecurityGroup(this, 'Day1AppSg', {
      vpc,
      securityGroupName: `day1-app-sg-${userName}`,
      description: 'Security group for Day 1 application',
      allowAllOutbound: true,
    });

    // インバウンドルール追加
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3000),
      'App Server 1'
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3001),
      'App Server 2'
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(9000),
      'MinIO API'
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(9001),
      'MinIO Console'
    );

    // IAMロール作成（SSM + S3アクセス用）
    const role = new iam.Role(this, 'Day1Ec2Role', {
      roleName: `day1-ec2-role-${userName}`,
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
      ],
    });

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
      'echo "Day 1: EC2 Setup Script Started"',
      'echo "Timestamp: $(date)"',
      'echo "=========================================="',
      '',
      '# SWAPファイルの作成（t3.micro用メモリ対策）',
      'echo "[1/7] Creating SWAP file for t3.micro instance..."',
      'dd if=/dev/zero of=/swapfile bs=128M count=16',
      'chmod 600 /swapfile',
      'mkswap /swapfile',
      'swapon /swapfile',
      'echo \'/swapfile swap swap defaults 0 0\' >> /etc/fstab',
      '',
      '# Docker GPGキーの追加',
      'echo "[2/7] Adding Docker\'s official GPG key..."',
      'apt-get update',
      'apt-get install -y ca-certificates curl',
      'install -m 0755 -d /etc/apt/keyrings',
      'curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc',
      'chmod a+r /etc/apt/keyrings/docker.asc',
      '',
      '# Dockerリポジトリの追加',
      'echo "[3/7] Adding Docker repository to Apt sources..."',
      'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \\"${UBUNTU_CODENAME:-$VERSION_CODENAME}\\") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null',
      '',
      '# Dockerのインストール',
      'echo "[4/7] Installing Docker..."',
      'apt-get update',
      'apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin',
      '',
      '# ubuntuユーザーをdockerグループに追加',
      'echo "[5/7] Adding ubuntu user to docker group..."',
      'usermod -aG docker ubuntu',
      '',
      '# リポジトリのクローン',
      'echo "[6/7] Cloning repository..."',
      'cd /home/ubuntu',
      'sudo -u ubuntu git clone https://github.com/haw/strong-system-dot-com.git',
      'cd strong-system-dot-com',
      '',
      '# Dockerコンテナのビルドと起動',
      'echo "[7/7] Building and starting Docker containers..."',
      'sudo -u ubuntu docker compose build',
      'sudo -u ubuntu docker compose up -d',
      '',
      'echo "=========================================="',
      'echo "Day 1: EC2 Setup Script Completed"',
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
      'echo "  - Employee Management System (Replica): http://${PUBLIC_IP}:3001"',
      'echo "  - MinIO Console: http://${PUBLIC_IP}:9001"',
      'echo ""',
      'echo "Note: Make sure to configure Security Group to allow the following ports:"',
      'echo "  - 22/TCP (SSH)"',
      'echo "  - 3000/TCP (App Server 1)"',
      'echo "  - 3001/TCP (App Server 2)"',
      'echo "  - 9000/TCP (MinIO API)"',
      'echo "  - 9001/TCP (MinIO Console)"'
    );

    // EC2インスタンス作成
    const instance = new ec2.Instance(this, 'Day1AppServer', {
      instanceName: `day1-app-server-${userName}`,
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

    new cdk.CfnOutput(this, 'MinIOConsoleUrl', {
      value: `http://${instance.instancePublicIp}:9001`,
      description: 'MinIO Console URL',
    });
  }
}
