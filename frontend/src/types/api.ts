export interface DownloadResponse {
  success: boolean;
  s3Location?: string;
  error?: string;
  transferId?: string;
}

export interface ProgressResponse {
  transferId: string;
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
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
