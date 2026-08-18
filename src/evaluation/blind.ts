// src/evaluation/blind.ts
// 职责：EVAL-BLIND-001 主观质量评估的盲化管道与一致性测量（机器层）。
//
// 宪法条款：样本匿名、顺序随机、rubric 冻结；报告 reviewer 类型、数量、
// agreement、置信区间和分歧；模型 reviewer 与真人 reviewer 分开报告；
// 真人数据不得伪造；blindness check + inter-rater agreement + adjudication
// protocol 完整。
//
// 机制：
//   anonymizeSample      去身份标记（模型名/自称/风格指纹→占位符），输出
//                        可盲呈现文本 + 剥离清单（可审计：剥了什么）
//   randomizeOrder       种子显式的确定性洗牌（mulberry32 PRNG + Fisher–
//                        Yates）——同种子同序（重放稳定），无种子不洗牌
//   blindnessCheck       匿名化后的文本再扫身份标记——任何残留 = FAIL
//   cohenKappa / fleissKappa / agreementWilsonCI   一致性统计
//   agreementReport      模型组与真人组分开计算/分开报告（禁合并）；真人
//                        组无数据时如实 NULL——不伪造（fail-closed）
//   adjudicationList     分歧项清单（多数不一致 → 需裁决）+ 裁决协议字段
//
// 确定性纪律：无 Math.random（mulberry32 显式种子）；无墙钟；输出按 id 排序。
//
// Cannot-prove：本机制证明「呈现文本在所扫描标记类内无身份残留、一致性
// 统计按供给的评分正确计算」，不证明 (a) 未扫描到的去匿名侧信道（语义
// 风格、内容自指、排版指纹超出 MARKER 清单即漏检）；(b) 评分数据的真实性
// （评分由供给方负责——统计无法识别伪造的「真人」评分）；(c) 盲化在
// 呈现环节确实被执行（本模块产出的是匿名文本与检查，不是呈现监控）。

// ---------------------------------------------------------------------------
// 1. 去身份匿名化
// ---------------------------------------------------------------------------

/** 身份标记模式（模型自称/厂商名/版本号自称）——扫描清单是显式且可扩充的。 */
export const IDENTITY_MARKER_PATTERNS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: 'openai-self-ref', pattern: /\b(gpt-?[45o]*(?:\.\d+)?|chatgpt|openai)\b/gi },
  { label: 'anthropic-self-ref', pattern: /\b(claude(?:\s*[\d.]+)?|anthropic)\b/gi },
  { label: 'google-self-ref', pattern: /\b(gemini(?:-[a-z\d.]+)?|google\s+ai|deepmind)\b/gi },
  { label: 'meta-self-ref', pattern: /\b(llama\s*[\d.]*|meta\s+ai)\b/gi },
  { label: 'zhipu-self-ref', pattern: /\b(glm-?[\d.]+|chatglm|zhipu)\b/gi },
  { label: 'deepseek-self-ref', pattern: /\b(deepseek(?:-r?\d+)?)\b/gi },
  { label: 'first-person-self-ref', pattern: /\b(as an ai|i am (?:an? )?(?:ai|language model|assistant)|my (?:training|creators?|instructions))\b/gi },
];

export interface AnonymizedSample {
  readonly id: string;
  readonly text: string;
  /** 剥离清单：命中标记类 + 次数（审计面——剥了什么必须可见）。 */
  readonly strippedMarkers: readonly { readonly label: string; readonly count: number }[];
}

/** 匿名化：所有命中标记替换为序号占位符 `[anon:<idx>]`（占位符本身不得含
 * 任何标记词——否则盲化检查会被替换文本再次触发）；无命中的文本原样通过。 */
export function anonymizeSample(items: readonly { id: string; text: string }[]): readonly AnonymizedSample[] {
  return items.map((item) => {
    let text = item.text;
    const stripped: { label: string; count: number }[] = [];
    let nextIdx = 0;
    for (const { label, pattern } of IDENTITY_MARKER_PATTERNS) {
      const matches = text.match(pattern);
      if (matches !== null && matches.length > 0) {
        stripped.push({ label, count: matches.length });
        text = text.replace(pattern, `[anon:${nextIdx}]`);
        nextIdx += 1;
      }
    }
    return { id: item.id, text, strippedMarkers: stripped };
  });
}

