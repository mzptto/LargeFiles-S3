# Testing the Performance Fix

## What Changed

The system was calling progress tracking functions **1+ million times** per large file transfer. Now it only calls them **~100 times** (once per 1% or 100MB).

## How to Test

### 1. Start a New Transfer

Use your UI or API to start a new transfer of a large file (the bigger the better to see the difference).

### 2. Monitor the Logs

Watch the CloudWatch logs in real-time:

```bash
aws logs tail /ecs/s3-zip-downloader-worker --follow --format short
```

### What You Should See

#### BEFORE (Bad - what you were seeing):
```
2025-11-28T00:18:10 Progress: 99000035/9029243448 bytes (1%)
2025-11-28T00:18:10 Progress: 99008227/9029243448 bytes (1%)
2025-11-28T00:18:10 Progress: 99015843/9029243448 bytes (1%)
2025-11-28T00:18:10 Progress: 99024035/9029243448 bytes (1%)
2025-11-28T00:18:10 Progress: 99032227/9029243448 bytes (1%)
... (hundreds per second)
```

#### AFTER (Good - what you should see now):
```
2025-11-28T00:20:15 Progress: 100000000/9029243448 bytes (1%)
2025-11-28T00:20:45 Progress: 200000000/9029243448 bytes (2%)
2025-11-28T00:21:15 Progress: 300000000/9029243448 bytes (3%)
2025-11-28T00:21:45 Progress: 400000000/9029243448 bytes (4%)
... (one per 1% or 100MB)
```

### 3. Check CPU Utilization

Go to ECS in AWS Console and check the task metrics:

**Before**: CPU would be high (50-80%) due to overhead
**After**: CPU should be much lower (10-30%), with more cycles for actual transfer

### 4. Measure Transfer Speed

Time a large file transfer and calculate MB/s:

```
Transfer Speed = File Size (MB) / Time (seconds)
```

**Expected improvement**: 2-3x faster than before, potentially reaching 15-25 MB/s depending on your network and source server.

### 5. Check Progress Updates in UI

Your UI should still update smoothly (we kept the `onProgress` callback firing frequently), but the backend logs and DynamoDB updates should be much less frequent.

## What to Look For

### Good Signs ✅
- Progress logs appear every 1% or every 100MB
- CPU utilization is low (10-30%)
- Transfer speeds are significantly faster
- Logs are clean and readable
- No performance degradation over time

### Bad Signs ❌
- Still seeing progress logs for every 8KB chunk
- CPU utilization still high (50%+)
- Transfer speeds unchanged
- Logs flooding with progress updates

## If It's Still Slow

If you're still seeing slow transfers after this fix, the bottleneck is likely:

1. **Source server throttling** - The server you're downloading from is rate-limiting
2. **Network bandwidth** - Your AWS region or network path to the source is slow
3. **S3 upload limits** - Though unlikely with multipart uploads
4. **Source server performance** - The server is slow to serve the file

You can test this by:
- Trying different source URLs/servers
- Testing from different AWS regions
- Checking source server response times with `curl -w "@curl-format.txt" -o /dev/null -s URL`

## Expected Performance

With all optimizations in place:
- **Small files (<100MB)**: Near-instant
- **Medium files (100MB-1GB)**: 1-5 minutes
- **Large files (1-10GB)**: 5-30 minutes
- **Very large files (10-100GB)**: 30-180 minutes

These are rough estimates assuming decent source server performance and network conditions.
