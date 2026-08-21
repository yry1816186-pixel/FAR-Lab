import { describe, it, expect } from 'vitest';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import {
  EvidenceRelation,
  HypothesisCandidate,
  ResearchQuestion,
  ResearchRun,
  ScientificClaim,
  newId,
} from '../src/domain/index.js';
import type { RunId } from '../src/domain/index.js';
import type { StageContext } from '../src/pipeline/types.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import type { ArtifactStore, ModelProvider, StructuredCallRequest } from '../src/shared/ports.js';
import { canonicalSha256 } from '../src/shared/crypto.js';
import { generateHypothesesStage, MIN_REPRESENTATIVES } from '../src/pipeline/stages/hypotheses.js';
import {
  checkFalsificationCompleteness,
  falsifyStage,
  hasDecidableSemantics,
} from '../src/pipeline/stages/falsify.js';
import { COMPARISON_NOTE, RANK_WEIGHTS, compositeScore, rankStage } from '../src/pipeline/stages/rank.js';
import { DUPLICATE_MARKER } from '../src/pipeline/stages/shared.js';

/**
 * *** TEST FIXTURES ONLY ***
 * Every model response below is a scripted TestStubProvider step (executionMode 'test');
 * no network, no keys. Assertions are behavioral: candidate storage, cluster bookkeeping,
 * deterministic falsification completeness, deterministic weighted ranking, reference filtering.
 */

// ---------------------------------------------------------------------------
// fixtures / harness
// ---------------------------------------------------------------------------

const setup = () => {
  const store = new Store(openDb(':memory:'));
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Why do CRISPR base editors cause off-target edits?',
    background: 'base editors show motif-dependent off-target deamination',
    goalType: 'explanatory',
    scope: { domain: 'genome editing', phenomena: ['off-target edits'] },
    constraints: { assumptions: [] },
    createdAt: new Date().toISOString(),
  });
  // NOTE: Store.createRun is currently broken (appendEvent parses seq:0 against a
  // positive() schema), so the run is built in-memory; these stages never read the
  // runs table — they work off ctx.run + the objects table only.
  store.putObject('question', q);
  const run = ResearchRun.parse({
    id: newId('run'),
    questionId: q.id,
    status: 'running',
    currentStage: 'generate_hypotheses',
    stages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: [],
  });
  return { store, run };
};

const SRC = newId('src');

const makeClaim = (runId: RunId, text: string, bindingStatus: 'verified' | 'resolved_unaligned' = 'verified') =>
  ScientificClaim.parse({
    id: newId('clm'),
    runId,
    text,
    locators: [{ sourceDocumentId: SRC, quote: `verbatim excerpt grounding: ${text}` }],
    bindingStatus,
    alignmentChecked: true,
  });

const ts = (i: number) => new Date(Date.parse('2026-08-21T00:00:00Z') + i * 1000).toISOString();

const makeHyp = (
  runId: RunId,
  statement: string,
  opts: { duplicateOf?: string; createdAt?: string } = {},
) =>
  HypothesisCandidate.parse({
    id: newId('hyp'),
    runId,
    version: 0,
    statement,
    mechanism: `causal mechanism underlying ${statement}`,
    derivation: {
      strategy: 'evidence_conditioned',
      rationale:
        opts.duplicateOf === undefined
          ? 'seeded generation rationale'
          : `seeded generation rationale | ${DUPLICATE_MARKER}${opts.duplicateOf}`,
      inputClaimIds: [],
    },
    assumptions: [
      { id: 'a0', statement: 'seeded assumption zero', kind: 'empirical', backingClaimIds: [] },
      { id: 'a1', statement: 'seeded assumption one', kind: 'theoretical', backingClaimIds: [] },
    ],
    predictions: ['seeded prediction'],
    supportingClaimIds: [],
    counterClaimIds: [],
    uncertainties: [],
    noveltyLabel: 'mixed',
    testability: 'testable_with_data',
    clusterKey: 'seeded',
    createdAt: opts.createdAt ?? ts(0),
  });

