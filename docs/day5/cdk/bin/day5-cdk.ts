#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Day5Stack } from '../lib/day5-stack';

const app = new cdk.App();

const userName = app.node.tryGetContext('userName');
if (!userName) {
  throw new Error('userName context variable is required. Use: cdk deploy -c userName=tanaka');
}

new Day5Stack(app, `KiroCli-${userName}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  userName,
});
