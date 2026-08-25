import { z } from 'zod';
import type { EvidenceRelationType, EvidenceStrength } from './evidence.js';

/**
 * Wave-S/d1 formal semantics layer (L1). Proposition-level likelihood-ratio algebra,
 * QBAF gradual semantics and Carneades proof standards — all deterministic.
 *
 * Method ancestry (public methodology; our constants are DISCLOSED conventions, i.e.
 * 映射提案 on top of the literature, exported once here and surfaced in bundles):
 * - words map to LR INTERVALS, not points (Kent 1964; Mosteller & Youtz 1990);
 * - continuous evidence strength is banded (Jeffreys 1961; Kass & Raftery 1995);
 * - gradual (gradation) QBAF semantics: unique polynomial fixed point (Potyka KR2020);
 * - proof standards as thresholds (Gordon/Prakken/Walton AIJ 2007).
 */

/** log10-LR interval per (relation, strength). Adjusting this changes every downstream
 * band — it lives here, once, and is disclosed in the export bundle. */
const LADDER: Readonly<Record<'strong' | 'moderate' | 'weak', readonly [number, number]>> = {
  strong: [1.0, 2.0],
  moderate: [0.5, 1.0],
  weak: [0.15, 0.5],
};
const NEG = ([lo, hi]: readonly [number, number]): readonly [number, number] => [-hi, -lo];

const INTERVALS: Readonly<Partial<Record<EvidenceRelationType, Readonly<Record<EvidenceStrength, readonly [number, number] | null>>>>> = {
  supports: { strong: LADDER.strong, moderate: LADDER.moderate, weak: LADDER.weak, unrated: [0, 0] },
  replicates: { strong: LADDER.strong, moderate: LADDER.moderate, weak: LADDER.weak, unrated: [0, 0] },
  contradicts: { strong: NEG(LADDER.strong), moderate: NEG(LADDER.moderate), weak: NEG(LADDER.weak), unrated: [0, 0] },
  weakens: { strong: [-1.5, -0.75], moderate: [-0.75, -0.4], weak: [-0.4, -0.15], unrated: [0, 0] },
  fails_to_replicate: { strong: [-1.5, -0.75], moderate: [-0.75, -0.4], weak: [-0.4, -0.15], unrated: [0, 0] },
  alternative_explanation: { strong: [-1.5, -0.5], moderate: [-1.0, -0.3], weak: [-0.3, -0.1], unrated: [0, 0] },
  qualifies: { strong: [-0.15, 0.15], moderate: [-0.1, 0.1], weak: [-0.05, 0.05], unrated: [0, 0] },
  methodological_limitation: { strong: [-0.75, -0.3], moderate: [-0.4, -0.1], weak: [-0.2, -0.05], unrated: [0, 0] },
  // Neutral structural relations carry no evidential weight: excluded from accumulation.
};

/** log10-LR interval for one relation, or null when the relation type is non-evidential. */
export const logLrInterval = (
  relation: EvidenceRelationType,
  strength: EvidenceStrength,
): readonly [number, number] | null => INTERVALS[relation]?.[strength] ?? null;

export interface LogLrItem {
  relation: EvidenceRelationType;
  strength: EvidenceStrength;
  /** Owning source for the per-source double-counting cap (claim locator or direct). */
  sourceKey: string;
}

export interface LogLrSummary {
  low: number;
  high: number;
  /** Midpoint of the summed interval — the band input. */
  midpoint: number;
  contributions: number;
  excluded: number;
  sourcesCapped: number;
}

/** Σ log-LR with a per-source cap: correlated evidence (several claims from one paper)
 * must not multiply into independent confirmation. Sources beyond the cap are dropped,
 * loudly counted — never silently re-weighted. */
export const sumLogLr = (
  items: readonly LogLrItem[],
  opts: { maxPerSource?: number } = {},
): LogLrSummary => {
  const maxPerSource = opts.maxPerSource ?? 2;
  const perSource = new Map<string, number>();
  let low = 0;
  let high = 0;
  let contributions = 0;
  let excluded = 0;
  let sourcesCapped = 0;
  for (const item of items) {
    const interval = logLrInterval(item.relation, item.strength);
    if (interval === null) {
      excluded += 1;
      continue;
    }
    const used = perSource.get(item.sourceKey) ?? 0;
    if (used >= maxPerSource) {
      sourcesCapped += 1;
      continue;
    }
    perSource.set(item.sourceKey, used + 1);
    low += interval[0];
    high += interval[1];
    contributions += 1;
  }
  return { low, high, midpoint: (low + high) / 2, contributions, excluded, sourcesCapped };
};

