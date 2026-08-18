/**
 * statistics/numerics — KERNEL-NUMERIC-001：内核数值确定性与稳定性基座。
 *
 * 职责（宪法 T0 逐项）：
 *   - 集中容差政策 CENTRAL_TOLERANCE：uLP/eps 定义、比较容差、级数截断、收敛阈——
 *     全部数值容差常量的唯一来源（散落常量在此登记，模块级私有常量禁止再立）。
 *   - tolerantCompare / relDiff：带相对容差的确定序比较（NaN/±Inf 入核 → fail-closed）。
 *   - 补偿求和 neumaierSum / kahanSum：抵消灾难性抵消（catastrophic cancellation）。
 *   - 确定性累加 deterministicSum / deterministicMean：固定规范化排序后补偿求和——
 *     同一多重集（multiset）无论输入顺序如何，结果 bit-exact 可重复。
 *   - 边界分类 classifyNumericEdge / assertKernelSafeNumber：NaN/±Inf/±0/subnormal/
 *     extreme 检出；NaN/±Inf 进入内核计算 → KernelNumericError（fail-closed，不静默）。
 *   - 整数边界 safeIntegerAdd / safeIntegerMul：Number.MAX_SAFE_INTEGER 溢出 → BigInt
 *     （绝不静默舍入）。
 *   - 单位一致性 checkUnitConsistency：quantity+unit vs 期望单位，不匹配 → 拒绝。
 *   - 内核无随机断言 assertNoSeededRandomnessInKernel：静态扫描内核裁决路径源码中的
 *     环境随机调用（Math.random / crypto.getRandomValues / randomBytes / randomUUID），
 *     唯一合法随机性 = 显式种子 RNG（如 mulberry32），且只许在登记模块中出现。
 *   - 跨平台参考向量：numerics_golden_vectors.json（≥30 条，含极端值），测试逐条
 *     bit-exact（hex IEEE754 位型）对照。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - 参考向量证明的是「当前 V8/Node 平台上这些输入的 bit-exact 输出」，不证明所有
 *     IEEE754 实现都产出相同位型（非正规数 flush-to-zero 模式的硬件可能不同）；跨平台
 *     一致性由 vectors JSON 的 hex 位型供他方实现比对，不由本模块单方面保证。
 *   - assertNoSeededRandomnessInKernel 是源码静态扫描（注释剥离后的调用模式匹配），
 *     不证明运行时无动态注入的随机性（eval / 字符串拼接 require 不在扫描能力内）。
 *   - checkUnitConsistency 只做规范化别名比对，不做量纲换算（kg 与 g 视为不同单位 →
 *     拒绝）；单位换算属于上游数据治理，不属于内核数值政策。
 *
 * Determinism：全模块纯函数、无时钟、无环境读取（除显式传入 repoRoot 的扫描函数）、
 * 无 ambient 随机性。No LLM。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// 集中容差政策（CENTRAL TOLERANCE POLICY）
// ---------------------------------------------------------------------------

/** 集中容差政策的类型形状（键集冻结，值即语义）。 */
export interface CentralTolerancePolicy {
  /** IEEE754 double 的机器 epsilon（1.0 处的 1 ULP）。 */
  readonly EPS: number;
  /** 1.0 处的单位最后位（与 EPS 同值，语义别名——供比较语义使用）。 */
  readonly ULP_AT_1: number;
  /** tolerantCompare 默认相对容差（12 位有效数字一致视为相等）。 */
  readonly REL_TOLERANCE_DEFAULT: number;
  /** 无穷级数截断阈值（相对 |Σ|，ks_test Q_KS 级数用）。 */
  readonly SERIES_TRUNCATION_REL: number;
  /** t 分布不完全 beta 连分数收敛阈（t_distribution.ts BETA_EPS 登记值）。 */
  readonly T_BETA_CONVERGENCE: number;
  /** t 分布分位数 Newton 迭代收敛阈（t_distribution.ts 登记值）。 */
  readonly T_NEWTON_CONVERGENCE: number;
  /** extreme 检出阈：|x| ≥ 1e308 视为逼近溢出边界（检出但不拒绝）。 */
  readonly EXTREME_MAGNITUDE: number;
}

/**
 * 内核数值容差唯一来源。改动任何键 = 改变内核数值语义，必须同步重生成
 * numerics_golden_vectors.json 并跑全量统计测试。
 */
