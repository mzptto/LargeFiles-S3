export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface DownloadRequest {
  sourceUrl: string;
  bucketName: string;
  keyPrefix?: string;
}

export interface ValidationErrors {
  sourceUrl?: string;
  bucketName?: string;
  keyPrefix?: string;
}
