/**
 * Strict-FC null-type probe (2026-08-22, audit P1-2): DeepSeek's strict-mode docs list
 * supported JSON-schema types WITHOUT null; zodToStrictJsonSchema emits anyOf:[inner,{type:'null'}]
 * for every optional/default/catch field. This probe sends the minimal decisive schemas
 * (anyOf-with-null; bare-{} sub-schema from z.record projection) to the beta endpoint and
 * persists the RAW responses — command-level evidence either way.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const key = process.env.DEEPSEEK_API_KEY;
if (!key) { console.error('FATAL: DEEPSEEK_API_KEY not set'); process.exit(1); }
const url = 'https://api.deepseek.com/beta/chat/completions';

const mkBody = (parameters) => ({
  model: 'deepseek-chat',
  messages: [
    { role: 'system', content: 'Respond via the tool.' },
    { role: 'user', content: 'Call the respond tool with a=1 and note="x".' },
  ],
  tools: [{ type: 'function', function: { name: 'respond', strict: true, description: 'test', parameters } }],
  tool_choice: { type: 'function', function: { name: 'respond' } },
});

const cases = {
  anyOf_null: {
    type: 'object', additionalProperties: false, required: ['a', 'note'],
    properties: {
      a: { type: 'integer' },
      note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    },
  },
  bare_empty_subschema: {
    type: 'object', additionalProperties: false, required: ['a', 'extra'],
    properties: { a: { type: 'integer' }, extra: { anyOf: [{ type: 'array', items: { type: 'string' } }, {}] } },
  },
};

const out = [];
for (const [name, parameters] of Object.entries(cases)) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(mkBody(parameters)),
    });
    const bodyText = await res.text();
    let parsed; try { parsed = JSON.parse(bodyText); } catch { parsed = bodyText.slice(0, 500); }
    const toolArgs = parsed?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    out.push({ case: name, status: res.status, ms: Date.now() - t0, finish: parsed?.choices?.[0]?.finish_reason, toolArgs, error: parsed?.error ?? null, raw: JSON.stringify(parsed).slice(0, 800) });
  } catch (e) {
    out.push({ case: name, fetchError: String(e.message).slice(0, 300) });
  }
  console.log(JSON.stringify(out.at(-1)).slice(0, 300));
}
mkdirSync(resolve(process.cwd(), 'spikes/output'), { recursive: true });
writeFileSync(resolve(process.cwd(), 'spikes/output/strict-fc-null-probe.json'), JSON.stringify(out, null, 1));
console.log('DONE -> spikes/output/strict-fc-null-probe.json');
