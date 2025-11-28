/**
 * Fargate Worker Entry Point
 * Requirements: 3.1, 7.2, 8.2
 * 
 * This worker runs in an ECS Fargate container and handles the actual file transfer
 * from source URL to S3. It receives configuration via environment variables,
 * performs the streaming transfer, and updates DynamoDB with progress and status.
 */

import { DynamoDBService } from '../services/DynamoDBService.js';
import { StreamingService } from '../services/StreamingService.js';
import { S3Service } from '../services/S3Service.js';

interface WorkerConfig {
  transferId: string;
  sourceUrl: string;
  bucket: string;
  keyPrefix?: string;
  tableName: string;
  region: string;
}

/**
 * Parse environment variables and validate required configuration
 */
function parseEnvironmentVariables(): WorkerConfig {
  const transferId = process.env.TRANSFER_ID;
  const sourceUrl = process.env.SOURCE_URL;
  const bucket = process.env.BUCKET;
  const keyPrefix = process.env.KEY_PREFIX;
  const tableName = process.env.DYNAMODB_TABLE_NAME || 'S3ZipDownloaderTransfers';
  const region = process.env.AWS_REGION || 'us-east-1';

  // Validate required environment variables
  if (!transferId) {
    throw new Error('Missing required environment variable: TRANSFER_ID');
  }
  if (!sourceUrl) {
    throw new Error('Missing required environment variable: SOURCE_URL');
  }
  if (!bucket) {
    throw new Error('Missing required environment variable: BUCKET');
  }

  return {
    transferId,
    sourceUrl,
    bucket,
    keyPrefix,
    tableName,
    region,
  };
}

/**
 * Formats error message for user-friendly display
 * Requirements: 3.4, 3.5, 8.3, 8.4
 */
function formatErrorMessage(error: any): string {
  if (!error) {
    return 'Unknown error occurred';
  }

  // Handle custom error types
  if (error.name === 'UrlFetchError') {
    return error.message;
  }
  if (error.name === 'S3Error') {
    return error.message;
  }
  if (error.name === 'StreamingError') {
    return error.message;
  }
  if (error.name === 'ValidationError') {
    return error.message;
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return error.message;
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }

  // Fallback for unknown error types
  return String(error);
}

/**
 * Main worker function
 * Requirements: 3.4, 3.5, 8.3, 8.4
 */
