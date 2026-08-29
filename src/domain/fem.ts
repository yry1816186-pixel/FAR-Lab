import { z } from 'zod';
import { RunId, PlanId, TaskId, HypothesisId, ExperimentSpecId } from './ids.js';
import { BindingApproval, ComputeProfile, type ExperimentVerdict } from './experiment.js';
import { DecisionRuleProvenance } from './hypothesis.js';
import { checkIdentityExpression, THEORY_FUNCTION_WHITELIST } from './theory.js';

/**
 * Slice-6 numerical-PDE experiment domain — the numerical_simulation falsification
 * path (AOSSA convergence, scenario A). A plan step whose discriminating content
 * is a computational PDE claim gets a preregistered verification HERE:
 *
 *  - the manufactured solution is EXPRESSION DATA under the SAME closed
 *    whitelist as the theory leg (expressions-as-data discipline, D-086-5);
 *  - sympy derives f = -Δu and the Neumann fluxes exactly in the sidecar, so
 *    the measured error is pure discretization error;
 *  - the refinement ladder, error norms and expected orders are PREREGISTERED
 *    before any number is computed; execution binds to a spec hash;
 *  - verdicts derive MECHANICALLY from the observed convergence orders against
 *    the theoretical P1 rates (L2 order 2, H1 order 1) — an LLM never produces
 *    one (it only DRAFTS the manufactured solution + boundary split inside the
 *    closed spaces below);
 *  - HONESTY CEILING: this verifies the discretization + assembly of the stated
 *    weak form on the unit square with uniform P1 refinement — it is NOT a
 *    solver certification for other geometries/elements/adaptive schemes.
 */

/** Boundary kind per unit-square edge. */
export const FemEdgeKind = z.enum(['dirichlet', 'neumann']);
export type FemEdgeKind = z.infer<typeof FemEdgeKind>;

export const FemBoundarySplit = z.object({
  bottom: FemEdgeKind,
  top: FemEdgeKind,
  left: FemEdgeKind,
  right: FemEdgeKind,
}).superRefine((e, ctx) => {
  if (e.bottom === 'neumann' && e.top === 'neumann' && e.left === 'neumann' && e.right === 'neumann') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'pure-Neumann Poisson is ill-posed up to a constant — at least one Dirichlet edge is required',
    });
  }
});
export type FemBoundarySplit = z.infer<typeof FemBoundarySplit>;

/** Preregistered uniform refinement ladder (strictly increasing, bounded). */
export const FEM_LEVELS_MIN = 3;
export const FEM_LEVELS_MAX = 6;
export const FEM_N_MIN = 2;
export const FEM_N_MAX = 256;

/** Tolerance on the observed-vs-theoretical convergence order (deterministic, disclosed). */
export const FEM_ORDER_TOLERANCE = 0.25;

/** Theoretical P1 rates on quasi-uniform meshes (Ciarlet; fixed, never model-chosen). */
export const FEM_EXPECTED_L2_ORDER = 2.0;
export const FEM_EXPECTED_H1_ORDER = 1.0;

export const FemSpec = z.object({
  id: ExperimentSpecId,
  runId: RunId,
  planId: PlanId,
  planStepId: TaskId,
  version: z.number().int().nonnegative().default(1),
  question: z.string().min(1),
  experimentType: z.literal('numerical_pde'),
  /** The PDE being verified (closed vocabulary; one well-posed case today). */
  pde: z.object({ kind: z.literal('poisson_2d_mixed') }),
  /** Domain: the unit square [0,1]^2 (the sidecar implements exactly this). */
  domain: z.literal('unit_square'),
  /** Manufactured solution u — closed-space expression DATA over {x, y}. */
  manufacturedSolution: z.string().min(1).max(300),
  boundary: FemBoundarySplit,
  /** Uniform refinement ladder: element counts per side (n x n squares, 2n triangles). */
  levels: z.array(z.number().int().min(FEM_N_MIN).max(FEM_N_MAX)).min(FEM_LEVELS_MIN).max(FEM_LEVELS_MAX),
  errorNorms: z.array(z.enum(['l2', 'h1'])).default(['l2', 'h1']),
  /** Optional hypothesis binding (methodological verification claims). */
  hypothesisId: HypothesisId.optional(),
  thresholdProvenance: DecisionRuleProvenance,
  compute: ComputeProfile.default({}),
  approvals: z.array(BindingApproval).default([]),
  /** Required when no hypothesis is bound (exploratory verification is explicit, never silent). */
  exploratoryNote: z.string().min(10).optional(),
  validation: z.object({
    passed: z.boolean(),
    missing: z.array(z.string()).default([]),
  }).optional(),
  createdAt: z.string().datetime(),
}).superRefine((s, ctx) => {
  const gridNames = new Set(['x', 'y']);
  const err = checkIdentityExpression(s.manufacturedSolution, gridNames);
  if (err !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['manufacturedSolution'],
      message: `manufactured solution: ${err} (variables are x and y; whitelisted functions: ${THEORY_FUNCTION_WHITELIST.join(', ')})`,
    });
  }
  if (s.levels.some((n, i) => i > 0 && n <= s.levels[i - 1]!)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['levels'],
      message: 'levels must be a strictly increasing refinement ladder',
    });
  }
});
export type FemSpec = z.infer<typeof FemSpec>;

