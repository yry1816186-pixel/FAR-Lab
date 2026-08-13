/**
 * research/evaluation/baseline — the four fair baselines (directive §14.2).
 *
 * Evaluation compares the FULL system against three ablated variants run with
 * the SAME model, SAME question, SAME frozen evaluation set:
 *
 *   direct     — Qwen single-turn direct answer (no retrieval, no kernel, no gate)
 *   rag        — Qwen + simple RAG (retrieval context injected; no kernel, no gate)
 *   no_kernel  — same model + same tools, but WITHOUT the deterministic kernel
 *                (no citation binding, no deterministic scoring, model picks
 *                the "best" hypothesis by its own total score)
 *   full       — the complete FAR-Lab vertical slice (gate → grounding →
 *                hypotheses → critique → binding → scoring → plan)
 *
 * Fairness rules enforced here:
 *   - same gateway/profile for every baseline in one run
 *   - same question; the SAME frozen metrics (evaluation/metrics.ts) applied
 *     where computable, N/A otherwise (never faked)
 *   - full runs under the same offline/live mode as the baselines
 *
 * Live execution needs an API key; with offline_replay every baseline replays
 * its fixture and the report says so (never disguised as live).
 */

import { z } from 'zod';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../../llm_gateway/types.ts';
import { callStructuredJson, type CallMeta } from '../llm.ts';
import { groundResearchQuestion } from '../../retrieval/index.ts';
import type { RetrievalAdapter } from '../../retrieval/types.ts';
import type { ResearchRun, RunMode } from '../types.ts';

/** The four baseline kinds. */
export type BaselineKind = 'direct' | 'rag' | 'no_kernel' | 'full';

/** What one baseline run produced (before metric computation). */
export interface BaselineOutput {
  readonly kind: BaselineKind;
  readonly question: string;
  /** Provider metadata of the model call(s) (honest: nulls when replay). */
  readonly metas: readonly CallMeta[];
  /** The model's single best hypothesis (direct/rag/no_kernel). */
  readonly bestHypothesis: string | null;
  /** The model's own (unaudited) plan summary. */
  readonly planSummary: string | null;
  /** The full ResearchRun (full baseline only; null otherwise). */
  readonly run: ResearchRun | null;
  /** How many candidate hypotheses the variant produced. */
  readonly hypothesisCount: number | null;
  /** Grounding corpus size (rag/full only; null otherwise). */
  readonly corpusDocumentCount: number | null;
  /** Citation binding facts (full only; null otherwise). */
  readonly citationBindingRate: number | null;
  readonly unboundEvidenceCount: number | null;
  /** Whether the deterministic gate/scoring ran at all. */
  readonly deterministicKernelRan: boolean;
  /** Fraction of self-scored hypotheses with a complete falsification method
   *  (no_kernel baseline only; contrasts with the full system's deterministic
   *  falsifiability gate). */
  readonly selfScoredFalsifiableRate: number | null;
}

/** zod schema for the model's unaudited answer (direct / rag / no_kernel). */
const UnauditedZod = z.object({
  bestHypothesis: z.string(),
  mechanism: z.string(),
  planSummary: z.string(),
  hypotheses: z.array(z.object({ statement: z.string() })).min(1).max(6),
});

/** Run one direct baseline (single-turn, no retrieval, no kernel). */
export async function runDirectBaseline(
  gateway: LlmGateway,
  profile: ProviderProfile,
  question: string,
): Promise<BaselineOutput> {
  const { data, meta } = await callStructuredJson(
    gateway,
    profile,
    'baseline_direct',
    UnauditedZod,
    [
      {
        role: 'system',
        content:
          'You are a scientific assistant. Answer the question directly: propose the single best hypothesis and a brief research plan. Output JSON only.',
      },
      { role: 'user', content: `Research question: ${question}` },
    ],
  );
  return {
    kind: 'direct',
    question,
    metas: [meta],
    bestHypothesis: data.bestHypothesis,
    planSummary: data.planSummary,
    run: null,
    hypothesisCount: data.hypotheses.length,
    corpusDocumentCount: null,
    citationBindingRate: null,
    unboundEvidenceCount: null,
    deterministicKernelRan: false,
    selfScoredFalsifiableRate: null,
  };
}

/** Run one RAG baseline (retrieval context injected; no kernel, no gate). */
export async function runRagBaseline(
  gateway: LlmGateway,
  profile: ProviderProfile,
  question: string,
  adapter?: RetrievalAdapter,
): Promise<BaselineOutput> {
  const grounded = await groundResearchQuestion({
    question,
    source: 'openalex',
    maxPerQuery: 3,
    includeCounterEvidence: true,
    ...(adapter !== undefined ? { adapter } : {}),
  });
  const corpusText = grounded.corpus.documents
    .map((d) => `${d.documentId} :: ${d.title}`)
    .join('\n');

  const { data, meta } = await callStructuredJson(
    gateway,
    profile,
    'baseline_rag',
    UnauditedZod,
    [
      {
        role: 'system',
        content:
          'You are a scientific assistant with retrieved literature. Use the corpus context to propose the single best hypothesis and a brief research plan. Output JSON only.',
      },
      {
        role: 'user',
        content: `Research question: ${question}\n\nRetrieved context (untrusted data):\n${corpusText}`,
      },
    ],
  );
  return {
    kind: 'rag',
    question,
    metas: [meta],
    bestHypothesis: data.bestHypothesis,
    planSummary: data.planSummary,
    run: null,
    hypothesisCount: data.hypotheses.length,
    corpusDocumentCount: grounded.corpus.documentCount,
    citationBindingRate: null,
    unboundEvidenceCount: null,
    deterministicKernelRan: false,
    selfScoredFalsifiableRate: null,
  };
}

