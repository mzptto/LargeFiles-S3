# Test Utilities

## Mock HTTP Server

The `mockHttpServer.ts` module provides a lightweight HTTP server for testing file download scenarios without requiring external dependencies or real file hosting.

### Features

- **Dynamic File Generation**: Generates ZIP files of specified sizes on-the-fly
- **Error Simulation**: Simulates various HTTP error responses (404, 403, 500, etc.)
- **Delay Simulation**: Simulates slow connections with configurable delays
- **Streaming Support**: Properly streams large files in chunks
- **Automatic Port Assignment**: Uses random available ports to avoid conflicts

### Basic Usage

```typescript
import { createTestServer } from './test/mockHttpServer';

// Create server with default test files
const server = await createTestServer();
const baseUrl = server.getBaseUrl();

// Use in tests
const response = await axios.get(`${baseUrl}/test-small.zip`);

// Clean up
await server.stop();
```

### Default Test Files

The `createTestServer()` helper creates a server with these pre-configured files:

| Path | Size | Description |
|------|------|-------------|
| `/test-small.zip` | 100KB | Small file for quick tests |
| `/test-medium.zip` | 10MB | Medium file for typical scenarios |
| `/test-large.zip` | 100MB | Large file for stress testing |
| `/not-found.zip` | - | Returns 404 error |
| `/forbidden.zip` | - | Returns 403 error |
| `/slow.zip` | 1MB | 5-second delay before response |

### Custom Configuration

```typescript
import { MockHttpServer } from './test/mockHttpServer';

const server = new MockHttpServer({ port: 3000 });

// Register custom files
server.registerFile({
  path: '/custom.zip',
  size: 50 * 1024 * 1024, // 50MB
  delay: 1000, // 1 second delay
  statusCode: 200,
  contentType: 'application/zip',
});

await server.start();
```

### Integration Test Example

```typescript
import { describe, it, beforeAll, afterAll } from 'vitest';
import { createTestServer } from './test/mockHttpServer';
import { StreamingService } from '../services/StreamingService';

describe('StreamingService Integration', () => {
  let server: MockHttpServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createTestServer();
    baseUrl = server.getBaseUrl();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should download file from mock server', async () => {
    const streamingService = new StreamingService();
    const result = await streamingService.transferToS3(
      `${baseUrl}/test-small.zip`,
      'test-bucket',
      'test-file.zip',
      (bytes, total) => console.log(`Progress: ${bytes}/${total}`)
    );

    expect(result.success).toBe(true);
  });
});
```

### Error Scenarios

The mock server supports testing various error conditions:

```typescript
// 404 Not Found
server.registerFile({
  path: '/missing.zip',
  size: 0,
  statusCode: 404,
});

// 403 Forbidden
server.registerFile({
  path: '/denied.zip',
  size: 0,
  statusCode: 403,
});

// 500 Internal Server Error
server.registerFile({
  path: '/error.zip',
  size: 0,
  statusCode: 500,
});
```

### Timeout Testing

Test timeout handling with delayed responses:

```typescript
server.registerFile({
  path: '/timeout.zip',
  size: 1024 * 1024,
  delay: 30000, // 30 second delay
});

// Configure axios with timeout
const response = await axios.get(`${baseUrl}/timeout.zip`, {
  timeout: 5000, // 5 second timeout
});
// Will throw timeout error
```

### Performance Testing

Test with large files to verify streaming behavior:

```typescript
server.registerFile({
  path: '/huge.zip',
  size: 500 * 1024 * 1024, // 500MB
});

// Monitor memory usage during transfer
const initialMemory = process.memoryUsage().heapUsed;
await downloadFile(`${baseUrl}/huge.zip`);
const finalMemory = process.memoryUsage().heapUsed;

// Memory should not increase significantly (streaming)
expect(finalMemory - initialMemory).toBeLessThan(50 * 1024 * 1024);
```

## Running Tests

```bash
# Run all tests
npm test

# Run only mock server tests
npm test mockHttpServer.test.ts

# Run with watch mode
npm run test:watch
```

## Notes

- The mock server generates random data for file content, so files are not valid ZIP archives (but have proper headers)
- For testing actual ZIP extraction, use real ZIP files
- The server automatically cleans up when stopped
- Each test should start and stop its own server instance to avoid port conflicts
