import type { ModelProvider, StructuredCallRequest, StructuredCallResult } from '../shared/ports.js';
import type { ModelProviderConfig } from '../domain/model-config.js';
import { computeRequestHash } from './http.js';
import { canonicalJson, canonicalSha256 } from '../shared/crypto.js';

/**
 * OFFLINE DEVELOPMENT WIRE (providers/custom.ts wire='offline').
 *
 * A deterministic, in-process ModelProvider for the product's OFFLINE_DEVELOPMENT
 * truth mode: it performs NO network call, uses NO key, and answers every pipeline
 * purpose with a deterministic, schema-valid payload so a researcher can exercise
 * the full journey — create run, watch stages progress, read results — without
 * credentials or quota. It exists for development and demonstration only:
 *
 * - every receipt is stamped executionMode 'test' (never 'live');
 * - it is only ever reachable through an EXPLICIT user model config with
 *   wire 'offline' (run.providerConfigId / active default) — the env chain
 *   (defaultLiveProvider) refuses it and the registry's live set is untouched;
 * - competition-route mode rejects it (offline is not a Qwen-via-Bailian route);
 * - unknown purposes fall back to a minimal instance built from the call's strict
 *   JSON-Schema projection; if even that fails the caller's zod parse, the call
 *   fails visibly (invalid_output) — never a fabricated success.
 *
 * Generation strategy: purpose-keyed handlers produce semantically plausible
 * payloads that honour the pipeline's cross-reference contracts (echo input ids,
 * verbatim quotes, mirrored tournament verdicts); a generic schema walker covers
 * everything else. Handlers read req.userPayload DEFENSIVELY (unknown -> narrow):
 * a payload shape change degrades to minimal-valid output, and the caller's zod
 * parse stays the single authority either way.
 */

/** Stable string hash -> [0,1): deterministic pseudo-scores/verdicts, no RNG. */
const unit = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x1_0000_0000;
};

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const asString = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

const asArray = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null);

/** Collect `{id}`-shaped entries' ids from an array (defensive: any field named id). */
const idListOf = (v: unknown): string[] => {
  const arr = asArray(v);
  if (arr === null) return [];
  const ids: string[] = [];
  for (const item of arr) {
    const rec = asRecord(item);
    const id = rec === null ? null : asString(rec.id);
    if (id !== null) ids.push(id);
  }
  return ids;
};

/** First non-empty string among an object's fields (question text extraction). */
const questionTextOf = (payload: Record<string, unknown>): string =>
  asString(payload.questionText) ?? asString(payload.question) ?? 'the research question';

/** The N most useful words of a question, for search-query templates. */
const keywordsOf = (question: string, n: number): string => {
  const words = question
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((w) => w.length > 3);
  return (words.length > 0 ? words : ['research', 'question']).slice(0, n).join(' ');
};

type Handler = (payload: Record<string, unknown>) => unknown;

// ---------------------------------------------------------------------------
// pipeline purpose handlers (schemas locked by the stage modules + their tests)
// ---------------------------------------------------------------------------

const scopeRefinement: Handler = (p) => {
  const question = questionTextOf(p);
  const kw = keywordsOf(question, 4);
  return {
    domain: 'life sciences (offline scope template)',
    phenomena: [kw.length > 0 ? `phenomena addressed by: ${question}` : 'the studied phenomenon'],
    inScope: [`direct evidence bearing on: ${question}`],
    outOfScope: ['tangential outcomes outside the stated question'],
    goalType: 'exploratory',
    constraints: {
      assumptions: [],
      dataConstraints: [],
      resourceConstraints: [],
      ethicalConstraints: [],
      methodologicalConstraints: [],
    },
  };
};

const queryPlanning: Handler = (p) => {
  const question = questionTextOf(p);
  const kw = keywordsOf(question, 6);
  return {
    discovery: [`empirical studies of ${kw}`, `mechanistic evidence ${kw}`],
    supporting: [`${kw} supporting results`],
    counter: [`${kw} failed replication negative results`, `${kw} no effect critique`],
  };
};

const listwiseRerank: Handler = (p) => {
  const candidates = asArray(p.candidates) ?? asArray(p.numberedCandidates) ?? [];
  const ranked: Array<{ index: number; relevance: string; reason: string }> = [];
  for (let i = 0; i < candidates.length; i++) {
    const rec = asRecord(candidates[i]);
    const idx = rec !== null && typeof rec.index === 'number' ? rec.index : i;
    ranked.push({
      index: idx,
      relevance: unit(`rerank-${idx}`) > 0.6 ? 'high' : 'medium',
      reason: 'offline deterministic relevance order (identity permutation)',
    });
  }
  return ranked.length > 0 ? { ranked } : { ranked: [{ index: 0, relevance: 'medium', reason: 'offline single candidate' }] };
};

