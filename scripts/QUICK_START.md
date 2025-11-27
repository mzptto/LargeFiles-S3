# Quick Start - Deployment Scripts

This guide provides quick commands for deploying the S3 ZIP Downloader application.

## Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] AWS CLI installed and configured (`aws configure`)
- [ ] Docker installed and running (for worker container)
- [ ] AWS CDK installed (`npm install -g aws-cdk`) - optional, included in project

## Quick Deployment Commands

### First Time Deployment

```bash
# 1. Install all dependencies
npm run install:all

# 2. Deploy infrastructure (Lambda, API Gateway, S3, CloudFront, ECS, ECR)
npm run deploy:cdk

# 3. Build and push Docker image to ECR
npm run build:docker

# 4. Deploy frontend to S3 and CloudFront
npm run deploy:frontend
```

### One-Command Deployment

```bash
# Deploy everything at once
npm run deploy:all
```

This runs: CDK → Docker → Frontend

## Individual Component Deployment

### Infrastructure Only

```bash
# Deploy CDK stack (no approval prompts)
npm run deploy:cdk

# Deploy with approval prompts (safer)
npm run deploy:cdk:with-approval
```

### Docker Image Only

```bash
# Build and push with 'latest' tag
npm run build:docker

# Build and push with version tag
pwsh -File scripts/build-docker.ps1 v1.2.3
```

### Frontend Only

```bash
# Build and deploy frontend
npm run deploy:frontend
```

## Update Deployment

When you make changes to the code:

```bash
# Update backend Lambda
npm run deploy:cdk

# Update worker container
npm run build:docker

# Update frontend
npm run deploy:frontend
```

## Verification

After deployment, check the outputs:

```bash
# View stack outputs
cat infrastructure/outputs.json

# Test API endpoint
curl https://YOUR_API_ENDPOINT/health

# Visit frontend
# Open the CloudFront URL from outputs.json
```

## Common Issues

### "AWS credentials not configured"

```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, and region
```

### "Docker daemon not running"

- Windows/Mac: Start Docker Desktop
- Linux: `sudo systemctl start docker`

### "CDK outputs file not found"

```bash
# Deploy infrastructure first
npm run deploy:cdk
```

### "Frontend build not found"

The `deploy:frontend` script automatically builds the frontend, but if you need to build manually:

```bash
npm run build:frontend:prod
```

## Cleanup

To remove all deployed resources:

```bash
cd infrastructure
npm run destroy
```

**Warning:** This deletes everything including S3 buckets and their contents.

## Getting Help

- Full documentation: See `scripts/README.md`
- AWS CDK docs: https://docs.aws.amazon.com/cdk/
- AWS CLI docs: https://docs.aws.amazon.com/cli/

## Script Locations

All deployment scripts are in the `scripts/` directory:

- `deploy-cdk.ps1` / `deploy-cdk.sh` - Infrastructure deployment
- `build-docker.ps1` / `build-docker.sh` - Docker build and push
- `deploy-frontend.ps1` / `deploy-frontend.js` - Frontend deployment

PowerShell scripts (`.ps1`) are used by default on Windows.
Bash scripts (`.sh`) are available for Linux/Mac.
