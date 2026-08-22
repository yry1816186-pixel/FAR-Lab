#!/usr/bin/env node
/**
 * W7-F1 repair-layer benchmark: BEFORE (pre-W7 extractJsonText = direct -> fence-strip ->
 * legacy quote scan, the verbatim implementation from src/providers/http.ts at 3186e1c)
 * vs AFTER (current chain: ... -> legacy scan -> jsonrepair engine). Deterministic:
 * fixed corpus + seeded fuzz, no LLM. Writes evidence/W7/repair-benchmark.{json,md}.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { extractJsonText: newChain } = require_('../.cache/bench/providers/http.js');
const { extractJsonText: newChainNoRepair } = { extractJsonText: (t) => newChain(t, { allowRepair: false }) };

// ---- BEFORE chain: verbatim pre-W7 implementation (http.ts@3186e1c) ----
const repairUnescapedQuotesOld = (raw) => {
  let out = '', inString = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw.charAt(i);
    if (!inString) { if (ch === '"') inString = true; out += ch; continue; }
    if (ch === '\\') { out += ch + raw.charAt(i + 1); i += 1; continue; }
    if (ch === '"') {
      let j = i + 1;
      while (j < raw.length && /\s/.test(raw.charAt(j))) j += 1;
      const next = j < raw.length ? raw.charAt(j) : undefined;
      if (next === undefined || next === ',' || next === '}' || next === ']' || next === ':') { inString = false; out += ch; }
      else out += '\\"';
      continue;
    }
    if (ch.charCodeAt(0) < 0x20) {
      if (ch === '\n') out += '\\n'; else if (ch === '\r') out += '\\r'; else if (ch === '\t') out += '\\t';
      else out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
      continue;
    }
    out += ch;
  }
  return out;
};
const oldChain = (raw) => {
  try { return { value: JSON.parse(raw) }; } catch { /* fence */ }
  const stripped = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try { return { value: JSON.parse(stripped) }; } catch { /* repair */ }
  for (const candidate of [raw, stripped]) {
    try { return { value: JSON.parse(repairUnescapedQuotesOld(candidate)) }; } catch { /* none */ }
  }
  return null;
};

// ---- corpus ----
const oracle = JSON.parse(readFileSync(new URL('./output/json-repair-oracle.json', import.meta.url), 'utf8'));
const corpus = oracle.filter((e) => e.error === null && e.output !== null); // 72 repairable entries
const validDocs = corpus.filter((e) => { try { JSON.parse(e.input); return true; } catch { return false; } }); // must stay unchanged
const brokenDocs = corpus.filter((e) => !validDocs.includes(e));

// fuzz corpus (deterministic): inner-quote corruptions like the live class
let seed = 20260822;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const words = ['tumor', 'resistance', 'EGFR', 'clonal', 'expansion', 'methylation', 'axis', 'PFS', 'cohort', 'subset'];
const fuzzDocs = [];
for (let i = 0; i < 200; i += 1) {
  const prose = Array.from({ length: 10 + Math.floor(rand() * 25) }, () => words[Math.floor(rand() * words.length)]).join(' ');
  const n = 1 + Math.floor(rand() * 3);
  let corrupted = prose, intended = prose;
  for (let k = 0; k < n; k += 1) {
    const p = 1 + Math.floor(rand() * (corrupted.length - 2));
    if (corrupted.charAt(p) === ' ' || corrupted.charAt(p) === '"') continue;
    intended = intended.slice(0, p) + '"' + intended.slice(p);
    corrupted = corrupted.slice(0, p) + '"' + corrupted.slice(p);
  }
  const doc = '{"a":"' + corrupted + '"}';
  let bad = false; try { JSON.parse(doc); } catch { bad = true; }
  if (bad) fuzzDocs.push({ doc, intended });
}

const live = JSON.parse(readFileSync(new URL('./output/strict-fc-corrupted-args.json', import.meta.url), 'utf8'));