export type BlindnessCheckResult =
  | { readonly ok: true; readonly scanned: number }
  | { readonly ok: false; readonly scanned: number; readonly residues: readonly { id: string; label: string }[] };

/** 盲化检查：匿名化输出中不得残留任何身份标记（任何残留 = FAIL）。 */
export function blindnessCheck(samples: readonly AnonymizedSample[]): BlindnessCheckResult {
  const residues: { id: string; label: string }[] = [];
  for (const s of samples) {
    for (const { label, pattern } of IDENTITY_MARKER_PATTERNS) {
      // 重新构造无 g 标志的正则做存在性测试（g 标志的 lastIndex 状态会污染多次 test）
      const probe = new RegExp(pattern.source, pattern.flags.replace('g', ''));
      if (probe.test(s.text)) residues.push({ id: s.id, label });
    }
  }
  return residues.length === 0
    ? { ok: true, scanned: samples.length }
    : { ok: false, scanned: samples.length, residues };
}

// ---------------------------------------------------------------------------
// 2. 顺序随机化（种子显式 + 确定性）
// ---------------------------------------------------------------------------

/** mulberry32：32 位确定性 PRNG（同种子同序列；无墙钟无硬件熵）。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomizedOrder {
  /** 呈现顺序（sample id 序列）。 */
  readonly order: readonly string[];
  readonly seed: number;
}

/**
 * 顺序随机化：Fisher–Yates 洗牌，种子显式。种子缺省（undefined）→ throw：
 * 「顺序随机」必须可重放——不可重放的随机化等于不可审计（fail-closed）。
 */
export function randomizeOrder(ids: readonly string[], seed: number): RandomizedOrder {
  if (!Number.isInteger(seed) || seed < 0) {
    throw new Error(`randomizeOrder: seed must be a non-negative integer (got ${seed}) — order randomization must be replayable`);
  }
  const arr = [...ids];
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i] as string;
    arr[i] = arr[j] as string;
    arr[j] = tmp;
  }
  return { order: arr, seed };
}

// ---------------------------------------------------------------------------
// 3. 一致性统计（Cohen κ 两评估者 / Fleiss κ 多评估者 / Wilson CI）
// ---------------------------------------------------------------------------

/** Cohen's kappa（两名评估者，同类标签）。零方差（全同判）→ 1（完美一致且无随机一致空间）。 */
export function cohenKappa(raterA: readonly string[], raterB: readonly string[]): number {
  if (raterA.length === 0 || raterA.length !== raterB.length) {
    throw new Error(`cohenKappa: raters must rate the same non-empty item set (got ${raterA.length} vs ${raterB.length})`);
  }
  const n = raterA.length;
  const labels = new Set([...raterA, ...raterB]);
  let observed = 0;
  for (let i = 0; i < n; i += 1) if (raterA[i] === raterB[i]) observed += 1;
  const po = observed / n;
  let pe = 0;
  for (const label of labels) {
    const pa = raterA.filter((x) => x === label).length / n;
    const pb = raterB.filter((x) => x === label).length / n;
    pe += pa * pb;
  }
  if (pe === 1) return po === 1 ? 1 : 0; // 单标签退化：随机一致期望 1，κ 无定义——完美一致记 1，否则 0
  return (po - pe) / (1 - pe);
}

/**
 * Fleiss' kappa（N≥2 评估者，名义类别）。输入为 items×categories 计数矩阵
 * （每行和 = 评估者数）。行和不为 n 或矩阵为空 → throw（fail-closed）。
 */
export function fleissKappa(counts: readonly (readonly number[])[]): number {
  if (counts.length === 0) throw new Error('fleissKappa: empty count matrix');
  const cats = counts[0]!.length;
  if (cats === 0) throw new Error('fleissKappa: zero categories');
  const n = counts[0]!.reduce((s, x) => s + x, 0);
  if (n < 2) throw new Error('fleissKappa: need at least 2 raters');
  const N = counts.length;
  for (const row of counts) {
    if (row.length !== cats) throw new Error('fleissKappa: ragged count matrix');
    if (row.reduce((s, x) => s + x, 0) !== n) throw new Error('fleissKappa: row sums must equal rater count');
  }
  const pj = new Array<number>(cats).fill(0);
  for (const row of counts) for (let j = 0; j < cats; j += 1) pj[j]! += row[j]!;
  for (let j = 0; j < cats; j += 1) pj[j] = pj[j]! / (N * n);
  const pbar = counts.reduce((s, row) => {
    const pi = (row.reduce((s2, x) => s2 + x * x, 0) - n) / (n * (n - 1));
    return s + pi;
  }, 0) / N;
  const pe = pj.reduce((s, p) => s + p * p, 0);
  if (pe === 1) return pbar === 1 ? 1 : 0;
  return (pbar - pe) / (1 - pe);
}

