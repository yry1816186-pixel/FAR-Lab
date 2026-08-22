/**
 * Dual-endpoint probe for the user-provided ZAI key (from .far-run/secrets.env):
 * the SAME key against BOTH official Zhipu platforms — international api.z.ai and
 * China open.bigmodel.cn (accounts are SEPARATE: a funded key on one returns 1113
 * on the other). One minimal chat call per endpoint; status + verbatim body only
 * (bodies never contain the key). No key is ever printed.
 */
import './load-secrets-env.mjs';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const key = process.env.ZAI_API_KEY;
if (!key) { console.error('FATAL: ZAI_API_KEY not in secrets.env'); process.exit(1); }

const ENDPOINTS = [
  { name: 'international api.z.ai', url: 'https://api.z.ai/api/paas/v4/chat/completions' },
  { name: 'china open.bigmodel.cn', url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' },
];
const results = [];
for (const ep of ENDPOINTS) {
  const t0 = Date.now();
  try {
    const res = await fetch(ep.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'glm-4.6', messages: [{ role: 'user', content: 'reply with the single word: ok' }], max_tokens: 8, temperature: 0 }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
    results.push({
      endpoint: ep.name, httpStatus: res.status, wallMs: Date.now() - t0,
      bodyKeys: Object.keys(body),
      error: body.error ? { code: body.error.code, message: String(body.error.message).slice(0, 200) } : null,
      content: body.choices?.[0]?.message?.content ?? null,
      usage: body.usage ?? null,
      model: body.model ?? null,
    });
  } catch (e) {
    results.push({ endpoint: ep.name, transportError: String(e.message).slice(0, 200), wallMs: Date.now() - t0 });
  }
}
writeFileSync(resolve(process.cwd(), 'spicks-zai-endpoint-probe.json'.replace('spicks', 'spikes/output/zai')), JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
for (const r of results) {
  console.log(JSON.stringify({ endpoint: r.endpoint, httpStatus: r.httpStatus ?? null, transportError: r.transportError ?? null, errCode: r.error?.code ?? null, errMsg: r.error?.message ?? null, content: r.content ?? null, usage: r.usage, wallMs: r.wallMs }));
}
