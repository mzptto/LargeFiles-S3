import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { randomBytes } from 'crypto';

export interface MockServerOptions {
  port?: number;
  host?: string;
}

export interface MockFileConfig {
  path: string;
  size: number;
  delay?: number;
  statusCode?: number;
  contentType?: string;
}

/**
 * Mock HTTP server for testing file downloads
 * Simulates various response scenarios including success, errors, and timeouts
 */
export class MockHttpServer {
  private server: Server | null = null;
  private files: Map<string, MockFileConfig> = new Map();
  private port: number;
  private host: string;

  constructor(options: MockServerOptions = {}) {
    this.port = options.port || 0; // 0 = random available port
    this.host = options.host || 'localhost';
  }

  /**
   * Register a mock file that the server will serve
   */
  registerFile(config: MockFileConfig): void {
    this.files.set(config.path, config);
  }

  /**
   * Start the mock server
   */
  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', reject);

      this.server.listen(this.port, this.host, () => {
        const address = this.server!.address();
        if (typeof address === 'object' && address !== null) {
          this.port = address.port;
        }
        const baseUrl = `http://${this.host}:${this.port}`;
        resolve(baseUrl);
      });
    });
  }

  /**
   * Stop the mock server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.server = null;
          resolve();
        }
      });
    });
  }

  /**
   * Get the base URL of the running server
   */
  getBaseUrl(): string {
    if (!this.server) {
      throw new Error('Server is not running');
    }
    return `http://${this.host}:${this.port}`;
  }

  /**
   * Handle incoming HTTP requests
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const path = req.url || '/';
    const fileConfig = this.files.get(path);

    if (!fileConfig) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    // Simulate delay if configured
    const delay = fileConfig.delay || 0;
    setTimeout(() => {
      this.serveFile(fileConfig, res);
    }, delay);
  }

  /**
   * Serve a mock file with the configured response
   */
  private serveFile(config: MockFileConfig, res: ServerResponse): void {
    const statusCode = config.statusCode || 200;
    const contentType = config.contentType || 'application/zip';

    if (statusCode !== 200) {
      res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
      res.end(`Error ${statusCode}`);
      return;
    }

    // Generate ZIP file header (minimal valid ZIP structure)
    const zipHeader = this.generateZipHeader(config.size);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': config.size.toString(),
      'Content-Disposition': `attachment; filename="${config.path.split('/').pop()}"`,
    });

    // Stream the file data
    this.streamFileData(res, config.size, zipHeader);
  }

  /**
   * Generate a minimal valid ZIP file header
   */
  private generateZipHeader(_totalSize: number): Buffer {
    // Minimal ZIP file structure:
    // Local file header + file data + central directory + end of central directory
    
    // For simplicity, we'll create a ZIP with one empty file
    const fileName = 'test.txt';
    const fileNameLength = Buffer.byteLength(fileName);
    
    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30 + fileNameLength);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract
    localHeader.writeUInt16LE(0, 6); // General purpose bit flag
    localHeader.writeUInt16LE(0, 8); // Compression method (0 = no compression)
    localHeader.writeUInt16LE(0, 10); // File last modification time
    localHeader.writeUInt16LE(0, 12); // File last modification date
    localHeader.writeUInt32LE(0, 14); // CRC-32
    localHeader.writeUInt32LE(0, 18); // Compressed size
    localHeader.writeUInt32LE(0, 22); // Uncompressed size
    localHeader.writeUInt16LE(fileNameLength, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length
    localHeader.write(fileName, 30); // File name

    return localHeader;
  }

  /**
   * Stream file data to the response
   */
  private streamFileData(res: ServerResponse, size: number, header: Buffer): void {
    let bytesWritten = 0;
    const chunkSize = 64 * 1024; // 64KB chunks

    // Write header first
    res.write(header);
    bytesWritten += header.length;

    // Stream remaining data in chunks
    const writeChunk = () => {
      if (bytesWritten >= size) {
        res.end();
        return;
      }

      const remainingBytes = size - bytesWritten;
      const currentChunkSize = Math.min(chunkSize, remainingBytes);
      const chunk = randomBytes(currentChunkSize);

      const canContinue = res.write(chunk);
      bytesWritten += currentChunkSize;

      if (canContinue) {
        // Continue writing immediately
        setImmediate(writeChunk);
      } else {
        // Wait for drain event
        res.once('drain', writeChunk);
      }
    };

    writeChunk();
  }

  /**
   * Clear all registered files
   */
  clearFiles(): void {
    this.files.clear();
  }
}

/**
 * Helper function to create a mock server with common test files
 */
export async function createTestServer(): Promise<MockHttpServer> {
  const server = new MockHttpServer();

  // Small file (100KB)
  server.registerFile({
    path: '/test-small.zip',
    size: 100 * 1024,
  });

  // Medium file (10MB)
  server.registerFile({
    path: '/test-medium.zip',
    size: 10 * 1024 * 1024,
  });

  // Large file (100MB)
  server.registerFile({
    path: '/test-large.zip',
    size: 100 * 1024 * 1024,
  });

  // File that returns 404
  server.registerFile({
    path: '/not-found.zip',
    size: 0,
    statusCode: 404,
  });

  // File that returns 403
  server.registerFile({
    path: '/forbidden.zip',
    size: 0,
    statusCode: 403,
  });

  // File with delay (simulates slow connection)
  server.registerFile({
    path: '/slow.zip',
    size: 1024 * 1024, // 1MB
    delay: 5000, // 5 second delay before starting
  });

  await server.start();
  return server;
}
