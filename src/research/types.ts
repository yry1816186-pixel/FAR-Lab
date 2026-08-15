/**
 * research/types — research "scientific hypothesis generation & research-plan
 * design" domain types (directive §7/§9).
 *
 * FAR-Lab's research surface sits ABOVE the deterministic verdict kernel: given
 * a scientific question, it grounds the question in real literature, generates
 * several mechanistically-distinct candidate hypotheses, critiques them
 * independently, scores them on a multi-dimensional scorecard, and designs a
 * structured, executable research plan. The verdict kernel / FEC / proof
 * envelope remain the trust layer underneath (they are NOT redefined here).
 *
 * Reuse discipline (§7 "no parallel schema"): this module REUSES
 *   - FalsificationMethod (agent_loop/types) — the single falsifiability contract
 *   - RetrievedDocument / CorpusSnapshot (retrieval) — the grounded evidence set
 * and does not redefine them. The types below are the hypothesis/plan layer
 * only, which has no pre-existing equivalent in the codebase.
 *
 * Provenance discipline (§3.2/§3.3): every run records per-component run modes
 * (modelExecutionMode / retrievalExecutionMode / experimentExecutionMode) and
 * the aggregate runMode. A run is LIVE only when every science-affecting
 * component is LIVE.
 */

import type { FalsificationMethod } from '../agent_loop/types.ts';
import type { StrategyId } from '../discovery/types.ts';
import type { CorpusSnapshot } from '../retrieval/corpus.ts';
import type { RetrievedDocument } from '../retrieval/types.ts';
import type { EnvironmentFingerprint, ProvenanceReceipt } from './provenance.ts';
import type { ResearchabilityReport } from './researchability_gate.ts';
import type { Observation } from './experiment.ts';

/** Per-component execution mode (directive §3.2). */
export type ComponentMode =
  | 'LIVE'
  | 'RECORDED_REPLAY'
  | 'SYNTHETIC_TEST'
  | 'OFFLINE_DEVELOPMENT'
  | 'NOT_EXECUTED';

/** Aggregate run mode (directive §3.2). */
export type RunMode =
  | 'LIVE'
  | 'MIXED'
  | 'RECORDED_REPLAY'
  | 'SYNTHETIC_TEST'
  | 'OFFLINE_DEVELOPMENT';

/**
 * Citation binding for one hypothesis (program-computed, never LLM-supplied).
 * A hypothesis may only cite documentIds that RESOLVE in the corpus snapshot
 * that grounded it (directive §9.5). Unbound citations cannot be evidence.
 */
export interface CitationBinding {
  /** DocumentIds cited as SUPPORTING the hypothesis. */
  readonly supportingIds: readonly string[];
  /** DocumentIds cited as CONTRADICTING / counter-evidence. */
  readonly counterIds: readonly string[];
  /** Supporting citations that resolve in the corpus. */
  readonly boundSupporting: readonly RetrievedDocument[];
  /** Counter citations that resolve in the corpus. */
  readonly boundCounter: readonly RetrievedDocument[];
  /** Cited ids that do NOT resolve (cannot serve as evidence). */
  readonly unbound: readonly string[];
  /** True iff every cited id resolved (0 unbound). */
  readonly allBound: boolean;
  /** The corpus snapshotId these citations were checked against. */
  readonly snapshotId: string;
  /**
   * Claim→document relations derived from the citation lists (directive §9.5
   * EvidenceRelation): supports for supporting ids, contradicts for counter
   * ids. Fields the model never extracted (locator/studyType/quality/…) are
   * honest nulls — nothing is invented.
   */
  readonly relations: readonly EvidenceRelation[];
}

/**
 * One claim↔document evidence relation (directive §9.5). The relation names
 * what role the document plays for the claim, plus who extracted/validated it
 * and whether the binding resolved. Unbound relations carry
 * validationStatus='unbound' + a failureReason and are NEVER effective
 * evidence.
 */
