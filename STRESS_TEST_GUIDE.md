# Stress Test Guide

## Overview

This guide explains how to run extended stress tests to validate the stability of the S3 ZIP Downloader system over 4+ hours.

## Prerequisites

- Deployed S3 ZIP Downloader system
- Node.js installed
- AWS CLI configured
- Access to CloudWatch Logs

## Running the Stress Test

### 1. Start the Stress Test

```bash
node scripts/stress-test.js
```

This will:
- Run transfers every 30 minutes for 4 hours
- Test with 5GB Ubuntu ISO file
- Monitor success/failure rates
- Save results to `stress-test-results.json`

### 2. Monitor CloudWatch Metrics

While the test is running, monitor the following CloudWatch metrics:

#### ECS Task Metrics
```bash
# Monitor memory usage
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name MemoryUtilization \
  --dimensions Name=ServiceName,Value=S3ZipDownloaderCluster \
  --start-time $(date -u -d '4 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum \
  --region us-east-1
```

#### Lambda Metrics
```bash
# Monitor Lambda errors
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=S3ZipDownloaderStack-JobSubmissionFunctionA601F1D4-BArX0mBOrYKj \
  --start-time $(date -u -d '4 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region us-east-1
```

### 3. Check for Memory Leaks

#### During the Test

Monitor ECS task memory usage in CloudWatch:
1. Go to CloudWatch Console
2. Navigate to Metrics → ECS
3. Select "MemoryUtilization" for the cluster
4. Look for steady increases over time (indicates memory leak)

Expected behavior:
- Memory should stabilize after initial ramp-up
- No continuous upward trend
- Memory should return to baseline between transfers

#### After the Test

Check CloudWatch Logs for memory-related warnings:
```bash
node scripts/check-cloudwatch-logs.js
```

Look for:
- "Out of memory" errors
- Increasing heap usage warnings
- GC (garbage collection) pressure

### 4. Analyze Error Rates

Check the stress test results:
```bash
cat stress-test-results.json
```

Expected results:
- Success rate: >95%
- No crashes or hangs
- Consistent throughput across tests
- No increasing error rates over time

### 5. Verify No Crashes or Hangs

Check ECS task status:
```bash
aws ecs list-tasks --cluster S3ZipDownloaderCluster --region us-east-1
```

Check for:
- Tasks that stopped unexpectedly
- Tasks running longer than expected
- Task exit codes (should be 0 for success)

## Validation Criteria

### ✅ Pass Criteria

1. **Success Rate**: ≥95% of transfers complete successfully
2. **Memory Stability**: No memory leaks detected
3. **Error Rate**: No increasing error rate over time
4. **Throughput**: Consistent performance across all tests
5. **No Crashes**: No unexpected task terminations
6. **No Hangs**: All transfers complete within expected time

### ❌ Fail Criteria

1. Success rate <95%
2. Memory usage continuously increasing
3. Increasing error rate over time
4. Degrading throughput over time
5. Task crashes or unexpected terminations
6. Transfers hanging indefinitely

## Troubleshooting

### High Memory Usage

If memory usage is high but stable:
- This is expected for large file transfers
- Check that memory returns to baseline between transfers

If memory usage continuously increases:
- Possible memory leak
- Check CloudWatch Logs for specific errors
- Review code for unclosed streams or event listeners

### Increasing Error Rate

If errors increase over time:
- Check CloudWatch Logs for patterns
- May indicate resource exhaustion
- Check S3 bucket quotas and limits

### Degrading Performance

If throughput decreases over time:
- Check network conditions
- Check source server availability
- Check S3 service health

## Example Results

### Good Results
```json
{
  "totalTests": 8,
  "successCount": 8,
  "failureCount": 0,
  "successRate": "100.0%",
  "avgThroughput": 27.5
}
```

### Concerning Results
```json
{
  "totalTests": 8,
  "successCount": 6,
  "failureCount": 2,
  "successRate": "75.0%",
  "avgThroughput": 15.2
}
```

## Next Steps

After completing the stress test:

1. Review `stress-test-results.json`
2. Check CloudWatch metrics for anomalies
3. Verify no memory leaks
4. Document any issues found
5. Update performance documentation

## Notes

- The stress test uses real AWS resources and will incur costs
- Each test transfers ~5GB of data
- Total data transfer: ~40GB over 4 hours (8 tests)
- Estimated cost: <$1 for data transfer and storage
