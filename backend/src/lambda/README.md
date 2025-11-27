# Lambda Handlers

This directory contains the Lambda function handlers for the S3 ZIP Downloader application.

## Handlers

### Job Submission Handler (`jobSubmissionHandler.ts`)

**Purpose**: Accepts download requests and creates transfer jobs.

**Requirements**: 3.1, 8.6

**Functionality**:
- Parses and validates incoming requests
- Validates source URL (HTTPS + .zip extension)
- Validates S3 bucket name (AWS naming conventions)
- Validates optional key prefix
- Generates unique transfer ID (UUID)
- Extracts filename from source URL
- Constructs final S3 key (prefix + filename)
- Creates transfer record in DynamoDB with "pending" status
- Returns transfer ID immediately (202 Accepted)
- Does NOT wait for transfer completion

**API Endpoint**: `POST /transfers`

**Request Body**:
```json
{
  "sourceUrl": "https://example.com/file.zip",
  "bucketName": "my-bucket",
  "keyPrefix": "optional/path/"
}
```

**Response** (202 Accepted):
```json
{
  "success": true,
  "transferId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Response** (4xx/5xx):
```json
{
  "success": false,
  "error": {
    "code": "INVALID_URL",
    "message": "URL must use HTTPS protocol",
    "retryable": false
  }
}
```

**Environment Variables**:
- `DYNAMODB_TABLE_NAME`: Name of the DynamoDB table for transfer state
- `AWS_REGION`: AWS region (default: us-east-1)

---

### Progress Query Handler (`progressQueryHandler.ts`)

**Purpose**: Queries the status and progress of a transfer job.

**Requirements**: 4.2, 4.3

**Functionality**:
- Extracts transfer ID from path parameters
- Validates transfer ID format (UUID)
- Queries DynamoDB for transfer status
- Returns current progress, status, and metadata
- Handles transfer not found errors (404)

**API Endpoint**: `GET /transfers/{transferId}`

**Response** (200 OK):
```json
{
  "success": true,
  "transferId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "in-progress",
  "progress": {
    "bytesTransferred": 1048576000,
    "totalBytes": 5242880000,
    "percentage": 20
  },
  "metadata": {
    "sourceUrl": "https://example.com/file.zip",
    "bucketName": "my-bucket",
    "keyPrefix": "optional/path/",
    "s3Key": "optional/path/file.zip",
    "s3Location": "s3://my-bucket/optional/path/file.zip",
    "startTime": "2024-01-01T12:00:00.000Z",
    "endTime": null,
    "lastUpdateTime": "2024-01-01T12:05:00.000Z",
    "fargateTaskArn": "arn:aws:ecs:..."
  },
  "error": null
}
```

**Error Response** (404 Not Found):
```json
{
  "success": false,
  "error": {
    "code": "TRANSFER_NOT_FOUND",
    "message": "Transfer with ID 550e8400-e29b-41d4-a716-446655440000 not found",
    "retryable": false
  }
}
```

**Environment Variables**:
- `DYNAMODB_TABLE_NAME`: Name of the DynamoDB table for transfer state
- `AWS_REGION`: AWS region (default: us-east-1)

---

## Deployment

These handlers are designed to be deployed as separate Lambda functions behind API Gateway:

1. **Job Submission Handler**: Handles POST requests to `/transfers`
2. **Progress Query Handler**: Handles GET requests to `/transfers/{transferId}`

Both handlers include CORS headers for cross-origin requests from the frontend.

## Integration with Step Functions

The job submission handler creates a transfer record in DynamoDB but does not yet start the Step Functions workflow. This integration will be implemented in task 8.1 when the Step Functions state machine is created.

## Testing

To test these handlers locally, you can use the AWS SAM CLI or invoke them directly with test events:

```typescript
import { handler } from './jobSubmissionHandler.js';

const event = {
  body: JSON.stringify({
    sourceUrl: 'https://example.com/test.zip',
    bucketName: 'test-bucket',
    keyPrefix: 'test/'
  }),
  pathParameters: null,
  headers: {},
  // ... other APIGatewayProxyEvent properties
};

const result = await handler(event);
console.log(result);
```
