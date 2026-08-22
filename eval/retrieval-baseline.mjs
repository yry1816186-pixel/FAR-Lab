/**
 * Wave-6 retrieval-quality baseline harness (D-039 line): DETERMINISTIC, offline,
 * replayable from persisted run artifacts (.far-run/far.db objects) — no LLM, no
 * network. Hard precondition for any Wave-6 main-path retrieval change: every
 * fusion must show before/after on this harness with zero guarded regression.
 *
 * Metric provenance (file:line verified against BEIR beir-cellar/beir):
 *  - hole-style unjudged share: custom_metrics.py:65-93 (Hole@k = share of top-k
 *    outside the annotated corpus; FAR-Lab analogue = corpus docs still
 *    unverified / abstract-less at run end).
 *  - MRR/recall_cap/top_k_accuracy shapes: custom_metrics.py:6-34/37-62/96-126.
 *  - nDCG@k (linear gain, log2 discount) is delegated to pytrec_eval in BEIR
 *    (retrieval/evaluation.py:98-101); the deterministic core below implements
 *    the same trec_eval formula for the future judgment-based layer.
 *
 * Usage:
 *   node eval/retrieval-baseline.mjs [--db PATH] [--run ID ...] [--latest N] [--out FILE]
 *   node eval/retrieval-baseline.mjs --compare BEFORE.json AFTER.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { COUNTER_TERM_RE, MAX_DOCUMENTS, COUNTER_MIN_SEATS } from '../dist/pipeline/stages/retrieve.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name) => args.includes(name);

const DB_PATH = resolve(process.cwd(), flag('--db') ?? '.far-run/far.db');

/** trec_eval-style nDCG@k (linear gain rel, discount 1/log2(rank+1)); exported shape for the judgment layer. */
export const ndcgAtK = (rankedDocIds, qrels, k) => {
  const rel = (id) => qrels[id] ?? 0;
  const dcg = rankedDocIds.slice(0, k).reduce((s, id, i) => s + (rel(id) > 0 ? rel(id) / Math.log2(i + 2) : 0), 0);
  const ideal = Object.values(qrels).filter((r) => r > 0).sort((a, b) => b - a);
  const idcg = ideal.slice(0, k).reduce((s, r, i) => s + r / Math.log2(i + 2), 0);
  return idcg === 0 ? 0 : dcg / idcg;
};

const openDb = (path) => new DatabaseSync(path, { readOnly: true });

const loadRuns = (db, runIds) => {
  if (runIds.length > 0) {
    return runIds.map((id) => {
      const row = db.prepare("SELECT json FROM objects WHERE kind='corpus_snapshot' AND run_id=? ORDER BY rowid DESC").get(id);
      if (!row) throw new Error(`no corpus_snapshot for run ${id}`);
      return JSON.parse(row.json);
    });
  }
  const rows = db.prepare("SELECT json FROM objects WHERE kind='corpus_snapshot' ORDER BY rowid ASC").all();
  return rows.map((r) => JSON.parse(r.json));
};

const pct = (num, den) => (den === 0 ? null : Number((num / den).toFixed(4)));

