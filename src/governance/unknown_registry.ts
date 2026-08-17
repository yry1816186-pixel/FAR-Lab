// src/governance/unknown_registry.ts
// 职责：Unknown/Assumption 登记引擎 —— lint、stale 检测、结论降级、reopen 传播
// （宪法 GOV-UNKNOWN-001 / GOV-REOPEN-001 的确定性纯函数实现）。
//
// 纪律：
//   1. 全部纯函数、无 IO、无时钟读取 —— 「今天」由调用方显式传入（可测、可回放）。
//   2. fail-closed：非法状态转换抛错，绝不静默接受（如二次失效、对已 RESOLVED 再解决）。
//   3. 传播深度封顶 2（direct=1，impacted=2）：超出登记边的推断必须回到人工审计。
//   4. 本引擎不能证明的：reopen 图只含登记在册的引用边；未登记依赖不传播。

import type {
  AssumptionEntry,
  DegradedConclusion,
  GovernanceRegistry,
  LintOptions,
  LintViolation,
  ReopenEvent,
  StaleAssumption,
  TriggerEvent,
  TriggerOutcome,
  UnknownEntry,
} from './types.ts';

/** YYYY-MM-DD → 自 epoch 的天数（无时区陷阱的纯算术；非法格式返回 NaN）。 */
function dateToDay(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m === null) return Number.NaN;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // 公历日序（Julian day 数的简化等价物）：仅用于差值，绝对值无意义。
  return year * 365 + Math.floor(month * 30.44) + day;
}

// ---------------------------------------------------------------------------
// lint —— 登记完整性
// ---------------------------------------------------------------------------

/** 校验登记簿：ID 唯一、生命周期字段完整、引用边不悬空。 */
export function lintRegistry(
  registry: GovernanceRegistry,
  options: LintOptions = {},
): LintViolation[] {
  const violations: LintViolation[] = [];
  const seen = new Set<string>();

  for (const u of registry.unknowns) {
    if (seen.has(u.id)) {
      violations.push({ rule: 'duplicate_id', entryId: u.id, detail: `unknown id '${u.id}' already registered` });
    }
    seen.add(u.id);
    if (u.status === 'RESOLVED' && u.resolutionEvidence.length === 0) {
      violations.push({
        rule: 'unknown_resolved_without_evidence',
        entryId: u.id,
        detail: 'RESOLVED unknown must carry non-empty resolutionEvidence (no evidence, no resolution)',
      });
    }
    if (u.status === 'RESOLVED' && u.resolvedAt === null) {
      violations.push({
        rule: 'unknown_resolved_without_evidence',
        entryId: u.id,
        detail: 'RESOLVED unknown must record resolvedAt',
      });
    }
    if (u.status === 'ABANDONED' && u.resolvedAt === null) {
      violations.push({
        rule: 'unknown_abandoned_without_reason',
        entryId: u.id,
        detail: 'ABANDONED unknown must record resolvedAt (the abandonment decision date)',
      });
    }
  }

  for (const a of registry.assumptions) {
    if (seen.has(a.id)) {
      violations.push({ rule: 'duplicate_id', entryId: a.id, detail: `assumption id '${a.id}' already registered` });
    }
    seen.add(a.id);
    if (a.reviewDate === null && a.reviewEvent === null) {
      violations.push({
        rule: 'assumption_missing_review_anchor',
        entryId: a.id,
        detail: 'assumption needs reviewDate or reviewEvent (constitution: review date/event)',
      });
    }
    if (a.status === 'INVALIDATED' && (a.invalidationReason === null || a.invalidationReason === '')) {
      violations.push({
        rule: 'assumption_invalidated_without_reason',
        entryId: a.id,
        detail: 'INVALIDATED assumption must record invalidationReason',
      });
    }
    if (a.status === 'ACTIVE' && a.invalidationReason !== null) {
      violations.push({
        rule: 'assumption_invalidated_without_reason',
        entryId: a.id,
        detail: 'ACTIVE assumption must not carry invalidationReason (that is INVALIDATED state)',
      });
    }
  }

  if (options.knownItemIds !== undefined) {
    const known = new Set(options.knownItemIds);
    const checkRefs = (entryId: string, refs: readonly string[], kind: string): void => {
      for (const ref of refs) {
        if (!known.has(ref)) {
          violations.push({
            rule: 'dangling_reference',
            entryId,
            detail: `${kind} references unknown item '${ref}' (not in provided known-item set)`,
          });
        }
      }
    };
    for (const u of registry.unknowns) checkRefs(u.id, u.blocking, 'blocking');
    for (const a of registry.assumptions) checkRefs(a.id, a.affectedDecisions, 'affectedDecisions');
  }

  return violations;
}

