import { describe, expect, it } from 'vitest';
import {
  SCIENTIFIC_CAPABILITY_NAMES,
  SCIENTIFIC_CAPABILITY_REGISTRY,
  listScientificCapabilities,
  resolveScientificCapability,
  scientificCapabilityCatalog,
} from '../src/domain/scientific-registry.js';
import { createSidecar } from '../src/experiment/python.js';

describe('scientific capability registry', () => {
  it('contains every operation exposed by the reviewed sidecar registry', () => {
    const expected = [
      'env_info', 'dataset_audit', 'train_eval', 'paired_stats', 'abs_stats', 'run_exploration',
      'simulate', 'identity_check', 'fem_poisson_2d', 'fem_poisson_2d_adaptive',
      'netcdf_profile', 'netcdf_extract_features', 'ode_integrate', 'bayesian_beta_binomial',
      'causal_backdoor', 'optimize_quadratic', 'data_profile', 'ols_regression', 'parquet_roundtrip',
      'hdf5_roundtrip', 'torch_train_cpu', 'torch_predict_cpu', 'torch_resume_cpu', 'dataframe_groupby', 'plot_svg', 'plot',
    ];
    expect(new Set(SCIENTIFIC_CAPABILITY_NAMES)).toEqual(new Set(expected));
    expect(SCIENTIFIC_CAPABILITY_REGISTRY).toHaveLength(expected.length);
  });

  it('requires provenance, runtime surface, limits and verification evidence for every row', () => {
    for (const capability of SCIENTIFIC_CAPABILITY_REGISTRY) {
      expect(capability.environment).toEqual({ lockfile: 'experiment-runtime/uv.lock', runtime: 'python-sidecar' });
      expect(capability.libraries.length).toBeGreaterThan(0);
      expect(capability.surfaces.length).toBeGreaterThan(0);
      expect(capability.limits.length).toBeGreaterThan(0);
      expect(capability.limitations.length).toBeGreaterThan(0);
      expect(capability.validation.evidence.length).toBeGreaterThan(0);
      expect(capability.validation.realCaller).toBe(true);
    }
  });

  it('resolves and filters by family, surface and status without mutating canonical data', () => {
    const plot = resolveScientificCapability('plot');
    expect(plot?.libraries.map((lib) => lib.name)).toContain('matplotlib');
    expect(plot?.surfaces).toContain('api');
    expect(listScientificCapabilities({ family: 'visualization', surface: 'api' }).map((x) => x.operation)).toEqual(['plot_svg', 'plot']);
    const rows = listScientificCapabilities({ status: 'verified' });
    expect(rows.length).toBeGreaterThan(10);
    rows[0]!.limits.push('caller mutation');
    expect(SCIENTIFIC_CAPABILITY_REGISTRY[0]!.limits).not.toContain('caller mutation');
  });

  it('uses pinned third-party packages and advertises the real API bridge', () => {
    for (const [operation, packageName] of [
      ['ols_regression', 'statsmodels'],
      ['parquet_roundtrip', 'pyarrow'],
      ['hdf5_roundtrip', 'h5py'],
    ] as const) {
      const capability = resolveScientificCapability(operation);
      expect(capability?.surfaces).toContain('api');
      expect(capability?.libraries.map((library) => library.name)).toContain(packageName);
      expect(capability?.libraries.find((library) => library.name === packageName)?.source).toBe('uv.lock');
    }
  });

  it('defensively copies nested fields returned by resolve', () => {
    const capability = resolveScientificCapability('ols_regression');
    expect(capability).toBeDefined();
    capability!.libraries[0]!.name = 'mutated';
    capability!.surfaces.push('domain');
    capability!.validation.evidence.push('caller mutation');
    const canonical = SCIENTIFIC_CAPABILITY_REGISTRY.find((entry) => entry.operation === 'ols_regression')!;
    expect(canonical.libraries[0]!.name).toBe('numpy');
    expect(canonical.surfaces).toHaveLength(4);
    expect(canonical.validation.evidence).not.toContain('caller mutation');
  });

  it('publishes a versioned discovery document with explicit lockfile identity', () => {
    const catalog = scientificCapabilityCatalog();
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.lockfile).toBe('experiment-runtime/uv.lock');
    expect(catalog.capabilities.some((x) => x.operation === 'run_exploration' && x.provenance === 'CANDIDATE')).toBe(true);
  });

  it('matches the live sidecar operation registry', async () => {
    const sidecar = createSidecar();
    try {
      const env = await sidecar.warmup(30_000);
      expect(env.operations).toBeDefined();
      expect(new Set(env.operations)).toEqual(new Set(SCIENTIFIC_CAPABILITY_NAMES));
    } finally {
      sidecar.close();
    }
  });
});
