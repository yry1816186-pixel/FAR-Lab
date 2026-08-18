/**
 * evidence/source_status — RET-RETRACTION-001：撤稿与更正状态检查 + 传播 + 缓存失效 + 报告展示。
 *
 * 职责（宪法 T0 逐项）：
 *   - SourceStatusRecord：status ∈ retracted / corrected / expression_of_concern /
 *     version_update / ok + checkedAt + sourceId + 依据引用（evidenceRef：指向撤稿通告/
 *     更正通告的可验证标识）。
 *   - checkSourceStatus(sourceId, notices)：对显式提供的通告注册表做确定性查表——
 *     无命中 → status 'ok'（诚实注记：这是「供给的注册表内无通告」，不是「源端无通告」
 *     的断言）。本模块离线、无网络——通告数据由检索层/调用方供给。
 *   - propagateSourceStatus(deps, record)：claim→evidence 依赖图传播——
 *     · retracted 证据：不得作为未标记的正向支持；强制 verdictImpact REOPEN（受影响
 *       结论重开重裁），证据处置显式 kind 标注（research_history 研究史 /
 *       counter_example 反证·错误案例——绝不默默保留 SUPPORTS 身份）；
 *     · corrected / expression_of_concern / version_update → QUALIFIED 标记传播；
 *     · ok → NONE。
 *   - SourceStatusCache：statusVersion 版本化缓存——状态类记录（非 ok）写入时 bump
 *     版本；读取到旧版本条目 → InvalidatedCacheError（拒绝陈旧缓存，不静默使用）。
 *   - renderSourceStatusSection：报告展示——retracted 显式渲染（绝不静默）；空输入
 *     渲染显式「未检查」声明（absence of notice ≠ notice of absence）。
 *
 * 图来源（诚实标注）：本模块不内置 claim→evidence 依赖图——仓库内无现成独立依赖图
 * 模块（evidence_log/lifecycle 是状态机不是依赖图）；依赖清单由调用方显式传入
 * （ClaimEvidenceDependency[]），来源如实记录在 propagation 结果中。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - 本模块证明「已知通告下依赖结论必须重开/限定」；不证明通告注册表本身完备
 *     （未收录的撤稿检测不到——那是检索层 Crossref/OpenAlex 通告面的职责）。
 *   - verdictImpact REOPEN 是「必须重裁」的标记，不是重裁本身——重算由裁决内核
 *     消费方执行；本模块不改写任何已落盘裁决。
 *   - 缓存版本号由调用方/写入方维护，本模块不做跨进程持久化（内存缓存语义）。
 *
 * Determinism：纯函数 + 显式 ISO 时间戳（调用方提供）；无时钟、无随机、无网络。No LLM。
 */

// ---------------------------------------------------------------------------
// 状态记录与查表
// ---------------------------------------------------------------------------

/** 源状态类别（宪法 RET-RETRACTION-001 五态）。 */
export type SourceStatusKind = 'retracted' | 'corrected' | 'expression_of_concern' | 'version_update' | 'ok';

/** 单一来源的状态记录。 */
export interface SourceStatusRecord {
  /** 来源标识（DOI / documentId / persistent identifier）。 */
  readonly sourceId: string;
  readonly status: SourceStatusKind;
  /** 检查时间（ISO——调用方提供，模块不读时钟）。 */
  readonly checkedAt: string;
  /** 依据引用：可验证的通告标识（如撤稿通告 DOI、publisher notice id）。ok 时可为 null。 */
  readonly evidenceRef: string | null;
  readonly note?: string;
}

export interface CheckSourceStatusResult extends SourceStatusRecord {
  /** 命中注册表中的通告（false = 注册表内无记录 → 如实报 ok + 注记）。 */
  readonly matched: boolean;
}

/**
 * 确定性查表：notices 中 sourceId 精确匹配 → 该记录；无匹配 → ok（matched=false，
 * note 明示「供给注册表内无通告」——不假装证明了源端无撤稿）。
 */
export function checkSourceStatus(
  sourceId: string,
  notices: readonly SourceStatusRecord[],
  checkedAt: string,
): CheckSourceStatusResult {
  if (sourceId.trim().length === 0) throw new Error('checkSourceStatus: sourceId must be non-empty');
  const hit = notices.find((n) => n.sourceId === sourceId);
  if (hit !== undefined) return { ...hit, matched: true };
  return {
    sourceId,
    status: 'ok',
    checkedAt,
    evidenceRef: null,
    matched: false,
    note: 'no notice found in the SUPPLIED registry — this is not an assertion that the source has none',
  };
}

// ---------------------------------------------------------------------------
// 依赖清单 + 传播
// ---------------------------------------------------------------------------

/** 证据对 claim 的关系（依赖清单显式传入——图来源见模块头诚实标注）。 */
export type EvidenceRelation = 'SUPPORTS' | 'REFUTES' | 'QUALIFIES';

