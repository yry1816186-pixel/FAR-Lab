// src/cli/commands/status.ts
// 职责：`far status` 子命令 —— 编排 collectStatusDump + chainHead DB 验证 + testCount spawn + 输出。
// 设计 SSOT：PROJECT_PLAN/01 §5 + 10 §4（W0 启动最小壳 + phase B testCount + phase C coverage/suiteIntegrity）·运行时 SSOT 以本文件源码 + far status 实测为准。
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
import { fileURLToPath } from 'node:url';

import { verifyChainHead } from '../../evidence_log/verifier.ts';
import {
  collectStatusDump,
  TEST_GLOBS,
  toStatusJson,
  type ChainHeadStatus,
  type PendingField,
  type StatusDump,
  type TestCountResult,
} from '../status_dump.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export interface StatusOptions {
  readonly dbPath?: string;
  readonly json: boolean;
}

export function runStatus(options: StatusOptions): number {
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
    process.stderr.write(`far status: testCount 收集失败（降级 pending）— ${errorMessage(error)}\n`);
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
      `TAP summary 未找到 tests/pass（exit=${result.status ?? '?'}, stdout 尾: ${(result.stdout ?? '').slice(-300)})`,
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
    process.stderr.write(`far status: coverage 收集失败（降级 pending）— ${errorMessage(error)}\n`);
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
      `coverage \`all files\` 行未找到（exit=${result.status ?? '?'}, stdout 尾: ${stdout.slice(-300)}）`,
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
    if (result.ok) {
      return { status: 'ok', verifiedCount: result.verifiedCount };
    }
    const brokenAt = result.brokenAtSeq;
    const base: ChainHeadStatus = {
      status: 'broken',
      verifiedCount: result.verifiedCount,
      reason: `seq ${brokenAt ?? '?'} 处 prev_hash 或 current_hash 不匹配`,
    };
    return brokenAt !== null ? { ...base, brokenAtSeq: brokenAt } : base;
  } catch (error) {
    return {
      status: 'pending',
      reason: `DB 打开/链头验证失败：${errorMessage(error)}`,
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
    `  docCount             : ${dump.docCount}（编号文档 ${dump.numberedDocCount}）`,
    '',
    '信任根 / golden（复用现有模块）：',
    `  goldenVectorCount    : ${dump.goldenVectorCount}`,
    `  goldenReproFixtureHex: ${dump.goldenReproFixtureHex}`,
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
  if (head.status === 'ok') {
    return `ok（verifiedCount=${head.verifiedCount ?? '?'}）`;
  }
  if (head.status === 'broken') {
    return `BROKEN at seq ${head.brokenAtSeq ?? '?'}（verifiedCount=${head.verifiedCount ?? '?'}）— ${head.reason ?? ''}`;
  }
  return `pending — ${head.reason ?? '未提供'}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
