#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { S3ZipDownloaderStack } from '../lib/s3-zip-downloader-stack';

const app = new cdk.App();

new S3ZipDownloaderStack(app, 'S3ZipDownloaderStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Infrastructure for S3 ZIP Downloader application',
});

app.synth();
