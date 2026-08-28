import { z } from 'zod';
import { ClaimId, HypothesisId, RunId } from './ids.js';
import type { ScientificClaim } from './claim.js';
import { EvidenceStrength, type EvidenceRelation } from './evidence.js';
import type { HypothesisCandidate } from './hypothesis.js';
import type { HypothesisScorecard, ScoreDimension, HypothesisTournament } from './scorecard.js';
import type { EvidenceBody } from './evidence-body.js';

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
    /**
     * Weakest-link uncertainty propagation (2026-08-28 algorithm hardening):
     * every factor considered, with its observed value and its grade — the
     * ordinal level is the MIN over factors, never an average that hides the
     * weakest input. Ordinal only: not calibrated probabilities.
     */
    factors: z.array(z.string().min(1)).default([]),
  }),
  /** Counter-evidence search coverage (symmetry guard): what was searched, what was found. */
  counterEvidenceCoverage: z.object({
    queriesAttempted: z.number().int().nonnegative(),
    counterRelationsFound: z.number().int().nonnegative(),
  }).nullable(),
  /** How the current ordering was produced and how stable it is (internal consistency signal). */
  ordering: z.object({
    basis: z.enum(['tournament', 'composite', 'single_candidate']),
    /** Kendall τ between composite rank order and tournament rank order; null when not computable (no tournament / <3 common). */
    agreement: z.number().min(-1).max(1).nullable(),
    /** Top-2 Bradley-Terry bootstrap CI separation. */
    topSeparation: z.enum(['disjoint', 'overlap', 'unknown']),
    /** Composite weight-vector sensitivity (from the tournament record; null when absent). */
    weightStability: z.object({
      medianTau: z.number().min(-1).max(1),
      worstTau: z.number().min(-1).max(1),
      top1StableRate: z.number().min(0).max(1),
    }).nullable(),
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

const differsByOf = (h: HypothesisCandidate, leader: HypothesisCandidate): string | null => {
  if (h.distinctnessRationale !== undefined && h.distinctnessRationale.trim().length > 0) return h.distinctnessRationale;
  const obsA = leader.falsification?.observable;
  const obsB = h.falsification?.observable;
  if (obsA !== undefined && obsB !== undefined && obsA !== obsB) return `${obsA} vs ${obsB}`;
  if (h.mechanism !== undefined && h.mechanism.length > 0 && h.mechanism !== leader.mechanism) return h.mechanism;
  return null;
};

// ---------------------------------------------------------------------------
// Uncertainty propagation (weakest-link). Every factor maps observed evidence
// to an ordinal grade with a disclosed rule; the final level is the MIN over
// factors. Replaces the pre-2026-08-28 ad hoc 0.34/0.67 single-value mapping,
// which collapsed log-LR interval width, source count, rank separation and
// counter coverage into one number and hid the weakest input.
// ---------------------------------------------------------------------------

type Grade = 'low' | 'moderate' | 'high';
const CONFIDENCE_ORDER: Record<Grade, number> = { low: 0, moderate: 1, high: 2 };

/** Log-LR interval width (log10): ≤0.5 narrow, ≤1.5 moderate, wider is low. */
const gradeIntervalWidth = (width: number): Grade =>
  width <= 0.5 ? 'high' : width <= 1.5 ? 'moderate' : 'low';

/** Independent contributing sources: ≥3 broad base, 2 narrow, ≤1 single-source. */
const gradeIndependentSources = (n: number): Grade =>
  n >= 3 ? 'high' : n === 2 ? 'moderate' : 'low';

/** Deterministic evidence-grounding dimension (the overridden, non-LLM score). */
const gradeGrounding = (value: number | null): Grade => {
  if (value === null) return 'moderate';
  return value >= 0.67 ? 'high' : value >= 0.34 ? 'moderate' : 'low';
};

/** Top-2 BT bootstrap CI overlap ratio (overlap / narrower CI width; 0 = disjoint). */
const top2OverlapRatio = (
  top: { ciLow?: number; ciHigh?: number } | undefined,
  runner: { ciLow?: number; ciHigh?: number } | undefined,
): number | null => {
  if (top?.ciLow === undefined || top.ciHigh === undefined || runner?.ciLow === undefined || runner.ciHigh === undefined) return null;
  const overlap = Math.min(top.ciHigh, runner.ciHigh) - Math.max(top.ciLow, runner.ciLow);
  if (overlap <= 0) return 0;
  const narrower = Math.min(top.ciHigh - top.ciLow, runner.ciHigh - runner.ciLow);
  return narrower > 0 ? Math.min(1, overlap / narrower) : 1;
};

/** Kendall τ between two complete rank orders over the same id set. */
const kendallTau = (ids: string[], rankA: Map<string, number>, rankB: Map<string, number>): number | null => {
  if (ids.length < 3) return null;
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const da = (rankA.get(ids[i]!) ?? 0) - (rankA.get(ids[j]!) ?? 0);
      const db = (rankB.get(ids[i]!) ?? 0) - (rankB.get(ids[j]!) ?? 0);
      if (da === 0 || db === 0) continue;
      if (Math.sign(da) === Math.sign(db)) concordant += 1;
      else discordant += 1;
    }
  }
  const pairs = concordant + discordant;
  return pairs === 0 ? null : (concordant - discordant) / pairs;
};

