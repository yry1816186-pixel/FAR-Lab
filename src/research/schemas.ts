/**
 * research/schemas — canonical zod schemas for the Track-1A research domain
 * (directive §7: one canonical schema per core object, runtime-validated).
 *
 * SSOT discipline: every persisted/deserialized research object must pass
 * through these schemas. CLI (`far research inspect/verify/feedback/…`) and the
 * REST API deserialize ResearchRun JSON at the boundary; a bare
 * `JSON.parse(raw) as ResearchRun` would let malformed or tampered files flow
 * into the deterministic verifier. These schemas replace those assertions with
 * fail-closed validation (zero-tolerance #1: no unchecked `as` on boundaries).
 *
 * Compatibility policy (directive §7): ResearchRun is schema-versioned.
 * schemaVersion 2 runs (no citationGate/falsifiabilityGate — the fields were
 * introduced in v3) parse successfully; the missing gates are RECOMPUTED
 * deterministically from the frozen bindings/hypotheses so a v2 file behaves
 * exactly like a v3 file. Unknown future versions are rejected (fail-closed:
 * never guess the shape of a newer schema).
 *
 * The model-output schemas (FalsificationMethodZod / CandidateZod /
 * GenerationZod / PlanBodyZod) also live here so hypothesis_generation and
 * research_plan share one definition instead of duplicating them.
 */

import { z } from 'zod';
import { STRATEGY_IDS } from '../discovery/types.ts';
import { buildEvidenceRelations, computeCitationGateReport } from './citation_gate.ts';
import { computeFalsifiabilityGateReport } from './falsifiability_gate.ts';
import type { CitationBinding, ResearchRun } from './types.ts';

// ── Model-output schemas (shared with the generation modules) ───────────────

/**
 * zod schema for the shared falsification method (mirrors agent_loop type).
 *
 * Threshold coherence is enforced HERE (not only in the falsifiability gate):
 * `gt`/`lt` require a finite `value` (a live model emitting only lower/upper
 * for them is rejected at generation time and repaired on retry — 2026-08-14
 * live-run defect: every live hypothesis failed the gate on this mismatch);
 * `range` requires finite `lower` < `upper`.
 */
export const FalsificationMethodZod = z
  .object({
    prediction: z.string(),
    metric: z.string(),
    comparator: z.enum(['gt', 'lt', 'range']),
    value: z.number().optional(),
    lower: z.number().optional(),
    upper: z.number().optional(),
  })
  .superRefine((m, ctx) => {
    if (m.comparator === 'gt' || m.comparator === 'lt') {
      if (m.value === undefined || !Number.isFinite(m.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: `comparator "${m.comparator}" requires a finite numeric "value" threshold (lower/upper are only valid for comparator "range")`,
        });
      }
      return;
    }
    if (
      m.lower === undefined || m.upper === undefined ||
      !Number.isFinite(m.lower) || !Number.isFinite(m.upper) ||
      m.lower >= m.upper
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lower'],
        message: 'comparator "range" requires finite numeric "lower" and "upper" with lower < upper',
      });
    }
  });

/** zod schema for one generated hypothesis candidate (no id — computed locally). */
export const CandidateZod = z.object({
  statement: z.string(),
  mechanism: z.string(),
  falsificationMethod: FalsificationMethodZod,
  supportingCitations: z.array(z.string()),
  counterEvidenceCitations: z.array(z.string()),
  relationToExistingTheory: z.string(),
  alternativeExplanations: z.array(z.string()),
  observablePredictions: z.array(z.string()),
  distinguishingObservations: z.array(z.string()),
  noveltyRelativeToCorpus: z.string(),
  assumptions: z.array(z.string()),
  risks: z.array(z.string()),
});

/** zod schema for the whole hypothesis-generation response. */
export const GenerationZod = z.object({
  hypotheses: z.array(CandidateZod).min(3).max(5),
});

