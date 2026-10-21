#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Day3Stack } from '../lib/day3-2026-stack';

const app = new cdk.App();

// 受講者名（必須）。リソース名に付けて、ほかの受講者と重ならないようにする。
const userName = app.node.tryGetContext('userName');
if (!userName || !/^[a-z0-9][a-z0-9-]*$/.test(userName)) {
  throw new Error('userName context is required (lowercase letters, digits, hyphens). Use: cdk deploy -c userName=tanaka');
}

// アプリの 3000 番ポートを開ける送信元。研修会場のIPに絞るときに指定する。
const allowedCidr = app.node.tryGetContext('allowedCidr') ?? '0.0.0.0/0';

new Day3Stack(app, `day3-2026-${userName}`, {
  userName,
  allowedCidr,
  // env は指定しない。デプロイ先のリージョンは AWS_REGION で決まり、どのリージョンでも同じテンプレートを使う。
  description: `Day 3 (2026) starting point for ${userName}`,
});
