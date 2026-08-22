/** Provider-level live probe: one structured call on the Anthropic wire (real key via loadLocalSecrets; no value echoed). */
import { loadLocalSecrets } from '../eval/load-secrets.mjs';

loadLocalSecrets();
const { createZaiProvider } = await import('../dist/providers/zai.js');

const provider = createZaiProvider({ totalTimeoutMs: 60_000 });
if (!provider.liveReady) {
  console.error('PROBE FAIL: zai not live-ready');
  process.exit(1);
}
const res = await provider.structuredCall(
  {
    task: 'probe:anthropic-wire',
    systemPrompt: 'You reply with a single JSON object only.',
    userPayload: { question: 'Return a hypothesis one-liner about why the sky is blue.', schema: { hypothesis: 'string', confidence: 'high|medium|low' } },
    outputKind: 'json',
    temperature: 0,
    maxTokens: 200,
    purpose: 'probe:anthropic-wire',
  },
  (raw) => {
    const r = raw;
    if (r === null || typeof r !== 'object' || Array.isArray(r)) return new Error('not an object');
    if (typeof r['hypothesis'] !== 'string' || r['hypothesis'].length < 10) return new Error('hypothesis missing/short');
    if (typeof r['confidence'] !== 'string') return new Error('confidence missing');
    return r;
  },
);
if (res.ok) {
  const h = res.data['hypothesis'];
  console.log('PROBE OK :: finishReason=' + res.receipt.finishReason, ':: model=' + res.receipt.modelVersion, ':: usage=' + JSON.stringify(res.receipt.usage));
  console.log('hypothesis head:', String(h).slice(0, 80));
} else {
  console.error('PROBE FAIL :: kind=' + res.error.kind, ':: retryable=' + res.error.retryable, ':: msg=' + res.error.message.slice(0, 160));
  process.exit(1);
}
