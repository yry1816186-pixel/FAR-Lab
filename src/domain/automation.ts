import { z } from 'zod';

/**
 * Automation (resident-agent R3): a researcher-approved standing instruction
 * that fires agent turns into its conversation WITHOUT a human message —
 * either on a schedule or when a research run completes. Honest limits:
 * firing only happens while the API server process runs (state survives
 * restart; the clock resumes from lastFiredAt), each fire is a REAL model
 * turn capped by maxTurnsPerFire, and every fire is visible as an
 * automation-role message in the conversation.
 */

export const AutomationTriggerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('run_completed') }),
  z.object({
    kind: z.literal('schedule'),
    /** Minutes between fires (1 minute floor; 20160 = two weeks ceiling). */
    intervalMinutes: z.number().int().min(1).max(20160),
  }),
]);
export type AutomationTrigger = z.infer<typeof AutomationTriggerSchema>;

export const AutomationSchema = z.object({
  id: z.string().regex(/^auto_[a-z0-9]+$/, 'auto_ id'),
  /** The conversation fired turns land in (workspace-scoped object). */
  conversationId: z.string().regex(/^conv_[a-z0-9]+$/),
  label: z.string().min(1).max(120),
  trigger: AutomationTriggerSchema,
  /** What the fired agent turn should do (natural-language task for the resident agent). */
  task: z.string().min(1).max(2000),
  enabled: z.boolean(),
  /** Turn ceiling per fire — the budget cap that keeps automations from running away. */
  maxTurnsPerFire: z.number().int().min(2).max(8),
  fireCount: z.number().int().nonnegative(),
  /** Run ids already reported by a run_completed automation (dedupe, bounded). */
  notifiedRunIds: z.array(z.string().regex(/^run_[a-z0-9]+$/)).max(50),
  lastFiredAt: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type Automation = z.infer<typeof AutomationSchema>;
