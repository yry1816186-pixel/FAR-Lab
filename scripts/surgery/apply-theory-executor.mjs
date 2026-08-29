#!/usr/bin/env node
// Slice-5 theory-leg anchored patch (converge/theory-executor).
//
// Applies seven file edits wiring the theory_identity experiment leg:
//   domain/theory.ts + executor-theory.ts + tests land as whole files;
//   this script only performs the anchored INTEGRATION edits:
//   1. domain/index.ts        — re-export theory.js
//   2. domain/experiment.ts   — MetricKey + StatReport.test.kind contract extension
//   3. ops.py                 — identity_check op (whitelisted AST) + OPS registry
//   4. spec-from-plan.ts      — draftTheorySpecFromPlan (deterministic assembly)
//   5. stages/execute.ts      — theory leg between literature-pool and protocol fallback
//   6. providers/offline.ts   — deterministic 'theory-spec-draft' refusal handler
//   7. persistence/store.ts   — theory_spec kind registration (delegated to
//                               apply-theory-store.mjs after the wrong last-entry
//                               assumption; this script's edit 7 fails fast by design)
//
// Discipline (slice-4 lessons): fail-loud UNIQUE anchors; natural idempotence
// (skip when an edit's signature string already exists); per-file EOL detection
// with uniform-EOL assertion (mixed-EOL files fail rather than normalize);
// post-edit invariant assertions before any write.
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const fail = (m) => {
  console.error(`APPLY-THEORY-FAILED: ${m}`);
  process.exit(1);
};

const countOf = (s, needle) => s.split(needle).length - 1;

/** Uniform-EOL editor: splits on any EOL, joins with the file's detected EOL. */
const edit = (path, fn) => {
  const src = read(path);
  const hasCr = src.includes('\r\n');
  const hasLfOnly = /(^|[^\r])\n/.test(src);
  if (hasCr && hasLfOnly) fail(`${path}: mixed EOLs — refusing to touch`);
  const eol = hasCr ? '\r\n' : '\n';
  const lines = src.split(/\r?\n/);
  let changed = false;
  fn({
    lines,
    eol,
    insertAfter(line, block) {
      const idx = this.findIdx(line);
      lines.splice(idx + 1, 0, ...block);
      changed = true;
    },
    insertBefore(line, block) {
      const idx = this.findIdx(line);
      lines.splice(idx, 0, ...block);
      changed = true;
    },
    replaceLine(line, newLine) {
      const idx = this.findIdx(line);
      lines[idx] = newLine;
      changed = true;
    },
    findIdx(exact) {
      const hits = lines.map((l, i) => (l === exact ? i : -1)).filter((i) => i >= 0);
      if (hits.length === 0) fail(`${path}: anchor not found: ${JSON.stringify(exact.slice(0, 90))}`);
      if (hits.length > 1) fail(`${path}: anchor not unique (${hits.length} hits): ${JSON.stringify(exact.slice(0, 90))}`);
      return hits[0];
    },
    lineAt(i) {
      return lines[i] ?? '';
    },
    assertLine(i, expected) {
      const actual = lines[i] ?? '';
      if (actual !== expected) fail(`${path}: post-condition line ${i + 1}: expected ${JSON.stringify(expected.slice(0, 60))}, got ${JSON.stringify(actual.slice(0, 60))}`);
    },
  });
  const next = lines.join(eol);
  if (next !== src) {
    writeFileSync(path, next);
    changed = true;
  }
  console.log(`${changed ? 'EDITED' : 'NO-CHANGE'} ${path}`);
};

// ---- 1. domain/index.ts ----
{
  const p = 'src/domain/index.ts';
  if (!read(p).includes("export * from './theory.js';")) {
    edit(p, (e) => {
      e.insertAfter("export * from './meta.js';", ["export * from './theory.js';"]);
    });
  } else {
    console.log(`SKIP ${p}: theory export present`);
  }
}

