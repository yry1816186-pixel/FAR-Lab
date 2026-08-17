// src/research/evaluation/rubric.ts — 盲评工具的纯逻辑层（2.md §4.4，day-r13）。
//
// `far rubric` 的 SSOT：盲评包构建（去标识 + 种子化匿名序）+ 评分 CSV 解析 +
// 聚合（逐项均值±sd、Cohen's κ、Krippendorff's α 名义量级）+ 报告渲染。
// 全确定性、零 LLM、零网络：工具与真实招募流程文档即交付（§4.4 原文），
// 不伪造评分——聚合只统计 CSV 里真实存在的评分行。
//
// 盲评纪律：
//   - 去标识：剥离 strategyOrigin/provenance/模型身份（评分者只见假设内容）；
//   - 映射文件（blindId→真实 run/hypothesis id）只落 .far/rubric/<packageId>/key.json，
//     绝不进盲评包目录——评委不可见；
//   - 呈现顺序经种子化 Fisher-Yates 洗牌，种子入包（第三方可复算顺序）；
//   - 单评分者：κ/α 无定义 → null + 注记（诚实降级，不装作有共识度量）。

import { createHash } from 'node:crypto';

import type { ResearchRun } from '../types.ts';

/** 固定评分维度（1-5 Likert）——§4.4 盲评包设计的最小集。 */
export const RUBRIC_SCALES = ['novelty', 'plausibility', 'falsifiability', 'actionability'] as const;
export type RubricScale = (typeof RUBRIC_SCALES)[number];

/** 盲评包中的一条（去标识后的）假设。 */
export interface RubricItem {
  /** 匿名呈现 id（H-01…，按洗牌后顺序编号）。 */
  readonly blindId: string;
  readonly question: string;
  readonly statement: string;
  readonly mechanism: string;
  readonly predictions: readonly string[];
  readonly falsification: string;
  readonly limitations: readonly string[];
}

/** 盲评包（评委可见的全部内容）。 */
export interface BlindPackage {
  readonly packageId: string;
  readonly createdAt: string;
  readonly seed: number;
  readonly sourceRunCount: number;
  readonly items: readonly RubricItem[];
  readonly instructions: string;
}

/** 盲评钥匙（评委不可见——聚合时还原真实身份）。 */
export interface BlindKey {
  readonly packageId: string;
  readonly seed: number;
  readonly mapping: Readonly<Record<string, { runId: string; hypothesisId: string }>>;
}

/** 一行评分（CSV 解析产物）。 */
export interface RatingRow {
  readonly rater: string;
  readonly blindId: string;
  readonly scale: RubricScale;
  readonly score: number;
  readonly comment: string;
}

/** 逐（item×scale）统计。 */
export interface ItemScaleStat {
  readonly blindId: string;
  readonly scale: RubricScale;
  readonly n: number;
  readonly mean: number;
  readonly sd: number;
}

/** 一个 scale 的共识度量。 */
export interface AgreementStat {
  readonly scale: RubricScale;
  readonly raterCount: number;
  /** 成对 Cohen's κ（名义、精确匹配）的均值；<2 评分者为 null。 */
  readonly meanPairwiseKappa: number | null;
  /** Krippendorff's α（名义）；<2 评分者为 null。 */
  readonly krippendorffAlpha: number | null;
  /** 评分者两两共评的 item 数（κ 的样本量证据）。 */
  readonly pairwiseN: number;
}

export interface RubricAggregation {
  readonly packageId: string;
  readonly raterCount: number;
  readonly ratedItems: number;
  readonly itemStats: readonly ItemScaleStat[];
  readonly agreement: readonly AgreementStat[];
  readonly warnings: readonly string[];
}

// ── 确定性洗牌（fnv1a 家族，与 frozen_multirun 同源思想） ─────────────────────

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function rand01(seed: number): number {
  // xorshift32 → [0,1)：与统计层不同的独立小生成器，只服务呈现顺序。
  let x = seed || 1;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  return x / 4294967296;
}

// ── 盲评包构建 ────────────────────────────────────────────────────────────────

export interface BuildBlindPackageOptions {
  /** 洗牌种子（默认由 runIds 推导——同输入同包序）。 */
  readonly seed?: number;
  readonly now?: () => Date;
}

