/**
 * entities/dtos — verbatim mirrors of the backend API DTOs.
 *
 * The backend implementation is the contract of record (schema/openapi.json
 * names paths; response bodies are defined by src/api/routes/*). Field names
 * match the backend EXACTLY (camelCase). No aliasing, no invention: a field
 * absent from the backend response is absent here, and the UI must render its
 * absence honestly.
 *
 * Two verdict shapes exist on the wire (backend serializes one concept twice):
 *   - GET /api/v1/verdict/*      → HonestVerdictDto (parentNodeId, decision)
 *   - POST /api/v1/hypothesize   → raw VerdictNode (parentVerdictId, verdict)
 * They are NOT interchangeable; both are modeled as observed.
 */

import type { RunModeValue } from './run.ts';
import type { VerdictValue } from './verdict.ts';

// ---------- Agent-loop enums (mirror src/schema/enums.ts, src/agent_loop/types.ts) ----------

export type VerdictNodeKind = 'hypothesis' | 'evidence' | 'method' | 'plan' | 'feedback' | 'root';

export type EdgeKind = 'supports' | 'refutes' | 'derives_from' | 'tests' | 'iterates';

export type AgentStageId =
  | 'stage0_dialogue'
  | 'stage1_understanding'
  | 'stage2_integration'
  | 'stage3_hypothesis'
  | 'stage4_evidence'
  | 'stage5_plan'
  | 'stage6_feedback';

export type PayloadKind =
  | 'hypothesis'
  | 'experiment'
  | 'observation'
  | 'citation'
  | 'plan'
  | 'feedback'
  | 'understanding'
  | 'integration'
  | 'meta';

export type TerminationReason =
  | 'feedback_converged'
  | 'verdict_confirmed'
  | 'verdict_converged'
  | 'max_iterations'
  | 'max_tokens'
  | 'max_duration'
  | 'error';

// ---------- Shared falsifiability specs (mirror src/falsifiability/types.ts) ----------

export type ThresholdSemantics = 'gt' | 'lt' | 'range';

export interface FalsificationSpec {
  readonly prediction: string;
  readonly metric: string;
  readonly falsificationThreshold: number;
  readonly thresholdSemantics: ThresholdSemantics;
}

export interface ThresholdSpec {
  readonly semantics: ThresholdSemantics;
  readonly value?: number;
  readonly lower?: number;
  readonly upper?: number;
}

// ---------- Evidence graph DTOs (mirror src/api/types.ts) ----------

export interface GraphNodeDto {
  readonly nodeId: string;
  readonly evidenceId: string;
  readonly parentNodeId: string | null;
  readonly nodeKind: string;
  readonly decision: string;
  readonly metricValue: number | null;
  readonly conflictingEvidenceCount: number;
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  readonly decisionTrace: unknown | null;
  readonly createdAt: string;
}

export interface GraphEdgeDto {
  readonly edgeId: string;
  readonly fromNode: string;
  readonly toNode: string;
  readonly edgeKind: EdgeKind;
  readonly weight: number | null;
  readonly createdAt: string;
}

export interface GraphSubtree {
  readonly rootId: string;
  readonly nodes: readonly GraphNodeDto[];
  readonly edges: readonly GraphEdgeDto[];
}

// ---------- Verdict shapes ----------

/** GET /api/v1/verdict/* shape (toDto-mapped). Authority: src/api/routes/verdict.ts. */
export interface HonestVerdictDto {
  readonly verdictId: string;
  readonly evidenceId: string;
  readonly parentNodeId: string | null;
  readonly nodeKind: string;
  readonly decision: VerdictValue;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec | null;
  readonly metricValue: number | null;
  readonly conflictingEvidenceCount: number;
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  readonly sourceAnchor: unknown;
  readonly prevHash: string;
  readonly currentHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Decision-path trace (transparency layer); null on pre-trace rows. */
  readonly decisionTrace: unknown;
}