/** Wilson score 95% 置信区间（比例的小样本安全区间——优于正态近似）。 */
export function agreementWilsonCI(agreements: number, total: number): { readonly low: number; readonly high: number } {
  if (total <= 0) throw new Error('agreementWilsonCI: total must be positive');
  if (agreements < 0 || agreements > total) throw new Error('agreementWilsonCI: agreements out of range');
  const z = 1.959963984540054; // Φ^{-1}(0.975)
  const p = agreements / total;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denom;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

// ---------------------------------------------------------------------------
// 4. 分组一致性报告（模型/真人分开）+ 裁决清单
// ---------------------------------------------------------------------------

export type ReviewerType = 'model' | 'human';

/** 单评估者对单项的判定。reviewerId 区分个体；reviewerType 区分组。 */
export interface RatingRecord {
  readonly itemId: string;
  readonly reviewerId: string;
  readonly reviewerType: ReviewerType;
  readonly decision: string;
}

export interface GroupAgreement {
  readonly reviewerType: ReviewerType;
  readonly reviewerCount: number;
  readonly itemDecisions: number;
  /** 成对一致率均值（组内两两组合）；<2 评估者 → null（无法计算，如实）。 */
  readonly pairwiseAgreement: number | null;
  /** 成对 Cohen κ 均值；不可计算时 null。 */
  readonly meanCohenKappa: number | null;
  /** 一致率的 Wilson 95% CI（基于一致判定数/总对数）；不可计算时 null。 */
  readonly agreementCI: { readonly low: number; readonly high: number } | null;
}

export interface AdjudicationItem {
  readonly itemId: string;
  /** 各判定及其支持数（降序，平手按字典序——确定性）。 */
  readonly decisionTally: readonly { readonly decision: string; readonly count: number }[];
  readonly needsAdjudication: boolean;
}

export interface BlindEvaluationReport {
  readonly groups: readonly GroupAgreement[];
  /** 真人组存在且非空时 true——「真人数据」只能来自供给的真实评分。 */
  readonly hasHumanData: boolean;
  readonly adjudications: readonly AdjudicationItem[];
  /** 分歧率超阈值的项数。 */
  readonly adjudicationRequired: number;
  readonly ok: boolean;
}

/** 组内成对组合的 (reviewerA 序列, reviewerB 序列) 对齐提取（共同评分项，按 itemId 排序）。 */
function pairwiseSequences(
  byReviewer: ReadonlyMap<string, RatingRecord[]>,
  ra: string,
  rb: string,
): { a: readonly string[]; b: readonly string[] } | null {
  const mapA = new Map((byReviewer.get(ra) ?? []).map((r) => [r.itemId, r.decision]));
  const mapB = new Map((byReviewer.get(rb) ?? []).map((r) => [r.itemId, r.decision]));
  const shared = [...mapA.keys()].filter((k) => mapB.has(k)).sort();
  if (shared.length === 0) return null;
  return { a: shared.map((k) => mapA.get(k) ?? ''), b: shared.map((k) => mapB.get(k) ?? '') };
}

/**
 * 多数分歧阈值下的裁决判定：某项的判定分布中，最高票占比 < 阈值（默认
 * 1.0——非全一致即需裁决）→ needsAdjudication。
 */
export const DEFAULT_ADJUDICATION_UNANIMITY = 1.0;

/**
 * 盲评一致性报告：模型组与真人组分开计算、分开输出（宪法：分开报告）；
 * 混组一致率（模型+真人合并）刻意不计算——合并统计会掩盖模型-真人系统差。
 */
export function agreementReport(
  ratings: readonly RatingRecord[],
  unanimityThreshold: number = DEFAULT_ADJUDICATION_UNANIMITY,
): BlindEvaluationReport {
  const byType = new Map<ReviewerType, RatingRecord[]>();
  for (const r of ratings) {
    const list = byType.get(r.reviewerType) ?? [];
    list.push(r);
    byType.set(r.reviewerType, list);
  }

  const groups: GroupAgreement[] = [];
  for (const reviewerType of ['model', 'human'] as const) {
    const records = byType.get(reviewerType) ?? [];
    const byReviewer = new Map<string, RatingRecord[]>();
    for (const r of records) {
      const list = byReviewer.get(r.reviewerId) ?? [];
      list.push(r);
      byReviewer.set(r.reviewerId, list);
    }
    const reviewerIds = [...byReviewer.keys()].sort();
    if (reviewerIds.length < 2) {
      groups.push({
        reviewerType,
        reviewerCount: reviewerIds.length,
        itemDecisions: records.length,
        pairwiseAgreement: null,
        meanCohenKappa: null,
        agreementCI: null,
      });
      continue;
    }
    let agreeEvents = 0;
    let totalPairs = 0;
    const kappas: number[] = [];
    for (let i = 0; i < reviewerIds.length; i += 1) {
      for (let j = i + 1; j < reviewerIds.length; j += 1) {
        const seqs = pairwiseSequences(byReviewer, reviewerIds[i]!, reviewerIds[j]!);
        if (seqs === null) continue;
        const agrees = seqs.a.filter((d, k) => d === seqs.b[k]).length;
        agreeEvents += agrees;
        totalPairs += seqs.a.length;
        kappas.push(cohenKappa(seqs.a, seqs.b));
      }
    }
    groups.push({
      reviewerType,
      reviewerCount: reviewerIds.length,
      itemDecisions: records.length,
      pairwiseAgreement: totalPairs === 0 ? null : agreeEvents / totalPairs,
      meanCohenKappa: kappas.length === 0 ? null : kappas.reduce((s, k) => s + k, 0) / kappas.length,
      agreementCI: totalPairs === 0 ? null : agreementWilsonCI(agreeEvents, totalPairs),
    });
  }

  const byItem = new Map<string, RatingRecord[]>();
  for (const r of ratings) {
    const list = byItem.get(r.itemId) ?? [];
    list.push(r);
    byItem.set(r.itemId, list);
  }
  const adjudications: AdjudicationItem[] = [...byItem.keys()].sort().map((itemId) => {
    const tally = new Map<string, number>();
    for (const r of byItem.get(itemId) ?? []) tally.set(r.decision, (tally.get(r.decision) ?? 0) + 1);
    const total = byItem.get(itemId)!.length;
    const decisionTally = [...tally.entries()]
      .map(([decision, count]) => ({ decision, count }))
      .sort((x, y) => y.count - x.count || (x.decision < y.decision ? -1 : 1));
    const topShare = (decisionTally[0]?.count ?? 0) / total;
    return { itemId, decisionTally, needsAdjudication: topShare < unanimityThreshold };
  });

  return {
    groups,
    hasHumanData: (byType.get('human') ?? []).length > 0,
    adjudications,
    adjudicationRequired: adjudications.filter((a) => a.needsAdjudication).length,
    ok: true,
  };
}

// ---------------------------------------------------------------------------
// 5. 真人数据防伪门（声称「真人验证」必须有真人评分支撑）
// ---------------------------------------------------------------------------

export type HumanClaimVerdict =
  | { readonly ok: true; readonly humanRatings: number }
  | { readonly ok: false; readonly reason: string };

/**
 * 防伪门：报告若声称「含真人 reviewer 证据」，ratings 中必须存在
 * reviewerType='human' 的真实记录。零条真人记录 → 拒绝（宪法：真人数据
 * 不得伪造——没有就是没有，不得用模型评分冒充）。
 */
export function humanClaimGate(
  ratings: readonly RatingRecord[],
  claimIncludesHuman: boolean,
): HumanClaimVerdict {
  const humanCount = ratings.filter((r) => r.reviewerType === 'human').length;
  if (claimIncludesHuman && humanCount === 0) {
    return { ok: false, reason: 'report claims human-reviewer evidence but zero human ratings supplied — model ratings must not masquerade as human data' };
  }
  return { ok: true, humanRatings: humanCount };
}
