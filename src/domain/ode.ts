import { z } from 'zod';
import { RunId, PlanId, TaskId, HypothesisId, ExperimentSpecId } from './ids.js';
import { BindingApproval, ComputeProfile, type ExperimentVerdict } from './experiment.js';
import { DecisionRuleProvenance } from './hypothesis.js';
import { THEORY_FUNCTION_WHITELIST, freeIdentifiersOf } from './theory.js';

/**
 * Wave B ODE vertical slice (FA-SCI-05): the numerical-experiment leg for
 * preregistered initial-value problems. Discipline ported verbatim from the
 * theory path —
 *
 * - RHS and (optional) analytical solutions arrive as closed expression DATA,
 *   gated by the same lexical admission the identity path uses (the sidecar's
 *   AST whitelist is the authoritative second gate);
 * - method/rtol/atol/grid are preregistered; execution binds to a spec hash;
 * - verdicts derive mechanically from max |y_num − y_analytic| vs tolerance —
 *   an LLM never produces one (it only DRAFTS inside the closed space);
 * - a claim without an analytical solution cannot be falsified numerically
 *   BY CONSTRUCTION: it must carry `noAnalyticalNote` so the executor marks
 *   the outcome insufficient_data instead of inventing a residual.
 */

/** Solver methods the sidecar accepts (scipy solve_ivp subset, deterministic set). */
export const ODE_METHODS = ['RK45', 'DOP853', 'Radau', 'BDF', 'LSODA'] as const;
export type OdeMethod = (typeof ODE_METHODS)[number];

const ODE_CONSTANTS = new Set(['pi', 'e']);

/** Preregistered defaults (deterministic, disclosed — never model-chosen). */
export const ODE_DEFAULT_TOLERANCE = 1e-8;
export const ODE_DEFAULT_RTL = 1e-10;
export const ODE_DEFAULT_ATOL = 1e-12;

/**
 * Deterministic lexical admission for RHS/analytical expressions. The free
 * identifiers may be the independent variable t, the state variable names,
 * whitelisted functions, or the numeric constants pi/e.
 */
export const checkOdeExpression = (expr: string, allowed: ReadonlySet<string>): string | null => {
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
  for (const id of freeIdentifiersOf(expr)) {
    if (ODE_CONSTANTS.has(id) || (THEORY_FUNCTION_WHITELIST as readonly string[]).includes(id)) continue;
    if (!allowed.has(id)) return `identifier '${id}' is not t, a state variable, or a whitelisted function/constant`;
  }
  return null;
};

export const OdeStateVariable = z.object({
  name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/, 'state name must be a plain identifier'),
  /** Closed expression for dy/dt in terms of t and the state names. */
  rhs: z.string().min(1).max(300),
  y0: z.number().finite(),
}).superRefine((v, ctx) => {
  if (v.name === 't') ctx.addIssue({ code: z.ZodIssueCode.custom, message: "state name 't' is reserved for the independent variable" });
  if (ODE_CONSTANTS.has(v.name)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `state name ${v.name} collides with a whitelisted constant` });
  }
});
export type OdeStateVariable = z.infer<typeof OdeStateVariable>;

export const OdeAnalyticalSolution = z.object({
  name: z.string().min(1).max(31),
  /** Closed expression for y_i(t) in terms of t only. */
  expr: z.string().min(1).max(300),
});
export type OdeAnalyticalSolution = z.infer<typeof OdeAnalyticalSolution>;

export const OdeClaim = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(3).max(200),
  /** Preregistered numerical tolerance: max |y_num − y_analytic| on the grid. */
  tolerance: z.number().positive().max(1),
  thresholdProvenance: DecisionRuleProvenance,
  hypothesisId: HypothesisId.optional(),
  primary: z.boolean().default(false),
});
export type OdeClaim = z.infer<typeof OdeClaim>;

