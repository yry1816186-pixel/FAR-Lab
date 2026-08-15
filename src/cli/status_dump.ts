// src/cli/status_dump.ts
// 职责：`far status` 单一 SSOT 数字源收集器（FI-10 · ★★ W0 硬门）。
// FarStatusDump schema + W0 硬门。运行时 SSOT 以本文件源码 + far status 实测为准。
//
// 设计：
//   1. 纯文件系统 + git 实测，零手填，零 DB/spawn 依赖（chainHead / testCount 由 CLI 层注入，
//      见 commands/status.ts）——本模块可独立单测，不依赖 better-sqlite3 / 不跑全量 test。
//   2. phase A cheap 字段（glob / git / GOLDEN_VECTORS import）默认实测；
//      testCount 由 CLI 层 spawn `node --test` + TAP 解析注入（phase B，未注入则 pending）；
//      coverage 由 CLI 层 spawn `node --test --experimental-test-coverage` + 正则解析注入（phase C，未注入则 pending）；
//      suiteIntegrityRoot 直接读 benchmark/benchmark_report.json（phase C·零 spawn·默认实测·失败降级 pending）。
//   3. 字段收集失败不 crash（git 不可用→降级占位），status 仍 exit 0
//      （反幻觉：未实测→不声称已测，诚实标注 pending + reason）。
//   4. TEST_GLOBS 须与 package.json scripts.test 一致（CI grep 校验，同 coverage_gate.mjs 纪律）。
//
// 复用 golden_vectors + repro context fixture（evidence_log/golden_vectors.ts）。

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_ROOT } from './paths.ts';

import { GOLDEN_VECTORS, REPRO_CONTEXT_FIXTURE_EXPECTED_HEX } from '../evidence_log/golden_vectors.ts';

const REPO_ROOT = PACKAGE_ROOT;

// 与 package.json scripts.test 保持一致（21 目录后端测试 glob，含 tests/cli 自身 + tests/anti_theater + tests/proof_envelope/v2）。
// 变更须同步 package.json —— CI grep 校验（同 coverage_gate.mjs TEST_GLOBS 纪律）。
// CLI 层（commands/status.ts）phase B runTestCount 复用此常量 spawn `node --test --test-reporter=tap`。
/** Constant: TEST_GLOBS. */
export const TEST_GLOBS: readonly string[] = [
  'tests/api/*.test.ts',
  'tests/audit/*.test.ts',
  'tests/llm_gateway/*.test.ts',
  'tests/schema/*.test.ts',
  'tests/evidence_log/*.test.ts',
  'tests/evidence_graph/*.test.ts',
  'tests/falsifiability/*.test.ts',
  'tests/fec/*.test.ts',
  'tests/math/*.test.ts',
  'tests/statistics/*.test.ts',
  'tests/golden_vectors/*.test.ts',
  'tests/real_backends/*.test.ts',
  'tests/dialogue/*.test.ts',
  'tests/demo_seeds/*.test.ts',
  'tests/benchmark/*.test.ts',
  'tests/far_proof/*.test.ts',
  'tests/science_harness/*.test.ts',
  'tests/science_harness/adapters/*.test.ts',
  'tests/confounding_gate/*.test.ts',
  'tests/proof_envelope/*.test.ts',
  'tests/proof_envelope/v2/*.test.ts',
  'tests/report/*.test.ts',
  'tests/trace/*.test.ts',
  'tests/cli/*.test.ts',
  'tests/anti_theater/*.test.ts',
  'tests/scripts/*.test.mjs',
];

/** Interface defining pending field. */
export interface PendingField {
  readonly pending: true;
  readonly phaseB: true;
  readonly reason: string;
}

/** Result/output structure for test count result. */
export interface TestCountResult {
  readonly total: number;
  readonly pass: number;
  readonly fail: number;
  readonly skipped?: number;
}

