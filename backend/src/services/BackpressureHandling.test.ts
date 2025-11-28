import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamingService } from './StreamingService.js';
import { Readable } from 'stream';
import http from 'http';
import { S3Service } from './S3Service.js';

/**
 * Tests for backpressure handling in StreamingService
 * Requirements: Stream flow control, performance, Performance monitoring, resilience testing
 * 
 * These tests verify that:
 * 1. Stream pause/resume events are logged correctly
 * 2. Time spent in paused state is tracked
 * 3. Buffer memory usage is monitored
 * 4. System handles slow S3 uploads without source server timeouts
 * 5. System works correctly under varying network conditions
 */
describe('StreamingService - Backpressure Handling', () => {
  let streamingService: StreamingService;
  let mockServer: http.Server;
  let serverPort: number;

  beforeEach(() => {
    streamingService = new StreamingService();
  });

  afterEach(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => {
        mockServer.close(() => resolve());
      });
    }
  });

  /**
   * Helper function to create a mock HTTP server that serves data at a controlled rate
   */
  const createMockServer = (
    dataSize: number,
    chunkSize: number,
    delayMs: number = 0
  ): Promise<number> => {
    return new Promise((resolve) => {
      mockServer = http.createServer((req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': dataSize.toString(),
        });

        let sent = 0;
        const sendChunk = () => {
          if (sent >= dataSize) {
            res.end();
            return;
          }

          const remaining = dataSize - sent;
          const toSend = Math.min(chunkSize, remaining);
          const chunk = Buffer.alloc(toSend, 'x');
          res.write(chunk);
          sent += toSend;

          if (delayMs > 0) {
            setTimeout(sendChunk, delayMs);
          } else {
            setImmediate(sendChunk);
          }
        };

        sendChunk();
      });

      mockServer.listen(0, () => {
        const address = mockServer.address();
        if (address && typeof address === 'object') {
          serverPort = address.port;
          resolve(serverPort);
        }
      });
    });
  };

  it('should log backpressure configuration on startup', async () => {
    // Create a simple mock server
    const dataSize = 150 * 1024 * 1024; // 150MB (1.5 parts)
    const chunkSize = 10 * 1024 * 1024; // 10MB chunks
    const port = await createMockServer(dataSize, chunkSize, 0);

    const consoleLogSpy = vi.spyOn(console, 'log');

    // Mock S3Service
    const mockS3Service = {
      validateBucketAccess: vi.fn().mockResolvedValue(true),
      createMultipartUpload: vi.fn().mockResolvedValue('test-upload-id'),
      uploadPart: vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'test-etag';
      }),
      completeUpload: vi.fn().mockResolvedValue('s3://test-bucket/test.zip'),
      abortUpload: vi.fn().mockResolvedValue(undefined),
    };

    (streamingService as any).s3Service = mockS3Service;

    const sourceUrl = `http://localhost:${port}/test.zip`;
    const result = await streamingService.transferToS3(
      sourceUrl,
      'test-bucket',
      undefined,
      undefined
    );

    expect(result.success).toBe(true);

    // Check that backpressure configuration was logged
    const configLogs = consoleLogSpy.mock.calls.filter(
      (call) => call[0]?.includes('Backpressure configuration:')
    );
    
    // We expect backpressure configuration to be logged
    expect(configLogs.length).toBeGreaterThan(0);
    
    // Verify configuration includes high-water mark, low-water mark, and max buffered memory
    const configLog = configLogs[0][0];
    expect(configLog).toContain('high-water mark');
    expect(configLog).toContain('low-water mark');
    expect(configLog).toContain('max buffered memory');

    consoleLogSpy.mockRestore();
  }, 60000);

  it('should track backpressure metrics even when not triggered', async () => {
    // Create a mock server
    const dataSize = 150 * 1024 * 1024; // 150MB
    const chunkSize = 10 * 1024 * 1024; // 10MB chunks
    const port = await createMockServer(dataSize, chunkSize, 0);

    const consoleLogSpy = vi.spyOn(console, 'log');

    // Mock S3Service with fast uploads (no backpressure expected)
    const mockS3Service = {
      validateBucketAccess: vi.fn().mockResolvedValue(true),
      createMultipartUpload: vi.fn().mockResolvedValue('test-upload-id'),
      uploadPart: vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'test-etag';
      }),
      completeUpload: vi.fn().mockResolvedValue('s3://test-bucket/test.zip'),
      abortUpload: vi.fn().mockResolvedValue(undefined),
    };

    (streamingService as any).s3Service = mockS3Service;

    const sourceUrl = `http://localhost:${port}/test.zip`;
    const result = await streamingService.transferToS3(
      sourceUrl,
      'test-bucket',
      undefined,
      undefined
    );

    expect(result.success).toBe(true);

    // Check that backpressure metrics were logged
    const metricsLogs = consoleLogSpy.mock.calls.filter(
      (call) => call[0]?.includes('Backpressure metrics:')
    );
    
    // We expect backpressure metrics to be logged even if not triggered
    expect(metricsLogs.length).toBeGreaterThan(0);

    consoleLogSpy.mockRestore();
  }, 60000);

  it('should track time spent in paused state', async () => {
    // Create a mock server
    const dataSize = 250 * 1024 * 1024; // 250MB
    const chunkSize = 10 * 1024 * 1024; // 10MB chunks
    const port = await createMockServer(dataSize, chunkSize);

    const consoleLogSpy = vi.spyOn(console, 'log');

    // Mock S3Service with slow uploads to force pauses
    const mockS3Service = {
      validateBucketAccess: vi.fn().mockResolvedValue(true),
      createMultipartUpload: vi.fn().mockResolvedValue('test-upload-id'),
      uploadPart: vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'test-etag';
      }),
      completeUpload: vi.fn().mockResolvedValue('s3://test-bucket/test.zip'),
      abortUpload: vi.fn().mockResolvedValue(undefined),
    };

    (streamingService as any).s3Service = mockS3Service;

    const sourceUrl = `http://localhost:${port}/test.zip`;
    const result = await streamingService.transferToS3(
      sourceUrl,
      'test-bucket',
      undefined,
      undefined
    );

    expect(result.success).toBe(true);

    // Check that backpressure metrics were logged
    const metricsLogs = consoleLogSpy.mock.calls.filter(
      (call) => call[0]?.includes('Backpressure metrics:')
    );
    
    expect(metricsLogs.length).toBeGreaterThan(0);

    // Check that total paused time was logged
    const pausedTimeLogs = consoleLogSpy.mock.calls.filter(
      (call) => call[0]?.includes('Total time paused:')
    );
    
    expect(pausedTimeLogs.length).toBeGreaterThan(0);

    consoleLogSpy.mockRestore();
  }, 30000);

  it('should report backpressure efficiency metrics', async () => {
    // Create a mock server
    const dataSize = 150 * 1024 * 1024; // 150MB
    const chunkSize = 10 * 1024 * 1024; // 10MB chunks
    const port = await createMockServer(dataSize, chunkSize, 0);

    const consoleLogSpy = vi.spyOn(console, 'log');

    // Mock S3Service
    const mockS3Service = {
      validateBucketAccess: vi.fn().mockResolvedValue(true),
      createMultipartUpload: vi.fn().mockResolvedValue('test-upload-id'),
      uploadPart: vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'test-etag';
      }),
      completeUpload: vi.fn().mockResolvedValue('s3://test-bucket/test.zip'),
      abortUpload: vi.fn().mockResolvedValue(undefined),
    };

    (streamingService as any).s3Service = mockS3Service;

    const sourceUrl = `http://localhost:${port}/test.zip`;
    const result = await streamingService.transferToS3(
      sourceUrl,
      'test-bucket',
      undefined,
      undefined
    );

    expect(result.success).toBe(true);

    // Check that backpressure efficiency was logged
    const efficiencyLogs = consoleLogSpy.mock.calls.filter(
      (call) => call[0]?.includes('Backpressure efficiency:')
    );
    
    // We expect efficiency metrics to be logged
    expect(efficiencyLogs.length).toBeGreaterThan(0);
    
    // Verify efficiency is reported as a percentage
    const efficiencyLog = efficiencyLogs[0][0];
    expect(efficiencyLog).toMatch(/\d+(\.\d+)?% active time/);

    consoleLogSpy.mockRestore();
  }, 60000);

  it('should handle slow S3 uploads without source server timeouts', async () => {
    // Create a mock server that sends data quickly
    const dataSize = 200 * 1024 * 1024; // 200MB
    const chunkSize = 20 * 1024 * 1024; // 20MB chunks (fast)
    const port = await createMockServer(dataSize, chunkSize);

    // Mock S3Service with very slow uploads
    const mockS3Service = {
      validateBucketAccess: vi.fn().mockResolvedValue(true),
      createMultipartUpload: vi.fn().mockResolvedValue('test-upload-id'),
      uploadPart: vi.fn().mockImplementation(async () => {
        // Simulate very slow S3 upload (500ms per part)
        await new Promise(resolve => setTimeout(resolve, 500));
        return 'test-etag';
      }),
      completeUpload: vi.fn().mockResolvedValue('s3://test-bucket/test.zip'),
      abortUpload: vi.fn().mockResolvedValue(undefined),
    };

    (streamingService as any).s3Service = mockS3Service;

    const sourceUrl = `http://localhost:${port}/test.zip`;
    
    // This should complete without timing out on the source server
    const result = await streamingService.transferToS3(
      sourceUrl,
      'test-bucket',
      undefined,
      undefined
    );

    expect(result.success).toBe(true);
    expect(result.bytesTransferred).toBe(dataSize);
  }, 60000);

  it('should work correctly with varying network conditions', async () => {
    // Create a mock server with variable chunk delays
    const dataSize = 150 * 1024 * 1024; // 150MB
    const chunkSize = 5 * 1024 * 1024; // 5MB chunks
    const port = await createMockServer(dataSize, chunkSize, 10); // 10ms delay between chunks

    // Mock S3Service with variable upload times
    let uploadCount = 0;
    const mockS3Service = {
      validateBucketAccess: vi.fn().mockResolvedValue(true),
      createMultipartUpload: vi.fn().mockResolvedValue('test-upload-id'),
      uploadPart: vi.fn().mockImplementation(async () => {
        // Alternate between fast and slow uploads
        const delay = uploadCount % 2 === 0 ? 50 : 200;
        uploadCount++;
        await new Promise(resolve => setTimeout(resolve, delay));
        return 'test-etag';
      }),
      completeUpload: vi.fn().mockResolvedValue('s3://test-bucket/test.zip'),
      abortUpload: vi.fn().mockResolvedValue(undefined),
    };

    (streamingService as any).s3Service = mockS3Service;

    const sourceUrl = `http://localhost:${port}/test.zip`;
    const result = await streamingService.transferToS3(
      sourceUrl,
      'test-bucket',
      undefined,
      undefined
    );

    expect(result.success).toBe(true);
    expect(result.bytesTransferred).toBe(dataSize);
  }, 60000);
});
