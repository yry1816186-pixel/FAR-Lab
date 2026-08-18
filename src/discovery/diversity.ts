// src/discovery/diversity.ts
// 职责：SCI-DIVERSITY-001 候选集的语义+机制双维度多样性度量（机器层）。
//
// 宪法条款：多样性评估应区分表述差异、机制差异、预测差异、证据需求差异
// 和实验可区分性；embedding 只能作为增强信号，不得单独裁决机制等价；
// PARAPHRASE_RISK / MECHANISM_OVERLAP / UNTESTABLE_VARIANT 需要显式标记。
//
// 机制（五维度分离度量——不合并为单一「多样性分」）：
//   表述面     pairwise shingleJaccard（复用 eval_family）——高相似 →
//             PARAPHRASE_RISK（仅表述差异的候选显式标记）
//   机制面     mechanismTags 集合精确比较——同集 → MECHANISM_OVERLAP；
//             结构性纪律：机制等价只读 mechanismTags，embedding 向量
//             永不参与机制裁决（advisory-only 通道单独输出）
//   预测面     可证伪预测文本比较；双空 → UNTESTABLE_VARIANT
//   证据面     evidenceNeeds 重叠率（低重叠 = 证据需求差异大）
//   可区分面   机制同集 AND 预测同文 → NOT_DISTINGUISHABLE（实验上不可
//             区分的候选对——合并候选而非独立发现）
//   聚类       按机制标签集贪心聚类（确定性：按 id 排序种子）；留一法
//             clusterStability 报告簇数稳定性
//   阈值下警告 PARAPHRASE_SIM_THRESHOLD 为显式 ENGINEERING BUDGET
//
// Cannot-prove：本机制证明「五维度按供给数据确定性计算、机制裁决不依赖
// embedding」，不证明 (a) 机制标签与预测文本的语义质量（同义不同文的
// 预测会被判为不同——文本比较保守，宁可漏合并不可误合并）；(b) 聚类
// 稳定性高蕴含语义聚类正确（稳定性只度量对单元素移除的敏感度）；
// (c) 候选集真实覆盖假设空间（多样性度量只看集内差异）。

import { shingleJaccard } from '../evaluation/eval_family.ts';

// ---------------------------------------------------------------------------
// 输入结构
// ---------------------------------------------------------------------------

export interface DiversityCandidate {
  readonly id: string;
  readonly text: string;
  readonly mechanismTags: readonly string[];
  /** 可证伪预测（null = 未给出——UNTESTABLE_VARIANT 面）。 */
  readonly prediction: string | null;
  /** 证据需求清单（如 ['cohort', 'instrumentation']）。 */
  readonly evidenceNeeds: readonly string[];
  /** embedding 向量——仅增强信号，本模块的结构性纪律保证它不进机制裁决。 */
  readonly embeddingVector?: readonly number[];
}

// ---------------------------------------------------------------------------
// 阈值（ENGINEERING BUDGET——操作性标准，非 empirical claim）
// ---------------------------------------------------------------------------

/** 表述近重复阈值：超过即 PARAPHRASE_RISK。 */
export const PARAPHRASE_SIM_THRESHOLD = 0.7;

export type DiversityFlag = 'PARAPHRASE_RISK' | 'MECHANISM_OVERLAP' | 'UNTESTABLE_VARIANT' | 'NOT_DISTINGUISHABLE';

// ---------------------------------------------------------------------------
// 逐对五维分析
// ---------------------------------------------------------------------------

export interface PairAnalysis {
  readonly a: string;
  readonly b: string;
  /** 表述面：文本相似度。 */
  readonly textSimilarity: number;
  /** 机制面：标签集是否同集。 */
  readonly sameMechanism: boolean;
  /** 机制面：标签 Jaccard（重叠程度——非裁决量，报告用）。 */
  readonly mechanismOverlap: number;
  /** 预测面：双空/同文/不同。 */
  readonly predictionRelation: 'both-untestable' | 'identical' | 'different';
  /** 证据面：证据需求重叠率（交集/并集）。 */
  readonly evidenceOverlap: number;
  /** 可区分面：机制同集且预测同文 → 实验不可区分。 */
  readonly experimentallyDistinguishable: boolean;
  readonly flags: readonly DiversityFlag[];
}

function tagJaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1; // 双空视为同集（都未做机制分析）
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = [...sa].filter((t) => sb.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : inter / union;
}

/** 逐对分析（确定性：对按 (a<b) 字典序输出）。 */
export function analyzePairs(candidates: readonly DiversityCandidate[]): readonly PairAnalysis[] {
  const sorted = [...candidates].sort((x, y) => (x.id < y.id ? -1 : 1));
  const out: PairAnalysis[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      const textSimilarity = shingleJaccard(a.text, b.text);
      const mechanismOverlap = tagJaccard(a.mechanismTags, b.mechanismTags);
      const sameMechanism = mechanismOverlap === 1;
      let predictionRelation: PairAnalysis['predictionRelation'];
      if (a.prediction === null && b.prediction === null) predictionRelation = 'both-untestable';
      else if (a.prediction !== null && b.prediction !== null && a.prediction === b.prediction) predictionRelation = 'identical';
      else predictionRelation = 'different';
      const sa = new Set(a.evidenceNeeds);
      const sb = new Set(b.evidenceNeeds);
      const inter = [...sa].filter((t) => sb.has(t)).length;
      const union = new Set([...a.evidenceNeeds, ...b.evidenceNeeds]).size;
      const evidenceOverlap = union === 0 ? 1 : inter / union;
      const distinguishable = !(sameMechanism && (predictionRelation === 'identical' || predictionRelation === 'both-untestable'));
      const flags: DiversityFlag[] = [];
      if (textSimilarity >= PARAPHRASE_SIM_THRESHOLD) flags.push('PARAPHRASE_RISK');
      if (sameMechanism) flags.push('MECHANISM_OVERLAP');
      if (predictionRelation === 'both-untestable') flags.push('UNTESTABLE_VARIANT');
      if (!distinguishable) flags.push('NOT_DISTINGUISHABLE');
      out.push({
        a: a.id,
        b: b.id,
        textSimilarity,
        sameMechanism,
        mechanismOverlap,
        predictionRelation,
        evidenceOverlap,
        experimentallyDistinguishable: distinguishable,
        flags,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 聚类（按机制标签集——确定性贪心）
// ---------------------------------------------------------------------------

export interface MechanismCluster {
  /** 簇标签集（同集候选聚为一簇）。 */
  readonly tags: readonly string[];
  readonly memberIds: readonly string[];
}

/** 机制聚类：标签集相同的候选归一簇（确定性：按标签集字典序输出）。 */
export function clusterByMechanism(candidates: readonly DiversityCandidate[]): readonly MechanismCluster[] {
  const byTags = new Map<string, string[]>();
  for (const c of [...candidates].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const key = [...new Set(c.mechanismTags)].sort().join('\u0000');
    const members = byTags.get(key) ?? [];
    members.push(c.id);
    byTags.set(key, members);
  }
  return [...byTags.entries()]
    .map(([key, memberIds]) => ({ tags: key.split('\u0000'), memberIds }))
    .sort((x, y) => (x.tags.join('|') < y.tags.join('|') ? -1 : 1));
}

/** 留一法簇稳定性：逐个移除候选后簇数的变异（0 = 完全稳定）。 */
export function clusterStability(candidates: readonly DiversityCandidate[]): {
  readonly baseClusterCount: number;
  readonly perRemovalClusterCounts: readonly { readonly removed: string; readonly clusterCount: number }[];
  readonly stable: boolean;
} {
  const base = clusterByMechanism(candidates).length;
  const perRemoval = candidates.map((c) => {
    const rest = candidates.filter((x) => x.id !== c.id);
    return { removed: c.id, clusterCount: rest.length === 0 ? 0 : clusterByMechanism(rest).length };
  });
  const variations = new Set(perRemoval.map((p) => p.clusterCount - base));
  return { baseClusterCount: base, perRemovalClusterCounts: perRemoval, stable: variations.size === 1 && variations.has(0) };
}

// ---------------------------------------------------------------------------
// 增强信号（embedding advisory-only——结构性不进机制裁决）
// ---------------------------------------------------------------------------

export interface EmbeddingAdvisory {
  readonly pair: readonly [string, string];
  readonly cosineSimilarity: number;
}

function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * embedding 增强信号：计算余弦相似度供人工复核参考。
 * 结构性纪律：本函数是 embedding 的唯一出口，其结果类型 EmbeddingAdvisory
 * 不参与 analyzePairs/clusterByMechanism 的任何裁决路径（机制等价只读
 * mechanismTags——宪法：embedding 不得单独裁决机制等价）。
 */
export function embeddingAdvisory(candidates: readonly DiversityCandidate[]): readonly EmbeddingAdvisory[] {
  const withVec = candidates.filter((c) => c.embeddingVector !== undefined);
  const out: EmbeddingAdvisory[] = [];
  for (let i = 0; i < withVec.length; i += 1) {
    for (let j = i + 1; j < withVec.length; j += 1) {
      const a = withVec[i]!;
      const b = withVec[j]!;
      out.push({ pair: [a.id, b.id], cosineSimilarity: cosine(a.embeddingVector!, b.embeddingVector!) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 候选集多样性报告
// ---------------------------------------------------------------------------

export interface DiversityReport {
  readonly candidateCount: number;
  /** 机制多样性：唯一机制标签集数 / 候选数（1 = 全同构，越低越差）。 */
  readonly mechanismDiversity: number;
  /** 预测多样性：非空且互异的预测数 / 候选数。 */
  readonly predictionDiversity: number;
  readonly pairs: readonly PairAnalysis[];
  readonly clusters: readonly MechanismCluster[];
  readonly clusterStable: boolean;
  /** 各 flag 的命中对数。 */
  readonly flagCounts: Readonly<Record<DiversityFlag, number>>;
  /** 阈值下警告：任一 flag 命中时的显式警告文本。 */
  readonly warnings: readonly string[];
}

/** 候选集多样性报告（五维分离 + flag 汇总 + 阈值下警告）。 */
export function diversityReport(candidates: readonly DiversityCandidate[]): DiversityReport {
  const pairs = analyzePairs(candidates);
  const clusters = clusterByMechanism(candidates);
  const uniqueTagSets = new Set(candidates.map((c) => [...new Set(c.mechanismTags)].sort().join('\u0000'))).size;
  const uniquePredictions = new Set(candidates.filter((c) => c.prediction !== null).map((c) => c.prediction)).size;
  const flagCounts: Record<DiversityFlag, number> = { PARAPHRASE_RISK: 0, MECHANISM_OVERLAP: 0, UNTESTABLE_VARIANT: 0, NOT_DISTINGUISHABLE: 0 };
  for (const p of pairs) for (const f of p.flags) flagCounts[f] += 1;
  const warnings: string[] = [];
  if (flagCounts.PARAPHRASE_RISK > 0) warnings.push(`${flagCounts.PARAPHRASE_RISK} pair(s) above paraphrase threshold ${PARAPHRASE_SIM_THRESHOLD} — surface-level breadth only`);
  if (flagCounts.MECHANISM_OVERLAP > 0) warnings.push(`${flagCounts.MECHANISM_OVERLAP} pair(s) with identical mechanism tag sets — candidate set may overstate breadth`);
  if (flagCounts.UNTESTABLE_VARIANT > 0) warnings.push(`${flagCounts.UNTESTABLE_VARIANT} pair(s) both lacking falsifiable predictions — untestable variants`);
  if (flagCounts.NOT_DISTINGUISHABLE > 0) warnings.push(`${flagCounts.NOT_DISTINGUISHABLE} pair(s) not experimentally distinguishable — merge candidates rather than count separately`);
  const n = candidates.length;
  return {
    candidateCount: n,
    mechanismDiversity: n === 0 ? 0 : uniqueTagSets / n,
    predictionDiversity: n === 0 ? 0 : uniquePredictions / n,
    pairs,
    clusters,
    clusterStable: clusterStability(candidates).stable,
    flagCounts,
    warnings,
  };
}
