# Cancel Transfer Functionality

## Date: 2025-11-27

## Overview
Added the ability to cancel running transfers from the frontend UI. When a user clicks the (X) button on an active transfer, the system now properly stops both the Step Functions execution and any running ECS tasks.

## Problem Solved
Previously, stopping ECS tasks manually would cause Step Functions to restart them automatically. There was no way to properly cancel a transfer from the UI, and the state machines would keep spawning new tasks.

## Changes Implemented

### 1. Backend Changes

#### DynamoDBService.ts
- Added `executionArn` field to `TransferRecord` interface
- Added `markTransferCancelled()` method to mark transfers as cancelled
- Added `updateExecutionArn()` method to store Step Functions execution ARN

#### jobSubmissionHandler.ts
- Updated to store the Step Functions execution ARN in DynamoDB after starting execution
- This allows later cancellation of the execution

#### cancelTransferHandler.ts (NEW)
- New Lambda handler for cancelling transfers
- Validates transfer ID and retrieves transfer record
- Stops Step Functions execution using stored execution ARN
- Lists and stops any running ECS tasks in the cluster
- Marks transfer as cancelled in DynamoDB
- Returns success response

### 2. Infrastructure Changes

#### s3-zip-downloader-stack.ts
- Added `CancelTransferLambdaRole` with permissions for:
  - DynamoDB: GetItem, UpdateItem
  - Step Functions: StopExecution
  - ECS: ListTasks, StopTask
- Added `CancelTransferFunction` Lambda
- Added `DELETE /transfers/{transferId}` API endpoint
- Wired up the cancel Lambda to the API Gateway

### 3. Frontend Changes

#### ApiClient.ts
- Added `cancelTransfer(transferId)` method
- Sends DELETE request to `/transfers/{transferId}`

#### JobsMonitor.tsx
- Updated `removeJob()` to accept `shouldCancel` parameter
- When removing an active job (pending/in-progress), calls `apiClient.cancelTransfer()`
- Updated X button to pass `shouldCancel=true` for active jobs
- Added aria-label to X button for better accessibility

## API Endpoint

### DELETE /transfers/{transferId}

**Request:**
```
DELETE /transfers/{transferId}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Transfer cancelled successfully",
  "transferId": "12345678-1234-1234-1234-123456789abc"
}
```

**Error Responses:**

400 - Transfer not active:
```json
{
  "success": false,
  "error": {
    "code": "TRANSFER_NOT_ACTIVE",
    "message": "Transfer is already completed"
  }
}
```

404 - Transfer not found:
```json
{
  "success": false,
  "error": {
    "code": "TRANSFER_NOT_FOUND",
    "message": "Transfer not found"
  }
}
```

## User Experience

1. User sees active transfers in the "Active Transfers" section
2. Each transfer has an (X) button next to the status indicator
3. For active transfers (pending/in-progress):
   - Clicking (X) cancels the transfer via API
   - Stops the Step Functions execution
   - Stops any running ECS tasks
   - Marks transfer as cancelled in DynamoDB
   - Removes from UI
4. For completed/failed transfers:
   - Clicking (X) just removes from UI (no API call)

## Error Handling

The cancel handler gracefully handles:
- Execution already stopped (ExecutionDoesNotExist error)
- No running ECS tasks
- DynamoDB update failures
- Network errors

If cancellation fails, the transfer is still removed from the UI, but may continue running in the background.

## Testing

To test the cancel functionality:
1. Start a large file transfer
2. Click the (X) button while it's in progress
3. Verify:
   - Transfer disappears from UI
   - Step Functions execution is stopped (check AWS Console)
   - ECS task is stopped (check AWS Console)
   - DynamoDB record shows status="cancelled"

## Files Modified

### Backend
1. `backend/src/services/DynamoDBService.ts` - Added cancel methods
2. `backend/src/lambda/jobSubmissionHandler.ts` - Store execution ARN
3. `backend/src/lambda/cancelTransferHandler.ts` - NEW cancel handler
4. `backend/package.json` - Added @aws-sdk/client-ecs dependency

### Infrastructure
1. `infrastructure/lib/s3-zip-downloader-stack.ts` - Added cancel Lambda and API endpoint

### Frontend
1. `frontend/src/services/ApiClient.ts` - Added cancelTransfer method
2. `frontend/src/components/JobsMonitor.tsx` - Wire up cancel to X button

## Deployment Status

✅ Backend compiled with new cancel handler
✅ Infrastructure deployed with cancel Lambda and API endpoint
✅ Frontend deployed with cancel functionality
✅ Ready for testing
