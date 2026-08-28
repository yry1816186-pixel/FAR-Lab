import { z } from 'zod';
import { ClaimId, HypothesisId, RunId } from './ids.js';
import type { ScientificClaim } from './claim.js';
import { EvidenceStrength, type EvidenceRelation } from './evidence.js';
import type { HypothesisCandidate } from './hypothesis.js';
import type { HypothesisScorecard, ScoreDimension } from './scorecard.js';

/**
 * Product Spine M1 (final product reconstruction, 2026-08-28): the CURRENT
 * SCIENTIFIC STATE projection. A deterministic read-time synthesis of the
 * objects a run already produced — NO LLM, no new truth. One owner for the
 * answer to "这个研究现在知道什么" so the study page can stop quoting the #1
 * hypothesis and start explaining the state of the question.
 *
 * Truth rules (protocol §II/§XIV):
 *  - Offline-template hypotheses NEVER occupy scientific surfaces: when the
 *    evidence for a state is template-generated, kind = 'template' and the
 *    leading-explanation slot is null — the honest state is INSUFFICIENT,
 *    not a quote of filler.
 *  - Confidence is ordinal/qualitative only; calibration of every borrowed
 *    score is carried through, never averaged into a fake probability.
 */

export const ScientificStateKind = z.enum(['forming', 'template', 'insufficient', 'evidence_backed']);
export type ScientificStateKind = z.infer<typeof ScientificStateKind>;

export const StateEvidenceRef = z.object({
  claimId: ClaimId,
  text: z.string().min(1),
  /** Relation rationale (why this evidence relates to the leading hypothesis). */
  rationale: z.string(),
  strength: EvidenceStrength,
  gradeCertainty: z.enum(['high', 'moderate', 'low', 'very_low']).nullable(),
});
export type StateEvidenceRef = z.infer<typeof StateEvidenceRef>;

export const StateDimensionNote = z.object({
  dimension: z.string().min(1),
  qualitative: z.enum(['low', 'moderate', 'high', 'not_assessed']).nullable(),
  rationale: z.string().min(1),
  calibration: z.enum(['uncalibrated_llm_judgment', 'deterministic', 'human_expert']),
});
export type StateDimensionNote = z.infer<typeof StateDimensionNote>;

export const CompetingView = z.object({
  hypothesisId: HypothesisId,
  statement: z.string().min(1),
  /** How it differs from the leader (distinctnessRationale, or the differing falsification observable). */
  differsBy: z.string().nullable(),
});
export type CompetingView = z.infer<typeof CompetingView>;

export const DiscriminatingObservation = z.object({
  betweenHypothesisIds: z.array(HypothesisId).length(2),
  /** What to measure that would split the two candidates. */
  observable: z.string().min(1),
  expects: z.array(z.string()).length(2),
});
export type DiscriminatingObservation = z.infer<typeof DiscriminatingObservation>;

export const ScientificState = z.object({
  runId: RunId,
  computedAt: z.string().datetime(),
  kind: ScientificStateKind,
  /** Template markers found (kind='template' only) — the refusal is auditable. */
  templateEvidence: z.array(z.string()).default([]),
  leading: z.object({
    hypothesisId: HypothesisId,
    statement: z.string().min(1),
    /** Deterministic composite: rank + top scorecard rationales. */
    whyItLeads: z.array(StateDimensionNote).default([]),
  }).nullable(),
  strongestSupport: StateEvidenceRef.nullable(),
  strongestCounter: StateEvidenceRef.nullable(),
  competing: z.array(CompetingView).default([]),
  discriminatingObservations: z.array(DiscriminatingObservation).default([]),
  biggestUnknown: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('unresolved_counter'), claimId: ClaimId, excerpt: z.string().min(1) }),
    z.object({ kind: z.literal('hyp_uncertainty'), text: z.string().min(1) }),
    z.object({ kind: z.literal('searched_no_counter'), queriesAttempted: z.number().int().positive() }),
    z.object({ kind: z.literal('template_content') }),
    z.object({ kind: z.literal('no_active_hyps') }),
  ]).nullable(),
  confidence: z.object({
    qualitative: z.enum(['low', 'moderate', 'high']),
    basis: z.literal('ordinal scorecard dimensions — uncalibrated, not probabilities'),
  }),
  falsifiers: z.array(z.object({
    hypothesisId: HypothesisId,
    condition: z.string().min(1),
  })).default([]),
  counters: z.object({
    unresolvedCount: z.number().int().nonnegative(),
    /** Scoped record when a counter search ran and found none — never "no counter-evidence exists". */
    searchedAndFoundNone: z.object({
      queriesAttempted: z.number().int().positive(),
      foundCount: z.number().int().nonnegative(),
    }).nullable(),
  }),
  evidenceShape: z.object({
    claims: z.number().int().nonnegative(),
    verified: z.number().int().nonnegative(),
    supportingRelations: z.number().int().nonnegative(),
    counterRelations: z.number().int().nonnegative(),
    excludedByResearcher: z.number().int().nonnegative(),
  }),
});
export type ScientificState = z.infer<typeof ScientificState>;

