// Multi-quote-pair variant: 2-4 unescaped inner quote pairs inside one prose value
// (the live strict-fc-corrupted-args shape). Engine vs legacy, exact-intent ground truth.
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { jsonrepair } = require_('../.cache/repos/jsonrepair/lib/cjs/index.js');

const legacy = (raw) => {
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
    out += ch;
  }
  return out;
};

let seed = 7;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const words = ['tumor', 'EGFR', 'clonal', 'axis', 'PFS', 'cohort'];
const stats = { engine: { equal: 0, distorted: 0, threw: 0 }, legacy: { equal: 0, distorted: 0, threw: 0 } };
let total = 0;
const samples = { engineDistort: [], legacyDistort: [], engineThrew: [], legacyThrew: [] };
for (let iter = 0; iter < 400; iter += 1) {
  const prose = Array.from({ length: 20 + Math.floor(rand() * 20) }, () => words[Math.floor(rand() * words.length)]).join(' ');
  const nIns = 2 + Math.floor(rand() * 3);
  let intended = prose;
  let corrupted = prose;
  for (let k = 0; k < nIns; k += 1) {
    const p = 1 + Math.floor(rand() * (corrupted.length - 2));
    if (corrupted.charAt(p) === ' ' || corrupted.charAt(p) === '"') continue;
    intended = intended.slice(0, p) + '"' + intended.slice(p);
    corrupted = corrupted.slice(0, p) + '"' + corrupted.slice(p);
  }
  const doc = '{"a":"' + corrupted + '"}';
  let ok = true;
  try { JSON.parse(doc); } catch { ok = false; }
  if (ok) continue;
  total += 1;
  for (const [name, repair] of [['engine', jsonrepair], ['legacy', legacy]]) {
    try {
      const v = JSON.parse(repair(doc));
      const verdict = v.a === intended ? 'equal' : 'distorted';
      stats[name][verdict] += 1;
      if (verdict === 'distorted' && samples[name + 'Distort'].length < 2) samples[name + 'Distort'].push(doc.slice(0, 160));
    } catch {
      stats[name].threw += 1;
      if (samples[name + 'Threw'].length < 2) samples[name + 'Threw'].push(doc.slice(0, 160));
    }
  }
}
console.log(JSON.stringify({ total, stats }, null, 1));
for (const k of Object.keys(samples)) if (samples[k][0]) console.log(k + ':', samples[k][0]);
