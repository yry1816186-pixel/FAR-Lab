import { describe, expect, it } from 'vitest';
import { uvAvailable } from './helpers/uv-gate.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { executeSimulationExperiment, simulationSpecHash } from '../src/experiment/executor-simulation.js';
import { createSidecar } from '../src/experiment/python.js';
import {
  ResearchQuestion, HypothesisCandidate, newId, SimulationSpec, checkSimulationSpec,
  type SimulationSpec as SimSpecT,
} from '../src/domain/index.js';

/**
 * R2-10 simulation workload: preregistered Monte-Carlo specs -> seeded per-replicate
 * outcomes on the REAL sidecar -> the shared confirmatory statistics chain (abs_stats /
 * paired_stats -> mechanical verdict -> feedback). CRN discipline: paired comparisons
 * require identical RNG stream shape (family/seed/replicates/statistic), parameter-only
 * differences — enforced by the validator, honoured by the op (transform-after-draw).
 */

const RUN_ID = newId('run');
const HYP_ID = newId('hyp');

const makeStore = (): { store: Store; artifacts: ReturnType<typeof openArtifactStore>; dir: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), 'farlab-sim-'));
  const db = openDb(join(dir, 't.db'));
  return {
    store: new Store(db),
    artifacts: openArtifactStore(join(dir, 'artifacts')),
    dir,
    cleanup: () => {
      try { db.close(); } catch { /* already closed */ }
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows lag */ }
    },
  };
};

const makeRun = (store: Store): string => {
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'does shifting the process mean by +1 shift the steady-state mean estimate by ~1?',
    background: '', goalType: 'explanatory', scope: { domain: 'simulation', phenomena: ['monte-carlo'] },
    constraints: { assumptions: [] }, createdAt: new Date().toISOString(),
  });
  store.createRun(q);
  return store.listRuns(1)[0]!.id;
};

const makeHypothesis = (store: Store, runId: string) => {
  const hyp = HypothesisCandidate.parse({
    id: newId('hyp'), runId, version: 0,
    statement: 'mean of N(1,1) exceeds mean of N(0,1) by more than 0.5 under common random numbers',
    derivation: { strategy: 'evidence_conditioned', rationale: 'fixture' },
    createdAt: new Date().toISOString(),
  });
  store.putObject('hypothesis', hyp);
  return hyp;
};

const pairedSpec = (runId: string, hypothesisId: string): SimSpecT => SimulationSpec.parse({
  id: newId('xsp'),
  runId,
  planId: newId('pln'),
  planStepId: newId('task'),
  version: 1,
  question: 'CRN paired mean shift',
  configs: [
    { name: 'mu0', template: 'monte_carlo', distribution: { family: 'normal', mu: 0, sigma: 1 }, statistic: 'mean', replicates: 2000, seed: 99 },
    { name: 'mu1', template: 'monte_carlo', distribution: { family: 'normal', mu: 1, sigma: 1 }, statistic: 'mean', replicates: 2000, seed: 99 },
  ],
  comparisons: [{
    id: 'cmp-crn', statistic: 'mean', kind: 'paired_diff',
    configAIdx: 1, configBIdx: 0, direction: 'above', threshold: 0.5,
    thresholdProvenance: 'model-stipulated', hypothesisId,
    primary: true, mde: 0.2,
  }],
  statistics: { test: 'paired_bootstrap_ci', alpha: 0.05, nBoot: 500, analysisSeed: 11, ciLevel: 0.95 },
  compute: { device: 'local', maxParallel: 1, timeoutMs: 120_000 },
  approvals: [{
    hypothesisId,
    comparisonIds: ['cmp-crn'],
    decisionRuleSnapshot: 'CRN mean difference above 0.5',
    approvedBy: 'test-operator', approvedAt: new Date().toISOString(),
  }],
  createdAt: new Date().toISOString(),
});

// ---- unit: validator gates (pure TS) ----

