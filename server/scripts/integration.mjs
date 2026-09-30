// Real PostgreSQL/HTTP smoke test. Uses a disposable cluster, NEVER the configured DB.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runMigrations } from '../src/db.mjs';
import { createDefaultData, loadUserData } from '../src/data.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bin = process.env.TIMEPILOT_TEST_PG_BIN;
if (!bin) throw new Error('TIMEPILOT_TEST_PG_BIN muss auf PostgreSQL bin zeigen. Kein Test gegen bestehende Datenbanken.');
const suffix = process.platform === 'win32' ? '.exe' : '';
const executable = (name) => path.join(bin, `${name}${suffix}`);
const run = promisify(execFile);
async function controlDatabase(args) {
  // On Windows PostgreSQL can inherit pg_ctl's pipes after pg_ctl itself exits.
  // An execFile callback then waits forever for those handles to close.
  const child = spawn(executable('pg_ctl'), args, { windowsHide: true, stdio: 'ignore' });
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error(`pg_ctl failed (${code}); see ${temp}`);
}
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'timepilot-db-test-'));
const dbDir = path.join(temp, 'data');
const password = crypto.randomBytes(32).toString('hex');
const pwFile = path.join(temp, 'password.txt');
async function freePort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}
const dbPort = await freePort();
const appPort = await freePort();
const base = `http://127.0.0.1:${appPort}`;
const env = { ...process.env, DATABASE_URL: '', PGHOST: '127.0.0.1', PGPORT: String(dbPort),
  PGUSER: 'timepilot', PGPASSWORD: password, PGDATABASE: 'timepilot', DB_SSL: 'false',
  HOST: '127.0.0.1', PORT: String(appPort), CORS_ORIGINS: base };