// ---- 2. domain/experiment.ts (CRLF file) ----
{
  const p = 'src/domain/experiment.ts';
  const src = read(p);
  if (src.includes("'identity_max_abs_residual'") && src.includes("'identity_grid'")) {
    console.log(`SKIP ${p}: both contract members present`);
  } else {
    if (src.includes("'identity_max_abs_residual'") !== src.includes("'identity_grid'")) {
      fail(`${p}: half-applied contract edit — refusing to guess`);
    }
    edit(p, (e) => {
      e.insertAfter("  'sim_mean', 'sim_variance', 'sim_threshold_prob',", [
        "  // Slice-5 theory identity reports: max |lhs-rhs| over the preregistered grid.",
        "  'identity_max_abs_residual',",
      ]);
      e.replaceLine(
        "    kind: z.union([StatisticsPlan.shape.test, z.enum(['meta_iv_fixed', 'meta_iv_random_dl'])]),",
        "    kind: z.union([StatisticsPlan.shape.test, z.enum(['meta_iv_fixed', 'meta_iv_random_dl']), z.literal('identity_grid')]),",
      );
    });
    const after = read(p);
    if (countOf(after, "'identity_max_abs_residual'") !== 1) fail(`${p}: identity metric count != 1`);
    if (countOf(after, "'identity_grid'") !== 1) fail(`${p}: identity_grid count != 1`);
  }
}

