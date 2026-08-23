import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { draftSpecFromPlan } from '../src/experiment/spec-from-plan.js';
import { makeStoreReceiptRecorder } from '../src/pipeline/llm.js';
import { ResearchPlan } from '../src/domain/plan.js';
import type { App } from '../src/app/composition.js';

/**
 * B8 spec drafting: the model proposes inside a closed space; deterministic
 * parse maps it onto the REAL ExperimentSpec schema; infeasible plans and
 * provider failures both land in honest SKIPS.
 */

let tmp: string;
let app: App;
let plan: ResearchPlan;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-specdraft-'));
  app = await createApp({ dataDir: tmp, providerOverride: createTestStubProvider([]) });
  plan = ResearchPlan.parse({
    id: 'pln_test000000000000000000000001',
    runId: 'run_test000000000000000000000001',
    objective: 'Test whether tree ensembles beat linear baselines on tabular clinical data.',
    hypothesisIds: ['hyp_test000000000000000000000001'],
    variables: ['age', 'blood_panel', 'outcome'],
    controls: [],
    inclusionCriteria: [],
    exclusionCriteria: [],
    dataRequirements: [{
      name: 'Tabular clinical classification benchmark',
      variables: ['features', 'outcome'],
      availability: 'public',
    }],
    toolRequirements: [],
    steps: [{ id: 'task_ttttttttttttttttttttttttt', title: 'Fit and compare model families', kind: 'data_analysis', inputs: [], outputs: [], method: 'supervised classification with stratified split', failureConditions: [] }],
    metrics: ['accuracy'],
    statistics: ['paired bootstrap CI'],
    decisionRules: {
      successCriterion: 'paired improvement CI excludes zero',
      weakeningCriterion: 'CI overlaps zero',
      falsificationCriterion: 'CI entirely below zero',
      stopCriterion: 'after one screen',
    },
    createdAt: new Date().toISOString(),
  });
});

afterAll(() => {
  app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('draftSpecFromPlan', () => {
  // Drafting now runs on the unified model plane: the plane REQUIRES a receipt
  // sink (unaccountable calls are the coordination gap this closes). Tests bind a
  // real store-backed recorder to the plan's run — receipts land in the temp db.
  const plane = (provider: ReturnType<typeof createTestStubProvider>) => ({
    provider,
    recordReceipt: makeStoreReceiptRecorder(app.store, plan.runId),
  });

  it('maps a feasible draft onto the real ExperimentSpec schema (paired, exploratory, stipulated)', async () => {
    const provider = createTestStubProvider([{
      forPurpose: 'experiment-spec-draft',
      rawOutput: JSON.stringify({
        feasible: true,
        openmlDatasetId: 1468,
        targetColumn: 'class',
        models: [
          { name: 'linear-baseline', builderId: 'logistic_regression', hyperparams: { C: 1.0 } },
          { name: 'forest', builderId: 'random_forest_classifier', hyperparams: { n_estimators: 200 } },
        ],
      }),
    }]);
    const res = await draftSpecFromPlan(plan, 'Which model family wins on clinical tabs?', { provider, recordReceipt: plane(provider).recordReceipt });
    expect(res.kind).toBe('spec');
    if (res.kind !== 'spec') return;
    const spec = res.spec;
    expect(spec.datasets[0]?.source).toEqual({ resolver: 'openml', openmlId: 1468 });
    expect(spec.models).toHaveLength(2);
    expect(spec.comparisons[0]?.kind).toBe('paired_diff');
    expect(spec.comparisons[0]?.thresholdProvenance).toBe('model-stipulated');
    expect(spec.comparisons[0]?.hypothesisId).toBeUndefined(); // never self-bound
    expect(spec.exploratoryNote).toContain(plan.id);
    expect(spec.statistics.test).toBe('paired_bootstrap_ci');
  });

  it('absolute comparison when only one model drafted', async () => {
    const provider = createTestStubProvider([{
      forPurpose: 'experiment-spec-draft',
      rawOutput: JSON.stringify({
        feasible: true,
        openmlDatasetId: 61,
        targetColumn: 'Class',
        models: [{ name: 'single', builderId: 'gradient_boosting_classifier', hyperparams: {} }],
      }),
    }]);
    const res = await draftSpecFromPlan(plan, 'q', { provider, recordReceipt: plane(provider).recordReceipt });
    expect(res.kind).toBe('spec');
    if (res.kind === 'spec') expect(res.spec.comparisons[0]?.kind).toBe('absolute');
  });

  it('infeasible plan -> honest skip with reason', async () => {
    const provider = createTestStubProvider([{
      forPurpose: 'experiment-spec-draft',
      rawOutput: JSON.stringify({ feasible: false, skipReason: 'requires wet-lab assays no public tabular dataset provides' }),
    }]);
    const res = await draftSpecFromPlan(plan, 'q', { provider, recordReceipt: plane(provider).recordReceipt });
    expect(res).toMatchObject({ kind: 'skip', reason: expect.stringContaining('wet-lab') });
  });

  it('provider failure -> skip (experiments enrich, never kill the run)', async () => {
    const provider = createTestStubProvider([{
      forPurpose: 'experiment-spec-draft',
      fail: { kind: 'quota_exceeded', message: 'no balance (scripted)' },
    }]);
    const res = await draftSpecFromPlan(plan, 'q', { provider, recordReceipt: plane(provider).recordReceipt });
    expect(res.kind).toBe('skip');
    if (res.kind === 'skip') expect(res.reason).toContain('quota_exceeded');
  });
});
