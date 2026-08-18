// src/math/theory_tools.ts
// 职责：EXP-THEORY-001 理论工具的维度/符号/假设检查（机器层）。
//
// 宪法条款：理论工具可包括 dimensional analysis / symbolic algebra /
// scaling-law analysis / limiting cases / conservation-invariance checks /
// theorem-proof assistant adapters / causal graph checks；工具输出需要声明
// 算法边界和未验证假设；Acceptance：known examples、counterexamples、
// unit errors 和 symbolic/numeric cross-checks 通过。
//
// 机制：
//   维度引擎      SI 7 基本量纲向量（L M T I Θ N J）上的四则/幂运算——
//                evalDims 递归求表达式的量纲向量；加法项量纲必须齐次
//                （unit error 检出的核心）；等式两侧量纲必须相等
//   Buckingham   isDimensionless：幂乘积净量纲为零向量 → 无量纲群
//   工具清单      THEORY_TOOL_INVENTORY：7 类工具各声明 algorithmBoundary
//                + unverifiedAssumptions（显式未验证假设）+ knownExamples
//                + counterexamples（反例——工具必须拒绝）
//   清单校验      validateTheoryToolInventory：边界非空、假设 ≥1、已知例
//                ≥1、反例 ≥1——缺任何一面即不合格（无反例的工具不可信）
//   数值交叉核对  numericCrossCheck：符号恒等式在采样点上的数值一致性
//                （symbolic/numeric cross-check 的机器面）
//
// Cannot-prove：本机制证明「量纲算术正确执行、工具清单四要素齐全、数值
// 交叉核对按给定函数与采样点计算」，不证明 (a) 量纲一致蕴含物理正确
// （量纲分析可证伪错误模型但不可证实正确模型——v* 系数错误量纲照样齐次）；
// (b) unverifiedAssumptions 清单完备（未列出的假设照样未验证）；
// (c) numericCrossCheck 的函数实现与被核对的数学对象一致（那是调用方
// 的映射责任）。

// ---------------------------------------------------------------------------
// 维度引擎（SI 7 基本量纲）
// ---------------------------------------------------------------------------

export const SI_BASE_DIMENSIONS = ['L', 'M', 'T', 'I', 'Theta', 'N', 'J'] as const;
export type SiBaseDimension = (typeof SI_BASE_DIMENSIONS)[number];
/** 量纲向量：[L, M, T, I, Θ, N, J] 的有理幂指数。 */
export type DimVector = readonly [number, number, number, number, number, number, number];

export const DIMENSIONLESS: DimVector = [0, 0, 0, 0, 0, 0, 0];

/** 常用量纲（测试与调用方的速查——非封闭清单）。 */
export const COMMON_DIMS: Readonly<Record<string, DimVector>> = {
  length: [1, 0, 0, 0, 0, 0, 0],
  mass: [0, 1, 0, 0, 0, 0, 0],
  time: [0, 0, 1, 0, 0, 0, 0],
  current: [0, 0, 0, 1, 0, 0, 0],
  temperature: [0, 0, 0, 0, 1, 0, 0],
  velocity: [1, 0, -1, 0, 0, 0, 0],
  acceleration: [1, 0, -2, 0, 0, 0, 0],
  force: [1, 1, -2, 0, 0, 0, 0],
  energy: [2, 1, -2, 0, 0, 0, 0],
  power: [2, 1, -3, 0, 0, 0, 0],
  frequency: [0, 0, -1, 0, 0, 0, 0],
};

/** 量纲表达式树（加/乘/除/幂/常量/物理量）。 */
export type DimExpr =
  | { readonly kind: 'quantity'; readonly name: string; readonly dims: DimVector }
  | { readonly kind: 'constant'; readonly value: number }
  | { readonly kind: 'sum'; readonly terms: readonly DimExpr[] }
  | { readonly kind: 'product'; readonly factors: readonly DimExpr[] }
  | { readonly kind: 'ratio'; readonly numerator: DimExpr; readonly denominator: DimExpr }
  | { readonly kind: 'power'; readonly base: DimExpr; readonly exponent: number };

function addDims(a: DimVector, b: DimVector): DimVector {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3], a[4] + b[4], a[5] + b[5], a[6] + b[6]];
}

function scaleDims(a: DimVector, k: number): DimVector {
  return [a[0] * k, a[1] * k, a[2] * k, a[3] * k, a[4] * k, a[5] * k, a[6] * k];
}

export function dimsEqual(a: DimVector, b: DimVector): boolean {
  return SI_BASE_DIMENSIONS.every((_, i) => Math.abs(a[i]! - b[i]!) < 1e-9);
}

export type DimEvalResult =
  | { readonly ok: true; readonly dims: DimVector }
  | { readonly ok: false; readonly problem: string };