export interface EvidenceRelation {
  /** The claim (hypothesis) id. */
  readonly claimId: string;
  /** The cited documentId. */
  readonly documentId: string;
  /** The role the document plays for the claim. */
  readonly relation: 'supports' | 'contradicts' | 'contextualizes' | 'methods' | 'insufficient';
  /** In-document locator (section/figure/table) — null when not extracted. */
  readonly locator: string | null;
  /** Whether the document directly measures the claim's variables. */
  readonly directness: 'direct' | 'indirect' | null;
  /** Study type (RCT/observational/meta-analysis/…) — null when not extracted. */
  readonly studyType: string | null;
  /** Evidence-quality assessment — null when not assessed. */
  readonly quality: 'high' | 'medium' | 'low' | null;
  /** Uncertainty notes — null when none recorded. */
  readonly uncertainty: string | null;
  /** Who produced the relation. */
  readonly extractedBy: 'model' | 'deterministic' | 'human';
  /** Who validated the binding. */
  readonly validatedBy: 'deterministic-bind' | 'human' | null;
  /** Whether the documentId resolved in the corpus (bound) or not (unbound). */
  readonly validationStatus: 'bound' | 'unbound';
  /** Why it is unbound (null when bound). */
  readonly failureReason: string | null;
}

/**
 * The deterministic citation gate report (directive §9.5): the run-level
 * accounting of bound vs unbound citations. Accepted claims must be 100%
 * bound; unbound citations are excluded from effective evidence and named.
 */
export interface CitationGateReport {
  /** bound / total cited (1.0 when nothing was cited). */
  readonly boundRate: number;
  /** Total distinct ids cited across all hypotheses. */
  readonly totalCited: number;
  /** Distinct cited ids that resolved. */
  readonly boundCount: number;
  /** Unbound citations that were excluded from effective evidence. */
  readonly unboundEvidenceCount: number;
  /** Unbound ids that were re-resolved via authoritative retrieval. */
  readonly resolvedViaRetrieval: readonly string[];
  /** Per-hypothesis binding outcome. */
  readonly perHypothesis: Readonly<
    Record<string, { readonly allBound: boolean; readonly unbound: readonly string[] }>
  >;
  /** Whether primary-hypothesis selection requires allBound (always true). */
  readonly primaryRequiresAllBound: boolean;
  /** Whether the selected primary hypothesis is fully bound. */
  readonly primaryAllBound: boolean;
  /** PASS = all bound · DEGRADED = some unbound but primary bound · INCONCLUSIVE = no fully-bound candidate. */
  readonly gateVerdict: 'PASS' | 'DEGRADED' | 'INCONCLUSIVE';
}

/**
 * The deterministic falsifiability gate report (directive §9.6/§9.7): each
 * candidate's falsification method is validated by the kernel gate (not the
 * model). A hypothesis whose method fails the gate cannot be selected as
 * primary.
 */
export interface FalsifiabilityGateReport {
  /** Per-hypothesis gate outcome. */
  readonly perHypothesis: Readonly<
    Record<string, { readonly passed: boolean; readonly errors: readonly string[] }>
  >;
  /** True iff every candidate passed. */
  readonly allPassed: boolean;
}

/**
 * A candidate scientific hypothesis (directive §9.6).
 *
 * `id` is a PROGRAM-GENERATED content hash (statement+mechanism) — never an
 * LLM-minted identifier — so it is stable and reproducible. The falsification
 * method is the single contract that the falsifiability gate enforces.
 */
export interface HypothesisCandidate {
  /** Deterministic content-addressed id (sha256 of statement + mechanism). */
  readonly id: string;
  /** The hypothesis statement. */
  readonly statement: string;
  /** The causal mechanism / key assumptions behind the hypothesis. */
  readonly mechanism: string;
  /** Falsifiability contract (metric + threshold + comparator). */
  readonly falsificationMethod: FalsificationMethod;
  /** Corpus documentIds cited as supporting evidence. */
  readonly supportingCitations: readonly string[];
  /** Corpus documentIds cited as counter-evidence (self-reported). */
  readonly counterEvidenceCitations: readonly string[];
  /** Relationship to existing theory. */
  readonly relationToExistingTheory: string;
  /** Alternative explanations that could produce the same observation. */
  readonly alternativeExplanations: readonly string[];
  /** Observable predictions the hypothesis makes. */
  readonly observablePredictions: readonly string[];
  /** Observations that would distinguish this hypothesis from its rivals. */
  readonly distinguishingObservations: readonly string[];
  /** Novelty RELATIVE to the current corpus (never claimed absolute). */
  readonly noveltyRelativeToCorpus: string;
  /** Key assumptions that, if false, break the hypothesis. */
  readonly assumptions: readonly string[];
  /** Risks / uncertainties / evidence-coverage gaps. */
  readonly risks: readonly string[];
  /**
   * Which discovery strategy produced this candidate (multi-strategy fan-out
   * only; absent on legacy single-shot candidates). Additive optional field —
   * persisted runs from before the discovery layer simply lack it.
   */
  readonly strategyOrigin?: StrategyId | undefined;
}

