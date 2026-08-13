/**
 * research/types — Track 1A "scientific hypothesis generation & research-plan
 * design" domain types (directive §7/§9).
 *
 * FAR-Lab's track-1A surface sits ABOVE the deterministic verdict kernel: given
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
import type { CorpusSnapshot } from '../retrieval/corpus.ts';
import type { RetrievedDocument } from '../retrieval/types.ts';
import type { EnvironmentFingerprint, StageReceipt } from './provenance.ts';
import type { ResearchabilityReport } from './researchability_gate.ts';

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
 * and rollback-referencable: each carries a parent id and a before/after diff.
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
  /** ISO timestamp. */
  readonly createdAt: string;
}

/**
 * The orchestrated result of one Track-1A research run (the vertical slice).
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
  /** The structured research plan. */
  readonly plan: ResearchPlan;
  /** Revisions in order (may be empty before feedback). */
  readonly revisions: readonly Revision[];
  /** Per-stage provenance receipts (directive §3.3). */
  readonly stageReceipts: readonly StageReceipt[];
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

export { FalsificationMethod };
export type { EnvironmentFingerprint, StageReceipt } from './provenance.ts';
export type {
  ProblemDecomposition,
  ResearchabilityReport,
  ResearchabilityVerdict,
  ResearchScope,
} from './researchability_gate.ts';
