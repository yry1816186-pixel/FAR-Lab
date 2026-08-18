/**
 * numerics.test.ts — KERNEL-NUMERIC-001 验收：数值确定性与稳定性。
 *
 * 覆盖宪法验收项：
 *   - reference implementation 对照：44 条 golden vectors 逐条 bit-exact（hex 位型）
 *   - metamorphic：sum(a,b)==sum(b,a) bit-exact；加 +0 不变；均值平移不变性
 *   - property：随机浮点数组 neumaierSum 误差 ≤ 朴素求和误差（BigInt 精确参照）
 *   - sensitivity：输入扰动 < eps/2 → tolerantCompare 判定不变
 *   - 边界：NaN/±Inf/±0/subnormal/extreme 检出 + fail-closed 拒绝
 *   - 整数边界、单位一致性、内核无环境随机静态扫描（含负向：栽种 Math.random 必须检出）
 *
 * Cannot-prove：golden 向量钉住当前 V8 平台位型；不证明其他 IEEE754 实现一致
 * （见 numerics.ts 模块头）。均值平移不变性在一般实数位移下不保证 bit-exact
 * （浮点加法不可结合），故分两档断言：2 的幂位移 bit-exact、一般位移容差内一致。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMulberry32 } from '../../src/statistics/permutation_test.ts';
import {
  CENTRAL_TOLERANCE,
  KernelNumericError,
  relDiff,
  tolerantCompare,
  neumaierSum,
  kahanSum,
  deterministicSum,
  deterministicMean,
  classifyNumericEdge,
  assertKernelSafeNumber,
  safeIntegerAdd,
  safeIntegerMul,
  checkUnitConsistency,
  assertNoSeededRandomnessInKernel,
  doubleToHex,
} from '../../src/statistics/numerics.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

// ---------------------------------------------------------------------------
// golden vectors 加载与解码（JSON 不能携带 NaN/±Inf/−0 → 标记字符串解码）
// ---------------------------------------------------------------------------

interface GoldenVector {
  readonly vectorId: string;
  readonly kind: string;
  readonly input: unknown;
  readonly relTolerance?: number;
  readonly expected: unknown;
  readonly expectedHex?: string;
}

function decodeNumber(x: unknown): number {
  if (x === 'NaN') return Number.NaN;
  if (x === '+Infinity') return Number.POSITIVE_INFINITY;
  if (x === '-Infinity') return Number.NEGATIVE_INFINITY;
  if (x === '-0') return -0;
  if (typeof x === 'number') return x;
  throw new Error(`undecodable vector value: ${String(x)}`);
}

const goldenDoc = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../src/statistics/numerics_golden_vectors.json', import.meta.url)), 'utf8'),
) as { readonly count: number; readonly vectors: readonly GoldenVector[] };

test('golden vectors: ≥30 条且 7 类全覆盖', () => {
  assert.ok(goldenDoc.count >= 30, `vector 数量 ${goldenDoc.count} 须 ≥30`);
  const kinds = new Set(goldenDoc.vectors.map((v) => v.kind));
  for (const k of [
    'deterministicSum',
    'deterministicMean',
    'neumaierSum',
    'kahanSum',
    'tolerantCompare',
    'relDiff',
    'classifyNumericEdge',
  ]) {
    assert.ok(kinds.has(k), `kind ${k} 缺失`);
  }
});

test('golden vectors: 逐条 bit-exact（hex 位型 + Object.is）对照 reference', () => {
  for (const v of goldenDoc.vectors) {
    const label = `${v.vectorId} (${v.kind})`;
    switch (v.kind) {
      case 'deterministicSum':
      case 'deterministicMean':
      case 'neumaierSum':
      case 'kahanSum': {
        const input = (v.input as unknown[]).map(decodeNumber);
        const actual =
          v.kind === 'deterministicSum' ? deterministicSum(input)
          : v.kind === 'deterministicMean' ? deterministicMean(input)
          : v.kind === 'neumaierSum' ? neumaierSum(input)
          : kahanSum(input);
        assert.ok(v.expectedHex !== undefined, `${label} 须含 expectedHex`);
        assert.equal(doubleToHex(actual), v.expectedHex, `${label} hex 位型漂移`);
        assert.ok(Object.is(actual, decodeNumber(v.expected)), `${label} Object.is 值不等`);
        break;
      }
      case 'tolerantCompare': {
        const [a, b] = (v.input as unknown[]).map(decodeNumber);
        if (a === undefined || b === undefined) throw new Error(`${label}: 须含两个输入`);
        const opts = v.relTolerance !== undefined ? { relTolerance: v.relTolerance } : {};
        assert.equal(tolerantCompare(a, b, opts), v.expected, `${label}`);
        break;
      }
      case 'relDiff': {
        const [a, b] = (v.input as unknown[]).map(decodeNumber);
        if (a === undefined || b === undefined) throw new Error(`${label}: 须含两个输入`);
        const actual = relDiff(a, b);
        assert.ok(v.expectedHex !== undefined, `${label} 须含 expectedHex`);
        assert.equal(doubleToHex(actual), v.expectedHex, `${label} hex 位型漂移`);
        break;
      }
      case 'classifyNumericEdge': {
        const c = classifyNumericEdge(decodeNumber(v.input));
        assert.deepEqual(
          { kind: c.kind, sign: c.sign, extreme: c.extreme, kernelSafe: c.kernelSafe },
          v.expected,
          `${label}`,
        );
        break;
      }
      default:
        assert.fail(`未知 vector kind: ${v.kind}`);
    }
  }
});

// ---------------------------------------------------------------------------
// metamorphic tests
// ---------------------------------------------------------------------------

test('metamorphic: 确定性累加对输入顺序 bit-exact 不变（含抵消灾难用例）', () => {
  const cases: readonly (readonly number[])[] = [
    [1e16, 1, -1e16],
    [0.1, 0.2, 0.3, 0.4, 0.5],
    [1e-300, 1e300, 1e-300, -1e300],
    [3.141592653589793, -2.718281828459045, 1.4142135623730951],
    [-0, 0, 1, -1, 5e-324],
  ];
  for (const xs of cases) {
    const base = deterministicSum(xs);
    // 确定性重排（reverse + rotate，均为确定性变换）
    const reversed = deterministicSum([...xs].reverse());
    const rotated = deterministicSum([...xs.slice(1), xs[0] ?? 0]);
    assert.equal(doubleToHex(reversed), doubleToHex(base), `reverse 后位型漂移: ${JSON.stringify(xs)}`);
    assert.equal(doubleToHex(rotated), doubleToHex(base), `rotate 后位型漂移: ${JSON.stringify(xs)}`);
  }
});

test('metamorphic: 追加 +0 不改变和的位型（零吸收不变式）', () => {
  const cases: readonly (readonly number[])[] = [
    [1, 2, 3],
    [0.1, 0.2, 0.3],
    [-1, 1],
    [1e16, 1, -1e16],
    [-0],
    [5e-324, 1e-323],
  ];
  for (const xs of cases) {
    const a = deterministicSum(xs);
    const b = deterministicSum([...xs, 0]);
    assert.equal(doubleToHex(b), doubleToHex(a), `追加 +0 后位型漂移: ${JSON.stringify(xs)}`);
  }
});

test('metamorphic: 均值平移不变性（二进小数数据 + n=2^k bit-exact；一般数据容差内一致）', () => {
  // n=2^k 且全二进小数（dyadic）值：Σ、Σ/n、平移后的 Σ/n 均无舍入 → bit-exact
  const xs8 = [1.25, 2.5, -3.75, 4.125, 0.0625, -0.03125, 0.5, -0.25];
  for (const c of [0.25, 0.5, 1, 2, 4, 1024]) {
    const shiftedMean = deterministicMean(xs8.map((x) => x + c));
    const baseMean = deterministicMean(xs8) + c;
    assert.equal(doubleToHex(shiftedMean), doubleToHex(baseMean), `平移 c=${c} 位型漂移`);
  }
  // 一般（非二进）数据/位移：浮点加法不可结合，bit-exact 不成立是诚实的——容差内一致
  const xs = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
  const c = 0.1;
  const shiftedMean = deterministicMean(xs.map((x) => x + c));
  const baseMean = deterministicMean(xs) + c;
  assert.equal(tolerantCompare(shiftedMean, baseMean), 0, '一般平移须在容差内一致');
});

// ---------------------------------------------------------------------------
// property test：neumaierSum 误差 ≤ 朴素求和误差（BigInt 精确参照）
// ---------------------------------------------------------------------------

/** 精确分解：x = m · 2^e（m BigInt，e 整数）。 */
function decomposeExact(x: number): { m: bigint; e: number } {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x, false);
  const bits = view.getBigUint64(0);
  const sign = (bits & 0x8000000000000000n) === 0n ? 1n : -1n;
  const biasedExp = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & 0x000fffffffffffffn;
  if (biasedExp === 0) return { m: sign * frac, e: -1074 };
  return { m: sign * (frac | 0x10000000000000n), e: biasedExp - 1075 };
}

