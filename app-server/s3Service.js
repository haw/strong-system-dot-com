/**
 * S3 Service for File Operations
 * 
 * This service provides methods to interact with AWS S3 for file operations
 * including upload, download, list, delete, and folder management.
 * 
 * CloudFront integration is included for optimized content delivery.
 */

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const mysql = require('mysql2/promise');
const path = require('path');
const crypto = require('crypto');

// Disable AWS metadata service
process.env.AWS_EC2_METADATA_DISABLED = 'true';

// Database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'db-server',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'employee_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  collation: 'utf8mb4_unicode_ci'
});

// Configure AWS SDK for MinIO or AWS S3
AWS.config.update({
  region: process.env.AWS_REGION || 'ap-northeast-1'
});

// Determine if we're using MinIO or AWS S3
const isUsingMinIO = !process.env.USE_AWS_S3 || process.env.USE_AWS_S3 !== 'true';

// Create S3 service object
const s3 = new AWS.S3({
  endpoint: isUsingMinIO ? `http://${process.env.MINIO_HOST || 'minio'}:${process.env.MINIO_PORT || 9000}` : undefined,
  s3ForcePathStyle: isUsingMinIO, // Required for MinIO
  signatureVersion: 'v4',
  region: process.env.AWS_REGION || 'ap-northeast-1'
});

// CloudFront configuration
const cloudFront = new AWS.CloudFront({
  region: process.env.AWS_REGION || 'us-east-1'
});

// CloudFront signer for signed URLs
const cloudFrontSigner = isUsingMinIO ? null : new AWS.CloudFront.Signer(
  process.env.CLOUDFRONT_KEY_PAIR_ID || 'default-key-pair-id',
  process.env.CLOUDFRONT_PRIVATE_KEY || 'default-private-key'
);



const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeFileDisplayName = (name) => {
  if (!name || typeof name !== 'string') {
    throw new Error('File name is required');
  }
  const normalized = name.normalize('NFC').trim();
  if (!normalized) {
    throw new Error('File name is required');
  }
  return normalized;
};

const normalizeFolderDisplayName = (name) => {
  if (!name || typeof name !== 'string') {
    throw new Error('Folder name is required');
  }
  const normalized = name.normalize('NFC').trim();
  if (!normalized) {
    throw new Error('Folder name is required');
  }
  return normalized;
};

const sanitizeFileName = (name) => {
  const baseName = normalizeFileDisplayName(name);
  const sanitized = baseName.replace(/[\/]/g, '_');
  if (!sanitized) {
    throw new Error('Invalid file name');
  }
  return sanitized;
};

const sanitizeFolderName = (name) => {
  const baseName = normalizeFolderDisplayName(name);
  const sanitized = baseName.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!sanitized) {
    throw new Error('Invalid folder name');
  }
  return sanitized;
};

const normalizeFolderPath = (folderPath) => {
  if (!folderPath || folderPath === '/') {
    return '/';
  }
  const trimmed = folderPath.trim();
  const withoutSlashes = trimmed.replace(/^\/+/, '').replace(/\/+$/, '');
  return withoutSlashes ? `/${withoutSlashes}` : '/';
};

const buildStoredFilePath = (folderPath, fileName) => {
  const parentPath = normalizeFolderPath(folderPath);
  const sanitizedFile = sanitizeFileName(fileName);
  if (parentPath === '/') {
    return `/${sanitizedFile}`;
  }
  return `${parentPath}/${sanitizedFile}`;
};

const buildFolderPath = (parentFolderPath, folderName) => {
  const parentPath = normalizeFolderPath(parentFolderPath);
  const sanitizedName = sanitizeFolderName(folderName);
  if (parentPath === '/') {
    return `/${sanitizedName}`;
  }
  return `${parentPath}/${sanitizedName}`;
};

const toS3Key = (storedPath) => {
  if (!storedPath) {
    return '';
  }
  return storedPath.replace(/^\/+/, '');
};

