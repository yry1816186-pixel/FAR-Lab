#!/usr/bin/env node
/**
 * FAR-Lab W0 model-execution-plane spike probe.
 *
 * Probes OpenAI-compatible chat completion endpoints for reachability,
 * model listing, and structured-JSON-output reliability. Records per-call
 * evidence: HTTP status, model, usage, latency ms, sha256 of response body.
 *
 * Usage:
 *   node spikes/model-spike/probe.mjs --provider zai
 *   node spikes/model-spike/probe.mjs --provider deepseek
 *   node spikes/model-spike/probe.mjs --provider relay
 *   node spikes/model-spike/probe.mjs --provider all   (default)
 *
 * Security: API keys are read from env and NEVER written to files/stdout
 * verbatim; only the first 6 chars + length are shown.
 *
 * Exit codes: 0 = at least one provider produced a live chat completion;
 *             1 = bad args / missing key; 2 = all probed providers blocked.
 */

import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = join(__dirname, 'runs');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const maskKey = (k) =>
  k ? `${k.slice(0, 6)}...(${k.length} chars)` : 'NOT_SET';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

const log = (...a) => console.error('[probe]', ...a); // progress -> stderr

async function timedFetch(url, init = {}, timeoutMs = 45000) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.text();
    return {
      networkOk: true,
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get('content-type') ?? '',
      body,
      latencyMs: Math.round(performance.now() - t0),
    };
  } catch (e) {
    return {
      networkOk: false,
      error: `${e.name}: ${e.message}`,
      latencyMs: Math.round(performance.now() - t0),
    };
  }
}

function parseModelList(body) {
  try {
    const j = JSON.parse(body);
    const arr = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : null;
    if (!arr) return { ok: false, error: 'no .data array', rawShape: Object.keys(j ?? {}) };
    const ids = arr.map((m) => m?.id ?? m?.name ?? String(m)).filter(Boolean);
    return { ok: true, count: ids.length, ids };
  } catch (e) {
    return { ok: false, error: `unparsable JSON: ${e.message}`, bodyHead: body.slice(0, 200) };
  }
}

// ---------------------------------------------------------------------------
// structured-output reliability harness
// ---------------------------------------------------------------------------

const STRUCT_FIELDS = {
  hypothesis: { type: 'string', minLen: 1 },
  confidence: { type: 'number', min: 0, max: 1 },
  supporting_evidence: { type: 'string[]', minItems: 2 },
  falsification_test: { type: 'string', minLen: 1 },
};

const STRUCT_PROMPT = {
  system:
    'You are a research assistant. You output ONLY a single valid JSON object. ' +
    'No markdown fences, no commentary, no text before or after the JSON.',
  user:
    'Generate exactly one JSON object with these keys:\n' +
    '- "hypothesis": non-empty string, a scientific hypothesis about why retrieval-augmented generation reduces LLM hallucination\n' +
    '- "confidence": a number between 0 and 1\n' +
    '- "supporting_evidence": an array of exactly 2 strings\n' +
    '- "falsification_test": non-empty string, one concrete experiment that could falsify the hypothesis\n' +
    'Output the JSON object only.',
};

/** Try to parse model output as strict JSON; fall back to fence-stripping. */
function extractJson(raw) {
  const attempts = [];
  try {
    const v = JSON.parse(raw);
    attempts.push({ method: 'direct JSON.parse', ok: true });
    return { value: v, attempts };
  } catch (e) {
    attempts.push({ method: 'direct JSON.parse', ok: false, error: e.message });
  }
  const stripped = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  try {
    const v = JSON.parse(stripped);
    attempts.push({ method: 'strip-markdown-fence', ok: true });
    return { value: v, attempts };
  } catch (e) {
    attempts.push({ method: 'strip-markdown-fence', ok: false, error: e.message });
  }
  return { value: null, attempts };
}

/** Strict, dependency-free validation against STRUCT_FIELDS. */
function validateStructured(obj) {
  const errors = [];
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, errors: ['top-level value is not a JSON object'] };
  }
  for (const [k, spec] of Object.entries(STRUCT_FIELDS)) {
    if (!(k in obj)) { errors.push(`missing field "${k}"`); continue; }
    const v = obj[k];
    if (spec.type === 'string') {
      if (typeof v !== 'string') errors.push(`"${k}" must be string, got ${typeof v}`);
      else if (v.length < spec.minLen) errors.push(`"${k}" must be non-empty`);
    } else if (spec.type === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`"${k}" must be finite number, got ${typeof v}`);
      else if (v < spec.min || v > spec.max) errors.push(`"${k}" out of range [0,1]: ${v}`);
    } else if (spec.type === 'string[]') {
      if (!Array.isArray(v)) errors.push(`"${k}" must be array, got ${typeof v}`);
      else if (v.length < spec.minItems) errors.push(`"${k}" needs >= ${spec.minItems} items, got ${v.length}`);
      else if (!v.every((x) => typeof x === 'string' && x.length > 0)) errors.push(`"${k}" items must be non-empty strings`);
    }
  }
  const extra = Object.keys(obj).filter((k) => !(k in STRUCT_FIELDS));
  return { valid: errors.length === 0, errors, extraFields: extra };
}

