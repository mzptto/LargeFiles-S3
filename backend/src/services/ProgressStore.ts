/**
 * In-memory store for tracking transfer progress
 * Requirements: 4.2
 */

export interface TransferProgress {
  transferId: string;
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  error?: string;
  s3Location?: string;
}

export class ProgressStore {
  private static instance: ProgressStore;
  private transfers: Map<string, TransferProgress>;

  private constructor() {
    this.transfers = new Map();
  }

  static getInstance(): ProgressStore {
    if (!ProgressStore.instance) {
      ProgressStore.instance = new ProgressStore();
    }
    return ProgressStore.instance;
  }

  /**
   * Creates a new transfer record
   */
  createTransfer(transferId: string, totalBytes: number): TransferProgress {
    const progress: TransferProgress = {
      transferId,
      bytesTransferred: 0,
      totalBytes,
      percentage: 0,
      status: 'pending',
      startTime: new Date(),
    };
    this.transfers.set(transferId, progress);
    return progress;
  }

  /**
   * Updates transfer progress with throttling
   * Only updates if percentage changed by at least 1% or 100MB transferred
   * Requirements: 4.2 - Update DynamoDB with progress every 1% or 100MB
   */
  updateProgress(
    transferId: string,
    bytesTransferred: number,
    totalBytes: number
  ): TransferProgress | null {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      return null;
    }

    const newPercentage = totalBytes > 0 
      ? Math.min(Math.floor((bytesTransferred / totalBytes) * 100), 100)
      : 0;

    const bytesDiff = bytesTransferred - transfer.bytesTransferred;
    const percentageDiff = newPercentage - transfer.percentage;

    // Throttle: only update if 1% change or 100MB transferred
    // Requirements: Task 6.7 - Update DynamoDB with progress every 1% or 100MB
    const ONE_HUNDRED_MB = 100 * 1024 * 1024;
    if (percentageDiff >= 1 || bytesDiff >= ONE_HUNDRED_MB) {
      transfer.bytesTransferred = bytesTransferred;
      transfer.totalBytes = totalBytes;
      transfer.percentage = newPercentage;
      transfer.status = 'in-progress';
      this.transfers.set(transferId, transfer);
      return transfer;
    }

    return null; // No update needed (throttled)
  }

  /**
   * Marks transfer as completed
   */
  completeTransfer(transferId: string, s3Location: string): TransferProgress | null {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      return null;
    }

    transfer.status = 'completed';
    transfer.percentage = 100;
    transfer.bytesTransferred = transfer.totalBytes;
    transfer.endTime = new Date();
    transfer.s3Location = s3Location;
    this.transfers.set(transferId, transfer);
    return transfer;
  }

  /**
   * Marks transfer as failed
   */
  failTransfer(transferId: string, error: string): TransferProgress | null {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      return null;
    }

    transfer.status = 'failed';
    transfer.endTime = new Date();
    transfer.error = error;
    this.transfers.set(transferId, transfer);
    return transfer;
  }

  /**
   * Gets transfer progress
   */
  getProgress(transferId: string): TransferProgress | null {
    return this.transfers.get(transferId) || null;
  }

  /**
   * Cleans up old transfers (older than 1 hour)
   */
  cleanup(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [id, transfer] of this.transfers.entries()) {
      if (transfer.endTime && transfer.endTime < oneHourAgo) {
        this.transfers.delete(id);
      }
    }
  }
}
