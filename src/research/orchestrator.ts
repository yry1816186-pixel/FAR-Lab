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
 *       candidates only, when any exist)
 *     → structured executable research plan (corpus-injected)
 *     → ResearchRun (per-stage ProvenanceReceipts + per-component/aggregate run modes)
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
import type { CorpusSnapshot } from '../retrieval/corpus.ts';
import type { RetrievedDocument, RetrievalAdapter, DocumentSource } from '../retrieval/types.ts';
import { RETRIEVAL_PARSER_VERSION } from '../retrieval/types.ts';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../llm_gateway/types.ts';
import { generateHypotheses } from './hypothesis_generation.ts';
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
  hashCanonicalJson,
  type EnvironmentFingerprint,
  type ProvenanceReceipt,
} from './provenance.ts';
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
  /** Injected environment fingerprint (hermetic tests; default = real capture). */
  readonly environment?: EnvironmentFingerprint;
  /** Time source (hermetic tests). */
  readonly now?: () => Date;
}

/** Maximum decomposition subquestions injected as extra grounding queries. */
const MAX_DECOMPOSITION_QUERIES = 3;

/** A citation id that looks like a DOI (used for authoritative re-resolution). */
const DOI_PATTERN = /^doi:?\s*10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/i;

/**
 * Run the full Track-1A vertical slice and return an immutable ResearchRun.
 *
 * @throws ResearchabilityBlockedError when the gate refuses the question.
 * @throws Error on any retrieval / structured-output failure (fail-closed).
 */