/** Run one structured-output attempt against a chat endpoint. */
async function structuredChat({ label, url, apiKey, model, useResponseFormat }) {
  const messages = [
    { role: 'system', content: STRUCT_PROMPT.system },
    { role: 'user', content: STRUCT_PROMPT.user },
  ];
  const payload = { model, messages, temperature: 0.2, max_tokens: 800 };
  if (useResponseFormat) payload.response_format = { type: 'json_object' };

  const r = await timedFetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const rec = {
    label,
    requestUrl: url,
    model,
    responseFormatMode: useResponseFormat ? 'json_object' : 'prompt-only',
  };

  if (!r.networkOk) {
    return { ...rec, outcome: 'NETWORK_ERROR', error: r.error, latencyMs: r.latencyMs };
  }

  rec.httpStatus = r.status;
  rec.latencyMs = r.latencyMs;
  rec.responseBodySha256 = sha256(r.body);

  let j = null;
  try { j = JSON.parse(r.body); } catch { /* non-JSON error body */ }

  if (r.status !== 200) {
    return {
      ...rec,
      outcome: 'HTTP_ERROR',
      errorBodyHead: r.body.slice(0, 400),
      errorFields: j && typeof j === 'object' ? Object.keys(j) : undefined,
    };
  }

  const content = j?.choices?.[0]?.message?.content;
  rec.respondedModel = j?.model ?? null;
  rec.usage = j?.usage
    ? {
        prompt_tokens: j.usage.prompt_tokens ?? null,
        completion_tokens: j.usage.completion_tokens ?? null,
        total_tokens: j.usage.total_tokens ?? null,
      }
    : null;
  rec.finishReason = j?.choices?.[0]?.finish_reason ?? null;

  if (typeof content !== 'string') {
    return { ...rec, outcome: 'NO_CONTENT', topLevelKeys: Object.keys(j ?? {}) };
  }

  const { value, attempts } = extractJson(content);
  rec.jsonParse = attempts;
  if (value === null) {
    return { ...rec, outcome: 'INVALID_JSON', contentHead: content.slice(0, 300) };
  }

  const v = validateStructured(value);
  rec.schemaValidation = v;
  rec.outcome = v.valid ? 'SCHEMA_VALID' : 'SCHEMA_INVALID';
  rec.parsedValue = value;
  return rec;
}

/** Model-list probe for one base URL. */
async function listModels({ label, url, apiKey }) {
  const r = await timedFetch(url, {
    headers: { authorization: `Bearer ${apiKey}` },
  }, 20000);
  const rec = { label, requestUrl: url };
  if (!r.networkOk) return { ...rec, networkOk: false, error: r.error, latencyMs: r.latencyMs };
  rec.networkOk = true;
  rec.httpStatus = r.status;
  rec.latencyMs = r.latencyMs;
  const parsed = parseModelList(r.body);
  if (r.status === 200 && parsed.ok) {
    rec.outcome = 'OK';
    rec.count = parsed.count;
    rec.ids = parsed.ids;
  } else {
    rec.outcome = 'FAIL';
    rec.parseError = parsed.error;
    rec.bodyHead = r.body.slice(0, 300);
  }
  return rec;
}

// ---------------------------------------------------------------------------
// provider probes
// ---------------------------------------------------------------------------