const claimExtraction: Handler = (p) => {
  // Quotes must ground in exactly the text the caller showed: excerpt verbatim
  // sentences from untrustedSourceContent.abstract (first two sentences).
  const untrusted = asRecord(p.untrustedSourceContent);
  const abstract = untrusted === null ? null : asString(untrusted.abstract);
  if (abstract === null) return { claims: [] };
  const sentences = abstract.split(/(?<=[.!?。！？])\s+/).filter((s) => s.trim().length > 0);
  const source = asRecord(p.source);
  const sourceId = source === null ? 'src' : (asString(source.id) ?? 'src');
  const picks = sentences.slice(0, Math.min(3, sentences.length));
  const stanceFor = (i: number): string => (i % 3 === 2 ? 'neutral' : 'supports');
  return {
    claims: picks.map((sentence, i) => ({
      text: `Claim ${i + 1} from source ${sourceId}: ${sentence.trim()}`,
      quote: sentence.trim(),
      stance: stanceFor(i),
    })),
  };
};

const evidenceGapAssessment: Handler = (_p) => ({
  enoughEvidence: true,
  gapDescription: 'offline assessment: retrieved corpus is sufficient for the development journey',
  queries: [],
});

const claimCrossRelations: Handler = (p) => {
  const pairs = asArray(p.pairs) ?? [];
  const verdicts: Array<Record<string, unknown>> = [];
  for (const pair of pairs) {
    const rec = asRecord(pair);
    if (rec === null) continue;
    const pairId = typeof rec.pairId === 'number' ? rec.pairId : verdicts.length;
    verdicts.push({
      pairId,
      verdict: 'qualifies',
      sharedSubject: `the studied relationship around ${keywordsOf(questionTextOf(p), 3)}`,
      confidence: 'moderate',
    });
  }
  if (verdicts.length === 0) {
    verdicts.push({ pairId: 0, verdict: 'unrelated', sharedSubject: 'offline fallback pair', confidence: 'low' });
  }
  return { verdicts };
};

const hypothesisSearch = (variant: 'evidence' | 'contradiction' | 'mechanism'): Handler => (p) => {
  const question = questionTextOf(p);
  const claimIds = idListOf(p.claims).slice(0, 2);
  const kw = keywordsOf(question, 4);
  const flavour =
    variant === 'evidence'
      ? 'conditioned on the verified claims'
      : variant === 'contradiction'
        ? 'resolving the tensions in the current evidence'
        : 'through an explicit causal mechanism';
  const mk = (i: number): Record<string, unknown> => ({
    statement: `Offline hypothesis ${i} (${variant}-driven): ${question} holds ${flavour}, variant ${i}.`,
    mechanism: `A deterministic offline mechanism chain ${i}: upstream cause -> mediating process -> observable outcome for ${kw}.`,
    assumptions: [
      `assumption ${i}.a: the offline route's premise about ${kw} applies`,
      `assumption ${i}.b: the mediating process is measurable in available data`,
    ],
    predictions: [`prediction ${i}: higher exposure to ${kw} associates with the outcome in the direction stated`],
    rationale: `offline development rationale for variant ${i} of the ${variant} strategy`,
    distinctnessRationale: `variant ${i} differs in mechanism chain and premise from sibling candidates`,
    evidenceClaimIds: claimIds,
  });
  return { candidates: [mk(1), mk(2)] };
};

const clusterDedup: Handler = (p) => {
  // Conservative: never merge — every candidate its own cluster (offline sets are
  // already template-distinct, and over-merging would lose visible diversity).
  const candidates = asArray(p.numberedCandidates) ?? [];
  const clusters =
    candidates.length > 0
      ? candidates.map((c, i) => {
          const rec = asRecord(c);
          const idx = rec !== null && typeof rec.index === 'number' ? rec.index : i;
          return { memberIndices: [idx], reason: 'offline: distinct by construction' };
        })
      : [{ memberIndices: [0], reason: 'offline: distinct by construction' }];
  return { clusters };
};

const diversitySupplement: Handler = () => ({ candidates: [] });