/**
 * Fail-closed FEM spec validation (the analogue of checkTheorySpec): expression
 * admission, cross-reference integrity, approval/exploratory honesty gates.
 * Numbers are never checked here — nothing is computed until execution.
 */
export const checkFemSpec = (
  spec: FemSpec,
  ctx: { hypothesisIds: readonly HypothesisId[] },
): { passed: boolean; missing: string[] } => {
  const missing: string[] = [];
  const hypSet = new Set(ctx.hypothesisIds);
  const err = checkIdentityExpression(spec.manufacturedSolution, new Set(['x', 'y']));
  if (err !== null) missing.push(`manufacturedSolution: ${err}`);
  if (spec.hypothesisId !== undefined) {
    if (!hypSet.has(spec.hypothesisId)) missing.push(`hypothesisId ${spec.hypothesisId} not in run`);
    const covered = spec.approvals.some(
      (a) => a.hypothesisId === spec.hypothesisId && a.comparisonIds.length > 0,
    );
    if (!covered) missing.push('hypothesis-bound spec lacks a covering binding approval (D-085 P0-1)');
  }
  if (spec.hypothesisId === undefined && spec.exploratoryNote === undefined) {
    missing.push('no hypothesis binding and no exploratoryNote — exploratory runs must be explicit');
  }
  return { passed: missing.length === 0, missing };
};

/** Sidecar measurement shape (op fem_poisson_2d). */
export interface FemMeasurement {
  manufactured: string;
  forcing: string;
  edges: Record<string, string>;
  levels: Array<{
    n: number;
    h: number;
    ndof: number;
    solveMs: number;
    nonFinite: boolean;
    l2Err?: number;
    h1Err?: number;
  }>;
  l2Orders: number[];
  h1Orders: number[];
  expectedL2Order: number;
  expectedH1Order: number;
}

/**
 * Mechanical verdict: the preregistered claim is "the P1 discretization of the
 * stated weak form with mixed boundary assembly converges at the optimal
 * asymptotic order on the refinement ladder".
 *
 *  - supports: errors strictly decrease across ALL level pairs AND the FINAL
 *    observed order is within FEM_ORDER_TOLERANCE of the expected rate
 *    (allowing pre-asymptotic coarse levels to lag);
 *  - falsifies: an observed order an entire rate or more below theory (order
 *    lost), or any non-decreasing error pair;
 *  - insufficient_data: non-finite results or too few usable pairs.
 */
export const femConvergenceVerdict = (m: FemMeasurement): Extract<ExperimentVerdict, 'supports' | 'falsifies' | 'insufficient_data'> => {
  const usable = m.levels.filter((lv) => !lv.nonFinite && lv.l2Err !== undefined && lv.h1Err !== undefined);
  if (usable.length < FEM_LEVELS_MIN - 1) return 'insufficient_data';
  const decreasing = (key: 'l2Err' | 'h1Err'): boolean =>
    usable.every((lv, i) => i === 0 || (lv[key] as number) < (usable[i - 1]![key] as number));
  if (!decreasing('l2Err') || !decreasing('h1Err')) return 'falsifies';
  const lastL2 = m.l2Orders[m.l2Orders.length - 1];
  const lastH1 = m.h1Orders[m.h1Orders.length - 1];
  if (lastL2 === undefined || lastH1 === undefined) return 'insufficient_data';
  const okL2 = lastL2 >= FEM_EXPECTED_L2_ORDER - FEM_ORDER_TOLERANCE;
  const okH1 = lastH1 >= FEM_EXPECTED_H1_ORDER - FEM_ORDER_TOLERANCE;
  if (!okL2 || !okH1) {
    if (lastL2 < FEM_EXPECTED_L2_ORDER - 1.0 || lastH1 < FEM_EXPECTED_H1_ORDER - 1.0) return 'falsifies';
    return 'insufficient_data';
  }
  return 'supports';
};
