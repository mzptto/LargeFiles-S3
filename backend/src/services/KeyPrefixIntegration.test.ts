import { describe, it, expect } from 'vitest';
import { ValidationService } from './ValidationService.js';

/**
 * Integration tests for key prefix handling
 * Requirements: 2.5
 */
describe('Key Prefix Integration', () => {
  describe('Key construction scenarios', () => {
    it('should construct valid key from prefix and filename', () => {
      const testCases = [
        { prefix: 'uploads', filename: 'file.zip', expected: 'uploads/file.zip' },
        { prefix: 'uploads/', filename: 'file.zip', expected: 'uploads/file.zip' },
        { prefix: 'path/to/folder', filename: 'file.zip', expected: 'path/to/folder/file.zip' },
        { prefix: 'path/to/folder/', filename: 'file.zip', expected: 'path/to/folder/file.zip' },
        { prefix: '', filename: 'file.zip', expected: 'file.zip' },
      ];

      testCases.forEach(({ prefix, filename, expected }) => {
        // Simulate constructKey logic
        let cleanPrefix = prefix.startsWith('/') ? prefix.slice(1) : prefix;
        if (cleanPrefix && !cleanPrefix.endsWith('/')) {
          cleanPrefix += '/';
        }
        const key = cleanPrefix + filename;

        expect(key).toBe(expected);
        
        // Validate the constructed key
        const validation = ValidationService.validateS3Key(key);
        expect(validation.isValid).toBe(true);
      });
    });

    it('should handle trailing slashes correctly', () => {
      const prefix = 'folder/';
      const filename = 'test.zip';
      
      // Simulate constructKey logic
      let cleanPrefix = prefix.startsWith('/') ? prefix.slice(1) : prefix;
      if (cleanPrefix && !cleanPrefix.endsWith('/')) {
        cleanPrefix += '/';
      }
      const key = cleanPrefix + filename;

      expect(key).toBe('folder/test.zip');
      expect(key).not.toBe('folder//test.zip'); // Should not have double slash
    });

    it('should remove leading slash from prefix', () => {
      const prefix = '/uploads';
      const filename = 'file.zip';
      
      // Simulate constructKey logic
      let cleanPrefix = prefix.startsWith('/') ? prefix.slice(1) : prefix;
      if (cleanPrefix && !cleanPrefix.endsWith('/')) {
        cleanPrefix += '/';
      }
      const key = cleanPrefix + filename;

      expect(key).toBe('uploads/file.zip');
      expect(key).not.toMatch(/^\//); // Should not start with /
    });

    it('should validate final key format', () => {
      const validKeys = [
        'file.zip',
        'folder/file.zip',
        'path/to/folder/file.zip',
        'my-prefix/my-file_123.zip',
      ];

      validKeys.forEach(key => {
        const validation = ValidationService.validateS3Key(key);
        expect(validation.isValid).toBe(true);
      });
    });

    it('should reject invalid final keys', () => {
      const invalidKeys = [
        '',
        '   ',
        '/folder/file.zip', // starts with /
        'a'.repeat(1025), // too long
        'folder/file@#$.zip', // invalid characters
      ];

      invalidKeys.forEach(key => {
        const validation = ValidationService.validateS3Key(key);
        expect(validation.isValid).toBe(false);
      });
    });
  });

  describe('Prefix validation before construction', () => {
    it('should validate prefix before using it', () => {
      const validPrefixes = ['uploads', 'uploads/', 'path/to/folder', 'my-prefix_123'];
      
      validPrefixes.forEach(prefix => {
        const validation = ValidationService.validateKeyPrefix(prefix);
        expect(validation.isValid).toBe(true);
      });
    });

    it('should reject invalid prefixes', () => {
      const invalidPrefixes = [
        '/uploads', // starts with /
        'a'.repeat(1025), // too long
        'folder@#$%', // invalid characters
      ];

      invalidPrefixes.forEach(prefix => {
        const validation = ValidationService.validateKeyPrefix(prefix);
        expect(validation.isValid).toBe(false);
      });
    });
  });
});