export async function runResearch(opts: RunResearchOptions): Promise<ResearchRun> {
  const runId = opts.runId ?? ulid();
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const targetCount = opts.targetHypothesisCount ?? 3;
  const sameModelAsGenerator = opts.sameModelAsGenerator ?? true;
  const profile = opts.profile;
  const liveModel = profile !== 'offline_replay';
  const receipts: ProvenanceReceipt[] = [];
  let sequence = 0;
  const nextSeq = (): number => {
    sequence += 1;
    return sequence;
  };

  // ── 1. Researchability & safety gate (deterministic screening first). ─────
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
  const gateReport: ResearchabilityReport = {
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
  receipts.push(
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
  );
  receipts.push(receiptForModel(runId, 'research_decompose', nextSeq(), profile, decomposition.meta));

  // ── 2. Ground the question (supporting + counter-evidence + decomposition subquestions). ──
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
    extraQueries: decomposition.decomposition.retrievalSubquestions.slice(
      0,
      MAX_DECOMPOSITION_QUERIES,
    ),
  });
  let corpus: CorpusSnapshot = grounded.corpus;
  receipts.push(
    buildProvenanceReceipt({
      runId,
      stageId: 'grounding',
      sequence: nextSeq(),
      component: 'retrieval',
      mode: grounded.fetchMode === 'live' ? 'LIVE' : 'RECORDED_REPLAY',
      dataSource: grounded.sourcesUsed.join('+'),
      corpusSnapshotId: corpus.snapshotId,
      corpusRootHash: corpus.rootHash,
      retrievedAt: grounded.groundedAt,
      parserVersion: RETRIEVAL_PARSER_VERSION,
      createdAt: grounded.groundedAt,
    }),
  );

  // ── 3. Generate 3-5 candidate hypotheses (corpus-injected, citation allowlist). ──
  const generated = await generateHypotheses(opts.gateway, profile, {
    question: opts.question,
    corpus,
    targetCount,
  });
  const hypotheses: readonly HypothesisCandidate[] = generated.hypotheses;
  receipts.push(receiptForModel(runId, 'research_hypotheses', nextSeq(), profile, generated.meta));

  // ── 4. Bind citations (deterministic set-membership against the corpus). ──
  let bindings: Record<string, CitationBinding> = {};
  for (const h of hypotheses) {
    bindings[h.id] = bindCitations(h, grounded.resolver);
  }

  // ── 5. Citation gate: unbound citations are never evidence. In live mode,
  //        attempt authoritative DOI re-resolution before excluding them. ──
  const resolvedViaRetrieval: string[] = [];
  if (grounded.fetchMode === 'live') {
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
        grounded.groundedAt,
      );
      const resolver = new (await import('../retrieval/citation_resolver.ts')).CitationResolver(corpus);
      const rebind: Record<string, CitationBinding> = {};
      for (const h of hypotheses) {
        rebind[h.id] = bindCitations(h, resolver);
      }
      bindings = rebind;
      receipts.push(
        buildProvenanceReceipt({
          runId,
          stageId: 'citation_resolution',
          sequence: nextSeq(),
          component: 'retrieval',
          mode: 'LIVE',
          dataSource: 'crossref',
          corpusSnapshotId: corpus.snapshotId,
          corpusRootHash: corpus.rootHash,
          retrievedAt: grounded.groundedAt,
          parserVersion: RETRIEVAL_PARSER_VERSION,
          inputHash: hashCanonicalJson({ unbound: [...unboundIds] }),
          outputHash: hashCanonicalJson({ resolved: resolvedViaRetrieval }),
          createdAt: grounded.groundedAt,
        }),
      );
    }
  }
  const citationGate = computeCitationGateReport({
    bindings,
    primaryHypothesisId: null, // filled after primary selection
  });

  // ── 6. Falsifiability gate (kernel gate, deterministic — not the model). ──
  const falsifiabilityGate = computeFalsifiabilityGateReport(hypotheses);
  receipts.push(
    buildProvenanceReceipt({
      runId,
      stageId: 'falsifiability_gate',
      sequence: nextSeq(),
      component: 'deterministic',
      mode: liveModel ? 'LIVE' : 'RECORDED_REPLAY',
      inputHash: hashCanonicalJson(
        hypotheses.map((h) => ({ id: h.id, falsificationMethod: h.falsificationMethod })),
      ),
      outputHash: hashCanonicalJson(falsifiabilityGate),
      createdAt: now().toISOString(),
    }),
  );

  // ── 7. Independent critique pass (same-model honestly labeled). ──
  const critiques: Record<string, CritiqueReport> = {};
  const modelDimensions: Record<string, ReturnType<typeof computeDeterministicDimensions>> = {};
  for (const h of hypotheses) {
    const result = await critiqueHypothesis(opts.gateway, profile, h, {
      question: opts.question,
      corpus,
      sameModelAsGenerator,
    });
    critiques[h.id] = result.report;
    modelDimensions[h.id] = result.modelDimensions;
    receipts.push(
      receiptForModel(runId, `research_critique:${h.id.slice(0, 8)}`, nextSeq(), profile, result.meta),
    );
  }

  // ── 8. Score (deterministic dimensions + model dimensions, merged; Pareto front). ──
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
  receipts.push(
    buildProvenanceReceipt({
      runId,
      stageId: 'scoring',
      sequence: nextSeq(),
      component: 'deterministic',
      mode: liveModel ? 'LIVE' : 'RECORDED_REPLAY',
      inputHash: hashCanonicalJson({
        hypotheses: hypotheses.map((h) => ({ id: h.id, falsificationMethod: h.falsificationMethod })),
        bindings: Object.fromEntries(
          Object.entries(bindings).map(([id, b]) => [id, { allBound: b.allBound, unbound: b.unbound }]),
        ),
      }),
      outputHash: hashCanonicalJson(
        Object.fromEntries(
          Object.entries(scorecards).map(([id, s]) => [id, { paretoOptimal: s.paretoOptimal }]),
        ),
      ),
    }),
  );

  // ── 9. Deterministic primary selection. Directive §9.5: the primary must be
  //        fully-bound AND falsifiable when any candidate satisfies both. ──
  const primaryPool = admissibleHypotheses(hypotheses, bindings, falsifiabilityGate);
  const primary = selectPrimaryHypothesis(primaryPool, scorecards);
  const alternatives = hypotheses.filter((h) => h.id !== primary.id);

  const citationGateReport = {
    ...citationGate,
    perHypothesis: { ...citationGate.perHypothesis },
    primaryAllBound: bindings[primary.id]?.allBound === true,
    gateVerdict:
      citationGate.gateVerdict === 'PASS'
        ? 'PASS'
        : bindings[primary.id]?.allBound === true
          ? 'DEGRADED'
          : 'INCONCLUSIVE',
    resolvedViaRetrieval,
  } satisfies ResearchRun['citationGate'];

  // ── 10. Design the executable research plan (corpus-injected). ──
  const planned = await designResearchPlan(opts.gateway, profile, {
    question: opts.question,
    primary,
    alternatives,
    corpus,
  });
  const plan: ResearchPlan = planned.plan;
  receipts.push(receiptForModel(runId, 'research_plan', nextSeq(), profile, planned.meta));

  // ── 11. Environment fingerprint + component/aggregate run modes. ──
  const environment: EnvironmentFingerprint = opts.environment ?? (await captureEnvironmentFingerprint());

  const modelExecutionMode: ComponentMode = liveModel ? 'LIVE' : 'RECORDED_REPLAY';
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
    gateReport,
    corpus,
    hypotheses,
    bindings,
    critiques,
    scorecards,
    plan,
    revisions: [],
    observations: [],
    stageReceipts: receipts,
    environment,
    modes,
    runMode: aggregateRunMode(modes),
    startedAt,
    schemaVersion: 3,
    citationGate: citationGateReport,
    falsifiabilityGate,
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
    retries: meta.attempts - 1,
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
 * falsifiable candidates only, when at least one exists. If none qualifies,
 * the fallback pool is all hypotheses (the gate report then records the
 * honest degradation). Pure — reused by `far research verify`.
 */
export function admissibleHypotheses(
  hypotheses: readonly HypothesisCandidate[],
  bindings: Readonly<Record<string, CitationBinding>>,
  falsifiabilityGate: ResearchRun['falsifiabilityGate'],
): readonly HypothesisCandidate[] {
  const admissible = hypotheses.filter(
    (h) => bindings[h.id]?.allBound === true && falsifiabilityGate.perHypothesis[h.id]?.passed === true,
  );
  return admissible.length > 0 ? admissible : [...hypotheses];
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
