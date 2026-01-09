// Configuration - Replace with your Lambda Function URL
// 例: const API_URL = 'https://p55dobiu3bok77c6p222t6w22y0pvenb.lambda-url.us-east-1.on.aws';
// ※ 末尾に / を入れないこと！ 入れると動きません
const API_URL = 'FUNCTION_URL_PLACEHOLDER';

let editingEmployeeId = null;
let currentView = 'employees';

// Loading Overlay
function showLoading(text = '処理中...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').style.display = 'flex';
}
function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadEmployees();
});

// ========================================
// Employee Functions
// ========================================

async function loadEmployees() {
    document.getElementById('loadingMessage').style.display = 'block';
    try {
        const response = await fetch(`${API_URL}/employees`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '取得失敗');
        displayEmployees(data.employees);
    } catch (error) {
        console.error('Load employees error:', error);
        alert(error.message);
    } finally {
        document.getElementById('loadingMessage').style.display = 'none';
    }
}

function displayEmployees(employees) {
    const tbody = document.getElementById('employeeTableBody');
    tbody.innerHTML = '';
    if (employees.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #999;">従業員が登録されていません</td></tr>';
        return;
    }
    employees.forEach(emp => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${emp.name}</td>
            <td>${emp.email}</td>
            <td>${emp.department}</td>
            <td>${emp.position}</td>
            <td>${emp.hireDate}</td>
            <td class="actions">
                <button class="btn-edit" onclick="editEmployee('${emp.id}')">編集</button>
                <button class="btn-delete" onclick="deleteEmployee('${emp.id}')">削除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function showAddModal() {
    editingEmployeeId = null;
    document.getElementById('modalTitle').textContent = '従業員を追加';
    document.getElementById('employeeName').value = '';
    document.getElementById('employeeEmail').value = '';
    document.getElementById('employeeDepartment').value = '';
    document.getElementById('employeePosition').value = '';
    document.getElementById('employeeHireDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('employeeModal').style.display = 'flex';
}

async function editEmployee(id) {
    try {
        const response = await fetch(`${API_URL}/employees/${id}`);
        const emp = await response.json();
        if (!response.ok) throw new Error(emp.error || '取得失敗');
        editingEmployeeId = id;
        document.getElementById('modalTitle').textContent = '従業員を編集';
        document.getElementById('employeeName').value = emp.name;
        document.getElementById('employeeEmail').value = emp.email;
        document.getElementById('employeeDepartment').value = emp.department;
        document.getElementById('employeePosition').value = emp.position;
        document.getElementById('employeeHireDate').value = emp.hireDate;
        document.getElementById('employeeModal').style.display = 'flex';
    } catch (error) {
        alert(error.message);
    }
}

async function saveEmployee() {
    const name = document.getElementById('employeeName').value;
    const email = document.getElementById('employeeEmail').value;
    const department = document.getElementById('employeeDepartment').value;
    const position = document.getElementById('employeePosition').value;
    const hireDate = document.getElementById('employeeHireDate').value;
    if (!name || !email || !department || !position) {
        alert('すべての項目を入力してください');
        return;
    }
    showLoading(editingEmployeeId ? '更新中...' : '登録中...');
    try {
        const url = editingEmployeeId ? `${API_URL}/employees/${editingEmployeeId}` : `${API_URL}/employees`;
        const method = editingEmployeeId ? 'PUT' : 'POST';
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, department, position, hireDate }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '保存失敗');
        closeModal();
        loadEmployees();
    } catch (error) {
        alert(error.message);
    } finally {
        hideLoading();
    }
}

async function deleteEmployee(id) {
    if (!confirm('この従業員を削除してもよろしいですか？')) return;
    showLoading('削除中...');
    try {
        const response = await fetch(`${API_URL}/employees/${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '削除失敗');
        loadEmployees();
    } catch (error) {
        alert(error.message);
    } finally {
        hideLoading();
    }
}

function closeModal() {
    document.getElementById('employeeModal').style.display = 'none';
}

// ========================================
// View Switching
// ========================================

function switchView(view) {
    currentView = view;
    if (view === 'employees') {
        document.getElementById('employeeView').style.display = 'block';
        document.getElementById('fileView').style.display = 'none';
        document.getElementById('btnEmployees').classList.add('active');
        document.getElementById('btnFiles').classList.remove('active');
        loadEmployees();
    } else {
        document.getElementById('employeeView').style.display = 'none';
        document.getElementById('fileView').style.display = 'block';
        document.getElementById('btnEmployees').classList.remove('active');
        document.getElementById('btnFiles').classList.add('active');
        loadFiles();
    }
}

// ========================================
// File Functions
// ========================================

async function loadFiles() {
    document.getElementById('fileLoadingMessage').style.display = 'block';
    try {
        const response = await fetch(`${API_URL}/files`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '取得失敗');
        displayFiles(data.files);
    } catch (error) {
        console.error('Load files error:', error);
        alert(error.message);
    } finally {
        document.getElementById('fileLoadingMessage').style.display = 'none';
    }
}

function displayFiles(files) {
    const tbody = document.getElementById('fileTableBody');
    tbody.innerHTML = '';
    if (files.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">ファイルがありません</td></tr>';
        return;
    }
    files.forEach(file => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${file.fileName}</td>
            <td>${file.mimeType || 'unknown'}</td>
            <td>${formatFileSize(file.fileSize)}</td>
            <td>${new Date(file.createdAt).toLocaleString('ja-JP')}</td>
            <td class="actions">
                <button class="btn-edit" onclick="downloadFile('${file.id}', '${file.fileName}')">ダウンロード</button>
                <button class="btn-delete" onclick="deleteFile('${file.id}')">削除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (!file) { alert('ファイルを選択してください'); return; }

    showLoading('アップロード中...');
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;

    try {
        // Get presigned URL
        const urlResponse = await fetch(`${API_URL}/files/upload-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type }),
        });
        const urlData = await urlResponse.json();
        if (!urlResponse.ok) throw new Error(urlData.error || 'URL取得失敗');

        // Upload to S3
        const uploadResponse = await fetch(urlData.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
        });
        if (!uploadResponse.ok) throw new Error('S3アップロード失敗');

        // Save metadata
        const metaResponse = await fetch(`${API_URL}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: urlData.fileId, fileName: file.name, fileSize: file.size, mimeType: file.type, s3Key: urlData.s3Key }),
        });
        if (!metaResponse.ok) throw new Error('メタデータ保存失敗');

        alert('アップロード完了');
        fileInput.value = '';
        document.getElementById('selectedFileName').textContent = '';
        loadFiles();
    } catch (error) {
        alert(error.message);
    } finally {
        uploadBtn.disabled = false;
        hideLoading();
    }
}

async function downloadFile(fileId, fileName) {
    try {
        const response = await fetch(`${API_URL}/files/${fileId}/download-url`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'URL取得失敗');
        const link = document.createElement('a');
        link.href = data.downloadUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        alert(error.message);
    }
}

async function deleteFile(fileId) {
    if (!confirm('このファイルを削除してもよろしいですか？')) return;
    showLoading('削除中...');
    try {
        const response = await fetch(`${API_URL}/files/${fileId}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '削除失敗');
        alert('削除完了');
        loadFiles();
    } catch (error) {
        alert(error.message);
    } finally {
        hideLoading();
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function updateFileSelection() {
    const fileInput = document.getElementById('fileInput');
    const selectedFileName = document.getElementById('selectedFileName');
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        selectedFileName.textContent = `選択中: ${file.name} (${formatFileSize(file.size)})`;
    } else {
        selectedFileName.textContent = '';
    }
}
