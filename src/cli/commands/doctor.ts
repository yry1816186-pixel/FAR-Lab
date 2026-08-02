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
  /** IC-03(F-03):可选 DB 完整性检查(integrity_check 全量+链验证;损坏=FAIL fail-closed) */
  readonly dbPath?: string;
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

  // FIX-R6-003: 删除 examples/tess-offline 检查（examples/ 已 retire，demo.ts tess-offline 用 :memory: 不持久化；
  //   该检查必 warn 致 far doctor exit 2·评委13 F-R6-13 答辩现场 1 分钟崩溃）。改为检查真实持久化 bundle。
  const demoBundleOk = existsSync(resolve(root, '.far-implementation/walking-skeleton/demo.far-proof'));
  checks.push({
    name: 'demo.far-proof bundle',
    status: demoBundleOk ? 'ok' : 'warn',
    detail: demoBundleOk ? 'present (.far-implementation/walking-skeleton)' : 'missing (run "far demo" to generate)',
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
  // FIX-R6-003: fixture 路径从已 retire 的 examples/tess-offline 改为真实持久化 bundle。
  const fixture = resolve(root, '.far-implementation/walking-skeleton/demo.far-proof');
  if (!existsSync(fixture)) {
    checks.push({
      name: 'offline verify (demo fixture)',
      status: 'warn',
      detail: `fixture not found: ${fixture} (run "far demo" to generate it, then re-check)`,
    });
    return;
  }
  const exit = await runVerify({ bundlePath: fixture, mode: 'full', json: false, explain: false });
  checks.push({
    name: 'offline verify (demo fixture)',
    status: exit === 0 ? 'ok' : 'fail',
    detail: exit === 0 ? `far verify --bundle passed: ${fixture}` : `verify failed exit ${exit} (core capability broken)`,
  });

  // IC-07(F-01 修复)能力自检:payload 内容哈希覆盖 —— 好库 ok + DROP TRIGGER 旁路篡改必检出。
  try {
    const { default: Database } = await import('better-sqlite3');
    const { runMigrations } = await import('../../db/migrator.ts');
    const { appendRecord, getChainHead, GENESIS_PREV_HASH, hashCanonicalJson } = await import('../../evidence_log/index.ts');
    const { verifyCallRecordPayloadHashes } = await import('../../evidence_log/verifier.ts');
    const mem = new Database(':memory:');
    runMigrations(mem);
    const reqRec = { probe: 'request' };
    const resRec = { probe: 'response' };
    appendRecord(
      mem,
      {
        stageId: 'doctor-probe',
        cred: {
          modelId: 'doctor-fixture',
          dashscopeRequestId: null,
          reproHash: 'a'.repeat(64),
          gitCommitSha: 'b'.repeat(40),
          isoTimestamp: '2026-07-20T00:00:00.000Z',
        },
        payloadKind: 'hypothesis',
        purposeTag: 'hypothesis',
        prevHash: getChainHead(mem)?.currentHash ?? GENESIS_PREV_HASH,
      },
      {
        requestPayload: JSON.stringify(reqRec),
        responsePayload: JSON.stringify(resRec),
        requestPayloadHash: hashCanonicalJson(reqRec),
        responsePayloadHash: hashCanonicalJson(resRec),
        finishReason: 'stop',
        usageTokensTotal: 1,
      },
      { providerProfile: 'offline_replay' },
    );
    const clean = verifyCallRecordPayloadHashes(mem);
    // 旁路模拟:DROP TRIGGER 后改 payload 字节(链验证不检,内容哈希必须检)
    const triggers = mem.prepare(`SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='call_records'`).all() as Array<{ name: string }>;
    for (const t of triggers) mem.exec(`DROP TRIGGER IF EXISTS "${t.name}"`);
    mem.prepare(`UPDATE call_records SET request_payload='{"poison":1}' WHERE seq=1`).run();
    const tampered = verifyCallRecordPayloadHashes(mem);
    mem.close();
    const detectOk = clean.ok && clean.verifiedCount === 1 && !tampered.ok && tampered.tamperedSeqs.includes(1);
    checks.push({
      name: 'call payload hash coverage (IC-07)',
      status: detectOk ? 'ok' : 'fail',
      detail: detectOk
        ? 'clean verify ok + DROP TRIGGER tamper detected at seq=1'
        : `unexpected: clean=${JSON.stringify(clean)} tampered=${JSON.stringify(tampered)}`,
    });
  } catch (e) {
    checks.push({
      name: 'call payload hash coverage (IC-07)',
      status: 'fail',
      detail: `self-check failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

async function checkDbIntegrity(dbPath: string, checks: Check[]): Promise<void> {
  // IC-03(F-03):integrity_check 全量 fail-closed(启动级损坏不再静默)
  try {
    const { openFarDb, DatabaseIntegrityError } = await import('../../db/open.ts');
    const { verifyChainHead } = await import('../../evidence_log/verifier.ts');
    let db;
    try {
      db = openFarDb(dbPath, { readonly: true, integrityCheck: 'full' });
    } catch (error) {
      if (error instanceof DatabaseIntegrityError) {
        checks.push({
          name: `db integrity (${dbPath})`,
          status: 'fail',
          detail: `integrity_check FAILED(fail-closed): ${error.message.split('\n')[1]?.trim() ?? error.message}`,
        });
        return;
      }
      throw error;
    }
    try {
      const chain = verifyChainHead(db);
      checks.push({
        name: `db integrity (${dbPath})`,
        status: 'ok',
        detail: `integrity_check ok;chain ${chain.ok ? `ok(${chain.verifiedCount})` : `broken@${chain.brokenAtSeq ?? '?'}`}`,
      });
      // F-V04-02 修复:doctor 对实库跑 payload 内容哈希验证(此前只在内存 fixture 自检,
      // 朴素篡改在 doctor 面报 OK 而 status 面报 TAMPERED,两表面不一致)。
      const { verifyCallRecordPayloadHashes, verifyEvidencePayloadHashes } = await import(
        '../../evidence_log/verifier.ts'
      );
      const callPayload = verifyCallRecordPayloadHashes(db);
      const evidencePayload = verifyEvidencePayloadHashes(db);
      const tampered =
        callPayload.tamperedSeqs.length > 0 || evidencePayload.tamperedEvidenceIds.length > 0;
      checks.push({
        name: `db payload hashes (${dbPath})`,
        status: tampered ? 'fail' : 'ok',
        detail: tampered
          ? `CALL PAYLOAD TAMPERED(seqs:${callPayload.tamperedSeqs.join(',')}) / EVIDENCE PAYLOAD TAMPERED(ids:${evidencePayload.tamperedEvidenceIds.join(',')})`
          : `payload hashes ok(call=${callPayload.verifiedCount}${callPayload.legacyCount > 0 ? `,legacy-not-covered=${callPayload.legacyCount}` : ''};evidence=${evidencePayload.verifiedCount})`,
      });
    } finally {
      db.close();
    }
  } catch (error) {
    checks.push({
      name: `db integrity (${dbPath})`,
      status: 'fail',
      detail: `check failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

function checkProviderKey(checks: Check[]): void {  const hasKey = Boolean(process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_API_KEY.length > 0);
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
  if (opts.dbPath !== undefined) {
    await checkDbIntegrity(opts.dbPath, checks);
  }
  checkProviderKey(checks);
  if (opts.liveQwenSmoke) {
    checkLiveQwenSmoke(root, checks);
  }

  process.stdout.write('\n  FAR-Lab · far doctor (environment self-check)\n');
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
