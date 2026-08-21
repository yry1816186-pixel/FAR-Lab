import type { StageContext } from '../types.js';

/**
 * Cooperative-cancellation checkpoint. Stages call this between expensive
 * operations (LLM calls, source searches, per-document loops); the thrown
 * message is recognized by the orchestrator as a cancellation.
 */
export const throwIfCancelled = (ctx: StageContext): void => {
  if (ctx.cancelled()) throw new Error('cancelled by user');
};
