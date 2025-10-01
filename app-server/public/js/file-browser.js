/**
 * File Browser UI Implementation
 * 
 * This script implements the frontend functionality for the file sharing system.
 */

// Global variables
let currentFolderId = '00000000-0000-0000-0000-000000000000'; // Root folder ID
let folderHistory = [{ id: '00000000-0000-0000-0000-000000000000', name: 'ホーム' }];
let contextMenuTarget = null;

// Initialize file browser when document is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize file browser when user is logged in
    if (isLoggedIn()) {
        initializeFileBrowser();
    }
});

// Initialize file browser components
function initializeFileBrowser() {
    // Set up tab switching
    setupTabSwitching();
    
    // Load initial folder contents
    loadFolderContents(currentFolderId);
    
    // Set up event listeners
    setupEventListeners();
    
    // Set up drag and drop for file uploads
    setupDragAndDrop();
}

// Set up tab switching between employees and files
function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            
            // Update active tab button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Update active tab content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${tabId}-tab`) {
                    content.classList.add('active');
                }
            });
            
            // Refresh file list when switching to files tab
            if (tabId === 'files') {
                loadFolderContents(currentFolderId);
            }
        });
    });
}

// Set up event listeners for file browser actions
function setupEventListeners() {
    // Upload file button
    document.getElementById('upload-file-btn').addEventListener('click', () => {
        toggleUploadArea();
    });
    
    // Refresh files button
    document.getElementById('refresh-files-btn').addEventListener('click', () => {
        loadFolderContents(currentFolderId);
    });

    // File input change
    document.getElementById('file-input').addEventListener('change', (e) => {
        handleFileSelection(e.target.files);
    });
    
    // Close modal buttons
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.style.display = 'none';
            });
        });
    });
    
    // Close context menu when clicking elsewhere
    document.addEventListener('click', () => {
        hideContextMenu();
    });
}

// Set up drag and drop for file uploads
function setupDragAndDrop() {
    const uploadArea = document.getElementById('upload-area');
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Highlight drop area when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.add('dragover');
        }, false);
    });
    
    // Remove highlight when item is dragged out or dropped
    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.remove('dragover');
        }, false);
    });
    
    // Handle dropped files
    uploadArea.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        handleFileSelection(files);
    }, false);
}

// Prevent default drag and drop behavior
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Load folder contents
async function loadFolderContents(folderId) {
    showLoading();
    
    try {
        // Get authentication token
        const token = localStorage.getItem('auth_token');
        if (!token) {
            throw new Error('Authentication required');
        }
        
        // Fetch folders and files in parallel
        const [foldersResponse, filesResponse] = await Promise.all([
            fetch(`/api/folders/${folderId}/folders`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch(`/api/folders/${folderId}/files`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);
        
        if (!foldersResponse.ok || !filesResponse.ok) {
            throw new Error('Failed to load folder contents');
        }
        
        await foldersResponse.json();
        const files = await filesResponse.json();
        
        // Update current folder ID
        currentFolderId = folderId;
        
        // Display folder contents
        displayFolderContents(files);
        
        // Update breadcrumb
        updateBreadcrumb();
    } catch (error) {
        console.error('Error loading folder contents:', error);
        showErrorMessage('フォルダの内容を読み込めませんでした');
    } finally {
        hideLoading();
    }
}

// Display folder contents
function displayFolderContents(files) {
    const fileGrid = document.getElementById('file-grid');
    const emptyState = document.getElementById('empty-state');

    // Clear existing content
    fileGrid.innerHTML = '';

    // Show empty state if no files
    if (files.length === 0) {
        emptyState.style.display = 'block';
        return;
    }

    // Hide empty state
    emptyState.style.display = 'none';

    // Display files
    files.forEach(file => {
        const fileElement = createFileElement(file);
        fileGrid.appendChild(fileElement);
    });
}

// Create folder element
function createFolderElement(folder) {
    const folderDiv = document.createElement('div');
    folderDiv.className = 'folder-item';
    folderDiv.dataset.folderId = folder.id;
    folderDiv.dataset.type = 'folder';
    
    folderDiv.innerHTML = `
        <div class="folder-icon">📁</div>
        <div class="folder-name">${escapeHtml(folder.name)}</div>
    `;
    
    // Double click to navigate into folder
    folderDiv.addEventListener('dblclick', () => {
        folderHistory.push({ id: folder.id, name: folder.name });
        navigateToFolder(folder.id);
    });
    
    // Right click for context menu
    folderDiv.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, 'folder', folder.id);
    });
    
    return folderDiv;
}

