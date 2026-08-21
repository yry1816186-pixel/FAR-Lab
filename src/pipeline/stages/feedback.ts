import type { StageHandler } from '../types.js';

/**
 * W1: the feedback channel (CLI `far research feedback`) arrives in W2.
 * Until then this stage honestly reports "not applicable" instead of
 * pretending to process feedback that cannot exist yet.
 */
export const feedbackStage: StageHandler = {
  stage: 'feedback',
  applicable: async () => false,
  execute: async () => ({ kind: 'skipped', reason: 'feedback channel not implemented until W2; no feedback signals can exist yet' }),
};
