# Integration Tests

## Overview

The integration tests in `integration.test.ts` provide comprehensive end-to-end testing of the S3 ZIP Downloader application. These tests verify the complete flow from downloading files from HTTP sources to uploading them to S3.

## Test Coverage

The integration test suite covers all requirements specified in task 10.3:

### 1. Complete Flow from Frontend to S3 (Requirements: 3.1, 3.2)
- **Small file transfer** (100KB): Tests basic transfer functionality
- **Medium file transfer** (10MB): Tests typical file sizes with progress reporting
- **Large file transfer** (100MB): Tests multipart upload for large files

### 2. Various File Sizes (Requirements: 3.1, 3.2, 8.1)
- Small files (100KB): Quick transfers, single-part upload
- Medium files (10MB): Multi-chunk streaming
- Large files (100MB): Multipart upload with 5MB parts

### 3. Error Scenarios (Requirements: 3.4, 3.5, 6.2)
- **404 errors**: Tests handling of non-existent source URLs
- **403 errors**: Tests handling of forbidden source URLs
- **S3 permission errors**: Tests handling of invalid/inaccessible S3 buckets
- **Network interruptions**: Covered by error handling tests

### 4. Progress Reporting Accuracy (Requirements: 4.2)
- **Progress updates**: Verifies progress callbacks are called during transfer
- **Monotonic progress**: Ensures progress never decreases
- **Accurate percentages**: Validates progress calculations
- **Progress store integration**: Tests progress tracking system

### Additional Test Coverage
- **Key prefix handling**: Tests S3 key prefix concatenation
- **Streaming behavior**: Verifies memory-efficient streaming (not buffering entire file)
- **Concurrent transfers**: Tests multiple simultaneous transfers
- **Transfer ID generation**: Ensures unique IDs for each transfer

## Prerequisites

### Required Setup

1. **AWS Account**: You need an AWS account with S3 access
2. **AWS Credentials**: Configure AWS credentials locally
   ```bash
   aws configure
   ```

3. **Test S3 Bucket**: Create or deploy a test bucket
   - **Option A - Using CDK** (Recommended):
     ```bash
     cd infrastructure
     npm install
     npm run build
     cdk deploy
     ```
   - **Option B - Manual**:
     ```bash
     aws s3 mb s3://your-test-bucket-name
     ```

4. **Update Configuration**: Edit `backend/test-config.json`
   ```json
   {
     "testBucket": "your-actual-test-bucket-name",
     "testRegion": "us-east-1"
   }
   ```

### IAM Permissions

Your AWS credentials need the following S3 permissions:
- `s3:PutObject`
- `s3:PutObjectAcl`
- `s3:AbortMultipartUpload`
- `s3:ListMultipartUploadParts`
- `s3:ListBucket`
- `s3:GetBucketLocation`
- `s3:HeadBucket`

## Running the Tests

### Run All Integration Tests
```bash
cd backend
npm test -- integration.test.ts
```

### Run Specific Test
```bash
npm test -- integration.test.ts -t "should transfer small file"
```

### Run with Verbose Output
```bash
npm test -- integration.test.ts --reporter=verbose
```

### Skip Integration Tests
If you don't have S3 access configured, skip these tests:
```bash
npm test -- --exclude integration.test.ts
```

## Test Architecture

### Mock HTTP Server
- Uses the `MockHttpServer` from `mockHttpServer.ts`
- Generates ZIP files dynamically (no disk storage)
- Simulates various HTTP responses (200, 404, 403)
- Supports configurable file sizes and delays

### Real S3 Integration
- Tests use actual AWS S3 API calls
- Verifies real multipart upload behavior
- Tests actual streaming performance
- Validates real error responses from AWS

### Progress Tracking
- Tests use the real `ProgressStore` singleton
- Verifies progress updates during actual transfers
- Tests progress throttling (1% or 1MB intervals)

## Test Results Interpretation

### Successful Test Run
When all tests pass, you'll see:
```
✓ src/test/integration.test.ts (10)
  ✓ Integration Tests - End-to-End Transfer (10)
    ✓ should transfer small file from HTTP to S3
    ✓ should transfer medium file from HTTP to S3
    ✓ should transfer large file from HTTP to S3 using multipart upload
    ✓ should handle 404 error gracefully
    ✓ should handle 403 error gracefully
    ✓ should handle S3 permission errors gracefully
    ✓ should report accurate progress during transfer
    ✓ should correctly apply key prefix during transfer
    ✓ should use streaming without loading entire file into memory
    ✓ should handle multiple concurrent transfers
```

### Common Failures

#### "S3 bucket does not exist"
- **Cause**: Test bucket not created or wrong name in config
- **Fix**: Deploy CDK stack or create bucket manually, update `test-config.json`

#### "Access Denied"
- **Cause**: AWS credentials lack S3 permissions
- **Fix**: Update IAM policy to include required S3 permissions

#### "Credentials not found"
- **Cause**: AWS credentials not configured
- **Fix**: Run `aws configure` and enter your credentials

#### Timeout Errors
- **Cause**: Network issues or slow connection
- **Fix**: Increase test timeouts or check network connectivity

## Cleanup

### Automatic Cleanup
- The CDK stack includes a lifecycle policy that deletes test files after 7 days
- Test files are prefixed with `integration-test-` for easy identification

### Manual Cleanup
```bash
# Delete all test files
aws s3 rm s3://your-test-bucket-name --recursive --exclude "*" --include "integration-test-*"

# Delete entire test bucket (if using CDK)
cd infrastructure
cdk destroy
```

## Performance Expectations

### Typical Test Duration
- Small file test: ~1-2 seconds
- Medium file test: ~5-10 seconds
- Large file test: ~30-60 seconds
- Error tests: ~1-2 seconds each
- Full suite: ~2-3 minutes

### Memory Usage
- The streaming test verifies memory stays under 50MB for 100MB file
- Typical memory increase: 10-20MB for large file transfers
- This confirms proper streaming (not buffering entire file)

## Troubleshooting

### Tests Hang or Timeout
1. Check network connectivity to AWS
2. Verify AWS region in config matches your credentials
3. Increase test timeouts in test file
4. Check CloudWatch logs for Lambda errors (if using deployed stack)

### Inconsistent Test Results
1. Ensure test bucket is empty before running
2. Check for concurrent test runs
3. Verify AWS rate limits aren't being hit
4. Run tests sequentially: `npm test -- integration.test.ts --no-threads`

### Mock Server Issues
1. Ensure no port conflicts (server uses random ports)
2. Check firewall settings
3. Verify Node.js version compatibility (18+)

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Integration Tests
on: [push, pull_request]

jobs:
  integration-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Install Dependencies
        run: |
          cd backend
          npm install
      
      - name: Run Integration Tests
        run: |
          cd backend
          npm test -- integration.test.ts
```

## Next Steps

After integration tests pass:
1. Review test coverage reports
2. Add more edge case tests as needed
3. Set up CI/CD pipeline for automated testing
4. Monitor test performance over time
5. Add integration tests for frontend components

## Related Documentation

- `backend/INTEGRATION_TESTING.md` - General integration testing guide
- `backend/src/test/README.md` - Mock HTTP server documentation
- `.kiro/specs/s3-zip-downloader/design.md` - System design document
- `.kiro/specs/s3-zip-downloader/requirements.md` - Requirements specification