/** Offline-template content markers (observed shapes of the deterministic offline route). */
export const isTemplateHypothesis = (h: HypothesisCandidate): boolean =>
  /^Offline hypothesis/i.test(h.statement) || /^A deterministic offline mechanism/i.test(h.mechanism ?? '');

const isTemplateScopeDomain = (domain: string | undefined): boolean =>
  domain !== undefined && domain.includes('offline scope template');

const STRENGTH_ORDER: Record<EvidenceStrength, number> = { strong: 3, moderate: 2, weak: 1, unrated: 0 };
const GRADE_ORDER: Record<'high' | 'moderate' | 'low' | 'very_low', number> = { high: 3, moderate: 2, low: 1, very_low: 0 };

const relationStrengthFor = (relations: EvidenceRelation[], claimId: ClaimId, hypId: HypothesisId): EvidenceRelation | undefined =>
  relations.find((r) => r.claimId === claimId && r.targetHypothesisId === hypId);

const refOf = (
  claim: ScientificClaim | undefined,
  rel: EvidenceRelation | undefined,
): StateEvidenceRef | null => {
  if (claim === undefined) return null;
  return {
    claimId: claim.id,
    text: claim.text,
    rationale: rel?.rationale ?? '',
    strength: rel?.strength ?? 'unrated',
    gradeCertainty: claim.gradeCertainty ?? null,
  };
};

const pickStrongest = (
  claimIds: ClaimId[],
  claims: Map<ClaimId, ScientificClaim>,
  relations: EvidenceRelation[],
  hypId: HypothesisId,
): StateEvidenceRef | null => {
  let best: { ref: StateEvidenceRef; score: number } | null = null;
  for (const cid of claimIds) {
    const claim = claims.get(cid);
    if (claim === undefined || claim.researcher?.excluded === true) continue;
    const rel = relationStrengthFor(relations, cid, hypId);
    const ref = refOf(claim, rel);
    if (ref === null) continue;
    const score =
      STRENGTH_ORDER[ref.strength] * 10 + (claim.gradeCertainty !== undefined ? GRADE_ORDER[claim.gradeCertainty] : 0);
    if (best === null || score > best.score) best = { ref, score };
  }
  return best?.ref ?? null;
};

const activeOf = (hyps: HypothesisCandidate[]): HypothesisCandidate[] =>
  hyps.filter((h) => h.status === 'active' || h.status === 'promoted');

const dimensionNote = (s: HypothesisScorecard, dim: ScoreDimension): StateDimensionNote | null => {
  const d = s.dimensions.find((x) => x.dimension === dim);
  if (d === undefined || d.value === null) return null;
  return {
    dimension: d.dimension,
    qualitative: d.qualitative ?? null,
    rationale: d.rationale,
    calibration: d.calibration,
  };
};

