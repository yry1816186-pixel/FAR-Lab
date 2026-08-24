import { z } from 'zod';
import type { SdmDocument } from '../sdm.js';
import { parseXml, findAll, childrenNamed, textOf, attrAny, type XmlElement } from '../xml.js';
import { normText, IdGen } from '../parseutil.js';

/**
 * Deterministic SVG plot digitization (MULTIMODAL lane extension, 2026-08-25).
 *
 * Vector plots (matplotlib/ggplot/vega SVG exports — the standard figure format
 * of computational notebooks and supplementary materials) are the ONE figure
 * family whose numeric content can be recovered with ZERO model calls: the
 * axis ticks are <text> elements with exact coordinates, and the data are
 * polylines/paths/circles in the same coordinate space. This module performs
 * the WebPlotDigitizer-shaped pipeline deterministically:
 *
 *   tick clustering → per-axis calibration (exact linear / least-squares /
 *   log10 detection with residual bound) → primitive extraction inside the
 *   calibrated region → pixel→data mapping.
 *
 * Honesty contract (mirrors the T4 rule "VLM proposes, deterministic
 * verifies" — here there is no VLM at all):
 * - every numeric claim carries its FULL calibration (ticks, slope, intercept,
 *   residuals) in a separately persisted points artifact, so any consumer can
 *   re-verify the numbers independently;
 * - curves (bezier paths), bar rectangles, multi-panel grids and decorative
 *   SVGs are refused BY NAME — never guessed into numbers;
 * - precision is rounded to 6 significant digits; that bound is documented.
 */

