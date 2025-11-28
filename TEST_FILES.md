# Test Files for Transfer Testing

## Recommended Test Files

### 1. Ubuntu ISO (3-4GB) - Fast CDN
```
https://releases.ubuntu.com/22.04/ubuntu-22.04.3-desktop-amd64.iso
Size: ~4.7 GB
Source: Ubuntu CDN (very fast)
```

### 2. Debian ISO (3-4GB) - Fast CDN
```
https://cdimage.debian.org/debian-cd/current/amd64/iso-dvd/debian-12.2.0-amd64-DVD-1.iso
Size: ~3.7 GB
Source: Debian CDN (very fast)
```

### 3. Linux Kernel Archive (100-500MB) - Fast
```
https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-6.6.1.tar.xz
Size: ~138 MB
Source: kernel.org CDN (very fast)
```

### 4. Sample Video Files (Various Sizes)
```
http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
Size: ~158 MB
Source: Google Cloud Storage (very fast)
```

## Testing Strategy

### Phase 1: Small File (100-200MB)
- Test basic functionality
- Verify logging throttling works
- Check S3 upload metrics
- Expected time: 1-2 minutes

### Phase 2: Medium File (1-5GB)
- Test multipart upload logic
- Verify parallel uploads work
- Check retry logic
- Expected time: 5-15 minutes

### Phase 3: Large File (10GB+)
- Test long-running transfers
- Verify timeout handling
- Check progress tracking accuracy
- Expected time: 30-60 minutes

## Current Test File Issues

The USGS file (80GB) has issues:
- Very slow source server (~1-2 MB/s)
- Makes testing iterations take hours
- Difficult to distinguish between source issues and our code issues

## Recommendation

Start with the Linux Kernel archive (138MB) to quickly verify:
1. Logging throttling is working
2. S3 uploads complete successfully
3. Progress tracking is accurate
4. No timeout errors occur

Then move to Ubuntu ISO (4.7GB) for a more realistic large file test.