/** Rank hypotheses by their scorecard rank (1 = best); unranked fall to the end, stable. */
const byRank = (hyps: HypothesisCandidate[], scorecards: HypothesisScorecard[]): HypothesisCandidate[] => {
  const rank = new Map<HypothesisId, number>(scorecards.map((s) => [s.hypothesisId, s.rank] as const));
  return hyps
    .map((h, i) => ({ h, i, r: rank.get(h.id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.h);
};

const QUAL_BY_VALUE: Array<[number, 'low' | 'moderate' | 'high']> = [[0.34, 'low'], [0.67, 'moderate']];

const qualitativeOf = (value: number): 'low' | 'moderate' | 'high' => {
  for (const [threshold, label] of QUAL_BY_VALUE) if (value < threshold) return label;
  return 'high';
};

const differsByOf = (h: HypothesisCandidate, leader: HypothesisCandidate): string | null => {
  if (h.distinctnessRationale !== undefined && h.distinctnessRationale.trim().length > 0) return h.distinctnessRationale;
  const obsA = leader.falsification?.observable;
  const obsB = h.falsification?.observable;
  if (obsA !== undefined && obsB !== undefined && obsA !== obsB) return `${obsA} vs ${obsB}`;
  if (h.mechanism !== undefined && h.mechanism.length > 0 && h.mechanism !== leader.mechanism) return h.mechanism;
  return null;
};

/**
 * Pure projection. All inputs are the run's OWN persisted objects, schema-validated
 * upstream; the output is derived state only — never persisted as a second truth.
 */
export function projectScientificState(input: {
  runId: RunId;
  runStatus: string;
  questionDomain: string | undefined;
  claims: ScientificClaim[];
  relations: EvidenceRelation[];
  hypotheses: HypothesisCandidate[];
  scorecards: HypothesisScorecard[];
  /** Count of purpose='counter_evidence' queries in the run's latest corpus snapshot. */
  counterQueriesAttempted: number;
}): ScientificState {
  const { runId, runStatus, questionDomain, claims, relations, hypotheses, scorecards, counterQueriesAttempted } = input;
  const claimsById = new Map(claims.map((c) => [c.id, c] as const));
  const active = byRank(activeOf(hypotheses), scorecards);
  const templateMarkers: string[] = [];
  const templateHyps = active.filter((h) => isTemplateHypothesis(h));
  if (templateHyps.length > 0 && templateHyps.length >= Math.max(1, Math.ceil(active.length / 2))) {
    templateMarkers.push(`${templateHyps.length}/${active.length} active hypotheses are offline-template statements`);
  }
  if (isTemplateScopeDomain(questionDomain)) templateMarkers.push('scope domain is the offline scope template');

  const settled = runStatus === 'completed' || runStatus === 'partial';
  const excludedClaims = claims.filter((c) => c.researcher?.excluded === true).length;
  const counterRelations = relations.filter((r) => {
    const pol = r.relation === 'contradicts' || r.relation === 'weakens'
      || r.relation === 'fails_to_replicate' || r.relation === 'alternative_explanation';
    return pol;
  }).length;
  const supportingRelations = relations.filter((r) => r.relation === 'supports' || r.relation === 'replicates').length;

  const shape = {
    claims: claims.length,
    verified: claims.filter((c) => c.bindingStatus === 'verified').length,
    supportingRelations,
    counterRelations,
    excludedByResearcher: excludedClaims,
  };

  const base = { runId, computedAt: new Date().toISOString(), templateEvidence: templateMarkers };
  if (!settled) {
    return ScientificState.parse({
      ...base, kind: 'forming', leading: null, strongestSupport: null, strongestCounter: null,
      competing: [], discriminatingObservations: [], biggestUnknown: null,
      confidence: { qualitative: 'low', basis: 'ordinal scorecard dimensions — uncalibrated, not probabilities' },
      falsifiers: [], counters: { unresolvedCount: 0, searchedAndFoundNone: null }, evidenceShape: shape,
    });
  }
  if (templateMarkers.length > 0) {
    // Refuse template synthesis: no leading explanation over filler, ever.
    return ScientificState.parse({
      ...base, kind: 'template', leading: null, strongestSupport: null, strongestCounter: null,
      competing: [], discriminatingObservations: [],
      biggestUnknown: { kind: 'template_content' },
      confidence: { qualitative: 'low', basis: 'ordinal scorecard dimensions — uncalibrated, not probabilities' },
      falsifiers: [], counters: { unresolvedCount: counterRelations, searchedAndFoundNone: null }, evidenceShape: shape,
    });
  }
  const SUPPORTING_RELS = new Set(['supports', 'replicates']);
  const COUNTER_RELS = new Set(['contradicts', 'weakens', 'fails_to_replicate', 'alternative_explanation']);
  const leader = active[0];
  if (leader === undefined) {
    return ScientificState.parse({
      ...base, kind: 'insufficient', leading: null, strongestSupport: null, strongestCounter: null,
      competing: [], discriminatingObservations: [],
      biggestUnknown: { kind: 'no_active_hyps' },
      confidence: { qualitative: 'low', basis: 'ordinal scorecard dimensions — uncalibrated, not probabilities' },
      falsifiers: [], counters: { unresolvedCount: counterRelations, searchedAndFoundNone: null }, evidenceShape: shape,
    });
  }
  // The evidence GRAPH (relation table) is the fact source; the hypothesis's
  // cached claim-id lists are a convenience. Union both so a relation recorded
  // after ranking still counts (read-time projection, never re-ranked here).
  const supportCandidates = new Set<ClaimId>(leader.supportingClaimIds ?? []);
  const counterCandidates = new Set<ClaimId>(leader.counterClaimIds ?? []);
  for (const r of relations) {
    if (r.targetHypothesisId !== leader.id || r.claimId === undefined) continue;
    if (SUPPORTING_RELS.has(r.relation)) supportCandidates.add(r.claimId);
    if (COUNTER_RELS.has(r.relation)) counterCandidates.add(r.claimId);
  }
  const leaderCard = scorecards.find((s) => s.hypothesisId === leader.id) ?? null;
  const whyItLeads: StateDimensionNote[] = [];
  for (const dim of ['evidence_grounding', 'counter_evidence_exposure', 'scientific_plausibility', 'falsifiability'] as const) {
    const note = leaderCard !== null ? dimensionNote(leaderCard, dim) : null;
    if (note !== null) whyItLeads.push(note);
  }
  if (leaderCard !== null && leaderCard.comparisonNote !== undefined) {
    // comparisonNote is disclosed elsewhere; nothing to add here.
  }

  const strongestSupport = pickStrongest([...supportCandidates], claimsById, relations, leader.id);
  const strongestCounter = pickStrongest([...counterCandidates], claimsById, relations, leader.id);

  const competing: CompetingView[] = active.slice(1, 3).map((h) => ({
    hypothesisId: h.id,
    statement: h.statement,
    differsBy: differsByOf(h, leader),
  }));

  // Discriminating observations: where leader and runner-up specify DIFFERENT
  // observables, that difference is exactly what splits them (M4 data, derived now).
  const discriminatingObservations: DiscriminatingObservation[] = [];
  const runner = active[1];
  if (runner !== undefined) {
    const obsA = leader.falsification?.observable;
    const obsB = runner.falsification?.observable;
    if (obsA !== undefined && obsB !== undefined && obsA !== obsB) {
      discriminatingObservations.push({
        betweenHypothesisIds: [leader.id, runner.id],
        observable: `${obsA}；对照 ${obsB}`,
        expects: [
          leader.falsification?.expectedRelation ?? '',
          runner.falsification?.expectedRelation ?? '',
        ],
      });
    }
  }

  const unresolvedCounterCount = counterCandidates.size;
  const searchedNone = counterQueriesAttempted > 0 && unresolvedCounterCount === 0 && counterRelations === 0
    ? { queriesAttempted: counterQueriesAttempted, foundCount: 0 }
    : null;
  const leaderUncertainty = (leader.uncertainties ?? [])[0] ?? null;
  let biggestUnknown: ScientificState['biggestUnknown'] = null;
  if (strongestCounter !== null) {
    biggestUnknown = { kind: 'unresolved_counter', claimId: strongestCounter.claimId, excerpt: strongestCounter.text.slice(0, 200) };
  } else if (leaderUncertainty !== null) {
    biggestUnknown = { kind: 'hyp_uncertainty', text: leaderUncertainty };
  } else if (searchedNone !== null) {
    biggestUnknown = { kind: 'searched_no_counter', queriesAttempted: searchedNone.queriesAttempted };
  }

  const grounding = leaderCard?.dimensions.find((d) => d.dimension === 'evidence_grounding')?.value ?? null;
  const exposure = leaderCard?.dimensions.find((d) => d.dimension === 'counter_evidence_exposure')?.value ?? null;
  const qual = grounding === null
    ? 'low'
    : qualitativeOf(exposure !== null ? Math.min(grounding, (grounding + exposure) / 2) : grounding);

  const falsifiers = active.slice(0, 3)
    .filter((h) => h.falsification?.falsificationCondition !== undefined)
    .map((h) => ({ hypothesisId: h.id, condition: h.falsification!.falsificationCondition! }));

  return ScientificState.parse({
    ...base,
    kind: strongestSupport !== null || supportCandidates.size > 0 ? 'evidence_backed' : 'insufficient',
    leading: { hypothesisId: leader.id, statement: leader.statement, whyItLeads },
    strongestSupport,
    strongestCounter,
    competing,
    discriminatingObservations,
    biggestUnknown,
    confidence: { qualitative: qual, basis: 'ordinal scorecard dimensions — uncalibrated, not probabilities' },
    falsifiers,
    counters: {
      unresolvedCount: unresolvedCounterCount,
      searchedAndFoundNone: searchedNone,
    },
    evidenceShape: shape,
  });
}
