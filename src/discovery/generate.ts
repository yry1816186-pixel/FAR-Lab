/**
 * discovery/generate — multi-strategy hypothesis fan-out (directive §2.1/§2.2
 * breadth layer).
 *
 * Runs every applicable strategy in deterministic registry order (sequential
 * calls — the concurrency upgrade belongs to the Best-of-N orchestration
 * batch), merges the candidates, and applies the deterministic merge gates:
 *
 *   1. exact dedup — identical content hash (same statement+mechanism) means
 *      the same candidate; first (lowest strategy index) wins.
 *   2. paraphrase gate — lexical similarity ≥ PARAPHRASE_THRESHOLD drops the
 *      later duplicate and stamps PARAPHRASE_RISK onto the kept candidate's
 *      risks (visible to critique/plan, greppable in every artifact).
 *   3. deterministic truncation — sort by (strategy index, hypothesis id)
 *      then cut to targetCount; every cut candidate is recorded in
 *      meta.truncated (negative-result-ledger raw material, directive §2.2).
 *
 * Honesty accounting (fail-soft isolation): one strategy's failure never
 * sinks the fan-out — it contributes zero candidates with its error recorded;
 * a strategy that honestly does not apply records its skipReason; an
 * everything-failed run (zero candidates, zero skips) throws fail-closed.
 * Quota shortfalls are REPORTED (meta.quotaShortfall), never padded with
 * filler candidates.
 */

import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../llm_gateway/types.ts';
import type { CorpusSnapshot } from '../retrieval/corpus.ts';
import type { FalsificationMethod } from '../agent_loop/types.ts';
import type { HypothesisCandidate } from '../research/types.ts';
import { computeHypothesisId, renderCorpusAllowlist } from '../research/hypothesis_generation.ts';
import { callStructuredJson, type CallMeta } from '../research/llm.ts';
import { PARAPHRASE_RISK_MARKER, type StrategyId } from './types.ts';
import {
  buildIdf,
  paraphraseSimilarity,
  PARAPHRASE_THRESHOLD,
} from './novelty/lexical_similarity.ts';
import { STRATEGY_REGISTRY } from './strategies/index.ts';
import {
  buildStrategySchema,
  buildStrategyMessages,
  type StrategyDefinition,
} from './strategies/strategy.ts';

/** Options for the multi-strategy fan-out. */
export interface GenerateMultiStrategyOptions {
  /** The scientific question. */
  readonly question: string;
  /** The grounding corpus (citation allowlist + novelty reference). */
  readonly corpus: CorpusSnapshot;
  /** How many merged candidates to keep (default 3). */
  readonly targetCount?: number;
  /** Strategy subset to run (catalog-ordered; default: every registered strategy). */
  readonly strategyIds?: readonly StrategyId[];
  /**
   * Deterministic budget cap: run only the first N strategies of the resolved
   * list (registry order). Truncating the STRATEGY LIST (before any model
   * call) — not the candidate list — is how mid-budget degradation stays
   * deterministic (scenario #14 of the decision record).
   */
  readonly maxStrategies?: number;
}

/** One strategy's fan-out outcome (honest accounting: skip, error, or candidates). */
export interface StrategyCallResult {
  readonly strategyId: StrategyId;
  /** Candidates contributed (empty for skip/error). */
  readonly candidates: readonly HypothesisCandidate[];
  /** Provider call metadata (null when skipped or failed). */
  readonly meta: CallMeta | null;
  /** Failure reason when the strategy's model call failed (fail-soft isolation). */
  readonly error: string | null;
  /** Honest inapplicability reason when the strategy declined to run. */
  readonly skipReason: string | null;
}

/** Deterministic merge accounting for the whole fan-out (audit surface). */
export interface FanoutMeta {
  /** Strategies actually attempted (after applicability + budget cuts). */
  readonly strategiesPlanned: readonly StrategyId[];
  /** Per-strategy outcomes in registry order. */
  readonly perStrategy: readonly StrategyCallResult[];
  /** Candidates dropped by exact content-hash dedup. */
  readonly exactDuplicatesDropped: number;
  /** Candidates dropped by the paraphrase gate (with both parties recorded). */
  readonly paraphraseFlagged: readonly {
    readonly keptId: string;
    readonly droppedId: string;
    readonly similarity: number;
    readonly keptStrategy: StrategyId;
    readonly droppedStrategy: StrategyId;
  }[];
  /** Candidates cut by deterministic targetCount truncation. */
  readonly truncated: readonly { readonly id: string; readonly strategyId: StrategyId }[];
  /** Final kept count. */
  readonly finalCount: number;
  /** max(0, targetCount − finalCount) — reported, never padded. */
  readonly quotaShortfall: number;
}