/** claim→evidence 依赖边（显式依赖清单的一行）。 */
export interface ClaimEvidenceDependency {
  readonly claimId: string;
  readonly evidenceId: string;
  readonly sourceId: string;
  readonly relation: EvidenceRelation;
}

/** 撤稿证据的显式用途标注（绝不作为未标记正向支持）。 */
export type RetractedEvidenceRole = 'research_history' | 'counter_example';

export interface EvidenceDisposition {
  readonly evidenceId: string;
  readonly sourceId: string;
  readonly originalRelation: EvidenceRelation;
  /** research_history / counter_example：撤稿证据的显式去向；qualified：更正/关注表情标记；unchanged：不受影响。 */
  readonly disposition: RetractedEvidenceRole | 'qualified' | 'unchanged';
  readonly reason: string;
}

export type VerdictImpact = 'REOPEN' | 'QUALIFIED' | 'NONE';

export interface ClaimStatusPropagation {
  readonly claimId: string;
  readonly verdictImpact: VerdictImpact;
  readonly evidenceDispositions: readonly EvidenceDisposition[];
  readonly reason: string;
}

export interface PropagationResult {
  readonly statusRecord: SourceStatusRecord;
  readonly claimPropagations: readonly ClaimStatusPropagation[];
  /** 受影响（REOPEN 或 QUALIFIED）的 claim 数。 */
  readonly affectedClaimCount: number;
  /** 依赖图来源（诚实标注：显式传入清单）。 */
  readonly dependencyGraphSource: 'explicit-caller-supplied-manifest';
}

/**
 * 撤稿/更正状态传播（RET-RETRACTION-001 核心）：
 * - retracted：该 source 的每条依赖边 → 证据处置显式标注（默认 research_history，
 *   可选 counter_example），关联 claim verdictImpact=REOPEN（SUPPORTS 或 REFUTES 证据
 *   被撤稿同样污染裁决基础——保守重开，绝不静默保留）。
 * - corrected / expression_of_concern / version_update → QUALIFIED 标记传播。
 * - ok → NONE（无传播）。
 */
