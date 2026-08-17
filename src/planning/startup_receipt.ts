// src/planning/startup_receipt.ts
// 职责：CORE-START-001 —— 会话启动 receipt（读取资产 + baseline + 状态差异的机器可验记录）。
//
// 宪法 §2（新会话首动作）九步协议此前只存在于文字纪律（AGENTS.md §2 + SessionStart hook
// 注入），无可验证工件。本模块把协议产物化为确定性 receipt：
//   1. readAssets —— 宪法/协议/schema/AGENTS/checkpoint/decisions/unknowns 各资产
//      是否存在 + 内容 sha256（「读了什么」可复验，不是口头声明）。
//   2. baseline —— 命令 + 退出码 + 摘要行（凭实跑输入，不由本模块伪造）。
//   3. stateSnapshot —— git 状态（branch/HEAD/dirty 数）+ GATES 视图（T0 pass/total +
//      最高优先级未过项）。与上次持久化 snapshot 的 diff = 「状态差异」。
//
// 设计约束：
//   - 本模块不运行 baseline 命令（那是调用方/agent 的职责——分离执行与记录，receipt
//     只做 fail-closed 结构校验：零 baseline 条目或含失败条目可以入账，但「宣称有
//     baseline 而无实跑输入」在 schema 层拒）。
//   - 确定性：同输入 → 同 receipt（sha256 逐资产；不含时间戳的 diff 计算除外——
//     generatedAt 单列，不参与比较）。
//
// Cannot-prove：receipt 证明「这些文件被读了、这些命令跑了、退出码是多少」被如实记录；
// 不证明记录者真的理解了内容。它把启动协议从口头遵守变成可审计工件。

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const StartupAssetSchema = z.object({
  /** 资产路径（仓库相对）。 */
  path: z.string().min(1),
  /** 是否存在（缺资产是数据不是错误——但宪法核心件缺失由校验层拒绝）。 */
  exists: z.boolean(),
  /** 内容 sha256（exists=false 时为 null）。 */
  sha256: z.string().length(64).nullable(),
});

export const BaselineEntrySchema = z.object({
  /** 门禁名（typecheck/lint/test/...）。 */
  name: z.string().min(1),
  /** 实跑命令。 */
  command: z.string().min(1),
  /** 实跑退出码（未跑 = 不入账，绝不默认通过）。 */
  exitCode: z.number().int(),
  /** 关键输出摘要行（实跑值的转录）。 */
  summary: z.string().min(1),
});

export const GitStateSchema = z.object({
  branch: z.string().min(1),
  head: z.string().min(1),
  /** 脏文件数（status --porcelain 行数）。 */
  dirtyCount: z.number().int().nonnegative(),
});

export const GatesSnapshotSchema = z.object({
  t0Pass: z.number().int().nonnegative(),
  t0Total: z.number().int().nonnegative(),
  /** 最高优先级未通过 T0（GATES notPassing 首项；无 = null）。 */
  topNotPassing: z.string().nullable(),
});

export const StartupReceiptSchema = z.object({
  /** ISO 时间戳（仅记录用，不参与 diff 比较）。 */
  generatedAt: z.string().min(1),
  readAssets: z.array(StartupAssetSchema).min(1),
  /** baseline 实跑账（≥1 条——零 baseline 的启动 receipt 不成立）。 */
  baseline: z.array(BaselineEntrySchema).min(1),
  gitState: GitStateSchema,
  gatesSnapshot: GatesSnapshotSchema,
  /** 本会话计划的最小可验收 batch（objective + 目标需求）。 */
  plannedBatch: z.object({
    objective: z.string().min(1),
    requirementId: z.string().min(1),
  }),
});

export type StartupAsset = z.infer<typeof StartupAssetSchema>;
export type BaselineEntry = z.infer<typeof BaselineEntrySchema>;
export type GitState = z.infer<typeof GitStateSchema>;
export type GatesSnapshot = z.infer<typeof GatesSnapshotSchema>;
export type StartupReceipt = z.infer<typeof StartupReceiptSchema>;

/** 宪法核心启动资产（CORE-START-001 第 1-3 步的读取清单；仓库相对路径）。 */
export const CORE_STARTUP_ASSETS: readonly string[] = [
  '.far/constitution/CORE_CONSTITUTION.md',
  '.far/constitution/DOMAIN_PROTOCOLS.md',
  '.far/constitution/MACHINE_SCHEMAS.yaml',
  'AGENTS.md',
  'docs/development/PROGRESS.md',
  '.far/agent/decisions.md',
  '.far/state/UNKNOWN_REGISTRY.yaml',
  '.far/requirements/GATES.yaml',
];

// ---------------------------------------------------------------------------
// 资产收集 + GATES 解析（确定性）
// ---------------------------------------------------------------------------

export function hashFile(path: string): StartupAsset {
  if (!existsSync(path)) return { path, exists: false, sha256: null };
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
  return { path, exists: true, sha256: digest };
}

export function collectStartupAssets(paths: readonly string[]): readonly StartupAsset[] {
  return paths.map(hashFile);
}

/**
 * 解析 GATES.yaml 的 t0 视图（total / PASS 数 / notPassing 首项）。
 * fail-closed：结构不符（找不到 t0 段或 total/PASS 行）抛错——静默 0 是假绿。
 */
