/**
 * research/evaluation/rediscovery/types — retrospective rediscovery benchmark
 * v1 (directive §4.1 temporal-holdout replay + §4.2 N>=5/bootstrap CI rule).
 *
 * WHAT THIS IS: the FRAMEWORK for replaying scientific discovery under a
 * temporal holdout — freeze the corpus at a cutoff date T, let the engine
 * produce hypotheses from pre-T information only, then match those hypotheses
 * against discoveries actually published AFTER T.
 *
 * WHAT THIS IS NOT (honesty red lines, enforced structurally below):
 *   - It is NOT a "discovery capability score". There is no such field, and
 *     renderers refuse to emit one (FORBIDDEN_SCORE_TERMS).
 *   - A hit is NOT a prophecy: the language model may have memorized
 *     post-cutoff knowledge from pretraining. Every report therefore CARRIES
 *     a mandatory leakage-assessment section (§4.1 honesty rule).
 *   - Single-run numbers never aggregate into a mean: multiRunReport refuses
 *     (INSUFFICIENT_N) below N=5 independent runs (§4.2 补遗).
 *   - Targets I could not fully verify are flagged UNVERIFIED with a note;
 *     DOIs are only populated when high-confidence (doiStatus distinguishes).
 *
 * Embeddings are NOT used in any matching verdict (brief rule): the matcher is
 * keyword + citation + conservative-synonym-token-overlap, fully deterministic.
 */

import type { RetrievedDocument } from '../../../retrieval/types.ts';

/** Provenance honesty for a target discovery's bibliographic identity. */
export type DoiStatus = 'CONFIRMED' | 'UNCONFIRMED';

/** Whether the discovery itself (post-cutoff fact) is established knowledge. */
export type TargetVerificationStatus = 'VERIFIED_DISCOVERY' | 'UNVERIFIED';

/**
 * One post-cutoff discovery the replay tries to anticipate.
 * `publishedAfter` MUST be strictly later than the spec's cutoffDate.
 */
export interface TargetDiscovery {
  readonly id: string;
  /** What was actually discovered after the cutoff (one falsifiable statement). */
  readonly statement: string;
  /** ISO date (yyyy-mm-dd) of the publication that established it. */
  readonly publishedAfter: string;
  /** DOI when high-confidence; null otherwise (NEVER fabricated). */
  readonly doi: string | null;
  readonly doiStatus: DoiStatus;
  readonly verificationStatus: TargetVerificationStatus;
  /** Free-text note; mandatory for UNVERIFIED targets (why it is unverified). */
  readonly unverifiedNote: string | null;
  /**
   * Keyword phrases a hypothesis may use to express the target direction.
   * Multi-word phrases are matched as contiguous normalized token runs.
   */
  readonly matchKeywords: readonly string[];
  /**
   * Conservative synonym table (keyword -> alternative phrases) for the L3
   * weak-evidence matcher only. Deterministic, human-curated, no embeddings.
   */
  readonly synonyms: Readonly<Record<string, readonly string[]>>;
  /**
   * documentIds (computed, hash-derived) of the pre-cutoff documents that
   * ground this target direction — used by the L2 citation matcher.
   */
  readonly groundingDocumentIds: readonly string[];
}

/** Run configuration recorded inside the spec (replay bookkeeping). */
export interface TemporalRunConfig {
  readonly targetHypothesisCount: number;
  /**
   * Hypothesis-generation strategy used by the replayed pipeline. v1 fixtures
   * use 'legacy' (single-shot research_hypotheses fixture) — recorded here so
   * the report never hides which engine path produced the hypotheses.
   */
  readonly hypothesisGenerationStrategy: 'legacy' | 'multi_strategy';
  readonly maxPerQuery: number;
}

/**
 * A temporal-holdout replay specification (one domain, one cutoff).
 * The corpus fixture must contain ONLY documents with publicationDate <=
 * cutoffDate — enforceTemporalCutoff drops and COUNTS any violation (never
 * silently keeps post-cutoff text: that would fake the holdout).
 */
export interface TemporalHoldoutSpec {
  readonly specId: string;
  readonly domain: string;
  readonly researchQuestion: string;
  readonly cutoffDate: string;
  readonly corpusFixture: readonly RetrievedDocument[];
  readonly targetDiscoveries: readonly TargetDiscovery[];
  readonly runConfig: TemporalRunConfig;
  /**
   * offline_replay fixtures (stageId -> JSON string) driving runResearch.
   * Built by the loader in targets.ts so supportingCitations carry COMPUTED
   * documentIds (never hand-written ids — citation binding stays a real
   * set-membership check).
   */
  readonly llmFixtures: Readonly<Record<string, string>>;
}

/** Match verdict levels, strongest first (a hit is the highest level reached). */
export type MatchLevel = 'L1_KEYWORD' | 'L2_CITATION' | 'L3_SEMANTIC' | 'NO_MATCH';

/** Per-target outcome of one replay. */
export interface TargetMatchResult {
  readonly targetId: string;
  readonly verificationStatus: TargetVerificationStatus;
  readonly doi: string | null;
  readonly doiStatus: DoiStatus;
  readonly matched: boolean;
  readonly matchLevel: MatchLevel;
  /** Content-addressed hypothesis id of the best-matching hypothesis (null if none). */
  readonly matchedHypothesisId: string | null;
  /** Keywords/synonym-phrases that fired at the winning level (evidence trail). */
  readonly matchedKeywords: readonly string[];
  /** Lead time in months: publishedAfter - cutoffDate (the holdout width for this target). */
  readonly leadTimeMonths: number;
}

/**
 * The leakage-assessment section, MANDATORY on every report (§4.1:
 * "命中≠预言 … 显式披露泄漏风险并做对照").
 */
