import { z } from 'zod';
import { createHash } from 'node:crypto';

/**
 * Deterministic scientific-computing primitives used by the kernel/API.
 * These are numeric measurements, not model judgments: callers must preserve
 * the returned provenance and declared assumptions when presenting results.
 */

export const BayesianBetaBinomialInput = z.object({
  priorAlpha: z.number().finite().positive(),
  priorBeta: z.number().finite().positive(),
  successes: z.number().int().nonnegative(),
  trials: z.number().int().nonnegative(),
  credibleLevel: z.number().finite().gt(0).lt(1).default(0.95),
});
export type BayesianBetaBinomialInput = z.infer<typeof BayesianBetaBinomialInput>;

export interface BayesianBetaBinomialResult {
  posteriorAlpha: number;
  posteriorBeta: number;
  mean: number;
  variance: number;
  credibleInterval: { level: number; low: number; high: number };
  provenance: 'COMPUTED';
}

// Lanczos log-Gamma and the continued-fraction regularized incomplete beta.
// The implementation is self-contained so the deterministic API has no model
// or network dependency. It follows Numerical Recipes' stable Lentz recurrence.
const logGamma = (z0: number): number => {
  const cof = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z0 < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z0)) - logGamma(1 - z0);
  const z = z0 - 1;
  let x = 0.9999999999998099;
  for (let i = 0; i < cof.length; i++) x += cof[i]! / (z + i + 1);
  const t = z + cof.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
};

const betaContinuedFraction = (a: number, b: number, x: number): number => {
  const maxIterations = 200;
  const epsilon = 3e-14;
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return h;
};

const regularizedBeta = (x: number, a: number, b: number): number => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(a * Math.log(x) + b * Math.log1p(-x) - logGamma(a) - logGamma(b) + logGamma(a + b));
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
};

