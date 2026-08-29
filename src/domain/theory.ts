import { z } from 'zod';
import { RunId, PlanId, TaskId, HypothesisId, ExperimentSpecId } from './ids.js';
import { BindingApproval, ComputeProfile, type ExperimentVerdict } from './experiment.js';
import { DecisionRuleProvenance } from './hypothesis.js';

/**
 * Slice-5: theory_identity experiment domain — the theory-type falsification
 * path. A plan whose falsifiable content is a claimed closed-form identity
 * gets it preregistered HERE (expressions as DATA, D-086-5 discipline) and
 * checked NUMERICALLY on a preregistered grid by the sidecar's whitelisted-AST
 * `identity_check` op. Discipline ported verbatim from the meta path (W-F M3):
 *
 * - the analysis is PREREGISTERED (grid, expressions, tolerance) before any
 *   number is computed; execution binds to a spec hash;
 * - verdicts derive mechanically from max |lhs-rhs| vs tolerance — an LLM
 *   never produces one (it only DRAFTS the spec inside the closed expression
 *   space below);
 * - hypothesis-bound claims require a covering human approval;
 * - HONESTY CEILING: a grid evaluation is a numerical spot-check, never a
 *   symbolic proof — every report and rendering must say so.
 */

/** Closed function whitelist — mirrors op_identity_check in experiment-runtime ops.py exactly. */
export const THEORY_FUNCTION_WHITELIST = [
  'exp', 'log', 'log2', 'log10', 'sqrt',
  'sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh',
  'arcsin', 'arccos', 'arctan', 'arctan2',
  'abs', 'floor', 'ceil', 'min', 'max',
] as const;

/** Numeric constants the expressions may name without declaring them as grid variables. */
const THEORY_CONSTANTS = new Set(['pi', 'e']);

/**
 * Grid points per variable, keyed by the number of grid variables (deterministic:
 * the draft LLM never picks resolution). Products stay under the 20k cap.
 */
export const THEORY_GRID_POINTS: Readonly<Record<number, number>> = { 1: 41, 2: 23, 3: 13, 4: 9 };

/** Preregistered default tolerance for drafted claims (deterministic, disclosed — never model-chosen). */
export const THEORY_DEFAULT_TOLERANCE = 1e-6;

/** Cap on total grid points a spec may declare (the executor and the sidecar both enforce it). */
export const THEORY_GRID_POINT_CAP = 20_000;

/** Identifiers an expression names (deduplicated, order of first appearance). */
export const freeIdentifiersOf = (expr: string): string[] => [...new Set(expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])];

/**
 * Deterministic lexical admission gate (first gate; the sidecar's AST whitelist
 * is the authoritative second gate — a leak here fails closed at execution).
 */
export const checkIdentityExpression = (expr: string, gridNames: ReadonlySet<string>): string | null => {
  if (expr.length === 0 || expr.length > 300) return 'expression length must be 1..300';
  if (!/^[A-Za-z0-9_+\-*/%().,\s]+$/.test(expr)) {
    return 'expression may contain only identifiers, numbers, + - * / % ( ) , and whitespace';
  }
  let depth = 0;
  for (const ch of expr) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (depth < 0) return 'unbalanced parentheses';
  }
  if (depth !== 0) return 'unbalanced parentheses';
  const functions: readonly string[] = THEORY_FUNCTION_WHITELIST;
  for (const id of freeIdentifiersOf(expr)) {
    if (THEORY_CONSTANTS.has(id) || functions.includes(id)) continue;
    if (!gridNames.has(id)) return `identifier '${id}' is neither a grid variable nor a whitelisted function/constant`;
  }
  return null;
};

export const TheoryVariable = z.object({
  name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/, 'variable name must be a plain identifier'),
  low: z.number().finite(),
  high: z.number().finite(),
  /** Grid resolution along this variable (inclusive endpoints; linspace). */
  n: z.number().int().min(2).max(201),
}).superRefine((v, ctx) => {
  if (!(v.high > v.low)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `variable ${v.name}: high must exceed low` });
  if (THEORY_CONSTANTS.has(v.name)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `variable name ${v.name} collides with a whitelisted constant` });
  }
});
export type TheoryVariable = z.infer<typeof TheoryVariable>;

export const TheoryClaim = z.object({
  id: z.string().min(1).max(64),
  /** What identity this claim states, in the plan's own terms (auditable prose). */
  label: z.string().min(3).max(200),
  /** Closed-space expression DATA (never code; see module header). */
  lhs: z.string().min(1).max(300),
  rhs: z.string().min(1).max(300),
  /** Preregistered numerical tolerance: max |lhs-rhs| over the grid must stay below. */
  tolerance: z.number().positive().max(1),
  thresholdProvenance: DecisionRuleProvenance,
  hypothesisId: HypothesisId.optional(),
  primary: z.boolean().default(false),
});
export type TheoryClaim = z.infer<typeof TheoryClaim>;

