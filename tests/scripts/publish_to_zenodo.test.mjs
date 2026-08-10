// publish_to_zenodo.test.mjs — DX3-01 验收：Zenodo DOI 发布脚本（graceful skip + 校验）。
//
// 契约：
//   1. --check 模式：仓库 .zenodo.json 必填字段齐全 → exit 0 + PASS 输出。
//   2. ZENODO_TOKEN 未设置 + --publish → graceful skip + exit 0（非错误）+ 指引。
//   3. .zenodo.json 缺必填字段 + --check → exit 1 + FAIL 输出。
//
// 诚实边界：本测试不发任何真实网络请求（用环境变量隔离 token）。
// 零容忍合规：无 any / @ts-ignore / 空 catch / 桩返回。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const script = join(repoRoot, 'scripts', 'publish_to_zenodo.mjs');

test('① --check 模式：仓库 .zenodo.json 必填字段齐全 → exit 0 + PASS', () => {
  // 显式清空 ZENODO_TOKEN，避免环境变量泄漏影响判定（--check 不应要求 token）。
  const env = { ...process.env, ZENODO_TOKEN: '' };
  const r = spawnSync(process.execPath, [script, '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
  });
  assert.equal(r.status, 0, `--check 应 exit 0，实际:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /--check/, '应显示模式标题');
  assert.match(r.stdout, /upload_type:\s+software/, '应识别 upload_type=software');
  assert.match(r.stdout, /license:\s+MIT/, '应识别 license=MIT');
  assert.match(r.stdout, /PASS.*必填字段齐全/, '应以 PASS 收尾');
  assert.match(r.stdout, /ZENODO_TOKEN:\s+\[MISSING/, '--check 应报告 token 状态');
});

test('② ZENODO_TOKEN 未设置 + --publish → graceful skip + exit 0 + 指引', () => {
  const env = { ...process.env, ZENODO_TOKEN: '' };
  const r = spawnSync(process.execPath, [script, '--publish'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
  });
  assert.equal(r.status, 0, `--publish 无 token 应 graceful skip exit 0，实际:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /SKIP.*ZENODO_TOKEN 未设置/, '应输出 SKIP 标识');
  assert.match(r.stdout, /graceful skip/i, '应说明 graceful skip 性质');
  // 指引：必须包含 token 创建 URL 与重跑命令
  assert.match(r.stdout, /zenodo\.org\/account\/settings\/applications\/tokens/, '指引须含 token 创建 URL');
  assert.match(r.stdout, /publish_to_zenodo\.mjs --publish/, '指引须含重跑命令');
  // 反 theater：不应声称发布成功
  assert.doesNotMatch(r.stdout, /zenodo_publish: SUCCESS/, '无 token 时不得输出 SUCCESS');
});

test('③ .zenodo.json 缺必填字段 + --check → exit 1 + FAIL + 缺失字段清单', () => {
  // 在 OS 临时目录构造缺字段的 .zenodo.json（仅 title，缺 upload_type/creators/license）
  const tmp = mkdtempSync(join(tmpdir(), 'far-zenodo-check-'));
  try {
    writeFileSync(
      join(tmp, '.zenodo.json'),
      JSON.stringify({ title: 'Incomplete Test Deposit' }),
    );
    const env = { ...process.env, ZENODO_TOKEN: '' };
    const r = spawnSync(process.execPath, [script, '--check'], {
      cwd: tmp,
      encoding: 'utf8',
      env,
    });
    assert.equal(r.status, 1, `缺字段应 exit 1，实际:\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /\[MISSING\]\s+upload_type/, '应报告 upload_type 缺失');
    assert.match(r.stdout, /\[MISSING\]\s+creators/, '应报告 creators 缺失');
    assert.match(r.stdout, /\[MISSING\]\s+license/, '应报告 license 缺失');
    assert.match(r.stderr, /FAIL.*必填字段/, 'stderr 应输出 FAIL 与缺失清单');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('④ 反 theater：源码不含硬编码 token / secret 字符串', () => {
  const src = readFileSync(script, 'utf8');
  // 禁止硬编码：典型 secret 模式（Bearer <常量>、pat-、sk-、AKIA、明文 token 字面量）
  assert.doesNotMatch(src, /Bearer\s+[A-Za-z0-9]{8,}/, '不得硬编码 Bearer <常量>');
  assert.doesNotMatch(src, /(?:pat-|sk-|AKIA)[A-Za-z0-9]{8,}/, '不得硬编码常见 secret 前缀');
  // 必须从 process.env 读 token（SSOT）
  assert.match(src, /process\.env\.ZENODO_TOKEN/, 'token 必须从 process.env 读取');
  // 必须支持 ZENODO_SANDBOX 环境变量
  assert.match(src, /process\.env\.ZENODO_SANDBOX/, '须支持 ZENODO_SANDBOX 环境变量');
});

test('⑤ ZENODO_SANDBOX=1 时切换到 sandbox 端点（不产真实 DOI）', () => {
  const env = { ...process.env, ZENODO_TOKEN: '', ZENODO_SANDBOX: '1' };
  const r = spawnSync(process.execPath, [script, '--publish'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
  });
  assert.equal(r.status, 0, 'sandbox + 无 token 仍应 graceful skip');
  assert.match(r.stdout, /sandbox\.zenodo\.org/, '应显示 sandbox 端点');
  assert.match(r.stdout, /sandbox\s*·\s*测试/, '应明确标注 sandbox 模式（测试·不产真实 DOI）');
});

test('⑥ 无参数调用 → exit 2（要求明确模式选择，防误触发发布）', () => {
  const r = spawnSync(process.execPath, [script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ZENODO_TOKEN: '' },
  });
  assert.equal(r.status, 2, `无参应 exit 2，实际:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /用法/, '应输出用法说明');
});
