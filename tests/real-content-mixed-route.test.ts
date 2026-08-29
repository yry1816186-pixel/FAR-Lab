import { describe, expect, it } from 'vitest';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { falsifyStage } from '../src/pipeline/stages/falsify.js';
import { rankStage, SCORE_DIMENSIONS } from '../src/pipeline/stages/rank.js';
import { TEMPLATE_REFUSAL_REASON } from '../src/pipeline/stages/shared.js';
import { planStage } from '../src/pipeline/stages/plan.js';
import { reviseStage } from '../src/pipeline/stages/revise.js';
import type { StageContext } from '../src/pipeline/types.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { createOfflineDevProvider } from '../src/providers/offline.js';
import {
  HypothesisCandidate,
  ModelProviderConfig,
  OFFLINE_WIRE_BASE_URL,
  ResearchQuestion,
  ResearchRun,
  ScientificClaim,
  newId,
} from '../src/domain/index.js';
import { canonicalSha256 } from '../src/shared/crypto.js';

/**
 * Real-content discipline — MIXED-ROUTE regression (owner directive 2026-08-29).
 *
 * A product run (StageContext.productRun === true) whose route is the
 * deterministic offline wire but which ALREADY CARRIES REAL scientific objects
 * (the mixed case: a live run degraded by failover, or resumed after the
 * workspace switched its active config to the keyless offline wire) must never
 * mint template judgment onto those real objects. Every judgment stage
 * (critique_falsify / rank / plan / revise) refuses with a visible skip that
 * names the development wire; nothing template persists; a LIVE receipt
 * (asLive stub control) passes the same guard and mints normally.
 */

const setup = () => {
  const store = new Store(openDb(':memory:'));
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Does anion redistribution drive interface impedance growth in polymer electrolyte cells?',
    background: 'transport degradation limits cycle life',
    goalType: 'explanatory',
    scope: { domain: 'electrochemistry', phenomena: ['interface degradation'] },
    constraints: { assumptions: [] },
    createdAt: new Date().toISOString(),
  });
  store.putObject('question', q);
  const run = ResearchRun.parse({
    id: newId('run'),
    questionId: q.id,
    status: 'running',
    currentStage: 'critique_falsify',
    stages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: [],
  });
  // A REAL hypothesis (the regex-class template markers do NOT match) with a
  // real verified claim behind it.
  const claim = ScientificClaim.parse({
    id: newId('clm'),
    runId: run.id,
    text: 'Operando impedance spectra show the interface contribution grows 3-fold over 200 discharge cycles while bulk transport stays constant',
    locators: [{ sourceDocumentId: newId('src'), quote: 'interface contribution grows 3-fold over 200 discharge cycles' }],
    bindingStatus: 'verified',
    alignmentChecked: true,
  });
  store.putObject('claim', claim);
  const hyp = HypothesisCandidate.parse({
    id: newId('hyp'),
    runId: run.id,
    version: 0,
    statement: 'Anion redistribution across the electrolyte interface concentrates mobile charge at degraded sites, driving impedance growth',
    mechanism: 'redistribution creates local depletion zones that raise the interfacial charge-transfer barrier',
    derivation: { strategy: 'mechanism_driven', rationale: 'seeded real hypothesis', inputClaimIds: [claim.id] },
    assumptions: [{ id: 'a0', statement: 'anion motion couples to interface impedance', kind: 'empirical', backingClaimIds: [] }],
    predictions: ['blocked-redistribution cells show materially lower impedance growth than controls'],
    supportingClaimIds: [],
    counterClaimIds: [],
    uncertainties: [],
    noveltyLabel: 'mixed',
    testability: 'testable_with_data',
    clusterKey: 'seeded',
    createdAt: new Date().toISOString(),
  });
  store.putObject('hypothesis', hyp);
  return { store, run, hyp, claim };
};