export const CENTRAL_TOLERANCE: Readonly<CentralTolerancePolicy> = Object.freeze({
  EPS: Number.EPSILON,
  ULP_AT_1: Number.EPSILON,
  REL_TOLERANCE_DEFAULT: 1e-12,
  SERIES_TRUNCATION_REL: 1e-12,
  T_BETA_CONVERGENCE: 3.0e-12,
  T_NEWTON_CONVERGENCE: 1e-13,
  EXTREME_MAGNITUDE: 1e308,
});

/** 内核数值 fail-closed 错误（NaN/±Inf 入核、溢出、非法单位等）。 */
export class KernelNumericError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KernelNumericError';
  }
}

// ---------------------------------------------------------------------------
// 相对差 / 容差比较
// ---------------------------------------------------------------------------

/**
 * 相对差 |a−b| / max(|a|,|b|)；两者同为零（含 −0 vs +0）→ 0。
 * NaN/±Inf 输入 → KernelNumericError（fail-closed）。
 */
export function relDiff(a: number, b: number): number {
  assertKernelSafeNumber(a, 'relDiff.a');
  assertKernelSafeNumber(b, 'relDiff.b');
  const diff = Math.abs(a - b);
  if (diff === 0) return 0;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return diff / scale;
}

export interface TolerantCompareOptions {
  /** 相对容差，默认 CENTRAL_TOLERANCE.REL_TOLERANCE_DEFAULT。 */
  readonly relTolerance?: number;
}

/**
 * 带相对容差的确定序比较：a < b → −1；容差内相等 → 0；a > b → 1。
 * NaN/±Inf 输入 → KernelNumericError。确定性：同输入恒同输出。
 */
export function tolerantCompare(a: number, b: number, opts: TolerantCompareOptions = {}): -1 | 0 | 1 {
  const tol = opts.relTolerance ?? CENTRAL_TOLERANCE.REL_TOLERANCE_DEFAULT;
  assertKernelSafeNumber(a, 'tolerantCompare.a');
  assertKernelSafeNumber(b, 'tolerantCompare.b');
  if (a === b) return 0;
  if (relDiff(a, b) <= tol) return 0;
  return a < b ? -1 : 1;
}

// ---------------------------------------------------------------------------
// 补偿求和（compensated summation）
// ---------------------------------------------------------------------------

/**
 * Neumaier 补偿求和（Kahan-Babuška 改进型）。空数组 → 0。
 * NaN/±Inf 输入或结果溢出 → KernelNumericError（fail-closed）。
 */
export function neumaierSum(values: readonly number[]): number {
  let sum = 0;
  let comp = 0;
  for (const x of values) {
    assertKernelSafeNumber(x, 'neumaierSum.input');
    const t = sum + x;
    if (Math.abs(sum) >= Math.abs(x)) {
      comp += (sum - t) + x;
    } else {
      comp += (x - t) + sum;
    }
    sum = t;
  }
  const total = sum + comp;
  assertKernelSafeNumber(total, 'neumaierSum.result');
  return total;
}

/**
 * 经典 Kahan 补偿求和。空数组 → 0。
 * NaN/±Inf 输入或结果溢出 → KernelNumericError。保留供算法对照（Neumaier 为默认）。
 */
export function kahanSum(values: readonly number[]): number {
  let sum = 0;
  let c = 0;
  for (const x of values) {
    assertKernelSafeNumber(x, 'kahanSum.input');
    const y = x - c;
    const t = sum + y;
    c = (t - sum) - y;
    sum = t;
  }
  assertKernelSafeNumber(sum, 'kahanSum.result');
  return sum;
}

// ---------------------------------------------------------------------------
// 确定性累加（bit-exact 可重复）
// ---------------------------------------------------------------------------

/**
 * 全序比较：数值升序；数值相等时 −0 排在 +0 前（Object.is 区分符号零）。
 * 相等有限值（同位型）顺序无观测差异，但符号零会影响位型，须确定性 tie-break。
 */
function canonicalNumericOrder(a: number, b: number): number {
  if (a < b) return -1;
  if (a > b) return 1;
  if (Object.is(a, b)) return 0;
  return Object.is(a, -0) ? -1 : 1;
}

