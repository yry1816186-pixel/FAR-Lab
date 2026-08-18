// src/evaluation/novelty.ts
// 职责：EVAL-NOVELTY-001 新颖性评估的三面度量（新颖性 vs 相关性 vs 机制
// 不变性）与综合裁决（机器层）。
//
// 宪法条款：新颖性评估需要同时测相关性、机制差异和有用性；指标可包括
// prior-art distance / mechanism novelty / non-obvious combination /
// falsifiability / expected information gain / expert usefulness /
// experimental tractability / rediscovery vs unsupported novelty /
// paraphrase risk；单纯文本距离不得作为新颖性结论。
//
// 机制（三面缺一不可）：
//   面 1 文本面   prior-art distance：对全部 prior art 的 shingle Jaccard
//                取最大相似度（复用 eval_family.shingleJaccard——近重复
//                判定同一 SSOT）；此面单独不得裁决（宪法铁律）
//   面 2 机制面   mechanism novelty：机制模板标签（mechanismTags）对
//                prior-art 标签集的覆盖关系——novelTags/sharedTags/
//                overlapRatio；PARAPHRASE_RISK 与 MECHANISM_OVERLAP 在此检出
//   面 3 有用性面 falsifiability（可证伪预测在场与否）+ expected
//                information gain + expert usefulness + experimental
//                tractability（数值由评估方供给，报告不合并为单一分）
//
// 裁决矩阵（确定性）：
//   机制全被覆盖 + 文本高相似      → PARAPHRASE_OF_PRIOR_ART（改写）
//   机制全被覆盖 + 文本不相似      → REDISCOVERY（同机制重发现）
//   有新机制   + 无可证伪预测      → UNSUPPORTED_NOVELTY（无支撑新颖性）
//   有新机制   + 可证伪预测        → NOVEL_WITH_SUPPORT
//   textOnly 模式（只给文本面）    → TEXT_DISTANCE_ONLY_INSUFFICIENT（宪法：
//                                   文本距离不得作为新颖性结论）
//
// Cannot-prove：本机制证明「在所供给的 prior-art 集、机制标签与有用性数值
// 上三面度量与裁决规则被正确执行」，不证明 (a) prior-art 集完备（未收录的
// 先验工作会让 PARAPHRASE/REDISCOVERY 漏检——检索覆盖由检索层负责）；
// (b) 机制标签本身的正确性（标签是领域判断，机器只比对标签集）；
// (c) 有用性数值的客观性（expertUsefulness 等是专家声明值）。

import { shingleJaccard } from './eval_family.ts';

// ---------------------------------------------------------------------------
// 输入结构
// ---------------------------------------------------------------------------

/** 待评估的候选（三面数据由评估方如实供给；缺面 → fail-closed throw）。 */
export interface NoveltyCandidate {
  readonly id: string;
  /** 候选表述文本（面 1 输入）。 */
  readonly text: string;
  /** 机制模板标签（面 2 输入；空数组 = 未做机制分析 → 裁决降级）。 */
  readonly mechanismTags: readonly string[];
  /** 可证伪预测（面 3：null = 未给出——新颖性无支撑）。 */
  readonly falsifiablePrediction: string | null;
  /** 期望信息增益（面 3：声明值，null = 未评估）。 */
  readonly expectedInformationGain: number | null;
  /** 专家有用性 0–5（面 3：声明值）。 */
  readonly expertUsefulness: number;
  /** 实验可处理性 0–5（面 3：声明值）。 */
  readonly experimentalTractability: number;
}

export interface PriorArt {
  readonly id: string;
  readonly text: string;
  readonly mechanismTags: readonly string[];
}

// ---------------------------------------------------------------------------
// 工程预算阈值（操作性标准——非 empirical claim，同 judge_reliability 惯例）
// ---------------------------------------------------------------------------

/** 文本高相似阈值：超过即视为「表述层面近重复」（与近重复判定同量级）。 */
export const PARAPHRASE_SIM_THRESHOLD = 0.7;
/** 机制覆盖率阈值：sharedTags/tags ≥ 此值 → MECHANISM_OVERLAP。 */
export const MECHANISM_OVERLAP_RATIO = 1.0;
/** 有用性下限：NOVEL_WITH_SUPPORT 需 expertUsefulness ≥ 3（低于则降级为低价值新颖）。 */
export const EXPERT_USEFULNESS_FLOOR = 3;

