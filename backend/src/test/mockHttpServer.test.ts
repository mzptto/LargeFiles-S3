import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockHttpServer, createTestServer } from './mockHttpServer';
import axios from 'axios';

describe('MockHttpServer', () => {
  let server: MockHttpServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createTestServer();
    baseUrl = server.getBaseUrl();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should serve small test file', async () => {
    const response = await axios.get(`${baseUrl}/test-small.zip`, {
      responseType: 'arraybuffer',
    });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.data.length).toBe(100 * 1024);
  });

  it('should serve medium test file', async () => {
    const response = await axios.get(`${baseUrl}/test-medium.zip`, {
      responseType: 'arraybuffer',
    });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.data.length).toBe(10 * 1024 * 1024);
  });

  it('should return 404 for not-found file', async () => {
    try {
      await axios.get(`${baseUrl}/not-found.zip`);
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.response.status).toBe(404);
    }
  });

  it('should return 403 for forbidden file', async () => {
    try {
      await axios.get(`${baseUrl}/forbidden.zip`);
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.response.status).toBe(403);
    }
  });

  it('should return 404 for unregistered path', async () => {
    try {
      await axios.get(`${baseUrl}/nonexistent.zip`);
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.response.status).toBe(404);
    }
  });

  it('should include content-length header', async () => {
    const response = await axios.get(`${baseUrl}/test-small.zip`, {
      responseType: 'arraybuffer',
    });

    expect(response.headers['content-length']).toBe((100 * 1024).toString());
  });

  it('should include content-disposition header', async () => {
    const response = await axios.get(`${baseUrl}/test-small.zip`, {
      responseType: 'arraybuffer',
    });

    expect(response.headers['content-disposition']).toContain('test-small.zip');
  });

  it('should support streaming', async () => {
    const response = await axios.get(`${baseUrl}/test-medium.zip`, {
      responseType: 'stream',
    });

    let bytesReceived = 0;
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
        bytesReceived += chunk.length;
        chunks.push(chunk);
      });

      response.data.on('end', () => {
        resolve();
      });

      response.data.on('error', reject);
    });

    expect(bytesReceived).toBe(10 * 1024 * 1024);
    expect(chunks.length).toBeGreaterThan(1); // Should receive multiple chunks
  });
});

describe('MockHttpServer - Custom Configuration', () => {
  it('should support custom file configurations', async () => {
    const server = new MockHttpServer();
    
    server.registerFile({
      path: '/custom.zip',
      size: 500,
      contentType: 'application/zip',
    });

    const baseUrl = await server.start();

    try {
      const response = await axios.get(`${baseUrl}/custom.zip`, {
        responseType: 'arraybuffer',
      });

      expect(response.status).toBe(200);
      expect(response.data.length).toBe(500);
    } finally {
      await server.stop();
    }
  });

  it('should support delayed responses', async () => {
    const server = new MockHttpServer();
    
    server.registerFile({
      path: '/delayed.zip',
      size: 1024,
      delay: 100, // 100ms delay
    });

    const baseUrl = await server.start();

    try {
      const startTime = Date.now();
      await axios.get(`${baseUrl}/delayed.zip`, {
        responseType: 'arraybuffer',
      });
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThanOrEqual(100);
    } finally {
      await server.stop();
    }
  });

  it('should support custom status codes', async () => {
    const server = new MockHttpServer();
    
    server.registerFile({
      path: '/error.zip',
      size: 0,
      statusCode: 500,
    });

    const baseUrl = await server.start();

    try {
      await axios.get(`${baseUrl}/error.zip`);
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.response.status).toBe(500);
    } finally {
      await server.stop();
    }
  });
});
