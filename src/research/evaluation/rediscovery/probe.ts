/**
 * research/evaluation/rediscovery/probe — the §4.1 direct-recall contrast
 * probe ("同题直接问模型'你知道 X 吗'以区分记忆 vs 推导").
 *
 * WHAT THIS IS: for every target discovery, ONE structured model call asking
 * "have you seen this specific discovery in your training data?" — answered
 * strictly as { recall: known|unsure|not_seen, confidence, sourcePointer }.
 * The answer separates "the replayed engine hit it" from "the model simply
 * memorized it" — the contrast arm the leakage section demands.
 *
 * WHAT THIS IS NOT (honesty red lines, enforced structurally):
 *   - A 'known' answer NEVER clears or downgrades a hit: hits stay hits; the
 *     probe only changes how the report INTERPRETS them (renderer annotation).
 *   - sourcePointer is a model CLAIM, not verified bibliography. It is
 *     rendered as "model-claimed" and never cross-checked here (that is the
 *     DOI-verification lane's job).
 *   - The probe result alone proves nothing about training data: the model
 *     can overclaim (known) or underclaim (not_seen) familiarity. The report
 *     must keep saying so.
 *
 * LIVE wiring (the caller's job — this module holds zero env/secret keys):
 * the probe reuses the same integration surface as every research stage:
 * pass the competition gateway (createCompetitionQwenGateway) + profile
 * 'competition_aliyun_qwen', exactly like the research CLI does. Offline
 * tests drive it with offline_replay fixtures keyed by stageId
 * `${DIRECT_RECALL_STAGE_PREFIX}:${targetId}` — the deterministic path used
 * by tests/research/rediscovery_probe.test.ts.
 */

import { z } from 'zod';

import type { LlmGateway } from '../../../llm_gateway/gateway.ts';
import type { LlmMessage, ProviderProfile } from '../../../llm_gateway/types.ts';
import { callStructuredJson } from '../../llm.ts';
import type {
  DirectRecallProbeResult,
  DirectRecallVerdict,
  RediscoveryReport,
  TargetDiscovery,
  TemporalHoldoutSpec,
} from './types.ts';

/** stageId prefix for probe calls; per-target stageId = `${prefix}:${targetId}`. */
export const DIRECT_RECALL_STAGE_PREFIX = 'direct_recall_probe' as const;

/** Output-token budget: the answer is three short fields — 512 is ample. */
export const DIRECT_RECALL_MAX_TOKENS = 512 as const;

/**
 * zod SSOT for the probe answer. Free-text verdicts are structurally
 * impossible: `recall` is an enum, `confidence` is bounded [0,1], and
 * `sourcePointer` must be an explicit string-or-null (a missing key fails
 * validation — the model cannot leave the pointer ambiguous).
 */
export const DirectRecallAnswerSchema = z.object({
  recall: z.enum(['known', 'unsure', 'not_seen']),
  confidence: z.number().min(0).max(1),
  // `.nullable()` (not z.union) — the LIVE-proven convention in research/schemas.ts.
  sourcePointer: z.string().nullable(),
});

/** The validated probe answer (schema output type; no manual re-typing). */
export type DirectRecallAnswer = z.infer<typeof DirectRecallAnswerSchema>;

/**
 * Build the deterministic probe question for one target. Pinned by tests:
 * it must (a) demand a memory-only answer with no tools/retrieval, (b) carry
 * the target statement verbatim, (c) carry the cutoff date, and (d) name the
 * three allowed verdict values (no free-text adjudication).
 */
export function buildDirectRecallQuestion(target: TargetDiscovery, cutoffDate: string): string {
  return [
    'DIRECT-RECALL PROBE — answer from memory only; do NOT use any tool, search, or retrieval.',
    `Statement: "${target.statement}"`,
    `(This discovery was established in a publication dated after ${cutoffDate}, the replay cutoff.)`,
    'Question: have you seen this specific discovery in your training data?',
    'Answer strictly as JSON with exactly three fields:',
    '{"recall": "known" | "unsure" | "not_seen", "confidence": <number 0..1>, "sourcePointer": <string or null>}',
    'sourcePointer: the best pointer you can honestly give (paper title, DOI, or arXiv id); null if you cannot give one — NEVER invent one.',
  ].join('\n');
}

/** System + user messages for the probe call (external content pre-embedded). */
export function buildDirectRecallMessages(
  target: TargetDiscovery,
  cutoffDate: string,
): readonly LlmMessage[] {
  const messages: readonly LlmMessage[] = [
    {
      role: 'system',
      content:
        'You are answering a training-data recall probe. You answer from memory only, never invent ' +
        'sources, and reply with a single JSON object matching the requested schema — no prose.',
    },
    { role: 'user', content: buildDirectRecallQuestion(target, cutoffDate) },
  ];
  return messages;
}