// ---- 3. ops.py ----
const OP_BLOCK = [
  'def op_identity_check(payload: dict[str, Any]) -> dict[str, Any]:',
  '    """Slice-5 theory identity check: evaluate lhs/rhs expression DATA over the',
  '    preregistered variable grid and report residual statistics.',
  '',
  '    Expressions are parsed with the stdlib ast module into a strict whitelist',
  '    (numeric literals, arithmetic, whitelisted numpy functions, grid variables',
  '    and the constants pi/e) — never eval(), never attribute access (exploration.py',
  '    P0 lesson: attribute traversal reaches os/sys through auto-imported submodules).',
  '    The TS validator gates first (lexical + free-variable); this is the',
  '    authoritative fail-closed second gate. Verdicts are computed by TS.',
  '    """',
  '    import ast as _ast',
  '',
  '    allowed_funcs = {',
  '        "exp": np.exp, "log": np.log, "log2": np.log2, "log10": np.log10, "sqrt": np.sqrt,',
  '        "sin": np.sin, "cos": np.cos, "tan": np.tan,',
  '        "sinh": np.sinh, "cosh": np.cosh, "tanh": np.tanh,',
  '        "arcsin": np.arcsin, "arccos": np.arccos, "arctan": np.arctan, "arctan2": np.arctan2,',
  '        "abs": np.abs, "floor": np.floor, "ceil": np.ceil,',
  '        "min": np.minimum, "max": np.maximum,',
  '    }',
  '    allowed_consts = {"pi": np.pi, "e": np.e}',
  '    bin_ops = {_ast.Add: np.add, _ast.Sub: np.subtract, _ast.Mult: np.multiply,',
  '               _ast.Div: np.true_divide, _ast.Pow: np.power, _ast.Mod: np.mod, _ast.FloorDiv: np.floor_divide}',
  '    unary_ops = {_ast.UAdd: lambda v: v, _ast.USub: np.negative}',
  '',
  '    def evaluate(node, env):',
  '        if isinstance(node, _ast.Expression):',
  '            return evaluate(node.body, env)',
  '        if isinstance(node, _ast.Constant):',
  '            if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):',
  '                raise ValueError(f"identity expression: non-numeric constant {node.value!r}")',
  '            return np.asarray(node.value, dtype=np.float64)',
  '        if isinstance(node, _ast.Name):',
  '            if node.id in env:',
  '                return env[node.id]',
  '            raise ValueError(f"identity expression: unknown variable {node.id!r} (grid: {sorted(env)})")',
  '        if isinstance(node, _ast.BinOp) and type(node.op) in bin_ops:',
  '            return bin_ops[type(node.op)](evaluate(node.left, env), evaluate(node.right, env))',
  '        if isinstance(node, _ast.UnaryOp) and type(node.op) in unary_ops:',
  '            return unary_ops[type(node.op)](evaluate(node.operand, env))',
  '        if isinstance(node, _ast.Call):',
  '            if not isinstance(node.func, _ast.Name) or node.func.id not in allowed_funcs:',
  '                raise ValueError("identity expression: only whitelisted plain-named functions may be called")',
  '            if node.keywords:',
  '                raise ValueError("identity expression: keyword arguments are not allowed")',
  '            args = [evaluate(a, env) for a in node.args]',
  '            return allowed_funcs[node.func.id](*args)',
  '        raise ValueError(f"identity expression: node {type(node).__name__} is outside the whitelist")',
  '',
  '    def parse_expr(text):',
  '        try:',
  '            tree = _ast.parse(text, mode="eval")',
  '        except SyntaxError as exc:',
  '            raise ValueError(f"identity expression does not parse: {exc}") from exc',
  '        for node in _ast.walk(tree):',
  '            if isinstance(node, _ast.Attribute):',
  '                raise ValueError("Attribute access is forbidden in identity expressions (sandbox-escape chain)")',
  '        return tree',
  '',
  '    variables = payload.get("variables") or []',
  '    if not variables:',
  '        raise ValueError("identity_check requires at least one grid variable")',
  '    grids = {v["name"]: np.linspace(float(v["low"]), float(v["high"]), int(v["n"])) for v in variables}',
  '    n_points = int(np.prod([int(v["n"]) for v in variables]))',
  '    if n_points > 20000:',
  '        raise ValueError(f"identity grid too large: {n_points} points > 20000 (preregistered cap)")',
  '    mesh = np.meshgrid(*[grids[v["name"]] for v in variables], indexing="ij")',
  '    # Grid variables shadow the whitelisted constants (TS rejects variables named pi/e).',
  '    env = {**allowed_consts, **{v["name"]: mesh[i] for i, v in enumerate(variables)}}',
  '',
  '    lhs = evaluate(parse_expr(payload["lhs"]), env)',
  '    rhs = evaluate(parse_expr(payload["rhs"]), env)',
  '    residual = np.abs(lhs - rhs)',
  '    finite = np.isfinite(residual)',
  '    non_finite = int((~finite).sum())',
  '    if not finite.any():',
  '        raise ValueError("identity expressions produced no finite evaluation points on this grid (domain error)")',
  '    fin = residual[finite]',
  '    worst = int(np.argmax(np.where(finite, residual, -np.inf)))  # non-finite points never win the max',
  '    worst_point = {v["name"]: float(mesh[i].flat[worst]) for i, v in enumerate(variables)}',
  '    worst_point["lhs"] = float(lhs.flat[worst])',
  '    worst_point["rhs"] = float(rhs.flat[worst])',
  '    return {',
  '        "maxAbsResidual": float(fin.max()),',
  '        "meanAbsResidual": float(fin.mean()),',
  '        "nPoints": n_points,',
  '        "nonFinitePoints": non_finite,',
  '        "worstPoint": worst_point,',
  '        "residuals": fin.tolist()[:20000],',
  '    }',
  '',
  '',
];
{
  const p = 'experiment-runtime/farlab_experiment_runtime/ops.py';
  const src = read(p);
  if (src.includes('def op_identity_check')) {
    console.log(`SKIP ${p}: op_identity_check present`);
  } else {
    edit(p, (e) => {
      e.insertBefore('OPS = {', OP_BLOCK);
      e.insertAfter('    "simulate": op_simulate,', [
        '    # Slice-5: theory identity check (whitelisted-AST expressions on a grid).',
        '    "identity_check": op_identity_check,',
      ]);
    });
    const after = read(p);
    if (countOf(after, '"identity_check"') !== 1) fail(`${p}: registry entry count != 1`);
    if (countOf(after, 'def op_identity_check') !== 1) fail(`${p}: op def count != 1`);
  }
}

