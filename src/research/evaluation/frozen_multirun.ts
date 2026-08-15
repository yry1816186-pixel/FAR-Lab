/**
 * research/evaluation/frozen_multirun — offline aggregation of N>=5 independent
 * runs of the frozen evaluation set (directive §4.2 补遗 applied to
 * frozen_eval_set.json; design doc: .far/agent/research/n5-design-b7.md).
 *
 * WHAT THIS IS: a PURE, offline aggregator over already-recorded run
 * observations. Each input observation is one completed frozen-eval run (its
 * metrics + its variability ledger). The aggregator enforces:
 *   - N>=5 per question or INSUFFICIENT_N (means suppressed — §4.2 补遗:
 *     单次运行数字禁入报告; below N=5 single-run values stay debug-only);
 *   - bootstrap 95% percentile CI per metric, reusing the rediscovery engine's
 *     seeded deterministic bootstrap (NOT rewritten here — import only; the
 *     rediscovery directory is concurrently owned by another workstream);
 *   - a per-metric seed derived deterministically from (baseSeed, questionId,
 *     metricName) so ANY third party can recompute the CI from the report;
 *   - runMode honesty: every aggregate row carries its runMode; mixing LIVE and
 *     non-LIVE runs in one mean is refused (MIXED_RUN_MODE);
 *   - failed-run honesty: failures are ledgered (runIndex + errorKind), never
 *     silently dropped and never counted toward N;
 *   - variability accounting: retrieval-snapshot root hashes, timestamps, model
 *     identity, the temperature-null FACT, git commit and per-run token usage
 *     travel with the report so "independent runs" is auditable.
 *
 * WHAT THIS IS NOT (anti-Goodhart red lines):
 *   - No "quality score" of any kind: output contains metric names, means,
 *     CIs, runModes and the disclaimers below — nothing else.
 *   - No cross-question blended mean: questions have heterogeneous evidence
 *     profiles (supporting/counter/null/conflict/unresolved); blending them
 *     into one number would be statistically meaningless (NONE_BY_DESIGN).
 *   - HIGH_VARIANCE is a display flag (attention marker), never a verdict;
 *     raw sd/range/CI are always shown alongside it.
 */

import { assertNoCapabilityScore, bootstrapCi } from './rediscovery/engine.ts';

// ─── Honesty constants ───────────────────────────────────────────────────────

/** Minimum N per question (§4.2 补遗: 强制 N≥5，seed 互异). Mirrors rediscovery MINIMUM_N. */
export const FROZEN_MINIMUM_N = 5 as const;

/** Default base seed (recorded in every report; overridable for replication). */
export const DEFAULT_BASE_SEED = 20260815;

/** Default bootstrap iterations per metric. */
export const DEFAULT_BOOTSTRAP_ITERATIONS = 10000;

/** §4.2 补遗, verbatim intent: single-run numbers live in debug logs only. */
export const SINGLE_RUN_DISCLAIMER =
  'SINGLE-RUN VALUES ARE DEBUG-ONLY (§4.2 补遗): 单次运行数字只许存在于调试日志，' +
  '禁止进入任何报告、README 或答辩材料。Aggregate rows require N>=5 independent runs ' +
  'with a bootstrap 95% CI.';

/** §4.5 补遗 R8①: static statistical-power caveat. */
export const FROZEN_POWER_CAVEAT =
  'Power caveat (§4.5 补遗 R8①): bootstrap 95% CI at N=5 detects only large effects ' +
  '(~50% power at d>=1.5). Rows not reaching 80% power are directional signals, ' +
  'NOT statistically confirmed differences.';

/** Why no cross-question mean exists. */
export const NO_BLEND_NOTE =
  'cross-question blending: NONE BY DESIGN — evidence profiles differ per question ' +
  '(supporting/counter/null/conflict/unresolved); a blended cross-question number would be meaningless.';

/** HIGH_VARIANCE thresholds (display flags only; raw numbers always shown). */
export const HIGH_VARIANCE_CI_WIDTH = 0.4;
export const HIGH_VARIANCE_RELATIVE_SD = 0.5;

// ─── Input types (one recorded run observation) ─────────────────────────────

/** Per-run cost/vtoken accounting (sum over stageReceipts; null until measured). */
export interface RunTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

/**
 * Variability ledger — the fields that make "independent run" auditable
 * (design doc §变异性记账). Empty-string string fields mean "not captured"
 * (allowed only for FAILED runs whose pipeline died early).
 */
