// src/evaluation/prereg.ts
// 职责：EVAL-PREREG-001 公开 benchmark 评估的预注册冻结协议（机器层）。
//
// 宪法条款：评估开始前冻结 question/hypothesis、datasets/tasks、exclusions、
// baselines、metrics、sample size/runs、seeds、statistical analysis、leakage
// probes、stopping rules、hardware/software、cost accounting、failure handling；
// 结果后修改必须在公开报告中列为 deviation。
//
// 机制：
//   freezePrereg     13 节齐全才可冻结 → canonicalHash（SHA256 over canonical
//                    JSON，复用 evidence_log/hasher 的既有哈希 SSOT）
//   verifyExecution  执行时重算执行计划的 hash 与冻结 hash 逐字节比对——
//                    不符 = 篡改/漂移检出（fail-closed）
//   listDeviations   逐节比对冻结 spec 与执行 spec，输出结构化 deviation 清单
//   preregResultGate 三态：PASS_CLEAN（hash 一致）/ PASS_WITH_DECLARED_DEVIATIONS
//                    （有 deviation 但全部显式申报）/ FAIL（有未申报 deviation）
//   概念草案区分     spec.kind='concept-draft' 可冻结但不得绑定结果——只有
//                    'executable-protocol' 可作为结果报告的预注册依据
//
// 确定性纪律：冻结时刻不含墙钟——frozenAtLabel 由调用方供给（审计标签），
// 不进 hash 覆盖面（时间戳不是协议内容）；hash 只覆盖 13 节协议本体。
//
// Cannot-prove：本机制证明「执行计划与冻结协议的逐节一致性可被机器检出」，
// 不证明 (a) 冻结前的协议本身科学合理（那是 review 层职责）；(b) 执行方
// 私下未按冻结协议跑却伪造「执行计划」记录（输入真实性由供给方负责——
// hash 只能比对两份被供给的文档，不能证明运行确实按其中一份发生）。

import { hashCanonicalJson } from '../evidence_log/hasher.ts';

// ---------------------------------------------------------------------------
// 协议 schema：13 节冻结清单（宪法 EVAL-PREREG-001 原文枚举）
// ---------------------------------------------------------------------------

export const PREREG_REQUIRED_SECTIONS = [
  'question',
  'datasets',
  'exclusions',
  'baselines',
  'metrics',
  'sampleSizeRuns',
  'seeds',
  'statisticalAnalysis',
  'leakageProbes',
  'stoppingRules',
  'hardwareSoftware',
  'costAccounting',
  'failureHandling',
] as const;
export type PreregSection = (typeof PREREG_REQUIRED_SECTIONS)[number];

/**
 * 预注册协议本体。每节是结构化文本（协议条款），由评估负责人在评估
 * 开始前写定；冻结后任何一节的任何字符变化都会被 hash 比对检出。
 */
export interface PreregSpec {
  /** 概念草案 vs 可执行协议——草案不得绑定结果报告（宪法：无法真实执行的计划应明确区分）。 */
  readonly kind: 'concept-draft' | 'executable-protocol';
  readonly question: string;
  readonly datasets: string;
  readonly exclusions: string;
  readonly baselines: string;
  readonly metrics: string;
  readonly sampleSizeRuns: string;
  readonly seeds: string;
  readonly statisticalAnalysis: string;
  readonly leakageProbes: string;
  readonly stoppingRules: string;
  readonly hardwareSoftware: string;
  readonly costAccounting: string;
  readonly failureHandling: string;
}

/** 冻结后的预注册：spec 原文 + 内容 hash + 审计标签（不进 hash）。 */
export interface FrozenPrereg {
  readonly spec: PreregSpec;
  /** SHA256 over canonical JSON of spec（冻结指纹——执行比对 SSOT）。 */
  readonly preregHash: string;
  /** 冻结时刻的审计标签（如 'before-run-2026-08-17T00:00:00Z'）——由调用方供给。 */
  readonly frozenAtLabel: string;
}

/** 一处 deviation：节名 + 冻结值 + 执行值（公开报告必须逐条列出）。 */
export interface PreregDeviation {
  readonly section: PreregSection;
  readonly preregValue: string;
  readonly executedValue: string;
}

/** 申报的 deviation：执行方在结果报告中显式承认的修改 + 理由。 */
export interface DeviationDeclaration {
  readonly section: PreregSection;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// 冻结：13 节齐全 + 每节非空 → hash
// ---------------------------------------------------------------------------

/** spec 各节的文本投影（hash 覆盖面 = 13 节 + kind；frozenAtLabel 不覆盖）。 */
function specProjection(spec: PreregSpec): Record<string, string> {
  const out: Record<string, string> = { kind: spec.kind };
  for (const section of PREREG_REQUIRED_SECTIONS) {
    out[section] = spec[section] as string;
  }
  return out;
}

/**
 * 冻结预注册协议。缺节或任一节空白（trim 后）→ throw（fail-closed：
 * 不完整的协议没有冻结资格——「冻结一份漏洞协议」比「不冻结」更危险）。
 */
export function freezePrereg(spec: PreregSpec, frozenAtLabel: string): FrozenPrereg {
  if (frozenAtLabel.trim().length === 0) {
    throw new Error('freezePrereg: frozenAtLabel must be non-empty (audit label for the freeze moment)');
  }
  for (const section of PREREG_REQUIRED_SECTIONS) {
    const value = spec[section] as string | undefined;
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`freezePrereg: section "${section}" is empty — all ${PREREG_REQUIRED_SECTIONS.length} sections must be filled before freezing (fail-closed)`);
    }
  }
  return {
    spec,
    preregHash: hashCanonicalJson(specProjection(spec)),
    frozenAtLabel,
  };
}