// Create file element
function createFileElement(file) {
    const fileDiv = document.createElement('div');
    fileDiv.className = 'file-item';
    fileDiv.dataset.fileId = file.id;
    fileDiv.dataset.type = 'file';
    
    fileDiv.innerHTML = `
        <div class="file-icon">${getFileIcon(file.mime_type)}</div>
        <div class="file-name">${escapeHtml(file.name)}</div>
        <div class="file-size">${formatFileSize(file.size)}</div>
    `;
    
    // Double click to download file
    fileDiv.addEventListener('dblclick', () => {
        downloadFile(file.id, file.name);
    });
    
    // Right click for context menu
    fileDiv.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, 'file', file.id);
    });
    
    return fileDiv;
}

// Update breadcrumb navigation
function updateBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    breadcrumb.innerHTML = '';
    
    folderHistory.forEach((folder, index) => {
        const item = document.createElement('span');
        item.className = 'breadcrumb-item';
        item.textContent = folder.name;
        item.dataset.folderId = folder.id;
        
        item.addEventListener('click', () => {
            // Truncate history to this point
            folderHistory = folderHistory.slice(0, index + 1);
            navigateToFolder(folder.id);
        });
        
        breadcrumb.appendChild(item);
        
        // Add separator if not the last item
        if (index < folderHistory.length - 1) {
            const separator = document.createElement('span');
            separator.className = 'breadcrumb-separator';
            separator.textContent = '/';
            breadcrumb.appendChild(separator);
        }
    });
}

// Navigate to a folder
function navigateToFolder(folderId) {
    currentFolderId = folderId;
    loadFolderContents(folderId);
}

// Show context menu
function showContextMenu(event, type, id) {
    const contextMenu = document.getElementById('context-menu');
    const downloadItem = document.getElementById('download-item');
    
    // Store target information
    contextMenuTarget = { type, id };
    
    // Show/hide download option based on type
    downloadItem.style.display = type === 'file' ? 'block' : 'none';
    
    // Position menu at cursor
    contextMenu.style.top = `${event.clientY}px`;
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.display = 'block';
    
    // Prevent default context menu
    event.preventDefault();
}

// Hide context menu
function hideContextMenu() {
    const contextMenu = document.getElementById('context-menu');
    contextMenu.style.display = 'none';
    contextMenuTarget = null;
}

// Toggle upload area visibility
function toggleUploadArea() {
    const uploadArea = document.getElementById('upload-area');
    
    if (uploadArea.style.display === 'none') {
        uploadArea.style.display = 'block';
    } else {
        uploadArea.style.display = 'block';
        document.getElementById('file-input').click();
    }
}

// Handle file selection for upload
function handleFileSelection(files) {
    if (!files || files.length === 0) {
        return;
    }
    
    // Upload each file
    Array.from(files).forEach(file => {
        uploadFile(file);
    });
    
    // Clear file input
    document.getElementById('file-input').value = '';
}

// Upload a file
async function uploadFile(file) {
    const uploadProgress = document.getElementById('upload-progress');
    const progressFill = document.getElementById('progress-fill');
    
    // Show progress bar
    uploadProgress.style.display = 'block';
    progressFill.style.width = '0%';
    
    try {
        const token = localStorage.getItem('auth_token');
        
        // Create form data
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folderId', currentFolderId);
        
        // Create XMLHttpRequest to track progress
        const xhr = new XMLHttpRequest();
        
        // Set up progress tracking
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;
                progressFill.style.width = `${percentComplete}%`;
            }
        });
        
        // Set up completion handler
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                // Success
                showSuccessMessage(`ファイル "${file.name}" をアップロードしました`);
                loadFolderContents(currentFolderId);
            } else {
                // Error
                showErrorMessage('ファイルのアップロードに失敗しました');
            }
            
            // Hide progress after a delay
            setTimeout(() => {
                uploadProgress.style.display = 'none';
            }, 1000);
        });
        
        // Set up error handler
        xhr.addEventListener('error', () => {
            showErrorMessage('ファイルのアップロードに失敗しました');
            uploadProgress.style.display = 'none';
        });
        
        // Open and send request
        xhr.open('POST', '/api/files/upload');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
    } catch (error) {
        console.error('Error uploading file:', error);
        showErrorMessage('ファイルのアップロードに失敗しました');
        uploadProgress.style.display = 'none';
    }
}

