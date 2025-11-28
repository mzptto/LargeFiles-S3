import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StreamingService } from './StreamingService.js';
import { S3Service } from './S3Service.js';
import { createHash } from 'crypto';
import { createServer, Server } from 'http';
import { Readable } from 'stream';

/**
 * Buffer Handling Tests
 * Tests the optimized buffer handling in StreamingService
 * Validates data integrity with various file sizes
 * Requirements: Performance optimization, data integrity validation
 * 
 * NOTE: Integration tests that upload to S3 require a valid TEST_BUCKET environment variable.
 * Unit tests that validate buffer configuration run without AWS resources.
 */
describe('Buffer Handling Tests', () => {
  let mockServer: Server;
  let serverPort: number;
  const TEST_BUCKET = process.env.TEST_BUCKET;
  const SKIP_INTEGRATION = !TEST_BUCKET;
  
  beforeAll(async () => {
    // Start mock HTTP server for testing
    mockServer = createServer((req, res) => {
      const url = req.url || '';
      
      if (url.startsWith('/small-file.zip')) {
        // 50MB file (smaller than part size)
        const size = 50 * 1024 * 1024;
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': size.toString(),
        });
        
        // Generate deterministic data for checksum validation
        const chunkSize = 1024 * 1024; // 1MB chunks
        let sent = 0;
        const sendChunk = () => {
          if (sent >= size) {
            res.end();
            return;
          }
          const remaining = size - sent;
          const toSend = Math.min(chunkSize, remaining);
          const buffer = Buffer.alloc(toSend, sent % 256);
          res.write(buffer);
          sent += toSend;
          setImmediate(sendChunk);
        };
        sendChunk();
      } else if (url.startsWith('/exact-boundary.zip')) {
        // Exactly 100MB (one part size)
        const size = 100 * 1024 * 1024;
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': size.toString(),
        });
        
        const chunkSize = 1024 * 1024;
        let sent = 0;
        const sendChunk = () => {
          if (sent >= size) {
            res.end();
            return;
          }
          const remaining = size - sent;
          const toSend = Math.min(chunkSize, remaining);
          const buffer = Buffer.alloc(toSend, sent % 256);
          res.write(buffer);
          sent += toSend;
          setImmediate(sendChunk);
        };
        sendChunk();
      } else if (url.startsWith('/large-file.zip')) {
        // 250MB file (multiple parts)
        const size = 250 * 1024 * 1024;
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': size.toString(),
        });
        
        const chunkSize = 1024 * 1024;
        let sent = 0;
        const sendChunk = () => {
          if (sent >= size) {
            res.end();
            return;
          }
          const remaining = size - sent;
          const toSend = Math.min(chunkSize, remaining);
          const buffer = Buffer.alloc(toSend, sent % 256);
          res.write(buffer);
          sent += toSend;
          setImmediate(sendChunk);
        };
        sendChunk();
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    
    await new Promise<void>((resolve) => {
      mockServer.listen(0, () => {
        const address = mockServer.address();
        if (address && typeof address === 'object') {
          serverPort = address.port;
        }
        resolve();
      });
    });
  });
  
  afterAll(async () => {
    await new Promise<void>((resolve) => {
      mockServer.close(() => resolve());
    });
  });

  /**
   * Helper function to calculate checksum of data from URL
   */
  async function calculateUrlChecksum(url: string): Promise<string> {
    const hash = createHash('md5');
    const axios = (await import('axios')).default;
    const response = await axios.get(url, { responseType: 'stream' });
    const stream: Readable = response.data;
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Helper function to calculate checksum of S3 object
   */
  async function calculateS3Checksum(bucket: string, key: string): Promise<string> {
    const s3Service = new S3Service();
    const hash = createHash('md5');
    
    // Download from S3 and calculate checksum
    const { GetObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
    const client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await client.send(command);
    
    if (!response.Body) {
      throw new Error('No body in S3 response');
    }
    
    const stream = response.Body as Readable;
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  it('should handle files smaller than part size without data loss', async () => {
    if (SKIP_INTEGRATION) {
      console.log('Skipping integration test - TEST_BUCKET not set');
      return;
    }
    
    const streamingService = new StreamingService();
    const sourceUrl = `http://localhost:${serverPort}/small-file.zip`;
    const key = `buffer-test-small-${Date.now()}.zip`;
    
    // Calculate source checksum
    const sourceChecksum = await calculateUrlChecksum(sourceUrl);
    console.log(`Source checksum (50MB): ${sourceChecksum}`);
    
    // Transfer file
    const result = await streamingService.transferToS3(sourceUrl, TEST_BUCKET!);
    
    expect(result.success).toBe(true);
    expect(result.bytesTransferred).toBe(50 * 1024 * 1024);
    
    // Extract the actual key from the result
    const actualKey = result.s3Location?.split('/').pop() || key;
    
    // Calculate destination checksum
    const destChecksum = await calculateS3Checksum(TEST_BUCKET!, actualKey);
    console.log(`Destination checksum (50MB): ${destChecksum}`);
    
    // Verify data integrity
    expect(destChecksum).toBe(sourceChecksum);
  }, 120000); // 2 minute timeout

  it('should handle files exactly at part size boundary', async () => {
    if (SKIP_INTEGRATION) {
      console.log('Skipping integration test - TEST_BUCKET not set');
      return;
    }
    
    const streamingService = new StreamingService();
    const sourceUrl = `http://localhost:${serverPort}/exact-boundary.zip`;
    const key = `buffer-test-boundary-${Date.now()}.zip`;
    
    // Calculate source checksum
    const sourceChecksum = await calculateUrlChecksum(sourceUrl);
    console.log(`Source checksum (100MB): ${sourceChecksum}`);
    
    // Transfer file
    const result = await streamingService.transferToS3(sourceUrl, TEST_BUCKET!);
    
    expect(result.success).toBe(true);
    expect(result.bytesTransferred).toBe(100 * 1024 * 1024);
    
    // Extract the actual key from the result
    const actualKey = result.s3Location?.split('/').pop() || key;
    
    // Calculate destination checksum
    const destChecksum = await calculateS3Checksum(TEST_BUCKET!, actualKey);
    console.log(`Destination checksum (100MB): ${destChecksum}`);
    
    // Verify data integrity
    expect(destChecksum).toBe(sourceChecksum);
  }, 180000); // 3 minute timeout

  it('should handle large files with multiple parts', async () => {
    if (SKIP_INTEGRATION) {
      console.log('Skipping integration test - TEST_BUCKET not set');
      return;
    }
    
    const streamingService = new StreamingService();
    const sourceUrl = `http://localhost:${serverPort}/large-file.zip`;
    const key = `buffer-test-large-${Date.now()}.zip`;
    
    // Calculate source checksum
    const sourceChecksum = await calculateUrlChecksum(sourceUrl);
    console.log(`Source checksum (250MB): ${sourceChecksum}`);
    
    // Transfer file
    const result = await streamingService.transferToS3(sourceUrl, TEST_BUCKET!);
    
    expect(result.success).toBe(true);
    expect(result.bytesTransferred).toBe(250 * 1024 * 1024);
    
    // Extract the actual key from the result
    const actualKey = result.s3Location?.split('/').pop() || key;
    
    // Calculate destination checksum
    const destChecksum = await calculateS3Checksum(TEST_BUCKET!, actualKey);
    console.log(`Destination checksum (250MB): ${destChecksum}`);
    
    // Verify data integrity
    expect(destChecksum).toBe(sourceChecksum);
  }, 300000); // 5 minute timeout

  it('should validate buffer size configuration on initialization', () => {
    // This should not throw
    expect(() => new StreamingService()).not.toThrow();
  });
});