/** Per-run deterministic metrics. Pure function of persisted objects. */
export const computeRunMetrics = (snapshot, docs, searchReceipts) => {
  const queries = Array.isArray(snapshot.queries) ? snapshot.queries : [];
  const byPurpose = { discovery: 0, supporting: 0, counter_evidence: 0 };
  const byFamily = { openalex: 0, arxiv: 0, crossref: 0 };
  for (const q of queries) {
    if (q.purpose in byPurpose) byPurpose[q.purpose] += 1;
    if (q.family in byFamily) byFamily[q.family] += 1;
  }
  const counterTexts = queries.filter((q) => q.purpose === 'counter_evidence').map((q) => q.text);
  const counterGatePass = counterTexts.some((t) => COUNTER_TERM_RE.test(t));

  // Retrieval receipts: per-search outcome. Zero-result searches are a real
  // failure class (esp. counter queries that silently return nothing).
  // W6 audit P2-3: PLANNED searches and arXiv recovery VARIANT attempts are
  // measured separately — mixing them would let the cascade mechanically
  // improve the guarded zeroResultRate without any real quality change.
  const allAttempts = searchReceipts
    .map((r) => ({ sr: r.sourceRetrieval, variant: typeof r.redactionNote === 'string' && r.redactionNote.startsWith('arxiv recovery variant') }))
    .filter((a) => a.sr !== undefined);
  const searches = allAttempts.filter((a) => !a.variant).map((a) => a.sr);
  const variantAttempts = allAttempts.filter((a) => a.variant).map((a) => a.sr);
  const okSearches = searches.filter((s) => s.httpStatus === 200);
  const zeroResult = okSearches.filter((s) => s.resultCount === 0);
  const counterSearches = okSearches.filter((s) => {
    const q = queries.find((x) => x.text === s.query && x.family === s.family);
    return q !== undefined && q.purpose === 'counter_evidence';
  });
  const counterZero = counterSearches.filter((s) => s.resultCount === 0);
  const totalResultCount = okSearches.reduce((sum, s) => sum + s.resultCount, 0);
  const variantRecovered = variantAttempts.filter((s) => s.httpStatus === 200 && s.resultCount > 0);
  const poolSize = snapshot.fusion?.poolSize ?? null;
  const poolYield = poolSize !== null && totalResultCount > 0 ? pct(poolSize, totalResultCount) : null;

  // Corpus documents: coverage, resolvability, verification (deterministic replay
  // of the verify stage's persisted outcomes — the north-star verify-rate basis).
  const total = docs.length;
  const withAbstract = docs.filter((d) => typeof d.abstractText === 'string' && d.abstractText.length > 0);
  const resolvable = docs.filter((d) => d.identifiers.some((i) => i.kind === 'doi' || i.kind === 'arxiv'));
  const verified = docs.filter((d) => d.verification !== undefined);
  const resolved = verified.filter((d) => d.verification.resolved === true);
  const titleMatch = resolved.filter((d) => d.verification.titleMatch === true);
  const notFound = verified.filter((d) => d.verification.resolved === false && d.verification.method !== 'url');
  const noId = verified.filter((d) => d.verification.method === 'url' && d.verification.resolved === false);
  const wrongPaperSuspect = verified.filter((d) => d.verification.wrongPaperSuspect === true);
  const verifyErrors = total - verified.length;
  const familyShare = { openalex: 0, arxiv: 0, crossref: 0 };
  for (const d of docs) if (d.family in familyShare) familyShare[d.family] += 1;
  const years = docs.map((d) => d.publicationYear).filter((y) => typeof y === 'number');
  years.sort((a, b) => a - b);
  const yearMedian = years.length === 0 ? null : years[Math.floor(years.length / 2)];
  const keys = docs.map((d) => {
    const doi = d.identifiers.find((i) => i.kind === 'doi');
    const ax = d.identifiers.find((i) => i.kind === 'arxiv');
    const id = doi ?? ax ?? d.identifiers[0];
    return id ? `${id.kind}:${id.value.toLowerCase()}` : null;
  });

  return {
    runId: snapshot.runId,
    snapshotCreatedAt: snapshot.createdAt,
    plan: {
      queryTotal: queries.length,
      byPurpose,
      byFamily,
      counterGatePass,
      familyFailures: Array.isArray(snapshot.familyFailures) ? snapshot.familyFailures.length : 0,
    },
    searches: {
      attempted: searches.length,
      ok: okSearches.length,
      failed: searches.length - okSearches.length,
      zeroResult: zeroResult.length,
      zeroResultRate: pct(zeroResult.length, okSearches.length),
      counterOk: counterSearches.length,
      counterZero: counterZero.length,
      totalResultCount,
    },
    variantRecovery: {
      attempted: variantAttempts.length,
      ok: variantAttempts.filter((s) => s.httpStatus === 200).length,
      failed: variantAttempts.filter((s) => s.httpStatus !== 200).length,
      recovered: variantRecovered.length,
      recoveredDocs: variantRecovered.reduce((sum, s) => sum + s.resultCount, 0),
    },
    pool: {
      poolSize,
      poolYield,
      rerankApplied: snapshot.fusion?.rerankApplied ?? null,
      rerankFailure: snapshot.fusion?.rerankFailure ?? null,
      counterSeatsKept: snapshot.fusion?.counterSeatsKept ?? null,
    },
    corpus: {
      size: total,
      cap: MAX_DOCUMENTS,
      // W6 audit P3-3: a corpus of exactly cap docs is truncated only if the
      // pool actually exceeded it (fusion.poolSize); fall back conservatively
      // when the fusion record is absent (pre-D-015 snapshots).
      truncated: poolSize !== null ? poolSize > total : total >= MAX_DOCUMENTS,
      abstractCoverage: pct(withAbstract.length, total),
      parseOk: pct(docs.filter((d) => d.parseStatus === 'ok').length, total),
      identifierResolvability: pct(resolvable.length, total),
      familyShare: { openalex: pct(familyShare.openalex, total), arxiv: pct(familyShare.arxiv, total), crossref: pct(familyShare.crossref, total) },
      distinctKeys: new Set(keys.filter((k) => k !== null)).size,
      yearMedian,
      yearMissing: total - years.length,
    },
    verification: {
      checked: verified.length,
      resolved: resolved.length,
      resolvedRate: pct(resolved.length, total),
      titleMatchRate: pct(titleMatch.length, resolved.length),
      wrongPaperSuspect: wrongPaperSuspect.length,
      notFound: notFound.length,
      noIdentifier: noId.length,
      pendingOrError: verifyErrors,
      // BEIR hole-analogue: share of corpus with NO resolved verification.
      holeRate: pct(total - resolved.length, total),
    },
  };
};

