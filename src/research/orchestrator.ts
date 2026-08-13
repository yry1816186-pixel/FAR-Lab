/**
 * research/orchestrator — the Track-1A vertical slice (directive §6 Phase 2).
 *
 * One command, one application service:
 *   scientific question
 *     → grounding (real retrieval: supporting + counter-evidence)
 *     → CorpusSnapshot
 *     → generate 3-5 candidate hypotheses (corpus injected, citation allowlist)
 *     → independent critique pass
 *     → citation binding (deterministic)
 *     → multi-dimensional scorecard + Pareto front (deterministic + model)
 *     → deterministic primary-hypothesis selection
 *     → structured executable research plan
 *     → ResearchRun (with per-component + aggregate run modes)
 *
 * The verdict kernel / FEC / proof envelope are the trust layer BELOW this
 * slice and are not re-implemented here.
 */

import { ulid } from 'ulid';
import { groundResearchQuestion, type GroundedCorpus } from '../retrieval/index.ts';
import type { RetrievalAdapter, DocumentSource } from '../retrieval/types.ts';
import type { CorpusSnapshot } from '../retrieval/corpus.ts';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../llm_gateway/types.ts';
import { generateHypotheses } from './hypothesis_generation.ts';
import { critiqueHypothesis } from './adversarial_review.ts';
import { designResearchPlan } from './research_plan.ts';
import { bindCitations } from './citation.ts';
import {
  buildScorecard,
  computeDeterministicDimensions,
  computeParetoFront,
} from './scorecard.ts';
import type {
  CitationBinding,
  ComponentMode,
  CritiqueReport,
  HypothesisCandidate,
  HypothesisScorecard,
  ResearchPlan,
  ResearchRun,
  RunMode,
} from './types.ts';

/** Grounding options (omitted → live retrieval from OpenAlex). */
export interface ResearchGroundingOptions {
  readonly source?: DocumentSource;
  readonly maxPerQuery?: number;
  /** Injected replay adapter (offline/test) — marks retrieval as replay. */
  readonly adapter?: RetrievalAdapter;
  /** Disable counter-evidence queries (rarely wanted). */
  readonly includeCounterEvidence?: boolean;
}

/** Options for one research run. */
export interface RunResearchOptions {
  /** The scientific question. */
  readonly question: string;
  /** The LLM gateway (live or offline_replay). */
  readonly gateway: LlmGateway;
  /** The provider profile to call. */
  readonly profile: ProviderProfile;
  /** Grounding options (default: live OpenAlex, 5/query, counter-evidence on). */
  readonly grounding?: ResearchGroundingOptions;
  /** Target hypothesis count (3-5, default 3). */
  readonly targetHypothesisCount?: number;
  /** Whether the critique uses the same model as the generator (default true). */
  readonly sameModelAsGenerator?: boolean;
  /** Optional run id (default: ULID). */
  readonly runId?: string;
}

/**
 * Run the full Track-1A vertical slice and return an immutable ResearchRun.
 *
 * Fail-closed: any retrieval error propagates (a partial corpus would mislead);
 * any structured-output failure propagates (a default payload would mislead).
 */