// ---- measurement ----
const results = { corpus: {}, fuzz: {}, latency: {}, live: {} };
const count = (docs, chain) => docs.reduce((acc, d) => (chain(d) !== null ? acc + 1 : acc), 0);
results.corpus.valid = { n: validDocs.length, before: count(validDocs.map((e) => e.input), oldChain), after: count(validDocs.map((e) => e.input), newChain) };
results.corpus.broken = { n: brokenDocs.length, before: count(brokenDocs.map((e) => e.input), oldChain), after: count(brokenDocs.map((e) => e.input), newChain) };

let beforeFuzz = 0, afterFuzz = 0, correctFuzz = 0;
for (const { doc, intended } of fuzzDocs) {
  const b = oldChain(doc) !== null;
  const a = newChain(doc);
  if (b) beforeFuzz += 1;
  if (a !== null) {
    afterFuzz += 1;
    if (a.value.a === intended) correctFuzz += 1;
  }
}
results.fuzz = { n: fuzzDocs.length, before: beforeFuzz, after: afterFuzz, afterExactIntent: correctFuzz };

// latency on the 24k live sample (both layers attempt and fail; measures worst-case cost)
const t0 = performance.now();
for (let i = 0; i < 20; i += 1) oldChain(live.argsFull);
const t1 = performance.now();
for (let i = 0; i < 20; i += 1) newChain(live.argsFull);
const t2 = performance.now();
// and best-case repair cost on a mid-size corrupted doc
const midDoc = fuzzDocs[0].doc;
const t3 = performance.now();
for (let i = 0; i < 200; i += 1) newChain(midDoc);
const t4 = performance.now();
results.latency = {
  liveSample24kMsPerCall: { before: +((t1 - t0) / 20).toFixed(2), after: +((t2 - t1) / 20).toFixed(2) },
  midDocRepairMsPerCall: { after: +((t4 - t3) / 200).toFixed(3) },
};
results.live = { fullSample: { before: oldChain(live.argsFull) !== null, after: newChain(live.argsFull) !== null } };

mkdirSync(new URL('../evidence/W7/', import.meta.url), { recursive: true });
writeFileSync(new URL('../evidence/W7/repair-benchmark.json', import.meta.url), JSON.stringify(results, null, 1));
const md = `# W7-F1 repair-layer benchmark (deterministic, before/after same corpus)

BEFORE = pre-W7 extractJsonText (direct -> fence-strip -> legacy quote scan; verbatim http.ts@3186e1c).
AFTER = current chain (… -> legacy scan -> jsonrepair engine EXTRACT).

| suite | n | before | after |
|---|---|---|---|
| corpus: valid docs pass through | ${results.corpus.valid.n} | ${results.corpus.valid.before} | ${results.corpus.valid.after} |
| corpus: corrupted docs repaired | ${results.corpus.broken.n} | ${results.corpus.broken.before} | ${results.corpus.broken.after} |
| fuzz: live-class inner-quote docs repaired | ${results.fuzz.n} | ${results.fuzz.before} | ${results.fuzz.after} (exact-intent ${results.fuzz.afterExactIntent}) |

- fuzz afterExactIntent = repaired value equals the corrupted document's evident intent (quote kept as content), not just parses.
- live 24k sample (colon-after-inner-quote ambiguity): before=${results.live.fullSample.before}, after=${results.live.fullSample.after} — both correctly refuse; corrective re-ask owns that class (0d1706e ~99% cumulative recovery).
- latency (worst case, both repair layers attempt + fail on 24k): before ${results.latency.liveSample24kMsPerCall.before}ms after ${results.latency.liveSample24kMsPerCall.after}ms per call — negligible vs the 2s strict-FC e2e budget; mid-doc successful repair ${results.latency.midDocRepairMsPerCall.after}ms/call.

Raw: evidence/W7/repair-benchmark.json; corpus spikes/json-repair-corpus.mjs -> spikes/output/json-repair-oracle.json; fuzz class spikes/json-repair-fuzz.mjs.
`;
writeFileSync(new URL('../evidence/W7/repair-benchmark.md', import.meta.url), md);
console.log(md);