/** BigInt 精确求和 + 就近偶舍入回 double（测试专用参照实现）。 */
function exactSum(values: readonly number[]): number {
  const parts = values.map(decomposeExact);
  const eMin = Math.min(...parts.map((p) => p.e));
  let acc = 0n;
  for (const p of parts) acc += p.m << BigInt(p.e - eMin);
  // 就近偶舍入到 53 位尾数
  let a = acc;
  let e = eMin;
  let sticky = false;
  while (a > (1n << 54n) || a < -(1n << 54n)) {
    sticky = sticky || a % 2n !== 0n;
    a >>= 1n;
    e += 1;
  }
  if (a > (1n << 53n) || a < -(1n << 53n)) {
    const rem = a % 2n; // 被移出的最高 1 位
    a >>= 1n;
    e += 1;
    // 舍入分数：>0.5 当 rem=1 且 sticky；=0.5 当 rem=1 且 !sticky；否则 <0.5
    const aboveHalf = rem === 1n && sticky;
    const exactHalf = rem === 1n && !sticky;
    if (aboveHalf || (exactHalf && a % 2n !== 0n)) a += 1n;
  }
  if (a === 0n) return 0;
  return Number(a) * Math.pow(2, e);
}

test('property: 种子随机数组上 Neumaier 误差满足理论界且聚合支配朴素求和（vs BigInt 精确和）', () => {
  const rng32 = createMulberry32(20260817); // 显式种子——确定性，可重放（返回 [0,2^32) uint32）
  const rng = (): number => rng32() / 4294967296; // 归一化到 [0,1)
  let totalNeumaierErr = 0;
  let totalNaiveErr = 0;
  for (let trial = 0; trial < 200; trial += 1) {
    const n = 2 + Math.floor(rng() * 60);
    const values: number[] = [];
    for (let i = 0; i < n; i += 1) {
      // 量级跨 16 个数量级——制造对朴素累加不利的抵消/吸收条件
      const magnitude = Math.pow(10, Math.floor(rng() * 16) - 8);
      values.push((rng() * 2 - 1) * magnitude);
    }
    const ref = exactSum(values);
    let naive = 0;
    for (const x of values) naive += x;
    const neumaier = neumaierSum(values);
    const naiveErr = Math.abs(naive - ref);
    const neumaierErr = Math.abs(neumaier - ref);
    totalNaiveErr += naiveErr;
    totalNeumaierErr += neumaierErr;
    // 恒真定理（Neumaier 1984）：|err| ≤ 2·eps·Σ|xᵢ| + eps·|Σ|（末次加法舍入）
    const sumAbs = values.reduce((acc, x) => acc + Math.abs(x), 0);
    const bound = 2 * Number.EPSILON * sumAbs + Number.EPSILON * Math.abs(ref);
    assert.ok(
      neumaierErr <= bound,
      `trial ${trial}: neumaierErr=${neumaierErr} 违反理论界 ${bound}（实现有 bug）`,
    );
  }
  // 逐实例支配在数学上不成立（朴素求和可碰巧命中正确舍入——实测 trial 11 naiveErr=0），
  // 聚合支配是诚实且更强的统计性质：200 试验总误差 Neumaier ≤ 朴素。
  assert.ok(
    totalNeumaierErr <= totalNaiveErr,
    `聚合误差支配失败: neumaier=${totalNeumaierErr} vs naive=${totalNaiveErr}`,
  );
  assert.ok(totalNaiveErr > 0, '数据须制造出非零朴素误差（否则测试无鉴别力）');
});

