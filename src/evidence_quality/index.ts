/**
 * evidence_quality —— 证据质量评估模块 barrel（GRADE/Cochrane RoB 借鉴）。
 * 独立性：不进 verdict（R0-R9 不变）、不进 proofHash（VC 白名单不变）——透明度层。
 */

export { gradeEvidenceTier, assessRoB, gradeEvidenceQuality, ROB_DOMAINS } from './grader.ts';
export type {
  EvidenceQualityGrade,
  EvidenceQualityLevel,
  RobAssessment,
  RobDomain,
  RobRisk,
  StudyDesign,
  EvidenceTier,
} from './types.ts';
