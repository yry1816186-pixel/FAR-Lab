import { describe, expect, it } from 'vitest';
import {
  bayesianBetaBinomial,
  causalBackdoorAdjustment,
  optimizeQuadratic,
  runScientificCompute,
  profileData,
  plotSvg,
} from '../src/domain/scientific-compute.js';
import { executeScientificCompute } from '../src/experiment/scientific-compute.js';

describe('scientific compute primitives', () => {
  it('updates a Beta prior and returns a bounded credible interval', () => {
    const out = bayesianBetaBinomial({ priorAlpha: 1, priorBeta: 1, successes: 8, trials: 10, credibleLevel: 0.95 });
    expect(out.posteriorAlpha).toBe(9);
    expect(out.posteriorBeta).toBe(3);
    expect(out.mean).toBeCloseTo(0.75, 12);
    expect(out.credibleInterval.low).toBeGreaterThan(0);
    expect(out.credibleInterval.high).toBeLessThan(1);
    expect(out.credibleInterval.low).toBeLessThan(out.mean);
    expect(out.credibleInterval.high).toBeGreaterThan(out.mean);
    expect(out.provenance).toBe('COMPUTED');
  });

  it('fails closed when successes exceed trials', () => {
    expect(() => bayesianBetaBinomial({ priorAlpha: 1, priorBeta: 1, successes: 3, trials: 2 })).toThrow(/successes cannot exceed trials/);
  });

  it('computes standardized backdoor contrasts across confounder strata', () => {
    const out = causalBackdoorAdjustment({
      treatment: [1, 1, 0, 0, 1, 0],
      outcome: [4, 6, 2, 3, 10, 8],
      confounder: ['young', 'young', 'young', 'young', 'old', 'old'],
    });
    // young contrast = 2.5, old contrast = 2, weighted by 4/6 and 2/6.
    expect(out.effect).toBeCloseTo(2.333333333333333, 12);
    expect(out.strata).toHaveLength(2);
    expect(out.assumptions).toContain('positivity within every confounder stratum');
    expect(out.provenance).toBe('COMPUTED');
  });

  it('rejects strata without treatment overlap', () => {
    expect(() => causalBackdoorAdjustment({
      treatment: [1, 1, 0, 0], outcome: [1, 2, 3, 4], confounder: ['a', 'a', 'b', 'b'],
    })).toThrow(/lacks both treatment groups/);
  });

  it('converges on a convex quadratic optimum', () => {
    const out = optimizeQuadratic({
      matrix: [[2, 0], [0, 4]], linear: [-4, 8], initial: [0, 0], learningRate: 0.1, maxIterations: 1000, tolerance: 1e-10,
    });
    expect(out.status).toBe('converged');
    expect(out.solution[0]).toBeCloseTo(2, 6);
    expect(out.solution[1]).toBeCloseTo(-2, 6);
    expect(out.gradientNorm).toBeLessThan(1e-8);
  });

  it('dispatches only registered deterministic operations', () => {
    const out = runScientificCompute({ operation: 'bayesian_beta_binomial', input: { priorAlpha: 1, priorBeta: 1, successes: 1, trials: 2 } });
    expect(out.provenance).toBe('COMPUTED');
  });

  it('profiles mixed tabular data with numeric summaries and missingness', () => {
    const out = profileData({
      columns: ['temperature', 'site'],
      rows: [[1, 'A'], [2, 'A'], [null, 'B'], [100, 'B']],
    });
    expect(out.provenance).toBe('COMPUTED');
    expect(out.rows).toBe(4);
    expect((out.columns as Array<{ name: string; type: string; missing: number; outliers?: number }>)[0]).toMatchObject({ name: 'temperature', type: 'numeric', missing: 1, outliers: 1 });
    expect((out.columns as Array<{ name: string; type: string }>)[1]).toMatchObject({ name: 'site', type: 'categorical' });
  });

  it('does not substitute a preview renderer or fall through for sidecar-only operations', () => {
    expect(() => runScientificCompute({ operation: 'plot', input: { kind: 'line', x: [0, 1], y: [1, 2], format: 'png' } }))
      .toThrow('plot requires the Python scientific sidecar');
    expect(() => runScientificCompute({ operation: 'torch_train_cpu', input: { features: [[0], [1]], targets: [0, 1] } }))
      .toThrow('torch_train_cpu requires the Python scientific sidecar');
  });

  it('generates deterministic SVG plots with content hash', () => {
    const out = plotSvg({ kind: 'line', x: [0, 1, 2], y: [1, 3, 2], title: 'signal' });
    expect(out.format).toBe('svg');
    expect(out.provenance).toBe('COMPUTED');
    expect(String(out.svg)).toContain('<polyline');
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(out.bytes).toBeGreaterThan(100);
  });

  it('rejects mismatched plot dimensions', () => {
    expect(() => plotSvg({ kind: 'scatter', x: [1], y: [1, 2] })).toThrow(/equal length/);
  });

  it('bridges production calls through the sidecar operation contract', async () => {
    let closed = false;
    const result = await executeScientificCompute(
      { operation: 'optimize_quadratic', input: { matrix: [[2]], linear: [-4], initial: [0] } },
      {
        sidecar: () => ({
          warmup: async () => ({ pythonVersion: 'test', versions: {} }),
          call: async () => ({ ok: true, result: { provenance: 'COMPUTED', solution: [2] } }),
          logs: () => [], envInfo: () => null, lockfileHash: () => 'lock-test', close: () => { closed = true; },
        }),
      },
    );
    expect(result).toMatchObject({ provenance: 'COMPUTED', solution: [2], runtime: { pythonVersion: 'test', lockfileHash: 'lock-test' } });
    expect(closed).toBe(true);
  });
});
