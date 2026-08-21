#!/usr/bin/env node
/* global console, process, fetch, setTimeout, clearTimeout, AbortController, performance */
/**
 * FAR-Lab W1 live source smoke check (real APIs, one search per family).
 *
 * NOT part of vitest — run directly:
 *   node scripts/live-check-sources.mjs
 *
 * Prefers the COMPILED adapters from dist/ (run `npm run build` first) so the smoke
 * also exercises real adapter code paths (normalize, parse, snapshot hash).
 * If dist/ is absent, falls back to inline direct API calls with the same endpoints,
 * so the script always reports real HTTP statuses. Exit code 0 iff all three
 * families answered 2xx.
 */
import { parseArgs } from 'node:util';

const TOPIC_DEFAULT = 'CRISPR base editing off-target';
const MAILTO = process.env.OPENALEX_MAILTO ?? 'far-lab@example.com';
const UA = `FAR-Lab-W1-LiveCheck/0.1 (mailto:${MAILTO})`;

const OPENALEX_BASE = 'https://api.openalex.org';
const CROSSREF_BASE = 'https://api.crossref.org';
const ARXIV_ENDPOINT = 'https://export.arxiv.org/api/query';

const { values } = parseArgs({
  options: {
    topic: { type: 'string', default: TOPIC_DEFAULT },
    limit: { type: 'string', default: '3' },
  },
});
const topic = values.topic ?? TOPIC_DEFAULT;
const limit = Math.max(1, Math.min(Number(values.limit ?? '3') || 3, 10));
const families = ['openalex', 'arxiv', 'crossref'];

/** Minimal structural fetch response (mirrors src/sources/http.ts FetchResponseLike). */
const get = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const t0 = performance.now();
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: controller.signal });
    const bodyText = await res.text();
    return { status: res.status, bodyText, latencyMs: Math.round(performance.now() - t0) };
  } finally {
    clearTimeout(timer);
  }
};

/* ---------------- inline fallback (dist/ absent) ---------------- */

const inlineCheck = async (family) => {
  if (family === 'openalex') {
    const r = await get(`${OPENALEX_BASE}/works?search=${encodeURIComponent(topic)}&per-page=${limit}&mailto=${encodeURIComponent(MAILTO)}`);
    const hits = r.status === 200 ? (JSON.parse(r.bodyText).meta?.count ?? 0) : null;
    return { family, status: r.status, hits, returned: r.status === 200 ? JSON.parse(r.bodyText).results?.length ?? 0 : 0, latencyMs: r.latencyMs, note: 'inline fallback' };
  }
  if (family === 'crossref') {
    const r = await get(`${CROSSREF_BASE}/works?query=${encodeURIComponent(topic)}&rows=${limit}&mailto=${encodeURIComponent(MAILTO)}`);
    const hits = r.status === 200 ? (JSON.parse(r.bodyText).message?.['total-results'] ?? 0) : null;
    return { family, status: r.status, hits, returned: r.status === 200 ? JSON.parse(r.bodyText).message?.items?.length ?? 0 : 0, latencyMs: r.latencyMs, note: 'inline fallback' };
  }
  // arXiv: tokenized AND query (spike §3.1), https endpoint (http 301s)
  const q = topic.trim().split(/\s+/).map((t) => `all:${t}`).join(' AND ');
  const r = await get(`${ARXIV_ENDPOINT}?search_query=${encodeURIComponent(q)}&start=0&max_results=${limit}&sortBy=relevance&sortOrder=descending`);
  const returned = r.status === 200 ? (r.bodyText.match(/<entry>/g) ?? []).length : 0;
  const hits = r.status === 200 ? Number(r.bodyText.match(/<opensearch:totalResults[^>]*>(\d+)</)?.[1] ?? 0) : null;
  return { family, status: r.status, hits, returned, latencyMs: r.latencyMs, note: 'inline fallback' };
};

/* ---------------- preferred path: compiled adapters ---------------- */

const adapterCheck = async (family, mod) => {
  const adapter = mod.sourceAdapterFor(family);
  const result = await adapter.search(topic, { limit });
  const first = result.records[0];
  const firstHash = first ? mod.snapshotHash(family, first) : null;
  const firstTitle = first ? first.title : null;
  return {
    family,
    status: result.httpStatus,
    hits: result.records.length, // per-family total-hit semantics differ; report returned records
    returned: result.records.length,
    latencyMs: result.latencyMs,
    note: 'compiled adapter (dist/)',
    firstTitle,
    firstSnapshotHash: firstHash,
  };
};

const main = async () => {
  let mod = null;
  try {
    mod = await import('../dist/sources/index.js');
  } catch {
    console.log('dist/sources not importable (run `npm run build` for the adapter path) — using inline fallback calls.');
  }

  console.log(`live-check start: families=${families.join(',')} topic="${topic}" limit=${limit} mode=${mod ? 'dist-adapters' : 'inline'}`);
  const results = [];
  for (const family of families) {
    try {
      const r = mod ? await adapterCheck(family, mod) : await inlineCheck(family);
      results.push(r);
      const extra = r.firstSnapshotHash
        ? ` firstTitle="${r.firstTitle}" snapshotSha256=${r.firstSnapshotHash.slice(0, 16)}…`
        : '';
      console.log(
        `[${family}] HTTP ${r.status} returned=${r.returned}${r.hits !== null ? ` hits=${r.hits}` : ''} latencyMs=${r.latencyMs} (${r.note})${extra}`,
      );
    } catch (err) {
      const status = typeof err?.httpStatus === 'number' ? err.httpStatus : 'n/a';
      console.log(`[${family}] FAILED kind=${err?.kind ?? 'unknown'} httpStatus=${status}: ${err?.message ?? String(err)}`);
      results.push({ family, status: 0 });
    }
  }
  const allOk = results.length === families.length && results.every((r) => r.status >= 200 && r.status < 300);
  console.log(`LIVE_CHECK_ALL_OK=${allOk}`);
  process.exitCode = allOk ? 0 : 1;
};

main().catch((e) => {
  console.error('live-check crashed:', e);
  process.exitCode = 1;
});
