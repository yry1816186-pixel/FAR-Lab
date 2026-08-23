/**
 * Pure, deterministic builders for the hypothesis-comparison visualizations (VIZ V1).
 * No React, no echarts — every function here is unit-testable and every value it
 * emits comes from structured run data. Missing scores are NEVER coerced to 0:
 * a hypothesis that lacks a dimension either excludes that dimension (radar
 * intersection) or renders an explicit null cell (heatmap "—").
 */
import type {
  AchAnalysis,
  AchDiagnosticityScore,
  EvidenceBody,
  EvidenceRelation,
  HypothesisCandidate,
  HypothesisScorecard,
  ScoreDimension,
  TournamentMatch,
} from '../api/types';
import { RELATION_POLARITY } from '../api/types';

// ---- evidence balances (relation counts + evidence body per hypothesis) ----

export interface HypBalance {
  supports: number;
  counters: number;
  body?: EvidenceBody;
}

/**
 * Per-hypothesis supporting/counter relation counts split by the canonical
 * polarity table, enriched with the deterministic evidence body when present.
 * Shared by the hypothesis cards (HX4 balance bars) and the compare view
 * (VIZ V1 balance row) so both surfaces can never disagree.
 */
export function buildHypothesisBalances(
  bodies: EvidenceBody[] | undefined,
  relations: EvidenceRelation[] | undefined,
): Map<string, HypBalance> {
  const map = new Map<string, HypBalance>();
  const ensure = (id: string): HypBalance => {
    const existing = map.get(id) ?? { supports: 0, counters: 0 };
    map.set(id, existing);
    return existing;
  };
  for (const b of bodies ?? []) ensure(b.hypothesisId).body = b;
  for (const r of relations ?? []) {
    if (r.targetHypothesisId === undefined) continue;
    const acc = ensure(r.targetHypothesisId);
    const polarity = RELATION_POLARITY[r.relation];
    if (polarity === 'supporting') acc.supports += 1;
    else if (polarity === 'counter') acc.counters += 1;
  }
  return map;
}

// ---- radar (score dimensions, 2-3 compared hypotheses overlaid) ----

export interface RadarSeries {
  id: string;
  /** Legend label: rank-led, human-readable ("#1 语句摘要"). */
  label: string;
  values: number[];
}

export interface RadarSpec {
  indicators: { name: string; max: number }[];
  series: RadarSeries[];
}

export interface RadarRefusal {
  kind: 'few_common_dims' | 'few_scored';
  commonDims: ScoreDimension[];
  /** Hypotheses that could not participate, with the dims they are missing. */
  missing: { hypId: string; missingDims: ScoreDimension[] }[];
}

export type RadarResult = { spec: RadarSpec; refusal?: undefined } | { spec?: undefined; refusal: RadarRefusal };

const MIN_RADAR_DIMS = 3;

const shorten = (statement: string, max = 48): string =>
  statement.length > max ? `${statement.slice(0, max)}…` : statement;

/**
 * Radar needs every series to have a value on every axis. The honest basis is
 * the INTERSECTION of dimensions scored (value !== null) by all compared
 * hypotheses — a union would force either faked zeros or invisible gaps, and
 * both lie about the run. Ordering follows the first scorecard's dimension
 * order (the pipeline's canonical order), so axes stay stable across compares.
 */
export function buildRadar(hypotheses: HypothesisCandidate[], scorecards: HypothesisScorecard[]): RadarResult {
  const cardOf = new Map(scorecards.map((s) => [s.hypothesisId, s] as const));
  const compared = hypotheses.filter((h) => cardOf.has(h.id));
  if (compared.length < 2) {
    return { refusal: { kind: 'few_scored', commonDims: [], missing: hypotheses.map((h) => ({ hypId: h.id, missingDims: [] })) } };
  }

  const scoredSets = compared.map((h) => {
    // dim → value, scored entries only (null scores never enter, so radar values cannot fake a 0)
    const values = new Map<ScoreDimension, number>();
    for (const d of cardOf.get(h.id)!.dimensions) if (d.value !== null) values.set(d.dimension, d.value);
    return { hyp: h, values };
  });

  const orderedDims: ScoreDimension[] = [];
  for (const d of cardOf.get(compared[0]!.id)!.dimensions) {
    if (d.value === null) continue;
    if (scoredSets.every(({ values }) => values.has(d.dimension)) && !orderedDims.includes(d.dimension)) {
      orderedDims.push(d.dimension);
    }
  }

  if (orderedDims.length < MIN_RADAR_DIMS) {
    return {
      refusal: {
        kind: 'few_common_dims',
        commonDims: orderedDims,
        missing: scoredSets.map(({ hyp, values }) => ({
          hypId: hyp.id,
          missingDims: [...values.keys()].filter((d) => !orderedDims.includes(d)),
        })),
      },
    };
  }

  const series: RadarSeries[] = scoredSets.map(({ hyp, values }) => ({
    id: hyp.id,
    label: `#${cardOf.get(hyp.id)!.rank} ${shorten(hyp.statement)}`,
    values: orderedDims.map((dim) => values.get(dim) as number), // intersection guarantee: every dim is in `values`
  }));
  return { spec: { indicators: orderedDims.map((name) => ({ name, max: 1 })), series } };
}

// ---- dimension heatmap (all ranked representatives × dimensions) ----

export interface HeatmapRow {
  hypId: string;
  rank: number;
  statement: string;
  values: (number | null)[];
}

