#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Day4ServerlessStack } from '../lib/day4-stack';

const app = new cdk.App();

// Get userName from context
const userName = app.node.tryGetContext('userName');
if (!userName) {
  throw new Error('Context variable "userName" is required. Use: cdk deploy -c userName=your-name');
}

new Day4ServerlessStack(app, `Day4Stack-${userName}`, {
  userName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
  },
  description: `Day 4: Serverless Architecture Stack for ${userName}`,
});

app.synth();
