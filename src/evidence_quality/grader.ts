/**
 * evidence_quality grader —— 证据质量确定性评分（借鉴 GRADE / Cochrane RoB）。
 *
 * 纯函数：gradeEvidenceTier / assessRoB / gradeEvidenceQuality。
 * 不进 verdict（R0-R9 不变）、不进 proofHash（VC 白名单不变）——仅透明度层。
 */

import type {
  EvidenceQualityGrade,
  EvidenceQualityLevel,
  EvidenceTier,
  RobAssessment,
  RobDomain,
  StudyDesign,
} from './types.ts';

const DESIGN_TIER: Readonly<Record<StudyDesign, EvidenceTier>> = {
  rct: 1,
  quasi_experimental: 2,
  observational: 3,
  case_report: 4,
  expert_opinion: 4,
  unspecified: 4, // fail-conservative：未声明设计按最低层级
};

const TIER_LABEL: Readonly<Record<EvidenceTier, string>> = {
  1: 'high (randomized controlled trial)',
  2: 'moderate (quasi-experimental / cohort)',
  3: 'low (observational / case-control)',
  4: 'very low (case report / expert opinion / unspecified)',
};

/** GRADE 证据层级映射（确定性·纯函数）。 */
export function gradeEvidenceTier(studyDesign: StudyDesign): EvidenceTier {
  return DESIGN_TIER[studyDesign];
}

/** Cochrane RoB 7 维 checklist 全集（顺序固定·确定性）。 */
export const ROB_DOMAINS: readonly RobDomain[] = [
  'sequence_generation',
  'allocation_concealment',
  'blinding_participants',
  'blinding_outcome_assessment',
  'incomplete_outcome_data',
  'selective_reporting',
  'other_bias',
];

/**
 * RoB 聚合：统计 low/high/unclear 维度计数。
 * @param assessments - 提供的评估子集（可少于 7 维；缺省维度计入 unclear）
 */
export function assessRoB(assessments: readonly RobAssessment[]): {
  readonly robLowCount: number;
  readonly robHighCount: number;
  readonly robUnclearCount: number;
} {
  const byDomain = new Map<RobDomain, RobAssessment['risk']>();
  for (const a of assessments) {
    if (byDomain.has(a.domain)) {
      throw new Error(`assessRoB: duplicate domain '${a.domain}'`);
    }
    byDomain.set(a.domain, a.risk);
  }
  for (const d of ROB_DOMAINS) {
    if (!byDomain.has(d)) {
      byDomain.set(d, 'unclear'); // 未评估维度按 unclear（fail-conservative）
    }
  }
  let low = 0;
  let high = 0;
  let unclear = 0;
  for (const risk of byDomain.values()) {
    if (risk === 'low') low += 1;
    else if (risk === 'high') high += 1;
    else unclear += 1;
  }
  return { robLowCount: low, robHighCount: high, robUnclearCount: unclear };
}

/**
 * 综合证据质量等级：tier 主轴 + RoB 修正。
 * 修正规则（确定性）：
 *   - tier 1：≥5 低风险 → high；≥2 高风险或 ≥3 未明 → low；否则 moderate
 *   - tier 2：≥4 低风险且无高风险 → moderate；否则 low
 *   - tier 3/4：high 风险 ≥1 或低风险 <3 → very_low；否则 low
 */
export function gradeEvidenceQuality(
  studyDesign: StudyDesign,
  assessments: readonly RobAssessment[] = [],
): EvidenceQualityGrade {
  const tier = gradeEvidenceTier(studyDesign);
  const rob = assessRoB(assessments);

  let overall: EvidenceQualityLevel;
  if (tier === 1) {
    if (rob.robLowCount >= 5) overall = 'high';
    else if (rob.robHighCount >= 2 || rob.robUnclearCount >= 3) overall = 'low';
    else overall = 'moderate';
  } else if (tier === 2) {
    overall = rob.robLowCount >= 4 && rob.robHighCount === 0 ? 'moderate' : 'low';
  } else {
    overall = rob.robHighCount >= 1 || rob.robLowCount < 3 ? 'very_low' : 'low';
  }

  return {
    tier,
    tierLabel: TIER_LABEL[tier],
    robLowCount: rob.robLowCount,
    robHighCount: rob.robHighCount,
    robUnclearCount: rob.robUnclearCount,
    overall,
  };
}
