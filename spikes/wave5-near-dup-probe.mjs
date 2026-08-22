/**
 * Wave-5 F1 premise probe: cross-source near-duplicate rate in recorded corpora.
 * Measures whether the same paper enters the corpus multiple times under
 * DIFFERENT identifiers (arXiv id vs OpenAlex id vs crossref DOI) — the failure
 * class OpenScholar's MinHash dedup exists for. Zero API calls; read-only DB.
 *
 * Method (deterministic, dependency-free): 8-word shingles over
 * normalize(title + ' ' + first 400 chars of abstract); pair Jaccard >= 0.8
 * AND different identifier-sets => near-dup pair. Report per-run and pooled.
 */
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.far-run/far.db', { readOnly: true });

const rows = db
  .prepare(
    `SELECT o.run_id as runId, o.id as id, o.json as data
     FROM objects o WHERE o.kind = 'source_document'`,
  )
  .all();

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const shingles = (text) => {
  const w = norm(text).split(' ').filter(Boolean);
  const out = new Set();
  for (let i = 0; i + 8 <= w.length; i += 1) out.add(w.slice(i, i + 8).join(' '));
  return out;
};

const jac = (a, b) => {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter += 1;
  return inter / (a.size + b.size - inter);
};

const docs = [];
for (const r of rows) {
  let d;
  try {
    d = JSON.parse(r.data);
  } catch {
    continue;
  }
  const ids = (d.identifiers ?? []).map((i) => `${i.kind}:${String(i.value).toLowerCase()}`).sort().join('|');
  docs.push({
    runId: r.runId,
    id: d.id,
    title: d.title ?? '',
    abstract: String(d.abstractText ?? '').slice(0, 400),
    ids,
    sh: shingles(`${d.title ?? ''} ${String(d.abstractText ?? '').slice(0, 400)}`),
  });
}
console.log(`source_documents total: ${docs.length} across ${new Set(docs.map((d) => d.runId)).size} runs`);

// exact same-identifier duplicates first (should be none — identifier dedup exists)
const byIds = new Map();
for (const d of docs) {
  if (!d.ids) continue;
  byIds.set(d.ids, (byIds.get(d.ids) ?? 0) + 1);
}
const exactDups = [...byIds.values()].filter((n) => n > 1).length;
console.log(`same-identifier-set duplicate docs: ${exactDups}`);

// cross-doc near-dup pairs (different identifier sets, same run)
let pairs = 0;
const perRun = new Map();
for (let i = 0; i < docs.length; i += 1) {
  for (let j = i + 1; j < docs.length; j += 1) {
    const a = docs[i];
    const b = docs[j];
    if (a.runId !== b.runId || !a.ids || !b.ids || a.ids === b.ids) continue;
    if (Math.abs(a.sh.size - b.sh.size) > Math.max(a.sh.size, b.sh.size) * 0.5) continue; // cheap prefilter
    const s = jac(a.sh, b.sh);
    if (s >= 0.8) {
      pairs += 1;
      perRun.set(a.runId, (perRun.get(a.runId) ?? 0) + 1);
      if (pairs <= 8) {
        console.log(`  NEARDUP run=${a.runId.slice(0, 12)} jac=${s.toFixed(2)} :: "${a.title.slice(0, 60)}" <-> "${b.title.slice(0, 60)}"`);
      }
    }
  }
}
const runCounts = new Map();
for (const d of docs) runCounts.set(d.runId, (runCounts.get(d.runId) ?? 0) + 1);
console.log(`cross-identifier near-dup pairs (jac>=0.8, same run): ${pairs}`);
for (const [run, n] of perRun) {
  console.log(`  run ${run.slice(0, 16)}: ${n} near-dup pair(s) of ${runCounts.get(run)} docs`);
}

// DOI-prefix cross-match: same DOI appearing under different id-sets (definitive same-paper signal)
const byDoi = new Map();
for (const d of docs) {
  const m = /doi:([^|]+)/.exec(d.ids ?? '');
  if (!m) continue;
  const doi = m[1];
  if (!byDoi.has(doi)) byDoi.set(doi, new Set());
  byDoi.get(doi).add(`${d.runId}:${d.ids}`);
}
const doiSplit = [...byDoi.entries()].filter(([, v]) => v.size > 1);
console.log(`DOIs appearing under >1 (run,id-set) combos: ${doiSplit.length}`);
for (const [doi, v] of doiSplit.slice(0, 5)) console.log(`  ${doi} -> ${v.size} combos`);
