/**
 * research/evaluation/calibration — LLM 自报置信度的校准评估
 * (2.md §4.5 补遗 R10「置信度校准评估」条款, T1)。
 *
 * WHAT THIS IS: 对探针数据（.far/eval/leakage-probe-b7.json /
 * obscure-probe-b8.json）中 LLM 自报的 recall 置信度 vs 实际命中频率，
 * 计算 Expected Calibration Error + 可靠性图（reliability diagram）数据，
 * 并执行条款降级规则：**校准误差超标时置信度展示降级为分档（高/中/低）
 * 而非伪精确数值**。
 *
 * ECE 引擎是既有 SSOT：src/statistics/calibration.ts 的
 * expectedCalibrationError（均匀分箱·空箱跳过·p=1.0 收入末箱）。本模块
 * 不重写该公式——只在其上加分层：每箱统计（可靠性图数据）、方向判定、
 * 样本量守卫、降级判定。测试断言两路计算一致（防 SSOT 漂移）。
 *
 * HIT 映射决策（显式记录，勿静默更改）：
 *   - 探针目标全部是训练截止前已发表的真实发现（探针设计前提——
 *     b7 检验著名目标泄漏、b8 检验冷门目标记忆度，目标池均按
 *     「真实存在且先于训练截止」筛选）。
 *   - 因此 recall==='known' → 模型「我认识它」的声明为真 → hit=true；
 *     recall==='not_seen' → 该声明为假（目标确实在训练语料里）→ hit=false。
 *   - 已知局限（caveat）：若目标实际晚于训练截止或过于冷门，
 *     'not_seen' 可能是正确陈述——本映射把它记为 miss 是探针设计
 *     前提的产物，报告时必须连同本条一起呈现。
 *
 * CANNOT-PROVE 声明（本模块测的不是什么）：
 *   - 这里的校准只覆盖「自报 recall 置信度 vs 逐字召回结果」在 13 个
 *     探针目标上的表现——不校准猜想质量置信度、不校准 Elo 分差解释、
 *     不校准裁决内核（确定性内核零方差，R10 条款明示本条只约束 LLM 侧）。
 *   - N=13 意味着极宽的不确定度：ECE 在此样本量下是方向性信号
 *     （directional signal），不是精确诊断；单箱 n=1 的箱内 gap 噪声
 *     极大。任何把该 ECE 当作精确数字对外引用的行为都违反本声明。
 *   - 校准好 ≠ 正确（外部依据 arXiv:2606.21399 "Calibration Is Not
 *     Control"：标量置信度不是控制对象；裁决控制权在确定性内核）。
 *
 * 纯函数·确定性·无 IO·无 LLM。
 */

import { expectedCalibrationError } from '../../statistics/calibration.ts';

// ─── 阈值常量（含依据注释·§8.9 数值阈值文档义务） ──────────────────────────

/**
 * 降级阈值（条款：校准误差超标时置信度展示降级为分档）。
 *
 * 依据：ECE=0.15 时，「0.9 置信」的声称与 ≤75% 的经验命中率相容——
 * 小数点后两位的伪精确此时已在误导读者，分档（高/中/低）是诚实的
 * 展示粒度。敏感性：±20%（0.12 / 0.18）只改变边界案例的判定，
 * 不改变典型良/劣校准样本的结论。
 * 判定用严格大于（>）：ECE 恰好等于 0.15 时降级证据不充分，不降级
 * （边界语义由 shouldDegradeToBands 钉死并有测试钉住）。
 */
export const DEGRADE_ECE_THRESHOLD = 0.15 as const;

/**
 * 样本量下限（eval 侧 insufficient 标志）。
 *
 * 注意与 src/statistics/calibration.ts 的 MIN_CALIBRATION_SAMPLE=20
 * 是**不同契约**：那边是「校准评级弃权」（n<20 不产出评级对象）；
 * 这边是「评估报告的薄证据标记」（n<10 时 ECE 照算但标记 insufficient，
 * 且 degradeToBands=false——证据太薄，既不足以判劣也不足以豁免）。
 */
