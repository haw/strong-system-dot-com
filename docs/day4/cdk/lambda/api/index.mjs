import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, SignUpCommand, InitiateAuthCommand, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({});
const s3Client = new S3Client({});

const EMPLOYEE_TABLE_NAME = process.env.EMPLOYEE_TABLE_NAME;
const FILES_TABLE_NAME = process.env.FILES_TABLE_NAME;
const FILES_BUCKET_NAME = process.env.FILES_BUCKET_NAME;
const USER_POOL_ID = process.env.USER_POOL_ID;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

// Response helper
const response = (statusCode, body) => ({
  statusCode,
  headers: corsHeaders,
  body: JSON.stringify(body),
});

// Main handler
export const handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const { httpMethod, resource, pathParameters, body: requestBody, requestContext } = event;
  
  // OPTIONS request (CORS preflight)
  if (httpMethod === 'OPTIONS') {
    return response(200, { message: 'OK' });
  }

  try {
    // Parse body
    const body = requestBody ? JSON.parse(requestBody) : {};

    // Route handling
    if (resource === '/auth/signup' && httpMethod === 'POST') {
      return await handleSignUp(body);
    }
    
    if (resource === '/auth/signin' && httpMethod === 'POST') {
      return await handleSignIn(body);
    }

    // Get user info from Cognito authorizer
    const userId = requestContext?.authorizer?.claims?.sub;
    if (!userId) {
      return response(401, { error: 'Unauthorized' });
    }

    if (resource === '/employees' && httpMethod === 'GET') {
      return await handleListEmployees();
    }
    
    if (resource === '/employees' && httpMethod === 'POST') {
      return await handleCreateEmployee(body, userId);
    }
    
    if (resource === '/employees/{id}' && httpMethod === 'GET') {
      const id = pathParameters?.id;
      return await handleGetEmployee(id);
    }
    
    if (resource === '/employees/{id}' && httpMethod === 'PUT') {
      const id = pathParameters?.id;
      return await handleUpdateEmployee(id, body, userId);
    }
    
    if (resource === '/employees/{id}' && httpMethod === 'DELETE') {
      const id = pathParameters?.id;
      return await handleDeleteEmployee(id);
    }

    // File operations
    if (resource === '/files' && httpMethod === 'GET') {
      return await handleListFiles();
    }
    
    if (resource === '/files/upload-url' && httpMethod === 'POST') {
      return await handleGetUploadUrl(body, userId);
    }
    
    if (resource === '/files' && httpMethod === 'POST') {
      return await handleCreateFileMetadata(body, userId);
    }
    
    if (resource === '/files/{id}/download-url' && httpMethod === 'GET') {
      const id = pathParameters?.id;
      return await handleGetDownloadUrl(id);
    }
    
    if (resource === '/files/{id}' && httpMethod === 'DELETE') {
      const id = pathParameters?.id;
      return await handleDeleteFile(id);
    }

    return response(404, { error: 'Not Found' });
  } catch (error) {
    console.error('Error:', error);
    return response(500, { error: error.message });
  }
};

// ========================================
// Auth Handlers
// ========================================

async function handleSignUp(body) {
  const { username, password, name } = body;

  if (!username || !password || !name) {
    return response(400, { error: 'Username, password, and name are required' });
  }

  try {
    const command = new SignUpCommand({
      ClientId: USER_POOL_CLIENT_ID,
      Username: username,
      Password: password,
      UserAttributes: [
        { Name: 'name', Value: name },
      ],
    });

    const result = await cognitoClient.send(command);
    
    return response(200, {
      message: 'User registered successfully',
      userSub: result.UserSub,
    });
  } catch (error) {
    console.error('SignUp error:', error);
    return response(400, { error: error.message });
  }
}

async function handleSignIn(body) {
  const { username, password } = body;

  if (!username || !password) {
    return response(400, { error: 'Username and password are required' });
  }

  try {
    const command = new InitiateAuthCommand({
      ClientId: USER_POOL_CLIENT_ID,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    });

    const result = await cognitoClient.send(command);
    
    return response(200, {
      accessToken: result.AuthenticationResult.AccessToken,
      idToken: result.AuthenticationResult.IdToken,
      refreshToken: result.AuthenticationResult.RefreshToken,
      expiresIn: result.AuthenticationResult.ExpiresIn,
    });
  } catch (error) {
    console.error('SignIn error:', error);
    return response(401, { error: 'Invalid credentials' });
  }
}

// ========================================
// Employee Handlers
// ========================================

async function handleListEmployees() {
  try {
    const command = new ScanCommand({
      TableName: EMPLOYEE_TABLE_NAME,
    });

    const result = await docClient.send(command);
    
    return response(200, {
      employees: result.Items || [],
      count: result.Count,
    });
  } catch (error) {
    console.error('ListEmployees error:', error);
    return response(500, { error: error.message });
  }
}

async function handleCreateEmployee(body, userId) {
  const { name, email, department, position, hireDate } = body;

  if (!name || !email || !department || !position) {
    return response(400, { error: 'Name, email, department, and position are required' });
  }

  try {
    const employee = {
      id: randomUUID(),
      name,
      email,
      department,
      position,
      hireDate: hireDate || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: userId,
    };

    const command = new PutCommand({
      TableName: EMPLOYEE_TABLE_NAME,
      Item: employee,
    });

    await docClient.send(command);
    
    return response(201, employee);
  } catch (error) {
    console.error('CreateEmployee error:', error);
    return response(500, { error: error.message });
  }
}