/** 从 run 集构建盲评包 + 钥匙（唯一入口——两个产物永远同种子）。 */
export function buildBlindPackage(
  runs: readonly ResearchRun[],
  opts: BuildBlindPackageOptions = {},
): { pkg: BlindPackage; key: BlindKey } {
  if (runs.length === 0) throw new Error('blind package needs at least one run');
  const runIds = runs.map((r) => r.runId).sort();
  const seed = opts.seed ?? fnv1a(`rubric:${runIds.join('|')}`);
  const now = (opts.now ?? (() => new Date()))();
  const packageId = `rubric-${now.toISOString().slice(0, 10)}-${(seed % 0xfffff).toString(16).padStart(5, '0')}`;

  interface Entry {
    runId: string;
    hypothesisId: string;
    question: string;
    statement: string;
    mechanism: string;
    predictions: readonly string[];
    falsification: string;
    limitations: readonly string[];
  }
  const entries: Entry[] = [];
  for (const run of runs) {
    for (const h of run.hypotheses) {
      entries.push({
        runId: run.runId,
        hypothesisId: h.id,
        question: run.question,
        statement: h.statement,
        mechanism: h.mechanism,
        predictions: h.observablePredictions,
        falsification: [
          h.falsificationMethod.prediction,
          `${h.falsificationMethod.metric} ${h.falsificationMethod.comparator} ${
            h.falsificationMethod.comparator === 'range'
              ? `[${h.falsificationMethod.lower ?? '?'}, ${h.falsificationMethod.upper ?? '?'}]`
              : String(h.falsificationMethod.value ?? '?')
          }`,
        ].join(' — '),
        limitations: h.risks,
      });
    }
  }
  if (entries.length === 0) throw new Error('runs contain zero hypotheses — nothing to blind-rate');

  // Seeded Fisher-Yates：呈现顺序与内容顺序解耦（评委无法按序猜测来源）。
  // Per-position seeds pass through fnv1a first — raw seed+i mixes too weakly
  // (nearby seeds produced the identity permutation in calibration).
  const order = [...entries.keys()];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand01(fnv1a(`${seed}:${i}`)) * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }

  const items: RubricItem[] = [];
  const mapping: Record<string, { runId: string; hypothesisId: string }> = {};
  order.forEach((entryIndex, position) => {
    const e = entries[entryIndex]!;
    const blindId = `H-${String(position + 1).padStart(2, '0')}`;
    items.push({
      blindId,
      question: e.question,
      statement: e.statement,
      mechanism: e.mechanism,
      predictions: e.predictions,
      falsification: e.falsification,
      limitations: e.limitations,
    });
    mapping[blindId] = { runId: e.runId, hypothesisId: e.hypothesisId };
  });

  const instructions = [
    '# Blind rubric — evaluation instructions',
    '',
    `Package: ${packageId} · items: ${items.length} · scales: ${RUBRIC_SCALES.join(', ')} (1-5 Likert)`,
    '',
    'You are rating DE-IDENTIFIED scientific hypotheses. Origin, strategy, and model',
    'identity have been removed. Rate each item on every scale; leave a row out only',
    'if you genuinely cannot judge (missing rows are reported, never imputed).',
    '',
    'Scales:',
    '  novelty        — does this propose something not already standard in the field?',
    '  plausibility   — is the mechanism consistent with known physics/biology/…?',
    '  falsifiability — could a concrete observation kill it? (5 = sharp test exists)',
    '  actionability  — could a researcher act on this next month?',
    '',
    'Return the filled CSV with columns: rater,item,scale,score,comment',
    '  rater  — your rater id (initials are fine, keep it consistent)',
    '  item   — the blind id (H-01 …)',
    '  scale  — one of the four scale names',
    '  score  — integer 1..5',
    '  comment — optional free text',
  ].join('\n');

  return {
    pkg: {
      packageId,
      createdAt: now.toISOString(),
      seed,
      sourceRunCount: runs.length,
      items,
      instructions,
    },
    key: { packageId, seed, mapping },
  };
}

/** 评分 CSV 模板（包目录内的空表——评委照抄表头与行骨架）。 */
export function renderRatingsTemplate(pkg: BlindPackage): string {
  const lines = ['rater,item,scale,score,comment'];
  for (const item of pkg.items) {
    for (const scale of RUBRIC_SCALES) {
      lines.push(`YOUR_RATER_ID,${item.blindId},${scale},,`);
    }
  }
  return `${lines.join('\n')}\n`;
}

// ── 评分 CSV 解析（严格：坏行即错，绝不静默丢行） ─────────────────────────────

export class RatingsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RatingsParseError';
  }
}

const SCALE_SET: ReadonlySet<string> = new Set(RUBRIC_SCALES);

