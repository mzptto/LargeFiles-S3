# Docker Build and Push Script for Fargate Worker Container (PowerShell)
# 
# This script:
# 1. Builds the backend TypeScript code
# 2. Builds the Docker image for the Fargate worker
# 3. Tags the image with version and 'latest'
# 4. Pushes the image to AWS ECR
#
# Usage:
#   .\scripts\build-docker.ps1 [version]
#   
# If version is not provided, uses 'latest'

param(
    [string]$Version = "latest"
)

$ErrorActionPreference = "Stop"

# Helper functions
function Log-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

function Log-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Log-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Log-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

Log-Info "Starting Docker build process for version: $Version`n"

# Check if Docker is installed
try {
    docker --version | Out-Null
} catch {
    Log-Error "Docker is not installed. Please install Docker first."
    exit 1
}

# Check if AWS CLI is installed
try {
    aws --version | Out-Null
} catch {
    Log-Error "AWS CLI is not installed. Please install it first."
    exit 1
}

# Read CDK outputs to get ECR repository URI
$OutputsFile = "infrastructure\outputs.json"
if (-not (Test-Path $OutputsFile)) {
    Log-Error "CDK outputs file not found. Please deploy the infrastructure first:"
    Log-Info "  npm run deploy:cdk"
    exit 1
}

# Extract ECR repository URI from outputs
$Outputs = Get-Content $OutputsFile | ConvertFrom-Json
$StackName = $Outputs.PSObject.Properties.Name[0]
$EcrRepoUri = $Outputs.$StackName.EcrRepositoryUri

if (-not $EcrRepoUri) {
    Log-Error "ECR repository URI not found in CDK outputs"
    exit 1
}

Log-Info "ECR Repository: $EcrRepoUri"

# Extract AWS region and account ID from ECR URI
$EcrParts = $EcrRepoUri -split '\.'
$AwsRegion = $EcrParts[3]
$AwsAccountId = ($EcrParts[0] -split '/')[0]

Log-Info "AWS Region: $AwsRegion"
Log-Info "AWS Account: $AwsAccountId`n"

# Build backend TypeScript code
Log-Info "Building backend TypeScript code..."
Push-Location backend
npm run build
Pop-Location
Log-Success "Backend build complete`n"

# Build Docker image
Log-Info "Building Docker image..."
docker build -f backend/worker.Dockerfile -t s3-zip-downloader-worker:$Version backend/
Log-Success "Docker image built successfully`n"

# Tag image with ECR repository URI
Log-Info "Tagging Docker image..."
docker tag s3-zip-downloader-worker:$Version ${EcrRepoUri}:$Version
docker tag s3-zip-downloader-worker:$Version ${EcrRepoUri}:latest
Log-Success "Image tagged: ${EcrRepoUri}:$Version"
Log-Success "Image tagged: ${EcrRepoUri}:latest`n"

# Login to ECR
Log-Info "Logging in to Amazon ECR..."
$LoginPassword = aws ecr get-login-password --region $AwsRegion
$LoginPassword | docker login --username AWS --password-stdin "$AwsAccountId.dkr.ecr.$AwsRegion.amazonaws.com"
Log-Success "Logged in to ECR`n"

# Push image to ECR
Log-Info "Pushing image to ECR..."
docker push ${EcrRepoUri}:$Version
docker push ${EcrRepoUri}:latest
Log-Success "Image pushed successfully`n"

Log-Success "Docker build and push complete!"
Log-Info "`nImage: ${EcrRepoUri}:$Version"
Log-Info "Image: ${EcrRepoUri}:latest"