/** Raw VerdictNode inside POST /api/v1/hypothesize. Authority: src/falsifiability/types.ts. */
export interface VerdictNode {
  readonly verdictId: string;
  readonly evidenceId: string;
  readonly parentVerdictId: string | null;
  readonly nodeKind: VerdictNodeKind;
  readonly verdict: VerdictValue;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec | null;
  readonly metricValue: number | null;
  readonly conflictingEvidenceCount: number;
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  readonly sourceAnchor: unknown;
  readonly replayProver: unknown;
  readonly prevHash: string;
  readonly currentHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface VerdictListResponse {
  readonly items: readonly HonestVerdictDto[];
  readonly count: number;
  readonly limit: number;
  readonly offset: number;
}

// ---------- Agent loop (mirror src/agent_loop/types.ts) ----------

export interface AgentLoopError {
  readonly code: string;
  readonly message: string;
  readonly stageId: AgentStageId | null;
  readonly cause?: unknown;
}

export interface LoopState {
  readonly runId: string;
  readonly iterationsCompleted: number;
  readonly terminated: boolean;
  readonly terminationReason: TerminationReason | null;
  readonly artifacts: readonly unknown[];
  readonly verdictNode: VerdictNode | null;
  readonly error: AgentLoopError | null;
}

/** POST /api/v1/hypothesize request. Authority: src/api/routes/hypothesize.ts. */
export interface HypothesizeRequest {
  readonly researchInput: string;
  readonly mode?: 'full' | 'quick';
  readonly dialogueMode?: 'disabled' | 'enabled';
  /** Client-generated idempotency key (server replays same-key duplicates). */
  readonly idempotencyKey?: string;
}

/** POST /api/v1/hypothesize response. Authority: src/api/types.ts. */
export interface HypothesizeResponse {
  readonly loopState: LoopState;
  readonly graphSubtree: GraphSubtree;
  readonly honestVerdict: VerdictNode | null;
  readonly reproHash: string;
}

// ---------- Probes (bare root, no /api/v1 prefix) ----------

export interface HealthResponse {
  readonly status: 'ok' | 'degraded';
  readonly service: 'far-chain-api';
  readonly timestamp: string;
}

export interface ReadyResponse {
  readonly status: 'ready' | 'not_ready';
  readonly service: 'far-chain-api';
  readonly checks: { readonly database: 'ok' | 'fail' };
  readonly timestamp: string;
}

// ---------- Evidence (mirror src/api/routes/evidence.ts) ----------

export interface EvidenceResponse {
  readonly evidenceId: string;
  readonly callRecordSeq: number;
  readonly stageId: string;
  readonly payloadKind: string;
  readonly evidencePayload: unknown;
  readonly sourceAnchor: unknown;
  readonly createdAt: string;
  readonly verdictNode: HonestVerdictDto | null;
}

export interface EvidenceChainCallRecord {
  readonly seq: number;
  readonly stageId: string;
  readonly payloadKind: string;
  readonly purposeTag: string;
  readonly modelId: string;
  readonly reproHash: string;
  readonly gitCommitSha: string;
  readonly isoTimestamp: string;
  readonly finishReason: string;
  readonly usageTokensTotal: number | null;
  readonly prevHash: string;
  readonly currentHash: string;
  readonly createdAt: string;
}

export interface EvidenceChainResponse {
  readonly headHash: string;
  readonly callRecord: EvidenceChainCallRecord | null;
  readonly graphSubtree: unknown;
}

// ---------- Integrity trust root (mirror src/api/routes/integrity.ts) ----------

export interface IntegrityRootDto {
  readonly merkleRoot: string;
  readonly leafCount: number;
  readonly chainHeadSeq: number | null;
  readonly chainHeadHash: string | null;
}

export interface IntegrityProofDto {
  readonly seq: number;
  readonly leafIndex: number;
  readonly leaf: string;
  readonly siblings: readonly string[];
  readonly expectedRoot: string;
  readonly leafCount: number;
}

export interface ReproReceipt {
  readonly schemaVersion: 1;
  readonly merkleRoot: string;
  readonly leafCount: number;
  readonly chainHeadSeq: number | null;
  readonly chainHeadHash: string | null;
  readonly gitCommitSha: string | null;
  readonly generatedAt: string;
}

// ---------- Benchmark (mirror src/benchmark/types.ts) ----------

export interface BenchmarkEntryDto {
  readonly problemId: string;
  readonly problemTitle: string;
  readonly domain: string;
  readonly science125Tag: string;
  readonly verdict: VerdictValue;
  readonly integrityRoot: string;
  readonly leafCount: number;
  readonly reproHash: string;
  readonly stagesCompleted: number;
  readonly converged: boolean;
  readonly chainVerified: boolean;
  readonly sourceId: string;
}

export interface BenchmarkReportDto {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly problemCount: number;
  readonly entries: readonly BenchmarkEntryDto[];
  readonly suiteIntegrityRoot: string;
  readonly totalLeaves: number;
  readonly verdictDistribution: Readonly<Record<VerdictValue, number>>;
  readonly domainDistribution: Readonly<Record<string, number>>;
  readonly gitCommitSha: string | null;
  readonly honestyNotes: readonly string[];
}

// ---------- Live instruments: court / arena (mirror src/api/internal/*_service.ts) ----------

export interface CourtModelVerdictDto {
  readonly model: string;
  readonly verdict: string | null;
  readonly decisiveRuleId: string | null;
  readonly chainHead: string | null;
  readonly error: string | null;
}

export interface CourtCertificateDto {
  readonly certificateId: string;
  readonly claim: string;
  readonly modelCount: number;
  readonly verdicts: readonly CourtModelVerdictDto[];
  readonly distinctVerdicts: readonly string[];
  readonly agreement: 'unanimous' | 'majority' | 'split';
  readonly honestNote: string;
  readonly datasetSource: DatasetSourceKindWire;
}

export interface RefuteAttemptDto {
  readonly refuter: string;
  readonly verdict: string | null;
  readonly attackLanded: boolean;
  readonly error: string | null;
}

export interface ArenaResultDto {
  readonly arenaId: string;
  readonly hypothesis: string;
  readonly originalVerdict: string | null;
  readonly originalRule: string | null;
  readonly attempts: readonly RefuteAttemptDto[];
  readonly landedCount: number;
  readonly robust: boolean;
  readonly honestNote: string;
  readonly datasetSource: DatasetSourceKindWire;
}

/** GET /api/v1/llm-status — runtime LLM state (never leaks the key). */
export interface LlmStatusDto {
  readonly profile: string | null;
  readonly keyConfigured: boolean;
}

export interface CourtLiveRequest {
  readonly claim: string;
  readonly models: readonly string[];
}

export interface ArenaLiveRequest {
  readonly hypothesis: string;
  readonly refuters: readonly string[];
}

/** Wire enum for dataset provenance labels (IC-11; frontend renders, never infers). */
export type DatasetSourceKindWire = 'online' | 'cached_fixture' | 'replay' | 'fixture';

// ---------- API error envelope (RFC 7807 subset; mirror src/api/types.ts) ----------

export interface ApiErrorResponse {
  readonly error_code: string;
  readonly message: string;
  readonly source_anchor: {
    readonly fileId: string | null;
    readonly stageId: string | null;
    readonly callRecordId: string | null;
  };
  readonly detail?: unknown;
}

// ---------- Research missions (mirror src/research/* + src/api/routes/research.ts) ----------

export interface CreateResearchRequest {
  readonly question: string;
  readonly profile?: 'auto' | 'offline_replay' | string;
  readonly sources?: readonly ('openalex' | 'arxiv' | 'crossref')[];
  readonly maxPerQuery?: number;
  readonly target?: number;
}

export interface CreateResearchResponse {
  readonly runId: string;
  readonly state: string;
  readonly statusUrl: string;
  readonly eventsUrl: string;
}

/** GET /api/v1/research list row. */
export interface ResearchRunListItem {
  readonly runId: string;
  readonly question: string;
  readonly state: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly error: string | null;
}

export interface ResearchRunListResponse {
  readonly runs: readonly ResearchRunListItem[];
}

/** GET /research/:runId/status + the SSE `state` frame. */
export interface ResearchRunStatusSummary {
  readonly runId: string;
  readonly question: string;
  readonly profile: string;
  readonly state: string;
  readonly completedStages: readonly string[];
  readonly remainingStages: readonly string[];
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly error: string | null;
  readonly errorKind: string | null;
  readonly runReady: boolean;
}

/** SSE /research/:runId/events `research` frames (mirror ResearchRunEvent). */
export type ResearchRunEventDto =
  | { readonly type: 'run_started'; readonly runId: string; readonly question: string; readonly at: string; readonly seq: number }
  | { readonly type: 'run_resumed'; readonly runId: string; readonly fromStage: string | null; readonly at: string; readonly seq: number }
  | { readonly type: 'state_changed'; readonly runId: string; readonly from: string; readonly to: string; readonly at: string; readonly seq: number }
  | { readonly type: 'stage_started'; readonly runId: string; readonly stageId: string; readonly at: string; readonly seq: number }
  | { readonly type: 'stage_completed'; readonly runId: string; readonly stageId: string; readonly at: string; readonly seq: number }
  | { readonly type: 'run_completed'; readonly runId: string; readonly runMode: string; readonly at: string; readonly seq: number }
  | { readonly type: 'run_failed'; readonly runId: string; readonly error: string; readonly errorKind: string; readonly at: string; readonly seq: number }
  | { readonly type: 'run_cancelled'; readonly runId: string; readonly at: string; readonly seq: number };

// --- ResearchRun nested shapes (mirror src/research/types.ts) ---

export interface FalsificationMethodDto {
  readonly prediction: string;
  readonly metric: string;
  readonly comparator: ThresholdSemantics;
  readonly value?: number | undefined;
  readonly lower?: number | undefined;
  readonly upper?: number | undefined;
  readonly direction?: string | undefined;
  readonly metricShape?: string | undefined;
}

export interface RetrievedDocumentDto {
  readonly documentId: string;
  readonly sourceType: string;
  readonly sourceName: string;
  readonly persistentIdentifier: string;
  readonly doi: string | null;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly publicationDate: string | null;
}

export interface CorpusSnapshotDto {
  readonly snapshotId: string;
  readonly rootHash: string;
  readonly documentCount: number;
  readonly createdAt: string;
  readonly sourceQueries: readonly string[];
  readonly documents: readonly RetrievedDocumentDto[];
}

export interface EvidenceRelationDto {
  readonly claimId: string;
  readonly documentId: string;
  readonly relation: 'supports' | 'contradicts' | 'contextualizes' | 'methods' | 'insufficient';
  readonly locator: string | null;
  readonly directness: 'direct' | 'indirect' | null;
  readonly studyType: string | null;
  readonly quality: 'high' | 'medium' | 'low' | null;
  readonly uncertainty: string | null;
  readonly extractedBy: 'model' | 'deterministic' | 'human';
  readonly validatedBy: 'deterministic-bind' | 'human' | null;
  readonly validationStatus: 'bound' | 'unbound';
  readonly failureReason: string | null;
}

export interface CitationBindingDto {
  readonly supportingIds: readonly string[];
  readonly counterIds: readonly string[];
  readonly boundSupporting: readonly RetrievedDocumentDto[];
  readonly boundCounter: readonly RetrievedDocumentDto[];
  readonly unbound: readonly string[];
  readonly allBound: boolean;
  readonly snapshotId: string;
  readonly relations: readonly EvidenceRelationDto[];
}

export interface CitationGateReportDto {
  readonly boundRate: number;
  readonly totalCited: number;
  readonly boundCount: number;
  readonly unboundEvidenceCount: number;
  readonly resolvedViaRetrieval: readonly string[];
  readonly perHypothesis: Readonly<Record<string, { readonly allBound: boolean; readonly unbound: readonly string[] }>>;
  readonly primaryRequiresAllBound: boolean;
  readonly primaryAllBound: boolean;
  readonly gateVerdict: 'PASS' | 'DEGRADED' | 'INCONCLUSIVE';
}

export interface FalsifiabilityGateReportDto {
  readonly perHypothesis: Readonly<Record<string, { readonly passed: boolean; readonly errors: readonly string[] }>>;
  readonly allPassed: boolean;
}

export interface HypothesisCandidateDto {
  readonly id: string;
  readonly statement: string;
  readonly mechanism: string;
  readonly falsificationMethod: FalsificationMethodDto;
  readonly supportingCitations: readonly string[];
  readonly counterEvidenceCitations: readonly string[];
  readonly relationToExistingTheory: string;
  readonly alternativeExplanations: readonly string[];
  readonly observablePredictions: readonly string[];
  readonly distinguishingObservations: readonly string[];
  readonly noveltyRelativeToCorpus: string;
  readonly assumptions: readonly string[];
  readonly risks: readonly string[];
  readonly strategyOrigin?: string | undefined;
}

export type CritiqueDimension =
  | 'falsifiability'
  | 'novelty'
  | 'counter_evidence'
  | 'causation'
  | 'selective_reporting'
  | 'data_availability'
  | 'confounding'
  | 'citation_mismatch'
  | 'overreach'
  | 'ethics';

export interface CritiqueFindingDto {
  readonly dimension: CritiqueDimension;
  readonly finding: string;
  readonly severity: 'critical' | 'major' | 'minor';
}

export interface CritiqueReportDto {
  readonly hypothesisId: string;
  readonly findings: readonly CritiqueFindingDto[];
  readonly sameModelAsGenerator: boolean;
}

export type ScoreGrade = 'A' | 'B' | 'C' | 'D' | 'F' | 'NOT_APPLICABLE';

export interface ScorecardDimensionDto {
  readonly name: string;
  readonly grade: ScoreGrade;
  readonly rationale: string;
  readonly source: 'deterministic' | 'model' | 'human';
}

export interface HypothesisScorecardDto {
  readonly hypothesisId: string;
  readonly dimensions: readonly ScorecardDimensionDto[];
  readonly paretoOptimal: boolean;
  readonly keyEvidenceToChangeConclusion: string;
}

export interface ResearchPlanDto {
  readonly objectives: readonly string[];
  readonly primaryHypothesisId: string;
  readonly alternativeHypothesisIds: readonly string[];
  readonly preregisteredPredictions: readonly string[];
  readonly dataRequirements: readonly string[];
  readonly inclusionExclusionCriteria: readonly string[];
  readonly variables: readonly string[];
  readonly design: string;
  readonly analysisDag: readonly string[];
  readonly tools: readonly string[];
  readonly statisticalMethods: readonly string[];
  readonly sampleSizeRationale: string;
  readonly multiplicityHandling: string;
  readonly missingOutlierStrategy: string;
  readonly stoppingConditions: readonly string[];
  readonly checkpoints: readonly string[];
  readonly budget: string;
  readonly risks: readonly string[];
  readonly reproducibility: readonly string[];
  readonly nextRoundDecisionRules: readonly string[];
  readonly humanApprovalRequired: readonly string[];
}

export interface FeedbackSignalDto {
  readonly source: 'human' | 'literature' | 'tool' | 'analysis';
  readonly actor: string;
  readonly receivedAt: string;
  readonly affectsHypothesisIds: readonly string[];
  readonly changesScore: boolean;
  readonly triggers: readonly ('new_retrieval' | 'alternative_hypothesis' | 'plan_rewrite' | 'none')[];
  readonly text: string;
}

export interface RevisionDto {
  readonly id: string;
  readonly parentRevisionId: string | null;
  readonly number: number;
  readonly feedback: FeedbackSignalDto;
  readonly hypothesisChanges: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly downgraded: readonly string[];
  };
  readonly planChanges: readonly string[];
  readonly metricChanges: readonly string[];
  readonly unresolvedConflicts: readonly string[];
  readonly beforePlan: ResearchPlanDto | null;
  readonly afterPlan: ResearchPlanDto | null;
  readonly createdAt: string;
}

