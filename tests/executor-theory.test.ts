import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { HypothesisCandidate, TheorySpec, newId, ResearchQuestion, ResearchPlan } from '../src/domain/index.js';
import { executeTheoryAnalysis } from '../src/experiment/executor-theory.js';
import { executeStage } from '../src/pipeline/stages/execute.js';
import { createSidecar, type Sidecar, type SidecarCallResult } from '../src/experiment/python.js';
import type { StageContext } from '../src/pipeline/types.js';

/**
 * Slice-5 theory executor: closed-form identity verification. Deterministic
 * where possible (fake sidecar doubles, real store); the grid math itself rides
 * the REAL sidecar (uv-run family env) in the routed and true-identity cases,
 * mirroring the experiment-simulation test conventions.
 */

const T0 = '2026-08-29T00:00:00.000Z';
const dbs: Db[] = [];
const dirs: string[] = [];

const makeEnv = (): { store: Store; runId: string; artifacts: ReturnType<typeof openArtifactStore> } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-theoryexec-'));
  dirs.push(dir);
  const db = openDb(path.join(dir, 'test.db'));
  dbs.push(db);
  const store = new Store(db);
  const question = ResearchQuestion.parse({
    id: newId('q'), text: 'Does the derived transfer-function identity reduce to the stated closed form?',
    background: '', goalType: 'explanatory',
    scope: { domain: 'physics', phenomena: ['analytic identities'] }, constraints: {}, createdAt: T0,
  });
  const run = store.createRun(question);
  return { store, runId: run.id, artifacts: openArtifactStore(path.join(dir, 'artifacts')) };
};

const makeHyp = (runId: string): HypothesisCandidate =>
  HypothesisCandidate.parse({
    id: newId('hyp'), runId, version: 0, status: 'active',
    statement: 'The derived impedance expression equals the factored closed form.',
    mechanism: 'algebraic equivalence of the two derivations',
    derivation: { strategy: 'mechanism_driven', rationale: 'fixture', inputClaimIds: [] },
    createdAt: T0,
  });

const makeSpec = (runId: string, over: Partial<TheorySpec> = {}): TheorySpec =>
  TheorySpec.parse({
    id: newId('xsp'), runId, planId: newId('pln'), planStepId: newId('task'),
    question: 'Does the derived identity hold?',
    experimentType: 'theory_identity',
    variables: [{ name: 'x', low: 0, high: 6.283185307179586, n: 41 }],
    claims: [{
      id: 'claim_1', label: 'Pythagorean trigonometric identity',
      lhs: 'sin(x)**2 + cos(x)**2', rhs: '1',
      tolerance: 1e-6, thresholdProvenance: 'model-stipulated', primary: true,
    }],
    compute: { device: 'local', maxParallel: 1, timeoutMs: 300_000 },
    approvals: [],
    exploratoryNote: 'exploratory identity check — hypothesis binding requires operator approval',
    createdAt: T0,
    ...over,
  });

interface FakeResult { maxAbsResidual: number; meanAbsResidual: number; nPoints: number; nonFinitePoints: number; worstPoint: Record<string, number>; residuals: number[] }

