import { loadEnvFile } from '../src/env.mjs';
import { createPool, runMigrations } from '../src/db.mjs';

loadEnvFile();
const pool = createPool();
try {
  await runMigrations(pool);
  console.log('[db] Datenbankschema ist aktuell.');
} finally {
  await pool.end();
}
