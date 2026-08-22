/**
 * ZAI (GLM) live-route probe — ONE minimal structured call through the product provider.
 * Receipt persists hashes only; the API key never appears in output or the record.
 * Fail-closed on missing key. Usage: node spikes/zai-route-probe.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createZaiProvider } from '../dist/providers/zai.js';

const OUT = resolve(process.cwd(), 'spikes/output/zai-route-probe.json');
const key = process.env.ZAI_API_KEY;
if (!key) {
  console.error('FATAL: ZAI_API_KEY not set — no probe, no receipt, no fabricated evidence.');
  process.exit(1);
}
const provider = createZaiProvider({ totalTimeoutMs: 120_000 });
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
    purpose: 'zai-route-probe',
  },
  parse,
);
const record = {
  at: new Date().toISOString(),
  route: 'zai (GLM, bigmodel.cn OpenAI-compatible)',
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
console.log(JSON.stringify({ ok: record.ok, model: record.modelId, wallMs: record.wallMs, usage: record.receipt?.usage ?? null, error: record.error ?? null, out: OUT }, null, 1));
process.exit(res.ok ? 0 : 1);
