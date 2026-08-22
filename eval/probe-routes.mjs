/**
 * One-shot model-route probe (Wave-9 unlock check). Exit code = number of LIVE routes
 * (0 = still blocked). Prints verbatim error bodies — never paraphrased — so probe
 * evidence stays command-level honest. No secrets printed.
 *
 * Usage: node eval/probe-routes.mjs
 */
const ROUTES = [
  { name: 'deepseek', url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', keyEnv: 'DEEPSEEK_API_KEY' },
  { name: 'zai', url: 'https://api.z.ai/api/paas/v4/chat/completions', model: 'glm-4.6', keyEnv: 'ZAI_API_KEY' },
  { name: 'dashscope', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus', keyEnv: 'DASHSCOPE_API_KEY' },
];

let live = 0;
for (const r of ROUTES) {
  const key = process.env[r.keyEnv];
  if (!key) { console.log(`${r.name}: NO-KEY`); continue; }
  try {
    const res = await fetch(r.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: r.model, messages: [{ role: 'user', content: 'Reply OK' }], max_tokens: 5, temperature: 0 }),
    });
    const body = JSON.stringify(await res.json().catch(() => ({}))).slice(0, 160);
    console.log(`${r.name}: ${res.status} ${body}`);
    if (res.status === 200) { console.log(`*** ${r.name.toUpperCase()} ROUTE LIVE ***`); live += 1; }
  } catch (e) {
    console.log(`${r.name}: FETCH-ERR ${String(e).slice(0, 100)}`);
  }
}
process.exit(live);
