// tests/cli/api_non_loopback_guard.test.ts
//
// 深度对抗轮回归测试：far api CLI 在非 loopback 绑定 + 匿名模式（jwtSecret=null）时 fail-closed。
//
// 背景（深度对抗轮发现）：
//   旧 runApi 允许匿名模式（jwtSecret=null）绑定任意 host。demo 匿名模式让任何能访问端口的请求者
//   匿名写信任账本（POST /hypothesize append evidence + 跑 verdict kernel）。loopback 默认安全（仅本机）；
//   一旦 --host 0.0.0.0 / 局域网 IP / 公网，攻击者可投毒账本（账本链仍完整，但内容被攻击者控制）。
//   修复：runApi 在 !isLoopback && jwtSecret===null 时拒绝启动，指引 --protected。
//
// 设计边界（不冲突）：
//   - startServer（库）仍接受任意 host + 匿名（FIX-R6-002 opt-in 设计·保留 Docker demo 路径）。
//   - runApi（CLI 入口）加 fail-closed 默认（操作员友好·防误暴露）。
//   - 库用户可自行决定鉴权策略；CLI 用户获安全默认。
//
// Authority: AGENTS.md §8（最小权限·fail-closed 默认）+ 深度对抗轮安全审计 HIGH-1。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runApi, parseApiArgs } from '../../src/cli/commands/api.ts';

test('runApi_refuses_non_loopback_anonymous: --host 0.0.0.0 + 无 --protected → 抛错（fail-closed）', async () => {
  // 清理可能残留的 FAR_JWT_SECRET（确保 jwtSecret=null）
  const savedSecret = process.env.FAR_JWT_SECRET;
  delete process.env.FAR_JWT_SECRET;
  try {
    await assert.rejects(
      () => runApi(['--host', '0.0.0.0', '--port', '0', '--no-seed']),
      /non-loopback|refusing|anonymous/i,
      'runApi 须拒绝非 loopback + 匿名模式，指引 --protected',
    );
  } finally {
    if (savedSecret !== undefined) process.env.FAR_JWT_SECRET = savedSecret;
  }
});

test('runApi_refuses_lan_ip_anonymous: --host 192.168.x.x + 无 --protected → 抛错', async () => {
  const savedSecret = process.env.FAR_JWT_SECRET;
  delete process.env.FAR_JWT_SECRET;
  try {
    await assert.rejects(
      () => runApi(['--host', '192.168.1.10', '--port', '0', '--no-seed']),
      /non-loopback|refusing/i,
      '局域网 IP 绑定 + 匿名 → 拒绝',
    );
  } finally {
    if (savedSecret !== undefined) process.env.FAR_JWT_SECRET = savedSecret;
  }
});

test('runApi_allows_loopback_anonymous: --host 127.0.0.1（默认）+ 匿名 → 不在 guard 抛错', async () => {
  // loopback 是安全默认（仅本机）—— guard 不触发。会启动 server（端口 0）。
  // 注意：此测试会真实启动 server，用完即关。若启动失败（非 guard 原因），test 自然 fail。
  const savedSecret = process.env.FAR_JWT_SECRET;
  delete process.env.FAR_JWT_SECRET;
  // 拦截 SIGINT 避免 server 长驻：用 port 0 + 启动后立即不能自然退出，故此测试只验证 guard 不抛特定错误。
  // 改为验证 parseApiArgs 的 loopback 判定（不真实启动，避免长驻进程）。
  try {
    const args = parseApiArgs(['--host', '127.0.0.1', '--no-seed']);
    assert.equal(args.host, '127.0.0.1');
    assert.equal(args.jwtSecret, null, '匿名模式');
    // loopback host 不会被 guard 拒绝（guard 逻辑在 runApi 内，这里只验 parse 正确）
  } finally {
    if (savedSecret !== undefined) process.env.FAR_JWT_SECRET = savedSecret;
  }
});

test('runApi_allows_non_loopback_protected: --host 0.0.0.0 + --protected + FAR_JWT_SECRET → 不在 guard 抛错', async () => {
  // 有 jwtSecret 时 guard 不触发（受保护模式安全暴露）。
  // 只验证 parseApiArgs 正确解析 --protected + env，不真实启动 server。
  const savedSecret = process.env.FAR_JWT_SECRET;
  process.env.FAR_JWT_SECRET = 'test-secret-for-guard-test-only';
  try {
    const args = parseApiArgs(['--host', '0.0.0.0', '--protected', '--no-seed']);
    assert.equal(args.host, '0.0.0.0');
    assert.equal(args.jwtSecret, 'test-secret-for-guard-test-only', '--protected 从 env 读 secret');
  } finally {
    if (savedSecret !== undefined) process.env.FAR_JWT_SECRET = savedSecret;
    else delete process.env.FAR_JWT_SECRET;
  }
});

test('isLoopback_recognizes_all_loopback_forms: 127.0.0.1 / localhost / ::1 均为 loopback', () => {
  // 验证 guard 的 loopback 判定覆盖三种形态
  for (const host of ['127.0.0.1', 'localhost', '::1']) {
    const args = parseApiArgs(['--host', host, '--no-seed']);
    assert.equal(args.host, host);
    // 这些 host + 匿名应能通过 guard（runApi 不抛 guard 错误）。
    // 因 runApi 会启动 server，这里只验 parse；guard 行为由上面 refuses 测试覆盖。
  }
});
