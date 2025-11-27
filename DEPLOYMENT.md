# Deployment Guide

This guide provides detailed instructions for deploying the S3 ZIP Downloader application to AWS.

## Prerequisites

### Required Software

1. **Node.js 18 or higher**
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify installation: `node --version`

2. **npm (comes with Node.js)**
   - Verify installation: `npm --version`

3. **AWS CLI**
   - Install: Follow instructions at [AWS CLI Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
   - Verify installation: `aws --version`

4. **AWS CDK CLI**
   - Install globally: `npm install -g aws-cdk`
   - Verify installation: `cdk --version`

5. **Docker**
   - Required for building the Fargate worker container
   - Download from [docker.com](https://www.docker.com/products/docker-desktop)
   - Verify installation: `docker --version`
   - Ensure Docker daemon is running

### AWS Account Requirements

1. **AWS Account**
   - Active AWS account with billing enabled
   - Access to create resources (S3, Lambda, API Gateway, CloudFront, IAM)

2. **AWS Credentials**
   - Configure AWS CLI with credentials that have sufficient permissions
   - Run: `aws configure`
   - Enter your AWS Access Key ID, Secret Access Key, default region, and output format

3. **Required IAM Permissions**
   Your AWS user/role needs permissions to create and manage:
   - S3 buckets and objects
   - Lambda functions
   - API Gateway REST APIs
   - CloudFront distributions
   - IAM roles and policies
   - CloudWatch log groups
   - CloudFormation stacks

### Verify Prerequisites

Run these commands to verify your setup:

```bash
node --version          # Should show v18.x.x or higher
npm --version           # Should show 8.x.x or higher
aws --version           # Should show aws-cli/2.x.x or higher
cdk --version           # Should show 2.x.x or higher
docker --version        # Should show Docker version 20.x.x or higher
aws sts get-caller-identity  # Should show your AWS account details
```

## Architecture Overview

### High-Level Architecture

The S3 ZIP Downloader uses a hybrid serverless + container architecture to handle large file transfers efficiently:

- **Frontend**: React 18 with TypeScript, AWS Cloudscape Design System, hosted on S3 + CloudFront
- **API Layer**: API Gateway + Lambda orchestrator for job submission and progress queries
- **Worker Layer**: ECS Fargate containers for long-running file transfers (no time limits)
- **Orchestration**: AWS Step Functions to manage workflow and launch Fargate tasks
- **State Management**: DynamoDB for persisting transfer progress and status
- **Infrastructure**: AWS CDK for infrastructure-as-code
- **Services**: API Gateway, Lambda, ECS Fargate, Step Functions, DynamoDB, S3, CloudFront, ECR, IAM, CloudWatch

### ECS Fargate Architecture

The application uses **AWS ECS Fargate** to handle the actual file transfer work. This architecture was chosen to support:

- **Long-running transfers**: Files from 1GB to 10TB that may take hours or days
- **No timeout limits**: Unlike Lambda (15 min max), Fargate tasks can run for 48 hours
- **Scalability**: Multiple transfers can run concurrently in separate containers
- **Resource isolation**: Each transfer gets dedicated CPU and memory resources

#### Fargate Components

**1. ECS Cluster**
- Name: `S3ZipDownloaderCluster`
- VPC: Dedicated VPC with 2 availability zones for high availability
- NAT Gateway: 1 NAT gateway for outbound internet access
- Container Insights: Enabled for monitoring

**2. Task Definition**
- **CPU**: 2 vCPU (2048 CPU units)
- **Memory**: 4 GB (4096 MB)
- **Platform**: Fargate LATEST
- **Network Mode**: awsvpc (required for Fargate)
- **Container Image**: Stored in Amazon ECR (Elastic Container Registry)

**3. Worker Container**
- **Base Image**: Node.js 18 Alpine
- **Purpose**: Streams files from source URL to S3
- **Logging**: CloudWatch Logs (`/ecs/s3-zip-downloader-worker`)
- **Environment Variables**:
  - `AWS_REGION`: AWS region for S3 operations
  - `DYNAMODB_TABLE_NAME`: Table for transfer state
  - `TRANSFER_ID`: Unique transfer identifier (runtime)
  - `SOURCE_URL`: Source file URL (runtime)
  - `BUCKET`: Target S3 bucket (runtime)
  - `KEY_PREFIX`: Optional S3 key prefix (runtime)

**4. IAM Roles**

*Task Execution Role* (for ECS to manage the container):
- Pull images from ECR
- Write logs to CloudWatch
- Managed policy: `AmazonECSTaskExecutionRolePolicy`

*Task Role* (for the container application):
- Write objects to S3 (`s3:PutObject`, `s3:PutObjectAcl`, `s3:AbortMultipartUpload`)
- List S3 buckets (`s3:ListBucket`, `s3:GetBucketLocation`)
- Read/write DynamoDB transfer state (`dynamodb:GetItem`, `dynamodb:UpdateItem`, `dynamodb:PutItem`)

**5. ECR Repository**
- Name: `s3-zip-downloader-worker`
- Image scanning: Enabled (vulnerability detection)
- Lifecycle: Images tagged with version numbers
- Latest tag: Used by task definition

#### Workflow: Job Submission to Completion

```
1. User submits job via frontend
   ↓
2. API Gateway → Lambda (Job Submission Handler)
   - Validates input
   - Generates transfer ID
   - Creates DynamoDB record (status: "pending")
   - Starts Step Functions execution
   - Returns transfer ID immediately
   ↓
3. Step Functions State Machine
   - Launches ECS Fargate task with transfer parameters
   - Waits for task completion (up to 48 hours)
   - Handles retries on transient failures (2 retries with exponential backoff)
   - Updates DynamoDB on failure
   ↓
4. Fargate Worker Container
   - Reads transfer record from DynamoDB
   - Validates source URL accessibility
   - Validates S3 bucket permissions
   - Streams file from source URL
   - Uploads to S3 using multipart upload
   - Updates DynamoDB progress every 1% or 100MB
   - Updates DynamoDB on completion/failure
   ↓
5. Frontend polls progress
   - API Gateway → Lambda (Progress Query Handler)
   - Reads DynamoDB for current status
   - Returns progress percentage and status
```

#### Step Functions State Machine

The state machine orchestrates the transfer workflow:

**States:**
1. **RunFargateTask**: Launches ECS Fargate task with transfer parameters
   - Integration pattern: `RUN_JOB` (waits for task completion)
   - Timeout: 48 hours
   - Heartbeat: 48 hours
   - Retry policy: 2 retries with 30s initial interval, exponential backoff (2x)

2. **UpdateDynamoDBOnFailure**: Updates transfer status on error
   - Sets status to "failed"
   - Records error message
   - Sets end time

3. **TransferSucceeded**: Success state (terminal)

4. **TransferFailed**: Failure state (terminal)

**Error Handling:**
- Catches all errors from Fargate task (`States.ALL`)
- Stores error details in `errorInfo` field
- Updates DynamoDB with failure status
- Retries transient failures (ECS exceptions, timeouts)

#### Monitoring and Logging

**CloudWatch Logs:**
- `/ecs/s3-zip-downloader-worker`: Worker container logs
- `/aws/stepfunctions/s3-zip-downloader`: Step Functions execution logs
- `/aws/lambda/JobSubmissionFunction`: Job submission logs
- `/aws/lambda/ProgressQueryFunction`: Progress query logs

**CloudWatch Metrics:**
- ECS task CPU and memory utilization
- ECS task count (running, pending, stopped)
- Step Functions execution count and duration
- Lambda invocations, errors, throttles

**CloudWatch Alarms:**
- Job submission Lambda errors (threshold: 5 in 5 minutes)
- Job submission Lambda throttles (threshold: 3 in 5 minutes)
- Progress query Lambda errors (threshold: 5 in 5 minutes)
- Progress query Lambda throttles (threshold: 3 in 5 minutes)

#### Scaling and Concurrency

- **Concurrent Transfers**: Multiple Fargate tasks can run simultaneously
- **Task Limit**: Default AWS account limit (check ECS service quotas)
- **Auto-scaling**: Not configured (each transfer = 1 task)
- **Cost Optimization**: Tasks only run during active transfers

#### Resource Cleanup

- **Task Termination**: Tasks stop automatically on completion or failure
- **Log Retention**: 7 days for all log groups
- **DynamoDB TTL**: Records auto-delete after 30 days (configurable)
- **ECR Images**: Manual cleanup recommended for old versions

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd s3-zip-downloader
```

### 2. Install Dependencies

Install dependencies for all packages:

```bash
npm run install:all
```

This will install dependencies for:
- Root workspace
- Frontend application
- Backend Lambda function
- Infrastructure CDK project

## Configuration

### Environment Variables

#### Backend Lambda Configuration

The Lambda function uses the following environment variables (automatically configured by CDK):

- `AWS_REGION` - AWS region where resources are deployed (default: us-east-1)
- `MAX_FILE_SIZE` - Maximum file size in bytes (default: 5368709120 = 5GB)
- `TIMEOUT_SECONDS` - Lambda timeout in seconds (default: 900 = 15 minutes)

These are set in `infrastructure/lib/s3-zip-downloader-stack.ts` and can be modified before deployment.

#### CDK Configuration

The CDK stack can be customized by modifying `infrastructure/lib/s3-zip-downloader-stack.ts`:

```typescript
// Lambda configuration
const lambda = new lambda.Function(this, 'S3ZipDownloaderFunction', {
  runtime: lambda.Runtime.NODEJS_18_X,
  memorySize: 1024,        // Adjust memory allocation
  timeout: Duration.minutes(15),  // Adjust timeout
  // ...
});
```

### AWS Region Selection

By default, the application deploys to `us-east-1`. To change the region:

1. Update your AWS CLI default region:
   ```bash
   aws configure set region us-west-2
   ```

2. Or specify region in CDK deployment:
   ```bash
   cd infrastructure
   cdk deploy --region us-west-2
   ```

## Deployment Steps

### Step 1: Bootstrap CDK (First Time Only)

If this is your first time using CDK in your AWS account/region, bootstrap it:

```bash
cd infrastructure
cdk bootstrap
```

This creates the necessary S3 bucket and IAM roles for CDK deployments.

### Step 2: Build All Components

Build the frontend, backend, and infrastructure:

```bash
npm run build:all
```

This command:
- Compiles TypeScript for backend Lambda functions
- Builds React frontend for production
- Compiles CDK infrastructure code

**Note:** The Fargate worker container will be built separately in Step 5.

### Step 3: Review Infrastructure Changes (Optional)

Preview what will be created in AWS:

```bash
cd infrastructure
cdk synth
```

To see a detailed diff of changes:

```bash
cdk diff
```

### Step 4: Deploy Infrastructure

Deploy the CDK stack to AWS:

```bash
cd infrastructure
npm run deploy
```

Or from the root directory:

```bash
npm run deploy
```

The deployment process will:
1. Create an S3 bucket for frontend hosting
2. Create a CloudFront distribution
3. Create Lambda functions (job submission and progress query)
4. Create an API Gateway REST API
5. Create a DynamoDB table for transfer state
6. Create an ECS Fargate cluster
7. Create an ECR repository for the worker container
8. Create a Step Functions state machine
9. Set up IAM roles and permissions
10. Configure CloudWatch logging and alarms

**Note:** The first deployment typically takes 10-15 minutes due to CloudFront distribution and VPC creation.

### Step 5: Note the Output URLs

After deployment completes, CDK will output important information:

```
Outputs:
S3ZipDownloaderStack.ApiEndpoint = https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/
S3ZipDownloaderStack.CloudFrontUrl = https://xxxxxxxxxx.cloudfront.net
S3ZipDownloaderStack.FrontendBucketName = s3-zip-downloader-frontend-xxxxxxxxxx
S3ZipDownloaderStack.EcrRepositoryUri = xxxxxxxxxxxx.dkr.ecr.us-east-1.amazonaws.com/s3-zip-downloader-worker
S3ZipDownloaderStack.EcsClusterName = S3ZipDownloaderCluster
S3ZipDownloaderStack.DynamoDBTableName = S3ZipDownloaderStack-TransferTableXXXXXXXX
S3ZipDownloaderStack.StateMachineArn = arn:aws:states:us-east-1:xxxxxxxxxxxx:stateMachine:S3ZipDownloaderTransfer
```

Save these outputs - you'll need them for the next steps.

### Step 6: Build and Push Docker Image

Build the Fargate worker container and push it to ECR:

```bash
npm run build:docker
```

Or manually:

```bash
# Windows PowerShell
pwsh -File scripts/build-docker.ps1

# Linux/Mac
bash scripts/build-docker.sh
```

This script will:
1. Authenticate Docker with ECR
2. Build the worker container image
3. Tag the image with 'latest'
4. Push the image to ECR

**Note:** This step requires Docker to be running. The first build may take 5-10 minutes.

### Step 7: Deploy Frontend to S3

Upload the built frontend to S3:

```bash
npm run deploy:frontend
```

This script:
1. Syncs the `frontend/dist` directory to the S3 bucket
2. Sets appropriate content types and cache headers
3. Invalidates the CloudFront cache

### Step 8: Access the Application

Open the CloudFront URL in your browser:

```
https://xxxxxxxxxx.cloudfront.net
```

The application is now live and ready to use!

**Complete Deployment Checklist:**
- ✅ Infrastructure deployed (CDK)
- ✅ Docker image built and pushed to ECR
- ✅ Frontend deployed to S3 and CloudFront
- ✅ Application accessible via CloudFront URL

## Updating the Application

### Update Frontend Only

If you only changed frontend code:

```bash
cd frontend
npm run build
cd ..
npm run deploy:frontend
```

### Update Backend Only

If you only changed backend code:

```bash
cd backend
npm run build
cd ../infrastructure
cdk deploy
```

### Update Infrastructure

If you changed CDK infrastructure code:

```bash
cd infrastructure
npm run build
cdk deploy
```

## Monitoring and Logs

### CloudWatch Logs

View Lambda function logs:

1. Go to AWS Console → CloudWatch → Log Groups
2. Find `/aws/lambda/S3ZipDownloaderFunction`
3. View log streams for execution details

Or use AWS CLI:

```bash
aws logs tail /aws/lambda/S3ZipDownloaderFunction --follow
```

### CloudWatch Metrics

Monitor application metrics:

1. Go to AWS Console → CloudWatch → Metrics
2. Select Lambda metrics
3. View invocations, errors, duration, throttles

### API Gateway Logs

Enable API Gateway logging in `infrastructure/lib/s3-zip-downloader-stack.ts` if needed.

## Troubleshooting

### Issue: CDK Bootstrap Failed

**Error:** `Need to perform AWS calls for account XXX, but no credentials found`

**Solution:**
- Verify AWS credentials: `aws sts get-caller-identity`
- Reconfigure AWS CLI: `aws configure`
- Ensure your IAM user has sufficient permissions

### Issue: Deployment Fails with Permission Errors

**Error:** `User: arn:aws:iam::XXX:user/YYY is not authorized to perform: cloudformation:CreateStack`

**Solution:**
- Your AWS user needs permissions to create CloudFormation stacks
- Attach the `AdministratorAccess` policy (for testing) or create a custom policy with required permissions
- Contact your AWS administrator for proper permissions

### Issue: Lambda Function Times Out

**Error:** `Task timed out after 15.00 seconds`

**Solution:**
- Increase Lambda timeout in `infrastructure/lib/s3-zip-downloader-stack.ts`
- Increase API Gateway timeout (max 29 seconds for REST API)
- Consider using Step Functions for very large files

### Issue: Frontend Shows 404 Errors

**Error:** Frontend loads but API calls return 404

**Solution:**
- Verify API Gateway endpoint URL is correct
- Check CORS configuration in API Gateway
- Ensure Lambda function is deployed and accessible
- Check CloudWatch logs for Lambda errors

### Issue: S3 Upload Fails with Access Denied

**Error:** `Access Denied` when uploading to S3

**Solution:**
- Verify the Lambda execution role has S3 write permissions
- Check the target S3 bucket exists and is accessible
- Verify bucket policies don't block the Lambda role
- Ensure the bucket is in the same region as the Lambda function

### Issue: CloudFront Distribution Not Working

**Error:** CloudFront URL returns errors or shows old content

**Solution:**
- Wait 10-15 minutes for distribution to fully deploy
- Invalidate CloudFront cache: `npm run deploy:frontend`
- Check S3 bucket has correct files
- Verify CloudFront origin settings point to correct S3 bucket

### Issue: Large Files Fail to Transfer

**Error:** Transfer fails for files over 1GB

**Solution:**
- Verify Lambda has sufficient memory (1024MB recommended)
- Check Lambda timeout is set to 15 minutes
- Ensure multipart upload is working correctly
- Check CloudWatch logs for specific errors

### Issue: Build Fails

**Error:** TypeScript compilation errors

**Solution:**
- Ensure Node.js version is 18 or higher
- Delete `node_modules` and reinstall: `npm run install:all`
- Clear TypeScript cache: `rm -rf */dist */node_modules/.cache`
- Check for TypeScript version conflicts

### Issue: Docker Build Fails

**Error:** `Cannot connect to the Docker daemon`

**Solution:**
- Ensure Docker Desktop is running (Windows/Mac)
- Start Docker daemon: `sudo systemctl start docker` (Linux)
- Verify Docker is running: `docker ps`

### Issue: ECR Push Fails

**Error:** `no basic auth credentials` or `denied: Your authorization token has expired`

**Solution:**
- Re-authenticate with ECR: The build script handles this automatically
- Verify AWS credentials: `aws sts get-caller-identity`
- Ensure your IAM user has ECR permissions (`ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`)

### Issue: Fargate Task Fails to Start

**Error:** Task stops immediately after starting

**Solution:**
- Check CloudWatch logs: `/ecs/s3-zip-downloader-worker`
- Verify Docker image exists in ECR with 'latest' tag
- Ensure task role has S3 and DynamoDB permissions
- Check VPC configuration (NAT gateway, internet access)

### Issue: Transfer Stuck in "Pending" Status

**Error:** Transfer never starts, stays in "pending" status

**Solution:**
- Check Step Functions execution in AWS Console
- Verify Fargate task is running in ECS Console
- Check CloudWatch logs for Step Functions and ECS
- Ensure ECR image was pushed successfully
- Verify Step Functions has permission to launch ECS tasks

### Issue: Transfer Fails with "Access Denied"

**Error:** Transfer fails with S3 access denied error

**Solution:**
- Verify the Fargate task role has S3 write permissions
- Check the target S3 bucket exists
- Ensure bucket policies don't block the task role
- Verify the bucket is in the same region or cross-region access is allowed

## Cost Estimation

Typical monthly costs for moderate usage (estimates):

- **S3 Storage:** $0.023 per GB (first 50 TB)
- **CloudFront:** $0.085 per GB data transfer (first 10 TB)
- **Lambda:** $0.20 per 1M requests + $0.0000166667 per GB-second
- **API Gateway:** $3.50 per million requests
- **ECS Fargate:** $0.04048 per vCPU per hour + $0.004445 per GB per hour
- **DynamoDB:** $0.25 per million write requests + $0.25 per GB stored
- **Step Functions:** $0.025 per 1000 state transitions
- **CloudWatch Logs:** $0.50 per GB ingested
- **NAT Gateway:** $0.045 per hour + $0.045 per GB processed

**Example 1:** 100 transfers of 1GB files per month (avg 10 min per transfer):
- S3 Storage: ~$2.30
- CloudFront: ~$8.50
- Lambda: ~$0.50
- API Gateway: ~$0.01
- Fargate (100 tasks × 10 min): ~$1.35
- DynamoDB: ~$0.10
- Step Functions: ~$0.01
- NAT Gateway: ~$32.40 (always running)
- CloudWatch: ~$0.50
- **Total: ~$45.67/month**

**Example 2:** 1000 transfers of 100MB files per month (avg 5 min per transfer):
- S3 Storage: ~$2.30
- CloudFront: ~$8.50
- Lambda: ~$1.00
- API Gateway: ~$0.01
- Fargate (1000 tasks × 5 min): ~$6.75
- DynamoDB: ~$0.50
- Step Functions: ~$0.03
- NAT Gateway: ~$32.40 (always running)
- CloudWatch: ~$1.00
- **Total: ~$52.49/month**

**Cost Optimization Tips:**
- NAT Gateway is the largest fixed cost (~$32/month). Consider using VPC endpoints for S3 to eliminate NAT Gateway costs.
- Use DynamoDB on-demand billing for unpredictable workloads
- Set CloudWatch log retention to 7 days to reduce storage costs
- Enable DynamoDB TTL to automatically delete old transfer records
- Use S3 lifecycle policies to transition old files to cheaper storage classes

**Note:** Costs vary by region and usage patterns. Use AWS Cost Calculator for accurate estimates.

## Security Best Practices

1. **IAM Roles:** Never hardcode AWS credentials - always use IAM roles
2. **Least Privilege:** Grant minimum required permissions to Lambda role
3. **HTTPS Only:** Application enforces HTTPS for source URLs
4. **Input Validation:** All inputs validated on frontend and backend
5. **Rate Limiting:** API Gateway throttling prevents abuse
6. **Monitoring:** Enable CloudWatch alarms for unusual activity
7. **Bucket Policies:** Restrict S3 bucket access appropriately

## Cleanup / Undeployment

To remove all AWS resources and avoid ongoing charges:

```bash
cd infrastructure
cdk destroy
```

This will delete:
- CloudFront distribution
- S3 buckets (if empty)
- Lambda function
- API Gateway
- IAM roles
- CloudWatch log groups

**Note:** S3 buckets with content must be manually emptied before CDK can delete them.

To manually empty the frontend bucket:

```bash
aws s3 rm s3://YOUR-BUCKET-NAME --recursive
```

## Additional Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [AWS CloudFront Documentation](https://docs.aws.amazon.com/cloudfront/)
- [AWS Cloudscape Design System](https://cloudscape.design/)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review CloudWatch logs for error details
3. Consult AWS documentation
4. Open an issue in the project repository
