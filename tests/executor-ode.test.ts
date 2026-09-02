import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { HypothesisCandidate, OdeSpec, newId, ResearchQuestion, checkOdeSpec, odeIntegrationVerdict } from '../src/domain/index.js';
import { executeOdeAnalysis } from '../src/experiment/executor-ode.js';
import { createSidecar, type Sidecar, type SidecarCallResult } from '../src/experiment/python.js';

/**
 * Wave B ODE executor: preregistered IVP integration against a closed-form
 * solution. Deterministic doubles for the verdict/approval/failure paths; the
 * integration math itself rides the REAL sidecar (uv-run family env) for the
 * analytic-solution comparisons — decay and a deliberately wrong solution.
 */

const T0 = '2026-09-01T00:00:00.000Z';
const dbs: Db[] = [];
const dirs: string[] = [];

const makeEnv = (): { store: Store; runId: string; artifacts: ReturnType<typeof openArtifactStore> } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-odeexec-'));
  dirs.push(dir);
  const db = openDb(path.join(dir, 'test.db'));
  dbs.push(db);
  const store = new Store(db);
  const question = ResearchQuestion.parse({
    id: newId('q'), text: 'Does the stated kinetics model match its claimed closed-form solution?',
    background: '', goalType: 'explanatory',
    scope: { domain: 'physics', phenomena: ['ode verification'] }, constraints: {}, createdAt: T0,
  });
  const run = store.createRun(question);
  return { store, runId: run.id, artifacts: openArtifactStore(path.join(dir, 'artifacts')) };
};

const makeHyp = (runId: string): HypothesisCandidate =>
  HypothesisCandidate.parse({
    id: newId('hyp'), runId, version: 0, status: 'active',
    statement: 'The decay trajectory equals the claimed exponential solution.',
    mechanism: 'separation of variables',
    derivation: { strategy: 'mechanism_driven', rationale: 'fixture', inputClaimIds: [] },
    createdAt: T0,
  });

const makeSpec = (runId: string, over: Partial<OdeSpec> = {}): OdeSpec =>
  OdeSpec.parse({
    id: newId('xsp'), runId, planId: newId('pln'), planStepId: newId('task'),
    question: 'Does the IVP match the claimed closed form?',
    experimentType: 'ode_integration',
    stateVariables: [{ name: 'y', rhs: '-y', y0: 1 }],
    tSpan: [0, 5],
    method: 'DOP853',
    rtol: 1e-10,
    atol: 1e-12,
    samplePoints: 51,
    analyticalSolution: [{ name: 'y', expr: 'exp(-t)' }],
    claims: [{
      id: 'claim_1', label: 'decay equals e^-t',
      tolerance: 1e-6, thresholdProvenance: 'model-stipulated', primary: true,
    }],
    compute: { device: 'local', maxParallel: 1, timeoutMs: 300_000 },
    approvals: [],
    exploratoryNote: 'exploratory ode check — hypothesis binding requires operator approval',
    createdAt: T0,
    ...over,
  });

interface FakeResult {
  status: 'ok';
  method: string;
  rtol: number;
  atol: number;
  tSpan: [number, number];
  samplePoints: number;
  nfev: number;
  maxAbsResidual: number | null;
  rmsResidual: number | null;
  hasAnalytical: boolean;
  trajectories: Record<string, Array<number | null>>;
  nonFinitePoints: number;
}