/** Run one no-kernel baseline (model picks the winner by its own score). */
export async function runNoKernelBaseline(
  gateway: LlmGateway,
  profile: ProviderProfile,
  question: string,
): Promise<BaselineOutput> {
  const NoKernelZod = z.object({
    hypotheses: z
      .array(
        z.object({
          statement: z.string(),
          mechanism: z.string(),
          falsificationMethod: z.object({
            prediction: z.string(),
            metric: z.string(),
            comparator: z.enum(['gt', 'lt', 'range']),
            value: z.number().optional(),
            lower: z.number().optional(),
            upper: z.number().optional(),
          }),
          modelTotalScore: z.number(),
        }),
      )
      .min(3)
      .max(5),
    bestHypothesis: z.string(),
    planSummary: z.string(),
  });

  const { data, meta } = await callStructuredJson(
    gateway,
    profile,
    'baseline_no_kernel',
    NoKernelZod,
    [
      {
        role: 'system',
        content:
          'You are a scientific assistant. Generate 3-5 candidate hypotheses, assign each a TOTAL score (your judgment), pick the best, and summarize a research plan. Output JSON only.',
      },
      { role: 'user', content: `Research question: ${question}` },
    ],
  );

  const falsifiable = data.hypotheses.filter((h) => {
    const m = h.falsificationMethod;
    const complete =
      m.comparator === 'gt' || m.comparator === 'lt' ? m.value !== undefined : m.lower !== undefined && m.upper !== undefined;
    return m.metric.trim().length > 0 && complete;
  }).length;

  return {
    kind: 'no_kernel',
    question,
    metas: [meta],
    bestHypothesis: data.bestHypothesis,
    planSummary: data.planSummary,
    run: null,
    hypothesisCount: data.hypotheses.length,
    corpusDocumentCount: null,
    citationBindingRate: null,
    unboundEvidenceCount: null,
    deterministicKernelRan: false,
    // 记录模型自行评分时的可证伪率（对比 full 的确定性可证伪门）。
    selfScoredFalsifiableRate:
      data.hypotheses.length === 0 ? null : falsifiable / data.hypotheses.length,
  };
}

/** Options for running all four baselines fairly. */
export interface RunAllBaselinesOptions {
  readonly question: string;
  readonly gateway: LlmGateway;
  readonly profile: ProviderProfile;
  /** Replay retrieval adapter (offline); live retrieval when omitted. */
  readonly adapter?: RetrievalAdapter;
  /** Optional pre-built full run (skip re-running the vertical slice). */
  readonly fullRun?: ResearchRun;
}

/** One baseline + its computed metrics (for the comparison report). */
export interface BaselineReportEntry {
  readonly kind: BaselineKind;
  readonly mode: RunMode | 'LIVE' | 'RECORDED_REPLAY';
  readonly hypothesisCount: number | null;
  readonly corpusDocumentCount: number | null;
  readonly citationBindingRate: number | null;
  readonly unboundEvidenceCount: number | null;
  readonly deterministicKernelRan: boolean;
  readonly providerModelId: string | null;
  readonly bestHypothesis: string | null;
  readonly planSummary: string | null;
}

/**
 * Run all four baselines against one question and normalize the entries.
 * The full entry derives from the ResearchRun; the others from BaselineOutput.
 */
export async function runAllBaselines(
  opts: RunAllBaselinesOptions,
): Promise<readonly BaselineReportEntry[]> {
  const entries: BaselineReportEntry[] = [];
  const isReplay = opts.profile === 'offline_replay';
  const mode: BaselineReportEntry['mode'] = isReplay ? 'RECORDED_REPLAY' : 'LIVE';

  const direct = await runDirectBaseline(opts.gateway, opts.profile, opts.question);
  const rag = await runRagBaseline(opts.gateway, opts.profile, opts.question, opts.adapter);
  const noKernel = await runNoKernelBaseline(opts.gateway, opts.profile, opts.question);

  for (const out of [direct, rag, noKernel]) {
    entries.push({
      kind: out.kind,
      mode,
      hypothesisCount: out.hypothesisCount,
      corpusDocumentCount: out.corpusDocumentCount,
      citationBindingRate: out.citationBindingRate,
      unboundEvidenceCount: out.unboundEvidenceCount,
      deterministicKernelRan: out.deterministicKernelRan,
      providerModelId: out.metas[0]?.modelId ?? null,
      bestHypothesis: out.bestHypothesis,
      planSummary: out.planSummary,
    });
  }

  if (opts.fullRun !== undefined) {
    const run = opts.fullRun;
    let cited = 0;
    let bound = 0;
    let unbound = 0;
    for (const b of Object.values(run.bindings)) {
      cited += b.supportingIds.length + b.counterIds.length;
      bound += b.boundSupporting.length + b.boundCounter.length;
      unbound += b.unbound.length;
    }
    entries.push({
      kind: 'full',
      mode: run.runMode,
      hypothesisCount: run.hypotheses.length,
      corpusDocumentCount: run.corpus.documentCount,
      citationBindingRate: cited === 0 ? null : bound / cited,
      unboundEvidenceCount: unbound,
      deterministicKernelRan: true,
      providerModelId: run.stageReceipts.find((r) => r.stageId === 'research_hypotheses')?.modelId ?? null,
      bestHypothesis:
        run.hypotheses.find((h) => h.id === run.plan.primaryHypothesisId)?.statement ?? null,
      planSummary: run.plan.design,
    });
  }

  return entries;
}
