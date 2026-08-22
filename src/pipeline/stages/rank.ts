import { z } from 'zod';
import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { callStructured } from '../llm.js';
import { HypothesisComparison, HypothesisScorecard, HypothesisTournament, ScoreDimension, newId, buildAchAnalysis, buildEvidenceBody, countExperimentalAxes } from '../../domain/index.js';
import type { TournamentMatch } from '../../domain/index.js';
import type { HypothesisCandidate } from '../../domain/index.js';
import { assertNotCancelled, isRepresentative, mapBounded, partitionClaimRefs, runClaimIds, STAGE_CONCURRENCY } from './shared.js';
import { canonicalSha256 } from '../../shared/crypto.js';

/** DimensionScore has no exported type alias in the domain — derive it from the scorecard schema type. */
type DimensionScoreT = HypothesisScorecard['dimensions'][number];

/**
 * rank — LLM judges dimensions, DETERMINISTIC code computes the ordering (mission §28).
 *
 * Every score is a decision aid, never an objective probability: each dimension records
 * its producer ("<provider>/<model> structured critique") and calibration
 * 'uncalibrated_llm_judgment'. The composite is computed in fixed, source-commented
 * weights — transparent by construction, identical for every run.
 */

// ---------------------------------------------------------------------------
// FIXED RANKING WEIGHTS (design decision, do not tune per-run / per-model).
// Core dimensions (higher value = better hypothesis support), sum = 1.0:
//   evidence_grounding 0.20  — grounded in verified claims is the first-order virtue
//   falsifiability     0.15  — a real decision rule (mission §29)
//   counter_evidence_exposure 0.15 — hypotheses stress-tested against counter evidence
//   scientific_plausibility 0.15
//   methodological_soundness 0.15
//   testability        0.10
//   novelty            0.10
// resource_cost / risk are NOT core-weighted: they only join when the model states
// their value direction explicitly; each then contributes COST_RISK_WEIGHT and the
// composite is renormalized over included weights. Unclear direction => excluded.
// ---------------------------------------------------------------------------
export const RANK_WEIGHTS: Readonly<Record<string, number>> = {
  evidence_grounding: 0.2,
  falsifiability: 0.15,
  testability: 0.1,
  counter_evidence_exposure: 0.15,
  scientific_plausibility: 0.15,
  novelty: 0.1,
  methodological_soundness: 0.15,
};
/** Weight of one direction-known cost/risk dimension (renormalized away in the denominator). */
export const COST_RISK_WEIGHT = 0.05;
export const COST_RISK_DIMENSIONS = ['resource_cost', 'risk'] as const;
export const MIN_DIMENSIONS_PER_HYPOTHESIS = 8;
export const SCORE_DIMENSIONS = ['scientific_plausibility','evidence_grounding','counter_evidence_exposure','novelty','falsifiability','testability','data_availability','methodological_soundness','expected_information_gain','resource_cost','risk','uncertainty'] as const;
export const COMPARISON_NOTE = 'Scores are inspectable decision aids, not objective probabilities.';

// ---------------------------------------------------------------------------
// model output schema
// ---------------------------------------------------------------------------

const DimOut = z.object({
  dimension: ScoreDimension,
  // Models occasionally emit scores as numeric strings ("0.7") — coerce deterministically.
  value: z.preprocess((v) => {
    if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : v; }
    return v;
  }, z.number().min(0).max(1).nullable()),
  rationale: z.string().min(5),
  evidenceClaimIds: z.array(z.string()).default([]),
  qualitative: z.enum(['low', 'moderate', 'high', 'not_assessed']).optional(),
  /** Required for resource_cost/risk: which direction means "better". Unclear => dimension excluded. */
  direction: z.enum(['higher_value_is_better', 'higher_value_is_worse', 'unclear']).optional(),
});

// Models naturally emit dimensions as a {dimensionName: {...}} object; the canonical
// internal form is an array. Accept both; normalize deterministically.
const DimOutNoKey = DimOut.omit({ dimension: true }).extend({ dimension: ScoreDimension.optional() });
const DimensionsField = z
  .union([
    z.array(DimOut),
    z.record(z.string(), DimOutNoKey).transform((rec) =>
      Object.entries(rec).map(([dimension, rest]) => ({ ...rest, dimension: dimension as z.infer<typeof ScoreDimension> })),
    ),
  ])
  .transform((dims) => dims.filter((d) => SCORE_DIMENSIONS.includes(d.dimension)));
// Dimension-floor enforcement is per-hypothesis at the stage level (see the
// MIN_DIMENSIONS_PER_HYPOTHESIS discard below), NOT here: a schema-level throw would
// reject the whole multi-hypothesis payload and re-ask when ONE hypothesis is
// under-scored — the honest degradation is to discard that assessment with a warning.

const RankOut = z.object({
  assessments: z
    .array(z.object({ hypothesisId: z.string().min(1), dimensions: DimensionsField }))
    .min(1),
});

// ---------------------------------------------------------------------------
// deterministic composite — pure, exported for direct testing
// ---------------------------------------------------------------------------

