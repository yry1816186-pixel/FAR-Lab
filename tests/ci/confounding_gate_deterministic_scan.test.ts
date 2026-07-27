import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 元测试：驱动 scripts/confounding_gate_deterministic_scan.mjs（ci-cg·03 §7.5.1:1133 CG-1/2/5/6 grep gate）。
// 权威: 03_EVIDENCE_CONTRACT_AND_VERDICT.md §7.5.1:1133（CG-1/2/5/6）+ §7.5:980（F6 红线）。
// 正向：干净 src/confounding_gate → exit 0 + LANDED 3（CG-2 assertAcyclic + CG-6 generateRationale + adjudicateConfounding 编排器）。
// 反向：用 CI_CG_NEGATIVE_ROOTS env 指向 mkdtemp 隔离目录（含 forbidden pattern）→ exit 1（F6 硬门）。
//   隔离理由：避免注入/删除 src/confounding_gate 临时文件造成 walk↔readFile 竞态（同 ci-at 元测试纪律）。
// 零容忍合规：无 :any / @ts-ignore / 双重断言 / 空 catch / 桩返回。

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const scanScript = join(repoRoot, 'scripts', 'confounding_gate_deterministic_scan.mjs');

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

test('ci-cg: clean src/confounding_gate → exit 0 + LANDED 3 marker report', async () => {
  const result = await runScan();
  assert.equal(
    result.code,
    0,
    `expected exit 0 but got ${result.code}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  // F6 硬门：src/confounding_gate 无 forbidden pattern
  assert.match(result.stdout, /no forbidden patterns in src\/confounding_gate/);
  // CG-2 acyclic + CG-6 rationale + adjudicateConfounding 编排器在位
  assert.match(result.stdout, /LANDED:\s+3 marker/);
  assert.match(result.stdout, /cg2_acyclic_check/);
  assert.match(result.stdout, /cg6_rationale_template/);
  assert.match(result.stdout, /cg_orchestrator/);
  assert.match(result.stdout, /ci-cg: ok/);
});

test('ci-cg: LLM-client-usage (openai import) → exit 1 (F6 CG-1 hard gate)', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'cicg-neg-'));
  try {
    writeFileSync(
      join(tmpDir, 'bad.ts'),
      "import OpenAI from 'openai';\nexport const client = new OpenAI();\n",
      'utf8',
    );
    const result = await runScan({ ...process.env, CI_CG_NEGATIVE_ROOTS: tmpDir });
    assert.notEqual(
      result.code,
      0,
      `expected non-zero exit but got 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
    assert.match(result.stderr, /openai_import|forbidden pattern/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ci-cg: chat.completions in code → exit 1（注释里的 dashscope 被 stripLineComment 剥离·不误报）', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'cicg-neg-'));
  try {
    // 注释里的 dashscope 应被 stripLineComment 剥离（不命中）；代码里的 chat.completions 命中。
    writeFileSync(
      join(tmpDir, 'mixed.ts'),
      "// 注释：无 dashscope 字面量（F6 合规声明·应被剥离）\nexport const r = await client.chat.completions.create({});\n",
      'utf8',
    );
    const result = await runScan({ ...process.env, CI_CG_NEGATIVE_ROOTS: tmpDir });
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

test('ci-cg: CG-5 generateConfounders 标识符 → exit 1（F6 CG-5 禁标识符硬门）', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'cicg-neg-'));
  try {
    // CG-5 禁 generateConfounders（LLM 生成混淆子·违反 F6 确定性）。
    writeFileSync(
      join(tmpDir, 'forbidden.ts'),
      'export function generateConfounders(claim: string) { return llm.generate(claim); }\n',
      'utf8',
    );
    const result = await runScan({ ...process.env, CI_CG_NEGATIVE_ROOTS: tmpDir });
    assert.notEqual(
      result.code,
      0,
      `expected non-zero exit but got 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
    assert.match(result.stderr, /generate_confounders/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
