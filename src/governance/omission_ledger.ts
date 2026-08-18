/**
 * omission_ledger — GOV-OMISSION-001 轮终高价值遗漏登记。
 *
 * 语义：
 *   - 每轮（batch/milestone）结束主动登记「发现但未做的高价值项」：
 *     { item, valueEstimate(h|mh|ml), sources, clearingCondition, owner,
 *       residualClass }——residualClass 复用 gov_and_gates 的 RESIDUAL_CLASSES
 *     （T1/T2/T3/BLOCKED_EXTERNAL/NOT_APPLICABLE），与 evaluateStopReport 的
 *     残差分类同一词汇表，不另造分类（对齐而非冲突：stop report 断言残差
 *     「已分类」，本台账追踪「谁、何时、凭什么条件清偿」）；
 *   - append-only：registerOmission 追加；clearOmission 必须引用清偿证据
 *     （evidenceRefs 非空）且只允许 open→cleared 单向转移；
 *   - 下轮复盘断言：reviewAtRoundStart(ledger, newRound) 返回上一轮及更早
 *     所有未清偿项——新轮登记时（registerOmission 携带 reviewedOpenIds）
 *     必须逐一列出这些 id（漏看 = 遗忘，fail-closed 拒绝登记）。
 *
 * 确定性：纯函数 + 显式时间注入（clearedAt 由调用方传入），无 IO 无时钟。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - 台账证明「已发现的高价值遗漏被持续追踪直至清偿或显式放弃」——它
 *     不证明发现面完备（没发现的遗漏不在台账里；发现面靠轮终清单源
 *     requirements/failures/FCS/benchmark slices 的自觉）；
 *   - valueEstimate 是登记时的主观估计，不证明事后价值兑现；
 *   - 清偿证据引用的真实性由证据链自身保证，本台账只强制「非空且指向
 *     显式声明的证据形态」。
 */

import { RESIDUAL_CLASSES } from '../gates/gov_and_gates.ts';

/** 价值估计三档（h=high / mh=medium-high / ml=medium-low）。 */
export const VALUE_ESTIMATES = ['h', 'mh', 'ml'] as const;
export type ValueEstimate = (typeof VALUE_ESTIMATES)[number];
export type ResidualClass = (typeof RESIDUAL_CLASSES)[number];

/** 轮终遗漏来源类别（宪法 GOV-OMISSION-001 列举面）。 */
export const OMISSION_SOURCES = [
  'requirements', 'failures-unknowns', 'fcs', 'benchmark-error-slices', 'scenario-ledger',
  'threat-model', 'usability', 'issue-community', 'architecture-fitness', 'world-class-scorecard',
  'fresh-clone-offline',
] as const;
export type OmissionSource = (typeof OMISSION_SOURCES)[number];

export interface OmissionEntry {
  readonly id: string;
  /** 发现轮次（如 'day-r9' / 'milestone-m3'）。 */
  readonly discoveredInRound: string;
  readonly item: string;
  readonly valueEstimate: ValueEstimate;
  readonly sources: readonly OmissionSource[];
  /** 清偿条件（可客观判定的完成标准——非空强制）。 */
  readonly clearingCondition: string;
  readonly owner: string;
  readonly residualClass: ResidualClass;
  readonly status: 'open' | 'cleared';
  /** 清偿证据引用（status=cleared 时必填非空）。 */
  readonly evidenceRefs: readonly string[];
  /** 清偿时间（ISO date；open 时为 null）。 */
  readonly clearedOn: string | null;
}

export interface OmissionLedger {
  readonly entries: readonly OmissionEntry[];
}

export type LedgerResult<T> = { readonly ok: true; readonly ledger: T } | { readonly ok: false; readonly problem: string };

function validateCore(entry: OmissionEntry, problem: (msg: string) => void): void {
  if (entry.id.trim().length === 0) problem('id must be non-empty');
  if (entry.discoveredInRound.trim().length === 0) problem(`${entry.id}: discoveredInRound must be non-empty`);
  if (entry.item.trim().length === 0) problem(`${entry.id}: item must be non-empty`);
  if (!VALUE_ESTIMATES.includes(entry.valueEstimate)) problem(`${entry.id}: valueEstimate must be h|mh|ml`);
  if (entry.sources.length === 0 || entry.sources.some((s) => !OMISSION_SOURCES.includes(s))) {
    problem(`${entry.id}: sources must be non-empty and drawn from OMISSION_SOURCES`);
  }
  if (entry.clearingCondition.trim().length === 0) problem(`${entry.id}: clearingCondition must be non-empty`);
  if (entry.owner.trim().length === 0) problem(`${entry.id}: owner must be non-empty`);
  if (!RESIDUAL_CLASSES.includes(entry.residualClass)) problem(`${entry.id}: residualClass must be one of ${RESIDUAL_CLASSES.join('|')}`);
}