const betaQuantile = (p: number, a: number, b: number): number => {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (regularizedBeta(mid, a, b) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

export const bayesianBetaBinomial = (raw: BayesianBetaBinomialInput): BayesianBetaBinomialResult => {
  const input = BayesianBetaBinomialInput.parse(raw);
  if (input.successes > input.trials) throw new Error('successes cannot exceed trials');
  const a = input.priorAlpha + input.successes;
  const b = input.priorBeta + input.trials - input.successes;
  const total = a + b;
  const alphaTail = (1 - input.credibleLevel) / 2;
  return {
    posteriorAlpha: a,
    posteriorBeta: b,
    mean: a / total,
    variance: (a * b) / (total * total * (total + 1)),
    credibleInterval: { level: input.credibleLevel, low: betaQuantile(alphaTail, a, b), high: betaQuantile(1 - alphaTail, a, b) },
    provenance: 'COMPUTED',
  };
};

export const CausalBackdoorInput = z.object({
  treatment: z.array(z.number().finite()).min(2),
  outcome: z.array(z.number().finite()).min(2),
  confounder: z.array(z.union([z.string().min(1), z.number().finite()])).min(2),
  treatmentThreshold: z.number().finite().default(0.5),
});
export type CausalBackdoorInput = z.infer<typeof CausalBackdoorInput>;

export interface CausalBackdoorResult {
  estimand: 'standardized_mean_difference';
  effect: number;
  strata: Array<{ level: string; weight: number; treatedN: number; controlN: number; treatedMean: number; controlMean: number; contrast: number }>;
  assumptions: string[];
  provenance: 'COMPUTED';
}

/** Standardized backdoor adjustment over observed confounder strata. */
export const causalBackdoorAdjustment = (raw: CausalBackdoorInput): CausalBackdoorResult => {
  const input = CausalBackdoorInput.parse(raw);
  if (input.treatment.length !== input.outcome.length || input.treatment.length !== input.confounder.length) {
    throw new Error('treatment, outcome and confounder arrays must have equal length');
  }
  const strata = new Map<string, { treated: number[]; control: number[]; total: number }>();
  for (let i = 0; i < input.treatment.length; i++) {
    const key = String(input.confounder[i]);
    const row = strata.get(key) ?? { treated: [], control: [], total: 0 };
    row.total += 1;
    (input.treatment[i]! >= input.treatmentThreshold ? row.treated : row.control).push(input.outcome[i]!);
    strata.set(key, row);
  }
  const details: CausalBackdoorResult['strata'] = [];
  let effect = 0;
  for (const [level, row] of strata) {
    if (row.treated.length === 0 || row.control.length === 0) throw new Error(`confounder stratum '${level}' lacks both treatment groups`);
    const treatedMean = row.treated.reduce((s, x) => s + x, 0) / row.treated.length;
    const controlMean = row.control.reduce((s, x) => s + x, 0) / row.control.length;
    const contrast = treatedMean - controlMean;
    const weight = row.total / input.treatment.length;
    effect += weight * contrast;
    details.push({ level, weight, treatedN: row.treated.length, controlN: row.control.length, treatedMean, controlMean, contrast });
  }
  return {
    estimand: 'standardized_mean_difference', effect, strata: details,
    assumptions: ['consistency', 'conditional exchangeability given supplied confounder', 'positivity within every confounder stratum', 'no measurement error in treatment/outcome/confounder'],
    provenance: 'COMPUTED',
  };
};

export const QuadraticOptimizationInput = z.object({
  matrix: z.array(z.array(z.number().finite()).min(1)).min(1),
  linear: z.array(z.number().finite()).min(1),
  initial: z.array(z.number().finite()).min(1),
  learningRate: z.number().finite().positive().max(10).default(0.1),
  maxIterations: z.number().int().positive().max(100_000).default(10_000),
  tolerance: z.number().finite().positive().default(1e-8),
});
export type QuadraticOptimizationInput = z.infer<typeof QuadraticOptimizationInput>;

const TableValue = z.union([z.string(), z.number().finite(), z.null()]);
export const DataProfileInput = z.object({
  columns: z.array(z.string().min(1)).min(1),
  rows: z.array(z.array(TableValue)).max(100_000),
});
export type DataProfileInput = z.infer<typeof DataProfileInput>;
export const DataframeGroupbyInput = z.object({
  columns: z.array(z.string().min(1)).min(1),
  rows: z.array(z.array(TableValue)).max(100_000),
  groupBy: z.string().min(1),
  valueColumn: z.string().min(1),
});
export type DataframeGroupbyInput = z.infer<typeof DataframeGroupbyInput>;
export const OlsRegressionInput = z.object({
  x: z.array(z.array(z.number().finite()).min(1)).min(3).max(100_000),
  y: z.array(z.number().finite()).min(3).max(100_000),
});
export type OlsRegressionInput = z.infer<typeof OlsRegressionInput>;
export const ParquetRoundtripInput = z.object({
  columns: z.array(z.string().min(1)).min(1).max(200),
  rows: z.array(z.array(TableValue)).max(100_000),
});
export type ParquetRoundtripInput = z.infer<typeof ParquetRoundtripInput>;
export const Hdf5RoundtripInput = z.object({
  dataset: z.string().regex(/^[A-Za-z_][A-Za-z0-9_/-]{0,100}$/).default('values'),
  values: z.array(z.number().finite()).min(1).max(1_000_000),
});
export type Hdf5RoundtripInput = z.infer<typeof Hdf5RoundtripInput>;

export const TorchTrainCpuInput = z.object({
  features: z.array(z.array(z.number().finite()).min(1).max(256)).min(2).max(100_000),
  targets: z.array(z.number().finite()).min(2).max(100_000),
  epochs: z.number().int().min(1).max(5000).default(100),
  learningRate: z.number().finite().positive().max(10).default(0.01),
  hiddenDim: z.number().int().min(1).max(128).default(16),
  seed: z.number().int().nonnegative().default(0),
});
export type TorchTrainCpuInput = z.infer<typeof TorchTrainCpuInput>;

const TorchCheckpoint = z.object({
  checkpointBase64: z.string().min(4).max(11_184_812),
  checkpointSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
const TorchFeatures = z.object({
  features: z.array(z.array(z.number().finite()).min(1).max(256)).min(1).max(100_000),
});
export const TorchPredictCpuInput = TorchCheckpoint.merge(TorchFeatures).extend({
  targets: z.array(z.number().finite()).min(1).max(100_000).optional(),
});
export type TorchPredictCpuInput = z.infer<typeof TorchPredictCpuInput>;
export const TorchResumeCpuInput = TorchCheckpoint.extend({
  features: z.array(z.array(z.number().finite()).min(1).max(256)).min(2).max(100_000),
  targets: z.array(z.number().finite()).min(2).max(100_000),
  epochs: z.number().int().min(1).max(5000).default(1),
  learningRate: z.number().finite().positive().max(10).optional(),
});
export type TorchResumeCpuInput = z.infer<typeof TorchResumeCpuInput>;

export const PlotSvgInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('line'), x: z.array(z.number().finite()).min(1), y: z.array(z.number().finite()).min(1), width: z.number().int().min(160).max(2400).default(800), height: z.number().int().min(120).max(1600).default(500), title: z.string().max(200).optional() }),
  z.object({ kind: z.literal('scatter'), x: z.array(z.number().finite()).min(1), y: z.array(z.number().finite()).min(1), width: z.number().int().min(160).max(2400).default(800), height: z.number().int().min(120).max(1600).default(500), title: z.string().max(200).optional() }),
  z.object({ kind: z.literal('histogram'), values: z.array(z.number().finite()).min(1), bins: z.number().int().min(2).max(100).default(20), width: z.number().int().min(160).max(2400).default(800), height: z.number().int().min(120).max(1600).default(500), title: z.string().max(200).optional() }),
  z.object({ kind: z.literal('bar'), labels: z.array(z.string().max(100)).min(1), values: z.array(z.number().finite()).min(1), width: z.number().int().min(160).max(2400).default(800), height: z.number().int().min(120).max(1600).default(500), title: z.string().max(200).optional() }),
]);
export type PlotSvgInput = z.infer<typeof PlotSvgInput>;

