/** Shared pure types for the screening loop (no zod — algorithm layer). */

export interface ScreenDoc {
  id: string;
  /** title + abstract — the text the model ranks on. */
  text: string;
}

export interface ScreeningQueueItem {
  srcId: string;
  /** Model probability of relevance; null in the seeded-random cold phase. */
  pRelevant: number | null;
  rank: number;
  phase: 'random' | 'model';
}

export interface StopEstimate {
  eligible: boolean;
  labeledCount: number;
  includeCount: number;
  predictedRelevantRemaining: number | null;
  /** include / (include + predicted-relevant-remaining); null = not estimable. */
  coverageEstimate: number | null;
  /** Human-readable basis — states what the estimate rests on, honestly. */
  basis: string;
}