// ---------------------------------------------------------------------------
// 三面度量
// ---------------------------------------------------------------------------

export interface TextFaceReport {
  /** 对全部 prior art 的最大文本相似度（最近先验）。 */
  readonly maxSimilarity: number;
  /** 最相似的 prior-art id。 */
  readonly nearestPriorArtId: string | null;
  readonly priorArtDistance: number;
}

/** 面 1：文本面对全部 prior art 的距离。 */
export function textFace(candidate: NoveltyCandidate, priorArt: readonly PriorArt[]): TextFaceReport {
  let maxSimilarity = 0;
  let nearest: string | null = null;
  for (const pa of priorArt) {
    const sim = shingleJaccard(candidate.text, pa.text);
    if (sim > maxSimilarity) {
      maxSimilarity = sim;
      nearest = pa.id;
    }
  }
  return { maxSimilarity, nearestPriorArtId: nearest, priorArtDistance: 1 - maxSimilarity };
}

export interface MechanismFaceReport {
  /** 未被任何 prior art 覆盖的机制标签（新颖机制）。 */
  readonly novelTags: readonly string[];
  /** 被至少一个 prior art 覆盖的标签。 */
  readonly sharedTags: readonly string[];
  /** 机制覆盖率 shared/total（1 = 机制完全同构）。 */
  readonly overlapRatio: number;
  /** 非显然组合：候选标签恰好横跨 ≥2 个不同 prior art 的标签集（已知部件的新组合）。 */
  readonly nonObviousCombination: boolean;
  readonly combiningPriorArtIds: readonly string[];
}

/** 面 2：机制标签覆盖（确定性：标签按字典序稳定输出）。 */
export function mechanismFace(candidate: NoveltyCandidate, priorArt: readonly PriorArt[]): MechanismFaceReport {
  if (candidate.mechanismTags.length === 0) {
    return { novelTags: [], sharedTags: [], overlapRatio: 0, nonObviousCombination: false, combiningPriorArtIds: [] };
  }
  const universe = new Set(priorArt.flatMap((pa) => pa.mechanismTags));
  const novel = candidate.mechanismTags.filter((t) => !universe.has(t));
  const shared = candidate.mechanismTags.filter((t) => universe.has(t));
  // 非显然组合：候选标签同时覆盖 ≥2 个 prior art 的标签集，且不与任何
  // 单一 prior art 的标签集完全同集（已知部件的新组合——宪法 non-obvious
  // combination；注意「包含某先验全集」不排除组合性——单标签先验必然被包含）
  const coveredArts = priorArt.filter((pa) => pa.mechanismTags.some((t) => candidate.mechanismTags.includes(t)));
  const sameAsAnySingleArt = priorArt.some((pa) => {
    const cand = [...candidate.mechanismTags].sort().join('\u0000');
    const art = [...pa.mechanismTags].sort().join('\u0000');
    return cand === art;
  });
  const nonObvious = coveredArts.length >= 2 && !sameAsAnySingleArt;
  return {
    novelTags: [...novel].sort(),
    sharedTags: [...shared].sort(),
    overlapRatio: shared.length / candidate.mechanismTags.length,
    nonObviousCombination: nonObvious,
    combiningPriorArtIds: coveredArts.map((pa) => pa.id).sort(),
  };
}

export interface UsefulnessFaceReport {
  readonly falsifiable: boolean;
  readonly expectedInformationGain: number | null;
  readonly expertUsefulness: number;
  readonly experimentalTractability: number;
  /** 低于下限的字段（如实列出，不静默通过）。 */
  readonly belowFloor: readonly string[];
}

