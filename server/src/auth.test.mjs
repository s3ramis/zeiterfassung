import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, normalizeEmail, validEmail, verifyPassword, hashToken } from './auth.mjs';

test('email addresses are normalized and validated', () => {
  assert.equal(normalizeEmail('  User@Example.COM '), 'user@example.com');
  assert.equal(validEmail('user@example.com'), true);
  assert.equal(validEmail('not-an-email'), false);
});

test('password hashes verify only the original password', async () => {
  const result = await hashPassword('ein-sehr-sicheres-passwort');
  assert.equal(await verifyPassword('ein-sehr-sicheres-passwort', result.salt, result.hash), true);
  assert.equal(await verifyPassword('falsches-passwort', result.salt, result.hash), false);
});

test('session tokens are stored as deterministic hashes', () => {
  assert.equal(hashToken('abc'), hashToken('abc'));
  assert.notEqual(hashToken('abc'), hashToken('abcd'));
  assert.equal(hashToken('abc').length, 64);
});