interface ConfidenceInputs {
  body: EvidenceBody | null;
  grounding: number | null;
  strongestCounterStrength: EvidenceStrength | null;
  counterQueriesAttempted: number;
  topOverlap: number | null;
}

const deriveConfidence = (c: ConfidenceInputs): { qualitative: Grade; factors: string[] } => {
  const factors: Array<{ text: string; grade: Grade }> = [];
  if (c.body !== null) {
    const width = Math.abs(c.body.sumLogLrHigh - c.body.sumLogLrLow);
    factors.push({ text: `证据区间宽度 ${width.toFixed(2)} log10-LR（≤0.5 窄 / ≤1.5 中 / 更宽 低）`, grade: gradeIntervalWidth(width) });
    factors.push({ text: `独立证据来源 ${c.body.independentSources} 个（≥3 广 / 2 窄 / ≤1 单源）`, grade: gradeIndependentSources(c.body.independentSources) });
  } else {
    factors.push({ text: '无确定性证据体（log-LR/QBAF 未汇总）', grade: 'moderate' });
  }
  factors.push({ text: `确定性证据落地评分 ${c.grounding !== null ? c.grounding.toFixed(2) : '未评'}（≥0.67 高 / ≥0.34 中）`, grade: gradeGrounding(c.grounding) });
  if (c.strongestCounterStrength !== null) {
    const strong = c.strongestCounterStrength === 'strong';
    factors.push({
      text: `存在未消解反证（强度 ${c.strongestCounterStrength}）`,
      grade: strong ? 'low' : 'moderate',
    });
  } else if (c.counterQueriesAttempted > 0) {
    factors.push({ text: `已做 ${c.counterQueriesAttempted} 次反证检索、未发现可绑定反证`, grade: 'high' });
  } else {
    factors.push({ text: '未记录反证检索——领先解释未经对抗性检验', grade: 'moderate' });
  }
  if (c.topOverlap !== null) {
    const grade: Grade = c.topOverlap <= 0.25 ? 'high' : c.topOverlap <= 0.75 ? 'moderate' : 'low';
    factors.push({ text: `前两名排序的 bootstrap 置信区间重叠 ${(c.topOverlap * 100).toFixed(0)}%（≤25% 稳 / ≤75% 中 / 更高 低）`, grade });
  } else {
    factors.push({ text: '无前两名置信区间数据——排序稳定性未知', grade: 'moderate' });
  }
  let weakest: Grade = 'high';
  for (const f of factors) if (CONFIDENCE_ORDER[f.grade] < CONFIDENCE_ORDER[weakest]) weakest = f.grade;
  return {
    qualitative: weakest,
    factors: [...factors.map((f) => `${f.text} → ${f.grade}`), '序数结论（最弱环节传播），非校准概率'],
  };
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
  /** Deterministic per-hypothesis evidence bodies (kind 'evidence_body'). */
  evidenceBodies: EvidenceBody[];
  /** Latest pairwise tournament (kind 'tournament'), null when none was produced. */
  tournament: HypothesisTournament | null;
  /** Count of purpose='counter_evidence' queries in the run's latest corpus snapshot. */
  counterQueriesAttempted: number;
}): ScientificState {
  const {
    runId, runStatus, questionDomain, claims, relations, hypotheses, scorecards,
    evidenceBodies, tournament, counterQueriesAttempted,
  } = input;
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

  // ---- Counter-evidence coverage (symmetry guard) + ordering consistency ----
  const coverage = { queriesAttempted: counterQueriesAttempted, counterRelationsFound: counterRelations };
  const compositeRanks = new Map(scorecards.map((s) => [s.hypothesisId as string, s.rank] as const));
  const tournamentRanks = new Map(
    (tournament?.standings ?? []).map((s) => [s.hypothesisId as string, s.rank] as const),
  );
  const commonRanked = [...tournamentRanks.keys()].filter((id) => compositeRanks.has(id));
  const agreement = kendallTau(commonRanked, compositeRanks, tournamentRanks);
  const standingsByRank = (tournament?.standings ?? []).slice().sort((a, b) => a.rank - b.rank);
  const topOverlap = top2OverlapRatio(standingsByRank[0], standingsByRank[1]);
  const ordering = {
    basis: active.length < 2
      ? ('single_candidate' as const)
      : tournament !== null && standingsByRank.length > 0 ? ('tournament' as const) : ('composite' as const),
    agreement,
    topSeparation: topOverlap === null ? ('unknown' as const) : topOverlap === 0 ? ('disjoint' as const) : ('overlap' as const),
    weightStability: tournament?.weightSensitivity !== undefined
      ? {
        medianTau: tournament.weightSensitivity.medianTau,
        worstTau: tournament.weightSensitivity.worstTau,
        top1StableRate: tournament.weightSensitivity.top1StableRate,
      }
      : null,
  };

  const base = { runId, computedAt: new Date().toISOString(), templateEvidence: templateMarkers };
  if (!settled) {
    return ScientificState.parse({
      ...base, kind: 'forming', leading: null, strongestSupport: null, strongestCounter: null,
      competing: [], discriminatingObservations: [], biggestUnknown: null,
      confidence: { qualitative: 'low', factors: ['研究进行中——判断尚未冻结', '序数结论，非校准概率'] },
      counterEvidenceCoverage: coverage, ordering,
      falsifiers: [], counters: { unresolvedCount: 0, searchedAndFoundNone: null }, evidenceShape: shape,
    });
  }
  if (templateMarkers.length > 0) {
    // Refuse template synthesis: no leading explanation over filler, ever.
    return ScientificState.parse({
      ...base, kind: 'template', leading: null, strongestSupport: null, strongestCounter: null,
      competing: [], discriminatingObservations: [],
      biggestUnknown: { kind: 'template_content' },
      confidence: { qualitative: 'low', factors: ['模板产物不承载证据——不构成任何置信基础', '序数结论，非校准概率'] },
      counterEvidenceCoverage: coverage, ordering,
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
      confidence: { qualitative: 'low', factors: ['无活跃假设——无可赋信对象', '序数结论，非校准概率'] },
      counterEvidenceCoverage: coverage, ordering,
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
  const confidence = deriveConfidence({
    body: evidenceBodies.find((b) => b.hypothesisId === leader.id) ?? null,
    grounding,
    strongestCounterStrength: strongestCounter?.strength ?? null,
    counterQueriesAttempted,
    topOverlap,
  });

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
    confidence,
    counterEvidenceCoverage: coverage,
    ordering,
    falsifiers,
    counters: {
      unresolvedCount: unresolvedCounterCount,
      searchedAndFoundNone: searchedNone,
    },
    evidenceShape: shape,
  });
}
