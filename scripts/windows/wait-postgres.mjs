import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';

const [executable, port] = process.argv.slice(2);
if (!executable || !/^\d+$/.test(port ?? '')) throw new Error('pg_isready-Pfad und Port erforderlich.');
const deadline = Date.now() + 120_000;
const run = promisify(execFile);
while (true) {
  try {
    await run(executable, ['-h', '127.0.0.1', '-p', port, '-t', '2'], { windowsHide: true });
    break;
  } catch (error) {
    if (Date.now() >= deadline) throw new Error('PostgreSQL nicht bereit. Datenbankprotokoll prüfen.', { cause: error });
    await setTimeout(1000);
  }
}