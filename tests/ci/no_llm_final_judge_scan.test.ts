import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 元测试：驱动 scripts/no_llm_final_judge_scan.mjs（ci-04）。
// 权威: 23 §6.6.2 + 11 §7.2 + 02 F3 + AT-04 审计裁决（severity=minor，2026-06-29）。
// 正向：干净 src → exit 0 + 诚实报告 LANDED 4 + V2-PENDING 2（绝不默认声称 spec 5 标记点全满足）。
// 反向：用 CI04_NEGATIVE_ROOTS env 指向 mkdtemp 隔离目录（含 LLM-as-judge）→ exit 1（反 theater F1 硬门）。
//   隔离理由：避免与 zero_tolerance_scan.test.ts 并发注入/删除 src/ 临时文件造成 walk↔readFile 竞态。
// 零容忍合规：无 :any / @ts-ignore / 双重断言 / 空 catch / 桩返回。

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const scanScript = join(repoRoot, 'scripts', 'no_llm_final_judge_scan.mjs');

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

test('ci-04: clean src → exit 0 + honest LANDED/V2-PENDING report (AT-04 non-default-satisfaction)', async () => {
  const result = await runScan();
  assert.equal(
    result.code,
    0,
    `expected exit 0 but got ${result.code}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  // 反 theater 硬门：src 无 LLM-as-judge
  assert.match(result.stdout, /no LLM-as-judge patterns in src/);
  // AT-04 诚实标注：4 deterministic 标记字面量落地（compiledBy/compiled_by + sealedBy/sealed_by）
  assert.match(result.stdout, /LANDED:\s+4 marker literal/);
  // AT-04 诚实标注：2 V2-pending（spec 0020 verdict_protocols，非默认满足 spec 5 标记点）
  assert.match(result.stdout, /V2-PENDING:\s+2/);
  assert.match(result.stdout, /deterministic_arbiter/);
  assert.match(result.stdout, /computed_by/);
  // ci-04 F6/F12 红线覆盖边界诚实声明（#12 · 23 §6.6.5 D2-06/D2-08·W1 字段未落地·V2 scope）
  assert.match(result.stdout, /F6 因果降级/);
  assert.match(result.stdout, /F12 UqGrade⊥Verdict/);
  assert.match(result.stdout, /不在 ci-04 扫描范围/);
  assert.match(result.stdout, /ci-04: ok/);
});

test('ci-04: LLM-as-judge → exit 1 (anti-theater F1 hard gate, non-empty)', async () => {
  // 用 CI04_NEGATIVE_ROOTS env 指向 mkdtemp 隔离目录，证明 negative 硬门非空门，且不污染 src/。
  const tmpDir = mkdtempSync(join(tmpdir(), 'ci04-neg-'));
  try {
    writeFileSync(
      join(tmpDir, 'bad.ts'),
      'export function decide() { return llmAsJudge(prompt); }\n',
      'utf8',
    );
    const result = await runScan({ ...process.env, CI04_NEGATIVE_ROOTS: tmpDir });
    assert.notEqual(
      result.code,
      0,
      `expected non-zero exit but got 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
    assert.match(result.stderr, /llm_as_judge|LLM-as-judge/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