export interface ScoredDim {
  dimension: string;
  value: number | null;
  direction?: 'higher_value_is_better' | 'higher_value_is_worse' | 'unclear';
}

export interface CompositeResult {
  value: number;
  included: string[];
  excluded: string[];
}

/**
 * Weighted average over VALID dimensions only: null values and direction-unclear
 * cost/risk dimensions are excluded and their weight leaves the denominator.
 * Returns null when nothing scoreable remains.
 */
export const compositeScore = (dims: readonly ScoredDim[]): CompositeResult | null => {
  const byDim = new Map<string, ScoredDim>();
  for (const d of dims) if (!byDim.has(d.dimension)) byDim.set(d.dimension, d); // first occurrence wins
  let numerator = 0;
  let denominator = 0;
  const included: string[] = [];
  const excluded: string[] = [];
  for (const [name, weight] of Object.entries(RANK_WEIGHTS)) {
    const d = byDim.get(name);
    if (d === undefined) {
      excluded.push(`${name}: not scored`);
      continue;
    }
    if (d.value === null) {
      excluded.push(`${name}: value null (not assessable)`);
      continue;
    }
    numerator += weight * d.value; // core dimensions are higher-is-better by definition
    denominator += weight;
    included.push(name);
  }
  for (const name of COST_RISK_DIMENSIONS) {
    const d = byDim.get(name);
    if (d === undefined) continue; // optional dimension, absence is not an exclusion worth reporting
    if (d.value === null) {
      excluded.push(`${name}: value null (not assessable)`);
      continue;
    }
    if (d.direction !== 'higher_value_is_better' && d.direction !== 'higher_value_is_worse') {
      excluded.push(`${name}: direction unclear — excluded from composite`);
      continue;
    }
    const contribution = d.direction === 'higher_value_is_worse' ? 1 - d.value : d.value;
    numerator += COST_RISK_WEIGHT * contribution;
    denominator += COST_RISK_WEIGHT;
    included.push(name);
  }
  if (denominator === 0) return null;
  // Round to 1e-6: float noise below that is not a scientific difference, and exact
  // ties must fall through to the deterministic evidence_grounding tie-break.
  return { value: Math.round((numerator / denominator) * 1e6) / 1e6, included, excluded };
};

// ---------------------------------------------------------------------------
// D-016 pairwise tournament (Robin/FutureHouse mechanism, evidence-anchored).
// Pure deterministic parts exported for direct testing; judging is one LLM call
// per pair returning BOTH order-swapped verdicts (MT-Bench position-bias control).
// ---------------------------------------------------------------------------

/** Each candidate should get ~5 comparisons (Si et al. ICLR 2025 sweet spot), bounded. */
export const TOURNAMENT_ROUNDS_PER_CANDIDATE = 5;
/** Hard ceiling on judged pairs per ranking round (LLM budget guard). */
export const TOURNAMENT_MAX_PAIRS = 24;

export interface ScheduledPair {
  aId: string;
  bId: string;
}

/** Circle-method round-robin for `rounds` rounds over a deterministic seeding order. */
export const circleSchedule = (seedOrder: readonly string[], rounds: number): ScheduledPair[] => {
  const arr = [...seedOrder];
  if (arr.length < 2) return [];
  if (arr.length % 2 === 1) arr.push('__bye__');
  const n = arr.length;
  const pairs: ScheduledPair[] = [];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i]!;
      const b = arr[n - 1 - i]!;
      if (a !== '__bye__' && b !== '__bye__') pairs.push({ aId: a, bId: b });
    }
    arr.splice(1, 0, arr.pop()!); // keep seat 0 fixed, rotate the rest
  }
  return pairs;
};

/** Rounds needed so every participant actually plays (odd n adds a BYE seat). */
export const tournamentRounds = (participants: number): number => {
  const seats = participants + (participants % 2 === 1 ? 1 : 0);
  return Math.min(TOURNAMENT_ROUNDS_PER_CANDIDATE, seats - 1);
};

export interface SwapVerdicts {
  aFirstVerdict: 'a' | 'b' | 'tie' | 'incomparable';
  bFirstVerdict: 'a' | 'b' | 'tie' | 'incomparable';
}

/**
 * Deterministic aggregation of the two order-swapped verdicts:
 * - either 'incomparable' -> no_contest (judge abstention is honored, never coerced);
 * - both 'tie' -> tie; both name the same winner -> that winner;
 * - they disagree (a vs b across the swap) -> tie: position bias or genuine ambiguity,
 *   the pair carries no signal and we do not pretend otherwise.
 */
export const aggregateOutcome = (v: SwapVerdicts): 'a' | 'b' | 'tie' | 'no_contest' => {
  if (v.aFirstVerdict === 'incomparable' || v.bFirstVerdict === 'incomparable') return 'no_contest';
  if (v.aFirstVerdict === 'tie' && v.bFirstVerdict === 'tie') return 'tie';
  if (v.aFirstVerdict === v.bFirstVerdict) return v.aFirstVerdict;
  return 'tie';
};