/** Critique dimensions (directive §9.7). */
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

/** One critique finding from the independent critique pass. */
export interface CritiqueFinding {
  readonly dimension: CritiqueDimension;
  readonly finding: string;
  readonly severity: 'critical' | 'major' | 'minor';
}

/** The independent critique report for one hypothesis (directive §9.7). */
export interface CritiqueReport {
  readonly hypothesisId: string;
  readonly findings: readonly CritiqueFinding[];
  /**
   * Whether the critique was produced by the SAME model as the generator
   * (honesty label — never claim statistical independence when it is the same
   * model, directive §9.7).
   */
  readonly sameModelAsGenerator: boolean;
}

/** Scorecard dimension names (directive §9.8). */
export type ScorecardDimensionName =
  | 'ScientificPlausibility'
  | 'NoveltyRelativeToCorpus'
  | 'Falsifiability'
  | 'EvidenceCoverage'
  | 'CounterEvidenceCoverage'
  | 'Testability'
  | 'DataAvailability'
  | 'MethodologicalSoundness'
  | 'ExecutionCost'
  | 'ExpectedInformationGain'
  | 'Risk';

/** Ordinal grade for a scorecard dimension. */
export type ScoreGrade = 'A' | 'B' | 'C' | 'D' | 'F' | 'NOT_APPLICABLE';

/** Who produced a scorecard dimension (never collapse into one number). */
export type ScoreSource = 'deterministic' | 'model' | 'human';

/** One scored dimension with rationale + provenance of the score. */
export interface ScorecardDimension {
  readonly name: ScorecardDimensionName;
  readonly grade: ScoreGrade;
  readonly rationale: string;
  readonly source: ScoreSource;
}

/** Multi-dimensional scorecard for one hypothesis (directive §9.8). */
export interface HypothesisScorecard {
  readonly hypothesisId: string;
  readonly dimensions: readonly ScorecardDimension[];
  /** Whether this hypothesis is on the Pareto front (no other dominates it). */
  readonly paretoOptimal: boolean;
  /** The single piece of evidence that would most change the conclusion. */
  readonly keyEvidenceToChangeConclusion: string;
}

/**
 * A structured, executable research plan (directive §9.9). Not a list of
 * vague suggestions: it must name data, variables, statistical methods,
 * stopping conditions, and human-approval gates.
 */
export interface ResearchPlan {
  /** Research objectives. */
  readonly objectives: readonly string[];
  /** The selected primary hypothesis id. */
  readonly primaryHypothesisId: string;
  /** Alternative hypotheses kept in the plan (ids). */
  readonly alternativeHypothesisIds: readonly string[];
  /** Pre-registered predictions. */
  readonly preregisteredPredictions: readonly string[];
  /** Data requirements + sources + acquisition method. */
  readonly dataRequirements: readonly string[];
  /** Inclusion / exclusion criteria. */
  readonly inclusionExclusionCriteria: readonly string[];
  /** Variables, units, and data dictionary entries. */
  readonly variables: readonly string[];
  /** Control / randomization design. */
  readonly design: string;
  /** Experiment / analysis DAG (ordered steps). */
  readonly analysisDag: readonly string[];
  /** Tools, dependencies, and versions. */
  readonly tools: readonly string[];
  /** Statistical methods + the assumptions they require. */
  readonly statisticalMethods: readonly string[];
  /** Sample size / power / data-volume rationale. */
  readonly sampleSizeRationale: string;
  /** Multiple-comparison handling. */
  readonly multiplicityHandling: string;
  /** Missing-value and outlier strategy. */
  readonly missingOutlierStrategy: string;
  /** Success / failure / inconclusive / stopping conditions. */
  readonly stoppingConditions: readonly string[];
  /** Intermediate checkpoints. */
  readonly checkpoints: readonly string[];
  /** Cost and resource budget. */
  readonly budget: string;
  /** Risks, ethics, privacy, license considerations. */
  readonly risks: readonly string[];
  /** Reproducibility steps. */
  readonly reproducibility: readonly string[];
  /** Decision rules for the next research round. */
  readonly nextRoundDecisionRules: readonly string[];
  /** Steps that require human approval before execution. */
  readonly humanApprovalRequired: readonly string[];
}

