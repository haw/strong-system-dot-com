#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Day2Stack } from '../lib/day2-stack';

const app = new cdk.App();

// ユーザー名をコンテキストから取得（必須）
const userName = app.node.tryGetContext('userName');
if (!userName) {
  throw new Error('userName context is required. Use: cdk deploy -c userName=your-name');
}

new Day2Stack(app, `Day2Stack-${userName}`, {
  userName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
  },
  description: `Day 2 complete infrastructure for ${userName}`,
});
