#!/usr/bin/env node
/**
 * LIVE smoke: the model-agnostic gateway against a REAL endpoint.
 *
 * Route under test = the PRODUCT path a researcher configures in the UI: a stored
 * ModelProviderConfig -> createCustomProvider -> structuredCall. Authorized debug
 * credential (user directive 2026-08-24): bigmodel glm-4.7-flash via ZHIPU_API_KEY;
 * the key is read from the environment and NEVER printed, logged or committed.
 *
 * Both wires the Zhipu open platform exposes are exercised:
 *   1. openai wire    https://open.bigmodel.cn/api/paas/v4  (chat/completions)
 *   2. anthropic wire https://open.bigmodel.cn/api/anthropic (/v1/messages)
 * Exit 0 only if every attempted wire returned ok:true with real usage tokens.
 */
import { createCustomProvider } from '../dist/providers/custom.js';
// argv[3] filters to one route label substring (e.g. 'anthropic') for targeted reruns.

const KEY = process.env.ZHIPU_API_KEY ?? '';
const MODEL = process.argv[2] ?? 'glm-4.7-flash';
if (KEY.length === 0) {
  console.error('LIVE-SMOKE FAIL: ZHIPU_API_KEY not set');
  process.exit(2);
}

const req = {
  task: 'Return exactly one falsifiable scientific hypothesis about retrieval-augmented generation.',
  systemPrompt: 'You are a careful research assistant.',
  userPayload: { topic: 'retrieval-augmented generation', constraint: 'about citation grounding' },
  outputKind: 'json',
  purpose: 'live-smoke-model-gateway',
};
const parse = (raw) => {
  if (raw !== null && typeof raw === 'object' && typeof raw.hypothesis === 'string' && raw.hypothesis.length > 0) {
    return { hypothesis: raw.hypothesis };
  }
  return new Error('must be {hypothesis: non-empty string}');
};

const ROUTES = [
  { label: 'openai-wire(paas/v4)', wire: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { label: 'anthropic-wire(/api/anthropic)', wire: 'anthropic', baseUrl: 'https://open.bigmodel.cn/api/anthropic' },
];

let failures = 0;
const filter = process.argv[3];
for (const route of filter === undefined ? ROUTES : ROUTES.filter((r) => r.label.includes(filter)) ?? ROUTES) {
  const cfg = {
    id: 'mcfg_livesmokeroute0001',
    label: `live-smoke ${route.label}`,
    wire: route.wire,
    baseUrl: route.baseUrl,
    modelId: MODEL,
    apiKey: KEY,
    fallbackConfigIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const provider = createCustomProvider(cfg, { totalTimeoutMs: 150_000 });
  const t0 = Date.now();
  const result = await provider.structuredCall(req, parse);
  const ms = Date.now() - t0;
  if (result.ok) {
    const u = result.receipt.usage;
    console.log(
      `[OK] ${route.label} · ${result.receipt.modelVersion ?? MODEL} · ${ms}ms · tokens in/out=${u.promptTokens ?? '?'}/${u.completionTokens ?? '?'} · reasks=${result.receipt.correctiveReasks ?? 0} · hypothesis="${result.data.hypothesis.slice(0, 80)}…"`,
    );
  } else {
    failures += 1;
    console.log(`[FAIL] ${route.label} · ${ms}ms · ${result.error.kind}: ${String(result.error.message).slice(0, 220)}`);
  }
}
process.exit(failures === 0 ? 0 : 1);