/** zod schema for the plan body (ids are filled deterministically by caller). */
export const PlanBodyZod = z.object({
  objectives: z.array(z.string()),
  preregisteredPredictions: z.array(z.string()),
  dataRequirements: z.array(z.string()),
  inclusionExclusionCriteria: z.array(z.string()),
  variables: z.array(z.string()),
  design: z.string(),
  analysisDag: z.array(z.string()),
  tools: z.array(z.string()),
  statisticalMethods: z.array(z.string()),
  sampleSizeRationale: z.string(),
  multiplicityHandling: z.string(),
  missingOutlierStrategy: z.string(),
  stoppingConditions: z.array(z.string()),
  checkpoints: z.array(z.string()),
  budget: z.string(),
  risks: z.array(z.string()),
  reproducibility: z.array(z.string()),
  nextRoundDecisionRules: z.array(z.string()),
  humanApprovalRequired: z.array(z.string()),
});

// ── Retrieved-document / corpus (content-addressed evidence) ─────────────────

export const RetrievedDocumentZod = z.object({
  documentId: z.string(),
  sourceType: z.enum(['openalex', 'arxiv', 'crossref']),
  sourceName: z.string(),
  persistentIdentifier: z.string(),
  doi: z.string().nullable(),
  canonicalUrl: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  publicationDate: z.string().nullable(),
  retrievedAt: z.string(),
  // Persistent-cache replay marker (absent = fresh live fetch).
  retrievedFrom: z.literal('cache').optional(),
  retrievalQuery: z.string(),
  retrievalMethod: z.string(),
  rawHash: z.string(),
  normalizedHash: z.string(),
  parserVersion: z.string(),
  abstract: z.string().nullable(),
  licenseMetadata: z.string().nullable(),
});

export const CorpusSnapshotZod = z.object({
  snapshotId: z.string(),
  rootHash: z.string(),
  documentCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  sourceQueries: z.array(z.string()),
  documents: z.array(RetrievedDocumentZod),
});

// ── Citation binding + evidence relations (directive §9.5) ───────────────────

export const EvidenceRelationZod = z.object({
  claimId: z.string(),
  documentId: z.string(),
  relation: z.enum(['supports', 'contradicts', 'contextualizes', 'methods', 'insufficient']),
  locator: z.string().nullable(),
  directness: z.enum(['direct', 'indirect']).nullable(),
  studyType: z.string().nullable(),
  quality: z.enum(['high', 'medium', 'low']).nullable(),
  uncertainty: z.string().nullable(),
  extractedBy: z.enum(['model', 'deterministic', 'human']),
  validatedBy: z.enum(['deterministic-bind', 'human']).nullable(),
  validationStatus: z.enum(['bound', 'unbound']),
  failureReason: z.string().nullable(),
});

export const CitationBindingZod = z.object({
  supportingIds: z.array(z.string()),
  counterIds: z.array(z.string()),
  boundSupporting: z.array(RetrievedDocumentZod),
  boundCounter: z.array(RetrievedDocumentZod),
  unbound: z.array(z.string()),
  allBound: z.boolean(),
  snapshotId: z.string(),
  relations: z.array(EvidenceRelationZod),
});

// ── Hypothesis / critique / scorecard ────────────────────────────────────────

export const HypothesisCandidateZod = z.object({
  id: z.string(),
  statement: z.string(),
  mechanism: z.string(),
  falsificationMethod: FalsificationMethodZod,
  supportingCitations: z.array(z.string()),
  counterEvidenceCitations: z.array(z.string()),
  relationToExistingTheory: z.string(),
  alternativeExplanations: z.array(z.string()),
  observablePredictions: z.array(z.string()),
  distinguishingObservations: z.array(z.string()),
  noveltyRelativeToCorpus: z.string(),
  assumptions: z.array(z.string()),
  risks: z.array(z.string()),
  // Discovery-layer attribution (optional: legacy candidates predate the fan-out).
  strategyOrigin: z.enum(STRATEGY_IDS).optional(),
});

