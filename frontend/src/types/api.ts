export interface DownloadResponse {
  success: boolean;
  s3Location?: string;
  error?: string;
  transferId?: string;
}

export interface ProgressResponse {
  success: boolean;
  transferId: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  progress: {
    bytesTransferred: number;
    totalBytes: number;
    percentage: number;
  };
  metadata: {
    sourceUrl: string;
    bucketName: string;
    keyPrefix?: string;
    s3Key?: string;
    s3Location?: string;
    startTime: string;
    endTime?: string;
    lastUpdateTime?: string;
    fargateTaskArn?: string;
  };
  error?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
