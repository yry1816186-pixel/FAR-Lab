// src/science_harness/simulation_evidence.ts
// 职责：EXP-SIMULATION-001 仿真的「模型内验证 vs 现实外推」证据分级（机器层）。
//
// 宪法条款：仿真记录模型方程、参数、初始条件、随机源、数值方法、校准
// 数据和适用域；仿真成功最多支持「在该模型内」；对现实系统的外推需要
// 独立证据。Acceptance：reference cases、convergence、sensitivity、
// seed replay 和 model-misspecification tests。Failure：禁止把仿真输出
// 写成现实验证。
//
// 机制：
//   SimulationCard           7 记录字段（方程/参数/初值/随机源/数值方法/
//                           校准数据/适用域）+ 5 验证证据位（reference
//                           cases/convergence/sensitivity/seed replay/
//                           misspecification tests）
//   validateSimulationCard   7 字段非空 + 随机源必须显式含 seed（重放资格）
//   gradeSimulationEvidence  证据分级（fail-closed）：
//     · 声称 scope='model-internal'：7 字段 + 5 证据位齐全 →
//       SUPPORTED_MODEL_INTERNAL（上限即此——永不升格为现实验证）
//     · 声称 scope='real-world'：仿真证据单独 → BLOCKED_NEEDS_INDEPENDENT_
//       EVIDENCE（现实外推必须引用独立证据链——仿真卡不构成）
//     · 缺证据位 → IN_MODEL_UNVALIDATED（连模型内结论都不支持）
//   assertNotRealWorldClaim  话术门：结论文本含「现实验证/real-world
//                           validated」样式而证据仅仿真 → 违规（宪法
//                           Failure 条款的机器面）
//
// Cannot-prove：本机制证明「分级规则按卡片声明字段正确执行、现实外推
// 在无独立证据时被 fail-closed 阻断」，不证明 (a) 卡片记录的方程/参数/
// 校准数据与实际跑的仿真一致（卡片真实性由 run manifest/供给方负责）；
// (b) 5 证据位引用的验证工作本身正确（引用在场 ≠ 验证有效——那是引用
// 目标的职责）；(c) 模型 misspecification 的完备检出（misspecification
// tests 在场只证明做过检查，不证明查全）。

// ---------------------------------------------------------------------------
// 卡片 schema：7 记录字段 + 5 验证证据位
// ---------------------------------------------------------------------------

export const SIMULATION_CARD_FIELDS = [
  'modelEquations',
  'parameters',
  'initialConditions',
  'randomSource',
  'numericalMethod',
  'calibrationData',
  'applicabilityDomain',
] as const;
export type SimulationCardField = (typeof SIMULATION_CARD_FIELDS)[number];

export const SIMULATION_EVIDENCE_SLOTS = [
  'referenceCases',
  'convergence',
  'sensitivity',
  'seedReplay',
  'misspecificationTests',
] as const;
export type SimulationEvidenceSlot = (typeof SIMULATION_EVIDENCE_SLOTS)[number];

export interface SimulationCard {
  readonly modelEquations: string;
  readonly parameters: string;
  readonly initialConditions: string;
  /** 随机源声明——必须显式含 seed（如 'mersenne-twister seed=20260817'）。 */
  readonly randomSource: string;
  readonly numericalMethod: string;
  readonly calibrationData: string;
  /** 适用域（模型声称成立的范围——外推越界即 misspecification 风险）。 */
  readonly applicabilityDomain: string;
  /** 5 验证证据位：null = 未做（如实——不为凑齐伪造引用）。 */
  readonly referenceCases: string | null;
  readonly convergence: string | null;
  readonly sensitivity: string | null;
  readonly seedReplay: string | null;
  readonly misspecificationTests: string | null;
}

// ---------------------------------------------------------------------------
// 卡片校验
// ---------------------------------------------------------------------------

export type SimulationCardValidation =
  | { readonly ok: true; readonly problems: readonly []; readonly missingEvidenceSlots: readonly SimulationEvidenceSlot[] }
  | { readonly ok: false; readonly problems: readonly string[]; readonly missingEvidenceSlots: readonly SimulationEvidenceSlot[] };

/** seed 显式性检查：randomSource 声明必须含 'seed' 字样（重放资格）。 */
export function hasExplicitSeed(randomSource: string): boolean {
  return /\bseed\b/i.test(randomSource);
}

