import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCors, readJson } from './http.mjs';
import { Readable } from 'node:stream';

test('untrusted web origins are rejected before local API side effects', () => {
  const original = process.env.CORS_ORIGINS;
  process.env.CORS_ORIGINS = 'http://localhost:3001';
  try {
    const headers = {};
    const response = { setHeader(name, value) { headers[name] = value; } };
    assert.equal(applyCors({ headers: { origin: 'https://untrusted.example' } }, response), false);
    assert.equal(headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(applyCors({ headers: { origin: 'http://localhost:3001' } }, response), true);
    assert.equal(headers['Access-Control-Allow-Origin'], 'http://localhost:3001');
    assert.equal(applyCors({ headers: {} }, response), true);
  } finally {
    if (original === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = original;
  }
});

test('malformed JSON and oversized requests are rejected', async () => {
  await assert.rejects(readJson(Readable.from([Buffer.from('{')])), { statusCode: 400 });
  await assert.rejects(readJson(Readable.from([Buffer.from('null')])), { statusCode: 400 });
  await assert.rejects(readJson(Readable.from([Buffer.from('[]')])), { statusCode: 400 });
  await assert.rejects(readJson(Readable.from([Buffer.from('12345')]), 4), { statusCode: 413 });
});