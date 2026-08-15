/**
 * research/orchestrator — the Track-1A vertical slice (directive §6 Phase 2).
 *
 * One command, one application service:
 *   scientific question
 *     → researchability & safety gate (deterministic screening + model decomposition)
 *     → grounding (real retrieval: supporting + counter-evidence + decomposition
 *       subquestions; optionally ≥2 source families)
 *     → CorpusSnapshot
 *     → generate 3-5 candidate hypotheses (corpus injected, citation allowlist)
 *     → citation binding (deterministic) + citation gate (unbound citations are
 *       never effective evidence; DOI re-resolution attempted in live mode)
 *     → falsifiability gate (kernel gate over every falsification method)
 *     → independent critique pass
 *     → multi-dimensional scorecard + Pareto front (deterministic + model)
 *     → deterministic primary-hypothesis selection (fully-bound + falsifiable
 *       candidates only; fail-closed when none qualifies)
 *     → structured executable research plan (corpus-injected)
 *     → ResearchRun (per-stage ProvenanceReceipts + per-component/aggregate run modes)
 *
 * Stage execution is driver-injected (§8: checkpoint/resume/cancel without
 * duplicating orchestration): the DEFAULT driver executes stages in order; the
 * lifecycle driver (run_lifecycle.ts) persists a checkpoint after each stage,
 * skips completed stages on resume, emits progress events, and honors abort.
 * Both drivers run the SAME stage functions — one business logic, many
 * execution modes (§12.1 single application service).
 *
 * The verdict kernel / FEC / proof envelope are the trust layer BELOW this
 * slice and are not re-implemented here.
 *
 * Fail-closed everywhere: a gate refusal throws ResearchabilityBlockedError;
 * a retrieval error propagates (a partial corpus would mislead); a structured
 * output failure propagates (a default payload would mislead).
 */

import { ulid } from 'ulid';
import { groundResearchQuestion, type GroundedCorpus } from '../retrieval/index.ts';
import { resolveCrossrefDoi } from '../retrieval/adapters/crossref.ts';
import { createCorpusSnapshot } from '../retrieval/corpus.ts';
import { CitationResolver } from '../retrieval/citation_resolver.ts';
import type { CorpusSnapshot } from '../retrieval/corpus.ts';
import type { RetrievedDocument, RetrievalAdapter, DocumentSource } from '../retrieval/types.ts';
import { RETRIEVAL_PARSER_VERSION } from '../retrieval/types.ts';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../llm_gateway/types.ts';
import { generateHypotheses } from './hypothesis_generation.ts';
import {
  generateHypothesesMultiStrategy,
  type FanoutMeta,
} from '../discovery/generate.ts';
import { screenCandidatesForDualUse } from '../discovery/safety/dual_use_gate.ts';
import type { StrategyId } from '../discovery/types.ts';
import { critiqueHypothesis } from './adversarial_review.ts';
import { designResearchPlan } from './research_plan.ts';
import { bindCitations } from './citation.ts';
import { computeCitationGateReport } from './citation_gate.ts';
import { computeFalsifiabilityGateReport } from './falsifiability_gate.ts';
import {
  buildScorecard,
  computeDeterministicDimensions,
  computeParetoFront,
} from './scorecard.ts';
import {
  assessResearchabilityDeterministic,
  decomposeResearchQuestion,
  ResearchabilityBlockedError,
  type ResearchabilityReport,
} from './researchability_gate.ts';
import {
  buildProvenanceReceipt,
  captureEnvironmentFingerprint,
  type EnvironmentFingerprint,
  type ProvenanceReceipt,
} from './provenance.ts';
import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import type { CallMeta } from './llm.ts';
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
  /**
   * Multiple source families to ground across in one run (directive §9.3).
   * When set it replaces `source`.
   */
  readonly sources?: readonly DocumentSource[];
  readonly maxPerQuery?: number;
  /** Injected replay adapter (offline/test) — marks retrieval as replay. */
  readonly adapter?: RetrievalAdapter;
  /** Disable counter-evidence queries (rarely wanted). */
  readonly includeCounterEvidence?: boolean;
  /**
   * Source-failure policy (directive §7 --degrade-on-source-failure): default
   * 'reject' (fail-closed grounding); 'degrade' drops failed families with a
   * failedSources receipt and grounds on the survivors.
   */
  readonly onSourceFailure?: 'reject' | 'degrade';
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
  /**
   * Hypothesis-generation strategy (discovery engine, directive §2.1).
   * 'legacy' = single-shot generateHypotheses (the original path —
   * @deprecated-transition: b2 flips the default to multi_strategy, b3 removes
   * the legacy path; Appendix A wiring plan). 'multi_strategy' = the
   * deterministic fan-out over the registered reasoning strategies.
   */
  readonly hypothesisGenerationStrategy?: 'legacy' | 'multi_strategy';
  /** Explicit strategy subset for multi_strategy (catalog-ordered; default: all registered). */
  readonly discoveryStrategies?: readonly StrategyId[];
  /** Receives the fan-out accounting when multi_strategy runs (CLI summary / lifecycle persistence seam). */
  readonly onFanoutComplete?: (meta: FanoutMeta) => void;
  /** Whether the critique uses the same model as the generator (default true). */
  readonly sameModelAsGenerator?: boolean;
  /** Optional run id (default: ULID). */
  readonly runId?: string;
  /** Injected environment fingerprint (hermetic tests; default = real capture). */
  readonly environment?: EnvironmentFingerprint;
  /** Time source (hermetic tests). */
  readonly now?: () => Date;
  /**
   * Stage execution driver (default: plain sequential execution). The
   * lifecycle driver adds checkpoint/resume/cancel/events without changing
   * what any stage computes.
   */
  readonly driver?: ResearchStageDriver;
  /**
   * Pre-seeded pipeline state (lifecycle resume): hydrated from a checkpoint
   * by run_lifecycle; completed stages are skipped by the driver. Internal
   * seam — ordinary callers never pass this.
   */
  readonly initialCtx?: ResearchCtx;
  /** Receives the LIVE ctx reference right after creation (driver checkpointing). */
  readonly onCtxReady?: (ctx: ResearchCtx) => void;
}

