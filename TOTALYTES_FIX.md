# Fix for totalBytes Showing 0 in UI

## Problem
When users submitted new file transfers, the UI showed `totalBytes: 0` and files appeared not to be loading, even though the ECS workers were actively transferring data.

## Root Cause
The issue was caused by two problems in the worker code:

1. **Worker overwrites totalBytes with 0**: In `backend/src/worker/index.ts`, the worker called `dynamoDBService.updateTransferProgress(config.transferId, 0, 0)` immediately after loading the transfer record. This overwrote the totalBytes field with 0.

2. **Delayed first progress update**: The StreamingService uses throttling to avoid excessive DynamoDB writes - it only updates when either 1% progress is made OR 100MB is transferred. For large files (87GB), this meant the first update wouldn't happen until 100MB was transferred, which could take several minutes.

## Solution
Made two changes:

### 1. Removed the problematic updateTransferProgress call
**File**: `backend/src/worker/index.ts`

Removed this code that was overwriting totalBytes with 0:
```typescript
// Update status to STARTING
try {
  await dynamoDBService.updateTransferProgress(config.transferId, 0, 0);
  console.log('Transfer status updated to IN_PROGRESS');
} catch (dbError: any) {
  console.error('Failed to update transfer status:', formatErrorMessage(dbError));
  // Continue anyway - this is not critical
}
```

### 2. Added immediate DynamoDB update with totalBytes
**File**: `backend/src/services/StreamingService.ts`

Added code to immediately update DynamoDB with the correct totalBytes as soon as it's known:
```typescript
// Immediately update DynamoDB with the total file size so UI can display it
// This ensures the UI shows the correct file size before the first progress update
if (this.dynamoDBService && totalBytes > 0) {
  try {
    await this.dynamoDBService.updateTransferProgress(transferId, 0, totalBytes);
    console.log(`Updated DynamoDB with total file size: ${totalBytes} bytes`);
  } catch (error) {
    console.error('Failed to update DynamoDB with total size:', error);
    // Don't fail the transfer if this update fails
  }
}
```

## Testing
1. Built and deployed the new Docker image
2. Stopped existing transfers that were running with the old code
3. Ready to test with new transfers

## Expected Behavior
- When a new transfer is submitted, the UI should immediately show the correct file size
- Progress updates will continue to be throttled (every 1% or 100MB) to avoid excessive DynamoDB writes
- The totalBytes field will never be overwritten with 0

## Deployment
- Docker image built and pushed: `852515592623.dkr.ecr.us-east-1.amazonaws.com/s3-zip-downloader-worker:latest`
- New ECS tasks will automatically use the updated image
- Existing transfers were stopped to allow testing with the fix