export interface ObservationDto {
  readonly id: string;
  readonly adapter: string;
  readonly affectsHypothesisIds: readonly string[];
  readonly result: unknown;
  readonly datasetCard: unknown;
  readonly mode: string;
  readonly producedAt: string;
}

export interface ProvenanceReceiptDto {
  readonly runId: string;
  readonly stageId: string;
  readonly stageVersion: number;
  readonly attempt: number;
  readonly sequence: number;
  readonly component: 'model' | 'retrieval' | 'deterministic';
  readonly mode: string;
}

export interface EnvironmentFingerprintDto {
  readonly gitCommit: string | null;
  readonly gitDirty: boolean | null;
  readonly nodeVersion: string;
  readonly platform: string;
  readonly lockfileHash: string | null;
  readonly packageVersion: string | null;
}

export interface ResearchabilityReportDto {
  readonly question: string;
  readonly verdict: 'RESEARCHABLE' | 'LIMITED' | 'UNSUPPORTED';
  readonly reasons: readonly string[];
  readonly safetyRisks: readonly string[];
  readonly scope: {
    readonly domain: string | null;
    readonly domainHints: readonly string[];
    readonly questionLength: number;
  };
  readonly decomposition: {
    readonly knownFacts: readonly string[];
    readonly unknownVariables: readonly string[];
    readonly keyDefinitions: readonly string[];
    readonly observables: readonly string[];
    readonly candidateMechanisms: readonly string[];
    readonly mainstreamTheories: readonly string[];
    readonly alternativeTheories: readonly string[];
    readonly retrievalSubquestions: readonly string[];
    readonly confounders: readonly string[];
    readonly dataRequirements: readonly string[];
  } | null;
  readonly requiresEthicsGate: boolean;
  readonly assessedAt: string;
  readonly schemaVersion: number;
}

