/**
 * research/evaluation/rediscovery/engine — the deterministic temporal-holdout
 * replay engine (directive §4.1) + the N>=5 multi-run aggregator (§4.2).
 *
 * Pipeline per spec (fully offline, fully deterministic):
 *   1. enforceTemporalCutoff — drop (and COUNT) any corpus document whose
 *      publicationDate > cutoffDate. The holdout must never see post-cutoff
 *      text; violations are audited, not silently kept.
 *   2. replayRediscoverySpec — run `runResearch` (the REAL pipeline: gate →
 *      grounding → hypotheses → binding → falsifiability → critique →
 *      scoring → plan) on a frozen corpus via a replay retrieval adapter and
 *      offline_replay LLM fixtures. Fixed runId + fixed clock so the
 *      match-relevant output is byte-stable across replays.
 *   3. matchTargetsAgainstHypotheses — three-level deterministic matching:
 *        L1_KEYWORD   — >=2 target keyword phrases appear in the hypothesis
 *                       text (normalized token run match; no embeddings).
 *        L2_CITATION  — the hypothesis cites a grounding document of the
 *                       target AND >=1 keyword phrase hits.
 *        L3_SEMANTIC  — weak evidence: >=1 synonym-expansion hit AND token
 *                       Jaccard >= 0.05 (conservative approximation only).
 *      The verdict is the highest level reached across all hypotheses.
 *   4. Report — hit rate, per-target evidence, lead time (months between
 *      cutoff and the establishing publication), match-level breakdown, and
 *      the MANDATORY leakage-assessment section. No capability score exists.
 *
 * multiRunReport enforces §4.2 补遗: below N=5 it refuses to emit means
 * (INSUFFICIENT_N); at N>=5 it bootstrap-estimates a 95% percentile CI with a
 * recorded seed + iteration count, plus the static power caveat (§4.5 R8 ①).
 */

import { createHash } from 'node:crypto';

import { createLlmGateway } from '../../../llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../../llm_gateway/adapters/offline_replay/client.ts';
import { createReplayAdapter } from '../../../retrieval/index.ts';
import type { RetrievedDocument } from '../../../retrieval/types.ts';
import { runResearch } from '../../orchestrator.ts';
import type { ResearchRun } from '../../types.ts';
import {
  FORBIDDEN_SCORE_TERMS,
  LEAKAGE_DISCLAIMER,
  MINIMUM_N,
  MIN_L1_KEYWORD_HITS,
  MIN_L2_KEYWORD_HITS,
  MIN_L3_JACCARD,
  POWER_CAVEAT,
} from './types.ts';
import type {
  CorpusCutoffStats,
  LeakageAssessment,
  MatchLevel,
  MetricAggregate,
  MultiRunReport,
  RediscoveryReport,
  TargetDiscovery,
  TargetMatchResult,
  TemporalHoldoutSpec,
} from './types.ts';

// ─── Normalization (deterministic; pinned by tests) ─────────────────────────

/** Small English stopword set — enough for token-overlap sanity, nothing fancy. */
const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has',
  'have', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the',
  'their', 'this', 'to', 'was', 'were', 'will', 'with', 'which', 'than', 'then',
]);

/** Normalize one word: lowercase, strip possessives, collapse simple plurals.
 *
 * Rules are chosen so singular and simple-plural forms map to the SAME stem
 * (planet/planets, candle/candles, studies/study). Deliberately NOT a real
 * stemmer: unmatched irregular forms (supernovae vs supernova) stay distinct —
 * conservative, fewer false hits.
 */
