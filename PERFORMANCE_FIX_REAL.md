# Performance Fix - The Real Problem

## What Was Actually Wrong

Looking at the CloudWatch logs, the system was logging progress updates **for every single 8KB chunk**:

```
2025-11-28T00:18:10 Progress: 99000035/9029243448 bytes (1%)
2025-11-28T00:18:10 Progress: 99008227/9029243448 bytes (1%)
2025-11-28T00:18:10 Progress: 99015843/9029243448 bytes (1%)
... (every ~8KB)
```

For a 9GB file, that's **over 1 million progress update calls**!

## Root Cause

In `StreamingService.ts`, the `handleData` function was calling `updateProgressTracking()` for **every single chunk**:

```typescript
stream.on('data', (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  bytesTransferred += chunk.length;

  // THIS WAS BEING CALLED FOR EVERY 8KB CHUNK!
  this.updateProgressTracking(transferId, bytesTransferred, totalBytes).catch(err => {
    console.error('Failed to update progress:', err);
  });
  
  onProgress(bytesTransferred, totalBytes);
  // ... rest of logic
});
```

Even though `ProgressStore.updateProgress()` had throttling logic (only update every 1% or 100MB), we were still:

1. **Making the function call** for every 8KB chunk
2. **Creating a Promise** for every 8KB chunk
3. **Running the throttling check** for every 8KB chunk
4. **Attempting DynamoDB updates** for every 8KB chunk (even though most were rejected)

For a 9GB file with 8KB chunks, that's:
- **1,125,000 function calls**
- **1,125,000 promises created**
- **1,125,000 throttling checks**
- **1,125,000 DynamoDB service calls** (most rejected by throttling)

This massive overhead was killing performance.

## The Fix

Move the throttling logic **BEFORE** the function call, so we only call `updateProgressTracking()` when we actually need to update:

```typescript
// Track last update state
let lastProgressUpdate = 0;
let lastProgressPercentage = 0;
const ONE_HUNDRED_MB = 100 * 1024 * 1024;

stream.on('data', (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  bytesTransferred += chunk.length;

  // Calculate current percentage
  const currentPercentage = totalBytes > 0 
    ? Math.floor((bytesTransferred / totalBytes) * 100)
    : 0;
  
  const bytesDiff = bytesTransferred - lastProgressUpdate;
  const percentageDiff = currentPercentage - lastProgressPercentage;

  // Only call updateProgressTracking if 1% change or 100MB transferred
  if (percentageDiff >= 1 || bytesDiff >= ONE_HUNDRED_MB) {
    this.updateProgressTracking(transferId, bytesTransferred, totalBytes).catch(err => {
      console.error('Failed to update progress:', err);
    });
    lastProgressUpdate = bytesTransferred;
    lastProgressPercentage = currentPercentage;
  }

  // Still emit progress callback for UI (lightweight)
  onProgress(bytesTransferred, totalBytes);
  // ... rest of logic
});
```

## Performance Impact

### Before Fix:
- **1,125,000 function calls** per 9GB file
- **1,125,000 promises** created
- **1,125,000 throttling checks**
- Massive CPU overhead from unnecessary function calls

### After Fix:
- **~100 function calls** per 9GB file (once per 1% or 100MB)
- **~100 promises** created
- **~100 throttling checks**
- **99.99% reduction** in overhead

## Expected Results

With this fix, you should see:

1. **Significantly reduced CPU usage** on ECS tasks
2. **Faster transfer speeds** (more CPU available for actual data transfer)
3. **Cleaner logs** (only ~100 progress updates instead of 1+ million)
4. **Better throughput** approaching the theoretical maximum of your network/S3 connection

The previous "optimizations" (100MB parts, 4 concurrent uploads, 4 vCPU) were all correct, but this massive overhead was negating their benefits.

## Testing

Deploy the new image and start a transfer. You should see:
- Progress logs appearing every 1% or 100MB (not every 8KB)
- Much lower CPU utilization
- Faster overall transfer speeds

Check logs with:
```bash
aws logs tail /ecs/s3-zip-downloader-worker --since 5m --format short | Select-String "Progress:"
```

You should see far fewer progress updates, spaced out by meaningful intervals.