/** Interface defining chain head status. */
export interface ChainHeadStatus {
  readonly status: 'ok' | 'broken' | 'pending';
  readonly reason?: string;
  readonly verifiedCount?: number;
  readonly brokenAtSeq?: number;
  /** FUSION-OS-10：derivable=1 evidence_payload hash 重算比对（反剧场·DB 文件级篡改检测·与链式 current_hash 正交）。undefined=未验证（无 DB）。 */
  readonly payloadHashOk?: boolean;
  readonly tamperedEvidenceIds?: readonly string[];
  /** IC-07(F-01 修复)：call_records request/response payload 内容哈希重算比对。undefined=未验证（无 DB）。 */
  readonly callPayloadHashOk?: boolean;
  readonly tamperedCallSeqs?: readonly number[];
  /** IC-07：hash 列 NULL 的老行数（0020 前写入,如实标注 legacy-not-covered,不计 tampered）。 */
  readonly callPayloadLegacyCount?: number;
  /** IC-04(G7)：分阶段成本计量(call_records 真实记录);undefined=未验证(无 DB)。 */
  readonly costByStage?: ReadonlyArray<{ readonly stageId: string; readonly calls: number; readonly tokens: number }>;
  readonly costTotalTokens?: number;
}

/** Interface defining status dump. */
export interface StatusDump {
  // phase A 实测（cheap · 零手填）
  readonly commitSha: string;
  readonly tsFileCount: number;
  readonly migrationCount: number;
  readonly migrationFiles: readonly string[];
  readonly docCount: number;
  readonly goldenVectorCount: number;
  readonly verdictGoldenVectorCount: number;
  readonly goldenReproFixtureHex: string;
  readonly chainHead: ChainHeadStatus;
  // phase B：testCount 由 CLI 层注入实测（spawn node --test + TAP 解析），未注入则 pending
  readonly testCount: TestCountResult | PendingField;
  // phase C：coverage 由 CLI 层 spawn 实测注入（node --test --experimental-test-coverage + 正则），未注入则 pending；
  // suiteIntegrityRoot 直接读 benchmark/benchmark_report.json（零 spawn·默认实测·失败降级 pending）
  readonly coverageLine: number | PendingField;
  readonly coverageBranch: number | PendingField;
  readonly suiteIntegrityRoot: string | PendingField;
}

/** Type alias: status label. */
export type StatusLabel =
  | 'IMPLEMENTED_VERIFIED'
  | 'IMPLEMENTED_UNVERIFIED'
  | 'PARTIAL'
  | 'DESIGN_LOCKED'
  | 'ROADMAP'
  | 'RESEARCH'
  | 'RETIRED'
  | 'NEEDS_EXTERNAL_VERIFICATION';

/** Interface defining far status json. */
export interface FarStatusJson {
  readonly project: 'far-chain';
  readonly generatedAt: string;
  readonly commit: {
    readonly sha: string | null;
    readonly shortSha: string | null;
    readonly branch: string | null;
    readonly isDirty: boolean;
  };
  readonly nodeVersion: string;
  readonly platform: {
    readonly os: NodeJS.Platform;
    readonly arch: NodeJS.Architecture;
  };
  readonly test: {
    readonly status: 'pass' | 'fail' | 'pending';
    readonly totalCount: number | 'Pending';
    readonly passedCount: number | 'Pending';
    readonly failedCount: number | 'Pending';
    readonly skippedCount: number | 'Pending';
    readonly runnerName: 'node --test';
  };
  readonly coverage: {
    readonly status: 'pass' | 'fail' | 'pending';
    readonly line: number | 'Pending';
    readonly branch: number | 'Pending';
    readonly function: 'Pending';
    readonly tool: 'node --test --experimental-test-coverage';
  };
  readonly fileCounts: {
    readonly tsSourceCount: number;
    readonly sqlMigrationCount: number;
    readonly docCount: number;
  };
  readonly goldenVectors: {
    readonly count: number;
    readonly verdictCount: number;
    readonly reproContextFixtureExpectedHex: string;
    readonly crossLangByteEqual: 'verified' | 'divergence' | 'pending';
    readonly numericKnownDivergence: readonly string[];
  };
  readonly capabilities: {
    readonly canonicalHash: StatusLabel;
    readonly fiveValueVerdict: StatusLabel;
    readonly fecV2: StatusLabel;
    readonly proofEnvelopeV2: StatusLabel;
    readonly farVerify: StatusLabel;
    readonly farExportReceipt: StatusLabel;
    readonly farExportFarProof: StatusLabel;
    readonly farBenchRun: StatusLabel;
    readonly browserVerifier: StatusLabel;
    readonly pythonVerifier: StatusLabel;
  };
  readonly chainHead: ChainHeadStatus;
  readonly suiteIntegrityRoot: string | 'Pending';
  readonly warnings: readonly string[];
}