export function parseGatesSnapshot(gatesYamlText: string): GatesSnapshot {
  const lines = gatesYamlText.split('\n');
  const t0Index = lines.findIndex((l) => /^t0:/.test(l));
  if (t0Index === -1) throw new Error('GATES snapshot: no t0 section');
  const section = lines.slice(t0Index, t0Index + 40);

  const totalMatch = section.find((l) => /^\s+total:/.test(l));
  const passMatch = section.find((l) => /^\s+PASS:/.test(l));
  if (totalMatch === undefined || passMatch === undefined) {
    throw new Error('GATES snapshot: missing total/PASS lines in t0 section');
  }
  const t0Total = Number.parseInt(totalMatch.replace(/[^\d]/g, ''), 10);
  const t0Pass = Number.parseInt(passMatch.replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(t0Total) || !Number.isFinite(t0Pass)) {
    throw new Error('GATES snapshot: unparseable total/PASS');
  }

  // notPassing 列表首项（在 PASS 行之后找列表项）
  const notPassingStart = section.findIndex((l) => /^\s+notPassing:/.test(l));
  let topNotPassing: string | null = null;
  if (notPassingStart !== -1) {
    for (const l of section.slice(notPassingStart + 1)) {
      const m = /^\s+-\s+(\S+)/.exec(l);
      if (m === null) break; // 列表结束
      topNotPassing = m[1] ?? null;
      break; // 只取首项
    }
  }
  return { t0Pass, t0Total, topNotPassing };
}

// ---------------------------------------------------------------------------
// 状态差异（与上次持久化 snapshot 对比）
// ---------------------------------------------------------------------------

export interface StartupDiffEntry {
  readonly field: string;
  readonly before: string;
  readonly after: string;
}

/**
 * 当前 receipt 与上次 receipt 的状态差异（gitState + gatesSnapshot + 资产哈希变动）。
 * generatedAt 不参与比较。
 */
export function diffStartupState(
  previous: StartupReceipt,
  current: StartupReceipt,
): readonly StartupDiffEntry[] {
  const diffs: StartupDiffEntry[] = [];

  if (previous.gitState.branch !== current.gitState.branch) {
    diffs.push({ field: 'gitState.branch', before: previous.gitState.branch, after: current.gitState.branch });
  }
  if (previous.gitState.head !== current.gitState.head) {
    diffs.push({ field: 'gitState.head', before: previous.gitState.head, after: current.gitState.head });
  }
  if (previous.gitState.dirtyCount !== current.gitState.dirtyCount) {
    diffs.push({
      field: 'gitState.dirtyCount',
      before: String(previous.gitState.dirtyCount),
      after: String(current.gitState.dirtyCount),
    });
  }
  if (previous.gatesSnapshot.t0Pass !== current.gatesSnapshot.t0Pass) {
    diffs.push({
      field: 'gatesSnapshot.t0Pass',
      before: String(previous.gatesSnapshot.t0Pass),
      after: String(current.gatesSnapshot.t0Pass),
    });
  }
  if ((previous.gatesSnapshot.topNotPassing ?? '-') !== (current.gatesSnapshot.topNotPassing ?? '-')) {
    diffs.push({
      field: 'gatesSnapshot.topNotPassing',
      before: previous.gatesSnapshot.topNotPassing ?? '(none)',
      after: current.gatesSnapshot.topNotPassing ?? '(none)',
    });
  }

  const beforeAssets = new Map(previous.readAssets.map((a) => [a.path, a.sha256]));
  for (const a of current.readAssets) {
    const before = beforeAssets.get(a.path);
    const after = a.sha256;
    if (before !== undefined && before !== after) {
      diffs.push({ field: `asset:${a.path}`, before: before ?? '(absent)', after: after ?? '(absent)' });
    }
  }
  return diffs;
}

// ---------------------------------------------------------------------------
// Receipt 组装 + 校验
// ---------------------------------------------------------------------------

export interface AssembleInput {
  readonly baseline: readonly BaselineEntry[];
  readonly gitState: GitState;
  readonly gatesYamlText: string;
  readonly plannedBatch: { objective: string; requirementId: string };
  readonly assetPaths?: readonly string[];
  readonly generatedAt?: string;
}

export interface AssembleResult {
  readonly receipt: StartupReceipt;
  /** 组装期违规（核心资产缺失等）——receipt 仍产出（如实记录缺失），调用方决定 exit。 */
  readonly warnings: readonly string[];
}

export function assembleStartupReceipt(input: AssembleInput): AssembleResult {
  const assetPaths = input.assetPaths ?? CORE_STARTUP_ASSETS;
  const readAssets = collectStartupAssets(assetPaths);
  const warnings: string[] = [];
  for (const a of readAssets) {
    if (!a.exists) warnings.push(`startup asset missing: ${a.path}`);
  }

  const gatesSnapshot = parseGatesSnapshot(input.gatesYamlText);
  const receipt = StartupReceiptSchema.parse({
    generatedAt: input.generatedAt ?? '1970-01-01T00:00:00Z',
    readAssets,
    baseline: input.baseline,
    gitState: input.gitState,
    gatesSnapshot,
    plannedBatch: input.plannedBatch,
  });
  return { receipt, warnings };
}

/** 完整性门：receipt 结构合法 + 核心资产在 + baseline 全绿（exit 判定用）。 */
export function verifyStartupReceipt(receipt: StartupReceipt): { ok: boolean; problems: readonly string[] } {
  const problems: string[] = [];
  for (const a of receipt.readAssets) {
    if (!a.exists) problems.push(`asset missing: ${a.path}`);
  }
  for (const b of receipt.baseline) {
    if (b.exitCode !== 0) problems.push(`baseline '${b.name}' exit ${b.exitCode}: ${b.summary}`);
  }
  if (receipt.baseline.length === 0) problems.push('baseline empty');
  return { ok: problems.length === 0, problems };
}