export interface VariabilityLedger {
  /** Retrieval snapshot identity (corpus drift is auditable across runs). */
  readonly retrievalSnapshotId: string;
  readonly retrievalRootHash: string;
  readonly retrievalSnapshotCreatedAt: string;
  readonly corpusDocumentCount: number;
  /** Model identity (competition profile primary: qwen3.7-max-2026-05-20). */
  readonly modelId: string;
  readonly provider: string;
  /**
   * Sampling temperature FACT: null = the request did NOT pin a temperature
   * (the adapter default then applies — that fact is itself recorded, never
   * hidden behind a fake number).
   */
  readonly temperature: number | null;
  /** LLM sampling seed if the request pinned one; null = not pinned. */
  readonly samplingSeed: number | null;
  /** Code identity. */
  readonly gitCommit: string;
  /** Wall-clock start of the run (independence check: no identical timestamps). */
  readonly startedAt: string;
  /** Strategy config identity (10-strategy full vs 3-strategy subset). */
  readonly strategyIds: readonly string[];
  /** Measured token usage; null until the LIVE run reports it. */
  readonly tokenUsage: RunTokenUsage | null;
}

/** One recorded run of one frozen-eval question. */
export interface FrozenRunObservation {
  /** Distinct per question across ALL runs (failed ones included). */
  readonly runIndex: number;
  readonly runMode: string;
  /** 'OK' runs must carry metrics; 'FAILED' runs carry the error kind instead. */
  readonly status: 'OK' | 'FAILED';
  /** Required for FAILED runs, null for OK runs. */
  readonly errorKind: string | null;
  /** Metric values as computed by computeRunMetrics (name -> value). */
  readonly metrics: readonly { readonly name: string; readonly value: number | boolean | null }[];
  /** Null allowed ONLY for FAILED runs (validated). */
  readonly variability: VariabilityLedger | null;
}

/** All recorded runs for one frozen-eval question. */
export interface QuestionMultirunInput {
  readonly questionId: string;
  readonly runs: readonly FrozenRunObservation[];
}

// ─── Output types ────────────────────────────────────────────────────────────

/** Bootstrap CI as recorded per metric (structurally identical to rediscovery's). */
export interface FrozenBootstrapCi {
  readonly lower: number;
  readonly upper: number;
  readonly method: 'percentile-bootstrap';
  readonly iterations: number;
  readonly seed: number;
  readonly unit: 'run';
}

/** Per-metric stats (present only when the row is REPORTED). */
export interface FrozenMetricStats {
  readonly mean: number;
  readonly sd: number;
  readonly min: number;
  readonly max: number;
  readonly ci95: FrozenBootstrapCi;
  readonly varianceFlag: 'OK' | 'HIGH_VARIANCE';
}

/** One metric's aggregate row for one question. */
export interface FrozenMetricRow {
  readonly name: string;
  readonly status: 'REPORTED' | 'INSUFFICIENT_N';
  /** Numeric (booleans mapped 1/0) observations used for the aggregate. */
  readonly nNonNull: number;
  /** Null/missing observations excluded (counted, never imputed). */
  readonly nullValueCount: number;
  readonly valueKind: 'number' | 'boolean_rate' | null;
  readonly stats: FrozenMetricStats | null;
}

/** Failed-run ledger entry (honest presentation; never silently dropped). */
export interface FailureLedgerEntry {
  readonly runIndex: number;
  readonly errorKind: string;
}

/** Debug-only per-run view (§4.2: single-run values never reportable). */
export interface PerRunDebugView {
  readonly runIndex: number;
  readonly runMode: string;
  readonly values: Readonly<Record<string, number | boolean | null>>;
}

/** Aggregation result for one question. */
export interface QuestionAggregate {
  readonly questionId: string;
  /** Successful (status OK) runs — the only ones that may count toward N. */
  readonly n: number;
  readonly failedRunCount: number;
  readonly status: 'REPORTED' | 'INSUFFICIENT_N' | 'MIXED_RUN_MODE';
  /** Null when mixed or n=0. */
  readonly runMode: string | null;
  readonly distinctRunModes: readonly string[];
  /** True when every successful run saw the SAME retrieval root hash. */
  readonly retrievalSnapshotFrozen: boolean | null;
  readonly distinctSnapshotHashes: readonly string[];
  readonly perMetric: readonly FrozenMetricRow[];
  readonly failureLedger: readonly FailureLedgerEntry[];
  /** Echo of successful runs' ledgers (self-contained audit trail). */
  readonly variabilityLedger: readonly VariabilityLedger[];
  readonly perRunDebugView: readonly PerRunDebugView[];
}

