// src/evaluation/usability.ts
// 职责：EVAL-USABILITY-001 核心旅程代表性用户证据的机制层（参与者协议/
// 任务脚本/指标记录器/分组报告模板）。
//
// 宪法条款：参与者数量、角色和任务由 release profile 设定；记录 completion、
// time-on-task、errors、friction、理解偏差和修复；团队成员 dogfood 与外部/
// 非团队用户测试分开报告；原始记录、隐私处理、问题优先级和修复验证完整；
// Failure：不得声称用户验证完成。
//
// 机制（外部真实用户是外部依赖——本机制提供完整的记录/分组/门控件，
// 不伪造任何外部用户数据）：
//   defineParticipantProtocol   参与者协议（人数/角色/来源/知情同意声明）
//   defineTaskScript            任务脚本（步骤 + 每步成功判据）
//   recordUsabilitySession     单次会话记录（6 指标字段：completion/
//                               time-on-task/errors/friction/理解偏差/修复）
//   privacyCheck                隐私处理检查（记录文本中不得含 PII 模式：
//                               email/电话/身份证样式——命中必须先脱敏）
//   aggregateUsability          分组聚合（dogfood 与 external 永不合并——
//                               分组键是结构性的，聚合函数一次只吃一组）
//   issuePriorityBoard          问题优先级板（频率×严重度矩阵 + 修复验证
//                               状态：每个 issue 有 verifiedFix 才算闭环）
//   userValidationClaimGate     声称门：零外部会话 → 不得声称「用户验证完成」
//
// Cannot-prove：本机制证明「记录结构完整、dogfood/外部严格分开、PII 模式
// 扫描通过、问题闭环状态如实」，不证明 (a) 外部用户测试真的发生（外部
// 会话由真实外部测试供给——机制无法生成，只能拒绝无数据的声称）；
// (b) PII 扫描清单之外的隐私泄露（自由文本中的非模式化 PII 漏检）；
// (c) 任务成功判据的产品合理性（判据是产品决策）。

// ---------------------------------------------------------------------------
// 参与者协议 + 任务脚本
// ---------------------------------------------------------------------------

export type ParticipantCohort = 'team-dogfood' | 'external-user';

export interface ParticipantProtocol {
  /** 计划参与人数（release profile 设定）。 */
  readonly plannedCount: number;
  /** 参与者组别（dogfood vs external 是结构字段，不是自由文本）。 */
  readonly cohort: ParticipantCohort;
  /** 角色清单（如 '.domain-scientist' / 'ml-engineer'）。 */
  readonly roles: readonly string[];
  /** 知情同意声明引用（外部用户必须有；dogfood 可豁免但须显式声明）。 */
  readonly consentRef: string | null;
}

/** 参与者协议校验：外部用户无知情同意引用 → 拒绝（伦理门）。 */
export function validateParticipantProtocol(p: ParticipantProtocol): { readonly ok: boolean; readonly problems: readonly string[] } {
  const problems: string[] = [];
  if (p.plannedCount <= 0) problems.push(`plannedCount must be positive (got ${p.plannedCount})`);
  if (p.roles.length === 0) problems.push('roles must list at least one participant role');
  if (p.cohort === 'external-user' && (p.consentRef ?? '').trim().length === 0) {
    problems.push('external-user cohort requires a consent reference — no consent, no study');
  }
  return { ok: problems.length === 0, problems };
}

export interface TaskScriptStep {
  readonly stepId: string;
  readonly instruction: string;
  readonly successCriterion: string;
}

export interface TaskScript {
  readonly taskId: string;
  readonly steps: readonly TaskScriptStep[];
}