export interface DiscoveryBlockDto {
  readonly strategy: 'legacy' | 'multi_strategy';
  readonly fanout: {
    readonly strategiesPlanned: readonly string[];
    readonly perStrategy: readonly {
      readonly strategyId: string;
      readonly contributed: number;
      readonly error: string | null;
      readonly skipReason: string | null;
    }[];
    readonly exactDuplicatesDropped: number;
    readonly finalCount: number;
    readonly quotaShortfall: number;
  } | null;
  readonly tournament: {
    readonly ratings: readonly {
      readonly id: string;
      readonly strategyOrigin: string | null;
      readonly elo: number;
      readonly wins: number;
      readonly draws: number;
      readonly losses: number;
      readonly rank: number;
    }[];
    readonly meta: {
      readonly rounds: number;
      readonly degenerate: boolean;
    };
  } | null;
}

/** GET /research/:runId frozen run (200 only when COMPLETED; 409 otherwise). */
export interface ResearchRunDto {
  readonly runId: string;
  readonly question: string;
  readonly gateReport: ResearchabilityReportDto;
  readonly corpus: CorpusSnapshotDto;
  readonly hypotheses: readonly HypothesisCandidateDto[];
  readonly bindings: Readonly<Record<string, CitationBindingDto>>;
  readonly critiques: Readonly<Record<string, CritiqueReportDto>>;
  readonly scorecards: Readonly<Record<string, HypothesisScorecardDto>>;
  readonly discovery: DiscoveryBlockDto | null;
  readonly plan: ResearchPlanDto;
  readonly revisions: readonly RevisionDto[];
  readonly observations: readonly ObservationDto[];
  readonly stageReceipts: readonly ProvenanceReceiptDto[];
  readonly citationGate: CitationGateReportDto;
  readonly falsifiabilityGate: FalsifiabilityGateReportDto;
  readonly environment: EnvironmentFingerprintDto;
  readonly modes: {
    readonly modelExecutionMode: string;
    readonly retrievalExecutionMode: string;
    readonly experimentExecutionMode: string;
  };
  readonly runMode: RunModeValue;
  readonly startedAt: string;
  readonly schemaVersion: number;
}

