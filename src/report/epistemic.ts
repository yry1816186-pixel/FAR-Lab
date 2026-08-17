// src/report/epistemic.ts
// 职责：CORE-EPISTEMIC-001 —— 关键判断认知类型标注层（确定性，无 LLM）。
//
// 宪法三约束的机器化：
//   1. 关键判断必须显式标注九值认知类型之一（EPISTEMIC_TAGS SSOT @ schema/enums.ts）。
//   2. UNKNOWN 不得在后续步骤中无证据消失——unknownPersistenceReport 把「未解决登记未知
//      是否仍出现在当前判断集」做成对拍：消失 = 违规（除非登记侧已 RESOLVED 且带解决证据，
//      那由 UnknownEntrySchema lint 强制，本层只查传播）。
//   3. 置信度必须与证据质量和校准状态匹配——机器可检的部分：带置信度的判断必须同时带
//      证据引用；FACT/EVIDENCE 类必须有 ≥1 条证据引用；ASSUMPTION 类必须可回指假设登记
//      （assumptionId）。「与校准状态匹配」的语义层（置信度数值是否恰当）不可确定性判定，
//      由 calibration report 抽验锚定（cannot-prove 声明）。
//
// 与既有层的关系：
//   - REPORT_CLAIM_CATEGORIES（CORE-REPORT-001）= 完成度维度，本层 = 认知来源维度，正交。
//   - UnknownEntry/AssumptionEntry（GOV-UNKNOWN-001）= 登记侧生命周期，本层 = 报告侧传播对拍。
//
// Cannot-prove：本层证明「判断带合法标签、未知不静默消失、置信判断带证据锚」，不证明
//   标签选得对不对（FACT 标成 HYPOTHESIS 属语义错误）或置信度数值恰当——那是报告抽验
//   （sample audit）与校准层职责。

import { z } from 'zod';

import { EPISTEMIC_TAGS } from '../schema/enums.ts';
import type { EpistemicTag } from '../schema/enums.ts';

// ---------------------------------------------------------------------------
// 判断语句 schema
// ---------------------------------------------------------------------------

export const EpistemicStatementSchema = z.object({
  /** 判断 ID（唯一，传播对拍引用键）。 */
  id: z.string().min(1),
  /** 判断原文。 */
  text: z.string().min(1),
  /** 认知类型标签（九值 SSOT）。 */
  tag: z.enum(EPISTEMIC_TAGS),
  /** 置信度 [0,1]（带置信度的判断必须同时带证据引用——validateEpistemicStatements 强制）。 */
  confidence: z.number().min(0).max(1).nullable().default(null),
  /** 证据引用（FACT/EVIDENCE 类必填非空；带 confidence 者必填非空）。 */
  evidenceRefs: z.array(z.string().min(1)).default([]),
  /** 回指未知登记 ID（tag=UNKNOWN 必填——传播对拍键）。 */
  unknownId: z.string().min(1).nullable().default(null),
  /** 回指假设登记 ID（tag=ASSUMPTION 必填——假设必须可追责到登记）。 */
  assumptionId: z.string().min(1).nullable().default(null),
});

export type EpistemicStatement = z.infer<typeof EpistemicStatementSchema>;

export interface EpistemicViolation {
  readonly code: EpistemicViolationCode;
  readonly message: string;
}

export type EpistemicViolationCode =
  | 'DUPLICATE_STATEMENT_ID'
  | 'FACT_WITHOUT_EVIDENCE'
  | 'EVIDENCE_WITHOUT_REFS'
  | 'CONFIDENCE_WITHOUT_EVIDENCE'
  | 'UNKNOWN_WITHOUT_REGISTRY_ID'
  | 'ASSUMPTION_WITHOUT_REGISTRY_ID';

export interface EpistemicValidationResult {
  readonly ok: boolean;
  readonly violations: readonly EpistemicViolation[];
}

/**
 * 校验一组认知类型标注判断（fail-closed，逐条可枚举违规）。
 */
