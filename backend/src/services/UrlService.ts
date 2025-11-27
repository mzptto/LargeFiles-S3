import axios from 'axios';
import { ErrorHandler } from '../utils/errorHandler.js';

/**
 * Service for handling URL operations
 */
export class UrlService {
  /**
   * Extracts filename from URL
   * Handles various URL formats including query parameters and trailing slashes
   */
  extractFilename(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      // Remove trailing slash if present
      const cleanPath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
      
      // Extract filename from path
      const segments = cleanPath.split('/');
      const filename = segments[segments.length - 1];
      
      // If no filename found, use a default
      if (!filename || filename === '') {
        return 'download.zip';
      }
      
      // Decode URI components (handles %20, etc.)
      return decodeURIComponent(filename);
    } catch (error) {
      // If URL parsing fails, try simple extraction
      const parts = url.split('/');
      const lastPart = parts[parts.length - 1];
      
      // Remove query parameters
      const withoutQuery = lastPart.split('?')[0];
      
      return withoutQuery || 'download.zip';
    }
  }

  /**
   * Gets Content-Length header from URL
   * Returns the size in bytes, or -1 if not available
   */
  async getContentLength(url: string): Promise<number> {
    try {
      const response = await axios.head(url, {
        timeout: 10000, // 10 second timeout for HEAD request
        maxRedirects: 5,
      });
      
      const contentLength = response.headers['content-length'];
      
      if (contentLength) {
        return parseInt(contentLength, 10);
      }
      
      return -1;
    } catch (error) {
      console.warn('Failed to get content length:', error);
      // Don't throw - content length is optional
      return -1;
    }
  }

  /**
   * Validates that URL is accessible
   * Checks if the URL returns a successful response
   */
  async validateUrlAccessible(url: string): Promise<boolean> {
    try {
      const response = await axios.head(url, {
        timeout: 10000, // 10 second timeout
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400,
      });
      
      return response.status >= 200 && response.status < 400;
    } catch (error) {
      // Try GET request if HEAD fails (some servers don't support HEAD)
      try {
        const response = await axios.get(url, {
          timeout: 10000,
          maxRedirects: 5,
          responseType: 'stream',
          validateStatus: (status) => status >= 200 && status < 400,
        });
        
        // Immediately destroy the stream to avoid downloading
        if (response.data && typeof response.data.destroy === 'function') {
          response.data.destroy();
        }
        
        return response.status >= 200 && response.status < 400;
      } catch (getError) {
        // Throw proper error with context
        throw ErrorHandler.handleUrlFetchError(getError);
      }
    }
  }

  /**
   * Validates Content-Type header from source URL
   * Requirements: 1.2, 1.3, 2.2
   * Checks if the Content-Type is appropriate for a ZIP file
   */
  async validateContentType(url: string): Promise<{ isValid: boolean; contentType?: string; error?: string }> {
    try {
      const response = await axios.head(url, {
        timeout: 10000,
        maxRedirects: 5,
      });
      
      const contentType = response.headers['content-type'];
      
      if (!contentType) {
        // Some servers don't provide Content-Type, which is acceptable
        return { isValid: true };
      }

      // Normalize content type (remove charset and other parameters)
      const normalizedType = contentType.toLowerCase().split(';')[0].trim();

      // Valid content types for ZIP files
      const validTypes = [
        'application/zip',
        'application/x-zip-compressed',
        'application/x-zip',
        'application/octet-stream', // Generic binary, acceptable
        'multipart/x-zip', // Some servers use this
      ];

      if (validTypes.includes(normalizedType)) {
        return { isValid: true, contentType: normalizedType };
      }

      // If content type doesn't match, return warning but don't fail
      // (some servers misconfigure Content-Type headers)
      console.warn(`Unexpected Content-Type: ${contentType} for URL: ${url}`);
      return { 
        isValid: true, 
        contentType: normalizedType,
        error: `Warning: Unexpected Content-Type "${normalizedType}". Expected ZIP file types.`
      };
    } catch (error) {
      // If HEAD request fails, try GET
      try {
        const response = await axios.get(url, {
          timeout: 10000,
          maxRedirects: 5,
          responseType: 'stream',
          maxContentLength: 1024, // Only read first 1KB
        });
        
        // Immediately destroy the stream
        if (response.data && typeof response.data.destroy === 'function') {
          response.data.destroy();
        }

        const contentType = response.headers['content-type'];
        
        if (!contentType) {
          return { isValid: true };
        }

        const normalizedType = contentType.toLowerCase().split(';')[0].trim();
        
        const validTypes = [
          'application/zip',
          'application/x-zip-compressed',
          'application/x-zip',
          'application/octet-stream',
          'multipart/x-zip',
        ];

        if (validTypes.includes(normalizedType)) {
          return { isValid: true, contentType: normalizedType };
        }

        console.warn(`Unexpected Content-Type: ${contentType} for URL: ${url}`);
        return { 
          isValid: true, 
          contentType: normalizedType,
          error: `Warning: Unexpected Content-Type "${normalizedType}". Expected ZIP file types.`
        };
      } catch (getError) {
        // If we can't get Content-Type, don't fail the validation
        console.warn('Failed to validate Content-Type:', getError);
        return { isValid: true };
      }
    }
  }
}
