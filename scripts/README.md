# Deployment Scripts

This directory contains deployment scripts for the S3 ZIP Downloader application.

## Prerequisites

Before deploying, ensure you have:

1. **Node.js** (v18 or later)
2. **AWS CLI** configured with appropriate credentials
3. **AWS CDK** installed globally (optional, included in project dependencies)

### AWS Credentials Setup

Configure your AWS credentials using one of these methods:

```bash
# Option 1: AWS CLI configure
aws configure

# Option 2: Environment variables
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_DEFAULT_REGION=us-east-1

# Option 3: AWS credentials file (~/.aws/credentials)
[default]
aws_access_key_id = your_access_key
aws_secret_access_key = your_secret_key
```

## Deployment Commands

### Full Deployment (Infrastructure + Frontend)

Deploy everything in one command:

```bash
npm run deploy:all
```

This will:
1. Build the backend Lambda function
2. Build the infrastructure CDK code
3. Deploy the CDK stack (Lambda, API Gateway, S3, CloudFront)
4. Build the frontend for production
5. Upload frontend files to S3
6. Invalidate CloudFront cache

### Infrastructure Only (CDK Stack)

Deploy just the AWS infrastructure:

```bash
# Without approval prompts (faster)
npm run deploy:cdk

# With approval prompts (safer)
npm run deploy:cdk:with-approval
```

This deploys:
- Lambda function (backend)
- API Gateway
- S3 bucket for frontend hosting
- CloudFront distribution
- IAM roles and permissions
- CloudWatch logs and alarms

### Frontend Only

Deploy just the frontend (after infrastructure is deployed):

```bash
npm run deploy:frontend
```

This will:
1. Build the frontend for production with optimizations
2. Sync files to S3 with appropriate cache headers
3. Invalidate CloudFront cache

## Deployment Outputs

After deploying the infrastructure, you'll see outputs like:

```
Outputs:
S3ZipDownloaderStack.ApiEndpoint = https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/
S3ZipDownloaderStack.CloudFrontUrl = d1234567890abc.cloudfront.net
S3ZipDownloaderStack.FrontendBucketName = s3zipdownloaderstack-frontendbucket12345678-abcdefgh
S3ZipDownloaderStack.LambdaFunctionName = S3ZipDownloaderStack-BackendFunction12345678-ABCDEFGH
```

These outputs are automatically saved to `infrastructure/outputs.json` and used by the frontend deployment script.

## Script Details

### deploy-frontend.js

This script handles frontend deployment with the following features:

**Cache Strategy:**
- HTML files: `no-cache` (always check for updates)
- JS/CSS files: `1 year cache` with `immutable` (content-hashed filenames)
- Images: `1 year cache`
- Other files: `1 hour cache`

**Content Types:**
- Automatically sets correct MIME types for all files
- Ensures proper rendering in browsers

**CloudFront Invalidation:**
- Automatically invalidates all paths (`/*`)
- Ensures users get the latest version immediately

## Build Scripts

### Frontend Build

```bash
# Development build
npm run build:frontend

# Production build (optimized)
npm run build:frontend:prod
```

Production build includes:
- TypeScript compilation
- Minification with Terser
- Source maps for debugging
- Code splitting (React, Cloudscape, app code)
- Tree shaking for smaller bundles

### Backend Build

```bash
npm run build:backend
```

Compiles TypeScript to JavaScript for Lambda deployment.

### Infrastructure Build

```bash
npm run build:infrastructure
```

Compiles CDK TypeScript code.

## Troubleshooting

### AWS CLI Not Found

