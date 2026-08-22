/** Probe open.bigmodel.cn protocol variants using loadLocalSecrets (no secret echo). */
import { loadLocalSecrets } from '../eval/load-secrets.mjs';

loadLocalSecrets();
const key = process.env.ZAI_API_KEY;
if (!key) {
  console.error('ZAI_API_KEY not present after loading secrets');
  process.exit(2);
}

const probes = [
  {
    name: 'P1 openai-compat paas/v4',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: { model: 'glm-4.6', max_tokens: 8, messages: [{ role: 'user', content: 'Reply OK' }] },
  },
  {
    name: 'P2 anthropic-compat /api/anthropic/v1/messages',
    url: 'https://open.bigmodel.cn/api/anthropic/v1/messages',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: { model: 'glm-4.6', max_tokens: 8, messages: [{ role: 'user', content: 'Reply OK' }] },
  },
  {
    name: 'P2b anthropic-compat Bearer auth',
    url: 'https://open.bigmodel.cn/api/anthropic/v1/messages',
    headers: { Authorization: `Bearer ${key}`, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: { model: 'glm-4.6', max_tokens: 8, messages: [{ role: 'user', content: 'Reply OK' }] },
  },
];

for (const p of probes) {
  try {
    const res = await fetch(p.url, { method: 'POST', headers: p.headers, body: JSON.stringify(p.body) });
    const text = await res.text();
    console.log(`${p.name}: HTTP ${res.status} :: ${text.slice(0, 260)}`);
  } catch (e) {
    console.log(`${p.name}: FETCH-ERROR ${String(e.message).slice(0, 120)}`);
  }
}