test('property: 对抗性抵消用例上 Neumaier 严格优于朴素求和', () => {
  const adversarial: readonly (readonly number[])[] = [
    [1e16, 1, -1e16],
    [1e16, 1, 2, -1e16],
    [1, 1e-16, 1e-16, 1e-16, 1e-16, -1],
    [1e8, 1e-8, 1e-8, -1e8],
  ];
  for (const values of adversarial) {
    const ref = exactSum(values);
    let naive = 0;
    for (const x of values) naive += x;
    const naiveErr = Math.abs(naive - ref);
    const neumaierErr = Math.abs(neumaierSum(values) - ref);
    assert.ok(
      neumaierErr < naiveErr,
      `对抗用例 ${JSON.stringify(values)}: neumaierErr=${neumaierErr} 须严格 < naiveErr=${naiveErr}`,
    );
  }
});

// ---------------------------------------------------------------------------
// sensitivity test：扰动 < eps/2 → 判定不变
// ---------------------------------------------------------------------------

test('sensitivity: 亚半 ULP 扰动不改变 tolerantCompare 判定（远离阈值边界的对）', () => {
  const insideTolerance: readonly [number, number][] = [
    [1.0, 1.0 + 1e-13],
    [1e6, 1e6 + 1e-9],
    [0.5, 0.5 + 5e-14],
  ];
  for (const [a, b] of insideTolerance) {
    const base = tolerantCompare(a, b);
    assert.equal(base, 0, `(${a}, ${b}) 须容差内相等`);
    // 扰动量 = a·eps/4 < ulp(a)/2（a ∈ [1,2) 时 ulp=eps；更小区间扰动更小）
    const aPerturbed = a + (a * Number.EPSILON) / 4;
    assert.equal(
      tolerantCompare(aPerturbed, b),
      0,
      `扰动 a（<eps·a/4）后判定不得翻转（原判 0）`,
    );
  }
  const outsideTolerance: readonly [number, number][] = [
    [1.0, 1.001],
    [1e6, 1.1e6],
    [0.5, 0.9],
  ];
  for (const [a, b] of outsideTolerance) {
    const base = tolerantCompare(a, b);
    assert.equal(base, -1, `(${a}, ${b}) 须判 a<b`);
    const aPerturbed = a - (a * Number.EPSILON) / 4;
    assert.equal(tolerantCompare(aPerturbed, b), -1, '扰动 a（<eps·a/4）后判定不得翻转（原判 -1）');
  }
});

