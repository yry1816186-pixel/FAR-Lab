import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 元测试：驱动 scripts/anti_theater_deterministic_scan.mjs（ci-at·APPENDIX_E §6 第 2 grep gate）。
// 权威: APPENDIX_E_ANTI_THEATER.md §6 + §1 + 02 F3。
// 正向：干净 src/anti_theater → exit 0 + 报告 LANDED 2（deterministic 自声明 + runAntiTheaterLint 编排器）。
// 反向：用 CI_AT_NEGATIVE_ROOTS env 指向 mkdtemp 隔离目录（含 LLM-client-usage）→ exit 1（反 theater F3 硬门）。
//   隔离理由：避免注入/删除 src/anti_theater 临时文件造成 walk↔readFile 竞态（同 ci-04 元测试纪律）。
// 零容忍合规：无 :any / @ts-ignore / 双重断言 / 空 catch / 桩返回。

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const scanScript = join(repoRoot, 'scripts', 'anti_theater_deterministic_scan.mjs');

interface ScanResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runScan(env?: NodeJS.ProcessEnv): Promise<ScanResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scanScript], {
      cwd: repoRoot,
      env: env ?? process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      resolve({ code: -1, stdout, stderr: `${stderr}\n${err.message}` });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

test('ci-at: clean src/anti_theater → exit 0 + LANDED 2 marker report', async () => {
  const result = await runScan();
  assert.equal(
    result.code,
    0,
    `expected exit 0 but got ${result.code}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  // 反 theater F3 硬门：src/anti_theater 无 LLM-client-usage
  assert.match(result.stdout, /no LLM-client-usage patterns in src\/anti_theater/);
  // deterministic 自声明 + runAntiTheaterLint 编排器在位
  assert.match(result.stdout, /LANDED:\s+2 marker/);
  assert.match(result.stdout, /deterministic_self_decl/);
  assert.match(result.stdout, /orchestrator_export/);
  assert.match(result.stdout, /ci-at: ok/);
});

test('ci-at: LLM-client-usage (openai import) → exit 1 (anti-theater F3 hard gate)', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ciat-neg-'));
  try {
    writeFileSync(
      join(tmpDir, 'bad.ts'),
      "import OpenAI from 'openai';\nexport const client = new OpenAI();\n",
      'utf8',
    );
    const result = await runScan({ ...process.env, CI_AT_NEGATIVE_ROOTS: tmpDir });
    assert.notEqual(
      result.code,
      0,
      `expected non-zero exit but got 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
    assert.match(result.stderr, /openai_import|LLM-client-usage/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ci-at: LLM-client-usage (chat.completions) → exit 1（注释里的 dashscope 不误报·代码里的 chat.completions 命中）', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ciat-neg-'));
  try {
    // 注释里的 dashscope 应被 stripLineComment 剥离（不命中）；代码里的 chat.completions 命中。
    writeFileSync(
      join(tmpDir, 'mixed.ts'),
      "// 注释：无 dashscope 字面量（合规声明·应被剥离）\nexport const r = await client.chat.completions.create({});\n",
      'utf8',
    );
    const result = await runScan({ ...process.env, CI_AT_NEGATIVE_ROOTS: tmpDir });
    assert.notEqual(
      result.code,
      0,
      `expected non-zero exit but got 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
    assert.match(result.stderr, /chat_completions/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
