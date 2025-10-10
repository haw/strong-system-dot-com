const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');
const jwt = require('jsonwebtoken');
const ldap = require('ldapjs');
const s3Service = require('./s3Service');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
require('dotenv').config();

// JWT Secret Key
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const encodeContentDisposition = (filename) => {
    if (!filename) {
        return 'attachment';
    }

    const normalized = filename
        .normalize('NFC')
        .replace(/\r|\n/g, ' ')
        .trim();

    const isAsciiOnly = /^[\x20-\x7E]+$/.test(normalized);

    if (isAsciiOnly) {
        const sanitized = normalized.replace(/"/g, "'");
        return `attachment; filename=\"${sanitized}\"`;
    }

    const encoded = encodeURIComponent(normalized)
        .replace(/['()]/g, escape)
        .replace(/\*/g, '%2A');

    return `attachment; filename*=UTF-8''${encoded}`;
};


const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
    next();
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Database connection
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

// LDAP Authentication
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    // LDAP認証を試行
    try {
        const ldapAuth = await authenticateWithLDAP(username, password);
        if (ldapAuth.success) {
            const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
            console.log(`LDAP authentication successful for user: ${username}`);
            return res.json({ token, message: 'LDAP Authentication successful' });
        } else {
            console.log(`LDAP authentication failed for user: ${username}: ${ldapAuth.error}`);
            return res.status(401).json({ error: 'Invalid username or password' });
        }
    } catch (error) {
        console.error('LDAP authentication error:', error.message);
        return res.status(500).json({ error: 'Authentication service unavailable' });
    }
});

// LDAP認証関数
async function authenticateWithLDAP(username, password) {
    return new Promise((resolve) => {
        const client = ldap.createClient({
            url: `ldap://${process.env.LDAP_SERVER || 'ldap-server'}:${process.env.LDAP_PORT || '1389'}`,
            timeout: 5000,
            connectTimeout: 5000,
            reconnect: false
        });

        // タイムアウト処理
        const timeoutId = setTimeout(() => {
            try {
                client.unbind();
            } catch (e) {}
            resolve({ success: false, error: 'Connection timeout' });
        }, 8000);

        // エラーハンドリング
        client.on('error', (err) => {
            clearTimeout(timeoutId);
            console.log('LDAP client error:', err.message);
            try {
                client.unbind();
            } catch (e) {}
            resolve({ success: false, error: err.message });
        });

        // ユーザー認証を直接試行
        const userDn = `cn=${username},ou=users,dc=strongsystem,dc=local`;
        
        client.bind(userDn, password, (err) => {
            clearTimeout(timeoutId);
            
            try {
                client.unbind();
            } catch (e) {}
            
            if (err) {
                console.log(`LDAP user authentication failed for ${username}:`, err.message);
                resolve({ success: false, error: err.message });
            } else {
                console.log(`LDAP user authentication successful for ${username}`);
                resolve({ success: true });
            }
        });
    });
}

// Test database connection and application health
app.get('/api/health', async (req, res) => {
    const healthCheck = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
            database: 'unknown',
            ldap: 'unknown'
        }
    };

    try {
        // Test database connection
        const connection = await pool.getConnection();
        await connection.query('SELECT 1');
        connection.release();
        healthCheck.services.database = 'healthy';
    } catch (error) {
        console.error('Database connection failed:', error);
        healthCheck.services.database = 'unhealthy';
        healthCheck.status = 'degraded';
    }

    try {
        // Test LDAP connection
        const ldapTest = await authenticateWithLDAP('admin', 'admin');
        healthCheck.services.ldap = ldapTest.success ? 'healthy' : 'unhealthy';
        if (!ldapTest.success) {
            healthCheck.status = 'degraded';
        }
    } catch (error) {
        healthCheck.services.ldap = 'unhealthy';
        healthCheck.status = 'degraded';
    }

    const statusCode = healthCheck.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(healthCheck);
});

// Test LDAP connection
app.get('/api/ldap-health', async (req, res) => {
    try {
        const ldapTest = await authenticateWithLDAP('admin', 'admin');
        
        if (ldapTest.success) {
            res.json({ 
                status: 'ok', 
                message: 'LDAP connection successful',
                note: 'Available test users: admin/admin, user1/password, testuser/password123, demo/demo'
            });
        } else {
            res.json({ 
                status: 'error', 
                message: 'LDAP server not available',
                error: ldapTest.error
            });
        }
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'LDAP health check failed',
            error: error.message
        });
    }
});

