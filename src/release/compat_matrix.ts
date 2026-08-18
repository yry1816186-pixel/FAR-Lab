// src/release/compat_matrix.ts
// 职责：REL-COMPAT-001 —— 兼容性矩阵与迁移路径（发布工程域）。
//
//   - readSurfaceFacts(repoRoot)：从真实源读取各 surface 当前形态——CLI 命令清单
//     （src/cli/far.ts COMMANDS 数组的 `name:` 声明）、schema 版本（schema/migrations
//     最大 NNNN）、proof 规则集 URI（src/proof_envelope/ruleset_version.ts 常量直读）、
//     API 版本（schema/openapi.json info.version）、export 格式（far.ts export 子命令
//     字面量解析）。**不硬编码重复**——矩阵值全部运行时取自 SSOT。
//   - buildCompatMatrix(repoRoot)：surface（cli/api/sdk/tool-protocol/plugins/config/
//     database/proof/export）→ 当前值 + 最低支持消费者 + 迁移注记 + breaking 边界。
//   - checkCompatMatrixSync(repoRoot, declared)：矩阵登记面 vs 真实源 diff——CLI 出现
//     未登记命令/登记命令消失/schema 版本漂移/proof URI 漂移/export 格式漂移全部
//     fail（fail-closed：发布门语义，漂移必须先更新矩阵再发布）。
//   - verifyHistoricalProof()：用 legacy V1 路径（buildDemoChain——无 rulesetUri 的
//     V1 信封）导出真实 proof bundle，跑当前 verifier——旧证明兼容实证（主版本
//     验证器并存条款 ADR-007 H3/IC-01 的机器面）。
//   - checkChangelog(repoRoot)：CHANGELOG 存在性与 Keep-a-Changelog 结构检查。
//
// Cannot-prove（本机制不能证明什么）：
//   - 矩阵证明「登记面与真实源此刻一致」——不证明未登记 surface（未来新增的
//     消费渠道）被自动覆盖；sdk/tool-protocol/plugins 当前是声明面（仓库无独立
//     SDK 包/MCP server，登记为 NOT_SHIPPED 是诚实值而非缺口掩盖）；
//   - verifyHistoricalProof 用仓库内 legacy demo 链作历史样本——证明「V1 信封在
//     当前验证器下仍可验」，不证明任意第三方旧包（不同历史版本导出的包）兼容；
//     那些包需要各自的 fixture 实证；
//   - CLI 命令名提取依赖 far.ts 的声明缩进约定（4 空格 `name:`）——约定变化会
//     被 sync 检出为「全部命令消失」fail（保守失败方向，不静默放行）。
//
// 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch。模型中立。

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

import { crossPlatformTmpDir } from '../paths.ts';
import {
  CURRENT_RULESET_URI,
  SUPPORTED_RULESET_URIS,
} from '../proof_envelope/ruleset_version.ts';
import { buildDemoChain, computeEnvHash, DEMO_GIT_COMMIT_SHA, DEMO_RUN_ID } from '../far_proof/demo_chain.ts';
import { exportFarProof } from '../far_proof/exporter.ts';
import { verifyFarProofBundle } from '../far_proof/bundle_verifier.ts';

// ---------------------------------------------------------------------------
// 真实源读取（surface facts——运行时 SSOT，禁止硬编码重复）
// ---------------------------------------------------------------------------

export interface SurfaceFacts {
  readonly cliCommands: readonly string[];
  readonly schemaVersion: number;
  readonly proofRulesetUri: string;
  readonly supportedRulesetUris: readonly string[];
  readonly apiVersion: string;
  readonly exportFormats: readonly string[];
}

const CLI_NAME_RE = /^ {4}name: '([a-z][a-z0-9-]*)',$/;

/** CLI 命令清单：解析 far.ts COMMANDS 数组的顶层 `name:` 声明（4 空格缩进约定）。 */
export function readCliCommands(repoRoot: string): readonly string[] {
  const text = readFileSync(join(repoRoot, 'src', 'cli', 'far.ts'), 'utf8');
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = CLI_NAME_RE.exec(line);
    if (m !== null && m[1] !== undefined) out.push(m[1]);
  }
  return out.sort();
}