export interface ContestedMatch {
  aId: string;
  bId: string;
  outcome: 'a' | 'b' | 'tie';
}

export interface BtStanding {
  hypothesisId: string;
  btScore: number;
  wins: number;
  losses: number;
  ties: number;
  contested: number;
}

/**
 * Bradley-Terry via Iterative Luce-Spearmanki Rank (ILSR). Ties count half a win
 * each. Uncontested candidates keep score 1.0-neutral (reported as never contested).
 * Convergence: max relative change < 1e-10 within 200 iterations (always reached
 * at our scale). Pure and deterministic.
 */
export const bradleyTerry = (ids: readonly string[], matches: readonly ContestedMatch[]): BtStanding[] => {
  const idx = new Map(ids.map((id, i) => [id, i] as const));
  const n = ids.length;
  const wins = Array.from({ length: n }, () => new Array<number>(n).fill(0)); // wins[i][j] = points i earned vs j
  const contests = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const m of matches) {
    const i = idx.get(m.aId);
    const j = idx.get(m.bId);
    if (i === undefined || j === undefined) continue;
    contests[i]![j]! += 1;
    contests[j]![i]! += 1;
    if (m.outcome === 'a') { wins[i]![j]! += 1; }
    else if (m.outcome === 'b') { wins[j]![i]! += 1; }
    else { wins[i]![j]! += 0.5; wins[j]![i]! += 0.5; }
  }
  const p = new Array<number>(n).fill(1);
  const totalWins = wins.map((row) => row.reduce((a, b) => a + b, 0));
  for (let iter = 0; iter < 200; iter++) {
    const next = new Array<number>(n).fill(1);
    for (let i = 0; i < n; i++) {
      let denom = 0;
      for (let j = 0; j < n; j++) {
        if (i === j || contests[i]![j]! === 0) continue;
        denom += contests[i]![j]! / (p[i]! + p[j]!);
      }
      next[i] = denom > 0 ? (totalWins[i]! + 1e-9) / denom : 1; // uncontested stays neutral
    }
    const mean = next.reduce((a, b) => a + b, 0) / (n || 1);
    for (let i = 0; i < n; i++) next[i] = next[i]! / (mean || 1);
    let delta = 0;
    for (let i = 0; i < n; i++) delta = Math.max(delta, Math.abs(next[i]! - p[i]!));
    for (let i = 0; i < n; i++) p[i] = next[i]!;
    if (delta < 1e-10) break;
  }
  return ids.map((id, i) => {
    let w = 0, l = 0, t = 0;
    for (let j = 0; j < n; j++) {
      if (j === i || contests[i]![j]! === 0) continue;
      const earned = wins[i]![j]!;
      const c = contests[i]![j]!;
      if (earned === c) w += c;
      else if (earned === 0) l += c;
      else { // mixed (from ties): ties earn exactly 0.5 each
        t += Math.round(earned * 2) === c ? c : Math.min(earned, c - earned) * 2;
      }
    }
    const contested = contests[i]!.reduce((a, b) => a + b, 0);
    return {
      hypothesisId: id,
      btScore: Math.round(p[i]! * 1e6) / 1e6,
      wins: w,
      losses: l,
      ties: t,
      contested,
    };
  });
};

const PairJudgeOut = z.object({
  aFirstVerdict: z.enum(['a', 'b', 'tie', 'incomparable']),
  bFirstVerdict: z.enum(['a', 'b', 'tie', 'incomparable']),
  rationale: z.string().min(10),
});
type PairJudgeOut = z.infer<typeof PairJudgeOut>;

const PAIR_JUDGE_SYSTEM_PROMPT = `You are a rigorous research supervisor comparing exactly two competing scientific hypotheses.
Judge which one is the STRONGER RESEARCH BET on substance only:
- grounding of its assumptions in the cited evidence claims,
- falsifiability: does its decision rule have decidable, quantified thresholds,
- testability and mechanism specificity,
- honest exposure to counter-evidence (known limits, confounders).
IGNORE writing style, verbosity, confidence tone, and elegance of phrasing.
The SAME pair is judged twice below in mirrored presentation order — your verdicts must be about the hypotheses
(hypothesisA / hypothesisB identities), never about which one you saw first.
Answer 'a' or 'b' for the stronger hypothesis in BOTH judgments; 'tie' only when genuinely balanced;
'incomparable' only when they compete on incommensurable axes.
Return ONE JSON object: { "aFirstVerdict": "a"|"b"|"tie"|"incomparable", "bFirstVerdict": (same options), "rationale": "at least 10 chars citing the decisive substantive difference" }.`;

// ---------------------------------------------------------------------------
// stage handler
// ---------------------------------------------------------------------------

