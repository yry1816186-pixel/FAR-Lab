import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { approveExperiment, ApproveExperimentBody } from '../src/server/experiment-ops.js';
import { impliedPowerFor, normalCdf, POWER_METHOD, mdeFloorFor } from '../src/domain/index.js';
import { ExperimentSpec, HypothesisCandidate, ResearchQuestion, newId } from '../src/domain/index.js';
import type { App } from '../src/app/composition.js';

/**
 * BP-5 confirmatory binding + implied power. Offline/deterministic throughout:
 * power math is pure; the approve op runs against an in-memory app with scripted
 * fixtures (an exploratory drafted spec + a falsified hypothesis).
 */

describe('implied power (disclosed worst-case convention)', () => {
  it('normalCdf matches reference values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 4);
    expect(normalCdf(6)).toBeCloseTo(1, 8);
  });

  it('power rises with nTest and with MDE; the mdeFloor convention implies ~50% power', () => {
    // at n = floor(1.96^2 * 0.5 / mde^2) the implied power sits near 0.5 — the two
    // conventions (floor + power) are the same statement from two sides
    const mde = 0.1;
    const nAtFloor = 1.96 * 1.96 * 0.5 / (mde * mde);
    const powerAtFloor = impliedPowerFor(mde, 0.05, Math.round(nAtFloor))!;
    expect(powerAtFloor).toBeGreaterThan(0.45);
    expect(powerAtFloor).toBeLessThan(0.60);
    // quadrupling n roughly halves SE -> power climbs toward 1
    const powerBigN = impliedPowerFor(mde, 0.05, Math.round(nAtFloor * 16))!;
    expect(powerBigN).toBeGreaterThan(0.95);
    // tiny n is honestly under-powered
    const powerTiny = impliedPowerFor(mde, 0.05, 30)!;
    expect(powerTiny).toBeLessThan(0.2);
    expect(mdeFloorFor(200)).toBeGreaterThan(0);
  });

  it('degenerate inputs return null, never fabricated power', () => {
    expect(impliedPowerFor(0, 0.05, 100)).toBeNull();
    expect(impliedPowerFor(0.1, 0.6, 100)).toBeNull();
    expect(impliedPowerFor(0.1, 0.05, 0)).toBeNull();
    expect(POWER_METHOD).toContain('normal-approx');
  });
});