const collect = (db, runId) => {
  const docs = db
    .prepare("SELECT json FROM objects WHERE kind='source_document' AND run_id=? ORDER BY rowid ASC")
    .all(runId)
    .map((r) => JSON.parse(r.json));
  const receipts = db
    .prepare("SELECT json FROM objects WHERE kind='receipt' AND run_id=? ORDER BY rowid ASC")
    .all(runId)
    .map((r) => JSON.parse(r.json))
    .filter((j) => j.kind === 'source_retrieval' && j.stage === 'retrieve');
  return { docs, receipts };
};

const GUARDED = [
  ['verification.resolvedRate', 'higher'],
  ['verification.holeRate', 'lower'],
  ['corpus.abstractCoverage', 'higher'],
  ['corpus.identifierResolvability', 'higher'],
  ['searches.zeroResultRate', 'lower'],
  ['searches.counterZero', 'lower'],
];

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);

const median = (nums) => {
  const s = [...nums].sort((a, b) => a - b);
  if (s.length === 0) return null;
  return s.length % 2 === 1 ? s[Math.floor(s.length / 2)] : Number(((s[Math.floor(s.length / 2) - 1] + s[Math.floor(s.length / 2)]) / 2).toFixed(4));
};

export const aggregate = (runs) => {
  const pick = (p) => runs.map((r) => getPath(r, p)).filter((v) => typeof v === 'number');
  const sum = (p) => pick(p).reduce((a, b) => a + b, 0);
  const pooled = {
    runs: runs.length,
    resolvedRatePooled: pct(sum('verification.resolved'), sum('corpus.size')),
    counterSeatsKeptMin: Math.min(...runs.map((r) => r.pool.counterSeatsKept ?? COUNTER_MIN_SEATS)),
    counterGatePassRate: pct(runs.filter((r) => r.plan.counterGatePass).length, runs.length),
    rerankAppliedRate: pct(runs.filter((r) => r.pool.rerankApplied === true).length, runs.length),
    truncatedRate: pct(runs.filter((r) => r.corpus.truncated).length, runs.length),
  };
  const medians = {};
  for (const p of ['verification.resolvedRate', 'verification.holeRate', 'corpus.abstractCoverage', 'corpus.identifierResolvability', 'searches.zeroResultRate', 'searches.counterZero', 'pool.poolSize', 'pool.poolYield', 'searches.totalResultCount', 'corpus.yearMedian']) {
    medians[p] = median(pick(p));
  }
  return { pooled, medians };
};