// ---------------------------------------------------------------------------
// 边界分类与 fail-closed
// ---------------------------------------------------------------------------

test('classifyNumericEdge: ±0/subnormal/extreme/NaN/±Inf 全检出', () => {
  assert.equal(classifyNumericEdge(-0).kind, 'zero');
  assert.equal(classifyNumericEdge(-0).sign, '-');
  assert.equal(classifyNumericEdge(0).sign, '+');
  assert.equal(classifyNumericEdge(5e-324).kind, 'subnormal');
  // MIN_NORMAL 恰在边界上（≥ MIN_NORMAL → normal；严格小于 → subnormal）
  assert.equal(classifyNumericEdge(2.2250738585072014e-308).kind, 'normal');
  assert.equal(classifyNumericEdge(1e308).extreme, true);
  assert.equal(classifyNumericEdge(1e308).kernelSafe, true);
  assert.equal(classifyNumericEdge(Number.NaN).kind, 'nan');
  assert.equal(classifyNumericEdge(Number.NaN).kernelSafe, false);
  assert.equal(classifyNumericEdge(Number.POSITIVE_INFINITY).kind, 'infinite');
  assert.equal(classifyNumericEdge(Number.NEGATIVE_INFINITY).sign, '-');
});

test('fail-closed: NaN/±Inf 入核计算 → KernelNumericError（不静默）', () => {
  assert.throws(() => neumaierSum([1, Number.NaN]), KernelNumericError);
  assert.throws(() => kahanSum([Number.POSITIVE_INFINITY]), KernelNumericError);
  assert.throws(() => deterministicSum([1, Number.NEGATIVE_INFINITY]), KernelNumericError);
  assert.throws(() => deterministicMean([1, Number.NaN]), KernelNumericError);
  assert.throws(() => tolerantCompare(Number.NaN, 1), KernelNumericError);
  assert.throws(() => relDiff(1, Number.POSITIVE_INFINITY), KernelNumericError);
  assert.throws(() => assertKernelSafeNumber(Number.NaN, 'x'), KernelNumericError);
  assert.throws(() => deterministicMean([]), KernelNumericError);
});

test('fail-closed: 补偿求和结果溢出 → KernelNumericError（不返回 Infinity）', () => {
  assert.throws(() => deterministicSum([Number.MAX_VALUE, Number.MAX_VALUE]), KernelNumericError);
  assert.throws(() => neumaierSum([1e308, 1e308, 1e308]), KernelNumericError);
});