const memArtifacts = (): ArtifactStore => {
  const data = new Map<string, string>();
  return {
    async put(payload) {
      const s = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
      const hash = canonicalSha256(s);
      const ref = `sha256:${hash}`;
      data.set(ref, s);
      return { ref, hash, size: s.length };
    },
    async get(ref) {
      return data.get(ref) ?? null;
    },
    path: (ref) => ref,
  };
};

interface CtxOpts {
  cancelled?: () => boolean;
  capture?: { reqs: StructuredCallRequest[] };
}

const makeCtx = (run: { id: RunId }, store: Store, steps: StubStep[], opts: CtxOpts = {}) => {
  const artifacts = memArtifacts();
  const receipts: Array<Record<string, unknown>> = [];
  const inner = createTestStubProvider(steps);
  const provider: ModelProvider = opts.capture
    ? {
        name: inner.name,
        liveReady: inner.liveReady,
        structuredCall(req, parse) {
          opts.capture?.reqs.push(req);
          return inner.structuredCall(req, parse);
        },
      }
    : inner;
  const ctx: StageContext = {
    run: run as StageContext['run'],
    store,
    artifacts,
    provider,
    sourceFor: () => {
      throw new Error('sources are not used by hypothesis-group stages');
    },
    recordReceipt: (r) => {
      receipts.push(r as Record<string, unknown>);
    },
    cancelled: opts.cancelled ?? (() => false),
    log: () => {},
  };
  return { ctx, receipts, artifacts };
};

const cand = (n: string, extra: Record<string, unknown> = {}) => ({
  statement: `statement ${n}`,
  mechanism: `mechanism ${n}`,
  assumptions: [`assumption ${n} a`, `assumption ${n} b`],
  predictions: [`prediction ${n}`],
  rationale: `rationale ${n}`,
  distinctnessRationale: `distinct from others because ${n}`,
  evidenceClaimIds: [],
  ...extra,
});
const gen = (...cs: unknown[]) => JSON.stringify({ candidates: cs });
const NOVELTY_MIXED = 'mixed';

const dim = (name: string, value: number | null, extra: Record<string, unknown> = {}) => ({
  dimension: name,
  value,
  rationale: `rationale for the ${name} judgment of this hypothesis`,
  evidenceClaimIds: [],
  qualitative: value === null ? 'not_assessed' : 'moderate',
  ...extra,
});

const CORE_DIMS = (v: number) => [
  dim('evidence_grounding', v),
  dim('falsifiability', v),
  dim('testability', v),
  dim('counter_evidence_exposure', v),
  dim('scientific_plausibility', v),
  dim('novelty', v),
  dim('methodological_soundness', v),
];

// ---------------------------------------------------------------------------
// generate_hypotheses
// ---------------------------------------------------------------------------

