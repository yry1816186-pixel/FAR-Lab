import { z } from 'zod';
import { idOf } from './ids.js';

/**
 * Active-learning literature screening (ASReview-pattern, user-approved
 * 2026-08-24): the researcher labels pool documents include/exclude, a
 * deterministic model re-ranks the queue, and a WSS@95-style stop rule
 * proposes when coverage is high enough — with an honest recall-risk line.
 */

export const SCREENING_SESSION_ID = idOf('scn');
export const SCREENING_DECISION_ID = idOf('scd');

const VERDICTS = ['include', 'exclude'] as const;

export const ScreeningDecision = z.object({
  id: SCREENING_DECISION_ID,
  runId: z.string().min(1),
  sessionId: SCREENING_SESSION_ID,
  srcId: z.string().min(1),
  verdict: z.enum(VERDICTS),
  /** Optional researcher rationale — negative evidence context survives. */
  reason: z.string().max(2000).optional(),
  at: z.string().datetime(),
});
export type ScreeningDecision = z.infer<typeof ScreeningDecision>;

export const ScreeningSession = z.object({
  id: SCREENING_SESSION_ID,
  runId: z.string().min(1),
  /** Pool anchor: the exact document ids this session screens (stable snapshot
   *  at creation; the UI must offer a restart if the corpus grew). */
  poolDocIds: z.array(z.string().min(1)).min(1).max(5000),
  includeIds: z.array(z.string().min(1)),
  excludeIds: z.array(z.string().min(1)),
  state: z.enum(['active', 'stopped']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ScreeningSession = z.infer<typeof ScreeningSession>;

export type ScreeningVerdict = z.infer<typeof ScreeningDecision>['verdict'];
