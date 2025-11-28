# S3 Upload Timeout Fix

## Problem Discovered

After fixing the logging overhead issue, we discovered the real bottleneck: **S3 multipart uploads were timing out**.

### Symptoms
- Transfers would receive data from source successfully (419MB+ transferred)
- S3 uploads would fail with `ECONNRESET` errors
- Error: "Client network socket disconnected before secure TLS connection was established"
- Uploads timing out after 3 retry attempts

### Root Cause
The AWS SDK S3 client was using default timeout settings that were too aggressive for large file uploads:
- Default connection timeout was too short
- Default request timeout didn't account for 100MB part uploads
- SDK retry configuration wasn't optimized for large transfers

## Solution Implemented

### 1. Increased S3 Client Timeouts
```typescript
this.s3Client = new S3Client({
  region: region || process.env.AWS_REGION || 'us-east-1',
  requestHandler: {
    requestTimeout: 300000,    // 5 minutes for individual requests
    connectionTimeout: 60000,   // 1 minute to establish connection
  },
  maxAttempts: 5,              // SDK will retry up to 5 times
});
```

### 2. Enhanced Upload Monitoring
Added detailed logging to track:
- Upload start time and duration
- Part size in MB
- Upload throughput (MB/s)
- Detailed error information including:
  - Error name and code
  - HTTP status code
  - Number of retry attempts
  - Total retry delay

### 3. Better Error Diagnostics
```typescript
console.error(`Error details:`, {
  name: error.name,
  code: error.code,
  statusCode: error.$metadata?.httpStatusCode,
  attempts: error.$metadata?.attempts,
  totalRetryDelay: error.$metadata?.totalRetryDelay
});
```

## Expected Results

With these changes:
1. S3 uploads should complete successfully even with slower network conditions
2. We'll have detailed metrics on upload performance
3. Better visibility into any remaining issues through enhanced logging
4. SDK-level retries (5 attempts) + application-level retries (3 attempts) = up to 15 total attempts per part

## Testing

To test the fix:
1. Submit a large file transfer (80GB+ file)
2. Monitor CloudWatch logs for upload progress
3. Look for:
   - "Uploading part X (Y MB)..." messages
   - "Part X uploaded in Zs (W MB/s)" success messages
   - Consistent progress without timeout errors

## Files Modified

- `backend/src/services/S3Service.ts`
  - Updated S3Client constructor with timeout configuration
  - Enhanced uploadPart method with detailed logging
  - Added performance metrics tracking

## Deployment

Deployed via CodeBuild at: 2025-11-28 ~08:45 UTC
Image: `852515592623.dkr.ecr.us-east-1.amazonaws.com/s3-zip-downloader-worker:latest`
