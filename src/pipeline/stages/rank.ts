import { z } from 'zod';
import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { callStructured } from '../llm.js';
import { HypothesisComparison, HypothesisScorecard, ScoreDimension, newId } from '../../domain/index.js';
import type { HypothesisCandidate } from '../../domain/index.js';
import { assertNotCancelled, isRepresentative, partitionClaimRefs, runClaimIds } from './shared.js';

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
  .transform((dims) => {
    const valid = dims.filter((d) => SCORE_DIMENSIONS.includes(d.dimension));
    return valid.length >= MIN_DIMENSIONS_PER_HYPOTHESIS ? valid : valid;
  });

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
    const res = await callStructured<z.infer<typeof RankOut>>(ctx, {
      stage: 'rank',
      purpose: 'hypothesis-ranking:dimension-scores',
      systemPrompt:
        'Score each hypothesis on at least 8 of the 12 dimensions (0..1, or null when genuinely not assessable). ' +
        'Each rationale must be at least 15 characters and cite real claim ids from the provided list where ' +
        'evidence is used. For resource_cost and risk you MUST state the value direction: ' +
        '"higher_value_is_better" (e.g. you scored low-cost as high) or "higher_value_is_worse" (high value = ' +
        'high cost/risk); use "unclear" only if you cannot commit — the dimension is then excluded. ' +
        'Scores are ordinal decision aids, not probabilities.',
      payload: {
        hypotheses: targets.map((h) => ({
          id: h.id,
          statement: h.statement,
          mechanism: h.mechanism,
          assumptions: h.assumptions.map((a) => a.statement),
          predictions: h.predictions,
          noveltyLabel: h.noveltyLabel,
          testability: h.testability,
          falsification: h.falsification
            ? {
                decisionRule: h.falsification.decisionRule,
                completenessCheck: h.falsification.completenessCheck,
                confounders: h.falsification.confounders,
                alternativeExplanations: h.falsification.alternativeExplanations,
              }
            : null,
          supportingClaimIds: h.supportingClaimIds,
          counterClaimIds: h.counterClaimIds,
        })),
        availableClaims: ctx.store
          .listObjects('claim', runId)
          .map((c) => ({ id: c.id, text: c.text, bindingStatus: c.bindingStatus })),
      },
      schema: RankOut,
    });

    const producer = `${res.provider}/${res.modelId} structured critique`;
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
    for (const a of res.data.assessments) {
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

    // ---- deterministic ordering: composite desc, tie-break evidence_grounding desc, then id ----
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

    ranked.forEach((r, i) => {
      const rank = i + 1;
      const overallRationale =
        `Composite ${r.composite.toFixed(4)} = weighted average of valid dimensions (${weightDescription}). ` +
        `Deterministic tie-break on evidence_grounding. Excluded dimensions: ${r.excluded.length > 0 ? r.excluded.join('; ') : 'none'}. ` +
        `All dimension scores are uncalibrated LLM judgments produced by ${producer} — decision support only.`;
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
      const criteria = shared
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
      const tieExact = a.composite === b.composite && a.evidenceGrounding === b.evidenceGrounding;
      const comparison = HypothesisComparison.parse({
        runId,
        aId: a.hyp.id,
        bId: b.hyp.id,
        preferred: tieExact ? 'incomparable' : 'a',
        criteria,
        uncertainty: 'Dimension scores are uncalibrated LLM judgments; the comparison is a decision aid, not a proof.',
      });
      const stored = await ctx.artifacts.put(JSON.stringify(comparison, null, 2));
      artifacts.push(stored.ref);
      comparisonNoteDone = `top-2 comparison (${a.hyp.id} vs ${b.hyp.id}, preferred=${comparison.preferred}, ${criteria.length} criteria) stored as artifact ${stored.ref}`;
    }

    const unscored = targets.filter((h) => !ranked.some((r) => r.hyp.id === h.id)).map((h) => h.id);
    const parts = [
      `ranked ${n} of ${targets.length} representative hypothesis/hypotheses (rankedOutOf=${n}); ${comparisonNoteDone}.`,
      `weights: ${weightDescription}.`,
    ];
    if (unknown.length > 0) parts.push(`ignored assessments for unknown hypothesis ids: ${unknown.join(', ')}`);
    if (unscored.length > 0) parts.push(`not scored this round (no usable assessment): ${unscored.join(', ')}`);
    if (warnings.length > 0) parts.push(`warnings: ${warnings.join(' | ')}`);
    return { kind: 'done', summary: parts.join(' '), artifacts };
  },
};