export const OdeSpec = z.object({
  id: ExperimentSpecId,
  runId: RunId,
  planId: PlanId,
  planStepId: TaskId,
  version: z.number().int().nonnegative().default(1),
  question: z.string().min(1),
  experimentType: z.literal('ode_integration'),
  stateVariables: z.array(OdeStateVariable).min(1).max(6),
  tSpan: z.tuple([z.number().finite(), z.number().finite()]),
  method: z.enum(ODE_METHODS),
  rtol: z.number().min(1e-14).max(1e-2),
  atol: z.number().min(1e-14).max(1e-2),
  samplePoints: z.number().int().min(2).max(2001),
  analyticalSolution: z.array(OdeAnalyticalSolution).min(1).max(6).optional(),
  claims: z.array(OdeClaim).min(1).max(8),
  compute: ComputeProfile.default({}),
  approvals: z.array(BindingApproval).default([]),
  /** Required when no analytical solution is present (nothing to falsify against). */
  noAnalyticalNote: z.string().min(10).optional(),
  /** Required when no claim binds a hypothesis. */
  exploratoryNote: z.string().min(10).optional(),
  validation: z.object({
    passed: z.boolean(),
    missing: z.array(z.string()).default([]),
  }).optional(),
  createdAt: z.string().datetime(),
}).superRefine((s, ctx) => {
  const names = s.stateVariables.map((v) => v.name);
  const allowed = new Set(['t', ...names]);
  for (const [i, v] of s.stateVariables.entries()) {
    const err = checkOdeExpression(v.rhs, allowed);
    if (err !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `stateVariables[${i}].rhs: ${err}`, path: ['stateVariables', i, 'rhs'] });
  }
  if (s.analyticalSolution !== undefined) {
    const tOnly = new Set(['t']);
    for (const [i, a] of s.analyticalSolution.entries()) {
      if (a.name !== names[i]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `analyticalSolution[${i}].name must match stateVariables[${i}].name`, path: ['analyticalSolution', i, 'name'] });
      }
      const err = checkOdeExpression(a.expr, tOnly);
      if (err !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `analyticalSolution[${i}].expr: ${err}`, path: ['analyticalSolution', i, 'expr'] });
    }
  }
  if (!(s.tSpan[1] > s.tSpan[0])) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'tSpan[1] must exceed tSpan[0]', path: ['tSpan', 1] });
  }
  const ids = s.claims.map((c) => c.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate claim ids' });
  const primaries = s.claims.filter((c) => c.primary);
  if (s.claims.length > 1 && primaries.length !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'multiple claims require exactly one primary' });
  }
});
export type OdeSpec = z.infer<typeof OdeSpec>;

/**
 * Fail-closed ODE spec validation (checkOdeSpec): expression admission,
 * cross-reference integrity, approval/exploratory honesty gates, and the
 * analytical-solution honesty gate. Nothing is computed here.
 */
export const checkOdeSpec = (
  spec: OdeSpec,
  ctx: { hypothesisIds: readonly HypothesisId[] },
): { passed: boolean; missing: string[] } => {
  const missing: string[] = [];
  const hypSet = new Set(ctx.hypothesisIds);
  const allowed = new Set(['t', ...spec.stateVariables.map((v) => v.name)]);
  for (const [i, v] of spec.stateVariables.entries()) {
    const err = checkOdeExpression(v.rhs, allowed);
    if (err !== null) missing.push(`stateVariables[${i}].rhs: ${err}`);
  }
  if (spec.analyticalSolution === undefined) {
    if (spec.noAnalyticalNote === undefined) {
      missing.push('no analyticalSolution and no noAnalyticalNote — an unfalsifiable numerical run must be explicit');
    }
  }
  const boundClaims = new Map<string, string>();
  for (const [i, c] of spec.claims.entries()) {
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
 * Mechanical verdict: without an analytical solution the claim is untestable
 * numerically (insufficient_data, honestly); non-finite points are likewise
 * unresolved; otherwise the max residual sits strictly below tolerance or not.
 */
export const odeIntegrationVerdict = (r: {
  hasAnalytical: boolean;
  nonFinitePoints: number;
  maxAbsResidual: number | null;
  tolerance: number;
}): Extract<ExperimentVerdict, 'supports' | 'falsifies' | 'insufficient_data'> => {
  if (!r.hasAnalytical || r.maxAbsResidual === null) return 'insufficient_data';
  if (r.nonFinitePoints > 0) return 'insufficient_data';
  return r.maxAbsResidual < r.tolerance ? 'supports' : 'falsifies';
};