/** Options for running the probe over one spec. */
export interface DirectRecallProbeOptions {
  /** LLM gateway (live competition gateway, or offline_replay in tests). */
  readonly gateway: LlmGateway;
  /** Provider profile to call (e.g. 'competition_aliyun_qwen' / 'offline_replay'). */
  readonly profile: ProviderProfile;
}

/** A completed probe over one spec (per-target rows + honest counters). */
export interface DirectRecallProbeRun {
  readonly results: readonly DirectRecallProbeResult[];
  readonly answeredCount: number;
  readonly failedCount: number;
}

/** Normalize a model-given pointer: trim; empty string means "none given". */
function normalizePointer(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Run the direct-recall probe: ONE structured call per target (callStructured
 * Json handles the single repair attempt; a second schema failure is
 * fail-closed PER TARGET — the row records the verbatim error and the probe
 * continues, so one poisoned target cannot erase the others' evidence).
 *
 * Deterministic for a fixed fixture set: no clock, no randomness, no env.
 */
export async function runDirectRecallProbe(
  spec: TemporalHoldoutSpec,
  opts: DirectRecallProbeOptions,
): Promise<DirectRecallProbeRun> {
  const results: DirectRecallProbeResult[] = [];
  for (const target of spec.targetDiscoveries) {
    const stageId = `${DIRECT_RECALL_STAGE_PREFIX}:${target.id}`;
    try {
      const { data, meta } = await callStructuredJson(
        opts.gateway,
        opts.profile,
        stageId,
        DirectRecallAnswerSchema,
        buildDirectRecallMessages(target, spec.cutoffDate),
        DIRECT_RECALL_MAX_TOKENS,
      );
      results.push({
        targetId: target.id,
        recalled: data.recall === 'known',
        outcome: 'answered',
        recall: data.recall,
        confidence: data.confidence,
        sourcePointer: normalizePointer(data.sourcePointer),
        error: null,
        modelId: meta.modelId,
      });
    } catch (err) {
      // Per-target fail-closed: record the verbatim failure, keep probing.
      // This is the documented branch — NOT a swallowed error.
      results.push({
        targetId: target.id,
        recalled: false,
        outcome: 'call_failed',
        recall: null,
        confidence: null,
        sourcePointer: null,
        error: err instanceof Error ? err.message : String(err),
        modelId: null,
      });
    }
  }
  const answeredCount = results.filter((r) => r.outcome === 'answered').length;
  return {
    results,
    answeredCount,
    failedCount: results.length - answeredCount,
  };
}

/**
 * Backfill a probe run into a replay report. PURE function:
 *   - targetResults / hitRate / matchLevelCounts / replayChecksum are carried
 *     over UNTOUCHED (the probe changes interpretation, never match facts;
 *     replayChecksum does not cover leakageAssessment by design, so it stays
 *     stable — pinned by tests).
 *   - status: >=1 answered target → LIVE_COMPLETED (per-target failures stay
 *     visible inside results); zero answered → BLOCKED (the probe ran but
 *     produced no usable answer — never silently downgraded to NOT_RUN_OFFLINE).
 *   - pretrainingLeakageRisk flips to PROBED_LIVE only when >=1 target answered.
 *
 * Idempotent by construction: applying the same run twice yields an identical
 * report (every other field is copied verbatim).
 *
 * @throws on an empty run or on result rows referencing target ids the report
 *         does not contain (a probe of a different spec — fail loud, never
 *         silently mis-annotate).
 */
export function applyDirectRecallProbe(
  report: RediscoveryReport,
  run: DirectRecallProbeRun,
): RediscoveryReport {
  if (run.results.length === 0) {
    throw new Error('applyDirectRecallProbe: empty probe run (nothing to backfill).');
  }
  const knownIds = new Set(report.targetResults.map((t) => t.targetId));
  for (const r of run.results) {
    if (!knownIds.has(r.targetId)) {
      throw new Error(
        `applyDirectRecallProbe: probe row targetId "${r.targetId}" is not a target of report ` +
          `${report.specId} — refusing to backfill a probe from a different spec.`,
      );
    }
  }
  const status = run.answeredCount > 0 ? 'LIVE_COMPLETED' : 'BLOCKED';
  const pretrainingLeakageRisk =
    run.answeredCount > 0 ? 'PROBED_LIVE' : 'CANNOT_BE_EXCLUDED_OFFLINE';
  return {
    ...report,
    leakageAssessment: {
      ...report.leakageAssessment,
      directRecallProbe: {
        ...report.leakageAssessment.directRecallProbe,
        status,
        results: run.results,
      },
      pretrainingLeakageRisk,
    },
  };
}

/** Convenience: is this probe row an answered verdict of the given kind? */
export function isRecallVerdict(
  row: DirectRecallProbeResult | undefined,
  verdict: DirectRecallVerdict,
): boolean {
  return row !== undefined && row.outcome === 'answered' && row.recall === verdict;
}