/** 递归求量纲：加法齐次性 + 除零量纲 + 非常数幂拒绝（fail-closed）。 */
export function evalDims(expr: DimExpr): DimEvalResult {
  switch (expr.kind) {
    case 'quantity':
      return { ok: true, dims: expr.dims };
    case 'constant':
      return { ok: true, dims: DIMENSIONLESS };
    case 'sum': {
      if (expr.terms.length === 0) return { ok: false, problem: 'sum with no terms' };
      const first = evalDims(expr.terms[0]!);
      if (!first.ok) return first;
      for (let i = 1; i < expr.terms.length; i += 1) {
        const t = evalDims(expr.terms[i]!);
        if (!t.ok) return t;
        if (!dimsEqual(first.dims, t.dims)) {
          return { ok: false, problem: `dimensional inhomogeneity in sum: term 0 has [${first.dims}] but term ${i} has [${t.dims}] — adding unlike quantities is a unit error` };
        }
      }
      return { ok: true, dims: first.dims };
    }
    case 'product': {
      let acc: DimVector = DIMENSIONLESS;
      for (const f of expr.factors) {
        const r = evalDims(f);
        if (!r.ok) return r;
        acc = addDims(acc, r.dims);
      }
      return { ok: true, dims: acc };
    }
    case 'ratio': {
      const n = evalDims(expr.numerator);
      if (!n.ok) return n;
      const d = evalDims(expr.denominator);
      if (!d.ok) return d;
      return { ok: true, dims: addDims(n.dims, scaleDims(d.dims, -1)) };
    }
    case 'power': {
      if (!Number.isFinite(expr.exponent)) {
        return { ok: false, problem: 'power exponent must be a finite number' };
      }
      const b = evalDims(expr.base);
      if (!b.ok) return b;
      return { ok: true, dims: scaleDims(b.dims, expr.exponent) };
    }
  }
}

/** 等式量纲齐次检查：lhs 与 rhs 量纲相等才通过。 */
export function dimensionHomogeneous(lhs: DimExpr, rhs: DimExpr): DimEvalResult {
  const l = evalDims(lhs);
  if (!l.ok) return l;
  const r = evalDims(rhs);
  if (!r.ok) return r;
  if (!dimsEqual(l.dims, r.dims)) {
    return { ok: false, problem: `equation dimensionally inconsistent: lhs is [${l.dims}] but rhs is [${r.dims}] — unit error` };
  }
  return { ok: true, dims: l.dims };
}

/** Buckingham π：表达式净量纲为零向量 → 无量纲群。 */
export function isDimensionless(expr: DimExpr): boolean {
  const r = evalDims(expr);
  return r.ok && dimsEqual(r.dims, DIMENSIONLESS);
}

// ---------------------------------------------------------------------------
// 工具清单：7 类理论工具（宪法原文枚举）
// ---------------------------------------------------------------------------

export const THEORY_TOOL_IDS = [
  'dimensional-analysis',
  'symbolic-algebra',
  'scaling-law-analysis',
  'limiting-cases',
  'conservation-invariance-checks',
  'proof-assistant-adapter',
  'causal-graph-checks',
] as const;
export type TheoryToolId = (typeof THEORY_TOOL_IDS)[number];

export interface TheoryToolSpec {
  readonly toolId: TheoryToolId;
  /** 算法边界声明：该工具能检查什么、不能检查什么。 */
  readonly algorithmBoundary: string;
  /** 未验证假设（显式列出——工具输出不证明这些假设成立）。 */
  readonly unverifiedAssumptions: readonly string[];
  /** 已知例（工具必须正确处理——回归面）。 */
  readonly knownExamples: readonly string[];
  /** 反例（工具必须拒绝——无反例的工具不可信）。 */
  readonly counterexamples: readonly string[];
}