// --- Research mutation responses ---

export interface FeedbackRequest {
  readonly source: 'human' | 'literature' | 'tool' | 'analysis';
  readonly actor: string;
  readonly text: string;
  readonly affectsHypothesisIds?: readonly string[];
  readonly changesScore?: boolean;
  readonly triggers?: readonly ('new_retrieval' | 'alternative_hypothesis' | 'plan_rewrite' | 'none')[];
}

export interface FeedbackResponse {
  readonly runId: string;
  readonly revision: RevisionDto;
  readonly planChanges: readonly string[];
  readonly unresolvedConflicts: readonly string[];
}

export interface AnalyzeResponse {
  readonly runId: string;
  readonly observation: ObservationDto;
  readonly feedback: FeedbackSignalDto;
  readonly revision: RevisionDto;
}

export interface CancelResearchResponse {
  readonly runId: string;
  readonly cancelled: boolean;
  readonly state: string;
}

/** GET /research/:runId/evaluate — program-computed metrics + recompute. */
export interface EvaluateResponse {
  readonly runId: string;
  readonly question: string;
  readonly computedAt: string;
  readonly metrics: readonly {
    readonly name: string;
    readonly value: number | boolean | null;
    readonly definition: string;
  }[];
  readonly deterministicRecompute: 'PASS' | 'FAIL' | 'NOT_RUN';
  readonly humanRubricMetrics: readonly string[];
  readonly schemaVersion: number;
  readonly verification: {
    readonly status: 'PASS' | 'FAIL';
    readonly failures: readonly string[];
    readonly verified: readonly string[];
    readonly notVerifiable: readonly string[];
  };
}