```bash
# Install AWS CLI
# macOS
brew install awscli

# Windows
# Download from: https://aws.amazon.com/cli/

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

### CDK Outputs Not Found

If you see "CDK outputs file not found", deploy the infrastructure first:

```bash
npm run deploy:cdk
```

### CloudFront Invalidation Failed

If CloudFront invalidation fails, you can manually invalidate:

1. Go to [CloudFront Console](https://console.aws.amazon.com/cloudfront/)
2. Select your distribution
3. Go to "Invalidations" tab
4. Create invalidation with path: `/*`

### Permission Denied

If you get permission errors:

1. Check your AWS credentials are configured
2. Ensure your IAM user/role has necessary permissions:
   - S3: PutObject, ListBucket
   - CloudFront: CreateInvalidation, ListDistributions
   - CloudFormation: Full access (for CDK)
   - Lambda: Full access (for CDK)
   - IAM: CreateRole, AttachRolePolicy (for CDK)

## Manual Deployment Steps

If you prefer to deploy manually:

### 1. Deploy Infrastructure

```bash
cd infrastructure
npm run build
npm run deploy
```

### 2. Build Frontend

```bash
cd frontend
npm run build:prod
```

### 3. Upload to S3

```bash
aws s3 sync frontend/dist s3://YOUR_BUCKET_NAME/ --delete
```

### 4. Invalidate CloudFront

```bash
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

## Environment-Specific Deployments

To deploy to different environments (dev, staging, prod):

```bash
# Set environment
export CDK_ENV=production

# Deploy with environment-specific stack name
cd infrastructure
cdk deploy S3ZipDownloader-${CDK_ENV}
```

## Cleanup

To remove all deployed resources:

```bash
cd infrastructure
npm run destroy
```

**Warning:** This will delete all resources including the S3 bucket and its contents.


## New Deployment Scripts

### Docker Build and Push Scripts

#### build-docker.ps1 / build-docker.sh

Builds and pushes the Fargate worker Docker image to ECR.

**Prerequisites:**
- Docker installed and running
- AWS CLI installed and configured
- CDK stack deployed (to get ECR repository URI)

**Usage:**
```bash
# PowerShell (Windows)
npm run build:docker

# With version tag
pwsh -File scripts/build-docker.ps1 v1.0.0

# Bash (Linux/Mac)
./scripts/build-docker.sh
./scripts/build-docker.sh v1.0.0
```

**What it does:**
1. Builds backend TypeScript code
2. Builds Docker image using worker.Dockerfile
3. Tags image with version and 'latest'
4. Logs in to Amazon ECR
5. Pushes image to ECR repository

### Enhanced CDK Deployment Scripts

#### deploy-cdk.ps1 / deploy-cdk.sh

Enhanced CDK deployment with credential validation and output display.

**Usage:**
```bash
# PowerShell (Windows)
npm run deploy:cdk

# With approval prompts
npm run deploy:cdk:with-approval

# Bash (Linux/Mac)
./scripts/deploy-cdk.sh
./scripts/deploy-cdk.sh --require-approval
```

**What it does:**
1. Validates AWS credentials are configured
2. Displays AWS account and region information
3. Builds backend and infrastructure code
4. Deploys CDK stack
5. Displays formatted stack outputs

### Enhanced Frontend Deployment

#### deploy-frontend.ps1

PowerShell version of frontend deployment for better Windows compatibility.

**Usage:**
```bash
# PowerShell (Windows) - Recommended
npm run deploy:frontend

# Node.js (Cross-platform)
npm run deploy:frontend:node
```

## Complete Deployment Workflow

To deploy the entire application including the Fargate worker:

```bash
# 1. Install dependencies
npm run install:all

# 2. Deploy infrastructure
npm run deploy:cdk

# 3. Build and push Docker image
npm run build:docker

# 4. Deploy frontend
npm run deploy:frontend
```

Or use the all-in-one command (includes Docker):

```bash
npm run deploy:all
```

## Script Compatibility

All deployment scripts are now provided in both PowerShell (`.ps1`) and Bash (`.sh`) versions:

- **PowerShell scripts**: Recommended for Windows, also work on Linux/Mac with PowerShell Core
- **Bash scripts**: For Linux/Mac, also work on Windows with Git Bash or WSL
- **Node.js scripts**: Cross-platform, work everywhere Node.js is installed

The npm scripts in `package.json` default to PowerShell on Windows for better native integration.

## Docker Troubleshooting

### Docker Not Running

**Error: Cannot connect to Docker daemon**
- Start Docker Desktop (Windows/Mac)
- Or start Docker service: `sudo systemctl start docker` (Linux)

### ECR Login Failed

**Error: Login to ECR failed**
- Check AWS credentials are valid: `aws sts get-caller-identity`
- Ensure IAM user has ECR permissions: `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`

### Image Push Failed

**Error: Denied: Your authorization token has expired**
- Re-run the script, it will automatically re-authenticate

**Error: Repository does not exist**
- Deploy CDK stack first: `npm run deploy:cdk`
- The ECR repository is created by the CDK stack
