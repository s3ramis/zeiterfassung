import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = Number(process.env.SESSION_DAYS ?? 30);

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = await scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt, hash: Buffer.from(derived).toString('hex') };
}

export async function verifyPassword(password, salt, expectedHex) {
  const { hash } = await hashPassword(password, salt);
  const actual = Buffer.from(hash, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(client, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await client.query(
    'INSERT INTO sessions(id, user_id, token_hash, expires_at) VALUES($1, $2, $3, $4)',
    [crypto.randomUUID(), userId, hashToken(token), expiresAt],
  );
  return token;
}

export async function authenticatedUser(pool, authorization) {
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  if (!match) return null;
  const tokenHash = hashToken(match[1]);
  const result = await pool.query(
    `SELECT u.id, u.email, u.display_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash],
  );
  if (!result.rowCount) return null;
  return {
    id: result.rows[0].id,
    email: result.rows[0].email,
    displayName: result.rows[0].display_name,
    tokenHash,
  };
}
