import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { FemSpec, HypothesisCandidate, newId, ResearchQuestion, type FemMeasurement } from '../src/domain/index.js';
import { executeFemAnalysis } from '../src/experiment/executor-fem.js';
import { femConvergenceVerdict, checkFemSpec } from '../src/domain/fem.js';
import { ResearchPlan } from '../src/domain/index.js';
import { executeStage } from '../src/pipeline/stages/execute.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import type { StageContext } from '../src/pipeline/types.js';
import type { Sidecar, SidecarCallResult } from '../src/experiment/python.js';

/**
 * Slice-6 FEM executor: convergence-order verification. Deterministic fake
 * sidecar doubles cover verdict mechanics on a real store; the routed case
 * rides the REAL sidecar (uv-run family env with sympy) — the true numerical
 * authority for L2 order ~2 / H1 order ~1 on the preregistered ladder.
 */

const T0 = '2026-08-30T00:00:00.000Z';
const dbs: Db[] = [];
const dirs: string[] = [];

const makeEnv = (): { store: Store; runId: string; artifacts: ReturnType<typeof openArtifactStore> } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-femexec-'));
  dirs.push(dir);
  const db = openDb(path.join(dir, 'test.db'));
  dbs.push(db);
  const store = new Store(db);
  const question = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Does a P1 finite-element discretization with mixed Dirichlet/Neumann assembly converge at the optimal order?',
    background: '', goalType: 'methodological',
    scope: { domain: 'numerical analysis', phenomena: ['FEM convergence'] }, constraints: {}, createdAt: T0,
  });
  const run = store.createRun(question);
  return { store, runId: run.id, artifacts: openArtifactStore(path.join(dir, 'artifacts')) };
};

const makeHyp = (runId: string): HypothesisCandidate =>
  HypothesisCandidate.parse({
    id: newId('hyp'), runId, version: 0, status: 'active',
    statement: 'The mixed-boundary P1 assembly attains L2 order 2 and H1 order 1 under uniform refinement.',
    mechanism: 'conforming Galerkin discretization of the elliptic weak form with exact quadrature',
    derivation: { strategy: 'mechanism_driven', rationale: 'fixture', inputClaimIds: [] },
    createdAt: T0,
  });

const makeSpec = (runId: string, over: Partial<FemSpec> = {}): FemSpec =>
  FemSpec.parse({
    id: newId('xsp'), runId, planId: newId('pln'), planStepId: newId('task'),
    question: 'Does the P1 FEM implementation converge optimally?',
    experimentType: 'numerical_pde',
    pde: { kind: 'poisson_2d_mixed' },
    domain: 'unit_square',
    manufacturedSolution: 'sin(pi*x)*sin(pi*y) + x*x*y + 0.5*x',
    boundary: { bottom: 'dirichlet', top: 'neumann', left: 'dirichlet', right: 'neumann' },
    levels: [8, 16, 32],
    thresholdProvenance: 'community-standard',
    compute: { device: 'local', maxParallel: 1, timeoutMs: 300_000 },
    approvals: [],
    exploratoryNote: 'exploratory verification — hypothesis binding requires operator approval',
    createdAt: T0,
    ...over,
  });

const fakeSidecar = (script: FemMeasurement[]): Sidecar => {
  let i = 0;
  return {
    call: async <T>(op: string, _payload: unknown, _timeoutMs: number): Promise<SidecarCallResult<T>> => {
      if (op !== 'fem_poisson_2d') return { ok: false, error: { kind: 'test_double', message: `unexpected op ${op}` } };
      const next = script[i];
      i += 1;
      if (next === undefined) return { ok: false, error: { kind: 'test_double', message: 'fake sidecar script exhausted' } };
      return { ok: true, result: next as T };
    },
    logs: () => [],
    envInfo: () => null,
    lockfileHash: () => null,
    warmup: async () => ({ pythonVersion: 'test-double', versions: {} }),
    close: () => {},
  };
};

