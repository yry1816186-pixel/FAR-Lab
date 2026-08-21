import type { StageHandler } from '../types.js';

/**
 * W1: causal revision machinery arrives in W2 (FeedbackSignal -> Revision -> VersionDiff).
 * Until then this stage honestly reports "not applicable".
 */
export const reviseStage: StageHandler = {
  stage: 'revise',
  applicable: async () => false,
  execute: async () => ({ kind: 'skipped', reason: 'causal revision not implemented until W2; nothing to revise from' }),
};