// ---------- V2 receipts (mirror src/api/routes/v2_receipts*.ts, src/v2_domain/*) ----------

export interface V2AssuranceDimensionResult {
  readonly dimension: string;
  readonly outcome: 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'NOT_APPLICABLE';
  readonly reasonCodes: readonly string[];
  readonly detail: string;
}

export interface V2VerificationResult {
  readonly resultVersion: number;
  readonly resultId: string;
  readonly receiptId: string;
  readonly verificationPolicyId: string;
  readonly evaluatedAt: string;
  readonly dimensions: Readonly<Record<string, V2AssuranceDimensionResult>>;
  readonly receiptStanding: string;
  readonly preservationStatus: string;
  readonly reviewSummary: string;
}

export interface V2ManifestMember {
  readonly kind: string;
  readonly digest: string;
  readonly sizeBytes: number;
}

export interface V2DemoReceipt {
  readonly receiptId: string;
  readonly claimText: string;
  readonly verdictLabel: string;
  readonly isFixtureOnly: boolean;
  readonly manifestMembers: readonly V2ManifestMember[];
}

export interface V2StoredReceipt {
  readonly id: string;
  readonly claimId: string;
  readonly claimText: string;
  readonly verdict: string;
  readonly proofHash: string;
  readonly schemaVersion: string;
  readonly createdAt: string;
  readonly receiptStanding: string;
  readonly preservationStatus: string;
}