// ---------------------------------------------------------------------------
// stale —— 过期假设检测
// ---------------------------------------------------------------------------

/** ACTIVE 且 reviewDate < today 的假设视为过期（reviewDate 当天不算过期）。 */
export function findStaleAssumptions(
  registry: GovernanceRegistry,
  today: string,
): StaleAssumption[] {
  const stale: StaleAssumption[] = [];
  const todayDay = dateToDay(today);
  for (const a of registry.assumptions) {
    if (a.status !== 'ACTIVE' || a.reviewDate === null) continue;
    const reviewDay = dateToDay(a.reviewDate);
    if (Number.isNaN(todayDay) || Number.isNaN(reviewDay)) continue;
    if (reviewDay < todayDay) {
      stale.push({ id: a.id, reviewDate: a.reviewDate, daysOverdue: todayDay - reviewDay });
    }
  }
  return stale.sort((x, y) => x.id.localeCompare(y.id));
}

/** 结论降级面：依赖已失效/过期假设的每个决策都必须降级（GOV-UNKNOWN-001 Failure 分支）。 */
export function degradedConclusions(
  registry: GovernanceRegistry,
  today: string,
): DegradedConclusion[] {
  const staleIds = new Set(findStaleAssumptions(registry, today).map((s) => s.id));
  const degraded: DegradedConclusion[] = [];
  for (const a of registry.assumptions) {
    if (a.status !== 'ACTIVE' && a.status !== 'INVALIDATED') continue;
    const cause = a.status === 'INVALIDATED' ? 'invalidated' : staleIds.has(a.id) ? 'stale' : null;
    if (cause === null) continue;
    for (const decisionId of a.affectedDecisions) {
      degraded.push({ decisionId, assumptionId: a.id, cause });
    }
  }
  return degraded.sort((x, y) => x.decisionId.localeCompare(y.decisionId) || x.assumptionId.localeCompare(y.assumptionId));
}

// ---------------------------------------------------------------------------
// reopen 传播
// ---------------------------------------------------------------------------

function buildAffectedGraph(events: readonly ReopenEvent[]): Map<string, ReopenEvent[]> {
  const graph = new Map<string, ReopenEvent[]>();
  for (const e of events) {
    const list = graph.get(e.subjectId);
    if (list === undefined) graph.set(e.subjectId, [e]);
    else list.push(e);
  }
  return graph;
}

/**
 * 深度 2 传播：任何 ACTIVE 假设若其 affectedDecisions 命中已被重开（kind=reopen）的主体，
 * 该假设标记 impacted（支撑面被重开 → 假设必须复查）。更深链路不自动传播（见文件头纪律 3）。
 */
function propagateImpacted(
  registry: GovernanceRegistry,
  reopenedIds: ReadonlySet<string>,
  baseSeq: number,
  at: string,
  trigger: ReopenEvent['trigger'],
  causeRef: string,
  reason: string,
): ReopenEvent[] {
  const events: ReopenEvent[] = [];
  let seq = baseSeq;
  for (const a of registry.assumptions) {
    if (a.status !== 'ACTIVE') continue;
    const hit = a.affectedDecisions.find((d) => reopenedIds.has(d));
    if (hit === undefined) continue;
    events.push({
      seq: seq++,
      at,
      trigger,
      kind: 'impacted',
      subjectId: a.id,
      via: 'propagated',
      chainDepth: 2,
      causeRef,
      reason: `assumption '${a.id}' affects reopened subject '${hit}' — ${reason}`,
    });
  }
  return events.sort((x, y) => x.subjectId.localeCompare(y.subjectId));
}

function cloneRegistry(registry: GovernanceRegistry): GovernanceRegistry {
  return {
    unknowns: registry.unknowns.map((u) => ({
      ...u,
      blocking: [...u.blocking],
      targetEvidence: [...u.targetEvidence],
      resolutionEvidence: [...u.resolutionEvidence],
    })),
    assumptions: registry.assumptions.map((a) => ({
      ...a,
      evidence: [...a.evidence],
      affectedDecisions: [...a.affectedDecisions],
    })),
  };
}

export class GovernanceTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GovernanceTransitionError';
  }
}

/**
 * 统一触发器入口（GOV-REOPEN-001 九类触发器 → reopen 事件 + 登记状态转换）。
 *
 * invalidated_assumption：假设 ACTIVE→INVALIDATED，affectedDecisions 全部重开（direct）。
 * new_evidence + unknownId：未知项 →RESOLVED（要求非空 resolutionEvidence），blocking 全部重开
 *   （解决即新证据到达——阻塞项的旧结论必须重估）。
 * 其余七类：显式 subjectIds 直接重开（direct）。
 * 三类都做深度 2 impacted 传播。
 */
