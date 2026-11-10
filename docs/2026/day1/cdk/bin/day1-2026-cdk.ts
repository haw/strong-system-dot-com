#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Day1Stack } from '../lib/day1-2026-stack';

const app = new cdk.App();

// 受講者名（必須）。リソース名に付けて、ほかの人のものと重ならないようにする。
const userName = app.node.tryGetContext('userName');
if (!userName || !/^[a-z0-9][a-z0-9-]*$/.test(userName)) {
  throw new Error('userName context is required (lowercase letters, digits, hyphens). Use: cdk deploy -c userName=tanaka');
}

new Day1Stack(app, `day1-2026-${userName}`, {
  userName,
  // env は指定しない。デプロイ先のリージョンは AWS_REGION で決まる。
  // 手順書は教材バケットを東京（ap-northeast-1）として書いてあるので、東京にデプロイする。
  description: `Day 1 (2026) self-study starting point for ${userName}`,
});