export function validateEpistemicStatements(
  statements: readonly EpistemicStatement[],
): EpistemicValidationResult {
  const violations: EpistemicViolation[] = [];

  const seen = new Set<string>();
  for (const s of statements) {
    if (seen.has(s.id)) {
      violations.push({ code: 'DUPLICATE_STATEMENT_ID', message: `duplicate statement id '${s.id}'` });
    }
    seen.add(s.id);

    // FACT/EVIDENCE 必须有证据引用（无锚的「事实」是断言不是事实）
    if ((s.tag === 'FACT' || s.tag === 'EVIDENCE') && s.evidenceRefs.length === 0) {
      violations.push({
        code: s.tag === 'FACT' ? 'FACT_WITHOUT_EVIDENCE' : 'EVIDENCE_WITHOUT_REFS',
        message: `statement '${s.id}' tagged ${s.tag} but carries no evidenceRefs`,
      });
    }

    // 置信度必须与证据匹配（机器可检部分：带置信 → 带证据锚）
    if (s.confidence !== null && s.evidenceRefs.length === 0) {
      violations.push({
        code: 'CONFIDENCE_WITHOUT_EVIDENCE',
        message: `statement '${s.id}' carries confidence ${s.confidence} but no evidenceRefs — confidence must be anchored to evidence`,
      });
    }

    // UNKNOWN 必须可回指登记（不可追责的未知 = 可静默消失的未知）
    if (s.tag === 'UNKNOWN' && (s.unknownId ?? '') === '') {
      violations.push({
        code: 'UNKNOWN_WITHOUT_REGISTRY_ID',
        message: `statement '${s.id}' tagged UNKNOWN but no unknownId — untraceable unknowns can silently disappear`,
      });
    }

    // ASSUMPTION 必须可回指登记
    if (s.tag === 'ASSUMPTION' && (s.assumptionId ?? '') === '') {
      violations.push({
        code: 'ASSUMPTION_WITHOUT_REGISTRY_ID',
        message: `statement '${s.id}' tagged ASSUMPTION but no assumptionId — assumptions must be accountable to the registry`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// UNKNOWN 传播对拍（不得无证据消失）
// ---------------------------------------------------------------------------

/** 登记侧未知的最小投影（UnknownEntry 的裁剪，避免整实体耦合）。 */
export interface RegisteredUnknownProjection {
  readonly id: string;
  readonly status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'ABANDONED';
  readonly resolutionEvidence: readonly string[];
}

export interface UnknownPersistenceViolation {
  readonly code: 'UNKNOWN_SILENTLY_DROPPED' | 'UNKNOWN_RESOLVED_WITHOUT_EVIDENCE';
  readonly unknownId: string;
  readonly message: string;
}

export interface UnknownPersistenceReport {
  readonly ok: boolean;
  readonly checked: number;
  readonly present: number;
  readonly violations: readonly UnknownPersistenceViolation[];
}

/**
 * 未知传播对拍：每个未解决（OPEN/INVESTIGATING）的登记未知必须仍出现在当前判断集
 * （以 tag=UNKNOWN + unknownId 回指）。消失 = 无证据消失 = 违规。
 * RESOLVED 的必须带解决证据（与登记 lint 同一纪律，双保险）；ABANDONED 豁免
 * （显式放弃即显式交代）。
 */
export function unknownPersistenceReport(
  unknowns: readonly RegisteredUnknownProjection[],
  statements: readonly EpistemicStatement[],
): UnknownPersistenceReport {
  const violations: UnknownPersistenceViolation[] = [];
  const presentIds = new Set(
    statements.filter((s) => s.tag === 'UNKNOWN' && s.unknownId !== null).map((s) => s.unknownId as string),
  );

  let present = 0;
  for (const u of unknowns) {
    if (u.status === 'RESOLVED') {
      if (u.resolutionEvidence.length === 0) {
        violations.push({
          code: 'UNKNOWN_RESOLVED_WITHOUT_EVIDENCE',
          unknownId: u.id,
          message: `unknown '${u.id}' RESOLVED but resolutionEvidence empty`,
        });
      }
      continue;
    }
    if (u.status === 'ABANDONED') continue; // 显式放弃 = 显式交代
    if (presentIds.has(u.id)) {
      present += 1;
    } else {
      violations.push({
        code: 'UNKNOWN_SILENTLY_DROPPED',
        unknownId: u.id,
        message: `unknown '${u.id}' (${u.status}) absent from current statements — UNKNOWN must not disappear without evidence`,
      });
    }
  }

  return {
    ok: violations.length === 0,
    checked: unknowns.length,
    present,
    violations,
  };
}

// ---------------------------------------------------------------------------
// 报告数据 → 认知类型判断的确定性投影
// ---------------------------------------------------------------------------

/** 报告判断输入的最小投影（从 ReportData/裁决结果裁剪，避免整实体耦合）。 */
export interface VerdictProjection {
  readonly claimId: string;
  readonly verdict: 'CONFIRMED' | 'REFUTED' | 'INCONCLUSIVE' | 'DEGRADED_SCOPE' | 'UNTESTED';
  readonly evidenceCount: number;
}

/**
 * 裁决 → 认知标签的确定性映射（中央映射，禁止散落）：
 *   CONFIRMED + 有证据 → EVIDENCE（证据支持的结论）
 *   CONFIRMED + 无证据 → UNKNOWN（内核 R7 已挡无证据 CONFIRMED；防御性映射为诚实值）
 *   REFUTED → EVIDENCE（反证也是证据）
 *   DEGRADED_SCOPE + 有证据 → INFERENCE（部分证据下的范围推断，带置信度强制）
 *   DEGRADED_SCOPE + 无证据 → UNKNOWN（无证据的范围降级没有可置信的推断内容）
 *   INCONCLUSIVE / UNTESTED → UNKNOWN（诚实：不知）
 */
export function verdictToEpistemicTag(v: VerdictProjection): EpistemicTag {
  if (v.verdict === 'CONFIRMED') return v.evidenceCount > 0 ? 'EVIDENCE' : 'UNKNOWN';
  if (v.verdict === 'REFUTED') return 'EVIDENCE';
  if (v.verdict === 'DEGRADED_SCOPE') return v.evidenceCount > 0 ? 'INFERENCE' : 'UNKNOWN';
  return 'UNKNOWN'; // INCONCLUSIVE / UNTESTED
}

/** 从裁决投影构建带标签判断集（报告抽验的机器侧入口）。 */
export function projectVerdictsToStatements(verdicts: readonly VerdictProjection[]): readonly EpistemicStatement[] {
  return verdicts.map((v) => {
    const tag = verdictToEpistemicTag(v);
    return EpistemicStatementSchema.parse({
      id: `claim-${v.claimId}`,
      text: `verdict ${v.verdict} for ${v.claimId}`,
      tag,
      confidence: tag === 'INFERENCE' ? 0.5 : null, // DEGRADED_SCOPE 半证据，强制走置信度+证据锚通道
      evidenceRefs: v.evidenceCount > 0 ? [`${v.claimId}:evidence×${v.evidenceCount}`] : [],
      unknownId: tag === 'UNKNOWN' ? `verdict-unknown-${v.claimId}` : null,
      assumptionId: null,
    });
  });
}