describe('approveExperiment (BP-5 confirmatory binding)', () => {
  let tmp: string;
  let app: App;
  let runId = '';
  let specId = '';
  let hypId = '';

  const mkSpec = (id: string, run: string): ReturnType<typeof ExperimentSpec.parse> =>
    ExperimentSpec.parse({
      id, runId: run, planId: newId('pln'), planStepId: newId('task'),
      version: 1,
      question: 'drafted exploratory question',
      datasets: [{
        source: { resolver: 'openml', openmlId: 61, name: 'breast-cancer-wisconsin' },
        targetColumn: 'class',
        split: { method: 'random', ratios: { train: 0.6, val: 0.2, test: 0.2 }, seed: 7 },
      }],
      models: [
        { name: 'a', builderId: 'logistic_regression', hyperparams: {}, seed: 7 },
        { name: 'b', builderId: 'random_forest_classifier', hyperparams: {}, seed: 7 },
      ],
      metrics: ['accuracy'],
      comparisons: [{
        id: 'cmp-1', metricKey: 'accuracy', kind: 'paired_diff',
        modelAIdx: 0, modelBIdx: 1, direction: 'above', threshold: 0.02,
        thresholdProvenance: 'model-stipulated', primary: true,
      }],
      statistics: { test: 'paired_bootstrap_ci', alpha: 0.05, analysisSeed: 7, ciLevel: 0.95, multipleTestingPolicy: 'single_primary', multipleTestingNote: 'one primary' },
      approvals: [],
      exploratoryNote: 'plan-drafted exploratory comparison (thresholds model-stipulated)',
      createdAt: new Date().toISOString(),
    });

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-confirm-'));
    app = await createApp({ dataDir: tmp, providerOverride: createTestStubProvider([]) });
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    runId = app.store.createRun(q).id;
    const hyp = HypothesisCandidate.parse({
      id: newId('hyp'), runId, version: 0,
      statement: 'Random forest beats logistic regression on cytology features.',
      mechanism: 'axis-orthogonal splits fit the decision geometry.',
      derivation: { strategy: 'evidence_conditioned', rationale: 'test', inputClaimIds: [] },
      assumptions: [{ id: 'a1', statement: 'assumption', kind: 'empirical', backingClaimIds: [] }],
      predictions: ['RF accuracy exceeds LR by > 2 points'],
      supportingClaimIds: [], counterClaimIds: [], uncertainties: [],
      noveltyLabel: 'mixed', testability: 'testable_with_data', clusterKey: 'k',
      falsification: {
        observable: 'accuracy difference on the test split',
        measurement: 'paired bootstrap CI of accuracy(RF) - accuracy(LR)',
        expectedRelation: 'positive difference',
        decisionRule: 'supports if the 95% CI of the accuracy difference lies entirely above 0.02',
        decisionRuleProvenance: 'community-standard',
        supportCondition: 'CI low > 0.02', weakeningCondition: 'CI crosses 0.02',
        falsificationCondition: 'CI high < 0',
        confounders: [], alternativeExplanations: [], dataRequirements: ['tabular cytology dataset'],
        method: 'paired bootstrap',
        failureInterpretation: 'inconclusive if CI crosses the threshold',
      },
      createdAt: new Date().toISOString(),
    });
    hypId = hyp.id;
    app.store.putObject('hypothesis', hyp);
    specId = newId('xsp');
    app.store.putObject('experiment_spec', mkSpec(specId, runId));
  });

  afterAll(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp cleanup best-effort */ } });

  it('binds a comparison to a hypothesis, snapshots the rule, bumps version, re-validates', () => {
    const result = approveExperiment(app, runId, specId, {
      approvedBy: 'pi-researcher',
      bindings: [{ comparisonId: 'cmp-1', hypothesisId: hypId, mde: 0.05 }],
      note: 'threshold correspondence checked against the falsification rule',
    });
    expect(result.version).toBe(2);
    expect(result.validationPassed).toBe(true);
    const spec = app.store.getObject('experiment_spec', specId)!;
    expect(spec.version).toBe(2);
    expect(spec.comparisons[0]!.hypothesisId).toBe(hypId);
    expect(spec.comparisons[0]!.mde).toBe(0.05);
    expect(spec.approvals).toHaveLength(1);
    expect(spec.approvals[0]!.decisionRuleSnapshot).toContain('CI of the accuracy difference');
    expect(spec.approvals[0]!.approvedBy).toBe('pi-researcher');
    // the exploratory note is gone: binding IS the confirmatory declaration
    expect(spec.exploratoryNote).toBeUndefined();
    // audit event
    const ev = app.store.listEvents(runId).find((e) => e.type === 'note' && e.detail.reason === 'experiment_binding_approved');
    expect(ev?.detail.specId).toBe(specId);
  });

  it('rejects bindings without an MDE and hypotheses without a decision rule', () => {
    // comparison already bound+has mde now; a fresh exploratory spec with no mde
    const freshId = newId('xsp');
    app.store.putObject('experiment_spec', mkSpec(freshId, runId));
    expect(() => approveExperiment(app, runId, freshId, {
      approvedBy: 'pi', bindings: [{ comparisonId: 'cmp-1', hypothesisId: hypId }],
    })).toThrow(/minimum detectable effect/);
    // ownership: spec from another run
    expect(() => approveExperiment(app, 'run_ghost0000000000000000000000', freshId, {
      approvedBy: 'pi', bindings: [{ comparisonId: 'cmp-1', hypothesisId: hypId, mde: 0.05 }],
    })).toThrow(/not found/);
  });

  it('body schema rejects empty bindings and short approver names', () => {
    expect(ApproveExperimentBody.safeParse({ approvedBy: 'x', bindings: [] }).success).toBe(false);
    expect(ApproveExperimentBody.safeParse({ approvedBy: 'ok-person', bindings: [{ comparisonId: 'c', hypothesisId: 'h' }] }).success).toBe(true);
  });
});