/**
 * A structured feedback signal (directive §9.10). Feedback is not appended to
 * a chat log — it is converted into a typed object that names what it affects.
 */
export interface FeedbackSignal {
  /** Source of the feedback. */
  readonly source: 'human' | 'literature' | 'tool' | 'analysis';
  /** Actor / role that produced it (e.g. "reviewer-1", "bge-reranker"). */
  readonly actor: string;
  /** ISO timestamp the feedback was received. */
  readonly receivedAt: string;
  /** The claim/hypothesis/plan-task ids this feedback affects. */
  readonly affectsHypothesisIds: readonly string[];
  /** Whether the feedback changes a score. */
  readonly changesScore: boolean;
  /** Whether it triggers new retrieval / alternative hypotheses / plan rewrite. */
  readonly triggers: readonly ('new_retrieval' | 'alternative_hypothesis' | 'plan_rewrite' | 'none')[];
  /** The substantive feedback text. */
  readonly text: string;
}

/**
 * An immutable revision (directive §9.10). Revisions are versioned, comparable,
 * and rollback-referencable: each carries a parent id, a before/after plan
 * snapshot (so the diff is recomputable from frozen state, not from prose),
 * and a before/after diff summary.
 */
export interface Revision {
  /** Deterministic revision id (hash of parent + content). */
  readonly id: string;
  /** Parent revision id (null for the first revision). */
  readonly parentRevisionId: string | null;
  /** Revision number (1-based). */
  readonly number: number;
  /** The feedback signal that drove this revision. */
  readonly feedback: FeedbackSignal;
  /** Hypothesis ids added / removed / downgraded. */
  readonly hypothesisChanges: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly downgraded: readonly string[];
  };
  /** Plan changes (human-readable diff summary). */
  readonly planChanges: readonly string[];
  /** Metric changes (never forced to monotonically improve). */
  readonly metricChanges: readonly string[];
  /** Unresolved conflicts left open. */
  readonly unresolvedConflicts: readonly string[];
  /** Frozen plan BEFORE this revision (null for the first revision). */
  readonly beforePlan: ResearchPlan | null;
  /** Frozen plan AFTER this revision (null = not frozen; legacy revisions). */
  readonly afterPlan: ResearchPlan | null;
  /** ISO timestamp. */
  readonly createdAt: string;
}

/**
 * The orchestrated result of one research research run (the vertical slice).
 */
export interface ResearchRun {
  /** Run id (ULID). */
  readonly runId: string;
  /** The scientific question. */
  readonly question: string;
  /** The researchability gate report (the honest first step of the run). */
  readonly gateReport: ResearchabilityReport;
  /** The grounding corpus (supporting + counter-evidence). */
  readonly corpus: CorpusSnapshot;
  /** Candidate hypotheses (3-5, mechanistically distinct). */
  readonly hypotheses: readonly HypothesisCandidate[];
  /** Citation binding per hypothesis. */
  readonly bindings: Readonly<Record<string, CitationBinding>>;
  /** Independent critique per hypothesis. */
  readonly critiques: Readonly<Record<string, CritiqueReport>>;
  /** Scorecards per hypothesis. */
  readonly scorecards: Readonly<Record<string, HypothesisScorecard>>;
  /**
   * Discovery-layer accounting (schema v4): fan-out merge statistics +
   * deterministic tournament ranking. null = the run predates discovery
   * persistence (schema ≤3) — absence of accounting is NOT absence of
   * discovery; legacy-generation runs carry fanout=null.
   */
  readonly discovery: DiscoveryBlock | null;
  /** The structured research plan. */
  readonly plan: ResearchPlan;
  /** Revisions in order (may be empty before feedback). */
  readonly revisions: readonly Revision[];
  /** Real-data/tool observations collected so far (Phase 3 experiment loop). */
  readonly observations: readonly Observation[];
  /** Per-stage provenance receipts (directive §3.3). */
  readonly stageReceipts: readonly ProvenanceReceipt[];
  /** The deterministic citation gate report (v3+; recomputed for v2 files). */
  readonly citationGate: CitationGateReport;
  /** The deterministic falsifiability gate report (v3+; recomputed for v2 files). */
  readonly falsifiabilityGate: FalsifiabilityGateReport;
  /** Software-environment fingerprint (git commit / lockfile / node). */
  readonly environment: EnvironmentFingerprint;
  /** Per-component run modes. */
  readonly modes: {
    readonly modelExecutionMode: ComponentMode;
    readonly retrievalExecutionMode: ComponentMode;
    readonly experimentExecutionMode: ComponentMode;
  };
  /** Aggregate run mode (LIVE only if all components LIVE). */
  readonly runMode: RunMode;
  /** ISO timestamp the run started. */
  readonly startedAt: string;
  /** Schema version of the ResearchRun shape (for migration). */
  readonly schemaVersion: number;
}