export const CritiqueReportZod = z.object({
  hypothesisId: z.string(),
  findings: z.array(
    z.object({
      dimension: z.enum([
        'falsifiability',
        'novelty',
        'counter_evidence',
        'causation',
        'selective_reporting',
        'data_availability',
        'confounding',
        'citation_mismatch',
        'overreach',
        'ethics',
      ]),
      finding: z.string(),
      severity: z.enum(['critical', 'major', 'minor']),
    }),
  ),
  sameModelAsGenerator: z.boolean(),
});

export const HypothesisScorecardZod = z.object({
  hypothesisId: z.string(),
  dimensions: z.array(
    z.object({
      name: z.enum([
        'ScientificPlausibility',
        'NoveltyRelativeToCorpus',
        'Falsifiability',
        'EvidenceCoverage',
        'CounterEvidenceCoverage',
        'Testability',
        'DataAvailability',
        'MethodologicalSoundness',
        'ExecutionCost',
        'ExpectedInformationGain',
        'Risk',
      ]),
      grade: z.enum(['A', 'B', 'C', 'D', 'F', 'NOT_APPLICABLE']),
      rationale: z.string(),
      source: z.enum(['deterministic', 'model', 'human']),
    }),
  ),
  paretoOptimal: z.boolean(),
  keyEvidenceToChangeConclusion: z.string(),
});

// ── Research plan / feedback / revision (recursive — lazy for revisions) ─────

export const ResearchPlanZod = z.object({
  objectives: z.array(z.string()),
  primaryHypothesisId: z.string(),
  alternativeHypothesisIds: z.array(z.string()),
  preregisteredPredictions: z.array(z.string()),
  dataRequirements: z.array(z.string()),
  inclusionExclusionCriteria: z.array(z.string()),
  variables: z.array(z.string()),
  design: z.string(),
  analysisDag: z.array(z.string()),
  tools: z.array(z.string()),
  statisticalMethods: z.array(z.string()),
  sampleSizeRationale: z.string(),
  multiplicityHandling: z.string(),
  missingOutlierStrategy: z.string(),
  stoppingConditions: z.array(z.string()),
  checkpoints: z.array(z.string()),
  budget: z.string(),
  risks: z.array(z.string()),
  reproducibility: z.array(z.string()),
  nextRoundDecisionRules: z.array(z.string()),
  humanApprovalRequired: z.array(z.string()),
});

export const FeedbackSignalZod = z.object({
  source: z.enum(['human', 'literature', 'tool', 'analysis']),
  actor: z.string(),
  receivedAt: z.string(),
  affectsHypothesisIds: z.array(z.string()),
  changesScore: z.boolean(),
  triggers: z.array(z.enum(['new_retrieval', 'alternative_hypothesis', 'plan_rewrite', 'none'])),
  text: z.string(),
});

/** CLI/API boundary schema for a user-supplied feedback document. */
export const FeedbackInputZod = z.object({
  source: z.enum(['human', 'literature', 'tool', 'analysis']),
  actor: z.string(),
  text: z.string(),
  affectsHypothesisIds: z.array(z.string()).optional(),
  changesScore: z.boolean().optional(),
  triggers: z.array(z.enum(['new_retrieval', 'alternative_hypothesis', 'plan_rewrite', 'none'])).optional(),
});

export const RevisionZod = z.object({
  id: z.string(),
  parentRevisionId: z.string().nullable(),
  number: z.number().int().positive(),
  feedback: FeedbackSignalZod,
  hypothesisChanges: z.object({
    added: z.array(z.string()),
    removed: z.array(z.string()),
    downgraded: z.array(z.string()),
  }),
  planChanges: z.array(z.string()),
  metricChanges: z.array(z.string()),
  unresolvedConflicts: z.array(z.string()),
  beforePlan: ResearchPlanZod.nullable(),
  afterPlan: ResearchPlanZod.nullable(),
  createdAt: z.string(),
});

// ── Provenance receipts + environment fingerprint ────────────────────────────

export const ReceiptTokenUsageZod = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
  measured: z.boolean(),
});

export const ReceiptCostZod = z.object({
  status: z.enum(['billed', 'estimated', 'unavailable']),
  currency: z.string().nullable(),
  amount: z.number().nullable(),
});