/** 面 3：有用性面（字段校验 + 下限检查；不合并为单一分数——各面独立报告）。 */
export function usefulnessFace(candidate: NoveltyCandidate): UsefulnessFaceReport {
  if (candidate.expertUsefulness < 0 || candidate.expertUsefulness > 5 || candidate.experimentalTractability < 0 || candidate.experimentalTractability > 5) {
    throw new Error(`usefulnessFace: usefulness/tractability must be in [0,5] (got ${candidate.expertUsefulness}/${candidate.experimentalTractability})`);
  }
  const belowFloor: string[] = [];
  if (candidate.falsifiablePrediction === null || candidate.falsifiablePrediction.trim().length === 0) belowFloor.push('falsifiability');
  if (candidate.expertUsefulness < EXPERT_USEFULNESS_FLOOR) belowFloor.push('expert-usefulness');
  return {
    falsifiable: !belowFloor.includes('falsifiability'),
    expectedInformationGain: candidate.expectedInformationGain,
    expertUsefulness: candidate.expertUsefulness,
    experimentalTractability: candidate.experimentalTractability,
    belowFloor,
  };
}

// ---------------------------------------------------------------------------
// 综合裁决
// ---------------------------------------------------------------------------

export type NoveltyFlag = 'PARAPHRASE_RISK' | 'MECHANISM_OVERLAP' | 'UNSUPPORTED_NOVELTY' | 'LOW_USEFULNESS';

export type NoveltyVerdict =
  | 'NOVEL_WITH_SUPPORT'
  | 'PARAPHRASE_OF_PRIOR_ART'
  | 'REDISCOVERY'
  | 'UNSUPPORTED_NOVELTY'
  | 'TEXT_DISTANCE_ONLY_INSUFFICIENT'
  | 'NOVELTY_UNTESTABLE_NO_MECHANISM_TAGS';

export interface NoveltyReport {
  readonly verdict: NoveltyVerdict;
  readonly textFace: TextFaceReport;
  readonly mechanismFace: MechanismFaceReport;
  readonly usefulnessFace: UsefulnessFaceReport;
  readonly flags: readonly NoveltyFlag[];
  /** 宪法铁律的显式回执：文本面单独是否曾被（错误地）用作结论依据。 */
  readonly textDistanceAloneInsufficient: boolean;
}

/**
 * 三面综合裁决（确定性）。textOnly=true 时无条件返回
 * TEXT_DISTANCE_ONLY_INSUFFICIENT——「候选与 prior art 文本不像」不构成
 * 新颖性结论（宪法：单纯文本距离不得作为新颖性结论）。
 */
export function assessNovelty(
  candidate: NoveltyCandidate,
  priorArt: readonly PriorArt[],
  options: { readonly textOnly?: boolean } = {},
): NoveltyReport {
  const tf = textFace(candidate, priorArt);
  const mf = mechanismFace(candidate, priorArt);
  const uf = usefulnessFace(candidate);

  const flags: NoveltyFlag[] = [];
  const mechanismFullyCovered = candidate.mechanismTags.length > 0 && mf.overlapRatio >= MECHANISM_OVERLAP_RATIO;
  if (mechanismFullyCovered) flags.push('MECHANISM_OVERLAP');
  const highTextSim = tf.maxSimilarity >= PARAPHRASE_SIM_THRESHOLD;
  if (mechanismFullyCovered && highTextSim) flags.push('PARAPHRASE_RISK');

  let verdict: NoveltyVerdict;
  if (options.textOnly === true) {
    verdict = 'TEXT_DISTANCE_ONLY_INSUFFICIENT';
  } else if (candidate.mechanismTags.length === 0) {
    verdict = 'NOVELTY_UNTESTABLE_NO_MECHANISM_TAGS';
  } else if (mechanismFullyCovered && highTextSim) {
    verdict = 'PARAPHRASE_OF_PRIOR_ART';
  } else if (mechanismFullyCovered) {
    verdict = 'REDISCOVERY';
  } else if (!uf.falsifiable) {
    verdict = 'UNSUPPORTED_NOVELTY';
    flags.push('UNSUPPORTED_NOVELTY');
  } else {
    verdict = 'NOVEL_WITH_SUPPORT';
    if (uf.belowFloor.includes('expert-usefulness')) flags.push('LOW_USEFULNESS');
  }

  return {
    verdict,
    textFace: tf,
    mechanismFace: mf,
    usefulnessFace: uf,
    flags,
    textDistanceAloneInsufficient: true,
  };
}
