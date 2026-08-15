import { falsifiabilityGate } from './gate.ts';
import { evaluateThreshold } from './threshold_semantics.ts';
import type {
  EvidenceBaseBias,
  EvidenceRecord,
  FalsificationSpec,
  ThresholdSpec,
  VerdictDecision,
  VerdictResult,
} from './types.ts';

/**
 * 发表偏倚感知（2.md §8.9 R10 补遗·T0·night-r2 S1）——裁决内核的独占差异位。
 *
 * 动机：验证系统的输入是文献，而文献因发表偏倚系统性偏向阳性结果。R0-R9 证据
 * 聚合若不考虑负结果在文献中的缺位，CONFIRMED 会系统性过于自信（同类竞品
 * co-scientist / AI-Scientist 系均无此层）。
 *
 * CANNOT-PROVE 边界（§7 强制声明）：本检测器**不能证明发表偏倚存在**。偏斜的
 * 证据基完全可能反映真实的科学共识（阴性结果确实少）；注记只标记"证据基符号
 * 分布失衡"这一可观测事实，据此折减 CONFIRMED 的认识论置信展示（tempered
 * 标记·标注级），**不是**对文献的指控，也**不是**裁决降级——5 值裁决枚举与
 * 裁决值本身永不因此改变（旧 replay 字节不受影响）。
 *
 * 检测规则（确定性·纯函数·只依赖投票计数，与证据数组顺序无关）：
 *   - refuteCount === 0 && supportCount >= 10 → kind 'no_negative_evidence'
 *     （ratio = supportCount / 1，约定分母——只作展示语义）
 *   - refuteCount > 0 && supportCount / refuteCount >= 10 → kind 'skewed_base'
 *   - 否则 null。
 *
 * §8.9 数值阈值校准文档义务（"为什么是 10"）：
 *   (a) 校准依据：10× 是数量级失衡启发式（order-of-magnitude imbalance
 *       heuristic）——一个反证对抗十个以上支持时，聚合结果的主导性已非个体
 *       研究质量所能解释，值得审视证据基本身的符号分布。全支持且 <10 条的
 *       小证据基是正常的早期证据形态，不标注（避免对年轻领域的 CONFIRMED
 *       撒噪注记）。比值判定用整数比较 supportCount >= refuteCount * 10
 *       （与除法比较在正整数域数学等价，规避 IEEE754 边界；ratio 字段仅为
 *       展示用除法结果）。
 *   (b) 敏感性分析（±20%）：阈值取 8 或 12 只影响边界计数——8 时 8/0、9/0、
 *       80/10 等额外落入标注；12 时 10/0、11/0、10/1、120/12 退出标注；
 *       典型裁决向量（50/0、50/5、20/3、0/50）在 8/12 两档下裁决值与标注
 *       有无均不变（20/3≈6.67 在三档下都不标注）。阈值变更须走 ADR。
 *   (c) 不对称性（显式设计选择）：负向偏斜（全反证 → REFUTED）不折减——
 *       R10 条款针对的是 CONFIRMED 的过度自信（文献阳性偏倚方向）；且
 *       supportCount === 0 时任何比值规则均不触发，机制上 REFUTED 恒无注记。
 */

/**
 * Decides a verdict from a claim and its evidence records using the legacy
 * simple algorithm (scope-slip → DEGRADED_SCOPE, conflict → INCONCLUSIVE,
 * all-support → CONFIRMED, all-refute → REFUTED, empty → UNTESTED).
 *
 * @param input - The claim text and evidence records.
 * @returns A {@link VerdictDecision}.
 * @throws {Error} if claim is empty or evidence state is unreachable.
 */
export function decideVerdict(input: {
  readonly claim: string;
  readonly evidences: ReadonlyArray<EvidenceRecord>;
}): VerdictDecision {
  if (input.claim.trim().length === 0) {
    throw new Error('decideVerdict: claim must be non-empty');
  }
  if (input.evidences.length === 0) {
    return {
      verdict: 'UNTESTED',
      scopeSlipText: null,
      untestedReason: 'no evidence collected for this claim',
      conflictingEvidenceCount: 0,
      // 空证据基无可评估的符号分布（R10 早退恒 null）。
      evidenceBaseBias: null,
    };
  }

  for (const evidence of input.evidences) {
    assertEvidenceRecord(evidence);
  }

  const narrower = input.evidences.find((evidence) => evidence.scopeNarrowerThanClaim);
  if (narrower !== undefined) {
    return {
      verdict: 'DEGRADED_SCOPE',
      scopeSlipText: narrower.claim,
      untestedReason: null,
      conflictingEvidenceCount: 0,
      // scope-slip 优先级高于偏倚注记：证据覆盖面都不足时谈符号失衡无意义（R10 早退恒 null）。
      evidenceBaseBias: null,
    };
  }

  const supportsCount = input.evidences.filter((evidence) => evidence.supportsClaim).length;
  const refutesCount = input.evidences.filter((evidence) => evidence.refutesClaim).length;

  if (supportsCount > 0 && refutesCount > 0) {
    return {
      verdict: 'INCONCLUSIVE',
      scopeSlipText: null,
      untestedReason: null,
      conflictingEvidenceCount: Math.min(supportsCount, refutesCount),
      // 冲突裁决值上的悬殊偏斜仍附注（信息性·tempered=false——折减只作用于 CONFIRMED）。
      evidenceBaseBias: detectEvidenceBaseBias('INCONCLUSIVE', supportsCount, refutesCount),
    };
  }

  if (supportsCount === input.evidences.length) {
    return {
      verdict: 'CONFIRMED',
      scopeSlipText: null,
      untestedReason: null,
      conflictingEvidenceCount: 0,
      evidenceBaseBias: detectEvidenceBaseBias('CONFIRMED', supportsCount, refutesCount),
    };
  }

  if (refutesCount === input.evidences.length) {
    return {
      verdict: 'REFUTED',
      scopeSlipText: null,
      untestedReason: null,
      conflictingEvidenceCount: 0,
      // 负向偏斜不折减（R10 针对 CONFIRMED 过度自信·不对称性见模块 docstring）；
      // supportCount===0 时检测规则数学上不触发——detector 此处必返 null，测试钉住。
      evidenceBaseBias: detectEvidenceBaseBias('REFUTED', supportsCount, refutesCount),
    };
  }

  throw new Error(
    `decideVerdict: unreachable evidence state, supports=${supportsCount}, refutes=${refutesCount}, total=${input.evidences.length}`,
  );
}