describe('generate_hypotheses stage', () => {
  it('runs three strategies, stores all candidates, filters invalid claim refs, records receipts', async () => {
    const { store, run } = setup();
    const clmA = makeClaim(run.id, 'claim A: duration increases deamination');
    const clmB = makeClaim(run.id, 'claim B: inhibitors reduce off-targets');
    const clmC = makeClaim(run.id, 'claim C: in vitro replication failed');
    for (const c of [clmA, clmB, clmC]) store.putObject('claim', c);
    // C contradicts A => counter bucket {A, C}; B stays supporting.
    store.putObject(
      'evidence_relation',
      EvidenceRelation.parse({
        id: newId('ev'), runId: run.id, relation: 'contradicts', claimId: clmC.id,
        targetClaimId: clmA.id, rationale: 'replication failure contradicts the duration link',
        createdAt: ts(0),
      }),
    );

    const steps: StubStep[] = [
      { rawOutput: gen(cand('E1', { evidenceClaimIds: [clmB.id, 'clm_doesnotexist000000000000aaa'] }), cand('E2')) },
      { rawOutput: gen(cand('C1'), cand('C2')) },
      { rawOutput: gen(cand('M1'), cand('M2')) },
      { rawOutput: JSON.stringify({ clusters: [{ memberIndices: [0, 1], reason: 'E1/E2 are paraphrases' }] }) },
      {
        rawOutput: JSON.stringify({
          labels: [
            { index: 0, noveltyLabel: 'evidence_grounded' },
            { index: 2, noveltyLabel: 'novel_speculation' },
            { index: 3, noveltyLabel: NOVELTY_MIXED },
          ],
        }),
      },
    ];
    const { ctx, receipts } = makeCtx(run, store, steps);
    expect(await generateHypothesesStage.applicable(ctx)).toBe(true);
    const outcome = await generateHypothesesStage.execute(ctx);

    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toMatch(/generated 6 candidates via 3 strategies/);
    expect(summary).toMatch(/5 paraphrase-distinct representatives/);
    expect(summary).toMatch(/1 duplicate/);
    expect(summary).toContain('clm_doesnotexist000000000000aaa');

    const hyps = store.listObjects('hypothesis', run.id);
    expect(hyps).toHaveLength(6);
    const byStrategy = (s: string) => hyps.filter((h) => h.derivation.strategy === s);
    expect(byStrategy('evidence_conditioned')).toHaveLength(2);
    expect(byStrategy('contradiction_driven')).toHaveLength(2);
    expect(byStrategy('mechanism_driven')).toHaveLength(2);

    // invalid evidence reference filtered; fallback = the strategy's conditioning claims
    const e1 = hyps.find((h) => h.statement === 'statement E1');
    const e2 = hyps.find((h) => h.statement === 'statement E2');
    expect(e1?.derivation.inputClaimIds).toEqual([clmB.id]);
    expect(e2?.derivation.inputClaimIds).toEqual([clmB.id]);

    // duplicate marking: index 1 is a paraphrase of representative index 0
    const dups = hyps.filter((h) => h.derivation.rationale.includes(DUPLICATE_MARKER));
    expect(dups).toHaveLength(1);
    expect(dups[0]?.derivation.rationale).toContain(`${DUPLICATE_MARKER}${e1?.id}`);
    expect(dups[0]?.clusterKey).toBe(e1?.clusterKey);
    expect(new Set(hyps.map((h) => h.clusterKey)).size).toBe(5);

    // novelty labels applied (scripted + honest default for unmentioned)
    expect(hyps.find((h) => h.statement === 'statement E1')?.noveltyLabel).toBe('evidence_grounded');
    expect(hyps.find((h) => h.statement === 'statement C1')?.noveltyLabel).toBe('novel_speculation');
    expect(hyps.find((h) => h.statement === 'statement M2')?.noveltyLabel).toBe('mixed');

    // receipts: 3 strategy calls + 1 clustering + 1 novelty, all model_call at this stage
    expect(receipts).toHaveLength(5);
    expect(receipts.every((r) => r.kind === 'model_call' && r.stage === 'generate_hypotheses')).toBe(true);

    // regeneration is not applicable once hypotheses exist
    expect(await generateHypothesesStage.applicable({ ...ctx, run: { ...ctx.run } })).toBe(false);
  });

  it('falls back for contradiction_driven when no counter-evidence exists (explicit where-could-it-be-wrong instruction)', async () => {
    const { store, run } = setup();
    const c1 = makeClaim(run.id, 'only affirmative claim one');
    const c2 = makeClaim(run.id, 'only affirmative claim two');
    store.putObject('claim', c1);
    store.putObject('claim', c2);

    const capture: { reqs: StructuredCallRequest[] } = { reqs: [] };
    const steps: StubStep[] = [
      { rawOutput: gen(cand('E1'), cand('E2')) },
      { rawOutput: gen(cand('C1'), cand('C2')) },
      { rawOutput: gen(cand('M1'), cand('M2')) },
      { rawOutput: JSON.stringify({ clusters: [{ memberIndices: [0], reason: 'single' }] }) },
      { rawOutput: JSON.stringify({ labels: [{ index: 0, noveltyLabel: 'evidence_grounded' }] }) },
    ];
    const { ctx } = makeCtx(run, store, steps, { capture });
    const outcome = await generateHypothesesStage.execute(ctx);
    expect(outcome.kind).toBe('done');

    expect(capture.reqs).toHaveLength(5);
    const ec = capture.reqs[0]?.userPayload as Record<string, unknown>;
    const supporting = ec.supportingClaims as Array<{ id: string }>;
    expect(supporting.map((c) => c.id).sort()).toEqual([c1.id, c2.id].sort());
    const cd = capture.reqs[1]?.userPayload as Record<string, unknown>;
    expect(cd.counterEvidenceAbsent).toBe(true);
    expect(String(cd.instruction)).toMatch(/COULD be wrong/i);
    expect((cd.counterDirectionClaims as Array<{ id: string }>).map((c) => c.id).sort()).toEqual(
      [c1.id, c2.id].sort(),
    );
    expect(capture.reqs[1]?.purpose).toBe('hypothesis-search:contradiction-driven');
  });

  it('diversity supplement fires when clustering collapses 6 candidates into 2 representatives', async () => {
    const { store, run } = setup();
    const c1 = makeClaim(run.id, 'claim one');
    const c2 = makeClaim(run.id, 'claim two');
    store.putObject('claim', c1);
    store.putObject('claim', c2);

    const steps: StubStep[] = [
      { rawOutput: gen(cand('E1'), cand('E2')) },
      { rawOutput: gen(cand('C1'), cand('C2')) },
      { rawOutput: gen(cand('M1'), cand('M2')) },
      { rawOutput: JSON.stringify({ clusters: [{ memberIndices: [0, 1, 2, 3], reason: 'same mechanism' }, { memberIndices: [4, 5], reason: 'same premise' }] }) },
      { rawOutput: gen(cand('S1'), cand('S2')) }, // supplement
      { rawOutput: JSON.stringify({ clusters: [{ memberIndices: [0, 1, 2, 3], reason: 'same mechanism' }, { memberIndices: [4, 5], reason: 'same premise' }, { memberIndices: [6], reason: 'distinct' }, { memberIndices: [7], reason: 'distinct' }] }) },
      { rawOutput: JSON.stringify({ labels: [{ index: 6, noveltyLabel: 'novel_speculation' }] }) },
    ];
    const { ctx, receipts } = makeCtx(run, store, steps);
    const outcome = await generateHypothesesStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toMatch(/diversity supplement/);

    const hyps = store.listObjects('hypothesis', run.id);
    expect(hyps).toHaveLength(8);
    expect(hyps.filter((h) => h.derivation.strategy === 'assumption_perturbation')).toHaveLength(2);
    expect(new Set(hyps.map((h) => h.clusterKey)).size).toBe(4); // 4 representatives after supplement
    expect(hyps.filter((h) => h.derivation.rationale.includes(DUPLICATE_MARKER))).toHaveLength(4);
    expect(receipts).toHaveLength(7); // 3 strategies + cluster + supplement + recluster + novelty
  });

  it(`stores an honest diversity shortfall when even the supplement stays below ${MIN_REPRESENTATIVES} representatives`, async () => {
    const { store, run } = setup();
    store.putObject('claim', makeClaim(run.id, 'claim one'));
    store.putObject('claim', makeClaim(run.id, 'claim two'));

    const steps: StubStep[] = [
      { rawOutput: gen(cand('E1'), cand('E2')) },
      { rawOutput: gen(cand('C1'), cand('C2')) },
      { rawOutput: gen(cand('M1'), cand('M2')) },
      { rawOutput: JSON.stringify({ clusters: [{ memberIndices: [0, 1, 2], reason: 'same' }, { memberIndices: [3, 4, 5], reason: 'same' }] }) },
      { rawOutput: gen(cand('S1'), cand('S2')) },
      // supplement candidates merge into the existing clusters: still 2 representatives
      { rawOutput: JSON.stringify({ clusters: [{ memberIndices: [0, 1, 2, 6], reason: 'same' }, { memberIndices: [3, 4, 5, 7], reason: 'same' }] }) },
      { rawOutput: JSON.stringify({ labels: [{ index: 0, noveltyLabel: 'evidence_grounded' }] }) },
    ];
    const { ctx } = makeCtx(run, store, steps);
    const outcome = await generateHypothesesStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toMatch(/stored as-is, NOT padded with paraphrases/);
    const hyps = store.listObjects('hypothesis', run.id);
    expect(hyps).toHaveLength(8);
    expect(new Set(hyps.map((h) => h.clusterKey)).size).toBe(2);
  });

  it('skips honestly on an empty verified evidence base and fails fast when cancelled', async () => {
    const { store, run } = setup(); // no claims at all
    const empty = makeCtx(run, store, []);
    const skipped = await generateHypothesesStage.execute(empty.ctx);
    expect(skipped).toMatchObject({ kind: 'skipped' });
    expect(skipped.kind === 'skipped' ? skipped.reason : '').toMatch(/no verified claims/);

    const cancelled = makeCtx(run, store, [{ rawOutput: gen(cand('E1'), cand('E2')) }], {
      cancelled: () => true,
    });
    store.putObject('claim', makeClaim(run.id, 'claim so generation proceeds to the cancel checkpoint'));
    await expect(generateHypothesesStage.execute(cancelled.ctx)).rejects.toThrow(
      /^cancelled by user during generate_hypotheses/,
    );
  });
});

