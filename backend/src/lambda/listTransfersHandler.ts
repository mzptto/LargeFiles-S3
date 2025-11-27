/**
 * Lambda handler for listing all transfers
 * 
 * This handler:
 * - Queries DynamoDB for all transfer records
 * - Returns a list of transfers with their current status
 * - Supports filtering by status (optional)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

// Environment variables
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'TransferTable';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Initialize DynamoDB client
const ddbClient = new DynamoDBClient({ region: AWS_REGION });

/**
 * Lambda handler for listing transfers
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('List transfers request received:', JSON.stringify(event, null, 2));

  try {
    // Get optional status filter from query parameters
    const statusFilter = event.queryStringParameters?.status;
    
    // Scan DynamoDB table for all transfers
    const scanParams: any = {
      TableName: DYNAMODB_TABLE_NAME,
      Limit: 100, // Limit to 100 most recent transfers
    };

    // Add filter expression if status is specified
    if (statusFilter) {
      scanParams.FilterExpression = '#status = :status';
      scanParams.ExpressionAttributeNames = {
        '#status': 'status'
      };
      scanParams.ExpressionAttributeValues = {
        ':status': { S: statusFilter }
      };
    }

    console.log('Scanning DynamoDB with params:', scanParams);

    const result = await ddbClient.send(new ScanCommand(scanParams));

    console.log(`Found ${result.Items?.length || 0} transfers`);

    // Format the response - unmarshall DynamoDB items
    const transfers = (result.Items || []).map((rawItem: any) => {
      const item = unmarshall(rawItem);
      return {
      transferId: item.transferId,
      status: item.status,
      progress: {
        bytesTransferred: item.bytesTransferred || 0,
        totalBytes: item.totalBytes || 0,
        percentage: item.percentage || 0,
      },
      metadata: {
        sourceUrl: item.sourceUrl,
        bucketName: item.bucketName,
        keyPrefix: item.keyPrefix,
        s3Key: item.s3Key,
        s3Location: item.s3Location,
        startTime: item.startTime,
        endTime: item.endTime,
        lastUpdateTime: item.lastUpdateTime,
      },
      error: item.error,
      };
    });

    // Sort by start time (most recent first)
    transfers.sort((a: any, b: any) => {
      const timeA = new Date(a.metadata.startTime || 0).getTime();
      const timeB = new Date(b.metadata.startTime || 0).getTime();
      return timeB - timeA;
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      body: JSON.stringify({
        success: true,
        transfers,
        count: transfers.length,
      }),
    };
  } catch (error) {
    console.error('Error listing transfers:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      body: JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list transfers',
          retryable: true,
        },
      }),
    };
  }
}
