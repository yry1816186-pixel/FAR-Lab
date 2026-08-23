import { z } from 'zod';
import { newId, ExperimentSpec } from '../domain/index.js';
import { MetaAnalysisSpec } from '../domain/meta.js';
import type { ResearchPlan } from '../domain/plan.js';
import type { ModelProvider } from '../shared/ports.js';
import { strictSchemaOrUndefined } from '../providers/http.js';

/**
 * B8: research-plan -> ExperimentSpec drafting.
 *
 * Division of truth (constitution §7): the MODEL proposes within a CLOSED
 * declarative space (builder ids, an OpenML dataset id, declared columns);
 * DETERMINISTIC code validates (checkExperimentSpec at execution) and, when
 * the plan's data requirements carry no resolvable tabular dataset, the stage
 * SKIPS honestly instead of inventing one. Nothing here fabricates data.
 *
 * Honesty constraints baked into the draft:
 *  - comparisons carry thresholdProvenance: 'model_stipulated' — the plan's
 *    free-text decision rules cannot be verified deterministically, so the
 *    draft NEVER claims evidence-derived thresholds;
 *  - no hypothesisId binding + an explicit exploratoryNote (D-085: binding a
 *    hypothesis requires operator approval the loop cannot grant itself);
 *  - the LLM never sees credentials/URLs; dataset choice is one integer id
 *    resolved (and re-validated) by the deterministic acquisition layer.
 */

export type SpecDraftOutcome =
  | { kind: 'spec'; spec: ExperimentSpec }
  | { kind: 'skip'; reason: string };

/** W-F M4: the literature-type counterpart — a statistical_meta spec draft or a skip. */
export type MetaSpecDraftOutcome =
  | { kind: 'meta'; spec: MetaAnalysisSpec }
  | { kind: 'skip'; reason: string };

const CLASSIFIER_BUILDERS = ['logistic_regression', 'random_forest_classifier', 'gradient_boosting_classifier', 'dummy_most_frequent'] as const;

const DraftOut = z.object({
  /** false = the plan cannot be honored as a tabular ML experiment (honest skip). */
  feasible: z.boolean(),
  skipReason: z.string().min(10).optional(),
  openmlDatasetId: z.number().int().positive().optional(),
  targetColumn: z.string().min(1).optional(),
  /** Models only required when feasible=true (enforced below, not by the array
   *  bound: an infeasible verdict legitimately carries no models). */
  models: z.array(z.object({
    name: z.string().min(1).max(60),
    builderId: z.enum(CLASSIFIER_BUILDERS),
    hyperparams: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  })).max(4).default([]),
}).superRefine((d, ctx) => {
  if (d.feasible && (d.models.length === 0 || d.openmlDatasetId === undefined || d.targetColumn === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'feasible=true requires openmlDatasetId, targetColumn and >=1 model' });
  }
});

/**
 * The sidecar's CLOSED hyperparameter space (experiment-runtime builders.py
 * _ALLOWED_HPARAMS) — mirrored here so the prompt carries the real whitelist
 * and the deterministic pre-filter can reject drift before a sidecar hop.
 */
export const ALLOWED_HPARAMS: Readonly<Record<string, readonly string[]>> = {
  dummy_most_frequent: ['strategy'],
  logistic_regression: ['C', 'max_iter', 'solver'],
  random_forest_classifier: ['n_estimators', 'max_depth', 'min_samples_leaf'],
  gradient_boosting_classifier: ['n_estimators', 'max_depth', 'learning_rate'],
};

const SYSTEM_PROMPT =
  'You convert a research plan into ONE tabular ML experiment spec draft, or declare it infeasible. ' +
  'Feasible ONLY when the plan\'s data requirements plausibly map to a PUBLIC tabular OpenML dataset ' +
  '(classification). If the plan needs wet-lab data, private records, imaging, or text corpora, set ' +
  'feasible=false with a skipReason naming what is missing. Choose an existing OpenML dataset id you ' +
  'are confident exists (classic tabular benchmarks). The targetColumn MUST be that dataset\'s DEFAULT ' +
  'target attribute — the deterministic layer verifies it against the catalog and rejects mismatches ' +
  '(e.g. openml 61 -> Class, openml 1468 -> Class, openml 426 -> oz10). Prefer 2-3 models that differ ' +
  'structurally (e.g. logistic_regression vs random_forest_classifier). hyperparams keys MUST come ' +
  'from the builder\'s whitelist ONLY: logistic_regression: C, max_iter, solver; ' +
  'random_forest_classifier: n_estimators, max_depth, min_samples_leaf; ' +
  'gradient_boosting_classifier: n_estimators, max_depth, learning_rate; ' +
  'dummy_most_frequent: strategy. Any other key is rejected before training. Output JSON only.';

