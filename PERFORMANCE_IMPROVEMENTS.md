# Performance Improvements for Large File Transfers

## Date: 2025-11-27

## Problem
85GB file transfers were taking 5+ hours due to multiple bottlenecks:
- Transfer speed: ~4.4 MB/s (very slow for AWS)
- 28% complete after 1.5 hours

## Root Causes Identified

### 1. Tiny Part Size (CRITICAL)
- **Before:** 5MB parts
- **Issue:** 85GB file = 17,000+ S3 API calls with overhead on each
- **Impact:** Major throughput bottleneck

### 2. Undersized Fargate Resources (CRITICAL)
- **Before:** 2 vCPU, 4GB RAM
- **Issue:** Resource-starved for large transfers
- **Impact:** CPU and memory constraints limiting performance

### 3. Sequential Part Uploads (MAJOR)
- **Before:** One part uploaded at a time
- **Issue:** No parallelization, network pipe not fully utilized
- **Impact:** Wasted bandwidth and CPU cycles

## Changes Implemented

### 1. Increased Part Size (StreamingService.ts)
```typescript
// Before
private readonly PART_SIZE = 5 * 1024 * 1024; // 5MB

// After
private readonly PART_SIZE = 100 * 1024 * 1024; // 100MB
```
- **Impact:** 85GB now requires only 850 API calls instead of 17,000
- **Expected improvement:** 3-5x faster

### 2. Added Parallel Uploads (StreamingService.ts)
```typescript
// New constant
private readonly MAX_CONCURRENT_UPLOADS = 4;
```
- **Changes:**
  - Refactored `uploadParts()` to use `Set<Promise<void>>` for tracking concurrent uploads
  - Stream pauses only when hitting max concurrent uploads (4)
  - Resumes automatically when slots become available
  - All pending uploads complete before finalizing
- **Impact:** Up to 4 parts uploading simultaneously
- **Expected improvement:** 2-4x faster

### 3. Scaled Up Fargate Resources (s3-zip-downloader-stack.ts)
```typescript
// Before
memoryLimitMiB: 4096,  // 4GB
cpu: 2048,             // 2 vCPU

// After
memoryLimitMiB: 16384, // 16GB
cpu: 4096,             // 4 vCPU
```
- **Impact:** More CPU for parallel processing, more memory for larger buffers
- **Expected improvement:** 2-3x faster

## Expected Results

### Combined Impact
- **Before:** ~4.4 MB/s, 5+ hours for 85GB
- **After:** ~50-100 MB/s, 15-30 minutes for 85GB
- **Overall improvement:** 10-20x faster

### Cost Impact
- Fargate costs will increase due to larger instance size
- However, jobs complete much faster, reducing total runtime costs
- Net cost may be similar or lower due to reduced execution time

## Testing Recommendations

1. Test with the same 85GB file to measure actual improvement
2. Monitor CloudWatch metrics for:
   - Transfer completion time
   - Network throughput
   - CPU and memory utilization
3. Adjust `MAX_CONCURRENT_UPLOADS` if needed (can go up to 8-10 for very large files)
4. Consider increasing part size to 500MB for files > 500GB

## Future Optimizations (Not Implemented)

If further improvements are needed:
1. **Adaptive part sizing:** Use larger parts (500MB-1GB) for very large files
2. **Read-ahead buffering:** Buffer multiple parts in memory while uploading
3. **Network tuning:** Adjust TCP window sizes and socket options
4. **S3 Transfer Acceleration:** Enable for cross-region transfers

## Deployment Status

✅ Backend code updated and compiled
✅ Infrastructure deployed (new task definition with 4 vCPU, 16GB RAM)
✅ Docker image rebuilt and pushed to ECR
✅ Ready for testing

## Files Modified

1. `backend/src/services/StreamingService.ts`
   - Increased PART_SIZE from 5MB to 100MB
   - Added MAX_CONCURRENT_UPLOADS = 4
   - Refactored uploadParts() for parallel uploads

2. `infrastructure/lib/s3-zip-downloader-stack.ts`
   - Increased Fargate CPU from 2048 to 4096
   - Increased Fargate memory from 4096 to 16384
