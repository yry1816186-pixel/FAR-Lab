import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import { HypothesisCandidate, MetaAnalysisSpec, ExperimentSpec, newId, ResearchQuestion, ScientificClaim, FalsificationSpec } from '../src/domain/index.js';
import { approveSpec, rerunSpec } from '../src/experiment/approve.js';
import { executeMetaAnalysis } from '../src/experiment/executor-meta.js';

/**
 * D-085 approval surface: the complete confirmatory arc —
 * exploratory meta run -> operator binds+approves -> confirmatory rerun ->
 * mechanical verdict + feedback signal into the causal revision loop.
 * All offline (stub provider, real store, pure-TS math).
 */

const dbs: Db[] = [];
const dirs: string[] = [];

const makeEnv = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-approve-'));
  dirs.push(dir);
  const db = openDb(path.join(dir, 'test.db'));
  dbs.push(db);
  const store = new Store(db);
  const question = ResearchQuestion.parse({
    id: newId('q'), text: 'Does vitamin D reduce RTI risk?', background: '', goalType: 'exploratory',
    scope: { domain: 'medicine', phenomena: ['vitamin d', 'rti'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  const run = store.createRun(question);
  return { store, runId: run.id, artifacts: openArtifactStore(path.join(dir, 'artifacts')) };
};

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('approve + rerun: the confirmatory arc (meta path)', () => {
  const setup = () => {
    const { store, runId, artifacts } = makeEnv();
    const hyp = HypothesisCandidate.parse({
      id: newId('hyp'), runId, version: 0, status: 'active',
      statement: 'Vitamin D supplementation reduces RTI risk.', mechanism: 'innate immunity',
      derivation: { strategy: 'evidence_conditioned', rationale: 'fixture', inputClaimIds: [] },
      falsification: FalsificationSpec.parse({
        observable: 'RTI incidence', measurement: 'pooled OR from published RCTs',
        expectedRelation: 'OR < 1', decisionRule: 'pooled OR 95% CI entirely below 1 falsifies the null; entirely above 1 falsifies the hypothesis',
        supportCondition: 'CI below 1', weakeningCondition: 'CI crosses 1', falsificationCondition: 'CI above 1',
        confounders: [], alternativeExplanations: [], dataRequirements: [], method: 'iv pooling',
        failureInterpretation: 'insufficient studies -> no test', completenessCheck: { passed: true, missing: [] },
      }),
      createdAt: new Date().toISOString(),
    });
    store.putObject('hypothesis', hyp);
    // 06-10 s2 (HK): narrow homogeneous CIs so the HONEST t_{k-2} interval still
    // excludes the log null at k=4 (pre-computed: pooled -0.698, HK CI [-0.772, -0.624]);
    // the old wide-CI fixture only cleared the now-corrected small-k z under-coverage.
    const claims = ['OR 0.50 (95% CI 0.48 to 0.52)', 'OR 0.48 (95% CI 0.46 to 0.50)', 'OR 0.52 (95% CI 0.50 to 0.54)', 'OR 0.49 (95% CI 0.47 to 0.51)']
      .map((t) => ScientificClaim.parse({
        id: newId('clm'), runId, text: `Trial reports ${t}.`,
        locators: [{ sourceDocumentId: newId('src'), quote: t }],
        bindingStatus: 'verified', alignmentChecked: true, uncertainties: [],
      }));
    for (const c of claims) store.putObject('claim', c);
    const spec = MetaAnalysisSpec.parse({
      id: newId('xsp'), runId, planId: newId('pln'), planStepId: newId('task'),
      question: 'Does vitamin D reduce RTI risk?', experimentType: 'statistical_meta',
      inclusionCriteria: 'randomized trials reporting adjusted odds ratios for RTI',
      effectMeasure: 'log_or', metaModel: 'random_dl', minStudies: 2,
      comparison: { id: 'cmp_m1', effectMeasure: 'log_or', direction: 'below', threshold: 0, thresholdProvenance: 'null-boundary', primary: true },
      approvals: [],
      exploratoryNote: 'exploratory literature pool — binding requires operator approval',
      createdAt: new Date().toISOString(),
    });
    store.putObject('meta_spec', spec);
    return { store, runId, artifacts, hyp, claims, spec };
  };

  const extractionStep = (claimIds: string[], docIds: string[]): StubStep => ({
    forPurpose: 'meta-effect-extraction',
    rawOutput: JSON.stringify({
      estimates: claimIds.map((cid, i) => ({
        claimId: cid, sourceDocumentId: docIds[i], measure: 'or',
        point: [0.5, 0.48, 0.52, 0.49][i], ciLow: [0.48, 0.46, 0.5, 0.47][i], ciHigh: [0.52, 0.5, 0.54, 0.51][i],
      })),
    }),
  });

  it('exploratory -> approve (bind + approval, version bump) -> rerun yields a confirmatory verdict + feedback', async () => {
    const { store, runId, artifacts, hyp, claims, spec } = setup();
    const docIds = claims.map((c) => c.locators[0]!.sourceDocumentId);

    // 1. exploratory run: no binding, no verdict, no feedback
    const exploratory = await executeMetaAnalysis(store, artifacts, spec, {
      provider: createTestStubProvider([extractionStep(claims.map((c) => c.id), docIds)]),
      now: () => '2026-08-23T00:00:00.000Z',
    });
    expect(exploratory.statReports[0]?.verdict).toBeUndefined();
    expect(exploratory.feedback).toHaveLength(0);

    // 2. operator binds + approves: version bumped, snapshot from the hypothesis' own decision rule
    const outcome = approveSpec(store, spec.id, { by: 'dr-pi', hypothesis: hyp.id });
    expect(outcome.kind).toBe('approved');
    if (outcome.kind !== 'approved') return;
    expect(outcome.spec.kind).toBe('meta');
    expect(outcome.approvalsAdded).toBe(1);
    const approved = (store.getObject('meta_spec', spec.id))!;
    expect(approved.version).toBe(spec.version + 1);
    expect(approved.comparison.hypothesisId).toBe(hyp.id);
    expect(approved.approvals[0]?.decisionRuleSnapshot).toContain('pooled OR 95% CI entirely below 1');
    expect(approved.approvals[0]?.approvedBy).toBe('dr-pi');
    expect(approved.exploratoryNote).toBeUndefined();

    // 3. confirmatory rerun: verdict binds, feedback flows to the hypothesis
    const rerun = await rerunSpec(store, artifacts, spec.id, {
      provider: createTestStubProvider([extractionStep(claims.map((c) => c.id), docIds)]),
    });
    expect(rerun.kind).toBe('meta');
    expect(rerun.run.status).toBe('completed');
    const rep = rerun.statReports[0]!;
    expect(rep.hypothesisId).toBe(hyp.id);
    expect(rep.verdict).toBe('supports'); // pooled CI entirely below the log null
    expect(rep.verdictDerivation).toContain('null-boundary');
    expect(rerun.feedback).toHaveLength(1);
    expect(rerun.feedback[0]?.target).toEqual({ kind: 'hypothesis', id: hyp.id });
    expect((rerun.feedback[0]?.structured as { verdicts: string[] }).verdicts).toEqual(['supports']);

    // the feedback signal is persisted — the revise stage's causal input
    expect(store.listObjects('feedback', runId)).toHaveLength(1);
  });

  it('approve without a hypothesis binding fails closed with guidance', () => {
    const { store, spec } = setup();
    const outcome = approveSpec(store, spec.id, { by: 'dr-pi' });
    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') expect(outcome.message).toContain('--hypothesis');
  });

  it('approve on an unknown spec id fails closed', () => {
    const { store } = setup();
    const outcome = approveSpec(store, newId('xsp'), { by: 'x' });
    expect(outcome.kind).toBe('error');
  });

  it('second approve of the same binding is idempotent (no duplicate approval)', () => {
    const { store, hyp, spec } = setup();
    const first = approveSpec(store, spec.id, { by: 'dr-pi', hypothesis: hyp.id });
    expect(first.kind).toBe('approved');
    const second = approveSpec(store, spec.id, { by: 'dr-pi-again', hypothesis: hyp.id });
    expect(second.kind).toBe('approved');
    if (second.kind !== 'approved') return;
    expect(second.approvalsAdded).toBe(0);
    const stored = store.getObject('meta_spec', spec.id)!;
    expect(stored.approvals).toHaveLength(1); // original operator stands
  });

  it('ML spec approve path enforces the MDE gate (g5)', () => {
    const { store, hyp } = setup();
    // minimal ML exploratory spec with one primary unbound comparison
    const mlSpec = {
      id: newId('xsp'), runId: hyp.runId, planId: newId('pln'), planStepId: newId('task'),
      question: 'q', version: 1,
      datasets: [{ source: { resolver: 'openml', openmlId: 61 }, targetColumn: 'Class', split: { method: 'random_stratified', ratios: { train: 0.7, val: 0.15, test: 0.15 }, seed: 42 } }],
      models: [{ name: 'baseline', builderId: 'logistic_regression', hyperparams: {}, seed: 42, tags: [] }],
      metrics: ['accuracy'],
      comparisons: [{ id: 'cmp_a', metricKey: 'accuracy', kind: 'absolute', modelIdx: 0, direction: 'above', threshold: 0.7, thresholdProvenance: 'model-stipulated', primary: true }],
      statistics: { test: 'paired_bootstrap_ci', alpha: 0.05, nBoot: 500, analysisSeed: 42, ciLevel: 0.95 },
      approvals: [],
      exploratoryNote: 'exploratory screen for the fixture run',
      createdAt: new Date().toISOString(),
    };
    store.putObject('experiment_spec', ExperimentSpec.parse(mlSpec));

    // binding WITHOUT an MDE is rejected by the approval gate (mirrors checkExperimentSpec g5)
    const noMde = approveSpec(store, mlSpec.id, { by: 'op', hypothesis: hyp.id });
    expect(noMde.kind).toBe('error');
    if (noMde.kind === 'error') expect(noMde.message).toContain('--mde');

    // with the MDE: bound + approved + version bumped
    const withMde = approveSpec(store, mlSpec.id, { by: 'op', hypothesis: hyp.id, mde: 0.05 });
    expect(withMde.kind).toBe('approved');
    const stored = store.getObject('experiment_spec', mlSpec.id)!;
    expect(stored.comparisons[0]?.hypothesisId).toBe(hyp.id);
    expect(stored.comparisons[0]?.mde).toBe(0.05);
    expect(stored.version).toBe(2);
    expect(stored.approvals).toHaveLength(1);
  });
});
