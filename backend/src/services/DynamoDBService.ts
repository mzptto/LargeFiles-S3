/**
 * DynamoDB service for persisting transfer state
 * Requirements: 7.6, 8.7
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  PutItemCommandInput,
  GetItemCommandInput,
  UpdateItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

export enum TransferStatus {
  PENDING = 'pending',
  STARTING = 'starting',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface TransferRecord {
  transferId: string;
  sourceUrl: string;
  bucketName: string;
  keyPrefix?: string;
  s3Key: string;
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  status: TransferStatus;
  startTime: string; // ISO timestamp
  endTime?: string; // ISO timestamp
  lastUpdateTime: string; // ISO timestamp
  error?: string;
  fargateTaskArn?: string;
  s3Location?: string; // S3 location after successful transfer
  ttl?: number; // Unix timestamp for TTL
}

export class DynamoDBService {
  private client: DynamoDBClient;
  private tableName: string;

  constructor(tableName: string, region?: string) {
    this.client = new DynamoDBClient({ region: region || process.env.AWS_REGION });
    this.tableName = tableName;
  }

  /**
   * Creates a new transfer record in DynamoDB
   * Requirements: 7.6, 8.7
   */
  async createTransferRecord(
    transferId: string,
    sourceUrl: string,
    bucketName: string,
    s3Key: string,
    keyPrefix?: string
  ): Promise<TransferRecord> {
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days from now

    const record: TransferRecord = {
      transferId,
      sourceUrl,
      bucketName,
      keyPrefix,
      s3Key,
      bytesTransferred: 0,
      totalBytes: 0,
      percentage: 0,
      status: TransferStatus.PENDING,
      startTime: now,
      lastUpdateTime: now,
      ttl,
    };

    const params: PutItemCommandInput = {
      TableName: this.tableName,
      Item: marshall(record, { removeUndefinedValues: true }),
    };

    try {
      await this.client.send(new PutItemCommand(params));
      return record;
    } catch (error) {
      throw new Error(
        `Failed to create transfer record: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Updates transfer progress in DynamoDB
   * Requirements: 7.6, 8.7
   */
  async updateTransferProgress(
    transferId: string,
    bytesTransferred: number,
    totalBytes: number
  ): Promise<TransferRecord | null> {
    const percentage = totalBytes > 0 ? Math.min(Math.floor((bytesTransferred / totalBytes) * 100), 100) : 0;
    const now = new Date().toISOString();

    const params: UpdateItemCommandInput = {
      TableName: this.tableName,
      Key: marshall({ transferId }),
      UpdateExpression:
        'SET bytesTransferred = :bytes, totalBytes = :total, percentage = :pct, #status = :status, lastUpdateTime = :updateTime',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: marshall({
        ':bytes': bytesTransferred,
        ':total': totalBytes,
        ':pct': percentage,
        ':status': TransferStatus.IN_PROGRESS,
        ':updateTime': now,
      }),
      ReturnValues: 'ALL_NEW',
    };

    try {
      const result = await this.client.send(new UpdateItemCommand(params));
      if (result.Attributes) {
        return unmarshall(result.Attributes) as TransferRecord;
      }
      return null;
    } catch (error) {
      throw new Error(
        `Failed to update transfer progress: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Queries transfer status from DynamoDB
   * Requirements: 7.6, 8.7
   */
  async getTransferStatus(transferId: string): Promise<TransferRecord | null> {
    const params: GetItemCommandInput = {
      TableName: this.tableName,
      Key: marshall({ transferId }),
    };

    try {
      const result = await this.client.send(new GetItemCommand(params));
      if (result.Item) {
        return unmarshall(result.Item) as TransferRecord;
      }
      return null;
    } catch (error) {
      throw new Error(
        `Failed to get transfer status: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Marks transfer as completed in DynamoDB
   * Requirements: 7.6, 8.7
   */
  async markTransferComplete(transferId: string, s3Location: string): Promise<TransferRecord | null> {
    const now = new Date().toISOString();

    const params: UpdateItemCommandInput = {
      TableName: this.tableName,
      Key: marshall({ transferId }),
      UpdateExpression:
        'SET #status = :status, endTime = :endTime, lastUpdateTime = :updateTime, percentage = :pct, s3Location = :location',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: marshall({
        ':status': TransferStatus.COMPLETED,
        ':endTime': now,
        ':updateTime': now,
        ':pct': 100,
        ':location': s3Location,
      }),
      ReturnValues: 'ALL_NEW',
    };

    try {
      const result = await this.client.send(new UpdateItemCommand(params));
      if (result.Attributes) {
        return unmarshall(result.Attributes) as TransferRecord;
      }
      return null;
    } catch (error) {
      throw new Error(
        `Failed to mark transfer complete: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Marks transfer as failed in DynamoDB
   * Requirements: 7.6, 8.7, 3.4, 3.5, 8.3, 8.4 - Update DynamoDB with error details
   */
  async markTransferFailed(transferId: string, errorMessage: string): Promise<TransferRecord | null> {
    const now = new Date().toISOString();

    // Truncate error message if too long (DynamoDB has size limits)
    const truncatedError = errorMessage.length > 1000 
      ? errorMessage.substring(0, 997) + '...' 
      : errorMessage;

    const params: UpdateItemCommandInput = {
      TableName: this.tableName,
      Key: marshall({ transferId }),
      UpdateExpression:
        'SET #status = :status, endTime = :endTime, lastUpdateTime = :updateTime, #error = :error',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#error': 'error',
      },
      ExpressionAttributeValues: marshall({
        ':status': TransferStatus.FAILED,
        ':endTime': now,
        ':updateTime': now,
        ':error': truncatedError,
      }),
      ReturnValues: 'ALL_NEW',
    };

    try {
      const result = await this.client.send(new UpdateItemCommand(params));
      if (result.Attributes) {
        return unmarshall(result.Attributes) as TransferRecord;
      }
      return null;
    } catch (error) {
      // Log the error but don't throw - we want to preserve the original error
      console.error('Failed to mark transfer as failed in DynamoDB:', error);
      throw new Error(
        `Failed to mark transfer failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
