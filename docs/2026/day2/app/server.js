// Day 2 ハンズオン用アプリ（社員名簿）。
// 接続情報をどこから持ってくるかを、環境変数 DB_SOURCE で切り替える。
//   local : このファイルに書いた値で、同じEC2のMySQLコンテナにつなぐ
//   ssm   : 起動時に Parameter Store から読んだ値でつなぐ
// ssm で RDS につながるのは、Parameter Store の host に RDS のエンドポイントを入れたから。
const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');
const { SSMClient, GetParametersCommand } = require('@aws-sdk/client-ssm');
const awsCaBundle = require('aws-ssl-profiles');

const PORT = Number(process.env.PORT || 3000);
const DB_SOURCE = process.env.DB_SOURCE === 'ssm' ? 'ssm' : 'local';
const PARAM_PREFIX = (process.env.PARAM_PREFIX || '').replace(/\/$/, '');

let pool = null;
let dbInfo = { source: DB_SOURCE, host: null, database: null };
let configError = null;

// local：接続情報は、このファイルに書いてある（パスワードも）。
async function loadLocalConfig() {
    return {
        host: process.env.DB_HOST || 'db',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'password',
        database: process.env.DB_NAME || 'employee_db',
    };
}

// ssm：接続情報を Parameter Store から読む。読む権限は EC2 のロールにある。
// {PARAM_PREFIX}/host, /user, /name は String、/password は SecureString。
// WithDecryption: true で、SecureString を復号した値を受け取る。
async function loadSsmConfig() {
    if (!PARAM_PREFIX) {
        throw new Error('PARAM_PREFIX が設定されていません');
    }
    const keys = ['host', 'user', 'name', 'password'];
    const names = keys.map((key) => `${PARAM_PREFIX}/${key}`);
    const ssm = new SSMClient({});
    const result = await ssm.send(new GetParametersCommand({ Names: names, WithDecryption: true }));
    if (result.InvalidParameters && result.InvalidParameters.length > 0) {
        throw new Error(`パラメータが見つかりません: ${result.InvalidParameters.join(', ')}`);
    }
    const values = {};
    for (const param of result.Parameters) {
        values[param.Name.slice(PARAM_PREFIX.length + 1)] = param.Value;
    }
    return {
        host: values.host,
        user: values.user,
        password: values.password,
        database: values.name,
        // RDS とは TLS でつなぎ、相手が本物の RDS かを Amazon RDS の CA 証明書で確かめる。
        ssl: awsCaBundle,
    };
}

async function connect() {
    try {
        // 切り替えはここだけ。どちらで読んでも、このあとの接続処理は同じ。
        const config = DB_SOURCE === 'ssm' ? await loadSsmConfig() : await loadLocalConfig();
        dbInfo = { source: DB_SOURCE, host: config.host, database: config.database };
        // maxIdle: 0 で、使い終わった接続を残さず閉じる。アクセスのたびに新しく接続するので、
        // セキュリティグループなどの変更が、次のアクセスからすぐに効く（古い接続が使われ続けない）。
        pool = mysql.createPool({ ...config, charset: 'utf8mb4', dateStrings: true, connectionLimit: 5, maxIdle: 0 });
        console.log(`DB_SOURCE=${DB_SOURCE} host=${config.host} database=${config.database}`);
    } catch (err) {
        // パスワードはログに出さない。エラーの種類とメッセージだけを残す。
        configError = `${err.name}: ${err.message}`;
        console.error(`設定の読み込みに失敗しました (${configError})`);
    }
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function requirePool(req, res, next) {
    if (!pool) {
        return res.status(503).json({ error: configError || 'データベースに接続していません' });
    }
    next();
}

app.get('/api/health', async (req, res) => {
    const body = { ...dbInfo, ok: false, error: configError };
    if (pool) {
        try {
            const [rows] = await pool.query('SELECT @@hostname AS server, VERSION() AS version');
            body.ok = true;
            body.server = rows[0].server;
            body.version = rows[0].version;
        } catch (err) {
            body.error = `${err.code || err.name}: ${err.message}`;
        }
    }
    res.json(body);
});

const FIELDS = ['employee_id', 'last_name', 'first_name', 'email', 'department', 'position', 'hire_date'];
const REQUIRED = ['employee_id', 'last_name', 'first_name', 'email', 'department'];

function readEmployee(body) {
    const employee = {};
    for (const field of FIELDS) {
        const value = typeof body[field] === 'string' ? body[field].trim() : '';
        employee[field] = value === '' ? null : value;
    }
    const missing = REQUIRED.filter((field) => !employee[field]);
    return { employee, missing };
}

function sendDbError(res, err) {
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: '社員番号またはメールアドレスが既に使われています' });
    }
    console.error(err);
    res.status(500).json({ error: `${err.code || err.name}: ${err.message}` });
}

app.get('/api/employees', requirePool, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, ${FIELDS.join(', ')} FROM employees ORDER BY employee_id`
        );
        res.json(rows);
    } catch (err) {
        sendDbError(res, err);
    }
});

app.post('/api/employees', requirePool, async (req, res) => {
    const { employee, missing } = readEmployee(req.body || {});
    if (missing.length > 0) {
        return res.status(400).json({ error: `必須項目が空です: ${missing.join(', ')}` });
    }
    try {
        const [result] = await pool.query('INSERT INTO employees SET ?', [employee]);
        res.status(201).json({ id: result.insertId, ...employee });
    } catch (err) {
        sendDbError(res, err);
    }
});

app.put('/api/employees/:id', requirePool, async (req, res) => {
    const { employee, missing } = readEmployee(req.body || {});
    if (missing.length > 0) {
        return res.status(400).json({ error: `必須項目が空です: ${missing.join(', ')}` });
    }
    try {
        const [result] = await pool.query('UPDATE employees SET ? WHERE id = ?', [employee, req.params.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: '社員が見つかりません' });
        }
        res.json({ id: Number(req.params.id), ...employee });
    } catch (err) {
        sendDbError(res, err);
    }
});

app.delete('/api/employees/:id', requirePool, async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM employees WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: '社員が見つかりません' });
        }
        res.status(204).end();
    } catch (err) {
        sendDbError(res, err);
    }
});

connect().then(() => {
    app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
});
