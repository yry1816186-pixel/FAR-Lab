/**
 * Anthropic-protocol GLM provider for eval scripts (Wave-9 unlock path).
 *
 * The user's funded route is Zhipu bigmodel.cn via its ANTHROPIC-COMPATIBLE endpoint
 * (https://open.bigmodel.cn/api/anthropic/v1/messages, model glm-5.3) — NOT the
 * OpenAI-protocol api.z.ai endpoint (which returns 1113 no-resource-pack for this
 * account). DeepSeek is banned in this project (user directive 2026-08-22).
 *
 * Structured output: the Anthropic Messages protocol here has no response_format /
 * json_schema enforcement, so this adapter uses prompt-embedded schema instruction +
 * tolerant JSON extraction (brace-slice, one trailing-comma repair) + a single
 * corrective re-ask on validation failure — mirroring the pipeline's tolerance
 * philosophy. Fail-visible: transport/parse/validation failures return
 * { ok: false, error }, never fabricated data.
 */
const BASE = 'https://open.bigmodel.cn/api/anthropic/v1/messages';
const MODEL_DEFAULT = 'glm-5.3';

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const extractJson = (text) => {
  const direct = JSON.parse(text);
  return direct;
};

export const tolerantParse = (text) => {
  const t = String(text ?? '').trim();
  try { return { ok: true, value: extractJson(t) }; } catch { /* fall through */ }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = t.slice(start, end + 1);
    try { return { ok: true, value: extractJson(slice) }; } catch { /* try comma repair */ }
    const repaired = slice.replace(/,\s*([}\]])/g, '$1');
    try { return { ok: true, value: extractJson(repaired) }; } catch { /* fall through */ }
  }
  return { ok: false, error: 'no JSON object found in response' };
};

export const createGlmAnthropicProvider = (opts = {}) => {
  const apiKey = opts.apiKey ?? process.env.ZHIPU_API_KEY ?? process.env.ZAI_API_KEY ?? '';
  const model = opts.model ?? process.env.FARLAB_ZAI_MODEL ?? MODEL_DEFAULT;
  const totalTimeoutMs = opts.totalTimeoutMs ?? 300_000;
  const fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  const maxTransportRetries = 2;
  return {
    liveReady: apiKey !== '',
    modelId: model,
    baseUrl: BASE,
    async structuredCall(req, validate) {
      if (!apiKey) return { ok: false, error: { kind: 'auth', message: 'no API key (ZHIPU_API_KEY/ZAI_API_KEY)' } };
      const schemaHint = req.jsonSchema
        ? `\nReturn ONLY a JSON object exactly matching this schema (no prose, no markdown fence):\n${JSON.stringify(req.jsonSchema)}`
        : '\nReturn ONLY a JSON object (no prose, no markdown fence).';
      const body = {
        model,
        max_tokens: req.maxTokens ?? 4000,
        temperature: req.temperature ?? 0,
        system: req.systemPrompt ?? undefined,
        messages: [
          {
            role: 'user',
            content: `${req.task ? req.task + '\n\n' : ''}${JSON.stringify(req.userPayload ?? {}, null, 1)}${schemaHint}`,
          },
        ],
      };
      const started = Date.now();
      for (let attempt = 0; attempt <= maxTransportRetries; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), totalTimeoutMs);
        let res;
        try {
          res = await fetchImpl(BASE, {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
        } catch (e) {
          clearTimeout(timer);
          if (attempt < maxTransportRetries) { await sleep(1000 * 2 ** attempt); continue; }
          return { ok: false, error: { kind: 'network', message: String(e).slice(0, 200) } };
        }
        clearTimeout(timer);
        const raw = await res.text().catch(() => '');
        if (res.status === 429 || res.status >= 500) {
          if (attempt < maxTransportRetries) { await sleep(1000 * 2 ** attempt); continue; }
          return { ok: false, error: { kind: 'rate_limit', message: `HTTP ${res.status}: ${raw.slice(0, 160)}` } };
        }
        if (res.status !== 200) {
          return { ok: false, error: { kind: 'http_' + res.status, message: raw.slice(0, 200) } };
        }
        let parsedEnvelope;
        try { parsedEnvelope = JSON.parse(raw); } catch { return { ok: false, error: { kind: 'parse', message: 'non-JSON envelope' } }; }
        const text = (parsedEnvelope.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
        const parsed = tolerantParse(text);
        if (!parsed.ok) return { ok: false, error: { kind: 'parse', message: parsed.error + ' | head: ' + text.slice(0, 120) } };
        const v = validate ? validate(parsed.value) : parsed.value;
        if (v instanceof Error) {
          // one corrective re-ask with the validation error appended (tolerance chain, bounded)
          if (attempt === 0) {
            body.messages.push({ role: 'assistant', content: text });
            body.messages.push({ role: 'user', content: `Your previous JSON was invalid: ${v.message}. Return a corrected JSON object only.` });
            continue;
          }
          return { ok: false, error: { kind: 'invalid_output', message: v.message } };
        }
        const u = parsedEnvelope.usage ?? {};
        return {
          ok: true,
          data: v,
          receipt: {
            modelId: model,
            modelVersion: parsedEnvelope.model ?? model,
            latencyMs: Date.now() - started,
            usage: { promptTokens: u.input_tokens ?? 0, completionTokens: u.output_tokens ?? 0 },
            transportRetries: attempt,
          },
        };
      }
      return { ok: false, error: { kind: 'exhausted', message: 'transport retries exhausted' } };
    },
  };
};
