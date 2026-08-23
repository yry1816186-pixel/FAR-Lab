import { describe, expect, it } from 'vitest';
import { aggregateReceipts, bucketEvents, eventCategory, formatTokens, qualitySequence } from '../web/src/viz/cross-viz';
import type { ProvenanceReceipt } from '../web/src/api/types';

describe('eventCategory / bucketEvents', () => {
  it('buckets by type pattern with fixed category order and live counts', () => {
    const buckets = bucketEvents([
      'stage_started', 'stage_done', 'run_created',
      'model_call_receipt',
      'source_retrieval_succeeded',
      'tool_exec_finished',
      'agent_session_started',
      'weird_unknown',
    ]);
    expect(buckets.map((b) => b.category)).toEqual(['lifecycle', 'model', 'retrieval', 'tool', 'agent', 'other']);
    expect(buckets.map((b) => b.count)).toEqual([3, 1, 1, 1, 1, 1]);
  });

  it('empty categories never appear', () => {
    expect(bucketEvents(['stage_done'])).toEqual([{ category: 'lifecycle', count: 1 }]);
    expect(bucketEvents([])).toEqual([]);
  });

  it('lifecycle prefix wins over later patterns (stage_model_x → lifecycle)', () => {
    expect(eventCategory('stage_model_thing')).toBe('lifecycle');
    expect(eventCategory('corpus_snapshot_written')).toBe('retrieval');
  });
});

describe('aggregateReceipts', () => {
  const r = (over: Partial<ProvenanceReceipt>): ProvenanceReceipt => ({
    id: 'r', runId: 'run', kind: 'model_call', executionMode: 'live', at: '2026-08-23T00:00:00Z', ...over,
  });

  it('sums tokens and latency across model calls; counts each receipt kind once', () => {
    const totals = aggregateReceipts([
      r({ id: 'a', modelCall: { provider: 'p', modelId: 'm', latencyMs: 1200, requestHash: 'h', outputHash: 'h', usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 } } }),
      r({ id: 'b', kind: 'source_retrieval', modelCall: undefined, sourceRetrieval: { family: 'arxiv', query: 'q', httpStatus: 200, resultCount: 3 } }),
      r({ id: 'c', modelCall: { provider: 'p', modelId: 'm', latencyMs: 800, requestHash: 'h', outputHash: 'h' } }),
      r({ id: 'd', kind: 'tool_exec', modelCall: undefined, toolExec: { tool: 't', inputHash: 'h', outputHash: 'h' } }),
      r({ id: 'e', executionMode: 'test' }),
    ]);
    expect(totals.modelCalls).toBe(2);
    expect(totals.retrievals).toBe(1);
    expect(totals.toolExecs).toBe(1);
    expect(totals.nonLive).toBe(1);
    expect(totals.totalTokens).toBe(1500);
    expect(totals.latencyMsSum).toBe(2000);
    expect(totals.latencyMsMax).toBe(1200);
  });

  it('usage-less model calls add latency but zero tokens', () => {
    const totals = aggregateReceipts([
      r({ modelCall: { provider: 'p', modelId: 'm', latencyMs: 50, requestHash: 'h', outputHash: 'h' } }),
    ]);
    expect(totals.totalTokens).toBe(0);
    expect(totals.latencyMsSum).toBe(50);
  });
});

describe('formatTokens', () => {
  it('uses k/M only at real thresholds', () => {
    expect(formatTokens(940)).toBe('940');
    expect(formatTokens(1500)).toBe('1.5k');
    expect(formatTokens(2_400_000)).toBe('2.4M');
  });
});

describe('qualitySequence', () => {
  it('keeps only real qualityDelta statuses — missing judgment is not a step', () => {
    const seq = qualitySequence([
      { qualityDelta: { status: 'improved' } },
      {},
      { qualityDelta: { status: 'neutral' } },
      { qualityDelta: { status: 'mystery' } }, // unknown status value dropped, not coerced
      { qualityDelta: { status: 'worse' } },
    ]);
    expect(seq).toEqual(['improved', 'neutral', 'worse']);
  });
});