const noveltyLabels: Handler = (p) => {
  const candidates = asArray(p.numberedCandidates) ?? [];
  const labels =
    candidates.length > 0
      ? candidates.map((c, i) => {
          const rec = asRecord(c);
          const idx = rec !== null && typeof rec.index === 'number' ? rec.index : i;
          return { index: idx, noveltyLabel: 'mixed' };
        })
      : [{ index: 0, noveltyLabel: 'mixed' }];
  return { labels };
};

const litQueryExpansion: Handler = (p) => {
  const ids = idListOf(p.hypotheses);
  const targets = ids.length > 0 ? ids : ['hyp'];
  return {
    hypotheses: targets.map((id) => ({
      hypothesisId: id,
      queries: [`${id} paraphrase query (offline)`, `${id} mechanism vocabulary query (offline)`],
    })),
  };
};

const litFacetRerank: Handler = (p) => ({
  rankings: idListOf(p.hypotheses).map((id) => ({ hypothesisId: id, rankedNeighborIndices: [] })),
});

const litAdjudication: Handler = (p) => ({
  verdicts: idListOf(p.hypotheses).map((id) => ({
    hypothesisId: id,
    verdict: 'unclear',
    justification: 'offline development route: no live literature neighbours were adjudicated (deterministic placeholder judgment, intentionally uninformative)',
  })),
});

const bilingualStatements: Handler = (p) => ({
  translations: (asArray(p.hypotheses) ?? []).flatMap((h) => {
    const rec = asRecord(h);
    const id = rec === null ? null : asString(rec.id);
    if (id === null) return [];
    const statement = rec === null ? '' : (asString(rec.statement) ?? '');
    const mechanism = rec === null ? '' : (asString(rec.mechanism) ?? '');
    return [
      {
        hypothesisId: id,
        statementZh: `【离线演示】${statement.slice(0, 200)}`,
        mechanismZh: mechanism.length > 0 ? `【离线演示】${mechanism.slice(0, 200)}` : '',
      },
    ];
  }),
});

const bilingualObjective: Handler = (p) => ({
  objectiveZh: `【离线演示】${(asString(p.objective) ?? questionTextOf(p)).slice(0, 200)}`,
});

const dimensionScores: Handler = (p) => {
  const ids = idListOf(p.hypotheses);
  const targets = ids.length > 0 ? ids : ['hyp'];
  const core = ['evidence_grounding','falsifiability','testability','counter_evidence_exposure','scientific_plausibility','novelty','methodological_soundness','data_availability'] as const;
  return {
    assessments: targets.map((id) => ({
      hypothesisId: id,
      dimensions: core.map((dimension) => ({
        dimension,
        value: Math.round(unit(`${id}:${dimension}`) * 0.5 + 0.35), // deterministic 0.35-0.85
        rationale: `offline deterministic score for ${dimension} (hash of hypothesis id)`,
      })),
    })),
  };
};

const pairwiseTournament: Handler = (p) => {
  // Identity-consistent mirrored verdicts: the SAME letter wins both presentations.
  const a = asRecord(p.hypothesisA);
  const b = asRecord(p.hypothesisB);
  const aId = a === null ? 'a' : (asString(a.id) ?? 'a');
  const bId = b === null ? 'b' : (asString(b.id) ?? 'b');
  const winner = unit(aId) >= unit(bId) ? 'a' : 'b';
  return {
    aFirstVerdict: winner,
    bFirstVerdict: winner,
    rationale: 'offline deterministic tournament verdict: winner by stable id hash, identical in both presentation orders',
  };
};