export const INSUFFICIENT_SAMPLE_SIZE = 10 as const;

/** 默认分箱数（均匀分箱于 [0,1]）。 */
export const DEFAULT_BIN_COUNT = 10 as const;

// ─── 类型 ────────────────────────────────────────────────────────────────────

/** 一条校准样本：模型自报置信度 + 其声称结果是否正确。 */
export interface CalibrationPair {
  /** 模型自报置信度，[0,1]。hit=true 表示模型的声称正确。 */
  readonly confidence: number;
  readonly hit: boolean;
}

/** 可靠性图的一个箱。空箱（count=0）的数值字段是 0 占位符，非计算值。 */
export interface CalibrationBin {
  readonly lower: number;
  readonly upper: number;
  readonly count: number;
  /** 箱内平均自报置信度；count=0 时为 0 占位。 */
  readonly meanConfidence: number;
  /** 箱内命中频率；count=0 时为 0 占位。 */
  readonly hitRate: number;
  /** |meanConfidence − hitRate|；空箱为 0（不贡献 ECE）。 */
  readonly gap: number;
}

/** 校准评估结果。 */
export interface CalibrationResult {
  /** 期望校准误差（SSOT 公式：Σ (n_b/N)·|conf_b − acc_b|，空箱跳过）。 */
  readonly ece: number;
  readonly binCount: number;
  readonly bins: readonly CalibrationBin[];
  readonly sampleSize: number;
  /** 全样本平均自报置信度（方向判定的依据，随报告展示）。 */
  readonly overallMeanConfidence: number;
  /** 全样本命中频率。 */
  readonly overallHitRate: number;
  /** over = 自信超过命中（伪精确最危险的方向）；insufficient = 样本过薄。 */
  readonly overconfidenceDirection: 'over' | 'under' | 'balanced' | 'insufficient';
  /** 条款降级标志：true → 置信度展示应降为分档（高/中/低）。 */
  readonly degradeToBands: boolean;
  readonly insufficientSample: boolean;
}

export interface CalibrationOptions {
  readonly binCount?: number;
}

/** 探针 JSON 提取结果 + 跳过账本（跳过项计数，从不静默丢弃）。 */
export interface ProbeExtraction {
  readonly pairs: readonly CalibrationPair[];
  readonly totalResults: number;
  readonly skippedNonAnswered: number;
  readonly skippedMissingConfidence: number;
  readonly skippedUnknownRecall: number;
  readonly skippedMalformed: number;
}

// ─── 降级判定（独立导出：边界语义的可测试钉子） ─────────────────────────────

/**
 * 条款降级判定（钉死边界）：
 *   - ECE 严格大于 DEGRADE_ECE_THRESHOLD 才降级（等于不降）；
 *   - 样本量不足（< INSUFFICIENT_SAMPLE_SIZE）时一律不降级——薄证据
 *     不足以支撑任何方向的裁定。
 */
export function shouldDegradeToBands(ece: number, sampleSize: number): boolean {
  if (!Number.isFinite(ece)) return false;
  return sampleSize >= INSUFFICIENT_SAMPLE_SIZE && ece > DEGRADE_ECE_THRESHOLD;
}

// ─── 校准计算 ────────────────────────────────────────────────────────────────

function assertValidPairs(pairs: readonly CalibrationPair[]): void {
  for (const p of pairs) {
    if (!Number.isFinite(p.confidence) || p.confidence < 0 || p.confidence > 1) {
      throw new Error(
        `calibration(eval): confidence ${String(p.confidence)} out of [0,1] — ` +
          'malformed pair rejected (never clamped into a bin).',
      );
    }
  }
}

/**
 * 计算 ECE + 可靠性图数据 + 降级判定（纯函数）。
 *
 * 分箱约定（与 statistics SSOT 一致）：均匀分箱 [b/B, (b+1)/B)，
 * confidence=1.0 收入末箱；空箱保留在 bins 里（count=0、数值占位 0）
 * 但不贡献 ECE。空输入不抛错——返回 sampleSize=0 的 insufficient 结果
 * （「没有数据」不是「畸形数据」）。
 */
