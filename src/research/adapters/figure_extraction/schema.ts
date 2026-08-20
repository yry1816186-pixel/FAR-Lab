// src/research/adapters/figure_extraction/schema.ts
//
// 图表数据提取的 zod 边界 + fail-closed 解析器（多模态路线 C 的栅格腿，2026-08-21）。
//
// 信任架构（与 sealed-verdict 哲学同构）：
//   模型只做感知——报告 MARKER 的像素坐标 + 轴刻度的(pixel,value)标定对；
//   像素→数值换算由确定性内核完成（calibrate.ts，最小二乘）——可审计、可重放。
//   百炼 VL 不支持 json_schema response_format（2026-08-21 官方文档亲读），
//   因此结构化靠本文件客户端 zod 校验：解析失败即抛，绝不部分采纳。
//
// provenance.payloadSha256 是载荷校验字段而非装饰：parseFigureExtraction
// 对记录的 RFC 8785 规范化形式（去除该哈希字段）计算 sha256 并与声明值比对，
// 不匹配即 fail-closed。
// 误差纪律（Turner 2023, doi:10.1002/jrsm.1646：跨提取者 x 轴重要错误率 9-35%）：
//   提取值不得作为点值二值裁决依据——标定残差进 CalibratedExtraction（calibrate.ts），
//   下游复算判定必须做区间敏感性（phase 2 接线）。
//
// live 目标模型：VISION_MODEL_SNAPSHOT（qwen3-vl-plus，documented_not_verified_live）。

import { z } from 'zod';
import { createHash } from 'node:crypto';
import canonicalize from '../../../vendor/canonicalize.js';

/** 图表形态闭字母表。新形态须同步裁决层语义评审后扩表。 */
export const CHART_TYPES = ['scatter', 'line', 'bar'] as const;
/** 轴刻度类型：linear=线性；log=对数（值域必须为正）。 */
export const AXIS_TYPES = ['linear', 'log'] as const;
/** 提取器：vlm=视觉模型（低信任）；vector-pdf=矢量图确定性解析（phase 2）。 */
export const EXTRACTOR_KINDS = ['vlm', 'vector-pdf'] as const;

const finite = z.number().finite();

/** 轴刻度标定对：图上刻度线的像素位置 + 人读刻度值。≥2 对（仿射映射下限）。 */
export const AxisTickZod = z.object({
  pixel: finite,
  value: finite,
});

export const AxisCalibrationZod = z.object({
  axisType: z.enum(AXIS_TYPES),
  ticks: z.array(AxisTickZod).min(2, 'affine calibration needs >= 2 ticks'),
  label: z.string().optional(),
  units: z.string().optional(),
});

/** 数据点：MARKER 的像素坐标（原点左上、x 向右、y 向下）。禁止模型自行换算数值。 */
export const ExtractedPointZod = z.object({
  px: finite,
  py: finite,
});

export const ExtractedSeriesZod = z.object({
  id: z.string().min(1),
  points: z.array(ExtractedPointZod).min(1),
});

export const FigureExtractionProvenanceZod = z.object({
  extractor: z.enum(EXTRACTOR_KINDS),
  /** vlm → 模型 id；vector-pdf → null。 */
  model: z.string().nullable(),
  /**
   * sha256 hex of the RFC 8785 canonicalization of this record with
   * provenance.payloadSha256 removed —— 把 provenance 绑定到精确载荷
   * （自指原文本哈希不可构造，故用规范化载荷哈希；canonicalize@4.0.0 vendored）。
   * 由记录层（提取管线）组装时计算，VLM 输出本身不含 provenance。
   */
  payloadSha256: z.string().regex(/^[0-9a-f]{64}$/),
  producedAt: z.string().min(1),
  mode: z.enum(['LIVE', 'RECORDED_REPLAY', 'SYNTHETIC_TEST', 'OFFLINE_DEVELOPMENT', 'NOT_EXECUTED']),
  /** 图来源标识（doi / url / 文件路径）——证据可溯源的最小要求。 */
  sourceRef: z.string().min(1),
});