export interface DimensionMatrix {
  dims: ScoreDimension[];
  rows: HeatmapRow[];
}

/** Row order = scorecard rank; column order = the union in first-seen pipeline order. */
export function buildDimensionMatrix(hypotheses: HypothesisCandidate[], scorecards: HypothesisScorecard[]): DimensionMatrix {
  const byId = new Map(hypotheses.map((h) => [h.id, h] as const));
  const ranked = scorecards.slice().sort((a, b) => a.rank - b.rank).filter((s) => byId.has(s.hypothesisId));

  const dims: ScoreDimension[] = [];
  for (const s of ranked) for (const d of s.dimensions) if (!dims.includes(d.dimension)) dims.push(d.dimension);

  const rows: HeatmapRow[] = ranked.map((s) => ({
    hypId: s.hypothesisId,
    rank: s.rank,
    statement: byId.get(s.hypothesisId)!.statement,
    values: dims.map((dim) => {
      const d = s.dimensions.find((x) => x.dimension === dim);
      return d !== undefined && d.value !== null ? d.value : null;
    }),
  }));
  return { dims, rows };
}

// ---- ACH diagnosticity net matrix (claims × hypotheses, signed) ----

export interface AchNetMatrix {
  /** Column order follows the supplied (rank-ordered) hypothesis ids. */
  hypIds: string[];
  rows: { claimId: string; score: number; net: (number | null)[] }[];
  /** Max |net| across shown cells — the symmetric diverging-color scale anchor. */
  scale: number;
}

/**
 * netByHypothesis is a signed diagnosticity contribution: positive = the claim
 * argues for that hypothesis, negative = against. Absent key = no binding —
 * null cell, never 0 (0 is a real computed tie and must stay visible as such).
 */
export function buildAchNetMatrix(
  ach: AchAnalysis,
  orderedHypIds: string[],
  topK = 8,
): AchNetMatrix {
  const sorted: AchDiagnosticityScore[] = ach.diagnosticity.slice().sort((a, b) => b.score - a.score).slice(0, topK);
  const hypSet = new Set(orderedHypIds);
  const rows = sorted.map((d) => ({
    claimId: d.claimId,
    score: d.score,
    net: orderedHypIds.map((id) => {
      const v = d.netByHypothesis[id];
      return hypSet.has(id) && v !== undefined ? v : null;
    }),
  }));
  let scale = 0;
  for (const r of rows) for (const v of r.net) if (v !== null) scale = Math.max(scale, Math.abs(v));
  return { hypIds: orderedHypIds, rows, scale };
}

// ---- tournament crosstable (round-robin pairwise outcomes) ----

export type CrosstabOutcome = 'win' | 'loss' | 'tie' | 'no_contest';

export interface CrosstabCell {
  wins: number;
  losses: number;
  ties: number;
  noContest: number;
}

export interface Crosstab {
  /** Row/column order = rank order of the supplied standing ids. */
  ids: string[];
  cells: Map<string, CrosstabCell>; // key `${rowId}\u0000${colId}`
}

/**
 * A round-robin tournament has no bracket tree — the honest shape is a
 * crosstable (chess style). Each match votes once for the ROW player's
 * perspective; multiple matches per pair aggregate instead of hiding.
 */
export function buildCrosstab(standings: { hypothesisId: string }[], matches: TournamentMatch[]): Crosstab {
  const ids = standings.map((s) => s.hypothesisId);
  const cells = new Map<string, CrosstabCell>();
  const key = (a: string, b: string): string => `${a}\u0000${b}`;
  const cellOf = (a: string, b: string): CrosstabCell => {
    const k = key(a, b);
    const c = cells.get(k) ?? { wins: 0, losses: 0, ties: 0, noContest: 0 };
    cells.set(k, c);
    return c;
  };
  for (const m of matches) {
    if (m.outcome === 'no_contest') {
      cellOf(m.aId, m.bId).noContest += 1;
      cellOf(m.bId, m.aId).noContest += 1;
      continue;
    }
    if (m.outcome === 'a') {
      cellOf(m.aId, m.bId).wins += 1;
      cellOf(m.bId, m.aId).losses += 1;
    } else if (m.outcome === 'b') {
      cellOf(m.bId, m.aId).wins += 1;
      cellOf(m.aId, m.bId).losses += 1;
    } else {
      cellOf(m.aId, m.bId).ties += 1;
      cellOf(m.bId, m.aId).ties += 1;
    }
  }
  return { ids, cells };
}

/** Compact glyph text for a cell: single match "✓", aggregate "2✓ 1△ 1✗". */
export function crosstabCellText(c: CrosstabCell | undefined): string {
  if (c === undefined) return '';
  const parts: string[] = [];
  if (c.wins > 0) parts.push(`${c.wins}✓`);
  if (c.ties > 0) parts.push(`${c.ties}△`);
  if (c.losses > 0) parts.push(`${c.losses}✗`);
  if (parts.length === 0 && c.noContest > 0) parts.push('·');
  return parts.join(' ');
}

/** Dominant tone for coloring: any loss visible errs, else wins ok, else neutral. */
export function crosstabCellTone(c: CrosstabCell | undefined): 'ok' | 'err' | 'muted' {
  if (c === undefined) return 'muted';
  if (c.losses > 0) return 'err';
  if (c.wins > 0) return 'ok';
  return 'muted';
}