export const ProvenanceReceiptZod = z.object({
  runId: z.string(),
  stageId: z.string(),
  stageVersion: z.number().int().positive(),
  attempt: z.number().int().positive(),
  sequence: z.number().int().positive(),
  component: z.enum(['model', 'retrieval', 'deterministic']),
  mode: z.enum(['LIVE', 'RECORDED_REPLAY', 'SYNTHETIC_TEST', 'OFFLINE_DEVELOPMENT', 'NOT_EXECUTED']),
  provider: z.string().nullable(),
  endpointRegion: z.string().nullable(),
  modelId: z.string().nullable(),
  requestId: z.string().nullable(),
  modelSnapshot: z.enum(['provided', 'not_provided_by_provider', 'unknown']),
  tokenUsage: ReceiptTokenUsageZod.nullable(),
  latencyMs: z.number().nullable(),
  retries: z.number().int().nonnegative(),
  finishReason: z.string().nullable(),
  cost: ReceiptCostZod,
  inputHash: z.string().nullable(),
  outputHash: z.string().nullable(),
  corpusSnapshotId: z.string().nullable(),
  corpusRootHash: z.string().nullable(),
  dataSource: z.string().nullable(),
  retrievedAt: z.string().nullable(),
  parserVersion: z.string().nullable(),
  promptTemplateHash: z.string().nullable(),
  errors: z.array(z.string()),
  createdAt: z.string(),
  provenanceStatus: z.enum(['complete', 'partial']),
  missingFields: z.array(z.string()),
});

export const EnvironmentFingerprintZod = z.object({
  gitCommit: z.string().nullable(),
  gitDirty: z.boolean().nullable(),
  nodeVersion: z.string(),
  platform: z.string(),
  lockfileHash: z.string().nullable(),
  packageVersion: z.string().nullable(),
});

// ── Gate reports (researchability / citation / falsifiability) ───────────────

export const ResearchScopeZod = z.object({
  domain: z.string().nullable(),
  domainHints: z.array(z.string()),
  questionLength: z.number().int().nonnegative(),
});

export const ProblemDecompositionZod = z.object({
  knownFacts: z.array(z.string()),
  unknownVariables: z.array(z.string()),
  keyDefinitions: z.array(z.string()),
  observables: z.array(z.string()),
  candidateMechanisms: z.array(z.string()),
  mainstreamTheories: z.array(z.string()),
  alternativeTheories: z.array(z.string()),
  retrievalSubquestions: z.array(z.string()),
  confounders: z.array(z.string()),
  dataRequirements: z.array(z.string()),
  falsifiabilityConditions: z.array(z.string()),
  indistinguishableScenarios: z.array(z.string()),
});

export const ResearchabilityReportZod = z.object({
  question: z.string(),
  verdict: z.enum(['RESEARCHABLE', 'LIMITED', 'UNSUPPORTED']),
  reasons: z.array(z.string()),
  safetyRisks: z.array(z.string()),
  scope: ResearchScopeZod,
  decomposition: ProblemDecompositionZod.nullable(),
  requiresEthicsGate: z.boolean(),
  assessedAt: z.string(),
  schemaVersion: z.number(),
});

export const CitationGateReportZod = z.object({
  boundRate: z.number().min(0).max(1),
  totalCited: z.number().int().nonnegative(),
  boundCount: z.number().int().nonnegative(),
  unboundEvidenceCount: z.number().int().nonnegative(),
  resolvedViaRetrieval: z.array(z.string()),
  perHypothesis: z.record(
    z.string(),
    z.object({
      allBound: z.boolean(),
      unbound: z.array(z.string()),
    }),
  ),
  primaryRequiresAllBound: z.boolean(),
  primaryAllBound: z.boolean(),
  gateVerdict: z.enum(['PASS', 'DEGRADED', 'INCONCLUSIVE']),
});

