// tests/math/theory_tools.test.ts
// EXP-THEORY-001：量纲引擎（齐次/等式/无量纲群）、工具清单四要素校验、
// 已知例+反例、数值交叉核对。纯函数，无 mock。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  COMMON_DIMS,
  DIMENSIONLESS,
  THEORY_TOOL_IDS,
  THEORY_TOOL_INVENTORY,
  dimensionHomogeneous,
  dimsEqual,
  evalDims,
  isDimensionless,
  numericCrossCheck,
  validateTheoryToolInventory,
} from '../../src/math/theory_tools.ts';
import type { DimExpr } from '../../src/math/theory_tools.ts';

const q = (name: keyof typeof COMMON_DIMS): DimExpr => ({ kind: 'quantity', name, dims: COMMON_DIMS[name] ?? DIMENSIONLESS });
const prod = (...factors: DimExpr[]): DimExpr => ({ kind: 'product', factors });
const ratio = (numerator: DimExpr, denominator: DimExpr): DimExpr => ({ kind: 'ratio', numerator, denominator });
const sum = (...terms: DimExpr[]): DimExpr => ({ kind: 'sum', terms });

test('EXP-THEORY-001: 量纲引擎——乘除幂正确传播 + 加法齐次性检出 unit error', () => {
  // v*t 与 (1/2)*a*t^2 同为长度 → 位移求和合法
  const vt = prod(q('velocity'), q('time'));
  const at2 = prod(q('acceleration'), { kind: 'power', base: q('time'), exponent: 2 });
  const okSum = evalDims(sum(vt, at2));
  assert.equal(okSum.ok, true);
  if (okSum.ok) assert.ok(dimsEqual(okSum.dims, COMMON_DIMS['length'] ?? DIMENSIONLESS));

  // 反例：位移 + 时间（米加秒——经典 unit error）→ 检出
  const bad = evalDims(sum(vt, q('time')));
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.problem, /dimensional inhomogeneity in sum/);

  // 比率：force/mass → 加速度
  const a2 = evalDims(ratio(q('force'), q('mass')));
  assert.equal(a2.ok, true);
  if (a2.ok) assert.ok(dimsEqual(a2.dims, COMMON_DIMS['acceleration'] ?? DIMENSIONLESS));

  // 非有限幂 → fail-closed
  assert.equal(evalDims({ kind: 'power', base: q('length'), exponent: Number.NaN }).ok, false);
});

test('EXP-THEORY-001: 等式量纲检查——F=ma 过 / 缺平方项的运动学反例被拒', () => {
  // 已知例：F = m*a
  const ok = dimensionHomogeneous(q('force'), prod(q('mass'), q('acceleration')));
  assert.equal(ok.ok, true);
  // 已知例：E = h*f 两侧均为能量（h 的量纲按 energy/frequency 展开）
  const planck = ratio(q('energy'), q('frequency'));  const e = dimensionHomogeneous(q('energy'), prod(planck, q('frequency')));
  assert.equal(e.ok, true);

  // 反例：x = v*t + a*t（末项漏了平方——时间量纲与长度相加）→ 拒
  const truncated = sum(prod(q('velocity'), q('time')), prod(q('acceleration'), q('time')));
  const bad = dimensionHomogeneous(q('length'), truncated);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.problem, /unit error|inhomogeneity/);
  // 反例：功率写成能量（差一个时间量纲）→ 拒
  const p = dimensionHomogeneous(q('power'), q('energy'));
  assert.equal(p.ok, false);
});

test('EXP-THEORY-001: Buckingham 无量纲群——L/T 比对速度商为零向量判据', () => {
  // (v * T) / L → 无量纲
  const group = ratio(prod(q('velocity'), q('time')), q('length'));
  assert.equal(isDimensionless(group), true);
  // v^2 * L / (能量) → 无量纲（动能比）
  const ke = ratio(prod({ kind: 'power' as const, base: q('velocity'), exponent: 2 }, q('mass')), q('energy'));
  assert.equal(isDimensionless(ke), true);
  // 有量纲表达式
  assert.equal(isDimensionless(q('velocity')), false);
  assert.ok(dimsEqual(DIMENSIONLESS, [0, 0, 0, 0, 0, 0, 0]));
});

test('EXP-THEORY-001: 工具清单——7 工具齐全 + 四要素（边界/假设/已知例/反例）非空 + 残缺清单被拒', () => {
  assert.equal(THEORY_TOOL_IDS.length, 7);
  const v = validateTheoryToolInventory();
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.tools, 7);
  // 每个工具的声明面完整
  for (const t of THEORY_TOOL_INVENTORY) {
    assert.ok(t.algorithmBoundary.length > 20, `[${t.toolId}] 边界声明过短`);
    assert.ok(t.unverifiedAssumptions.length >= 1);
    assert.ok(t.knownExamples.length >= 1);
    assert.ok(t.counterexamples.length >= 1, `[${t.toolId}] 无反例的工具不可信`);
  }
  // 残缺清单：去掉反例 → 拒
  const mutilated = THEORY_TOOL_INVENTORY.map((t) => ({ ...t, counterexamples: [] }));
  const bad = validateTheoryToolInventory(mutilated);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.problems.some((p) => p.includes('counterexamples must list at least one')));
  // 缺工具 → 拒
  const missing = THEORY_TOOL_INVENTORY.slice(0, 6);
  assert.equal(validateTheoryToolInventory(missing).ok, false);
});

test('EXP-THEORY-001: 符号/数值交叉核对——恒等式全点过 / 微扰式失败并列失败点', () => {
  // (x-1)^2 = x^2 - 2x + 1 恒等 → 全部采样点过
  const identity = numericCrossCheck((x) => (x - 1) ** 2, (x) => x * x - 2 * x + 1);
  assert.equal(identity.ok, true);
  if (identity.ok) assert.ok(identity.maxAbsDiff < 1e-9);

  // 微扰式（+1e-3 常数差）→ 失败且失败点齐全
  const perturbed = numericCrossCheck((x) => (x - 1) ** 2, (x) => x * x - 2 * x + 1.001);
  assert.equal(perturbed.ok, false);
  if (!perturbed.ok) assert.equal(perturbed.failedAt.length, 5);

  // 自定义采样点 + 容差
  const loose = numericCrossCheck((x) => x, (x) => x + 1e-6, [1, 2], 1e-3);
  assert.equal(loose.ok, true);
  // 空采样点 → fail-closed
  const empty = numericCrossCheck((x) => x, (x) => x, []);
  assert.equal(empty.ok, false);
});
