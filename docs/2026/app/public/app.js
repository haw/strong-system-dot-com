// Employee list with add / edit / delete, a badge that shows which database is in use,
// and the cosmos effects carried over from app-server (loading overlay, particles, shooting stars).
const rows = document.getElementById('rows');
const editor = document.getElementById('editor');
const form = document.getElementById('editor-form');
const FIELDS = ['employee_id', 'last_name', 'first_name', 'email', 'department', 'position', 'hire_date'];
const LOADING_TEXTS = [
    '小宇宙（コスモ）を燃やせ！',
    'ペガサス流星拳を充填中...',
    '第七感（セブンセンシズ）に目覚める時間だ...',
    'アテナの加護があらんことを...',
    'ギャラクシアンエクスプロージョン！',
    '鳳翼天翔！',
    'ダイヤモンドダスト！',
    '廬山昇龍覇！',
];
// Keep the overlay up long enough to read, even when the database answers instantly.
const MIN_LOADING_MS = 700;

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
    const el = document.getElementById('error-message');
    el.textContent = message || '';
    el.hidden = !message;
}

function showSuccess(message) {
    const el = document.getElementById('success-message');
    el.textContent = message;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 3000);
}

async function withCosmosLoading(task) {
    const overlay = document.getElementById('loading-overlay');
    document.getElementById('loading-text').textContent =
        LOADING_TEXTS[Math.floor(Math.random() * LOADING_TEXTS.length)];
    overlay.classList.add('show');
    const started = Date.now();
    try {
        return await task();
    } finally {
        const wait = MIN_LOADING_MS - (Date.now() - started);
        setTimeout(() => overlay.classList.remove('show'), Math.max(0, wait));
    }
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
    const health = await api('GET', '/api/health');
    const isRds = health.source === 'ssm';
    document.getElementById('badge').className =
        'badge ' + (!health.ok ? 'badge-down' : isRds ? 'badge-rds' : 'badge-local');
    document.getElementById('badge-source').textContent = isRds
        ? 'Amazon RDS'
        : 'ローカル MySQL（EC2内のコンテナ）';
    document.getElementById('badge-host').textContent = health.host || '';
    document.getElementById('badge-meta').textContent = health.ok
        ? `MySQL ${health.version} / サーバー ${health.server} / DB ${health.database}`
        : '接続できていません';
    if (!health.ok) {
        showError(health.error);
    }
}

function render() {
    document.getElementById('count').textContent = employees.length;
    rows.innerHTML = employees.map((e) => `
        <tr data-id="${e.id}" class="${e.id === lastAddedId ? 'added' : ''}">
            <td class="emp-id">${escapeHtml(e.employee_id)}</td>
            <td>${escapeHtml(e.last_name)} ${escapeHtml(e.first_name)}</td>
            <td>${escapeHtml(e.email)}</td>
            <td>${escapeHtml(e.department)}</td>
            <td>${escapeHtml(e.position)}</td>
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
        showError('');
    } catch (err) {
        employees = [];
        showError(err.message);
    }
    render();
}

function openEditor(employee) {
    editingId = employee ? employee.id : null;
    document.getElementById('editor-title').textContent = employee ? '従業員情報編集' : '新規従業員登録';
    document.getElementById('editor-submit').textContent = employee ? '更新' : '登録';
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
        await withCosmosLoading(async () => {
            if (editingId) {
                await api('PUT', `/api/employees/${editingId}`, body);
            } else {
                const created = await api('POST', '/api/employees', body);
                lastAddedId = created.id;
            }
            editor.close();
            await loadEmployees();
        });
        showSuccess(editingId ? '従業員情報を更新しました' : '従業員を登録しました');
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
    } else if (action === 'refresh') {
        await withCosmosLoading(async () => {
            await loadHealth().catch((err) => showError(err.message));
            await loadEmployees();
        });
    } else if (action === 'edit-employee' && employee) {
        openEditor(employee);
    } else if (action === 'delete-employee' && employee) {
        if (!confirm(`${employee.employee_id} ${employee.last_name} ${employee.first_name} を削除しますか？`)) {
            return;
        }
        try {
            await withCosmosLoading(async () => {
                await api('DELETE', `/api/employees/${id}`);
                await loadEmployees();
            });
            showSuccess('従業員を削除しました');
        } catch (err) {
            showError(err.message);
        }
    }
});

// クリック時のコスモパーティクル
document.addEventListener('click', (event) => {
    if (event.target.closest('button')) {
        createCosmosParticles(event.clientX, event.clientY);
    }
});

function createCosmosParticles(x, y) {
    const colors = ['#ffd700', '#ff6b00', '#ff0055', '#00ffcc', '#0099ff', '#ff00ff'];
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'cosmos-particle';
        const size = Math.random() * 8 + 4;
        const color = colors[Math.floor(Math.random() * colors.length)];
        Object.assign(particle.style, {
            width: `${size}px`,
            height: `${size}px`,
            left: `${x}px`,
            top: `${y}px`,
            background: color,
            boxShadow: `0 0 10px ${color}, 0 0 20px ${color}`,
        });
        document.body.appendChild(particle);

        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * 6 + 2;
        const vx = Math.cos(angle) * velocity;
        const vy = Math.sin(angle) * velocity;
        let opacity = 1;
        let px = x;
        let py = y;
        const animate = () => {
            if (opacity <= 0) {
                particle.remove();
                return;
            }
            px += vx;
            py += vy;
            opacity -= 0.02;
            particle.style.left = `${px}px`;
            particle.style.top = `${py}px`;
            particle.style.opacity = opacity;
            particle.style.transform = `scale(${opacity})`;
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }
}

// 流星を降らせる
function createShootingStar() {
    const star = document.createElement('div');
    star.className = 'shooting-star';
    star.style.left = `${Math.random() * window.innerWidth * 0.7 + window.innerWidth * 0.3}px`;
    star.style.top = `${Math.random() * window.innerHeight * 0.3}px`;
    star.addEventListener('animationend', () => star.remove());
    document.body.appendChild(star);
}
setTimeout(createShootingStar, 1000);
setInterval(createShootingStar, 1500);

withCosmosLoading(async () => {
    await loadHealth().catch((err) => showError(err.message));
    await loadEmployees();
});