/** 解析评分 CSV（首行表头必须精确匹配；行错误抛 RatingsParseError 带行号）。 */
export function parseRatingsCsv(text: string): readonly RatingRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new RatingsParseError('ratings CSV is empty');
  const header = lines[0]!.split(',').map((c) => c.trim().toLowerCase());
  const expected = ['rater', 'item', 'scale', 'score', 'comment'];
  if (header.join(',') !== expected.join(',')) {
    throw new RatingsParseError(`header must be ${expected.join(',')} (got ${lines[0]})`);
  }
  const rows: RatingRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i]!.split(',').map((c) => c.trim());
    if (cols.length < 4 || cols.length > 5) {
      throw new RatingsParseError(`line ${i + 1}: expected 4-5 columns, got ${cols.length}`);
    }
    const [rater, item, scale, scoreRaw, comment = ''] = cols as [string, string, string, string, string|undefined];
    if (rater.length === 0) throw new RatingsParseError(`line ${i + 1}: empty rater`);
    if (!/^H-\d{2,}$/.test(item)) throw new RatingsParseError(`line ${i + 1}: item must look like H-NN (got ${item})`);
    if (!SCALE_SET.has(scale)) {
      throw new RatingsParseError(`line ${i + 1}: unknown scale '${scale}' (expected one of ${RUBRIC_SCALES.join('|')})`);
    }
    if (!/^[1-5]$/.test(scoreRaw)) {
      throw new RatingsParseError(`line ${i + 1}: score must be an integer 1-5 (got '${scoreRaw}')`);
    }
    rows.push({ rater, blindId: item, scale: scale as RubricScale, score: Number(scoreRaw), comment });
  }
  return rows;
}

// ── 聚合统计 ─────────────────────────────────────────────────────────────────

/** Cohen's κ（两名评分者、名义精确匹配、仅共评 item）。 */
export function cohensKappa(a: readonly string[], b: readonly string[]): number | null {
  if (a.length !== b.length || a.length === 0) return null;
  const po = a.filter((v, i) => v === b[i]).length / a.length;
  const cats = new Set<string>([...a, ...b]);
  let pe = 0;
  for (const c of cats) {
    const pa = a.filter((v) => v === c).length / a.length;
    const pb = b.filter((v) => v === c).length / b.length;
    pe += pa * pb;
  }
  if (pe >= 1) return po === 1 ? 1 : null; // 退化：同值分布无分歧空间
  return (po - pe) / (1 - pe);
}

/**
 * Krippendorff's α (nominal). Standard coincidence-matrix algorithm: within
 * each unit every ordered pair of values from DIFFERENT raters enters the
 * coincidence matrix with weight 1/(n_u−1); observed disagreement Do and
 * expected De read straight off the matrix.
 */
export function krippendorffAlphaNominal(
  unitValues: ReadonlyMap<string, readonly string[]>,
): number | null {
  const values = new Set<string>();
  for (const vs of unitValues.values()) for (const v of vs) values.add(v);
  const cats = [...values];
  if (cats.length === 0) return null;
  const idx = new Map(cats.map((c, i) => [c, i]));
  const m = cats.length;
  const o: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  for (const vs of unitValues.values()) {
    const n = vs.length;
    if (n < 2) continue;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        o[idx.get(vs[i]!)!]![idx.get(vs[j]!)!]! += 1 / (n - 1);
      }
    }
  }
  const nTotal = o.reduce((s, row) => s + row.reduce((x, y) => x + y, 0), 0);
  if (nTotal === 0) return null;
  const rowSums = o.map((row) => row.reduce((x, y) => x + y, 0));
  const colSums = cats.map((_, j) => o.reduce((s, row) => s + row[j]!, 0));
  let dobs = 0;
  for (let i = 0; i < m; i += 1) {
    for (let j = 0; j < m; j += 1) {
      if (i !== j) dobs += o[i]![j]!;
    }
  }
  dobs /= nTotal;
  let deSum = 0;
  for (let i = 0; i < m; i += 1) {
    for (let j = 0; j < m; j += 1) {
      if (i === j) continue;
      deSum += (rowSums[i]! * colSums[j]!) / (nTotal * (nTotal - 1));
    }
  }
  if (deSum === 0) return dobs === 0 ? 1 : null;
  return 1 - dobs / deSum;
}

