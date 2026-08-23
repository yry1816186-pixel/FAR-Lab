import { z } from 'zod';
import { ClaimId, HypothesisId, RunId } from './ids.js';

/** Generation strategies actually exercised (mission §26) — measured, not decorative. */
export const GenerationStrategy = z.enum([
  'evidence_conditioned', 'contradiction_driven', 'mechanism_driven',
  'analogy_driven', 'boundary_condition', 'assumption_perturbation',
  'counterfactual', 'multi_model',
]);
export type GenerationStrategy = z.infer<typeof GenerationStrategy>;

export const NoveltyLabel = z.enum(['evidence_grounded', 'novel_speculation', 'mixed']);
export type NoveltyLabel = z.infer<typeof NoveltyLabel>;

export const Assumption = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  /** Is this assumption backed by retrieved evidence or is it a premise? */
  kind: z.enum(['empirical', 'theoretical', 'methodological', 'stipulated']),
  backingClaimIds: z.array(ClaimId).default([]),
  uncertainty: z.string().optional(),
});
export type Assumption = z.infer<typeof Assumption>;

/**
 * W5/S3 — where the quantitative thresholds of a decision rule come from
 * (model self-assessment, disclosed in the report). Optional: specs persisted
 * before W5 have no provenance and render as「来源未声明」.
 * 'mixed' (2026-08-22 live incident run_wkncq5pvs): some thresholds have a real
 * source while others are stipulated — a truthful state the 3-value enum rejected.
 */
export const DecisionRuleProvenance = z.enum(['evidence-derived', 'community-standard', 'model-stipulated', 'mixed', 'null-boundary']);
export type DecisionRuleProvenance = z.infer<typeof DecisionRuleProvenance>;

/** Mission §29 — a real falsification spec, not "could be tested in the future". */
export const FalsificationSpec = z.object({
  observable: z.string().min(1),
  measurement: z.string().min(1),
  /** Expected relation + decision threshold; qualitative decision rules are legitimate. */
  expectedRelation: z.string().min(1),
  decisionRule: z.string().min(1),
  /** Self-assessed source of the decision rule's thresholds (W5/S3; backward-compatible optional). */
  decisionRuleProvenance: DecisionRuleProvenance.optional(),
  supportCondition: z.string().min(1),
  weakeningCondition: z.string().min(1),
  falsificationCondition: z.string().min(1),
  confounders: z.array(z.string()).default([]),
  alternativeExplanations: z.array(z.string()).default([]),
  dataRequirements: z.array(z.string()).default([]),
  method: z.string().min(1),
  failureInterpretation: z.string().min(1),
  /** Deterministic check result: are the required semantics actually present? */
  completenessCheck: z.object({
    passed: z.boolean(),
    missing: z.array(z.string()).default([]),
  }).optional(),
});
export type FalsificationSpec = z.infer<typeof FalsificationSpec>;

export const TestabilityStatus = z.enum(['testable_now', 'testable_with_data', 'untestable_currently', 'unfalsifiable']);
export type TestabilityStatus = z.infer<typeof TestabilityStatus>;

/**
 * B5 researcher-driven lifecycle triage (R3): 'promoted' = advanced into the
 * active research line; 'rejected' = ruled out by the researcher. The field is
 * triage bookkeeping only — the scientific reason lives in the feedback/
 * revision chain and the event stream, never here. ADDITIVE with .default:
 * hypotheses persisted before B5 parse as 'active' (store reads re-validate).
 */
export const HypothesisStatus = z.enum(['active', 'promoted', 'rejected']);
export type HypothesisStatus = z.infer<typeof HypothesisStatus>;

/**
 * D-017 — literature-grounded novelty layer. The corpus-relative noveltyLabel stays;
 * this SECOND layer judges each representative against neighbors actually retrieved
 * from the live literature (facet-reranked), with 'unclear' as the honest default.
 * RQ-Bench forbids pure LLM novelty scores — neighbors are mandatory grounding.
 */