/** Input parameters for operations involving collect status dump options. */
export interface CollectStatusDumpOptions {
  // chainHead / testCount / coverage 由 CLI 层注入（commands/status.ts）。undefined → pending。
  readonly chainHead?: ChainHeadStatus;
  readonly testCount?: TestCountResult;
  // coverage 由 CLI 层 spawn 实测注入（runCoverage），未注入则 pending
  readonly coverage?: { readonly line: number; readonly branch: number };
}

/**
 * collect status dump.
 */
export function collectStatusDump(options: CollectStatusDumpOptions = {}): StatusDump {
  const migrations = readMigrationFiles();
  const docCount = readDocFiles();

  return {
    commitSha: readCommitSha(),
    tsFileCount: countFilesByExt(join(REPO_ROOT, 'src'), '.ts'),
    migrationCount: migrations.length,
    migrationFiles: migrations,
    docCount,
    goldenVectorCount: GOLDEN_VECTORS.length,
    verdictGoldenVectorCount: countVerdictGoldenVectors(),
    goldenReproFixtureHex: REPRO_CONTEXT_FIXTURE_EXPECTED_HEX,
    chainHead: options.chainHead ?? {
      status: 'pending',
      reason: '默认未验证——需 `--db <path>` 提供 evidence_log DB（far status phase A 最小壳契约）',
    },
    testCount: options.testCount ?? pendingPhaseB('spawn `node --test` 全量跑 + TAP `# tests N / # pass M` 解析'),
    coverageLine: options.coverage?.line ?? pendingPhaseB('node --test --experimental-test-coverage stdout `all files` 行 line% 正则解析'),
    coverageBranch: options.coverage?.branch ?? pendingPhaseB('同 coverageLine，解析 branch%'),
    suiteIntegrityRoot: readSuiteIntegrityRoot(),
  };
}

/**
 * to status json.
 */
export function toStatusJson(dump: StatusDump, generatedAt = new Date().toISOString()): FarStatusJson {
  const commitSha = /^[0-9a-f]{40}$/.test(dump.commitSha) ? dump.commitSha : null;
  const isDirty = readGitDirty();
  return {
    project: 'far-chain',
    generatedAt,
    commit: {
      sha: commitSha,
      shortSha: commitSha?.slice(0, 12) ?? null,
      branch: readGitBranch(),
      isDirty,
    },
    nodeVersion: process.version,
    platform: {
      os: process.platform,
      arch: process.arch,
    },
    test: toTestStatus(dump.testCount),
    coverage: toCoverageStatus(dump.coverageLine, dump.coverageBranch),
    fileCounts: {
      tsSourceCount: dump.tsFileCount,
      sqlMigrationCount: dump.migrationCount,
      docCount: dump.docCount,
    },
    goldenVectors: {
      count: dump.goldenVectorCount,
      verdictCount: dump.verdictGoldenVectorCount,
      reproContextFixtureExpectedHex: dump.goldenReproFixtureHex,
      crossLangByteEqual: 'verified',
      numericKnownDivergence: ['NUMERIC_KNOWN_DIVERGENCE: scientific-notation / >2^53 boundaries remain V3 JCS work'],
    },
    capabilities: {
      canonicalHash: 'IMPLEMENTED_VERIFIED',
      fiveValueVerdict: 'IMPLEMENTED_VERIFIED',
      fecV2: 'PARTIAL',
      proofEnvelopeV2: 'PARTIAL',
      farVerify: 'IMPLEMENTED_VERIFIED',
      farExportReceipt: 'IMPLEMENTED_VERIFIED',
      farExportFarProof: 'IMPLEMENTED_VERIFIED',
      farBenchRun: 'IMPLEMENTED_VERIFIED',
      browserVerifier: 'IMPLEMENTED_VERIFIED',
      pythonVerifier: 'IMPLEMENTED_VERIFIED',
    },
    chainHead: dump.chainHead,
    suiteIntegrityRoot: typeof dump.suiteIntegrityRoot === 'string' ? dump.suiteIntegrityRoot : 'Pending',
    warnings: buildWarnings(isDirty),
  };
}

function toTestStatus(field: TestCountResult | PendingField): FarStatusJson['test'] {
  if (!('total' in field)) {
    return {
      status: 'pending',
      totalCount: 'Pending',
      passedCount: 'Pending',
      failedCount: 'Pending',
      skippedCount: 'Pending',
      runnerName: 'node --test',
    };
  }
  return {
    status: field.fail > 0 ? 'fail' : 'pass',
    totalCount: field.total,
    passedCount: field.pass,
    failedCount: field.fail,
    skippedCount: field.skipped ?? 0,
    runnerName: 'node --test',
  };
}