let app;
let pool;
let dbStarted = false;
let appOutput = '';
async function api(route, { method = 'GET', token, body, origin } = {}) {
  const response = await fetch(`${base}/api${route}`, { method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10_000) });
  return { status: response.status, body: await response.json() };
}
async function startApp() {
  app = spawn(process.execPath, ['server/src/index.mjs'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  app.stdout.on('data', (value) => { appOutput += value; });
  app.stderr.on('data', (value) => { appOutput += value; });
  const deadline = Date.now() + 30_000;
  while (true) {
    if (app.exitCode !== null) throw new Error(`App beendet: ${appOutput}`);
    try { if ((await api('/health')).status === 200) return; } catch { /* starting */ }
    if (Date.now() > deadline) throw new Error(`Start-Timeout: ${appOutput}`);
    await setTimeout(100);
  }
}
async function stopApp() {
  if (app && app.exitCode === null) {
    const exited = once(app, 'exit');
    app.kill();
    await exited;
  }
  app = undefined;
}

try {
  await fs.writeFile(pwFile, password, { mode: 0o600 });
  await run(executable('initdb'), ['-D', dbDir, '-U', 'postgres', '--encoding=UTF8', '--locale=C', '--auth=scram-sha-256', `--pwfile=${pwFile}`]);
  await controlDatabase(['start', '-D', dbDir, '-l', path.join(temp, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${dbPort}`, '-w', '-t', '30']);
  dbStarted = true;
  const admin = new pg.Client({ host: '127.0.0.1', port: dbPort, user: 'postgres', password, database: 'postgres' });
  await admin.connect();
  try {
    await admin.query(`CREATE ROLE timepilot LOGIN PASSWORD '${password}'`);
    await admin.query('CREATE DATABASE timepilot OWNER timepilot');
    await admin.query('CREATE DATABASE restored OWNER timepilot');
    await admin.query('CREATE DATABASE legacy OWNER timepilot');
  } finally { await admin.end(); }
  pool = new pg.Pool({ host: '127.0.0.1', port: dbPort, user: 'timepilot', password, database: 'timepilot' });
  // Upgrade a v1 database with real work-plan/day rows, not just an empty schema.
  const legacy = new pg.Pool({ host: '127.0.0.1', port: dbPort, user: 'timepilot', password, database: 'legacy' });
  try {
    await legacy.query(await fs.readFile(path.join(root, 'server/migrations/001_initial.sql'), 'utf8'));
    await legacy.query('CREATE TABLE schema_migrations(filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    await legacy.query("INSERT INTO schema_migrations(filename) VALUES('001_initial.sql')");
    const legacyUser = crypto.randomUUID();
    const legacyPlan = crypto.randomUUID();
    await legacy.query(`INSERT INTO users(id,email,email_normalized,display_name,password_salt,password_hash,employee_name)
      VALUES($1,'legacy@example.invalid','legacy@example.invalid','Legacy','unused','unused','Legacy')`, [legacyUser]);
    await legacy.query("INSERT INTO work_plans(id,user_id,name,valid_from) VALUES($1,$2,'Legacy plan','2026-01-01')", [legacyPlan, legacyUser]);
    await legacy.query('INSERT INTO work_plan_days(work_plan_id,weekday,minutes) VALUES($1,1,480)', [legacyPlan]);
    await runMigrations(legacy);
    const migrated = await loadUserData(legacy, legacyUser);
    assert.equal(migrated.data.workPlans[0].hoursByWeekday[1], 8);
    assert.equal(migrated.data.workPlans[0].id, legacyPlan);
    await legacy.query('DELETE FROM work_plans WHERE user_id=$1 AND id=$2', [legacyUser, legacyPlan]);
    assert.equal((await legacy.query('SELECT count(*)::int AS count FROM work_plan_days')).rows[0].count, 0);
  } finally { await legacy.end(); }
  // Parallel migrations must be safe even on a completely empty database.
  await Promise.all([runMigrations(pool), runMigrations(pool)]);
  await startApp();
  assert.equal((await api('/health')).status, 200);
  assert.equal((await api('/data')).status, 401);
  assert.equal((await api('/auth/register', { method: 'POST', origin: 'https://untrusted.example', body: {} })).status, 403);
  const account = { displayName: 'Integration Test', email: 'test@example.invalid', password: 'Test-password-123456' };
  const registration = await api('/auth/register', { method: 'POST', body: account });
  assert.equal(registration.status, 201);
  const token = registration.body.token;
  const userId = registration.body.user.id;
  assert.equal((await api('/auth/register', { method: 'POST', body: account })).status, 409);
  assert.equal((await api('/auth/login', { method: 'POST', body: { ...account, password: 'wrong' } })).status, 401);
  assert.equal((await api('/auth/login', { method: 'POST', body: account })).status, 200);
  const loaded = await api('/data', { token });
  assert.equal(loaded.status, 200);
  const data = loaded.body.data;
  data.settings.employeeName = 'Dauerhaft gespeichert';
  data.events = [
    { id: crypto.randomUUID(), type: 'CLOCK_IN', timestamp: '2026-01-02T08:00:00.000Z', source: 'manual' },
    { id: crypto.randomUUID(), type: 'BREAK_START', timestamp: '2026-01-02T12:00:00.000Z', source: 'manual' },
    { id: crypto.randomUUID(), type: 'BREAK_END', timestamp: '2026-01-02T12:30:00.000Z', source: 'manual' },
    { id: crypto.randomUUID(), type: 'CLOCK_OUT', timestamp: '2026-01-02T16:30:00.000Z', source: 'manual' },
  ];
  data.absences = [{ id: crypto.randomUUID(), type: 'vacation', from: '2026-02-02', to: '2026-02-03', note: 'Urlaub', createdAt: '2026-01-01T00:00:00.000Z' }];
  data.holidayCache = { '2026:DE-BY': { key: '2026:DE-BY', loadedAt: '2026-01-01T00:00:00.000Z', source: 'fallback',
    holidays: [{ date: '2026-01-01', name: 'Neujahr', nationwide: true }] } };
  data.notes['2026-01-02'] = 'Testnotiz';
  const saved = await api('/data', { method: 'PUT', token, body: { data, revision: loaded.body.revision } });
  assert.equal(saved.status, 200);
  assert.deepEqual((await api('/data', { token })).body.data, data);
  const contenders = await Promise.all([1, 2].map(() => api('/data', { method: 'PUT', token,
    body: { data, revision: saved.body.revision } })));
  assert.deepEqual(contenders.map((result) => result.status).sort(), [200, 409]);
  // Assert every read uses one connection/snapshot, even when tables change mid-read.
  let writer;
  const wrappedPool = { async connect() {
    const client = await pool.connect();
    return { async query(sql, values) {
      const result = await client.query(sql, values);
      if (sql.includes('SELECT employee_name,')) {
        writer = await pool.connect();
        await writer.query('BEGIN');
        await writer.query('DELETE FROM daily_notes WHERE user_id = $1', [userId]);
        await writer.query('UPDATE users SET data_revision = data_revision + 1 WHERE id = $1', [userId]);
        await writer.query('COMMIT');
        writer.release(); writer = undefined;
      }
      return result;
    }, release() { client.release(); } };
  } };
  const consistent = await loadUserData(wrappedPool, userId);
  assert.equal(consistent.data.notes['2026-01-02'], 'Testnotiz');
  assert.equal(consistent.revision, saved.body.revision + 1);
  await stopApp();
  await startApp();
  const persisted = await api('/data', { token });
  assert.equal(persisted.body.data.settings.employeeName, 'Dauerhaft gespeichert');
  assert.deepEqual(persisted.body.data.events, data.events);
  assert.deepEqual(persisted.body.data.absences, data.absences);
  const dump = path.join(temp, 'backup.dump');
  await run(executable('pg_dump'), ['-h', '127.0.0.1', '-p', String(dbPort), '-U', 'timepilot', '-d', 'timepilot',
    '--no-password', '--format=custom', '--file', dump], { env });
  await run(executable('pg_restore'), ['-h', '127.0.0.1', '-p', String(dbPort), '-U', 'timepilot', '-d', 'restored',
    '--no-password', '--clean', '--if-exists', '--no-owner', '--single-transaction', dump], { env });
  const restored = new pg.Pool({ host: '127.0.0.1', port: dbPort, user: 'timepilot', password, database: 'restored' });
  try { assert.deepEqual(await loadUserData(restored, userId), persisted.body); }
  finally { await restored.end(); }
  const second = await api('/auth/register', { method: 'POST', body: { ...account, email: 'other@example.invalid' } });
  assert.equal(second.status, 201);
  assert.equal((await api('/data', { token: second.body.token })).body.data.settings.employeeName, account.displayName);
  assert.equal((await api('/data', { method: 'PUT', token: second.body.token, body: { data, revision: 0 } })).status, 200);
  const withoutPlans = { ...persisted.body.data, workPlans: [] };
  assert.equal((await api('/data', { method: 'PUT', token, body: { data: withoutPlans, revision: persisted.body.revision } })).status, 200);
  assert.deepEqual((await api('/data', { token })).body.data.workPlans, []);
  const bad = createDefaultData(); bad.settings.annualLeaveDays = -1;
  assert.equal((await api('/data', { method: 'PUT', token, body: { data: bad, revision: persisted.body.revision } })).status, 400);
  assert.equal((await api('/data/reset', { method: 'POST', token })).status, 200);
  assert.equal((await api('/auth/logout', { method: 'POST', token })).status, 200);
  assert.equal((await api('/data', { token })).status, 401);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count, 2);
  console.log('OK: Eingeschraenkte DB-Rolle, Migrationen, Registrierung/Login, Isolation, Persistenz/Neustart, Konflikte, Snapshot, Backup/Restore, Reset und Logout.');
} finally {
  await stopApp();
  if (pool) await pool.end();
  if (dbStarted) await controlDatabase(['stop', '-D', dbDir, '-m', 'fast', '-w', '-t', '30']);
  await fs.rm(temp, { recursive: true, force: true });
}