export async function runResearch(opts: RunResearchOptions): Promise<ResearchRun> {
  const runId = opts.runId ?? ulid();
  const startedAt = new Date().toISOString();
  const targetCount = opts.targetHypothesisCount ?? 3;
  const sameModelAsGenerator = opts.sameModelAsGenerator ?? true;

  // 1. Ground the question (supporting + counter-evidence → CorpusSnapshot).
  const grounded: GroundedCorpus = await groundResearchQuestion({
    question: opts.question,
    source: opts.grounding?.source ?? 'openalex',
    maxPerQuery: opts.grounding?.maxPerQuery ?? 5,
    ...(opts.grounding?.adapter !== undefined ? { adapter: opts.grounding.adapter } : {}),
    ...(opts.grounding?.includeCounterEvidence !== undefined
      ? { includeCounterEvidence: opts.grounding.includeCounterEvidence }
      : {}),
  });
  const corpus: CorpusSnapshot = grounded.corpus;

  // 2. Generate 3-5 candidate hypotheses (corpus-injected, citation allowlist).
  const hypotheses: readonly HypothesisCandidate[] = await generateHypotheses(
    opts.gateway,
    opts.profile,
    { question: opts.question, corpus, targetCount },
  );

  // 3. Bind citations (deterministic set-membership against the corpus).
  const bindings: Record<string, CitationBinding> = {};
  for (const h of hypotheses) {
    bindings[h.id] = bindCitations(h, grounded.resolver);
  }

  // 4. Independent critique pass (same-model honestly labeled).
  const critiques: Record<string, CritiqueReport> = {};
  const modelDimensions: Record<string, ReturnType<typeof computeDeterministicDimensions>> = {};
  for (const h of hypotheses) {
    const result = await critiqueHypothesis(opts.gateway, opts.profile, h, {
      question: opts.question,
      corpus,
      sameModelAsGenerator,
    });
    critiques[h.id] = result.report;
    modelDimensions[h.id] = result.modelDimensions;
  }

  // 5. Score (deterministic dimensions + model dimensions, merged; Pareto front).
  const scorecards: Record<string, HypothesisScorecard> = {};
  for (const h of hypotheses) {
    const binding = bindings[h.id];
    if (binding === undefined) continue;
    const deterministic = computeDeterministicDimensions(h, binding, critiques[h.id]);
    const merged = buildScorecard(
      h.id,
      deterministic,
      modelDimensions[h.id] ?? [],
      false, // Pareto updated after all scorecards built
      critiques[h.id] === undefined
        ? ''
        : modelDimensions[h.id]?.find((d) => d.name === 'ExpectedInformationGain')?.rationale ??
            'no key-evidence hint provided',
    );
    scorecards[h.id] = merged;
  }
  const pareto = computeParetoFront(scorecards);
  for (const id of Object.keys(scorecards)) {
    scorecards[id] = { ...scorecards[id]!, paretoOptimal: pareto.has(id) };
  }

  // 6. Deterministic primary selection (Pareto front + deterministic grades only).
  const primary = selectPrimaryHypothesis(hypotheses, scorecards);
  const alternatives = hypotheses.filter((h) => h.id !== primary.id);

  // 7. Design the executable research plan.
  const plan: ResearchPlan = await designResearchPlan(opts.gateway, opts.profile, {
    question: opts.question,
    primary,
    alternatives,
    corpus,
  });

  // 8. Component + aggregate run modes.
  const modelExecutionMode: ComponentMode =
    opts.profile === 'offline_replay' ? 'RECORDED_REPLAY' : 'LIVE';
  const retrievalExecutionMode: ComponentMode =
    grounded.fetchMode === 'live' ? 'LIVE' : 'RECORDED_REPLAY';
  const experimentExecutionMode: ComponentMode = 'NOT_EXECUTED';
  const modes = {
    modelExecutionMode,
    retrievalExecutionMode,
    experimentExecutionMode,
  };

  return {
    runId,
    question: opts.question,
    corpus,
    hypotheses,
    bindings,
    critiques,
    scorecards,
    plan,
    revisions: [],
    modes,
    runMode: aggregateRunMode(modes),
    startedAt,
    schemaVersion: 1,
  };
}

/**
 * Aggregate run mode (directive §3.2): LIVE only if every science-affecting
 * component is LIVE; all-replay/offline → RECORDED_REPLAY; mixed → MIXED.
 */
export function aggregateRunMode(modes: {
  readonly modelExecutionMode: ComponentMode;
  readonly retrievalExecutionMode: ComponentMode;
  readonly experimentExecutionMode: ComponentMode;
}): RunMode {
  const components: readonly ComponentMode[] = [
    modes.modelExecutionMode,
    modes.retrievalExecutionMode,
    // experiment is NOT_EXECUTED in the hypothesis/plan slice → does not force MIXED.
  ];
  if (components.every((m) => m === 'LIVE')) {
    return 'LIVE';
  }
  if (components.every((m) => m === 'RECORDED_REPLAY' || m === 'OFFLINE_DEVELOPMENT')) {
    return 'RECORDED_REPLAY';
  }
  return 'MIXED';
}

/**
 * Deterministically select the primary hypothesis from the Pareto front, using
 * only the DETERMINISTIC scorecard dimensions (reproducible, not model-driven).
 * Ties broken by hypothesis id (stable).
 */
export function selectPrimaryHypothesis(
  hypotheses: readonly HypothesisCandidate[],
  scorecards: Readonly<Record<string, HypothesisScorecard>>,
): HypothesisCandidate {
  const pareto = hypotheses.filter((h) => scorecards[h.id]?.paretoOptimal === true);
  const candidates = pareto.length > 0 ? pareto : [...hypotheses];
  if (candidates.length === 0) {
    throw new Error('research: cannot select primary hypothesis — no candidates produced');
  }

  const gradeValue: Readonly<Record<string, number>> = {
    A: 5, B: 4, C: 3, D: 2, F: 1, NOT_APPLICABLE: 0,
  };
  const deterministicTotal = (h: HypothesisCandidate): number => {
    const dims = scorecards[h.id]?.dimensions ?? [];
    return dims
      .filter((d) => d.source === 'deterministic')
      .reduce((sum, d) => sum + (gradeValue[d.grade] ?? 0), 0);
  };

  return [...candidates].sort((a, b) => {
    const diff = deterministicTotal(b) - deterministicTotal(a);
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0]!;
}
