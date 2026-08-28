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
  | 'critique_falsify' | 'rank' | 'plan' | 'execute' | 'feedback' | 'revise' | 'export';

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

/** Mirror of the backend RunEvent enum (src/domain/run.ts) — keep in sync. */
export type RunEventType =
  | 'run_created' | 'stage_started' | 'stage_done' | 'stage_failed' | 'stage_skipped'
  | 'run_status_changed' | 'checkpoint_saved' | 'run_resumed' | 'run_cancelled'
  | 'feedback_received' | 'revision_created' | 'receipt_recorded' | 'note'
  | 'experiment_queued' | 'experiment_started' | 'experiment_completed' | 'experiment_failed' | 'experiment_canceled'
  | 'agent_started' | 'agent_tool_used' | 'agent_finished';

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
  /** Researcher identity projection (same semantics as RunSummary). */
  questionText?: string;
  domain?: string;
  /** Present since D-060: server projects lease state on the run detail. */
  leaseInfo?: RunLeaseInfo;
  /** §5.2: unverified sources exist — resume reopens verify_sources+build_evidence. */
  hasEvidenceDebt?: boolean;
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
  'critique_falsify', 'rank', 'plan', 'execute', 'feedback', 'revise', 'export',
] as const;

/** Same computation as server-side runProgress: core stages only (execute/feedback/revise excluded) -> n/9. */
export function runProgress(run: ResearchRun): { done: number; total: number } {
  const core = STAGE_ORDER.filter((s) => s !== 'feedback' && s !== 'revise' && s !== 'execute');
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

/** Workspace-wide aggregated library entry (GET /v1/library/sources): one row
 *  per DISTINCT document (identifier-deduplicated across runs), carrying the
 *  runs that retrieved it. Projection type — the stored per-run SourceDocument
 *  remains the truth plane. */
export interface LibrarySource {
  id: string;
  title: string;
  publicationYear: number | null;
  authors: string[];
  authorCount: number;
  venue: string | null;
  family: string;
  contentDepth: ContentDepth;
  accessState: AccessState;
  publicationType: string | null;
  identifiers: { kind: string; value: string }[];
  retrievedAt: string;
  retractionStatus?: 'retracted' | 'corrected' | 'expression_of_concern' | 'reinstated';
  runIds: string[];
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
  /** HX §15 researcher judgement layer (annotate/pin/exclude/reclassify). */
  researcher?: ClaimResearcherLayer;
}

/** HX §15 researcher judgement layer on claims (strictly additive; server zod-owned shape). */
export interface ClaimResearcherLayer {
  excluded: boolean;
  excludedAt?: string;
  excludedReason?: string;
  pinned: boolean;
  pinnedAt?: string;
  classification?: 'core-evidence' | 'counter-evidence' | 'background' | 'methodological-concern';
  classifiedAt?: string;
  annotations: { text: string; at: string }[];
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
  /** B5 lifecycle triage (R3); absent on objects created before B5 — treat as 'active'. */
  status?: 'active' | 'promoted' | 'rejected';
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

// ---- Wave-S g8/g9: evidence bodies + ACH audit (src/domain/evidence-body.ts / ach.ts) ----

/** Deterministic hypothesis-level evidence-body rating — every field is computed, none judged. */
export interface EvidenceBody {
  id: string;
  runId: string;
  hypothesisId: string;
  /** Min GRADE certainty across key supporting claims; absent when none are graded. */
  floorCertainty?: 'high' | 'moderate' | 'low' | 'very_low';
  independentSources: number;
  sumLogLrLow: number;
  sumLogLrHigh: number;
  /** Jeffreys-style band of the log10-LR midpoint — closed server enum (src/domain/formal.ts LogLrBand). */
  logLrBand:
    | 'very_strong_support' | 'strong_support' | 'moderate_support' | 'weak_support' | 'none'
    | 'weak_counter' | 'moderate_counter' | 'strong_counter' | 'very_strong_counter';
  qbafScore: number;
  proofStandard: 'unproven' | 'scintilla' | 'preponderance' | 'clear_and_convincing' | 'beyond_reasonable_doubt';
  experimentalAxes: number;
  promotion: 'orthogonal' | 'single_source' | 'literature_only_unverified' | 'none';
  disclosure: string;
  createdAt: string;
}

export interface AchDiagnosticityScore {
  claimId: string;
  score: number;
  netByHypothesis: Record<string, number>;
}

export interface AchRemovalSensitivity {
  removedTopK: number;
  orderBefore: string[];
  orderAfter: string[];
  inversions: number;
  stable: boolean;
}

export interface AchAnalysis {
  id: string;
  runId: string;
  hypothesisIds: string[];
  diagnosticity: AchDiagnosticityScore[];
  removalSensitivity: AchRemovalSensitivity;
  method: string;
  createdAt: string;
}

/**
 * HX §15 researcher-adjusted ACH projection (GET /runs/:id/hypotheses): a
 * read-time recomputation over claims the researcher excluded — the stored
 * AchAnalysis stays untouched; both views are disclosed. Null until a claim
 * is excluded.
 */
export interface AchResearcherAdjusted {
  excludedClaimIds: string[];
  diagnosticity: AchDiagnosticityScore[];
  removalSensitivity: AchRemovalSensitivity;
  method: string;
}

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

/** Execution-truth class (server projection src/app/truth-profile.ts, §5.5). */
export type RunTruthClass = 'live' | 'mixed' | 'recorded_replay' | 'synthetic' | 'empty';

export interface RunTruthProfile {
  runId: string;
  klass: RunTruthClass;
  modelCalls: { live: number; test: number };
  retrieval: { live: number; hit: number; stale: number; replay: number };
  toolExecs: number;
  totalReceipts: number;
}

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

// ---- universal search (B2) ----

/** One cross-run search hit; `text` is the researcher-meaningful string (question / statement / claim). */
export interface SearchHit {
  runId: string;
  id: string;
  text: string;
  /** FTS5 snippet with «hit» markers (D-101; present on the FTS path only). */
  snippet?: string;
  /** bm25 rank (lower = more relevant; FTS path only). */
  rank?: number;
}

/** Palette search (Ctrl+K) also finds conversations by title (unified timeline).
 *  conversations hits carry the conversation id in `id`; `runId` is the unscoped slot. */
export interface SearchResponse {
  query: string;
  questions: SearchHit[];
  hypotheses: SearchHit[];
  claims: SearchHit[];
  conversations?: SearchHit[];
}

// ---- object-level AI research actions (B4) ----

export type ResearchActionName = 'challenge' | 'weakest_assumption' | 'falsify_probe' | 'counter_evidence' | 'ask' | 'what_next';
export type ResearchActionTargetType = 'hypothesis' | 'claim' | 'plan';

export interface ActionPoint {
  kind: 'argument' | 'evidence_link' | 'caveat' | 'gap';
  text: string;
  claimId?: string;
}

export interface ActionAnalysis {
  headline: string;
  points: ActionPoint[];
  uncertainties: string[];
  nextStep?: string;
}

export interface ResearchActionResponse {
  action: ResearchActionName;
  targetType: ResearchActionTargetType;
  targetId: string;
  model: { provider: string; modelId: string; latencyMs: number };
  analysis: ActionAnalysis;
  droppedRefs: string[];
  groundingClaims: number;
  note: string;
}

// ---- user-defined model configurations (custom model routes) ----

export type ProviderWireProtocol = 'openai' | 'anthropic' | 'gemini' | 'offline';

/** Preset provider template (server catalog.ts) — one-click prefill, not a whitelist. */
export interface ProviderTemplate {
  id: string;
  label: string;
  wire: ProviderWireProtocol;
  baseUrl: string;
  keyUrl?: string;
  note?: string;
}

/** Server projection of a stored model config — the plaintext key NEVER crosses the wire. */
export interface ModelConfigPricing {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

export type ReasoningStyle = 'reasoning_effort' | 'enable_thinking' | 'thinking_budget' | 'thinking_config';
export type ReasoningGear = 'low' | 'medium' | 'high';

/** Declared thinking capability + default effort gear of a model config. */
export interface ReasoningCapability {
  style: ReasoningStyle;
  defaultGear: ReasoningGear;
}

export interface ModelConfigSummary {
  id: string;
  label: string;
  wire: ProviderWireProtocol;
  baseUrl: string;
  modelId: string;
  apiKeySet: boolean;
  apiKeyMasked: string;
  active: boolean;
  /** BP-4 failover chain (server schema default [] for pre-existing configs). */
  fallbackConfigIds?: string[];
  /** BP-4 user-declared list pricing; absent = cost shown as unknown. */
  pricing?: ModelConfigPricing;
  /** Declared thinking capability (absent = the endpoint gets no thinking fields). */
  reasoning?: ReasoningCapability;
  createdAt: string;
  updatedAt: string;
}

/** BP-4 usage ledger aggregate (receipt-derived). */
export interface UsageAggregate {
  provider: string;
  modelId: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number | null;
  pricingBasis: 'user-configured' | 'unknown';
}

export interface EnvDefaultInfo {
  name: string;
  modelId: string;
  liveReady: boolean;
  /** Where the effective built-in default came from: a UI switch or the env chain. */
  defaultSource?: 'ui' | 'env';
}

/** One built-in env route (zai/dashscope live; archived = banned, display-only). */
export interface BuiltinRouteSummary {
  name: string;
  kind: 'live' | 'test';
  liveReady: boolean;
  baseUrl: string;
  apiKeyEnvVar: string;
  /** What the env layer alone would select (the baseline the override sits on). */
  envModelId: string;
  /** envModelId or the UI-declared modelId override — what a call would use. */
  effectiveModelId: string;
  /** UI-declared real list prices; absent = cost shows as unknown. */
  pricing?: { inputUsdPerMTok: number; outputUsdPerMTok: number };
  isBuiltinDefault: boolean;
}

export interface BuiltinRoutesResponse {
  routes: BuiltinRouteSummary[];
  defaultSource: 'ui' | 'env';
}

export interface BuiltinRouteUpdateInput {
  /** string = override the model; null = clear back to env/default selection. */
  modelId?: string | null;
  /** object = declare real list prices; null = clear (cost falls back to unknown). */
  pricing?: { inputUsdPerMTok: number; outputUsdPerMTok: number } | null;
}

/** One normalized entry of the local Zotero library (server-bridged snapshot). */
export interface ZoteroLibItem {
  key: string;
  title: string;
  itemType: string;
  year?: number;
  creators: string[];
  doi?: string;
  url?: string;
  tags: string[];
  collections: string[];
  relatedKeys: string[];
}

export interface ZoteroLibraryResponse {
  items: ZoteroLibItem[];
  total: number;
  fetchedAt: string;
}

/** One researcher annotation (highlight/note) on a Zotero library item —
 *  critical-reading material that imports into study seeds as text. */
export interface ZoteroAnnotation {
  key: string;
  parentKey: string;
  type: 'highlight' | 'note' | 'image' | 'other';
  text?: string;
  comment?: string;
}

export interface ZoteroAnnotationsResponse {
  annotations: ZoteroAnnotation[];
  total: number;
  fetchedAt: string;
}

/** A library item enriched with its annotations at import time (panel-side join). */
export type ZoteroImportItem = ZoteroLibItem & { annotations?: ZoteroAnnotation[] };

// ---- conversations (conversation-first research flow) ----

export interface ConversationSeed {
  title: string;
  identifiers: { kind: 'doi' | 'arxiv' | 'url' | 'other'; value: string }[];
  text?: string;
  year?: number;
  authors: string[];
}

export interface CandidateQuestion {
  id: string;
  text: string;
  rationale: string;
}

export type ConversationActionKind = 'launch_research' | 'cancel_run' | 'create_automation' | 'cancel_automation' | 'create_tool_integration';

/** One agent-proposed action and its honest lifecycle (executes only on approval). */
export interface ConversationProposal {
  id: string;
  kind: ConversationActionKind;
  title: string;
  args: Record<string, unknown>;
  status: 'pending' | 'executed' | 'rejected' | 'failed';
  result?: string;
  autoApproved?: boolean;
  /** RU-3 T6: server-computed disclosure (never accepted from model input). */
  riskLevel?: 'low' | 'moderate' | 'high';
  argSummary?: Record<string, string>;
  createdAt: string;
  resolvedAt?: string;
}

export interface ToolTraceEntry {
  tool: string;
  ok: boolean;
  summary?: string;
  durationMs?: number;
}

export interface ConversationMessage {
  id: string;
  /** automation = deterministic system record (triggers, action outcomes) — never a model reply. */
  role: 'researcher' | 'agent' | 'automation';
  content: string;
  seeds?: ConversationSeed[];
  candidates?: CandidateQuestion[];
  toolTrace?: ToolTraceEntry[];
  proposals?: ConversationProposal[];
  usage?: {
    provider: string; modelId: string; latencyMs: number;
    inputTokens?: number; outputTokens?: number;
    modelCalls?: number; toolCalls?: number;
  };
  /** researcher messages only: why this message's agent reply failed — the
   * message itself is durable history; retry clears this by landing the reply. */
  replyError?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  status: 'open' | 'converged';
  providerConfigId?: string;
  /** Researcher's effort override for this conversation; absent = config default. */
  reasoningGear?: ReasoningGear;
  messages: ConversationMessage[];
  runIds: string[];
  turns: number;
  /** Action kinds remembered as "don't ask again" in this conversation. */
  autoApprove: ConversationActionKind[];
  createdAt: string;
  updatedAt: string;
}

// ---- automations (resident agent R3) ----

export type AutomationTrigger =
  | { kind: 'run_completed' }
  | { kind: 'schedule'; intervalMinutes: number };

export interface Automation {
  id: string;
  conversationId: string;
  label: string;
  trigger: AutomationTrigger;
  task: string;
  enabled: boolean;
  maxTurnsPerFire: number;
  fireCount: number;
  notifiedRunIds: string[];
  lastFiredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelConfigsResponse {
  configs: ModelConfigSummary[];
  activeModelConfigId: string | null;
  envDefault: EnvDefaultInfo | null;
}

export interface ModelConfigInput {
  label: string;
  wire: ProviderWireProtocol;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  /** Present = declare/replace the thinking capability. */
  reasoning?: ReasoningCapability;
}

export interface ModelConfigTestInput {
  /** Test a stored config; the server supplies its key. */
  configId?: string;
  label?: string;
  wire: ProviderWireProtocol;
  baseUrl: string;
  modelId: string;
  apiKey?: string;
}

export interface ModelConfigTestResult {
  ok: boolean;
  modelId: string;
  latencyMs: number;
  sample?: unknown;
  error?: { kind: string; message: string; retryable: boolean; httpStatus?: number };
}

// ---- tool integrations (TIS: researcher-wired external tools) ----

export type ToolIntegrationKind = 'mcp_server' | 'skill' | 'command' | 'hook_rule';

export interface ToolTestRecord {
  at: string;
  ok: boolean;
  summary: string;
}

/** Server projection — secret env/header values arrive masked (envSet/headersSet carry key names). */
export interface ToolIntegrationView {
  id: string;
  kind: ToolIntegrationKind;
  label: string;
  enabled: boolean;
  createdBy: 'researcher' | 'conversation' | 'plugin_import';
  createdAt: string;
  updatedAt: string;
  // mcp_server
  transport?: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  toolNamePrefix?: string;
  riskClass?: 'read' | 'edit' | 'execute' | 'destructive';
  timeoutMs?: number;
  lastTest?: ToolTestRecord;
  envSet?: string[];
  headersSet?: string[];
  // skill
  name?: string;
  description?: string;
  whenToUse?: string;
  priority?: number;
  body?: string;
  // command
  template?: string;
  scope?: 'palette' | 'composer' | 'both';
  // hook_rule
  event?: 'before_tool' | 'after_tool' | 'turn_end';
  match?: { toolPattern?: string; riskClass?: string };
  action?: { type: 'block' | 'require_approval' | 'log'; reason?: string; note?: string };
}

// ---- active-learning screening (ASReview-pattern loop) ----

export interface ScreeningView {
  session: {
    id: string;
    state: 'active' | 'stopped';
    poolSize: number;
    includeCount: number;
    excludeCount: number;
    /** Live corpus grew beyond the pool snapshot — offer an honest restart note. */
    corpusGrew: boolean;
  };
  next: Array<{
    srcId: string;
    title: string;
    authors: string[];
    year?: number;
    abstractText?: string;
    pRelevant: number | null;
    rank: number;
    phase: 'random' | 'model';
  }>;
  stop: {
    eligible: boolean;
    labeledCount: number;
    includeCount: number;
    predictedRelevantRemaining: number | null;
    coverageEstimate: number | null;
    basis: string;
  };
}

export interface ScreeningDecisionResult {
  duplicate: boolean;
  view: ScreeningView;
}

export interface ScreeningStopResult {
  view: ScreeningView;
  feedbackId?: string;
}

/* ---- Product Spine (2026-08-28): scientific state / next actions / deltas ---- */

export type ScientificStateKind = 'forming' | 'template' | 'insufficient' | 'evidence_backed';

export interface StateDimensionNote {
  dimension: string;
  qualitative: 'low' | 'moderate' | 'high' | 'not_assessed' | null;
  rationale: string;
  calibration: 'uncalibrated_llm_judgment' | 'deterministic' | 'human_expert';
}

export interface StateEvidenceRef {
  claimId: string;
  text: string;
  rationale: string;
  strength: 'strong' | 'moderate' | 'weak' | 'unrated';
  gradeCertainty: 'high' | 'moderate' | 'low' | 'very_low' | null;
}

export type BiggestUnknown =
  | { kind: 'unresolved_counter'; claimId: string; excerpt: string }
  | { kind: 'hyp_uncertainty'; text: string }
  | { kind: 'searched_no_counter'; queriesAttempted: number }
  | { kind: 'template_content' }
  | { kind: 'no_active_hyps' };

export interface ScientificStateView {
  runId: string;
  kind: ScientificStateKind;
  templateEvidence: string[];
  leading: { hypothesisId: string; statement: string; whyItLeads: StateDimensionNote[] } | null;
  strongestSupport: StateEvidenceRef | null;
  strongestCounter: StateEvidenceRef | null;
  competing: Array<{ hypothesisId: string; statement: string; differsBy: string | null }>;
  discriminatingObservations: Array<{ betweenHypothesisIds: string[]; observable: string; expects: string[] }>;
  biggestUnknown: BiggestUnknown | null;
  /** Weakest-link propagation: ordinal level + every factor with its observed value and grade. */
  confidence: { qualitative: 'low' | 'moderate' | 'high'; factors: string[] };
  /** Counter-evidence search coverage (symmetry guard). */
  counterEvidenceCoverage: { queriesAttempted: number; counterRelationsFound: number } | null;
  /** How the ordering was produced and how stable it is. */
  ordering: {
    basis: 'tournament' | 'composite' | 'single_candidate';
    agreement: number | null;
    topSeparation: 'disjoint' | 'overlap' | 'unknown';
  };
  falsifiers: Array<{ hypothesisId: string; condition: string }>;
  counters: { unresolvedCount: number; searchedAndFoundNone: { queriesAttempted: number; foundCount: number } | null };
  evidenceShape: { claims: number; verified: number; supportingRelations: number; counterRelations: number; excludedByResearcher: number };
}

export type NextActionType =
  | 'RERUN_WITH_LIVE_ROUTE' | 'DECLARE_INSUFFICIENT_EVIDENCE' | 'EXECUTE_PLANNED_EXPERIMENT'
  | 'CONSUME_FEEDBACK_INTO_REVISION' | 'RESUME_EVIDENCE_DEBT' | 'COUNTER_EVIDENCE_SEARCH'
  | 'DISCRIMINATING_ANALYSIS' | 'ADD_DISCRIMINATING_DATA' | 'EXTEND_LITERATURE' | 'RESEARCHER_REVIEW_COUNTERS';

export interface NextActionView {
  id: string;
  runId: string;
  actionType: NextActionType;
  objective: string;
  knowledgeGap: string;
  rationale: string;
  wouldChange: string;
  /** English mirror of the four display fields (zh fallback when absent — older projections). */
  en?: { objective: string; knowledgeGap: string; rationale: string; wouldChange: string };
  expectedDiscrimination: 'high' | 'medium' | 'low';
  feasibility: 'high' | 'medium' | 'low';
  costClass: 'high' | 'medium' | 'low';
  researcherDecisionRequired: boolean;
  targets: { hypothesisIds: string[]; claimIds: string[] };
  actionable: boolean;
  actionHint: { kind: 'resume' | 'rerun-live' | 'guidance' };
}

export interface StateDeltaView {
  id: string;
  runId: string;
  fromVersionLabel: string;
  toVersionLabel: string;
  at: string;
  trigger: { feedbackSource: string; excerpt: string };
  whatChanged: Array<{ objectType: string; objectId: string; operation: string; before: string | null; after: string | null; reason: string }>;
  affectedHypothesisIds: string[];
  affectedClaimIds: string[];
  rankingImpact: 'weakened' | 'strengthened' | 'restructured' | 'unclear';
  explanation: string;
  qualityDelta: { status: 'improved' | 'neutral' | 'worse' | 'inconclusive'; claim: string };
  remainingUncertainties: string[];
}

export interface ScienceBundle {
  state: ScientificStateView;
  nextActions: NextActionView[];
  deltas: StateDeltaView[];
  experimentLeg: { kind: string; executabilityPassed: boolean; reason?: string };
  unconsumedFeedbackCount: number;
}
