import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestServer, MockHttpServer } from './mockHttpServer.js';
import { StreamingService } from '../services/StreamingService.js';
import { S3Service } from '../services/S3Service.js';
import { ProgressStore } from '../services/ProgressStore.js';
import testConfig from '../../test-config.json';

/**
 * Integration tests for complete flow from source URL to S3
 * Requirements: 3.1, 3.2, 4.2, 8.1
 * 
 * These tests verify:
 * - Complete transfer flow from HTTP source to S3
 * - Various file sizes (small, medium, large)
 * - Error scenarios (invalid URL, no permissions)
 * - Progress reporting accuracy
 * 
 * SETUP REQUIRED:
 * These tests require a real S3 bucket to be configured. Before running:
 * 1. Deploy the CDK stack: cd infrastructure && cdk deploy
 * 2. Update backend/test-config.json with the actual test bucket name
 * 3. Ensure AWS credentials are configured: aws configure
 * 
 * See backend/INTEGRATION_TESTING.md for detailed setup instructions.
 * 
 * To skip these tests during development, use: npm test -- --exclude integration.test.ts
 */
describe('Integration Tests - End-to-End Transfer', () => {
  let mockServer: MockHttpServer;
  let baseUrl: string;
  let streamingService: StreamingService;
  let s3Service: S3Service;
  let progressStore: ProgressStore;

  beforeAll(async () => {
    // Start mock HTTP server
    mockServer = await createTestServer();
    baseUrl = mockServer.getBaseUrl();
    
    // Initialize services
    streamingService = new StreamingService();
    s3Service = new S3Service();
    progressStore = ProgressStore.getInstance();
    
    console.log(`Mock server started at ${baseUrl}`);
    console.log(`Using test bucket: ${testConfig.testBucket}`);
  });

  afterAll(async () => {
    // Stop mock server
    await mockServer.stop();
  });

  beforeEach(() => {
    // Clean up old progress records before each test
    progressStore.cleanup();
  });

  /**
   * Test complete flow from frontend to S3 with small file
   * Requirements: 3.1, 3.2
   */
  it('should transfer small file from HTTP to S3', async () => {
    const sourceUrl = `${baseUrl}/test-small.zip`;
    const bucket = testConfig.testBucket;
    const expectedFilename = 'test-small.zip';

    const progressUpdates: Array<{ bytes: number; total: number }> = [];

    const result = await streamingService.transferToS3(
      sourceUrl,
      bucket,
      undefined,
      (bytes, total) => {
        progressUpdates.push({ bytes, total });
      }
    );

    // Verify transfer succeeded
    expect(result.success).toBe(true);
    expect(result.bytesTransferred).toBe(100 * 1024); // 100KB
    expect(result.s3Location).toBe(`s3://${bucket}/${expectedFilename}`);
    expect(result.transferId).toBeDefined();

    // Verify progress updates were received
    expect(progressUpdates.length).toBeGreaterThan(0);
    
    // Verify final progress update shows completion
    const finalProgress = progressUpdates[progressUpdates.length - 1];
    expect(finalProgress.bytes).toBe(100 * 1024);
    expect(finalProgress.total).toBe(100 * 1024);

    // Verify progress store has correct final state
    if (result.transferId) {
      const progress = progressStore.getProgress(result.transferId);
      expect(progress).toBeDefined();
      expect(progress?.status).toBe('completed');
      expect(progress?.percentage).toBe(100);
      expect(progress?.s3Location).toBe(result.s3Location);
    }
  }, 30000); // 30 second timeout

  /**
   * Test complete flow with medium file
   * Requirements: 3.1, 3.2, 8.1
   */
  it('should transfer medium file from HTTP to S3', async () => {
    const sourceUrl = `${baseUrl}/test-medium.zip`;
    const bucket = testConfig.testBucket;
    const expectedFilename = 'test-medium.zip';

    const progressUpdates: Array<{ bytes: number; total: number }> = [];

    const result = await streamingService.transferToS3(
      sourceUrl,
      bucket,
      undefined,
      (bytes, total) => {
        progressUpdates.push({ bytes, total });
      }
    );

    // Verify transfer succeeded
    expect(result.success).toBe(true);
    expect(result.bytesTransferred).toBe(10 * 1024 * 1024); // 10MB
    expect(result.s3Location).toBe(`s3://${bucket}/${expectedFilename}`);

    // Verify progress updates were received
    expect(progressUpdates.length).toBeGreaterThan(0);
    
    // Verify progress reporting accuracy - should have multiple updates
    expect(progressUpdates.length).toBeGreaterThan(5);
    
    // Verify progress is monotonically increasing
    for (let i = 1; i < progressUpdates.length; i++) {
      expect(progressUpdates[i].bytes).toBeGreaterThanOrEqual(progressUpdates[i - 1].bytes);
    }
  }, 60000); // 60 second timeout

  /**
   * Test complete flow with large file (tests multipart upload)
   * Requirements: 3.1, 3.2, 8.1
   */
  it('should transfer large file from HTTP to S3 using multipart upload', async () => {
    const sourceUrl = `${baseUrl}/test-large.zip`;
    const bucket = testConfig.testBucket;
    const expectedFilename = 'test-large.zip';

    const progressUpdates: Array<{ bytes: number; total: number; percentage: number }> = [];

    const result = await streamingService.transferToS3(
      sourceUrl,
      bucket,
      undefined,
      (bytes, total) => {
        const percentage = total > 0 ? (bytes / total) * 100 : 0;
        progressUpdates.push({ bytes, total, percentage });
      }
    );

    // Verify transfer succeeded
    expect(result.success).toBe(true);
    expect(result.bytesTransferred).toBe(100 * 1024 * 1024); // 100MB
    expect(result.s3Location).toBe(`s3://${bucket}/${expectedFilename}`);

    // Verify progress updates were received
    expect(progressUpdates.length).toBeGreaterThan(0);
    
    // Verify progress reporting accuracy for large file
    // Should have many updates for 100MB file
    expect(progressUpdates.length).toBeGreaterThan(10);
    
    // Verify final progress shows 100%
    const finalProgress = progressUpdates[progressUpdates.length - 1];
    expect(finalProgress.percentage).toBeCloseTo(100, 0);
  }, 120000); // 120 second timeout for large file

  /**
   * Test error scenario: invalid URL (404)
   * Requirements: 3.4
   */
  it('should handle 404 error gracefully', async () => {
    const sourceUrl = `${baseUrl}/not-found.zip`;
    const bucket = testConfig.testBucket;
    const key = `integration-test-404-${Date.now()}.zip`;

    const result = await streamingService.transferToS3(
      sourceUrl,
      bucket,
      undefined,
      () => {}
    );

    // Verify transfer failed
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('404');

    // Verify progress store shows failure
    if (result.transferId) {
      const progress = progressStore.getProgress(result.transferId);
      expect(progress).toBeDefined();
      expect(progress?.status).toBe('failed');
      expect(progress?.error).toBeDefined();
    }
  }, 30000);

  /**
   * Test error scenario: forbidden (403)
   * Requirements: 3.4
   */
  it('should handle 403 error gracefully', async () => {
    const sourceUrl = `${baseUrl}/forbidden.zip`;
    const bucket = testConfig.testBucket;
    const key = `integration-test-403-${Date.now()}.zip`;

    const result = await streamingService.transferToS3(
      sourceUrl,
      bucket,
      undefined,
      () => {}
    );

    // Verify transfer failed
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('403');

    // Verify progress store shows failure
    if (result.transferId) {
      const progress = progressStore.getProgress(result.transferId);
      expect(progress).toBeDefined();
      expect(progress?.status).toBe('failed');
    }
  }, 30000);

  /**
   * Test error scenario: invalid bucket (no permissions)
   * Requirements: 3.5, 6.2
   */
  it('should handle S3 permission errors gracefully', async () => {
    const sourceUrl = `${baseUrl}/test-small.zip`;
    const invalidBucket = 'nonexistent-bucket-' + Date.now();
    const key = `integration-test-permissions-${Date.now()}.zip`;

    const result = await streamingService.transferToS3(
      sourceUrl,
      invalidBucket,
      undefined,
      () => {}
    );

    // Verify transfer failed
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    
    // Error should indicate bucket access issue
    const errorMessage = result.error?.message.toLowerCase() || '';
    expect(
      errorMessage.includes('bucket') || 
      errorMessage.includes('not found') ||
      errorMessage.includes('access denied') ||
      errorMessage.includes('does not exist')
    ).toBe(true);

    // Verify progress store shows failure
    if (result.transferId) {
      const progress = progressStore.getProgress(result.transferId);
      expect(progress).toBeDefined();
      expect(progress?.status).toBe('failed');
    }
  }, 30000);

  /**
   * Test progress reporting accuracy
   * Requirements: 4.2
   */
  it('should report accurate progress during transfer', async () => {
    const sourceUrl = `${baseUrl}/test-medium.zip`;
    const bucket = testConfig.testBucket;
    const key = `integration-test-progress-${Date.now()}.zip`;

    const progressUpdates: Array<{ bytes: number; total: number; percentage: number }> = [];
    const expectedTotal = 10 * 1024 * 1024; // 10MB

    const result = await streamingService.transferToS3(
      sourceUrl,
      bucket,
      undefined,
      (bytes, total) => {
        const percentage = total > 0 ? (bytes / total) * 100 : 0;
        progressUpdates.push({ bytes, total, percentage });
      }
    );

    // Verify transfer succeeded
    expect(result.success).toBe(true);

    // Verify progress updates
    expect(progressUpdates.length).toBeGreaterThan(0);

    // Verify all progress updates have correct total
    progressUpdates.forEach(update => {
      expect(update.total).toBe(expectedTotal);
    });

    // Verify progress is monotonically increasing
    for (let i = 1; i < progressUpdates.length; i++) {
      expect(progressUpdates[i].bytes).toBeGreaterThanOrEqual(progressUpdates[i - 1].bytes);
      expect(progressUpdates[i].percentage).toBeGreaterThanOrEqual(progressUpdates[i - 1].percentage);
    }

    // Verify final progress is 100%
    const finalProgress = progressUpdates[progressUpdates.length - 1];
    expect(finalProgress.bytes).toBe(expectedTotal);
    expect(finalProgress.percentage).toBeCloseTo(100, 0);

    // Verify progress store accuracy
    if (result.transferId) {
      const progress = progressStore.getProgress(result.transferId);
      expect(progress).toBeDefined();
      expect(progress?.bytesTransferred).toBe(expectedTotal);
      expect(progress?.totalBytes).toBe(expectedTotal);
      expect(progress?.percentage).toBe(100);
    }
  }, 60000);

  /**
   * Test key prefix handling in integration
   * Requirements: 2.5
   */
  it('should correctly apply key prefix during transfer', async () => {
    const sourceUrl = `${baseUrl}/test-small.zip`;
    const bucket = testConfig.testBucket;
    const keyPrefix = 'test-folder/subfolder';
    const expectedFilename = 'test-small.zip';

    const result = await streamingService.transferToS3(
      sourceUrl,
      bucket,
      keyPrefix,
      () => {}
    );

    // Verify transfer succeeded
    expect(result.success).toBe(true);
    
    // Verify S3 location includes prefix
    expect(result.s3Location).toContain(keyPrefix);
    expect(result.s3Location).toContain(expectedFilename);
    expect(result.s3Location).toBe(`s3://${bucket}/${keyPrefix}/${expectedFilename}`);
  }, 30000);

  /**
   * Test streaming behavior (memory efficiency)
   * Requirements: 8.1
   */
  it('should use streaming without loading entire file into memory', async () => {
    const sourceUrl = `${baseUrl}/test-large.zip`;
    const bucket = testConfig.testBucket;
    const key = `integration-test-streaming-${Date.now()}.zip`;

    // Measure memory before transfer
    const memBefore = process.memoryUsage().heapUsed;

    const result = await streamingService.transferToS3(
      sourceUrl,
      bucket,
      undefined,
      () => {}
    );

    // Measure memory after transfer
    const memAfter = process.memoryUsage().heapUsed;
    const memIncrease = memAfter - memBefore;

    // Verify transfer succeeded
    expect(result.success).toBe(true);
    expect(result.bytesTransferred).toBe(100 * 1024 * 1024); // 100MB

    // Memory increase should be much less than file size (streaming)
    // Allow up to 50MB memory increase for 100MB file (should be much less in practice)
    const maxAllowedMemoryIncrease = 50 * 1024 * 1024;
    expect(memIncrease).toBeLessThan(maxAllowedMemoryIncrease);

    console.log(`Memory increase: ${(memIncrease / 1024 / 1024).toFixed(2)}MB for 100MB file`);
  }, 120000);

  /**
   * Test multiple concurrent transfers
   * Requirements: 3.1, 3.2, 4.2
   */
  it('should handle multiple concurrent transfers', async () => {
    const bucket = testConfig.testBucket;

    // Start 3 transfers concurrently
    const transfers = [
      streamingService.transferToS3(
        `${baseUrl}/test-small.zip`,
        bucket,
        `concurrent-1`,
        () => {}
      ),
      streamingService.transferToS3(
        `${baseUrl}/test-small.zip`,
        bucket,
        `concurrent-2`,
        () => {}
      ),
      streamingService.transferToS3(
        `${baseUrl}/test-small.zip`,
        bucket,
        `concurrent-3`,
        () => {}
      ),
    ];

    const results = await Promise.all(transfers);

    // Verify all transfers succeeded
    results.forEach((result, index) => {
      expect(result.success).toBe(true);
      expect(result.bytesTransferred).toBe(100 * 1024);
      expect(result.transferId).toBeDefined();
      
      // Verify each has unique transfer ID
      if (index > 0) {
        expect(result.transferId).not.toBe(results[index - 1].transferId);
      }
    });

    // Verify all progress records exist
    results.forEach(result => {
      if (result.transferId) {
        const progress = progressStore.getProgress(result.transferId);
        expect(progress).toBeDefined();
        expect(progress?.status).toBe('completed');
      }
    });
  }, 60000);
});