export const PlotInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('line'), x: z.array(z.number().finite()).min(1), y: z.array(z.number().finite()).min(1), format: z.enum(['svg', 'png']).default('svg'), width: z.number().int().min(160).max(2400).default(800), height: z.number().int().min(120).max(1600).default(500), title: z.string().max(200).optional() }),
  z.object({ kind: z.literal('scatter'), x: z.array(z.number().finite()).min(1), y: z.array(z.number().finite()).min(1), format: z.enum(['svg', 'png']).default('svg'), width: z.number().int().min(160).max(2400).default(800), height: z.number().int().min(120).max(1600).default(500), title: z.string().max(200).optional() }),
  z.object({ kind: z.literal('histogram'), values: z.array(z.number().finite()).min(1), bins: z.number().int().min(2).max(100).default(20), format: z.enum(['svg', 'png']).default('svg'), width: z.number().int().min(160).max(2400).default(800), height: z.number().int().min(120).max(1600).default(500), title: z.string().max(200).optional() }),
  z.object({ kind: z.literal('bar'), labels: z.array(z.string().max(100)).min(1), values: z.array(z.number().finite()).min(1), format: z.enum(['svg', 'png']).default('svg'), width: z.number().int().min(160).max(2400).default(800), height: z.number().int().min(120).max(1600).default(500), title: z.string().max(200).optional() }),
]);
export type PlotInput = z.infer<typeof PlotInput>;

export interface QuadraticOptimizationResult {
  solution: number[];
  objective: number;
  gradientNorm: number;
  iterations: number;
  status: 'converged' | 'max_iterations';
  provenance: 'COMPUTED';
}

/** Gradient descent for f(x)=0.5*x'Q*x+c'x; deterministic and bounded. */
export const optimizeQuadratic = (raw: QuadraticOptimizationInput): QuadraticOptimizationResult => {
  const input = QuadraticOptimizationInput.parse(raw);
  const n = input.linear.length;
  if (input.matrix.length !== n || input.initial.length !== n || input.matrix.some((r) => r.length !== n)) throw new Error('matrix must be square and match linear/initial dimensions');
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.abs(input.matrix[i]![j]! - input.matrix[j]![i]!) > 1e-10) throw new Error('matrix must be symmetric');
  let x = [...input.initial];
  const gradient = (): number[] => input.matrix.map((row, i) => row.reduce((s, q, j) => s + q * x[j]!, 0) + input.linear[i]!);
  let g = gradient();
  let iterations = 0;
  let status: QuadraticOptimizationResult['status'] = 'max_iterations';
  for (; iterations < input.maxIterations; iterations++) {
    const norm = Math.hypot(...g);
    if (norm <= input.tolerance) { status = 'converged'; break; }
    x = x.map((v, i) => v - input.learningRate * g[i]!);
    g = gradient();
    if (!g.every(Number.isFinite) || !x.every(Number.isFinite)) throw new Error('optimization diverged to a non-finite value');
  }
  const objective = 0.5 * x.reduce((s, v, i) => s + v * input.matrix[i]!.reduce((q, a, j) => q + a * x[j]!, 0), 0) + x.reduce((s, v, i) => s + input.linear[i]! * v, 0);
  return { solution: x, objective, gradientNorm: Math.hypot(...g), iterations, status, provenance: 'COMPUTED' };
};

export const ScientificComputeRequest = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('bayesian_beta_binomial'), input: BayesianBetaBinomialInput }),
  z.object({ operation: z.literal('causal_backdoor'), input: CausalBackdoorInput }),
  z.object({ operation: z.literal('optimize_quadratic'), input: QuadraticOptimizationInput }),
  z.object({ operation: z.literal('data_profile'), input: DataProfileInput }),
  z.object({ operation: z.literal('dataframe_groupby'), input: DataframeGroupbyInput }),
  z.object({ operation: z.literal('ols_regression'), input: OlsRegressionInput }),
  z.object({ operation: z.literal('parquet_roundtrip'), input: ParquetRoundtripInput }),
  z.object({ operation: z.literal('hdf5_roundtrip'), input: Hdf5RoundtripInput }),
  z.object({ operation: z.literal('torch_train_cpu'), input: TorchTrainCpuInput }),
  z.object({ operation: z.literal('torch_predict_cpu'), input: TorchPredictCpuInput }),
  z.object({ operation: z.literal('torch_resume_cpu'), input: TorchResumeCpuInput }),
  z.object({ operation: z.literal('plot_svg'), input: PlotSvgInput }),
  z.object({ operation: z.literal('plot'), input: PlotInput }),
]);
export type ScientificComputeRequest = z.infer<typeof ScientificComputeRequest>;