export const FalsifiabilityGateReportZod = z.object({
  perHypothesis: z.record(
    z.string(),
    z.object({
      passed: z.boolean(),
      errors: z.array(z.string()),
    }),
  ),
  allPassed: z.boolean(),
});

// ── Observation (real-data analysis result) ──────────────────────────────────

export const RadiusInsolationObservationZod = z.object({
  status: z.enum(['SUCCESS', 'PARTIAL', 'FAILED']),
  n: z.number().int().nonnegative(),
  excludedMissing: z.number().int().nonnegative(),
  pearsonR: z.number().nullable(),
  pValue: z.number().nullable(),
  confidenceInterval: z.tuple([z.number(), z.number()]).nullable(),
  significantAt05: z.boolean(),
  meanInsolation: z.number().nullable(),
  params: z.object({
    minRadiusEarth: z.number(),
    maxPeriodDays: z.number(),
    confidenceLevel: z.number(),
    source: z.enum(['plan', 'default']),
  }),
  inputHash: z.string(),
  analyzedAt: z.string(),
  summary: z.string(),
});

export const ExoplanetDatasetCardZod = z.object({
  source: z.string(),
  sourceUrl: z.string(),
  version: z.string(),
  persistentId: z.string(),
  license: z.string(),
  downloadedAt: z.string(),
  query: z.string(),
  rawChecksum: z.string(),
  rowCount: z.number().int().nonnegative(),
  fields: z.array(z.string()),
  units: z.record(z.string(), z.string()),
  missingNotes: z.array(z.string()),
  qualityNotes: z.array(z.string()),
  allowedInference: z.string(),
  forbiddenInference: z.string(),
  reproductionCommand: z.string(),
  fetchMode: z.enum(['LIVE', 'RECORDED_REPLAY']),
});

// ── Literature-landscape observation (domain-general adapter) ────────────────

export const LiteratureLandscapeObservationZod = z.object({
  kind: z.literal('literature-landscape'),
  snapshotId: z.string(),
  rootHash: z.string(),
  totalDocuments: z.number().int().nonnegative(),
  supportingDocuments: z.number().int().nonnegative(),
  counterEvidenceDocuments: z.number().int().nonnegative(),
  counterEvidenceShare: z.number().min(0).max(1),
  medianPublicationYear: z.number().nullable(),
  unknownYearDocuments: z.number().int().nonnegative(),
  freshShare: z.number().min(0).max(1),
  sourceFamilies: z.array(z.string()),
  queryCount: z.number().int().nonnegative(),
  producedAt: z.string(),
});

export const LandscapeDatasetCardZod = z.object({
  source: z.string(),
  sourceUrl: z.string(),
  version: z.string(),
  persistentId: z.string(),
  license: z.string(),
  downloadedAt: z.string(),
  checksumField: z.string(),
  checksumValue: z.string(),
  fields: z.array(z.string()),
  knownBias: z.string(),
  allowedInference: z.string(),
  forbiddenInference: z.string(),
});

export const ObservationZod = z.discriminatedUnion('adapter', [
  z.object({
    id: z.string(),
    adapter: z.literal('exoplanet-archive-radius-insolation'),
    affectsHypothesisIds: z.array(z.string()),
    result: RadiusInsolationObservationZod,
    datasetCard: ExoplanetDatasetCardZod,
    mode: z.enum(['LIVE', 'RECORDED_REPLAY', 'SYNTHETIC_TEST', 'OFFLINE_DEVELOPMENT', 'NOT_EXECUTED']),
    producedAt: z.string(),
  }),
  z.object({
    id: z.string(),
    adapter: z.literal('literature-landscape'),
    affectsHypothesisIds: z.array(z.string()),
    result: LiteratureLandscapeObservationZod,
    datasetCard: LandscapeDatasetCardZod,
    mode: z.enum(['LIVE', 'RECORDED_REPLAY', 'SYNTHETIC_TEST', 'OFFLINE_DEVELOPMENT', 'NOT_EXECUTED']),
    producedAt: z.string(),
  }),
]);

// ── Discovery-layer accounting (schema v4+) ─────────────────────────────────