const researchPlanDesign: Handler = (p) => {
  // plan.ts payload key: representativeHypotheses (fallback: hypotheses).
  const ids = idListOf(p.representativeHypotheses).length > 0 ? idListOf(p.representativeHypotheses) : idListOf(p.hypotheses);
  const hyps = (asArray(p.representativeHypotheses) ?? asArray(p.hypotheses) ?? []);
  const firstStatement =
    hyps.length > 0 ? (asString(asRecord(hyps[0])?.statement) ?? 'the research question') : 'the research question';
  return {
    objective: `Offline development plan: discriminate the candidate hypotheses for: ${firstStatement}`,
    hypothesisIds: ids,
    variables: ['primary exposure', 'primary outcome'],
    controls: ['untreated or standard-of-care comparison'],
    inclusionCriteria: ['studies addressing the research question'],
    exclusionCriteria: ['studies without a comparable measure'],
    dataRequirements: [],
    toolRequirements: [],
    steps: [
      {
        id: 'step-1',
        title: 'Assemble and screen the retrieved corpus',
        kind: 'literature',
        inputs: [],
        outputs: ['screened corpus'],
        method: 'screen retrieved sources for direct bearing on the hypotheses',
        failureConditions: ['no source bears on any hypothesis'],
        dependsOn: [],
      },
      {
        id: 'step-2',
        title: 'Compare hypotheses against the evidence base',
        kind: 'data_analysis',
        inputs: ['screened corpus'],
        outputs: ['hypothesis comparison'],
        method: 'apply the preregistered decision rule to the assembled evidence',
        failureConditions: ['evidence insufficient for the decision rule'],
        dependsOn: ['step-1'],
      },
    ],
    metrics: ['primary endpoint comparison per decision rule'],
    statistics: [],
    decisionRules: {
      successCriterion: 'the top-ranked hypothesis satisfies its predicted relation',
      weakeningCriterion: 'the predicted relation holds only under added assumptions',
      falsificationCriterion: 'the predicted relation is absent or reversed',
      stopCriterion: 'decision rule evaluated once on the assembled corpus',
    },
  };
};

const falsificationSpec: Handler = (p) => {
  const hyp = asRecord(p.hypothesis);
  const statement = hyp === null ? 'the hypothesis' : (asString(hyp.statement) ?? 'the hypothesis');
  return {
    observable: `the outcome quantity named by: ${statement.slice(0, 120)}`,
    measurement: 'systematic measurement of the observable across the comparison conditions',
    expectedRelation: 'the direction predicted by the hypothesis statement',
    decisionRule: 'support if the measured comparison exceeds 0 in the predicted direction; weaken if it does not; falsify if significantly opposite',
    decisionRuleProvenance: 'model-stipulated',
    supportCondition: 'the predicted direction is observed',
    weakeningCondition: 'the effect appears only in a subgroup or under added assumptions',
    falsificationCondition: 'the measured relation is absent or significantly reversed',
    confounders: ['population heterogeneity', 'measurement timing'],
    alternativeExplanations: ['a confounder explains the observed pattern'],
    dataRequirements: ['comparative observations of the observable'],
    method: 'offline deterministic falsification template',
    failureInterpretation: 'absence of the predicted relation weakens the hypothesis; reversal falsifies it',
    assumptionCritiques: [],
    counterLinks: [],
    supportingClaimIds: idListOf(p.claims).slice(0, 2),
    supportingLinks: [],
    consideredClaimIds: [],
    uncertainties: ['offline template: thresholds are stipulated, not evidence-derived'],
    testability: 'testable_with_data',
  };
};

const linkVerification: Handler = (p) => {
  const links = asArray(p.proposedLinks) ?? [];
  const verdicts = links.flatMap((l) => {
    const rec = asRecord(l);
    const claimId = rec === null ? null : asString(rec.claimId);
    if (claimId === null) return [];
    return [
      {
        claimId,
        verdict: 'confirm',
        reason: 'offline deterministic audit: the proposed link is accepted as proposed (development route)',
      },
    ];
  });
  return verdicts.length > 0 ? { verdicts } : { verdicts: [{ claimId: 'clm', verdict: 'confirm', reason: 'offline deterministic audit accepts the link' }] };
};

const hypothesisRevision: Handler = (p) => {
  const hyp = asRecord(p.hypothesis);
  const statement = hyp === null ? 'the hypothesis' : (asString(hyp.statement) ?? 'the hypothesis');
  const feedback = asRecord(p.feedback);
  const content = feedback === null ? 'the feedback' : (asString(feedback.content) ?? 'the feedback');
  return {
    statement: `${statement} (revised offline in response to the feedback)`,
    mechanism: 'offline revision: mechanism retained with the feedback-motivated adjustment applied',
    assumptions: [
      { statement: 'the original premise, unaffected by the feedback', kind: 'stipulated' as const },
      { statement: 'the adjustment the feedback motivates holds', kind: 'empirical' as const },
    ],
    predictions: ['the revised prediction incorporating the feedback'],
    addedUncertainties: ['offline revision: the adjustment was generated by the deterministic development route'],
    revisionRationale: `offline causal revision responding to: ${content.slice(0, 160)}`,
  };
};