export const draftSpecFromPlan = async (
  plan: ResearchPlan,
  questionText: string,
  provider: ModelProvider,
): Promise<SpecDraftOutcome> => {
  const res = await provider.structuredCall(
    {
      task: 'experiment-spec-draft',
      systemPrompt: SYSTEM_PROMPT,
      userPayload: {
        outputContract: '{feasible: boolean, skipReason?: string, openmlDatasetId?: number, targetColumn?: string, models: [{name, builderId: "logistic_regression"|"random_forest_classifier"|"gradient_boosting_classifier"|"dummy_most_frequent", hyperparams: object}]}',
        input: {
          researchQuestion: questionText,
          objective: plan.objective,
          dataRequirements: plan.dataRequirements.map((d) => ({ name: d.name, availability: d.availability, variables: d.variables })),
          variables: plan.variables,
          metrics: plan.metrics,
          decisionRules: {
            success: plan.decisionRules.successCriterion,
            falsification: plan.decisionRules.falsificationCriterion,
          },
          hypothesisIds: plan.hypothesisIds,
        },
      },
      outputKind: 'json',
      temperature: 0.1,
      maxTokens: 2048,
      jsonSchema: strictSchemaOrUndefined(DraftOut),
      purpose: 'experiment-spec-draft',
    },
    (raw) => {
      const parsed = DraftOut.safeParse(raw);
      return parsed.success ? parsed.data : new Error(`draft schema failed: ${parsed.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).slice(0, 4).join('; ')}`);
    },
  );
  if (!res.ok || res.data === undefined) {
    // Drafting failure is a SKIP-with-reason, not a run failure: experiments
    // ENRICH the loop; their absence must not kill an otherwise complete run.
    return { kind: 'skip', reason: `spec drafting failed (${res.error?.kind ?? 'unknown'}): ${(res.error?.message ?? '').slice(0, 140)}` };
  }
  const draft = res.data;
  if (!draft.feasible || draft.openmlDatasetId === undefined || draft.targetColumn === undefined || draft.models.length === 0) {
    return { kind: 'skip', reason: draft.skipReason ?? 'plan data requirements do not map to a public tabular dataset' };
  }
  // Deterministic pre-filter (live-observed failure class: the model emitted
  // 'min_samples_split', the sidecar whitelist rejects it): drop out-of-space
  // keys BEFORE any resource is spent and disclose the strip in the tags.
  const stripped: string[] = [];
  const models = draft.models.map((m) => {
    const allowed = ALLOWED_HPARAMS[m.builderId] ?? [];
    const hyperparams: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(m.hyperparams)) {
      if (allowed.includes(k)) hyperparams[k] = v;
      else stripped.push(`${m.builderId}.${k}`);
    }
    return { ...m, hyperparams };
  });
  // The plan's free-text decision rule cannot seed a verified numeric threshold:
  // the draft marks every threshold as model-stipulated (auditable, honest).
  const spec = ExperimentSpec.parse({
    id: newId('xsp'),
    runId: plan.runId,
    planId: plan.id,
    // Plan steps carry TaskIds of their own; the draft binds the plan's first
    // analysis step if one exists, else mints a synthetic step reference.
    planStepId: plan.steps[0]?.id ?? newId('task'),
    question: questionText.slice(0, 500),
    datasets: [{
      source: { resolver: 'openml', openmlId: draft.openmlDatasetId },
      targetColumn: draft.targetColumn,
      split: { method: 'random_stratified', ratios: { train: 0.7, val: 0.15, test: 0.15 }, seed: 42 },
    }],
    models: models.map((m, i) => ({
      name: m.name,
      builderId: m.builderId,
      hyperparams: m.hyperparams,
      seed: 42 + i,
      tags: [`plan:${plan.id.slice(0, 10)}`, ...(stripped.length > 0 ? [`hparams-stripped:${stripped.join(',')}`.slice(0, 120)] : [])],
    })),
    metrics: ['accuracy'],
    comparisons: models.length >= 2
      ? [{
          id: `cmp_${plan.id.slice(4, 12)}`,
          metricKey: 'accuracy',
          kind: 'paired_diff',
          modelAIdx: 0,
          modelBIdx: 1,
          direction: 'above',
          threshold: 0,
          thresholdProvenance: 'model-stipulated',
          primary: true,
        }]
      : [{
          id: `cmp_${plan.id.slice(4, 12)}`,
          metricKey: 'accuracy',
          kind: 'absolute',
          modelIdx: 0,
          direction: 'above',
          threshold: 0.5,
          thresholdProvenance: 'model-stipulated',
          primary: true,
        }],
    statistics: {
      test: 'paired_bootstrap_ci',
      alpha: 0.05,
      nBoot: 2000,
      analysisSeed: 42,
      ciLevel: 0.95,
    },
    compute: { device: 'local', maxParallel: 1, timeoutMs: 600_000 },
    // No hypothesis binding + explicit exploratory label (D-085): promoting an
    // exploratory screen to a hypothesis verdict needs operator approval.
    exploratoryNote: `Plan-drafted exploratory screen for ${plan.id}: thresholds are model-stipulated; hypothesis-bound confirmatory specs require operator approval.`,
    approvals: [],
    validation: { passed: false, missing: ['pending deterministic validation at execution'] },
    createdAt: new Date().toISOString(),
  });
  return { kind: 'spec', spec };
};

// ---- W-F M4: literature-type (statistical_meta) drafting ----