export interface LeakageAssessment {
  /** Fixed disclaimer text; every renderer must emit it verbatim. */
  readonly disclaimer: string;
  /** Status of the "ask the model directly: do you know X?" contrast probe. */
  readonly directRecallProbe: {
    readonly status: 'NOT_RUN_OFFLINE' | 'LIVE_COMPLETED' | 'BLOCKED';
    /** The probe questions that WOULD be (or were) asked, one per target. */
    readonly probeQuestions: readonly string[];
    /** Probe outcomes; null until a LIVE probe actually ran (never faked). */
    readonly results: readonly { readonly targetId: string; readonly recalled: boolean }[] | null;
  };
  /** Offline replay can never exclude pretraining leakage. */
  readonly pretrainingLeakageRisk: 'CANNOT_BE_EXCLUDED_OFFLINE' | 'PROBED_LIVE';
}

/** Corpus cutoff-enforcement bookkeeping (the holdout's own audit trail). */
export interface CorpusCutoffStats {
  readonly inputDocumentCount: number;
  readonly retainedDocumentCount: number;
  readonly droppedPostCutoffDocumentCount: number;
  readonly cutoffDate: string;
}

/** One replay's full report. No score fields by design. */
export interface RediscoveryReport {
  readonly specId: string;
  readonly domain: string;
  readonly cutoffDate: string;
  readonly runMode: string;
  readonly corpusStats: CorpusCutoffStats;
  readonly targetResults: readonly TargetMatchResult[];
  /** matched targets / total targets in THIS single run (single run: §4.2 forbids treating it as an aggregate claim). */
  readonly hitRate: number;
  /** Match-level breakdown (honest granularity, not a blended score). */
  readonly matchLevelCounts: Readonly<Record<MatchLevel, number>>;
  readonly leakageAssessment: LeakageAssessment;
  /** sha256 over canonical JSON of the match-relevant fields — replays must reproduce it. */
  readonly replayChecksum: string;
  readonly generatedAt: string;
}

/** Bootstrap CI for one metric. */
export interface BootstrapCi {
  readonly lower: number;
  readonly upper: number;
  readonly method: 'percentile-bootstrap';
  readonly iterations: number;
  readonly seed: number;
  /** Resampling unit — recorded because it is a methodological choice. */
  readonly unit: 'run';
}

/** Aggregated per-metric stats for a multi-run report. */
export interface MetricAggregate {
  readonly n: number;
  readonly mean: number;
  readonly ci95: BootstrapCi;
}

/**
 * Multi-run aggregation (§4.2 补遗: N>=5 or refuse). With n < 5 the aggregates
 * are null and status is INSUFFICIENT_N — the framework refuses to emit means.
 */
export interface MultiRunReport {
  readonly n: number;
  readonly status: 'INSUFFICIENT_N' | 'REPORTED';
  readonly minimumN: 5;
  readonly perSpecHitRates: readonly { readonly specId: string; readonly hitRate: number }[];
  /** null unless status REPORTED. */
  readonly overallHitRate: MetricAggregate | null;
  readonly perDomain: readonly {
    readonly domain: string;
    readonly runs: number;
    readonly targets: number;
    readonly matched: number;
  }[];
  readonly leakageAssessment: LeakageAssessment;
  /** Static statistical-power caveat (§4.5 补遗 R8 ①): N=5 detects only large effects. */
  readonly powerCaveat: string;
  readonly generatedAt: string;
}

// ─── Honesty constants (single source of truth for engine + tests) ──────────

/**
 * Phrases no renderer may emit — this framework reports hit rates with CIs
 * and leakage statements, never a "discovery capability score". Anti-Goodhart.
 */
export const FORBIDDEN_SCORE_TERMS: readonly string[] = [
  'discovery capability score',
  'capability score',
  'discovery score',
  'overall score',
  '发现能力分数',
];

/** The mandatory leakage disclaimer (§4.1 honesty rule), verbatim in output. */
export const LEAKAGE_DISCLAIMER =
  'LEAKAGE ASSESSMENT (mandatory): a keyword/citation hit is NOT a prophecy. ' +
  'The replayed model may have memorized post-cutoff knowledge during pretraining; ' +
  'an offline replay cannot exclude this. The direct-recall contrast probe ' +
  '("ask the model directly: do you know X?") must run LIVE to separate memory ' +
  'from derivation; until then every hit carries unexcluded leakage risk.';

/** Statistical-power caveat pinned from §4.5 补遗 R8 ①. */
export const POWER_CAVEAT =
  'Power caveat: bootstrap 95% CI at N=5 detects only large effects ' +
  '(~50% power at d>=1.5). Results below 80% power are directional signals, ' +
  'NOT statistically confirmed differences.';

/** Minimum N for any aggregate (§4.2 补遗: 强制 N≥5，单次运行数字禁入报告). */
export const MINIMUM_N = 5 as const;

// ─── Matcher thresholds (deterministic; recorded in reports via tests) ──────

/** Direct keyword-phrase hits required for the strong (L1) verdict. */
export const MIN_L1_KEYWORD_HITS = 2;
/** Direct keyword-phrase hits required alongside a grounding citation (L2). */
export const MIN_L2_KEYWORD_HITS = 1;
/**
 * Token-overlap (Jaccard) floor for the weak (L3) synonym verdict.
 * Calibration: a genuine paraphrase of the target statement shares few tokens
 * once set-size dilution kicks in (~0.07 for a one-line hypothesis vs a
 * one-line target), while a coincidental synonym-table hit shares ~0 content
 * tokens (jaccard ~ 0). 0.05 separates those regimes; it is NOT tuned per
 * fixture — the synonym table being human-curated and tiny is the real
 * anti-false-positive control, this floor is the backstop.
 */
export const MIN_L3_JACCARD = 0.05;
