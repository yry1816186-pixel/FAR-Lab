// tests/security/csp_theme_script.test.ts
// CSP 硬化契约测试（v3.0 指令 Phase 5.3「禁止 unsafe-inline」）。
//
// 判别力：
//   1. 漂移锁——frontend/index.html 内联主题脚本的 sha256 必须等于 server.ts 配置值
//      （脚本任何改动而不同步哈希 = CSP 白名单失效 = 主题脚本被浏览器阻断，测试即红）；
//   2. 响应头实证——buildServer 真实实例 inject，CSP 头含哈希且 script-src 无 'unsafe-inline'；
//   3. 安全指令齐备——object-src 'none' / frame-ancestors 'none' / base-uri 'self'。

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import Database from 'better-sqlite3';

import { buildServer } from '../../src/api/server.ts';

const EXPECTED_SHA256 = 'S6iXa2DU3NQROxhxq7llLxEtkqu4zIVz0jlpkvr7/9A=';

function inlineThemeScript(html: string): string {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  const body = m?.[1];
  assert.ok(typeof body === 'string' && body.includes('far-theme'), 'index.html 内联主题脚本未找到（结构变更=重新评审 CSP）');
  // CSP 哈希口径：HTML 解析器将脚本文本 CRLF→LF 规范化（浏览器轴实证：
  // 按原始 CRLF 计算的哈希会被浏览器拒绝——必须按解析器口径规范化）。
  return body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

test('CSP 漂移锁: 内联主题脚本 sha256 与 server.ts 白名单一致', () => {
  const src = readFileSync('frontend/index.html', 'utf8');
  const hash = createHash('sha256').update(inlineThemeScript(src), 'utf8').digest('base64');
  assert.equal(
    hash,
    EXPECTED_SHA256,
    '主题脚本已变更——必须同步更新 server.ts THEME_INLINE_SCRIPT_SHA256，否则 CSP 将阻断主题初始化',
  );
});

test('CSP 响应头: script-src 含 sha256 白名单且无 unsafe-inline（指令红线）', async (t) => {
  const db = new Database(':memory:');
  const app = await buildServer({ db, jwtSecret: null, gitCommitSha: 'a'.repeat(40), logger: false, webRoot: false });
  t.after(async () => {
    await app.close();
    db.close();
  });
  const res = await app.inject({ method: 'GET', url: '/health' });
  const csp = res.headers['content-security-policy'];
  assert.ok(typeof csp === 'string', 'CSP 头缺失');
  assert.ok(csp.includes(`'sha256-${EXPECTED_SHA256}'`), 'script-src 缺主题脚本哈希');
  const scriptSrc = /script-src([^;]*)/.exec(csp)?.[1] ?? '';
  assert.ok(!scriptSrc.includes("'unsafe-inline'"), `script-src 仍含 unsafe-inline: ${scriptSrc}`);
  assert.ok(csp.includes("object-src 'none'"), 'object-src 缺失');
  assert.ok(csp.includes("frame-ancestors 'none'"), 'frame-ancestors 缺失（点击劫持防线）');
  assert.ok(csp.includes("base-uri 'self'"), 'base-uri 缺失');
  assert.ok(csp.includes("connect-src 'self'"), 'connect-src 必须仅 self（API/SSE 同源）');
});
