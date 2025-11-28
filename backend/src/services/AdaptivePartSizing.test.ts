import { describe, it, expect, beforeEach } from 'vitest';
import { StreamingService } from './StreamingService.js';

/**
 * Tests for adaptive part sizing functionality
 * Requirements: Memory management, performance validation
 * 
 * Validates that:
 * - Files <10GB use 100MB parts
 * - Files 10-100GB use 250MB parts
 * - Files >100GB use 500MB parts
 * - Part size stays within S3 limits (5MB-5GB)
 * - Total parts stay under 10,000 limit
 */
describe('StreamingService - Adaptive Part Sizing', () => {
  let streamingService: StreamingService;

  beforeEach(() => {
    streamingService = new StreamingService();
  });

  /**
   * Helper to access private calculateOptimalPartSize method via reflection
   */
  const calculateOptimalPartSize = (fileSize: number): number => {
    // Access private method using type assertion
    return (streamingService as any).calculateOptimalPartSize(fileSize);
  };

  describe('Small files (<10GB)', () => {
    it('should use 100MB parts for 5GB file', () => {
      const fileSize = 5 * 1024 * 1024 * 1024; // 5GB
      const partSize = calculateOptimalPartSize(fileSize);
      const expectedPartSize = 100 * 1024 * 1024; // 100MB
      
      expect(partSize).toBe(expectedPartSize);
      
      // Verify part count is reasonable
      const partCount = Math.ceil(fileSize / partSize);
      expect(partCount).toBeLessThanOrEqual(10000);
      expect(partCount).toBeGreaterThan(0);
    });

    it('should use 100MB parts for 1GB file', () => {
      const fileSize = 1 * 1024 * 1024 * 1024; // 1GB
      const partSize = calculateOptimalPartSize(fileSize);
      const expectedPartSize = 100 * 1024 * 1024; // 100MB
      
      expect(partSize).toBe(expectedPartSize);
    });

    it('should use 100MB parts for 9.9GB file (just under threshold)', () => {
      const fileSize = 9.9 * 1024 * 1024 * 1024; // 9.9GB
      const partSize = calculateOptimalPartSize(fileSize);
      const expectedPartSize = 100 * 1024 * 1024; // 100MB
      
      expect(partSize).toBe(expectedPartSize);
    });
  });

  describe('Medium files (10-100GB)', () => {
    it('should use 250MB parts for 50GB file', () => {
      const fileSize = 50 * 1024 * 1024 * 1024; // 50GB
      const partSize = calculateOptimalPartSize(fileSize);
      const expectedPartSize = 250 * 1024 * 1024; // 250MB
      
      expect(partSize).toBe(expectedPartSize);
      
      // Verify part count is reasonable
      const partCount = Math.ceil(fileSize / partSize);
      expect(partCount).toBeLessThanOrEqual(10000);
      expect(partCount).toBeGreaterThan(0);
    });

    it('should use 250MB parts for 10GB file (at threshold)', () => {
      const fileSize = 10 * 1024 * 1024 * 1024; // 10GB
      const partSize = calculateOptimalPartSize(fileSize);
      const expectedPartSize = 250 * 1024 * 1024; // 250MB
      
      expect(partSize).toBe(expectedPartSize);
    });

    it('should use 250MB parts for 99GB file (just under threshold)', () => {
      const fileSize = 99 * 1024 * 1024 * 1024; // 99GB
      const partSize = calculateOptimalPartSize(fileSize);
      const expectedPartSize = 250 * 1024 * 1024; // 250MB
      
      expect(partSize).toBe(expectedPartSize);
    });
  });

  describe('Large files (>100GB)', () => {
    it('should use 500MB parts for 200GB file', () => {
      const fileSize = 200 * 1024 * 1024 * 1024; // 200GB
      const partSize = calculateOptimalPartSize(fileSize);
      const expectedPartSize = 500 * 1024 * 1024; // 500MB
      
      expect(partSize).toBe(expectedPartSize);
      
      // Verify part count is reasonable
      const partCount = Math.ceil(fileSize / partSize);
      expect(partCount).toBeLessThanOrEqual(10000);
      expect(partCount).toBeGreaterThan(0);
    });

    it('should use 500MB parts for 100GB file (at threshold)', () => {
      const fileSize = 100 * 1024 * 1024 * 1024; // 100GB
      const partSize = calculateOptimalPartSize(fileSize);
      const expectedPartSize = 500 * 1024 * 1024; // 500MB
      
      expect(partSize).toBe(expectedPartSize);
    });

    it('should use 500MB parts for 1TB file', () => {
      const fileSize = 1 * 1024 * 1024 * 1024 * 1024; // 1TB
      const partSize = calculateOptimalPartSize(fileSize);
      const expectedPartSize = 500 * 1024 * 1024; // 500MB
      
      expect(partSize).toBe(expectedPartSize);
      
      // Verify part count is reasonable
      const partCount = Math.ceil(fileSize / partSize);
      expect(partCount).toBeLessThanOrEqual(10000);
    });
  });

  describe('S3 Constraints', () => {
    it('should respect minimum part size (5MB)', () => {
      const fileSize = 10 * 1024 * 1024; // 10MB (very small file)
      const partSize = calculateOptimalPartSize(fileSize);
      const minPartSize = 5 * 1024 * 1024; // 5MB
      
      expect(partSize).toBeGreaterThanOrEqual(minPartSize);
    });

    it('should respect maximum part size (5GB)', () => {
      const fileSize = 10 * 1024 * 1024 * 1024 * 1024; // 10TB (maximum supported)
      const partSize = calculateOptimalPartSize(fileSize);
      const maxPartSize = 5 * 1024 * 1024 * 1024; // 5GB
      
      expect(partSize).toBeLessThanOrEqual(maxPartSize);
    });

    it('should ensure total parts stay under 10,000 limit', () => {
      const fileSize = 10 * 1024 * 1024 * 1024 * 1024; // 10TB
      const partSize = calculateOptimalPartSize(fileSize);
      const partCount = Math.ceil(fileSize / partSize);
      
      expect(partCount).toBeLessThanOrEqual(10000);
    });

    it('should adjust part size to stay under 10,000 parts for very large files', () => {
      // File size that would exceed 10,000 parts with 500MB parts
      const fileSize = 6 * 1024 * 1024 * 1024 * 1024; // 6TB
      const partSize = calculateOptimalPartSize(fileSize);
      const partCount = Math.ceil(fileSize / partSize);
      
      expect(partCount).toBeLessThanOrEqual(10000);
      // Part size should be larger than 500MB to accommodate the constraint
      expect(partSize).toBeGreaterThanOrEqual(500 * 1024 * 1024);
    });
  });

  describe('Edge Cases', () => {
    it('should handle file exactly at 10GB threshold', () => {
      const fileSize = 10 * 1024 * 1024 * 1024; // Exactly 10GB
      const partSize = calculateOptimalPartSize(fileSize);
      const expectedPartSize = 250 * 1024 * 1024; // Should use medium file size
      
      expect(partSize).toBe(expectedPartSize);
    });

    it('should handle file exactly at 100GB threshold', () => {
      const fileSize = 100 * 1024 * 1024 * 1024; // Exactly 100GB
      const partSize = calculateOptimalPartSize(fileSize);
      const expectedPartSize = 500 * 1024 * 1024; // Should use large file size
      
      expect(partSize).toBe(expectedPartSize);
    });

    it('should throw error for files exceeding S3 multipart upload limits', () => {
      // File size that exceeds max parts * max part size
      const maxParts = 10000;
      const maxPartSize = 5 * 1024 * 1024 * 1024; // 5GB
      const fileSize = maxParts * maxPartSize + 1; // Just over the limit
      
      expect(() => calculateOptimalPartSize(fileSize)).toThrow();
    });
  });

  describe('Memory Constraints', () => {
    it('should allocate buffers based on calculated part size for small files', () => {
      const fileSize = 5 * 1024 * 1024 * 1024; // 5GB
      const partSize = calculateOptimalPartSize(fileSize);
      
      // Verify we can allocate a buffer of this size
      expect(() => Buffer.allocUnsafe(partSize)).not.toThrow();
    });

    it('should allocate buffers based on calculated part size for medium files', () => {
      const fileSize = 50 * 1024 * 1024 * 1024; // 50GB
      const partSize = calculateOptimalPartSize(fileSize);
      
      // Verify we can allocate a buffer of this size
      expect(() => Buffer.allocUnsafe(partSize)).not.toThrow();
    });

    it('should allocate buffers based on calculated part size for large files', () => {
      const fileSize = 200 * 1024 * 1024 * 1024; // 200GB
      const partSize = calculateOptimalPartSize(fileSize);
      
      // Verify we can allocate a buffer of this size
      expect(() => Buffer.allocUnsafe(partSize)).not.toThrow();
    });
  });
});