export function computeCalibration(
  pairs: readonly CalibrationPair[],
  opts: CalibrationOptions = {},
): CalibrationResult {
  assertValidPairs(pairs);
  const binCount = opts.binCount ?? DEFAULT_BIN_COUNT;
  if (!Number.isInteger(binCount) || binCount < 1) {
    throw new Error(`calibration(eval): binCount must be an integer >= 1 (got ${String(binCount)}).`);
  }

  const counts = Array.from({ length: binCount }, () => 0);
  const confSums = Array.from({ length: binCount }, () => 0);
  const hitCounts = Array.from({ length: binCount }, () => 0);
  let totalConf = 0;
  let totalHits = 0;

  for (const p of pairs) {
    const idx = Math.min(binCount - 1, Math.floor(p.confidence * binCount));
    counts[idx] = (counts[idx] ?? 0) + 1;
    confSums[idx] = (confSums[idx] ?? 0) + p.confidence;
    if (p.hit) {
      hitCounts[idx] = (hitCounts[idx] ?? 0) + 1;
      totalHits += 1;
    }
    totalConf += p.confidence;
  }

  const n = pairs.length;
  const bins: CalibrationBin[] = [];
  for (let b = 0; b < binCount; b += 1) {
    const count = counts[b] ?? 0;
    const empty = count === 0;
    const meanConfidence = empty ? 0 : (confSums[b] ?? 0) / count;
    const hitRate = empty ? 0 : (hitCounts[b] ?? 0) / count;
    bins.push({
      lower: b / binCount,
      upper: (b + 1) / binCount,
      count,
      meanConfidence,
      hitRate,
      gap: Math.abs(meanConfidence - hitRate),
    });
  }

  // ECE 走 SSOT 公式（statistics/calibration.ts），本模块不重写。
  const ece = expectedCalibrationError(
    pairs.map((p) => p.confidence),
    pairs.map((p) => p.hit),
    binCount,
  );

  const insufficientSample = n < INSUFFICIENT_SAMPLE_SIZE;
  const overconfidenceDirection: CalibrationResult['overconfidenceDirection'] =
    insufficientSample ? 'insufficient' : totalConf > totalHits ? 'over' : totalConf < totalHits ? 'under' : 'balanced';

  return {
    ece,
    binCount,
    bins,
    sampleSize: n,
    overallMeanConfidence: n === 0 ? 0 : totalConf / n,
    overallHitRate: n === 0 ? 0 : totalHits / n,
    overconfidenceDirection,
    degradeToBands: shouldDegradeToBands(ece, n),
    insufficientSample,
  };
}

// ─── 可靠性图（ASCII·确定性） ────────────────────────────────────────────────

const BAR_WIDTH = 20 as const;

function bar(value: number): string {
  const fill = Math.max(0, Math.min(BAR_WIDTH, Math.round(value * BAR_WIDTH)));
  return '#'.repeat(fill) + '.'.repeat(BAR_WIDTH - fill);
}

/**
 * 单色可靠性图（纯函数·确定性·同一 bins 输入字节级相同）。
 * 每箱一行：区间、计数、meanConf、hitRate、gap、两条 bar
 * （confidence-bar 与 hit-rate-bar 同宽对比）。空箱数值为 0 占位、
 * 不贡献 ECE（图例注明）。
 */
export function reliabilityDiagramAscii(bins: readonly CalibrationBin[]): string {
  const lines: string[] = [
    `confidence calibration reliability diagram (bar width = ${String(BAR_WIDTH)}; bin [lower,upper), last bin closed at 1.0)`,
    'range          n  meanConf  hitRate    gap  confidence-bar        hit-rate-bar',
  ];
  for (const bin of bins) {
    lines.push(
      `[${bin.lower.toFixed(3)},${bin.upper.toFixed(3)})`.padEnd(13) +
        String(bin.count).padStart(3) +
        '  ' +
        bin.meanConfidence.toFixed(3).padStart(8) +
        '  ' +
        bin.hitRate.toFixed(3).padStart(8) +
        '  ' +
        bin.gap.toFixed(3).padStart(5) +
        '  |' + bar(bin.meanConfidence) + '|  |' + bar(bin.hitRate) + '|',
    );
  }
  lines.push('(empty bins: n=0 — numeric fields are 0-placeholders, excluded from ECE)');
  return lines.join('\n');
}

