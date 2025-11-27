import { describe, it, expect } from 'vitest';
import { ValidationService } from './ValidationService.js';

describe('ValidationService', () => {
  describe('Input Sanitization', () => {
    it('should trim whitespace from input', () => {
      const result = ValidationService.sanitizeInput('  test  ');
      expect(result).toBe('test');
    });

    it('should remove null bytes', () => {
      const result = ValidationService.sanitizeInput('test\0value');
      expect(result).toBe('testvalue');
    });

    it('should remove control characters', () => {
      const result = ValidationService.sanitizeInput('test\x01\x02value');
      expect(result).toBe('testvalue');
    });

    it('should normalize multiple spaces to single space', () => {
      const result = ValidationService.sanitizeInput('test    value');
      expect(result).toBe('test value');
    });

    it('should handle empty string', () => {
      const result = ValidationService.sanitizeInput('');
      expect(result).toBe('');
    });

    it('should handle normal input without changes', () => {
      const result = ValidationService.sanitizeInput('https://example.com/file.zip');
      expect(result).toBe('https://example.com/file.zip');
    });
  });

  describe('URL Validation', () => {
    it('should accept valid HTTPS URL with .zip extension', () => {
      const result = ValidationService.validateUrl('https://example.com/file.zip');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject HTTP URLs', () => {
      const result = ValidationService.validateUrl('http://example.com/file.zip');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('HTTPS');
    });

    it('should reject URLs without .zip extension', () => {
      const result = ValidationService.validateUrl('https://example.com/file.txt');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('.zip');
    });

    it('should reject invalid URL format', () => {
      const result = ValidationService.validateUrl('not-a-url');
      expect(result.isValid).toBe(false);
    });

    it('should sanitize URL input before validation', () => {
      const result = ValidationService.validateUrl('  https://example.com/file.zip  ');
      expect(result.isValid).toBe(true);
    });

    it('should reject empty URL after sanitization', () => {
      const result = ValidationService.validateUrl('   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  describe('S3 Bucket Name Validation', () => {
    it('should accept valid bucket names', () => {
      const validNames = ['my-bucket', 'test.bucket.123', 'bucket-name-123'];
      validNames.forEach(name => {
        const result = ValidationService.validateBucketName(name);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject bucket names that are too short', () => {
      const result = ValidationService.validateBucketName('ab');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('3 and 63 characters');
    });

    it('should reject bucket names that are too long', () => {
      const result = ValidationService.validateBucketName('a'.repeat(64));
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('3 and 63 characters');
    });

    it('should reject bucket names with uppercase letters', () => {
      const result = ValidationService.validateBucketName('MyBucket');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('lowercase');
    });

    it('should reject bucket names with underscores', () => {
      const result = ValidationService.validateBucketName('my_bucket');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('lowercase letters, numbers, dots, and hyphens');
    });

    it('should reject bucket names with adjacent periods', () => {
      const result = ValidationService.validateBucketName('my..bucket');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('adjacent periods');
    });

    it('should reject bucket names formatted as IP addresses', () => {
      const result = ValidationService.validateBucketName('192.168.1.1');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('IP address');
    });

    it('should reject bucket names starting with xn--', () => {
      const result = ValidationService.validateBucketName('xn--bucket');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('xn--');
    });

    it('should reject bucket names ending with -s3alias', () => {
      const result = ValidationService.validateBucketName('mybucket-s3alias');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('-s3alias');
    });

    it('should sanitize bucket name input before validation', () => {
      const result = ValidationService.validateBucketName('  my-bucket  ');
      expect(result.isValid).toBe(true);
    });

    it('should reject empty bucket name after sanitization', () => {
      const result = ValidationService.validateBucketName('   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  describe('Key Prefix Validation', () => {
    it('should accept empty prefix', () => {
      const result = ValidationService.validateKeyPrefix('');
      expect(result.isValid).toBe(true);
    });

    it('should accept valid prefixes', () => {
      const validPrefixes = ['folder/', 'path/to/folder/', 'my-prefix', 'prefix_123'];
      validPrefixes.forEach(prefix => {
        const result = ValidationService.validateKeyPrefix(prefix);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject prefixes starting with /', () => {
      const result = ValidationService.validateKeyPrefix('/folder/');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('forward slash');
    });

    it('should reject prefixes that are too long', () => {
      const result = ValidationService.validateKeyPrefix('a'.repeat(1025));
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('1024 characters');
    });

    it('should reject prefixes with invalid characters', () => {
      const result = ValidationService.validateKeyPrefix('folder@#$%');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('invalid characters');
    });
  });

  describe('S3 Key Validation', () => {
    it('should accept valid S3 keys', () => {
      const validKeys = [
        'file.zip',
        'folder/file.zip',
        'path/to/folder/file.zip',
        'my-file_123.zip',
        'file-with-special-chars_!*\'().zip'
      ];
      validKeys.forEach(key => {
        const result = ValidationService.validateS3Key(key);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject empty keys', () => {
      const result = ValidationService.validateS3Key('');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject keys with only whitespace', () => {
      const result = ValidationService.validateS3Key('   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject keys starting with /', () => {
      const result = ValidationService.validateS3Key('/folder/file.zip');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('forward slash');
    });

    it('should reject keys that are too long', () => {
      const result = ValidationService.validateS3Key('a'.repeat(1025));
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('1024 characters');
    });

    it('should reject keys with invalid characters', () => {
      const result = ValidationService.validateS3Key('folder/file@#$%.zip');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('invalid characters');
    });

    it('should accept keys constructed from prefix and filename', () => {
      // Simulating what constructKey does
      const prefix = 'uploads/';
      const filename = 'myfile.zip';
      const key = prefix + filename;
      
      const result = ValidationService.validateS3Key(key);
      expect(result.isValid).toBe(true);
    });
  });
});