/**
 * 确定性累加：输入多重集先按规范化全序排序，再 Neumaier 补偿求和。
 * 同一多重集无论输入顺序如何 → bit-exact 相同结果（可重放性保证）。
 * NaN/±Inf 输入或结果溢出 → KernelNumericError。
 */
export function deterministicSum(values: readonly number[]): number {
  const sorted = [...values].sort(canonicalNumericOrder);
  return neumaierSum(sorted);
}

/**
 * 确定性均值 = deterministicSum(values) / n。空数组 → KernelNumericError
 * （均值无定义，不静默返回 NaN）。
 */
export function deterministicMean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new KernelNumericError('deterministicMean: empty input (mean undefined)');
  }
  return deterministicSum(values) / values.length;
}

// ---------------------------------------------------------------------------
// 边界分类（NaN / ±Inf / ±0 / subnormal / extreme）
// ---------------------------------------------------------------------------

export type NumericEdgeKind = 'nan' | 'infinite' | 'zero' | 'subnormal' | 'normal';

export interface NumericEdgeClassification {
  readonly kind: NumericEdgeKind;
  /** 符号：'+' / '−'；NaN 为 null。 */
  readonly sign: '+' | '-' | null;
  /** |x| ≥ CENTRAL_TOLERANCE.EXTREME_MAGNITUDE（逼近溢出边界，检出但不拒绝）。 */
  readonly extreme: boolean;
  /** 内核计算安全（非 NaN/±Inf）。zero/subnormal/normal 均安全（extreme 仍标注）。 */
  readonly kernelSafe: boolean;
  readonly reason: string;
}

/** 最小正规数 2.2250738585072014e-308（|x| < 此值且非零 → subnormal）。 */
export const MIN_NORMAL_DOUBLE = 2.2250738585072014e-308;

/**
 * 边界分类：检出 NaN/±Inf/±0/subnormal/extreme。
 * 拒绝策略由消费方决定：kernelSafe=false（NaN/±Inf）入核必须 fail-closed。
 */
export function classifyNumericEdge(x: number): NumericEdgeClassification {
  if (Number.isNaN(x)) {
    return { kind: 'nan', sign: null, extreme: false, kernelSafe: false, reason: 'NaN — undefined comparison, kernel fail-closed' };
  }
  if (!Number.isFinite(x)) {
    return { kind: 'infinite', sign: x > 0 ? '+' : '-', extreme: true, kernelSafe: false, reason: '±Infinity — non-representable magnitude, kernel fail-closed' };
  }
  const sign: '+' | '-' = Object.is(x, -0) || x < 0 ? '-' : '+';
  const extreme = Math.abs(x) >= CENTRAL_TOLERANCE.EXTREME_MAGNITUDE;
  if (x === 0) {
    return { kind: 'zero', sign, extreme: false, kernelSafe: true, reason: `signed zero (${sign}0) — Object.is distinguishes it` };
  }
  if (Math.abs(x) < MIN_NORMAL_DOUBLE) {
    return { kind: 'subnormal', sign, extreme: false, kernelSafe: true, reason: 'subnormal — reduced precision, flush-to-zero hardware may diverge' };
  }
  return {
    kind: 'normal',
    sign,
    extreme,
    kernelSafe: true,
    reason: extreme ? 'extreme magnitude — near overflow boundary, flagged' : 'normal finite double',
  };
}

/** 断言 x 可进入内核计算（非 NaN/±Inf），否则 KernelNumericError（fail-closed）。 */
export function assertKernelSafeNumber(x: number, label: string): void {
  if (Number.isNaN(x) || !Number.isFinite(x)) {
    const c = classifyNumericEdge(x);
    throw new KernelNumericError(`${label}: ${c.kind} value rejected by kernel numeric policy (${c.reason})`);
  }
}

// ---------------------------------------------------------------------------
// 整数边界（MAX_SAFE_INTEGER 溢出 → BigInt，绝不静默舍入）
// ---------------------------------------------------------------------------

function assertSafeIntegerInput(x: number, fn: string): void {
  if (!Number.isInteger(x)) {
    throw new KernelNumericError(`${fn}: non-integer input ${String(x)} — integer boundary only`);
  }
  assertKernelSafeNumber(x, `${fn}.input`);
}

function bigintToNumberOrBigInt(exact: bigint): number | bigint {
  if (exact > BigInt(Number.MAX_SAFE_INTEGER) || exact < BigInt(Number.MIN_SAFE_INTEGER)) {
    return exact;
  }
  return Number(exact);
}