// ─── 探针 JSON → 校准样本 ────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 收集结果记录。已观测到的两种磁盘形状（指令文本称两文件同形，实测不然——
 * 以磁盘为准，两种都收）：
 *   - b7: specs[].results[]（嵌套）
 *   - b8: 顶层 results[]（扁平·无 specs 字段）
 */
function collectResultRecords(json: unknown): unknown[] {
  if (!isRecord(json)) return [];
  const out: unknown[] = [];
  if (Array.isArray(json.specs)) {
    for (const spec of json.specs) {
      if (isRecord(spec) && Array.isArray(spec.results)) out.push(...spec.results);
    }
  } else if (Array.isArray(json.results)) {
    out.push(...json.results);
  }
  return out;
}

/**
 * 从探针 JSON 提取校准样本（hit 映射决策见模块头：known→hit=true，
 * not_seen→hit=false——前提「所有目标均为训练截止前真实发表发现」）。
 *
 * 跳过规则（计数返回，从不静默丢弃）：
 *   - outcome !== 'answered'（模型未作答/出错）；
 *   - confidence 缺失或非 [0,1] 有限数；
 *   - recall 既非 'known' 也非 'not_seen'（未知枚举值）；
 *   - 记录本身不是对象。
 */
export function pairsFromProbeJson(json: unknown): ProbeExtraction {
  const records = collectResultRecords(json);
  const pairs: CalibrationPair[] = [];
  let skippedNonAnswered = 0;
  let skippedMissingConfidence = 0;
  let skippedUnknownRecall = 0;
  let skippedMalformed = 0;

  for (const r of records) {
    if (!isRecord(r)) {
      skippedMalformed += 1;
      continue;
    }
    if (r.outcome !== 'answered') {
      skippedNonAnswered += 1;
      continue;
    }
    const c = r.confidence;
    if (typeof c !== 'number' || !Number.isFinite(c) || c < 0 || c > 1) {
      skippedMissingConfidence += 1;
      continue;
    }
    if (r.recall === 'known') {
      pairs.push({ confidence: c, hit: true });
    } else if (r.recall === 'not_seen') {
      pairs.push({ confidence: c, hit: false });
    } else {
      skippedUnknownRecall += 1;
    }
  }

  return {
    pairs,
    totalResults: records.length,
    skippedNonAnswered,
    skippedMissingConfidence,
    skippedUnknownRecall,
    skippedMalformed,
  };
}

// ─── 报告用固定文案（测试引用防漂移） ────────────────────────────────────────

/** hit 映射决策 + 前提，随报告一起出现（不藏在代码里）。 */
export const PROBE_HIT_MAPPING_NOTE =
  'hit mapping: recall=known → hit (target IS a real pre-cutoff discovery — the claim "I know it" is TRUE); ' +
  'recall=not_seen → miss (the target IS in training corpora — the claim is FALSE). Caveat: for genuinely ' +
  'post-cutoff or ultra-obscure targets not_seen could be correct; this mapping inherits the probe-design premise.';

/** cannot-prove 声明（模块头 CANNOT-PROVE 的报告侧投影）。 */
export const CALIBRATION_CANNOT_PROVE_NOTE =
  'cannot-prove: this calibrates SELF-REPORTED recall confidence vs verbatim-recall outcomes on 13 probe ' +
  'targets only — not hypothesis-quality confidence, not Elo-scored rankings, not the deterministic verdict ' +
  'kernel (zero-variance by construction). At N=13 the uncertainty is wide: ECE is a directional signal, ' +
  'not a precise diagnostic.';
