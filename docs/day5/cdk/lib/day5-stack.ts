import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface Day5StackProps extends cdk.StackProps {
  userName: string;
}

export class Day5Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Day5StackProps) {
    super(scope, id, props);

    const { userName } = props;

    // デフォルトVPCを取得
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVPC', {
      isDefault: true,
    });

    // IAMロール作成
    const role = new iam.Role(this, 'KiroCLIRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess'),
      ],
    });

    // Ubuntu 24.04 LTS AMI
    const ami = ec2.MachineImage.lookup({
      name: 'ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*',
      owners: ['099720109477'], // Canonical
    });

    // ユーザーデータ
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'apt-get update -y',
      '',
      '# AWS CLI インストール',
      'curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"',
      'apt-get install -y unzip',
      'unzip -q awscliv2.zip',
      './aws/install',
      'rm -rf aws awscliv2.zip',
      '',
      '# Kiro CLI インストール',
      'wget https://desktop-release.q.us-east-1.amazonaws.com/latest/kiro-cli.deb',
      'dpkg -i kiro-cli.deb',
      'apt-get install -f -y',
      'rm kiro-cli.deb',
    );

    // EC2インスタンス作成
    const instance = new ec2.Instance(this, 'KiroCLIInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      machineImage: ami,
      role,
      userData,
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(16, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });

    // タグ設定
    cdk.Tags.of(instance).add('Name', `kiro-cli-${userName}`);

    // 出力
    new cdk.CfnOutput(this, 'InstanceId', {
      value: instance.instanceId,
      description: 'EC2 Instance ID',
    });
  }
}
