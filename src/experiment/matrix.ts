import type { AblationFactor, ModelSpec } from '../domain/experiment.js';

/**
 * P2 ablation/matrix expansion: full factorial over named hyperparameter-override
 * levels applied to one base model. Pure and deterministic — cells are named
 * `base|f1=level|f2=level` and carry matching tags for result provenance.
 */
export const expandAblationModels = (base: ModelSpec, factors: AblationFactor[]): ModelSpec[] => {
  if (factors.length === 0) return [{ ...base, tags: [`${base.name}|full`] }];
  let cells: { hyperparams: Record<string, string | number | boolean>; tags: string[] }[] = [
    { hyperparams: { ...base.hyperparams }, tags: [] },
  ];
  for (const factor of factors) {
    const next: typeof cells = [];
    for (const cell of cells) {
      for (const level of factor.levels) {
        next.push({
          hyperparams: { ...cell.hyperparams, ...level.hyperparams },
          tags: [...cell.tags, `${factor.name}=${level.label}`],
        });
      }
    }
    cells = next;
  }
  return cells.map((cell) => ({
    ...base,
    name: `${base.name}|${cell.tags.join('|')}`,
    hyperparams: cell.hyperparams,
    tags: cell.tags,
    seed: base.seed,
  }));
};

// ---------------------------------------------------------------------------
// Wave-S/s2 #3 (g10) — screening tier. Full factorial explodes combinatorially; past a
// budget the matrix switches to a SCREEN: Plackett-Burman for all-2-level factors
// (1946 Biometrika 33(4) lineage), OFAT for mixed levels. Screening runs are tagged and
// carry a disclosure — main effects stay estimable, interactions do not; confirmatory
// claims require re-running top cells at full factorial.

/** Above this many full-factorial cells the matrix screens instead of exploding. */
export const MAX_FULL_FACTORIAL_CELLS = 24;

/** Standard cyclical Plackett-Burman generator rows (first row of the n×(n−1) design). */
const PB_FIRST_ROWS: Readonly<Record<8 | 12, readonly (1 | -1)[]>> = {
  8: [1, 1, 1, -1, 1, -1, -1],
  12: [1, 1, -1, 1, 1, 1, -1, -1, -1, 1, -1],
};

/**
 * Cyclical PB construction — VERIFIED AT BUILD TIME: column balance and pairwise
 * orthogonality are checked and a violation throws. A mis-remembered generator constant
 * can therefore never silently produce a non-orthogonal design (zero-theater rule).
 */
export const pbDesign = (n: 8 | 12): (1 | -1)[][] => {
  const first = PB_FIRST_ROWS[n];
  if (first.length !== n - 1) {
    throw new Error(`pb: generator row length ${first.length} != n-1=${n - 1}`);
  }
  const rows: (1 | -1)[][] = [[...first]];
  for (let shift = 1; shift < first.length; shift += 1) {
    rows.push([...first.slice(first.length - shift), ...first.slice(0, first.length - shift)]);
  }
  rows.push(first.map(() => -1 as const));
  for (let c1 = 0; c1 < n - 1; c1 += 1) {
    let sum = 0;
    for (const row of rows) sum += row[c1] ?? 0;
    if (sum !== 0) throw new Error(`pb(${n}): column ${c1} unbalanced (sum ${sum}) — generator constant is wrong`);
    for (let c2 = c1 + 1; c2 < n - 1; c2 += 1) {
      let dot = 0;
      for (const row of rows) dot += (row[c1] ?? 0) * (row[c2] ?? 0);
      if (dot !== 0) throw new Error(`pb(${n}): columns ${c1},${c2} not orthogonal (dot ${dot}) — generator constant is wrong`);
    }
  }
  return rows;
};

export type ScreeningMode = 'full_factorial' | 'pb_screen' | 'ofat_screen';

export interface AblationScreeningPlan {
  models: ModelSpec[];
  mode: ScreeningMode;
  /** Size the full factorial WOULD have been — the budget justification for screening. */
  fullFactorialCells: number;
  /** Aliasing/limits disclosure — must travel with the runs into any report. */
  disclosure: string;
}

/**
 * Budget-aware expansion: full factorial within budget, PB screen for many 2-level
 * factors, OFAT screen otherwise. All cells keep the base seed (paired design across
 * cells — the correct discipline for deterministic computation).
 */
export const expandWithScreening = (
  base: ModelSpec,
  factors: AblationFactor[],
  opts: { maxFullCells?: number } = {},
): AblationScreeningPlan => {
  const maxFullCells = opts.maxFullCells ?? MAX_FULL_FACTORIAL_CELLS;
  const fullFactorialCells = factors.reduce((acc, f) => acc * f.levels.length, 1);
  if (factors.length === 0 || fullFactorialCells <= maxFullCells) {
    return {
      models: expandAblationModels(base, factors),
      mode: 'full_factorial',
      fullFactorialCells,
      disclosure:
        `full factorial: ${fullFactorialCells} cell(s) within the ${maxFullCells}-cell budget — all main effects and interactions estimable`,
    };
  }
  const allTwoLevel = factors.every((f) => f.levels.length === 2);
  if (allTwoLevel && factors.length <= 11) {
    const n: 8 | 12 = factors.length <= 7 ? 8 : 12;
    const design = pbDesign(n);
    const models = design.map((row, runIdx) => {
      const tags: string[] = [];
      const hyperparams: Record<string, string | number | boolean> = { ...base.hyperparams };
      factors.forEach((f, c) => {
        const level = (row[c] ?? 1) === 1 ? f.levels[0]! : f.levels[1]!;
        Object.assign(hyperparams, level.hyperparams);
        tags.push(`${f.name}=${level.label}`);
      });
      return {
        ...base,
        name: `${base.name}|${tags.join('|')}|pb${n}r${runIdx + 1}`,
        hyperparams,
        tags: [...tags, `screen:pb${n}`],
        seed: base.seed,
      };
    });
    return {
      models,
      mode: 'pb_screen',
      fullFactorialCells,
      disclosure:
        `PB screen: ${factors.length} two-level factors in ${n} runs instead of ${fullFactorialCells} full cells; ` +
        'main effects are aliased with two-factor interactions — CONFIRM surviving cells at full factorial before any confirmatory claim (Wave-S/s2 #3, Plackett-Burman 1946)',
    };
  }
  // Mixed-level factors preclude PB: one-factor-at-a-time screen from the base config.
  const cells: { hyperparams: Record<string, string | number | boolean>; tags: string[] }[] = [
    { hyperparams: { ...base.hyperparams }, tags: [] },
  ];
  for (const f of factors) {
    for (const level of f.levels.slice(1)) {
      cells.push({
        hyperparams: { ...base.hyperparams, ...level.hyperparams },
        tags: [`${f.name}=${level.label}`],
      });
    }
  }
  return {
    models: cells.map((cell) => ({
      ...base,
      name: cell.tags.length === 0 ? `${base.name}|ofat-base` : `${base.name}|${cell.tags.join('|')}`,
      hyperparams: cell.hyperparams,
      tags: [...cell.tags, 'screen:ofat'],
      seed: base.seed,
    })),
    mode: 'ofat_screen',
    fullFactorialCells,
    disclosure:
      `OFAT screen: ${cells.length} runs instead of ${fullFactorialCells} full cells (mixed-level factors preclude Plackett-Burman); ` +
      'interactions are NOT estimable — confirm surviving factors at full factorial before any confirmatory claim',
  };
};
