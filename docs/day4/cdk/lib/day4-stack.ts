import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';

export interface Day4ServerlessStackProps extends cdk.StackProps {
  userName: string;
}

export class Day4ServerlessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Day4ServerlessStackProps) {
    super(scope, id, props);

    const { userName } = props;

    // ========================================
    // 1. Cognito User Pool for Authentication
    // ========================================
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `day4-user-pool-${userName}`,
      selfSignUpEnabled: true,
      signInAliases: {
        username: true,
      },
      autoVerify: {
        // No auto-verify needed for username-only sign-in
      },
      standardAttributes: {
        email: {
          required: false,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient('UserPoolClient', {
      userPoolClientName: `day4-client-${userName}`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
    });

    // ========================================
    // 2. DynamoDB Tables (On-Demand Mode - 50% cheaper since Nov 2024!)
    // ========================================
    
    // Employee Table
    const employeeTable = new dynamodb.TableV2(this, 'EmployeeTable', {
      tableName: `day4-employees-${userName}`,
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: false,
    });

    // Files Table
    const filesTable = new dynamodb.TableV2(this, 'FilesTable', {
      tableName: `day4-files-${userName}`,
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: false,
    });

    // ========================================
    // 3. S3 Bucket for File Storage
    // ========================================
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    
    const filesBucket = new s3.Bucket(this, 'FilesBucket', {
      bucketName: `day4-files-${userName}-${timestamp}-${randomSuffix}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST, s3.HttpMethods.DELETE],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
    });

    // ========================================
    // 4. Lambda Functions (Node.js 22 - Latest LTS!)
    // ========================================
    
    // API Lambda Function
    const apiFunction = new lambda.Function(this, 'ApiFunction', {
      functionName: `day4-api-${userName}`,
      runtime: lambda.Runtime.NODEJS_22_X, // 2025 Latest!
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/api')),
      environment: {
        EMPLOYEE_TABLE_NAME: employeeTable.tableName,
        FILES_TABLE_NAME: filesTable.tableName,
        FILES_BUCKET_NAME: filesBucket.bucketName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });

    // Grant permissions
    employeeTable.grantReadWriteData(apiFunction);
    filesTable.grantReadWriteData(apiFunction);
    filesBucket.grantReadWrite(apiFunction);

    // ========================================
    // Seed Data with Custom Resource
    // ========================================
    const seedFunction = new lambda.Function(this, 'SeedFunction', {
      functionName: `day4-seed-${userName}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/seed')),
      environment: {
        EMPLOYEE_TABLE_NAME: employeeTable.tableName,
      },
      timeout: cdk.Duration.seconds(60),
    });

    employeeTable.grantWriteData(seedFunction);

    const seedProvider = new cr.Provider(this, 'SeedProvider', {
      onEventHandler: seedFunction,
    });

    new cdk.CustomResource(this, 'SeedData', {
      serviceToken: seedProvider.serviceToken,
    });

    // ========================================
    // 5. API Gateway REST API
    // ========================================
    const api = new apigateway.RestApi(this, 'Api', {
      restApiName: `day4-api-${userName}`,
      description: 'Day 4 Serverless API',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
    });

    // Cognito Authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool],
      authorizerName: `day4-authorizer-${userName}`,
    });

    // API Routes
    const apiIntegration = new apigateway.LambdaIntegration(apiFunction);
    
    // /auth routes (no authorization required)
    const authResource = api.root.addResource('auth');
    authResource.addResource('signup').addMethod('POST', apiIntegration);
    authResource.addResource('signin').addMethod('POST', apiIntegration);
    
    // /employees routes (authorization required)
    const employeesResource = api.root.addResource('employees');
    employeesResource.addMethod('GET', apiIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    employeesResource.addMethod('POST', apiIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    
    const employeeResource = employeesResource.addResource('{id}');
    employeeResource.addMethod('GET', apiIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    employeeResource.addMethod('PUT', apiIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    employeeResource.addMethod('DELETE', apiIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // /files routes (authorization required)
    const filesResource = api.root.addResource('files');
    filesResource.addMethod('GET', apiIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    filesResource.addMethod('POST', apiIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    
    // /files/upload-url
    const uploadUrlResource = filesResource.addResource('upload-url');
    uploadUrlResource.addMethod('POST', apiIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    
    const fileResource = filesResource.addResource('{id}');
    fileResource.addMethod('DELETE', apiIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    
    // /files/{id}/download-url
    const downloadUrlResource = fileResource.addResource('download-url');
    downloadUrlResource.addMethod('GET', apiIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ========================================
    // 7. S3 Bucket for Static Website
    // ========================================
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `day4-website-${userName}-${timestamp}-${randomSuffix}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // ========================================
    // 8. CloudFront Distribution (2025 Latest Features!)
    // ========================================
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      comment: `Day 4 CloudFront Distribution for ${userName}`,
    });

    // Deploy static website with placeholder replacement
    const appJsTemplate = fs.readFileSync(path.join(__dirname, '../frontend/app.js.template'), 'utf-8');
    const appJsWithConfig = `// Configuration
const API_URL = '${api.url}';
const USER_POOL_ID = '${userPool.userPoolId}';
const CLIENT_ID = '${userPoolClient.userPoolClientId}';

${appJsTemplate.replace(/^\/\/ Configuration[\s\S]*?const CLIENT_ID = ['"].*?['"];?\s*/m, '')}`;

    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../frontend'), {
          exclude: ['app.js.template'],
        }),
        s3deploy.Source.data('app.js', appJsWithConfig),
      ],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL',
    });

    new cdk.CfnOutput(this, 'EmployeeTableName', {
      value: employeeTable.tableName,
      description: 'DynamoDB Employee Table Name',
    });

    new cdk.CfnOutput(this, 'FilesTableName', {
      value: filesTable.tableName,
      description: 'DynamoDB Files Table Name',
    });

    new cdk.CfnOutput(this, 'FilesBucketName', {
      value: filesBucket.bucketName,
      description: 'S3 Files Bucket Name',
    });
  }
}
