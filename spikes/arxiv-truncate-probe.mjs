/**
 * W6 spike: replay historical arXiv zero-result queries against the live keyless
 * arXiv Atom API with deterministic term-truncation variants. Measures whether a
 * shortened AND-query eliminates the 82.3% zero-result failure class (evidence for
 * the ODR-style deterministic query-mutation retry).
 * Politeness: >=3.1s between requests (arXiv asks >=3s).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const queries = JSON.parse(readFileSync(resolve(process.cwd(), '.cache/repos/arxiv-zero-queries.json'), 'utf8'));
const SAMPLE = 30; // keep wall-clock bounded: 30 queries x 4 variants x ~3.1s ≈ 6.5min
const sample = queries.slice(0, SAMPLE);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const buildUrl = (terms) => {
  const q = terms.map((t) => `all:${t}`).join(' AND ');
  return `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(q)}&start=0&max_results=6&sortBy=relevance&sortOrder=descending`;
};

const fetchCount = async (terms) => {
  const url = buildUrl(terms);
  const res = await fetch(url, { headers: { 'User-Agent': 'FAR-Lab/0.1 spike (mailto:far-lab@example.com)' } });
  const text = await res.text();
  const total = Number(text.match(/<opensearch:totalResults[^>]*>(\d+)</)?.[1] ?? 0);
  const entries = (text.match(/<entry>/g) ?? []).length;
  return { status: res.status, total, entries };
};

const variants = {
  full: (q) => q.split(/\s+/),
  k6: (q) => q.split(/\s+/).slice(0, 6),
  k4: (q) => q.split(/\s+/).slice(0, 4),
  k2: (q) => q.split(/\s+/).slice(0, 2),
};

const out = [];
let n = 0;
for (const q of sample) {
  n += 1;
  const row = { query: q };
  for (const [name, fn] of Object.entries(variants)) {
    await sleep(3_100);
    try {
      const { status, total, entries } = await fetchCount(fn(q));
      row[name] = { status, total, entries };
    } catch (e) {
      row[name] = { error: String(e.message).slice(0, 80) };
    }
    process.stdout.write(`[${n}/${sample.length}] ${name}: ${row[name].entries ?? row[name].error}   \r`);
  }
  out.push(row);
}

const summarize = (name) => {
  const vals = out.map((r) => r[name]);
  const zero = vals.filter((v) => v && v.entries === 0).length;
  const err = vals.filter((v) => v && v.error).length;
  const meanEntries = vals.reduce((s, v) => s + (v?.entries ?? 0), 0) / (out.length - err || 1);
  return { variant: name, n: out.length, zero, zeroRate: Number((zero / out.length).toFixed(3)), meanEntries: Number(meanEntries.toFixed(2)), errors: err };
};

const summary = Object.keys(variants).map(summarize);
console.log('\n' + JSON.stringify(summary, null, 1));
writeFileSync(resolve(process.cwd(), 'spikes/output/arxiv-truncate-probe.json'), JSON.stringify({ sampledAt: new Date().toISOString(), sample: out, summary }, null, 1));
console.log('written spikes/output/arxiv-truncate-probe.json');
