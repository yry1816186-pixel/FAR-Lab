// src/cli/commands/doctor.ts
// far doctor —— 环境自诊断。
//
// 红线（OPEN_SOURCE_RELEASE_PLAN §15）：
//   · 默认零网络、零 API、零密钥读取（只检查 DASHSCOPE_API_KEY 是否**已设置且非空**，不读取其值）。
//   · provider key 缺失只 WARN，绝不 FAIL（offline demo 不依赖它）。
//   · --live-qwen-smoke 显式才调真实 API（复用 ci/competition_qwen_smoke.ts，自带无 key graceful skip）。
// 退出码：0 全绿 / 1 有 FAIL（核心能力损坏）/ 2 仅 WARN（可用但受限）。

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { PACKAGE_ROOT } from '../paths.ts';
import { runVerify } from './verify.ts';

export interface DoctorOptions {
  readonly liveQwenSmoke: boolean;
}

type CheckStatus = 'ok' | 'warn' | 'fail' | 'info';

interface Check {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

function resolveRepoRoot(): string | null {
  const envRoot = process.env.FAR_ROOT;
  if (envRoot && existsSync(resolve(envRoot, 'package.json'))) {
    return envRoot;
  }
  // PACKAGE_ROOT resolves to the package root in bundle mode and the repo root in source mode,
  // so the shipped assets (examples/schema/golden_vectors) are found in both.
  return existsSync(resolve(PACKAGE_ROOT, 'package.json')) ? PACKAGE_ROOT : null;
}

function probeBin(bin: string, args: readonly string[]): string | null {
  try {
    const r = spawnSync(bin, args, { encoding: 'utf8', shell: process.platform === 'win32' });
    if (r.status === 0 && r.stdout) {
      return r.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

function nodeMajor(): number {
  const v = process.versions.node;
  return Number.parseInt(v.split('.')[0] ?? '0', 10);
}

function checkEnv(checks: Check[]): void {
  const shell = process.env.SHELL ?? process.env.ComSpec ?? '(default)';
  checks.push({
    name: 'OS / shell / arch',
    status: 'info',
    detail: `${process.platform} · ${process.arch} · ${shell}`,
  });

  const major = nodeMajor();
  checks.push({
    name: 'Node.js',
    status: major >= 24 ? 'ok' : 'fail',
    detail: `v${process.versions.node} (type-stripping needs >=24; ${major >= 24 ? 'satisfied' : 'not satisfied, far cannot run .ts'})`,
  });

  const pnpm = probeBin('pnpm', ['--version']);
  checks.push({
    name: 'pnpm',
    status: pnpm ? 'ok' : 'warn',
    detail: pnpm ? `v${pnpm}` : 'not found (fix: corepack enable / npm i -g pnpm)',
  });

  const py = probeBin('python3', ['--version']) ?? probeBin('python', ['--version']);
  checks.push({
    name: 'Python',
    status: py ? 'ok' : 'warn',
    detail: py ?? 'not found (offline demo does not need it; the SymPy/Z3 research axis will skip)',
  });

  const git = probeBin('git', ['--version']);
  checks.push({
    name: 'git',
    status: git ? 'ok' : 'warn',
    detail: git ?? 'not found',
  });

  const docker = probeBin('docker', ['--version']);
  checks.push({
    name: 'Docker',
    status: docker ? 'info' : 'info',
    detail: docker ?? 'not installed (optional; needed for docker compose up)',
  });
}

function checkProject(root: string | null, checks: Check[]): void {
  if (root === null) {
    checks.push({
      name: 'project root location',
      status: 'warn',
      detail: 'package root not found (set FAR_ROOT or run inside the package/repo); project checks skipped',
    });
    return;
  }
  checks.push({ name: 'project root', status: 'ok', detail: root });

  let depsOk: boolean;
  try {
    createRequire(import.meta.url).resolve('better-sqlite3');
    depsOk = true;
  } catch {
    depsOk = false;
  }
  checks.push({
    name: 'Node dependencies',
    status: depsOk ? 'ok' : 'fail',
    detail: depsOk ? 'dependencies installed (better-sqlite3 resolvable)' : 'better-sqlite3 not resolvable → run npm install',
  });

  const pyDeps = probeBin('python3', ['-c', 'import sympy, z3; print("ok")'])
    ?? probeBin('python', ['-c', 'import sympy, z3; print("ok")']);
  checks.push({
    name: 'Python research dependencies',
    status: pyDeps ? 'ok' : 'warn',
    detail: pyDeps ? 'sympy + z3 importable' : 'sympy/z3 missing → run pip install -e . (research axis skips, non-blocking)',
  });

  const examplesOk = existsSync(resolve(root, 'examples/tess-offline'));
  checks.push({
    name: 'examples/tess-offline',
    status: examplesOk ? 'ok' : 'warn',
    detail: examplesOk ? 'present' : 'missing (far demo tess-offline can generate persisted artifacts)',
  });

  const schemaOk = existsSync(resolve(root, 'schema/migrations'));
  checks.push({
    name: 'schema/migrations',
    status: schemaOk ? 'ok' : 'warn',
    detail: schemaOk ? 'present' : 'missing',
  });
}

async function checkCoreCapability(root: string | null, checks: Check[]): Promise<void> {
  try {
    await import('better-sqlite3');
  } catch (e) {
    checks.push({
      name: 'core native module',
      status: 'fail',
      detail: `better-sqlite3 failed to load: ${e instanceof Error ? e.message : String(e)}`,
    });
    return;
  }
  checks.push({ name: 'core native module', status: 'ok', detail: 'better-sqlite3 loads' });

  if (root === null) {
    return;
  }
  const fixture = resolve(root, 'examples/tess-offline/output/demo.far-proof');
  if (!existsSync(fixture)) {
    checks.push({
      name: 'offline verify (demo fixture)',
      status: 'warn',
      detail: `fixture not found: ${fixture} (run "far demo tess-offline" to generate it, then re-check)`,
    });
    return;
  }
  const exit = runVerify({ bundlePath: fixture, mode: 'full', json: false, explain: false });
  checks.push({
    name: 'offline verify (demo fixture)',
    status: exit === 0 ? 'ok' : 'fail',
    detail: exit === 0 ? `far verify --bundle passed: ${fixture}` : `verify failed exit ${exit} (core capability broken)`,
  });
}

function checkProviderKey(checks: Check[]): void {
  const hasKey = Boolean(process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_API_KEY.length > 0);
  checks.push({
    name: 'DASHSCOPE_API_KEY',
    status: hasKey ? 'ok' : 'warn',
    detail: hasKey ? 'set (presence only; value not read)' : 'not set (offline demo does not need it; real Qwen/DashScope inference requires it)',
  });
}

function checkLiveQwenSmoke(root: string | null, checks: Check[]): void {
  if (root === null) {
    checks.push({ name: '--live-qwen-smoke', status: 'warn', detail: 'must run inside the repo (to locate ci/competition_qwen_smoke.ts)' });
    return;
  }
  const script = resolve(root, 'ci/competition_qwen_smoke.ts');
  if (!existsSync(script)) {
    checks.push({ name: '--live-qwen-smoke', status: 'warn', detail: `${script} not found (NEEDS_API_VALIDATION)` });
    return;
  }
  if (!process.env.DASHSCOPE_API_KEY) {
    checks.push({ name: '--live-qwen-smoke', status: 'fail', detail: 'needs DASHSCOPE_API_KEY (real billable call · NEEDS_API_VALIDATION)' });
    return;
  }
  const r = spawnSync(process.execPath, [script], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
  checks.push({
    name: '--live-qwen-smoke',
    status: r.status === 0 ? 'ok' : 'fail',
    detail: `ci/competition_qwen_smoke.ts exit ${r.status ?? 'null'} (NEEDS_API_VALIDATION · real billable call)`,
  });
}

const SYMBOL: Readonly<Record<CheckStatus, string>> = {
  ok: '✓',
  warn: '!',
  fail: '✗',
  info: '·',
};

export async function runDoctor(opts: DoctorOptions): Promise<number> {
  const root = resolveRepoRoot();
  const checks: Check[] = [];

  checkEnv(checks);
  checkProject(root, checks);
  await checkCoreCapability(root, checks);
  checkProviderKey(checks);
  if (opts.liveQwenSmoke) {
    checkLiveQwenSmoke(root, checks);
  }

  process.stdout.write('\n  FAR-Chain · far doctor (environment self-check)\n');
  process.stdout.write('  ─────────────────────────────────────────────────\n');
  for (const c of checks) {
    process.stdout.write(`  ${SYMBOL[c.status]} [${c.status.toUpperCase().padEnd(4)}] ${c.name}\n`);
    process.stdout.write(`          ${c.detail}\n`);
  }
  process.stdout.write('  ─────────────────────────────────────────────────\n');

  const hasFail = checks.some((c) => c.status === 'fail');
  const hasWarn = checks.some((c) => c.status === 'warn');
  if (hasFail) {
    process.stdout.write('  result: FAIL present (core capability impaired) — fix the details above and rerun far doctor\n\n');
    return 1;
  }
  if (hasWarn) {
    process.stdout.write('  result: WARN only (offline demo usable, some capabilities limited) — no API key does not affect far demo\n\n');
    return 2;
  }
  process.stdout.write('  result: all green. Next: far demo tess-offline\n\n');
  return 0;
}