/** 任务脚本校验：每步必须有非空成功判据（无判据的步骤不可判完成）。 */
export function validateTaskScript(script: TaskScript): { readonly ok: boolean; readonly problems: readonly string[] } {
  const problems: string[] = [];
  if (script.steps.length === 0) problems.push(`task "${script.taskId}" has no steps`);
  for (const s of script.steps) {
    if (s.successCriterion.trim().length === 0) problems.push(`step "${s.stepId}" of task "${script.taskId}" has no success criterion`);
  }
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// 会话记录（6 指标字段）+ 隐私检查
// ---------------------------------------------------------------------------

export interface UsabilitySession {
  readonly sessionId: string;
  readonly participantId: string;
  readonly cohort: ParticipantCohort;
  readonly taskId: string;
  /** 是否完成全部步骤（成功判据达成）。 */
  readonly completion: boolean;
  /** 任务耗时 ms（time-on-task）。 */
  readonly timeOnTaskMs: number;
  /** 错误次数（操作错误/误导航）。 */
  readonly errors: number;
  /** 摩擦点自由文本记录（含理解偏差）。 */
  readonly frictionNotes: readonly string[];
  /** 理解偏差次数（对任务/术语的误解——friction 的结构化子计数）。 */
  readonly comprehensionMisunderstandings: number;
  /** 已当场修复的问题 id 列表（修复验证的输入）。 */
  readonly fixesApplied: readonly string[];
}

/** PII 模式（email/电话/身份证样式）——隐私处理扫描清单。 */
const PII_PATTERNS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: 'email', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { label: 'phone', pattern: /\b(?:\+?\d{1,3}[- ]?)?(?:1[3-9]\d{9}|\(?\d{3}\)?[- ]\d{3}[- ]\d{4})\b/ },
  { label: 'national-id', pattern: /\b\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/ },
];

/** 隐私检查：会话自由文本（frictionNotes）不得含 PII 模式——命中先脱敏再入库。 */
export function privacyCheck(session: UsabilitySession): { readonly ok: boolean; readonly hits: readonly { readonly sessionId: string; readonly noteIndex: number; readonly label: string }[] } {
  const hits: { sessionId: string; noteIndex: number; label: string }[] = [];
  session.frictionNotes.forEach((note, noteIndex) => {
    for (const { label, pattern } of PII_PATTERNS) {
      if (pattern.test(note)) hits.push({ sessionId: session.sessionId, noteIndex, label });
    }
  });
  return { ok: hits.length === 0, hits };
}

// ---------------------------------------------------------------------------
// 聚合（单组——dogfood 与 external 结构性不可合并）
// ---------------------------------------------------------------------------

export interface UsabilityAggregate {
  readonly cohort: ParticipantCohort;
  readonly taskId: string;
  readonly sessionCount: number;
  readonly completionRate: number;
  /** 中位 time-on-task（ms）——对离群会话稳健。 */
  readonly medianTimeOnTaskMs: number | null;
  readonly meanErrorsPerSession: number;
  readonly meanComprehensionMisunderstandings: number;
  /** 全部摩擦点记录（原始面——聚合不吞并细节）。 */
  readonly frictionNotes: readonly string[];
}

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * 聚合一组会话（单 cohort × 单 task）。混入异 cohort 会话 → throw：
 * dogfood 与外部用户的分母不可混（宪法：分开报告——结构性强制而非约定）。
 */
export function aggregateUsability(sessions: readonly UsabilitySession[]): UsabilityAggregate {
  if (sessions.length === 0) throw new Error('aggregateUsability: no sessions to aggregate');
  const cohorts = new Set(sessions.map((s) => s.cohort));
  if (cohorts.size > 1) {
    throw new Error(`aggregateUsability: mixed cohorts (${[...cohorts].join(' + ')}) — team-dogfood and external-user must be aggregated and reported separately`);
  }
  const taskIds = new Set(sessions.map((s) => s.taskId));
  if (taskIds.size > 1) {
    throw new Error(`aggregateUsability: mixed tasks (${[...taskIds].join(', ')}) — aggregate per task`);
  }
  const cohort = sessions[0]!.cohort;
  const taskId = sessions[0]!.taskId;
  return {
    cohort,
    taskId,
    sessionCount: sessions.length,
    completionRate: sessions.filter((s) => s.completion).length / sessions.length,
    medianTimeOnTaskMs: median(sessions.map((s) => s.timeOnTaskMs)),
    meanErrorsPerSession: sessions.reduce((s, x) => s + x.errors, 0) / sessions.length,
    meanComprehensionMisunderstandings: sessions.reduce((s, x) => s + x.comprehensionMisunderstandings, 0) / sessions.length,
    frictionNotes: sessions.flatMap((s) => s.frictionNotes),
  };
}

