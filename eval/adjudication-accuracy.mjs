#!/usr/bin/env node
/**
 * Adjudication-layer accuracy against gold (2026-08-29, adversarial round-2 S-P1-1).
 *
 * The deterministic matcher's extremes are zero-gold-error locked by tests, but the
 * LLM band (0.10 <= sim < 0.40) — where most semantic work happens — was never
 * scored against gold. This harness runs the EXACT production adjudication
 * (same prompt, same schema, same 5-vote majority) over every in-band gold pair
 * and reports accuracy per label. It is a standing instrument: run it whenever
 * the judge stack (model, prompt, votes) changes.
 *
 * Usage: FARLAB_JUDGE_PROVIDER=zai node eval/adjudication-accuracy.mjs
 * Writes eval/results/adjudication-accuracy.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadLocalSecrets } from './load-secrets.mjs';
import { deterministicBandVerdict } from './claim-match.mjs';
loadLocalSecrets();

const GOLD_FILES = ['eval/claim-pair-gold.jsonl', 'eval/claim-pair-gold-v21.jsonl'];
const BATCH = 10;
const VOTES = 5;

const rows = GOLD_FILES.flatMap((f) => readFileSync(resolve(process.cwd(), f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const bandAll = rows.filter((r) => r.bestSim >= 0.10 && r.bestSim < 0.40 && r.claim && r.counterpart);
// Mirrors production's S2 pre-layer exactly: pairs the deterministic rules
// decide never reach the LLM (their verdict is false, source 'det-band').
const detDecided = bandAll.filter((r) => deterministicBandVerdict(r.claim, r.counterpart) === false);
const band = bandAll.filter((r) => deterministicBandVerdict(r.claim, r.counterpart) !== false);

const PROVIDER = process.env.FARLAB_JUDGE_PROVIDER ?? 'zai';
/** Judge route: zai (glm, declared default) or dashscope (2026-09-05: the only
 *  billable route while the account's qwen tiers are in arrears — model via
 *  FARLAB_DASHSCOPE_MODEL, e.g. tongyi-xiaomi-analysis-pro). Same structured-call
 *  surface; the family is recorded in the artifact either way. */
let provider;
if (PROVIDER === 'dashscope') {
  const { createDashScopeProvider } = await import('../dist/providers/dashscope.js');
  provider = createDashScopeProvider({
    totalTimeoutMs: 300_000,
    model: process.env.FARLAB_DASHSCOPE_MODEL ?? 'qwen3.7-plus',
  });
} else {
  process.env.ZAI_API_KEY ??= process.env.ZHIPU_API_KEY;
  const { createZaiProvider } = await import('../dist/providers/zai.js');
  provider = createZaiProvider({ totalTimeoutMs: 300_000, model: process.env.FARLAB_ZAI_MODEL ?? 'glm-5.3' });
}
if (!provider.liveReady) { console.error('FATAL: judge route not live-ready'); process.exit(1); }

// Mirrors rediscovery-judge.mjs's adjudication task VERBATIM (including the
// boolean-shape instruction) so the measurement is of production behavior.
const adjudicate = async (items) => {
  const votes = [];
  for (let v = 0; v < VOTES; v += 1) {
    const r = await provider.structuredCall({
      task: 'rediscovery:adjudicate',
      systemPrompt: 'You are a precise scientific evaluation engine. Follow the requested JSON shape exactly.',
      userPayload: {
        pairs: items.map((x, k) => ({ k, claim: x.claim, candidate: x.counterpart })),
        instruction:
          'For each pair decide: does the CLAIM assert substantially the same scientific finding (same entity/mechanism/DIRECTION) as the CANDIDATE? Synonyms count. Direction discipline: opposite direction (promotes vs inhibits) => false; one side negates what the other asserts ("does not inhibit" vs "inhibits") => false; merely covering the candidate\'s topic without asserting its direction => false; complementary phrasings of ONE fact ("low X" alongside "high Y" where X inhibits Y) => true. Unrelated or fabricated => false. Return verdicts array aligned with k order, each element a bare JSON boolean (true/false) — NOT an object or string.',
      },
      outputKind: 'json', temperature: 0, maxTokens: 2000, purpose: 'rediscovery:adjudicate',
      jsonSchema: { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'boolean' } } }, required: ['verdicts'], additionalProperties: false },
    }, (raw) => {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return new Error('not an object');
      if (!Array.isArray(raw.verdicts) || raw.verdicts.length !== items.length) return new Error('verdicts misaligned');
      if (!raw.verdicts.every((x) => typeof x === 'boolean')) return new Error('verdicts not booleans');
      return raw;
    });
    if (!r.ok) { votes.push(null); continue; }
    votes.push(r.data.verdicts.map((x) => x === true));
  }
  const valid = votes.filter((v) => v !== null);
  if (valid.length === 0) throw new Error('all votes failed for a batch');
  const majority = Math.floor(valid.length / 2) + 1;
  return items.map((_, k) => valid.filter((v) => v[k] === true).length >= majority);
};

const out = detDecided.map((p) => ({ label: p.label, verdict: false, det: true, sim: p.bestSim, claim: p.claim.slice(0, 90), counterpart: p.counterpart.slice(0, 90) }));
for (let i = 0; i < band.length; i += BATCH) {
  const batch = band.slice(i, i + BATCH);
  const verdicts = await adjudicate(batch);
  batch.forEach((p, k) => out.push({ label: p.label, verdict: verdicts[k], sim: p.bestSim, claim: p.claim.slice(0, 90), counterpart: p.counterpart.slice(0, 90) }));
  process.stderr.write(`[adj-acc] ${Math.min(i + BATCH, band.length)}/${band.length}\n`);
}

const tp = out.filter((r) => r.label && r.verdict).length;
const fn = out.filter((r) => r.label && !r.verdict).length;
const tn = out.filter((r) => !r.label && !r.verdict).length;
const fp = out.filter((r) => !r.label && r.verdict).length;
const acc = (tp + tn) / out.length;
const summary = {
  generatedAt: new Date().toISOString(), judge: provider.modelId, judgeRoute: PROVIDER,
  votes: VOTES, n: out.length, goldTrue: tp + fn, goldFalse: tn + fp,
  detBandDecided: detDecided.length, llmBand: band.length,
  accuracy: Math.round(acc * 1000) / 1000,
  truePositiveRate: Math.round((tp / (tp + fn)) * 1000) / 1000,
  falsePositiveRate: Math.round((fp / (fp + tn)) * 1000) / 1000,
  tp, fn, tn, fp,
};
writeFileSync(resolve(process.cwd(), 'eval/results/adjudication-accuracy.json'), JSON.stringify({ summary, pairs: out }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
console.log('\nfalse negatives (gold TRUE, judged no) — the strictness residue:');
for (const r of out.filter((x) => x.label && !x.verdict)) console.log(`  [${r.sim.toFixed(3)}] ${r.claim} || ${r.counterpart}`);
console.log('\nfalse positives (gold FALSE, judged yes) — the leniency residue:');
for (const r of out.filter((x) => !x.label && x.verdict)) console.log(`  [${r.sim.toFixed(3)}] ${r.claim} || ${r.counterpart}`);
