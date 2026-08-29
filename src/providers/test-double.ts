import type { ModelProvider, StructuredCallRequest, StructuredCallResult } from '../shared/ports.js';
import type { ModelProviderConfig } from '../domain/model-config.js';
import { computeRequestHash } from './http.js';
import { canonicalJson, canonicalSha256 } from '../shared/crypto.js';

/**
 * IN-PROCESS TEST DOUBLE (providers/custom.ts wire='offline').
 *
 * A deterministic ModelProvider used EXCLUSIVELY as an isolated test fixture:
 * automated tests and the browser E2E suite exercise the real pipeline, the real
 * orchestrator and the real server without burning model quota or depending on
 * network reachability. It performs NO network call and uses NO key.
 *
 * It is NOT a product route and exists for NO demonstration or acceptance purpose:
 *
 * - it is absent from the provider catalog, the CLI route set and the settings UI;
 * - the server refuses to create or activate such a config unless it was started
 *   with FARLAB_TEST_DOUBLE=1 (scripts/serve-e2e.mjs is the only launcher that
 *   sets it — see src/server/api.ts assertTestDoubleAllowed);
 * - the env chain (defaultLiveProvider) refuses it and the registry's live set is
 *   untouched; competition-route mode rejects it (not a Qwen-via-Bailian route);
 * - every receipt is stamped executionMode 'test' (never 'live');
 * - unknown purposes fall back to a minimal instance built from the call's strict
 *   JSON-Schema projection; if even that fails the caller's zod parse, the call
 *   fails visibly (invalid_output) — never a fabricated success.
 *
 * Generation strategy: purpose-keyed handlers produce schema-valid payloads that
 * honour the pipeline's cross-reference contracts (echo input ids, verbatim
 * quotes, mirrored tournament verdicts); a generic schema walker covers
 * everything else. Handlers read req.userPayload DEFENSIVELY (unknown -> narrow):
 * a payload shape change degrades to minimal-valid output, and the caller's zod
 * parse stays the single authority either way.
 *
 * Its generated CONTENT is filler, never scientific output: pipeline stages and
 * the API filter template-shaped objects out of every scientific projection
 * (domain/scientific-state.ts isTemplateHypothesis / isTemplatePlan).
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
  // CJK runs are kept whole regardless of length (zh words are 2-3 chars \u2014
  // the historical length>3 filter dropped every one of them and zh questions
  // fell back to English template vocabulary).
  const cjk = [...question.matchAll(/[\u4e00-\u9fff]+/g)].map((m) => m[0]);
  const words = question
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((w) => w.length > 3);
  const all = [...cjk, ...words];
  return (all.length > 0 ? all : ['research', 'question']).slice(0, n).join(' ');
};

type Handler = (payload: Record<string, unknown>) => unknown;

// ---------------------------------------------------------------------------
// pipeline purpose handlers (schemas locked by the stage modules + their tests)
// ---------------------------------------------------------------------------

const scopeRefinement: Handler = (p) => {
  const question = questionTextOf(p);
  // Follow the question's own language (deterministic CJK detection) so a zh
  // question does not get English template scaffolding in the scope panel.
  const zh = /[一-鿿]/.test(question);
  return {
    domain: 'life sciences (offline scope template)',
    phenomena: [zh ? `本研究问题所指的现象：${question}` : `phenomena addressed by: ${question}`],
    inScope: [zh ? `与「${question}」直接相关的证据` : `direct evidence bearing on: ${question}`],
    outOfScope: [zh ? '与上述问题无直接关联的切线性结果' : 'tangential outcomes outside the stated question'],
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
  // The claim TEXT is the sentence itself — no "Claim N from source src_x…"
  // wrapper: internal ids are engineering objects and must not surface in the
  // researcher-facing evidence base (graph nodes, evidence list, exports all
  // render claim.text verbatim).
  // CJK punctuation carries NO trailing whitespace, so the historical lookbehind
  // `(?<=[.!?。！？])\s+` never split a zh abstract — the WHOLE abstract became one
  // giant claim (live-observed 2026-08-29). Split after CJK terminators with zero
  // whitespace, and after Latin terminators only with whitespace (keeps "e.g."
  // and decimal points intact).
  const untrusted = asRecord(p.untrustedSourceContent);
  const abstract = untrusted === null ? null : asString(untrusted.abstract);
  if (abstract === null) return { claims: [] };
  const sentences = abstract
    .split(/(?<=[。！？；])|(?<=[.!?;])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const picks = sentences.slice(0, Math.min(3, sentences.length));
  const stanceFor = (i: number): string => (i % 3 === 2 ? 'neutral' : 'supports');
  return {
    claims: picks.map((sentence, i) => ({
      text: sentence.trim(),
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
  // The generate payload carries claims as supportingClaims / counterDirectionClaims
  // ({id, text} projections — shared.ts cappedClaimsForPrompt); the ORIGINAL
  // handler read `p.claims` (always empty), so evidenceClaimIds were dead and
  // statements shared no vocabulary with the corpus — the falsify topical gate
  // then dropped every critique link. Ground the template in REAL claim text.
  const promptClaims = (asArray(p.supportingClaims) ?? asArray(p.counterDirectionClaims) ?? asArray(p.claims) ?? [])
    .map((c) => asRecord(c))
    .filter((c): c is Record<string, unknown> => c !== null);
  const claimIds = promptClaims.map((c) => asString(c.id)).filter((id): id is string => id !== null).slice(0, 2);
  const claimTexts = promptClaims
    .map((c) => asString(c.text) ?? '')
    .filter((t) => t.length > 0);
  const claimSnippet = claimTexts
    .slice(0, 2)
    .map((t) => (t.length > 90 ? `${t.slice(0, 90)}…` : t))
    .join(' / ');
  // The counter link names the LAST claim; embedding its vocabulary in the
  // mechanism keeps the falsify topical gate from dropping the counter edge.
  const counterSnippet = claimTexts.length > 3
    ? (claimTexts[claimTexts.length - 1]!.length > 90 ? `${claimTexts[claimTexts.length - 1]!.slice(0, 90)}…` : claimTexts[claimTexts.length - 1]!)
    : '';
  const kw = keywordsOf(question, 4);
  const flavour =
    variant === 'evidence'
      ? 'conditioned on the verified claims'
      : variant === 'contradiction'
        ? 'resolving the tensions in the current evidence'
        : 'through an explicit causal mechanism';
  const mk = (i: number): Record<string, unknown> => ({
    statement: `Offline hypothesis ${i} (${variant}-driven): ${question} holds ${flavour}, variant ${i}${claimSnippet.length > 0 ? `, grounded in the evidence that: ${claimSnippet}` : ''}.`,
    mechanism: `A deterministic offline mechanism chain ${i}: upstream cause -> mediating process -> observable outcome for ${kw}${counterSnippet.length > 0 ? `, bounded by the observation that: ${counterSnippet}` : ''}.`,
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
        statementZh: `【测试替身】${statement.slice(0, 200)}`,
        mechanismZh: mechanism.length > 0 ? `【测试替身】${mechanism.slice(0, 200)}` : '',
      },
    ];
  }),
});

const bilingualObjective: Handler = (p) => ({
  objectiveZh: `【测试替身】${(asString(p.objective) ?? questionTextOf(p)).slice(0, 200)}`,
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
  // Claim->hypothesis edges (sibling-lane gap B, taken over 2026-08-27): the
  // falsify stage builds EvidenceRelations from these links — the ORIGINAL
  // handler read `p.claims`, but the real payload field is `availableClaims`
  // (falsify.ts), so the whole link chain was silently dead offline. Also the
  // decision rule must carry decidable comparison semantics or the
  // deterministic completeness gate rejects the spec (zeroing all links).
  const claimIds = (() => {
    const fromAvailable = idListOf(p.availableClaims);
    return fromAvailable.length > 0 ? fromAvailable : idListOf(p.claims);
  })();
  const supportingLinks = claimIds.slice(0, 2).map((claimId) => ({
    claimId,
    linkReason: `offline deterministic link: the claim states the association this hypothesis predicts, taken as supporting on the development route`,
  }));
  const counterLinks = claimIds.length > 3
    ? [{
        claimId: claimIds[claimIds.length - 1]!,
        relation: 'weakens' as const,
        linkReason: 'offline deterministic counter link: the claim bounds the association to a subgroup, weakening the hypothesis in its general form (development route)',
      }]
    : [];
  return {
    observable: `the outcome quantity named by: ${statement.slice(0, 120)}`,
    measurement: 'systematic measurement of the observable across the comparison conditions',
    expectedRelation: 'the direction predicted by the hypothesis statement',
    // Decidable-comparison semantics are MANDATORY: the deterministic
    // completeness gate rejects specs without >=/</ratio/threshold/if-then
    // criteria (2026-08-27 journey: the template's prose rule was rejected,
    // which zeroed critique links and thus claim->hypothesis relations).
    decisionRule: 'if the measured association ratio between compared conditions is >= 1.2, support; if < 1.0, weaken; if the interval around the ratio excludes the predicted direction, falsify',
    decisionRuleProvenance: 'model-stipulated',
    supportCondition: 'the measured ratio is >= 1.2 in the predicted direction',
    weakeningCondition: 'the ratio is < 1.0 or appears only in a subgroup under added assumptions',
    falsificationCondition: 'the measured relation is absent (ratio not > 1.0) or significantly reversed',
    confounders: ['population heterogeneity', 'measurement timing'],
    alternativeExplanations: ['a confounder explains the observed pattern'],
    dataRequirements: ['comparative observations of the observable'],
    method: 'offline deterministic falsification template',
    failureInterpretation: 'absence of the predicted relation weakens the hypothesis; reversal falsifies it',
    assumptionCritiques: [],
    counterLinks,
    supportingClaimIds: claimIds.slice(0, 2),
    supportingLinks,
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

/**
 * Problem-model formation (AOSSA): honest filler for the mechanics routes —
 * on product runs the scope stage refuses test-stamped formation output
 * outright; this only lets automated tests / browser E2E walk the mechanics.
 */