/** Machine-readable capability registry for clients and the agent discovery plane. */
export const SCIENTIFIC_OPERATIONS = [
  { operation: 'bayesian_beta_binomial', family: 'statistics', engine: 'scipy.stats.beta', provenance: 'COMPUTED' },
  { operation: 'causal_backdoor', family: 'causal-inference', engine: 'numpy', provenance: 'COMPUTED' },
  { operation: 'optimize_quadratic', family: 'optimization', engine: 'scipy.optimize.BFGS', provenance: 'COMPUTED' },
  { operation: 'data_profile', family: 'data-processing', engine: 'farlab.data_profile.v1', provenance: 'COMPUTED' },
  { operation: 'dataframe_groupby', family: 'data-processing', engine: 'pandas', provenance: 'COMPUTED' },
  { operation: 'ols_regression', family: 'statistics', engine: 'statsmodels', provenance: 'COMPUTED' },
  { operation: 'parquet_roundtrip', family: 'scientific-data', engine: 'pyarrow', provenance: 'COMPUTED', formats: ['parquet'] },
  { operation: 'hdf5_roundtrip', family: 'scientific-data', engine: 'h5py', provenance: 'COMPUTED', formats: ['hdf5'] },
  { operation: 'torch_train_cpu', family: 'machine-learning', engine: 'pytorch', provenance: 'COMPUTED', surface: 'api', device: 'cpu', formats: ['checkpoint'] },
  { operation: 'plot_svg', family: 'visualization', engine: 'farlab.plot_svg.v1', provenance: 'COMPUTED', formats: ['svg'] },
  { operation: 'plot', family: 'visualization', engine: 'matplotlib', provenance: 'COMPUTED', formats: ['svg', 'png'] },
  { operation: 'train_eval', family: 'machine-learning', engine: 'scikit-learn', provenance: 'COMPUTED', surface: 'experiment' },
  { operation: 'dataset_audit', family: 'data-quality', engine: 'cleanlab', provenance: 'COMPUTED', surface: 'experiment' },
  { operation: 'paired_stats', family: 'statistics', engine: 'scipy.stats', provenance: 'COMPUTED', surface: 'experiment' },
  { operation: 'abs_stats', family: 'statistics', engine: 'numpy', provenance: 'COMPUTED', surface: 'experiment' },
  { operation: 'simulate', family: 'simulation', engine: 'numpy', provenance: 'COMPUTED', surface: 'experiment' },
  { operation: 'identity_check', family: 'symbolic-analysis', engine: 'numpy+ast', provenance: 'COMPUTED', surface: 'experiment' },
  { operation: 'fem_poisson_2d', family: 'numerical-pde', engine: 'numpy', provenance: 'COMPUTED', surface: 'experiment' },
  { operation: 'fem_poisson_2d_adaptive', family: 'numerical-pde', engine: 'numpy', provenance: 'COMPUTED', surface: 'experiment' },
  { operation: 'ode_integrate', family: 'numerical-ode', engine: 'scipy.integrate.solve_ivp', provenance: 'COMPUTED', surface: 'experiment' },
  { operation: 'netcdf_profile', family: 'scientific-data', engine: 'xarray+netCDF4', provenance: 'COMPUTED', surface: 'experiment' },
  { operation: 'netcdf_extract_features', family: 'scientific-data', engine: 'xarray+netCDF4', provenance: 'COMPUTED', surface: 'experiment' },
  { operation: 'run_exploration', family: 'exploratory-analysis', engine: 'restricted-python', provenance: 'CANDIDATE', surface: 'experiment' },
] as const;

const finiteNumbers = (values: Array<string | number | null>): number[] => values.flatMap((v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return [v];
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return [Number(v)];
  return [];
});

