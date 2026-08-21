/**
 * Qwen-via-Bailian live-route probe (B-QWEN-LIVE-ROUTE resolution, 2026-08-22).
 *
 * The official competition rule (project-spec/COMPETITION.md §0, verbatim recorded)
 * mandates Qwen-series models called via Alibaba Bailian with receipts. This probe
 * makes ONE real structured call through the product's dashscope provider
 * (createDashScopeProvider -> compatible-mode/v1) and persists the full receipt
 * WITHOUT the key value — command-level evidence for the blocker's resolution.
 *
 * Fail-closed: exits 1 with instructions when DASHSCOPE_API_KEY is absent —
 * no fabricated live evidence, ever.
 *
 * Usage: node spikes/qwen-route-probe.mjs   (env: DASHSCOPE_API_KEY, optional FARLAB_DASHSCOPE_MODEL)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDashScopeProvider } from '../dist/providers/dashscope.js';

const OUT = resolve(process.cwd(), 'spikes/output/qwen-route-probe.json');
const key = process.env.DASHSCOPE_API_KEY;
if (!key) {
  console.error('FATAL: DASHSCOPE_API_KEY not set — provide the Bailian key (阿里云百炼 API-KEY) to run the live-route probe. No probe, no receipt, no fabricated evidence.');
  process.exit(1);
}
const provider = createDashScopeProvider({ totalTimeoutMs: 120_000 });
const parse = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return new Error('not an object');
  const { statement, observable } = raw;
  if (typeof statement !== 'string' || statement.length < 10) return new Error('statement missing');
  if (typeof observable !== 'string' || observable.length < 5) return new Error('observable missing');
  return raw;
};
const t0 = Date.now();
const res = await provider.structuredCall(
  {
    task: 'State one falsifiable scientific hypothesis about why tumors develop resistance to kinase inhibitors, with the observable that would test it.',
    systemPrompt: 'You are a careful research assistant. Respond ONLY with JSON: {"statement": string, "observable": string}.',
    userPayload: { domain: 'cancer biology' },
    outputKind: 'json',
    temperature: 0,
    maxTokens: 500,
    purpose: 'qwen-route-probe',
  },
  parse,
);
const record = {
  at: new Date().toISOString(),
  route: 'dashscope compatible-mode/v1 (Bailian, Qwen-series)',
  modelId: provider.modelId,
  ok: res.ok,
  wallMs: Date.now() - t0,
  ...(res.ok
    ? {
        data: res.data,
        receipt: {
          provider: res.receipt.provider,
          modelVersion: res.receipt.modelVersion,
          usage: res.receipt.usage,
          latencyMs: res.receipt.latencyMs,
          finishReason: res.receipt.finishReason,
          executionMode: res.receipt.executionMode,
          requestHash: res.receipt.requestHash,
          outputHash: res.receipt.outputHash,
        },
      }
    : { error: res.error }),
  note: 'API key deliberately absent from this record; hashes only.',
};
mkdirSync(resolve(process.cwd(), 'spikes/output'), { recursive: true });
writeFileSync(OUT, JSON.stringify(record, null, 1));
console.log(JSON.stringify({ ok: record.ok, model: record.modelId, wallMs: record.wallMs, usage: record.receipt?.usage ?? null, out: OUT }, null, 1));
process.exit(res.ok ? 0 : 1);