/** 聚合评分行 → 逐项统计 + 共识度量 + 诚实警告。 */
export function aggregateRatings(
  packageId: string,
  rows: readonly RatingRow[],
): RubricAggregation {
  const warnings: string[] = [];
  const raters = [...new Set(rows.map((r) => r.rater))].sort();
  if (raters.length === 0) throw new Error('no rating rows to aggregate');

  // One row per (rater, item, scale) — duplicates are a data error: first
  // occurrence wins EVERYWHERE (stats and agreement see the same rows), and
  // the drop is warned, never silent.
  const seen = new Set<string>();
  const deduped: RatingRow[] = [];
  let dropped = 0;
  for (const r of rows) {
    const k = `${r.rater}\u0000${r.blindId}\u0000${r.scale}`;
    if (seen.has(k)) {
      dropped += 1;
      continue;
    }
    seen.add(k);
    deduped.push(r);
  }
  if (dropped > 0) {
    warnings.push(`${dropped} duplicate rating row(s) dropped (first occurrence kept)`);
  }
  rows = deduped;

  const blindIds = [...new Set(rows.map((r) => r.blindId))].sort();

  const itemStats: ItemScaleStat[] = [];
  for (const blindId of blindIds) {
    for (const scale of RUBRIC_SCALES) {
      const scores = rows.filter((r) => r.blindId === blindId && r.scale === scale).map((r) => r.score);
      if (scores.length === 0) {
        warnings.push(`${blindId}/${scale}: unrated by everyone`);
        continue;
      }
      const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
      const sd = scores.length > 1
        ? Math.sqrt(scores.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (scores.length - 1))
        : 0;
      itemStats.push({ blindId, scale, n: scores.length, mean, sd });
    }
  }

  const agreement: AgreementStat[] = [];
  for (const scale of RUBRIC_SCALES) {
    // unit = blindId → one value per rater (dedup already applied above).
    const unitValues = new Map<string, string[]>();
    for (const blindId of blindIds) {
      const vs = rows
        .filter((r) => r.blindId === blindId && r.scale === scale)
        .map((r) => String(r.score));
      if (vs.length > 0) unitValues.set(blindId, vs);
    }

    let meanPairwiseKappa: number | null = null;
    let pairwiseN = 0;
    if (raters.length >= 2) {
      const kappas: number[] = [];
      for (let i = 0; i < raters.length; i += 1) {
        for (let j = i + 1; j < raters.length; j += 1) {
          const a: string[] = [];
          const b: string[] = [];
          for (const blindId of unitValues.keys()) {
            const ri = rows.find((r) => r.blindId === blindId && r.scale === scale && r.rater === raters[i]);
            const rj = rows.find((r) => r.blindId === blindId && r.scale === scale && r.rater === raters[j]);
            if (ri !== undefined && rj !== undefined) {
              a.push(String(ri.score));
              b.push(String(rj.score));
            }
          }
          pairwiseN = Math.max(pairwiseN, a.length);
          const k = cohensKappa(a, b);
          if (k !== null) kappas.push(k);
        }
      }
      if (kappas.length > 0) meanPairwiseKappa = kappas.reduce((s, v) => s + v, 0) / kappas.length;
      else warnings.push(`${scale}: kappa degenerate (constant ratings) — reported as null`);
    } else {
      warnings.push(`${scale}: single rater — kappa/alpha undefined`);
    }
    const alpha = raters.length >= 2 ? krippendorffAlphaNominal(unitValues) : null;
    agreement.push({ scale, raterCount: raters.length, meanPairwiseKappa, krippendorffAlpha: alpha, pairwiseN });
  }

  return {
    packageId,
    raterCount: raters.length,
    ratedItems: blindIds.length,
    itemStats,
    agreement,
    warnings,
  };
}

// ── 报告渲染 ────────────────────────────────────────────────────────────────

/** Markdown 报告（人读）；聚合 JSON 由 CLI 序列化。 */
export function renderRubricReport(agg: RubricAggregation, key: BlindKey): string {
  const lines: string[] = [];
  lines.push(`# Rubric aggregation — ${agg.packageId}`);
  lines.push('');
  lines.push(`- raters: ${agg.raterCount} · rated items: ${agg.ratedItems}`);
  lines.push(`- seed: ${key.seed}`);
  lines.push('');
  lines.push('## Inter-rater agreement (per scale)');
  lines.push('');
  lines.push('| scale | raters | mean pairwise Cohen κ | Krippendorff α (nominal) | pairwise n |');
  lines.push('|---|---|---|---|---|');
  for (const a of agg.agreement) {
    lines.push(
      `| ${a.scale} | ${a.raterCount} | ${a.meanPairwiseKappa === null ? '—' : a.meanPairwiseKappa.toFixed(3)} | ${a.krippendorffAlpha === null ? '—' : a.krippendorffAlpha.toFixed(3)} | ${a.pairwiseN} |`,
    );
  }
  lines.push('');
  lines.push('## Per-item scores (mean±sd, n)');
  lines.push('');
  lines.push('| item | run | hypothesis | scale | mean±sd | n |');
  lines.push('|---|---|---|---|---|---|');
  for (const s of agg.itemStats) {
    const m = key.mapping[s.blindId] ?? { runId: '?', hypothesisId: '?' };
    lines.push(`| ${s.blindId} | ${m.runId} | ${m.hypothesisId} | ${s.scale} | ${s.mean.toFixed(2)}±${s.sd.toFixed(2)} | ${s.n} |`);
  }
  if (agg.warnings.length > 0) {
    lines.push('');
    lines.push('## Warnings');
    for (const w of agg.warnings) lines.push(`- ${w}`);
  }
  lines.push('');
  lines.push('> cannot-prove: κ/α here measure RATER consensus on ordinal-as-nominal scores —');
  lines.push('> they say nothing about whether the hypotheses are true (that is the kernel\'s job).');
  return lines.join('\n');
}

/** sha256 hex of a string (package integrity sidecar). */
export function rubricSha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
