/**
 * Pure builders for cross-cutting VIZ V6 surfaces: event-category buckets,
 * provenance-receipt aggregates, and the revision quality sequence. All derive
 * only from real payload fields — absent fields aggregate as zero-count
 * categories that stay visible, never silently dropped.
 */
import type { ProvenanceReceipt } from '../api/types';

// ---- event categories ----

export type EventCategory = 'lifecycle' | 'model' | 'retrieval' | 'tool' | 'agent' | 'other';

const CATEGORY_RE: [EventCategory, RegExp][] = [
  ['lifecycle', /^(stage_|run_)/],
  ['model', /model/],
  ['retrieval', /retriev|source|corpus/],
  ['tool', /tool/],
  ['agent', /agent/],
];

export function eventCategory(type: string): EventCategory {
  for (const [cat, re] of CATEGORY_RE) if (re.test(type)) return cat;
  return 'other';
}

export interface EventBucket {
  category: EventCategory;
  count: number;
}

/** Buckets over the events actually held in memory, ordered by fixed category order. */
export function bucketEvents(types: string[]): EventBucket[] {
  const counts = new Map<EventCategory, number>();
  for (const ty of types) {
    const c = eventCategory(ty);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const order: EventCategory[] = ['lifecycle', 'model', 'retrieval', 'tool', 'agent', 'other'];
  return order.filter((c) => (counts.get(c) ?? 0) > 0).map((category) => ({ category, count: counts.get(category)! }));
}

// ---- receipt aggregates ----

export interface ReceiptTotals {
  modelCalls: number;
  retrievals: number;
  toolExecs: number;
  nonLive: number;
  totalTokens: number;
  latencyMsMax: number;
  latencyMsSum: number;
}

export function aggregateReceipts(receipts: ProvenanceReceipt[]): ReceiptTotals {
  const t: ReceiptTotals = { modelCalls: 0, retrievals: 0, toolExecs: 0, nonLive: 0, totalTokens: 0, latencyMsMax: 0, latencyMsSum: 0 };
  for (const r of receipts) {
    if (r.modelCall !== undefined) {
      t.modelCalls += 1;
      t.totalTokens += r.modelCall.usage?.totalTokens ?? 0;
      if (r.modelCall.latencyMs !== undefined) {
        t.latencyMsSum += r.modelCall.latencyMs;
        t.latencyMsMax = Math.max(t.latencyMsMax, r.modelCall.latencyMs);
      }
    }
    if (r.sourceRetrieval !== undefined) t.retrievals += 1;
    if (r.toolExec !== undefined) t.toolExecs += 1;
    if (r.executionMode !== 'live') t.nonLive += 1;
  }
  return t;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ---- revision quality sequence ----

export type QualityStep = 'improved' | 'neutral' | 'worse' | 'inconclusive';

/** Chain-ordered quality deltas; missing qualityDelta is NOT a step (no invented judgment). */
export function qualitySequence(revisions: { qualityDelta?: { status: string } }[]): QualityStep[] {
  const seq: QualityStep[] = [];
  for (const r of revisions) {
    const s = r.qualityDelta?.status;
    if (s === 'improved' || s === 'neutral' || s === 'worse' || s === 'inconclusive') seq.push(s);
  }
  return seq;
}
