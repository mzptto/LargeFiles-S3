#!/bin/bash

# CDK Deployment Script
# 
# This script:
# 1. Validates AWS credentials are configured
# 2. Builds the backend and infrastructure code
# 3. Deploys the CDK stack
# 4. Displays stack outputs
#
# Usage:
#   ./scripts/deploy-cdk.sh [--require-approval]

set -e  # Exit on error

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check for --require-approval flag
REQUIRE_APPROVAL=false
if [ "$1" == "--require-approval" ]; then
    REQUIRE_APPROVAL=true
fi

log_info "Starting CDK deployment...\n"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    log_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if CDK is installed
if ! command -v cdk &> /dev/null; then
    log_error "AWS CDK is not installed. Please install it first:"
    log_info "  npm install -g aws-cdk"
    exit 1
fi

# Validate AWS credentials
log_info "Validating AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    log_error "AWS credentials are not configured or invalid."
    log_info "Please configure your credentials using:"
    log_info "  aws configure"
    exit 1
fi

# Get AWS account and region
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)

if [ -z "$AWS_REGION" ]; then
    AWS_REGION="us-east-1"
    log_warning "No default region configured, using us-east-1"
fi

log_success "AWS Account: ${AWS_ACCOUNT}"
log_success "AWS Region: ${AWS_REGION}\n"

# Build backend
log_info "Building backend..."
cd backend
npm run build
cd ..
log_success "Backend build complete\n"

# Build infrastructure
log_info "Building infrastructure..."
cd infrastructure
npm run build
cd ..
log_success "Infrastructure build complete\n"

# Deploy CDK stack
log_info "Deploying CDK stack..."
cd infrastructure

if [ "$REQUIRE_APPROVAL" = true ]; then
    npm run deploy:with-approval
else
    npm run deploy
fi

cd ..
log_success "CDK deployment complete!\n"

# Display outputs
log_info "Stack Outputs:"
echo ""

if [ -f "infrastructure/outputs.json" ]; then
    node -e "
        const outputs = require('./infrastructure/outputs.json');
        const stackName = Object.keys(outputs)[0];
        const stackOutputs = outputs[stackName];
        
        console.log('  API Endpoint:        ', stackOutputs.ApiEndpoint || 'N/A');
        console.log('  CloudFront URL:      ', 'https://' + (stackOutputs.CloudFrontUrl || 'N/A'));
        console.log('  Frontend Bucket:     ', stackOutputs.FrontendBucketName || 'N/A');
        console.log('  Test Bucket:         ', stackOutputs.TestBucketName || 'N/A');
        console.log('  DynamoDB Table:      ', stackOutputs.DynamoDBTableName || 'N/A');
        console.log('  ECR Repository:      ', stackOutputs.EcrRepositoryUri || 'N/A');
        console.log('  ECS Cluster:         ', stackOutputs.EcsClusterName || 'N/A');
        console.log('  State Machine ARN:   ', stackOutputs.StateMachineArn || 'N/A');
    "
else
    log_warning "Outputs file not found"
fi

echo ""
log_success "Deployment complete!"
log_info "\nNext steps:"
log_info "  1. Build and push Docker image: npm run build:docker"
log_info "  2. Deploy frontend: npm run deploy:frontend"
