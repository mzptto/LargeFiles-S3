# Test Setup Guide

## Test S3 Bucket Configuration

### Automated Setup (via CDK)

The CDK stack automatically creates a test S3 bucket with the following configuration:

- **Bucket Name**: `s3-zip-downloader-test-{account-id}`
- **Lifecycle Policy**: Auto-delete files after 7 days
- **Permissions**: Lambda has write access via IAM role
- **Removal Policy**: Bucket is destroyed when stack is deleted

### Deploy Test Infrastructure

```bash
cd infrastructure
npm run build
cdk deploy
```

After deployment, the test bucket name will be output. Update `backend/test-config.json` with the actual bucket name.

### Manual Setup (Alternative)

If you prefer to create a test bucket manually:

1. Create an S3 bucket in your AWS account
2. Update `backend/test-config.json` with your bucket name
3. Ensure your AWS credentials have write permissions to the bucket

### Test Bucket Permissions

The Lambda execution role has the following permissions on all S3 buckets (including the test bucket):

- `s3:PutObject`
- `s3:PutObjectAcl`
- `s3:AbortMultipartUpload`
- `s3:ListMultipartUploadParts`
- `s3:ListBucket`
- `s3:GetBucketLocation`

### Running Integration Tests

```bash
cd backend
npm test -- --run
```

### Cleanup

Test files are automatically deleted after 7 days via lifecycle policy. To manually clean up:

```bash
aws s3 rm s3://your-test-bucket-name --recursive
```

Or destroy the entire stack:

```bash
cd infrastructure
cdk destroy
```

## Test Files

Integration tests will use the mock HTTP server (see task 10.2) to serve test ZIP files of various sizes:

- **Small**: < 1MB
- **Medium**: 10-50MB
- **Large**: 100MB+

These files are generated dynamically by the mock server and are not stored in the repository.
