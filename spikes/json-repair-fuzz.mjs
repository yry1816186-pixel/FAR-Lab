// Property comparison v2: engine (upstream jsonrepair 3.15.0) vs legacy blind scan on
// the LIVE corruption class — an unescaped inner quote inserted inside a prose string
// value. Ground truth = the original prose WITH the quote inserted (the corrupted
// document's evident intent: the quote is content). Single-field shape makes the
// expectation exactly constructible.
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { jsonrepair } = require_('../.cache/repos/jsonrepair/lib/cjs/index.js');

const repairUnescapedQuotes = (raw) => {
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

let seed = 20260822;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const words = ['tumor', 'resistance', 'EGFR', 'clonal', 'expansion', 'methylation', 'axis', 'PFS', 'cohort', 'subset', 'progression', 'biopsy'];

const stats = { engine: { equal: 0, distorted: 0, threw: 0 }, legacy: { equal: 0, distorted: 0, threw: 0 } };
let total = 0;
const samples = { engineDistort: [], legacyDistort: [] };
for (let iter = 0; iter < 400; iter += 1) {
  const prose = Array.from({ length: 10 + Math.floor(rand() * 25) }, () => words[Math.floor(rand() * words.length)]).join(' ');
  // insert the inner quote strictly INSIDE the prose (not at the very first/last char,
  // and require the char after the insertion to be a non-delimiter, like the live class)
  let at = -1;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const p = 1 + Math.floor(rand() * (prose.length - 1));
    if (prose[p] === ' ') continue;
    at = p;
    break;
  }
  if (at < 0) continue;
  const intended = prose.slice(0, at) + '"' + prose.slice(at); // ground-truth content
  const doc = '{"a":"' + prose.replace(/"/g, '') + '"}'; // original prose has no quotes
  const corrupted = '{"a":"' + prose.slice(0, at) + '"' + prose.slice(at) + '"}';
  let directOk = true;
  try { JSON.parse(corrupted); } catch { directOk = false; }
  if (directOk) continue; // insertion happened to be a legal close — not a corruption
  total += 1;
  const verdict = (repair) => {
    try {
      const v = JSON.parse(repair(corrupted));
      return typeof v.a === 'string' && v.a === intended ? 'equal' : 'distorted';
    } catch { return 'threw'; }
  };
  const ev = verdict(jsonrepair);
  const lv = verdict(repairUnescapedQuotes);
  stats.engine[ev] += 1;
  stats.legacy[lv] += 1;
  if (ev === 'distorted' && samples.engineDistort.length < 2) samples.engineDistort.push(corrupted);
  if (lv === 'distorted' && samples.legacyDistort.length < 2) samples.legacyDistort.push(corrupted);
}
console.log(JSON.stringify({ total, stats }, null, 1));
if (samples.engineDistort[0]) console.log('engine-distort:', samples.engineDistort[0].slice(0, 150));
if (samples.legacyDistort[0]) console.log('legacy-distort:', samples.legacyDistort[0].slice(0, 150));