/**
 * 精确整数加法：结果在安全整数域内 → number；越界 → BigInt（精确值）。
 * 非整数输入 → KernelNumericError。永不静默舍入。
 */
export function safeIntegerAdd(a: number, b: number): number | bigint {
  assertSafeIntegerInput(a, 'safeIntegerAdd');
  assertSafeIntegerInput(b, 'safeIntegerAdd');
  return bigintToNumberOrBigInt(BigInt(a) + BigInt(b));
}

/** 精确整数乘法：语义同 safeIntegerAdd。 */
export function safeIntegerMul(a: number, b: number): number | bigint {
  assertSafeIntegerInput(a, 'safeIntegerMul');
  assertSafeIntegerInput(b, 'safeIntegerMul');
  return bigintToNumberOrBigInt(BigInt(a) * BigInt(b));
}

// ---------------------------------------------------------------------------
// 单位一致性（quantity + unit vs 期望单位；不匹配 → 拒绝）
// ---------------------------------------------------------------------------

export interface Quantity {
  readonly value: number;
  readonly unit: string;
}

export interface UnitConsistencyResult {
  readonly ok: boolean;
  readonly normalizedUnit: string;
  readonly expectedUnit: string;
  readonly reason: string;
}

/**
 * 规范化别名表（小写）。只做别名归一，不做量纲换算——kg 与 g 是不同单位。
 * 扩表 = 登记新别名，不许在调用方硬编码。
 */
const UNIT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  s: 's', second: 's', seconds: 's', sec: 's',
  ms: 'ms', millisecond: 'ms', milliseconds: 'ms',
  min: 'min', minute: 'min', minutes: 'min',
  h: 'h', hour: 'h', hours: 'h',
  m: 'm', meter: 'm', meters: 'm',
  km: 'km', kilometer: 'km', kilometers: 'km',
  cm: 'cm', centimeter: 'cm', centimeters: 'cm',
  mm: 'mm', millimeter: 'mm', millimeters: 'mm',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  g: 'g', gram: 'g', grams: 'g',
  mg: 'mg', milligram: 'mg', milligrams: 'mg',
  mol: 'mol', mole: 'mol', moles: 'mol',
  mmol: 'mmol', j: 'j', joule: 'j', joules: 'j',
  kj: 'kj', kJ: 'kj',
  k: 'k', kelvin: 'k',
  c: 'c', celsius: 'c',
  '%': '%', percent: '%',
});

function normalizeUnit(unit: string): string {
  const trimmed = unit.trim().toLowerCase();
  return UNIT_ALIASES[trimmed] ?? trimmed;
}

/**
 * 单位一致性检查：normalize(quantity.unit) === normalize(expectedUnit) → ok。
 * 不匹配 → ok=false（拒绝），reason 说明。无换算、无猜测。
 */
export function checkUnitConsistency(q: Quantity, expectedUnit: string): UnitConsistencyResult {
  assertKernelSafeNumber(q.value, 'checkUnitConsistency.value');
  const normalizedUnit = normalizeUnit(q.unit);
  const expected = normalizeUnit(expectedUnit);
  if (normalizedUnit === expected) {
    return { ok: true, normalizedUnit, expectedUnit: expected, reason: 'unit matches after alias normalization' };
  }
  return {
    ok: false,
    normalizedUnit,
    expectedUnit: expected,
    reason: `unit mismatch: quantity is '${normalizedUnit}' but expected '${expected}' (no dimensional conversion is performed — reject, not guess)`,
  };
}

// ---------------------------------------------------------------------------
// 内核无随机断言（静态扫描；机制参考 src/architecture/dependency_rules.ts）
// ---------------------------------------------------------------------------

/** 内核裁决路径（与 dependency_rules.TRUST_KERNEL_LAYERS 对齐 + statistics 数值内核）。 */
export const KERNEL_NUMERIC_SCAN_DIRS: readonly string[] = [
  'src/statistics/',
  'src/fec/',
  'src/far_proof/',
  'src/proof_envelope/',
  'src/falsifiability/',
  'src/evidence_log/',
];