// ---- 4. spec-from-plan.ts ----
const DRAFT_BLOCK = [
  '',
  '// ---- Slice-5: theory-type (numerical identity verification) drafting ----',
  '',
  'export type TheorySpecDraftOutcome =',
  "  | { kind: 'theory'; spec: TheorySpec; executionMode: 'live' | 'test' }",
  "  | { kind: 'skip'; reason: string };",
  '',
  'const TheoryDraftOut = z.object({',
  '  /** false = the plan is not testable by numerically checking claimed closed-form identities. */',
  '  feasible: z.boolean(),',
  '  skipReason: z.string().min(10).optional(),',
  '  variables: z.array(z.object({',
  '    name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/),',
  '    low: z.number().finite(),',
  '    high: z.number().finite(),',
  '  })).min(1).max(4).optional(),',
  '  claims: z.array(z.object({',
  '    label: z.string().min(3).max(200),',
  '    lhs: z.string().min(1).max(300),',
  '    rhs: z.string().min(1).max(300),',
  '  })).min(1).max(8).optional(),',
  '}).superRefine((d, ctx) => {',
  '  if (d.feasible && (d.variables === undefined || d.claims === undefined)) {',
  "    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'feasible=true requires variables and claims' });",
  '  }',
  '});',
  '',
  'const THEORY_SYSTEM_PROMPT =',
  "  'You convert a research plan into ONE theory-identity verification spec draft, or declare it infeasible. ' +",
  "  'Feasible ONLY when the plan\\'s falsifiable content is a claimed closed-form mathematical identity or bound ' +",
  "  'that can be checked NUMERICALLY on a small grid (trigonometric identities, algebraic equivalences, ' +",
  "  'derived analytic formulas stated as lhs == rhs). ' +",
  "  'Expressions are Python-syntax numeric expressions over the declared variables, using ONLY: ' +",
  "  '+ - * / % ** ( ), numbers, the functions exp log log2 log10 sqrt sin cos tan sinh cosh tanh ' +",
  "  'arcsin arccos arctan arctan2 abs floor ceil min max, and the constants pi e. ' +",
  "  'No imports, no attribute access, no other names. ' +",
  "  'variables: 1-4 grid variables with honest numeric ranges covering the domain the identity is claimed on. ' +",
  "  'claims: the plan\\'s claimed identities; lhs and rhs are each ONE expression in those variables. ' +",
  "  'If the plan needs physical experiments, datasets, or literature pooling rather than a checkable symbolic ' +",
  "  'claim, set feasible=false with a skipReason naming what is missing. Output JSON only.';",
].concat([
  '',
  'export const draftTheorySpecFromPlan = async (',
  '  plan: ResearchPlan,',
  '  questionText: string,',
  '  plane: ModelPlaneDeps,',
  '): Promise<TheorySpecDraftOutcome> => {',
  '  let draft: z.infer<typeof TheoryDraftOut>;',
  "  let executionMode: 'live' | 'test';",
  '  try {',
  '    const res = await invokeStructured<z.infer<typeof TheoryDraftOut>>(plane, {',
  "      stage: 'execute',",
  "      purpose: 'theory-spec-draft',",
  '      systemPrompt: THEORY_SYSTEM_PROMPT,',
  '      payload: {',
  '        researchQuestion: questionText,',
  '        objective: plan.objective,',
  '        variables: plan.variables,',
  '        decisionRules: { success: plan.decisionRules.successCriterion, falsification: plan.decisionRules.falsificationCriterion },',
  '        hypothesisIds: plan.hypothesisIds,',
  '      },',
  '      schema: TheoryDraftOut,',
  '      temperature: 0.1,',
  '      maxTokens: 2048,',
  '    });',
  '    draft = res.data;',
  '    executionMode = res.executionMode;',
  '  } catch (e) {',
  '    if (e instanceof RunBudgetExhaustedError) throw e;',
  '    return { kind: \'skip\', reason: `theory spec drafting failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 180)}` };',
  '  }',
  '  if (!draft.feasible || draft.variables === undefined || draft.claims === undefined) {',
  "    return { kind: 'skip', reason: draft.skipReason ?? 'plan is not testable by numerical identity verification' };",
  '  }',
  '  // Deterministic discipline (the model never picks these): grid resolution from',
  '  // the variable-count table, preregistered default tolerance, model-stipulated',
  '  // threshold provenance, first claim primary, exploratory until an operator binds.',
  '  const gridN = THEORY_GRID_POINTS[draft.variables.length] ?? 9;',
  '  const spec = TheorySpec.parse({',
  "    id: newId('xsp'),",
  '    runId: plan.runId,',
  '    planId: plan.id,',
  '    planStepId: plan.steps[0]?.id ?? newId(\'task\'),',
  '    question: questionText.slice(0, 500),',
  "    experimentType: 'theory_identity',",
  '    variables: draft.variables.map((v) => ({ name: v.name, low: v.low, high: v.high, n: gridN })),',
  '    claims: draft.claims.map((c, i) => ({',
  '      id: `claim_${i + 1}`,',
  '      label: c.label,',
  '      lhs: c.lhs,',
  '      rhs: c.rhs,',
  '      tolerance: THEORY_DEFAULT_TOLERANCE,',
  "      thresholdProvenance: 'model-stipulated',",
  '      primary: i === 0,',
  '    })),',
  '    compute: { device: \'local\', maxParallel: 1, timeoutMs: 300_000 },',
  '    approvals: [],',
  '    exploratoryNote: `Plan-drafted exploratory identity check for ${plan.id}: tolerance is model-stipulated; hypothesis-bound theory specs require operator approval.`,',
  '    validation: { passed: false, missing: [\'pending deterministic validation at execution\'] },',
  '    createdAt: new Date().toISOString(),',
  '  });',
  "  return { kind: 'theory', spec, executionMode };",
  '};',
]);
{
  const p = 'src/experiment/spec-from-plan.ts';
  const src = read(p);
  if (src.includes('draftTheorySpecFromPlan')) {
    console.log(`SKIP ${p}: theory drafter present`);
  } else {
    edit(p, (e) => {
      e.insertAfter(
        "import { MetaAnalysisSpec } from '../domain/meta.js';",
        ["import { TheorySpec, THEORY_GRID_POINTS, THEORY_DEFAULT_TOLERANCE } from '../domain/theory.js';"],
  );
      const idx = e.findIdx("  return { kind: 'meta', spec };");
      e.assertLine(idx + 1, '};');
      // append the drafting block after the file's final closing brace
      const lines = e.lines;
      lines.splice(idx + 2, 0, ...DRAFT_BLOCK);
    });
    const after = read(p);
    if (countOf(after, 'draftTheorySpecFromPlan') !== 2) fail(`${p}: drafter symbol count != 2 (export + return)`);
  }
}

