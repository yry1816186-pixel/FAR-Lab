/**
 * discovery/adjudication — the KERNEL_ADJUDICATED backflow (directive §2.4).
 *
 * Bridge from a run's deterministic Experiment Observation to the falsifiability
 * verdict kernel and back into the Discovery Registry: when an observation
 * DECISIVELY bears on a hypothesis's falsifiable prediction, the prediction is
 * compiled into the kernel's claim + threshold contract, `makeVerdict` decides
 * the five-value verdict, and a state_transition ledger line (CORROBORATED →
 * KERNEL_ADJUDICATED) is appended with the verdict carried in typed evidence.
 *
 * Honesty rules (the bridge must NEVER fake adjudication):
 *   - Only decisive observations adjudicate: the exoplanet statistical analysis
 *     with significantAt05=true. Landscape recommendations, FAILED analyses,
 *     and non-significant nulls are REFUSED (exit discipline: a null result is
 *     preserved, never converted into a ladder climb).
 *   - Metric coverage: the prediction's structured `metricShape` field is the
 *     PRIMARY channel (b6-S1) — 'correlation' is the only shape the decisive
 *     observation family (Pearson r) measures; difference/threshold/ratio
 *     predictions are REFUSED metric_not_covered. When the field is absent,
 *     the prose keyword proxy (correlation/correlate/pearson/association)
 *     applies as before — necessary, not sufficient; declared below.
 *   - Direction: the structured `direction` field is the PRIMARY channel;
 *     'either' is an explicit no-direction commitment (REFUSED
 *     direction_unknown — prose never overrides an explicit declaration).
 *     Absent field → prose keyword derivation as before. Structured and prose
 *     channels CONTRADICTING each other (either one) is REFUSED
 *     structured_prose_conflict (fail-closed: never silently pick a channel).
 *   - The hypothesis must ALREADY be registered CORROBORATED in the ledger:
 *     the ladder never adjudicates unregistered content.
 *
 * Cannot-prove (must never be hidden): this adjudicates the FALSIFIABLE
 * PREDICTION projection of the hypothesis (its operational content), not the
 * full mechanism, and the metric-coverage check is a textual/declarative
 * proxy — a passing check does not prove the observation measures what the
 * author meant. The structured fields are model-DECLARED and adjudication-
 * sensitive: tampering a persisted run's `direction` flips the compiled
 * threshold contract (gt↔lt); the defense is NOT this module but the registry
 * content-hash chain (a tampered hypothesis no longer matches its registered
 * CORROBORATED line → not_registered_corroborated) plus run-file provenance.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { makeVerdict } from '../falsifiability/verdict.ts';
import type { EvidenceRecord } from '../falsifiability/types.ts';
import type { Verdict } from '../schema/enums.ts';
import type { Observation, ResearchRun } from '../research/types.ts';
import { isLandscapeObservation } from '../research/experiment.ts';
import { markKernelRefuted } from '../research/memory.ts';
import {
  appendDiscoveryRecords,
  buildDiscoveryRegistryRecord,
  hypothesisContentHash,
  readDiscoveryRegistry,
  type DiscoveryRegistryRecord,
  type RegistryProvenance,
} from './registry.ts';
import { transitionConjectureState } from './types.ts';

/** Direction derivable from a prediction's wording (deterministic keyword rule). */
type PredictionDirection = 'positive' | 'negative';

/** Why an adjudication was refused (typed — never a stringly error). */
export type AdjudicationRefusalReason =
  | 'no_observation_for_hypothesis'
  | 'observation_not_decisive'
  | 'metric_not_covered'
  | 'direction_unknown'
  | 'no_finite_statistic'
  /** b6-S1: the structured field and the prose wording contradict (fail-closed). */
  | 'structured_prose_conflict';

/** The verdict-side result of compiling one observation against one hypothesis. */
export interface AdjudicationCompilation {
  readonly status: 'COMPILED' | 'REFUSED';
  readonly reason?: AdjudicationRefusalReason;
  readonly claim?: string;
  readonly metricLabel?: string;
  readonly metricValue?: number;
  readonly evidence?: EvidenceRecord;
  readonly thresholdSemantics?: 'gt' | 'lt';
  readonly gitCommitSha?: string;
}

/** Direction keywords (ordered; first hit wins; ties are impossible — a text is scanned once per family). */
const POSITIVE_WORDS = ['positive', 'increases', 'increase', 'higher', 'stronger', 'correlates positively', '增加', '升高', '增强', '正相关'];
const NEGATIVE_WORDS = ['negative', 'decreases', 'decrease', 'lower', 'weaker', 'anticorrelates', '减少', '降低', '减弱', '负相关'];