describe('R2-10 simulation spec validation', () => {
  const base = (mutation: (s: SimSpecT) => void): SimSpecT => {
    const s = pairedSpec(RUN_ID, HYP_ID);
    mutation(s);
    return s;
  };

  it('accepts the CRN-compatible paired spec', () => {
    const r = checkSimulationSpec(pairedSpec(RUN_ID, HYP_ID), { hypothesisIds: [HYP_ID] });
    expect(r.missing).toEqual([]);
    expect(r.passed).toBe(true);
  });

  it('rejects paired comparisons across different seeds (CRN violation)', () => {
    const spec = base((s) => { s.configs[1]!.seed = 100; });
    const r = checkSimulationSpec(spec, { hypothesisIds: [HYP_ID] });
    expect(r.missing.join(' ')).toContain('common random numbers');
  });

  it('rejects paired comparisons across different families', () => {
    const spec = base((s) => {
      s.configs[1] = { ...s.configs[1]!, distribution: { family: 'uniform', low: 0, high: 2 } };
    });
    const r = checkSimulationSpec(spec, { hypothesisIds: [HYP_ID] });
    expect(r.missing.join(' ')).toContain('common random numbers');
  });

  it('rejects statistic mismatch between comparison and config', () => {
    const spec = base((s) => {
      s.configs = s.configs.map((c) => ({ ...c, statistic: 'variance' as const, blockSize: 16 }));
      s.comparisons[0]!.statistic = 'mean';
    });
    const r = checkSimulationSpec(spec, { hypothesisIds: [HYP_ID] });
    expect(r.missing.join(' ')).toContain('does not match config statistic');
  });

  it('rejects bound comparisons without approval or mde, and applies the [0,1] floor to threshold_prob', () => {
    const noApproval = base((s) => { s.approvals = []; });
    const rA = checkSimulationSpec(noApproval, { hypothesisIds: [HYP_ID] });
    expect(rA.missing.join(' ')).toContain('lacks a binding approval');

    const noMde = base((s) => { s.comparisons[0]!.mde = undefined; });
    const rM = checkSimulationSpec(noMde, { hypothesisIds: [HYP_ID] });
    expect(rM.missing.join(' ')).toContain('declares no mde');

    const floorSpec = base((s) => {
      s.configs = s.configs.map((c) => ({ ...c, statistic: 'threshold_prob' as const, threshold: 0 }));
      s.comparisons[0] = { ...s.comparisons[0]!, statistic: 'threshold_prob', mde: 0.001 };
    });
    const rF = checkSimulationSpec(floorSpec, { hypothesisIds: [HYP_ID] });
    expect(rF.missing.join(' ')).toContain('below the attainability floor');
  });

  it('schema gates: variance needs blockSize, threshold_prob needs threshold, uniform high>low, exploratory needs a note', () => {
    expect(() => SimulationSpec.parse({
      ...pairedSpec(RUN_ID, HYP_ID),
      configs: [{ name: 'a', template: 'monte_carlo', distribution: { family: 'normal', mu: 0, sigma: 1 }, statistic: 'variance', replicates: 100, seed: 1 }],
    })).toThrow(/variance requires blockSize/);

    expect(() => SimulationSpec.parse({
      ...pairedSpec(RUN_ID, HYP_ID),
      configs: [{ name: 'a', template: 'monte_carlo', distribution: { family: 'normal', mu: 0, sigma: 1 }, statistic: 'threshold_prob', replicates: 100, seed: 1 }],
    })).toThrow(/threshold_prob requires threshold/);

    expect(() => SimulationSpec.parse({
      ...pairedSpec(RUN_ID, HYP_ID),
      configs: [{ name: 'a', template: 'monte_carlo', distribution: { family: 'uniform', low: 2, high: 1 }, statistic: 'mean', replicates: 100, seed: 1 }],
    })).toThrow(/high must exceed low/);

    const unbound = base((s) => {
      s.comparisons[0]!.hypothesisId = undefined;
      s.approvals = [];
    });
    const r = checkSimulationSpec(unbound, { hypothesisIds: [] });
    expect(r.missing.join(' ')).toContain('no hypothesis-bound comparison and no exploratoryNote');
  });
});

// ---- E2E: real sidecar simulation runs ----