// ---- 5. stages/execute.ts ----
const THEORY_LEG = [
  '      // Slice-5 theory leg: plans whose falsifiable content is a claimed',
  '      // closed-form identity get a NUMERICAL verification experiment on a',
  '      // preregistered grid (spec -> hash binding -> sidecar identity_check ->',
  '      // mechanical verdict), instead of falling straight to the human protocol.',
  '      // Honestly disclosed as a numerical spot-check, never a symbolic proof.',
  '      const theoryDraft = await draftTheorySpecFromPlan(plan, question.text, plane);',
  "      if (theoryDraft.kind === 'theory') {",
  '        try {',
  "          refuseTemplateMode(ctx, theoryDraft.executionMode, 'theory draft');",
  '          const executed = await executeTheoryAnalysis(ctx.store, ctx.artifacts, theoryDraft.spec, {',
  '            shouldCancel: () => ctx.cancelled() || ctx.disowned(),',
  '          });',
  "          const verdicts = executed.statReports.map((r) => r.verdict ?? 'exploratory').join(', ');",
  '          return {',
  "            kind: 'done',",
  '            summary:',
  '              `theory identity experiment ${executed.run.id}: ${executed.statReports.length} claim(s) checked on the preregistered grid ` +',
  '              `(residual verdicts: ${verdicts || \'none\'}) — numerical spot-check, not a symbolic proof — ` +',
  "              'plan-drafted, exploratory (tolerance model-stipulated; binding needs operator approval)',",
  '          };',
  '        } catch (e) {',
  '          if (e instanceof RunBudgetExhaustedError) throw e;',
  '          if (e instanceof TemplateModeRefusal) return { kind: \'skipped\', reason: e.message };',
  '          const msg = e instanceof Error ? e.message : String(e);',
  '          return { kind: \'skipped\', reason: `theory identity execution failed (run continues): ${msg.slice(0, 240)}` };',
  '        }',
  '      }',
  '',
];
{
  const p = 'src/pipeline/stages/execute.ts';
  const src = read(p);
  if (src.includes('draftTheorySpecFromPlan')) {
    console.log(`SKIP ${p}: theory leg present`);
  } else {
    edit(p, (e) => {
      e.insertAfter(
        "import { draftSpecFromPlan, draftMetaSpecFromPlan } from '../../experiment/spec-from-plan.js';",
        ["import { draftTheorySpecFromPlan } from '../../experiment/spec-from-plan.js';"],
  );
      e.insertAfter(
        "import { executeMetaAnalysis } from '../../experiment/executor-meta.js';",
        ["import { executeTheoryAnalysis } from '../../experiment/executor-theory.js';"],
  );
      e.insertBefore(
        '      // Protocol fallback (paradigm-honest execution): the computational legs are',
        THEORY_LEG,
  );
      e.replaceLine(
        '          return { kind: \'skipped\', reason: `tabular: ${draft.reason}; literature-pool: ${metaDraft.reason}; protocol: ${e.reason}` };',
        '          return { kind: \'skipped\', reason: `tabular: ${draft.reason}; literature-pool: ${metaDraft.reason}; theory: ${theoryDraft.reason}; protocol: ${e.reason}` };',
  );
      e.replaceLine(
        '          reason: `tabular: ${draft.reason}; literature-pool: ${metaDraft.reason}; protocol: drafting failed (${(e instanceof Error ? e.message : String(e)).slice(0, 180)})`,',
        '          reason: `tabular: ${draft.reason}; literature-pool: ${metaDraft.reason}; theory: ${theoryDraft.reason}; protocol: drafting failed (${(e instanceof Error ? e.message : String(e)).slice(0, 180)})`,',
  );
    });
    const after = read(p);
    if (countOf(after, 'draftTheorySpecFromPlan') !== 2) fail(`${p}: theory symbol count != 2 (import + call)`);
    if (countOf(after, 'theory: ${theoryDraft.reason}') !== 2) fail(`${p}: skip-reason updates != 2`);
  }
}