const MetaDraftOut = z.object({
  /** false = the plan is not answerable by pooling published effect estimates. */
  feasible: z.boolean(),
  skipReason: z.string().min(10).optional(),
  effectMeasure: z.enum(['log_or', 'log_rr', 'smd']).optional(),
  /** Preregistered rule direction on the analysis scale (usually 'below' 0 for benefit). */
  direction: z.enum(['above', 'below']).optional(),
  inclusionCriteria: z.string().min(10).optional(),
}).superRefine((d, ctx) => {
  if (d.feasible && (d.effectMeasure === undefined || d.direction === undefined || d.inclusionCriteria === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'feasible=true requires effectMeasure, direction and inclusionCriteria' });
  }
});

const META_SYSTEM_PROMPT =
  'You convert a research plan into ONE statistical meta-analysis spec draft, or declare it infeasible. ' +
  'Feasible ONLY when the question is answerable by pooling PUBLISHED effect estimates from the literature ' +
  '(intervention vs outcome with reported odds ratios, risk ratios, or standardized mean differences). ' +
  'If the plan requires collecting new data, running models on tabular datasets, wet-lab work, or no contrast ' +
  'of exposure vs outcome exists in the literature, set feasible=false with a skipReason naming what is missing. ' +
  'direction states which side of the log-scale null (0) the hypothesis predicts: e.g. a PROTECTIVE effect of an ' +
  'intervention is "below" (log OR < 0). inclusionCriteria names study designs/populations to include. Output JSON only.';

/** Preregistered default floor: fewer admissible studies => INSUFFICIENT_DATA (disclosed, not tuned per run). */
export const META_DEFAULT_MIN_STUDIES = 3;

export const draftMetaSpecFromPlan = async (
  plan: ResearchPlan,
  questionText: string,
  provider: ModelProvider,
): Promise<MetaSpecDraftOutcome> => {
  const res = await provider.structuredCall(
    {
      task: 'meta-spec-draft',
      systemPrompt: META_SYSTEM_PROMPT,
      userPayload: {
        outputContract: '{feasible: boolean, skipReason?: string, effectMeasure?: "log_or"|"log_rr"|"smd", direction?: "above"|"below", inclusionCriteria?: string}',
        input: {
          researchQuestion: questionText,
          objective: plan.objective,
          variables: plan.variables,
          dataRequirements: plan.dataRequirements.map((d) => ({ name: d.name, availability: d.availability, variables: d.variables })),
          decisionRules: { success: plan.decisionRules.successCriterion, falsification: plan.decisionRules.falsificationCriterion },
          hypothesisIds: plan.hypothesisIds,
        },
      },
      outputKind: 'json',
      temperature: 0.1,
      maxTokens: 1024,
      jsonSchema: strictSchemaOrUndefined(MetaDraftOut),
      purpose: 'meta-spec-draft',
    },
    (raw) => {
      const parsed = MetaDraftOut.safeParse(raw);
      return parsed.success ? parsed.data : new Error(`meta draft schema failed: ${parsed.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).slice(0, 4).join('; ')}`);
    },
  );
  if (!res.ok || res.data === undefined) {
    return { kind: 'skip', reason: `meta spec drafting failed (${res.error?.kind ?? 'unknown'}): ${(res.error?.message ?? '').slice(0, 140)}` };
  }
  const draft = res.data;
  if (!draft.feasible || draft.effectMeasure === undefined || draft.direction === undefined || draft.inclusionCriteria === undefined) {
    return { kind: 'skip', reason: draft.skipReason ?? 'plan is not answerable by pooling published effect estimates' };
  }
  // Deterministic discipline (the model never picks these): log-scale null boundary
  // threshold with the strongest provenance, preregistered minStudies floor, and the
  // DL random-effects model as primary (medical literature heterogeneity is the norm;
  // FE runs as sensitivity inside the executor). Exploratory until an operator binds.
  const spec = MetaAnalysisSpec.parse({
    id: newId('xsp'),
    runId: plan.runId,
    planId: plan.id,
    planStepId: plan.steps[0]?.id ?? newId('task'),
    question: questionText.slice(0, 500),
    experimentType: 'statistical_meta',
    inclusionCriteria: draft.inclusionCriteria,
    effectMeasure: draft.effectMeasure,
    metaModel: 'random_dl',
    minStudies: META_DEFAULT_MIN_STUDIES,
    alpha: 0.05,
    ciLevel: 0.95,
    comparison: {
      id: `cmp_meta_${plan.id.slice(4, 12)}`,
      effectMeasure: draft.effectMeasure,
      direction: draft.direction,
      threshold: 0,
      thresholdProvenance: 'null-boundary',
      primary: true,
    },
    approvals: [],
    exploratoryNote: `Plan-drafted exploratory literature pool for ${plan.id}: thresholds are the log-scale null boundary; hypothesis-bound confirmatory meta specs require operator approval.`,
    validation: { passed: false, missing: ['pending deterministic validation at execution'] },
    createdAt: new Date().toISOString(),
  });
  return { kind: 'meta', spec };
};