/** 环境随机调用模式（注释剥离后匹配；种子 RNG 如 mulberry32(seed) 不在列——它是确定性的）。 */
const AMBIENT_RANDOM_PATTERNS: ReadonlyArray<{ readonly name: string; readonly re: RegExp }> = [
  { name: 'Math.random', re: /\bMath\s*\.\s*random\s*\(/ },
  { name: 'crypto.getRandomValues', re: /\bcrypto\s*\.\s*getRandomValues\s*\(/ },
  { name: 'crypto.randomBytes', re: /\bcrypto\s*\.\s*randomBytes\s*\(/ },
  { name: 'crypto.randomUUID', re: /\bcrypto\s*\.\s*randomUUID\s*\(/ },
];

/**
 * 随机性 allowlist：路径前缀 + 模式名 + 理由。唯一合法类别 = 显式种子 RNG 的
 * 登记实现/消费方（mulberry32 系，种子必填、同种子同输出——确定性，非环境随机）。
 * 测试文件不在扫描范围（KERNEL_NUMERIC_SCAN_DIRS 只含 src/）。
 */
export const SEEDED_RANDOMNESS_ALLOWLIST: ReadonlyArray<{
  readonly pathPrefix: string;
  readonly pattern: string;
  readonly reason: string;
}> = [
  {
    pathPrefix: 'src/statistics/permutation_test.ts',
    pattern: '*',
    reason: 'seeded mulberry32 provider (explicit seed mandatory, deterministic output) — constitution: seeded randomness outside kernel verdict paths, registered here',
  },
  {
    pathPrefix: 'src/statistics/bootstrap_ci.ts',
    pattern: '*',
    reason: 'consumes seeded mulberry32 from permutation_test.ts with explicit seed — deterministic resampling',
  },
];

export interface RandomnessViolation {
  readonly file: string;
  readonly line: number;
  readonly pattern: string;
  readonly snippet: string;
}

export interface RandomnessScanResult {
  readonly scannedFiles: number;
  readonly violations: readonly RandomnessViolation[];
  readonly allowlist: typeof SEEDED_RANDOMNESS_ALLOWLIST;
  readonly ok: boolean;
}

/** 剥离块注释与行注释（保守：误剥字符串中的 // 可接受——只用于降低误报，不产生漏报）。 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

function walkTsFilesUnder(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkTsFilesUnder(full, out);
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
}

/**
 * 断言内核裁决路径源码无环境随机调用。
 * @param repoRoot 仓库根（可移植路径，由调用方用 fileURLToPath(new URL(...)) 构造）。
 * @returns 扫描结果（ok = violations 为空）。
 */
export function assertNoSeededRandomnessInKernel(repoRoot: string): RandomnessScanResult {
  const violations: RandomnessViolation[] = [];
  let scannedFiles = 0;
  for (const rel of KERNEL_NUMERIC_SCAN_DIRS) {
    const files: string[] = [];
    walkTsFilesUnder(join(repoRoot, ...rel.split('/')), files);
    for (const file of files) {
      scannedFiles += 1;
      const relPath = file.slice(repoRoot.length + 1).replace(/\\/g, '/');
      const stripped = stripComments(readFileSync(file, 'utf8'));
      const lines = stripped.split('\n');
      for (const { name, re } of AMBIENT_RANDOM_PATTERNS) {
        for (let i = 0; i < lines.length; i += 1) {
          if (re.test(lines[i] ?? '')) {
            violations.push({
              file: relPath,
              line: i + 1,
              pattern: name,
              snippet: (lines[i] ?? '').trim().slice(0, 120),
            });
          }
        }
      }
    }
  }
  const filtered = violations.filter((v) => {
    const entry = SEEDED_RANDOMNESS_ALLOWLIST.find((a) => v.file.startsWith(a.pathPrefix));
    return entry === undefined || (entry.pattern !== '*' && entry.pattern !== v.pattern);
  });
  return {
    scannedFiles,
    violations: filtered,
    allowlist: SEEDED_RANDOMNESS_ALLOWLIST,
    ok: filtered.length === 0,
  };
}

// ---------------------------------------------------------------------------
// IEEE754 位型工具（golden vector hex 表示；跨实现共享的确定性编码）
// ---------------------------------------------------------------------------

/** double → 0x 开头 16 位 hex IEEE754 位型（区分 −0/NaN payload）。 */
export function doubleToHex(x: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x, false);
  let hex = '';
  for (let i = 0; i < 8; i += 1) {
    hex += (view.getUint8(i) ?? 0).toString(16).padStart(2, '0');
  }
  return `0x${hex}`;
}
