import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 元测试：驱动 scripts/zero_tolerance_scan.mjs。
// 本文件被 zero_tolerance_scan.mjs 的 skippedFiles 跳过（按设计含反模式字符串以驱动扫描器）。
// 正向：干净仓库 → exit 0；反向：临时坏文件含 :any / extra_body / 空 catch → exit 1。

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const scanScript = join(repoRoot, 'scripts', 'zero_tolerance_scan.mjs');
// 负样本临时文件全部用 mkdtemp 隔离目录（tmpdir，仓库外）：
//   - 主扫描段经 CI_ZT_NEGATIVE_ROOTS 指向隔离目录（不再向仓库 tests/ 注入坏文件）
//   - F4 段经 CI_ZT_F4_ROOTS 指向隔离目录（不再向 src/ 注入）
// 避免与其他并发 walk 扫描（no_llm_final_judge_scan / anti_theater_deterministic_scan）
// 产生 walk↔readFile 竞态（对齐 CI04_NEGATIVE_ROOTS 既有模式）。
// 注意：每个负样本测试独立 mkdtemp（F4 测试 finally 删除目录后，共享目录会令
// 后续测试 ENOENT）——故用 makeIsolatedRoot() 每测试创建。
function makeIsolatedRoot(): { dir: string; badFile: string } {
  const dir = mkdtempSync(join(tmpdir(), 'zt-neg-'));
  return { dir, badFile: join(dir, '_zero_tol_negative_temp.ts') };
}

interface ScanResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runScan(extraEnv?: Record<string, string>): Promise<ScanResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scanScript], {
      cwd: repoRoot,
      env: { ...process.env, ...extraEnv },
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      resolve({ code: -1, stdout, stderr: `${stderr}\n${err.message}` });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

test('zero_tolerance_scan exits 0 on a clean tree (positive)', async () => {
  // 正向：扫真实仓库默认 roots（无 env）——必须 exit 0（仓库零反模式）
  const result = await runScan();
  assert.equal(
    result.code,
    0,
    `expected exit 0 but got ${result.code}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
});

test('zero_tolerance_scan exits 1 when a forbidden pattern is present (negative)', async () => {
  // 构造含 : any / extra_body / 空 catch 的临时坏文件（隔离目录，扫描器经 env 扫到）
  const root = makeIsolatedRoot();
  const badContent =
    'const x: any = 1;\n' +
    'const opts = { extra_body: {} };\n' +
    'try { foo(); } catch (e) {}\n';
  writeFileSync(root.badFile, badContent, 'utf8');
  try {
    const result = await runScan({ CI_ZT_NEGATIVE_ROOTS: root.dir });
    assert.notEqual(
      result.code,
      0,
      `expected non-zero exit but got 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
    assert.match(result.stderr, /ts_any|extra_body|empty_catch/);
  } finally {
    rmSync(root.dir, { recursive: true, force: true });
  }
});

test('F4 honesty boundary scan catches process-level isolation overclaim (negative)', async () => {
  // F4 规定 V1 严禁声称进程级隔离。注入过度声称字面量到隔离目录（mkdtemp），
  // 扫描器须捕获（CI_ZT_F4_ROOTS 指向隔离目录）。
  const root = makeIsolatedRoot();
  const overclaimContent =
    "export const CLAIM = 'this sandbox provides strong isolation';\n";
  writeFileSync(root.badFile, overclaimContent, 'utf8');
  try {
    const result = await runScan({ CI_ZT_F4_ROOTS: root.dir });
    assert.notEqual(
      result.code,
      0,
      `expected non-zero exit but got 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
    assert.match(result.stderr, /f4_overclaim_strong_isolation/);
  } finally {
    rmSync(root.dir, { recursive: true, force: true });
  }
});

// ── P0-2b（SA9 Critical 修复）回归载体 ──
// 背景（findings SA9）：zero_tolerance_scan 对 3 类真实反模式形态漏检——
//   (1) `// @ts-ignore` 指令型注释（本身是注释→stripLineComment 剥离→永不可命中）
//   (2) 注释 TODO/FIXME 债务标记（剥离后漏检）
//   (3) 多行空 catch（单行正则不跨行）
// 且全局段任一命中即 exit(1) 短路 api/dialogue/n3/f4 专项段（13 项扫描面被跳过）。
// 以下 4 个测试锁死修复契约：三类形态 100% 检出 + 分段汇总不短路。

test('SA9: directive-form // @ts-ignore comment is detected (was missed)', async () => {
  const root = makeIsolatedRoot();
  const badContent =
    '// @ts-ignore: suppress type error\n' +
    'const x = 1;\n';
  writeFileSync(root.badFile, badContent, 'utf8');
  try {
    const result = await runScan({ CI_ZT_NEGATIVE_ROOTS: root.dir });
    assert.notEqual(
      result.code,
      0,
      `directive @ts-ignore must be detected (SA9)\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
    assert.match(result.stderr, /ts_ignore/, 'stderr must name ts_ignore');
  } finally {
    rmSync(root.dir, { recursive: true, force: true });
  }
});

test('SA9: comment TODO marker is detected (was missed)', async () => {
  const root = makeIsolatedRoot();
  const badContent =
    'function f() {\n' +
    '  // TODO: this needs a real implementation\n' +
    '  return 1;\n' +
    '}\n';
  writeFileSync(root.badFile, badContent, 'utf8');
  try {
    const result = await runScan({ CI_ZT_NEGATIVE_ROOTS: root.dir });
    assert.notEqual(
      result.code,
      0,
      `comment TODO must be detected (SA9)\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
    assert.match(result.stderr, /todo_marker/, 'stderr must name todo_marker');
  } finally {
    rmSync(root.dir, { recursive: true, force: true });
  }
});

test('SA9: multi-line empty catch is detected (was missed)', async () => {
  const root = makeIsolatedRoot();
  const badContent =
    'try {\n' +
    '  foo();\n' +
    '} catch (e) {\n' +
    '}\n';
  writeFileSync(root.badFile, badContent, 'utf8');
  try {
    const result = await runScan({ CI_ZT_NEGATIVE_ROOTS: root.dir });
    assert.notEqual(
      result.code,
      0,
      `multi-line empty catch must be detected (SA9)\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
    assert.match(result.stderr, /empty_catch/, 'stderr must name empty_catch');
  } finally {
    rmSync(root.dir, { recursive: true, force: true });
  }
});

test('SA9: global-section hit does not short-circuit specialized sections (segmented summary)', async () => {
  // 全局段命中（ts_any）时，扫描器必须跑完全部 5 段并输出分段汇总（修复前 exit 短路）。
  const root = makeIsolatedRoot();
  const badContent = 'const x: any = 1;\n';
  writeFileSync(root.badFile, badContent, 'utf8');
  try {
    const result = await runScan({ CI_ZT_NEGATIVE_ROOTS: root.dir });
    assert.notEqual(
      result.code,
      0,
      `ts_any must still fail the scan\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
    assert.match(
      result.stderr,
      /scan sections|\[zero-tolerance\]|summary/,
      'stderr must carry the segmented summary header (no early exit)',
    );
  } finally {
    rmSync(root.dir, { recursive: true, force: true });
  }
});