async function probeZai() {
  const apiKey = process.env.ZHIPU_API_KEY ?? '';
  const out = {
    provider: 'zai',
    key: maskKey(apiKey),
    modelListAttempts: [],
    structuredAttempts: [],
    conclusion: null,
  };
  if (!apiKey) { out.conclusion = 'BLOCKED: ZHIPU_API_KEY not set'; return out; }

  // Candidate OpenAI-compatible bases, in priority order.
  const bases = [
    'https://api.z.ai/api/paas/v4',   // primary (task spec)
    'https://open.bigmodel.cn/api/paas/v4', // same protocol family, bigmodel domain
    'https://api.z.ai/api/paas/v3',   // legacy v3 fallback per task spec
  ];

  let activeBase = null;
  const okBases = [];
  for (const base of bases) {
    const rec = await listModels({ label: `list:${base}`, url: `${base}/models`, apiKey });
    out.modelListAttempts.push(rec);
    log('zai list', base, '->', rec.outcome ?? rec.error, rec.httpStatus ?? '');
    if (rec.outcome === 'OK') okBases.push(base);
  }
  activeBase = okBases[0] ?? null;

  // Structured calls. Prefer a live-listed glm model, else known defaults.
  let model = null;
  const listed = out.modelListAttempts.find((m) => m.outcome === 'OK');
  if (listed) {
    const ids = listed.ids;
    model =
      ids.find((m) => /^glm-4(\.[56789])?$/.test(m)) ??
      ids.find((m) => m.startsWith('glm-4.6')) ??
      ids.find((m) => m.startsWith('glm-4')) ??
      ids.find((m) => m.startsWith('glm')) ??
      null;
  }
  if (!model) model = 'glm-4.6'; // documented default if listing unavailable
  out.chatModel = model;

  // Try each reachable base until a schema-valid structured call lands.
  for (const base of (okBases.length ? okBases : [bases[0]])) {
    const chatUrl = `${base}/chat/completions`;
    out.structuredAttempts.push(
      await structuredChat({ label: `T1-prompt-only@${base}`, url: chatUrl, apiKey, model, useResponseFormat: false })
    );
    log('zai T1', base, '->', out.structuredAttempts.at(-1).outcome);
    if (out.structuredAttempts.at(-1).outcome === 'SCHEMA_VALID') break;
    out.structuredAttempts.push(
      await structuredChat({ label: `T2-json-object@${base}`, url: chatUrl, apiKey, model, useResponseFormat: true })
    );
    log('zai T2', base, '->', out.structuredAttempts.at(-1).outcome);
    if (out.structuredAttempts.at(-1).outcome === 'SCHEMA_VALID') break;
  }

  const anyValid = out.structuredAttempts.some((a) => a.outcome === 'SCHEMA_VALID');
  out.conclusion = anyValid
    ? `REACHABLE: live chat completion OK via ${activeBase ?? bases[0]} (model ${model}); structured JSON validated`
    : `PARTIAL/FAIL: no schema-valid structured call (see attempts); base=${activeBase ?? 'none'}`;
  return out;
}

async function probeDeepseek() {
  const apiKey = process.env.DEEPSEEK_API_KEY ?? '';
  const out = {
    provider: 'deepseek',
    key: maskKey(apiKey),
    modelListAttempts: [],
    structuredAttempts: [],
    conclusion: null,
  };
  if (!apiKey) { out.conclusion = 'BLOCKED: DEEPSEEK_API_KEY not set'; return out; }

  const base = 'https://api.deepseek.com';
  out.modelListAttempts.push(
    await listModels({ label: `list:${base}`, url: `${base}/models`, apiKey })
  );
  const listed = out.modelListAttempts[0];
  log('deepseek list ->', listed.outcome ?? listed.error, listed.httpStatus ?? '');

  const model = 'deepseek-chat';
  out.chatModel = model;
  const chatUrl = `${base}/chat/completions`;
  out.structuredAttempts.push(
    await structuredChat({ label: 'T1-prompt-only', url: chatUrl, apiKey, model, useResponseFormat: false })
  );
  log('deepseek T1 ->', out.structuredAttempts.at(-1).outcome);
  out.structuredAttempts.push(
    await structuredChat({ label: 'T2-json-object', url: chatUrl, apiKey, model, useResponseFormat: true })
  );
  log('deepseek T2 ->', out.structuredAttempts.at(-1).outcome);

  const anyValid = out.structuredAttempts.some((a) => a.outcome === 'SCHEMA_VALID');
  out.conclusion = anyValid
    ? `REACHABLE: live chat completion OK via ${base} (model ${model}); structured JSON validated`
    : `PARTIAL/FAIL: no schema-valid structured call (see attempts)`;
  return out;
}