/** 重算一份 spec 的 hash（执行侧比对的输入）。 */
export function computeSpecHash(spec: PreregSpec): string {
  return hashCanonicalJson(specProjection(spec));
}

// ---------------------------------------------------------------------------
// 执行比对：hash 比对 + 逐节 deviation
// ---------------------------------------------------------------------------

export type PreregExecutionStatus =
  | 'PASS_CLEAN'
  | 'PASS_WITH_DECLARED_DEVIATIONS'
  | 'FAIL_UNDECLARED_DEVIATION'
  | 'FAIL_CONCEPT_DRAFT_CANNOT_BIND_RESULTS'
  | 'FAIL_HASH_MISMATCH_TAMPERED';

export interface PreregResultGateReport {
  readonly status: PreregExecutionStatus;
  /** hash 逐字节一致时为 true。 */
  readonly hashMatches: boolean;
  readonly deviations: readonly PreregDeviation[];
  /** 检出但未在结果报告中申报的 deviation 节。 */
  readonly undeclaredSections: readonly PreregSection[];
  readonly preregHash: string;
  readonly executedHash: string;
}

/**
 * 结果门：以冻结协议为基准比对执行计划。
 *
 * 判定顺序（fail-closed）：
 *   1. 概念草案不可绑定结果（无论 hash 是否一致）；
 *   2. hash 一致 → PASS_CLEAN；
 *   3. hash 不一致 → 逐节 diff；全部 deviation 已申报 → PASS_WITH_DECLARED_
 *      DEVIATIONS（公开报告必须列出）；任一未申报 → FAIL_UNDECLARED_DEVIATION。
 *
 * 注：hash 不一致本身不是终局失败——协议允许事后修改，但必须申报；
 * 未申报的修改（静默换指标/换种子/换停止规则）才是失败。
 */
export function preregResultGate(
  frozen: FrozenPrereg,
  executed: PreregSpec,
  declared: readonly DeviationDeclaration[] = [],
): PreregResultGateReport {
  const executedHash = computeSpecHash(executed);
  const hashMatches = executedHash === frozen.preregHash;
  const deviations = listDeviations(frozen.spec, executed);
  const declaredSections = new Set(declared.map((d) => d.section));
  const undeclaredSections = deviations.map((d) => d.section).filter((s) => !declaredSections.has(s));

  let status: PreregExecutionStatus;
  if (frozen.spec.kind === 'concept-draft') {
    status = 'FAIL_CONCEPT_DRAFT_CANNOT_BIND_RESULTS';
  } else if (hashMatches) {
    status = 'PASS_CLEAN';
  } else if (undeclaredSections.length === 0) {
    status = 'PASS_WITH_DECLARED_DEVIATIONS';
  } else {
    status = 'FAIL_UNDECLARED_DEVIATION';
  }

  return { status, hashMatches, deviations, undeclaredSections, preregHash: frozen.preregHash, executedHash };
}

/** 逐节比对：值不同的节输出为 deviation（确定性：按 PREREG_REQUIRED_SECTIONS 顺序）。 */
export function listDeviations(frozenSpec: PreregSpec, executedSpec: PreregSpec): readonly PreregDeviation[] {
  const out: PreregDeviation[] = [];
  for (const section of PREREG_REQUIRED_SECTIONS) {
    const a = frozenSpec[section] as string | undefined;
    const b = executedSpec[section] as string | undefined;
    if (a !== b) {
      out.push({
        section,
        preregValue: typeof a === 'string' && a.length > 0 ? a : '(missing)',
        executedValue: typeof b === 'string' && b.length > 0 ? b : '(missing)',
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 篡改检出（显式独立入口：冻结记录本体被改 → 重算 hash 不符）
// ---------------------------------------------------------------------------

export type FrozenRecordIntegrity =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * 冻结记录完整性：frozen.spec 重算 hash 必须等于 frozen.preregHash。
 * 不符 = 冻结记录在冻结后被篡改（协议本体与指纹不一致）。
 */
export function verifyFrozenRecord(frozen: FrozenPrereg): FrozenRecordIntegrity {
  const recomputed = computeSpecHash(frozen.spec);
  if (recomputed !== frozen.preregHash) {
    return { ok: false, reason: `prereg hash mismatch: frozen record declares ${frozen.preregHash.slice(0, 12)}… but spec recomputes to ${recomputed.slice(0, 12)}… — record tampered after freeze` };
  }
  return { ok: true };
}