export const TheorySpec = z.object({
  id: ExperimentSpecId,
  runId: RunId,
  planId: PlanId,
  planStepId: TaskId,
  version: z.number().int().nonnegative().default(1),
  question: z.string().min(1),
  experimentType: z.literal('theory_identity'),
  variables: z.array(TheoryVariable).min(1).max(4),
  claims: z.array(TheoryClaim).min(1).max(8),
  compute: ComputeProfile.default({}),
  approvals: z.array(BindingApproval).default([]),
  /** Required when no claim binds a hypothesis (exploratory runs are explicit, never silent). */
  exploratoryNote: z.string().min(10).optional(),
  validation: z.object({
    passed: z.boolean(),
    missing: z.array(z.string()).default([]),
  }).optional(),
  createdAt: z.string().datetime(),
}).superRefine((s, ctx) => {
  const names = s.variables.map((v) => v.name);
  if (new Set(names).size !== names.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate grid variable names' });
  }
  const gridNames = new Set(names);
  for (const [i, c] of s.claims.entries()) {
    const lhsErr = checkIdentityExpression(c.lhs, gridNames);
    if (lhsErr !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `claims[${i}].lhs: ${lhsErr}`, path: ['claims', i, 'lhs'] });
    const rhsErr = checkIdentityExpression(c.rhs, gridNames);
    if (rhsErr !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `claims[${i}].rhs: ${rhsErr}`, path: ['claims', i, 'rhs'] });
  }
  const ids = s.claims.map((c) => c.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate claim ids' });
  const primaries = s.claims.filter((c) => c.primary);
  if (s.claims.length > 1 && primaries.length !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'multiple claims require exactly one primary' });
  }
});
export type TheorySpec = z.infer<typeof TheorySpec>;

/**
 * Fail-closed theory spec validation (the analogue of checkMetaSpec): grid caps,
 * expression admission, cross-reference integrity, and the approval/exploratory
 * honesty gates. Numbers are not checked here — nothing is computed until execution.
 */
export const checkTheorySpec = (
  spec: TheorySpec,
  ctx: { hypothesisIds: readonly HypothesisId[] },
): { passed: boolean; missing: string[] } => {
  const missing: string[] = [];
  const hypSet = new Set(ctx.hypothesisIds);
  const nPoints = spec.variables.reduce((a, v) => a * v.n, 1);
  if (nPoints > THEORY_GRID_POINT_CAP) missing.push(`grid declares ${nPoints} points > cap ${THEORY_GRID_POINT_CAP}`);
  const gridNames = new Set(spec.variables.map((v) => v.name));
  const boundClaims = new Map<string, string>(); // claimId -> hypothesisId
  for (const [i, c] of spec.claims.entries()) {
    for (const [side, expr] of [['lhs', c.lhs], ['rhs', c.rhs]] as const) {
      const err = checkIdentityExpression(expr, gridNames);
      if (err !== null) missing.push(`claims[${i}].${side}: ${err}`);
    }
    if (c.hypothesisId !== undefined) {
      if (!hypSet.has(c.hypothesisId)) missing.push(`claims[${i}].hypothesisId not in run`);
      else boundClaims.set(c.id, c.hypothesisId);
    }
  }
  if (boundClaims.size > 0) {
    const approved = new Map<string, string>();
    for (const a of spec.approvals) {
      if (!hypSet.has(a.hypothesisId)) missing.push(`approval for unknown hypothesis ${a.hypothesisId}`);
      for (const cid of a.comparisonIds) {
        const bound = boundClaims.get(cid);
        if (bound === undefined) missing.push(`approval covers non-hypothesis-bound claim ${cid}`);
        else if (bound !== a.hypothesisId) missing.push(`approval of ${cid} names hypothesis ${a.hypothesisId} but binding is ${bound}`);
        else approved.set(cid, a.hypothesisId);
      }
    }
    for (const cid of boundClaims.keys()) {
      if (!approved.has(cid)) missing.push(`hypothesis-bound claim ${cid} lacks a covering binding approval (D-085 P0-1)`);
    }
  }
  if (boundClaims.size === 0 && spec.exploratoryNote === undefined) {
    missing.push('no hypothesis-bound claim and no exploratoryNote — exploratory runs must be explicit');
  }
  return { passed: missing.length === 0, missing };
};

/**
 * Mechanical verdict (SCIENTIFIC_MODEL §10 discipline adapted to a deterministic
 * quantity): non-finite grid points make the check UNRESOLVED on this grid
 * (insufficient_data — the grid does not test the claim, say so); otherwise the
 * degenerate interval [max, max] sits entirely on one side of the tolerance.
 */
export const theoryIdentityVerdict = (r: {
  maxAbsResidual: number;
  nonFinitePoints: number;
  tolerance: number;
}): Extract<ExperimentVerdict, 'supports' | 'falsifies' | 'insufficient_data'> => {
  if (r.nonFinitePoints > 0) return 'insufficient_data';
  return r.maxAbsResidual < r.tolerance ? 'supports' : 'falsifies';
};