const planRevision: Handler = (p) => {
  const plan = asRecord(p.plan);
  const steps =
    plan !== null && Array.isArray(plan.steps) && plan.steps.length > 0
      ? plan.steps
      : [
          {
            id: 'task_offline_rev',
            title: 'Re-run the comparison under the revised decision rule',
            kind: 'data_analysis',
            inputs: [],
            outputs: ['revised comparison'],
            method: 'apply the revised decision rule',
            failureConditions: [],
            dependsOn: [],
          },
        ];
  return {
    steps,
    metrics: ['primary endpoint comparison per revised decision rule'],
    decisionRules: {
      successCriterion: 'the revised decision rule is satisfied by the top-ranked hypothesis',
      weakeningCriterion: 'the revised rule holds only under added assumptions',
      falsificationCriterion: 'the revised rule is absent or reversed',
      stopCriterion: 'revised rule evaluated once',
    },
    revisionRationale: 'offline deterministic plan revision acknowledging the feedback',
  };
};

const causalRevisionAnalysis: Handler = (p) => {
  const feedback = asRecord(p.feedback);
  const content = feedback === null ? 'the feedback' : (asString(feedback.content) ?? 'the feedback');
  const firstHyp = idListOf(p.hypotheses)[0];
  const affected: Array<Record<string, unknown>> = [];
  if (firstHyp !== undefined) {
    affected.push({ objectType: 'hypothesis', objectId: firstHyp, reason: 'the feedback bears on the leading hypothesis' });
  }
  const planId = idListOf(p.plans)[0];
  if (planId !== undefined) {
    affected.push({ objectType: 'plan', objectId: planId, reason: 'the decision rule must absorb the feedback' });
  }
  return {
    affected,
    causalChain: `offline causal chain: feedback ("${content.slice(0, 120)}") -> object graph pressure -> revision`,
    expectedQualityDelta: { status: 'inconclusive', claim: 'offline route cannot argue a quality delta; revision proceeds for the development journey' },
  };
};

const modelConfigTest: Handler = () => ({ ok: true });

/**
 * Experiment-leg drafts: the offline route declares both experiment forms
 * infeasible — a synthetic plan must not fabricate a dataset execution (the EEL
 * lane stays separately exercisable with real specs).
 */
const experimentSpecDraft: Handler = () => ({
  feasible: false,
  skipReason: 'offline development route: synthetic plans are not mapped to executable tabular experiments (no fabricated dataset execution)',
});

const metaSpecDraft: Handler = () => ({
  feasible: false,
  skipReason: 'offline development route: synthetic plans are not pooled into meta-analysis (no fabricated effect estimates)',
});

/** Exact-purpose table (schema authority: the stage modules' zod schemas). */
const HANDLERS: Readonly<Record<string, Handler>> = {
  'scope-refinement': scopeRefinement,
  'query-planning': queryPlanning,
  'listwise-rerank': listwiseRerank,
  'claim-extraction': claimExtraction,
  'evidence-gap-assessment': evidenceGapAssessment,
  'claim-cross-relations': claimCrossRelations,
  'hypothesis-search:evidence-conditioned': hypothesisSearch('evidence'),
  'hypothesis-search:contradiction-driven': hypothesisSearch('contradiction'),
  'hypothesis-search:mechanism-driven': hypothesisSearch('mechanism'),
  'hypothesis-search:cluster-dedup': clusterDedup,
  'hypothesis-search:diversity-supplement': diversitySupplement,
  'hypothesis-search:novelty-labels': noveltyLabels,
  'novelty-check:query-expansion': litQueryExpansion,
  'novelty-check:facet-rerank': litFacetRerank,
  'novelty-check:adjudication': litAdjudication,
  'bilingual-zh:statements': bilingualStatements,
  'bilingual-zh:objective': bilingualObjective,
  'hypothesis-ranking:dimension-scores': dimensionScores,
  'hypothesis-ranking:pairwise-tournament': pairwiseTournament,
  'research-plan-design': researchPlanDesign,
  'causal-revision-analysis': causalRevisionAnalysis,
  'experiment-spec-draft': experimentSpecDraft,
  'meta-spec-draft': metaSpecDraft,
  'model-config-test': modelConfigTest,
};

/** Prefix purposes (per-object id suffix): falsification-spec:<hypId> etc. */
const PREFIX_HANDLERS: ReadonlyArray<readonly [string, Handler]> = [
  ['falsification-spec:', falsificationSpec],
  ['link-verification:', linkVerification],
  ['hypothesis-revision:', hypothesisRevision],
  ['plan-revision:', planRevision],
];