export const FigureExtractionZod = z.object({
  chartType: z.enum(CHART_TYPES),
  xAxis: AxisCalibrationZod,
  yAxis: AxisCalibrationZod,
  series: z.array(ExtractedSeriesZod).min(1),
  /** 诚实限制清单（图例歧义 / 误差棒语义未知 / 重叠遮挡…）。空数组合法=无已知限制。 */
  caveats: z.array(z.string()),
  provenance: FigureExtractionProvenanceZod,
});

export type FigureExtraction = z.infer<typeof FigureExtractionZod>;
export type AxisCalibration = z.infer<typeof AxisCalibrationZod>;

/** 解析失败（fail-closed）：非 JSON、zod 不合、或 provenance 哈希不匹配。 */
export class FigureExtractionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FigureExtractionParseError';
  }
}

/**
 * 解析并校验提取记录（VLM 输出的载荷 + 记录层组装的 provenance）。三重门：
 *   1. JSON.parse；2. zod strict 形态；3. provenance.payloadSha256 必须等于
 *      sha256(RFC8785 canonical(去除该哈希字段后的记录)) —— 载荷与 provenance
 *      不得脱节。任何一门失败即抛 FigureExtractionParseError（绝不部分采纳/修复）。
 */
export function parseFigureExtraction(raw: string): FigureExtraction {
  let unknown: unknown;
  try {
    unknown = JSON.parse(raw);
  } catch (err) {
    throw new FigureExtractionParseError(
      `figure_extraction: raw response is not valid JSON: ${(err as Error).message}`,
    );
  }
  const result = FigureExtractionZod.safeParse(unknown);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new FigureExtractionParseError(
      `figure_extraction: schema violation (first ${Math.min(5, result.error.issues.length)} issues): ${issues}`,
    );
  }
  const { payloadSha256: _declared, ...provenance } = result.data.provenance;
  const payload = { ...result.data, provenance };
  const actual = createHash('sha256').update(canonicalize(payload), 'utf8').digest('hex');
  if (actual !== result.data.provenance.payloadSha256) {
    throw new FigureExtractionParseError(
      `figure_extraction: provenance.payloadSha256 mismatch (declared ${result.data.provenance.payloadSha256.slice(0, 12)}…, actual ${actual.slice(0, 12)}…) — provenance must hash the canonical payload`,
    );
  }
  return result.data;
}

/**
 * live VL 提取提示词（栅格腿契约的一部分）。
 * 设计要点：只要感知（像素坐标+刻度读数），禁止模型做数值换算；
 * 只要 JSON（VL 不支持 json_schema 模式——客户端 zod 兜底）。
 */
export const FIGURE_EXTRACTION_PROMPT = `You are a precise chart-reading instrument. Analyze the attached scientific figure and respond with ONLY a JSON object (no markdown fences, no prose) with exactly this shape:

{
  "chartType": "scatter" | "line" | "bar",
  "xAxis": { "axisType": "linear" | "log", "label": "...", "units": "...", "ticks": [ { "pixel": <number>, "value": <number> }, ... ] },
  "yAxis": { "axisType": "linear" | "log", "label": "...", "units": "...", "ticks": [ { "pixel": <number>, "value": <number> }, ... ] },
  "series": [ { "id": "...", "points": [ { "px": <number>, "py": <number> }, ... ] } ],
  "caveats": ["...", ...]
}

Rules:
- Pixel coordinates: origin at the TOP-LEFT of the image, x increasing rightward, y increasing DOWNWARD. Use image pixels.
- ticks: for each axis report at least 2 (prefer 3+) clearly labeled tick marks: "pixel" = the tick position on the image, "value" = the printed label value exactly as shown.
- For log axes, report the printed values (e.g. 1, 10, 100). All values on a log axis must be positive.
- points: report each data marker's position in PIXELS (px, py). Do NOT convert pixels to data values yourself, do NOT round to "nice" numbers, and do NOT infer points you cannot see.
- Do not fabricate anything: if a series is unreadable or overlapping, include fewer points and add a caveat entry instead.
- caveats: list honestly anything that limits accuracy (legend ambiguity, unknown error-bar semantics, overplotting, low resolution, truncated axes, etc.). Empty list only if genuinely none.
- Numbers must be plain JSON numbers (no strings, no NaN/Infinity).`;