/** Which hypothesis-generation path a run used. */
export type HypothesisGenerationStrategy = 'legacy' | 'multi_strategy';

/** Serialized per-strategy fan-out outcome (no volatile provider metadata — that lives in stageReceipts). */
export interface FanoutStrategyReceipt {
  readonly strategyId: StrategyId;
  readonly contributed: number;
  readonly error: string | null;
  readonly skipReason: string | null;
  // ── Generation-side provenance (directive §2.4 minimum fields; optional on
  //    pre-b4 runs = "not recorded then", never fabricated) ──────────────────
  /** sha256 of the strategy's prompt signature — which prompt version ran. */
  readonly strategySignatureHash?: string | null | undefined;
  /** Model id actually invoked (null = skipped/failed/offline fixture). */
  readonly modelId?: string | null | undefined;
  /** Gateway/provider identity of the call. */
  readonly provider?: string | null | undefined;
  /** Sampling temperature explicitly set (null = not set; qwen default 0.3 — see CallMeta). */
  readonly temperature?: number | null | undefined;
  /** Sampling seed (null = not set). */
  readonly seed?: number | null | undefined;
}

/** Schema-v4 projection of the discovery fan-out accounting (directive §2.1/§2.2). */
export interface FanoutReceipt {
  readonly strategiesPlanned: readonly StrategyId[];
  readonly perStrategy: readonly FanoutStrategyReceipt[];
  readonly exactDuplicatesDropped: number;
  readonly paraphraseFlagged: readonly {
    readonly keptId: string;
    readonly droppedId: string;
    readonly similarity: number;
    readonly keptStrategy: StrategyId;
    readonly droppedStrategy: StrategyId;
  }[];
  readonly truncated: readonly { readonly id: string; readonly strategyId: StrategyId }[];
  readonly finalCount: number;
  readonly quotaShortfall: number;
  /** §2.5 dedup guard (b5, optional): marked-only memory duplicates. */
  readonly memoryFlagged?: readonly { readonly id: string; readonly marker: string }[] | undefined;
}

/** Schema-v4 projection of the deterministic tournament (directive §2.2 ranking layer). */
export interface TournamentReceipt {
  readonly ratings: readonly {
    readonly id: string;
    readonly strategyOrigin: StrategyId | null;
    readonly elo: number;
    readonly wins: number;
    readonly draws: number;
    readonly losses: number;
    readonly rank: number;
  }[];
  readonly matches: readonly {
    readonly aId: string;
    readonly bId: string;
    readonly outcome: 'a' | 'b' | 'draw';
    readonly criteria: readonly {
      readonly dimension: string;
      readonly aGrade: ScoreGrade;
      readonly bGrade: ScoreGrade;
      readonly point: 'a' | 'b' | 'none';
    }[];
  }[];
  readonly meta: {
    readonly rounds: number;
    readonly initialRating: number;
    readonly kFactor: number;
    readonly pairingOrder: string;
    readonly degenerate: boolean;
  };
}

/** Discovery-layer accounting persisted on the run (schema v4+). */
export interface DiscoveryBlock {
  readonly strategy: HypothesisGenerationStrategy;
  readonly fanout: FanoutReceipt | null;
  readonly tournament: TournamentReceipt | null;
}

export { FalsificationMethod };
// b6-S1 结构化可裁决性枚举（SSOT 在 agent_loop/types.ts 的 FalsificationMethod 处）。
export type { PredictionDirection, MetricShape } from '../agent_loop/types.ts';
export type { EnvironmentFingerprint, ProvenanceReceipt } from './provenance.ts';
export type {
  ProblemDecomposition,
  ResearchabilityReport,
  ResearchabilityVerdict,
  ResearchScope,
} from './researchability_gate.ts';
export type { Observation } from './experiment.ts';