/**
 * Stage execution driver. `run` executes one pipeline stage (the stage mutates
 * the shared ctx); drivers may checkpoint ctx, skip completed stages, emit
 * events, or abort between stages. Stages always run in order.
 */
export interface ResearchStageDriver {
  run(stageId: ResearchStageId, fn: () => Promise<void>): Promise<void>;
}

/** Pipeline stage ids, in execution order (checkpoint granularity). */
export const RESEARCH_STAGE_IDS = [
  'researchability_gate',
  'grounding',
  'hypothesis_generation',
  'citation_binding',
  'falsifiability_gate',
  'critique',
  'scoring',
  'plan',
] as const;

export type ResearchStageId = (typeof RESEARCH_STAGE_IDS)[number];

/**
 * The serializable pipeline state shared across stages. `grounded.resolver`
 * (a pure function of the corpus) is rebuilt on hydration, never persisted.
 */
export interface ResearchCtx {
  runId: string;
  question: string;
  startedAt: string;
  receipts: ProvenanceReceipt[];
  sequence: number;
  gateReport: ResearchabilityReport | null;
  /** Retrieval subquestions from decomposition (consumed by grounding). */
  decompositionSubquestions: readonly string[];
  /** Grounding outputs; resolver is re-derived from corpus on hydrate. */
  grounded: {
    corpus: CorpusSnapshot | null;
    fetchMode: 'live' | 'replay';
    sourcesUsed: readonly string[];
    /** Dropped source families (degrade mode only). */
    failedSources?: ReadonlyArray<{ readonly source: string; readonly error: string }>;
    /** Documents replayed from the persistent retrieval cache. */
    cacheHits?: number;
    groundedAt: string;
    resolver: CitationResolver | null;
  };
  hypotheses: readonly HypothesisCandidate[];
  bindings: Record<string, CitationBinding>;
  corpus: CorpusSnapshot | null;
  resolvedViaRetrieval: string[];
  citationGate: ReturnType<typeof computeCitationGateReport> | null;
  falsifiabilityGate: ResearchRun['falsifiabilityGate'] | null;
  critiques: Record<string, CritiqueReport>;
  modelDimensions: Record<string, ReturnType<typeof computeDeterministicDimensions>>;
  scorecards: Record<string, HypothesisScorecard>;
  plan: ResearchPlan | null;
}