function normalizeWord(word: string): string {
  const w = word.toLowerCase().replace(/['’]s$/, '');
  if (w.length > 3 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 2 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) {
    return w.slice(0, -1);
  }
  return w;
}

/** Tokenize text into normalized, stopword-free tokens. */
export function tokenize(text: string): readonly string[] {
  return text
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
    .filter((t) => !STOPWORDS.has(t))
    .map(normalizeWord)
    .filter((t) => t.length > 0);
}

/** Does `textTokens` contain the keyword phrase as a contiguous token run? */
function containsPhrase(textTokens: readonly string[], phrase: string): boolean {
  const phraseTokens = tokenize(phrase);
  if (phraseTokens.length === 0) return false;
  const first = phraseTokens[0];
  if (first === undefined) return false;
  for (let i = 0; i + phraseTokens.length <= textTokens.length; i += 1) {
    if (textTokens[i] !== first) continue;
    let ok = true;
    for (let j = 1; j < phraseTokens.length; j += 1) {
      if (textTokens[i + j] !== phraseTokens[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** Jaccard overlap between two token sets (conservative semantic proxy). */
function jaccard(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

// ─── Temporal cutoff enforcement ────────────────────────────────────────────

/** ISO yyyy-mm-dd comparison (documents use ISO or looser yyyy-mm; lexical works within ISO). */
function isAfterCutoff(publicationDate: string, cutoffDate: string): boolean {
  return publicationDate.slice(0, 10) > cutoffDate.slice(0, 10);
}

/**
 * Enforce the holdout: keep only publicationDate <= cutoff, count the drops.
 * Pure + total (never mutates the input array).
 */
export function enforceTemporalCutoff(
  documents: readonly RetrievedDocument[],
  cutoffDate: string,
): { readonly kept: readonly RetrievedDocument[]; readonly stats: CorpusCutoffStats } {
  const kept = documents.filter(
    (d) => d.publicationDate === null || !isAfterCutoff(d.publicationDate, cutoffDate),
  );
  return {
    kept,
    stats: {
      inputDocumentCount: documents.length,
      retainedDocumentCount: kept.length,
      droppedPostCutoffDocumentCount: documents.length - kept.length,
      cutoffDate,
    },
  };
}

/** Validate spec invariants: every target must live strictly after the cutoff. */
export function validateSpec(spec: TemporalHoldoutSpec): void {
  if (spec.targetDiscoveries.some((t) => !isAfterCutoff(t.publishedAfter, spec.cutoffDate))) {
    throw new Error(
      `rediscovery spec ${spec.specId}: every target must have publishedAfter > cutoffDate ` +
        `(${spec.cutoffDate}) — a target at/before the cutoff is not a rediscovery target.`,
    );
  }
  const ids = new Set(spec.targetDiscoveries.map((t) => t.id));
  if (ids.size !== spec.targetDiscoveries.length) {
    throw new Error(`rediscovery spec ${spec.specId}: duplicate target ids.`);
  }
}

// ─── Three-level target matching (deterministic, no embeddings) ─────────────

/** Evidence bundle for one (hypothesis, target) pair. */
interface MatchEvidence {
  readonly level: MatchLevel;
  readonly keywords: readonly string[];
}

/** Match ONE hypothesis text+grounding ids against ONE target. */
function matchOne(hypothesisText: string, hypothesisCitations: readonly string[], target: TargetDiscovery): MatchEvidence {
  const tokens = tokenize(hypothesisText);
  const directHits = target.matchKeywords.filter((k) => containsPhrase(tokens, k));
  const citesGrounding =
    hypothesisCitations.some((c) => target.groundingDocumentIds.includes(c));

  // L1 — strong: >= MIN_L1_KEYWORD_HITS direct keyword-phrase hits.
  if (directHits.length >= MIN_L1_KEYWORD_HITS) {
    return { level: 'L1_KEYWORD', keywords: directHits };
  }
  // L2 — medium: grounding citation + >= MIN_L2_KEYWORD_HITS direct hits.
  if (citesGrounding && directHits.length >= MIN_L2_KEYWORD_HITS) {
    return { level: 'L2_CITATION', keywords: directHits };
  }
  // L3 — weak: synonym-MEDIATED hit (an alternative phrase, not the keyword
  // itself — a literal keyword hit was already graded by L1/L2) + a
  // conservative token-overlap floor.
  const synonymHits: string[] = [];
  for (const alternatives of Object.values(target.synonyms)) {
    for (const alt of alternatives) {
      if (containsPhrase(tokens, alt)) {
        synonymHits.push(alt);
        break;
      }
    }
  }
  const targetTokens = tokenize(
    `${target.statement} ${target.matchKeywords.join(' ')}`,
  );
  if (synonymHits.length >= 1 && jaccard(tokens, targetTokens) >= MIN_L3_JACCARD) {
    return { level: 'L3_SEMANTIC', keywords: synonymHits };
  }
  return { level: 'NO_MATCH', keywords: [] };
}

const LEVEL_RANK: Readonly<Record<MatchLevel, number>> = {
  L1_KEYWORD: 3,
  L2_CITATION: 2,
  L3_SEMANTIC: 1,
  NO_MATCH: 0,
};

/** Match all hypotheses of a run against one target; keep the best evidence. */
export function matchTarget(
  target: TargetDiscovery,
  hypotheses: readonly { readonly id: string; readonly statement: string; readonly mechanism: string; readonly supportingCitations: readonly string[] }[],
): {
  readonly targetId: string;
  readonly matched: boolean;
  readonly matchLevel: MatchLevel;
  readonly matchedHypothesisId: string | null;
  readonly matchedKeywords: readonly string[];
} {
  let best: MatchEvidence = { level: 'NO_MATCH', keywords: [] };
  let bestHypothesisId: string | null = null;
  for (const h of hypotheses) {
    const ev = matchOne(`${h.statement} ${h.mechanism}`, h.supportingCitations, target);
    if (LEVEL_RANK[ev.level] > LEVEL_RANK[best.level]) {
      best = ev;
      bestHypothesisId = h.id;
    }
  }
  return {
    targetId: target.id,
    matched: best.level !== 'NO_MATCH',
    matchLevel: best.level,
    matchedHypothesisId: bestHypothesisId,
    matchedKeywords: best.keywords,
  };
}

// ─── Lead time helper ───────────────────────────────────────────────────────

/** Months between the spec cutoff and the target's establishing publication. */
export function leadTimeMonthsFrom(cutoffDate: string, publishedAfter: string): number {
  return leadMonths(publishedAfter) - leadMonths(cutoffDate);
}

function leadMonths(iso: string): number {
  const [y, m] = iso.slice(0, 10).split('-');
  return Number(y) * 12 + (Number(m) - 1);
}

// ─── Replay ─────────────────────────────────────────────────────────────────

/** Fixed clock + fixed runId: the match-relevant replay output is byte-stable. */
const REPLAY_EPOCH = '2000-01-01T00:00:00.000Z';

export interface ReplayOptions {
  /**
   * Run index for deterministic runId derivation (multi-run replays use
   * distinct runIds so content-addressed hypothesis ids stay per-run).
   */
  readonly runIndex?: number;
}

/** Replay one spec end-to-end (offline, deterministic) and produce the report. */
export async function replayRediscoverySpec(
  spec: TemporalHoldoutSpec,
  opts: ReplayOptions = {},
): Promise<RediscoveryReport> {
  validateSpec(spec);
  const runIndex = opts.runIndex ?? 0;
  const { kept, stats } = enforceTemporalCutoff(spec.corpusFixture, spec.cutoffDate);

  const adapter = createReplayAdapter('openalex', 'OpenAlex', kept);
  const gateway = createLlmGateway([createOfflineReplayAdapter({ fixtures: spec.llmFixtures })]);
  const fixedNow = (): Date => new Date(REPLAY_EPOCH);

  let run: ResearchRun;
  try {
    run = await runResearch({
      question: spec.researchQuestion,
      gateway,
      profile: 'offline_replay',
      grounding: {
        adapter,
        source: 'openalex',
        maxPerQuery: spec.runConfig.maxPerQuery,
        includeCounterEvidence: false,
      },
      targetHypothesisCount: spec.runConfig.targetHypothesisCount,
      hypothesisGenerationStrategy: spec.runConfig.hypothesisGenerationStrategy,
      runId: `rediscovery-${spec.specId}-r${runIndex}`,
      now: fixedNow,
    });
  } catch (err) {
    // Fail-closed pipeline (e.g. no admissible hypothesis) is an honest BLOCKED
    // replay, never a zero-hit report: a zero-hit would fabricate a miss.
    throw new Error(
      `rediscovery replay ${spec.specId} failed (pipeline fail-closed): ${(err as Error).message}`,
      { cause: err },
    );
  }

  const targetResults: TargetMatchResult[] = spec.targetDiscoveries.map((t) => {
    const m = matchTarget(
      t,
      run.hypotheses.map((h) => ({
        id: h.id,
        statement: h.statement,
        mechanism: h.mechanism,
        supportingCitations:
          run.bindings[h.id]?.boundSupporting.map((b) => b.documentId) ?? h.supportingCitations,
      })),
    );
    return {
      targetId: t.id,
      verificationStatus: t.verificationStatus,
      doi: t.doi,
      doiStatus: t.doiStatus,
      matched: m.matched,
      matchLevel: m.matchLevel,
      matchedHypothesisId: m.matchedHypothesisId,
      matchedKeywords: m.matchedKeywords,
      leadTimeMonths: leadTimeMonthsFrom(spec.cutoffDate, t.publishedAfter),
    };
  });

  const matchLevelCounts: Record<MatchLevel, number> = {
    L1_KEYWORD: 0,
    L2_CITATION: 0,
    L3_SEMANTIC: 0,
    NO_MATCH: 0,
  };
  for (const r of targetResults) matchLevelCounts[r.matchLevel] += 1;

  const matched = targetResults.filter((r) => r.matched).length;
  const hitRate = targetResults.length === 0 ? 0 : matched / targetResults.length;

  const leakageAssessment = buildLeakageAssessment(spec);

  const replayChecksum = sha256Hex(
    JSON.stringify({
      specId: spec.specId,
      corpusStats: stats,
      targetResults,
      hitRate,
      matchLevelCounts,
      hypothesisIds: run.hypotheses.map((h) => h.id),
    }),
  );

  return {
    specId: spec.specId,
    domain: spec.domain,
    cutoffDate: spec.cutoffDate,
    runMode: run.runMode,
    corpusStats: stats,
    targetResults,
    hitRate,
    matchLevelCounts,
    leakageAssessment,
    replayChecksum,
    generatedAt: new Date().toISOString(),
  };
}

/** Build the mandatory leakage section (probe = placeholder until LIVE). */
export function buildLeakageAssessment(spec: TemporalHoldoutSpec): LeakageAssessment {
  return {
    disclaimer: LEAKAGE_DISCLAIMER,
    directRecallProbe: {
      status: 'NOT_RUN_OFFLINE',
      probeQuestions: spec.targetDiscoveries.map(
        (t) =>
          `DIRECT-RECALL PROBE (needs LIVE): "Do you know of ${t.statement} " ` +
          `(published after ${spec.cutoffDate})? Answer from memory only.`,
      ),
      results: null,
    },
    pretrainingLeakageRisk: 'CANNOT_BE_EXCLUDED_OFFLINE',
  };
}

// ─── Rendering (guarded against capability-score language) ──────────────────

/**
 * Render a single-run report as text. Throws if the text would contain a
 * forbidden capability-score phrase (anti-Goodhart guard, tested).
 */
export function renderRediscoveryReport(report: RediscoveryReport): string {
  const lines: string[] = [
    `# Retrospective Rediscovery Report — ${report.specId}`,
    `domain: ${report.domain} · cutoff: ${report.cutoffDate} · runMode: ${report.runMode}`,
    `corpus: ${report.corpusStats.retainedDocumentCount}/${report.corpusStats.inputDocumentCount} retained ` +
      `(${report.corpusStats.droppedPostCutoffDocumentCount} dropped post-cutoff)`,
    '',
    '## Targets (single run — NOT an aggregate claim)',
  ];
  for (const t of report.targetResults) {
    lines.push(
      `- ${t.targetId}: ${t.matched ? 'HIT' : 'MISS'} (${t.matchLevel}) ` +
        `${t.verificationStatus}${t.doi === null ? ' · doi: (none recorded)' : ` · doi: ${t.doi} [${t.doiStatus}]`}` +
        ` · leadTime: ${t.leadTimeMonths}mo` +
        (t.matchedKeywords.length > 0 ? ` · evidence: ${t.matchedKeywords.join(' | ')}` : ''),
    );
  }
  lines.push('');
  lines.push(`hit rate (single run; aggregate claims need N>=5 + CI): ${report.hitRate.toFixed(3)}`);
  lines.push(`match levels: ${JSON.stringify(report.matchLevelCounts)}`);
  lines.push(`replayChecksum: ${report.replayChecksum}`);
  lines.push('');
  lines.push(`## ${report.leakageAssessment.disclaimer}`);
  lines.push(`direct-recall probe: ${report.leakageAssessment.directRecallProbe.status} ` +
    `(pretraining leakage risk: ${report.leakageAssessment.pretrainingLeakageRisk})`);
  const text = lines.join('\n');
  assertNoCapabilityScore(text);
  return text;
}

/** Render a multi-run report (means only when N>=5). */
export function renderMultiRunReport(report: MultiRunReport): string {
  const lines: string[] = [
    `# Multi-Run Rediscovery Aggregation — n=${report.n} (minimum ${report.minimumN})`,
  ];
  if (report.status === 'INSUFFICIENT_N') {
    lines.push(
      `STATUS: INSUFFICIENT_N — mean SUPPRESSED. ${report.n} run(s) recorded; ` +
        `the framework refuses to aggregate below N=${report.minimumN} (§4.2). ` +
        'Per-run hit rates remain visible for debugging only:',
    );
    for (const p of report.perSpecHitRates) lines.push(`- ${p.specId}: ${p.hitRate.toFixed(3)} (debug view, not reportable)`);
  } else {
    lines.push(`STATUS: REPORTED — overall hit rate ${report.overallHitRate!.mean.toFixed(3)}, ` +
      `bootstrap 95% CI [${report.overallHitRate!.ci95.lower.toFixed(3)}, ${report.overallHitRate!.ci95.upper.toFixed(3)}] ` +
      `(${report.overallHitRate!.ci95.method}, ${report.overallHitRate!.ci95.iterations} iterations, ` +
      `seed ${report.overallHitRate!.ci95.seed}, unit=${report.overallHitRate!.ci95.unit})`);
  }
  lines.push('');
  lines.push('## Per-domain counts');
  for (const d of report.perDomain) {
    lines.push(`- ${d.domain}: ${d.runs} run(s), ${d.matched}/${d.targets} targets matched`);
  }
  lines.push('');
  lines.push(`## ${report.leakageAssessment.disclaimer}`);
  lines.push('');
  lines.push(`## ${report.powerCaveat}`);
  const text = lines.join('\n');
  assertNoCapabilityScore(text);
  return text;
}

/** Anti-Goodhart guard: no renderer may print a capability score. */
export function assertNoCapabilityScore(text: string): void {
  const lower = text.toLowerCase();
  for (const term of FORBIDDEN_SCORE_TERMS) {
    if (lower.includes(term.toLowerCase())) {
      throw new Error(
        `anti-Goodhart guard: output contains forbidden capability-score term "${term}" ` +
          '(this framework reports hit rates with CIs and leakage statements only).',
      );
    }
  }
}

// ─── Deterministic bootstrap (seeded PRNG; reproducible from the report) ────

/** mulberry32 — small, deterministic, seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BootstrapOptions {
  readonly seed: number;
  readonly iterations: number;
}

/** Percentile bootstrap 95% CI over run-level hit rates. */
export function bootstrapCi(
  values: readonly number[],
  opts: BootstrapOptions,
): { lower: number; upper: number } {
  if (values.length === 0) throw new Error('bootstrapCi: no values.');
  const rng = mulberry32(opts.seed);
  const means: number[] = [];
  for (let i = 0; i < opts.iterations; i += 1) {
    let sum = 0;
    for (let j = 0; j < values.length; j += 1) {
      const v = values[Math.floor(rng() * values.length)];
      if (v === undefined) throw new Error('bootstrapCi: resample index out of bounds.');
      sum += v;
    }
    means.push(sum / values.length);
  }
  means.sort((x, y) => x - y);
  const lowerIdx = Math.floor(0.025 * opts.iterations);
  const upperIdx = Math.ceil(0.975 * opts.iterations) - 1;
  const lower = means[lowerIdx];
  const upper = means[Math.min(upperIdx, opts.iterations - 1)];
  if (lower === undefined || upper === undefined) {
    throw new Error('bootstrapCi: percentile index out of range (empty resample set).');
  }
  return { lower, upper };
}

// ─── Multi-run aggregation (§4.2: N>=5 or refuse) ───────────────────────────

export interface MultiRunOptions {
  readonly seed?: number;
  readonly iterations?: number;
  readonly generatedAt?: string;
}

/** Aggregate replays; N<5 forces INSUFFICIENT_N with null aggregates. */
export function multiRunReport(
  runs: readonly RediscoveryReport[],
  opts: MultiRunOptions = {},
): MultiRunReport {
  const seed = opts.seed ?? 20260815;
  const iterations = opts.iterations ?? 10000;
  const generatedAt = opts.generatedAt ?? new Date().toISOString();

  const perSpecHitRates = runs.map((r) => ({ specId: r.specId, hitRate: r.hitRate }));

  const domainMap = new Map<string, { runs: number; targets: number; matched: number }>();
  for (const r of runs) {
    const cur = domainMap.get(r.domain) ?? { runs: 0, targets: 0, matched: 0 };
    cur.runs += 1;
    cur.targets += r.targetResults.length;
    cur.matched += r.targetResults.filter((t) => t.matched).length;
    domainMap.set(r.domain, cur);
  }
  const perDomain = [...domainMap.entries()]
    .map(([domain, d]) => ({ domain, ...d }))
    .sort((a, b) => a.domain.localeCompare(b.domain));

  let overallHitRate: MetricAggregate | null = null;
  if (runs.length >= MINIMUM_N) {
    const values = runs.map((r) => r.hitRate);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const ci = bootstrapCi(values, { seed, iterations });
    overallHitRate = {
      n: runs.length,
      mean,
      ci95: { lower: ci.lower, upper: ci.upper, method: 'percentile-bootstrap', iterations, seed, unit: 'run' },
    };
  }

  const firstRun = runs[0];
  const leakage = firstRun !== undefined
    ? firstRun.leakageAssessment
    : {
        disclaimer: LEAKAGE_DISCLAIMER,
        directRecallProbe: { status: 'NOT_RUN_OFFLINE' as const, probeQuestions: [], results: null },
        pretrainingLeakageRisk: 'CANNOT_BE_EXCLUDED_OFFLINE' as const,
      };

  return {
    n: runs.length,
    status: runs.length < MINIMUM_N ? 'INSUFFICIENT_N' : 'REPORTED',
    minimumN: MINIMUM_N,
    perSpecHitRates,
    overallHitRate,
    perDomain,
    leakageAssessment: leakage,
    powerCaveat: POWER_CAVEAT,
    generatedAt,
  };
}

// ─── Hash helper (same digest style as the repo's canonical hashing) ─────────

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}
