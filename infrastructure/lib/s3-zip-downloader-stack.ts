import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

export class S3ZipDownloaderStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB table for transfer state persistence
    // Requirements: 7.6, 8.7
    // Schema:
    // - Partition Key: transferId (STRING)
    // - Attributes: status, sourceUrl, bucketName, keyPrefix, s3Key, 
    //   bytesTransferred, totalBytes, percentage, startTime, endTime, 
    //   lastUpdateTime, error, fargateTaskArn, ttl
    // - TTL: Automatic cleanup using 'ttl' attribute (set by application)
    const transferTable = new dynamodb.Table(this, 'TransferTable', {
      partitionKey: {
        name: 'transferId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand billing
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl', // TTL attribute name (value set by application)
      pointInTimeRecovery: false, // Disable for cost savings in non-prod
    });

    // VPC for ECS Fargate tasks
    // Requirements: 7.2, 8.2
    const vpc = new ec2.Vpc(this, 'WorkerVpc', {
      maxAzs: 2, // Use 2 availability zones for high availability
      natGateways: 1, // Use 1 NAT gateway to reduce costs
    });

    // ECS Cluster for Fargate tasks
    // Requirements: 7.2, 8.2
    const cluster = new ecs.Cluster(this, 'WorkerCluster', {
      vpc,
      clusterName: 'S3ZipDownloaderCluster',
      containerInsights: true, // Enable CloudWatch Container Insights
    });

    // ECR repository for worker container image
    // Requirements: 7.2
    const workerRepository = new ecr.Repository(this, 'WorkerRepository', {
      repositoryName: 's3-zip-downloader-worker',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      imageScanOnPush: true, // Enable vulnerability scanning
    });

    // IAM role for Fargate task execution (pulling images, writing logs)
    // Requirements: 7.2, 7.4
    const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Execution role for S3 ZIP Downloader Fargate tasks',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // IAM role for Fargate task (S3 and DynamoDB access)
    // Requirements: 6.1, 7.4
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Task role for S3 ZIP Downloader Fargate tasks',
    });

    // Grant S3 write permissions to task role
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:PutObject',
          's3:PutObjectAcl',
          's3:AbortMultipartUpload',
          's3:ListMultipartUploadParts',
        ],
        resources: ['arn:aws:s3:::*/*'],
      })
    );

    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:ListBucket', 's3:GetBucketLocation'],
        resources: ['arn:aws:s3:::*'],
      })
    );

    // Grant DynamoDB write permissions to task role
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:UpdateItem',
          'dynamodb:PutItem',
        ],
        resources: [transferTable.tableArn],
      })
    );

    // CloudWatch log group for Fargate tasks
    // Requirements: 7.2
    const workerLogGroup = new logs.LogGroup(this, 'WorkerLogGroup', {
      logGroupName: '/ecs/s3-zip-downloader-worker',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ECS Task Definition for Fargate worker
    // Requirements: 7.2, 8.2
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'WorkerTaskDefinition', {
      memoryLimitMiB: 4096, // 4GB memory
      cpu: 2048, // 2 vCPU
      executionRole: taskExecutionRole,
      taskRole: taskRole,
    });

    // Add container to task definition
    const workerContainer = taskDefinition.addContainer('WorkerContainer', {
      image: ecs.ContainerImage.fromEcrRepository(workerRepository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'worker',
        logGroup: workerLogGroup,
      }),
      environment: {
        AWS_REGION: this.region,
        DYNAMODB_TABLE_NAME: transferTable.tableName,
      },
      // Environment variables TRANSFER_ID, SOURCE_URL, BUCKET, KEY_PREFIX
      // will be passed at runtime by Step Functions
    });

    // IAM role for Step Functions state machine
    // Requirements: 7.2, 8.2
    const stateMachineRole = new iam.Role(this, 'StateMachineRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      description: 'Execution role for S3 ZIP Downloader Step Functions',
    });

    // Grant Step Functions permission to run ECS tasks
    stateMachineRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ecs:RunTask'],
        resources: [taskDefinition.taskDefinitionArn],
      })
    );

    // Grant Step Functions permission to pass IAM roles to ECS
    stateMachineRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: [taskExecutionRole.roleArn, taskRole.roleArn],
      })
    );

    // Grant Step Functions permission to stop ECS tasks
    stateMachineRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ecs:StopTask', 'ecs:DescribeTasks'],
        resources: ['*'],
      })
    );

    // Grant Step Functions permission to write to CloudWatch Logs
    stateMachineRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogDelivery',
          'logs:GetLogDelivery',
          'logs:UpdateLogDelivery',
          'logs:DeleteLogDelivery',
          'logs:ListLogDeliveries',
          'logs:PutResourcePolicy',
          'logs:DescribeResourcePolicies',
          'logs:DescribeLogGroups',
        ],
        resources: ['*'],
      })
    );

    // Grant Step Functions permission to update DynamoDB (for error handling)
    stateMachineRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:UpdateItem'],
        resources: [transferTable.tableArn],
      })
    );

    // Step Functions task to run Fargate container
    // Requirements: 7.2, 8.2
    const runFargateTask = new tasks.EcsRunTask(this, 'RunFargateTask', {
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      cluster,
      taskDefinition,
      launchTarget: new tasks.EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      containerOverrides: [
        {
          containerDefinition: workerContainer,
          environment: [
            {
              name: 'TRANSFER_ID',
              value: sfn.JsonPath.stringAt('$.transferId'),
            },
            {
              name: 'SOURCE_URL',
              value: sfn.JsonPath.stringAt('$.sourceUrl'),
            },
            {
              name: 'BUCKET',
              value: sfn.JsonPath.stringAt('$.bucketName'),
            },
            {
              name: 'KEY_PREFIX',
              value: sfn.JsonPath.stringAt('$.keyPrefix'),
            },
          ],
        },
      ],
      taskTimeout: sfn.Timeout.duration(cdk.Duration.hours(48)), // 48 hours for very large files
      heartbeatTimeout: sfn.Timeout.duration(cdk.Duration.hours(48)),
    });

    // Configure retry logic for transient failures
    // Requirements: 8.2, 8.3, 8.4
    runFargateTask.addRetry({
      errors: [
        'ECS.AmazonECSException', // ECS service errors
        'States.TaskFailed', // Task execution failures
        'States.Timeout', // Timeout errors
      ],
      interval: cdk.Duration.seconds(30), // Wait 30 seconds before retry
      maxAttempts: 2, // Retry up to 2 times (3 total attempts)
      backoffRate: 2.0, // Exponential backoff (30s, 60s)
    });

    // Step Functions task to update DynamoDB on failure
    // Requirements: 8.3, 8.4
    const updateDynamoDBOnFailure = new tasks.DynamoUpdateItem(this, 'UpdateDynamoDBOnFailure', {
      table: transferTable,
      key: {
        transferId: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.transferId')),
      },
      updateExpression: 'SET #status = :status, endTime = :endTime, lastUpdateTime = :updateTime, #error = :error',
      expressionAttributeNames: {
        '#status': 'status',
        '#error': 'error',
      },
      expressionAttributeValues: {
        ':status': tasks.DynamoAttributeValue.fromString('failed'),
        ':endTime': tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$$.State.EnteredTime')),
        ':updateTime': tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$$.State.EnteredTime')),
        // Use errorInfo.Error if available, otherwise use a generic message
        ':error': tasks.DynamoAttributeValue.fromString(
          sfn.JsonPath.format('Task failed: {}', sfn.JsonPath.stringAt('$.errorInfo.Error'))
        ),
      },
      resultPath: sfn.JsonPath.DISCARD,
    });

    // Define success state
    const successState = new sfn.Succeed(this, 'TransferSucceeded', {
      comment: 'Transfer completed successfully',
    });

    // Define failure state
    const failureState = new sfn.Fail(this, 'TransferFailed', {
      comment: 'Transfer failed',
      error: 'TransferError',
      cause: 'Fargate task failed to complete transfer',
    });

    // Chain: Run Fargate task -> Success or (Update DynamoDB -> Failure)
    // Requirements: 8.2 - Catch Fargate task failures and update DynamoDB
    // Requirements: 8.3, 8.4 - Handle network interruptions and report errors
    const definition = runFargateTask
      .addCatch(updateDynamoDBOnFailure, {
        errors: ['States.ALL'], // Catch all errors including task failures
        resultPath: '$.errorInfo', // Store error details in errorInfo field
      })
      .next(successState);

    updateDynamoDBOnFailure.next(failureState);

    // CloudWatch log group for Step Functions
    const stateMachineLogGroup = new logs.LogGroup(this, 'StateMachineLogGroup', {
      logGroupName: '/aws/stepfunctions/s3-zip-downloader',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Step Functions state machine
    // Requirements: 7.2, 8.2
    const stateMachine = new sfn.StateMachine(this, 'TransferStateMachine', {
      stateMachineName: 'S3ZipDownloaderTransfer',
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      role: stateMachineRole,
      logs: {
        destination: stateMachineLogGroup,
        level: sfn.LogLevel.ALL,
        includeExecutionData: true,
      },
      tracingEnabled: true, // Enable X-Ray tracing
      timeout: cdk.Duration.hours(48), // 48 hours for very large files
    });

    // S3 bucket for frontend hosting (private bucket, accessed via CloudFront)
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Keep bucket private
    });

    // CloudFront Origin Access Control for secure S3 access
    const oac = new cloudfront.CfnOriginAccessControl(this, 'FrontendOAC', {
      originAccessControlConfig: {
        name: 'S3ZipDownloaderOAC',
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
        description: 'Origin Access Control for S3 ZIP Downloader frontend',
      },
    });

    // CloudFront distribution for frontend
    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // Lambda execution role for job submission
    // Requirements: 7.2, 8.6
    const jobSubmissionLambdaRole = new iam.Role(this, 'JobSubmissionLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for S3 ZIP Downloader job submission Lambda',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Add DynamoDB permissions for job submission
    jobSubmissionLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
        ],
        resources: [transferTable.tableArn],
      })
    );

    // Add Step Functions permissions for starting executions
    // Requirements: 3.1, 8.6
    jobSubmissionLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['states:StartExecution'],
        resources: [stateMachine.stateMachineArn],
      })
    );

    // Lambda execution role for progress query
    // Requirements: 4.2, 4.3
    const progressQueryLambdaRole = new iam.Role(this, 'ProgressQueryLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for S3 ZIP Downloader progress query Lambda',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Add DynamoDB read permissions for progress query
    progressQueryLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:Query',
        ],
        resources: [transferTable.tableArn],
      })
    );

    // Lambda function for job submission
    // Requirements: 7.2, 8.6
    // Package includes dist folder with compiled code and node_modules
    const jobSubmissionLambda = new lambda.Function(this, 'JobSubmissionFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'lambda/jobSubmissionHandler.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      role: jobSubmissionLambdaRole,
      timeout: cdk.Duration.seconds(30), // 30 seconds
      memorySize: 512, // 512MB memory
      environment: {
        DYNAMODB_TABLE_NAME: transferTable.tableName,
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Lambda function for job submission',
    });

    // Lambda function for progress query
    // Requirements: 4.2, 4.3
    const progressQueryLambda = new lambda.Function(this, 'ProgressQueryFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'lambda/progressQueryHandler.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      role: progressQueryLambdaRole,
      timeout: cdk.Duration.seconds(10), // 10 seconds
      memorySize: 256, // 256MB memory
      environment: {
        DYNAMODB_TABLE_NAME: transferTable.tableName,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Lambda function for querying transfer status',
    });

    // API Gateway REST API
    // Requirements: 7.2, 7.5
    const api = new apigateway.RestApi(this, 'S3ZipDownloaderApi', {
      restApiName: 'S3 ZIP Downloader API',
      description: 'API for S3 ZIP Downloader service',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 10, // 10 requests per second
        throttlingBurstLimit: 20, // 20 concurrent requests
      },
    });

    // Lambda integration for job submission
    const jobSubmissionIntegration = new apigateway.LambdaIntegration(jobSubmissionLambda, {
      timeout: cdk.Duration.seconds(29), // API Gateway max timeout
      proxy: true,
    });

    // Lambda integration for progress query
    const progressQueryIntegration = new apigateway.LambdaIntegration(progressQueryLambda, {
      timeout: cdk.Duration.seconds(29), // API Gateway max timeout
      proxy: true,
    });

    // POST /transfers endpoint (job submission)
    // Requirements: 7.2, 7.5
    const transfersResource = api.root.addResource('transfers');
    transfersResource.addMethod('POST', jobSubmissionIntegration);

    // GET /transfers/{transferId} endpoint (progress query)
    // Requirements: 4.2, 4.3, 7.2, 7.5
    const transferIdResource = transfersResource.addResource('{transferId}');
    transferIdResource.addMethod('GET', progressQueryIntegration);

    // CloudWatch alarm for job submission Lambda errors
    // Requirements: 7.2
    jobSubmissionLambda.metricErrors({
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    }).createAlarm(this, 'JobSubmissionErrorAlarm', {
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: 'Alert when job submission Lambda has 5 or more errors in 5 minutes',
      alarmName: 'S3ZipDownloader-JobSubmission-Errors',
    });

    // CloudWatch alarm for job submission Lambda throttles
    jobSubmissionLambda.metricThrottles({
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    }).createAlarm(this, 'JobSubmissionThrottleAlarm', {
      threshold: 3,
      evaluationPeriods: 1,
      alarmDescription: 'Alert when job submission Lambda is throttled 3 or more times in 5 minutes',
      alarmName: 'S3ZipDownloader-JobSubmission-Throttles',
    });

    // CloudWatch alarm for progress query Lambda errors
    progressQueryLambda.metricErrors({
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    }).createAlarm(this, 'ProgressQueryErrorAlarm', {
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: 'Alert when progress query Lambda has 5 or more errors in 5 minutes',
      alarmName: 'S3ZipDownloader-ProgressQuery-Errors',
    });

    // CloudWatch alarm for progress query Lambda throttles
    progressQueryLambda.metricThrottles({
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    }).createAlarm(this, 'ProgressQueryThrottleAlarm', {
      threshold: 3,
      evaluationPeriods: 1,
      alarmDescription: 'Alert when progress query Lambda is throttled 3 or more times in 5 minutes',
      alarmName: 'S3ZipDownloader-ProgressQuery-Throttles',
    });

    // Output API endpoint
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'API Gateway endpoint URL',
    });

    // Output job submission Lambda function name
    new cdk.CfnOutput(this, 'JobSubmissionLambdaName', {
      value: jobSubmissionLambda.functionName,
      description: 'Job submission Lambda function name',
    });

    // Output progress query Lambda function name
    new cdk.CfnOutput(this, 'ProgressQueryLambdaName', {
      value: progressQueryLambda.functionName,
      description: 'Progress query Lambda function name',
    });

    // Output CloudFront distribution URL
    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: distribution.distributionDomainName,
      description: 'CloudFront distribution URL',
    });

    // Test S3 bucket for integration testing
    const testBucket = new s3.Bucket(this, 'TestBucket', {
      bucketName: `s3-zip-downloader-test-${cdk.Stack.of(this).account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
      lifecycleRules: [
        {
          id: 'DeleteOldTestFiles',
          enabled: true,
          expiration: cdk.Duration.days(7), // Auto-delete test files after 7 days
        },
      ],
    });

    // Output S3 bucket name
    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
      description: 'S3 bucket name for frontend hosting',
    });

    // Output test bucket name
    new cdk.CfnOutput(this, 'TestBucketName', {
      value: testBucket.bucketName,
      description: 'S3 bucket name for integration testing',
    });

    // Output DynamoDB table name
    new cdk.CfnOutput(this, 'DynamoDBTableName', {
      value: transferTable.tableName,
      description: 'DynamoDB table name for transfer state',
    });

    // Output Step Functions state machine ARN
    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: stateMachine.stateMachineArn,
      description: 'Step Functions state machine ARN',
    });

    // Output ECS cluster name
    new cdk.CfnOutput(this, 'EcsClusterName', {
      value: cluster.clusterName,
      description: 'ECS cluster name for Fargate tasks',
    });

    // Output ECR repository URI
    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: workerRepository.repositoryUri,
      description: 'ECR repository URI for worker container image',
    });
  }
}