/** 卡片校验：7 字段非空 + 随机源含 seed；证据位缺失如实列出（不失败——分级用）。 */
export function validateSimulationCard(card: SimulationCard): SimulationCardValidation {
  const problems: string[] = [];
  for (const f of SIMULATION_CARD_FIELDS) {
    const v = card[f] as string;
    if (v.trim().length === 0) problems.push(`simulation card field "${f}" is empty`);
  }
  if (!hasExplicitSeed(card.randomSource)) {
    problems.push('randomSource must declare an explicit seed — simulations without a declared seed are not replayable');
  }
  const missingEvidenceSlots = SIMULATION_EVIDENCE_SLOTS.filter((s) => (card[s] as string | null) === null || (card[s] as string | null)!.trim().length === 0);
  if (problems.length === 0) return { ok: true, problems: [], missingEvidenceSlots };
  return { ok: false, problems, missingEvidenceSlots };
}

// ---------------------------------------------------------------------------
// 证据分级（fail-closed 核心）
// ---------------------------------------------------------------------------

export type SimulationEvidenceGrade =
  | 'SUPPORTED_MODEL_INTERNAL'
  | 'IN_MODEL_UNVALIDATED'
  | 'BLOCKED_NEEDS_INDEPENDENT_EVIDENCE';

export interface SimulationEvidenceVerdict {
  readonly grade: SimulationEvidenceGrade;
  /** 卡片校验问题（字段缺失/无 seed）。 */
  readonly problems: readonly string[];
  /** 缺失的验证证据位。 */
  readonly missingEvidenceSlots: readonly SimulationEvidenceSlot[];
  /** 本分级不能证明什么（每张卡片的显式边界声明）。 */
  readonly cannotProve: string;
}

/** 声称范围：模型内 vs 现实系统。 */
export type ClaimedScope = 'model-internal' | 'real-world';

/**
 * 仿真证据分级：
 *   real-world 声称：无条件 BLOCKED（仿真证据永不构成现实外推支撑——
 *     需要独立证据链，本函数不消费独立证据，只做阻断）；
 *   model-internal 声称：卡片校验过 + 5 证据位齐全 → 上限
 *     SUPPORTED_MODEL_INTERNAL；缺任何证据位 → IN_MODEL_UNVALIDATED。
 */
export function gradeSimulationEvidence(card: SimulationCard, claimedScope: ClaimedScope): SimulationEvidenceVerdict {
  const validation = validateSimulationCard(card);
  if (claimedScope === 'real-world') {
    return {
      grade: 'BLOCKED_NEEDS_INDEPENDENT_EVIDENCE',
      problems: validation.problems,
      missingEvidenceSlots: validation.missingEvidenceSlots,
      cannotProve: 'simulation output cannot validate real-world claims under any card completeness — real-world extrapolation requires independent evidence (empirical observation, experiment, or field data) outside the simulation',
    };
  }
  if (!validation.ok || validation.missingEvidenceSlots.length > 0) {
    return {
      grade: 'IN_MODEL_UNVALIDATED',
      problems: validation.problems,
      missingEvidenceSlots: validation.missingEvidenceSlots,
      cannotProve: 'in-model conclusions are not supported: card fields/evidence slots are incomplete — what the simulation does under unvalidated numerics is unknown',
    };
  }
  return {
    grade: 'SUPPORTED_MODEL_INTERNAL',
    problems: [],
    missingEvidenceSlots: [],
    cannotProve: 'supported scope is "inside this model" only — the model\'s correspondence to reality (parameter identifiability, structural realism, applicability beyond the declared domain) is NOT established by simulation success',
  };
}

// ---------------------------------------------------------------------------
// 话术门：禁止把仿真输出写成现实验证
// ---------------------------------------------------------------------------

export type RealWorldClaimCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/** 「现实验证」话术模式（中英双语面）。 */
const REAL_WORLD_CLAIM_PATTERNS: readonly RegExp[] = [
  /\breal[- ]world validated?\b/i,
  /\bvalidated (?:in|against) reality\b/i,
  /现实验证/,
  /现实系统验证/,
  /在现实中得到验证/,
];

/**
 * 话术门：结论文本若声称现实验证，其证据源必须含非仿真证据引用
 * （independentEvidenceRefs ≥1）。只有仿真卡引用 → 违规（宪法 Failure：
 * 禁止把仿真输出写成现实验证）。
 */
export function assertNotRealWorldClaim(
  conclusionText: string,
  evidenceRefs: readonly { readonly ref: string; readonly kind: 'simulation' | 'empirical' | 'experimental' | 'field-data' }[],
): RealWorldClaimCheck {
  const claimsRealWorld = REAL_WORLD_CLAIM_PATTERNS.some((p) => p.test(conclusionText));
  if (!claimsRealWorld) return { ok: true };
  const independent = evidenceRefs.filter((e) => e.kind !== 'simulation');
  if (independent.length === 0) {
    return {
      ok: false,
      reason: 'conclusion claims real-world validation but all evidence refs are simulations — writing simulation output as real validation is forbidden; attach independent empirical/experimental/field evidence or rewrite the claim as model-internal',
    };
  }
  return { ok: true };
}
