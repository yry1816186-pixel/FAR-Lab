/**
 * Domain object shapes as served by the FAR-Lab HTTP API (/api/v1).
 * These mirror the canonical zod schemas in the repository root src/domain/*.ts —
 * single source of truth stays server-side; this file only re-declares the wire
 * shape for type-safe rendering. When the domain schema evolves, update here.
 */

// ---- run lifecycle (src/domain/run.ts) ----

export type RunStatus =
  | 'created' | 'queued' | 'running' | 'paused'
  | 'partial' | 'completed' | 'failed' | 'cancelled';

export type RunStageName =
  | 'scope' | 'retrieve' | 'verify_sources' | 'build_evidence' | 'generate_hypotheses'
  | 'critique_falsify' | 'rank' | 'plan' | 'feedback' | 'revise' | 'export';

export type StageState = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface StageSubtasks {
  known: boolean;
  done: number;
  total: number;
}

export interface StageRecord {
  stage: RunStageName;
  state: StageState;
  attempt?: number;
  startedAt?: string;
  endedAt?: string;
  error?: string;
  subtasks?: StageSubtasks;
  checkpointRef?: string;
}

export type RunEventType =
  | 'run_created' | 'stage_started' | 'stage_done' | 'stage_failed' | 'stage_skipped'
  | 'run_status_changed' | 'checkpoint_saved' | 'run_resumed' | 'run_cancelled'
  | 'feedback_received' | 'revision_created' | 'receipt_recorded' | 'note';

export interface RunEvent {
  seq: number;
  runId: string;
  at: string;
  type: RunEventType;
  status?: RunStatus;
  stage?: RunStageName;
  detail?: Record<string, unknown>;
  receiptId?: string;
}

/** Cross-process single-writer lease projection (W8); `live=false` while status='running' = frozen-run signal. */
export interface RunLeaseInfo {
  holder: string | null;
  expiresAt: string | null;
  live: boolean;
}

export interface ResearchRun {
  id: string;
  questionId: string;
  status: RunStatus;
  currentStage: RunStageName;
  stages: StageRecord[];
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  cancelRequested: boolean;
  parentRunId?: string;
  tags: string[];
  /** Present since D-060: server projects lease state on the run detail. */
  leaseInfo?: RunLeaseInfo;
}

/** GET /api/v1/health projection (P-IA proactive status strip). */
export interface HealthProvider {
  name: string;
  kind: 'live' | 'test';
  liveReady: boolean;
}
export interface HealthReport {
  status: 'ok' | 'degraded';
  db: string;
  watchdog: string;
  providers: HealthProvider[];
  gitCommit: string | null;
  time: string;
}

/** Bundle summary served by GET /runs/:id/bundles (first-class discovery, D-060). */
export interface BundleSummary {
  id: string;
  createdAt: string;
  evidenceLevel: string;
}

/** Retrieval-plan projection served by GET /runs/:id/corpus (transparency panel, D-060). */
export interface CorpusQueryInfo {
  purpose: 'discovery' | 'supporting' | 'counter_evidence' | 'methodological' | 'identifier_resolution' | 'gap_followup';
  text: string;
  family: string;
}

export interface CorpusSnapshotInfo {
  queries: CorpusQueryInfo[];
  familyFailures?: { family: string; reason: string }[];
  fusion?: {
    algorithm?: string;
    poolSize?: number;
    rerankApplied?: boolean;
    rerankFailure?: string;
    counterSeatsKept?: number;
    variantSearches?: number;
    rerankWindows?: string;
    selection?: string;
  };
}

/**
 * Run list summary as actually served by GET /api/v1/runs (no stages array).
 * `progress` is the server-computed determinate count — present only when the
 * runtime truly knows it (INTERFACES §1).
 */
export interface RunSummary {
  id: string;
  status: RunStatus;
  currentStage: RunStageName;
  createdAt: string;
  /** Researcher-facing identity (CPP-2): the question the user actually asked. */
  questionText?: string;
  domain?: string;
  lastError?: string;
  progress?: { done: number; total: number };
}

export const STAGE_ORDER: readonly RunStageName[] = [
  'scope', 'retrieve', 'verify_sources', 'build_evidence', 'generate_hypotheses',
  'critique_falsify', 'rank', 'plan', 'feedback', 'revise', 'export',
] as const;

