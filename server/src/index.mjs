import crypto from 'node:crypto';
import http from 'node:http';
import { loadEnvFile } from './env.mjs';

loadEnvFile();

const [{ createPool, runMigrations }, auth, dataModule, httpUtils] = await Promise.all([
  import('./db.mjs'),
  import('./auth.mjs'),
  import('./data.mjs'),
  import('./http.mjs'),
]);

const { normalizeEmail, validEmail, hashPassword, verifyPassword, createSession, authenticatedUser, hashToken } = auth;
const { initializeUserData, loadUserData, replaceUserData, resetUserData } = dataModule;
const { sendJson, readJson, applyCors, serveFrontend } = httpUtils;
const pool = createPool();
await runMigrations(pool);
await pool.query('DELETE FROM sessions WHERE expires_at <= now()');
const sessionCleanup = setInterval(() => {
  void pool.query('DELETE FROM sessions WHERE expires_at <= now()').catch((error) => console.error('[server] Sitzungsbereinigung fehlgeschlagen', error));
}, 6 * 60 * 60 * 1000);
sessionCleanup.unref();

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';

const loginAttempts = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const recent = (loginAttempts.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  loginAttempts.set(key, recent);
  return true;
}
function clearRateLimit(key) {
  loginAttempts.delete(key);
}
function requestAddress(request) {
  return request.socket.remoteAddress ?? 'unknown';
}

function publicUser(row) {
  return { id: row.id, email: row.email, displayName: row.display_name };
}

async function requireUser(request, response) {
  const user = await authenticatedUser(pool, request.headers.authorization);
  if (!user) {
    sendJson(response, 401, { error: 'Bitte erneut anmelden.' });
    return null;
  }
  return user;
}

const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'same-origin');
  if (!applyCors(request, response)) {
    sendJson(response, 403, { error: 'Dieser Browser-Ursprung ist nicht erlaubt.' });
    return;
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      await pool.query('SELECT 1');
      sendJson(response, 200, { ok: true, service: 'timepilot-server' });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/register') {
      const rateKey = `register:${requestAddress(request)}`;
      if (!rateLimit(rateKey, 8, 60 * 60 * 1000)) throw Object.assign(new Error('Zu viele Registrierungsversuche. Bitte später erneut versuchen.'), { statusCode: 429 });
      const body = await readJson(request);
      const email = normalizeEmail(body.email);
      const displayName = String(body.displayName ?? '').trim();
      const password = String(body.password ?? '');
      if (!validEmail(email) || email.length > 320) throw Object.assign(new Error('Bitte eine gültige E-Mail-Adresse eingeben.'), { statusCode: 400 });
      if (displayName.length < 2 || displayName.length > 120) throw Object.assign(new Error('Der Anzeigename muss 2 bis 120 Zeichen lang sein.'), { statusCode: 400 });
      if (password.length < 10 || password.length > 200) throw Object.assign(new Error('Das Passwort muss 10 bis 200 Zeichen lang sein.'), { statusCode: 400 });

      const { salt, hash } = await hashPassword(password);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const id = crypto.randomUUID();
        const result = await client.query(
          `INSERT INTO users(id, email, email_normalized, display_name, password_salt, password_hash, employee_name)
           VALUES($1, $2, $3, $4, $5, $6, $4)
           RETURNING id, email, display_name`,
          [id, email, email, displayName, salt, hash],
        );
        await initializeUserData(client, id, displayName);
        const token = await createSession(client, id);
        await client.query('COMMIT');
        sendJson(response, 201, { token, user: publicUser(result.rows[0]) });
      } catch (error) {
        await client.query('ROLLBACK');
        if (error?.code === '23505') throw Object.assign(new Error('Für diese E-Mail-Adresse existiert bereits ein Konto.'), { statusCode: 409 });
        throw error;
      } finally {
        client.release();
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const rateKey = `login:${requestAddress(request)}`;
      if (!rateLimit(rateKey, 20, 15 * 60 * 1000)) throw Object.assign(new Error('Zu viele Anmeldeversuche. Bitte später erneut versuchen.'), { statusCode: 429 });
      const body = await readJson(request);
      const email = normalizeEmail(body.email);
      const password = String(body.password ?? '');
      const result = await pool.query(
        `SELECT id, email, display_name, password_salt, password_hash
           FROM users WHERE email_normalized = $1`,
        [email],
      );
      const valid = result.rowCount && await verifyPassword(password, result.rows[0].password_salt, result.rows[0].password_hash);
      if (!valid) throw Object.assign(new Error('E-Mail-Adresse oder Passwort ist falsch.'), { statusCode: 401 });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const token = await createSession(client, result.rows[0].id);
        await client.query('COMMIT');
        clearRateLimit(rateKey);
        sendJson(response, 200, { token, user: publicUser(result.rows[0]) });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      const user = await requireUser(request, response);
      if (!user) return;
      sendJson(response, 200, { id: user.id, email: user.email, displayName: user.displayName });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      const user = await requireUser(request, response);
      if (!user) return;
      const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '');
      if (bearer) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(bearer[1])]);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/data') {
      const user = await requireUser(request, response);
      if (!user) return;
      sendJson(response, 200, await loadUserData(pool, user.id));
      return;
    }

    if (request.method === 'PUT' && url.pathname === '/api/data') {
      const user = await requireUser(request, response);
      if (!user) return;
      const body = await readJson(request);
      sendJson(response, 200, await replaceUserData(pool, user.id, body.data, body.revision));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/data/reset') {
      const user = await requireUser(request, response);
      if (!user) return;
      sendJson(response, 200, await resetUserData(pool, user.id));
      return;
    }

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: 'API-Endpunkt nicht gefunden.' });
      return;
    }

    if (!serveFrontend(request, response)) {
      sendJson(response, 404, { error: 'Frontend wurde noch nicht gebaut. Starte für die Entwicklung zusätzlich Vite mit npm run dev:web.' });
    }
  } catch (error) {
    const status = Number(error?.statusCode ?? 500);
    if (status >= 500) console.error(error);
    sendJson(response, status, { error: status >= 500 ? 'Interner Serverfehler.' : error.message });
  }
});

server.listen(port, host, () => {
  console.log(`[server] TimePilot läuft auf http://localhost:${port}`);
  console.log(`[server] API: http://localhost:${port}/api`);
});

async function shutdown(signal) {
  clearInterval(sessionCleanup);
  console.log(`[server] ${signal}: Server wird beendet …`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
