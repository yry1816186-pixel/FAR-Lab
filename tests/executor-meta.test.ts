import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import { HypothesisCandidate, MetaAnalysisSpec, newId, ScientificClaim, ResearchQuestion, ResearchPlan } from '../src/domain/index.js';
import { executeMetaAnalysis } from '../src/experiment/executor-meta.js';
import { executeStage } from '../src/pipeline/stages/execute.js';

/**
 * W-F M3: statistical_meta executor — literature-type falsification path, all
 * offline/deterministic (stub provider, real store, pure-TS math).
 */

const dbs: Db[] = [];
const dirs: string[] = [];

const makeEnv = (_steps: StubStep[]): { store: Store; runId: string; artifacts: ReturnType<typeof openArtifactStore> } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-metaexec-'));
  dirs.push(dir);
  const db = openDb(path.join(dir, 'test.db'));
  dbs.push(db);
  const store = new Store(db);
  const question = ResearchQuestion.parse({
    id: newId('q'), text: 'Does vitamin D reduce RTI risk?', background: '', goalType: 'exploratory',
    scope: { domain: 'medicine', phenomena: ['vitamin d', 'respiratory infection'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  const run = store.createRun(question);
  return { store, runId: run.id, artifacts: openArtifactStore(path.join(dir, 'artifacts')) };
};

const makeClaim = (runId: string, text: string, verified = true): ScientificClaim =>
  ScientificClaim.parse({
    id: newId('clm'), runId, text,
    locators: [{ sourceDocumentId: newId('src'), quote: text.slice(0, 40) }],
    bindingStatus: verified ? 'verified' : 'resolved_unaligned',
    alignmentChecked: verified,
    uncertainties: [],
  });

const makeHyp = (runId: string): HypothesisCandidate =>
  HypothesisCandidate.parse({
    id: newId('hyp'), runId, version: 0, status: 'active',
    statement: 'Vitamin D supplementation reduces RTI risk.', mechanism: 'innate immunity',
    derivation: { strategy: 'evidence_conditioned', rationale: 'fixture', inputClaimIds: [] },
    createdAt: new Date().toISOString(),
  });

const makeSpec = (runId: string, over: Partial<MetaAnalysisSpec> = {}): MetaAnalysisSpec =>
  MetaAnalysisSpec.parse({
    id: newId('xsp'), runId, planId: newId('pln'), planStepId: newId('task'),
    question: 'Does vitamin D reduce RTI risk?',
    experimentType: 'statistical_meta',
    inclusionCriteria: 'randomized trials reporting an odds ratio for respiratory tract infection',
    effectMeasure: 'log_or', metaModel: 'random_dl', minStudies: 2,
    alpha: 0.05, ciLevel: 0.95,
    comparison: {
      id: 'cmp_meta1', effectMeasure: 'log_or', direction: 'below', threshold: 0,
      thresholdProvenance: 'null-boundary', primary: true,
    },
    approvals: [], exploratoryNote: 'exploratory literature pool — hypothesis binding requires operator approval',
    createdAt: new Date().toISOString(),
    ...over,
  });

const run = async (steps: StubStep[], spec: MetaAnalysisSpec, runId: string, store: Store, artifacts: ReturnType<typeof openArtifactStore>) =>
  executeMetaAnalysis(store, artifacts, spec, {
    provider: createTestStubProvider(steps),
    now: () => '2026-08-23T00:00:00.000Z',
  });

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('execute stage routing (M4): ML-infeasible plans fall through to the meta path', () => {
  it('runs a literature-pool experiment end-to-end when tabular ML is infeasible', async () => {
    const { store, runId, artifacts } = makeEnv([]);
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    const c1 = makeClaim(runId, 'Trial reports OR 0.55 (95% CI 0.35 to 0.85) for RTI.');
    const c2 = makeClaim(runId, 'Trial reports odds ratio 0.65 (95% CI 0.45 to 0.92).');
    const c3 = makeClaim(runId, 'Trial reports OR 0.50 (95% CI 0.30 to 0.80).');
    for (const c of [c1, c2, c3]) store.putObject('claim', c);

    const plan = ResearchPlan.parse({
      id: newId('pln'), runId, objective: 'Pool published RCT evidence on vitamin D and RTI risk.',
      hypothesisIds: [hyp.id],
      steps: [{ id: newId('task'), title: 'Meta-analyze published trials', kind: 'literature', method: 'inverse-variance pooling of published odds ratios' }],
      metrics: ['pooled_log_or'],
      decisionRules: {
        successCriterion: 'pooled OR CI entirely below 1',
        weakeningCriterion: 'CI crosses 1',
        falsificationCriterion: 'pooled OR CI entirely above 1',
        stopCriterion: 'primary comparison resolved',
      },
      createdAt: new Date().toISOString(),
    });
    store.putObject('plan', plan);

    const provider = createTestStubProvider([
      // (1) ML draft: infeasible — this is a literature question
      { forPurpose: 'experiment-spec-draft', rawOutput: JSON.stringify({ feasible: false, skipReason: 'no public tabular dataset maps to published-trial pooling' }) },
      // (2) meta draft: feasible literature pool
      {
        forPurpose: 'meta-spec-draft',
        rawOutput: JSON.stringify({
          feasible: true, effectMeasure: 'log_or', direction: 'below',
          inclusionCriteria: 'randomized trials reporting adjusted odds ratios for respiratory tract infection',
        }),
      },
      // (3) effect-estimate extraction from the three verified claims
      {
        forPurpose: 'meta-effect-extraction',
        rawOutput: JSON.stringify({
          estimates: [
            { claimId: c1.id, sourceDocumentId: c1.locators[0]!.sourceDocumentId, measure: 'or', point: 0.55, ciLow: 0.35, ciHigh: 0.85 },
            { claimId: c2.id, sourceDocumentId: c2.locators[0]!.sourceDocumentId, measure: 'or', point: 0.65, ciLow: 0.45, ciHigh: 0.92 },
            { claimId: c3.id, sourceDocumentId: c3.locators[0]!.sourceDocumentId, measure: 'or', point: 0.5, ciLow: 0.3, ciHigh: 0.8 },
          ],
        }),
      },
    ]);
    const ctx = {
      run: store.getRun(runId)!,
      store, artifacts, provider,
      sourceFor: (): never => { throw new Error('TEST FIXTURE: no source adapter needed'); },
      recordReceipt: () => {},
      cancelled: () => false,
      disowned: () => false,
      log: () => {},
      checkpointed: async <T,>(_s: unknown, _f: string, _k: string, _fp: string | undefined, fn: () => Promise<T>) => fn(),
    } as unknown as Parameters<typeof executeStage.execute>[0];

    const out = await executeStage.execute(ctx);
    expect(out.kind).toBe('done');
    expect(out.summary).toContain('meta experiment');
    expect(out.summary).toContain('log_or');

    // the loop really closed on real persisted objects
    const metaRuns = store.listObjects('experiment_run', runId).filter((r) => r.status === 'completed');
    expect(metaRuns).toHaveLength(1);
    const reports = store.listObjects('stat_report', runId);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.meta?.k).toBe(3);
    expect(reports[0]?.metricKey).toBe('pooled_log_or');
    // three log-OR CIs all entirely negative -> pooled CI below the null boundary
    expect(reports[0]?.ci.high).toBeLessThan(0);
    // exploratory draft: no verdict binding, no feedback signal
    expect(reports[0]?.verdict).toBeUndefined();
    expect(store.listObjects('feedback', runId)).toHaveLength(0);
  });
});

describe('statistical_meta executor', () => {
  it('pools admitted estimates, verdicts mechanically, and feeds the bound hypothesis', async () => {
    const { store, runId, artifacts } = makeEnv([]);
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    const c1 = makeClaim(runId, 'RR trial reports OR 0.60 (95% CI 0.40 to 0.90) for RTI.');
    const c2 = makeClaim(runId, 'Trial reports odds ratio 0.70 (95% CI 0.50 to 0.98).');
    const cBad = makeClaim(runId, 'Trial reports OR 1.5 (95% CI 2.0 to 1.0).'); // bracket violation
    const cWrong = makeClaim(runId, 'Trial reports SMD -0.30 (95% CI -0.60 to 0.00).'); // wrong measure
    for (const c of [c1, c2, cBad, cWrong]) store.putObject('claim', c);

    const spec = makeSpec(runId, {
      comparison: {
        id: 'cmp_meta1', effectMeasure: 'log_or', direction: 'below', threshold: 0,
        thresholdProvenance: 'null-boundary', primary: true, hypothesisId: hyp.id,
      },
      approvals: [{
        hypothesisId: hyp.id,
        comparisonIds: ['cmp_meta1'],
        decisionRuleSnapshot: 'pooled OR CI entirely below 1 supports the protective hypothesis',
        approvedBy: 'fixture-operator',
        approvedAt: '2026-08-23T00:00:00.000Z',
      }],
    });
    const extraction = {
      estimates: [
        { claimId: c1.id, sourceDocumentId: c1.locators[0]!.sourceDocumentId, measure: 'or', point: 0.6, ciLow: 0.4, ciHigh: 0.9 },
        { claimId: c2.id, sourceDocumentId: c2.locators[0]!.sourceDocumentId, measure: 'or', point: 0.7, ciLow: 0.5, ciHigh: 0.98 },
        { claimId: cBad.id, sourceDocumentId: cBad.locators[0]!.sourceDocumentId, measure: 'or', point: 1.5, ciLow: 2.0, ciHigh: 1.0 },
        { claimId: cWrong.id, sourceDocumentId: cWrong.locators[0]!.sourceDocumentId, measure: 'smd', point: -0.3, ciLow: -0.6, ciHigh: 0.0 },
      ],
    };
    const out = await run(
      [{ forPurpose: 'meta-effect-extraction', rawOutput: JSON.stringify(extraction) }],
      spec, runId, store, artifacts,
    );

    expect(out.run.status).toBe('completed');
    // admission gate: 2 admitted, 2 rejected with countable reasons
    const estimates = store.listObjects('effect_estimate', runId);
    expect(estimates).toHaveLength(2);
    const rep = out.statReports[0]!;
    expect(rep.metricKey).toBe('pooled_log_or');
    expect(rep.meta?.k).toBe(2);
    expect(rep.meta?.rejectedProposals).toBe(2);
    expect(rep.meta?.rejectionReasons.join(' ')).toContain('bracket');
    expect(rep.meta?.rejectionReasons.join(' ')).toContain('measure smd');
    // both studies' log-OR CIs are entirely negative -> pooled CI below 0 -> supports (direction below)
    expect(rep.ci.high).toBeLessThan(0);
    expect(rep.verdict).toBe('supports');
    expect(rep.hypothesisId).toBe(hyp.id);
    expect(rep.verdictDerivation).toContain('null-boundary');
    expect(rep.test.kind).toBe('meta_iv_random_dl');
    expect(rep.meta?.sensitivityModel).toBe('fixed');
    // feedback flows to the bound hypothesis with full disclosures
    expect(out.feedback).toHaveLength(1);
    expect(out.feedback[0]?.target).toEqual({ kind: 'hypothesis', id: hyp.id });
    const structured = out.feedback[0]?.structured as { kind: string; verdicts: string[] };
    expect(structured.kind).toBe('statistical_meta');
    expect(structured.verdicts).toEqual(['supports']);
  });

  it('INSUFFICIENT_DATA: fewer admissible studies than the preregistered floor — no pooling theater', async () => {
    const { store, runId, artifacts } = makeEnv([]);
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    const c1 = makeClaim(runId, 'Trial reports OR 0.6 (95% CI 0.4 to 0.9).');
    store.putObject('claim', c1);

    const spec = makeSpec(runId, { minStudies: 3 });
    const extraction = {
      estimates: [
        { claimId: c1.id, sourceDocumentId: c1.locators[0]!.sourceDocumentId, measure: 'or', point: 0.6, ciLow: 0.4, ciHigh: 0.9 },
      ],
    };
    const out = await run(
      [{ forPurpose: 'meta-effect-extraction', rawOutput: JSON.stringify(extraction) }],
      spec, runId, store, artifacts,
    );
    expect(out.run.status).toBe('completed');
    const rep = out.statReports[0]!;
    expect(rep.verdict).toBeUndefined(); // exploratory spec (no binding) -> no verdict field
    expect(rep.metricKey).toBe('pooled_log_or');
    expect(rep.meta?.k).toBe(1);
    // the spec was exploratory (no hypothesisId) — INSUFFICIENT_DATA still lands in the
    // derivation, and NO feedback is produced (nothing was bound)
    expect(rep.verdictDerivation).toBeUndefined();
    expect(out.feedback).toHaveLength(0);
  });

  it('hypothesis-bound without a covering approval fails closed before any spend', async () => {
    const { store, runId, artifacts } = makeEnv([]);
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    store.putObject('claim', makeClaim(runId, 'Trial reports OR 0.6 (95% CI 0.4 to 0.9).'));

    const spec = makeSpec(runId, {
      comparison: {
        id: 'cmp_meta1', effectMeasure: 'log_or', direction: 'below', threshold: 0,
        thresholdProvenance: 'null-boundary', primary: true, hypothesisId: hyp.id,
      },
    });
    await expect(run([], spec, runId, store, artifacts)).rejects.toThrow(/lacks a covering binding approval/);
    expect(store.listObjects('experiment_run', runId).filter((r) => r.status === 'completed')).toHaveLength(0);
  });

  it('extraction provider failure marks the run failed with the verbatim error', async () => {
    const { store, runId, artifacts } = makeEnv([]);
    store.putObject('claim', makeClaim(runId, 'Trial reports OR 0.6 (95% CI 0.4 to 0.9).'));
    const spec = makeSpec(runId);
    await expect(
      run([{ forPurpose: 'meta-effect-extraction', fail: { kind: 'provider_error', message: 'fixture outage' } }], spec, runId, store, artifacts),
    ).rejects.toThrow(/extraction failed \(provider_error\)/);
    const failed = store.listObjects('experiment_run', runId).find((r) => r.status === 'failed');
    expect(failed?.error).toContain('fixture outage');
  });

  it('no verified claims fails honestly before any model call', async () => {
    const { store, runId, artifacts } = makeEnv([]);
    const spec = makeSpec(runId);
    await expect(run([], spec, runId, store, artifacts)).rejects.toThrow(/no verified claims/);
  });
});
