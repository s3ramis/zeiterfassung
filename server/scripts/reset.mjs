import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { loadEnvFile } from '../src/env.mjs';
import { createPool, runMigrations } from '../src/db.mjs';

loadEnvFile();
const rl = readline.createInterface({ input, output });
const answer = await rl.question('Alle TimePilot-Tabellen und Benutzer unwiderruflich löschen? Tippe RESET: ');
rl.close();
if (answer !== 'RESET') {
  console.log('Abgebrochen.');
  process.exit(0);
}
const pool = createPool();
try {
  await pool.query(`DROP TABLE IF EXISTS holiday_cache, daily_notes, work_plan_days, work_plans, absences, time_events, sessions, users, schema_migrations CASCADE`);
  await runMigrations(pool);
  console.log('[db] Datenbank wurde vollständig zurückgesetzt.');
} finally {
  await pool.end();
}