// Get all employees with optional department filtering
app.get('/api/employees', authenticateToken, async (req, res) => {
    try {
        const { department } = req.query;
        let query = 'SELECT * FROM employees';
        let params = [];

        if (department) {
            query += ' WHERE department = ?';
            params.push(department);
        }

        query += ' ORDER BY created_at DESC';
        
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all unique departments
app.get('/api/departments', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT DISTINCT department FROM employees WHERE department IS NOT NULL ORDER BY department');
        const departments = rows.map(row => row.department);
        res.json(departments);
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Search employees by name or employee ID
app.get('/api/employees/search', authenticateToken, async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.trim().length === 0) {
            return res.status(400).json({ error: 'Search query parameter "q" is required' });
        }

        const searchTerm = `%${q.trim()}%`;
        const [rows] = await pool.query(
            `SELECT * FROM employees 
             WHERE first_name LIKE ? 
                OR last_name LIKE ? 
                OR employee_id LIKE ? 
                OR CONCAT(first_name, ' ', last_name) LIKE ?
             ORDER BY created_at DESC`,
            [searchTerm, searchTerm, searchTerm, searchTerm]
        );
        
        res.json(rows);
    } catch (error) {
        console.error('Error searching employees:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get employee by ID
app.get('/api/employees/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching employee:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create new employee
app.post('/api/employees', authenticateToken, async (req, res) => {
    const { employee_id, first_name, last_name, email, department, position, phone, hire_date } = req.body;

    // Input validation
    if (!employee_id || !first_name || !last_name || !email || !department) {
        return res.status(400).json({ 
            error: 'Required fields missing: employee_id, first_name, last_name, email, department' 
        });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    // Employee ID format validation (should be alphanumeric)
    const employeeIdRegex = /^[A-Za-z0-9]+$/;
    if (!employeeIdRegex.test(employee_id)) {
        return res.status(400).json({ error: 'Employee ID should contain only letters and numbers' });
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO employees (employee_id, first_name, last_name, email, department, position, phone, hire_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [employee_id, first_name, last_name, email, department, position, phone, hire_date]
        );
        
        // Return the created employee with the generated ID
        const newEmployee = {
            id: result.insertId,
            employee_id,
            first_name,
            last_name,
            email,
            department,
            position,
            phone,
            hire_date
        };
        
        res.status(201).json(newEmployee);
    } catch (error) {
        console.error('Error creating employee:', error);
        
        // Handle duplicate employee_id error
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Employee ID already exists' });
        }
        
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update employee
app.put('/api/employees/:id', authenticateToken, async (req, res) => {
    const { employee_id, first_name, last_name, email, department, position, phone, hire_date } = req.body;

    // Input validation
    if (!employee_id || !first_name || !last_name || !email || !department) {
        return res.status(400).json({ 
            error: 'Required fields missing: employee_id, first_name, last_name, email, department' 
        });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    // Employee ID format validation
    const employeeIdRegex = /^[A-Za-z0-9]+$/;
    if (!employeeIdRegex.test(employee_id)) {
        return res.status(400).json({ error: 'Employee ID should contain only letters and numbers' });
    }

    try {
        // Check if employee exists
        const [existingEmployee] = await pool.query('SELECT id FROM employees WHERE id = ?', [req.params.id]);
        if (existingEmployee.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        const [result] = await pool.query(
            'UPDATE employees SET employee_id = ?, first_name = ?, last_name = ?, email = ?, department = ?, position = ?, phone = ?, hire_date = ? WHERE id = ?',
            [employee_id, first_name, last_name, email, department, position, phone, hire_date, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        // Return the updated employee data
        const updatedEmployee = {
            id: parseInt(req.params.id),
            employee_id,
            first_name,
            last_name,
            email,
            department,
            position,
            phone,
            hire_date
        };

        res.json(updatedEmployee);
    } catch (error) {
        console.error('Error updating employee:', error);
        
        // Handle duplicate employee_id error
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Employee ID already exists' });
        }
        
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete employee
app.delete('/api/employees/:id', authenticateToken, async (req, res) => {
    try {
        // Check if employee exists before deletion
        const [existingEmployee] = await pool.query('SELECT id FROM employees WHERE id = ?', [req.params.id]);
        if (existingEmployee.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        const [result] = await pool.query('DELETE FROM employees WHERE id = ?', [req.params.id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        res.json({ message: 'Employee deleted successfully' });
    } catch (error) {
        console.error('Error deleting employee:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// File Sharing System API Endpoints

// Get root folders
app.get('/api/folders/root', authenticateToken, async (req, res) => {
    try {
        const rootFolderId = '00000000-0000-0000-0000-000000000000'; // Root folder ID
        const folders = await s3Service.listFolders(rootFolderId);
        res.json(folders);
    } catch (error) {
        console.error('Error getting root folders:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get folders in a specific folder
app.get('/api/folders/:folderId/folders', authenticateToken, async (req, res) => {
    try {
        const { folderId } = req.params;
        const folders = await s3Service.listFolders(folderId);
        res.json(folders);
    } catch (error) {
        console.error('Error getting folders:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get files in a specific folder
app.get('/api/folders/:folderId/files', authenticateToken, async (req, res) => {
    try {
        const { folderId } = req.params;
        const files = await s3Service.listFiles(folderId);
        res.json(files);
    } catch (error) {
        console.error('Error getting files:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create a new folder
app.post('/api/folders', authenticateToken, async (req, res) => {
    try {
        const { name, parentFolderId } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Folder name is required' });
        }
        
        const ownerId = req.user.id || 1; // Default to user ID 1 if not available
        const folder = await s3Service.createFolder(name, parentFolderId, ownerId);
        res.status(201).json(folder);
    } catch (error) {
        console.error('Error creating folder:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a folder
app.delete('/api/folders/:folderId', authenticateToken, async (req, res) => {
    try {
        const { folderId } = req.params;
        
        // Prevent deletion of root folder
        if (folderId === '00000000-0000-0000-0000-000000000000') {
            return res.status(403).json({ error: 'Cannot delete root folder' });
        }
        
        await s3Service.deleteFolder(folderId);
        res.json({ message: 'Folder deleted successfully' });
    } catch (error) {
        console.error('Error deleting folder:', error);
        
        if (error.message === 'Folder not found') {
            return res.status(404).json({ error: 'Folder not found' });
        }
        
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Upload a file
app.post('/api/files/upload', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const { folderId } = req.body;
        
        if (!folderId) {
            return res.status(400).json({ error: 'Folder ID is required' });
        }
        
        const fileBuffer = req.file.buffer;
        const rawFileName = req.file.originalname;
        const fileName = Buffer.from(rawFileName, 'latin1').toString('utf8');
        const mimeType = req.file.mimetype;
        const file = await s3Service.uploadFile(fileBuffer, fileName, mimeType, null, folderId);
        res.status(201).json(file);
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Download a file
app.get('/api/files/:fileId/download', authenticateToken, async (req, res) => {
    try {
        const { fileId } = req.params;
        const { stream, metadata } = await s3Service.getFileStream(fileId);

        res.setHeader('Content-Type', metadata.mime_type);
        res.setHeader('Content-Disposition', encodeContentDisposition(metadata.name));
        res.setHeader('Content-Length', metadata.size);

        stream.on('error', (err) => {
            console.error('Stream error while downloading file:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal server error' });
            } else {
                res.destroy(err);
            }
        });

        stream.pipe(res);
    } catch (error) {
        console.error('Error downloading file:', error);

        if (error.message === 'File not found' || error.code === 'FILE_NOT_FOUND') {
            return res.status(404).json({ error: 'File not found' });
        }

        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a file
app.delete('/api/files/:fileId', authenticateToken, async (req, res) => {
    try {
        const { fileId } = req.params;
        await s3Service.deleteFile(fileId);
        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('Error deleting file:', error);
        
        if (error.message === 'File not found') {
            return res.status(404).json({ error: 'File not found' });
        }
        
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Search for files
app.get('/api/files/search', authenticateToken, async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.trim().length === 0) {
            return res.status(400).json({ error: 'Search query parameter "q" is required' });
        }
        
        const files = await s3Service.searchFiles(q.trim());
        res.json(files);
    } catch (error) {
        console.error('Error searching files:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Move a file to a different folder
app.put('/api/files/:fileId/move', authenticateToken, async (req, res) => {
    try {
        const { fileId } = req.params;
        const { targetFolderId } = req.body;
        
        if (!targetFolderId) {
            return res.status(400).json({ error: 'Target folder ID is required' });
        }
        
        const file = await s3Service.moveFile(fileId, targetFolderId);
        res.json(file);
    } catch (error) {
        console.error('Error moving file:', error);
        
        if (error.message === 'File not found') {
            return res.status(404).json({ error: 'File not found' });
        }
        
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Move a folder to a different parent folder
app.put('/api/folders/:folderId/move', authenticateToken, async (req, res) => {
    try {
        const { folderId } = req.params;
        const { targetParentFolderId } = req.body;
        
        // Prevent moving root folder
        if (folderId === '00000000-0000-0000-0000-000000000000') {
            return res.status(403).json({ error: 'Cannot move root folder' });
        }
        
        if (!targetParentFolderId) {
            return res.status(400).json({ error: 'Target parent folder ID is required' });
        }
        
        const folder = await s3Service.moveFolder(folderId, targetParentFolderId);
        res.json(folder);
    } catch (error) {
        console.error('Error moving folder:', error);
        
        if (error.message === 'Folder not found') {
            return res.status(404).json({ error: 'Folder not found' });
        }
        
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Ensure S3 bucket exists
async function ensureS3BucketExists() {
    try {
        await s3Service.ensureBucketExists({ maxAttempts: 5, delayMs: 1000 });
    } catch (error) {
        console.error('Error ensuring S3 bucket exists:', error);
    }
}


// Start server
const server = app.listen(port, async () => {
    console.log(`Employee Management System server running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Database host: ${process.env.DB_HOST || 'db-server'}`);
    console.log(`LDAP server: ${process.env.LDAP_SERVER || 'ldap-server'}`);
    
    // Ensure S3 bucket exists
    await ensureS3BucketExists();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('HTTP server closed');
        pool.end(() => {
            console.log('Database pool closed');
            process.exit(0);
        });
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('HTTP server closed');
        pool.end(() => {
            console.log('Database pool closed');
            process.exit(0);
        });
    });
});
