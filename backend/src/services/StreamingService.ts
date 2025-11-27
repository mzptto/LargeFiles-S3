import axios from 'axios';
import { Readable } from 'stream';
import { S3Service } from './S3Service.js';
import { UrlService } from './UrlService.js';
import { ValidationService } from './ValidationService.js';
import { TransferResult, ProgressCallback } from '../types/api.js';
import { CompletedPart } from '@aws-sdk/client-s3';
import { ErrorHandler, StreamingError, UrlFetchError } from '../utils/errorHandler.js';
import { ProgressStore } from './ProgressStore.js';
import { randomUUID } from 'crypto';

/**
 * Service for streaming file transfers from URL to S3
 */
export class StreamingService {
  private s3Service: S3Service;
  private urlService: UrlService;
  private progressStore: ProgressStore;
  private dynamoDBService?: any; // Optional DynamoDB service for progress updates
  private readonly PART_SIZE = 5 * 1024 * 1024; // 5MB minimum for S3 multipart
  private readonly LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB threshold for multipart
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024 * 1024; // 10TB (Requirements: 8.5)
  private readonly MAX_RETRY_ATTEMPTS = 3; // Maximum retry attempts for part upload failures

  constructor(dynamoDBService?: any) {
    this.s3Service = new S3Service();
    this.urlService = new UrlService();
    this.progressStore = ProgressStore.getInstance();
    this.dynamoDBService = dynamoDBService;
  }

  /**
   * Transfers a file from source URL to S3 bucket using streaming
   * Returns a transfer ID for progress tracking
   */
  async transferToS3(
    sourceUrl: string,
    bucket: string,
    keyPrefix?: string,
    onProgress?: ProgressCallback
  ): Promise<TransferResult & { transferId?: string }> {
    let uploadId: string | undefined;
    let key: string | undefined;
    let bytesTransferred = 0;
    let transferId: string | undefined;

    try {
      // Validate bucket access first
      await this.s3Service.validateBucketAccess(bucket);

      // Validate URL is accessible
      try {
        const isAccessible = await this.urlService.validateUrlAccessible(sourceUrl);
        if (!isAccessible) {
          throw new UrlFetchError('Source URL is not accessible');
        }
      } catch (error: any) {
        throw ErrorHandler.handleUrlFetchError(error);
      }

      // Validate Content-Type from source URL
      // Requirements: 1.2, 1.3, 2.2
      try {
        const contentTypeValidation = await this.urlService.validateContentType(sourceUrl);
        if (contentTypeValidation.error) {
          console.warn(contentTypeValidation.error);
        }
      } catch (error: any) {
        // Log warning but don't fail - some servers misconfigure Content-Type
        console.warn('Content-Type validation warning:', error);
      }

      // Get content length for progress tracking
      const totalBytes = await this.urlService.getContentLength(sourceUrl);
      
      if (totalBytes > this.MAX_FILE_SIZE) {
        throw new StreamingError(`File size exceeds maximum allowed size of ${this.MAX_FILE_SIZE} bytes`);
      }

      // Generate transfer ID and create progress record
      transferId = randomUUID();
      this.progressStore.createTransfer(transferId, totalBytes);

      // Extract filename and construct S3 key
      const filename = this.urlService.extractFilename(sourceUrl);
      key = keyPrefix ? this.constructKey(keyPrefix, filename) : filename;

      // Validate final S3 key format
      const keyValidation = ValidationService.validateS3Key(key);
      if (!keyValidation.isValid) {
        throw new StreamingError(keyValidation.error || 'Invalid S3 key format');
      }

      // Create multipart upload
      uploadId = await this.s3Service.createMultipartUpload(bucket, key);

      // Stream file from URL with extended timeout for large files
      // Requirements: 3.4 - Handle URL fetch errors (DNS, timeout, HTTP errors)
      let response;
      try {
        response = await axios.get(sourceUrl, {
          responseType: 'stream',
          timeout: 900000, // 15 minutes (900 seconds) for large file transfers
          maxRedirects: 5,
          // Disable response timeout to allow streaming of large files
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      } catch (error: any) {
        // Handle URL fetch errors with detailed messages
        throw ErrorHandler.handleUrlFetchError(error);
      }

      const stream: Readable = response.data;

      // Add error handler for stream errors during setup
      // Requirements: 8.3 - Handle network interruptions gracefully
      stream.on('error', (streamError) => {
        console.error('Stream error during transfer:', streamError);
      });

      // Upload parts with progress tracking
      const parts = await this.uploadParts(
        stream,
        bucket,
        key,
        uploadId,
        totalBytes,
        transferId,
        (transferred, total) => {
          bytesTransferred = transferred;
          if (onProgress) {
            onProgress(transferred, total);
          }
        }
      );

      // Complete multipart upload
      const s3Location = await this.s3Service.completeUpload(bucket, key, uploadId, parts);

      // Mark transfer as completed
      this.progressStore.completeTransfer(transferId, s3Location);

      return {
        success: true,
        s3Location,
        bytesTransferred,
        transferId,
      };
    } catch (error: any) {
      console.error('Transfer failed:', error);

      // Mark transfer as failed
      if (transferId) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.progressStore.failTransfer(transferId, errorMessage);
      }

      // Cleanup: abort multipart upload if it was created
      if (uploadId && key) {
        await this.s3Service.abortUpload(bucket, key, uploadId);
      }

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        bytesTransferred,
        transferId,
      };
    }
  }

