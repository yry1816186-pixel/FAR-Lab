/**
 * W6 spike: relevance spot-check for arXiv truncation variants (k2/k4) — the
 * truncate-probe recorded counts only; this fetches first-result titles so the
 * fusion decision can eyeball topical alignment. 8 queries x 2 variants.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const probe = JSON.parse(readFileSync(resolve(process.cwd(), 'spikes/output/arxiv-truncate-probe.json'), 'utf8'));
const queries = probe.sample.slice(0, 8).map((r) => r.query);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchTitles = async (terms) => {
  const q = terms.map((t) => `all:${t}`).join(' AND ');
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(q)}&start=0&max_results=3&sortBy=relevance&sortOrder=descending`;
  const res = await fetch(url, { headers: { 'User-Agent': 'FAR-Lab/0.1 spike (mailto:far-lab@example.com)' } });
  const text = await res.text();
  const entries = [...text.matchAll(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim(),
  );
  return entries;
};

const out = [];
for (const q of queries) {
  const row = { query: q };
  for (const [name, k] of [['k4', 4], ['k2', 2]]) {
    await sleep(3_100);
    try { row[name] = await fetchTitles(q.split(/\s+/).slice(0, k)); } catch (e) { row[name] = [`ERR ${String(e.message).slice(0, 60)}`]; }
  }
  out.push(row);
  console.log(`Q: ${q.slice(0, 70)}`);
  console.log(`  k4: ${(row.k4[0] ?? 'none').slice(0, 85)}`);
  console.log(`  k2: ${(row.k2[0] ?? 'none').slice(0, 85)}`);
}
writeFileSync(resolve(process.cwd(), 'spikes/output/arxiv-variant-relevance.json'), JSON.stringify(out, null, 1));
console.log('written spikes/output/arxiv-variant-relevance.json');
