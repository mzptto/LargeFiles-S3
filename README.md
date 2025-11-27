# S3 ZIP Downloader

A web application that enables users to download ZIP files directly from HTTPS URLs to AWS S3 buckets without downloading files to their local machine. The application uses an **asynchronous job processing model** powered by AWS ECS Fargate, supporting large file transfers from 1GB to 10TB that may take hours or days to complete.

## Documentation

- **[User Guide](USER_GUIDE.md)** - How to use the application
- **[Deployment Guide](DEPLOYMENT.md)** - How to deploy to AWS
- **[API Documentation](#api-documentation)** - Backend API reference

## Project Structure

```
.
├── frontend/           # React frontend with AWS Cloudscape Design System
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── services/   # API client and validation services
│   │   ├── types/      # TypeScript type definitions
│   │   └── test/       # Test setup and utilities
│   ├── public/         # Static assets
│   └── package.json
│
├── backend/            # Node.js Lambda function
│   ├── src/
│   │   ├── services/   # Business logic services
│   │   └── types/      # TypeScript type definitions
│   └── package.json
│
├── infrastructure/     # AWS CDK infrastructure-as-code
│   ├── bin/            # CDK app entry point
│   ├── lib/            # CDK stack definitions
│   └── package.json
│
└── package.json        # Root workspace configuration
```

## Prerequisites

- Node.js 18+ and npm
- AWS CLI configured with appropriate credentials
- AWS CDK CLI (`npm install -g aws-cdk`)

## Installation

Install dependencies for all packages:

```bash
npm run install:all
```

Or install individually:

```bash
cd frontend && npm install
cd backend && npm install
cd infrastructure && npm install
```

## Development

### Frontend

```bash
cd frontend
npm run dev          # Start development server
npm run build        # Build for production
npm test             # Run tests
```

### Backend

```bash
cd backend
npm run build        # Compile TypeScript
npm test             # Run tests
```

### Infrastructure

```bash
cd infrastructure
npm run build        # Compile TypeScript
npm run synth        # Synthesize CloudFormation template
npm run deploy       # Deploy to AWS
npm run destroy      # Remove all AWS resources
```

## Testing

Run all tests:

```bash
npm run test:all
```

## Deployment

1. Build all components:
   ```bash
   npm run build:all
   ```

2. Deploy infrastructure:
   ```bash
   npm run deploy
   ```

## Architecture

- **Frontend**: React 18 with TypeScript, AWS Cloudscape Design System, hosted on S3 + CloudFront
- **API Layer**: Node.js Lambda functions with TypeScript, AWS SDK v3 (job submission and progress queries)
- **Worker Layer**: Node.js containers on ECS Fargate (long-running file transfers)
- **Orchestration**: AWS Step Functions (workflow management)
- **State Management**: DynamoDB (transfer progress and status)
- **Infrastructure**: AWS CDK for infrastructure-as-code
- **Services**: API Gateway, Lambda, ECS Fargate, Step Functions, DynamoDB, S3, CloudFront, ECR, IAM, CloudWatch

## Features

- HTTPS URL validation with .zip extension check
- S3 bucket name validation
- Real-time progress tracking
- Asynchronous job processing (no need to keep browser open)
- Streaming file transfer (memory efficient)
- AWS Console-style UI
- Secure credential management with IAM roles
- Support for files from 1GB up to 10TB
- Long-running transfers (up to 48 hours per attempt)
- Automatic retry on transient failures
- ECS Fargate workers for scalable processing

## Quick Start

### For Users

See the **[User Guide](USER_GUIDE.md)** for detailed instructions on using the application.

### For Developers/Deployers

See the **[Deployment Guide](DEPLOYMENT.md)** for complete deployment instructions.

**Quick Deploy:**

```bash
# Install dependencies
npm run install:all

# Build all components
npm run build:all

# Deploy to AWS
npm run deploy

# Upload frontend
npm run deploy:frontend
```

## Supported File Types and Limits

- **File Type:** ZIP files only (`.zip` extension required)
- **Protocol:** HTTPS only (HTTP not supported)
- **File Size Range:** 1 GB to 10 TB (10,737,418,240,000 bytes)
- **Transfer Timeout:** 48 hours maximum per attempt (with automatic retries)
- **Processing Model:** Asynchronous (transfers run in background on AWS infrastructure)

## API Documentation

### POST /download

Initiates a file transfer from a source URL to S3.

**Request Body:**
```json
{
  "sourceUrl": "https://example.com/file.zip",
  "bucketName": "my-bucket",
  "keyPrefix": "optional/path/"
}
```

**Response (Success):**
```json
{
  "success": true,
  "transferId": "uuid",
  "s3Location": "s3://my-bucket/optional/path/file.zip"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_URL",
    "message": "Source URL must use HTTPS protocol",
    "retryable": false
  }
}
```

### GET /progress/:transferId

Retrieves the current progress of a transfer.

**Response:**
```json
{
  "transferId": "uuid",
  "bytesTransferred": 1048576,
  "totalBytes": 10485760,
  "percentage": 10,
  "status": "in-progress"
}
```

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT
