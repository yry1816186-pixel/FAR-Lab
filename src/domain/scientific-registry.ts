import { z } from 'zod';

/**
 * Machine-readable inventory for the scientific execution plane.
 *
 * This registry describes the capability contract, not merely the Python
 * function names. Runtime package versions are attached to every sidecar
 * result by `executeScientificCompute`; the requirements below are the
 * declared constraints from `experiment-runtime/pyproject.toml`, resolved by
 * `experiment-runtime/uv.lock`.
 */

export const ScientificCapabilitySurface = z.enum(['api', 'experiment', 'sidecar', 'domain']);
export type ScientificCapabilitySurface = z.infer<typeof ScientificCapabilitySurface>;

export const ScientificCapabilityStatus = z.enum(['verified', 'implemented', 'partial', 'unverified', 'blocked']);
export type ScientificCapabilityStatus = z.infer<typeof ScientificCapabilityStatus>;

export const ScientificCapabilityProvenance = z.enum(['COMPUTED', 'CANDIDATE', 'UNVERIFIED']);
export type ScientificCapabilityProvenance = z.infer<typeof ScientificCapabilityProvenance>;

const ScientificLibrary = z.object({
  /** Distribution name as it appears in pyproject/uv.lock. */
  name: z.string().min(1),
  /** Requirement declared by the sidecar project, for example `numpy>=2,<3`. */
  requirement: z.string().min(1),
  /** How the dependency is selected at runtime. */
  source: z.enum(['uv.lock', 'stdlib', 'farlab']),
});

const ScientificValidation = z.object({
  status: ScientificCapabilityStatus,
  /** Test or smoke evidence paths; an empty list is not a valid claim of verification. */
  evidence: z.array(z.string().min(1)).min(1),
  /** Whether the operation has a real caller on the declared surface. */
  realCaller: z.boolean(),
});

export const ScientificCapability = z.object({
  operation: z.string().regex(/^[a-z][a-z0-9_]*$/),
  family: z.string().min(1),
  description: z.string().min(1),
  libraries: z.array(ScientificLibrary).min(1),
  surfaces: z.array(ScientificCapabilitySurface).min(1),
  provenance: ScientificCapabilityProvenance,
  validation: ScientificValidation,
  /** Deterministic input/resource restrictions. These are user-visible contract. */
  limits: z.array(z.string().min(1)).min(1),
  /** Explicit boundary prevents a registry row from implying universal coverage. */
  limitations: z.array(z.string().min(1)).min(1),
  /** Lockfile is part of the reproducibility identity for sidecar operations. */
  environment: z.object({
    lockfile: z.literal('experiment-runtime/uv.lock'),
    runtime: z.literal('python-sidecar'),
  }),
});
export type ScientificCapability = z.infer<typeof ScientificCapability>;

const np = { name: 'numpy', requirement: 'numpy>=2.0,<3', source: 'uv.lock' } as const;
const scipy = { name: 'scipy', requirement: 'scipy>=1.14,<2', source: 'uv.lock' } as const;
const sklearn = { name: 'scikit-learn', requirement: 'scikit-learn>=1.5,<2', source: 'uv.lock' } as const;
const pandas = { name: 'pandas', requirement: 'pandas>=3,<4', source: 'uv.lock' } as const;
const matplotlib = { name: 'matplotlib', requirement: 'matplotlib>=3.9,<4', source: 'uv.lock' } as const;
const cleanlab = { name: 'cleanlab', requirement: 'cleanlab>=2.6,<3', source: 'uv.lock' } as const;
const sympy = { name: 'sympy', requirement: 'sympy>=1.14.0', source: 'uv.lock' } as const;
const xarray = { name: 'xarray', requirement: 'xarray>=2026.7.0', source: 'uv.lock' } as const;
const netcdf4 = { name: 'netcdf4', requirement: 'netcdf4>=1.7.4', source: 'uv.lock' } as const;
const torch = { name: 'torch', requirement: 'torch>=2.4,<3', source: 'uv.lock' } as const;
const statsmodels = { name: 'statsmodels', requirement: 'statsmodels>=0.14,<1', source: 'uv.lock' } as const;
const pyarrow = { name: 'pyarrow', requirement: 'pyarrow>=18,<23', source: 'uv.lock' } as const;
const h5py = { name: 'h5py', requirement: 'h5py>=3.12,<4', source: 'uv.lock' } as const;
const stdlib = { name: 'python-stdlib', requirement: 'Python>=3.11', source: 'stdlib' } as const;
const farlab = (name: string) => ({ name, requirement: 'farlab-experiment-runtime==0.1.0', source: 'farlab' } as const);

type RegistryRow = ScientificCapability;

const row = (
  value: Omit<RegistryRow, 'environment'>,
): RegistryRow => ScientificCapability.parse({
  ...value,
  environment: { lockfile: 'experiment-runtime/uv.lock', runtime: 'python-sidecar' },
});

const sidecarOnly: ScientificCapabilitySurface[] = ['sidecar', 'experiment'];
const apiAndSidecar: ScientificCapabilitySurface[] = ['api', 'experiment', 'sidecar', 'domain'];

/**
 * Canonical registry. Keep this list aligned with `farlab_experiment_runtime.ops.OPS`.
 * `env_info` is an internal health/provenance operation and is intentionally not
 * accepted by the public compute request schema, while still being discoverable.
 */
export const SCIENTIFIC_CAPABILITY_REGISTRY: readonly RegistryRow[] = Object.freeze([
  row({
    operation: 'env_info', family: 'runtime-provenance',
    description: 'Reports Python, package and hardware identity for a sidecar session.',
    libraries: [stdlib, np, scipy, sklearn, pandas, matplotlib], surfaces: ['sidecar'],
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['experiment-runtime/farlab_experiment_runtime/ops.py:op_env_info', 'tests/scientific-compute.test.ts'], realCaller: true },
    limits: ['One local sidecar process; no network or remote environment discovery.'],
    limitations: ['Package versions are measured at warmup; this is not a hardware benchmark.'],
  }),
  row({
    operation: 'bayesian_beta_binomial', family: 'statistics',
    description: 'Posterior mean, variance and central credible interval for binomial observations.',
    libraries: [np, scipy], surfaces: apiAndSidecar,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/scientific-compute.test.ts', 'tests/api.test.ts'], realCaller: true },
    limits: ['Finite positive prior parameters; successes <= trials; credible level in (0,1).'],
    limitations: ['Conjugate beta-binomial only; no hierarchical or MCMC inference.'],
  }),
  row({
    operation: 'causal_backdoor', family: 'causal-inference',
    description: 'Standardized mean contrast across observed confounder strata.',
    libraries: [np], surfaces: apiAndSidecar,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/scientific-compute.test.ts', 'tests/api.test.ts'], realCaller: true },
    limits: ['Finite equal-length arrays; every stratum must contain both treatment groups.'],
    limitations: ['Observational adjustment does not establish exchangeability; assumptions are returned explicitly.'],
  }),
  row({
    operation: 'optimize_quadratic', family: 'optimization',
    description: 'Bounded gradient optimization for a symmetric quadratic objective.',
    libraries: [np, scipy], surfaces: apiAndSidecar,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/scientific-compute.test.ts', 'tests/api.test.ts'], realCaller: true },
    limits: ['Square symmetric matrix; finite vectors; maxIterations <= 100000.'],
    limitations: ['Quadratic objective only; positive definiteness and global optimality are not inferred.'],
  }),
  row({
    operation: 'data_profile', family: 'data-processing',
    description: 'Profiles mixed tabular values with missingness, cardinality, distribution and IQR outliers.',
    libraries: [np, farlab('farlab.data_profile.v1')], surfaces: apiAndSidecar,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/scientific-compute.test.ts', 'tests/api.test.ts'], realCaller: true },
    limits: ['At most 100000 rows and 200 columns; JSON scalar cells only.'],
    limitations: ['No type inference beyond numeric/categorical and no external dataframe storage.'],
  }),
  row({
    operation: 'ols_regression', family: 'statistics',
    description: 'Ordinary least-squares regression with coefficient and fit diagnostics from the pinned Python sidecar.',
    libraries: [np, scipy, statsmodels], surfaces: apiAndSidecar,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/api.test.ts', 'experiment-runtime/farlab_experiment_runtime/scientific.py'], realCaller: true },
    limits: ['At least three finite observations; bounded feature width and row count.'],
    limitations: ['Linear OLS only; no automatic causal interpretation, robust covariance selection or model search.'],
  }),
  row({
    operation: 'parquet_roundtrip', family: 'scientific-data',
    description: 'Deterministic tabular serialization/read-back with Parquet metadata and checksum facts.',
    libraries: [pyarrow], surfaces: apiAndSidecar,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/api.test.ts', 'experiment-runtime/farlab_experiment_runtime/scientific.py'], realCaller: true },
    limits: ['At most 200 columns and 100000 JSON scalar rows; sidecar-local temporary artifact.'],
    limitations: ['Round-trip validation is not a distributed data-lake or schema evolution service.'],
  }),
  row({
    operation: 'hdf5_roundtrip', family: 'scientific-data',
    description: 'Deterministic numeric HDF5 dataset serialization/read-back with checksum facts.',
    libraries: [np, h5py], surfaces: apiAndSidecar,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/api.test.ts', 'experiment-runtime/farlab_experiment_runtime/scientific.py'], realCaller: true },
    limits: ['Dataset names are restricted to the safe path grammar; at most 1000000 finite values.'],
    limitations: ['Single local dataset round-trip; no arbitrary groups, compression tuning or remote object storage.'],
  }),
  row({
    operation: 'torch_train_cpu', family: 'machine-learning',
    description: 'Deterministic CPU-only PyTorch MLP regression with reloadable checkpoint and loss verification.',
    libraries: [torch, np], surfaces: apiAndSidecar,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['experiment-runtime/tests/test_scientific.py', 'tests/api.test.ts'], realCaller: true },
    limits: ['2..100000 rows; 1..256 input features; epochs <= 5000; CPU device only.'],
    limitations: ['Regression MLP only; no GPU, distributed training, mixed precision or automatic hyperparameter search.'],
  }),
  row({
    operation: 'torch_predict_cpu', family: 'machine-learning',
    description: 'Loads a verified PyTorch CPU checkpoint and produces deterministic predictions with optional evaluation.',
    libraries: [torch, np], surfaces: apiAndSidecar,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['experiment-runtime/farlab_experiment_runtime/torch_ops.py', 'experiment-runtime/tests/test_scientific.py'], realCaller: true },
    limits: ['Checkpoint <= 8 MiB with SHA-256; 1..100000 rows; features must match checkpoint architecture.'],
    limitations: ['CPU inference only; no batch streaming, quantization or model registry.'],
  }),
  row({
    operation: 'torch_resume_cpu', family: 'machine-learning',
    description: 'Resumes CPU PyTorch MLP training from a verified checkpoint including optimizer state.',
    libraries: [torch, np], surfaces: apiAndSidecar,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['experiment-runtime/farlab_experiment_runtime/torch_ops.py', 'experiment-runtime/tests/test_scientific.py'], realCaller: true },
    limits: ['Checkpoint <= 8 MiB with SHA-256; bounded rows, epochs and work budget; architecture must match.'],
    limitations: ['Regression MLP only; training data identity is not independently attested in this operation.'],
  }),
  row({
    operation: 'dataframe_groupby', family: 'data-processing',
    description: 'Pandas group-by count and mean over a declared value column.',
    libraries: [pandas], surfaces: apiAndSidecar,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/scientific-compute.test.ts', 'tests/api.test.ts'], realCaller: true },
    limits: ['At most 100000 rows; groupBy and valueColumn must be declared; value column must contain numeric values.'],
    limitations: ['Only count and mean aggregation; no joins, window functions or persisted dataframe.'],
  }),
  row({
    operation: 'plot_svg', family: 'visualization',
    description: 'Deterministic dependency-light SVG line, scatter, histogram and bar renderer.',
    libraries: [stdlib, farlab('farlab.plot_svg.v1')], surfaces: apiAndSidecar,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/scientific-compute.test.ts', 'tests/api.test.ts'], realCaller: true },
    limits: ['SVG dimensions 160..2400 x 120..1600; finite numeric arrays; histogram bins 2..100.'],
    limitations: ['Preview renderer has no publication layout, statistical annotations or vector font embedding.'],
  }),
  row({
    operation: 'plot', family: 'visualization',
    description: 'Matplotlib Agg line, scatter, histogram and bar plots as SVG or PNG artifacts.',
    libraries: [matplotlib, np], surfaces: apiAndSidecar,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/scientific-compute.test.ts', 'tests/api.test.ts'], realCaller: true },
    limits: ['Headless Agg backend; SVG/PNG output; dimensions 160..2400 x 120..1600; bins 2..100.'],
    limitations: ['No interactive Plotly surface, LaTeX installation or journal-specific style validation.'],
  }),
  row({
    operation: 'train_eval', family: 'machine-learning',
    description: 'Leak-safe tabular model training and preregistered metric evaluation.',
    libraries: [np, sklearn, scipy], surfaces: sidecarOnly,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/experiment.test.ts', 'tests/campaign-runtime.test.ts'], realCaller: true },
    limits: ['CSV input path must be bounded by the experiment runner; reviewed builders and explicit seed only.'],
    limitations: ['Tabular estimators only; no deep-learning, GPU or distributed training.'],
  }),
  row({
    operation: 'dataset_audit', family: 'data-quality',
    description: 'Checks duplicates, train/test leakage and label-issue rates before evaluation.',
    libraries: [np, sklearn, cleanlab], surfaces: sidecarOnly,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/dataset-audit.test.ts'], realCaller: true },
    limits: ['Bounded tabular train/test inputs; deterministic seed; no automatic data mutation.'],
    limitations: ['Findings are advisory quality signals and do not prove causal data validity.'],
  }),
  row({
    operation: 'paired_stats', family: 'statistics',
    description: 'Paired tests and bootstrap confidence intervals over paired outcomes.',
    libraries: [np, scipy], surfaces: sidecarOnly,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/experiment.test.ts'], realCaller: true },
    limits: ['Finite paired vectors and explicit analysis seed/bootstrap count.'],
    limitations: ['Supported preregistered tests only; no arbitrary formula or post-hoc method selection.'],
  }),
  row({
    operation: 'abs_stats', family: 'statistics',
    description: 'Bootstrap confidence interval for a single model aggregate metric.',
    libraries: [np], surfaces: sidecarOnly,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/experiment.test.ts'], realCaller: true },
    limits: ['Finite per-row outcomes and explicit analysis seed/bootstrap count.'],
    limitations: ['Bootstrap summary only; no automatic multiplicity correction.'],
  }),
  row({
    operation: 'simulate', family: 'simulation',
    description: 'Seeded Monte Carlo templates with common-random-number discipline.',
    libraries: [np], surfaces: sidecarOnly,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/experiment-simulation.test.ts'], realCaller: true },
    limits: ['Reviewed JSON templates only; replicate/block sizes are bounded by the experiment schema.'],
    limitations: ['No arbitrary user code or stochastic process family outside registered templates.'],
  }),
  row({
    operation: 'identity_check', family: 'symbolic-analysis',
    description: 'Evaluates whitelisted expression identities over a declared variable grid.',
    libraries: [stdlib, np], surfaces: sidecarOnly,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/executor-theory.test.ts'], realCaller: true },
    limits: ['Strict AST whitelist; grid <= 20000 points; no attribute access or eval.'],
    limitations: ['Expression identity residual is numerical evidence, not a formal proof.'],
  }),
  row({
    operation: 'fem_poisson_2d', family: 'numerical-pde',
    description: 'Manufactured-solution P1 FEM verification for 2D Poisson with convergence measurements.',
    libraries: [np, scipy, sympy], surfaces: sidecarOnly,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/executor-fem.test.ts'], realCaller: true },
    limits: ['Unit-square manufactured problems and bounded refinement ladders; expression AST is restricted.'],
    limitations: ['No general mesh import, 3D elements or nonlinear PDE systems.'],
  }),
  row({
    operation: 'fem_poisson_2d_adaptive', family: 'numerical-pde',
    description: 'Residual-estimator AFEM with deterministic marking and newest-vertex bisection.',
    libraries: [np, scipy, sympy], surfaces: sidecarOnly,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/executor-fem.test.ts'], realCaller: true },
    limits: ['Bounded element/refinement budgets and restricted manufactured expressions.'],
    limitations: ['2D Poisson family only; no distributed mesh or parallel solver.'],
  }),
  row({
    operation: 'netcdf_profile', family: 'scientific-data',
    description: 'Read-only xarray/netCDF4 structure and quality profile for a local NetCDF file.',
    libraries: [xarray, netcdf4, np, pandas], surfaces: sidecarOnly,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/dataset-netcdf.test.ts'], realCaller: true },
    limits: ['Local absolute paths only; FARLAB_DATA_ROOT fence; file size <= 200MB; bounded vars/dims/attrs.'],
    limitations: ['No remote DAP/HTTP reads, mutation or automatic schema migration.'],
  }),
  row({
    operation: 'netcdf_extract_features', family: 'scientific-data',
    description: 'Extracts bounded numeric feature summaries from local gridded NetCDF data.',
    libraries: [xarray, netcdf4, np, pandas], surfaces: sidecarOnly,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/dataset-netcdf.test.ts'], realCaller: true },
    limits: ['Same local-path and 200MB fence as netcdf_profile; bounded variables and feature output.'],
    limitations: ['Feature extraction is operation-specific; no arbitrary xarray expression execution.'],
  }),
  row({
    operation: 'ode_integrate', family: 'numerical-ode',
    description: 'Preregistered ODE integration with optional closed-form residual comparison.',
    libraries: [np, scipy, sympy], surfaces: sidecarOnly,
    provenance: 'COMPUTED', validation: { status: 'verified', evidence: ['tests/executor-ode.test.ts'], realCaller: true },
    limits: ['Whitelisted expression AST; declared solver/tolerances and bounded trajectory/sample sizes.'],
    limitations: ['Initial-value problems only; no stiff-system auto-selection beyond declared methods.'],
  }),
  row({
    operation: 'run_exploration', family: 'exploratory-analysis',
    description: 'Runs candidate exploratory analysis in the restricted sidecar sandbox.',
    libraries: [stdlib, np], surfaces: sidecarOnly,
    provenance: 'CANDIDATE', validation: { status: 'implemented', evidence: ['tests/exploration-runner.test.ts', 'tests/exploratory-codeact.test.ts'], realCaller: true },
    limits: ['Static policy gate plus isolated sandbox; no network; bounded execution and output.'],
    limitations: ['Outputs are candidate findings only and cannot become confirmatory verdicts without deterministic checks.'],
  }),
] as const);

/** Stable operation-name list used by discovery clients and contract tests. */
export const SCIENTIFIC_CAPABILITY_NAMES = Object.freeze(
  SCIENTIFIC_CAPABILITY_REGISTRY.map((entry) => entry.operation),
);

const cloneCapability = (entry: ScientificCapability): ScientificCapability => ({
  ...entry,
  libraries: entry.libraries.map((library) => ({ ...library })),
  surfaces: [...entry.surfaces],
  limits: [...entry.limits],
  limitations: [...entry.limitations],
  validation: { ...entry.validation, evidence: [...entry.validation.evidence] },
  environment: { ...entry.environment },
});

/** Returns a defensive copy so callers cannot mutate the canonical registry. */
export const resolveScientificCapability = (operation: string): ScientificCapability | undefined => {
  const entry = SCIENTIFIC_CAPABILITY_REGISTRY.find((candidate) => candidate.operation === operation);
  return entry === undefined ? undefined : cloneCapability(entry);
};

export interface ScientificCapabilityFilter {
  family?: string;
  surface?: ScientificCapabilitySurface;
  status?: ScientificCapabilityStatus;
  provenance?: ScientificCapabilityProvenance;
}

/** Returns a new array so callers cannot mutate the canonical registry. */
export const listScientificCapabilities = (filter: ScientificCapabilityFilter = {}): ScientificCapability[] =>
  SCIENTIFIC_CAPABILITY_REGISTRY
    .filter((entry) => filter.family === undefined || entry.family === filter.family)
    .filter((entry) => filter.surface === undefined || entry.surfaces.includes(filter.surface))
    .filter((entry) => filter.status === undefined || entry.validation.status === filter.status)
    .filter((entry) => filter.provenance === undefined || entry.provenance === filter.provenance)
    .map(cloneCapability);

/** Public response shape for discovery endpoints. */
export const scientificCapabilityCatalog = (): { schemaVersion: 1; lockfile: 'experiment-runtime/uv.lock'; capabilities: ScientificCapability[] } => ({
  schemaVersion: 1,
  lockfile: 'experiment-runtime/uv.lock',
  capabilities: listScientificCapabilities(),
});
