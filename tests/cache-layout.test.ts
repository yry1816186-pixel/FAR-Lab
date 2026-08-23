import { describe, it, expect } from 'vitest';
import { parseOpenAIUsage, parseAnthropicUsage } from '../src/providers/http.js';
import { renderRerankPayload, rerankWindowPlan, type PoolEntry } from '../src/pipeline/stages/retrieve.js';
import type { RawSourceRecord } from '../src/shared/ports.js';

// RU-9 GO1 — token-kind accounting + cache-aware rerank layout. Fixed provider
// JSON fixtures + cross-window common-prefix snapshot. All offline/deterministic.

describe('usage parsing (fixed provider JSON shapes)', () => {
  it('OpenAI wire: cached + reasoning tokens from *_details envelopes; absent fields stay absent', () => {
    const u = parseOpenAIUsage({
      prompt_tokens: 1000, completion_tokens: 300, total_tokens: 1300,
      prompt_tokens_details: { cached_tokens: 800 },
      completion_tokens_details: { reasoning_tokens: 120 },
    });
    expect(u).toEqual({
      promptTokens: 1000, completionTokens: 300, totalTokens: 1300,
      cachedInputTokens: 800, reasoningTokens: 120,
    });
    // no details envelopes, no fabricated zeros
    expect(parseOpenAIUsage({ prompt_tokens: 10, completion_tokens: 5 })).toEqual({
      promptTokens: 10, completionTokens: 5,
    });
    // malformed usage object tolerated (fail-open for accounting fields only)
    expect(parseOpenAIUsage(undefined)).toEqual({});
    expect(parseOpenAIUsage('junk')).toEqual({});
  });

  it('Anthropic wire: cache_creation/cache_read captured from top-level usage', () => {
    const u = parseAnthropicUsage({
      input_tokens: 2048, output_tokens: 512,
      cache_creation_input_tokens: 1024, cache_read_input_tokens: 4096,
    });
    expect(u).toEqual({
      promptTokens: 2048, completionTokens: 512,
      cacheCreationTokens: 1024, cacheReadTokens: 4096,
    });
    expect(parseAnthropicUsage({ input_tokens: 10 })).toEqual({ promptTokens: 10 });
    expect(parseAnthropicUsage(null)).toEqual({});
  });

  it('parsed token kinds round-trip through the receipt usage schema (old receipts unaffected)', async () => {
    const { ProvenanceReceipt } = await import('../src/domain/provenance.js');
    const receipt = ProvenanceReceipt.parse({
      id: 'rcp_cachelayout000000000000a', runId: 'run_cachelayout0000000000000a',
      kind: 'model_call', stage: 'retrieve', executionMode: 'test',
      at: '2026-08-24T00:00:00.000Z',
      modelCall: {
        provider: 'zai', modelId: 'glm-5.3', purpose: 'test',
        requestHash: 'a'.repeat(64), outputHash: 'b'.repeat(64), latencyMs: 10,
        usage: { promptTokens: 100, completionTokens: 50, cachedInputTokens: 80, reasoningTokens: 20 },
      },
    });
    expect(receipt.modelCall!.usage.cachedInputTokens).toBe(80);
    expect(receipt.modelCall!.usage.reasoningTokens).toBe(20);
  });
});

describe('rerank cache-aware layout (cross-window prefix snapshot)', () => {
  const mkEntry = (title: string, year: number): PoolEntry => {
    const record: RawSourceRecord = {
      identifiers: [{ kind: 'doi', value: `10.1/${title}` }],
      title, publicationYear: year,
      contentDepth: 'abstract', accessState: 'unknown',
      abstractText: `Abstract of ${title}. `.repeat(40).slice(0, 1200),
      normalized: {},
    };
    return { key: `k:${title}`, record, purposes: new Set(['supporting']) };
  };
  const entries = Array.from({ length: 30 }, (_, i) => mkEntry(`Study ${String(i).padStart(2, '0')}`, 2020 + (i % 6)));

  const render = (slice: readonly PoolEntry[]): string =>
    JSON.stringify(renderRerankPayload('Does vitamin D improve depression outcomes?', slice));

  it('the same slice renders byte-identically (determinism)', () => {
    const slice = entries.slice(0, 24);
    expect(render(slice)).toBe(render([...slice]));
  });

  it('consecutive windows share a common prefix LONGER than the stable header alone', () => {
    const windows = rerankWindowPlan(entries.length, 24, 12);
    expect(windows.length).toBeGreaterThanOrEqual(2);
    const headerOnly = 'Does vitamin D improve depression outcomes?'.length + 'questionText":'.length;
    let prev: string | undefined;
    for (const [start, end] of windows) {
      const payload = render(entries.slice(start, end));
      if (prev !== undefined) {
        let n = 0;
        while (n < prev.length && n < payload.length && prev[n] === payload[n]) n += 1;
        // the shared leading items of overlapping windows extend the common
        // prefix beyond the question header — that is what a prefix cache hits
        expect(n).toBeGreaterThan(headerOnly);
      }
      prev = payload;
    }
  });
});