/** Closed grade alphabet (mirrors ScoreGrade; SSOT for zod boundaries). */
const SCORE_GRADES = ['A', 'B', 'C', 'D', 'F', 'NOT_APPLICABLE'] as const;

export const FanoutStrategyReceiptZod = z.object({
  strategyId: z.enum(STRATEGY_IDS),
  contributed: z.number().int().nonnegative(),
  error: z.string().nullable(),
  skipReason: z.string().nullable(),
});

export const FanoutReceiptZod = z.object({
  strategiesPlanned: z.array(z.enum(STRATEGY_IDS)),
  perStrategy: z.array(FanoutStrategyReceiptZod),
  exactDuplicatesDropped: z.number().int().nonnegative(),
  paraphraseFlagged: z.array(
    z.object({
      keptId: z.string(),
      droppedId: z.string(),
      similarity: z.number().min(0).max(1),
      keptStrategy: z.enum(STRATEGY_IDS),
      droppedStrategy: z.enum(STRATEGY_IDS),
    }),
  ),
  truncated: z.array(
    z.object({ id: z.string(), strategyId: z.enum(STRATEGY_IDS) }),
  ),
  finalCount: z.number().int().nonnegative(),
  quotaShortfall: z.number().int().nonnegative(),
});

export const TournamentReceiptZod = z.object({
  ratings: z.array(
    z.object({
      id: z.string(),
      strategyOrigin: z.enum(STRATEGY_IDS).nullable(),
      elo: z.number().finite(),
      wins: z.number().int().nonnegative(),
      draws: z.number().int().nonnegative(),
      losses: z.number().int().nonnegative(),
      rank: z.number().int().positive(),
    }),
  ),
  matches: z.array(
    z.object({
      aId: z.string(),
      bId: z.string(),
      outcome: z.enum(['a', 'b', 'draw']),
      criteria: z.array(
        z.object({
          dimension: z.string(),
          aGrade: z.enum(SCORE_GRADES),
          bGrade: z.enum(SCORE_GRADES),
          point: z.enum(['a', 'b', 'none']),
        }),
      ),
    }),
  ),
  meta: z.object({
    rounds: z.number().int().positive(),
    initialRating: z.number().finite(),
    kFactor: z.number().finite().positive(),
    pairingOrder: z.string(),
    degenerate: z.boolean(),
  }),
});

export const DiscoveryBlockZod = z.object({
  strategy: z.enum(['legacy', 'multi_strategy']),
  fanout: FanoutReceiptZod.nullable(),
  tournament: TournamentReceiptZod.nullable(),
});

// ── The full ResearchRun (schema-versioned, v2 backward-compatible) ──────────

export const ResearchRunZod = z.object({
  runId: z.string(),
  question: z.string(),
  gateReport: ResearchabilityReportZod,
  corpus: CorpusSnapshotZod,
  hypotheses: z.array(HypothesisCandidateZod),
  bindings: z.record(z.string(), CitationBindingZod),
  critiques: z.record(z.string(), CritiqueReportZod),
  scorecards: z.record(z.string(), HypothesisScorecardZod),
  plan: ResearchPlanZod,
  revisions: z.array(RevisionZod),
  observations: z.array(ObservationZod),
  stageReceipts: z.array(ProvenanceReceiptZod),
  environment: EnvironmentFingerprintZod,
  // Discovery accounting (v4+): null = run predates discovery persistence
  // (schema ≤3) — absence of accounting is NOT absence of discovery.
  discovery: DiscoveryBlockZod.nullable(),
  modes: z.object({
    modelExecutionMode: z.enum(['LIVE', 'RECORDED_REPLAY', 'SYNTHETIC_TEST', 'OFFLINE_DEVELOPMENT', 'NOT_EXECUTED']),
    retrievalExecutionMode: z.enum(['LIVE', 'RECORDED_REPLAY', 'SYNTHETIC_TEST', 'OFFLINE_DEVELOPMENT', 'NOT_EXECUTED']),
    experimentExecutionMode: z.enum(['LIVE', 'RECORDED_REPLAY', 'SYNTHETIC_TEST', 'OFFLINE_DEVELOPMENT', 'NOT_EXECUTED']),
  }),
  runMode: z.enum(['LIVE', 'MIXED', 'RECORDED_REPLAY', 'SYNTHETIC_TEST', 'OFFLINE_DEVELOPMENT']),
  startedAt: z.string(),
  // Known versions 2..4. Bump this max when a v5 shape lands — unknown future
  // versions must fail closed rather than be guessed at.
  schemaVersion: z.number().int().positive().max(4),
  citationGate: CitationGateReportZod,
  falsifiabilityGate: FalsifiabilityGateReportZod,
});

