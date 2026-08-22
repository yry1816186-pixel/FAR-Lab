import { z } from 'zod';
import { ClaimId, ExperimentRunId, HypothesisId, PlanId, RunId, SourceDocumentId } from './ids.js';
import { LogLrBand } from './formal.js';

/**
 * BP-3 research-product projection. A PaperOutline is NOT a new source of truth: every
 * section is a deterministic projection of stored run objects (question, sources, claims,
 * relations, hypotheses, scorecards, tournament, evidence bodies, ACH analysis, plan,
 * experiment stat reports). Reference ids must resolve to real store objects — a dangling
 * reference is dropped at build time, never rendered. The outline is not persisted as a
 * store object; the export stage renders it to markdown and persists that as an artifact.
 */

/** Where an abstract point's content comes from (kind-checked id shape per kind). */
export const PaperSourceRef = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hypothesis'), id: HypothesisId }),
  z.object({ kind: z.literal('experiment'), id: ExperimentRunId }),
  z.object({ kind: z.literal('claim'), id: ClaimId }),
]);
export type PaperSourceRef = z.infer<typeof PaperSourceRef>;

/** One deterministic limitation line: category label, human detail citing real counts, and the counts themselves. */
export const PaperLimitation = z.object({
  category: z.string().min(1),
  detail: z.string().min(1),
  counts: z.record(z.string(), z.number().int().nonnegative()),
});
export type PaperLimitation = z.infer<typeof PaperLimitation>;

/** One BibTeX entry generated strictly from stored SourceDocument metadata (no network). */
export const PaperReference = z.object({
  key: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  bibtex: z.string().min(1),
  sourceDocumentId: SourceDocumentId,
});
export type PaperReference = z.infer<typeof PaperReference>;

export const PaperOutline = z.object({
  /** The research question text is the title (the store's own words, never invented). */
  title: z.string().min(1),
  runId: RunId,
  abstractPoints: z.array(z.object({
    text: z.string().min(1),
    sourceRef: PaperSourceRef,
  })).default([]),
  introduction: z.object({
    gapStatement: z.string(),
    /** Top-3 ranked hypotheses (scorecard order; empty when no scorecards are stored). */
    contributions: z.array(z.object({
      hypothesisId: HypothesisId,
      statement: z.string().min(1),
    })).default([]),
  }),
  methods: z.object({
    /** Null when no plan object is stored (honest degradation). */
    planRef: PlanId.nullable(),
    stepsSummary: z.array(z.object({
      stepTitle: z.string().min(1),
      description: z.string(),
    })).default([]),
    preregistration: z.object({
      /** True only when the stored plan carries a formal freeze (frozenAt). */
      frozen: z.boolean(),
      planHash: z.string().optional(),
      multipleTestingPolicy: z.string().optional(),
    }),
  }),
  results: z.array(z.object({
    hypothesisId: HypothesisId,
    statement: z.string().min(1),
    /** Scorecard rank; null when no scorecard exists for this hypothesis. */
    rank: z.number().int().positive().nullable(),
    /** Bradley-Terry strength from the tournament; null when never contested. */
    btScore: z.number().nullable(),
    winRate: z.number().min(0).max(1).nullable(),
    /** log-LR band of the hypothesis evidence body; null when no body is stored. */
    evidenceBand: LogLrBand.nullable(),
    /** Field-by-field projection of persisted StatReports (never invented numbers). */
    experimentVerdicts: z.array(z.object({
      comparison: z.string().min(1),
      metric: z.string().min(1),
      verdict: z.string().nullable(),
      ciLow: z.number(),
      ciHigh: z.number(),
      /** From the persisted experiment spec's comparison; null when the spec is absent. */
      threshold: z.number().nullable(),
    })).default([]),
  })).default([]),
  discussion: z.object({
    /** Deterministic text from ACH analysis presence/fragility (removal sensitivity). */
    orderingInterpretation: z.string(),
    counterEvidenceHighlights: z.array(z.object({
      claimId: ClaimId,
      text: z.string(),
      relation: z.string(),
    })).default([]),
  }),
  conclusion: z.object({
    openFalsificationConditions: z.array(z.object({
      hypothesisId: HypothesisId,
      condition: z.string().min(1),
    })).default([]),
    /** ALL hypothesis uncertainties, verbatim (monotonic — never silently resolved). */
    openUncertainties: z.array(z.object({
      hypothesisId: HypothesisId,
      text: z.string().min(1),
    })).default([]),
  }),
  limitations: z.array(PaperLimitation),
  references: z.array(PaperReference).default([]),
  provenance: z.object({
    generatedAt: z.string().datetime(),
    deterministic: z.literal(true),
    note: z.string().min(1),
  }),
});
export type PaperOutline = z.infer<typeof PaperOutline>;