const fakeSidecar = (script: FakeResult[]): Sidecar => {
  let i = 0;
  return {
    call: async <T>(op: string, _payload: unknown, _timeoutMs: number): Promise<SidecarCallResult<T>> => {
      if (op !== 'ode_integrate') return { ok: false, error: { kind: 'test_double', message: `unexpected op ${op}` } };
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

const okResult = (over: Partial<FakeResult> = {}): FakeResult => ({
  status: 'ok',
  method: 'DOP853',
  rtol: 1e-10,
  atol: 1e-12,
  tSpan: [0, 5],
  samplePoints: 51,
  nfev: 200,
  maxAbsResidual: 1e-9,
  rmsResidual: 1e-10,
  hasAnalytical: true,
  trajectories: { y: [1, 0.5] },
  nonFinitePoints: 0,
  ...over,
});

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('ode domain (deterministic)', () => {
  it('admits a closed RHS/analytical pair and rejects lexicon escapes', () => {
    const base = makeSpec(newId('run'));
    expect(checkOdeSpec(base, { hypothesisIds: [] }).passed).toBe(true);

    // Same legal ids throughout: the ONLY failure source must be the RHS lexicon.
    // (safeParse over the raw shape — makeSpec's parse would throw before the assertion.)
    const raw = (stateVariables: Array<{ name: string; rhs: string; y0: number }>) => {
      const b = makeSpec(newId('run'));
      return { ...b, id: newId('xsp'), stateVariables };
    };
    expect(OdeSpec.safeParse(raw([{ name: 'y', rhs: '__import__("os").system("t")', y0: 1 }])).success).toBe(false);
    expect(OdeSpec.safeParse(raw([{ name: 'y', rhs: 'z * y', y0: 1 }])).success).toBe(false);
  });

  it('no analytical solution requires noAnalyticalNote and cannot be falsified', () => {
    const spec = makeSpec(newId('run'), {
      analyticalSolution: undefined,
      noAnalyticalNote: 'plan claims no closed form — honest unfalsifiable integration',
    });
    expect(checkOdeSpec(spec, { hypothesisIds: [] }).passed).toBe(true);
    expect(odeIntegrationVerdict({ hasAnalytical: false, nonFinitePoints: 0, maxAbsResidual: null, tolerance: 1e-6 })).toBe('insufficient_data');
    expect(odeIntegrationVerdict({ hasAnalytical: true, nonFinitePoints: 0, maxAbsResidual: 1e-9, tolerance: 1e-6 })).toBe('supports');
    expect(odeIntegrationVerdict({ hasAnalytical: true, nonFinitePoints: 0, maxAbsResidual: 1e-3, tolerance: 1e-6 })).toBe('falsifies');
    expect(odeIntegrationVerdict({ hasAnalytical: true, nonFinitePoints: 3, maxAbsResidual: 0, tolerance: 1e-6 })).toBe('insufficient_data');
  });

  it('a hypothesis-bound claim without approval fails closed before any spend', async () => {
    const { store, runId } = makeEnv();
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    const spec = makeSpec(runId, {
      claims: [{ id: 'claim_1', label: 'decay equals e^-t', tolerance: 1e-6, thresholdProvenance: 'model-stipulated', primary: true, hypothesisId: hyp.id }],
      exploratoryNote: undefined,
    });
    let called = false;
    await expect(executeOdeAnalysis(store, openArtifactStore(path.join(dirs[dirs.length - 1], 'a2')), spec, {
      sidecar: () => { called = true; return fakeSidecar([]); },
    })).rejects.toThrow(/lacks a covering binding approval/);
    expect(called).toBe(false); // no sidecar spend on a fail-closed gate
  });
});

describe('ode executor (deterministic doubles, real store)', () => {
  it('mints the mechanical verdict and exploratory labelling for a bound+approved claim', async () => {
    const { store, runId, artifacts } = makeEnv();
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    const spec = makeSpec(runId, {
      claims: [{ id: 'claim_1', label: 'decay equals e^-t', tolerance: 1e-6, thresholdProvenance: 'model-stipulated', primary: true, hypothesisId: hyp.id }],
      approvals: [{ hypothesisId: hyp.id, comparisonIds: ['claim_1'], decisionRuleSnapshot: 'max|y_num-y_analytic| < 1e-6 (fixture)', approvedBy: 'op', approvedAt: T0 }],
      exploratoryNote: undefined,
    });
    const out = await executeOdeAnalysis(store, artifacts, spec, { sidecar: () => fakeSidecar([okResult()]) });
    expect(out.run.status).toBe('completed');
    expect(out.statReports).toHaveLength(1);
    expect(out.statReports[0]?.verdict).toBe('supports');
    expect(out.statReports[0]?.exploratory).toBe(false);
    expect(out.feedback).toHaveLength(1);
  });

  it('sequential re-run of the same spec hash is labelled exploratory and mints no second verdict', async () => {
    const { store, runId, artifacts } = makeEnv();
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    const spec = makeSpec(runId, {
      claims: [{ id: 'claim_1', label: 'decay equals e^-t', tolerance: 1e-6, thresholdProvenance: 'model-stipulated', primary: true, hypothesisId: hyp.id }],
      approvals: [{ hypothesisId: hyp.id, comparisonIds: ['claim_1'], decisionRuleSnapshot: 'max|y_num-y_analytic| < 1e-6 (fixture)', approvedBy: 'op', approvedAt: T0 }],
      exploratoryNote: undefined,
    });
    const sc = () => fakeSidecar([okResult()]);
    await executeOdeAnalysis(store, artifacts, spec, { sidecar: sc });
    const second = await executeOdeAnalysis(store, artifacts, spec, { sidecar: sc });
    expect(second.statReports[0]?.verdict).toBeUndefined();
    expect(second.statReports[0]?.exploratory).toBe(true);
    expect(second.feedback).toHaveLength(0);
  });

  it('a sidecar failure mints exactly one experiment_failed event', async () => {
    const { store, runId, artifacts } = makeEnv();
    const bad: Sidecar = {
      call: async () => ({ ok: false, error: { kind: 'sidecar', message: 'solver blew up' } }),
      logs: () => [],
      envInfo: () => null,
      lockfileHash: () => null,
      warmup: async () => ({ pythonVersion: 'test-double', versions: {} }),
      close: () => {},
    };
    await expect(executeOdeAnalysis(store, artifacts, makeSpec(runId), { sidecar: () => bad })).rejects.toThrow(/solver blew up/);
    const failed = store.listEvents(runId).filter((e) => e.type === 'experiment_failed');
    expect(failed).toHaveLength(1);
  });
});

describe('ode executor (real uv sidecar)', () => {
  it('decay: numerical DOP853 matches exp(-t) to preregistered tolerance (verdict=supports)', async () => {
    const { store, runId, artifacts } = makeEnv();
    const out = await executeOdeAnalysis(store, artifacts, makeSpec(runId), {
      sidecar: () => createSidecar(),
    });
    expect(out.run.status).toBe('completed');
    expect(out.statReports[0]?.verdict).toBeUndefined(); // exploratory (unbound) — no verdict minted
    expect(out.statReports[0]?.pointEstimate).toBeLessThan(1e-6);
    // integration note with trajectory artifact landed in the audit trail
    const note = store.listEvents(runId).find((e) => e.detail.kind === 'ode_integration');
    expect(note).toBeDefined();
  }, 120_000);

  it('a deliberately wrong claimed solution is falsified by the residual', async () => {
    const { store, runId, artifacts } = makeEnv();
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    const spec = makeSpec(runId, {
      analyticalSolution: [{ name: 'y', expr: 'exp(-2*t)' }], // wrong: claims faster decay
      claims: [{ id: 'claim_1', label: 'decay equals e^-2t (claimed)', tolerance: 1e-6, thresholdProvenance: 'model-stipulated', primary: true, hypothesisId: hyp.id }],
      approvals: [{ hypothesisId: hyp.id, comparisonIds: ['claim_1'], decisionRuleSnapshot: 'max|y_num-y_analytic| < 1e-6 (fixture)', approvedBy: 'op', approvedAt: T0 }],
      exploratoryNote: undefined,
    });
    const out = await executeOdeAnalysis(store, artifacts, spec, { sidecar: () => createSidecar() });
    expect(out.statReports[0]?.verdict).toBe('falsifies');
    expect(out.statReports[0]?.pointEstimate).toBeGreaterThan(1e-3);
  }, 120_000);
});