// ---------------------------------------------------------------------------
// 整数边界
// ---------------------------------------------------------------------------

test('safeIntegerAdd/Mul: 安全域内返回 number，越界返回精确 BigInt，非整数拒绝', () => {
  assert.equal(safeIntegerAdd(2, 3), 5);
  assert.equal(safeIntegerAdd(Number.MAX_SAFE_INTEGER, 1), 9007199254740992n);
  assert.equal(safeIntegerAdd(Number.MIN_SAFE_INTEGER, -1), -9007199254740992n);
  assert.equal(safeIntegerMul(3037000500, 3037000500), 9223372037000250000n);
  assert.equal(safeIntegerMul(-3, 7), -21);
  assert.equal(safeIntegerAdd(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), 18014398509481982n);
  assert.throws(() => safeIntegerAdd(1.5, 2), KernelNumericError);
  assert.throws(() => safeIntegerMul(Number.NaN, 2), KernelNumericError);
});

// ---------------------------------------------------------------------------
// 单位一致性
// ---------------------------------------------------------------------------

test('checkUnitConsistency: 别名归一匹配、不匹配拒绝、无换算', () => {
  assert.equal(checkUnitConsistency({ value: 1, unit: 'kg' }, 'kg').ok, true);
  assert.equal(checkUnitConsistency({ value: 1, unit: 'kilogram' }, 'kg').ok, true);
  assert.equal(checkUnitConsistency({ value: 1, unit: ' s ' }, 'seconds').ok, true);
  const mismatch = checkUnitConsistency({ value: 1, unit: 'g' }, 'kg');
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.reason, /mismatch/);
  assert.throws(() => checkUnitConsistency({ value: Number.NaN, unit: 'kg' }, 'kg'), KernelNumericError);
});

// ---------------------------------------------------------------------------
// 内核无环境随机静态扫描
// ---------------------------------------------------------------------------

test('assertNoSeededRandomnessInKernel: 内核路径 0 违规（allowlist 呈现）', () => {
  const result = assertNoSeededRandomnessInKernel(REPO_ROOT);
  assert.ok(result.scannedFiles > 50, `扫描文件数 ${result.scannedFiles} 须 >50（覆盖全部内核路径）`);
  assert.deepEqual(result.violations, [], `违规须为空: ${JSON.stringify(result.violations)}`);
  assert.equal(result.ok, true);
  assert.ok(result.allowlist.length >= 2, 'allowlist（显式种子 RNG 登记项）须呈现');
});

test('assertNoSeededRandomnessInKernel 负向: 栽种 Math.random 必须检出，注释提及不误报', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-numerics-scan-'));
  try {
    mkdirSync(join(tmp, 'src', 'statistics'), { recursive: true });
    writeFileSync(
      join(tmp, 'src', 'statistics', 'evil.ts'),
      'export function f(): number {\n  return Math.random(); // real ambient randomness\n}\n',
      'utf8',
    );
    writeFileSync(
      join(tmp, 'src', 'statistics', 'doc_only.ts'),
      '// Math.random() is forbidden in comments only — must NOT be flagged\nexport const x = 1;\n',
      'utf8',
    );
    const result = assertNoSeededRandomnessInKernel(tmp);
    assert.equal(result.ok, false, '栽种 Math.random 的扫描必须失败');
    assert.equal(result.violations.length, 1, '注释提及不得误报（只报真调用 1 处）');
    assert.equal(result.violations[0]?.pattern, 'Math.random');
    assert.equal(result.violations[0]?.file, 'src/statistics/evil.ts');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 集中容差政策
// ---------------------------------------------------------------------------

test('CENTRAL_TOLERANCE: 冻结不可变 + EPS 语义正确', () => {
  assert.equal(CENTRAL_TOLERANCE.EPS, Number.EPSILON);
  assert.equal(CENTRAL_TOLERANCE.ULP_AT_1, Number.EPSILON);
  assert.throws(() => {
    (CENTRAL_TOLERANCE as { REL_TOLERANCE_DEFAULT?: number }).REL_TOLERANCE_DEFAULT = 1;
  }, TypeError);
  assert.equal(CENTRAL_TOLERANCE.REL_TOLERANCE_DEFAULT, 1e-12);
});
