// src/cli/commands/status.ts
// 职责：`far status` 子命令 —— 编排 collectStatusDump + chainHead DB 验证 + testCount spawn + 输出。
// far status 实现。
//
// 设计：
//   - --db <path>：值导入 better-sqlite3（照 tests/ 惯例 `import Database from 'better-sqlite3'`）
//     + verifyChainHead 算 chainHead 注入。不提供则 chainHead pending。
//   - testCount：phase B 实装——spawn `node --test --test-reporter=tap`（TEST_GLOBS）+ TAP summary 解析
//     （# tests N / # pass M / # fail K）。失败降级 pending（不 crash status，反 theater：诚实披露）。
//   - coverage：phase C 实装——spawn `node --test --experimental-test-coverage`（TEST_GLOBS）+ 正则解析
//     `all files` 行 line%/branch%（无 JSON reporter·stdout·glob 由 node 自展开）。失败降级 pending。
//   - --json：机器可读输出（CI 文档构建回填 `<X_FROM_STATUS_DUMP>` 占位符用，01§5）。
//   - exit 0 永远（status 是只读报告，pending 字段非失败）。

import Database from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_ROOT } from '../paths.ts';

import { verifyChainHead, verifyEvidencePayloadHashes, verifyCallRecordPayloadHashes } from '../../evidence_log/verifier.ts';
import { summarizeCostsByStage, summarizeTotalCost } from '../../llm_gateway/budget.ts';
import {
  collectStatusDump,
  TEST_GLOBS,
  toStatusJson,
  type ChainHeadStatus,
  type PendingField,
  type StatusDump,
  type TestCountResult,
} from '../status_dump.ts';

const REPO_ROOT = PACKAGE_ROOT;

export interface StatusOptions {
  readonly dbPath?: string;
  readonly json: boolean;
}

export function runStatus(options: StatusOptions, repoRoot: string = REPO_ROOT): number {
  // repoRoot 注入点：测试传无 .git 目录触发 guard；默认 REPO_ROOT 故生产行为不变（installed-package 降级语义见此 guard）。
  if (!existsSync(join(repoRoot, '.git'))) {
    process.stderr.write(
      `far status: not a repository checkout (${repoRoot} has no .git).\n` +
        '  far status introspects the source repo (git history, src/docs/schema counts) and is meant to\n' +
        '  run inside a FAR-Lab checkout. For an installed package, use `far doctor` for an environment self-check.\n',
    );
    return 2;
  }
  const chainHead = options.dbPath !== undefined ? verifyDbChainHead(options.dbPath) : undefined;
  const testCount = runTestCountSafe();
  const coverage = runCoverageSafe();

  const dump = collectStatusDump({
    ...(chainHead !== undefined ? { chainHead } : {}),
    ...(testCount !== undefined ? { testCount } : {}),
    ...(coverage !== undefined ? { coverage } : {}),
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(toStatusJson(dump), null, 2)}\n`);
  } else {
    process.stdout.write(renderHuman(dump));
  }
  return 0;
}

function runTestCountSafe(): TestCountResult | undefined {
  try {
    return runTestCount();
  } catch (error) {
    process.stderr.write(`far status: testCount collection failed (degraded to pending) — ${errorMessage(error)}\n`);
    return undefined;
  }
}

function runTestCount(): TestCountResult {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...TEST_GLOBS], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    maxBuffer: 50 * 1024 * 1024,
  });

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const total = matchTapNumber(output, /# tests\s+(\d+)/);
  const pass = matchTapNumber(output, /# pass\s+(\d+)/);
  const fail = matchTapNumber(output, /# fail\s+(\d+)/);
  const skipped = matchTapNumber(output, /# skipped\s+(\d+)/);

  if (total === undefined || pass === undefined) {
    throw new Error(
      `TAP summary missing tests/pass (exit=${result.status ?? '?'}, stdout tail: ${(result.stdout ?? '').slice(-300)})`,
    );
  }
  return { total, pass, fail: fail ?? 0, skipped: skipped ?? 0 };
}

function matchTapNumber(output: string, pattern: RegExp): number | undefined {
  const match = output.match(pattern);
  if (match === null || match[1] === undefined) {
    return undefined;
  }
  return Number.parseInt(match[1], 10);
}

interface CoverageResult {
  readonly line: number;
  readonly branch: number;
}

function runCoverageSafe(): CoverageResult | undefined {
  try {
    return runCoverage();
  } catch (error) {
    process.stderr.write(`far status: coverage collection failed (degraded to pending) — ${errorMessage(error)}\n`);
    return undefined;
  }
}

function runCoverage(): CoverageResult {
  const result = spawnSync(process.execPath, ['--test', '--experimental-test-coverage', ...TEST_GLOBS], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    maxBuffer: 50 * 1024 * 1024,
  });

  // node --test coverage 表输出到 stdout（非 stderr·无 ANSI·glob 由 node 自展开）。
  // 无 JSON reporter（--test-reporter=json 抛 ERR_MODULE_NOT_FOUND）→ 正则解析 `all files` 行。
  // 表头列：file | line % | branch % | funcs % | uncovered lines（line%=match[1], branch%=match[2]）。
  const stdout = result.stdout ?? '';
  const match = stdout.match(/all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new Error(
      `coverage \`all files\` row not found (exit=${result.status ?? '?'}, stdout tail: ${stdout.slice(-300)})`,
    );
  }
  return {
    line: Number.parseFloat(match[1]),
    branch: Number.parseFloat(match[2]),
  };
}

