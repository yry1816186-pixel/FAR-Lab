/**
 * cache_secrets.test.ts — R10 §11C 磁带与缓存存储面脱敏（night-r3）：
 * 伪造含 key 的响应不得落盘（写入前阻断+告警）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RetrievalCache, detectCachedSecret, type CacheEnvelope } from '../../src/retrieval/cache.ts';

function envelope(body: string): CacheEnvelope {
  return {
    url: 'https://api.example.com/works?filter=x',
    host: 'api.example.com',
    status: 200,
    body,
    retrievedAt: '2026-08-16T00:00:00.000Z',
    storedAt: '2026-08-16T00:00:00.000Z',
  };
}

test('detectCachedSecret: catches the common token families, passes clean text', () => {
  assert.equal(detectCachedSecret('{"title": "Dark matter constraints"}'), null);
  assert.equal(detectCachedSecret('authorization failed for sk-abcdefghijabcdefghijabcdefgh'), 'sk- key');
  assert.equal(detectCachedSecret('token ghp_' + 'a'.repeat(36)), 'github token');
  assert.equal(detectCachedSecret('key AKIAIOSFODNN7EXAMPLE region us-east'), 'AWS key id');
  assert.equal(detectCachedSecret('-----BEGIN RSA PRIVATE KEY-----'), 'PEM block');
  assert.equal(detectCachedSecret('Authorization: Bearer ' + 'x'.repeat(40)), 'bearer token');
  // false-positive direction check: ordinary prose with "sk-" prefix too short
  assert.equal(detectCachedSecret('the sk-etch of the model'), null);
});

test('store(): a forged response containing a key is REFUSED (negative test — must not land on disk)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cache-sec-'));
  const cache = new RetrievalCache({ rootDir: dir });
  cache.store(envelope('{"note": "leaked", "key": "sk-' + 'k'.repeat(30) + '"}'));
  assert.deepEqual(readdirSync(dir), [], 'no cache file may be written for secret-shaped responses');
  rmSync(dir, { recursive: true, force: true });
});

test('store(): clean responses still persist (guard did not over-block)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cache-sec-'));
  const cache = new RetrievalCache({ rootDir: dir });
  cache.store(envelope('{"title": "A correlated study"}'));
  const files = readdirSync(dir);
  assert.equal(files.length, 1, 'clean envelope must be stored exactly once');
  const hit = cache.lookup('https://api.example.com/works?filter=x');
  assert.notEqual(hit, null);
  assert.equal(hit?.body, '{"title": "A correlated study"}');
  rmSync(dir, { recursive: true, force: true });
});

test('store(): refusal is silent-failure-safe (no throw, cache stays usable)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cache-sec-'));
  const cache = new RetrievalCache({ rootDir: dir });
  cache.store(envelope('sk-' + 'z'.repeat(25) + ' in header echo'));
  cache.store(envelope('{"ok": true}'));
  assert.equal(readdirSync(dir).length, 1, 'only the clean store landed');
  rmSync(dir, { recursive: true, force: true });
});