export const compareReports = (before, after) => {
  const rows = [];
  for (const [path, dir] of GUARDED) {
    // medians is a FLAT object whose keys are the full dotted metric paths
    const b = before.aggregate.medians[path];
    const a = after.aggregate.medians[path];
    if (b === null && a === null) { rows.push({ metric: path, before: b, after: a, delta: null, verdict: 'no-data' }); continue; }
    if (b === null || a === null) { rows.push({ metric: path, before: b, after: a, delta: null, verdict: 'incomparable' }); continue; }
    const delta = Number((a - b).toFixed(4));
    const improved = dir === 'higher' ? delta > 0 : delta < 0;
    const regressed = dir === 'higher' ? delta < 0 : delta > 0;
    rows.push({ metric: path, before: b, after: a, delta, verdict: regressed ? 'REGRESSION' : improved ? 'improved' : 'unchanged' });
  }
  const pooledBefore = before.aggregate.pooled;
  const pooledAfter = after.aggregate.pooled;
  const pooledRow = {
    metric: 'pooled.resolvedRatePooled',
    before: pooledBefore.resolvedRatePooled,
    after: pooledAfter.resolvedRatePooled,
    verdict: pooledAfter.resolvedRatePooled < pooledBefore.resolvedRatePooled ? 'REGRESSION' : 'improved-or-equal',
  };
  const regressions = rows.filter((r) => r.verdict === 'REGRESSION');
  return {
    before: before.meta, after: after.meta,
    rows: [...rows, pooledRow],
    counterSeatsFloorHeld: pooledAfter.counterSeatsKeptMin >= Math.min(COUNTER_MIN_SEATS, pooledBefore.counterSeatsKeptMin),
    regressionCount: regressions.length + (pooledRow.verdict === 'REGRESSION' ? 1 : 0),
    verdict: regressions.length === 0 && pooledRow.verdict !== 'REGRESSION' ? 'ZERO_GUARDED_REGRESSION' : 'HAS_REGRESSIONS',
  };
};

// ---- main (CLI only; pure functions above stay importable for tests) ----
const isMainModule = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMainModule && has('--compare')) {
  const beforePath = flag('--compare');
  const afterPath = args[args.indexOf('--compare') + 1];
  const before = JSON.parse(readFileSync(resolve(process.cwd(), beforePath), 'utf8'));
  const after = JSON.parse(readFileSync(resolve(process.cwd(), afterPath), 'utf8'));
  const report = compareReports(before, after);
  const outPath = flag('--out');
  const text = JSON.stringify(report, null, 2);
  if (outPath) writeFileSync(resolve(process.cwd(), outPath), text + '\n');
  console.log(text);
  process.exit(report.verdict === 'ZERO_GUARDED_REGRESSION' ? 0 : 1);
} else if (isMainModule) {
  const db = openDb(DB_PATH);
  const runIdArgs = args.filter((_, i) => args[i - 1] === '--run');
  const latest = Number(flag('--latest') ?? 0);
  let snapshots = loadRuns(db, runIdArgs);
  if (latest > 0) snapshots = snapshots.slice(-latest);
  const runs = snapshots.map((snap) => {
    const { docs, receipts } = collect(db, snap.runId);
    return computeRunMetrics(snap, docs, receipts);
  });
  const report = {
    meta: { computedAt: new Date().toISOString(), db: DB_PATH, runsIncluded: runs.map((r) => r.runId) },
    aggregate: aggregate(runs),
    runs,
  };
  const outPath = flag('--out');
  const text = JSON.stringify(report, null, 2);
  if (outPath) writeFileSync(resolve(process.cwd(), outPath), text + '\n');
  const a = report.aggregate;
  console.log(`runs=${a.pooled.runs} pooledVerifyRate=${a.pooled.resolvedRatePooled} counterGatePass=${a.pooled.counterGatePassRate} rerankApplied=${a.pooled.rerankAppliedRate} truncated=${a.pooled.truncatedRate}`);
  console.log(`medians: holeRate=${a.medians['verification.holeRate']} abstractCov=${a.medians['corpus.abstractCoverage']} identResolv=${a.medians['corpus.identifierResolvability']} zeroResultRate=${a.medians['searches.zeroResultRate']} counterZero=${a.medians['searches.counterZero']} poolSize=${a.medians['pool.poolSize']}`);
  if (outPath) console.log(`written: ${outPath}`);
}