function verifyDbChainHead(dbPath: string): ChainHeadStatus {
  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true });
    const result = verifyChainHead(db);
    const payloadHash = verifyEvidencePayloadHashes(db);
    const callPayload = verifyCallRecordPayloadHashes(db);
    const costByStage = summarizeCostsByStage(db);
    const costTotal = summarizeTotalCost(db);
    const payloadFields = {
      payloadHashOk: payloadHash.ok,
      ...(payloadHash.tamperedEvidenceIds.length > 0
        ? { tamperedEvidenceIds: payloadHash.tamperedEvidenceIds }
        : {}),
      callPayloadHashOk: callPayload.ok,
      ...(callPayload.tamperedSeqs.length > 0
        ? { tamperedCallSeqs: callPayload.tamperedSeqs }
        : {}),
      ...(callPayload.legacyCount > 0
        ? { callPayloadLegacyCount: callPayload.legacyCount }
        : {}),
      costByStage,
      costTotalTokens: costTotal.tokens,
    };
    if (result.ok) {
      return { status: 'ok', verifiedCount: result.verifiedCount, ...payloadFields };
    }
    const brokenAt = result.brokenAtSeq;
    const base: ChainHeadStatus = {
      status: 'broken',
      verifiedCount: result.verifiedCount,
      reason: `seq ${brokenAt ?? '?'} 处 prev_hash 或 current_hash 不匹配`,
      ...payloadFields,
    };
    return brokenAt !== null ? { ...base, brokenAtSeq: brokenAt } : base;
  } catch (error) {
    return {
      status: 'pending',
      reason: `DB open / chain-head verification failed: ${errorMessage(error)}`,
    };
  } finally {
    db?.close();
  }
}

