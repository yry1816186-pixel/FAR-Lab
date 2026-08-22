#!/usr/bin/env node
 
/**
 * FAR-Lab W1 live model smoke check — Model Execution Plane.
 *
 * Runs ONE real structured call through the plane (src/providers -> dist build)
 * against the requested or default live provider, and prints receipt evidence:
 * provider / model / latency / usage / hash prefixes. If the provider is not
 * live-ready, prints the BLOCKED reason instead (never fabricates a live call).
 *
 * Usage:
 *   npm run build                                   # once, before first run
 *   node scripts/live-check-model.mjs               # default provider (FARLAB_MODEL_PROVIDER, else zai; deepseek banned)
 *   node scripts/live-check-model.mjs --provider zai
 *
 * Exit codes: 0 = live structured call verified; 2 = provider BLOCKED or call
 * failed (classified, honest); 1 = setup/usage error (e.g. dist not built).
 *
 * Security: reads provider keys from env inside the plane only; this script
 * never reads, prints or stores key values.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_ENTRY = join(__dirname, '..', 'dist', 'providers', 'index.js');

if (!existsSync(DIST_ENTRY)) {
  console.error('setup error: dist/providers/index.js not found — run `npm run build` first (tsc emit), then retry.');
  process.exit(1); // before any import/socket — a hard exit is safe here
}

const { getProvider, defaultLiveProvider, listProviders } = await import(pathToFileURL(DIST_ENTRY).href);

// ---------------------------------------------------------------------------
// one structured task + strict validator (same 4-field schema as the W0 spike)
// ---------------------------------------------------------------------------

const STRUCTURED_TASK = {
  task: 'Generate exactly one falsifiable scientific hypothesis about why retrieval-augmented generation reduces LLM hallucination.',
  systemPrompt: 'You are a research assistant. Be concrete and scientific.',
  userPayload: {
    schema: {
      hypothesis: 'non-empty string',
      confidence: 'number in [0,1]',
      supporting_evidence: 'array of exactly 2 non-empty strings',
      falsification_test: 'non-empty string, one concrete experiment',
    },
  },
  outputKind: 'json',
  temperature: 0.2,
  maxTokens: 800,
  purpose: 'live-smoke-w1',
};

const validateHypothesis = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return new Error('output must be a JSON object');
  }
  const r = raw;
  const errors = [];
  if (typeof r.hypothesis !== 'string' || r.hypothesis.length === 0) errors.push('"hypothesis" must be a non-empty string');
  if (typeof r.confidence !== 'number' || !Number.isFinite(r.confidence) || r.confidence < 0 || r.confidence > 1) {
    errors.push('"confidence" must be a finite number in [0,1]');
  }
  if (!Array.isArray(r.supporting_evidence) || r.supporting_evidence.length !== 2 ||
      !r.supporting_evidence.every((x) => typeof x === 'string' && x.length > 0)) {
    errors.push('"supporting_evidence" must be an array of exactly 2 non-empty strings');
  }
  if (typeof r.falsification_test !== 'string' || r.falsification_test.length === 0) {
    errors.push('"falsification_test" must be a non-empty string');
  }
  const extra = Object.keys(r).filter((k) => !(k in STRUCTURED_TASK.userPayload.schema));
  if (extra.length > 0) errors.push(`unexpected extra fields: ${extra.join(', ')}`);
  return errors.length > 0 ? new Error(errors.join('; ')) : r;
};

// ---------------------------------------------------------------------------
// main (function-wrapped so failure paths RETURN instead of falling through)
// ---------------------------------------------------------------------------

const main = async () => {
  const args = process.argv.slice(2);
  const providerArgIdx = args.indexOf('--provider');
  const providerArg = providerArgIdx >= 0 ? args[providerArgIdx + 1] : undefined;

  let provider;
  if (providerArg !== undefined) {
    provider = getProvider(providerArg);
    if (!provider) {
      console.error(`usage error: unknown provider "${providerArg}" (available: ${listProviders().map((p) => p.name).join(', ')})`);
      process.exit(1); // before any socket — hard exit is safe
    }
  } else {
    try {
      provider = defaultLiveProvider();
    } catch (err) {
      console.error(`BLOCKED: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 2;
      return;
    }
  }

  const info = listProviders().find((p) => p.name === provider.name);
  console.log('[live-check] Model Execution Plane providers:');
  for (const p of listProviders()) {
    console.log(
      `  - ${p.name.padEnd(10)} kind=${p.kind.padEnd(4)} liveReady=${String(p.liveReady).padEnd(5)} model=${p.modelId} key=${p.apiKeyEnvVar}`,
    );
  }
  console.log(`[live-check] selected provider: ${provider.name} (model=${info?.modelId ?? '?'}, base=${info?.baseUrl ?? '?'})`);

  if (!provider.liveReady) {
    console.error(`BLOCKED: provider "${provider.name}" is not live-ready (${info?.apiKeyEnvVar ?? 'credentials'} missing/empty) — no call made, nothing fabricated.`);
    process.exit(2); // before any socket — hard exit is safe
  }

  const result = await provider.structuredCall(STRUCTURED_TASK, validateHypothesis);

  if (!result.ok || result.error) {
    const e = result.error;
    console.error(`FAILED: kind=${e?.kind} retryable=${e?.retryable} httpStatus=${e?.httpStatus ?? '-'} :: ${e?.message}`);
    console.error(`  receipt: provider=${result.receipt.provider} model=${result.receipt.modelId} latencyMs=${result.receipt.latencyMs} requestHash=${result.receipt.requestHash.slice(0, 12)}… executionMode=${result.receipt.executionMode}`);
    process.exitCode = 2;
    return;
  }

  const { receipt, data } = result;
  console.log('LIVE_OK: structured call verified end-to-end');
  console.log(`  provider=${receipt.provider} model=${receipt.modelId} (served: ${receipt.modelVersion ?? 'n/a'})`);
  console.log(`  latencyMs=${receipt.latencyMs} finishReason=${receipt.finishReason ?? 'n/a'} executionMode=${receipt.executionMode}`);
  console.log(
    `  usage: prompt=${receipt.usage.promptTokens ?? '?'} completion=${receipt.usage.completionTokens ?? '?'} total=${receipt.usage.totalTokens ?? '?'}`,
  );
  console.log(`  requestHash=${receipt.requestHash.slice(0, 12)}… outputHash=${receipt.outputHash.slice(0, 12)}…`);
  const hypothesis = typeof data?.hypothesis === 'string' ? data.hypothesis : JSON.stringify(data)?.slice(0, 100);
  console.log(`  data.hypothesis="${String(hypothesis).slice(0, 100)}${String(hypothesis).length > 100 ? '…' : ''}"`);
  // exitCode (not process.exit): a hard exit races undici keep-alive sockets on
  // Windows and can crash libuv; letting the loop drain exits cleanly with the code.
  process.exitCode = 0;
};

await main();