export function applyTrigger(
  registry: GovernanceRegistry,
  event: TriggerEvent,
  baseSeq = 0,
): TriggerOutcome {
  const next = cloneRegistry(registry);
  const events: ReopenEvent[] = [];
  let seq = baseSeq;
  const reopenIds = new Set<string>();

  const emitReopen = (subjectId: string, causeRef: string, reason: string, depth: 1 | 2 = 1): void => {
    reopenIds.add(subjectId);
    events.push({
      seq: seq++,
      at: event.at,
      trigger: event.trigger,
      kind: 'reopen',
      subjectId,
      via: depth === 1 ? 'direct' : 'propagated',
      chainDepth: depth,
      causeRef,
      reason,
    });
  };

  if (event.trigger === 'invalidated_assumption') {
    const idx = next.assumptions.findIndex((a) => a.id === event.assumptionId);
    if (idx === -1) {
      throw new GovernanceTransitionError(`assumption '${event.assumptionId}' not registered`);
    }
    const target = next.assumptions[idx] as AssumptionEntry;
    if (target.status !== 'ACTIVE') {
      throw new GovernanceTransitionError(
        `assumption '${event.assumptionId}' is ${target.status}, only ACTIVE assumptions can be invalidated`,
      );
    }
    next.assumptions[idx] = {
      ...target,
      status: 'INVALIDATED',
      invalidatedAt: event.at,
      invalidationReason: event.reason,
    };
    for (const decisionId of target.affectedDecisions) {
      emitReopen(
        decisionId,
        target.id,
        `assumption '${target.id}' invalidated (${event.reason}) — dependent conclusion reopened`,
      );
    }
  } else if (event.trigger === 'new_evidence' && 'unknownId' in event) {
    if (event.resolutionEvidence.length === 0) {
      throw new GovernanceTransitionError(
        'resolving an unknown requires non-empty resolutionEvidence (no evidence, no resolution)',
      );
    }
    const idx = next.unknowns.findIndex((u) => u.id === event.unknownId);
    if (idx === -1) {
      throw new GovernanceTransitionError(`unknown '${event.unknownId}' not registered`);
    }
    const target = next.unknowns[idx] as UnknownEntry;
    if (target.status === 'RESOLVED' || target.status === 'ABANDONED') {
      throw new GovernanceTransitionError(
        `unknown '${event.unknownId}' already ${target.status} — terminal lifecycle states are immutable`,
      );
    }
    next.unknowns[idx] = {
      ...target,
      status: 'RESOLVED',
      resolvedAt: event.at,
      resolutionEvidence: [...event.resolutionEvidence],
    };
    for (const blockedId of target.blocking) {
      emitReopen(
        blockedId,
        target.id,
        `unknown '${target.id}' resolved — previously blocked conclusion must be re-evaluated`,
      );
    }
  } else if ('subjectIds' in event) {
    if (event.subjectIds.length === 0) {
      throw new GovernanceTransitionError('explicit-trigger reopen requires at least one subjectId');
    }
    for (const subjectId of event.subjectIds) {
      emitReopen(subjectId, event.causeRef, event.reason);
    }
  } else {
    // 判别联合已穷举；此分支防御性兜底（不可达）。
    throw new GovernanceTransitionError(`unsupported trigger shape: ${JSON.stringify(event)}`);
  }

  const impacted = propagateImpacted(
    next,
    reopenIds,
    seq,
    event.at,
    event.trigger,
    event.trigger === 'invalidated_assumption'
      ? event.assumptionId
      : 'unknownId' in event
        ? event.unknownId
        : event.causeRef,
    event.trigger === 'invalidated_assumption'
      ? 'supporting assumption invalidated'
      : 'supporting subject reopened',
  );
  events.push(...impacted);

  const ordered = [...events].sort(
    (x, y) => x.chainDepth - y.chainDepth || x.subjectId.localeCompare(y.subjectId),
  );
  // 重排后重编 seq（账目序号按最终顺序连续）。
  const renumbered = ordered.map((e, i) => ({ ...e, seq: baseSeq + i }));

  return { registry: next, events: renumbered, affectedGraph: buildAffectedGraph(renumbered) };
}

/** reopen 账目追加（不可变）：返回追加后的完整 log。重复 seq 拒绝（账目完整性）。 */
export function appendReopenLog(
  existingLog: readonly ReopenEvent[],
  newEvents: readonly ReopenEvent[],
): ReopenEvent[] {
  const maxSeq = existingLog.reduce((m, e) => Math.max(m, e.seq), -1);
  for (const e of newEvents) {
    if (e.seq <= maxSeq) {
      throw new GovernanceTransitionError(
        `reopen event seq ${e.seq} overlaps existing log (max ${maxSeq}) — append-only violated`,
      );
    }
  }
  return [...existingLog, ...newEvents];
}