export const LogLrBand = z.enum([
  'very_strong_support', 'strong_support', 'moderate_support', 'weak_support', 'none',
  'weak_counter', 'moderate_counter', 'strong_counter', 'very_strong_counter',
]);
export type LogLrBand = z.infer<typeof LogLrBand>;

/** Jeffreys-style banding of the total log10-LR midpoint (2·log10B thresholds halved). */
export const bandOf = (logLrMidpoint: number): LogLrBand => {
  const v = logLrMidpoint;
  if (v >= 1.0) return 'very_strong_support';
  if (v >= 0.5) return 'strong_support';
  if (v >= 0.15) return 'moderate_support';
  if (v > -0.15) return 'none';
  if (v > -0.5) return 'weak_counter';
  if (v > -1.0) return 'moderate_counter';
  if (v > -2.0) return 'strong_counter';
  return 'very_strong_counter';
};

// ---------------------------------------------------------------------------
// QBAF gradual semantics (Potyka KR2020 style): strength(v) = clamp01(
//   base(v) + damping · Σ_{supporters u} w(e)·strength(u) − Σ_{attackers u} w(e)·strength(u))
// Iterated to the unique fixed point; polynomial, no SAT/ASP anywhere.

export interface QbafNode {
  id: string;
  /** Base (acceptability) score in 0..1. */
  base: number;
}
export interface QbafEdge {
  from: string;
  to: string;
  /** Support edge: positive weight (0..1); attack edge: negative weight (−1..0). */
  weight: number;
}

export const qbafStrength = (
  nodes: readonly QbafNode[],
  edges: readonly QbafEdge[],
  opts: { damping?: number; maxIter?: number; tol?: number } = {},
): Map<string, number> => {
  const damping = opts.damping ?? 0.5;
  const maxIter = opts.maxIter ?? 200;
  const tol = opts.tol ?? 1e-9;
  const strength = new Map<string, number>(nodes.map((n) => [n.id, Math.min(1, Math.max(0, n.base))] as const));
  const incoming = new Map<string, QbafEdge[]>();
  for (const e of edges) {
    const list = incoming.get(e.to) ?? [];
    list.push(e);
    incoming.set(e.to, list);
  }
  for (let iter = 0; iter < maxIter; iter += 1) {
    let maxDelta = 0;
    const next = new Map<string, number>();
    for (const n of nodes) {
      let acc = n.base;
      for (const e of incoming.get(n.id) ?? []) {
        const s = strength.get(e.from);
        if (s === undefined) continue;
        acc += damping * e.weight * s; // sign of the weight carries support/attack polarity
      }
      const v = Math.min(1, Math.max(0, acc));
      const prev = strength.get(n.id) ?? n.base;
      maxDelta = Math.max(maxDelta, Math.abs(v - prev));
      next.set(n.id, v);
    }
    for (const [k, v] of next) strength.set(k, v);
    if (maxDelta < tol) break;
  }
  return strength;
};

// ---------------------------------------------------------------------------
// Carneades proof standards (Gordon/Prakken/Walton 2007) as deterministic thresholds.
// Thresholds are OUR conventions, disclosed with every verdict.

export const ProofStandard = z.enum([
  'unproven', 'scintilla', 'preponderance', 'clear_and_convincing', 'beyond_reasonable_doubt',
]);
export type ProofStandard = z.infer<typeof ProofStandard>;

export const PROOF_STANDARD_THRESHOLDS: Readonly<Record<Exclude<ProofStandard, 'unproven'>, number>> = {
  scintilla: 0.5,
  preponderance: 0.6,
  clear_and_convincing: 0.75,
  beyond_reasonable_doubt: 0.9,
};

export const proofStandardOf = (strength: number): ProofStandard => {
  if (strength >= PROOF_STANDARD_THRESHOLDS.beyond_reasonable_doubt) return 'beyond_reasonable_doubt';
  if (strength >= PROOF_STANDARD_THRESHOLDS.clear_and_convincing) return 'clear_and_convincing';
  if (strength >= PROOF_STANDARD_THRESHOLDS.preponderance) return 'preponderance';
  if (strength >= PROOF_STANDARD_THRESHOLDS.scintilla) return 'scintilla';
  return 'unproven';
};

