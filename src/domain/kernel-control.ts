import { z } from 'zod';
import { KernelControlStateId, RunId } from './ids.js';

export const KernelPhase = z.enum(['observe','understand','model','identify_uncertainty','reason','select_action','act','update_belief','replan','converged','blocked','cancelled']);
export type KernelPhase = z.infer<typeof KernelPhase>;

export const KernelControlState = z.object({
  id: KernelControlStateId,
  runId: RunId,
  version: z.number().int().positive(),
  phase: KernelPhase,
  budget: z.object({ cap: z.number().int().nonnegative().nullable(), spent: z.number().int().nonnegative(), remaining: z.number().int().nonnegative().nullable() }),
  attempts: z.number().int().nonnegative(),
  attemptLimit: z.number().int().positive(),
  completion: z.object({ predicate: z.string().min(1), satisfied: z.boolean() }),
  stuck: z.object({ detected: z.boolean(), consecutiveNoChange: z.number().int().nonnegative(), threshold: z.number().int().positive() }),
  cancellation: z.object({ requested: z.boolean(), acknowledged: z.boolean() }),
  checkpoint: z.object({ lastAction: z.string().nullable(), lastCompletedAt: z.string().datetime().nullable() }),
  nextAction: z.object({ kind: z.string().min(1), rationale: z.string().min(1), expectedInformationGain: z.enum(['high','medium','low','unknown']) }).nullable(),
  provenance: z.object({ sourceObjectIds: z.array(z.string()), eventCount: z.number().int().nonnegative(), updatedAt: z.string().datetime() }),
});
export type KernelControlState = z.infer<typeof KernelControlState>;

export interface KernelActionCandidate { kind: string; rationale: string; expectedInformationGain?: 'high'|'medium'|'low'|'unknown'; priority?: number; }

export function selectNextBestAction(candidates: readonly KernelActionCandidate[], unknownCount: number, competingHypotheses: number): KernelActionCandidate | null {
  if (candidates.length === 0) return null;
  const informationBonus = (candidate: KernelActionCandidate): number =>
    (candidate.expectedInformationGain === 'high' ? 3 : candidate.expectedInformationGain === 'medium' ? 2 : candidate.expectedInformationGain === 'low' ? 1 : 0)
    + (unknownCount > 0 && /uncert|retrieve|evidence/i.test(candidate.kind) ? 1 : 0)
    + (competingHypotheses > 1 && /experiment|falsif|counter|discriminat/i.test(candidate.kind) ? 1 : 0);
  return [...candidates].sort((a,b) => (b.priority ?? 0) - (a.priority ?? 0) || informationBonus(b) - informationBonus(a) || a.kind.localeCompare(b.kind))[0] ?? null;
}

export function makeKernelControlState(input: { id: KernelControlStateId; runId: RunId; version?: number; phase?: KernelPhase; cap: number|null; spent: number; attempts?: number; attemptLimit?: number; completionSatisfied?: boolean; noChange?: number; cancelRequested?: boolean; lastAction?: string|null; nextAction?: KernelActionCandidate|null; sourceObjectIds?: string[]; eventCount?: number; }): KernelControlState {
  const now = new Date().toISOString();
  const next = input.nextAction === null || input.nextAction === undefined ? null : { kind: input.nextAction.kind, rationale: input.nextAction.rationale, expectedInformationGain: input.nextAction.expectedInformationGain ?? 'unknown' as const };
  return KernelControlState.parse({ id: input.id, runId: input.runId, version: input.version ?? 1, phase: input.phase ?? 'observe', budget: { cap: input.cap, spent: input.spent, remaining: input.cap === null ? null : Math.max(0, input.cap - input.spent) }, attempts: input.attempts ?? 0, attemptLimit: input.attemptLimit ?? 64, completion: { predicate: 'all_required_actions_terminal_and_world_model_stable', satisfied: input.completionSatisfied ?? false }, stuck: { detected: (input.noChange ?? 0) >= 3, consecutiveNoChange: input.noChange ?? 0, threshold: 3 }, cancellation: { requested: input.cancelRequested ?? false, acknowledged: false }, checkpoint: { lastAction: input.lastAction ?? null, lastCompletedAt: input.lastAction ? now : null }, nextAction: next, provenance: { sourceObjectIds: input.sourceObjectIds ?? [], eventCount: input.eventCount ?? 0, updatedAt: now } });
}