export function propagateSourceStatus(
  deps: readonly ClaimEvidenceDependency[],
  record: SourceStatusRecord,
  opts: { retractedRole?: RetractedEvidenceRole } = {},
): PropagationResult {
  const role: RetractedEvidenceRole = opts.retractedRole ?? 'research_history';
  const byClaim = new Map<string, ClaimEvidenceDependency[]>();
  for (const d of deps) {
    if (d.sourceId !== record.sourceId) continue;
    const list = byClaim.get(d.claimId) ?? [];
    list.push(d);
    byClaim.set(d.claimId, list);
  }
  const propagations: ClaimStatusPropagation[] = [];
  for (const [claimId, edges] of [...byClaim.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (record.status === 'retracted') {
      propagations.push({
        claimId,
        verdictImpact: 'REOPEN',
        evidenceDispositions: edges.map((e) => ({
          evidenceId: e.evidenceId,
          sourceId: e.sourceId,
          originalRelation: e.relation,
          disposition: role,
          reason:
            e.relation === 'SUPPORTS'
              ? `retracted source cannot remain UNMARKED positive support — reclassified as ${role}; claim verdict must be REOPEN`
              : `retracted source taints the ${e.relation} basis too — evidence reclassified as ${role}; claim verdict must be REOPEN`,
        })),
        reason: `evidence basis includes retracted source ${record.sourceId} (ref ${record.evidenceRef ?? 'n/a'})`,
      });
    } else if (record.status === 'corrected' || record.status === 'expression_of_concern' || record.status === 'version_update') {
      propagations.push({
        claimId,
        verdictImpact: 'QUALIFIED',
        evidenceDispositions: edges.map((e) => ({
          evidenceId: e.evidenceId,
          sourceId: e.sourceId,
          originalRelation: e.relation,
          disposition: 'qualified',
          reason: `source is ${record.status} (ref ${record.evidenceRef ?? 'n/a'}) — evidence carries qualification marker`,
        })),
        reason: `evidence basis includes ${record.status} source ${record.sourceId}`,
      });
    } else {
      propagations.push({
        claimId,
        verdictImpact: 'NONE',
        evidenceDispositions: edges.map((e) => ({
          evidenceId: e.evidenceId,
          sourceId: e.sourceId,
          originalRelation: e.relation,
          disposition: 'unchanged',
          reason: 'source status ok — no propagation',
        })),
        reason: 'source status ok',
      });
    }
  }
  return {
    statusRecord: record,
    claimPropagations: propagations,
    affectedClaimCount: propagations.filter((p) => p.verdictImpact !== 'NONE').length,
    dependencyGraphSource: 'explicit-caller-supplied-manifest',
  };
}

// ---------------------------------------------------------------------------
// 版本化缓存（旧版本读取 → 拒绝）
// ---------------------------------------------------------------------------

/** 陈旧缓存读取错误（fail-closed：拒绝旧 statusVersion 条目，绝不静默使用）。 */
export class InvalidatedCacheError extends Error {
  readonly sourceId: string;
  readonly entryVersion: number;
  readonly currentVersion: number;

  constructor(sourceId: string, entryVersion: number, currentVersion: number) {
    super(
      `source-status cache entry for '${sourceId}' is stale (entry version ${entryVersion} < current ${currentVersion}) — re-fetch before use`,
    );
    this.name = 'InvalidatedCacheError';
    this.sourceId = sourceId;
    this.entryVersion = entryVersion;
    this.currentVersion = currentVersion;
  }
}

interface CacheEntry {
  readonly record: SourceStatusRecord;
  readonly statusVersion: number;
}

export interface SourceStatusCache {
  /** 当前缓存代（每次状态类写入 +1；ok 写入不 bump）。 */
  currentVersion: number;
  readonly entries: ReadonlyMap<string, CacheEntry>;
}

/** 创建版本化缓存（初始版本由调用方指定——跨会话续号时如实传入）。 */
export function createSourceStatusCache(initialVersion = 1): SourceStatusCache {
  return { currentVersion: initialVersion, entries: new Map() };
}

/**
 * 写入状态记录。retracted/corrected/expression_of_concern/version_update → 先 bump
 * statusVersion 再写入（所有旧条目即刻失效）；ok → 不 bump（ok 不改变失效语义）。
 */
export function recordSourceStatus(cache: SourceStatusCache, record: SourceStatusRecord): SourceStatusCache {
  const isStateful = record.status !== 'ok';
  const nextVersion = isStateful ? cache.currentVersion + 1 : cache.currentVersion;
  const entries = new Map(cache.entries);
  entries.set(record.sourceId, { record, statusVersion: nextVersion });
  return { currentVersion: nextVersion, entries };
}

/**
 * 读取状态记录：条目版本 < 缓存当前版本 → InvalidatedCacheError（陈旧拒绝）；
 * 无条目 → null（未缓存，调用方应检查）；新鲜 → 记录。
 */
export function readSourceStatus(cache: SourceStatusCache, sourceId: string): SourceStatusRecord | null {
  const entry = cache.entries.get(sourceId);
  if (entry === undefined) return null;
  if (entry.statusVersion < cache.currentVersion) {
    throw new InvalidatedCacheError(sourceId, entry.statusVersion, cache.currentVersion);
  }
  return entry.record;
}

// ---------------------------------------------------------------------------
// 报告展示（retracted 显式渲染，绝不静默）
// ---------------------------------------------------------------------------

const STATUS_LABEL: Readonly<Record<SourceStatusKind, string>> = Object.freeze({
  retracted: 'RETRACTED',
  corrected: 'CORRECTED',
  expression_of_concern: 'EXPRESSION_OF_CONCERN',
  version_update: 'VERSION_UPDATE',
  ok: 'OK',
});

/**
 * 渲染 source-status 报告段（纯文本/markdown 行）。retracted 必须显式出现；
 * 空输入渲染显式「未检查」声明（absence of notice ≠ notice of absence）。
 */
export function renderSourceStatusSection(
  records: readonly SourceStatusRecord[],
  propagation?: PropagationResult,
): string {
  const lines: string[] = ['## Source Status', ''];
  if (records.length === 0) {
    lines.push(
      '- No source-status records — status check NOT performed; absence of a notice here is unknown, not asserted.',
    );
  } else {
    for (const r of [...records].sort((a, b) => (a.sourceId < b.sourceId ? -1 : 1))) {
      const label = STATUS_LABEL[r.status];
      const marker = r.status === 'retracted' ? '⚠' : r.status === 'ok' ? '·' : '!';
      lines.push(
        `- ${marker} ${label} — ${r.sourceId} (checked ${r.checkedAt}, ref ${r.evidenceRef ?? 'n/a'}${r.note !== undefined ? `; ${r.note}` : ''})`,
      );
    }
  }
  if (propagation !== undefined) {
    lines.push('', '### Status propagation', '');
    if (propagation.claimPropagations.length === 0) {
      lines.push(`- No claim depends on source ${propagation.statusRecord.sourceId} in the supplied manifest.`);
    } else {
      for (const p of propagation.claimPropagations) {
        lines.push(`- Claim ${p.claimId}: verdictImpact=${p.verdictImpact} — ${p.reason}`);
        for (const d of p.evidenceDispositions) {
          lines.push(`  - evidence ${d.evidenceId} (${d.originalRelation} → ${d.disposition}): ${d.reason}`);
        }
      }
    }
  }
  return lines.join('\n');
}