const problemModelFormation: Handler = (p) => {
  const question = questionTextOf(p);
  const zh = /[一-鿿]/.test(question);
  const tag = zh ? '离线模板' : 'offline template';
  return {
    objectives: [
      { statement: zh ? `${tag}目标：界定「${question}」的研究范围` : `${tag} objective: scope the research question: ${question}` },
    ],
    variables: [],
    formalization: {
      problemClass: 'none_stated',
      governingRelations: [],
      boundaryConditions: [],
      wellPosednessNotes: [],
    },
    dataInventory: [],
    statisticalPremises: { assumptions: [], causalClaims: [] },
    metrics: [],
    stopConditions: [zh ? `${tag}停止条件：单轮执行即停` : `${tag} stop condition: single pass then stop`],
    unknowns: [
      { statement: zh ? `${tag}：问题结构未经真实分析` : `${tag}: problem structure not really analyzed`, blocking: false },
    ],
    methodSelections: [
      {
        forObjective: 1,
        candidates: [
          {
            family: 'retrieval_synthesis',
            assessment: 'selected',
            rationale: `${tag} rationale: the development route exercises the mechanics of method selection`,
            validationPlan: zh ? `${tag}：开发路线无真实验证计划；真实路线必须命名真实检查` : `${tag}: no real validation plan on the development route; a live route must name a real check`,
          },
          {
            family: 'llm_reasoning',
            assessment: 'viable_alternative',
            rationale: `${tag} rationale: deterministic filler candidate for coverage of a second family`,
          },
        ],
      },
    ],
  };
};

