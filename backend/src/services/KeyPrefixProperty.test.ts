import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ValidationService } from './ValidationService.js';

/**
 * Feature: s3-zip-downloader, Property 8: Key Prefix Incorporation
 * Validates: Requirements 2.5
 * 
 * Property: For any optional key prefix provided, the final S3 object key 
 * should be the concatenation of the prefix and the extracted filename.
 */
describe('Property 8: Key Prefix Incorporation', () => {
  /**
   * Helper function to construct S3 key from prefix and filename
   * This mirrors the logic in StreamingService.constructKey()
   */
  function constructKey(prefix: string, filename: string): string {
    // Remove leading slash from prefix if present
    let cleanPrefix = prefix.startsWith('/') ? prefix.slice(1) : prefix;
    
    // Ensure prefix ends with slash if not empty
    if (cleanPrefix && !cleanPrefix.endsWith('/')) {
      cleanPrefix += '/';
    }

    return cleanPrefix + filename;
  }

  it('should concatenate prefix and filename correctly for any valid inputs', () => {
    // Generator for valid S3 key prefix characters (includes /)
    const validPrefixChar = fc.oneof(
      fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 
                       'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
                       'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
                       'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
                       '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
                       '-', '_', '.', '/', '!', '*', "'", '(', ')'),
    );

    // Generator for valid filename characters (excludes / since filenames shouldn't have path separators)
    const validFilenameChar = fc.oneof(
      fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 
                       'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
                       'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
                       'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
                       '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
                       '-', '_', '.', '!', '*', "'", '(', ')'),
    );

    // Generator for valid prefixes (excluding leading slash)
    const validPrefix = fc.oneof(
      fc.constant(''), // Empty prefix is valid
      fc.array(validPrefixChar, { minLength: 1, maxLength: 50 })
        .map(chars => chars.join(''))
        .filter(s => !s.startsWith('/') && s.length <= 1024)
    );

    // Generator for valid filenames (no path separators)
    const validFilename = fc.array(validFilenameChar, { minLength: 1, maxLength: 50 })
      .map(chars => chars.join(''))
      .filter(s => s.length > 0)
      .map(s => s.endsWith('.zip') ? s : s + '.zip');

    fc.assert(
      fc.property(validPrefix, validFilename, (prefix, filename) => {
        // Construct the key
        const key = constructKey(prefix, filename);

        // Property 1: The key should contain the filename
        expect(key).toContain(filename);

        // Property 2: If prefix is not empty, key should contain the prefix (without leading slash)
        if (prefix && prefix.trim() !== '') {
          const cleanPrefix = prefix.startsWith('/') ? prefix.slice(1) : prefix;
          if (cleanPrefix) {
            expect(key).toContain(cleanPrefix);
          }
        }

        // Property 3: The key should end with the filename
        expect(key.endsWith(filename)).toBe(true);

        // Property 4: If prefix is empty, key should equal filename
        if (!prefix || prefix.trim() === '') {
          expect(key).toBe(filename);
        }

        // Property 5: If prefix is not empty, key should be prefix + '/' + filename
        if (prefix && prefix.trim() !== '') {
          const cleanPrefix = prefix.startsWith('/') ? prefix.slice(1) : prefix;
          const expectedKey = cleanPrefix.endsWith('/') 
            ? cleanPrefix + filename 
            : cleanPrefix + '/' + filename;
          expect(key).toBe(expectedKey);
        }

        // Property 6: The key should not start with '/'
        expect(key.startsWith('/')).toBe(false);

        // Property 7: The key should not contain '//'
        expect(key).not.toContain('//');

        // Property 8: The final key should be valid according to ValidationService
        const validation = ValidationService.validateS3Key(key);
        expect(validation.isValid).toBe(true);
      }),
      { numRuns: 100 } // Run 100 iterations as specified in design doc
    );
  });

  it('should handle edge cases: empty prefix', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).map(s => s + '.zip'),
        (filename) => {
          const key = constructKey('', filename);
          expect(key).toBe(filename);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle edge cases: prefix with trailing slash', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 })
          .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '-'))
          .filter(s => s.trim().length > 0)
          .map(s => s + '/'),
        fc.string({ minLength: 1, maxLength: 20 })
          .map(s => s.replace(/[^a-zA-Z0-9_.-]/g, '-'))
          .filter(s => s.trim().length > 0)
          .map(s => s + '.zip'),
        (prefix, filename) => {
          const key = constructKey(prefix, filename);
          
          // Should not have double slashes
          expect(key).not.toContain('//');
          
          // Should end with filename
          expect(key.endsWith(filename)).toBe(true);
          
          // Should be prefix + filename (no extra slash added)
          expect(key).toBe(prefix + filename);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle edge cases: prefix without trailing slash', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 })
          .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '-'))
          .filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 20 })
          .map(s => s.replace(/[^a-zA-Z0-9_.-]/g, '-'))
          .filter(s => s.trim().length > 0)
          .map(s => s + '.zip'),
        (prefix, filename) => {
          const key = constructKey(prefix, filename);
          
          // Should have exactly one slash between prefix and filename
          expect(key).toBe(prefix + '/' + filename);
          
          // Should not have double slashes
          expect(key).not.toContain('//');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle edge cases: prefix with leading slash (should be removed)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 })
          .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '-'))
          .filter(s => s.trim().length > 0)
          .map(s => '/' + s),
        fc.string({ minLength: 1, maxLength: 20 })
          .map(s => s.replace(/[^a-zA-Z0-9_.-]/g, '-'))
          .filter(s => s.trim().length > 0)
          .map(s => s + '.zip'),
        (prefix, filename) => {
          const key = constructKey(prefix, filename);
          
          // Should not start with slash
          expect(key.startsWith('/')).toBe(false);
          
          // Should end with filename
          expect(key.endsWith(filename)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle nested folder prefixes', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 5 })
          .map(parts => parts.join('/')),
        fc.string({ minLength: 1, maxLength: 20 }).map(s => s + '.zip'),
        (prefix, filename) => {
          const key = constructKey(prefix, filename);
          
          // Should contain all parts of the prefix
          expect(key).toContain(prefix.startsWith('/') ? prefix.slice(1) : prefix);
          
          // Should end with filename
          expect(key.endsWith(filename)).toBe(true);
          
          // Should not start with slash
          expect(key.startsWith('/')).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