const memArtifacts = () => {
  const data = new Map<string, string>();
  return {
    async put(payload: string | Uint8Array) {
      const s = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
      const hash = canonicalSha256(s);
      const ref = `sha256:${hash}`;
      data.set(ref, s);
      return { ref, hash, size: s.length };
    },
    async get(ref: string) {
      return data.get(ref) ?? null;
    },
    path: (ref: string) => ref,
  };
};

const offlineProvider = () => {
  const cfg = ModelProviderConfig.parse({
    id: newId('mcfg'),
    label: 'offline dev wire (mixed-route regression)',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    wire: 'offline',
    baseUrl: OFFLINE_WIRE_BASE_URL,
    modelId: 'farlab-offline-deterministic',
    apiKey: '',
    fallbackConfigIds: [],
  });
  return createOfflineDevProvider(cfg);
};

const makeCtx = (
  store: Store,
  run: ResearchRun,
  provider: StageContext['provider'],
  productRun: boolean,
  cache?: Map<string, unknown>,
) => {
  const ctx: StageContext = {
    run,
    store,
    artifacts: memArtifacts(),
    provider,
    productRun,
    cancelled: () => false,
    disowned: () => false,
    log: () => {},
    recordReceipt: () => {},
    // Mirrors the orchestrator's success-only caching: a REFUSED fn (thrown
    // TemplateModeRefusal inside the checkpointed fn) is never cached.
    checkpointed: cache === undefined
      ? async <T>(_s: string, _f: string, _k: string, _fp: string | undefined, fn: () => Promise<T>) => fn()
      : async <T>(_s: string, family: string, key: string, _fp: string | undefined, fn: () => Promise<T>) => {
          const k = `${family}:${key}`;
          if (cache.has(k)) return cache.get(k) as T;
          const v = await fn();
          cache.set(k, v);
          return v;
        },
  };
  return ctx;
};