async function handleGetEmployee(id) {
  try {
    const command = new GetCommand({
      TableName: EMPLOYEE_TABLE_NAME,
      Key: { id },
    });

    const result = await docClient.send(command);
    
    if (!result.Item) {
      return response(404, { error: 'Employee not found' });
    }
    
    return response(200, result.Item);
  } catch (error) {
    console.error('GetEmployee error:', error);
    return response(500, { error: error.message });
  }
}

async function handleUpdateEmployee(id, body, userId) {
  const { name, email, department, position, hireDate } = body;

  try {
    const updateExpression = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    if (name) {
      updateExpression.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = name;
    }
    if (email) {
      updateExpression.push('email = :email');
      expressionAttributeValues[':email'] = email;
    }
    if (department) {
      updateExpression.push('department = :department');
      expressionAttributeValues[':department'] = department;
    }
    if (position) {
      updateExpression.push('#position = :position');
      expressionAttributeNames['#position'] = 'position';
      expressionAttributeValues[':position'] = position;
    }
    if (hireDate) {
      updateExpression.push('hireDate = :hireDate');
      expressionAttributeValues[':hireDate'] = hireDate;
    }

    updateExpression.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const command = new UpdateCommand({
      TableName: EMPLOYEE_TABLE_NAME,
      Key: { id },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    const result = await docClient.send(command);
    
    return response(200, result.Attributes);
  } catch (error) {
    console.error('UpdateEmployee error:', error);
    return response(500, { error: error.message });
  }
}

async function handleDeleteEmployee(id) {
  try {
    const command = new DeleteCommand({
      TableName: EMPLOYEE_TABLE_NAME,
      Key: { id },
    });

    await docClient.send(command);
    
    return response(200, { message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('DeleteEmployee error:', error);
    return response(500, { error: error.message });
  }
}

// ========================================
// File Handlers
// ========================================

async function handleListFiles() {
  try {
    const command = new ScanCommand({
      TableName: FILES_TABLE_NAME,
    });

    const result = await docClient.send(command);
    
    return response(200, {
      files: result.Items || [],
      count: result.Count,
    });
  } catch (error) {
    console.error('ListFiles error:', error);
    return response(500, { error: error.message });
  }
}

async function handleGetUploadUrl(body, userId) {
  const { fileName, fileSize, mimeType } = body;

  if (!fileName) {
    return response(400, { error: 'fileName is required' });
  }

  try {
    const fileId = randomUUID();
    const s3Key = `${userId}/${fileId}/${fileName}`;

    const command = new PutObjectCommand({
      Bucket: FILES_BUCKET_NAME,
      Key: s3Key,
      ContentType: mimeType || 'application/octet-stream',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return response(200, {
      uploadUrl,
      fileId,
      s3Key,
    });
  } catch (error) {
    console.error('GetUploadUrl error:', error);
    return response(500, { error: error.message });
  }
}

async function handleCreateFileMetadata(body, userId) {
  const { fileId, fileName, fileSize, mimeType, s3Key } = body;

  if (!fileId || !fileName || !s3Key) {
    return response(400, { error: 'fileId, fileName, and s3Key are required' });
  }

  try {
    const fileMetadata = {
      id: fileId,
      fileName,
      fileSize: fileSize || 0,
      mimeType: mimeType || 'application/octet-stream',
      s3Key,
      uploadedBy: userId,
      createdAt: new Date().toISOString(),
    };

    const command = new PutCommand({
      TableName: FILES_TABLE_NAME,
      Item: fileMetadata,
    });

    await docClient.send(command);
    
    return response(201, fileMetadata);
  } catch (error) {
    console.error('CreateFileMetadata error:', error);
    return response(500, { error: error.message });
  }
}

async function handleGetDownloadUrl(id) {
  try {
    const getCommand = new GetCommand({
      TableName: FILES_TABLE_NAME,
      Key: { id },
    });

    const result = await docClient.send(getCommand);
    
    if (!result.Item) {
      return response(404, { error: 'File not found' });
    }

    const s3Command = new GetObjectCommand({
      Bucket: FILES_BUCKET_NAME,
      Key: result.Item.s3Key,
    });

    const downloadUrl = await getSignedUrl(s3Client, s3Command, { expiresIn: 3600 });

    return response(200, {
      downloadUrl,
      fileName: result.Item.fileName,
      fileSize: result.Item.fileSize,
      mimeType: result.Item.mimeType,
    });
  } catch (error) {
    console.error('GetDownloadUrl error:', error);
    return response(500, { error: error.message });
  }
}

async function handleDeleteFile(id) {
  try {
    const getCommand = new GetCommand({
      TableName: FILES_TABLE_NAME,
      Key: { id },
    });

    const result = await docClient.send(getCommand);
    
    if (!result.Item) {
      return response(404, { error: 'File not found' });
    }

    // Delete from S3
    const s3Command = new DeleteObjectCommand({
      Bucket: FILES_BUCKET_NAME,
      Key: result.Item.s3Key,
    });
    await s3Client.send(s3Command);

    // Delete metadata from DynamoDB
    const deleteCommand = new DeleteCommand({
      TableName: FILES_TABLE_NAME,
      Key: { id },
    });
    await docClient.send(deleteCommand);
    
    return response(200, { message: 'File deleted successfully' });
  } catch (error) {
    console.error('DeleteFile error:', error);
    return response(500, { error: error.message });
  }
}