/** Resolve the effective strategy list: subset → catalog order → budget cap. */
function resolveStrategyList(opts: GenerateMultiStrategyOptions): readonly StrategyDefinition[] {
  const base =
    opts.strategyIds === undefined
      ? STRATEGY_REGISTRY
      : STRATEGY_REGISTRY.filter((s) => opts.strategyIds!.includes(s.id));
  if (base.length === 0) {
    throw new Error(
      'multi-strategy fan-out resolved to an empty strategy list — check strategyIds against the registry',
    );
  }
  return opts.maxStrategies === undefined ? base : base.slice(0, opts.maxStrategies);
}

/** Map one parsed strategy response into typed candidates (ids computed locally). */
function mapCandidates(
  strategy: StrategyDefinition,
  parsed: { readonly hypotheses: readonly unknown[] },
): readonly HypothesisCandidate[] {
  const out: HypothesisCandidate[] = [];
  for (const raw of parsed.hypotheses) {
    const c = raw as {
      statement: string;
      mechanism: string;
      falsificationMethod: {
        prediction: string;
        metric: string;
        comparator: 'gt' | 'lt' | 'range';
        value?: number;
        lower?: number;
        upper?: number;
      };
      supportingCitations: string[];
      counterEvidenceCitations: string[];
      relationToExistingTheory: string;
      alternativeExplanations: string[];
      observablePredictions: string[];
      distinguishingObservations: string[];
      noveltyRelativeToCorpus: string;
      assumptions: string[];
      risks: string[];
    };
    const falsificationMethod: FalsificationMethod = {
      prediction: c.falsificationMethod.prediction,
      metric: c.falsificationMethod.metric,
      comparator: c.falsificationMethod.comparator,
      ...(c.falsificationMethod.value !== undefined ? { value: c.falsificationMethod.value } : {}),
      ...(c.falsificationMethod.lower !== undefined ? { lower: c.falsificationMethod.lower } : {}),
      ...(c.falsificationMethod.upper !== undefined ? { upper: c.falsificationMethod.upper } : {}),
    };
    out.push({
      id: computeHypothesisId(c.statement, c.mechanism),
      statement: c.statement,
      mechanism: c.mechanism,
      falsificationMethod,
      supportingCitations: c.supportingCitations,
      counterEvidenceCitations: c.counterEvidenceCitations,
      relationToExistingTheory: c.relationToExistingTheory,
      alternativeExplanations: c.alternativeExplanations,
      observablePredictions: c.observablePredictions,
      distinguishingObservations: c.distinguishingObservations,
      noveltyRelativeToCorpus: c.noveltyRelativeToCorpus,
      assumptions: c.assumptions,
      risks: c.risks,
      strategyOrigin: strategy.id,
    });
  }
  return out;
}

/**
 * Run the multi-strategy fan-out and the deterministic merge gates.
 *
 * @throws when every attempted strategy failed (nothing honest to return), or
 *         when the merge yields zero candidates.
 */