export const SdmPlotPoints = z.object({
  schemaVersion: z.literal('sdm-plot-points-1'),
  source: z.object({ name: z.string().min(1) }),
  axes: z.object({
    x: z.object({
      calibration: z.object({
        /** [pixel, value] pairs the calibration was fitted from — the audit trail. */
        ticks: z.array(z.tuple([z.number(), z.number()])),
        slope: z.number(), intercept: z.number(),
        scale: z.enum(['linear', 'log']),
        /** -1 = no calibration (unsupported doc): ticks are empty by construction. */
        maxResidual: z.number(),
      }),
      label: z.string().optional(),
      unit: z.string().optional(),
    }),
    y: z.object({
      calibration: z.object({
        ticks: z.array(z.tuple([z.number(), z.number()])),
        slope: z.number(), intercept: z.number(),
        scale: z.enum(['linear', 'log']),
        maxResidual: z.number(),
      }),
      label: z.string().optional(),
      unit: z.string().optional(),
    }),
  }),
  series: z.array(z.object({
    label: z.string(),
    kind: z.enum(['polyline', 'line', 'circle', 'path']),
    stroke: z.string().optional(),
    points: z.array(z.tuple([z.number(), z.number()])),
  })),
  legendCandidates: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type SdmPlotPoints = z.infer<typeof SdmPlotPoints>;

export type SvgPlotResult =
  | { ok: true; sdm: SdmDocument; points: SdmPlotPoints }
  | { ok: false; reason: string };

const MAX_TEXTS = 20_000;
const MAX_SERIES = 100;
const MAX_POINTS_PER_SERIES = 100_000;
const CLUSTER_TOL = 5;        // px: texts within this band share a tick line
const RESIDUAL_TOL = 1e-6;    // relative: least-squares fit must be this exact for linear scales
const REGION_MARGIN = 3;      // px beyond tick extremes that data may still occupy
const SIG_DIGITS = 6;

const roundSig = (v: number): number => {
  if (!Number.isFinite(v) || v === 0) return v;
  const mag = Math.floor(Math.log10(Math.abs(v)));
  const factor = 10 ** (SIG_DIGITS - 1 - mag);
  return Math.round(v * factor) / factor;
};

const parseNumberText = (raw: string): number | null => {
  const t = raw.trim().replace(/\u2212/g, '-').replace(/,/g, '');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

interface TextItem { x: number; y: number; text: string; numeric: number | null; fontSize?: number }

const collectTexts = (root: XmlElement, warnings: string[]): TextItem[] => {
  const out: TextItem[] = [];
  let transformed = 0;
  for (const textEl of findAll(root, 'text')) {
    if (out.length >= MAX_TEXTS) break;
    const transform = attrAny(textEl, 'transform');
    if (transform !== undefined && transform.length > 0) { transformed += 1; continue; }
    const tspan = childrenNamed(textEl, 'tspan')[0];
    const posEl = tspan ?? textEl;
    const rawX = attrAny(posEl, 'x');
    const rawY = attrAny(posEl, 'y');
    // first coordinate only (multi-coordinate tspans are rare in plot exports)
    const x = rawX !== undefined ? Number(/^\S+/.exec(rawX)?.[0] ?? Number.NaN) : Number.NaN;
    const y = rawY !== undefined ? Number(/^\S+/.exec(rawY)?.[0] ?? Number.NaN) : Number.NaN;
    const content = normText(textOf(textEl));
    if (content.length === 0 || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const fsRaw = attrAny(textEl, 'font-size');
    out.push({ x, y, text: content, numeric: parseNumberText(content), ...(fsRaw !== undefined && Number.isFinite(Number(fsRaw)) ? { fontSize: Number(fsRaw) } : {}) });
  }
  if (transformed > 0) warnings.push(`${transformed} <text transform=...> elements skipped (rotated/styled labels — tick positions unreliable)`);
  return out;
};

interface Calibration { ticks: Array<[number, number]>; slope: number; intercept: number; scale: 'linear' | 'log'; maxResidual: number }

/** Fit value = slope*pixel + intercept over ≥2 (pixel,value) ticks. Exact
 *  linear accepted; else log10(values) must fit — else the cluster is not an
 *  axis (returns null; decorative numerals get filtered by monotonicity). */
const calibrate = (ticks: Array<[number, number]>): Calibration | null => {
  if (ticks.length < 2) return null;
  const fit = (vals: number[]): { slope: number; intercept: number; maxRes: number } => {
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    const n = ticks.length;
    for (let i = 0; i < n; i += 1) {
      const [p, _v] = ticks[i] as [number, number];
      const v = vals[i] as number;
      sx += p; sy += v; sxx += p * p; sxy += p * v;
    }
    const denom = n * sxx - sx * sx;
    if (denom === 0) return { slope: 0, intercept: 0, maxRes: Number.POSITIVE_INFINITY };
    const slope = (n * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / n;
    let maxRes = 0;
    for (let i = 0; i < n; i += 1) {
      const [p, _v] = ticks[i] as [number, number];
      const v = vals[i] as number;
      const scaleRef = Math.max(1, Math.abs(v));
      maxRes = Math.max(maxRes, Math.abs(v - (slope * p + intercept)) / scaleRef);
    }
    return { slope, intercept, maxRes };
  };
  const lin = fit(ticks.map(([, v]) => v));
  if (lin.maxRes <= RESIDUAL_TOL) return { ticks, slope: lin.slope, intercept: lin.intercept, scale: 'linear', maxResidual: lin.maxRes };
  if (ticks.every(([, v]) => v > 0)) {
    const logFit = fit(ticks.map(([, v]) => Math.log10(v)));
    if (logFit.maxRes <= RESIDUAL_TOL) {
      let maxResData = 0;
      for (const [p, v] of ticks) {
        maxResData = Math.max(maxResData, Math.abs(v - 10 ** (logFit.slope * p + logFit.intercept)) / Math.max(1, Math.abs(v)));
      }
      return { ticks, slope: logFit.slope, intercept: logFit.intercept, scale: 'log', maxResidual: maxResData };
    }
  }
  return null;
};

interface TickCluster { calib: Calibration; bandPixel: number; members: TextItem[] }

/** Find tick clusters: numeric texts aligned on a shared pixel band, values
 *  strictly monotonic along the other axis. Returns clusters sorted best-first
 *  (most ticks, then extreme band position). */
const findClusters = (texts: TextItem[], axis: 'x' | 'y'): TickCluster[] => {
  const clusters: TickCluster[] = [];
  const numeric = texts.filter((t) => t.numeric !== null) as Array<TextItem & { numeric: number }>;
  const bands = new Map<number, Array<TextItem & { numeric: number }>>();
  for (const t of numeric) {
    const bandKey = axis === 'x' ? Math.round(t.x / CLUSTER_TOL) : Math.round(t.y / CLUSTER_TOL);
    const arr = bands.get(bandKey) ?? [];
    arr.push(t);
    bands.set(bandKey, arr);
  }
  for (const arr of bands.values()) {
    if (arr.length < 3) continue;
    // one numeric value per band position (duplicate labels → not ticks)
    const byPixel = new Map<number, TextItem & { numeric: number }>();
    for (const t of arr) {
      const key = axis === 'x' ? Math.round(t.y * 100) / 100 : Math.round(t.x * 100) / 100;
      if (!byPixel.has(key)) byPixel.set(key, t);
    }
    // tick pixel = the coordinate that VARIES along the axis: a y-axis cluster
    // shares x, so its ticks move in y (and vice versa).
    const ticks: Array<[number, number]> = [...byPixel.values()]
      .map((t): [number, number] => [axis === 'x' ? t.y : t.x, t.numeric])
      .sort((a, b) => a[0] - b[0]);
    const valsAsc = ticks.every((t, i) => i === 0 || t[1] > (ticks[i - 1] as [number, number])[1]);
    const valsDesc = ticks.every((t, i) => i === 0 || t[1] < (ticks[i - 1] as [number, number])[1]);
    if (!valsAsc && !valsDesc) continue; // non-monotonic labels → decorative numerals
    const calib = calibrate(ticks);
    if (calib === null) continue;
    const bandPixel = axis === 'x' ? (arr[0] as TextItem).x : (arr[0] as TextItem).y;
    clusters.push({ calib, bandPixel, members: arr });
  }
  // best = most ticks; ties → leftmost (x-axis ticks sit at the plot bottom, we
  // pick bottom-most later; here sort is only deterministic priming)
  clusters.sort((a, b) => b.calib.ticks.length - a.calib.ticks.length || a.bandPixel - b.bandPixel);
  return clusters;
};

const unitFromLabel = (label: string): { label: string; unit?: string } => {
  const m = /^(.*?)\s*[([{]\s*([^()[\]{}]{1,20})\s*[)\]}]\s*$/.exec(label);
  if (m === null) return { label };
  const name = (m[1] ?? '').trim();
  return { label: name.length > 0 ? name : label, unit: (m[2] ?? '').trim() };
};

/** Nearest non-numeric label for an axis: below the tick row (x) / left of the
 *  tick column (y) — the matplotlib/ggplot convention. Absent = no label. */
const axisLabel = (texts: TextItem[], axis: 'x' | 'y', bandPixel: number): { label: string; unit?: string } => {
  const candidates = texts.filter((t) => t.numeric === null && t.text.length > 1)
    .filter((t) => (axis === 'x' ? t.y > bandPixel + CLUSTER_TOL : t.x < bandPixel - CLUSTER_TOL))
    .sort((a, b) => (axis === 'x' ? a.y - b.y : b.x - a.x));
  const best = candidates[0];
  if (best === undefined) return { label: '' };
  return unitFromLabel(best.text);
};

// ---------------------------------------------------------------------------
// data primitives
// ---------------------------------------------------------------------------

const parsePointsAttr = (points: string): Array<[number, number]> => {
  const nums = points.trim().split(/[\s,]+/).map(Number);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    if (Number.isFinite(nums[i]) && Number.isFinite(nums[i + 1])) out.push([nums[i] as number, nums[i + 1] as number]);
  }
  return out;
};

/** M/L-only path walker (absolute + relative). Any curve/arc command (C/S/Q/T/A)
 *  rejects the WHOLE path: silently skipping curve segments would fabricate
 *  straight-line data between points the source never connected. */
const parsePathD = (d: string): Array<[number, number]> | null => {
  if (/[CSQTAcsqta]/.test(d)) return null;
  const out: Array<[number, number]> = [];
  let cx = 0, cy = 0;
  const re = /([MLmlZz])([^MLmlZz]*)/g;
  for (const m of d.matchAll(re)) {
    const cmd = m[1] as string;
    const args = (m[2] ?? '').trim().split(/[\s,]+/).filter((s) => s.length > 0).map(Number);
    if (cmd === 'Z' || cmd === 'z') continue;
    if (args.length < 2 || !Number.isFinite(args[0]) || !Number.isFinite(args[1])) return null;
    const abs = cmd === 'M' || cmd === 'L';
    const nx = abs ? (args[0] as number) : cx + (args[0] as number);
    const ny = abs ? (args[1] as number) : cy + (args[1] as number);
    out.push([nx, ny]);
    cx = nx; cy = ny;
  }
  return out;
};

const inRegion = (p: [number, number], rx: [number, number], ry: [number, number]): boolean =>
  p[0] >= rx[0] - REGION_MARGIN && p[0] <= rx[1] + REGION_MARGIN && p[1] >= ry[0] - REGION_MARGIN && p[1] <= ry[1] + REGION_MARGIN;

const mapPixel = (p: [number, number], fx: Calibration, fy: Calibration): [number, number] | null => {
  const xv = fx.scale === 'linear' ? fx.slope * p[0] + fx.intercept : 10 ** (fx.slope * p[0] + fx.intercept);
  const yv = fy.scale === 'linear' ? fy.slope * p[1] + fy.intercept : 10 ** (fy.slope * p[1] + fy.intercept);
  if (!Number.isFinite(xv) || !Number.isFinite(yv)) return null;
  return [roundSig(xv), roundSig(yv)];
};

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

export const parseSvgPlot = (svgText: string, opts: { name: string }): SvgPlotResult => {
  const warnings: string[] = [];
  const cleaned = svgText.replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?[^>]*>/gi, '');
  const parsed = parseXml(cleaned);
  if (parsed.status === 'error') {
    return { ok: false, reason: `svg: not well-formed XML: ${parsed.message}` };
  }
  const root = parsed.root;
  const texts = collectTexts(root, warnings);

  const yClusters = findClusters(texts, 'x'); // numeric column: x fixed → a y axis
  const xClusters = findClusters(texts, 'y'); // numeric row: y fixed → an x axis
  if (yClusters.length === 0 || xClusters.length === 0) {
    return { ok: true, ...unsupportedDoc(opts.name, root, warnings, 'no aligned numeric tick groups found — not a chart, or tick labels not machine-located (decorative/foreignObject SVG)') };
  }
  // y ticks default LEFT (matplotlib), x ticks default BOTTOM; ties broken by tick count.
  const pick = (list: TickCluster[], extreme: 'min' | 'max'): TickCluster => {
    const maxTicks = (list[0] as TickCluster).calib.ticks.length;
    const tied = list.filter((c) => c.calib.ticks.length === maxTicks);
    tied.sort((a, b) => (extreme === 'min' ? a.bandPixel - b.bandPixel : b.bandPixel - a.bandPixel));
    return tied[0] as TickCluster;
  };
  const yCluster = pick(yClusters, 'min');
  const xCluster = pick(xClusters, 'max');
  const skippedY = yClusters.length - 1;
  const skippedX = xClusters.length - 1;
  if (skippedY + skippedX > 0) {
    warnings.push(`multi-axis SVG: ${skippedY + skippedX} additional tick group(s) present — digitized the primary (left-y / bottom-x) panel only, others not guessed`);
  }

  const fx = xCluster.calib;
  const fy = yCluster.calib;
  const xlabel = axisLabel(texts, 'x', xCluster.bandPixel);
  const ylabel = axisLabel(texts, 'y', yCluster.bandPixel);
  const xTickPixels = fx.ticks.map((t) => t[0]);
  const yTickPixels = fy.ticks.map((t) => t[0]);
  const regionX: [number, number] = [Math.min(...xTickPixels), Math.max(...xTickPixels)];
  const regionY: [number, number] = [Math.min(...yTickPixels), Math.max(...yTickPixels)];

  // data primitives
  const series: SdmPlotPoints['series'] = [];
  let skippedCurves = 0, skippedBars = 0;
  const consider = (kind: SdmPlotPoints['series'][number]['kind'], pixels: Array<[number, number]> | null, stroke?: string): void => {
    if (pixels === null) { skippedCurves += 1; return; }
    const inside = pixels.filter((p) => inRegion(p, regionX, regionY));
    if (inside.length < 1) return;
    if (series.length >= MAX_SERIES) return;
    const mapped = inside
      .slice(0, MAX_POINTS_PER_SERIES)
      .map((p) => mapPixel(p, fx, fy))
      .filter((p): p is [number, number] => p !== null);
    if (mapped.length === 0) return;
    series.push({ label: `series ${series.length + 1}`, kind, ...(stroke !== undefined ? { stroke } : {}), points: mapped });
  };
  const strokeOf = (el: XmlElement): string | undefined => {
    const s = attrAny(el, 'stroke');
    if (s !== undefined) return s;
    const style = attrAny(el, 'style');
    if (style !== undefined) {
      const m = /(?:^|;)\s*stroke\s*:\s*([^;]+)/.exec(style);
      if (m !== null) return (m[1] ?? '').trim();
    }
    return undefined;
  };
  for (const el of findAll(root, 'polyline')) consider('polyline', parsePointsAttr(attrAny(el, 'points') ?? ''), strokeOf(el));
  for (const el of findAll(root, 'polygon')) consider('polyline', parsePointsAttr(attrAny(el, 'points') ?? ''), strokeOf(el));
  for (const el of findAll(root, 'line')) {
    const x1 = Number(attrAny(el, 'x1') ?? Number.NaN), y1 = Number(attrAny(el, 'y1') ?? Number.NaN);
    const x2 = Number(attrAny(el, 'x2') ?? Number.NaN), y2 = Number(attrAny(el, 'y2') ?? Number.NaN);
    if ([x1, y1, x2, y2].every(Number.isFinite)) consider('line', [[x1, y1], [x2, y2]], strokeOf(el));
  }
  for (const el of findAll(root, 'path')) consider('path', parsePathD(attrAny(el, 'd') ?? ''), strokeOf(el));
  for (const el of findAll(root, 'circle')) {
    const cx = Number(attrAny(el, 'cx') ?? Number.NaN), cy = Number(attrAny(el, 'cy') ?? Number.NaN);
    if (Number.isFinite(cx) && Number.isFinite(cy)) consider('circle', [[cx, cy]], attrAny(el, 'fill'));
  }
  for (const el of findAll(root, 'rect')) {
    const x = Number(attrAny(el, 'x') ?? Number.NaN), y = Number(attrAny(el, 'y') ?? Number.NaN);
    const w = Number(attrAny(el, 'width') ?? Number.NaN), h = Number(attrAny(el, 'height') ?? Number.NaN);
    if ([x, y, w, h].every(Number.isFinite) && inRegion([x, y], regionX, regionY) && w > 0 && h > 0) skippedBars += 1;
  }
  if (skippedCurves > 0) warnings.push(`${skippedCurves} curved/arc <path> element(s) refused — bezier data points are not anchor-extractable, numbers not guessed`);
  if (skippedBars > 0) warnings.push(`${skippedBars} bar <rect> element(s) present — bar-top value semantics not digitized in this tier (honest gap)`);
  if (series.length === 0) {
    return { ok: true, ...unsupportedDoc(opts.name, root, [...warnings, 'axes calibrated but no data primitives found inside the plot region'], 'axes-calibrated-no-data') };
  }

  // legend candidates: non-numeric texts OUTSIDE the plot region (right/bottom margins)
  const legendCandidates = texts
    .filter((t) => t.numeric === null && t.text.length > 1 && t.text.length < 60)
    .filter((t) => t.x > regionX[1] + REGION_MARGIN * 2 || t.y > regionY[1] + REGION_MARGIN * 2)
    .map((t) => t.text)
    .slice(0, 20);

  const xRange = [Math.min(...fx.ticks.map((t) => t[1])), Math.max(...fx.ticks.map((t) => t[1]))] as [number, number];
  const yRange = [Math.min(...fy.ticks.map((t) => t[1])), Math.max(...fy.ticks.map((t) => t[1]))] as [number, number];

  const titleEl = childrenNamed(root, 'title')[0];
  const descEl = childrenNamed(root, 'desc')[0];
  const title = titleEl !== undefined ? normText(textOf(titleEl)) : '';
  const desc = descEl !== undefined ? normText(textOf(descEl)) : '';

  const pointsDoc: SdmPlotPoints = {
    schemaVersion: 'sdm-plot-points-1',
    source: { name: opts.name },
    axes: {
      x: {
        calibration: { ticks: fx.ticks, slope: roundSig(fx.slope), intercept: roundSig(fx.intercept), scale: fx.scale, maxResidual: fx.maxResidual },
        ...(xlabel.label.length > 0 ? { label: xlabel.label } : {}),
        ...(xlabel.unit !== undefined ? { unit: xlabel.unit } : {}),
      },
      y: {
        calibration: { ticks: fy.ticks, slope: roundSig(fy.slope), intercept: roundSig(fy.intercept), scale: fy.scale, maxResidual: fy.maxResidual },
        ...(ylabel.label.length > 0 ? { label: ylabel.label } : {}),
        ...(ylabel.unit !== undefined ? { unit: ylabel.unit } : {}),
      },
    },
    series,
    legendCandidates,
    warnings,
  };

  const blk = new IdGen('blk');
  const fig = new IdGen('fig');
  const blocks: SdmDocument['blocks'] = [];
  if (title.length > 0 || desc.length > 0) {
    blocks.push({ id: blk.next(), kind: 'caption', text: [title, desc].filter((s) => s.length > 0).join(' — '), provenance: { elementPath: 'svg>title' } });
  }
  const figureId = fig.next();
  const sdm: SdmDocument = {
    schemaVersion: 'sdm-1',
    extractor: { name: 'svg-plot-v1', route: 'svg_plot' },
    origin: { kind: 'upload', name: opts.name },
    meta: { authors: [], ...(title.length > 0 ? { title } : {}) },
    blocks,
    figures: [{
      id: figureId,
      label: title.length > 0 ? title.slice(0, 60) : 'SVG figure',
      caption: desc.length > 0 ? desc : title,
      panels: [],
      perception: {
        status: 'extracted',
        axes: [
          { kind: 'x', ...(xlabel.label.length > 0 ? { label: xlabel.label } : {}), ...(xlabel.unit !== undefined ? { unit: xlabel.unit } : {}), scale: fx.scale, range: xRange },
          { kind: 'y', ...(ylabel.label.length > 0 ? { label: ylabel.label } : {}), ...(ylabel.unit !== undefined ? { unit: ylabel.unit } : {}), scale: fy.scale, range: yRange },
        ],
        series: series.map((s) => ({ label: s.label })),
        verifiedBy: 'deterministic-calibration',
      },
      provenance: { elementPath: 'svg' },
      // pointsRef injected by the service layer after the points artifact persists
    }],
    tables: [], equations: [], citations: [], xrefs: [],
    diagnostics: { parseStatus: 'partial', warnings: [...warnings, 'numeric claims live in the points artifact (calibration re-verifiable); SDM carries ranges only'], truncated: false },
  };
  return { ok: true, sdm, points: pointsDoc };
};

/** Honest non-digitization: an SVG we parsed but cannot turn into numbers. */
const unsupportedDoc = (name: string, root: XmlElement, warnings: string[], why: string): { sdm: SdmDocument; points: SdmPlotPoints } => {
  const titleEl = childrenNamed(root, 'title')[0];
  const descEl = childrenNamed(root, 'desc')[0];
  const title = titleEl !== undefined ? normText(textOf(titleEl)) : '';
  const desc = descEl !== undefined ? normText(textOf(descEl)) : '';
  const blk = new IdGen('blk');
  const fig = new IdGen('fig');
  const blocks: SdmDocument['blocks'] = [];
  if (title.length > 0 || desc.length > 0) {
    blocks.push({ id: blk.next(), kind: 'caption', text: [title, desc].filter((s) => s.length > 0).join(' — '), provenance: { elementPath: 'svg>title' } });
  }
  return {
    sdm: {
      schemaVersion: 'sdm-1',
      extractor: { name: 'svg-plot-v1', route: 'svg_plot' },
      origin: { kind: 'upload', name },
      meta: { authors: [], ...(title.length > 0 ? { title } : {}) },
      blocks,
      figures: [{
        id: fig.next(), label: title.length > 0 ? title.slice(0, 60) : 'SVG figure',
        caption: desc.length > 0 ? desc : title, panels: [],
        perception: { status: 'unsupported' },
        provenance: { elementPath: 'svg' },
      }],
      tables: [], equations: [], citations: [], xrefs: [],
      diagnostics: { parseStatus: 'partial', warnings: [...warnings, `plot digitization refused: ${why}`], truncated: false },
    },
    points: {
      schemaVersion: 'sdm-plot-points-1',
      source: { name },
      axes: {
        x: { calibration: { ticks: [], slope: 0, intercept: 0, scale: 'linear', maxResidual: -1 } },
        y: { calibration: { ticks: [], slope: 0, intercept: 0, scale: 'linear', maxResidual: -1 } },
      },
      series: [], legendCandidates: [], warnings: [why],
    },
  };
};
