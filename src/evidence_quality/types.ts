/**
 * evidence_quality types —— 证据质量评估类型层（
 * scientific-critical-thinking 的 GRADE / Cochrane Risk of Bias 框架）。
 *
 * 设计红线（与 scientific-skills 子代理分析一致）：
 *   - 本模块是**独立确定性评分层**：不进 verdict（R0-R9 cascade 不变）、不进 proofHash
 *     （VC 白名单字段不变）。仅作为 VerdictKernelOutput.evidenceQualityTier 透明度字段，
 *     供 report/audit 消费——回答"证据本身有多可靠"（RCT > cohort > case-report）。
 *   - 纯函数：无 LLM、无网络、无副作用（F3 确定性纪律）。
 *   - GRADE 证据层级简化映射：tier 1=RCT（高质量）→ tier 4=case report/专家意见（极低质量）。
 *   - Cochrane RoB 7 维 checklist（序号生成/分配隐藏/参与者盲法/结局盲法/不完整数据/
 *     选择性报告/其他偏倚）映射为 0-7 分风险评分。
 */

/** 研究设计类型（GRADE 证据层级输入轴）。 */
export type StudyDesign =
  | 'rct' // 随机对照试验（tier 1）
  | 'quasi_experimental' // 准实验/队列（tier 2）
  | 'observational' // 观察性/病例对照（tier 3）
  | 'case_report' // 病例报告/案例研究（tier 4）
  | 'expert_opinion' // 专家意见（tier 4）
  | 'unspecified'; // 未声明（tier 4·fail-conservative）

/** GRADE 风格证据层级（1=最高，4=极低）。 */
export type EvidenceTier = 1 | 2 | 3 | 4;

/** Cochrane Risk of Bias 7 维 checklist 域。 */
export type RobDomain =
  | 'sequence_generation' // 随机序列生成
  | 'allocation_concealment' // 分配隐藏
  | 'blinding_participants' // 参与者盲法
  | 'blinding_outcome_assessment' // 结局评估盲法
  | 'incomplete_outcome_data' // 不完整结局数据
  | 'selective_reporting' // 选择性报告
  | 'other_bias'; // 其他偏倚

/** 单维风险判断。 */
export type RobRisk = 'low' | 'unclear' | 'high';

/** 单维 RoB 评估。 */
export interface RobAssessment {
  readonly domain: RobDomain;
  readonly risk: RobRisk;
}

/** 证据质量综合等级（GRADE 4 级）。 */
export type EvidenceQualityLevel = 'high' | 'moderate' | 'low' | 'very_low';

/** 证据质量评分结果（透明度层·不进 verdict/proofHash）。 */
export interface EvidenceQualityGrade {
  /** GRADE 风格层级（1-4）。 */
  readonly tier: EvidenceTier;
  /** 层级人类可读标签。 */
  readonly tierLabel: string;
  /** RoB 低风险维度计数（0-7）。 */
  readonly robLowCount: number;
  /** RoB 高风险维度计数（0-7）。 */
  readonly robHighCount: number;
  /** RoB 未明维度计数（0-7）。 */
  readonly robUnclearCount: number;
  /** 综合证据质量等级（tier 主 + RoB 修正）。 */
  readonly overall: EvidenceQualityLevel;
}
