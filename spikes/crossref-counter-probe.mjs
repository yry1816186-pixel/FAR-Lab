/**
 * W6 spike: replay historical counter-evidence queries against the live keyless
 * Crossref API. Evidence for rerouting counter[1] from arXiv (82% zero) to crossref.
 * ~40 unique queries, 0.6s spacing ≈ 30s.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(resolve(process.cwd(), '.far-run/far.db'), { readOnly: true });
const snaps = db.prepare("SELECT json FROM objects WHERE kind='corpus_snapshot'").all().map((r) => JSON.parse(r.json));
const counters = new Map();
for (const s of snaps) {
  for (const q of s.queries.filter((x) => x.purpose === 'counter_evidence')) counters.set(q.text, q);
}
const uniq = [...counters.keys()];
console.log('unique counter queries:', uniq.length);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
for (const q of uniq) {
  await sleep(600);
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=6&mailto=far-lab@example.com`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'FAR-Lab/0.1 spike (mailto:far-lab@example.com)' } });
    const j = await res.json();
    const items = j?.message?.items ?? [];
    const titles = items.map((i) => Array.isArray(i.title) ? i.title[0] : '').filter(Boolean);
    out.push({ query: q, status: res.status, count: items.length, firstTitle: titles[0]?.slice(0, 90) ?? null });
  } catch (e) {
    out.push({ query: q, error: String(e.message).slice(0, 80) });
  }
  process.stdout.write(`[${out.length}/${uniq.length}] ${out[out.length - 1].count ?? 'ERR'}   \r`);
}
const ok = out.filter((r) => r.status === 200);
const zero = ok.filter((r) => r.count === 0);
const summary = {
  sampledAt: new Date().toISOString(),
  unique: uniq.length,
  ok: ok.length,
  errors: out.length - ok.length,
  zero: zero.length,
  zeroRate: Number((zero.length / (ok.length || 1)).toFixed(3)),
  meanResults: Number((ok.reduce((s, r) => s + r.count, 0) / (ok.length || 1)).toFixed(2)),
};
console.log('\n' + JSON.stringify(summary, null, 1));
console.log(out.slice(0, 6).map((r) => `${r.count ?? 'ERR'} | ${r.query.slice(0, 60)} | ${(r.firstTitle ?? '').slice(0, 60)}`).join('\n'));
writeFileSync(resolve(process.cwd(), 'spikes/output/crossref-counter-probe.json'), JSON.stringify({ summary, detail: out }, null, 1));
console.log('written spikes/output/crossref-counter-probe.json');