/** schema 版本：schema/migrations 最大 NNNN（前向迁移 SSOT——registry 即目录）。 */
export function readSchemaVersion(repoRoot: string): number {
  const dir = join(repoRoot, 'schema', 'migrations');
  let max = 0;
  for (const file of readdirSync(dir)) {
    const m = /^(\d{4})_.+\.sql$/.exec(file);
    if (m !== null && m[1] !== undefined) {
      const v = Number.parseInt(m[1], 10);
      if (v > max) max = v;
    }
  }
  return max;
}

/** export 格式：far.ts export 子命令字面量解析（真实分发面）。 */
export function readExportFormats(repoRoot: string): readonly string[] {
  const text = readFileSync(join(repoRoot, 'src', 'cli', 'far.ts'), 'utf8');
  const m = /far export: expected ((?:'[^']+'(?:, or |, )?)+)/.exec(text);
  if (m === null || m[1] === undefined) return [];
  const formats = m[1].match(/'[^']+'/g) ?? [];
  return formats.map((f) => f.replace(/'/g, '')).sort();
}

/** API 版本：schema/openapi.json info.version（日期版本制）。 */
export function readApiVersion(repoRoot: string): string {
  const openapi = JSON.parse(readFileSync(join(repoRoot, 'schema', 'openapi.json'), 'utf8')) as Record<string, unknown>;
  const info = openapi.info as Record<string, unknown> | undefined;
  return typeof info?.version === 'string' ? info.version : 'UNKNOWN';
}

/** 全 surface 真实源快照（矩阵构建 + sync 检查共用同一读取路径）。 */
export function readSurfaceFacts(repoRoot: string): SurfaceFacts {
  return {
    cliCommands: readCliCommands(repoRoot),
    schemaVersion: readSchemaVersion(repoRoot),
    proofRulesetUri: CURRENT_RULESET_URI,
    supportedRulesetUris: [...SUPPORTED_RULESET_URIS],
    apiVersion: readApiVersion(repoRoot),
    exportFormats: readExportFormats(repoRoot),
  };
}

// ---------------------------------------------------------------------------
// 兼容性矩阵
// ---------------------------------------------------------------------------

export type CompatSurface =
  | 'cli'
  | 'api'
  | 'sdk'
  | 'tool-protocol'
  | 'plugins'
  | 'config'
  | 'database'
  | 'proof'
  | 'export';

export const COMPAT_SURFACES: readonly CompatSurface[] = [
  'cli', 'api', 'sdk', 'tool-protocol', 'plugins', 'config', 'database', 'proof', 'export',
];

export interface CompatMatrixEntry {
  readonly surface: CompatSurface;
  /** 当前版本/形态（运行时真实源值——见 readSurfaceFacts）。 */
  readonly current: string;
  /** 最低支持消费者版本（策略声明）。 */
  readonly minConsumer: string;
  readonly migrationNote: string;
  readonly breakingBoundary: string;
}

/** 构建兼容矩阵（current 全部来自真实源——见模块头 Cannot-prove 的声明面边界）。 */
export function buildCompatMatrix(repoRoot: string): readonly CompatMatrixEntry[] {
  const facts = readSurfaceFacts(repoRoot);
  return [
    {
      surface: 'cli',
      current: `${facts.cliCommands.length} commands (latest: ${facts.cliCommands.join(', ')})`,
      minConsumer: 'node >= 20（package.json engines 语义）',
      migrationNote: '新命令只增不删；删除/改名命令须先 deprecation 一个 minor 版本并在 CHANGELOG 登记',
      breakingBoundary: '命令消失/退出码语义翻转 = MAJOR；新增子命令/选项 = MINOR',
    },
    {
      surface: 'api',
      current: `openapi ${facts.apiVersion} (spec 3.0.3)`,
      minConsumer: '任何 OpenAPI 3.0 客户端',
      migrationNote: '/api/v1 路由只增不改；破坏性路由变化开 /api/v2 并存（v2_receipts 已并存）',
      breakingBoundary: '既有路由移除/响应 schema 字段删除 = MAJOR',
    },
    {
      surface: 'sdk',
      current: 'NOT_SHIPPED（无独立 SDK 包——npm 包 far CLI 即消费面）',
      minConsumer: 'n/a',
      migrationNote: '发布 SDK 时新增 surface 条目并绑定其 package.json',
      breakingBoundary: '未发布即无兼容承诺（诚实声明，非缺口掩盖）',
    },
    {
      surface: 'tool-protocol',
      current: 'NOT_SHIPPED（无 MCP/工具协议 server）',
      minConsumer: 'n/a',
      migrationNote: '上线 MCP server 时登记协议版本',
      breakingBoundary: '未发布即无兼容承诺',
    },
    {
      surface: 'plugins',
      current: 'DomainPack 脚手架（far init <domain>——config + claim/fec 模板）',
      minConsumer: 'far init 生成的 DomainPack 结构',
      migrationNote: 'DomainPack 模板字段只增；消费方按未知字段忽略策略处理',
      breakingBoundary: '模板必填字段删除/重命名 = MINOR+deprecation 通告',
    },
    {
      surface: 'config',
      current: 'ENV 键清单见 src/platform/config.ts CONFIG_SPECS（typed SSOT）',
      minConsumer: '使用 CONFIG_SPECS 登记键的调用方',
      migrationNote: '配置键变更走 diffConfigSpecs 的默认值 diff 面（宪法：默认值变化需 diff）',
      breakingBoundary: '既有键删除/语义翻转 = MAJOR；默认值变化需 CHANGELOG 显式记录',
    },
    {
      surface: 'database',
      current: `schema v${facts.schemaVersion}（schema/migrations 0024 前 forward-only）`,
      minConsumer: '持有 schema v1..v24 的库（runMigrations 前向升级）',
      migrationNote: '既有 migration 不可编辑（前向修复 only）；升级 = 新增 NNNN 迁移；降级不支持——回滚走备份恢复（见 rollback_drill.ts）',
      breakingBoundary: '任何对既有 migration 的字节改动 = 违规（pre-commit 门阻断）',
    },
    {
      surface: 'proof',
      current: `${facts.proofRulesetUri}（支持集: ${facts.supportedRulesetUris.join(', ')}）`,
      minConsumer: 'V1 信封消费者（无 rulesetUri = legacy v1 默认派发）',
      migrationNote: 'MAJOR 规则语义变化 → URI 升 vN + 旧验证器并存（ADR-007 H3）；版本 bump 不追溯（旧证明按 v1 复算不变）',
      breakingBoundary: '未知/伪造主版本 fail-closed（不静默按新版处理）',
    },
    {
      surface: 'export',
      current: `${facts.exportFormats.join(', ')}（far export 子命令）`,
      minConsumer: 'Trust Receipt JSON/markdown 与 .far-proof 包的第三方验证者',
      migrationNote: 'receipt → receipt-v2 为并存式演进（旧格式继续可导出）',
      breakingBoundary: '.far-proof 必选分量移除 = MAJOR（bundle_verifier required files 是契约）',
    },
  ];
}

// ---------------------------------------------------------------------------
// 矩阵与真实源 sync 检查（fail-closed 发布门）
// ---------------------------------------------------------------------------

/** 发布时登记面快照（矩阵登记 = 人工确认过的消费者契约；真实源漂移必须先更新这里）。 */
export interface DeclaredSurfaceSnapshot {
  readonly cliCommands: readonly string[];
  readonly schemaVersion: number;
  readonly proofRulesetUri: string;
  readonly apiVersion: string;
  readonly exportFormats: readonly string[];
}

export interface CompatSyncCheck {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/**
 * 矩阵登记面 vs 真实源 diff：
 *   - CLI 出现矩阵未登记命令 / 登记命令消失 → fail；
 *   - schema 版本 / proof URI / API 版本 / export 格式漂移 → fail。
 * declared 缺省 = 当前真实源自校验（发布时先把快照写进登记面再验）。
 */
export function checkCompatMatrixSync(
  repoRoot: string,
  declared?: DeclaredSurfaceSnapshot,
): CompatSyncCheck {
  const facts = readSurfaceFacts(repoRoot);
  const want = declared ?? {
    cliCommands: facts.cliCommands,
    schemaVersion: facts.schemaVersion,
    proofRulesetUri: facts.proofRulesetUri,
    apiVersion: facts.apiVersion,
    exportFormats: facts.exportFormats,
  };
  const problems: string[] = [];
  const actual = new Set(facts.cliCommands);
  const declaredSet = new Set(want.cliCommands);
  for (const cmd of actual) {
    if (!declaredSet.has(cmd)) problems.push(`CLI command '${cmd}' exists in source but not registered in compat matrix`);
  }
  for (const cmd of declaredSet) {
    if (!actual.has(cmd)) problems.push(`CLI command '${cmd}' registered in compat matrix but missing from source`);
  }
  if (want.schemaVersion !== facts.schemaVersion) {
    problems.push(`schema version drift: declared ${want.schemaVersion}, source ${facts.schemaVersion}`);
  }
  if (want.proofRulesetUri !== facts.proofRulesetUri) {
    problems.push(`proof ruleset URI drift: declared ${want.proofRulesetUri}, source ${facts.proofRulesetUri}`);
  }
  if (want.apiVersion !== facts.apiVersion) {
    problems.push(`API version drift: declared ${want.apiVersion}, source ${facts.apiVersion}`);
  }
  const fmtActual = new Set(facts.exportFormats);
  for (const f of want.exportFormats) {
    if (!fmtActual.has(f)) problems.push(`export format '${f}' registered but missing from source`);
  }
  for (const f of fmtActual) {
    if (!want.exportFormats.includes(f)) problems.push(`export format '${f}' exists in source but not registered`);
  }
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// 历史证明兼容实证（旧客户端/旧证明 × 当前验证器）
// ---------------------------------------------------------------------------

export interface HistoricalProofCheck {
  readonly ok: boolean;
  readonly envelopeCount: number;
  readonly legacyRulesetDispatch: 'v1 (null URI → legacy dispatch)';
  readonly problems: readonly string[];
}

/**
 * 用 legacy V1 demo 链（无 rulesetUri 的 V1 信封）在当前验证器下重验：
 *   - 导出真实 .far-proof 到临时目录（buildDemoChain + exportFarProof——真数据路径，
 *     无硬编码结果）；
 *   - verifyFarProofBundle(mode 'chain') 独立重算 call_records 哈希链；
 *   - envelope 模式重算 V1 proofHash（dispatchRulesetVerifier(null) → v1 派发）。
 */
export function verifyHistoricalProof(): HistoricalProofCheck {
  const db = new Database(':memory:');
  try {
    return verifyHistoricalProofWithDb(db);
  } finally {
    db.close();
  }
}

function verifyHistoricalProofWithDb(db: Database.Database): HistoricalProofCheck {
  buildDemoChain(db);
  const tmp = mkdtempSync(join(crossPlatformTmpDir(), 'far-hist-proof-'));
  const bundleDir = join(tmp, 'legacy.far-proof');
  mkdirSync(bundleDir, { recursive: true });
  try {
    exportFarProof({
      db,
      outputDir: bundleDir,
      runId: DEMO_RUN_ID,
      modelSnapshot: 'offline-replay-fixture@v1',
      gitCommitSha: DEMO_GIT_COMMIT_SHA,
      envHash: computeEnvHash({
        schemaVersion: 6,
        nodeVersion: process.version,
        providerProfile: 'offline_replay',
      }),
      exportedAt: '2026-01-01T00:00:00.000Z',
    });
    const chainResult = verifyFarProofBundle(bundleDir, 'chain');
    const envelopeResult = verifyFarProofBundle(bundleDir, 'envelope');
    const problems: string[] = [];
    if (!chainResult.ok) problems.push(...chainResult.errors);
    if (!envelopeResult.ok) problems.push(...envelopeResult.errors);
    return {
      ok: problems.length === 0,
      envelopeCount: envelopeResult.proofEnvelopeCount,
      legacyRulesetDispatch: 'v1 (null URI → legacy dispatch)',
      problems,
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// CHANGELOG 结构检查
// ---------------------------------------------------------------------------

export interface ChangelogCheck {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/** CHANGELOG 存在性 + Keep-a-Changelog 结构（头部声明 + Unreleased 段 + 分类子段）。 */
export function checkChangelog(repoRoot: string): ChangelogCheck {
  const path = join(repoRoot, 'CHANGELOG.md');
  if (!existsSync(path)) {
    return { ok: false, problems: ['CHANGELOG.md missing'] };
  }
  const text = readFileSync(path, 'utf8');
  const problems: string[] = [];
  if (!text.includes('Keep a Changelog')) problems.push('CHANGELOG lacks Keep-a-Changelog header declaration');
  if (!text.includes('## [Unreleased]')) problems.push('CHANGELOG lacks [Unreleased] section');
  if (!/^### /m.test(text)) problems.push('CHANGELOG lacks categorized subsections (### Added/Changed/...)');
  return { ok: problems.length === 0, problems };
}