// Download a file
function downloadFile(fileId, fileName) {
    const token = localStorage.getItem('auth_token');
    
    // First try to get a signed URL (CloudFront or S3)
    fetch(`/api/files/${fileId}/signed-url`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        if (!response.ok) {
            // Fall back to direct download if signed URL is not available
            return Promise.reject(new Error('Signed URL not available'));
        }
        return response.json();
    })
    .then(data => {
        // If we have a signed URL, use it directly
        if (data && data.url) {
            // Create a hidden anchor element
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = data.url;
            a.download = fileName || 'download';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Show success message with CloudFront info
            showSuccessMessage(`CloudFront経由でファイル "${fileName}" をダウンロードしました`);
        } else {
            // Fall back to direct download
            throw new Error('Invalid signed URL response');
        }
    })
    .catch(error => {
        console.log('Falling back to direct download:', error);
        
        // Create a hidden anchor element
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = `/api/files/${fileId}/download`;
        a.download = fileName || 'download';
        
        // Add authorization header via fetch and blob
        fetch(`/api/files/${fileId}/download`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Download failed');
            }
            const disposition = response.headers.get('Content-Disposition');
            let suggestedName = fileName || 'download';

            if (disposition) {
                const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
                if (utf8Match && utf8Match[1]) {
                    try {
                        suggestedName = decodeURIComponent(utf8Match[1]);
                    } catch (e) {}
                } else {
                    const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
                    if (asciiMatch && asciiMatch[1]) {
                        suggestedName = asciiMatch[1];
                    }
                }
            }

            return response.blob().then(blob => ({ blob, suggestedName }));
        })
        .then(({ blob, suggestedName }) => {
            const url = window.URL.createObjectURL(blob);
            a.href = url;
            a.setAttribute('download', suggestedName);
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        })
        .catch(error => {
            console.error('Error downloading file:', error);
            showErrorMessage('ファイルのダウンロードに失敗しました');
        });
    });
}

// Delete a file
async function deleteFile(fileId) {
    if (!confirm('このファイルを削除してもよろしいですか？')) {
        return;
    }
    
    showLoading();
    
    try {
        const token = localStorage.getItem('auth_token');
        
        const response = await fetch(`/api/files/${fileId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete file');
        }
        
        // Reload folder contents
        loadFolderContents(currentFolderId);
        
        // Show success message
        showSuccessMessage('ファイルを削除しました');
    } catch (error) {
        console.error('Error deleting file:', error);
        showErrorMessage('ファイルの削除に失敗しました');
    } finally {
        hideLoading();
    }
}

// Delete a folder
async function deleteFolder(folderId) {
    if (!confirm('このフォルダとその中のすべてのファイルを削除してもよろしいですか？')) {
        return;
    }
    
    showLoading();
    
    try {
        const token = localStorage.getItem('auth_token');
        
        const response = await fetch(`/api/folders/${folderId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete folder');
        }
        
        // Reload folder contents
        loadFolderContents(currentFolderId);
        
        // Show success message
        showSuccessMessage('フォルダを削除しました');
    } catch (error) {
        console.error('Error deleting folder:', error);
        showErrorMessage('フォルダの削除に失敗しました');
    } finally {
        hideLoading();
    }
}

// Utility Functions

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Get file icon based on MIME type
function getFileIcon(mimeType) {
    if (!mimeType) return '📄';
    
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📈';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('gzip')) return '🗜️';
    if (mimeType.includes('text')) return '📝';
    
    return '📄';
}

// Show loading indicator
function showLoading() {
    document.getElementById('loading-bar').style.display = 'block';
}

// Hide loading indicator
function hideLoading() {
    document.getElementById('loading-bar').style.display = 'none';
}

// Show success message
function showSuccessMessage(message) {
    const successElement = document.getElementById('success-message');
    successElement.textContent = message;
    successElement.style.display = 'block';
    
    // Hide message after 3 seconds
    setTimeout(() => {
        successElement.style.display = 'none';
    }, 3000);
}

// Show error message
function showErrorMessage(message) {
    alert(message);
}

// Check if user is logged in
function isLoggedIn() {
    return !!localStorage.getItem('auth_token');
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Initialize context menu event handlers
document.addEventListener('DOMContentLoaded', () => {
    // Download button in context menu
    document.getElementById('download-item').addEventListener('click', () => {
        if (contextMenuTarget && contextMenuTarget.type === 'file') {
            const fileElement = document.querySelector(`.file-item[data-file-id="${contextMenuTarget.id}"]`);
            if (fileElement) {
                const fileName = fileElement.querySelector('.file-name').textContent;
                downloadFile(contextMenuTarget.id, fileName);
            }
        }
        hideContextMenu();
    });
    
    // Delete button in context menu
    document.getElementById('delete-item').addEventListener('click', () => {
        if (contextMenuTarget) {
            if (contextMenuTarget.type === 'file') {
                deleteFile(contextMenuTarget.id);
            } else if (contextMenuTarget.type === 'folder') {
                deleteFolder(contextMenuTarget.id);
            }
        }
        hideContextMenu();
    });
});