async function probeRelay() {
  const apiKey = process.env.RELAY_API_KEY ?? '';
  const out = {
    provider: 'relay',
    key: maskKey(apiKey),
    baseDiscovery: [],
    modelListAttempts: [],
    structuredAttempts: [],
    qwenAvailability: null,
    conclusion: null,
  };
  if (!apiKey) { out.conclusion = 'BLOCKED: RELAY_API_KEY not set'; return out; }

  // Base-URL discovery, in priority order (see evidence/W0 report).
  // Covers: env hints, ~/.zcode/v2/config.json providers, common naming
  // patterns, and the z.ai coding-plan path. All exhausted 2026-08-21.
  const zcodeBase = process.env.ZCODE_BASE_URL ?? 'https://zcode.z.ai';
  const candidates = [
    { label: 'env:ZCODE_BASE_URL /v1', url: `${zcodeBase}/v1/models` },
    { label: 'env:ZCODE_BASE_URL /api/v1', url: `${zcodeBase}/api/v1/models` },
    { label: 'guess:relay.z.ai', url: 'https://relay.z.ai/v1/models' },
    { label: 'guess:api.relay.z.ai', url: 'https://api.relay.z.ai/v1/models' },
    { label: 'zai-paas:api.z.ai', url: 'https://api.z.ai/api/paas/v4/models' },
    { label: 'zai-paas:open.bigmodel.cn', url: 'https://open.bigmodel.cn/api/paas/v4/models' },
    { label: 'zai-coding:api.z.ai', url: 'https://api.z.ai/api/coding/paas/v4/models' },
    { label: 'campus-relay:token.nuaa.edu.cn', url: 'https://token.nuaa.edu.cn/v1/models' },
  ];

  let activeBase = null;
  for (const c of candidates) {
    const rec = await listModels({ label: c.label, url: c.url, apiKey });
    out.modelListAttempts.push(rec);
    log('relay list', c.label, '->', rec.outcome ?? rec.error, rec.httpStatus ?? '');
    if (rec.outcome === 'OK') {
      activeBase = c.url.replace(/\/models$/, '');
      out.baseDiscovery.push({ chosen: activeBase, via: c.label });
      break;
    }
  }

  if (!activeBase) {
    out.conclusion =
      'BLOCKED: no reachable OpenAI-compatible base for RELAY_API_KEY ' +
      `(tried: ${candidates.map((c) => c.url).join(', ')})`;
    return out;
  }

  const ids = out.modelListAttempts.find((m) => m.outcome === 'OK').ids;
  const qwenIds = ids.filter((m) => /qwen/i.test(m));
  out.qwenAvailability = {
    qwenModelCount: qwenIds.length,
    qwenModels: qwenIds,
    qwenLiveVerified: false,
  };

  if (qwenIds.length > 0) {
    const model =
      qwenIds.find((m) => /qwen3/i.test(m) && !/vl|embed|omni|audio|coder/i.test(m)) ??
      qwenIds.find((m) => /qwen-max/i.test(m)) ??
      qwenIds.find((m) => /qwen-plus/i.test(m)) ??
      qwenIds.find((m) => !/vl|embed|omni|audio|coder/i.test(m));
    out.chatModel = model;
    const chatUrl = `${activeBase}/chat/completions`;
    out.structuredAttempts.push(
      await structuredChat({ label: 'T1-prompt-only-qwen', url: chatUrl, apiKey, model, useResponseFormat: false })
    );
    log('relay T1(qwen) ->', out.structuredAttempts.at(-1).outcome);
    out.structuredAttempts.push(
      await structuredChat({ label: 'T2-json-object-qwen', url: chatUrl, apiKey, model, useResponseFormat: true })
    );
    log('relay T2(qwen) ->', out.structuredAttempts.at(-1).outcome);
    const t1 = out.structuredAttempts[0];
    if (t1?.outcome === 'SCHEMA_VALID') {
      out.qwenAvailability.qwenLiveVerified = true;
      out.qwenAvailability.liveModel = t1.respondedModel ?? model;
      out.qwenAvailability.liveUsage = t1.usage;
      out.qwenAvailability.liveLatencyMs = t1.latencyMs;
    }
  }

  const anyValid = out.structuredAttempts.some((a) => a.outcome === 'SCHEMA_VALID');
  out.conclusion = anyValid
    ? `REACHABLE: base ${activeBase}; structured JSON validated`
    : `REACHABLE-LIST-ONLY: base ${activeBase} lists models but no schema-valid chat call (see attempts)`;
  return out;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const argProvider = (() => {
  const i = process.argv.indexOf('--provider');
  const v = i >= 0 ? process.argv[i + 1] : 'all';
  return (v ?? 'all').toLowerCase();
})();
const VALID = ['all', 'zai', 'deepseek', 'relay'];
if (!VALID.includes(argProvider)) {
  console.error(`unknown --provider "${argProvider}" (expected ${VALID.join('|')})`);
  process.exit(1);
}

const probes = { zai: probeZai, deepseek: probeDeepseek, relay: probeRelay };
const selected = argProvider === 'all' ? ['zai', 'deepseek', 'relay'] : [argProvider];

const results = {};
for (const name of selected) {
  log(`--- probing ${name} ---`);
  results[name] = await probes[name]();
}

const run = {
  spike: 'model-spike',
  timestampUtc: new Date().toISOString(),
  node: process.version,
  provider: argProvider,
  results,
};

mkdirSync(RUNS_DIR, { recursive: true });
const runFile = join(RUNS_DIR, `${run.timestampUtc.replace(/[:.]/g, '-')}-${argProvider}.json`);
writeFileSync(runFile, JSON.stringify(run, null, 2));

console.log(JSON.stringify(run, null, 2));
log('evidence file:', runFile);

const chatOk = Object.values(results).some(
  (r) => Array.isArray(r.structuredAttempts) &&
        r.structuredAttempts.some((a) => a.outcome === 'SCHEMA_VALID')
);
process.exit(chatOk ? 0 : 2);
