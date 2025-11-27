# S3 ZIP Downloader

A web application that enables users to download ZIP files directly from HTTPS URLs to AWS S3 buckets without downloading files to their local machine.

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
- **Backend**: Node.js Lambda function with TypeScript, AWS SDK v3
- **Infrastructure**: AWS CDK for infrastructure-as-code
- **Services**: API Gateway, Lambda, S3, CloudFront, IAM, CloudWatch

## Features

- HTTPS URL validation with .zip extension check
- S3 bucket name validation
- Real-time progress tracking
- Streaming file transfer (memory efficient)
- AWS Console-style UI
- Secure credential management with IAM roles
- Support for files up to 5GB

## License

MIT