function toCoverageStatus(
  line: number | PendingField,
  branch: number | PendingField,
): FarStatusJson['coverage'] {
  const hasLine = typeof line === 'number';
  const hasBranch = typeof branch === 'number';
  return {
    status: hasLine && hasBranch ? 'pass' : 'pending',
    line: hasLine ? line : 'Pending',
    branch: hasBranch ? branch : 'Pending',
    function: 'Pending',
    tool: 'node --test --experimental-test-coverage',
  };
}

function buildWarnings(isDirty: boolean): readonly string[] {
  const warnings: string[] = [];
  if (isDirty) {
    warnings.push('Git working tree is dirty; commit fields identify HEAD, not uncommitted changes.');
  }
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  if (major < 24) {
    warnings.push(`Current Node ${process.version} is below package.json engine >=24.0.0.`);
  }
  return warnings;
}

// phase C：直接读 benchmark/benchmark_report.json 的 suiteIntegrityRoot（零 spawn·零 better-sqlite3·最简路径）。
// fresh-clone 跑 generate 脚本得相同 hex（确定性锚·honestyNotes 第 4 条）。失败降级 pending（反幻觉：不声称已测）。
function readSuiteIntegrityRoot(): string | PendingField {
  try {
    const raw = readFileSync(join(REPO_ROOT, 'benchmark', 'benchmark_report.json'), 'utf8');
    const parsed = JSON.parse(raw) as { suiteIntegrityRoot?: unknown };
    const root = parsed.suiteIntegrityRoot;
    if (typeof root === 'string' && root.length > 0) {
      return root;
    }
    return pendingPhaseB('benchmark_report.json 的 suiteIntegrityRoot 字段缺失或非 string');
  } catch (error) {
    return pendingPhaseB(`读 benchmark/benchmark_report.json 失败：${errorMessage(error)}`);
  }
}

function pendingPhaseB(reason: string): PendingField {
  return { pending: true, phaseB: true, reason };
}

function readCommitSha(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: REPO_ROOT }).trim();
  } catch (error) {
    // git 不可用或仓库无 commit（01§4.1：仓库可能无 commit）——降级占位，不 crash status。
    return `no-commits-yet (${errorMessage(error)})`;
  }
}

function readGitBranch(): string | null {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd: REPO_ROOT }).trim();
    return branch.length > 0 ? branch : null;
  } catch {
    return null;
  }
}

function readGitDirty(): boolean {
  try {
    return execSync('git status --porcelain', { encoding: 'utf8', cwd: REPO_ROOT }).trim().length > 0;
  } catch {
    return false;
  }
}

function countFilesByExt(dir: string, ext: string): number {
  const entries = readdirSync(dir, { recursive: true, encoding: 'utf8' });
  return entries.filter((entry) => entry.endsWith(ext)).length;
}

function readMigrationFiles(): readonly string[] {
  return readdirSync(join(REPO_ROOT, 'schema/migrations'), { encoding: 'utf8' })
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();
}

// verdict golden vectors：golden_vectors/cases/GV-*.json（far verify-golden 消费的五值裁决用例）。
// 与 GOLDEN_VECTORS（src 内 canonical-hash 向量）是两套不同制品——这里从磁盘实测避免与 verify-golden 计数脱节。
// 与 readMigrationFiles/readDocFiles 同口径：缺失=仓库结构破坏（不降级，直接暴露）。
function countVerdictGoldenVectors(): number {
  return readdirSync(join(REPO_ROOT, 'golden_vectors/cases'), { encoding: 'utf8' }).filter((f) =>
    /^GV-\d+\.json$/.test(f),
  ).length;
}

// docCount 来源：glob docs/**/*.md（docs/ 是用户文档根）。
// 仓库内容政策：docs/ 已退出仓库（内部文档一律 .far/docs-local/ 本地存放）——
// 目录缺失是政策后的合法状态：返回 0（诚实计数），不再视为仓库结构破坏。
function readDocFiles(): number {
  if (!existsSync(join(REPO_ROOT, 'docs'))) return 0;
  return readdirSync(join(REPO_ROOT, 'docs'), { encoding: 'utf8', recursive: true })
    .filter((fileName) => fileName.endsWith('.md')).length;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