describe('R2-10 simulation executor end-to-end (real uv sidecar)', () => {
  it.runIf(uvAvailable())('CRN paired chain: simulate -> paired_stats -> mechanical verdict -> feedback', async () => {
    const w = makeStore();
    try {
      const runId = makeRun(w.store);
      const hyp = makeHypothesis(w.store, runId);
      const spec = pairedSpec(runId, hyp.id);

      const out = await executeSimulationExperiment(w.store, w.artifacts, spec);

      expect(out.run.status).toBe('completed');
      expect(out.run.environment?.hardware?.system).toBeTruthy();
      // CRN with an affine family: per-replicate diff is CONSTANT (1.0) -> degenerate CI [1,1]
      const report = out.statReports.find((r) => r.comparisonId === 'cmp-crn')!;
      expect(report.metricKey).toBe('sim_mean');
      expect(report.pointEstimate).toBeCloseTo(1.0, 10);
      expect(report.ci.low).toBeCloseTo(1.0, 10);
      expect(report.ci.high).toBeCloseTo(1.0, 10);
      expect(report.verdict).toBe('supports');
      expect(out.feedback.length).toBe(1);
      expect(out.feedback[0]!.target?.id).toBe(hyp.id);
      expect((out.feedback[0]!.structured as { perReplicateRefs?: string[] }).perReplicateRefs).toHaveLength(2);
      // per-replicate artifacts are retrievable
      const rows = JSON.parse((await w.artifacts.get(out.perReplicateRefs[0]!))!) as number[];
      expect(rows).toHaveLength(2000);
    } finally {
      w.cleanup();
    }
  }, 180_000);

  it.runIf(uvAvailable())('absolute threshold_prob: MC probability estimate with honest CI (exploratory)', async () => {
    const w = makeStore();
    try {
      const runId = makeRun(w.store);
      // P(N(1.2,1) > 0) = Phi(1.2) ~= 0.8849
      const spec = SimulationSpec.parse({
        ...pairedSpec(runId, HYP_ID),
        configs: [{ name: 'probe', template: 'monte_carlo', distribution: { family: 'normal', mu: 1.2, sigma: 1 }, statistic: 'threshold_prob', threshold: 0, replicates: 4000, seed: 7 }],
        comparisons: [{
          id: 'cmp-abs', statistic: 'threshold_prob', kind: 'absolute', configIdx: 0,
          direction: 'above', threshold: 0.8, thresholdProvenance: 'model-stipulated',
          primary: true,
        }],
        approvals: [],
        exploratoryNote: 'exploratory MC probability probe',
      });
      const out = await executeSimulationExperiment(w.store, w.artifacts, spec);
      expect(out.run.status).toBe('completed');
      const report = out.statReports[0]!;
      expect(report.metricKey).toBe('sim_threshold_prob');
      expect(report.pointEstimate).toBeGreaterThan(0.85);
      expect(report.pointEstimate).toBeLessThan(0.92);
      expect(report.ci.low).toBeGreaterThan(0.8);
      expect(report.verdict).toBeUndefined(); // exploratory: verdict-capable only when bound
      expect(report.exploratory).toBe(true);
      expect(out.feedback).toHaveLength(0);
    } finally {
      w.cleanup();
    }
  }, 180_000);

  it.runIf(uvAvailable())('variance statistic: block estimator converges to sigma^2', async () => {
    const w = makeStore();
    try {
      const runId = makeRun(w.store);
      const spec = SimulationSpec.parse({
        ...pairedSpec(runId, HYP_ID),
        configs: [{ name: 'var4', template: 'monte_carlo', distribution: { family: 'normal', mu: 5, sigma: 2 }, statistic: 'variance', blockSize: 64, replicates: 1000, seed: 13 }],
        comparisons: [{
          id: 'cmp-var', statistic: 'variance', kind: 'absolute', configIdx: 0,
          direction: 'below', threshold: 5, thresholdProvenance: 'model-stipulated',
          primary: true,
        }],
        approvals: [],
        exploratoryNote: 'exploratory variance convergence probe',
      });
      const out = await executeSimulationExperiment(w.store, w.artifacts, spec);
      const report = out.statReports[0]!;
      expect(report.pointEstimate).toBeGreaterThan(3.5);
      expect(report.pointEstimate).toBeLessThan(4.5);
    } finally {
      w.cleanup();
    }
  }, 180_000);

  it.runIf(uvAvailable())('determinism: identical (spec, seed) reproduces identical per-replicate arrays', async () => {
    const perReplicates: number[][] = [];
    for (let round = 0; round < 2; round += 1) {
      const w = makeStore();
      try {
        const runId = makeRun(w.store);
        const hyp = makeHypothesis(w.store, runId);
        const out = await executeSimulationExperiment(w.store, w.artifacts, pairedSpec(runId, hyp.id));
        perReplicates.push(JSON.parse((await w.artifacts.get(out.perReplicateRefs[0]!))!) as number[]);
      } finally {
        w.cleanup();
      }
    }
    expect(perReplicates[0]).toEqual(perReplicates[1]);
  }, 240_000);

  it.runIf(uvAvailable())('sequential-analysis guard: a second statistical pass on the same run is labelled exploratory', async () => {
    const w = makeStore();
    try {
      const runId = makeRun(w.store);
      const hyp = makeHypothesis(w.store, runId);
      const spec = pairedSpec(runId, hyp.id);
      const first = await executeSimulationExperiment(w.store, w.artifacts, spec);
      expect(first.statReports[0]!.exploratory).toBe(false);
      const second = await executeSimulationExperiment(w.store, w.artifacts, spec);
      expect(second.statReports[0]!.exploratory).toBe(true);
      expect(second.statReports[0]!.analysisIteration).toBe(2);
      expect(second.feedback).toHaveLength(0);
    } finally {
      w.cleanup();
    }
  }, 240_000);

  it.runIf(uvAvailable())('sidecar op honesty: unknown template fails loudly with error kind', async () => {
    const sidecar = createSidecar();
    try {
      const r = await sidecar.call('simulate', { template: 'agent_based', replicates: 10, seed: 1 }, 30_000);
      expect(r.ok).toBe(false);
      expect(r.error?.message).toContain("unknown simulation template 'agent_based'");
    } finally {
      sidecar.close();
    }
  }, 60_000);
});

describe('R2-10 simulation spec hash', () => {
  it('hashes canonical serialization: deep key order does not change the hash', () => {
    const shuffle = (o: unknown): unknown => {
      if (Array.isArray(o)) return o.map(shuffle);
      if (o !== null && typeof o === 'object') {
        return Object.fromEntries(Object.entries(o as Record<string, unknown>).reverse().map(([k, v]) => [k, shuffle(v)]));
      }
      return o;
    };
    const spec = pairedSpec(RUN_ID, HYP_ID);
    const reordered = shuffle(spec) as SimSpecT;
    expect(simulationSpecHash(spec)).toBe(simulationSpecHash(reordered));
  });
});