/** Map a pipeline stage to its lifecycle state (directive §16). */
export const STAGE_LIFECYCLE_STATE: Readonly<Record<ResearchStageId, string>> = {
  researchability_gate: 'VALIDATING',
  grounding: 'RETRIEVING',
  hypothesis_generation: 'GENERATING_HYPOTHESES',
  citation_binding: 'GENERATING_HYPOTHESES',
  falsifiability_gate: 'REVIEWING',
  critique: 'REVIEWING',
  scoring: 'REVIEWING',
  plan: 'PLANNING',
};

/** Maximum decomposition subquestions injected as extra grounding queries. */
const MAX_DECOMPOSITION_QUERIES = 3;

/** A citation id that looks like a DOI (used for authoritative re-resolution). */
const DOI_PATTERN = /^doi:?\s*10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/i;

/** The default driver: plain sequential execution, no checkpointing. */
export const identityDriver: ResearchStageDriver = {
  async run(_stageId, fn) {
    await fn();
  },
};

/** Strip non-serializable ctx members for checkpoint persistence. */
export function ctxToSerializable(ctx: ResearchCtx): Record<string, unknown> {
  return {
    ...ctx,
    // Append-only arrays are copied: a saved checkpoint must be an immutable
    // snapshot — a mid-stage push into the live ctx must never leak into a
    // checkpoint written later (FAILED saves capture the last COMPLETED stage).
    receipts: [...ctx.receipts],
    hypotheses: [...ctx.hypotheses],
    decompositionSubquestions: [...ctx.decompositionSubquestions],
    resolvedViaRetrieval: [...ctx.resolvedViaRetrieval],
    grounded: { ...ctx.grounded, resolver: null },
  };
}

/** Rebuild the derived resolver after hydrating a ctx from a checkpoint. */
export function hydrateCtxResolver(ctx: ResearchCtx): void {
  if (ctx.grounded.corpus !== null && ctx.grounded.resolver === null) {
    ctx.grounded.resolver = new CitationResolver(ctx.grounded.corpus);
  }
}

/**
 * Run the full Track-1A vertical slice and return an immutable ResearchRun.
 *
 * @throws ResearchabilityBlockedError when the gate refuses the question.
 * @throws Error on any retrieval / structured-output failure (fail-closed).
 */