export async function generateHypothesesMultiStrategy(
  gateway: LlmGateway,
  profile: ProviderProfile,
  opts: GenerateMultiStrategyOptions,
): Promise<{ hypotheses: readonly HypothesisCandidate[]; meta: FanoutMeta }> {
  const targetCount = opts.targetCount ?? 3;
  const strategies = resolveStrategyList(opts);
  const allowlist = renderCorpusAllowlist(opts.corpus);
  const corpusTexts = opts.corpus.documents.map((d) =>
    [d.title, d.abstract ?? ''].join('\n'),
  );
  const idf = buildIdf(corpusTexts);

  const perStrategy: StrategyCallResult[] = [];
  for (const strategy of strategies) {
    const applicability = strategy.evaluateApplicability({
      question: opts.question,
      corpus: opts.corpus,
    });
    if (!applicability.applicable) {
      perStrategy.push({
        strategyId: strategy.id,
        candidates: [],
        meta: null,
        error: null,
        skipReason: applicability.skipReason ?? 'not applicable',
      });
      continue;
    }
    try {
      const { data, meta } = await callStructuredJson(
        gateway,
        profile,
        `discovery_${strategy.id}`,
        buildStrategySchema(strategy.maxPerCall),
        buildStrategyMessages(strategy, {
          question: opts.question,
          corpusAllowlist: allowlist,
          perCallTarget: strategy.maxPerCall,
        }),
        8192,
      );
      perStrategy.push({
        strategyId: strategy.id,
        candidates: mapCandidates(strategy, data),
        meta,
        error: null,
        skipReason: null,
      });
    } catch (err) {
      // Fail-soft isolation: one strategy's structured-output failure is
      // recorded, not propagated — the other strategies' contributions stand.
      perStrategy.push({
        strategyId: strategy.id,
        candidates: [],
        meta: null,
        error: err instanceof Error ? err.message : String(err),
        skipReason: null,
      });
    }
  }

  const attempted = perStrategy.filter((r) => r.error === null && r.skipReason === null);
  const allErrored =
    attempted.length === 0 &&
    perStrategy.length > 0 &&
    perStrategy.every((r) => r.error !== null);
  if (allErrored) {
    const reasons = perStrategy
      .map((r) => `${r.strategyId}: ${r.error}`)
      .join('; ');
    throw new Error(
      `multi-strategy fan-out failed on every attempted strategy (fail-closed): ${reasons}`,
    );
  }

  // ── Deterministic merge gates ─────────────────────────────────────────────
  type Kept = { readonly candidate: HypothesisCandidate; readonly strategyIndex: number };
  const kept: Kept[] = [];
  let exactDuplicatesDropped = 0;
  const paraphraseFlagged: {
    keptId: string;
    droppedId: string;
    similarity: number;
    keptStrategy: StrategyId;
    droppedStrategy: StrategyId;
  }[] = [];

  for (let strategyIndex = 0; strategyIndex < strategies.length; strategyIndex += 1) {
    for (const candidate of perStrategy[strategyIndex]!.candidates) {
      if (kept.some((k) => k.candidate.id === candidate.id)) {
        exactDuplicatesDropped += 1;
        continue;
      }
      const text = `${candidate.statement}\n${candidate.mechanism}`;
      let paraphraseHit: (typeof paraphraseFlagged)[number] | null = null;
      for (const k of kept) {
        const keptText = `${k.candidate.statement}\n${k.candidate.mechanism}`;
        const similarity = paraphraseSimilarity(keptText, text, idf);
        if (similarity >= PARAPHRASE_THRESHOLD) {
          paraphraseHit = {
            keptId: k.candidate.id,
            droppedId: candidate.id,
            similarity,
            keptStrategy: k.candidate.strategyOrigin ?? strategies[k.strategyIndex]!.id,
            droppedStrategy: candidate.strategyOrigin ?? strategies[strategyIndex]!.id,
          };
          break;
        }
      }
      if (paraphraseHit !== null) {
        paraphraseFlagged.push(paraphraseHit);
        // Stamp the risk onto the KEPT candidate so critique/plan see it.
        const keptEntry = kept.find((k) => k.candidate.id === paraphraseHit.keptId)!;
        const index = kept.indexOf(keptEntry);
        kept[index] = {
          candidate: {
            ...keptEntry.candidate,
            risks: [
              ...keptEntry.candidate.risks,
              `${PARAPHRASE_RISK_MARKER}: near-duplicate candidate ${paraphraseHit.droppedId} (strategy ${paraphraseHit.droppedStrategy}) dropped at lexical similarity ${paraphraseHit.similarity.toFixed(4)} ≥ ${PARAPHRASE_THRESHOLD}`,
            ],
          },
          strategyIndex: keptEntry.strategyIndex,
        };
        continue;
      }
      kept.push({ candidate, strategyIndex });
    }
  }

  if (kept.length === 0) {
    const reasons = perStrategy
      .map((r) => `${r.strategyId}: ${r.error ?? r.skipReason ?? 'zero candidates'}`)
      .join('; ');
    throw new Error(`multi-strategy fan-out produced zero merged candidates: ${reasons}`);
  }

  // Deterministic truncation: (strategy index, id) — independent of LLM order.
  const ordered = [...kept].sort((a, b) => {
    if (a.strategyIndex !== b.strategyIndex) return a.strategyIndex - b.strategyIndex;
    return a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0;
  });
  const finalKept = ordered.slice(0, targetCount);
  const truncated = ordered
    .slice(targetCount)
    .map((k) => ({ id: k.candidate.id, strategyId: k.candidate.strategyOrigin ?? strategies[k.strategyIndex]!.id }));

  return {
    hypotheses: finalKept.map((k) => k.candidate),
    meta: {
      strategiesPlanned: strategies.map((s) => s.id),
      perStrategy,
      exactDuplicatesDropped,
      paraphraseFlagged,
      truncated,
      finalCount: finalKept.length,
      quotaShortfall: Math.max(0, targetCount - finalKept.length),
    },
  };
}