const measurement = (over: Partial<FemMeasurement> = {}): FemMeasurement => ({
  manufactured: 'sin(pi*x)*sin(pi*y) + x*x*y + 0.5*x',
  forcing: '-2*y + 2*pi**2*sin(pi*x)*sin(pi*y)',
  edges: { bottom: 'dirichlet', top: 'neumann', left: 'dirichlet', right: 'neumann' },
  levels: [
    { n: 8, h: 0.125, ndof: 81, solveMs: 1, nonFinite: false, l2Err: 2.1e-2, h1Err: 4.5e-1 },
    { n: 16, h: 0.0625, ndof: 289, solveMs: 1, nonFinite: false, l2Err: 5.3e-3, h1Err: 2.3e-1 },
    { n: 32, h: 0.03125, ndof: 1089, solveMs: 2, nonFinite: false, l2Err: 1.3e-3, h1Err: 1.1e-1 },
  ],
  l2Orders: [1.99, 1.99],
  h1Orders: [0.97, 0.99],
  expectedL2Order: 2.0,
  expectedH1Order: 1.0,
  ...over,
});

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('fem domain gates', () => {
  it('rejects pure-Neumann (ill-posed) and non-ladder specs at the schema level', () => {
    expect(() => makeSpec('run_x', { boundary: { bottom: 'neumann', top: 'neumann', left: 'neumann', right: 'neumann' } }))
      .toThrow(/at least one Dirichlet edge/);
    expect(() => makeSpec('run_x', { levels: [16, 16, 32] })).toThrow(/strictly increasing/);
  });

  it('checkFemSpec demands exploratoryNote or a covered hypothesis binding', () => {
    const { store, runId } = makeEnv();
    const spec = makeSpec(runId, { exploratoryNote: undefined });
    expect(checkFemSpec(spec, { hypothesisIds: [] }).passed).toBe(false);
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    const bound = makeSpec(runId, {
      exploratoryNote: undefined,
      hypothesisId: hyp.id,
      approvals: [{ hypothesisId: hyp.id, comparisonIds: ['fem_convergence'], decisionRuleSnapshot: 'orders within tolerance', approvedBy: 'op', approvedAt: T0 }],
    });
    expect(checkFemSpec(bound, { hypothesisIds: [hyp.id] }).passed).toBe(true);
  });
});

describe('fem verdict mechanics (deterministic doubles)', () => {
  it('optimal orders verdict supports; lost order falsifies; non-finite is insufficient', () => {
    expect(femConvergenceVerdict(measurement())).toBe('supports');
    expect(femConvergenceVerdict(measurement({ l2Orders: [0.9, 0.95], h1Orders: [0.4, 0.45] }))).toBe('falsifies');
    const nf = measurement({ levels: measurement().levels.map((lv) => ({ ...lv, nonFinite: true })) });
    expect(femConvergenceVerdict(nf)).toBe('insufficient_data');
  });

  it('executes end-to-end on the real store: spec persisted, stat report exploratory, run completed', async () => {
    const { store, runId, artifacts } = makeEnv();
    const spec = makeSpec(runId);
    const out = await executeFemAnalysis(store, artifacts, spec, {
      sidecar: () => fakeSidecar([measurement()]),
      now: () => T0,
    });
    expect(out.run.status).toBe('completed');
    expect(store.getObject('fem_spec', spec.id)?.validation?.passed).toBe(true);
    const reports = store.listObjects('stat_report', runId);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.exploratory).toBe(true); // unbound = exploratory by construction
    expect(reports[0]?.test.kind).toBe('fem_convergence_order');
    expect(store.listObjects('feedback', runId)).toHaveLength(0);
  });

  it('a bound+approved spec verdicts and feeds a FeedbackSignal into the revision loop', async () => {
    const { store, runId, artifacts } = makeEnv();
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    const spec = makeSpec(runId, {
      exploratoryNote: undefined,
      hypothesisId: hyp.id,
      approvals: [{ hypothesisId: hyp.id, comparisonIds: ['fem_convergence'], decisionRuleSnapshot: 'final orders within 0.25 of theory', approvedBy: 'fixture-op', approvedAt: T0 }],
    });
    const out = await executeFemAnalysis(store, artifacts, spec, {
      sidecar: () => fakeSidecar([measurement()]),
      now: () => T0,
    });
    expect(out.statReports[0]?.verdict).toBe('supports');
    expect(out.statReports[0]?.hypothesisId).toBe(hyp.id);
    expect(out.feedback).toHaveLength(1);
    expect(out.feedback[0]?.source).toBe('experiment');
    expect(store.listObjects('feedback', runId)).toHaveLength(1);
  });

  it('a sequential re-run of the SAME spec hash is labelled exploratory, not confirmatory', async () => {
    const { store, runId, artifacts } = makeEnv();
    const spec = makeSpec(runId);
    const opts = { sidecar: () => fakeSidecar([measurement(), measurement()]), now: () => T0 };
    await executeFemAnalysis(store, artifacts, spec, opts);
    const second = await executeFemAnalysis(store, artifacts, spec, opts);
    expect(second.statReports[0]?.exploratory).toBe(true);
    expect(second.statReports[0]?.verdict).toBeUndefined();
    expect(second.statReports[0]?.analysisIteration).toBe(2);
  });

  it('validation failure throws before any sidecar spend', async () => {
    const { store, runId, artifacts } = makeEnv();
    const spec = makeSpec(runId, { exploratoryNote: undefined });
    await expect(executeFemAnalysis(store, artifacts, spec, { sidecar: () => fakeSidecar([]), now: () => T0 }))
      .rejects.toThrow(/fem spec failed validation/);
  });
});

