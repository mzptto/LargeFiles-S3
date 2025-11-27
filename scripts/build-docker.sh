#!/bin/bash

# Docker Build and Push Script for Fargate Worker Container
# 
# This script:
# 1. Builds the backend TypeScript code
# 2. Builds the Docker image for the Fargate worker
# 3. Tags the image with version and 'latest'
# 4. Pushes the image to AWS ECR
#
# Usage:
#   ./scripts/build-docker.sh [version]
#   
# If version is not provided, uses 'latest'

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

# Get version from argument or use 'latest'
VERSION=${1:-latest}

log_info "Starting Docker build process for version: ${VERSION}\n"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    log_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Read CDK outputs to get ECR repository URI
OUTPUTS_FILE="infrastructure/outputs.json"
if [ ! -f "$OUTPUTS_FILE" ]; then
    log_error "CDK outputs file not found. Please deploy the infrastructure first:"
    log_info "  npm run deploy:cdk"
    exit 1
fi

# Extract ECR repository URI from outputs
ECR_REPO_URI=$(node -e "
    const outputs = require('./${OUTPUTS_FILE}');
    const stackName = Object.keys(outputs)[0];
    console.log(outputs[stackName].EcrRepositoryUri);
")

if [ -z "$ECR_REPO_URI" ]; then
    log_error "ECR repository URI not found in CDK outputs"
    exit 1
fi

log_info "ECR Repository: ${ECR_REPO_URI}"

# Extract AWS region and account ID from ECR URI
AWS_REGION=$(echo $ECR_REPO_URI | cut -d'.' -f4)
AWS_ACCOUNT_ID=$(echo $ECR_REPO_URI | cut -d'.' -f1 | cut -d'/' -f1)

log_info "AWS Region: ${AWS_REGION}"
log_info "AWS Account: ${AWS_ACCOUNT_ID}\n"

# Build backend TypeScript code
log_info "Building backend TypeScript code..."
cd backend
npm run build
cd ..
log_success "Backend build complete\n"

# Build Docker image
log_info "Building Docker image..."
docker build -f backend/worker.Dockerfile -t s3-zip-downloader-worker:${VERSION} backend/
log_success "Docker image built successfully\n"

# Tag image with ECR repository URI
log_info "Tagging Docker image..."
docker tag s3-zip-downloader-worker:${VERSION} ${ECR_REPO_URI}:${VERSION}
docker tag s3-zip-downloader-worker:${VERSION} ${ECR_REPO_URI}:latest
log_success "Image tagged: ${ECR_REPO_URI}:${VERSION}"
log_success "Image tagged: ${ECR_REPO_URI}:latest\n"

# Login to ECR
log_info "Logging in to Amazon ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
log_success "Logged in to ECR\n"

# Push image to ECR
log_info "Pushing image to ECR..."
docker push ${ECR_REPO_URI}:${VERSION}
docker push ${ECR_REPO_URI}:latest
log_success "Image pushed successfully\n"

log_success "Docker build and push complete!"
log_info "\nImage: ${ECR_REPO_URI}:${VERSION}"
log_info "Image: ${ECR_REPO_URI}:latest"
