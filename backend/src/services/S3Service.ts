import {
  S3Client,
  HeadBucketCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  CompletedPart,
} from '@aws-sdk/client-s3';
import { ErrorHandler, S3Error } from '../utils/errorHandler.js';

/**
 * Service for handling S3 operations
 */
export class S3Service {
  private s3Client: S3Client;

  constructor(region?: string) {
    this.s3Client = new S3Client({
      region: region || process.env.AWS_REGION || 'us-east-1',
      // Increase timeouts for large file uploads
      requestHandler: {
        requestTimeout: 300000, // 5 minutes for individual requests
        connectionTimeout: 60000, // 1 minute to establish connection
      },
      // Configure retries at SDK level
      maxAttempts: 5, // SDK will retry up to 5 times
    });
  }

  /**
   * Validates that the bucket exists and we have access to it
   */
  async validateBucketAccess(bucket: string): Promise<boolean> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch (error: any) {
      console.error('Bucket access validation failed:', error);
      throw ErrorHandler.handleS3Error(error, bucket);
    }
  }

  /**
   * Creates a multipart upload
   * Returns the upload ID
   */
  async createMultipartUpload(bucket: string, key: string): Promise<string> {
    try {
      const command = new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: 'application/octet-stream', // Generic binary content type for any file
      });

      const response = await this.s3Client.send(command);

      if (!response.UploadId) {
        throw new S3Error('Failed to create multipart upload: No upload ID returned');
      }

      return response.UploadId;
    } catch (error: any) {
      console.error('Failed to create multipart upload:', error);
      throw ErrorHandler.handleS3Error(error, bucket);
    }
  }

  /**
   * Uploads a single part of a multipart upload
   * Returns the ETag for the uploaded part
   */
  async uploadPart(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    data: Buffer
  ): Promise<string> {
    const startTime = Date.now();
    try {
      console.log(`Uploading part ${partNumber} (${(data.length / 1024 / 1024).toFixed(2)} MB)...`);
      
      const command = new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: data,
      });

      const response = await this.s3Client.send(command);
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const throughput = (data.length / 1024 / 1024 / parseFloat(duration)).toFixed(2);
      console.log(`Part ${partNumber} uploaded in ${duration}s (${throughput} MB/s)`);

      if (!response.ETag) {
        throw new S3Error(`Failed to upload part ${partNumber}: No ETag returned`);
      }

      return response.ETag;
    } catch (error: any) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`Failed to upload part ${partNumber} after ${duration}s:`, error.message || error);
      console.error(`Error details:`, {
        name: error.name,
        code: error.code,
        statusCode: error.$metadata?.httpStatusCode,
        attempts: error.$metadata?.attempts,
        totalRetryDelay: error.$metadata?.totalRetryDelay
      });
      throw ErrorHandler.handleS3Error(error, bucket);
    }
  }

  /**
   * Completes a multipart upload
   * Returns the S3 location URL
   */
  async completeUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: CompletedPart[]
  ): Promise<string> {
    try {
      // Sort parts by PartNumber to ensure they're in order
      // S3 requires parts to be in ascending order by PartNumber
      // With concurrent uploads, parts can complete out of order
      const sortedParts = [...parts].sort((a, b) => (a.PartNumber || 0) - (b.PartNumber || 0));
      
      console.log(`Completing multipart upload with ${sortedParts.length} parts`);
      
      const command = new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: sortedParts,
        },
      });

      await this.s3Client.send(command);

      // Return S3 location
      return `s3://${bucket}/${key}`;
    } catch (error: any) {
      console.error('Failed to complete multipart upload:', error);
      throw ErrorHandler.handleS3Error(error, bucket);
    }
  }

  /**
   * Aborts a multipart upload
   * Used for cleanup when transfer fails
   * Requirements: 3.5, 8.3 - Handle S3 errors and cleanup on failure
   */
  async abortUpload(bucket: string, key: string, uploadId: string): Promise<void> {
    try {
      const command = new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      });

      await this.s3Client.send(command);
      console.log(`Aborted multipart upload ${uploadId} for ${bucket}/${key}`);
    } catch (error: any) {
      // Log detailed error but don't throw - this is cleanup
      // We don't want to mask the original error that caused the abort
      console.error(`Failed to abort multipart upload ${uploadId}:`, error.message || error);
      
      // Log specific error types for debugging
      if (error.name === 'NoSuchUpload') {
        console.warn('Upload already aborted or completed');
      } else if (error.name === 'AccessDenied') {
        console.error('Insufficient permissions to abort upload');
      }
    }
  }
}