/** Whole-campaign report. */
export interface FrozenMultirunReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly minimumN: 5;
  readonly status: 'ALL_REPORTED' | 'PARTIAL' | 'NONE_REPORTED';
  readonly seed: number;
  readonly iterations: number;
  readonly perQuestion: readonly QuestionAggregate[];
  readonly crossQuestionBlending: 'NONE_BY_DESIGN';
  readonly singleRunDisclaimer: string;
  readonly powerCaveat: string;
}

export interface FrozenMultirunOptions {
  readonly seed?: number;
  readonly iterations?: number;
  readonly generatedAt?: string;
}

// ─── Deterministic seed derivation (auditable from the report) ──────────────

/** FNV-1a 32-bit string hash (deterministic, dependency-free). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Per-(question, metric) bootstrap seed — derived from the report's base seed
 * so any third party can recompute every CI from the report alone. Exported
 * because it is the audit path (tests recompute CIs through it).
 */
export function deriveBootstrapSeed(
  baseSeed: number,
  questionId: string,
  metricName: string,
): number {
  return (baseSeed ^ fnv1a(`${questionId}::${metricName}`)) >>> 0;
}

// ─── Small stats helpers ─────────────────────────────────────────────────────

/** Sample standard deviation (n-1); 0 for n<=1. */
function sampleSd(values: readonly number[], mean: number): number {
  if (values.length <= 1) return 0;
  let acc = 0;
  for (const v of values) acc += (v - mean) * (v - mean);
  return Math.sqrt(acc / (values.length - 1));
}

/**
 * Display flag only (never a verdict). Pinned thresholds:
 * bounded metrics (all values in [0,1], incl. boolean rates): CI width >= 0.4;
 * otherwise relative dispersion sd/|mean| > 0.5 (when mean != 0).
 */
function varianceFlagOf(
  values: readonly number[],
  mean: number,
  sd: number,
  ciWidth: number,
): 'OK' | 'HIGH_VARIANCE' {
  const bounded = values.every((v) => v >= 0 && v <= 1);
  if (bounded && ciWidth >= HIGH_VARIANCE_CI_WIDTH) return 'HIGH_VARIANCE';
  if (mean !== 0 && sd / Math.abs(mean) > HIGH_VARIANCE_RELATIVE_SD) return 'HIGH_VARIANCE';
  return 'OK';
}

// ─── Validation ──────────────────────────────────────────────────────────────