/** Same computation as server-side runProgress: core stages only (feedback/revise excluded) -> n/9. */
export function runProgress(run: ResearchRun): { done: number; total: number } {
  const core = STAGE_ORDER.filter((s) => s !== 'feedback' && s !== 'revise');
  const stateOf = (name: RunStageName): StageState | undefined =>
    run.stages.find((r) => r.stage === name)?.state;
  const done = core.filter((s) => {
    const st = stateOf(s);
    return st === 'done' || st === 'skipped';
  }).length;
  return { done, total: core.length };
}

/** Statuses for which auto-polling the run detail makes sense. */
export function isSettled(status: RunStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

// ---- question & scope (src/domain/question.ts) ----

export type ScientificGoalType =
  | 'explanatory' | 'predictive' | 'interventional' | 'methodological' | 'exploratory';

export interface ResearchScope {
  domain: string;
  phenomena: string[];
  temporalBoundary?: string;
  spatialOrSystemBoundary?: string;
  populationOrScopeNotes?: string;
  inScope: string[];
  outOfScope: string[];
}

export interface ConstraintSet {
  assumptions: string[];
  dataConstraints: string[];
  resourceConstraints: string[];
  ethicalConstraints: string[];
  methodologicalConstraints: string[];
}

export interface ResearchQuestion {
  id: string;
  text: string;
  background: string;
  goalType: ScientificGoalType;
  scope: ResearchScope;
  constraints: ConstraintSet;
  createdAt: string;
}

// ---- sources & corpus (src/domain/source.ts) ----

export type ContentDepth = 'metadata_only' | 'abstract' | 'full_text' | 'data';
export type AccessState = 'open' | 'restricted' | 'paywalled' | 'unavailable' | 'unknown';

export interface SourceVerification {
  method: 'crossref_doi' | 'arxiv_id' | 'openalex_id' | 'url';
  resolved: boolean;
  titleMatch?: boolean;
  detail?: string;
  checkedAt: string;
}

export interface SourceDocument {
  id: string;
  runId: string;
  family: string;
  identifiers: { kind: string; value: string }[];
  title: string;
  publicationYear?: number;
  authors?: string[];
  venue?: string;
  contentDepth: ContentDepth;
  accessState: AccessState;
  contentHash: string;
  retrievedAt: string;
  parseStatus: 'ok' | 'partial' | 'failed';
  abstractText?: string;
  license?: string;
  oaUrl?: string;
  verification?: SourceVerification;
}

// ---- claims (src/domain/claim.ts) ----

export type CitationBindingStatus = 'verified' | 'resolved_unaligned' | 'unresolved' | 'missing';

export interface ClaimLocator {
  sourceDocumentId: string;
  section?: string;
  quote: string;
  charStart?: number;
  charEnd?: number;
}

export interface ScientificClaim {
  id: string;
  runId: string;
  text: string;
  locators: ClaimLocator[];
  bindingStatus: CitationBindingStatus;
  alignmentChecked?: boolean;
  extractionModelRef?: string;
  uncertainties?: string[];
  /** GRADE-lite deterministic certainty ladder (W-G F-B); downgrade reasons ride along. */
  gradeCertainty?: 'high' | 'moderate' | 'low' | 'very_low';
  downgraded?: string[];
}

// ---- evidence relations (src/domain/evidence.ts) ----

export type EvidenceRelationType =
  | 'supports' | 'contradicts' | 'weakens' | 'qualifies'
  | 'depends_on' | 'derived_from' | 'replicates' | 'fails_to_replicate'
  | 'alternative_explanation' | 'methodological_limitation' | 'unknown';

/** Client copy of RELATION_POLARITY (server is the owner; values are stable domain semantics). */
export const RELATION_POLARITY: Record<EvidenceRelationType, 'supporting' | 'counter' | 'neutral'> = {
  supports: 'supporting',
  replicates: 'supporting',
  contradicts: 'counter',
  weakens: 'counter',
  fails_to_replicate: 'counter',
  alternative_explanation: 'counter',
  qualifies: 'neutral',
  depends_on: 'neutral',
  derived_from: 'neutral',
  methodological_limitation: 'neutral',
  unknown: 'neutral',
};

export interface EvidenceRelation {
  id: string;
  runId: string;
  relation: EvidenceRelationType;
  claimId?: string;
  sourceDocumentId?: string;
  targetHypothesisId?: string;
  targetClaimId?: string;
  rationale: string;
  strength?: 'strong' | 'moderate' | 'weak' | 'unrated';
  uncertainties?: string[];
  createdAt: string;
}

// ---- hypotheses (src/domain/hypothesis.ts) ----

export type TestabilityStatus = 'testable_now' | 'testable_with_data' | 'untestable_currently' | 'unfalsifiable';
export type NoveltyLabel = 'evidence_grounded' | 'novel_speculation' | 'mixed';

export interface Assumption {
  id: string;
  statement: string;
  kind: 'empirical' | 'theoretical' | 'methodological' | 'stipulated';
  backingClaimIds?: string[];
  uncertainty?: string;
}

export interface FalsificationSpec {
  observable: string;
  measurement: string;
  expectedRelation: string;
  decisionRule: string;
  supportCondition: string;
  weakeningCondition: string;
  falsificationCondition: string;
  confounders?: string[];
  alternativeExplanations?: string[];
  dataRequirements?: string[];
  method: string;
  failureInterpretation: string;
  completenessCheck?: { passed: boolean; missing?: string[] };
}

export interface HypothesisCandidate {
  id: string;
  runId: string;
  version: number;
  statement: string;
  mechanism: string;
  derivation: {
    strategy: string;
    rationale: string;
    inputClaimIds?: string[];
    modelRef?: string;
  };
  assumptions?: Assumption[];
  predictions?: string[];
  supportingClaimIds?: string[];
  counterClaimIds?: string[];
  uncertainties?: string[];
  noveltyLabel: NoveltyLabel;
  /** D-017 second novelty layer: judged against retrieved literature neighbors. */
  literatureNovelty?: LiteratureNovelty;
  testability: TestabilityStatus;
  falsification?: FalsificationSpec;
  clusterKey?: string;
  distinctnessRationale?: string;
  createdAt: string;
}

// ---- scorecards (src/domain/scorecard.ts) ----

// ---- D-017 literature novelty + D-016 tournament (src/domain/hypothesis.ts / scorecard.ts) ----

export interface LiteratureNoveltyNeighbor {
  title: string;
  year?: number;
  doi?: string;
  openalexId?: string;
  venue?: string;
  contentHash: string;
  query: string;
}

export type LiteratureNoveltyVerdict = 'novel' | 'incremental' | 'already_done' | 'unclear';

export interface LiteratureNovelty {
  verdict: LiteratureNoveltyVerdict;
  neighbors: LiteratureNoveltyNeighbor[];
  justification: string;
  producer: string;
  calibration: 'uncalibrated_llm_judgment';
  assessedAt: string;
}

export interface TournamentMatch {
  aId: string;
  bId: string;
  aFirstVerdict: 'a' | 'b' | 'tie' | 'incomparable';
  bFirstVerdict: 'a' | 'b' | 'tie' | 'incomparable';
  rationale: string;
  producer: string;
  outcome: 'a' | 'b' | 'tie' | 'no_contest';
}

export interface TournamentStanding {
  hypothesisId: string;
  btScore: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  rank: number;
}

export interface HypothesisTournament {
  id: string;
  runId: string;
  participantIds: string[];
  matches: TournamentMatch[];
  standings: TournamentStanding[];
  algorithm: string;
  uncertainty: string;
  createdAt: string;
}

export type ScoreDimension =
  | 'scientific_plausibility' | 'evidence_grounding' | 'counter_evidence_exposure' | 'novelty'
  | 'falsifiability' | 'testability' | 'data_availability' | 'methodological_soundness'
  | 'expected_information_gain' | 'resource_cost' | 'risk' | 'uncertainty';

export interface DimensionScore {
  dimension: ScoreDimension;
  value: number | null;
  qualitative?: 'low' | 'moderate' | 'high' | 'not_assessed';
  rationale: string;
  evidenceClaimIds?: string[];
  uncertainty?: string;
  producer: string;
  calibration: 'uncalibrated_llm_judgment' | 'deterministic' | 'human_expert';
}

export interface HypothesisScorecard {
  id: string;
  runId: string;
  hypothesisId: string;
  dimensions: DimensionScore[];
  overallRationale: string;
  rankedOutOf: number;
  rank: number;
  comparisonNote?: string;
}

// ---- plan (src/domain/plan.ts) ----

export interface PlanStep {
  id: string;
  title: string;
  kind: 'literature' | 'data_analysis' | 'tool_run' | 'simulation' | 'experiment' | 'human_review' | 'other';
  inputs?: string[];
  outputs?: string[];
  method: string;
  failureConditions?: string[];
  dependsOn?: string[];
  estimatedCost?: string;
}

export interface DatasetRequirement {
  name: string;
  variables: string[];
  availability: 'public' | 'request_required' | 'must_collect' | 'unavailable' | 'unknown';
  sourceHint?: string;
}

export interface ToolRequirement {
  name: string;
  purpose: string;
  kind: 'software' | 'compute' | 'instrument' | 'human' | 'other';
}

export interface ResearchPlan {
  id: string;
  runId: string;
  objective: string;
  hypothesisIds: string[];
  variables?: string[];
  controls?: string[];
  inclusionCriteria?: string[];
  exclusionCriteria?: string[];
  dataRequirements?: DatasetRequirement[];
  toolRequirements?: ToolRequirement[];
  steps: PlanStep[];
  metrics: string[];
  statistics?: string[];
  decisionRules: {
    successCriterion: string;
    weakeningCriterion: string;
    falsificationCriterion: string;
    stopCriterion: string;
  };
  confounders?: string[];
  alternativeExplanations?: string[];
  resources?: { compute?: string; cost?: string; time?: string };
  risks?: string[];
  ethics?: string[];
  prerequisites?: string[];
  expectedInformationGain?: string;
  alternativeBranches?: string[];
  reproducibilityRequirements?: string[];
  evidenceClaimIds?: string[];
  /** POPPER discipline (D-025): mandatory when a plan discriminates multiple hypotheses. */
  multipleTestingPolicy?: string;
  multipleTestingNote?: string;
  executabilityCheck?: { passed: boolean; missing?: string[]; statisticalDesignNote?: string };
  createdAt: string;
}

// ---- feedback / revision / version diff (src/domain/feedback.ts) ----

export type FeedbackSourceKind =
  | 'human_expert' | 'new_literature' | 'new_dataset' | 'tool_result' | 'simulation'
  | 'experiment' | 'reviewer' | 'verification_failure' | 'reproduction_failure';

export interface FeedbackSignal {
  id: string;
  runId: string;
  source: FeedbackSourceKind;
  content: string;
  structured?: Record<string, unknown>;
  target?: { kind: string; id: string };
  provenance: string;
  receivedAt: string;
}

export interface RevisionOperation {
  objectType: 'hypothesis' | 'plan' | 'claim' | 'evidence_relation' | 'scope' | 'assumption';
  objectId: string;
  operation: 'create' | 'modify' | 'weaken' | 'strengthen' | 'invalidate' | 'retire' | 'refine';
  before?: string;
  after?: string;
  reason: string;
}

export interface Revision {
  id: string;
  runId: string;
  triggerFeedbackId: string;
  causalReason: string;
  operations: RevisionOperation[];
  fromVersionLabel: string;
  toVersionLabel: string;
  qualityDelta: { status: 'improved' | 'neutral' | 'worse' | 'inconclusive'; claim: string; evidenceRefs?: string[] };
  createdAt: string;
}

export interface VersionDiff {
  revisionId: string;
  runId: string;
  entries: { objectType: string; objectId: string; summary: string; changedFields?: string[] }[];
  semanticSummary: string;
  remainingUncertainties?: string[];
}

// ---- provenance (src/domain/provenance.ts) ----

export type ReceiptKind = 'model_call' | 'source_retrieval' | 'tool_exec' | 'stage_transition' | 'export' | 'revision';
export type ExecutionMode = 'live' | 'test';

export interface ProvenanceReceipt {
  id: string;
  runId: string;
  kind: ReceiptKind;
  executionMode: ExecutionMode;
  at: string;
  modelCall?: {
    provider: string;
    modelId: string;
    modelVersion?: string;
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
    latencyMs: number;
    requestHash: string;
    outputHash: string;
    finishReason?: string;
  };
  sourceRetrieval?: {
    family: string;
    query: string;
    httpStatus: number;
    resultCount: number;
    contentHashes?: string[];
  };
  toolExec?: {
    tool: string;
    inputHash: string;
    outputHash: string;
    exitCode?: number;
    durationMs?: number;
  };
  stage?: string;
  codeRevision?: string;
  environmentFingerprint?: string;
  redactionNote?: string;
}

// ---- verification (src/app/verify.ts) ----

export interface VerificationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface VerificationReport {
  bundleId: string;
  runId: string;
  declaredEvidenceLevel: string;
  verifiedAt: string;
  checks: VerificationCheck[];
  verdict: 'verified' | 'failed' | 'degraded';
  failedChecks: string[];
  replayGuidance?: string;
  /** The bundle's own declared reproduction limits — mandatory honesty, shown not buried. */
  limitations?: string[];
}