export const rankStage: StageHandler = {
  stage: 'rank',

  async applicable(ctx) {
    const reps = ctx.store.listObjects('hypothesis', ctx.run.id).filter(isRepresentative);
    if (reps.length === 0) return false;
    const scored = new Set(ctx.store.listObjects('scorecard', ctx.run.id).map((s) => s.hypothesisId));
    return reps.some((h) => !scored.has(h.id));
  },

  async execute(ctx: StageContext): Promise<StageOutcome> {
    const runId = ctx.run.id;
    const reps = ctx.store.listObjects('hypothesis', runId).filter(isRepresentative);
    if (reps.length === 0) return { kind: 'skipped', reason: 'no representative hypotheses to rank' };
    const scored = new Set(ctx.store.listObjects('scorecard', runId).map((s) => s.hypothesisId));
    const targets = reps.filter((h) => !scored.has(h.id));
    if (targets.length === 0) return { kind: 'skipped', reason: 'all representatives already have scorecards' };

    assertNotCancelled(ctx, 'rank');
    const existingClaimIds = runClaimIds(ctx);
    // Batch the scoring calls: large single outputs (10+ hypotheses) exceed the model's
    // practical JSON output budget and truncate mid-array. 4 per call keeps outputs well
    // inside budget; scores are per-hypothesis independent so batching is semantically safe.
    const BATCH_SIZE = 4;
    const batches: HypothesisCandidate[][] = [];
    for (let i = 0; i < targets.length; i += BATCH_SIZE) batches.push(targets.slice(i, i + BATCH_SIZE));
    const allClaims = ctx.store
      .listObjects('claim', runId)
      .map((c) => ({ id: c.id, text: c.text, bindingStatus: c.bindingStatus }));
    // 'scoring' family inputs fingerprint: hashes the FULL prompt-bearing projection —
    // hypothesis content (not just ids), claims, the batch partition (BATCH_SIZE changes
    // repartition keys) and the scoring system prompt. Any upgrade that changes ANY of
    // these invalidates only this family's cached outputs (no stale replay, audit P1-1).
    const scoringPrompt =
      'Score each hypothesis on at least 8 of the 12 dimensions (0..1, or null when genuinely not assessable). ' +
      'Each rationale must be at least 15 characters and cite real claim ids from the provided list where ' +
      'evidence is used. For resource_cost and risk you MUST state the value direction: ' +
      '"higher_value_is_better" (e.g. you scored low-cost as high) or "higher_value_is_worse" (high value = ' +
      'high cost/risk); use "unclear" only if you cannot commit — the dimension is then excluded. ' +
      'Scores are ordinal decision aids, not probabilities.';
    const hypProjection = (h: HypothesisCandidate) => ({
      id: h.id, statement: h.statement, mechanism: h.mechanism,
      assumptions: h.assumptions.map((a) => a.statement), predictions: h.predictions,
      noveltyLabel: h.noveltyLabel, testability: h.testability,
      falsification: h.falsification ? {
        decisionRule: h.falsification.decisionRule,
        completenessCheck: h.falsification.completenessCheck,
        confounders: h.falsification.confounders,
        alternativeExplanations: h.falsification.alternativeExplanations,
      } : null,
      supportingClaimIds: h.supportingClaimIds, counterClaimIds: h.counterClaimIds,
    });
    const scoringInputs = canonicalSha256({
      batches: batches.map((b) => b.map((h) => h.id)),
      hypotheses: targets.map(hypProjection),
      claims: allClaims,
      systemPrompt: scoringPrompt,
    });
    // Bounded overlap of independent batch calls (WP4); order-preserving collection keeps
    // the merged assessment order (and thus downstream dedup determinism) identical to
    // the sequential loop. Per-batch checkpoint keys unchanged.
    const batchResults = await mapBounded(batches, STAGE_CONCURRENCY, async (batch) => {
      assertNotCancelled(ctx, 'rank');
      // W8 S2: per-batch step checkpoint keyed by the batch's first hypothesis id — a
      // stable domain key, so a mid-stage kill + resume re-runs only unfinished batches.
      return ctx.checkpointed('rank', 'scoring', `score-batch:${batch[0]!.id}`, scoringInputs, () =>
        callStructured<z.infer<typeof RankOut>>(ctx, {
          stage: 'rank',
          purpose: 'hypothesis-ranking:dimension-scores',
          systemPrompt: scoringPrompt,
          payload: {
            hypotheses: batch.map(hypProjection),
            availableClaims: allClaims,
          },
          schema: RankOut,
        }).then((r) => ({ provider: r.provider, modelId: r.modelId, data: r.data })));
    });
    const merged: z.infer<typeof RankOut> = { assessments: batchResults.flatMap((b) => b.data.assessments) };
    const firstProvider = batchResults[0]?.provider ?? 'unknown';
    const firstModel = batchResults[0]?.modelId ?? 'unknown';

    const producer = `${firstProvider}/${firstModel} structured critique`;
    const warnings: string[] = [];
    const claimFilter = (ids: readonly string[], hypId: string): string[] => {
      const p = partitionClaimRefs(ids, existingClaimIds);
      if (p.invalid.length > 0) {
        warnings.push(`${hypId}: dropped ${p.invalid.length} non-existent evidence claim reference(s) (${p.invalid.join(', ')})`);
      }
      return p.valid;
    };

    // ---- map assessments to hypotheses; build scorecard-ready dimensions ----
    interface Ranked {
      hyp: HypothesisCandidate;
      composite: number;
      evidenceGrounding: number | null;
      dimensions: DimensionScoreT[];
      excluded: string[];
    }
    const byId = new Map(targets.map((h) => [h.id, h]));
    const ranked: Ranked[] = [];
    const unknown: string[] = [];
    for (const a of merged.assessments) {
      const hyp = byId.get(a.hypothesisId);
      if (!hyp) {
        unknown.push(a.hypothesisId);
        continue;
      }
      // dedupe dimensions by name (first wins), then enforce the >=8 distinct-dimension floor
      const seen = new Set<string>();
      const dims = a.dimensions.filter((d) => {
        if (seen.has(d.dimension)) return false;
        seen.add(d.dimension);
        return true;
      });
      if (dims.length < MIN_DIMENSIONS_PER_HYPOTHESIS) {
        warnings.push(`${hyp.id}: only ${dims.length} distinct dimensions after dedup — assessment discarded`);
        continue;
      }
      const dimensions: DimensionScoreT[] = dims.map((d) => ({
        dimension: d.dimension,
        value: d.value,
        ...(d.qualitative === undefined ? {} : { qualitative: d.qualitative }),
        rationale: d.rationale,
        evidenceClaimIds: claimFilter(d.evidenceClaimIds, hyp.id) as DimensionScoreT['evidenceClaimIds'],
        producer,
        calibration: 'uncalibrated_llm_judgment',
      }));
      const composite = compositeScore(dims);
      if (composite === null) {
        warnings.push(`${hyp.id}: no valid scored dimensions — assessment discarded`);
        continue;
      }
      ranked.push({
        hyp,
        composite: composite.value,
        evidenceGrounding: dims.find((d) => d.dimension === 'evidence_grounding')?.value ?? null,
        dimensions,
        excluded: composite.excluded,
      });
    }

    if (ranked.length === 0) {
      throw new Error(`rank: no usable assessments produced (warnings: ${warnings.join(' | ') || 'none'})`);
    }

    // ---- seed ordering: composite desc, tie-break evidence_grounding desc, then id ----
    ranked.sort((x, y) => {
      if (y.composite !== x.composite) return y.composite - x.composite;
      const egx = x.evidenceGrounding ?? -1;
      const egy = y.evidenceGrounding ?? -1;
      if (egy !== egx) return egy - egx;
      return x.hyp.id < y.hyp.id ? -1 : 1;
    });

    const n = ranked.length;
    const weightDescription =
      `fixed weights evidence_grounding ${RANK_WEIGHTS.evidence_grounding}, falsifiability ${RANK_WEIGHTS.falsifiability}, ` +
      `testability ${RANK_WEIGHTS.testability}, counter_evidence_exposure ${RANK_WEIGHTS.counter_evidence_exposure}, ` +
      `scientific_plausibility ${RANK_WEIGHTS.scientific_plausibility}, novelty ${RANK_WEIGHTS.novelty}, ` +
      `methodological_soundness ${RANK_WEIGHTS.methodological_soundness}` +
      ` (+cost/risk ${COST_RISK_WEIGHT} each when direction-known, renormalized)`;

    // ---- D-016 pairwise tournament: selection pressure on the composite seed order ----
    let standings: Map<string, BtStanding> | null = null;
    let tournamentMatches: TournamentMatch[] = [];
    let tournamentNote = 'no tournament (fewer than 2 scored hypotheses)';
    let tournamentUncertainty = '';
    let tournamentId: string | null = null;
    const questionText = ctx.store.getObject('question', ctx.run.questionId)?.text ?? undefined;
    if (n >= 2) {
      const participantIds = ranked.map((r) => r.hyp.id);
      const sameSet = (a: readonly string[], b: readonly string[]) =>
        a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');
      const existing = ctx.store
        .listObjects('tournament', runId)
        .find((t) => sameSet(t.participantIds, participantIds));
      if (existing && existing.matches.length > 0) {
        standings = new Map(
          existing.standings.map((s) => [
            s.hypothesisId,
            { hypothesisId: s.hypothesisId, btScore: s.btScore, wins: s.wins, losses: s.losses, ties: s.ties, contested: s.wins + s.losses + s.ties },
          ] as const),
        );
        tournamentMatches = existing.matches;
        tournamentNote = `reused stored tournament (${existing.matches.length} matches)`;
        tournamentUncertainty = existing.uncertainty;
        tournamentId = existing.id;
      } else {
        const rounds = tournamentRounds(participantIds.length);
        const pairs = circleSchedule(participantIds, rounds).slice(0, TOURNAMENT_MAX_PAIRS);
        const claimText = (id: string): string | undefined => allClaims.find((c) => c.id === id)?.text;
        const card = (r: Ranked) => ({
          id: r.hyp.id,
          statement: r.hyp.statement,
          mechanism: r.hyp.mechanism,
          predictions: r.hyp.predictions.slice(0, 3),
          assumptions: r.hyp.assumptions.slice(0, 3).map((a) => a.statement),
          decisionRule: r.hyp.falsification?.decisionRule ?? null,
          noveltyLabel: r.hyp.noveltyLabel,
          testability: r.hyp.testability,
          dimensionScores: r.dimensions
            .filter((d) => d.value !== null)
            .map((d) => ({ dimension: d.dimension, value: d.value })),
          supportingClaims: r.hyp.supportingClaimIds.slice(0, 3).map(claimText).filter((t): t is string => t !== undefined),
          counterClaims: r.hyp.counterClaimIds.slice(0, 3).map(claimText).filter((t): t is string => t !== undefined),
        });
        const byIdRanked = new Map(ranked.map((r) => [r.hyp.id, r] as const));
        const producerJudge = `${firstProvider}/${firstModel} pairwise judge`;
        // Same inputs-fingerprint discipline for pair judging: question + full participant
        // cards + judge prompt (any upgrade to these invalidates cached pair verdicts).
        const pairInputs = canonicalSha256({
          questionText: questionText ?? null,
          cards: ranked.map((r) => card(r)),
          prompt: PAIR_JUDGE_SYSTEM_PROMPT,
        });
        // Bounded overlap of independent pair judgments (WP4); matches collected in pair
        // order so the tournament schedule, BT iteration input order, and all derived
        // notes stay byte-identical to the sequential loop.
        const pairMatches = await mapBounded(pairs, STAGE_CONCURRENCY, async (pair): Promise<TournamentMatch> => {
          assertNotCancelled(ctx, 'rank');
          const ra = byIdRanked.get(pair.aId);
          const rb = byIdRanked.get(pair.bId);
          if (!ra || !rb) {
            return {
              aId: pair.aId,
              bId: pair.bId,
              aFirstVerdict: 'incomparable',
              bFirstVerdict: 'incomparable',
              rationale: 'not judged: participant missing from ranked set',
              producer: producerJudge,
              outcome: 'no_contest',
            };
          }
          let judged: z.infer<typeof PairJudgeOut> | null = null;
          let failure: string | undefined;
          try {
            // W8 S2: per-pair step checkpoint keyed by the domain pair (aId:bId). Only
            // SUCCESSFUL judgments are cached — a pair whose judge call failed stays
            // uncached and gets a fresh attempt on resume (transient failures, not
            // seed-dependent outcomes, so same-seed-same-output holds for fresh runs).
            const cached = await ctx.checkpointed('rank', 'pairs', `pair:${pair.aId}:${pair.bId}`, pairInputs, () =>
              callStructured<z.infer<typeof PairJudgeOut>>(ctx, {
                stage: 'rank',
                purpose: 'hypothesis-ranking:pairwise-tournament',
                systemPrompt: PAIR_JUDGE_SYSTEM_PROMPT,
                payload: {
                  ...(questionText !== undefined ? { questionText } : {}),
                  hypothesisA: card(ra),
                  hypothesisB: card(rb),
                },
                schema: PairJudgeOut,
                temperature: 0.1,
                maxTokens: 1024,
              }).then((r) => ({ data: r.data as z.infer<typeof PairJudgeOut> })));
            judged = cached.data;
          } catch (e) {
            failure = e instanceof Error ? e.message : String(e);
            ctx.log(`rank: tournament judge call failed for ${pair.aId} vs ${pair.bId}: ${failure}`);
          }
          if (judged) {
            return {
              aId: pair.aId,
              bId: pair.bId,
              aFirstVerdict: judged.aFirstVerdict,
              bFirstVerdict: judged.bFirstVerdict,
              rationale: judged.rationale,
              producer: producerJudge,
              outcome: aggregateOutcome(judged),
            };
          }
          // Fail-visible no-contest: a match we could not judge is recorded as such,
          // never silently dropped and never invented.
          return {
            aId: pair.aId,
            bId: pair.bId,
            aFirstVerdict: 'incomparable',
            bFirstVerdict: 'incomparable',
            rationale: `not judged: judge call failed (${failure ?? 'unknown error'}) — recorded honestly as no-contest`,
            producer: producerJudge,
            outcome: 'no_contest',
          };
        });
        tournamentMatches.push(...pairMatches);
        const contested: ContestedMatch[] = tournamentMatches
          .filter((m): m is TournamentMatch & { outcome: 'a' | 'b' | 'tie' } => m.outcome !== 'no_contest')
          .map((m) => ({ aId: m.aId, bId: m.bId, outcome: m.outcome }));
        const bt = bradleyTerry(participantIds, contested);
        standings = new Map(bt.map((s) => [s.hypothesisId, s] as const));
        // Deterministic bias proxy from REAL match data (architecture-critic ADOPT path,
        // 2026-08-22): swap disagreement = both verdicts usable but order flipped them
        // (position bias or genuine ambiguity); ties = both orders said tie.
        const judgedPairs = tournamentMatches.filter((m) => m.aFirstVerdict !== 'incomparable' && m.bFirstVerdict !== 'incomparable');
        const swapDisagreements = judgedPairs.filter((m) => m.aFirstVerdict !== m.bFirstVerdict).length;
        const settledTies = judgedPairs.filter((m) => m.aFirstVerdict === 'tie' && m.bFirstVerdict === 'tie').length;
        tournamentNote =
          `tournament: ${tournamentMatches.length} pair(s) judged (${contested.length} contested, ${tournamentMatches.length - contested.length} no-contest); ` +
          `order-swap disagreement ${swapDisagreements}/${judgedPairs.length}, settled ties ${settledTies}/${judgedPairs.length}`;
        tournamentUncertainty =
          'Pairwise verdicts are uncalibrated LLM judgments with order-swap consistency filtering; ' +
          `this batch: ${swapDisagreements}/${judgedPairs.length} judged pairs disagreed under order swap (position-bias/ambiguity signal) and ` +
          `${settledTies}/${judgedPairs.length} settled as ties. Bradley-Terry scores are ordinal decision aids without confidence intervals. ` +
          'Coarse ordering is credible, near-ties are not — treat adjacent ranks as interchangeable unless head-to-head says otherwise.';
        tournamentId = newId('trn');
      }
    }

    // ---- final ordering: tournament-first (bt desc), composite + grounding as deterministic tie-breaks ----
    const standingsRef = standings;
    if (standingsRef !== null) {
      ranked.sort((x, y) => {
        const bx = standingsRef.get(x.hyp.id)?.btScore ?? 0;
        const by = standingsRef.get(y.hyp.id)?.btScore ?? 0;
        if (by !== bx) return by - bx;
        if (y.composite !== x.composite) return y.composite - x.composite;
        const egx = x.evidenceGrounding ?? -1;
        const egy = y.evidenceGrounding ?? -1;
        if (egy !== egx) return egy - egx;
        return x.hyp.id < y.hyp.id ? -1 : 1;
      });
    }

    // persist the tournament with final ranks (upsert keeps resume idempotent)
    if (tournamentId !== null && n >= 2 && tournamentMatches.length > 0) {
      ctx.store.putObject(
        'tournament',
        HypothesisTournament.parse({
          id: tournamentId,
          runId,
          participantIds: ranked.map((r) => r.hyp.id),
          matches: tournamentMatches,
          standings: ranked.map((r, i) => {
            const s = standingsRef?.get(r.hyp.id);
            const w = s?.wins ?? 0;
            const l = s?.losses ?? 0;
            const t = s?.ties ?? 0;
            const contestedN = s?.contested ?? 0;
            return {
              hypothesisId: r.hyp.id,
              btScore: s?.btScore ?? 1,
              wins: w,
              losses: l,
              ties: t,
              winRate: contestedN > 0 ? Math.round(((w + 0.5 * t) / contestedN) * 1e4) / 1e4 : 0,
              rank: i + 1,
            };
          }),
          algorithm: 'bradley-terry-ilsr-v1',
          uncertainty: tournamentUncertainty,
          createdAt: new Date().toISOString(),
        }),
      );
    }

    ranked.forEach((r, i) => {
      const rank = i + 1;
      const standing = standingsRef?.get(r.hyp.id);
      const tournamentLine = standing
        ? ` Tournament (D-016; pairwise, order-swap consistent, Bradley-Terry ILSR): record ` +
          `${standing.wins}W-${standing.losses}L-${standing.ties}T over ${standing.contested} contested match(es), ` +
          `bt=${standing.btScore.toFixed(4)} — final order is tournament-first with the composite as deterministic tie-break.`
        : '';
      const overallRationale =
        `Composite ${r.composite.toFixed(4)} = weighted average of valid dimensions (${weightDescription}). ` +
        `Deterministic tie-break on evidence_grounding. Excluded dimensions: ${r.excluded.length > 0 ? r.excluded.join('; ') : 'none'}. ` +
        tournamentLine +
        ` All dimension scores are uncalibrated LLM judgments produced by ${producer} — decision support only.`;
      ctx.store.putObject(
        'scorecard',
        HypothesisScorecard.parse({
          id: newId('sc'),
          runId,
          hypothesisId: r.hyp.id,
          dimensions: r.dimensions,
          overallRationale,
          rankedOutOf: n,
          rank,
          comparisonNote: COMPARISON_NOTE,
        }),
      );
    });

    // ---- deterministic top-2 comparison (HypothesisComparison has no objects-table
    // kind in the store; it is persisted as a content-addressed artifact instead) ----
    const artifacts: string[] = [];
    let comparisonNoteDone = 'no comparison (fewer than 2 scored hypotheses)';
    if (n >= 2) {
      const a = ranked[0]!;
      const b = ranked[1]!;
      const valueOf = (r: Ranked, dim: string) => r.dimensions.find((d) => d.dimension === dim)?.value ?? null;
      const shared = a.dimensions
        .map((d) => d.dimension)
        .filter((dim) => b.dimensions.some((d) => d.dimension === dim));
      const criteria: { criterion: string; favors: 'a' | 'b' | 'neither'; rationale: string }[] = shared
        .map((dim) => {
          const va = valueOf(a, dim);
          const vb = valueOf(b, dim);
          if (va === null || vb === null) return null;
          return {
            criterion: dim,
            favors: va > vb ? ('a' as const) : vb > va ? ('b' as const) : ('neither' as const),
            rationale: `${dim}: a=${va} vs b=${vb} (deterministic comparison of uncalibrated dimension scores)`,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
      // head-to-head from the tournament, when the top-2 actually met
      const h2h = tournamentMatches.find(
        (m) => (m.aId === a.hyp.id && m.bId === b.hyp.id) || (m.aId === b.hyp.id && m.bId === a.hyp.id),
      );
      if (h2h) {
        const winnerId = h2h.outcome === 'a' ? h2h.aId : h2h.outcome === 'b' ? h2h.bId : null;
        criteria.push({
          criterion: 'pairwise_tournament_head_to_head',
          favors: winnerId === null ? 'neither' : winnerId === a.hyp.id ? 'a' : 'b',
          rationale:
            `order-swapped judge verdicts (${h2h.aFirstVerdict}/${h2h.bFirstVerdict}) -> ${h2h.outcome}. ${h2h.rationale}`,
        });
      } else if (tournamentMatches.length > 0) {
        criteria.push({
          criterion: 'pairwise_tournament_head_to_head',
          favors: 'neither',
          rationale: 'top-2 did not meet in the tournament schedule; relative order comes from Bradley-Terry standings',
        });
      }
      const tieExact = a.composite === b.composite && a.evidenceGrounding === b.evidenceGrounding;
      const comparison = HypothesisComparison.parse({
        runId,
        aId: a.hyp.id,
        bId: b.hyp.id,
        preferred: tieExact ? 'incomparable' : 'a',
        criteria,
        uncertainty:
          'Dimension scores and pairwise verdicts are uncalibrated LLM judgments; the comparison is a decision aid, not a proof.',
      });
      const stored = await ctx.artifacts.put(JSON.stringify(comparison, null, 2));
      artifacts.push(stored.ref);
      comparisonNoteDone = `top-2 comparison (${a.hyp.id} vs ${b.hyp.id}, preferred=${comparison.preferred}, ${criteria.length} criteria) stored as artifact ${stored.ref}`;
    }

    // Wave-S g8/g9 — deterministic evidence-body ratings (floor certainty, independent
    // sources, Σlog-LR band, QBAF + Carneades standard, g7 orthogonal promotion) and the
    // ACH diagnosticity/removal-sensitivity audit (Heuer steps 4-6). Pure functions over
    // stored relations/claims; no LLM anywhere. Additive analysis: a failure here is
    // logged loudly but must not fail scoring itself.
    try {
      const relations = ctx.store.listObjects('evidence_relation', runId);
      const allClaims = ctx.store.listObjects('claim', runId);
      const feedbackSignals = ctx.store.listObjects('feedback', runId);
      const now = new Date().toISOString();
      for (const r of ranked) {
        const relevant = feedbackSignals.filter((s) => {
          const target = s.target;
          return target === undefined || target.kind !== 'hypothesis' || target.id === r.hyp.id;
        });
        ctx.store.putObject(
          'evidence_body',
          buildEvidenceBody({
            id: newId('evb'),
            runId,
            hypothesisId: r.hyp.id,
            relations,
            claims: allClaims,
            experimentalAxes: countExperimentalAxes(relevant),
            now,
          }),
        );
      }
      ctx.store.putObject(
        'ach_analysis',
        buildAchAnalysis({
          id: newId('ach'),
          runId,
          hypothesisIds: ranked.map((r) => r.hyp.id),
          relations,
          now,
        }),
      );
      ctx.log(`g8/g9: ${ranked.length} evidence body rating(s) + ACH diagnosticity analysis persisted`);
    } catch (e) {
      ctx.log(`g8/g9 evidence-body computation failed (non-fatal, additive analysis only): ${e instanceof Error ? e.message : String(e)}`);
    }

    const unscored = targets.filter((h) => !ranked.some((r) => r.hyp.id === h.id)).map((h) => h.id);
    const parts = [
      `ranked ${n} of ${targets.length} representative hypothesis/hypotheses (rankedOutOf=${n}); ${comparisonNoteDone}.`,
      `weights: ${weightDescription}.`,
    ];
    if (n >= 2) parts.push(tournamentNote);
    if (unknown.length > 0) parts.push(`ignored assessments for unknown hypothesis ids: ${unknown.join(', ')}`);
    if (unscored.length > 0) parts.push(`not scored this round (no usable assessment): ${unscored.join(', ')}`);
    if (warnings.length > 0) parts.push(`warnings: ${warnings.join(' | ')}`);
    return { kind: 'done', summary: parts.join(' '), artifacts };
  },
};
