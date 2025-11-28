/**
 * Lambda handler for job submission
 * Requirements: 3.1, 8.6
 * 
 * This handler:
 * - Parses and validates incoming requests
 * - Validates source URL and bucket name
 * - Generates unique transfer ID
 * - Creates transfer record in DynamoDB with "pending" status
 * - Starts Step Functions workflow with transfer parameters
 * - Returns transfer ID immediately (does not wait for completion)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { DynamoDBService } from '../services/DynamoDBService.js';
import { ValidationService } from '../services/ValidationService.js';
import { UrlService } from '../services/UrlService.js';
import { DownloadRequest, DownloadResponse } from '../types/api.js';
import { randomUUID } from 'crypto';

// Environment variables
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'TransferTable';
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Initialize services
const dynamoDBService = new DynamoDBService(DYNAMODB_TABLE_NAME, AWS_REGION);
const urlService = new UrlService();
const sfnClient = new SFNClient({ region: AWS_REGION });

/**
 * Lambda handler for job submission
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Job submission request received:', JSON.stringify(event, null, 2));

  try {
    // Parse request body
    if (!event.body) {
      return createErrorResponse(400, 'MISSING_BODY', 'Request body is required');
    }

    let request: DownloadRequest;
    try {
      request = JSON.parse(event.body) as DownloadRequest;
    } catch (error) {
      return createErrorResponse(400, 'INVALID_JSON', 'Invalid JSON in request body');
    }

    // Validate required fields
    if (!request.sourceUrl) {
      return createErrorResponse(400, 'MISSING_SOURCE_URL', 'sourceUrl is required');
    }

    if (!request.bucketName) {
      return createErrorResponse(400, 'MISSING_BUCKET_NAME', 'bucketName is required');
    }

    // Sanitize inputs
    const sanitizedUrl = ValidationService.sanitizeInput(request.sourceUrl);
    const sanitizedBucket = ValidationService.sanitizeInput(request.bucketName);
    const sanitizedPrefix = request.keyPrefix ? ValidationService.sanitizeInput(request.keyPrefix) : undefined;

    // Validate source URL
    const urlValidation = ValidationService.validateUrl(sanitizedUrl);
    if (!urlValidation.isValid) {
      return createErrorResponse(400, 'INVALID_URL', urlValidation.error || 'Invalid source URL');
    }

    // Validate bucket name
    const bucketValidation = ValidationService.validateBucketName(sanitizedBucket);
    if (!bucketValidation.isValid) {
      return createErrorResponse(400, 'INVALID_BUCKET_NAME', bucketValidation.error || 'Invalid bucket name');
    }

    // Validate key prefix if provided
    if (sanitizedPrefix) {
      const prefixValidation = ValidationService.validateKeyPrefix(sanitizedPrefix);
      if (!prefixValidation.isValid) {
        return createErrorResponse(400, 'INVALID_KEY_PREFIX', prefixValidation.error || 'Invalid key prefix');
      }
    }

    // Extract filename from URL
    const filename = urlService.extractFilename(sanitizedUrl);

    // Construct S3 key (prefix + filename)
    let s3Key: string;
    if (sanitizedPrefix) {
      // Ensure prefix ends with / if it doesn't already
      const normalizedPrefix = sanitizedPrefix.endsWith('/') ? sanitizedPrefix : `${sanitizedPrefix}/`;
      s3Key = `${normalizedPrefix}${filename}`;
    } else {
      s3Key = filename;
    }

    // Validate final S3 key
    const keyValidation = ValidationService.validateS3Key(s3Key);
    if (!keyValidation.isValid) {
      return createErrorResponse(400, 'INVALID_S3_KEY', keyValidation.error || 'Invalid S3 key');
    }

    // Generate unique transfer ID
    const transferId = randomUUID();

    console.log(`Creating transfer record: ${transferId}`);

    // Create transfer record in DynamoDB with "pending" status
    const transferRecord = await dynamoDBService.createTransferRecord(
      transferId,
      sanitizedUrl,
      sanitizedBucket,
      s3Key,
      sanitizedPrefix
    );

    console.log(`Transfer record created: ${transferId}`, transferRecord);

    // Start Step Functions workflow with transfer parameters
    // Requirements: 3.1, 8.6
    if (!STATE_MACHINE_ARN) {
      console.error('STATE_MACHINE_ARN environment variable not set');
      return createErrorResponse(500, 'CONFIGURATION_ERROR', 'State machine not configured');
    }

    try {
      const executionInput = {
        transferId,
        sourceUrl: sanitizedUrl,
        bucketName: sanitizedBucket,
        keyPrefix: sanitizedPrefix || '',
        s3Key,
      };

      const startExecutionCommand = new StartExecutionCommand({
        stateMachineArn: STATE_MACHINE_ARN,
        name: `transfer-${transferId}`, // Unique execution name
        input: JSON.stringify(executionInput),
      });

      const executionResult = await sfnClient.send(startExecutionCommand);
      console.log(`Step Functions execution started: ${executionResult.executionArn}`);

      // Store execution ARN in DynamoDB for later cancellation
      if (executionResult.executionArn) {
        try {
          await dynamoDBService.updateExecutionArn(transferId, executionResult.executionArn);
        } catch (dbError) {
          console.error('Failed to update execution ARN in DynamoDB:', dbError);
          // Don't fail the request if this update fails
        }
      }
    } catch (sfnError) {
      console.error('Failed to start Step Functions execution:', sfnError);
      
      // Mark transfer as failed in DynamoDB
      try {
        await dynamoDBService.markTransferFailed(
          transferId,
          `Failed to start transfer workflow: ${sfnError instanceof Error ? sfnError.message : String(sfnError)}`
        );
      } catch (dbError) {
        console.error('Failed to update DynamoDB with workflow start failure:', dbError);
      }
      
      return createErrorResponse(500, 'WORKFLOW_START_FAILED', 'Failed to start transfer workflow');
    }

    // Return transfer ID immediately (do not wait for completion)
    const response: DownloadResponse = {
      success: true,
      transferId: transferId,
    };

    return {
      statusCode: 202, // Accepted - request has been accepted for processing
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // CORS
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error processing job submission:', error);

    // Handle DynamoDB errors
    if (error instanceof Error && error.message.includes('DynamoDB')) {
      return createErrorResponse(500, 'DATABASE_ERROR', 'Failed to create transfer record');
    }

    // Generic error
    return createErrorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Helper function to create error responses
 */
function createErrorResponse(statusCode: number, code: string, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify({
      success: false,
      error: {
        code,
        message,
        retryable: statusCode >= 500, // Server errors are retryable
      },
    }),
  };
}
