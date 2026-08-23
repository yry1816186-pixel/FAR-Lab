import type { ScreenDoc, ScreeningQueueItem, StopEstimate } from './screening-types.js';
export type { ScreenDoc, ScreeningQueueItem, StopEstimate };

/**
 * Deterministic active-learning screening core (ASReview-pattern, zero deps).
 *
 * Model: TF-IDF bag-of-words + online logistic regression (SGD, seeded LCG).
 * Everything is pure: same docs + same labels + same seed => byte-identical
 * queue — the property tests pin this. No invented confidence beyond what the
 * labeled sample supports; the stop rule reports an honest estimate, never a
 * guaranteed recall.
 */

// ---- seeded rng (mulberry32): stable across platforms, no Math.random ----
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** unicode61-flavoured tokens: latin word runs + CJK bigrams — good enough for
 *  relevance ranking, fully deterministic. */
export const tokenize = (text: string): string[] => {
  const out: string[] = [];
  const latin = text.toLowerCase().match(/[a-z0-9][a-z0-9'+-]{1,}/g) ?? [];
  out.push(...latin);
  const cjk = text.match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const run of cjk) {
    if (run.length === 1) { out.push(run); continue; }
    for (let i = 0; i + 1 < run.length; i++) out.push(run.slice(i, i + 2));
  }
  return out;
};

type SparseVec = Map<string, number>;
interface LrModel { w: SparseVec; b: number }

const buildTfidf = (docs: ScreenDoc[]): SparseVec[] => {
  const df = new Map<string, number>();
  const tokenized = docs.map((d) => {
    const tf = new Map<string, number>();
    for (const t of tokenize(d.text)) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return tf;
  });
  const N = Math.max(docs.length, 1);
  const idf = new Map<string, number>();
  for (const [t, n] of df) idf.set(t, Math.log((N + 1) / (n + 0.5)) + 1);
  return tokenized.map((tf) => {
    const v: SparseVec = new Map();
    let norm = 0;
    for (const [t, f] of tf) {
      const wgt = (1 + Math.log(f)) * (idf.get(t) ?? 0);
      v.set(t, wgt);
      norm += wgt * wgt;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, wgt] of v) v.set(t, wgt / norm);
    return v;
  });
};

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/** L2-regularized logistic regression trained by seeded-shuffled SGD epochs. */
const trainLr = (
  samples: Array<{ v: SparseVec; y: 0 | 1 }>,
  opts: { epochs: number; lr: number; l2: number; seed: number },
): LrModel => {
  const w: SparseVec = new Map();
  let b = 0;
  const rng = mulberry32(opts.seed);
  const idx = samples.map((_, i) => i);
  for (let epoch = 0; epoch < opts.epochs; epoch++) {
    // Fisher-Yates with the seeded rng — deterministic shuffle.
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = idx[i] as number;
      idx[i] = idx[j] as number;
      idx[j] = tmp;
    }
    for (const i of idx) {
      const s = samples[i];
      if (s === undefined) continue;
      let z = b;
      for (const [t, x] of s.v) z += (w.get(t) ?? 0) * x;
      const g = sigmoid(z) - s.y;
      b -= opts.lr * g;
      for (const [t, x] of s.v) w.set(t, (w.get(t) ?? 0) - opts.lr * (g * x + opts.l2 * (w.get(t) ?? 0)));
    }
  }
  return { w, b };
};

const predict = (m: LrModel, v: SparseVec): number => {
  let z = m.b;
  for (const [t, x] of v) z += (m.w.get(t) ?? 0) * x;
  return sigmoid(z);
};

const gatherSamples = (
  vecs: SparseVec[],
  byId: Map<string, number>,
  ids: readonly string[],
  y: 0 | 1,
): Array<{ v: SparseVec; y: 0 | 1 }> => {
  const out: Array<{ v: SparseVec; y: 0 | 1 }> = [];
  for (const id of ids) {
    const v = vecs[byId.get(id) ?? -1];
    if (v !== undefined) out.push({ v, y });
  }
  return out;
};

const trainOnLabels = (
  vecs: SparseVec[],
  byId: Map<string, number>,
  includeIds: readonly string[],
  excludeIds: readonly string[],
  seed: number,
): LrModel => trainLr(
  [
    ...gatherSamples(vecs, byId, includeIds, 1),
    ...gatherSamples(vecs, byId, excludeIds, 0),
  ],
  { epochs: 12, lr: 0.5, l2: 1e-4, seed },
);

export const DEFAULT_SEED = 20260824;
/** Cold start (< this many labels): seeded-random queue — the ASReview random phase. */
export const MIN_LABELED_FOR_MODEL = 5;

