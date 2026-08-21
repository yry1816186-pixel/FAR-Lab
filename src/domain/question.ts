import { z } from 'zod';
import { QuestionId } from './ids.js';

export const ScientificGoalType = z.enum([
  'explanatory', // explain an observed phenomenon
  'predictive', // predict an outcome
  'interventional', // test an intervention
  'methodological', // improve a method/measurement
  'exploratory', // map/characterize unknown territory
]);
export type ScientificGoalType = z.infer<typeof ScientificGoalType>;

export const ResearchScope = z.object({
  domain: z.string().min(1),
  phenomena: z.array(z.string().min(1)).min(1), // phenomena in question
  temporalBoundary: z.string().optional(),
  spatialOrSystemBoundary: z.string().optional(),
  populationOrScopeNotes: z.string().optional(),
  inScope: z.array(z.string()).default([]),
  outOfScope: z.array(z.string()).default([]),
});
export type ResearchScope = z.infer<typeof ResearchScope>;

export const ConstraintSet = z.object({
  assumptions: z.array(z.string().min(1)).default([]),
  dataConstraints: z.array(z.string()).default([]),
  resourceConstraints: z.array(z.string()).default([]),
  ethicalConstraints: z.array(z.string()).default([]),
  methodologicalConstraints: z.array(z.string()).default([]),
});
export type ConstraintSet = z.infer<typeof ConstraintSet>;

export const ResearchQuestion = z.object({
  id: QuestionId,
  text: z.string().min(1),
  background: z.string().default(''),
  goalType: ScientificGoalType,
  scope: ResearchScope,
  constraints: ConstraintSet,
  createdAt: z.string().datetime(),
});
export type ResearchQuestion = z.infer<typeof ResearchQuestion>;
