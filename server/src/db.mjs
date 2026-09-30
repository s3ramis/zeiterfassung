import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

export function createPool() {
  const connectionString = process.env.DATABASE_URL;
  const hasPgVariables = Boolean(process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER);
  if (!connectionString && !hasPgVariables) {
    throw new Error('Datenbankverbindung fehlt. Setze DATABASE_URL oder PGHOST, PGDATABASE und PGUSER.');
  }
  return new Pool({
    ...(connectionString ? { connectionString } : {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
    }),
    max: Number(process.env.DB_POOL_SIZE ?? 10),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
  });
}

export async function runMigrations(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize startup of multiple app processes, including the first migration.
    await client.query('SELECT pg_advisory_xact_lock(742019301)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
    const files = (await fs.readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    const appliedResult = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(appliedResult.rows.map((row) => row.filename));

    const newlyApplied = [];
    for (const filename of files) {
      if (applied.has(filename)) continue;
      const sql = await fs.readFile(path.join(directory, filename), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(filename) VALUES($1)', [filename]);
      newlyApplied.push(filename);
    }
    await client.query('COMMIT');
    for (const filename of newlyApplied) console.log(`[db] Migration angewendet: ${filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
