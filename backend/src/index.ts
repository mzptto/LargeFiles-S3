import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DownloadRequest, DownloadResponse, ErrorResponse } from './types/api.js';
import { ValidationService } from './services/ValidationService.js';
import { StreamingService } from './services/StreamingService.js';
import { ProgressStore } from './services/ProgressStore.js';
import { ErrorHandler } from './utils/errorHandler.js';

const streamingService = new StreamingService();
const progressStore = ProgressStore.getInstance();

/**
 * Lambda handler entry point for S3 ZIP Downloader
 * Handles download requests and routes to appropriate service functions
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Route to progress endpoint
  if (event.httpMethod === 'GET' && event.path.startsWith('/progress/')) {
    return handleProgressRequest(event, headers);
  }

  try {
    // Parse and validate request body
    if (!event.body) {
      return createErrorResponse(400, 'MISSING_BODY', 'Request body is required', false, headers);
    }

    const request: DownloadRequest = JSON.parse(event.body);

    // Validate required fields
    if (!request.sourceUrl || !request.bucketName) {
      return createErrorResponse(
        400,
        'MISSING_FIELDS',
        'sourceUrl and bucketName are required',
        false,
        headers
      );
    }

    // Sanitize inputs before validation
    // Requirements: 1.2, 1.3, 2.2
    const sanitizedUrl = ValidationService.sanitizeInput(request.sourceUrl);
    const sanitizedBucket = ValidationService.sanitizeInput(request.bucketName);
    const sanitizedPrefix = request.keyPrefix ? ValidationService.sanitizeInput(request.keyPrefix) : undefined;

    // Validate source URL
    const urlValidation = ValidationService.validateUrl(sanitizedUrl);
    if (!urlValidation.isValid) {
      return createErrorResponse(400, 'INVALID_URL', urlValidation.error || 'Invalid URL', false, headers);
    }

    // Validate bucket name
    const bucketValidation = ValidationService.validateBucketName(sanitizedBucket);
    if (!bucketValidation.isValid) {
      return createErrorResponse(
        400,
        'INVALID_BUCKET',
        bucketValidation.error || 'Invalid bucket name',
        false,
        headers
      );
    }

    // Validate key prefix if provided
    if (sanitizedPrefix) {
      const prefixValidation = ValidationService.validateKeyPrefix(sanitizedPrefix);
      if (!prefixValidation.isValid) {
        return createErrorResponse(
          400,
          'INVALID_PREFIX',
          prefixValidation.error || 'Invalid key prefix',
          false,
          headers
        );
      }
    }

    // Route to streaming service for file transfer (use sanitized inputs)
    const result = await streamingService.transferToS3(
      sanitizedUrl,
      sanitizedBucket,
      sanitizedPrefix
    );

    if (result.success) {
      const response: DownloadResponse = {
        success: true,
        s3Location: result.s3Location,
        transferId: result.transferId,
      };

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(response),
      };
    } else {
      // Format error response
      const errorInfo = result.error 
        ? ErrorHandler.formatErrorResponse(result.error)
        : { code: 'TRANSFER_FAILED', message: 'Transfer failed', retryable: false };
      
      return createErrorResponse(
        500,
        errorInfo.code,
        errorInfo.message,
        errorInfo.retryable,
        headers,
        { bytesTransferred: result.bytesTransferred, transferId: result.transferId }
      );
    }
  } catch (error) {
    console.error('Handler error:', error);
    
    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return createErrorResponse(400, 'INVALID_JSON', 'Invalid JSON in request body', false, headers);
    }

    // Handle unexpected errors
    return createErrorResponse(
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      true,
      headers
    );
  }
};

/**
 * Handles progress polling requests
 * Requirements: 4.2, 4.3
 */
function handleProgressRequest(
  event: APIGatewayProxyEvent,
  headers: Record<string, string>
): APIGatewayProxyResult {
  try {
    // Extract transfer ID from path
    const pathParts = event.path.split('/');
    const transferId = pathParts[pathParts.length - 1];

    if (!transferId) {
      return createErrorResponse(
        400,
        'MISSING_TRANSFER_ID',
        'Transfer ID is required',
        false,
        headers
      );
    }

    // Get progress from store
    const progress = progressStore.getProgress(transferId);

    if (!progress) {
      return createErrorResponse(
        404,
        'TRANSFER_NOT_FOUND',
        'Transfer not found',
        false,
        headers
      );
    }

    // Return progress response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        transferId: progress.transferId,
        bytesTransferred: progress.bytesTransferred,
        totalBytes: progress.totalBytes,
        percentage: progress.percentage,
        status: progress.status,
        error: progress.error,
        s3Location: progress.s3Location,
      }),
    };
  } catch (error) {
    console.error('Progress request error:', error);
    return createErrorResponse(
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      true,
      headers
    );
  }
}

/**
 * Creates a structured error response
 */
function createErrorResponse(
  statusCode: number,
  code: string,
  message: string,
  retryable: boolean,
  headers: Record<string, string>,
  details?: Record<string, any>
): APIGatewayProxyResult {
  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
      retryable,
      ...(details && { details }),
    },
  };

  return {
    statusCode,
    headers,
    body: JSON.stringify(errorResponse),
  };
}


