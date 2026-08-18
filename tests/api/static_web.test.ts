// tests/api/static_web.test.ts —— far api 静态托管（frontend/dist 单进程产品形态）判别测试。
//
// 覆盖验收面：
//   ① 挂载语义：dist/index.html 在盘才挂；缺失/显式 false 时行为与挂载前完全一致（404 JSON）
//   ② 路由优先：已注册 API/探针路由永不被静态面遮蔽
//   ③ SPA 回退：无扩展名路径 → index.html；带扩展名缺失资源 → 真实 404
//   ④ API 契约：/api/* 未命中仍返回 Fastify 默认 404 JSON 形状（绝不回退 HTML）
//   ⑤ 对抗路径：../ 逃逸、%2e%2e、%00、未知扩展名、非 GET 方法 —— 一律 404 JSON
//   ⑥ 头语义：MIME 白名单正确；assets immutable / html no-cache；HEAD 有头无体
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runMigrations } from '../../src/db/index.ts';
import { buildServer } from '../../src/api/server.ts';
import { defaultWebDistRoot } from '../../src/api/static_web.ts';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}

const INDEX_HTML = '<!doctype html><html><head><title>far-lab-test</title></head><body><div id="root">FIXTURE-SHELL</div></body></html>';
const APP_JS = 'console.log("fixture-asset");\n';
const VERIFY_HTML = '<!doctype html><html><body>standalone verify fixture</body></html>';

function makeDistFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'far-static-web-'));
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), INDEX_HTML);
  writeFileSync(join(dir, 'verify.html'), VERIFY_HTML);
  writeFileSync(join(dir, 'assets', 'app-BEEF01.js'), APP_JS);
  writeFileSync(join(dir, 'payload.exe'), 'MZ-not-served');
  return dir;
}

async function makeApp(webRoot: string | false | undefined) {
  return buildServer({
    db: makeDb(),
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
    ...(webRoot === undefined ? {} : { webRoot }),
  });
}

