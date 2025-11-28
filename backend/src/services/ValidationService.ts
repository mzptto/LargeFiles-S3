import { ValidationResult } from '../types/validation.js';

export class ValidationService {
  /**
   * Sanitizes user input by removing potentially dangerous characters
   * and normalizing whitespace
   * Requirements: 1.2, 1.3, 2.2
   * Security: Task 12.2 - Input sanitization
   */
  static sanitizeInput(input: string): string {
    if (!input) {
      return '';
    }

    // Trim whitespace
    let sanitized = input.trim();

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Remove control characters (except newlines and tabs which are handled by trim)
    sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

    // Normalize multiple spaces to single space
    sanitized = sanitized.replace(/\s+/g, ' ');

    // Prevent potential injection attacks by limiting length
    if (sanitized.length > 2048) {
      sanitized = sanitized.substring(0, 2048);
    }

    return sanitized;
  }
  /**
   * Validates that a URL uses HTTPS protocol
   * Requirements: 1.2
   */
  static validateHttpsProtocol(url: string): ValidationResult {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol !== 'https:') {
        return {
          isValid: false,
          error: 'URL must use HTTPS protocol'
        };
      }
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: 'Invalid URL format'
      };
    }
  }

  /**
   * Validates that a URL has a filename
   * Requirements: 1.3
   */
  static validateHasFilename(url: string): ValidationResult {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      // Extract filename from path
      const parts = pathname.split('/').filter(p => p.length > 0);
      const filename = parts[parts.length - 1];
      
      if (!filename || filename.length === 0) {
        return {
          isValid: false,
          error: 'URL must point to a file'
        };
      }
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: 'Invalid URL format'
      };
    }
  }

  /**
   * Validates a complete URL (HTTPS + has filename)
   * Requirements: 1.2, 1.3
   */
  static validateUrl(url: string): ValidationResult {
    // Sanitize input first
    const sanitizedUrl = this.sanitizeInput(url);
    
    if (!sanitizedUrl) {
      return {
        isValid: false,
        error: 'URL is required'
      };
    }

    const protocolResult = this.validateHttpsProtocol(sanitizedUrl);
    if (!protocolResult.isValid) {
      return protocolResult;
    }

    const filenameResult = this.validateHasFilename(sanitizedUrl);
    if (!filenameResult.isValid) {
      return filenameResult;
    }

    return { isValid: true };
  }

  /**
   * Validates S3 bucket name according to AWS naming conventions
   * Requirements: 2.2
   * 
   * Rules:
   * - Must be between 3 and 63 characters long
   * - Can consist only of lowercase letters, numbers, dots (.), and hyphens (-)
   * - Must begin and end with a letter or number
   * - Must not contain two adjacent periods
   * - Must not be formatted as an IP address (e.g., 192.168.5.4)
   * - Must not start with 'xn--' prefix
   * - Must not end with '-s3alias' suffix
   */
  static validateBucketName(bucketName: string): ValidationResult {
    // Sanitize input first
    const sanitizedBucket = this.sanitizeInput(bucketName);
    
    if (!sanitizedBucket) {
      return {
        isValid: false,
        error: 'Bucket name is required'
      };
    }

    // Check length
    if (sanitizedBucket.length < 3 || sanitizedBucket.length > 63) {
      return {
        isValid: false,
        error: 'Bucket name must be between 3 and 63 characters long'
      };
    }

    // Check for valid characters (lowercase letters, numbers, dots, hyphens)
    const validCharsRegex = /^[a-z0-9.-]+$/;
    if (!validCharsRegex.test(sanitizedBucket)) {
      return {
        isValid: false,
        error: 'Bucket name can only contain lowercase letters, numbers, dots, and hyphens'
      };
    }

    // Check that it starts and ends with a letter or number
    const startsEndsWithAlphanumeric = /^[a-z0-9].*[a-z0-9]$/;
    if (!startsEndsWithAlphanumeric.test(sanitizedBucket)) {
      return {
        isValid: false,
        error: 'Bucket name must begin and end with a letter or number'
      };
    }

    // Check for adjacent periods
    if (sanitizedBucket.includes('..')) {
      return {
        isValid: false,
        error: 'Bucket name must not contain two adjacent periods'
      };
    }

    // Check if formatted as IP address
    const ipAddressRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipAddressRegex.test(sanitizedBucket)) {
      return {
        isValid: false,
        error: 'Bucket name must not be formatted as an IP address'
      };
    }

    // Check for xn-- prefix (reserved for Punycode)
    if (sanitizedBucket.startsWith('xn--')) {
      return {
        isValid: false,
        error: 'Bucket name must not start with "xn--" prefix'
      };
    }

    // Check for -s3alias suffix
    if (sanitizedBucket.endsWith('-s3alias')) {
      return {
        isValid: false,
        error: 'Bucket name must not end with "-s3alias" suffix'
      };
    }

    return { isValid: true };
  }

  /**
   * Validates S3 key prefix (optional folder path)
   * Requirements: 2.5
   * 
   * Rules:
   * - Can be empty (optional)
   * - Must not exceed 1024 characters
   * - Can contain letters, numbers, and special characters: ! - _ . * ' ( ) /
   * - Should not start with a forward slash
   * - Trailing slash is acceptable (indicates folder)
   */
  static validateKeyPrefix(keyPrefix: string): ValidationResult {
    // Sanitize input first (but preserve empty string)
    const sanitizedPrefix = keyPrefix ? this.sanitizeInput(keyPrefix) : '';
    
    // Empty prefix is valid (optional field)
    if (sanitizedPrefix === '') {
      return { isValid: true };
    }

    // Check length (S3 key max length is 1024 bytes)
    if (sanitizedPrefix.length > 1024) {
      return {
        isValid: false,
        error: 'Key prefix must not exceed 1024 characters'
      };
    }

    // Check for leading slash (not recommended in S3)
    if (sanitizedPrefix.startsWith('/')) {
      return {
        isValid: false,
        error: 'Key prefix should not start with a forward slash'
      };
    }

    // Check for valid characters
    // S3 allows: letters, numbers, and special characters: ! - _ . * ' ( ) /
    const validKeyRegex = /^[a-zA-Z0-9!_.*'()\/-]+$/;
    if (!validKeyRegex.test(sanitizedPrefix)) {
      return {
        isValid: false,
        error: 'Key prefix contains invalid characters. Allowed: letters, numbers, and ! - _ . * \' ( ) /'
      };
    }

    return { isValid: true };
  }

  /**
   * Validates final S3 key (complete object path)
   * Requirements: 2.5
   * 
   * Rules:
   * - Must not exceed 1024 characters
   * - Must not be empty
   * - Can contain letters, numbers, and special characters: ! - _ . * ' ( ) /
   * - Should not start with a forward slash
   */
  static validateS3Key(key: string): ValidationResult {
    // Key must not be empty
    if (!key || key.trim() === '') {
      return {
        isValid: false,
        error: 'S3 key must not be empty'
      };
    }

    // Check length (S3 key max length is 1024 bytes)
    if (key.length > 1024) {
      return {
        isValid: false,
        error: 'S3 key must not exceed 1024 characters'
      };
    }

    // Check for leading slash (not recommended in S3)
    if (key.startsWith('/')) {
      return {
        isValid: false,
        error: 'S3 key should not start with a forward slash'
      };
    }

    // Check for valid characters
    // S3 allows: letters, numbers, and special characters: ! - _ . * ' ( ) /
    const validKeyRegex = /^[a-zA-Z0-9!_.*'()\/-]+$/;
    if (!validKeyRegex.test(key)) {
      return {
        isValid: false,
        error: 'S3 key contains invalid characters. Allowed: letters, numbers, and ! - _ . * \' ( ) /'
      };
    }

    return { isValid: true };
  }
}