export interface V2ReceiptListResponse {
  readonly receipts: readonly V2StoredReceipt[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface V2VerifyEnvelopeResponse {
  readonly verification: V2VerificationResult;
  readonly display: string;
}

export interface V2DemoReceiptResponse {
  readonly receipt: V2DemoReceipt;
  readonly verification: V2VerificationResult;
}

export interface V2PersistReceiptRequest {
  readonly proofHash: string;
  readonly schemaVersion: string;
  readonly claimId: string;
  readonly claimText: string;
  readonly verdict: string;
  readonly manifestMembers?: readonly V2ManifestMember[];
  readonly contractBindings?: readonly { readonly bindingSetJson: string; readonly digest: string }[];
}

export interface V2PersistReceiptResponse {
  readonly receiptId: string;
  readonly idempotent: boolean;
}

export interface V2ReceiptDetailResponse {
  readonly receipt: V2StoredReceipt;
  readonly manifestMembers: readonly V2ManifestMember[];
  readonly latestVerification: {
    readonly id: number;
    readonly receiptId: string;
    readonly policyId: string;
    readonly evaluatedAt: string;
    readonly result: V2VerificationResult;
    readonly allPass: boolean;
  } | null;
}

// ---------- Global SSE event stream (mirror src/agent_loop/events.ts) ----------

export type AgentEventDto =
  | { readonly type: 'run_started'; readonly runId: string; readonly ts: string; readonly researchInputHash: string; readonly maxIterations: number; readonly verdictDriven: boolean }
  | { readonly type: 'stage_started'; readonly runId: string; readonly iteration: number; readonly stageId: AgentStageId; readonly ts: string }
  | { readonly type: 'stage_completed'; readonly runId: string; readonly iteration: number; readonly stageId: AgentStageId; readonly payloadKind: PayloadKind; readonly degraded: boolean; readonly tokens: number; readonly contentHash: string; readonly ts: string }
  | { readonly type: 'iteration_completed'; readonly runId: string; readonly iteration: number; readonly tokensConsumed: number; readonly continueIteration: boolean; readonly verdict: VerdictValue | null; readonly decisiveRuleId: string | null; readonly ts: string }
  | { readonly type: 'run_completed'; readonly runId: string; readonly reason: TerminationReason; readonly iterations: number; readonly artifactCount: number; readonly verdict: VerdictValue | null; readonly decisiveRuleId: string | null; readonly ts: string }
  | { readonly type: 'run_error'; readonly runId: string; readonly code: string; readonly message: string; readonly iterations: number; readonly artifactCount: number; readonly ts: string }
  | { readonly type: 'stage_held'; readonly runId: string; readonly iteration: number; readonly stageId: AgentStageId; readonly ts: string }
  | { readonly type: 'stage_resumed'; readonly runId: string; readonly iteration: number; readonly stageId: AgentStageId; readonly ts: string };

// ---------- Lifecycle events (mirror src/api/routes/lifecycle.ts) ----------

export interface LifecycleEventsResponse {
  readonly targetKind: string;
  readonly targetId: string;
  readonly events: readonly {
    readonly eventId: string;
    readonly targetKind: string;
    readonly targetId: string;
    readonly fromState: string;
    readonly toState: string;
    readonly actor: string;
    readonly reason: string;
    readonly prevHash: string;
    readonly currentHash: string;
    readonly createdAt: string;
  }[];
}