function renderHuman(dump: StatusDump): string {
  const lines: string[] = [
    'FAR-Chain Status Dump（SSOT · 禁手填 · W0 phase A+B+C）',
    '════════════════════════════════════════════════════════════',
    '仓库实测（git + glob，零手填）：',
    `  commitSha            : ${dump.commitSha}`,
    `  tsFileCount          : ${dump.tsFileCount}`,
    `  migrationCount       : ${dump.migrationCount}（${dump.migrationFiles.join(', ')}）`,
    `  docCount             : ${dump.docCount}（docs/ 用户文档）`,
    '',
    '信任根 / golden（复用现有模块）：',
    `  goldenVectorCount       : ${dump.goldenVectorCount}（src 内 canonical-hash 向量·跨语言字节一致回归）`,
    `  verdictGoldenVectorCount: ${dump.verdictGoldenVectorCount}（golden_vectors/cases/GV-*.json·far verify-golden 消费）`,
    `  goldenReproFixtureHex   : ${dump.goldenReproFixtureHex}`,
    '    （REPRO_CONTEXT_FIXTURE 单向量 expectedHex，非 merkle 根 · 01§4.4）',
    `  chainHead            : ${renderChainHead(dump.chainHead)}`,
    '',
    '测试（spawn `node --test` 实测 · phase B）：',
    `  testCount            : ${renderTestCount(dump.testCount)}`,
    '',
    'phase C 实测（coverage spawn + suiteIntegrityRoot 读 JSON）：',
    `  coverageLine         : ${renderCoverage(dump.coverageLine)}`,
    `  coverageBranch       : ${renderCoverage(dump.coverageBranch)}`,
    `  suiteIntegrityRoot   : ${renderSuiteIntegrity(dump.suiteIntegrityRoot)}`,
    '════════════════════════════════════════════════════════════',
    '',
  ];
  return lines.join('\n');
}

function renderTestCount(field: TestCountResult | PendingField): string {
  if (!('total' in field)) {
    return `<pending — ${field.reason}>`;
  }
  return `${field.pass}/${field.total} pass（fail=${field.fail}）`;
}

function renderCoverage(field: number | PendingField): string {
  if (typeof field === 'number') {
    return `${field.toFixed(2)}%`;
  }
  return `<pending — ${field.reason}>`;
}

function renderSuiteIntegrity(field: string | PendingField): string {
  if (typeof field === 'string') {
    return field;
  }
  return `<pending — ${field.reason}>`;
}

function renderChainHead(head: ChainHeadStatus): string {
  let line: string;
  if (head.status === 'ok') {
    line = `ok（verifiedCount=${head.verifiedCount ?? '?'}）`;
  } else if (head.status === 'broken') {
    line = `BROKEN at seq ${head.brokenAtSeq ?? '?'}（verifiedCount=${head.verifiedCount ?? '?'}）— ${head.reason ?? ''}`;
  } else {
    line = `pending — ${head.reason ?? 'not provided'}`;
  }
  // FUSION-OS-10：payload-hash 失配须显式披露（避免 chain ok 但 derivable=1 行被 DB 文件级篡改时「误导性 ok」）。
  if (head.payloadHashOk === false) {
    line += ` · PAYLOAD TAMPERED（${head.tamperedEvidenceIds?.length ?? 0} derivable=1 rows：${head.tamperedEvidenceIds?.join(', ') ?? ''}）`;
  }
  // IC-07(F-01 修复)：call_records payload 篡改/老行覆盖度如实披露。
  if (head.callPayloadHashOk === false) {
    line += ` · CALL PAYLOAD TAMPERED（seqs：${head.tamperedCallSeqs?.join(', ') ?? ''}）`;
  }
  if ((head.callPayloadLegacyCount ?? 0) > 0) {
    line += ` · call payload legacy-not-covered=${head.callPayloadLegacyCount ?? 0}（0020 前老行,无内容哈希）`;
  }
  // IC-04(G7):分阶段成本披露(call_records 真实计量,非厂商账单对账)
  if (head.costByStage !== undefined && head.costByStage.length > 0) {
    const stageText = head.costByStage
      .slice(0, 5)
      .map((s) => `${s.stageId}=${s.tokens}tok/${s.calls}calls`)
      .join(', ');
    line += ` · cost: total=${head.costTotalTokens ?? 0}tok [${stageText}${head.costByStage.length > 5 ? ', …' : ''}]`;
  }
  return line;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