// ── Boundary parse helpers (fail-closed deserialization) ─────────────────────

/**
 * Parse + validate a serialized ResearchRun. Throws with the offending path.
 *
 * v2 compatibility (directive §7 "compatible read strategy"): runs persisted
 * before the citation/falsifiability gates existed (schemaVersion 2) are
 * upgraded by RECOMPUTING the gates deterministically from the frozen
 * bindings/hypotheses — the exact values a fresh v3 run would have written.
 * Unknown future versions are rejected (fail-closed).
 */
export function parseResearchRunJson(raw: string): ResearchRun {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`not valid JSON: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }
  if (typeof parsed === 'object' && parsed !== null) {
    const record = parsed as Record<string, unknown>;
    if (record['schemaVersion'] === 2) {
      return upgradeV2Run(record);
    }
    // v3 → v4: discovery accounting was not persisted before v4. The upgrade
    // is an explicit materialization of that absence (null ≠ "no discovery
    // happened" — it means "was not recorded"), never a fabricated block.
    if (record['schemaVersion'] === 3) {
      return validateResearchRun({ ...record, discovery: null, schemaVersion: 4 });
    }
  }
  return validateResearchRun(parsed);
}

/** Validate an already-parsed ResearchRun-shaped value (fail-closed). */
export function validateResearchRun(value: unknown): ResearchRun {
  const result = ResearchRunZod.safeParse(value);
  if (!result.success) {
    const details = result.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`invalid ResearchRun: ${details}`);
  }
  return result.data;
}

/** Pre-v3 binding shape (no derived relations yet). */
const CitationBindingV2Zod = CitationBindingZod.omit({ relations: true });

/** Pre-v3 run shape (no gates; bindings lack relations; no discovery accounting). */
const ResearchRunV2Zod = ResearchRunZod.extend({
  bindings: z.record(z.string(), CitationBindingV2Zod),
}).omit({ citationGate: true, falsifiabilityGate: true, discovery: true });

type ResearchRunV2 = z.infer<typeof ResearchRunV2Zod>;

/**
 * Upgrade a schemaVersion-2 run to the current shape: derive the missing
 * evidence relations and recompute both deterministic gates from the frozen
 * bindings/hypotheses (deterministic — a v2 file and the file it would have
 * been produce identical gate values). v2 runs predate discovery persistence
 * entirely, so the upgraded run carries discovery: null.
 */
function upgradeV2Run(record: Record<string, unknown>): ResearchRun {
  const v2Result = ResearchRunV2Zod.safeParse(record);
  if (!v2Result.success) {
    const details = v2Result.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`invalid ResearchRun (v2): ${details}`);
  }
  const v2: ResearchRunV2 = v2Result.data;

  const bindings: Record<string, CitationBinding> = {};
  for (const [id, b] of Object.entries(v2.bindings)) {
    bindings[id] = { ...b, relations: buildEvidenceRelations(id, b) };
  }

  const citationGate = computeCitationGateReport({
    bindings,
    primaryHypothesisId: v2.plan.primaryHypothesisId,
  });
  const falsifiabilityGate = computeFalsifiabilityGateReport(v2.hypotheses);

  return validateResearchRun({
    ...v2,
    bindings,
    citationGate,
    falsifiabilityGate,
    discovery: null,
    schemaVersion: 4,
  });
}