/** 未清偿项（open）——复盘与下轮登记断言的输入。 */
export function openOmissions(ledger: OmissionLedger): readonly OmissionEntry[] {
  return ledger.entries.filter((e) => e.status === 'open');
}

/**
 * 轮始复盘：返回 newRound 之前所有轮次登记且仍未清偿的项（按 discoveredInRound
 * 升序、id 字典序——确定性）。这是「下轮必须复盘」断言的数据面。
 */
export function reviewAtRoundStart(ledger: OmissionLedger, newRound: string): readonly OmissionEntry[] {
  return openOmissions(ledger)
    .filter((e) => e.discoveredInRound !== newRound)
    .sort((a, b) =>
      a.discoveredInRound < b.discoveredInRound ? -1 : a.discoveredInRound > b.discoveredInRound ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
}

export interface RegisterOptions {
  /** 新轮登记时对全部既有未清偿项的复盘确认（必须逐 id 列出——宪法断言）。 */
  readonly reviewedOpenIds?: readonly string[];
}

/**
 * 登记一条遗漏（append-only）。id 重复 → 拒绝。新条目必须是 open 状态、
 * 无清偿字段（登记与清偿是两个独立动作）。
 * 若存在既有未清偿项且 reviewedOpenIds 未逐一覆盖 → 拒绝登记（漏看防线的
 * 机器面：新轮不能假装旧遗漏不存在）。
 */
export function registerOmission(ledger: OmissionLedger, entry: OmissionEntry, options: RegisterOptions = {}): LedgerResult<OmissionLedger> {
  const problems: string[] = [];
  validateCore(entry, (m) => problems.push(m));
  if (entry.status !== 'open') problems.push(`${entry.id}: new omissions register as open (clearing is a separate action via clearOmission)`);
  if (entry.evidenceRefs.length > 0) problems.push(`${entry.id}: evidenceRefs must be empty at registration`);
  if (entry.clearedOn !== null) problems.push(`${entry.id}: clearedOn must be null at registration`);
  if (ledger.entries.some((e) => e.id === entry.id)) problems.push(`${entry.id}: duplicate omission id (append-only ledger)`);
  if (problems.length > 0) return { ok: false, problem: problems.join('; ') };

  const open = openOmissions(ledger).filter((e) => e.id !== entry.id);
  if (open.length > 0) {
    const reviewed = new Set(options.reviewedOpenIds ?? []);
    const missed = open.filter((e) => !reviewed.has(e.id)).map((e) => e.id);
    if (missed.length > 0) {
      return {
        ok: false,
        problem: `round-start review assertion failed: open omissions not reviewed before registering ${entry.id}: ${missed.join(', ')}`,
      };
    }
  }
  return { ok: true, ledger: { entries: [...ledger.entries, entry] } };
}

/**
 * 清偿一条遗漏（open→cleared 单向）。evidenceRefs 必须非空且每条形如
 * "kind:path"（kind ∈ test|report|pr|doc|cmd）——空证据 = 口头清偿，拒绝。
 */
export function clearOmission(ledger: OmissionLedger, id: string, evidenceRefs: readonly string[], clearedOn: string): LedgerResult<OmissionLedger> {
  const idx = ledger.entries.findIndex((e) => e.id === id);
  if (idx === -1) return { ok: false, problem: `omission ${id} not found` };
  const entry = ledger.entries[idx]!;
  if (entry.status === 'cleared') return { ok: false, problem: `omission ${id} already cleared (append-only: no re-clearing)` };
  const validKinds = new Set(['test', 'report', 'pr', 'doc', 'cmd']);
  const bad = evidenceRefs.filter((r) => {
    const parts = r.split(':');
    const kind = parts[0] ?? '';
    return !validKinds.has(kind) || parts.length < 2 || (parts[1] ?? '').trim().length === 0;
  });
  if (evidenceRefs.length === 0 || bad.length > 0) {
    return { ok: false, problem: `clearing ${id} requires evidence refs shaped kind:path (test|report|pr|doc|cmd), got: ${JSON.stringify(evidenceRefs)}` };
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(clearedOn)) return { ok: false, problem: `clearedOn must be an ISO date, got ${clearedOn}` };
  const entries = ledger.entries.map((e, i) => (i === idx ? { ...e, status: 'cleared' as const, evidenceRefs: [...evidenceRefs], clearedOn } : e));
  return { ok: true, ledger: { entries } };
}

/**
 * 与 evaluateStopReport 的对齐检查：stop report 的 residuals（item 名单）
 * 应与台账 open 项对应——台账里有 stop report 未列的 open 高价值遗漏 →
 * 不一致（stop report 声称的残差分类不完整）。返回未覆盖的 open 项。
 */
export function unreportedOpenOmissions(ledger: OmissionLedger, stopReportResidualItems: readonly string[]): readonly OmissionEntry[] {
  const reported = new Set(stopReportResidualItems);
  return openOmissions(ledger).filter((e) => !reported.has(e.item));
}