export const THEORY_TOOL_INVENTORY: readonly TheoryToolSpec[] = [
  {
    toolId: 'dimensional-analysis',
    algorithmBoundary: 'checks SI base-dimension homogeneity of sums/equations and dimensionless groups; cannot detect wrong dimensionless coefficients or missing terms of matching dimensions',
    unverifiedAssumptions: ['declared dimension vectors of quantities are correct', 'all relevant quantities appear in the expression'],
    knownExamples: ['F = m*a → [M L T^-2] both sides', 'E = h*f → [M L^2 T^-2] both sides'],
    counterexamples: ['x = v*t + a*t (last term missing square — dimension error must be caught)', 'adding meters to seconds'],
  },
  {
    toolId: 'symbolic-algebra',
    algorithmBoundary: 'term rewriting and simplification per declared rewrite rules; completeness of the rewrite system is not guaranteed',
    unverifiedAssumptions: ['rewrite rules are confluent for the given term set'],
    knownExamples: ['(a+b)^2 expands to a^2+2ab+b^2'],
    counterexamples: ['sqrt(a^2) = a fails for negative a — unrestricted rewrite must be refused'],
  },
  {
    toolId: 'scaling-law-analysis',
    algorithmBoundary: 'derives scaling exponents from dimensional balance; cannot validate the functional FORM (power law assumption) from dimensions alone',
    unverifiedAssumptions: ['the relation is a power law in the considered variables'],
    knownExamples: ['pendulum period ~ sqrt(L/g)'],
    counterexamples: ['assuming T ~ L instead of sqrt(L) — exponent mismatch must be flagged'],
  },
  {
    toolId: 'limiting-cases',
    algorithmBoundary: 'evaluates declared limits of expressions; cannot discover which limits are physically relevant',
    unverifiedAssumptions: ['the expression is valid in the neighborhood of the limit point'],
    knownExamples: ['relativistic KE reduces to (1/2)m v^2 as v/c → 0'],
    counterexamples: ['taking x→0 of 1/x — divergence must be flagged, not silently evaluated'],
  },
  {
    toolId: 'conservation-invariance-checks',
    algorithmBoundary: 'checks declared invariants under declared transformations; undeclared symmetries are invisible',
    unverifiedAssumptions: ['the transformation group is fully enumerated'],
    knownExamples: ['energy conservation across an elastic collision'],
    counterexamples: ['claiming invariance for a non-conserved quantity must be rejected'],
  },
  {
    toolId: 'proof-assistant-adapter',
    algorithmBoundary: 'submits claims to an external proof assistant (Dafny/SMT backends in src/math/) and returns verdicts; soundness is delegated to the backend, this layer adds no guarantees',
    unverifiedAssumptions: ['backend version is sound', 'axiomatization faithfully models the target domain'],
    knownExamples: ['proved lemma accepted with proof script'],
    counterexamples: ['claim without proof script must be rejected (unproved is not proved)'],
  },
  {
    toolId: 'causal-graph-checks',
    algorithmBoundary: 'checks d-separation/acyclicity/identifiability on the SUPPLIED graph; cannot validate that the graph matches reality',
    unverifiedAssumptions: ['causal graph structure is correct as supplied'],
    knownExamples: ['backdoor adjustment identifies effect given the supplied DAG'],
    counterexamples: ['cycle in a claimed DAG must be rejected'],
  },
];

export type InventoryValidation =
  | { readonly ok: true; readonly tools: number }
  | { readonly ok: false; readonly problems: readonly string[] };

/** 清单校验：7 工具齐全 + 每工具四要素（边界/假设/已知例/反例）非空。 */
export function validateTheoryToolInventory(inventory: readonly TheoryToolSpec[] = THEORY_TOOL_INVENTORY): InventoryValidation {
  const problems: string[] = [];
  const ids = new Set(inventory.map((t) => t.toolId));
  for (const id of THEORY_TOOL_IDS) {
    if (!ids.has(id)) problems.push(`tool "${id}" missing from inventory`);
  }
  for (const t of inventory) {
    if (t.algorithmBoundary.trim().length === 0) problems.push(`[${t.toolId}] algorithmBoundary empty`);
    if (t.unverifiedAssumptions.length === 0) problems.push(`[${t.toolId}] unverifiedAssumptions must list at least one`);
    if (t.knownExamples.length === 0) problems.push(`[${t.toolId}] knownExamples must list at least one`);
    if (t.counterexamples.length === 0) problems.push(`[${t.toolId}] counterexamples must list at least one — a tool untested against counterexamples is not trustworthy`);
  }
  return problems.length === 0 ? { ok: true, tools: inventory.length } : { ok: false, problems };
}

// ---------------------------------------------------------------------------
// 符号/数值交叉核对
// ---------------------------------------------------------------------------

export type CrossCheckResult =
  | { readonly ok: true; readonly points: number; readonly maxAbsDiff: number }
  | { readonly ok: false; readonly failedAt: readonly number[]; readonly maxAbsDiff: number };

/**
 * 数值交叉核对：声称 lhs(x) === rhs(x) 的符号恒等式在采样点上数值核对。
 * 任一点差超过容差 → 失败并列出失败点（symbolic/numeric cross-check 面）。
 */
export function numericCrossCheck(
  lhs: (x: number) => number,
  rhs: (x: number) => number,
  points: readonly number[] = [0.1, 0.5, 1, 2, 10],
  tolerance: number = 1e-9,
): CrossCheckResult {
  if (points.length === 0) return { ok: false, failedAt: [], maxAbsDiff: Number.NaN };
  const failedAt: number[] = [];
  let maxAbsDiff = 0;
  for (const x of points) {
    const diff = Math.abs(lhs(x) - rhs(x));
    if (diff > maxAbsDiff) maxAbsDiff = diff;
    if (diff > tolerance) failedAt.push(x);
  }
  return failedAt.length === 0 ? { ok: true, points: points.length, maxAbsDiff } : { ok: false, failedAt, maxAbsDiff };
}