describe('fem executor (real sidecar, uv-run family env with sympy)', () => {
  it('measures optimal convergence for a mixed-boundary manufactured solution', async () => {
    const { store, runId, artifacts } = makeEnv();
    const spec = makeSpec(runId);
    const out = await executeFemAnalysis(store, artifacts, spec, { now: () => T0 });
    expect(out.run.status).toBe('completed');
    expect(out.run.environment?.lockfileHash).toBeTruthy();
    const lastL2 = out.measurement.l2Orders[out.measurement.l2Orders.length - 1] ?? 0;
    const lastH1 = out.measurement.h1Orders[out.measurement.h1Orders.length - 1] ?? 0;
    expect(lastL2).toBeGreaterThan(1.75); // L2 order ~2
    expect(lastH1).toBeGreaterThan(0.75); // H1 order ~1
    const report = out.statReports[0];
    expect(report?.verdict).toBe('supports');
    expect(report?.metricKey).toBe('fem_l2_error_final_level');
    // the per-level measurement table is a content-addressed artifact (note event)
    const note = store.listEvents(runId).find((e) => (e.detail as Record<string, unknown>).kind === 'fem_measurement');
    expect((note?.detail as Record<string, unknown>).tableRef).toMatch(/^sha256:/);
  }, 120_000);
});




describe('execute stage routing: the numerical-PDE leg', () => {
  it('falls through ML/meta/theory infeasible and runs the FEM leg end-to-end (real sidecar)', async () => {
    const { store, runId, artifacts } = makeEnv();
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    const plan = ResearchPlan.parse({
      id: newId('pln'), runId,
      objective: 'Verify that a P1 finite-element solver with mixed Dirichlet/Neumann assembly converges at optimal order.',
      hypothesisIds: [hyp.id],
      steps: [{
        id: newId('task'), title: 'solve the Poisson problem and measure convergence', kind: 'simulation',
        method: 'finite-element discretization of the elliptic weak form with a manufactured solution and refinement ladder',
        failureConditions: ['observed order below the theoretical rate'],
      }],
      metrics: ['fem_l2_error_final_level'],
      decisionRules: {
        successCriterion: 'L2/H1 orders within tolerance of 2/1',
        weakeningCriterion: 'orders near the falsification band',
        falsificationCriterion: 'an order entirely lost or non-decreasing errors',
        stopCriterion: 'ladder evaluated once',
      },
      createdAt: T0,
    });
    store.putObject('plan', plan);

    const provider = createTestStubProvider([
      { forPurpose: 'experiment-spec-draft', rawOutput: JSON.stringify({ feasible: false, skipReason: 'no tabular dataset maps to a PDE verification' }) },
      { forPurpose: 'meta-spec-draft', rawOutput: JSON.stringify({ feasible: false, skipReason: 'no published effect estimates to pool' }) },
      { forPurpose: 'theory-spec-draft', rawOutput: JSON.stringify({ feasible: false, skipReason: 'not a closed-form identity claim — a PDE convergence question' }) },
      {
        forPurpose: 'fem-spec-draft',
        rawOutput: JSON.stringify({
          feasible: true,
          manufacturedSolution: 'sin(pi*x)*sin(pi*y) + x*x*y + 0.5*x',
          boundary: { bottom: 'dirichlet', top: 'neumann', left: 'dirichlet', right: 'neumann' },
        }),
      },
    ], { asLive: true });

    const ctx: StageContext = {
      run: store.getRun(runId)!,
      store,
      artifacts,
      provider,
      productRun: true,
      cancelled: () => false,
      disowned: () => false,
      log: () => {},
      recordReceipt: () => {},
      checkpointed: async <T>(_s: string, _f: string, _k: string, _fp: string | undefined, fn: () => Promise<T>): Promise<T> => fn(),
    };

    const out = await executeStage.execute(ctx);
    expect(out.kind).toBe('done');
    expect(out.kind === 'done' && out.summary).toContain('numerical PDE experiment');
    expect(out.kind === 'done' && out.summary).toContain('L2 order 1.');
    const runs = store.listObjects('experiment_run', runId).filter((r) => r.status === 'completed');
    expect(runs).toHaveLength(1);
    const reports = store.listObjects('stat_report', runId);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.verdict).toBe('supports');
    expect(store.getObject('fem_spec', reports[0]!.experimentRunId) ?? store.listObjects('fem_spec', runId)).toBeTruthy();
  }, 120_000);
});


