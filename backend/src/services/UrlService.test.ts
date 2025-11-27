import { describe, it, expect } from 'vitest';
import { UrlService } from './UrlService.js';

describe('UrlService', () => {
  const urlService = new UrlService();

  describe('extractFilename', () => {
    it('should extract filename from simple URL', () => {
      const url = 'https://example.com/files/archive.zip';
      const filename = urlService.extractFilename(url);
      expect(filename).toBe('archive.zip');
    });

    it('should extract filename from URL with query parameters', () => {
      const url = 'https://example.com/files/archive.zip?token=abc123';
      const filename = urlService.extractFilename(url);
      expect(filename).toBe('archive.zip');
    });

    it('should extract filename from URL with trailing slash', () => {
      const url = 'https://example.com/files/archive.zip/';
      const filename = urlService.extractFilename(url);
      expect(filename).toBe('archive.zip');
    });

    it('should decode URI-encoded filename', () => {
      const url = 'https://example.com/files/my%20archive.zip';
      const filename = urlService.extractFilename(url);
      expect(filename).toBe('my archive.zip');
    });

    it('should return default filename for URL without filename', () => {
      const url = 'https://example.com/';
      const filename = urlService.extractFilename(url);
      expect(filename).toBe('download.zip');
    });

    it('should handle complex URL paths', () => {
      const url = 'https://example.com/path/to/nested/folder/data.zip';
      const filename = urlService.extractFilename(url);
      expect(filename).toBe('data.zip');
    });
  });

  describe('getContentLength', () => {
    it('should return -1 for invalid URL', async () => {
      const url = 'https://invalid-domain-that-does-not-exist-12345.com/file.zip';
      const length = await urlService.getContentLength(url);
      expect(length).toBe(-1);
    });
  });

  describe('validateUrlAccessible', () => {
    it('should throw error for invalid URL', async () => {
      const url = 'https://invalid-domain-that-does-not-exist-12345.com/file.zip';
      await expect(urlService.validateUrlAccessible(url)).rejects.toThrow();
    });
  });
});