test('static web: / serves index.html with no-cache; /assets serves immutable JS with correct MIME', async () => {
  const dist = makeDistFixture();
  const app = await makeApp(dist);
  try {
    const root = await app.inject({ method: 'GET', url: '/' });
    assert.equal(root.statusCode, 200);
    assert.match(root.headers['content-type'] ?? '', /text\/html/);
    assert.match(root.body, /FIXTURE-SHELL/);
    assert.equal(root.headers['cache-control'], 'no-cache');

    const asset = await app.inject({ method: 'GET', url: '/assets/app-BEEF01.js' });
    assert.equal(asset.statusCode, 200);
    assert.match(asset.headers['content-type'] ?? '', /text\/javascript/);
    assert.equal(asset.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(asset.body, APP_JS);
  } finally {
    await app.close();
    rmSync(dist, { recursive: true, force: true });
  }
});

test('static web: extension-less SPA deep links fall back to index.html', async () => {
  const dist = makeDistFixture();
  const app = await makeApp(dist);
  try {
    for (const url of ['/missions', '/missions/01ABC123/deep?x=1', '/assay', '/receipts/some-id']) {
      const res = await app.inject({ method: 'GET', url });
      assert.equal(res.statusCode, 200, url);
      assert.match(res.body, /FIXTURE-SHELL/, url);
      assert.match(res.headers['content-type'] ?? '', /text\/html/, url);
    }
    const standalone = await app.inject({ method: 'GET', url: '/verify.html' });
    assert.equal(standalone.statusCode, 200);
    assert.match(standalone.body, /standalone verify fixture/);
  } finally {
    await app.close();
    rmSync(dist, { recursive: true, force: true });
  }
});

test('static web: registered API routes keep precedence over the static fallback', async () => {
  const dist = makeDistFixture();
  const app = await makeApp(dist);
  try {
    const health = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(health.statusCode, 200);
    assert.match(health.headers['content-type'] ?? '', /application\/json/);

    const llm = await app.inject({ method: 'GET', url: '/api/v1/llm-status' });
    assert.equal(llm.statusCode, 200);
    assert.match(llm.headers['content-type'] ?? '', /application\/json/);
    assert.equal(JSON.parse(llm.body).data.keyConfigured, false);
  } finally {
    await app.close();
    rmSync(dist, { recursive: true, force: true });
  }
});

test('static web: /api/* misses keep the JSON 404 contract — never HTML fallback', async () => {
  const dist = makeDistFixture();
  const app = await makeApp(dist);
  try {
    for (const url of ['/api/v1/definitely-not-a-route', '/api/v2/nope', '/api']) {
      const res = await app.inject({ method: 'GET', url });
      assert.equal(res.statusCode, 404, url);
      assert.match(res.headers['content-type'] ?? '', /application\/json/, url);
      const body = JSON.parse(res.body);
      assert.equal(body.statusCode, 404, url);
      assert.equal(body.error, 'Not Found', url);
      assert.ok(typeof body.message === 'string' && body.message.includes('not found'), url);
      assert.doesNotMatch(res.body, /FIXTURE-SHELL/, url);
    }
  } finally {
    await app.close();
    rmSync(dist, { recursive: true, force: true });
  }
});

test('static web: missing assets / unknown extensions / non-GET methods are honest 404s', async () => {
  const dist = makeDistFixture();
  const app = await makeApp(dist);
  try {
    const missing = await app.inject({ method: 'GET', url: '/assets/missing.js' });
    assert.equal(missing.statusCode, 404);
    assert.match(missing.headers['content-type'] ?? '', /application\/json/);

    const exe = await app.inject({ method: 'GET', url: '/payload.exe' });
    assert.equal(exe.statusCode, 404);

    const post = await app.inject({ method: 'POST', url: '/missions', payload: {} });
    assert.equal(post.statusCode, 404);
    assert.match(post.headers['content-type'] ?? '', /application\/json/);
  } finally {
    await app.close();
    rmSync(dist, { recursive: true, force: true });
  }
});

test('static web: path traversal and malformed encodings cannot escape the dist root', async () => {
  const dist = makeDistFixture();
  const app = await makeApp(dist);
  try {
    const attempts = [
      '/assets/../../package.json',
      '/../../../AGENTS.md',
      '/%2e%2e%2fpackage.json',
      '/..%2f..%2fpackage.json',
      '/%00',
      '/assets/%2e%2e/%2e%2e/src/api/server.ts',
    ];
    for (const url of attempts) {
      const res = await app.inject({ method: 'GET', url });
      assert.equal(res.statusCode, 404, url);
      assert.doesNotMatch(res.body, /FIXTURE-SHELL|far-lab|"name"/, url);
    }
  } finally {
    await app.close();
    rmSync(dist, { recursive: true, force: true });
  }
});

test('static web: HEAD serves headers without a body', async () => {
  const dist = makeDistFixture();
  const app = await makeApp(dist);
  try {
    const res = await app.inject({ method: 'HEAD', url: '/' });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'] ?? '', /text\/html/);
    assert.equal(Number(res.headers['content-length']), Buffer.byteLength(INDEX_HTML));
    assert.equal(res.body, '');
  } finally {
    await app.close();
    rmSync(dist, { recursive: true, force: true });
  }
});

test('static web: missing dist keeps API-only behavior (no fake shell); explicit false disables even a real dist', async () => {
  const gone = join(tmpdir(), 'far-static-web-definitely-absent-dir');
  const appNoDist = await makeApp(gone);
  try {
    const res = await appNoDist.inject({ method: 'GET', url: '/' });
    assert.equal(res.statusCode, 404);
    assert.match(res.headers['content-type'] ?? '', /application\/json/);
    const verdict = await appNoDist.inject({ method: 'GET', url: '/api/v1/verdict?limit=1' });
    assert.equal(verdict.statusCode, 200);
  } finally {
    await appNoDist.close();
  }

  const dist = makeDistFixture();
  const appDisabled = await makeApp(false);
  try {
    const res = await appDisabled.inject({ method: 'GET', url: '/' });
    assert.equal(res.statusCode, 404);
    assert.match(res.headers['content-type'] ?? '', /application\/json/);
  } finally {
    await appDisabled.close();
    rmSync(dist, { recursive: true, force: true });
  }
});

test('static web: defaultWebDistRoot resolves to <repo>/frontend/dist', () => {
  const p = defaultWebDistRoot();
  assert.match(p, /frontend[/\\]dist$/);
});
