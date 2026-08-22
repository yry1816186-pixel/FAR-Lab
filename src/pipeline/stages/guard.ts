import type { StageContext } from '../types.js';

/**
 * Cooperative-cancellation checkpoint. Stages call this between expensive
 * operations (LLM calls, source searches, per-document loops); the thrown
 * message is recognized by the orchestrator as a cancellation.
 */
export const throwIfCancelled = (ctx: StageContext): void => {
  if (ctx.cancelled()) throw new Error('cancelled by user');
};

/**
 * True for the error throwIfCancelled throws. Catch blocks that normally
 * degrade failures (family-failure receipts, rerank fallback) MUST rethrow
 * cancellations FIRST — otherwise a cancel mid-loop is bookkept as an
 * ordinary failure and the stage completes instead of aborting (W6 audit
 * P1-1/P2-2 root fix).
 */
export const isCancellationError = (e: unknown): boolean =>
  // Stage-suffixed cancellation messages must match (shared.ts throws
  // `cancelled by user during ${stage}`; guard.ts throws the bare form) — but a
  // mere string EXTENSION like 'cancelled by userX' is a different message and
  // must not be treated as a cancellation (word-boundary regex, WP2).
  e instanceof Error && /^cancelled by user(?:\s|$)/.test(e.message);
