// Employee list with add / edit / delete, and a badge that shows which database is in use.
const rows = document.getElementById('rows');
const editor = document.getElementById('editor');
const form = document.getElementById('editor-form');
const FIELDS = ['employee_id', 'last_name', 'first_name', 'email', 'department', 'position', 'hire_date'];

let employees = [];
let editingId = null;
let lastAddedId = null;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function formatDate(value) {
    return value ? String(value).slice(0, 10) : '';
}

function showError(message) {
    const el = document.getElementById('error');
    el.textContent = message || '';
    el.hidden = !message;
}

async function api(method, url, body) {
    const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) {
        return null;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
}

async function loadHealth() {
    const badge = document.getElementById('badge');
    const health = await api('GET', '/api/health');
    const isRds = health.source === 'ssm';
    badge.className = 'badge ' + (!health.ok ? 'badge-down' : isRds ? 'badge-rds' : 'badge-local');
    document.getElementById('badge-source').textContent = isRds
        ? 'Amazon RDS'
        : 'ローカル MySQL（EC2内のコンテナ）';
    document.getElementById('badge-host').textContent = health.host || '';
    document.getElementById('badge-meta').textContent = health.ok
        ? `MySQL ${health.version} / サーバー ${health.server} / DB ${health.database}`
        : '接続できていません';
    showError(health.ok ? '' : health.error);
}

function render() {
    document.getElementById('count').textContent = employees.length;
    rows.innerHTML = employees.map((e) => `
        <tr data-id="${e.id}" class="${e.id === lastAddedId ? 'added' : ''}">
            <td class="emp-id">${escapeHtml(e.employee_id)}</td>
            <td>${escapeHtml(e.last_name)} ${escapeHtml(e.first_name)}</td>
            <td>${escapeHtml(e.department)}</td>
            <td>${escapeHtml(e.position)}</td>
            <td>${escapeHtml(e.email)}</td>
            <td>${escapeHtml(formatDate(e.hire_date))}</td>
            <td class="row-actions">
                <button class="btn btn-small" data-action="edit-employee">編集</button>
                <button class="btn btn-small btn-danger" data-action="delete-employee">削除</button>
            </td>
        </tr>`).join('');
}

async function loadEmployees() {
    try {
        employees = await api('GET', '/api/employees');
    } catch (err) {
        employees = [];
        showError(err.message);
    }
    render();
}

function openEditor(employee) {
    editingId = employee ? employee.id : null;
    document.getElementById('editor-title').textContent = employee ? '社員を編集' : '社員を追加';
    document.getElementById('editor-error').hidden = true;
    for (const field of FIELDS) {
        const value = employee ? employee[field] : '';
        form.elements[field].value = field === 'hire_date' ? formatDate(value) : (value ?? '');
    }
    editor.showModal();
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = {};
    for (const field of FIELDS) {
        body[field] = form.elements[field].value;
    }
    try {
        if (editingId) {
            await api('PUT', `/api/employees/${editingId}`, body);
        } else {
            const created = await api('POST', '/api/employees', body);
            lastAddedId = created.id;
        }
        editor.close();
        await loadEmployees();
    } catch (err) {
        const el = document.getElementById('editor-error');
        el.textContent = err.message;
        el.hidden = false;
    }
});

document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) {
        return;
    }
    const action = button.dataset.action;
    const id = Number(button.closest('tr')?.dataset.id);
    const employee = employees.find((e) => e.id === id);

    if (action === 'open-create') {
        openEditor(null);
    } else if (action === 'close-editor') {
        editor.close();
    } else if (action === 'edit-employee' && employee) {
        openEditor(employee);
    } else if (action === 'delete-employee' && employee) {
        if (!confirm(`${employee.employee_id} ${employee.last_name} ${employee.first_name} を削除しますか？`)) {
            return;
        }
        try {
            await api('DELETE', `/api/employees/${id}`);
            await loadEmployees();
        } catch (err) {
            showError(err.message);
        }
    }
});

loadHealth().catch((err) => showError(err.message));
loadEmployees();
