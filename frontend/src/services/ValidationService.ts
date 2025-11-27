import { ValidationResult } from '../types/validation';

export class ValidationService {
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
   * Validates that a URL ends with .zip extension
   * Requirements: 1.3
   */
  static validateZipExtension(url: string): ValidationResult {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      if (!pathname.toLowerCase().endsWith('.zip')) {
        return {
          isValid: false,
          error: 'URL must point to a .zip file'
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
   * Validates a complete URL (HTTPS + .zip extension)
   * Requirements: 1.2, 1.3
   */
  static validateUrl(url: string): ValidationResult {
    const protocolResult = this.validateHttpsProtocol(url);
    if (!protocolResult.isValid) {
      return protocolResult;
    }

    const extensionResult = this.validateZipExtension(url);
    if (!extensionResult.isValid) {
      return extensionResult;
    }

    return { isValid: true };
  }

  /**
   * Validates S3 bucket name according to AWS naming conventions
   * Requirements: 2.2
   */
  static validateBucketName(bucketName: string): ValidationResult {
    if (bucketName.length < 3 || bucketName.length > 63) {
      return {
        isValid: false,
        error: 'Bucket name must be between 3 and 63 characters long'
      };
    }

    const validCharsRegex = /^[a-z0-9.-]+$/;
    if (!validCharsRegex.test(bucketName)) {
      return {
        isValid: false,
        error: 'Bucket name can only contain lowercase letters, numbers, dots, and hyphens'
      };
    }

    const startsEndsWithAlphanumeric = /^[a-z0-9].*[a-z0-9]$/;
    if (!startsEndsWithAlphanumeric.test(bucketName)) {
      return {
        isValid: false,
        error: 'Bucket name must begin and end with a letter or number'
      };
    }

    if (bucketName.includes('..')) {
      return {
        isValid: false,
        error: 'Bucket name must not contain two adjacent periods'
      };
    }

    const ipAddressRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipAddressRegex.test(bucketName)) {
      return {
        isValid: false,
        error: 'Bucket name must not be formatted as an IP address'
      };
    }

    if (bucketName.startsWith('xn--')) {
      return {
        isValid: false,
        error: 'Bucket name must not start with "xn--" prefix'
      };
    }

    if (bucketName.endsWith('-s3alias')) {
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
   */
  static validateKeyPrefix(keyPrefix: string): ValidationResult {
    if (keyPrefix === '') {
      return { isValid: true };
    }

    if (keyPrefix.length > 1024) {
      return {
        isValid: false,
        error: 'Key prefix must not exceed 1024 characters'
      };
    }

    if (keyPrefix.startsWith('/')) {
      return {
        isValid: false,
        error: 'Key prefix should not start with a forward slash'
      };
    }

    const validKeyRegex = /^[a-zA-Z0-9!_.*'()\/-]+$/;
    if (!validKeyRegex.test(keyPrefix)) {
      return {
        isValid: false,
        error: 'Key prefix contains invalid characters. Allowed: letters, numbers, and ! - _ . * \' ( ) /'
      };
    }

    return { isValid: true };
  }
}