/** R10 §8.9 校准阈值：全支持基的最小标注量级（<10 视为正常早期证据）。 */
const EVIDENCE_BASE_BIAS_MIN_ALL_SUPPORT = 10;

/** R10 §8.9 校准阈值：支持:反证数量级失衡比（整数比较规避 IEEE754 边界）。 */
const EVIDENCE_BASE_BIAS_RATIO = 10;

/**
 * 发表偏倚感知检测（R10·确定性·纯函数）：由投票计数构造 {@link EvidenceBaseBias}，
 * 不满足失衡阈值时返回 null。阈值校准依据与敏感性分析见模块 docstring（§8.9）。
 * `verdict` 仅用于设置 tempered（折减只在 CONFIRMED 上为 true），不影响检测本身。
 */
function detectEvidenceBaseBias(
  verdict: VerdictDecision['verdict'],
  supportCount: number,
  refuteCount: number,
): EvidenceBaseBias | null {
  const tempered = verdict === 'CONFIRMED';
  if (refuteCount === 0 && supportCount >= EVIDENCE_BASE_BIAS_MIN_ALL_SUPPORT) {
    return {
      kind: 'no_negative_evidence',
      supportCount,
      refuteCount,
      // 约定分母 1（spec：ratio = supportCount / 1）——零反证时展示支持量级。
      ratio: supportCount / 1,
      note: `Evidence-base imbalance SIGNAL (not proof of publication bias): ${supportCount} supporting vs no refuting evidence. A skewed base may equally reflect genuine scientific consensus; CONFIRMED strength is tempered accordingly.`,
      tempered,
    };
  }
  if (refuteCount > 0 && supportCount >= refuteCount * EVIDENCE_BASE_BIAS_RATIO) {
    return {
      kind: 'skewed_base',
      supportCount,
      refuteCount,
      ratio: supportCount / refuteCount,
      note: `Evidence-base imbalance SIGNAL (not proof of publication bias): ${supportCount} supporting vs ${refuteCount} refuting (ratio ${supportCount / refuteCount}). A skewed base may equally reflect genuine scientific consensus; annotation is informational on this verdict value.`,
      tempered,
    };
  }
  return null;
}

/**
 * Full verdict pipeline: validates the falsification spec via the gate,
 * enriches evidence with threshold evaluation, then decides the verdict.
 *
 * R10 线程化说明：decideVerdict 产出的 evidenceBaseBias（发表偏倚感知注记·含
 * tempered 折减标记）经下方 `...decision` 展开自动流入 VerdictResult——持久化层
 * 与 API 无需额外接线即可读到该 additive 字段。
 *
 * @param input - Claim, evidences, falsification spec, and threshold spec.
 * @returns A {@link VerdictResult} including the measured metric value.
 */
export function makeVerdict(input: {
  readonly claim: string;
  readonly evidences: ReadonlyArray<EvidenceRecord>;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec;
}): VerdictResult {
  falsifiabilityGate({
    hypothesis: input.claim,
    falsificationSpec: input.falsificationSpec,
    thresholdSpec: input.thresholdSpec,
  });

  const enrichedEvidences = input.evidences.map((evidence): EvidenceRecord => {
    if (evidence.metricValue === undefined) {
      return evidence;
    }
    const evaluation = evaluateThreshold(evidence.metricValue, input.thresholdSpec);
    return {
      ...evidence,
      supportsClaim: evaluation.supportsClaim,
      refutesClaim: evaluation.refutesClaim,
    };
  });

  const decision = decideVerdict({
    claim: input.claim,
    evidences: enrichedEvidences,
  });

  return {
    ...decision,
    metricValue: firstMetricValue(enrichedEvidences),
  };
}

function assertEvidenceRecord(evidence: EvidenceRecord): void {
  if (evidence.claim.trim().length === 0) {
    throw new Error('decideVerdict: evidence claim must be non-empty');
  }
  if (evidence.metricValue !== undefined && !Number.isFinite(evidence.metricValue)) {
    throw new Error(`decideVerdict: metricValue must be finite for evidence "${evidence.claim}"`);
  }
  if (evidence.supportsClaim === evidence.refutesClaim) {
    throw new Error(
      `decideVerdict: evidence must set exactly one of supportsClaim/refutesClaim for "${evidence.claim}"`,
    );
  }
}

function firstMetricValue(evidences: ReadonlyArray<EvidenceRecord>): number | null {
  const evidence = evidences.find((item) => item.metricValue !== undefined);
  if (evidence === undefined || evidence.metricValue === undefined) {
    return null;
  }
  return evidence.metricValue;
}