async function main() {
  let config: WorkerConfig | undefined;
  let dynamoDBService: DynamoDBService | undefined;

  try {
    // Parse environment variables
    console.log('Parsing environment variables...');
    config = parseEnvironmentVariables();
    console.log(`Worker started for transfer ${config.transferId}`);
    console.log(`Source URL: ${config.sourceUrl}`);
    console.log(`Destination: s3://${config.bucket}/${config.keyPrefix || ''}`);

    // Initialize AWS SDK clients
    console.log('Initializing AWS SDK clients...');
    dynamoDBService = new DynamoDBService(config.tableName, config.region);
    const s3Service = new S3Service(config.region);
    // Pass DynamoDB service to StreamingService for progress updates
    const streamingService = new StreamingService(dynamoDBService);

    // Load transfer record from DynamoDB
    console.log('Loading transfer record from DynamoDB...');
    let transferRecord;
    try {
      transferRecord = await dynamoDBService.getTransferStatus(config.transferId);
    } catch (dbError: any) {
      const errorMessage = `Failed to load transfer record from DynamoDB: ${formatErrorMessage(dbError)}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
    
    if (!transferRecord) {
      throw new Error(`Transfer record not found for ID: ${config.transferId}`);
    }

    console.log(`Transfer record loaded. Status: ${transferRecord.status}`);

    // Log key prefix information
    if (config.keyPrefix) {
      console.log(`Using key prefix: ${config.keyPrefix}`);
    }

    // Validate bucket access
    // Requirements: 3.5 - Handle S3 errors (bucket not found, access denied)
    console.log('Validating S3 bucket access...');
    try {
      await s3Service.validateBucketAccess(config.bucket);
      console.log('Bucket access validated');
    } catch (s3Error: any) {
      const errorMessage = formatErrorMessage(s3Error);
      console.error(`Bucket validation failed: ${errorMessage}`);
      
      // Update DynamoDB with specific error
      if (dynamoDBService) {
        try {
          await dynamoDBService.markTransferFailed(config.transferId, errorMessage);
        } catch (dbError) {
          console.error('Failed to update DynamoDB with error status:', dbError);
        }
      }
      
      // Exit with error code
      process.exit(1);
    }

    // Invoke streaming service with progress callback
    // The StreamingService will handle key prefix concatenation with filename
    // Requirements: 3.4, 3.5, 8.3, 8.4 - Handle URL fetch, S3, and streaming errors
    console.log('Starting file transfer...');
    
    // Throttle console logging to reduce overhead (only log every 1% or 100MB)
    let lastLoggedPercentage = -1;
    let lastLoggedBytes = 0;
    const LOG_THRESHOLD_BYTES = 100 * 1024 * 1024; // 100MB
    
    const result = await streamingService.transferToS3(
      config.sourceUrl,
      config.bucket,
      config.keyPrefix,
      (bytesTransferred, totalBytes) => {
        // Progress callback - DynamoDB updates are handled by StreamingService
        const percentage = totalBytes > 0 ? Math.floor((bytesTransferred / totalBytes) * 100) : 0;
        const bytesDiff = bytesTransferred - lastLoggedBytes;
        
        // Only log if percentage changed by 1% or 100MB transferred
        if (percentage !== lastLoggedPercentage || bytesDiff >= LOG_THRESHOLD_BYTES) {
          console.log(`Progress: ${bytesTransferred}/${totalBytes} bytes (${percentage}%)`);
          lastLoggedPercentage = percentage;
          lastLoggedBytes = bytesTransferred;
        }
      },
      config.transferId // Pass the existing transfer ID
    );

    // Update DynamoDB on completion or failure
    if (result.success && result.s3Location) {
      console.log(`Transfer completed successfully: ${result.s3Location}`);
      try {
        await dynamoDBService.markTransferComplete(config.transferId, result.s3Location);
        console.log('DynamoDB updated with success status');
      } catch (dbError: any) {
        console.error('Failed to update DynamoDB with success status:', formatErrorMessage(dbError));
        // Don't fail the transfer if DynamoDB update fails
      }
      
      // Exit with success code
      process.exit(0);
    } else {
      // Format error message consistently
      // Requirements: 3.4, 3.5, 8.3, 8.4
      const errorMessage = formatErrorMessage(result.error);
      console.error(`Transfer failed: ${errorMessage}`);
      
      try {
        await dynamoDBService.markTransferFailed(config.transferId, errorMessage);
        console.log('DynamoDB updated with failure status');
      } catch (dbError: any) {
        console.error('Failed to update DynamoDB with failure status:', formatErrorMessage(dbError));
      }
      
      // Exit with error code
      process.exit(1);
    }
  } catch (error: any) {
    // Top-level error handler
    // Requirements: 3.4, 3.5, 8.3, 8.4
    const errorMessage = formatErrorMessage(error);
    console.error('Worker error:', errorMessage);
    
    // Log error details for debugging
    if (error.stack) {
      console.error('Error stack:', error.stack);
    }
    
    // Try to update DynamoDB with error if we have the config
    if (config && dynamoDBService) {
      try {
        await dynamoDBService.markTransferFailed(config.transferId, errorMessage);
        console.log('DynamoDB updated with error status');
      } catch (dbError: any) {
        console.error('Failed to update DynamoDB with error status:', formatErrorMessage(dbError));
      }
    }
    
    // Exit with error code
    process.exit(1);
  }
}

// Run the worker
main().catch((error) => {
  console.error('Unhandled error in worker:', error);
  process.exit(1);
});
