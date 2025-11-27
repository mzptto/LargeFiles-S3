import axios, { AxiosInstance, AxiosError } from 'axios';
import { DownloadRequest } from '../types/validation';
import { DownloadResponse, ProgressResponse, ApiError } from '../types/api';

export class ApiClient {
  private client: AxiosInstance;
  private baseURL: string;
  private activePollCancellers: Map<string, () => void> = new Map();

  constructor(baseURL?: string) {
    this.baseURL = baseURL || import.meta.env.VITE_API_URL || '/api';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // 30 seconds for initial request
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => this.handleError(error)
    );
  }

  /**
   * Initiates a download request
   * Returns immediately with a transfer ID for async processing
   * Requirements: 3.1, 8.6
   */
  async startDownload(request: DownloadRequest): Promise<DownloadResponse> {
    try {
      const response = await this.client.post<DownloadResponse>('/download', request);
      return response.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError('Failed to start download', undefined, error);
    }
  }

  /**
   * Polls for progress updates
   * Requirements: 4.3
   */
  async getProgress(transferId: string): Promise<ProgressResponse> {
    try {
      const response = await this.client.get<ProgressResponse>(`/progress/${transferId}`);
      return response.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError('Failed to get progress', undefined, error);
    }
  }

  /**
   * Polls for progress updates at regular intervals
   * Continues polling until transfer is completed or failed
   * Requirements: 4.3, 8.6
   */
  async pollProgress(
    transferId: string,
    onProgress: (progress: ProgressResponse) => void,
    intervalMs: number = 1000
  ): Promise<ProgressResponse> {
    // Cancel any existing poll for this transfer ID
    this.cancelPolling(transferId);

    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | null = null;
      let cancelled = false;

      const cancel = () => {
        cancelled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        this.activePollCancellers.delete(transferId);
      };

      // Store canceller for this transfer
      this.activePollCancellers.set(transferId, cancel);

      const poll = async () => {
        if (cancelled) {
          return;
        }

        try {
          const progress = await this.getProgress(transferId);
          
          if (cancelled) {
            return;
          }

          onProgress(progress);

          // Check if transfer is in a terminal state
          if (progress.status === 'completed' || progress.status === 'failed') {
            cancel();
            resolve(progress);
          } else {
            // Continue polling for in-progress or pending transfers
            timeoutId = setTimeout(poll, intervalMs);
          }
        } catch (error) {
          if (!cancelled) {
            cancel();
            reject(error);
          }
        }
      };

      // Start polling
      poll();
    });
  }

  /**
   * Cancels active polling for a specific transfer ID
   * Useful for cleanup when component unmounts or user navigates away
   */
  cancelPolling(transferId: string): void {
    const canceller = this.activePollCancellers.get(transferId);
    if (canceller) {
      canceller();
    }
  }

  /**
   * Cancels all active polling operations
   * Useful for cleanup when app unmounts
   */
  cancelAllPolling(): void {
    this.activePollCancellers.forEach(canceller => canceller());
    this.activePollCancellers.clear();
  }

  /**
   * Handles API errors and converts them to ApiError instances
   * Provides detailed error messages for different failure scenarios
   * Requirements: 8.6 (error handling for network failures)
   */
  private handleError(error: AxiosError): never {
    if (error.response) {
      // Server responded with error status
      const errorData = error.response.data as any;
      const message = errorData?.error?.message || errorData?.error || error.message;
      const details = errorData?.error?.details || errorData;
      
      throw new ApiError(
        message,
        error.response.status,
        details
      );
    } else if (error.request) {
      // Request made but no response received (network error)
      if (error.code === 'ECONNABORTED') {
        throw new ApiError(
          'Request timeout. The server took too long to respond.',
          undefined,
          error
        );
      } else if (error.code === 'ERR_NETWORK') {
        throw new ApiError(
          'Network error. Please check your internet connection.',
          undefined,
          error
        );
      } else {
        throw new ApiError(
          'No response from server. Please check your network connection.',
          undefined,
          error
        );
      }
    } else {
      // Error setting up the request
      throw new ApiError(
        error.message || 'An unexpected error occurred',
        undefined,
        error
      );
    }
  }
}

// Export a singleton instance
export const apiClient = new ApiClient();