/**
 * 否定线索（2.md §8.9 后 R10 T1·claim 语言结构鲁棒性金集的运行时面）：
 * 词边界匹配（EN——防 "note"/"nothing" 误中 "not"/"no"）+ 中文子串。
 * 窗口 40 字符（"does not, under any scenario, increase…" 类插入语仍覆盖；
 * 校准：典型否定-关键词间距 <25 字符，40 = +60% 裕量）。窗口内 ≥2 个线索 =
 * 双重否定语义不可靠 → fail-closed 返回 null（不猜）。
 */
const NEGATION_CUES_EN = /\b(?:not|no|never|without|fails? to|does not|doesn'?t|isn'?t|aren'?t|won'?t|can'?t|cannot)\b/g;
const NEGATION_CUES_ZH = ['不', '无', '非', '没有', '未'];
const NEGATION_WINDOW_CHARS = 40;

/**
 * Negation-aware direction derivation. Each keyword hit is inspected for a
 * preceding negation cue within the window: a negated hit flips its family.
 * A negated positive ("does not increase") is a NEGATIVE prediction — the
 * most classic adjudication failure mode (R10: 否定翻转必须翻转裁决).
 * Ambiguity (both effective families, or neither, or double negation) → null.
 */
function deriveDirection(text: string): PredictionDirection | null {
  const lower = text.toLowerCase();
  let effectivePositive = false;
  let effectiveNegative = false;
  for (const [words, family] of [
    [POSITIVE_WORDS, 'positive'],
    [NEGATIVE_WORDS, 'negative'],
  ] as const) {
    for (const word of words) {
      let idx = lower.indexOf(word);
      while (idx !== -1) {
        const window = lower.slice(Math.max(0, idx - NEGATION_WINDOW_CHARS), idx);
        const enCues = window.match(NEGATION_CUES_EN)?.length ?? 0;
        const zhCues = NEGATION_CUES_ZH.reduce((n, cue) => n + countOccurrences(window, cue), 0);
        const cues = enCues + zhCues;
        if (cues >= 2) return null; // double negation — refuse to guess
        const negated = cues === 1;
        if (family === 'positive') {
          if (negated) effectiveNegative = true;
          else effectivePositive = true;
        } else if (negated) effectivePositive = true;
        else effectiveNegative = true;
        idx = lower.indexOf(word, idx + word.length);
      }
    }
  }
  if (effectivePositive === effectiveNegative) return null; // none or both → unknown
  return effectivePositive ? 'positive' : 'negative';
}

function countOccurrences(haystack: string, needle: string): number {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

/** Test/export surface for the claim-structure golden set (R10 T1). */
export { deriveDirection as derivePredictionDirectionForTest };

/**
 * Compile the kernel contract from an observation + hypothesis (pure).
 * REFUSED outcomes carry the typed reason; COMPILED outcomes carry the full
 * claim/threshold/evidence triple ready for `makeVerdict`.
 */
export function adjudicateRunObservation(input: {
  readonly run: ResearchRun;
  readonly hypothesisId?: string;
  readonly observation: Observation;
  readonly gitCommitSha?: string;
}): AdjudicationCompilation {
  const hypothesisId = input.hypothesisId ?? input.run.plan.primaryHypothesisId;
  const hypothesis = input.run.hypotheses.find((h) => h.id === hypothesisId);
  if (hypothesis === undefined || !input.observation.affectsHypothesisIds.includes(hypothesisId)) {
    return { status: 'REFUSED', reason: 'no_observation_for_hypothesis' };
  }
  // Decisive-observation gate: only the exoplanet statistical analysis carries
  // a decisive statistic. Landscape = recommendations; FAILED = no data.
  if (isLandscapeObservation(input.observation)) {
    return { status: 'REFUSED', reason: 'observation_not_decisive' };
  }
  const result = input.observation.result;
  if (result.status === 'FAILED' || result.significantAt05 !== true) {
    // A null/failed analysis is a VALID observation but not a DECISIVE one —
    // the null is preserved, the ladder is not climbed (no fake adjudication).
    return { status: 'REFUSED', reason: 'observation_not_decisive' };
  }
  const pearsonR = result.pearsonR;
  if (pearsonR === undefined || pearsonR === null || !Number.isFinite(pearsonR)) {
    return { status: 'REFUSED', reason: 'no_finite_statistic' };
  }
  const prediction = hypothesis.falsificationMethod.prediction;
  const predictionLower = prediction.toLowerCase();
  // Prose metric-coverage proxy (necessary, not sufficient — declared in the
  // header): the prediction must textually reference the correlation family.
  const proseCoversMetric =
    predictionLower.includes('correlation') ||
    predictionLower.includes('correlate') ||
    predictionLower.includes('pearson') ||
    predictionLower.includes('association');

  // ── Metric coverage: structured metricShape FIRST, prose fallback (b6-S1) ──
  const metricShape = hypothesis.falsificationMethod.metricShape;
  if (metricShape !== undefined) {
    if (metricShape !== 'correlation' && proseCoversMetric) {
      // Structured says a non-correlation shape while the prose claims the
      // correlation family — the two channels contradict → fail-closed.
      return { status: 'REFUSED', reason: 'structured_prose_conflict' };
    }
    // Only 'correlation' is measured by the decisive observation family
    // (Pearson r). difference/threshold/ratio predictions are honestly
    // refused rather than force-mapped onto a correlation statistic.
    if (metricShape !== 'correlation') {
      return { status: 'REFUSED', reason: 'metric_not_covered' };
    }
  } else if (!proseCoversMetric) {
    return { status: 'REFUSED', reason: 'metric_not_covered' };
  }

  // ── Direction: structured direction FIRST, prose fallback (b6-S1) ──────────
  const proseDirection = deriveDirection(prediction);
  const structuredDirection = hypothesis.falsificationMethod.direction;
  let direction: PredictionDirection;
  if (structuredDirection !== undefined) {
    if (structuredDirection === 'either') {
      // Explicit no-direction commitment: no gt/lt contract is constructible,
      // and prose keywords must NOT override an explicit declaration.
      return { status: 'REFUSED', reason: 'direction_unknown' };
    }
    if (proseDirection !== null && proseDirection !== structuredDirection) {
      return { status: 'REFUSED', reason: 'structured_prose_conflict' };
    }
    direction = structuredDirection;
  } else {
    if (proseDirection === null) {
      return { status: 'REFUSED', reason: 'direction_unknown' };
    }
    direction = proseDirection;
  }

  const claim = prediction; // the falsifiable prediction is the operational claim
  const thresholdSemantics: 'gt' | 'lt' = direction === 'positive' ? 'gt' : 'lt';
  // Initial supports/refutes MUST differ (kernel assert); the kernel's
  // evaluateThreshold(metricValue, threshold) re-derives them authoritatively.
  const evidence: EvidenceRecord = {
    claim,
    metricValue: pearsonR,
    supportsClaim: direction === 'positive' ? pearsonR > 0 : pearsonR < 0,
    refutesClaim: direction === 'positive' ? pearsonR <= 0 : pearsonR >= 0,
    scopeNarrowerThanClaim: false,
    sourceAnchor: {
      gitCommitSha: input.gitCommitSha ?? 'unresolved',
      dashscopeRequestId: null,
      isoTimestamp: input.observation.producedAt,
      rawResponseHash: `obs:${result.inputHash}`,
    },
  };
  return {
    status: 'COMPILED',
    claim,
    metricLabel: 'pearsonR (radius × insolation, hot-Jupiter sample)',
    metricValue: pearsonR,
    evidence,
    thresholdSemantics,
    ...(input.gitCommitSha !== undefined ? { gitCommitSha: input.gitCommitSha } : {}),
  };
}

/** Run the compiled contract through the five-value kernel (pure). */
export function decideAdjudication(compilation: AdjudicationCompilation):
  | { readonly status: 'VERDICT'; readonly verdict: Verdict; readonly claim: string; readonly metricValue: number }
  | { readonly status: 'REFUSED'; readonly reason: AdjudicationRefusalReason } {
  if (compilation.status !== 'COMPILED' || compilation.claim === undefined) {
    return { status: 'REFUSED', reason: compilation.reason ?? 'observation_not_decisive' };
  }
  const result = makeVerdict({
    claim: compilation.claim,
    evidences: [compilation.evidence!],
    falsificationSpec: {
      prediction: compilation.claim,
      metric: compilation.metricLabel!,
      falsificationThreshold: 0,
      thresholdSemantics: compilation.thresholdSemantics!,
    },
    thresholdSpec: {
      semantics: compilation.thresholdSemantics!,
      value: 0,
    },
  });
  return {
    status: 'VERDICT',
    verdict: result.verdict,
    claim: compilation.claim,
    metricValue: result.metricValue ?? compilation.metricValue!,
  };
}

// ── Registry backflow ────────────────────────────────────────────────────────

/** Typed adjudication evidence on KERNEL_ADJUDICATED transition lines. */
export interface RegistryAdjudicationEvidence {
  readonly verdict: Verdict;
  readonly observationId: string;
  readonly adapter: string;
  readonly metricValue: number;
}

/** The full backflow outcome. */
export interface BackflowOutcome {
  readonly status: 'APPENDED' | 'SKIPPED_DUPLICATE' | 'REFUSED';
  readonly reason?: AdjudicationRefusalReason | 'not_registered_corroborated';
  readonly verdict?: Verdict;
  readonly appendedRecord?: DiscoveryRegistryRecord;
}

/**
 * Append the CORROBORATED → KERNEL_ADJUDICATED transition line for one
 * hypothesis after a decisive kernel verdict. Preconditions (fail-closed):
 * the hypothesis IS registered CORROBORATED in the ledger, and no
 * (contentHash, KERNEL_ADJUDICATED) line exists yet (idempotent).
 */
export function recordKernelAdjudication(input: {
  readonly run: ResearchRun;
  readonly hypothesisId: string;
  readonly observation: Observation;
  readonly adjudication: RegistryAdjudicationEvidence;
  readonly ledgerPath?: string;
  readonly now?: () => Date;
}): BackflowOutcome {
  const ledgerPath = input.ledgerPath ?? '.far/discovery/registry.jsonl';
  const hypothesis = input.run.hypotheses.find((h) => h.id === input.hypothesisId);
  if (hypothesis === undefined) {
    return { status: 'REFUSED', reason: 'no_observation_for_hypothesis' };
  }
  const contentHash = hypothesisContentHash(hypothesis);
  const existing = readDiscoveryRegistry(ledgerPath);
  const registered = existing.some(
    (r) => r.contentHash === contentHash && r.state === 'CORROBORATED' && r.kind === 'registration',
  );
  if (!registered) {
    // The ladder never adjudicates unregistered content (§2.4 — an
    // unregistered conjecture has no CORROBORATED run to adjudicate).
    return { status: 'REFUSED', reason: 'not_registered_corroborated' };
  }
  if (existing.some((r) => r.contentHash === contentHash && r.state === 'KERNEL_ADJUDICATED')) {
    return { status: 'SKIPPED_DUPLICATE', verdict: input.adjudication.verdict };
  }
  const registeredAt = (input.now ?? (() => new Date()))().toISOString();
  const state = transitionConjectureState('CORROBORATED', 'KERNEL_ADJUDICATED', {
    deterministicCheckRef: `verdict:${input.adjudication.observationId}@${input.run.runId}`,
  });
  const provenance: RegistryProvenance = {
    corpusSnapshotId: input.run.corpus.snapshotId,
    corpusRootHash: input.run.corpus.rootHash,
    modelProfile: 'kernel',
    supportingCitations: [],
    counterEvidenceCitations: [],
    receiptsDigest: `adjudication:${input.adjudication.observationId}`,
  };
  const record = buildDiscoveryRegistryRecord({
    kind: 'state_transition',
    sequence: existing.length,
    contentHash,
    registeredAt,
    state,
    question: input.run.question,
    runId: input.run.runId,
    provenance,
    evidence: {
      deterministicCheckRef: `verdict:${input.adjudication.observationId}@${input.run.runId}`,
      adjudication: {
        verdict: input.adjudication.verdict,
        observationId: input.adjudication.observationId,
        adapter: input.adjudication.adapter,
        metricValue: input.adjudication.metricValue,
      },
    },
    prevRecordHash: '',
  });
  const append = appendDiscoveryRecords(ledgerPath, [record]);
  const appendedRecord = append.appended[0];
  if (appendedRecord === undefined) {
    return { status: 'SKIPPED_DUPLICATE', verdict: input.adjudication.verdict };
  }
  return { status: 'APPENDED', verdict: input.adjudication.verdict, appendedRecord };
}

// ── Run-scoped adjudication history (append + supersede semantics) ───────────

/** One entry in the run-scoped adjudication log. */
export interface AdjudicationLogEntry {
  readonly id: string;
  readonly recordedAt: string;
  readonly hypothesisId: string;
  readonly observationId: string;
  readonly adapter: string;
  readonly verdict: Verdict;
  readonly metricValue: number;
  readonly claim: string;
  /** Set when a later entry overturned this one (history kept, never rewritten). */
  readonly supersededBy?: string | undefined;
}

/**
 * Append a verdict to the run-scoped adjudication log
 * (`.far/research-runs/<id>/adjudications.json` next to the run file).
 * A SECOND verdict for the same hypothesis supersedes (not replaces) the
 * first — the ledger keeps the first KERNEL_ADJUDICATED line; this log keeps
 * the full verdict history including flips.
 */
export function appendAdjudicationLog(
  runJsonPath: string,
  entry: Omit<AdjudicationLogEntry, 'id' | 'supersededBy'>,
  now: () => Date = () => new Date(),
): readonly AdjudicationLogEntry[] {
  const logPath = `${dirname(runJsonPath)}/adjudications.json`;
  let entries: AdjudicationLogEntry[] = [];
  if (existsSync(logPath)) {
    entries = JSON.parse(readFileSync(logPath, 'utf8')) as AdjudicationLogEntry[];
  }
  // Supersede previous verdicts for the same hypothesis (bitemporal, appended).
  const id = `adj-${String(entries.length + 1).padStart(4, '0')}-${entry.observationId.slice(0, 8)}`;
  entries = entries.map((e) =>
    e.hypothesisId === entry.hypothesisId && e.supersededBy === undefined
      ? { ...e, supersededBy: id }
      : e,
  );
  entries.push({ ...entry, id });
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  void now;
  return entries;
}

/** Read the run-scoped adjudication log (empty when absent). */
export function readAdjudicationLog(runJsonPath: string): readonly AdjudicationLogEntry[] {
  const logPath = `${dirname(runJsonPath)}/adjudications.json`;
  if (!existsSync(logPath)) return [];
  return JSON.parse(readFileSync(logPath, 'utf8')) as AdjudicationLogEntry[];
}

/**
 * Full one-shot flow used by the CLI: compile → kernel verdict → registry
 * backflow → run log → memory backflow (REFUTED invalidates branches).
 * Every stage's outcome is reported honestly; nothing is silently dropped.
 */
export interface AdjudicationFlowResult {
  readonly compilation: AdjudicationCompilation;
  readonly decision: ReturnType<typeof decideAdjudication>;
  readonly backflow: BackflowOutcome | null;
  readonly memoryRefutedBranches: number;
}

export function runAdjudicationFlow(input: {
  readonly run: ResearchRun;
  readonly hypothesisId?: string;
  readonly observation: Observation;
  readonly ledgerPath?: string;
  readonly memoryPath?: string;
  readonly gitCommitSha?: string;
  readonly now?: () => Date;
}): AdjudicationFlowResult {
  const compilation = adjudicateRunObservation(input);
  const decision = decideAdjudication(compilation);
  if (decision.status !== 'VERDICT') {
    return { compilation, decision, backflow: null, memoryRefutedBranches: 0 };
  }
  const hypothesisId = input.hypothesisId ?? input.run.plan.primaryHypothesisId;
  const backflow = recordKernelAdjudication({
    run: input.run,
    hypothesisId,
    observation: input.observation,
    adjudication: {
      verdict: decision.verdict,
      observationId: input.observation.id,
      adapter: input.observation.adapter,
      metricValue: decision.metricValue,
    },
    ...(input.ledgerPath !== undefined ? { ledgerPath: input.ledgerPath } : {}),
    ...(input.now !== undefined ? { now: input.now } : {}),
  });
  // Memory backflow: a kernel REFUTED conjecture's branches are invalidated
  // (bitemporal — never deleted; directive §2.5 × §2.4 junction).
  let memoryRefutedBranches = 0;
  if (decision.verdict === 'REFUTED' && backflow.status !== 'REFUSED') {
    const hypothesis = input.run.hypotheses.find((h) => h.id === hypothesisId);
    if (hypothesis !== undefined) {
      try {
        memoryRefutedBranches = markKernelRefuted(
          {
            contentHash: hypothesisContentHash(hypothesis),
            at: (input.now ?? (() => new Date()))().toISOString(),
          },
          ...(input.memoryPath !== undefined ? [{ memoryPath: input.memoryPath }] : []),
        );
      } catch {
        // A missing/corrupt memory store must not fail the adjudication — the
        // registry line (the notarized artifact) is already appended. The
        // memory miss is visible via `far research memory status`.
        memoryRefutedBranches = -1;
      }
    }
  }
  return { compilation, decision, backflow, memoryRefutedBranches };
}
