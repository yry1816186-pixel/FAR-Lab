// src/cli/commands/doctor.ts
// far doctor —— 环境自诊断。
//
// 红线（OPEN_SOURCE_RELEASE_PLAN §15）：
//   · 默认零网络、零 API、零密钥读取（只检查 DASHSCOPE_API_KEY 是否**已设置且非空**，不读取其值）。
//   · provider key 缺失只 WARN，绝不 FAIL（offline demo 不依赖它）。
//   · --live-qwen-smoke 显式才调真实 API（复用 ci/competition_qwen_smoke.ts，自带无 key graceful skip）。
// 退出码：0 全绿 / 1 有 FAIL（核心能力损坏）/ 2 仅 WARN（可用但受限）。

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
  if (envRoot && existsSync(resolve(envRoot, 'src/cli/far.ts'))) {
    return envRoot;
  }
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(dir, 'src/cli/far.ts'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
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
    detail: `v${process.versions.node}（type-stripping 需 ≥24；${major >= 24 ? '满足' : '不满足，far 无法跑 .ts'}）`,
  });

  const pnpm = probeBin('pnpm', ['--version']);
  checks.push({
    name: 'pnpm',
    status: pnpm ? 'ok' : 'warn',
    detail: pnpm ? `v${pnpm}` : '未找到（可用 corepack enable / npm i -g pnpm 补救）',
  });

  const py = probeBin('python3', ['--version']) ?? probeBin('python', ['--version']);
  checks.push({
    name: 'Python',
    status: py ? 'ok' : 'warn',
    detail: py ?? '未找到（offline demo 不依赖；科研验证轴 SymPy/Z3 将 skip）',
  });

  const git = probeBin('git', ['--version']);
  checks.push({
    name: 'git',
    status: git ? 'ok' : 'warn',
    detail: git ?? '未找到',
  });

  const docker = probeBin('docker', ['--version']);
  checks.push({
    name: 'Docker',
    status: docker ? 'info' : 'info',
    detail: docker ?? '未安装（可选；docker compose up 需要它）',
  });
}

function checkProject(root: string | null, checks: Check[]): void {
  if (root === null) {
    checks.push({
      name: '项目根定位',
      status: 'warn',
      detail: '未找到 src/cli/far.ts（设 FAR_ROOT 或在仓库内运行）；项目相关检查跳过',
    });
    return;
  }
  checks.push({ name: '项目根', status: 'ok', detail: root });

  const depsOk = existsSync(resolve(root, 'node_modules/better-sqlite3/package.json'));
  checks.push({
    name: 'Node 依赖',
    status: depsOk ? 'ok' : 'fail',
    detail: depsOk ? 'node_modules 已安装（better-sqlite3 可见）' : '未安装 → 运行 pnpm install',
  });

  const pyDeps = probeBin('python3', ['-c', 'import sympy, z3; print("ok")'])
    ?? probeBin('python', ['-c', 'import sympy, z3; print("ok")']);
  checks.push({
    name: 'Python 科研依赖',
    status: pyDeps ? 'ok' : 'warn',
    detail: pyDeps ? 'sympy + z3 可导入' : 'sympy/z3 缺失 → 运行 pip install -e .（科研轴 skip，非阻塞）',
  });

  const examplesOk = existsSync(resolve(root, 'examples/tess-offline'));
  checks.push({
    name: 'examples/tess-offline',
    status: examplesOk ? 'ok' : 'warn',
    detail: examplesOk ? '存在' : '缺失（far demo tess-offline 可生成持久化产物）',
  });

  const schemaOk = existsSync(resolve(root, 'schema/migrations'));
  checks.push({
    name: 'schema/migrations',
    status: schemaOk ? 'ok' : 'warn',
    detail: schemaOk ? '存在' : '缺失',
  });
}

async function checkCoreCapability(root: string | null, checks: Check[]): Promise<void> {
  try {
    await import('better-sqlite3');
  } catch (e) {
    checks.push({
      name: '核心 native 模块',
      status: 'fail',
      detail: `better-sqlite3 加载失败：${e instanceof Error ? e.message : String(e)}`,
    });
    return;
  }
  checks.push({ name: '核心 native 模块', status: 'ok', detail: 'better-sqlite3 可加载' });

  if (root === null) {
    return;
  }
  const fixture = resolve(root, 'examples/tess-offline/output/demo.far-proof');
  if (!existsSync(fixture)) {
    checks.push({
      name: 'offline verify（demo fixture）',
      status: 'warn',
      detail: `fixture 不存在：${fixture}（运行 far demo tess-offline 生成后再验）`,
    });
    return;
  }
  const exit = runVerify({ bundlePath: fixture, mode: 'full', json: false, explain: false });
  checks.push({
    name: 'offline verify（demo fixture）',
    status: exit === 0 ? 'ok' : 'fail',
    detail: exit === 0 ? `far verify --bundle 通过：${fixture}` : `verify 失败 exit ${exit}（核心能力损坏）`,
  });
}

function checkProviderKey(checks: Check[]): void {
  const hasKey = Boolean(process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_API_KEY.length > 0);
  checks.push({
    name: 'DASHSCOPE_API_KEY',
    status: hasKey ? 'ok' : 'warn',
    detail: hasKey ? '已配置（仅检测存在性，未读取值）' : '未设置（offline demo 不需要；真实 Qwen/百炼推理需配置）',
  });
}

function checkLiveQwenSmoke(root: string | null, checks: Check[]): void {
  if (root === null) {
    checks.push({ name: '--live-qwen-smoke', status: 'warn', detail: '需在仓库内运行（定位 ci/competition_qwen_smoke.ts）' });
    return;
  }
  const script = resolve(root, 'ci/competition_qwen_smoke.ts');
  if (!existsSync(script)) {
    checks.push({ name: '--live-qwen-smoke', status: 'warn', detail: `${script} 不存在（NEEDS_API_VALIDATION）` });
    return;
  }
  if (!process.env.DASHSCOPE_API_KEY) {
    checks.push({ name: '--live-qwen-smoke', status: 'fail', detail: '需 DASHSCOPE_API_KEY（真实计费调用·NEEDS_API_VALIDATION）' });
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
    detail: `ci/competition_qwen_smoke.ts exit ${r.status ?? 'null'}（NEEDS_API_VALIDATION·真实计费调用）`,
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

  process.stdout.write('\n  FAR-Chain · far doctor（环境自诊断）\n');
  process.stdout.write('  ─────────────────────────────────────────────────\n');
  for (const c of checks) {
    process.stdout.write(`  ${SYMBOL[c.status]} [${c.status.toUpperCase().padEnd(4)}] ${c.name}\n`);
    process.stdout.write(`          ${c.detail}\n`);
  }
  process.stdout.write('  ─────────────────────────────────────────────────\n');

  const hasFail = checks.some((c) => c.status === 'fail');
  const hasWarn = checks.some((c) => c.status === 'warn');
  if (hasFail) {
    process.stdout.write('  结论：存在 FAIL（核心能力受损）—— 按上述 detail 修复后重跑 far doctor\n\n');
    return 1;
  }
  if (hasWarn) {
    process.stdout.write('  结论：仅 WARN（offline demo 可用，部分能力受限）—— 无 API key 不影响 far demo\n\n');
    return 2;
  }
  process.stdout.write('  结论：全绿。下一步：far demo tess-offline\n\n');
  return 0;
}