const fakeSidecar = (script: FakeResult[]): Sidecar => {
  let i = 0;
  return {
    call: async <T>(op: string, _payload: unknown, _timeoutMs: number): Promise<SidecarCallResult<T>> => {
      if (op !== 'identity_check') return { ok: false, error: { kind: 'test_double', message: `unexpected op ${op}` } };
      const next = script[i];
      i += 1;
      if (next === undefined) return { ok: false, error: { kind: 'test_double', message: 'fake sidecar script exhausted' } };
      // 泛型测试替身：next 即按本文件唯一数据源手工构造的 T 形状
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
  maxAbsResidual: 1e-12, meanAbsResidual: 1e-13, nPoints: 41, nonFinitePoints: 0,
  worstPoint: { x: 3.1416, lhs: 1, rhs: 1 }, residuals: [0], ...over,
});

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('theory executor (deterministic doubles, real store)', () => {
  it('a bound true identity verdicts supports and feeds the hypothesis (approval covered)', async () => {
    const { store, runId, artifacts } = makeEnv();
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    const spec = makeSpec(runId, {
      claims: [{
        id: 'claim_1', label: 'Pythagorean trigonometric identity',
        lhs: 'sin(x)**2 + cos(x)**2', rhs: '1',
        tolerance: 1e-6, thresholdProvenance: 'model-stipulated', primary: true, hypothesisId: hyp.id,
      }],
      approvals: [{
        hypothesisId: hyp.id, comparisonIds: ['claim_1'],
        decisionRuleSnapshot: 'identity holds numerically on the grid',
        approvedBy: 'fixture-operator', approvedAt: T0,
      }],
    });
    const out = await executeTheoryAnalysis(store, artifacts, spec, {
      sidecar: () => fakeSidecar([okResult()]),
      now: () => T0,
    });
    expect(out.run.status).toBe('completed');
    const rep = out.statReports[0]!;
    expect(rep.metricKey).toBe('identity_max_abs_residual');
    expect(rep.test.kind).toBe('identity_grid');
    expect(rep.pointEstimate).toBe(1e-12);
    expect(rep.ci).toEqual({ level: 1, low: 1e-12, high: 1e-12 });
    expect(rep.verdict).toBe('supports');
    expect(rep.hypothesisId).toBe(hyp.id);
    expect(rep.verdictDerivation).toContain('NUMERICAL SPOT-CHECK');
    expect(rep.verdictDerivation).toContain('model-stipulated');
    expect(out.feedback).toHaveLength(1);
    expect(out.feedback[0]?.target).toEqual({ kind: 'hypothesis', id: hyp.id });
    const structured = out.feedback[0]?.structured as { kind: string; verdicts: string[] };
    expect(structured.kind).toBe('theory_identity');
    expect(structured.verdicts).toEqual(['supports']);
    expect(store.listObjects('theory_spec', runId)).toHaveLength(1);
  });

  it('a false identity verdicts falsifies (residual above tolerance)', async () => {
    const { store, runId, artifacts } = makeEnv();
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    const spec = makeSpec(runId, {
      claims: [{
        id: 'claim_1', label: 'truncation is exact (it is not)',
        lhs: 'exp(x)', rhs: '1 + x',
        tolerance: 1e-6, thresholdProvenance: 'model-stipulated', primary: true, hypothesisId: hyp.id,
      }],
      approvals: [{
        hypothesisId: hyp.id, comparisonIds: ['claim_1'],
        decisionRuleSnapshot: 'identity holds numerically on the grid',
        approvedBy: 'fixture-operator', approvedAt: T0,
      }],
    });
    const out = await executeTheoryAnalysis(store, artifacts, spec, {
      sidecar: () => fakeSidecar([okResult({ maxAbsResidual: 5.2, meanAbsResidual: 1.1 })]),
      now: () => T0,
    });
    expect(out.statReports[0]?.verdict).toBe('falsifies');
    expect(out.feedback[0]?.structured).toMatchObject({ kind: 'theory_identity', verdicts: ['falsifies'] });
  });

  it('non-finite grid points make the claim insufficient_data (the grid cannot test it)', async () => {
    const { store, runId, artifacts } = makeEnv();
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    const spec = makeSpec(runId, {
      claims: [{
        id: 'claim_1', label: 'log identity touching a singular endpoint',
        lhs: 'log(x)**2', rhs: '2 * log(x)',
        tolerance: 1e-6, thresholdProvenance: 'model-stipulated', primary: true, hypothesisId: hyp.id,
      }],
      approvals: [{
        hypothesisId: hyp.id, comparisonIds: ['claim_1'],
        decisionRuleSnapshot: 'identity holds numerically on the grid',
        approvedBy: 'fixture-operator', approvedAt: T0,
      }],
    });
    const out = await executeTheoryAnalysis(store, artifacts, spec, {
      sidecar: () => fakeSidecar([okResult({ nonFinitePoints: 1, maxAbsResidual: 3.3 })]),
      now: () => T0,
    });
    expect(out.statReports[0]?.verdict).toBe('insufficient_data');
    expect(out.statReports[0]?.verdictDerivation).toContain('1 non-finite');
  });

  it('a hypothesis-bound claim without a covering approval fails closed before any spend', async () => {
    const { store, runId, artifacts } = makeEnv();
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    const spec = makeSpec(runId, {
      claims: [{
        id: 'claim_1', label: 'unapproved bound identity',
        lhs: '1', rhs: '1',
        tolerance: 1e-6, thresholdProvenance: 'model-stipulated', primary: true, hypothesisId: hyp.id,
      }],
    });
    await expect(
      executeTheoryAnalysis(store, artifacts, spec, { sidecar: () => fakeSidecar([]), now: () => T0 }),
    ).rejects.toThrow(/lacks a covering binding approval/);
    expect(store.listObjects('experiment_run', runId).filter((r) => r.status === 'completed')).toHaveLength(0);
  });

  it('the lexical admission gate rejects free identifiers outside the grid', () => {
    const { runId } = makeEnv();
    // The admission gate lives in the TheorySpec schema itself (fail-closed at
    // parse time), so the refusal fires when the spec is built, not in the executor.
    expect(() =>
      makeSpec(runId, {
        claims: [{
          id: 'claim_1', label: 'uses an undeclared variable',
          lhs: 'x + y', rhs: 'x',
          tolerance: 1e-6, thresholdProvenance: 'model-stipulated', primary: true,
        }],
      }),
    ).toThrow(/identifier 'y'/);
  });
});

describe('theory executor (real sidecar)', () => {
  it('evaluates a true identity to a machine-epsilon residual on the real grid', async () => {
    const { store, runId, artifacts } = makeEnv();
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    const spec = makeSpec(runId, {
      claims: [{
        id: 'claim_1', label: 'Pythagorean trigonometric identity',
        lhs: 'sin(x)**2 + cos(x)**2', rhs: '1',
        tolerance: 1e-6, thresholdProvenance: 'model-stipulated', primary: true, hypothesisId: hyp.id,
      }],
      approvals: [{
        hypothesisId: hyp.id, comparisonIds: ['claim_1'],
        decisionRuleSnapshot: 'identity holds numerically on the grid',
        approvedBy: 'fixture-operator', approvedAt: T0,
      }],
    });
    const out = await executeTheoryAnalysis(store, artifacts, spec, { sidecar: createSidecar, now: () => T0 });
    expect(out.run.status).toBe('completed');
    expect(out.run.environment?.pythonVersion).not.toContain('test-double');
    expect(out.statReports[0]?.pointEstimate).toBeLessThan(1e-12);
    expect(out.statReports[0]?.verdict).toBe('supports');
    expect(out.statReports[0]?.analysisIteration).toBe(1);
  });

  it('the sidecar op refuses attribute access, unparseable input, and unknown variables', async () => {
    const sidecar = createSidecar();
    try {
      const grid = [{ name: 'x', low: 1, high: 2, n: 3 }];
      const escape = await sidecar.call('identity_check', { lhs: 'x.__class__', rhs: 'x', variables: grid }, 60_000);
      expect(escape.ok).toBe(false);
      expect(escape.error?.message).toContain('Attribute');
      const unparseable = await sidecar.call('identity_check', { lhs: 'import os', rhs: 'x', variables: grid }, 60_000);
      expect(unparseable.ok).toBe(false);
      expect(unparseable.error?.message).toContain('parse');
      const unknown = await sidecar.call('identity_check', { lhs: 'x + z', rhs: 'x', variables: grid }, 60_000);
      expect(unknown.ok).toBe(false);
      expect(unknown.error?.message).toContain('unknown variable');
    } finally {
      sidecar.close();
    }
  });
});

describe('execute stage routing: ML and literature infeasible fall through to the theory leg', () => {
  it('runs a theory identity experiment end-to-end (exploratory, real sidecar)', async () => {
    const { store, runId, artifacts } = makeEnv();
    const hyp = makeHyp(runId);
    store.putObject('hypothesis', hyp);
    const plan = ResearchPlan.parse({
      id: newId('pln'), runId, objective: 'Verify the derived closed-form identity for the transfer function.',
      hypothesisIds: [hyp.id],
      steps: [{
        id: newId('task'), title: 'check the derived identity', kind: 'data_analysis',
        method: 'evaluate both sides of the claimed identity numerically and compare',
        failureConditions: ['expressions do not evaluate'],
      }],
      metrics: ['identity_max_abs_residual'],
      decisionRules: {
        successCriterion: 'max residual below tolerance',
        weakeningCriterion: 'residual near tolerance',
        falsificationCriterion: 'max residual above tolerance',
        stopCriterion: 'identity checked once',
      },
      createdAt: T0,
    });
    store.putObject('plan', plan);

    const provider = createTestStubProvider([
      { forPurpose: 'experiment-spec-draft', rawOutput: JSON.stringify({ feasible: false, skipReason: 'no tabular dataset maps to a symbolic derivation check' }) },
      { forPurpose: 'meta-spec-draft', rawOutput: JSON.stringify({ feasible: false, skipReason: 'no published effect estimates to pool for a derivation question' }) },
      {
        forPurpose: 'theory-spec-draft',
        rawOutput: JSON.stringify({
          feasible: true,
          variables: [{ name: 'x', low: 0, high: 6.283185307179586 }],
          claims: [
            { label: 'Pythagorean identity', lhs: 'sin(x)**2 + cos(x)**2', rhs: '1' },
            { label: 'Second-order truncation of exp', lhs: 'exp(x)', rhs: '1 + x + x**2 / 2' },
          ],
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
    expect(out.kind === 'done' && out.summary).toContain('theory identity experiment');
    expect(out.kind === 'done' && out.summary).toContain('numerical spot-check');

    const runs = store.listObjects('experiment_run', runId).filter((r) => r.status === 'completed');
    expect(runs).toHaveLength(1);
    const reports = store.listObjects('stat_report', runId);
    expect(reports).toHaveLength(2);
    const byClaim = new Map(reports.map((r) => [r.comparisonId, r]));
    expect(byClaim.get('claim_1')?.pointEstimate).toBeLessThan(1e-12);
    expect(byClaim.get('claim_2')?.pointEstimate).toBeGreaterThan(1);
    // exploratory draft: no hypothesis binding, no verdicts, no feedback
    expect(reports.every((r) => r.verdict === undefined)).toBe(true);
    expect(store.listObjects('feedback', runId)).toHaveLength(0);
    expect(store.listObjects('theory_spec', runId)).toHaveLength(1);
  });
});