const ensureBucketExists = async (options = {}) => {

  const bucketName = getBucketName();
  const region = process.env.AWS_REGION || 'us-east-1';
  const maxAttempts = options.maxAttempts || 5;
  const delayMs = options.delayMs || 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await s3.headBucket({ Bucket: bucketName }).promise();
      if (attempt > 1) {
        console.log(`Bucket '${bucketName}' became available on attempt ${attempt}`);
      }
      return true;
    } catch (error) {
      if (error.code === 'NotFound' || error.code === 'NoSuchBucket') {
        const createParams = { Bucket: bucketName };
        if (!isUsingMinIO && region && region !== 'us-east-1') {
          createParams.CreateBucketConfiguration = { LocationConstraint: region };
        }

        try {
          await s3.createBucket(createParams).promise();
          const note = createParams.CreateBucketConfiguration ? ` with location constraint '${region}'` : '';
          console.log(`Created S3 bucket '${bucketName}'${note}`);
          return true;
        } catch (createError) {
          const fallbackErrors = ['InvalidLocationConstraint', 'IllegalLocationConstraintException', 'InvalidRequest', 'NotImplemented'];
          if (createParams.CreateBucketConfiguration && fallbackErrors.includes(createError.code)) {
            console.warn(`Create bucket with location constraint failed (${createError.code}); retrying without location constraint for '${bucketName}'`);
            await s3.createBucket({ Bucket: bucketName }).promise();
            console.log(`Created S3 bucket '${bucketName}' without location constraint`);
            return true;
          }

          if (createError.code === 'BucketAlreadyOwnedByYou' || createError.code === 'BucketAlreadyExists') {
            console.log(`S3 bucket '${bucketName}' already exists`);
            return true;
          }

          throw createError;
        }
      }

      const transientCodes = ['NetworkingError', 'RequestTimeout', 'TimeoutError'];
      const transientErrnos = ['ECONNREFUSED', 'ECONNRESET', 'EPIPE'];
      const isTransient = transientCodes.includes(error.code) || (error.errno && transientErrnos.includes(error.errno));

      if (isTransient && attempt < maxAttempts) {
        const waitMs = delayMs * attempt;
        console.warn(`Bucket check failed (${error.code || error.message}); retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxAttempts})`);
        await sleep(waitMs);
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Unable to verify bucket '${bucketName}' after ${maxAttempts} attempts`);
};


/**
 * Get S3 bucket name from environment variable or use default
 * In production, this would be set to the actual bucket name
 * For local development, we can use a placeholder
 */
const getBucketName = () => {
  return process.env.S3_BUCKET_NAME || 'strongsystem-files-default';
};

/**
 * Get CloudFront distribution domain name from environment variable or use default
 * In production, this would be set to the actual CloudFront domain
 * For local development, we can use a placeholder or direct S3/MinIO access
 */
const getCloudFrontDomain = () => {
  return process.env.CLOUDFRONT_DOMAIN || null;
};

/**
 * Generate a CloudFront signed URL for a file
 * 
 * @param {string} storedPath - Stored path of the file
 * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns {string} - Signed URL or direct S3/MinIO URL
 */
const getFileUrl = (storedPath, expiresIn = 3600) => {
  const objectKey = toS3Key(storedPath);
  if (!objectKey) {
    throw new Error('Invalid file path');
  }

  // If using MinIO or CloudFront is not configured, return direct S3/MinIO URL
  if (isUsingMinIO || !getCloudFrontDomain() || !cloudFrontSigner) {
    const params = {
      Bucket: getBucketName(),
      Key: objectKey,
      Expires: expiresIn
    };
    return s3.getSignedUrl('getObject', params);
  }
  
  // Generate CloudFront signed URL
  const cloudFrontUrl = `https://${getCloudFrontDomain()}/${objectKey}`;
  
  const signedUrl = cloudFrontSigner.getSignedUrl({
    url: cloudFrontUrl,
    expires: Math.floor(Date.now() / 1000) + expiresIn
  });
  
  return signedUrl;
};

/**
 * Upload a file to S3
 * 
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} fileName - Original file name
 * @param {string} mimeType - MIME type of the file
 * @param {number} ownerId - ID of the employee who owns the file
 * @param {string} folderId - ID of the folder where the file should be stored
 * @returns {Promise<Object>} - Object containing file metadata
 */
const uploadFile = async (fileBuffer, fileName, mimeType, ownerId, folderId) => {
  try {
    const displayName = normalizeFileDisplayName(fileName);
    const folderPath = await getFolderPath(folderId);
    const storedPath = buildStoredFilePath(folderPath, displayName);
    const objectKey = toS3Key(storedPath);

    await ensureBucketExists();

    const uploadParams = {
      Bucket: getBucketName(),
      Key: objectKey,
      Body: fileBuffer,
      ContentType: mimeType
    };

    const s3Response = await s3.upload(uploadParams).promise();

    const fileSize = fileBuffer.length;
    const connection = await pool.getConnection();
    let fileId;

    try {
      const [existingRows] = await connection.query(
        'SELECT id FROM files WHERE folder_id = ? AND name = ?',
        [folderId, displayName]
      );

      if (existingRows.length > 0) {
        fileId = existingRows[0].id;
        await connection.query(
          'UPDATE files SET name = ?, path = ?, size = ?, mime_type = ?, owner_id = ?, folder_id = ? WHERE id = ?',
          [displayName, storedPath, fileSize, mimeType, ownerId, folderId, fileId]
        );
      } else {
        fileId = uuidv4();
        await connection.query(
          'INSERT INTO files (id, name, path, size, mime_type, owner_id, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [fileId, displayName, storedPath, fileSize, mimeType, ownerId, folderId]
        );
      }
    } finally {
      connection.release();
    }

    return {
      id: fileId,
      name: displayName,
      path: storedPath,
      size: fileSize,
      mime_type: mimeType,
      owner_id: ownerId,
      folder_id: folderId,
      s3Location: s3Response.Location
    };
  } catch (error) {
    console.error('Error uploading file to S3:', error);
    throw error;
  }
};

/**
 * Download a file from S3
 * 
 * @param {string} fileId - ID of the file to download
 * @param {boolean} useSignedUrl - Whether to return a signed URL instead of file data
 * @returns {Promise<Object>} - Object containing file data/URL and metadata
 */
const downloadFile = async (fileId, useSignedUrl = false) => {
  try {
    // Get file metadata from database
    const connection = await pool.getConnection();
    let fileData;
    
    try {
      const [rows] = await connection.query('SELECT * FROM files WHERE id = ?', [fileId]);
      if (rows.length === 0) {
        throw new Error('File not found');
      }
      fileData = rows[0];
    } finally {
      connection.release();
    }
    
    // If using signed URL (recommended for CloudFront integration)
    if (useSignedUrl) {
      const signedUrl = getFileUrl(fileData.path);
      
      return {
        url: signedUrl,
        metadata: {
          id: fileData.id,
          name: fileData.name,
          size: fileData.size,
          mime_type: fileData.mime_type,
          owner_id: fileData.owner_id,
          folder_id: fileData.folder_id,
          created_at: fileData.created_at,
          updated_at: fileData.updated_at
        }
      };
    }
    
    // Otherwise, download file from S3 directly
    const downloadParams = {
      Bucket: getBucketName(),
      Key: toS3Key(fileData.path)
    };
    
    const s3Response = await s3.getObject(downloadParams).promise();
    
    return {
      file: s3Response.Body,
      metadata: {
        id: fileData.id,
        name: fileData.name,
        size: fileData.size,
        mime_type: fileData.mime_type,
        owner_id: fileData.owner_id,
        folder_id: fileData.folder_id,
        created_at: fileData.created_at,
        updated_at: fileData.updated_at
      }
    };
  } catch (error) {
    console.error('Error downloading file from S3:', error);
    
    // Handle S3 NoSuchKey error (file exists in DB but not in S3/MinIO)
    if (error.code === 'NoSuchKey') {
      const notFoundError = new Error('File not found in storage');
      notFoundError.code = 'FILE_NOT_FOUND';
      throw notFoundError;
    }
    
    throw error;
  }
};

const getFileStream = async (fileId) => {
  try {
    const connection = await pool.getConnection();
    let fileData;

    try {
      const [rows] = await connection.query('SELECT * FROM files WHERE id = ?', [fileId]);
      if (rows.length === 0) {
        throw new Error('File not found');
      }
      fileData = rows[0];
    } finally {
      connection.release();
    }

    const downloadParams = {
      Bucket: getBucketName(),
      Key: toS3Key(fileData.path)
    };

    const stream = s3.getObject(downloadParams).createReadStream();

    return {
      stream,
      metadata: {
        id: fileData.id,
        name: fileData.name,
        size: fileData.size,
        mime_type: fileData.mime_type,
        owner_id: fileData.owner_id,
        folder_id: fileData.folder_id,
        created_at: fileData.created_at,
        updated_at: fileData.updated_at
      }
    };
  } catch (error) {
    console.error('Error creating S3 file stream:', error);
    
    // Handle S3 NoSuchKey error (file exists in DB but not in S3/MinIO)
    if (error.code === 'NoSuchKey') {
      const notFoundError = new Error('File not found in storage');
      notFoundError.code = 'FILE_NOT_FOUND';
      throw notFoundError;
    }
    
    throw error;
  }
};

/**
 * List files in a folder
 * 
 * @param {string} folderId - ID of the folder to list files from
 * @returns {Promise<Array>} - Array of file metadata objects
 */
const listFiles = async (folderId) => {
  try {
    const connection = await pool.getConnection();
    let files;
    
    try {
      const [rows] = await connection.query('SELECT * FROM files WHERE folder_id = ?', [folderId]);
      files = rows;
    } finally {
      connection.release();
    }
    
    return files;
  } catch (error) {
    console.error('Error listing files:', error);
    throw error;
  }
};

/**
 * Delete a file from S3 and database
 * 
 * @param {string} fileId - ID of the file to delete
 * @returns {Promise<boolean>} - True if deletion was successful
 */
const deleteFile = async (fileId) => {
  try {
    // Get file metadata from database
    const connection = await pool.getConnection();
    let filePath;
    
    try {
      const [rows] = await connection.query('SELECT path FROM files WHERE id = ?', [fileId]);
      if (rows.length === 0) {
        throw new Error('File not found');
      }
      filePath = rows[0].path;
      
      // Delete file metadata from database
      await connection.query('DELETE FROM files WHERE id = ?', [fileId]);
    } finally {
      connection.release();
    }
    
    // Delete file from S3
    const deleteParams = {
      Bucket: getBucketName(),
      Key: toS3Key(filePath)
    };
    
    await s3.deleteObject(deleteParams).promise();
    
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
};

/**
 * Create a new folder
 * 
 * @param {string} folderName - Name of the folder to create
 * @param {string} parentFolderId - ID of the parent folder
 * @param {number} ownerId - ID of the employee who owns the folder
 * @returns {Promise<Object>} - Object containing folder metadata
 */
const createFolder = async (folderName, parentFolderId, ownerId) => {
  try {
    // Generate a unique ID for the folder
    const folderId = uuidv4();

    const displayName = normalizeFolderDisplayName(folderName);
    const parentFolderPath = await getFolderPath(parentFolderId);

    // Create folder path
    const folderPath = buildFolderPath(parentFolderPath, displayName);

    // Store folder metadata in database
    const connection = await pool.getConnection();
    try {
      await connection.query(
        'INSERT INTO folders (id, name, path, parent_id, owner_id) VALUES (?, ?, ?, ?, ?)',
        [folderId, displayName, folderPath, parentFolderId, ownerId]
      );
    } finally {
      connection.release();
    }

    return {
      id: folderId,
      name: displayName,
      path: folderPath,
      parent_id: parentFolderId,
      owner_id: ownerId
    };
  } catch (error) {
    console.error('Error creating folder:', error);
    throw error;
  }
};

/**
 * List folders in a parent folder
 * 
 * @param {string} parentFolderId - ID of the parent folder
 * @returns {Promise<Array>} - Array of folder metadata objects
 */
const listFolders = async (parentFolderId) => {
  try {
    const connection = await pool.getConnection();
    let folders;
    
    try {
      const [rows] = await connection.query('SELECT * FROM folders WHERE parent_id = ?', [parentFolderId]);
      folders = rows;
    } finally {
      connection.release();
    }
    
    return folders;
  } catch (error) {
    console.error('Error listing folders:', error);
    throw error;
  }
};

/**
 * Delete a folder and all its contents
 * 
 * @param {string} folderId - ID of the folder to delete
 * @returns {Promise<boolean>} - True if deletion was successful
 */
const deleteFolder = async (folderId) => {
  try {
    // Check if folder exists
    const connection = await pool.getConnection();
    let folderExists;
    
    try {
      const [rows] = await connection.query('SELECT id FROM folders WHERE id = ?', [folderId]);
      folderExists = rows.length > 0;
      
      if (!folderExists) {
        throw new Error('Folder not found');
      }
      
      // Get all files in the folder
      const [files] = await connection.query('SELECT id FROM files WHERE folder_id = ?', [folderId]);
      
      // Delete all files in the folder
      for (const file of files) {
        await deleteFile(file.id);
      }
      
      // Get all subfolders
      const [subfolders] = await connection.query('SELECT id FROM folders WHERE parent_id = ?', [folderId]);
      
      // Delete all subfolders recursively
      for (const subfolder of subfolders) {
        await deleteFolder(subfolder.id);
      }
      
      // Delete the folder itself
      await connection.query('DELETE FROM folders WHERE id = ?', [folderId]);
    } finally {
      connection.release();
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting folder:', error);
    throw error;
  }
};

/**
 * Get the full path of a folder
 * 
 * @param {string} folderId - ID of the folder
 * @returns {Promise<string>} - Full path of the folder
 */
const getFolderPath = async (folderId) => {
  try {
    if (!folderId) {
      return '/';
    }
    
    const connection = await pool.getConnection();
    let folderPath;
    
    try {
      const [rows] = await connection.query('SELECT path FROM folders WHERE id = ?', [folderId]);
      if (rows.length === 0) {
        throw new Error('Folder not found');
      }
      folderPath = rows[0].path;
    } finally {
      connection.release();
    }
    
    return folderPath;
  } catch (error) {
    console.error('Error getting folder path:', error);
    throw error;
  }
};

/**
 * Search for files by name
 * 
 * @param {string} searchTerm - Term to search for in file names
 * @returns {Promise<Array>} - Array of file metadata objects
 */
const searchFiles = async (searchTerm) => {
  try {
    const connection = await pool.getConnection();
    let files;
    
    try {
      const [rows] = await connection.query(
        'SELECT * FROM files WHERE name LIKE ?',
        [`%${searchTerm}%`]
      );
      files = rows;
    } finally {
      connection.release();
    }
    
    return files;
  } catch (error) {
    console.error('Error searching files:', error);
    throw error;
  }
};

/**
 * Move a file to a different folder
 * 
 * @param {string} fileId - ID of the file to move
 * @param {string} targetFolderId - ID of the target folder
 * @returns {Promise<Object>} - Updated file metadata
 */
const moveFile = async (fileId, targetFolderId) => {
  try {
    // Get file metadata
    const connection = await pool.getConnection();
    let fileData;
    let targetFolderPath;
    
    try {
      const [fileRows] = await connection.query('SELECT * FROM files WHERE id = ?', [fileId]);
      if (fileRows.length === 0) {
        throw new Error('File not found');
      }
      fileData = fileRows[0];
      
      // Get target folder path
      targetFolderPath = await getFolderPath(targetFolderId);
      
      // Create new stored path and S3 key
      const fileName = path.basename(fileData.path);
      const newStoredPath = buildStoredFilePath(targetFolderPath, fileName);
      const currentObjectKey = toS3Key(fileData.path);
      const newObjectKey = toS3Key(newStoredPath);
      
      // Copy file in S3 to new location
      const copyParams = {
        Bucket: getBucketName(),
        CopySource: `${getBucketName()}/${currentObjectKey}`,
        Key: newObjectKey
      };
      
      await s3.copyObject(copyParams).promise();
      
      // Delete original file in S3
      const deleteParams = {
        Bucket: getBucketName(),
        Key: currentObjectKey
      };
      
      await s3.deleteObject(deleteParams).promise();
      
      // Update file metadata in database
      await connection.query(
        'UPDATE files SET path = ?, folder_id = ? WHERE id = ?',
        [newStoredPath, targetFolderId, fileId]
      );
      
      // Get updated file metadata
      const [updatedRows] = await connection.query('SELECT * FROM files WHERE id = ?', [fileId]);
      fileData = updatedRows[0];
    } finally {
      connection.release();
    }
    
    return fileData;
  } catch (error) {
    console.error('Error moving file:', error);
    throw error;
  }
};

/**
 * Move a folder to a different parent folder
 * 
 * @param {string} folderId - ID of the folder to move
 * @param {string} targetParentFolderId - ID of the target parent folder
 * @returns {Promise<Object>} - Updated folder metadata
 */
const moveFolder = async (folderId, targetParentFolderId) => {
  try {
    // Check if folder exists
    const connection = await pool.getConnection();
    let folderData;
    let targetParentFolderPath;
    
    try {
      const [folderRows] = await connection.query('SELECT * FROM folders WHERE id = ?', [folderId]);
      if (folderRows.length === 0) {
        throw new Error('Folder not found');
      }
      folderData = folderRows[0];
      
      // Get target parent folder path
      targetParentFolderPath = await getFolderPath(targetParentFolderId);
      
      // Create new folder path
      const newFolderPath = buildFolderPath(targetParentFolderPath, folderData.name);
      
      // Update folder path in database
      await connection.query(
        'UPDATE folders SET path = ?, parent_id = ? WHERE id = ?',
        [newFolderPath, targetParentFolderId, folderId]
      );
      
      // Update paths of all subfolders and files recursively
      await updateSubpaths(folderId, folderData.path, newFolderPath, connection);
      
      // Get updated folder metadata
      const [updatedRows] = await connection.query('SELECT * FROM folders WHERE id = ?', [folderId]);
      folderData = updatedRows[0];
    } finally {
      connection.release();
    }
    
    return folderData;
  } catch (error) {
    console.error('Error moving folder:', error);
    throw error;
  }
};

/**
 * Update paths of all subfolders and files recursively
 * 
 * @param {string} folderId - ID of the parent folder
 * @param {string} oldBasePath - Old base path
 * @param {string} newBasePath - New base path
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
const updateSubpaths = async (folderId, oldBasePath, newBasePath, connection) => {
  try {
    // Get all subfolders
    const [subfolders] = await connection.query('SELECT * FROM folders WHERE parent_id = ?', [folderId]);
    
    // Update paths of all subfolders
    for (const subfolder of subfolders) {
      const newSubfolderPath = subfolder.path.replace(oldBasePath, newBasePath);
      await connection.query(
        'UPDATE folders SET path = ? WHERE id = ?',
        [newSubfolderPath, subfolder.id]
      );
      
      // Update paths of all files in the subfolder
      const [files] = await connection.query('SELECT * FROM files WHERE folder_id = ?', [subfolder.id]);
      for (const file of files) {
        const newFilePath = file.path.replace(oldBasePath, newBasePath);
        await connection.query(
          'UPDATE files SET path = ? WHERE id = ?',
          [newFilePath, file.id]
        );
      }
      
      // Recursively update paths of all subfolders
      await updateSubpaths(subfolder.id, oldBasePath, newBasePath, connection);
    }
  } catch (error) {
    console.error('Error updating subpaths:', error);
    throw error;
  }
};

/**
 * Create a CloudFront invalidation for a file or path
 * 
 * @param {string} path - Path to invalidate (e.g., '/images/*')
 * @returns {Promise<Object>} - Invalidation result
 */
const createInvalidation = async (path) => {
  // Skip if using MinIO or CloudFront is not configured
  if (isUsingMinIO || !getCloudFrontDomain()) {
    return { message: 'CloudFront not configured, skipping invalidation' };
  }
  
  try {
    const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
    if (!distributionId) {
      return { message: 'CloudFront distribution ID not configured, skipping invalidation' };
    }
    
    const params = {
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `invalidation-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: [path.startsWith('/') ? path : `/${path}`]
        }
      }
    };
    
    const result = await cloudFront.createInvalidation(params).promise();
    return result;
  } catch (error) {
    console.error('Error creating CloudFront invalidation:', error);
    throw error;
  }
};

module.exports = {
  uploadFile,
  downloadFile,
  getFileStream,
  listFiles,
  deleteFile,
  createFolder,
  listFolders,
  deleteFolder,
  searchFiles,
  moveFile,
  moveFolder,
  getFileUrl,
  createInvalidation,
  ensureBucketExists
};