  /**
   * Updates progress in both in-memory store and DynamoDB (if available)
   * Throttles updates to every 1% or 100MB as per requirements
   * Requirements: 4.2, Task 6.7 - Update DynamoDB with progress every 1% or 100MB
   */
  private async updateProgressTracking(
    transferId: string,
    bytesTransferred: number,
    totalBytes: number
  ): Promise<void> {
    // Update in-memory progress store (with throttling)
    const updated = this.progressStore.updateProgress(transferId, bytesTransferred, totalBytes);
    
    // If progress store was updated (passed throttling), also update DynamoDB
    if (updated && this.dynamoDBService) {
      try {
        await this.dynamoDBService.updateTransferProgress(transferId, bytesTransferred, totalBytes);
      } catch (error) {
        // Log error but don't fail the transfer
        console.error('Failed to update DynamoDB progress:', error);
      }
    }
  }

  /**
   * Uploads parts from stream to S3 with progress tracking and retry logic
   * Uses multipart upload for files over 100MB with 5MB part size
   * Handles part upload failures with automatic retry (up to 3 attempts)
   * Requirements: 3.2, 4.2, 8.1, 8.2, 8.5
   */
  private async uploadParts(
    stream: Readable,
    bucket: string,
    key: string,
    uploadId: string,
    totalBytes: number,
    transferId: string,
    onProgress: ProgressCallback
  ): Promise<CompletedPart[]> {
    const parts: CompletedPart[] = [];
    let partNumber = 1;
    let buffer = Buffer.alloc(0);
    let bytesTransferred = 0;

    // Determine if we should use multipart upload based on file size
    const useMultipart = totalBytes > this.LARGE_FILE_THRESHOLD;
    
    if (useMultipart) {
      console.log(`File size ${totalBytes} bytes exceeds ${this.LARGE_FILE_THRESHOLD} bytes, using multipart upload with ${this.PART_SIZE} byte parts`);
    }

    return new Promise((resolve, reject) => {
      let isStreamDestroyed = false;
      let pendingUpload: Promise<void> | null = null;
      let hasError = false;

      const handleData = (chunk: Buffer) => {
        // If there's an error or pending upload, pause and wait
        if (hasError || pendingUpload) {
          stream.pause();
          return;
        }

        try {
          // Accumulate data into buffer
          buffer = Buffer.concat([buffer, chunk]);
          bytesTransferred += chunk.length;

          // Update progress tracking (synchronously to avoid blocking)
          this.updateProgressTracking(transferId, bytesTransferred, totalBytes).catch(err => {
            console.error('Failed to update progress:', err);
          });

          // Emit progress callback
          onProgress(bytesTransferred, totalBytes > 0 ? totalBytes : bytesTransferred);

          // Upload part when buffer reaches part size
          if (buffer.length >= this.PART_SIZE) {
            // Pause stream while uploading
            stream.pause();

            const partData = buffer.subarray(0, this.PART_SIZE);
            buffer = buffer.subarray(this.PART_SIZE);
            const currentPartNumber = partNumber;
            partNumber++;

            // Upload part with retry logic (track as pending)
            // Requirements: 3.5, 8.3 - Handle S3 errors and network interruptions
            pendingUpload = this.uploadPartWithRetry(
              bucket,
              key,
              uploadId,
              currentPartNumber,
              partData
            ).then(etag => {
              parts.push({
                PartNumber: currentPartNumber,
                ETag: etag,
              });
              pendingUpload = null;
              
              // Resume stream if no error
              if (!hasError && !isStreamDestroyed) {
                stream.resume();
              }
            }).catch(error => {
              hasError = true;
              pendingUpload = null;
              if (!isStreamDestroyed) {
                isStreamDestroyed = true;
                stream.destroy();
              }
              reject(error);
            });
          }
        } catch (error) {
          // Handle errors during data processing
          // Requirements: 3.5, 8.3, 8.4
          hasError = true;
          if (!isStreamDestroyed) {
            isStreamDestroyed = true;
            stream.destroy();
          }
          reject(error);
        }
      };

      stream.on('data', handleData);

      stream.on('end', async () => {
        try {
          // Wait for any pending upload to complete
          if (pendingUpload) {
            await pendingUpload;
          }

          // Upload remaining data as final part
          if (buffer.length > 0) {
            const etag = await this.uploadPartWithRetry(
              bucket,
              key,
              uploadId,
              partNumber,
              buffer
            );

            parts.push({
              PartNumber: partNumber,
              ETag: etag,
            });
          }

          console.log(`Successfully uploaded ${parts.length} parts for multipart upload`);
          resolve(parts);
        } catch (error) {
          // Handle errors during final part upload
          // Requirements: 3.5, 8.3, 8.4
          reject(error);
        }
      });

      stream.on('error', (error) => {
        // Handle streaming errors (network interruptions, incomplete transfers)
        // Requirements: 8.3, 8.4 - Handle network interruptions and report errors
        hasError = true;
        if (!isStreamDestroyed) {
          isStreamDestroyed = true;
        }
        reject(ErrorHandler.handleStreamingError(error, bytesTransferred, totalBytes));
      });

      // Handle stream close event (may indicate premature termination)
      stream.on('close', () => {
        // Only log if stream was destroyed unexpectedly
        if (isStreamDestroyed && bytesTransferred < totalBytes) {
          console.warn(`Stream closed prematurely: ${bytesTransferred}/${totalBytes} bytes transferred`);
        }
      });
    });
  }

