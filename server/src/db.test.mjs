import assert from 'node:assert/strict';
import test from 'node:test';
import { runMigrations } from './db.mjs';

function mockPool({ applied = [], failSql = false } = {}) {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql === 'SELECT filename FROM schema_migrations') return { rows: applied.map((filename) => ({ filename })) };
      if (failSql && sql.includes('CREATE TABLE IF NOT EXISTS users')) throw new Error('migration failed');
      return { rows: [] };
    },
    release() { released = true; },
  };
  return { pool: { async connect() { return client; } }, calls, released: () => released };
}

test('first startup reads SQL, locks migrations and commits', async () => {
  const mock = mockPool();
  await runMigrations(mock.pool);
  assert.equal(mock.calls[0].sql, 'BEGIN');
  assert.match(mock.calls[1].sql, /pg_advisory_xact_lock/);
  assert.ok(mock.calls.some(({ values }) => values?.[0] === '001_initial.sql'));
  assert.equal(mock.calls.at(-1).sql, 'COMMIT');
  assert.equal(mock.released(), true);
});

test('already applied migrations are skipped', async () => {
  const mock = mockPool({ applied: ['001_initial.sql', '002_user_scoped_ids.sql'] });
  await runMigrations(mock.pool);
  assert.ok(!mock.calls.some(({ sql }) => sql.startsWith('INSERT INTO schema_migrations')));
});

test('migration errors roll back and release the connection', async () => {
  const mock = mockPool({ failSql: true });
  await assert.rejects(runMigrations(mock.pool), /migration failed/);
  assert.equal(mock.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(mock.released(), true);
});