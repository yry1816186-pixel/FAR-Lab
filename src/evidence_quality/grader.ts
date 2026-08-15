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
  meta_analysis: 1,
  rct: 1,
  quasi_experimental: 2,
  observational: 3,
  cross_sectional: 3,
  case_report: 4,
  preprint: 4,
  expert_opinion: 4,
  unspecified: 4, // fail-conservative：未声明设计按最低层级
};

const TIER_LABEL: Readonly<Record<EvidenceTier, string>> = {
  1: 'high (meta-analysis / randomized controlled trial)',
  2: 'moderate (quasi-experimental / cohort)',
  3: 'low (observational / case-control / cross-sectional)',
  4: 'very low (case report / preprint / expert opinion / unspecified)',
};

/**
 * 确定性研究设计分类器（night-r2：把 tier 维度从"仅调用方显式传入"升级为可从
 * 标题/摘要词面自动分级）。纯词法规则、零 LLM、零 IO。
 *
 * 校准依据（§8.9 义务）：
 *   - 优先级序 = 压倒关系（先命中先赢）：preprint 场所标记 > meta 综述 > RCT > 队列 >
 *     病例对照/横断面 > 病例报告 > 评论/意见。
 *   - preprint 压过设计词是有意保守：未经同行评审的"RCT 预印本"按 tier 4 计——
 *     设计轴与评审轴在词面上不可分，保守取低。边界：无法从词面区分预印本承载的
 *     真实设计（需全文解析，§8.6 后续）。
 *   - 敏感性：调换 meta/rct 先后只影响 "systematic review of RCTs" 类复合标题——
 *     统一归 meta_analysis（综述优先与 GRADE 惯例一致）。
 *
 * Cannot-prove：词面分类无法证实研究真实执行了所声明的设计（selective reporting
 * 正是 RoB 域之一）；分类失败 → unspecified（tier 4），fail-conservative。
 */
const PREPRINT_MARKERS = /\b(?:arxiv|biorxiv|medrxiv|preprint|ssrn)\b|预印本/i;
const META_MARKERS = /\b(?:meta[- ]analysis|systematic review|pooled analysis)\b|荟萃分析|系统综述/i;
const RCT_MARKERS = /\b(?:randomi[sz]ed|randomisation|randomization|placebo[- ]controlled|double[- ]blind)\s+(?:controlled\s+)?(?:trial|study)\b|\brct\b|随机对照/i;
const QUASI_MARKERS = /\b(?:cohort|prospective|retrospective|quasi[- ]experimental|longitudinal)\b|队列研究/i;
const OBS_MARKERS = /\b(?:case[- ]control|observational)\b|病例对照/i;
const CROSS_MARKERS = /\b(?:cross[- ]sectional|survey|prevalence study)\b|横断面/i;
const CASE_MARKERS = /\b(?:case report|case study|case series)\b|病例报告/i;
const OPINION_MARKERS = /\b(?:editorial|commentary|perspective|opinion|narrative review)\b|述评|观点/i;

export function classifyStudyDesign(text: string): StudyDesign {
  const t = text.trim();
  if (t.length === 0) return 'unspecified';
  if (PREPRINT_MARKERS.test(t)) return 'preprint';
  if (META_MARKERS.test(t)) return 'meta_analysis';
  if (RCT_MARKERS.test(t)) return 'rct';
  if (QUASI_MARKERS.test(t)) return 'quasi_experimental';
  if (OBS_MARKERS.test(t)) return 'observational';
  if (CROSS_MARKERS.test(t)) return 'cross_sectional';
  if (CASE_MARKERS.test(t)) return 'case_report';
  if (OPINION_MARKERS.test(t)) return 'expert_opinion';
  return 'unspecified';
}

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