export async function runResearch(opts: RunResearchOptions): Promise<ResearchRun> {
  const driver = opts.driver ?? identityDriver;
  const runId = opts.runId ?? ulid();
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const targetCount = opts.targetHypothesisCount ?? 3;
  const sameModelAsGenerator = opts.sameModelAsGenerator ?? true;
  const profile = opts.profile;
  const liveModel = profile !== 'offline_replay';

  const ctx: ResearchCtx = opts.initialCtx !== undefined
    ? { ...opts.initialCtx, runId, question: opts.question }
    : {
        runId,
        question: opts.question,
        startedAt,
        receipts: [],
        sequence: 0,
        gateReport: null,
        decompositionSubquestions: [],
        grounded: { corpus: null, fetchMode: 'replay', sourcesUsed: [], groundedAt: startedAt, resolver: null },
        hypotheses: [],
        bindings: {},
        corpus: null,
        resolvedViaRetrieval: [],
        citationGate: null,
        falsifiabilityGate: null,
        critiques: {},
        modelDimensions: {},
        scorecards: {},
        plan: null,
      };
  hydrateCtxResolver(ctx);
  opts.onCtxReady?.(ctx);
  const nextSeq = (): number => {
    ctx.sequence += 1;
    return ctx.sequence;
  };

  // ── 1. Researchability & safety gate (deterministic screening first). ─────
  await driver.run('researchability_gate', async () => {
    const screening = assessResearchabilityDeterministic(opts.question);
    if (screening.verdict === 'UNSUPPORTED') {
      throw new ResearchabilityBlockedError({
        question: opts.question,
        verdict: 'UNSUPPORTED',
        reasons: screening.reasons,
        safetyRisks: screening.safetyRisks,
        scope: screening.scope,
        decomposition: null,
        requiresEthicsGate: screening.requiresEthicsGate,
        assessedAt: startedAt,
        schemaVersion: 1,
      });
    }

    const decomposition = await decomposeResearchQuestion(
      opts.gateway,
      profile,
      opts.question,
      screening.scope,
    );
    ctx.gateReport = {
      question: opts.question,
      verdict: screening.verdict,
      reasons: screening.reasons,
      safetyRisks: screening.safetyRisks,
      scope: screening.scope,
      decomposition: decomposition.decomposition,
      requiresEthicsGate: screening.requiresEthicsGate,
      assessedAt: startedAt,
      schemaVersion: 1,
    };
    ctx.receipts.push(
      buildProvenanceReceipt({
        runId,
        stageId: 'researchability_screening',
        sequence: nextSeq(),
        component: 'deterministic',
        mode: liveModel ? 'LIVE' : 'RECORDED_REPLAY',
        inputHash: hashCanonicalJson({ question: opts.question }),
        outputHash: hashCanonicalJson({
          verdict: screening.verdict,
          reasons: screening.reasons,
          safetyRisks: screening.safetyRisks,
        }),
        createdAt: startedAt,
      }),
      receiptForModel(runId, 'research_decompose', nextSeq(), profile, decomposition.meta),
    );
    ctx.decompositionSubquestions = decomposition.decomposition.retrievalSubquestions;
  });

  // ── 2. Ground the question (supporting + counter-evidence + decomposition subquestions). ──
  await driver.run('grounding', async () => {
    const grounded: GroundedCorpus = await groundResearchQuestion({
      question: opts.question,
      ...(opts.grounding?.sources !== undefined && opts.grounding.sources.length > 0
        ? { sources: opts.grounding.sources }
        : { source: opts.grounding?.source ?? 'openalex' }),
      maxPerQuery: opts.grounding?.maxPerQuery ?? 5,
      ...(opts.grounding?.adapter !== undefined ? { adapter: opts.grounding.adapter } : {}),
      ...(opts.grounding?.includeCounterEvidence !== undefined
        ? { includeCounterEvidence: opts.grounding.includeCounterEvidence }
        : {}),
      extraQueries: (ctx.decompositionSubquestions ?? []).slice(0, MAX_DECOMPOSITION_QUERIES),
      ...(opts.grounding?.onSourceFailure !== undefined
        ? { onSourceFailure: opts.grounding.onSourceFailure }
        : {}),
    });
    ctx.grounded = {
      corpus: grounded.corpus,
      fetchMode: grounded.fetchMode,
      sourcesUsed: grounded.sourcesUsed,
      ...(grounded.failedSources !== undefined ? { failedSources: grounded.failedSources } : {}),
      ...(grounded.cacheHits !== undefined ? { cacheHits: grounded.cacheHits } : {}),
      groundedAt: grounded.groundedAt,
      resolver: grounded.resolver,
    };
    ctx.corpus = grounded.corpus;
    ctx.receipts.push(
      buildProvenanceReceipt({
        runId,
        stageId: 'grounding',
        sequence: nextSeq(),
        component: 'retrieval',
        mode: grounded.fetchMode === 'live' ? 'LIVE' : 'RECORDED_REPLAY',
        dataSource: grounded.sourcesUsed.join('+'),
        corpusSnapshotId: grounded.corpus.snapshotId,
        corpusRootHash: grounded.corpus.rootHash,
        retrievedAt: grounded.groundedAt,
        parserVersion: RETRIEVAL_PARSER_VERSION,
        // Degrade mode receipts NAME the dropped families (visible, never silent).
        errors: (grounded.failedSources ?? []).map((f) => `${f.source}: ${f.error}`),
        createdAt: grounded.groundedAt,
      }),
    );
  });

  // ── 3. Generate 3-5 candidate hypotheses (corpus-injected, citation allowlist). ──
  await driver.run('hypothesis_generation', async () => {
    const corpus = ctx.corpus!;
    if ((opts.hypothesisGenerationStrategy ?? 'legacy') === 'multi_strategy') {
      // Discovery fan-out (directive §2.1/§2.2): every applicable strategy
      // contributes candidates; one receipt per strategy call keeps the
      // per-strategy provenance; the merge gates are deterministic.
      const fanout = await generateHypothesesMultiStrategy(opts.gateway, profile, {
        question: opts.question,
        corpus,
        targetCount,
        ...(opts.discoveryStrategies !== undefined
          ? { strategyIds: opts.discoveryStrategies }
          : {}),
      });
      ctx.hypotheses = fanout.hypotheses;
      for (const result of fanout.meta.perStrategy) {
        if (result.meta !== null) {
          ctx.receipts.push(
            receiptForModel(runId, `discovery_${result.strategyId}`, nextSeq(), profile, result.meta),
          );
        }
      }
      ctx.receipts.push(
        buildProvenanceReceipt({
          runId,
          stageId: 'discovery_fanout',
          sequence: nextSeq(),
          component: 'deterministic',
          mode: profile === 'offline_replay' ? 'RECORDED_REPLAY' : 'LIVE',
          inputHash: hashCanonicalJson({
            strategies: fanout.meta.strategiesPlanned,
            question: opts.question,
            corpusSnapshotId: corpus.snapshotId,
          }),
          outputHash: hashCanonicalJson({
            finalCount: fanout.meta.finalCount,
            quotaShortfall: fanout.meta.quotaShortfall,
            exactDuplicatesDropped: fanout.meta.exactDuplicatesDropped,
            paraphraseFlagged: fanout.meta.paraphraseFlagged,
            truncated: fanout.meta.truncated,
            perStrategy: fanout.meta.perStrategy.map((r) => ({
              strategyId: r.strategyId,
              contributed: r.candidates.length,
              error: r.error,
              skipReason: r.skipReason,
            })),
          }),
          corpusSnapshotId: corpus.snapshotId,
          corpusRootHash: corpus.rootHash,
          createdAt: now().toISOString(),
          errors: fanout.meta.perStrategy
            .filter((r) => r.error !== null)
            .map((r) => `${r.strategyId}: ${r.error}`),
        }),
      );
      opts.onFanoutComplete?.(fanout.meta);

      // Dual-use safety gate (directive §2.6): every fan-out candidate passes
      // the deterministic+model joint screen BEFORE entering the pipeline.
      // All-blocked/all-held → fail-closed (never an empty silent pipeline).
      const safety = await screenCandidatesForDualUse(opts.gateway, profile, fanout.hypotheses);
      if (safety.allowed.length === 0) {
        const reasons = safety.held
          .map((h) => `${h.candidate.id}: ${h.reasonCode}(${h.detail})`)
          .join('; ');
        throw new Error(
          `discovery safety gate: every fan-out candidate was blocked or held — nothing may proceed (${reasons})`,
        );
      }
      ctx.hypotheses = safety.allowed;
      ctx.receipts.push(
        buildProvenanceReceipt({
          runId,
          stageId: 'discovery_safety_gate',
          sequence: nextSeq(),
          component: 'deterministic',
          mode: profile === 'offline_replay' ? 'RECORDED_REPLAY' : 'LIVE',
          inputHash: hashCanonicalJson({
            candidateIds: fanout.hypotheses.map((h) => h.id),
          }),
          outputHash: hashCanonicalJson({
            allowedIds: safety.allowed.map((h) => h.id),
            held: safety.held.map((h) => ({
              id: h.candidate.id,
              reasonCode: h.reasonCode,
              categories: h.categories,
              matchedRuleIds: h.matchedRuleIds,
            })),
            meta: safety.meta,
          }),
          corpusSnapshotId: corpus.snapshotId,
          corpusRootHash: corpus.rootHash,
          createdAt: now().toISOString(),
          errors: safety.held.map((h) => `${h.candidate.id}: ${h.reasonCode}: ${h.detail}`),
        }),
      );
      return;
    }
    const generated = await generateHypotheses(opts.gateway, profile, {
      question: opts.question,
      corpus,
      targetCount,
    });
    ctx.hypotheses = generated.hypotheses;
    ctx.receipts.push(
      receiptForModel(runId, 'research_hypotheses', nextSeq(), profile, generated.meta),
    );
  });

  // ── 4. Citation gate: bind deterministically; in live mode attempt
  //        authoritative DOI re-resolution before excluding unbound ids. ──
  await driver.run('citation_binding', async () => {
    let corpus = ctx.corpus!;
    const resolver = ctx.grounded.resolver!;
    let bindings: Record<string, CitationBinding> = {};
    for (const h of ctx.hypotheses) {
      bindings[h.id] = bindCitations(h, resolver);
    }

    const resolvedViaRetrieval: string[] = [];
    if (ctx.grounded.fetchMode === 'live') {
      const unboundIds = new Set(
        Object.values(bindings).flatMap((b) => [...b.unbound]),
      );
      const resolvedDocs: RetrievedDocument[] = [];
      for (const id of unboundIds) {
        const normalized = id.toLowerCase().replace(/^doi:/, '').trim();
        if (!DOI_PATTERN.test(id)) continue;
        const doc = await resolveCrossrefDoi(normalized);
        if (doc === null) continue;
        resolvedDocs.push(doc);
        resolvedViaRetrieval.push(id);
      }
      if (resolvedDocs.length > 0) {
        // The corpus is content-addressed: adding resolved documents creates a
        // NEW snapshot (honest — the corpus identity changed) and re-binds.
        corpus = createCorpusSnapshot(
          [...corpus.documents, ...resolvedDocs],
          [...corpus.sourceQueries, 'unbound-citation-doi-resolution'],
          ctx.grounded.groundedAt,
        );
        const reResolver = new CitationResolver(corpus);
        const rebind: Record<string, CitationBinding> = {};
        for (const h of ctx.hypotheses) {
          rebind[h.id] = bindCitations(h, reResolver);
        }
        bindings = rebind;
        ctx.receipts.push(
          buildProvenanceReceipt({
            runId,
            stageId: 'citation_resolution',
            sequence: nextSeq(),
            component: 'retrieval',
            mode: 'LIVE',
            dataSource: 'crossref',
            corpusSnapshotId: corpus.snapshotId,
            corpusRootHash: corpus.rootHash,
            retrievedAt: ctx.grounded.groundedAt,
            parserVersion: RETRIEVAL_PARSER_VERSION,
            inputHash: hashCanonicalJson({ unbound: [...unboundIds] }),
            outputHash: hashCanonicalJson({ resolved: resolvedViaRetrieval }),
            createdAt: ctx.grounded.groundedAt,
          }),
        );
      }
    }
    ctx.corpus = corpus;
    ctx.grounded.corpus = corpus;
    ctx.grounded.resolver = new CitationResolver(corpus);
    ctx.bindings = bindings;
    ctx.resolvedViaRetrieval = resolvedViaRetrieval;
    ctx.citationGate = computeCitationGateReport({
      bindings,
      primaryHypothesisId: null, // filled after primary selection
    });
  });

  // ── 5. Falsifiability gate (kernel gate, deterministic — not the model). ──
  await driver.run('falsifiability_gate', async () => {
    ctx.falsifiabilityGate = computeFalsifiabilityGateReport(ctx.hypotheses);
    ctx.receipts.push(
      buildProvenanceReceipt({
        runId,
        stageId: 'falsifiability_gate',
        sequence: nextSeq(),
        component: 'deterministic',
        mode: liveModel ? 'LIVE' : 'RECORDED_REPLAY',
        inputHash: hashCanonicalJson(
          ctx.hypotheses.map((h) => ({ id: h.id, falsificationMethod: h.falsificationMethod })),
        ),
        outputHash: hashCanonicalJson(ctx.falsifiabilityGate),
        createdAt: now().toISOString(),
      }),
    );
  });

  // ── 6. Independent critique pass (same-model honestly labeled). ──
  await driver.run('critique', async () => {
    const critiques: Record<string, CritiqueReport> = {};
    const modelDimensions: Record<string, ReturnType<typeof computeDeterministicDimensions>> = {};
    for (const h of ctx.hypotheses) {
      const result = await critiqueHypothesis(opts.gateway, profile, h, {
        question: opts.question,
        corpus: ctx.corpus!,
        sameModelAsGenerator,
      });
      critiques[h.id] = result.report;
      modelDimensions[h.id] = result.modelDimensions;
      ctx.receipts.push(
        receiptForModel(runId, `research_critique:${h.id.slice(0, 8)}`, nextSeq(), profile, result.meta),
      );
    }
    ctx.critiques = critiques;
    ctx.modelDimensions = modelDimensions;
  });

  // ── 7. Score (deterministic dimensions + model dimensions, merged; Pareto front). ──
  await driver.run('scoring', async () => {
    const scorecards: Record<string, HypothesisScorecard> = {};
    for (const h of ctx.hypotheses) {
      const binding = ctx.bindings[h.id];
      if (binding === undefined) continue;
      const deterministic = computeDeterministicDimensions(h, binding, ctx.critiques[h.id]);
      const merged = buildScorecard(
        h.id,
        deterministic,
        ctx.modelDimensions[h.id] ?? [],
        false, // Pareto updated after all scorecards built
        ctx.critiques[h.id] === undefined
          ? ''
          : ctx.modelDimensions[h.id]?.find((d) => d.name === 'ExpectedInformationGain')?.rationale ??
              'no key-evidence hint provided',
      );
      scorecards[h.id] = merged;
    }
    const pareto = computeParetoFront(scorecards);
    for (const id of Object.keys(scorecards)) {
      scorecards[id] = { ...scorecards[id]!, paretoOptimal: pareto.has(id) };
    }
    ctx.scorecards = scorecards;
    ctx.receipts.push(
      buildProvenanceReceipt({
        runId,
        stageId: 'scoring',
        sequence: nextSeq(),
        component: 'deterministic',
        mode: liveModel ? 'LIVE' : 'RECORDED_REPLAY',
        inputHash: hashCanonicalJson({
          hypotheses: ctx.hypotheses.map((h) => ({ id: h.id, falsificationMethod: h.falsificationMethod })),
          bindings: Object.fromEntries(
            Object.entries(ctx.bindings).map(([id, b]) => [id, { allBound: b.allBound, unbound: b.unbound }]),
          ),
        }),
        outputHash: hashCanonicalJson(
          Object.fromEntries(
            Object.entries(scorecards).map(([id, s]) => [id, { paretoOptimal: s.paretoOptimal }]),
          ),
        ),
      }),
    );
  });

  // ── 8. Deterministic primary selection. Directive §9.5 + fail-closed: the
  //        primary MUST be fully-bound AND falsifiable. When no candidate
  //        qualifies, the run aborts honestly — it never promotes an
  //        unfalsifiable/unbound hypothesis to primary. ──
  const primaryPool = admissibleHypotheses(ctx.hypotheses, ctx.bindings, ctx.falsifiabilityGate!);
  if (primaryPool.length === 0) {
    const gateFailed = ctx.hypotheses
      .filter((h) => ctx.falsifiabilityGate!.perHypothesis[h.id]?.passed !== true)
      .map((h) => h.id)
      .join(', ');
    const unbound = ctx.hypotheses
      .filter((h) => ctx.bindings[h.id]?.allBound !== true)
      .map((h) => h.id)
      .join(', ');
    throw new Error(
      'research: fail-closed at primary selection — no hypothesis is both fully citation-bound ' +
        'and falsifiable, so no defensible research plan can be designed. ' +
        `falsifiability-gate failed: [${gateFailed}] · unbound citations: [${unbound}]. ` +
        'Re-run with a more specific question, more grounding documents, or a higher --target.',
    );
  }
  const primary = selectPrimaryHypothesis(primaryPool, ctx.scorecards);
  const alternatives = ctx.hypotheses.filter((h) => h.id !== primary.id);

  const citationGateReport = {
    ...ctx.citationGate!,
    perHypothesis: { ...ctx.citationGate!.perHypothesis },
    primaryAllBound: ctx.bindings[primary.id]?.allBound === true,
    gateVerdict:
      ctx.citationGate!.gateVerdict === 'PASS'
        ? 'PASS'
        : ctx.bindings[primary.id]?.allBound === true
          ? 'DEGRADED'
          : 'INCONCLUSIVE',
    resolvedViaRetrieval: ctx.resolvedViaRetrieval,
  } satisfies ResearchRun['citationGate'];

  // ── 9. Design the executable research plan (corpus-injected). ──
  await driver.run('plan', async () => {
    const planned = await designResearchPlan(opts.gateway, profile, {
      question: opts.question,
      primary,
      alternatives,
      corpus: ctx.corpus!,
    });
    ctx.plan = planned.plan;
    ctx.receipts.push(receiptForModel(runId, 'research_plan', nextSeq(), profile, planned.meta));
  });

  // ── 10. Environment fingerprint + component/aggregate run modes. ──
  const environment: EnvironmentFingerprint = opts.environment ?? (await captureEnvironmentFingerprint());

  const modelExecutionMode: ComponentMode = liveModel ? 'LIVE' : 'RECORDED_REPLAY';
  const retrievalExecutionMode: ComponentMode =
    ctx.grounded.fetchMode === 'live' ? 'LIVE' : 'RECORDED_REPLAY';
  const experimentExecutionMode: ComponentMode = 'NOT_EXECUTED';
  const modes = {
    modelExecutionMode,
    retrievalExecutionMode,
    experimentExecutionMode,
  };

  return {
    runId,
    question: opts.question,
    gateReport: ctx.gateReport!,
    corpus: ctx.corpus!,
    hypotheses: ctx.hypotheses,
    bindings: ctx.bindings,
    critiques: ctx.critiques,
    scorecards: ctx.scorecards,
    plan: ctx.plan!,
    revisions: [],
    observations: [],
    stageReceipts: ctx.receipts,
    environment,
    modes,
    runMode: aggregateRunMode(modes),
    startedAt,
    schemaVersion: 3,
    citationGate: citationGateReport,
    falsifiabilityGate: ctx.falsifiabilityGate!,
  };
}