/** 分组报告模板：两组各自渲染（一组缺失 → 该段如实「未执行」，不留空冒充）。 */
export function renderUsabilityReport(byCohort: {
  readonly dogfood?: UsabilityAggregate;
  readonly external?: UsabilityAggregate;
}): string {
  const lines: string[] = ['== usability report (cohorts reported separately) =='];
  for (const [label, agg] of [['team-dogfood', byCohort.dogfood], ['external-user', byCohort.external]] as const) {
    if (agg === undefined) {
      lines.push(`[${label}] NOT CONDUCTED — no claims of user validation may cite this cohort`);
      continue;
    }
    lines.push(
      `[${label}] task=${agg.taskId} n=${agg.sessionCount} completion=${(agg.completionRate * 100).toFixed(0)}% median-tot=${agg.medianTimeOnTaskMs ?? 'n/a'}ms mean-errors=${agg.meanErrorsPerSession.toFixed(2)} mean-misunderstandings=${agg.meanComprehensionMisunderstandings.toFixed(2)} friction-notes=${agg.frictionNotes.length}`,
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 问题优先级板 + 修复验证闭环
// ---------------------------------------------------------------------------

export type IssueSeverity = 'blocker' | 'major' | 'minor';

export interface UsabilityIssue {
  readonly issueId: string;
  readonly description: string;
  /** 出现该问题的会话数（频率）。 */
  readonly affectedSessions: number;
  readonly severity: IssueSeverity;
  /** 修复验证引用——null = 未修复/未验证（问题板如实挂账）。 */
  readonly verifiedFixRef: string | null;
}

export interface IssueBoard {
  /** 按 blocker>major>minor、同严重度按 affectedSessions 降序（确定性）。 */
  readonly ordered: readonly UsabilityIssue[];
  readonly openBlockers: number;
  readonly unverifiedFixes: number;
  /** 全部问题闭环（有验证修复）才 true。 */
  readonly allResolved: boolean;
}

const SEVERITY_RANK: Readonly<Record<IssueSeverity, number>> = { blocker: 0, major: 1, minor: 2 };

/** 问题板：优先级排序（频率×严重度）+ 修复验证挂账。 */
export function issuePriorityBoard(issues: readonly UsabilityIssue[]): IssueBoard {
  const ordered = [...issues].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.affectedSessions - a.affectedSessions || (a.issueId < b.issueId ? -1 : 1),
  );
  return {
    ordered,
    openBlockers: issues.filter((i) => i.severity === 'blocker' && i.verifiedFixRef === null).length,
    unverifiedFixes: issues.filter((i) => i.verifiedFixRef === null).length,
    allResolved: issues.length > 0 && issues.every((i) => i.verifiedFixRef !== null),
  };
}

// ---------------------------------------------------------------------------
// 声称门：零外部会话 → 不得声称用户验证完成
// ---------------------------------------------------------------------------

export type UserValidationClaim =
  | { readonly ok: true; readonly externalSessions: number; readonly dogfoodSessions: number }
  | { readonly ok: false; readonly reason: string; readonly externalSessions: number; readonly dogfoodSessions: number };

/**
 * 用户验证声称门：「用户验证完成」的声称必须有 ≥1 真实外部会话支撑；
 * 只有 dogfood → 拒绝（团队自用 ≠ 用户验证——宪法 Failure 条款）。
 * 外部会话本身是外部依赖：本门只能验证「供给的会话里有没有外部数据」，
 * 不能验证会话的真实性（供给方负责——机制不伪造）。
 */
export function userValidationClaimGate(
  sessions: readonly UsabilitySession[],
  claimsUserValidation: boolean,
): UserValidationClaim {
  const externalSessions = sessions.filter((s) => s.cohort === 'external-user').length;
  const dogfoodSessions = sessions.filter((s) => s.cohort === 'team-dogfood').length;
  if (claimsUserValidation && externalSessions === 0) {
    return {
      ok: false,
      reason: `claim of completed user validation rejected: 0 external-user sessions (${dogfoodSessions} dogfood session(s) only) — team dogfood is not user validation`,
      externalSessions,
      dogfoodSessions,
    };
  }
  return { ok: true, externalSessions, dogfoodSessions };
}