/** Structural validation of one question's observations (throws on malformation). */
function validateQuestionRuns(input: QuestionMultirunInput): void {
  if (input.questionId.trim().length === 0) {
    throw new Error('frozen_multirun: questionId must be non-empty.');
  }
  const seen = new Set<number>();
  for (const r of input.runs) {
    if (seen.has(r.runIndex)) {
      throw new Error(
        `frozen_multirun: duplicate runIndex ${r.runIndex} for question ${input.questionId} ` +
          '(runs must be independently indexed).',
      );
    }
    seen.add(r.runIndex);
    if (r.status === 'OK') {
      if (r.errorKind !== null) {
        throw new Error(
          `frozen_multirun: run ${r.runIndex} is OK but carries errorKind "${r.errorKind}".`,
        );
      }
      if (r.variability === null) {
        throw new Error(
          `frozen_multirun: OK run ${r.runIndex} (${input.questionId}) must carry a variability ledger.`,
        );
      }
    } else if (r.errorKind === null || r.errorKind.trim().length === 0) {
      throw new Error(
        `frozen_multirun: FAILED run ${r.runIndex} (${input.questionId}) must carry errorKind.`,
      );
    }
  }
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

function aggregateQuestion(
  input: QuestionMultirunInput,
  baseSeed: number,
  iterations: number,
): QuestionAggregate {
  validateQuestionRuns(input);

  const successful = input.runs.filter((r) => r.status === 'OK');
  const failed = input.runs.filter((r) => r.status === 'FAILED');
  const failureLedger: FailureLedgerEntry[] = failed.map((r) => ({
    runIndex: r.runIndex,
    errorKind: r.errorKind as string,
  }));

  const distinctRunModes = [...new Set(successful.map((r) => r.runMode))].sort();
  const distinctSnapshotHashes = [
    ...new Set(
      successful
        .map((r) => r.variability?.retrievalRootHash ?? '')
        .filter((h) => h.length > 0),
    ),
  ].sort();
  const retrievalSnapshotFrozen =
    successful.length === 0 ? null : distinctSnapshotHashes.length === 1;

  const perRunDebugView: PerRunDebugView[] = input.runs.map((r) => ({
    runIndex: r.runIndex,
    runMode: r.runMode,
    values: Object.fromEntries(r.metrics.map((m) => [m.name, m.value])),
  }));

  const n = successful.length;
  const mixed = distinctRunModes.length > 1;
  const status: QuestionAggregate['status'] =
    n < FROZEN_MINIMUM_N ? 'INSUFFICIENT_N' : mixed ? 'MIXED_RUN_MODE' : 'REPORTED';
  const runMode = mixed || n === 0 ? null : (distinctRunModes[0] as string);

  let perMetric: FrozenMetricRow[] = [];
  if (status === 'REPORTED') {
    const metricNames = [...new Set(successful.flatMap((r) => r.metrics.map((m) => m.name)))].sort();
    perMetric = metricNames.map((name) => {
      // Collect values across successful runs; track kind consistency.
      let kind: 'number' | 'boolean_rate' | null = null;
      const nums: number[] = [];
      let nulls = 0;
      for (const r of successful) {
        const found = r.metrics.find((m) => m.name === name);
        const v = found === undefined ? null : found.value;
        if (v === null) {
          nulls += 1;
          continue;
        }
        if (typeof v === 'boolean') {
          if (kind === 'number') {
            throw new Error(
              `frozen_multirun: metric "${name}" mixes boolean and number values across runs.`,
            );
          }
          kind = 'boolean_rate';
          nums.push(v ? 1 : 0);
        } else {
          if (kind === 'boolean_rate') {
            throw new Error(
              `frozen_multirun: metric "${name}" mixes number and boolean values across runs.`,
            );
          }
          kind = 'number';
          nums.push(v);
        }
      }
      if (nums.length < FROZEN_MINIMUM_N) {
        return {
          name,
          status: 'INSUFFICIENT_N',
          nNonNull: nums.length,
          nullValueCount: nulls,
          valueKind: kind,
          stats: null,
        };
      }
      const mean = nums.reduce((s, v) => s + v, 0) / nums.length;
      const sd = sampleSd(nums, mean);
      const seed = deriveBootstrapSeed(baseSeed, input.questionId, name);
      const ci = bootstrapCi(nums, { seed, iterations });
      const ciWidth = ci.upper - ci.lower;
      const stats: FrozenMetricStats = {
        mean,
        sd,
        min: Math.min(...nums),
        max: Math.max(...nums),
        ci95: {
          lower: ci.lower,
          upper: ci.upper,
          method: 'percentile-bootstrap',
          iterations,
          seed,
          unit: 'run',
        },
        varianceFlag: varianceFlagOf(nums, mean, sd, ciWidth),
      };
      return {
        name,
        status: 'REPORTED',
        nNonNull: nums.length,
        nullValueCount: nulls,
        valueKind: kind,
        stats,
      };
    });
  }

  return {
    questionId: input.questionId,
    n,
    failedRunCount: failed.length,
    status,
    runMode,
    distinctRunModes,
    retrievalSnapshotFrozen,
    distinctSnapshotHashes,
    perMetric,
    failureLedger,
    variabilityLedger: successful.map(
      (r) => r.variability as VariabilityLedger,
    ),
    perRunDebugView,
  };
}

/**
 * Aggregate frozen-eval multirun observations (pure, offline, deterministic).
 * N<5 per question → INSUFFICIENT_N (means suppressed); N>=5 with a single
 * runMode → per-metric mean + seeded bootstrap 95% CI; mixed runModes →
 * MIXED_RUN_MODE (means suppressed — a LIVE run must never be averaged with a
 * non-LIVE run). Failed runs are ledgered, never dropped, never counted.
 */
export function aggregateFrozenMultirun(
  perQuestion: readonly QuestionMultirunInput[],
  opts: FrozenMultirunOptions = {},
): FrozenMultirunReport {
  const seed = opts.seed ?? DEFAULT_BASE_SEED;
  const iterations = opts.iterations ?? DEFAULT_BOOTSTRAP_ITERATIONS;
  const generatedAt = opts.generatedAt ?? new Date().toISOString();

  const aggregates = perQuestion.map((q) => aggregateQuestion(q, seed, iterations));
  const reported = aggregates.filter((a) => a.status === 'REPORTED').length;
  const status: FrozenMultirunReport['status'] =
    aggregates.length === 0 || reported === 0
      ? 'NONE_REPORTED'
      : reported === aggregates.length
        ? 'ALL_REPORTED'
        : 'PARTIAL';

  return {
    schemaVersion: 1,
    generatedAt,
    minimumN: FROZEN_MINIMUM_N,
    status,
    seed,
    iterations,
    perQuestion: aggregates,
    crossQuestionBlending: 'NONE_BY_DESIGN',
    singleRunDisclaimer: SINGLE_RUN_DISCLAIMER,
    powerCaveat: FROZEN_POWER_CAVEAT,
  };
}

// ─── Rendering (anti-Goodhart guarded) ───────────────────────────────────────

function fmt(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(3);
}

/** Render the report as text. Throws via assertNoCapabilityScore on score language. */
export function renderFrozenMultirun(report: FrozenMultirunReport): string {
  const lines: string[] = [
    `# Frozen Multirun Aggregation — questions=${report.perQuestion.length}, minimumN=${report.minimumN}, status=${report.status}`,
    `baseSeed=${report.seed} · iterations=${report.iterations} · per-metric seeds derive from (baseSeed, questionId, metricName)`,
    NO_BLEND_NOTE,
    '',
  ];

  for (const q of report.perQuestion) {
    lines.push(`## ${q.questionId} — ${q.status}`);
    lines.push(
      `runMode: ${q.runMode ?? `(mixed: ${q.distinctRunModes.join(' | ')})`} · n=${q.n} successful · ${q.failedRunCount} failed`,
    );
    if (q.n > 0) {
      lines.push(
        `retrieval snapshots: ${q.distinctSnapshotHashes.length} distinct root hash(es)` +
          (q.retrievalSnapshotFrozen === true
            ? ' [FROZEN — variance attributable to LLM sampling only, not corpus drift]'
            : ' [live retrieval variance recorded]'),
      );
    }
    if (q.status === 'REPORTED') {
      lines.push('metrics (mean ± bootstrap 95% CI, unit=run; metric name + CI + runMode only):');
      for (const m of q.perMetric) {
        if (m.stats !== null) {
          lines.push(
            `- ${m.name} [${q.runMode}]: n=${m.nNonNull} mean=${fmt(m.stats.mean)} sd=${fmt(m.stats.sd)} ` +
              `range=[${fmt(m.stats.min)}, ${fmt(m.stats.max)}] ` +
              `CI95=[${fmt(m.stats.ci95.lower)}, ${fmt(m.stats.ci95.upper)}] ` +
              `(${m.stats.ci95.method}, ${m.stats.ci95.iterations} iter, seed ${m.stats.ci95.seed})` +
              (m.stats.varianceFlag === 'HIGH_VARIANCE' ? ' [HIGH_VARIANCE flag — see raw sd/range]' : ''),
          );
        } else {
          lines.push(
            `- ${m.name}: INSUFFICIENT_N (nNonNull=${m.nNonNull} < ${report.minimumN}, nullValueCount=${m.nullValueCount}) — stats suppressed`,
          );
        }
      }
    } else if (q.status === 'MIXED_RUN_MODE') {
      lines.push(
        `mean SUPPRESSED — MIXED_RUN_MODE: LIVE and non-LIVE runs cannot be averaged into one number.`,
      );
    } else {
      lines.push(
        `mean SUPPRESSED — INSUFFICIENT_N: n=${q.n} < ${report.minimumN} (§4.2 补遗).`,
      );
    }
    if (q.failureLedger.length > 0) {
      lines.push(
        `failed runs (ledgered, never silently retried): ` +
          q.failureLedger.map((f) => `run#${f.runIndex} ${f.errorKind}`).join('; '),
      );
    }
    lines.push('debug (single-run values — NOT reportable as aggregates):');
    for (const d of q.perRunDebugView) {
      const vals = Object.entries(d.values)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(', ');
      lines.push(`- run#${d.runIndex} [${d.runMode}] ${vals.length === 0 ? '(no metrics recorded)' : vals}`);
    }
    lines.push('');
  }

  lines.push(`## ${report.singleRunDisclaimer}`);
  lines.push('');
  lines.push(`## ${report.powerCaveat}`);

  const text = lines.join('\n');
  assertNoCapabilityScore(text);
  return text;
}