// ---- 6. providers/offline.ts ----
{
  const p = 'src/providers/offline.ts';
  const src = read(p);
  if (src.includes("'theory-spec-draft'")) {
    console.log(`SKIP ${p}: theory handler present`);
  } else {
    edit(p, (e) => {
      const idx = e.findIdx("  skipReason: 'offline development route: synthetic plans are not pooled into meta-analysis (no fabricated effect estimates)',");
      e.assertLine(idx + 1, '});');
      const block = [
        '',
        'const theorySpecDraft: Handler = () => ({',
        '  feasible: false,',
        "  skipReason: 'offline development route: synthetic plans are not verified as numerical identities (no fabricated theory experiments)',",
        '});',
      ];
      e.lines.splice(idx + 2, 0, ...block);
      e.insertAfter("  'meta-spec-draft': metaSpecDraft,", ["  'theory-spec-draft': theorySpecDraft,"]);
    });
    const after = read(p);
    if (countOf(after, "'theory-spec-draft'") !== 1) fail(`${p}: handler table entry count != 1`);
  }
}

// ---- 7. persistence/store.ts (kind registration) ----
// Delegated to apply-theory-store.mjs: the original last-entry assumption here
// was wrong (the KIND_SCHEMAS map continues past protocol_execution), so this
// script deliberately does NOT touch store.ts. The registration script runs
// after this one in the workflow's run_scripts chain.
console.log('store.ts kind registration: delegated to apply-theory-store.mjs');

// ---- final cross-file invariants ----
{
  const idxTs = read('src/domain/index.ts');
  if (!idxTs.includes("export * from './theory.js';")) fail('invariant: domain/index.ts missing theory export');
  const exp = read('src/domain/experiment.ts');
  if (!exp.includes("'identity_max_abs_residual'") || !exp.includes("'identity_grid'")) fail('invariant: experiment.ts contract members missing');
  const ops = read('experiment-runtime/farlab_experiment_runtime/ops.py');
  if (countOf(ops, 'identity_check') !== 2) fail('invariant: ops.py identity_check wiring != def+registry');
  const sfp = read('src/experiment/spec-from-plan.ts');
  if (!sfp.includes('THEORY_GRID_POINTS') || !sfp.includes('draftTheorySpecFromPlan')) fail('invariant: spec-from-plan drafter incomplete');
  const ex = read('src/pipeline/stages/execute.ts');
  if (!ex.includes('executeTheoryAnalysis') || !ex.includes('refuseTemplateMode(ctx, theoryDraft.executionMode')) fail('invariant: execute.ts theory leg incomplete');
  const off = read('src/providers/offline.ts');
  if (!off.includes("'theory-spec-draft': theorySpecDraft")) fail('invariant: offline handler table entry missing');
  console.log('ALL THEORY EDITS VERIFIED');
}
