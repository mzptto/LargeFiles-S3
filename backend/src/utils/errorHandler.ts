/**
 * Custom error classes for different error types
 */

export class UrlFetchError extends Error {
  constructor(message: string, public readonly originalError?: any) {
    super(message);
    this.name = 'UrlFetchError';
  }
}

export class S3Error extends Error {
  constructor(message: string, public readonly originalError?: any) {
    super(message);
    this.name = 'S3Error';
  }
}

export class StreamingError extends Error {
  constructor(message: string, public readonly originalError?: any) {
    super(message);
    this.name = 'StreamingError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Error handler utility functions
 * Requirements: 3.4, 3.5, 8.3, 8.4
 */
export class ErrorHandler {
  /**
   * Handles URL fetch errors (DNS, timeout, HTTP errors)
   * Requirements: 3.4 - Handle URL fetch errors
   */
  static handleUrlFetchError(error: any): UrlFetchError {
    // DNS resolution failures
    if (error.code === 'ENOTFOUND') {
      return new UrlFetchError('Unable to resolve URL: DNS lookup failed', error);
    }

    // Timeout errors
    if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
      return new UrlFetchError('Connection to source URL timed out', error);
    }

    // Connection refused
    if (error.code === 'ECONNREFUSED') {
      return new UrlFetchError('Connection refused by source server', error);
    }

    // Connection reset (network interruption)
    if (error.code === 'ECONNRESET') {
      return new UrlFetchError('Connection reset by source server', error);
    }

    // Connection aborted
    if (error.code === 'ECONNABORTED') {
      return new UrlFetchError('Connection aborted by source server', error);
    }

    // Network unreachable
    if (error.code === 'ENETUNREACH') {
      return new UrlFetchError('Network unreachable', error);
    }

    // Host unreachable
    if (error.code === 'EHOSTUNREACH') {
      return new UrlFetchError('Host unreachable', error);
    }

    // HTTP response errors
    if (error.response) {
      const status = error.response.status;
      
      // Provide specific messages for common HTTP errors
      if (status === 404) {
        return new UrlFetchError('Source file not found: HTTP 404', error);
      } else if (status === 403) {
        return new UrlFetchError('Access forbidden: HTTP 403', error);
      } else if (status === 401) {
        return new UrlFetchError('Authentication required: HTTP 401', error);
      } else if (status === 500) {
        return new UrlFetchError('Source server error: HTTP 500', error);
      } else if (status === 503) {
        return new UrlFetchError('Source server unavailable: HTTP 503', error);
      } else if (status >= 400 && status < 500) {
        return new UrlFetchError(`Client error: HTTP ${status}`, error);
      } else if (status >= 500) {
        return new UrlFetchError(`Server error: HTTP ${status}`, error);
      }
      
      return new UrlFetchError(`Source file not accessible: HTTP ${status}`, error);
    }

    // SSL/TLS errors
    if (error.message && (error.message.includes('certificate') || error.message.includes('SSL') || error.message.includes('TLS'))) {
      return new UrlFetchError('Secure connection failed: SSL/TLS error', error);
    }

    // Protocol errors
    if (error.code === 'ERR_INVALID_PROTOCOL') {
      return new UrlFetchError('Invalid protocol: URL must use HTTPS', error);
    }

    // Axios-specific errors
    if (error.code === 'ENOTFOUND') {
      return new UrlFetchError('Unable to resolve URL: DNS lookup failed', error);
    }

    // Generic fallback
    return new UrlFetchError(
      `Failed to fetch from URL: ${error.message || 'Unknown error'}`,
      error
    );
  }

  /**
   * Handles S3 errors (bucket not found, access denied, quota)
   * Requirements: 3.5 - Handle S3 errors
   */
  static handleS3Error(error: any, bucket?: string): S3Error {
    const bucketName = bucket || 'specified bucket';

    // Bucket not found errors
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return new S3Error(`S3 bucket '${bucketName}' does not exist`, error);
    }

    if (error.name === 'NoSuchBucket') {
      return new S3Error(`S3 bucket '${bucketName}' does not exist`, error);
    }

    // Permission errors
    if (error.name === 'Forbidden' || error.$metadata?.httpStatusCode === 403) {
      return new S3Error(
        `Insufficient permissions to write to bucket '${bucketName}'`,
        error
      );
    }

    if (error.name === 'AccessDenied') {
      return new S3Error(`Access denied to bucket '${bucketName}'`, error);
    }

    // Quota and storage errors
    if (error.code === 'QuotaExceeded' || error.name === 'QuotaExceeded') {
      return new S3Error('S3 storage quota exceeded', error);
    }

    if (error.name === 'EntityTooLarge') {
      return new S3Error('File size exceeds S3 limits', error);
    }

    if (error.name === 'TooManyBuckets') {
      return new S3Error('S3 bucket limit exceeded', error);
    }

    // Network errors
    if (error.code === 'NetworkingError' || error.name === 'NetworkingError') {
      return new S3Error('Failed to upload to S3: network error', error);
    }

    if (error.code === 'RequestTimeout' || error.name === 'RequestTimeout') {
      return new S3Error('S3 request timed out', error);
    }

    if (error.name === 'TimeoutError') {
      return new S3Error('S3 operation timed out', error);
    }

    // Service errors
    if (error.name === 'ServiceUnavailable' || error.$metadata?.httpStatusCode === 503) {
      return new S3Error('S3 service temporarily unavailable', error);
    }

    if (error.name === 'InternalError' || error.$metadata?.httpStatusCode === 500) {
      return new S3Error('S3 internal server error', error);
    }

    if (error.name === 'SlowDown') {
      return new S3Error('S3 request rate exceeded, please retry', error);
    }

    // Throttling errors
    if (error.name === 'ThrottlingException' || error.name === 'RequestLimitExceeded') {
      return new S3Error('S3 request throttled, please retry', error);
    }

    // Invalid request errors
    if (error.name === 'InvalidBucketName') {
      return new S3Error(`Invalid bucket name: '${bucketName}'`, error);
    }

    if (error.name === 'InvalidObjectState') {
      return new S3Error('Invalid object state for operation', error);
    }

    // Multipart upload specific errors
    if (error.name === 'NoSuchUpload') {
      return new S3Error('Multipart upload does not exist or was aborted', error);
    }

    if (error.name === 'InvalidPart') {
      return new S3Error('Invalid multipart upload part', error);
    }

    if (error.name === 'InvalidPartOrder') {
      return new S3Error('Multipart upload parts out of order', error);
    }

    // Generic fallback
    return new S3Error(
      `S3 operation failed: ${error.message || 'Unknown error'}`,
      error
    );
  }