// ---------------------------------------------------------------------------
// generic fallback: minimal instance from the strict JSON-Schema projection
// ---------------------------------------------------------------------------

type JsonSchema = { type?: string; enum?: unknown[]; items?: JsonSchema; properties?: Record<string, JsonSchema>; required?: string[]; anyOf?: JsonSchema[] };

const templateString = (purpose: string, field: string): string =>
  `offline ${field} (${purpose})`;

const instanceFromSchema = (schema: JsonSchema, purpose: string, field: string, depth: number): unknown => {
  if (depth > 10) return null;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (Array.isArray(schema.anyOf)) {
    const first = schema.anyOf.find((a) => a !== null && typeof a === 'object' && !('anyOf' in a));
    if (first !== undefined) return instanceFromSchema(first as JsonSchema, purpose, field, depth + 1);
    return null;
  }
  switch (schema.type) {
    case 'string':
      return templateString(purpose, field);
    case 'number':
    case 'integer':
      return 1;
    case 'boolean':
      return true;
    case 'array':
      return [instanceFromSchema(schema.items ?? {}, purpose, field, depth + 1)];
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(schema.properties ?? {})) {
        out[k] = instanceFromSchema(v, purpose, k, depth + 1);
      }
      return out;
    }
    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// provider
// ---------------------------------------------------------------------------

export const createOfflineDevProvider = (cfg: ModelProviderConfig): ModelProvider => {
  const name = `custom:${cfg.id}`;
  return {
    name,
    // No credentials are needed — the route is usable by construction (it is also,
    // by construction, never a live route; receipts carry that truth).
    liveReady: true,
    async structuredCall<T>(
      req: StructuredCallRequest,
      parse: (raw: unknown) => T | Error,
    ): Promise<StructuredCallResult<T>> {
      const requestHash = computeRequestHash(req);
      // Pipeline calls wrap the stage payload as { outputContract, input } — the
      // semantic inputs live under `input`; direct callers (probes) pass it raw.
      const root = asRecord(req.userPayload);
      const payload =
        root !== null && asRecord(root.input) !== null
          ? (asRecord(root.input) as Record<string, unknown>)
          : (root ?? {});

      const exact = HANDLERS[req.purpose];
      const prefix = PREFIX_HANDLERS.find(([pfx]) => req.purpose.startsWith(pfx));
      const handler = exact ?? (prefix !== undefined ? prefix[1] : undefined);

      const attempts: Array<{ candidate: unknown; parsed: unknown }> = [];
      if (handler !== undefined) {
        const candidate = handler(payload);
        attempts.push({ candidate, parsed: parse(candidate) });
      }
      if (req.jsonSchema !== null && typeof req.jsonSchema === 'object') {
        const candidate = instanceFromSchema(req.jsonSchema as JsonSchema, req.purpose, 'root', 0);
        attempts.push({ candidate, parsed: parse(candidate) });
      }

      const ok = attempts.find((a) => !(a.parsed instanceof Error));
      if (ok !== undefined) {
        return {
          ok: true,
          data: ok.parsed as T,
          receipt: {
            provider: name,
            modelId: cfg.modelId,
            latencyMs: 0,
            usage: {}, // deterministic route: no real token accounting, none invented
            requestHash,
            outputHash: canonicalSha256(canonicalJson(ok.candidate)),
            executionMode: 'test',
          },
        };
      }

      // Fail visible: a deterministic route that cannot satisfy the caller's
      // contract must not fabricate success. The first parse error rides the
      // message so the disagreeing field is diagnosable without a debugger.
      const why = attempts.length > 0 && attempts[0]!.parsed instanceof Error ? attempts[0]!.parsed.message : 'unknown';

      // Fail visible: a deterministic route that cannot satisfy the caller's
      // contract must not fabricate success.
      return {
        ok: false,
        error: {
          kind: 'invalid_output',
          message:
            `[offline-dev] no deterministic payload satisfied the schema for purpose "${req.purpose}" ` +
            `(${handler !== undefined ? 'purpose handler and schema-walker both rejected' : 'no purpose handler and schema-walker rejected'} ` +
            '— the caller schema and the offline generator disagree; fix the generator or the schema). ' +
            `First parse error: ${why.slice(0, 400)}`,
          retryable: false,
        },
        receipt: {
          provider: name,
          modelId: cfg.modelId,
          latencyMs: 0,
          usage: {},
          requestHash,
          outputHash: canonicalSha256(''),
          executionMode: 'test',
        },
      };
    },
  };
};
