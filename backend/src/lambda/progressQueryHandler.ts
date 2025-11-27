/**
 * Lambda handler for progress queries
 * Requirements: 4.2, 4.3
 * 
 * This handler:
 * - Extracts transfer ID from request
 * - Queries DynamoDB for transfer status
 * - Returns current progress, status, and metadata
 * - Handles transfer not found errors
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBService, TransferRecord } from '../services/DynamoDBService.js';

// Environment variables
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'TransferTable';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Initialize services
const dynamoDBService = new DynamoDBService(DYNAMODB_TABLE_NAME, AWS_REGION);

/**
 * Lambda handler for progress queries
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Progress query request received:', JSON.stringify(event, null, 2));

  try {
    // Extract transfer ID from path parameters
    const transferId = event.pathParameters?.transferId;

    if (!transferId) {
      return createErrorResponse(400, 'MISSING_TRANSFER_ID', 'Transfer ID is required');
    }

    // Validate transfer ID format (should be a UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(transferId)) {
      return createErrorResponse(400, 'INVALID_TRANSFER_ID', 'Transfer ID must be a valid UUID');
    }

    console.log(`Querying transfer status for: ${transferId}`);

    // Query DynamoDB for transfer status
    const transferRecord = await dynamoDBService.getTransferStatus(transferId);

    // Handle transfer not found
    if (!transferRecord) {
      return createErrorResponse(404, 'TRANSFER_NOT_FOUND', `Transfer with ID ${transferId} not found`);
    }

    console.log(`Transfer status retrieved: ${transferId}`, transferRecord);

    // Return current progress, status, and metadata
    const response = formatTransferResponse(transferRecord);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // CORS
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error querying transfer status:', error);

    // Handle DynamoDB errors
    if (error instanceof Error && error.message.includes('DynamoDB')) {
      return createErrorResponse(500, 'DATABASE_ERROR', 'Failed to query transfer status');
    }

    // Generic error
    return createErrorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Formats transfer record into API response
 */
function formatTransferResponse(record: TransferRecord) {
  return {
    success: true,
    transferId: record.transferId,
    status: record.status,
    progress: {
      bytesTransferred: record.bytesTransferred,
      totalBytes: record.totalBytes,
      percentage: record.percentage,
    },
    metadata: {
      sourceUrl: record.sourceUrl,
      bucketName: record.bucketName,
      keyPrefix: record.keyPrefix,
      s3Key: record.s3Key,
      s3Location: record.s3Location,
      startTime: record.startTime,
      endTime: record.endTime,
      lastUpdateTime: record.lastUpdateTime,
      fargateTaskArn: record.fargateTaskArn,
    },
    error: record.error,
  };
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
