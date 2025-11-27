# CDK Deployment Script (PowerShell)
# 
# This script:
# 1. Validates AWS credentials are configured
# 2. Builds the backend and infrastructure code
# 3. Deploys the CDK stack
# 4. Displays stack outputs
#
# Usage:
#   .\scripts\deploy-cdk.ps1 [-RequireApproval]

param(
    [switch]$RequireApproval
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

Log-Info "Starting CDK deployment...`n"

# Check if AWS CLI is installed
try {
    aws --version | Out-Null
} catch {
    Log-Error "AWS CLI is not installed. Please install it first."
    exit 1
}

# Check if CDK is installed
try {
    cdk --version | Out-Null
} catch {
    Log-Error "AWS CDK is not installed. Please install it first:"
    Log-Info "  npm install -g aws-cdk"
    exit 1
}

# Validate AWS credentials
Log-Info "Validating AWS credentials..."
try {
    $CallerIdentity = aws sts get-caller-identity | ConvertFrom-Json
    $AwsAccount = $CallerIdentity.Account
} catch {
    Log-Error "AWS credentials are not configured or invalid."
    Log-Info "Please configure your credentials using:"
    Log-Info "  aws configure"
    exit 1
}

# Get AWS region
try {
    $AwsRegion = aws configure get region
    if (-not $AwsRegion) {
        $AwsRegion = "us-east-1"
        Log-Warning "No default region configured, using us-east-1"
    }
} catch {
    $AwsRegion = "us-east-1"
    Log-Warning "No default region configured, using us-east-1"
}

Log-Success "AWS Account: $AwsAccount"
Log-Success "AWS Region: $AwsRegion`n"

# Build backend
Log-Info "Building backend..."
Push-Location backend
npm run build
Pop-Location
Log-Success "Backend build complete`n"

# Build infrastructure
Log-Info "Building infrastructure..."
Push-Location infrastructure
npm run build
Pop-Location
Log-Success "Infrastructure build complete`n"

# Deploy CDK stack
Log-Info "Deploying CDK stack..."
Push-Location infrastructure

if ($RequireApproval) {
    npm run deploy:with-approval
} else {
    npm run deploy
}

Pop-Location
Log-Success "CDK deployment complete!`n"

# Display outputs
Log-Info "Stack Outputs:"
Write-Host ""

$OutputsFile = "infrastructure\outputs.json"
if (Test-Path $OutputsFile) {
    $Outputs = Get-Content $OutputsFile | ConvertFrom-Json
    $StackName = $Outputs.PSObject.Properties.Name[0]
    $StackOutputs = $Outputs.$StackName
    
    Write-Host "  API Endpoint:        " ($StackOutputs.ApiEndpoint ?? "N/A")
    Write-Host "  CloudFront URL:      " ("https://" + ($StackOutputs.CloudFrontUrl ?? "N/A"))
    Write-Host "  Frontend Bucket:     " ($StackOutputs.FrontendBucketName ?? "N/A")
    Write-Host "  Test Bucket:         " ($StackOutputs.TestBucketName ?? "N/A")
    Write-Host "  DynamoDB Table:      " ($StackOutputs.DynamoDBTableName ?? "N/A")
    Write-Host "  ECR Repository:      " ($StackOutputs.EcrRepositoryUri ?? "N/A")
    Write-Host "  ECS Cluster:         " ($StackOutputs.EcsClusterName ?? "N/A")
    Write-Host "  State Machine ARN:   " ($StackOutputs.StateMachineArn ?? "N/A")
} else {
    Log-Warning "Outputs file not found"
}

Write-Host ""
Log-Success "Deployment complete!"
Log-Info "`nNext steps:"
Log-Info "  1. Build and push Docker image: npm run build:docker"
Log-Info "  2. Deploy frontend: npm run deploy:frontend"
