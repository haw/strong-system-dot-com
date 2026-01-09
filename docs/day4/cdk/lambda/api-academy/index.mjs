import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const EMPLOYEE_TABLE_NAME = process.env.EMPLOYEE_TABLE_NAME;
const FILES_TABLE_NAME = process.env.FILES_TABLE_NAME;
const FILES_BUCKET_NAME = process.env.FILES_BUCKET_NAME;

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

// Main handler (Lambda Function URL対応)
export const handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  // Function URL形式に対応
  const httpMethod = event.requestContext?.http?.method || event.httpMethod;
  const path = event.rawPath || event.path;
  const requestBody = event.body;
  
  // OPTIONS request (CORS preflight)
  if (httpMethod === 'OPTIONS') {
    return response(200, { message: 'OK' });
  }

  try {
    // Parse body
    const body = requestBody ? JSON.parse(requestBody) : {};

    // 認証なし - userIdは固定値
    const userId = 'academy-user';

    // パスからIDを抽出
    const employeeMatch = path.match(/^\/employees\/([^/]+)$/);
    const fileMatch = path.match(/^\/files\/([^/]+)$/);
    const downloadMatch = path.match(/^\/files\/([^/]+)\/download-url$/);

    if (path === '/employees' && httpMethod === 'GET') {
      return await handleListEmployees();
    }
    
    if (path === '/employees' && httpMethod === 'POST') {
      return await handleCreateEmployee(body, userId);
    }
    
    if (employeeMatch && httpMethod === 'GET') {
      return await handleGetEmployee(employeeMatch[1]);
    }
    
    if (employeeMatch && httpMethod === 'PUT') {
      return await handleUpdateEmployee(employeeMatch[1], body, userId);
    }
    
    if (employeeMatch && httpMethod === 'DELETE') {
      return await handleDeleteEmployee(employeeMatch[1]);
    }

    // File operations
    if (path === '/files' && httpMethod === 'GET') {
      return await handleListFiles();
    }
    
    if (path === '/files/upload-url' && httpMethod === 'POST') {
      return await handleGetUploadUrl(body, userId);
    }
    
    if (path === '/files' && httpMethod === 'POST') {
      return await handleCreateFileMetadata(body, userId);
    }
    
    if (downloadMatch && httpMethod === 'GET') {
      return await handleGetDownloadUrl(downloadMatch[1]);
    }
    
    if (fileMatch && httpMethod === 'DELETE') {
      return await handleDeleteFile(fileMatch[1]);
    }

    return response(404, { error: 'Not Found' });
  } catch (error) {
    console.error('Error:', error);
    return response(500, { error: error.message });
  }
};

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

    // RFC 2231: UTF-8 filename encoding for non-ASCII characters
    const fileName = result.Item.fileName;
    const encodedFileName = encodeURIComponent(fileName);
    const contentDisposition = `attachment; filename="${fileName.replace(/[^\x00-\x7F]/g, '_')}"; filename*=UTF-8''${encodedFileName}`;

    const s3Command = new GetObjectCommand({
      Bucket: FILES_BUCKET_NAME,
      Key: result.Item.s3Key,
      ResponseContentDisposition: contentDisposition,
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