export function rankQueue(
  docs: ScreenDoc[],
  includeIds: readonly string[],
  excludeIds: readonly string[],
  opts: { seed?: number } = {},
): ScreeningQueueItem[] {
  const seed = opts.seed ?? DEFAULT_SEED;
  const labeled = new Set([...includeIds, ...excludeIds]);
  const unlabeled = docs.filter((d) => !labeled.has(d.id));
  const nLabeled = includeIds.length + excludeIds.length;

  if (nLabeled < MIN_LABELED_FOR_MODEL || includeIds.length === 0) {
    const rng = mulberry32(seed ^ hashString(unlabeled.map((d) => d.id).join('|')));
    const shuffled = [...unlabeled];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = shuffled[i] as ScreenDoc;
      shuffled[i] = shuffled[j] as ScreenDoc;
      shuffled[j] = tmp;
    }
    return shuffled.map((d, i) => ({ srcId: d.id, pRelevant: null, rank: i, phase: 'random' as const }));
  }

  const vecs = buildTfidf(docs);
  const byId = new Map(docs.map((d, i) => [d.id, i] as const));
  const model = trainOnLabels(vecs, byId, includeIds, excludeIds, seed);

  return unlabeled
    .map((d) => {
      const v = vecs[byId.get(d.id) ?? -1];
      return { srcId: d.id, pRelevant: v === undefined ? 0.5 : predict(model, v), rank: 0, phase: 'model' as const };
    })
    .sort((a, b) => (b.pRelevant ?? 0) - (a.pRelevant ?? 0) || (a.srcId < b.srcId ? -1 : 1))
    .map((item, i) => ({ ...item, rank: i }));
}

/** WSS@95-style stop estimate. eligible only when the recent screening window
 *  is consistently model-predicted-irrelevant AND enough labels exist to trust
 *  the estimate. Honest by construction: coverage is an ESTIMATE off the
 *  labeled sample, surfaced with its basis, never a guaranteed recall. */
export const MIN_LABELED_FOR_STOP = 15;
export const RECENT_WINDOW = 10;

export function estimateStop(
  docs: ScreenDoc[],
  includeIds: readonly string[],
  excludeIds: readonly string[],
  recentVerdicts: readonly ('include' | 'exclude')[],
  opts: { seed?: number } = {},
): StopEstimate {
  const nLabeled = includeIds.length + excludeIds.length;
  if (nLabeled < MIN_LABELED_FOR_STOP || includeIds.length === 0) {
    return {
      eligible: false,
      labeledCount: nLabeled,
      includeCount: includeIds.length,
      predictedRelevantRemaining: null,
      coverageEstimate: null,
      basis: `标注不足（当前 ${nLabeled} 条，停止估计至少需要 ${MIN_LABELED_FOR_STOP} 条且至少 1 条纳入）——在更少样本上给覆盖率估计是不诚实的`,
    };
  }
  const vecs = buildTfidf(docs);
  const byId = new Map(docs.map((d, i) => [d.id, i] as const));
  const model = trainOnLabels(vecs, byId, includeIds, excludeIds, opts.seed ?? DEFAULT_SEED);

  const labeled = new Set([...includeIds, ...excludeIds]);
  let predictedRemaining = 0;
  for (const d of docs) {
    if (labeled.has(d.id)) continue;
    const v = vecs[byId.get(d.id) ?? -1];
    if (v !== undefined && predict(model, v) >= 0.5) predictedRemaining += 1;
  }
  const coverage = includeIds.length / (includeIds.length + predictedRemaining);
  const recent = recentVerdicts.slice(-RECENT_WINDOW);
  const windowIsAllExcludes = recent.length === RECENT_WINDOW && recent.every((v) => v === 'exclude');
  const eligible = windowIsAllExcludes && coverage >= 0.95;
  return {
    eligible,
    labeledCount: nLabeled,
    includeCount: includeIds.length,
    predictedRelevantRemaining: predictedRemaining,
    coverageEstimate: coverage,
    basis: windowIsAllExcludes
      ? eligible
        ? `最近 ${RECENT_WINDOW} 篇连续判为不相关，且按已标注样本估计已覆盖 ${(coverage * 100).toFixed(1)}% 的相关文献（模型预测剩余相关 ${predictedRemaining} 篇）——继续筛选的边际收益低`
        : `最近 ${RECENT_WINDOW} 篇连续判为不相关，但覆盖率估计仅 ${(coverage * 100).toFixed(1)}%（预测剩余相关 ${predictedRemaining} 篇）——不建议停止`
      : `覆盖率估计 ${(coverage * 100).toFixed(1)}%（预测剩余相关 ${predictedRemaining} 篇）；停止需最近 ${RECENT_WINDOW} 篇连续判为不相关`,
  };
}