  /**
   * Uploads a single part with retry logic
   * Retries up to MAX_RETRY_ATTEMPTS times on failure
   */
  private async uploadPartWithRetry(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    data: Buffer,
    attempt: number = 1
  ): Promise<string> {
    try {
      const etag = await this.s3Service.uploadPart(
        bucket,
        key,
        uploadId,
        partNumber,
        data
      );
      
      if (attempt > 1) {
        console.log(`Part ${partNumber} uploaded successfully on attempt ${attempt}`);
      }
      
      return etag;
    } catch (error: any) {
      console.error(`Failed to upload part ${partNumber} on attempt ${attempt}:`, error.message);
      
      // Retry if we haven't exceeded max attempts
      if (attempt < this.MAX_RETRY_ATTEMPTS) {
        console.log(`Retrying part ${partNumber} upload (attempt ${attempt + 1}/${this.MAX_RETRY_ATTEMPTS})`);
        
        // Exponential backoff: wait 2^attempt seconds before retrying
        const delayMs = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        return this.uploadPartWithRetry(bucket, key, uploadId, partNumber, data, attempt + 1);
      }
      
      // Max retries exceeded, throw error
      throw new StreamingError(
        `Failed to upload part ${partNumber} after ${this.MAX_RETRY_ATTEMPTS} attempts: ${error.message}`
      );
    }
  }

  /**
   * Constructs S3 key from prefix and filename
   * Handles trailing slashes properly
   * Requirements: 2.5
   * 
   * Rules:
   * - Removes leading slash from prefix (S3 best practice)
   * - Ensures prefix ends with slash if not empty
   * - Concatenates prefix with filename
   * - Returns just filename if prefix is empty
   */
  private constructKey(prefix: string, filename: string): string {
    // If no prefix, return just the filename
    if (!prefix || prefix.trim() === '') {
      return filename;
    }

    // Remove leading slash from prefix if present (S3 best practice)
    let cleanPrefix = prefix.startsWith('/') ? prefix.slice(1) : prefix;
    
    // Remove trailing whitespace
    cleanPrefix = cleanPrefix.trim();
    
    // Ensure prefix ends with slash if not empty
    if (cleanPrefix && !cleanPrefix.endsWith('/')) {
      cleanPrefix += '/';
    }

    // Concatenate prefix with filename
    return cleanPrefix + filename;
  }
}