export const LiteratureNoveltyNeighbor = z.object({
  title: z.string().min(1),
  year: z.number().int().optional(),
  doi: z.string().optional(),
  openalexId: z.string().optional(),
  venue: z.string().optional(),
  /** sha256 over the neighbor's normalized source record — auditable against OpenAlex. */
  contentHash: z.string().length(64),
  /** Which expansion query surfaced this neighbor. */
  query: z.string().min(1),
});
export type LiteratureNoveltyNeighbor = z.infer<typeof LiteratureNoveltyNeighbor>;

export const LiteratureNovelty = z.object({
  verdict: z.enum(['novel', 'incremental', 'already_done', 'unclear']),
  /** Facet-reranked nearest neighbors the verdict was judged against (empty when none retrieved). */
  neighbors: z.array(LiteratureNoveltyNeighbor).default([]),
  justification: z.string().min(10),
  producer: z.string().min(1),
  calibration: z.literal('uncalibrated_llm_judgment'),
  assessedAt: z.string().datetime(),
});
export type LiteratureNovelty = z.infer<typeof LiteratureNovelty>;

export const HypothesisCandidate = z.object({
  id: HypothesisId,
  runId: RunId,
  version: z.number().int().nonnegative().default(0), // bumped on causal revision
  status: HypothesisStatus.default('active'), // B5 triage; default keeps old objects parsing
  statement: z.string().min(1),
  mechanism: z.string().default(''),
  derivation: z.object({
    strategy: GenerationStrategy,
    rationale: z.string().min(1),
    inputClaimIds: z.array(ClaimId).default([]),
    modelRef: z.string().optional(),
  }),
  assumptions: z.array(Assumption).default([]),
  predictions: z.array(z.string()).default([]),
  supportingClaimIds: z.array(ClaimId).default([]),
  counterClaimIds: z.array(ClaimId).default([]),
  uncertainties: z.array(z.string()).default([]),
  noveltyLabel: NoveltyLabel.default('mixed'),
  /** D-017 second novelty layer: judged against retrieved literature neighbors. */
  literatureNovelty: LiteratureNovelty.optional(),
  testability: TestabilityStatus.default('testable_with_data'),
  falsification: FalsificationSpec.optional(),
  /** Cluster of paraphrase-equivalent candidates; one representative survives ranking. */
  clusterKey: z.string().optional(),
  distinctnessRationale: z.string().optional(), // how it differs in mechanism/assumptions/predictions
  /**
   * W-C bilingual display layer (user-approved hybrid): Simplified-Chinese rendering of
   * the statement/mechanism, produced at generation time (one batched call, temperature 0)
   * so zh reading is offline-stable. Optional + absent-tolerant: translation failure
   * never blocks the run. English stays authoritative for all evidence logic.
   */
  statementZh: z.string().optional(),
  mechanismZh: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type HypothesisCandidate = z.infer<typeof HypothesisCandidate>;

/**
 * SWAN interchange serialization (W-G follow-up; W3C SWAN 1.2 discourse elements,
 * https://www.w3.org/TR/hcls-swan/ — stable public standard). Emits each hypothesis as
 * a swande:ResearchStatement qualified as a hypothesis, for external semantic-web
 * consumers of the reproducibility bundle. Only SWAN terms documented in the TR are
 * used; the internal schema above stays authoritative.
 */
export const toSwanJsonLd = (hyp: HypothesisCandidate): Record<string, unknown> => ({
  '@context': {
    swande: 'http://purl.org/swan/1.2/discourse-elements/',
    swanco: 'http://purl.org/swan/1.2/discourse-relations/',
    pav: 'http://purl.org/pav/',
  },
  '@type': 'swande:ResearchStatement',
  '@id': `urn:farlab:${hyp.id}`,
  'swanco:researchStatementQualifiedAs': { '@id': 'http://purl.org/swan/1.2/discourse-relations/hypothesis' },
  statement: hyp.statement,
  mechanism: hyp.mechanism,
  'pav:version': hyp.version,
  createdAt: hyp.createdAt,
});