export const profileData = (raw: DataProfileInput): Record<string, unknown> => {
  const input = DataProfileInput.parse(raw);
  const columns = input.columns.map((name, i) => {
    const values = input.rows.map((r) => r[i] ?? null);
    const nums = finiteNumbers(values);
    const missing = values.filter((v) => v === null || v === '').length;
    const unique = new Set(values.filter((v) => v !== null && v !== '') .map((v) => String(v))).size;
    if (nums.length === values.length - missing && nums.length > 0) {
      const sorted = [...nums].sort((a, b) => a - b);
      const quantile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))]!;
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
      const q1 = quantile(0.25), q3 = quantile(0.75), iqr = q3 - q1;
      const outliers = nums.filter((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr).length;
      return { name, index: i, type: 'numeric', count: values.length, missing, unique, min: sorted[0], max: sorted[sorted.length - 1], mean, stddev: Math.sqrt(variance), quantiles: { p25: q1, p50: quantile(0.5), p75: q3 }, outliers };
    }
    return { name, index: i, type: 'categorical', count: values.length, missing, unique };
  });
  return { rows: input.rows.length, columns, provenance: 'COMPUTED', engine: 'farlab.data_profile.v1' };
};

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
export const plotSvg = (raw: PlotSvgInput): Record<string, unknown> => {
  const input = PlotSvgInput.parse(raw); const w = input.width; const h = input.height;
  const pad = 48; const innerW = w - pad * 2; const innerH = h - pad * 2;
  let marks: string; const title = input.title ? `<text x="${w / 2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="16">${esc(input.title)}</text>` : '';
  const axis = `<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="white" stroke="#64748b"/><line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#334155"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" stroke="#334155"/>`;
  if (input.kind === 'bar') {
    if (input.labels.length !== input.values.length) throw new Error('labels and values must have equal length');
    const max = Math.max(...input.values.map((v) => Math.abs(v)), 1); const bw = innerW / input.values.length;
    marks = input.values.map((v, i) => { const bh = Math.abs(v) / max * innerH; const x = pad + i * bw + bw * 0.1; const y = v >= 0 ? h - pad - bh : h - pad; return `<rect x="${x}" y="${y}" width="${bw * 0.8}" height="${bh}" fill="#2563eb"><title>${esc(input.labels[i]!)}: ${v}</title></rect>`; }).join('');
  } else if (input.kind === 'histogram') {
    const min = Math.min(...input.values), max = Math.max(...input.values); const span = max === min ? 1 : max - min; const counts = Array(input.bins).fill(0) as number[];
    for (const v of input.values) counts[Math.min(input.bins - 1, Math.floor(((v - min) / span) * input.bins))]!++;
    const peak = Math.max(...counts, 1); const bw = innerW / input.bins;
    marks = counts.map((c, i) => `<rect x="${pad + i * bw}" y="${h - pad - (c / peak) * innerH}" width="${Math.max(1, bw - 1)}" height="${(c / peak) * innerH}" fill="#0f766e"><title>${c}</title></rect>`).join('');
  } else {
    if (input.x.length !== input.y.length) throw new Error('x and y must have equal length');
    const xmin = Math.min(...input.x), xmax = Math.max(...input.x), ymin = Math.min(...input.y), ymax = Math.max(...input.y); const sx = xmax === xmin ? 1 : innerW / (xmax - xmin); const sy = ymax === ymin ? 1 : innerH / (ymax - ymin);
    const pts = input.x.map((x, i) => `${pad + (x - xmin) * sx},${h - pad - (input.y[i]! - ymin) * sy}`);
    marks = input.kind === 'line' ? `<polyline points="${pts.join(' ')}" fill="none" stroke="#dc2626" stroke-width="2"/>` : pts.map((p) => { const [cx, cy] = p.split(','); return `<circle cx="${cx}" cy="${cy}" r="3" fill="#7c3aed"/>`; }).join('');
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${title}${axis}${marks}</svg>`;
  return { format: 'svg', width: w, height: h, svg, bytes: Buffer.byteLength(svg), sha256: createHash('sha256').update(svg).digest('hex'), provenance: 'COMPUTED', engine: 'farlab.plot_svg.v1' };
};

export const runScientificCompute = (request: ScientificComputeRequest): Record<string, unknown> => {
  const parsed = ScientificComputeRequest.parse(request);
  if (parsed.operation === 'bayesian_beta_binomial') return { ...bayesianBetaBinomial(parsed.input) };
  if (parsed.operation === 'causal_backdoor') return { ...causalBackdoorAdjustment(parsed.input) };
  if (parsed.operation === 'optimize_quadratic') return { ...optimizeQuadratic(parsed.input) };
  if (parsed.operation === 'data_profile') return profileData(parsed.input);
  if (parsed.operation === 'plot_svg') return plotSvg(parsed.input);
  throw new Error(`${parsed.operation} requires the Python scientific sidecar`);
};
