import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 元测试：驱动 scripts/zero_tolerance_scan.mjs。
// 本文件被 zero_tolerance_scan.mjs 的 skippedFiles 跳过（按设计含反模式字符串以驱动扫描器）。
// 正向：干净仓库 → exit 0；反向：临时坏文件含 :any / extra_body / 空 catch → exit 1。

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const scanScript = join(repoRoot, 'scripts', 'zero_tolerance_scan.mjs');
const tempBadFile = join(here, '_zero_tol_negative_temp.ts');
// F4 overclaim 扫描只 walk src/，故临时坏文件注入 src/（finally 中清理）。
const tempF4OverclaimFile = join(repoRoot, 'src', '_f4_overclaim_temp.ts');

interface ScanResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runScan(): Promise<ScanResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scanScript], { cwd: repoRoot });
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
  const result = await runScan();
  assert.equal(
    result.code,
    0,
    `expected exit 0 but got ${result.code}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
});

test('zero_tolerance_scan exits 1 when a forbidden pattern is present (negative)', async () => {
  // 构造含 : any / extra_body / 空 catch 的临时坏文件（落在 tests/ci/ 下，扫描器会扫到）
  const badContent =
    'const x: any = 1;\n' +
    'const opts = { extra_body: {} };\n' +
    'try { foo(); } catch (e) {}\n';
  writeFileSync(tempBadFile, badContent, 'utf8');
  try {
    const result = await runScan();
    assert.notEqual(
      result.code,
      0,
      `expected non-zero exit but got 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
    assert.match(result.stderr, /ts_any|extra_body|empty_catch/);
  } finally {
    rmSync(tempBadFile, { force: true });
  }
});

test('F4 honesty boundary scan catches process-level isolation overclaim (negative)', async () => {
  // F4 规定 V1 严禁声称进程级隔离。注入过度声称字面量到 src/（非注释位置），扫描器须捕获。
  const overclaimContent =
    "export const CLAIM = 'this sandbox provides strong isolation';\n";
  writeFileSync(tempF4OverclaimFile, overclaimContent, 'utf8');
  try {
    const result = await runScan();
    assert.notEqual(
      result.code,
      0,
      `expected non-zero exit but got 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
    assert.match(result.stderr, /f4_overclaim_strong_isolation/);
  } finally {
    rmSync(tempF4OverclaimFile, { force: true });
  }
});