  /**
   * Handles streaming errors (incomplete transfer, network interruption)
   * Requirements: 8.3, 8.4 - Handle network interruptions and report errors
   */
  static handleStreamingError(
    error: any,
    bytesTransferred: number,
    totalBytes: number
  ): StreamingError {
    // Connection reset (network interruption)
    if (error.code === 'ECONNRESET') {
      const percentage = totalBytes > 0 ? Math.floor((bytesTransferred / totalBytes) * 100) : 0;
      return new StreamingError(
        `Network interruption: ${bytesTransferred} of ${totalBytes} bytes transferred (${percentage}%)`,
        error
      );
    }

    // Broken pipe (connection closed unexpectedly)
    if (error.code === 'EPIPE') {
      const percentage = totalBytes > 0 ? Math.floor((bytesTransferred / totalBytes) * 100) : 0;
      return new StreamingError(
        `Connection closed unexpectedly: ${bytesTransferred} of ${totalBytes} bytes transferred (${percentage}%)`,
        error
      );
    }

    // Timeout errors
    if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
      return new StreamingError(
        `Transfer timed out after ${bytesTransferred} bytes`,
        error
      );
    }

    // Connection aborted
    if (error.code === 'ECONNABORTED') {
      return new StreamingError(
        `Transfer aborted: ${bytesTransferred} of ${totalBytes} bytes transferred`,
        error
      );
    }

    // Network unreachable
    if (error.code === 'ENETUNREACH') {
      return new StreamingError(
        `Network unreachable during transfer at ${bytesTransferred} bytes`,
        error
      );
    }

    // Multipart upload errors
    if (error.message && error.message.includes('part')) {
      const match = error.message.match(/part (\d+)/i);
      const partNumber = match ? match[1] : 'unknown';
      return new StreamingError(
        `Upload failed during part ${partNumber}`,
        error
      );
    }

    // Data integrity errors
    if (error.message && (error.message.includes('checksum') || error.message.includes('integrity'))) {
      return new StreamingError('Data integrity check failed', error);
    }

    // Aborted transfers
    if (error.message && error.message.includes('aborted')) {
      return new StreamingError('Transfer was aborted', error);
    }

    // Stream destroyed
    if (error.message && error.message.includes('destroyed')) {
      return new StreamingError(
        `Stream destroyed during transfer: ${bytesTransferred} of ${totalBytes} bytes transferred`,
        error
      );
    }

    // Premature close
    if (error.message && error.message.includes('premature close')) {
      return new StreamingError(
        `Incomplete transfer: ${bytesTransferred} of ${totalBytes} bytes transferred`,
        error
      );
    }

    // Memory errors
    if (error.message && (error.message.includes('memory') || error.message.includes('ENOMEM'))) {
      return new StreamingError('Insufficient memory for transfer', error);
    }

    // Generic fallback with transfer progress
    const percentage = totalBytes > 0 ? Math.floor((bytesTransferred / totalBytes) * 100) : 0;
    return new StreamingError(
      `Streaming transfer failed at ${percentage}%: ${error.message || 'Unknown error'}`,
      error
    );
  }

  /**
   * Determines if an error is retryable
   */
  static isRetryable(error: Error): boolean {
    const retryableErrors = [
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'EPIPE',
      'NetworkingError',
      'TimeoutError',
      'RequestTimeout',
      'ServiceUnavailable',
      'ThrottlingException',
    ];

    return retryableErrors.some(
      (errType) =>
        error.message.includes(errType) ||
        error.name.includes(errType) ||
        (error as any).code === errType
    );
  }

  /**
   * Formats error for API response
   */
  static formatErrorResponse(error: Error): {
    code: string;
    message: string;
    retryable: boolean;
  } {
    let code = 'UNKNOWN_ERROR';

    if (error instanceof UrlFetchError) {
      code = 'URL_FETCH_ERROR';
    } else if (error instanceof S3Error) {
      code = 'S3_ERROR';
    } else if (error instanceof StreamingError) {
      code = 'STREAMING_ERROR';
    } else if (error instanceof ValidationError) {
      code = 'VALIDATION_ERROR';
    }

    return {
      code,
      message: error.message,
      retryable: this.isRetryable(error),
    };
  }
}