const femSpecDraft: Handler = () => ({
  feasible: false,
  skipReason: 'offline development route: synthetic plans are not mapped to numerical-PDE experiments (no fabricated FEM verification)',
});

const modelConfigTest: Handler = () => ({ ok: true });

/**
 * Resident-agent conversation turn (sibling-lane gap A, taken over 2026-08-27):
 * the kernel calls with purpose 'conversation:turn' + ':turn' appended by the
 * loop. The generic schema-walker built use_tool instances the kernel rejected
 * three times, killing the offline conversation-first creation path. Answer
 * with a deterministic FINISH action instead: an honest offline reply plus the
 * researcher's own message offered back as a launchable candidate question
 * (result contract: server ConversationAgentReplySchema).
 */
const conversationTurn: Handler = (payload) => {
  const task = asString(payload.task) ?? '';
  const m = /「([^」]{6,2000})」/.exec(task);
  const question = m !== null ? m[1]! : '';
  const reply = question.length > 0
    ? `（测试替身确定性回复）已收到你的消息：「${question}」。\n\n当前路线是在进程内的测试替身：不联网、不调用真实模型，回执标记为 test 模式，用于自动化测试驱动完整流程；它产生的任何内容都是占位填充，不构成科学判断，也不可用于展示。请在设置中配置真实模型路线后再发起研究。`
    : '（测试替身确定性回复）已收到你的消息。当前路线是在进程内的测试替身，不联网、不调用真实模型，仅供自动化测试使用；请在设置中配置真实模型路线以获得真实推理。';
  return {
    action: 'finish',
    reason: 'offline deterministic reply: the development route exercises the conversation flow without tools or network',
    result: {
      reply,
      clarifyingQuestions: [],
      candidates: question.length > 0
        ? [{ text: question, rationale: 'offline template: the researcher\'s own message, offered verbatim as a launchable research question' }]
        : [],
      readyToConverge: false,
    },
  };
};

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

const theorySpecDraft: Handler = () => ({
  feasible: false,
  skipReason: 'offline development route: synthetic plans are not verified as numerical identities (no fabricated theory experiments)',
});

/** Exact-purpose table (schema authority: the stage modules' zod schemas). */
const HANDLERS: Readonly<Record<string, Handler>> = {
  'scope-refinement': scopeRefinement,
  'problem-model-formation': problemModelFormation,
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
  'theory-spec-draft': theorySpecDraft,
  'fem-spec-draft': femSpecDraft,
  'model-config-test': modelConfigTest,
  'conversation:turn:turn': conversationTurn,
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
  `test-double ${field} (${purpose})`;

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

export const createTestDoubleProvider = (cfg: ModelProviderConfig): ModelProvider => {
  const name = `custom:${cfg.id}`;
  return {
    name,
    // No credentials are needed — the double answers in-process. It is never a
    // live route: every receipt below is stamped executionMode 'test'.
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
            `[test-double] no deterministic payload satisfied the schema for purpose "${req.purpose}" ` +
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


