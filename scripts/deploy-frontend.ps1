# Frontend Deployment Script (PowerShell)
# 
# This script:
# 1. Reads the CDK outputs to get bucket name and CloudFront distribution ID
# 2. Syncs the built frontend files to S3 with appropriate content types and cache headers
# 3. Invalidates the CloudFront cache to ensure users get the latest version
#
# Usage:
#   .\scripts\deploy-frontend.ps1

param()

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

Log-Info "Starting frontend deployment...`n"

# Check if AWS CLI is installed
try {
    $AwsVersion = aws --version
    Log-Info "AWS CLI version: $AwsVersion"
} catch {
    Log-Error "AWS CLI is not installed. Please install it first."
    Log-Error "Visit: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
}

# Read CDK outputs
$OutputsPath = "infrastructure\outputs.json"
if (-not (Test-Path $OutputsPath)) {
    Log-Error "CDK outputs file not found. Please deploy the infrastructure first:"
    Log-Info "  npm run deploy:cdk"
    exit 1
}

try {
    $Outputs = Get-Content $OutputsPath | ConvertFrom-Json
} catch {
    Log-Error "Failed to parse CDK outputs: $($_.Exception.Message)"
    exit 1
}

# Extract stack outputs
$StackName = $Outputs.PSObject.Properties.Name[0]
if (-not $StackName) {
    Log-Error "No stack found in outputs file"
    exit 1
}

$StackOutputs = $Outputs.$StackName
$BucketName = $StackOutputs.FrontendBucketName
$CloudFrontUrl = $StackOutputs.CloudFrontUrl

# Extract CloudFront distribution ID
$DistributionId = $null
if ($CloudFrontUrl) {
    try {
        Log-Info "Looking up CloudFront distribution ID..."
        $DistributionId = (aws cloudfront list-distributions --query "DistributionList.Items[?DomainName=='$CloudFrontUrl'].Id" --output text).Trim()
    } catch {
        Log-Warning "Could not retrieve CloudFront distribution ID. Cache invalidation will be skipped."
    }
}

if (-not $BucketName) {
    Log-Error "Frontend bucket name not found in CDK outputs"
    exit 1
}

Log-Info "Bucket: $BucketName"
Log-Info "CloudFront URL: https://$CloudFrontUrl"
if ($DistributionId) {
    Log-Info "Distribution ID: $DistributionId`n"
} else {
    Log-Warning "Distribution ID not found`n"
}

# Check if frontend build exists
$DistPath = "frontend\dist"
if (-not (Test-Path $DistPath)) {
    Log-Error "Frontend build not found. Please build the frontend first:"
    Log-Info "  npm run build:frontend:prod"
    exit 1
}

# Sync files to S3 with appropriate cache headers
Log-Info "Syncing files to S3..."

# Upload HTML files with no-cache headers (always check for updates)
Log-Info "  Uploading HTML files (no-cache)..."
aws s3 sync $DistPath s3://$BucketName/ `
    --exclude "*" --include "*.html" `
    --content-type "text/html" `
    --cache-control "no-cache, no-store, must-revalidate" `
    --metadata-directive REPLACE

# Upload JS files with long cache (they have content hashes)
Log-Info "  Uploading JavaScript files (1 year cache)..."
aws s3 sync $DistPath s3://$BucketName/ `
    --exclude "*" --include "*.js" `
    --content-type "application/javascript" `
    --cache-control "public, max-age=31536000, immutable" `
    --metadata-directive REPLACE

# Upload CSS files with long cache (they have content hashes)
Log-Info "  Uploading CSS files (1 year cache)..."
aws s3 sync $DistPath s3://$BucketName/ `
    --exclude "*" --include "*.css" `
    --content-type "text/css" `
    --cache-control "public, max-age=31536000, immutable" `
    --metadata-directive REPLACE

# Upload image files
Log-Info "  Uploading image files..."
try {
    aws s3 sync $DistPath s3://$BucketName/ `
        --exclude "*" --include "*.png" --include "*.jpg" --include "*.jpeg" --include "*.gif" --include "*.svg" --include "*.ico" `
        --cache-control "public, max-age=31536000" `
        --metadata-directive REPLACE
} catch {
    # Ignore errors if no image files exist
}

# Upload any remaining files
Log-Info "  Uploading remaining files..."
try {
    aws s3 sync $DistPath s3://$BucketName/ `
        --exclude "*.html" --exclude "*.js" --exclude "*.css" --exclude "*.png" --exclude "*.jpg" --exclude "*.jpeg" --exclude "*.gif" --exclude "*.svg" --exclude "*.ico" `
        --cache-control "public, max-age=3600"
} catch {
    # Ignore errors if no other files exist
}

Log-Success "Files synced to S3 successfully!`n"

# Invalidate CloudFront cache
if ($DistributionId) {
    Log-Info "Invalidating CloudFront cache..."
    try {
        $InvalidationId = (aws cloudfront create-invalidation --distribution-id $DistributionId --paths "/*" --query "Invalidation.Id" --output text).Trim()
        Log-Success "CloudFront cache invalidation created: $InvalidationId`n"
    } catch {
        Log-Warning "Failed to create CloudFront invalidation. Users may see cached content."
        Log-Warning "You can manually invalidate at: https://console.aws.amazon.com/cloudfront/`n"
    }
} else {
    Log-Warning "Skipping CloudFront cache invalidation (distribution ID not found)`n"
}

Log-Success "Frontend deployment complete!"
Log-Info "`nYour application is available at: https://$CloudFrontUrl"