/** Build a model-stage receipt from a CallMeta (shared shape). */
function receiptForModel(
  runId: string,
  stageId: string,
  sequence: number,
  profile: ProviderProfile,
  meta: CallMeta,
): ProvenanceReceipt {
  return buildProvenanceReceipt({
    runId,
    stageId,
    sequence,
    component: 'model',
    mode: profile === 'offline_replay' ? 'RECORDED_REPLAY' : 'LIVE',
    provider: meta.provider,
    modelId: meta.modelId,
    requestId: meta.requestId,
    modelSnapshot: meta.modelSnapshot,
    tokenUsage: meta.tokenUsage,
    latencyMs: meta.latencyMs,
    retries: meta.attempts - 1 + meta.providerRetries,
    finishReason: meta.finishReason,
    cost: meta.cost,
    createdAt: meta.isoTimestamp,
  });
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
 * The candidate pool for primary selection (directive §9.5): fully-bound AND
 * falsifiable candidates ONLY — no fallback. When the result is empty the
 * orchestrator must fail closed (an unfalsifiable or unbound hypothesis can
 * never become the research plan's primary target; 2026-08-14 live-run
 * defect: a gate-FAILED hypothesis was selected via the old all-fallback).
 * Pure — reused by `far research verify`.
 */
export function admissibleHypotheses(
  hypotheses: readonly HypothesisCandidate[],
  bindings: Readonly<Record<string, CitationBinding>>,
  falsifiabilityGate: ResearchRun['falsifiabilityGate'],
): readonly HypothesisCandidate[] {
  return hypotheses.filter(
    (h) => bindings[h.id]?.allBound === true && falsifiabilityGate.perHypothesis[h.id]?.passed === true,
  );
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
