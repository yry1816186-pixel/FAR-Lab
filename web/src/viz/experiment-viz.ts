/**
 * Pure builders for experiment-statistics visuals (VIZ V3). CI forest rows
 * with a shared per-metric scale, honest metric-relative bars (comparison
 * semantics only — bar = value / max of the SAME metric across compared
 * cells, never across different metrics), and the verdict tally.
 */

export interface ForestInputReport {
  id?: string;
  comparisonId?: string;
  metricKey?: string;
  pointEstimate?: number;
  ci?: { level?: number; low?: number; high?: number };
  verdict?: string;
  secondary?: boolean;
  exploratory?: boolean;
}

export interface ForestRow {
  key: string;
  label: string;
  metric: string;
  /** Finite numbers only; absent CI bounds stay undefined and draw a bare point. */
  point: number;
  low?: number;
  high?: number;
  ciLevel?: number;
  verdict?: string;
  exploratory: boolean;
  secondary: boolean;
}

export interface ForestScale {
  min: number;
  max: number;
  /** True when 0 lies strictly inside (min, max) — the zero reference line draws only then. */
  spansZero: boolean;
}

/** Group rows by metricKey so each metric gets its own honest scale. */
export function buildForestGroups(reports: ForestInputReport[]): { metric: string; rows: ForestRow[]; scale: ForestScale }[] {
  const groups = new Map<string, ForestRow[]>();
  for (const r of reports) {
    if (typeof r.pointEstimate !== 'number' || !Number.isFinite(r.pointEstimate)) continue;
    const metric = r.metricKey ?? 'metric';
    const low = typeof r.ci?.low === 'number' && Number.isFinite(r.ci.low) ? r.ci.low : undefined;
    const high = typeof r.ci?.high === 'number' && Number.isFinite(r.ci.high) ? r.ci.high : undefined;
    const row: ForestRow = {
      key: r.id ?? `${r.comparisonId ?? ''}:${metric}:${r.pointEstimate}`,
      label: r.comparisonId ?? metric,
      metric,
      point: r.pointEstimate,
      ...(low !== undefined ? { low } : {}),
      ...(high !== undefined ? { high } : {}),
      ...(typeof r.ci?.level === 'number' ? { ciLevel: r.ci.level } : {}),
      ...(typeof r.verdict === 'string' ? { verdict: r.verdict } : {}),
      exploratory: r.exploratory === true,
      secondary: r.secondary === true,
    };
    const arr = groups.get(metric) ?? [];
    arr.push(row);
    groups.set(metric, arr);
  }
  return [...groups.entries()].map(([metric, rows]) => {
    const values: number[] = [];
    for (const r of rows) {
      values.push(r.point, r.low ?? r.point, r.high ?? r.point);
    }
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) { min -= Math.abs(min || 1) * 0.1; max += Math.abs(max || 1) * 0.1; }
    const pad = (max - min) * 0.08;
    min -= pad;
    max += pad;
    // Padding must not invent a zero crossing the data doesn't have — the zero
    // reference line is a data statement, not an artifact of breathing room.
    if (min < 0 && Math.min(...values) >= 0) min = 0;
    if (max > 0 && Math.max(...values) <= 0) max = 0;
    return { metric, rows, scale: { min, max, spansZero: min < 0 && max > 0 } };
  });
}

// ---- metric-relative bars (result-set cells) ----

export interface MetricCell {
  key: string; // unique cell key (fingerprint or index)
  modelName?: string;
  metrics?: Record<string, number>;
}

/**
 * share = value / max(same metric across cells). Returns undefined when there
 * aren't 2+ comparable cells or the max isn't positive — a single cell has no
 * comparison semantics and a bar would just decorate.
 */
export function metricShares(cells: MetricCell[]): Map<string, Map<string, number>> | undefined {
  if (cells.length < 2) return undefined;
  const maxByMetric = new Map<string, number>();
  for (const c of cells) {
    for (const [k, v] of Object.entries(c.metrics ?? {})) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue;
      maxByMetric.set(k, Math.max(maxByMetric.get(k) ?? 0, v));
    }
  }
  if (maxByMetric.size === 0) return undefined;
  const shares = new Map<string, Map<string, number>>();
  for (const c of cells) {
    for (const [k, v] of Object.entries(c.metrics ?? {})) {
      const max = maxByMetric.get(k);
      if (max === undefined || max <= 0 || typeof v !== 'number' || !Number.isFinite(v)) continue;
      const m = shares.get(k) ?? new Map<string, number>();
      m.set(c.key, v / max);
      shares.set(k, m);
    }
  }
  return shares;
}

// ---- verdict tally ----

export interface VerdictTally {
  supports: number;
  falsifies: number;
  inconclusive: number;  /** Product audit Note A: verdict-less reports (sequential re-runs) — never presented as a scientific judgment. */
  unjudged: number;
  exploratory: number;
  secondary: number;
}

export function tallyVerdicts(reports: ForestInputReport[]): VerdictTally {
  const t: VerdictTally = { supports: 0, falsifies: 0, inconclusive: 0, unjudged: 0, exploratory: 0, secondary: 0 };
  for (const r of reports) {
    if (r.verdict === 'supports') t.supports += 1;
    else if (r.verdict === 'falsifies') t.falsifies += 1;
    // Product audit Note A: a verdict-less report (sequential exploratory re-run,
    // insufficient data) is NOT an inconclusive scientific judgment - its own bucket.
    else if (r.verdict === 'inconclusive' || r.verdict === 'insufficient_data' || r.verdict === 'weakens') t.inconclusive += 1;
    else t.unjudged += 1;
    if (r.exploratory === true) t.exploratory += 1;
    if (r.secondary === true) t.secondary += 1;
  }
  return t;
}
