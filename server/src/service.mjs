// Native Windows service: use only the private, installer-managed configuration.
// Inherited machine-wide PG*/DATABASE_URL values must never redirect this service.
import { loadEnvFile } from './env.mjs';

for (const key of [
  'DATABASE_URL', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD',
  'HOST', 'PORT', 'CORS_ORIGINS', 'DB_SSL', 'DB_SSL_REJECT_UNAUTHORIZED', 'DB_POOL_SIZE', 'SESSION_DAYS',
]) delete process.env[key];
loadEnvFile();
if (process.env.HOST !== '127.0.0.1' || process.env.PGHOST !== '127.0.0.1' || process.env.DATABASE_URL) {
  throw new Error('Der lokale Windows-Dienst benötigt ausschließlich Loopback-Adressen und PG*-Konfiguration.');
}
await import('./index.mjs');