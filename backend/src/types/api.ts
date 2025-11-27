export interface DownloadRequest {
  sourceUrl: string;
  bucketName: string;
  keyPrefix?: string;
}

export interface DownloadResponse {
  success: boolean;
  s3Location?: string;
  error?: string;
  transferId?: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    retryable: boolean;
  };
}

export interface TransferResult {
  success: boolean;
  s3Location?: string;
  error?: Error;
  bytesTransferred: number;
  transferId?: string;
}

export type ProgressCallback = (bytesTransferred: number, totalBytes: number) => void;
