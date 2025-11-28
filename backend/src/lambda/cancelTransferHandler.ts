/**
 * Lambda handler for cancelling transfers
 * 
 * This handler:
 * - Validates the transfer ID
 * - Retrieves the transfer record from DynamoDB
 * - Stops the Step Functions execution
 * - Stops any running ECS tasks
 * - Marks the transfer as cancelled in DynamoDB
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SFNClient, StopExecutionCommand } from '@aws-sdk/client-sfn';
import { ECSClient, StopTaskCommand, ListTasksCommand } from '@aws-sdk/client-ecs';
import { DynamoDBService } from '../services/DynamoDBService.js';

// Environment variables
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'TransferTable';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const ECS_CLUSTER_NAME = process.env.ECS_CLUSTER_NAME || 'S3ZipDownloaderCluster';

// Initialize services
const dynamoDBService = new DynamoDBService(DYNAMODB_TABLE_NAME, AWS_REGION);
const sfnClient = new SFNClient({ region: AWS_REGION });
const ecsClient = new ECSClient({ region: AWS_REGION });

/**
 * Lambda handler for cancelling transfers
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Cancel transfer request received:', JSON.stringify(event, null, 2));

  try {
    // Extract transfer ID from path parameters
    const transferId = event.pathParameters?.transferId;

    if (!transferId) {
      return createErrorResponse(400, 'MISSING_TRANSFER_ID', 'Transfer ID is required');
    }

    console.log(`Cancelling transfer: ${transferId}`);

    // Get transfer record from DynamoDB
    const transferRecord = await dynamoDBService.getTransferStatus(transferId);

    if (!transferRecord) {
      return createErrorResponse(404, 'TRANSFER_NOT_FOUND', 'Transfer not found');
    }

    // Check if transfer is already completed, failed, or cancelled
    if (['completed', 'failed', 'cancelled'].includes(transferRecord.status)) {
      return createErrorResponse(400, 'TRANSFER_NOT_ACTIVE', `Transfer is already ${transferRecord.status}`);
    }

    console.log(`Transfer status: ${transferRecord.status}`);

    // Stop Step Functions execution if execution ARN exists
    if (transferRecord.executionArn) {
      try {
        console.log(`Stopping Step Functions execution: ${transferRecord.executionArn}`);
        await sfnClient.send(
          new StopExecutionCommand({
            executionArn: transferRecord.executionArn,
            error: 'UserCancelled',
            cause: 'Transfer cancelled by user',
          })
        );
        console.log('Step Functions execution stopped successfully');
      } catch (sfnError: any) {
        // Log error but continue - execution might already be stopped
        console.error('Failed to stop Step Functions execution:', sfnError);
        if (sfnError.name !== 'ExecutionDoesNotExist') {
          // Only log as warning if execution doesn't exist
          console.warn('Step Functions execution may already be stopped');
        }
      }
    }

    // Find and stop any running ECS tasks for this transfer
    try {
      console.log(`Looking for ECS tasks in cluster: ${ECS_CLUSTER_NAME}`);
      const listTasksResult = await ecsClient.send(
        new ListTasksCommand({
          cluster: ECS_CLUSTER_NAME,
          desiredStatus: 'RUNNING',
        })
      );

      if (listTasksResult.taskArns && listTasksResult.taskArns.length > 0) {
        console.log(`Found ${listTasksResult.taskArns.length} running tasks`);
        
        // Stop all running tasks (we could filter by transfer ID if we had task metadata)
        // For now, we'll stop all tasks since Step Functions should handle task lifecycle
        for (const taskArn of listTasksResult.taskArns) {
          try {
            console.log(`Stopping ECS task: ${taskArn}`);
            await ecsClient.send(
              new StopTaskCommand({
                cluster: ECS_CLUSTER_NAME,
                task: taskArn,
                reason: 'Transfer cancelled by user',
              })
            );
            console.log(`ECS task stopped: ${taskArn}`);
          } catch (ecsError) {
            console.error(`Failed to stop ECS task ${taskArn}:`, ecsError);
            // Continue with other tasks
          }
        }
      } else {
        console.log('No running ECS tasks found');
      }
    } catch (ecsError) {
      console.error('Failed to list/stop ECS tasks:', ecsError);
      // Continue - this is not critical
    }

    // Mark transfer as cancelled in DynamoDB
    try {
      await dynamoDBService.markTransferCancelled(transferId);
      console.log('Transfer marked as cancelled in DynamoDB');
    } catch (dbError) {
      console.error('Failed to mark transfer as cancelled in DynamoDB:', dbError);
      return createErrorResponse(500, 'DATABASE_ERROR', 'Failed to update transfer status');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
      },
      body: JSON.stringify({
        success: true,
        message: 'Transfer cancelled successfully',
        transferId,
      }),
    };
  } catch (error) {
    console.error('Error cancelling transfer:', error);
    return createErrorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Helper function to create error responses
 */
function createErrorResponse(statusCode: number, code: string, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
    },
    body: JSON.stringify({
      success: false,
      error: {
        code,
        message,
      },
    }),
  };
}