// ---------------------------------------------------------------------------
// critique_falsify
// ---------------------------------------------------------------------------

describe('critique_falsify stage', () => {
  it('writes a complete spec + evidence relations, and rejects a future-work hollow spec deterministically', async () => {
    const { store, run } = setup();
    const c1 = makeClaim(run.id, 'counter claim: replication failed');
    const c2 = makeClaim(run.id, 'supporting claim: dose-response observed');
    store.putObject('claim', c1);
    store.putObject('claim', c2);
    const h1 = makeHyp(run.id, 'duration drives off-targeting', { createdAt: ts(0) });
    const h2 = makeHyp(run.id, 'gRNA structure drives off-targeting', { createdAt: ts(1) });
    const hdup = makeHyp(run.id, 'paraphrase of duration hypothesis', { duplicateOf: h1.id, createdAt: ts(2) });
    for (const h of [h1, h2, hdup]) store.putObject('hypothesis', h);

    const goodSpec = {
      observable: 'off-target edit frequency across exposure durations',
      measurement: 'targeted deep sequencing across a duration gradient of at least six timepoints',
      expectedRelation: 'monotonic increase of off-target rate with deaminase exposure duration',
      decisionRule: '若长暴露组比短暴露组高出至少2倍的脱靶率，则支持假设；若无显著差异则削弱',
      supportCondition: 'clear dose-response increase replicated across independent cell lines',
      weakeningCondition: 'flat or inconsistent response across the duration gradient',
      falsificationCondition: 'inverse relation or no relation replicated in three independent cell lines',
      confounders: ['cell-cycle state'],
      alternativeExplanations: ['gRNA secondary structure differences'],
      dataRequirements: ['duration-series editing dataset'],
      method: 'controlled exposure series with structure-matched gRNA controls',
      failureInterpretation: 'duration mechanism unsupported; revisit the mechanism class',
      assumptionCritiques: [{ assumptionIndex: 0, critique: 'assumption zero ignores cell-cycle confounding' }],
      counterClaimIds: [c1.id, 'clm_bogus00000000000000000000aaa'],
      weakeningClaimIds: [c1.id],
      supportingClaimIds: [c2.id],
      uncertainties: ['measurement noise at low edit frequencies'],
      testability: 'testable_now',
    };
    const hollowSpec = {
      observable: '某种可以在未来研究中观察的指标',
      measurement: '将来有了合适的数据之后可以进行相应的测量分析工作',
      expectedRelation: '预期将来数据中会出现某种形式的相关趋势',
      decisionRule: '可以在未来的工作中通过更多实验进一步验证这个想法',
      supportCondition: '如果未来的结果看起来与预期一致就算支持',
      weakeningCondition: '如果未来的结果看起来与预期不一致就算削弱',
      falsificationCondition: '如果未来很多年后依然没有数据那就无法证伪',
      confounders: [],
      alternativeExplanations: [],
      dataRequirements: [],
      method: '未来工作中的一个潜在分析方向',
      failureInterpretation: '如果未来无法验证就说明当前还下不了结论',
      assumptionCritiques: [{ assumptionIndex: 7, critique: 'index out of range is preserved honestly' }],
      counterClaimIds: [],
      weakeningClaimIds: [],
      supportingClaimIds: [],
      uncertainties: [],
      testability: 'testable_with_data',
    };

    const steps: StubStep[] = [
      { rawOutput: JSON.stringify(goodSpec) },
      { rawOutput: JSON.stringify(hollowSpec) },
    ];
    const { ctx } = makeCtx(run, store, steps);
    expect(await falsifyStage.applicable(ctx)).toBe(true);
    const outcome = await falsifyStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toContain('critique-linked evidence relation');
    expect(summary).toMatch(/REJECTED by deterministic completeness/);
    expect(summary).toContain('clm_bogus00000000000000000000aaa');

    // h1: complete spec accepted, links created, critique attached to the right assumption
    const h1After = store.getObject('hypothesis', h1.id);
    expect(h1After?.falsification?.completenessCheck).toEqual({ passed: true, missing: [] });
    expect(h1After?.testability).toBe('testable_now');
    expect(h1After?.supportingClaimIds).toEqual([c2.id]);
    expect(h1After?.counterClaimIds).toEqual([c1.id]);
    expect(h1After?.assumptions[0]?.uncertainty).toContain('cell-cycle confounding');
    expect(h1After?.uncertainties).toContain('measurement noise at low edit frequencies');

    const rels = store.listObjects('evidence_relation', run.id);
    expect(rels).toHaveLength(2);
    expect(rels).toContainEqual(
      expect.objectContaining({
        relation: 'weakens', claimId: c1.id, targetHypothesisId: h1.id,
        rationale: 'critique-linked counter evidence', strength: 'unrated',
      }),
    );
    expect(rels).toContainEqual(
      expect.objectContaining({
        relation: 'supports', claimId: c2.id, targetHypothesisId: h1.id,
        rationale: 'critique-linked supporting evidence',
      }),
    );

    // h2: hollow "future work" spec rejected by the pure check; hypothesis honestly untestable
    const h2After = store.getObject('hypothesis', h2.id);
    expect(h2After?.falsification?.completenessCheck?.passed).toBe(false);
    expect(h2After?.falsification?.completenessCheck?.missing?.join(' ')).toMatch(
      /decisionRule: no decidable comparison semantics/,
    );
    expect(h2After?.testability).toBe('untestable_currently');
    expect(h2After?.uncertainties.some((u) => u.includes('unattached'))).toBe(true);

    // duplicate untouched; stage no longer applicable once every representative has a spec
    expect(store.getObject('hypothesis', hdup.id)?.falsification).toBeUndefined();
    const after = makeCtx(run, store, []);
    expect(await falsifyStage.applicable(after.ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// rank
// ---------------------------------------------------------------------------

describe('rank stage', () => {
  it('computes deterministic weighted ranks with evidence_grounding tie-break, filters refs, emits comparison artifact', async () => {
    const { store, run } = setup();
    const c1 = makeClaim(run.id, 'evidence claim one');
    const c2 = makeClaim(run.id, 'evidence claim two');
    store.putObject('claim', c1);
    store.putObject('claim', c2);
    const ha = makeHyp(run.id, 'hypothesis A (tie, higher grounding)', { createdAt: ts(0) });
    const hb = makeHyp(run.id, 'hypothesis B (tie, lower grounding)', { createdAt: ts(1) });
    const hc = makeHyp(run.id, 'hypothesis C (lower)', { createdAt: ts(2) });
    const hdup = makeHyp(run.id, 'duplicate of A', { duplicateOf: ha.id, createdAt: ts(3) });
    for (const h of [ha, hb, hc, hdup]) store.putObject('hypothesis', h);

    // A composite = 0.2*0.8 + 0.8-weighted rest at 0.5 = 0.56
    // B composite = 0.2*0.6 + rest at 0.55             = 0.56  -> tie broken by evidence_grounding
    // C composite = (0.3 + 0.05*(1-0.2)) / 1.05        = 0.3238 (direction-known resource_cost)
    const rankOut = {
      assessments: [
        {
          hypothesisId: ha.id,
          dimensions: [
            ...CORE_DIMS(0.5).slice(0, 1).map((d) => ({ ...d, value: 0.8, evidenceClaimIds: [c1.id, 'clm_bogus00000000000000000000aaa'] })),
            ...CORE_DIMS(0.5).slice(1),
            dim('uncertainty', null),
          ],
        },
        {
          hypothesisId: hb.id,
          dimensions: [{ ...dim('evidence_grounding', 0.6) }, ...CORE_DIMS(0.55).slice(1), dim('uncertainty', null)],
        },
        {
          hypothesisId: hc.id,
          dimensions: [...CORE_DIMS(0.3), dim('uncertainty', null), dim('resource_cost', 0.2, { direction: 'higher_value_is_worse' })],
        },
        { hypothesisId: 'hyp_unknown0000000000000000000aaa', dimensions: [...CORE_DIMS(0.5), dim('uncertainty', null)] },
      ],
    };
    const { ctx, artifacts } = makeCtx(run, store, [{ rawOutput: JSON.stringify(rankOut) }]);
    expect(await rankStage.applicable(ctx)).toBe(true);
    const outcome = await rankStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toMatch(/ranked 3 of 3/);
    expect(summary).toContain('hyp_unknown0000000000000000000aaa');
    expect(summary).toContain('clm_bogus00000000000000000000aaa');

    const cards = store.listObjects('scorecard', run.id);
    expect(cards).toHaveLength(3); // duplicate hdup and unknown id never scored
    const cardOf = (h: string) => cards.find((c) => c.hypothesisId === h);
    expect(cardOf(ha.id)).toMatchObject({ rank: 1, rankedOutOf: 3 });
    expect(cardOf(hb.id)).toMatchObject({ rank: 2, rankedOutOf: 3 });
    expect(cardOf(hc.id)).toMatchObject({ rank: 3, rankedOutOf: 3 });
    expect(cardOf(ha.id)?.overallRationale).toContain('0.5600');
    expect(cardOf(hc.id)?.overallRationale).toContain('0.3238');
    expect(cardOf(ha.id)?.overallRationale).toContain('evidence_grounding 0.2');
    expect(cardOf(ha.id)?.comparisonNote).toBe(COMPARISON_NOTE);
    for (const c of cards) {
      expect(c.dimensions.every((d) => d.producer === 'test-stub/test-stub structured critique')).toBe(true);
      expect(c.dimensions.every((d) => d.calibration === 'uncalibrated_llm_judgment')).toBe(true);
    }
    const eg = cardOf(ha.id)?.dimensions.find((d) => d.dimension === 'evidence_grounding');
    expect(eg?.evidenceClaimIds).toEqual([c1.id]); // invalid ref filtered

    // deterministic top-2 comparison persisted as a content-addressed artifact
    const refs = outcome.kind === 'done' ? outcome.artifacts ?? [] : [];
    expect(refs).toHaveLength(1);
    const comparison = JSON.parse((await artifacts.get(refs[0] as string)) ?? '{}');
    expect(comparison).toMatchObject({ runId: run.id, aId: ha.id, bId: hb.id, preferred: 'a' });
    expect(comparison.criteria.length).toBeGreaterThanOrEqual(3);
    expect(comparison.criteria.some((c: { favors: string }) => c.favors === 'a')).toBe(true);
    expect(comparison.criteria.some((c: { favors: string }) => c.favors === 'b')).toBe(true);

    // all representatives scored -> not applicable anymore
    const after = makeCtx(run, store, []);
    expect(await rankStage.applicable(after.ctx)).toBe(false);
  });

  it('reports unscored representatives honestly when the model returns no usable assessment for them', async () => {
    const { store, run } = setup();
    const h1 = makeHyp(run.id, 'scored hypothesis', { createdAt: ts(0) });
    const h2 = makeHyp(run.id, 'unscored hypothesis', { createdAt: ts(1) });
    store.putObject('hypothesis', h1);
    store.putObject('hypothesis', h2);
    const out = { assessments: [{ hypothesisId: h1.id, dimensions: [...CORE_DIMS(0.7), dim('uncertainty', null)] }] };
    const { ctx } = makeCtx(run, store, [{ rawOutput: JSON.stringify(out) }]);
    const outcome = await rankStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toContain(h2.id);
    expect(summary).toMatch(/no usable assessment/);
    const cards = store.listObjects('scorecard', run.id);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ hypothesisId: h1.id, rank: 1, rankedOutOf: 1 });
    expect(outcome.kind === 'done' ? outcome.artifacts ?? [] : []).toHaveLength(0); // no top-2 with n=1
    const after = makeCtx(run, store, []);
    expect(await rankStage.applicable(after.ctx)).toBe(true); // h2 still unscored
  });
});

// ---------------------------------------------------------------------------
// pure functions (no LLM, no I/O)
// ---------------------------------------------------------------------------

describe('deterministic falsification completeness check (pure)', () => {
  const good = {
    observable: 'off-target edit frequency per exposure duration',
    measurement: 'targeted deep sequencing across a duration gradient',
    expectedRelation: 'monotonic increase with duration',
    decisionRule: 'support if ratio >= 2x long vs short; weaken if flat',
    supportCondition: 'dose-response present across independent lines',
    weakeningCondition: 'flat response across the full gradient',
    falsificationCondition: 'inverse or no relationship in three lines',
    method: 'controlled exposure series with matched controls',
    failureInterpretation: 'duration hypothesis unsupported; revisit mechanism',
  };
  it('accepts a spec with non-trivial fields and a decidable rule', () => {
    expect(checkFalsificationCompleteness(good)).toEqual({ passed: true, missing: [] });
  });
  it('rejects hollow future-work specs and trivial fields', () => {
    const hollow = { ...good, decisionRule: 'this idea can be verified by more experiments in future work' };
    const r = checkFalsificationCompleteness(hollow);
    expect(r.passed).toBe(false);
    expect(r.missing.join(' ')).toMatch(/no decidable comparison semantics/);
    const trivial = { ...good, observable: 'tbd', method: 'n/a' };
    const r2 = checkFalsificationCompleteness(trivial);
    expect(r2.passed).toBe(false);
    expect(r2.missing.filter((m) => m.startsWith('observable')).length).toBe(1);
    expect(r2.missing.filter((m) => m.startsWith('method')).length).toBe(1);
  });
  it('recognizes comparison and if-then semantics only', () => {
    for (const ok of ['若长期暴露则脱靶率至少翻倍', 'ratio >= 1.5 supports', '阈值 0.05', 'increase > 20%']) {
      expect(hasDecidableSemantics(ok)).toBe(true);
    }
    for (const bad of ['future work may verify this', '进一步验证', 'to be determined later on']) {
      expect(hasDecidableSemantics(bad)).toBe(false);
    }
  });
});

describe('deterministic composite scoring (pure)', () => {
  it('core weights are fixed, transparent and sum to 1.0', () => {
    expect(RANK_WEIGHTS).toEqual({
      evidence_grounding: 0.2,
      falsifiability: 0.15,
      testability: 0.1,
      counter_evidence_exposure: 0.15,
      scientific_plausibility: 0.15,
      novelty: 0.1,
      methodological_soundness: 0.15,
    });
    expect(Object.values(RANK_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 12);
  });
  it('excludes null dimensions from numerator AND denominator', () => {
    const r = compositeScore([
      { dimension: 'evidence_grounding', value: null },
      { dimension: 'falsifiability', value: 0.5 },
      { dimension: 'testability', value: 1 },
    ]);
    expect(r?.value).toBeCloseTo((0.15 * 0.5 + 0.1 * 1) / 0.25, 12);
    expect(r?.included).toEqual(['falsifiability', 'testability']);
    expect(r?.excluded.join(' ')).toMatch(/evidence_grounding: value null/);
  });
  it('handles direction-known and direction-unclear cost/risk dimensions', () => {
    const known = compositeScore([
      { dimension: 'evidence_grounding', value: 1 },
      { dimension: 'risk', value: 0.8, direction: 'higher_value_is_worse' },
    ]);
    expect(known?.value).toBeCloseTo((0.2 * 1 + 0.05 * 0.2) / 0.25, 12);
    const unclear = compositeScore([
      { dimension: 'evidence_grounding', value: 1 },
      { dimension: 'risk', value: 0.8, direction: 'unclear' },
    ]);
    expect(unclear?.value).toBeCloseTo(1, 12);
    expect(unclear?.excluded.join(' ')).toMatch(/risk: direction unclear/);
  });
  it('returns null when nothing is scoreable', () => {
    expect(compositeScore([{ dimension: 'evidence_grounding', value: null }])).toBeNull();
    expect(compositeScore([])).toBeNull();
  });
});