describe('real-content discipline: mixed route (product run on the offline wire with real objects)', () => {
  it('falsify refuses template specs — hypothesis untouched, zero relations minted', async () => {
    const { store, run, hyp } = setup();
    const out = await falsifyStage.execute(makeCtx(store, run, offlineProvider(), true));
    expect(out.kind).toBe('skipped');
    expect(out.kind === 'skipped' && out.reason).toContain('deterministic development wire');
    const stored = store.listObjects('hypothesis', run.id).find((h) => h.id === hyp.id);
    expect(stored?.falsification).toBeUndefined();
    expect(store.listObjects('evidence_relation', run.id)).toHaveLength(0);
  });

  it('rank refuses template scorecards — zero scorecards and tournament', async () => {
    const { store, run } = setup();
    const out = await rankStage.execute(makeCtx(store, run, offlineProvider(), true));
    expect(out.kind).toBe('skipped');
    expect(out.kind === 'skipped' && out.reason).toContain('deterministic development wire');
    expect(store.listObjects('scorecard', run.id)).toHaveLength(0);
    expect(store.listObjects('tournament', run.id)).toHaveLength(0);
  });

  it('plan refuses the template research plan — zero plans persisted', async () => {
    const { store, run } = setup();
    const out = await planStage.execute(makeCtx(store, run, offlineProvider(), true));
    expect(out.kind).toBe('skipped');
    expect(out.kind === 'skipped' && out.reason).toContain('deterministic development wire');
    expect(store.listObjects('plan', run.id)).toHaveLength(0);
  });

  it('revise refuses template causal analysis — feedback stays unconsumed, zero revisions', async () => {
    const { store, run } = setup();
    store.putObject('feedback', {
      id: newId('fbk'),
      runId: run.id,
      source: 'human_expert',
      content: 'The leading hypothesis ignores baseline-severity stratification; please revise.',
      provenance: 'mixed-route regression test',
      receivedAt: new Date().toISOString(),
    });
    const out = await reviseStage.execute(makeCtx(store, run, offlineProvider(), true));
    expect(out.kind).toBe('skipped');
    expect(out.kind === 'skipped' && out.reason).toContain('deterministic development wire');
    expect(store.listObjects('revision', run.id)).toHaveLength(0);
    expect(store.listObjects('feedback', run.id)).toHaveLength(1); // signal still pending, resumable
  });

  it('control: the same product run under a LIVE receipt passes the guard and mints (falsify spec)', async () => {    const { store, run, hyp } = setup();
    // A scripted LIVE double (asLive) playing a live route's falsification
    // analysis: full, decidable spec; no links, so the link audit is skipped.
    const spec = {
      observable: 'interfacial impedance contribution across discharge cycling with blocked anion redistribution',
      measurement: 'operando impedance spectroscopy over 200 full discharge cycles, additive vs inert control',
      expectedRelation: 'impedance growth rate falls when anion redistribution is blocked',
      decisionRule: 'if blocked-redistribution cells show >= 30% lower impedance growth than controls at 200 cycles, supported; < 10% difference weakens; an interval excluding the predicted direction falsifies',
      decisionRuleProvenance: 'model-stipulated',
      supportCondition: 'blocked-redistribution cells reproduce materially lower impedance growth',
      weakeningCondition: 'growth is unchanged within measurement noise across arms',
      falsificationCondition: 'growth accelerates despite redistribution blocking',
      confounders: ['temperature drift during cycling'],
      alternativeExplanations: ['interfacial impedance growth independent of anion motion'],
      dataRequirements: ['cycling series with operando spectra'],
      method: 'paired cycling experiment with an anion-blocking additive and inert control',
      failureInterpretation: 'the redistribution-impedance pathway is unsupported; revisit the interface model',
      uncertainties: [],
      testability: 'testable_now',
    };
    const provider = createTestStubProvider([{ rawOutput: JSON.stringify(spec), forPurpose: `falsification-spec:${hyp.id}` }], { asLive: true });
    const out = await falsifyStage.execute(makeCtx(store, run, provider, true));
    expect(out.kind).toBe('done');
    const stored = store.listObjects('hypothesis', run.id).find((h) => h.id === hyp.id);
    expect(stored?.falsification?.decisionRule).toBe(spec.decisionRule);
  });

  it('red-team P1-2: a refused rank batch is never cached — a later LIVE route mints (no poison loop)', async () => {
    const { store, run, hyp } = setup();
    const cache = new Map<string, unknown>();
    // Execution 1: the offline wire under a product run — the refusal must fire
    // INSIDE the checkpointed fn so the template batch is NOT cached as a
    // successful step output.
    const out1 = await rankStage.execute(makeCtx(store, run, offlineProvider(), true, cache));
    expect(out1.kind).toBe('skipped');
    expect(out1.kind === 'skipped' && out1.reason).toContain(TEMPLATE_REFUSAL_REASON);
    expect([...cache.keys()].filter((k) => k.includes('scoring'))).toHaveLength(0);
    expect(store.listObjects('scorecard', run.id)).toHaveLength(0);
    // Execution 2: a LIVE route with a full, valid RankOut — a fresh call must
    // run (no poisoned cache replay) and mint the real scorecard.
    const dims = SCORE_DIMENSIONS.map((d) => ({ dimension: d, value: 0.7, rationale: 'fixture rationale for the dimension' }));
    const live = createTestStubProvider(
      [{ rawOutput: JSON.stringify({ assessments: [{ hypothesisId: hyp.id, dimensions: dims }] }) }],
      { asLive: true },
    );
    const out2 = await rankStage.execute(makeCtx(store, run, live, true, cache));
    expect(out2.kind).toBe('done');
    expect(store.listObjects('scorecard', run.id).some((s) => s.hypothesisId === hyp.id)).toBe(true);
  });

  it('red-team P1-1: refusal skips carry the resume-reopen marker', async () => {
    const { store, run } = setup();
    const out = await rankStage.execute(makeCtx(store, run, offlineProvider(), true));
    expect(out.kind === 'skipped' && out.reason.startsWith(TEMPLATE_REFUSAL_REASON)).toBe(true);
  });

  it('control: plan under a LIVE receipt passes the guard and mints (live-control parity)', async () => {
    const { store, run, hyp } = setup();
    const step = (id: string, title: string, deps: string[] = []) => ({
      id, title, kind: 'data_analysis', inputs: [], outputs: [`${title} out`], method: 'fixture method', failureConditions: [], dependsOn: deps,
    });
    const draft = {
      objective: 'Discriminate the redistribution-impedance pathway against interface-degradation alternatives',
      hypothesisIds: [hyp.id],
      variables: ['impedance growth rate', 'anion redistribution index'],
      controls: ['inert-additive control cells'],
      inclusionCriteria: [], exclusionCriteria: [], dataRequirements: [], toolRequirements: [],
      steps: [step('s1', 'prepare paired cells'), step('s2', 'cycle with operando spectra', ['s1']), step('s3', 'estimate growth-rate contrast', ['s2'])],
      metrics: ['overpotential rise per 100 cycles', 'impedance spectra interface contribution'],
      statistics: [],
      decisionRules: { successCriterion: '>= 30% lower growth in blocked cells', weakeningCriterion: '< 10% difference', falsificationCriterion: 'interval excludes the predicted direction', stopCriterion: '20 cells per arm' },
      confounders: [], alternativeExplanations: [], resources: { compute: 'low', cost: 'low', time: '3 months' }, risks: [], ethics: [], prerequisites: [], alternativeBranches: [], reproducibilityRequirements: [],
    };
    const provider = createTestStubProvider([{ rawOutput: JSON.stringify(draft), forPurpose: 'research-plan-design' }], { asLive: true });
    const out = await planStage.execute(makeCtx(store, run, provider, true));
    expect(out.kind).toBe('done');
    expect(store.listObjects('plan', run.id)).toHaveLength(1);
  });

  it('control: revise under LIVE receipts consumes feedback and mints a Revision (live-control parity)', async () => {
    const { store, run, hyp } = setup();
    store.putObject('feedback', {
      id: newId('fbk'),
      runId: run.id,
      source: 'human_expert',
      content: 'The leading hypothesis ignores baseline-severity stratification; please revise.',
      provenance: 'live-control parity test',
      receivedAt: new Date().toISOString(),
    });
    const causal = {
      affected: [{ objectType: 'hypothesis', objectId: hyp.id, reason: 'the feedback bears on the leading hypothesis' }],
      causalChain: 'feedback -> stratification confounder -> hypothesis refinement',
      expectedQualityDelta: { status: 'inconclusive', claim: 'live route cannot argue a quality delta in this fixture' },
    };
    const revision = {
      statement: 'Anion redistribution concentrated at degraded sites drives impedance growth, conditional on baseline-severity stratification',
      mechanism: 'redistribution creates depletion zones raising the charge-transfer barrier, after adjusting for baseline severity',
      assumptions: [{ statement: 'anion motion couples to interface impedance', kind: 'empirical' as const }],
      predictions: ['stratified blocked-redistribution cells show materially lower impedance growth than matched controls'],
      addedUncertainties: ['stratification variable choice not yet validated'],
      revisionRationale: 'baseline-severity stratification bounds the claimed mechanism; the revision conditions it',
    };
    const provider = createTestStubProvider([
      { rawOutput: JSON.stringify(causal), forPurpose: 'causal-revision-analysis' },
      { rawOutput: JSON.stringify(revision), forPurpose: `hypothesis-revision:${hyp.id}` },
    ], { asLive: true });
    const out = await reviseStage.execute(makeCtx(store, run, provider, true));
    expect(out.kind).toBe('done');
    expect(store.listObjects('revision', run.id)).toHaveLength(1);
    const updated = store.listObjects('hypothesis', run.id).find((h) => h.id === hyp.id);
    expect(updated?.statement).toBe(revision.statement);
  });
});
