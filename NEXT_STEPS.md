# Next Steps for Testing

## Current Situation

We've implemented two major fixes:
1. **Logging Throttling** - Reduced progress logging from 1M+ calls to ~100 per transfer
2. **S3 Upload Timeout Configuration** - Increased timeouts and added SDK-level retries

## Problem

The 80GB test file from USGS is extremely slow to transfer, making it difficult to test our fixes quickly. The source server appears to have bandwidth limitations.

## Recommended Testing Approach

### Option 1: Use a Smaller Test File
Find a publicly accessible file in the 1-5GB range to test with. This will:
- Complete faster (minutes instead of hours)
- Still test multipart upload logic (files >100MB use multipart)
- Allow us to iterate quickly on fixes

### Option 2: Test with a Fast Source
Use a file hosted on a CDN or fast server:
- AWS public datasets
- GitHub releases
- Popular CDN-hosted files

### Option 3: Create Our Own Test File
Host a large test file on S3 with public read access:
```bash
# Create a 2GB test file
dd if=/dev/urandom of=test-2gb.bin bs=1M count=2048

# Upload to S3 with public read
aws s3 cp test-2gb.bin s3://your-bucket/test-2gb.bin --acl public-read

# Get the URL
aws s3 presign s3://your-bucket/test-2gb.bin --expires-in 86400
```

## What to Look For in Logs

With the new fixes, you should see:
1. **Throttled Progress Logs**: Only ~100 progress updates instead of millions
2. **S3 Upload Metrics**: 
   - "Uploading part X (Y MB)..."
   - "Part X uploaded in Zs (W MB/s)"
3. **No Timeout Errors**: Should see successful retries instead of failures
4. **Consistent Progress**: Bytes transferred should increase steadily

## Testing the Current Deployment

To test with the current 80GB file:
1. Go to: https://d2h4pm30cmzfn1.cloudfront.net
2. Submit the transfer
3. Monitor logs: `aws logs tail /ecs/s3-zip-downloader-worker --follow`
4. Watch for the new logging format showing upload metrics

## Expected Performance

With a good source server:
- **Download from source**: 50-100 MB/s (depends on source)
- **Upload to S3**: 50-200 MB/s (depends on network)
- **Overall throughput**: Limited by slower of the two

For the 80GB file with a good connection:
- Expected time: 15-30 minutes
- Current time: Hours (indicating source server is the bottleneck)
