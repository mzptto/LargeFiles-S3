# Integration Testing Guide

This document describes the integration testing setup for the S3 ZIP Downloader application.

## Overview

Integration testing infrastructure includes:

1. **Test S3 Bucket**: Dedicated S3 bucket for testing uploads
2. **Mock HTTP Server**: Local HTTP server for simulating file downloads
3. **Test Configuration**: Centralized test configuration

## Components

### 1. Test S3 Bucket

**Location**: Defined in `infrastructure/lib/s3-zip-downloader-stack.ts`

**Configuration**:
- Bucket name: `s3-zip-downloader-test-{account-id}`
- Auto-delete objects after 7 days (lifecycle policy)
- Lambda has write permissions via IAM role
- Automatically destroyed when stack is deleted

**Setup**:
```bash
cd infrastructure
npm run build
cdk deploy
```

After deployment, update `backend/test-config.json` with the actual bucket name from the CDK output.

**Manual Alternative**:
If you prefer not to use CDK, create a bucket manually and update `test-config.json`.

### 2. Mock HTTP Server

**Location**: `backend/src/test/mockHttpServer.ts`

**Features**:
- Generates ZIP files dynamically (no disk storage needed)
- Simulates various HTTP responses (200, 404, 403, 500)
- Supports delayed responses for timeout testing
- Streams large files efficiently
- Automatic port assignment

**Usage**:
```typescript
import { createTestServer } from './test/mockHttpServer';

const server = await createTestServer();
const baseUrl = server.getBaseUrl();

// Test with small file
const url = `${baseUrl}/test-small.zip`;

// Clean up
await server.stop();
```

**Available Test Files**:
- `/test-small.zip` - 100KB
- `/test-medium.zip` - 10MB
- `/test-large.zip` - 100MB
- `/not-found.zip` - Returns 404
- `/forbidden.zip` - Returns 403
- `/slow.zip` - 1MB with 5s delay

See `backend/src/test/README.md` for detailed documentation.

### 3. Test Configuration

**Location**: `backend/test-config.json`

**Contents**:
```json
{
  "testBucket": "s3-zip-downloader-test-local",
  "testRegion": "us-east-1",
  "testFiles": {
    "small": "test-small.zip",
    "medium": "test-medium.zip",
    "large": "test-large.zip"
  }
}
```

Update `testBucket` with your actual test bucket name after CDK deployment.

## Writing Integration Tests

### Example: End-to-End Transfer Test

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, MockHttpServer } from './test/mockHttpServer';
import { StreamingService } from '../services/StreamingService';
import { S3Service } from '../services/S3Service';
import testConfig from '../../test-config.json';

describe('End-to-End Transfer', () => {
  let mockServer: MockHttpServer;
  let baseUrl: string;
  let streamingService: StreamingService;
  let s3Service: S3Service;

  beforeAll(async () => {
    mockServer = await createTestServer();
    baseUrl = mockServer.getBaseUrl();
    streamingService = new StreamingService();
    s3Service = new S3Service();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('should transfer small file from HTTP to S3', async () => {
    const sourceUrl = `${baseUrl}/test-small.zip`;
    const bucket = testConfig.testBucket;
    const key = `test-${Date.now()}.zip`;

    const result = await streamingService.transferToS3(
      sourceUrl,
      bucket,
      key,
      (bytes, total) => {
        console.log(`Progress: ${(bytes / total * 100).toFixed(2)}%`);
      }
    );

    expect(result.success).toBe(true);
    expect(result.bytesTransferred).toBe(100 * 1024);

    // Verify file exists in S3
    const exists = await s3Service.validateBucketAccess(bucket);
    expect(exists).toBe(true);
  });

  it('should handle 404 errors gracefully', async () => {
    const sourceUrl = `${baseUrl}/not-found.zip`;
    const bucket = testConfig.testBucket;
    const key = `test-404-${Date.now()}.zip`;

    const result = await streamingService.transferToS3(
      sourceUrl,
      bucket,
      key,
      () => {}
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

### Example: Testing Different File Sizes

```typescript
it.each([
  { name: 'small', size: 100 * 1024 },
  { name: 'medium', size: 10 * 1024 * 1024 },
  { name: 'large', size: 100 * 1024 * 1024 },
])('should transfer $name file', async ({ name, size }) => {
  const sourceUrl = `${baseUrl}/test-${name}.zip`;
  const bucket = testConfig.testBucket;
  const key = `test-${name}-${Date.now()}.zip`;

  const result = await streamingService.transferToS3(
    sourceUrl,
    bucket,
    key,
    () => {}
  );

  expect(result.success).toBe(true);
  expect(result.bytesTransferred).toBe(size);
});
```

## Running Integration Tests

```bash
# Run all tests (including integration tests)
cd backend
npm test

# Run specific test file
npm test -- integration.test.ts

# Run with verbose output
npm test -- --reporter=verbose
```

## Prerequisites

1. **AWS Credentials**: Ensure AWS credentials are configured
   ```bash
   aws configure
   ```

2. **Test Bucket**: Deploy CDK stack or create bucket manually
   ```bash
   cd infrastructure
   cdk deploy
   ```

3. **Update Configuration**: Update `backend/test-config.json` with actual bucket name

## Cleanup

### Automatic Cleanup
- Test files are automatically deleted after 7 days (lifecycle policy)
- Test bucket is destroyed when CDK stack is deleted

### Manual Cleanup
```bash
# Delete all test files
aws s3 rm s3://your-test-bucket-name --recursive

# Destroy CDK stack (including test bucket)
cd infrastructure
cdk destroy
```

## Troubleshooting

### "Access Denied" Errors
- Verify AWS credentials are configured
- Check IAM permissions for S3 write access
- Ensure test bucket exists and is accessible

### "Bucket Not Found" Errors
- Deploy CDK stack: `cd infrastructure && cdk deploy`
- Update `test-config.json` with correct bucket name
- Verify bucket exists: `aws s3 ls s3://your-test-bucket-name`

### Mock Server Port Conflicts
- Mock server uses random available ports by default
- If issues persist, specify a port: `new MockHttpServer({ port: 3001 })`

### Timeout Errors
- Increase test timeout for large files
- Check network connectivity
- Verify Lambda timeout settings (15 minutes)

## Best Practices

1. **Isolate Tests**: Each test should use unique S3 keys to avoid conflicts
2. **Clean Up**: Delete test files after tests complete (or rely on lifecycle policy)
3. **Use Mock Server**: Use mock server for most tests; only use real S3 when necessary
4. **Test Incrementally**: Start with small files, then test larger files
5. **Monitor Costs**: Test bucket lifecycle policy helps control storage costs

## Next Steps

- Implement task 10.3: Write integration tests (optional)
- Add more test scenarios (network interruptions, partial uploads, etc.)
- Set up CI/CD pipeline for automated testing
- Add performance benchmarks
