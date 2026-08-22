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
