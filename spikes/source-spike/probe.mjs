#!/usr/bin/env node
/**
 * FAR-Lab W0 source spike probe.
 *
 * Verifies, against LIVE public APIs (no mocks):
 *   - openalex : search works, field inventory, abstract_inverted_index rebuild,
 *                best_oa_location full-text links, double-fetch hash stability.
 *   - crossref : DOI cross-resolution vs OpenAlex title, /works query search,
 *                rate-limit response headers, double-fetch hash stability.
 *   - arxiv    : Atom XML query + parse (id/title/abstract/published/doi),
 *                id_list re-query check, double-fetch hash stability.
 *
 * Usage:
 *   node probe.mjs [--source openalex|crossref|arxiv|all] [--topic "CRISPR base editing off-target"]
 *                  [--doi 10.xxxx/yyyy]   (crossref: skip OpenAlex DOI resolution)
 *
 * Writes full JSON results to spikes/source-spike/results/<source>-latest.json.
 * Exit code 0 iff every probed source finished with an ok HTTP round trip.
 * Zero third-party dependencies; Node >= 24 native fetch.
 */

import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MAILTO = 'farlab-spike@example.com';
const UA = `FAR-Lab-W0-Spike/0.1 (mailto:${MAILTO})`;
const TOPIC_DEFAULT = 'CRISPR base editing off-target';

const RESULTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results');

const OPENALEX_BASE = 'https://api.openalex.org';
const CROSSREF_BASE = 'https://api.crossref.org';
const ARXIV_BASE = 'https://export.arxiv.org/api/query';

// Fields that are counters/timestamps by semantics -> expected to drift across
// time even though a seconds-apart double fetch may not observe the change.
// These feed the "recommended hash-exclusion list"; empirical diffs are separate.
const KNOWN_VOLATILE = {
  openalex: [
    'cited_by_count',
    'counts_by_year',
    'referenced_works_count',
    'updated_date',
    'created_date',
    'open_access.is_oa',
    'open_access.oa_status',
    'open_access.any_repository_has_fulltext',
    'open_access.oa_date',
    'best_oa_location',
    'authorships[*].cited_by_count',
    'authorships[*].author.cited_by_count',
    'topics',
    'keywords',
    'sustainable_development_goals',
    'cited_by_api_url',
  ],
  crossref: [
    'message.is-referenced-by-count',
    'message.references-count',
    'message.reference-count',
    'message.deposited',
    'message.indexed',
    'message.score',
    'message.link[*].content-created',
    'message.link[*].content-version',
    'message.reference[*].deposited',
    'message.update-link',
  ],
  arxiv: ['entries[*].updated', 'feed.updated'],
};

/* ------------------------- generic helpers ------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

const canonicalSha256 = (payload) => sha256(stableStringify(payload));

function trunc(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > 100 ? `${s.slice(0, 100)}…` : s;
}

function deepDiff(a, b, path = '') {
  const out = [];
  if (a === b) return out;
  const aObj = a !== null && typeof a === 'object';
  const bObj = b !== null && typeof b === 'object';
  if (aObj && bObj) {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) out.push({ path: `${path}[*]`, kind: 'array-length', a: a.length, b: b.length });
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) out.push(...deepDiff(a[i], b[i], `${path}[${i}]`));
      return out;
    }
    if (Array.isArray(a) !== Array.isArray(b)) {
      out.push({ path, kind: 'type-change', a: typeof a, b: typeof b });
      return out;
    }
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const p = path ? `${path}.${k}` : k;
      if (!(k in a)) out.push({ path: p, kind: 'added', b: trunc(b[k]) });
      else if (!(k in b)) out.push({ path: p, kind: 'removed', a: trunc(a[k]) });
      else out.push(...deepDiff(a[k], b[k], p));
    }
    return out;
  }
  out.push({ path: path || '(root)', kind: 'changed', a: trunc(a), b: trunc(b) });
  return out;
}

const wild = (p) => p.replace(/\[\d+\]/g, '[*]');

function aggregateDiffs(diffs) {
  const agg = new Map();
  for (const d of diffs) {
    const key = wild(d.path);
    const cur = agg.get(key) ?? { occurrences: 0, kinds: new Set(), sample: d };
    cur.occurrences += 1;
    cur.kinds.add(d.kind);
    agg.set(key, cur);
  }
  return [...agg.entries()].map(([path, v]) => ({ path, occurrences: v.occurrences, kinds: [...v.kinds], sample: v.sample }));
}

/** Removes nodes whose (wildcarded) path is in wildPaths. Compacts arrays. */
function pruneByPaths(value, wildPaths) {
  const set = new Set(wildPaths);
  function walk(node, p) {
    if (p !== '' && set.has(wild(p))) return undefined;
    if (node === null || typeof node !== 'object') return node;
    if (Array.isArray(node)) {
      const out = [];
      for (let i = 0; i < node.length; i++) {
        const v = walk(node[i], `${p}[${i}]`);
        if (v !== undefined) out.push(v);
      }
      return out;
    }
    const out = {};
    for (const k of Object.keys(node)) {
      const v = walk(node[k], p ? `${p}.${k}` : k);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return walk(value, '');
}

/** GET with timeout + retry on 429/5xx/network error. Never throws; fails visibly. */
async function httpGet(url, opts = {}) {
  const { headers = {}, timeoutMs = 30000, retries = 2, retryDelayMs = 1500 } = opts;
  let lastError = null;
  for (let attempt = 1; attempt <= 1 + retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const t0 = performance.now();
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      const bodyText = await res.text();
      clearTimeout(timer);
      const headersAll = {};
      res.headers.forEach((v, k) => {
        headersAll[k] = v;
      });
      const latencyMs = Math.round(performance.now() - t0);
      if ((res.status === 429 || res.status >= 500) && attempt <= retries) {
        lastError = { stage: 'http-status', status: res.status, bodyPreview: bodyText.slice(0, 200) };
        await sleep(retryDelayMs * attempt);
        continue;
      }
      return { ok: res.ok, status: res.status, headersAll, bodyText, latencyMs, attempts: attempt, url };
    } catch (e) {
      clearTimeout(timer);
      lastError = { stage: 'network', name: e?.name, error: String(e) };
      if (attempt <= retries) {
        await sleep(retryDelayMs * attempt);
        continue;
      }
    }
  }
  return { ok: false, status: 0, error: lastError, attempts: 1 + (opts.retries ?? 2), headersAll: {}, bodyText: '', latencyMs: null, url };
}

const rateLimitHeaders = (h) =>
  Object.fromEntries(Object.entries(h).filter(([k]) => /rate|limit|retry|quota/i.test(k)));

function normalizeTitle(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]+$/, '')
    .replace(/^["'“”]+|["'“”]+$/g, '');
}

/* ------------------------- OpenAlex ------------------------- */

function invertAbstractIndex(inv) {
  if (!inv || typeof inv !== 'object') return null;
  const positions = [];
  for (const [word, idxs] of Object.entries(inv)) {
    if (!Array.isArray(idxs)) continue;
    for (const i of idxs) positions.push([i, word]);
  }
  positions.sort((x, y) => x[0] - y[0]);
  return positions.map(([, w]) => w).join(' ');
}

function abstractReadability(text) {
  if (!text) return null;
  const words = text.split(/\s+/).filter(Boolean);
  const alpha = words.filter((w) => /[A-Za-z]/.test(w)).length;
  return {
    wordCount: words.length,
    alphaTokenRatio: words.length ? +(alpha / words.length).toFixed(3) : null,
    startsWithUppercase: /^[A-Z]/.test(text),
    preview: `${text.slice(0, 240)}${text.length > 240 ? '…' : ''}`,
  };
}

async function probeOpenAlex(topic) {
  const out = { source: 'openalex', topic, steps: [] };
  const log = (m) => console.log(`  [openalex] ${m}`);

  const searchUrl = `${OPENALEX_BASE}/works?search=${encodeURIComponent(topic)}&per-page=5&mailto=${MAILTO}`;
  log(`GET ${searchUrl}`);
  const search = await httpGet(searchUrl, { headers: { 'User-Agent': UA } });
  out.steps.push({ step: 'search', request: { url: searchUrl }, response: { status: search.status, latencyMs: search.latencyMs, attempts: search.attempts } });
  if (!search.ok) {
    out.ok = false;
    out.error = search.error ?? { status: search.status };
    return out;
  }
  const searchJson = JSON.parse(search.bodyText);

  const works = (searchJson.results ?? []).map((w) => {
    const rebuilt = invertAbstractIndex(w.abstract_inverted_index);
    return {
      id: w.id ?? null,
      doi: w.doi ?? null,
      title: w.display_name ?? null,
      publication_year: w.publication_year ?? null,
      cited_by_count: w.cited_by_count ?? null,
      is_oa: w.open_access?.is_oa ?? null,
      oa_status: w.open_access?.oa_status ?? null,
      type: w.type ?? null,
      referenced_works_count: w.referenced_works_count ?? null,
      has_abstract_inverted_index: Boolean(w.abstract_inverted_index),
      rebuilt_abstract_word_count: rebuilt ? rebuilt.split(/\s+/).length : 0,
      best_oa_location: w.best_oa_location
        ? {
            pdf_url: w.best_oa_location.pdf_url ?? null,
            landing_page_url: w.best_oa_location.landing_page_url ?? null,
            license: w.best_oa_location.license ?? null,
            version: w.best_oa_location.version ?? null,
          }
        : null,
      primary_location_pdf_url: w.primary_location?.pdf_url ?? null,
      primary_source: w.primary_location?.source?.display_name ?? null,
      first_author: w.authorships?.[0]?.author?.display_name ?? null,
    };
  });
  out.search = {
    totalHits: searchJson.meta?.count ?? null,
    dbResponseTimeMs: searchJson.meta?.db_response_time_ms ?? null,
    returned: works.length,
    works,
    rateLimitHeaders: rateLimitHeaders(search.headersAll),
  };
  log(`search -> ${search.status} (${search.latencyMs}ms), totalHits=${out.search.totalHits}, returned=${works.length}`);
  log(
    `abstract coverage: ${works.filter((w) => w.has_abstract_inverted_index).length}/${works.length}; OA: ${works.filter((w) => w.is_oa).length}/${works.length}; best_oa_location.pdf_url: ${works.filter((w) => w.best_oa_location?.pdf_url).length}/${works.length}`,
  );

  const sample = (searchJson.results ?? []).find((w) => w.abstract_inverted_index);
  out.abstractRebuildSample = sample
    ? { openalexId: sample.id, title: sample.display_name, rebuilt: abstractReadability(invertAbstractIndex(sample.abstract_inverted_index)) }
    : null;
  if (out.abstractRebuildSample) {
    log(`rebuilt abstract sample (W-length=${out.abstractRebuildSample.rebuilt.wordCount} words): ${out.abstractRebuildSample.rebuilt.preview.slice(0, 120)}…`);
  }

  // Snapshot immutability: same work fetched twice, seconds apart.
  const target = (searchJson.results ?? []).find((w) => w.id && w.doi);
  if (!target) {
    out.stability = { ok: false, reason: 'no work with id+doi in search results' };
    out.ok = true;
    return out;
  }
  const shortId = String(target.id).replace('https://openalex.org/', '');
  const singleUrl = `${OPENALEX_BASE}/works/${shortId}?mailto=${MAILTO}`;
  log(`stability double-fetch ${singleUrl}`);
  const f1 = await httpGet(singleUrl, { headers: { 'User-Agent': UA } });
  await sleep(1500);
  const f2 = await httpGet(singleUrl, { headers: { 'User-Agent': UA } });
  if (!f1.ok || !f2.ok) {
    out.stability = { ok: false, error: f1.error ?? { status: f1.status }, error2: f2.error ?? { status: f2.status } };
    out.ok = f1.ok && f2.ok && true && search.ok;
    return out;
  }
  const p1 = JSON.parse(f1.bodyText);
  const p2 = JSON.parse(f2.bodyText);
  const diffs = deepDiff(p1, p2);
  const observed = aggregateDiffs(diffs).map((d) => d.path);
  const observedPlusKnown = [...new Set([...observed, ...KNOWN_VOLATILE.openalex])];
  const hash = {
    rawBodySha256: { fetch1: sha256(f1.bodyText), fetch2: sha256(f2.bodyText) },
    canonicalFull: { fetch1: canonicalSha256(p1), fetch2: canonicalSha256(p2) },
    canonicalPrunedObserved: { fetch1: canonicalSha256(pruneByPaths(p1, observed)), fetch2: canonicalSha256(pruneByPaths(p2, observed)) },
    canonicalPrunedObservedPlusKnown: {
      fetch1: canonicalSha256(pruneByPaths(p1, observedPlusKnown)),
      fetch2: canonicalSha256(pruneByPaths(p2, observedPlusKnown)),
    },
  };
  out.stability = {
    ok: true,
    target: { openalexId: shortId, doi: target.doi, title: target.display_name },
    fetches: [
      { status: f1.status, latencyMs: f1.latencyMs },
      { status: f2.status, latencyMs: f2.latencyMs },
    ],
    observedMutableFields: aggregateDiffs(diffs),
    rawBodyBytesEqual: hash.rawBodySha256.fetch1 === hash.rawBodySha256.fetch2,
    canonicalFullStable: hash.canonicalFull.fetch1 === hash.canonicalFull.fetch2,
    canonicalPrunedObservedStable: hash.canonicalPrunedObserved.fetch1 === hash.canonicalPrunedObserved.fetch2,
    canonicalPrunedObservedPlusKnownStable: hash.canonicalPrunedObservedPlusKnown.fetch1 === hash.canonicalPrunedObservedPlusKnown.fetch2,
    hashes: hash,
    recommendedExclusionList: KNOWN_VOLATILE.openalex,
  };
  log(
    `double-fetch diff paths: ${observed.length ? observed.join(', ') : '(none within 1.5s)'}; canonicalFullStable=${out.stability.canonicalFullStable}; prunedStable=${out.stability.canonicalPrunedObservedPlusKnownStable}`,
  );

  out.ok = true;
  return out;
}

/* ------------------------- Crossref ------------------------- */

async function probeCrossref(topic, doiOverride) {
  const out = { source: 'crossref', topic, steps: [] };
  const log = (m) => console.log(`  [crossref] ${m}`);

  // Step 0: obtain a real DOI (+ OpenAlex title) unless overridden.
  let doi = doiOverride ?? null;
  let openalexTitle = null;
  if (!doi) {
    const oaUrl = `${OPENALEX_BASE}/works?search=${encodeURIComponent(topic)}&per-page=1&mailto=${MAILTO}`;
    log(`resolving DOI via OpenAlex: GET ${oaUrl}`);
    const oa = await httpGet(oaUrl, { headers: { 'User-Agent': UA } });
    out.steps.push({ step: 'resolve-doi-via-openalex', response: { status: oa.status, latencyMs: oa.latencyMs } });
    if (oa.ok) {
      const w = JSON.parse(oa.bodyText).results?.[0];
      if (w?.doi) {
        doi = String(w.doi).replace('https://doi.org/', '');
        openalexTitle = w.display_name ?? null;
      }
    }
  }
  if (!doi) {
    out.ok = false;
    out.error = 'could not resolve a DOI via OpenAlex and no --doi override given';
    return out;
  }
  out.crossResolution = { doi, openalexTitle };

  // Step 1: /works/{doi} twice (cross-resolution + stability).
  const doiUrl = `${CROSSREF_BASE}/works/${doi}`;
  log(`GET ${doiUrl} (fetch #1)`);
  const r1 = await httpGet(doiUrl, { headers: { 'User-Agent': UA } });
  log(`GET ${doiUrl} (fetch #2)`);
  await sleep(1500);
  const r2 = await httpGet(doiUrl, { headers: { 'User-Agent': UA } });
  out.steps.push({ step: 'works-by-doi', response: { status: r1.status, latencyMs: r1.latencyMs, attempts: r1.attempts } });
  if (!r1.ok || !r2.ok) {
    out.ok = false;
    out.error = r1.error ?? { status: r1.status };
    return out;
  }
  const m1 = JSON.parse(r1.bodyText).message;
  const m2 = JSON.parse(r2.bodyText).message;
  const crossrefTitle = Array.isArray(m1.title) ? m1.title[0] : m1.title ?? null;
  out.crossResolution = {
    ...out.crossResolution,
    crossrefTitle,
    titlesMatch: openalexTitle ? normalizeTitle(openalexTitle) === normalizeTitle(crossrefTitle) : null,
    crossrefType: m1.type ?? null,
    crossrefPublisher: m1.publisher ?? null,
    crossrefContainer: m1['container-title']?.[0] ?? null,
    crossrefIssued: m1.issued?.['date-parts']?.[0] ?? null,
    isReferencedByCount: m1['is-referenced-by-count'] ?? null,
    hasAbstract: typeof m1.abstract === 'string' && m1.abstract.length > 0,
    abstractPreview: m1.abstract ? `${String(m1.abstract).replace(/<[^>]+>/g, '').slice(0, 200)}…` : null,
    license: Array.isArray(m1.license) ? m1.license.map((l) => l.URL) : null,
    link: Array.isArray(m1.link) ? m1.link.map((l) => l.URL) : null,
    rateLimitHeadersFetch1: rateLimitHeaders(r1.headersAll),
  };
  log(
    `works/{doi} -> ${r1.status}; titlesMatch(openalex vs crossref)=${out.crossResolution.titlesMatch}; is-referenced-by-count=${out.crossResolution.isReferencedByCount}; hasAbstract=${out.crossResolution.hasAbstract}`,
  );

  const diffs = deepDiff(m1, m2);
  const observed = aggregateDiffs(diffs).map((d) => d.path);
  const observedPlusKnown = [...new Set([...observed, ...KNOWN_VOLATILE.crossref])];
  out.stability = {
    ok: true,
    target: { doi },
    fetches: [
      { status: r1.status, latencyMs: r1.latencyMs },
      { status: r2.status, latencyMs: r2.latencyMs },
    ],
    observedMutableFields: aggregateDiffs(diffs),
    rawBodySha256: { fetch1: sha256(r1.bodyText), fetch2: sha256(r2.bodyText) },
    canonicalFullStable: canonicalSha256(m1) === canonicalSha256(m2),
    canonicalPrunedObservedStable: canonicalSha256(pruneByPaths(m1, observed)) === canonicalSha256(pruneByPaths(m2, observed)),
    canonicalPrunedObservedPlusKnownStable:
      canonicalSha256(pruneByPaths(m1, observedPlusKnown)) === canonicalSha256(pruneByPaths(m2, observedPlusKnown)),
    recommendedExclusionList: KNOWN_VOLATILE.crossref,
  };
  log(
    `double-fetch diff paths: ${observed.length ? observed.join(', ') : '(none within 1.5s)'}; canonicalFullStable=${out.stability.canonicalFullStable}; prunedStable=${out.stability.canonicalPrunedObservedPlusKnownStable}`,
  );

  // Step 2: /works?query=... search.
  const searchUrl = `${CROSSREF_BASE}/works?query=${encodeURIComponent(topic)}&rows=5&mailto=${MAILTO}&select=DOI,title,type,issued,is-referenced-by-count,references-count,abstract,license,link,URL,container-title`;
  log(`GET ${searchUrl}`);
  const s = await httpGet(searchUrl, { headers: { 'User-Agent': UA } });
  out.steps.push({ step: 'works-query-search', response: { status: s.status, latencyMs: s.latencyMs } });
  if (s.ok) {
    const sj = JSON.parse(s.bodyText);
    out.search = {
      totalHits: sj.message?.['total-results'] ?? null,
      returned: sj.message?.items?.length ?? 0,
      items: (sj.message?.items ?? []).map((it) => ({
        doi: it.DOI ?? null,
        title: Array.isArray(it.title) ? it.title[0] : it.title ?? null,
        type: it.type ?? null,
        container: it['container-title']?.[0] ?? null,
        issued: it.issued?.['date-parts']?.[0] ?? null,
        isReferencedByCount: it['is-referenced-by-count'] ?? null,
        hasAbstract: typeof it.abstract === 'string' && it.abstract.length > 0,
        hasLicense: Array.isArray(it.license) && it.license.length > 0,
        hasLink: Array.isArray(it.link) && it.link.length > 0,
      })),
      rateLimitHeaders: rateLimitHeaders(s.headersAll),
      responseHeadersAll: s.headersAll,
    };
    log(
      `query search -> ${s.status}, totalHits=${out.search.totalHits}, returned=${out.search.returned}; abstract ${out.search.items.filter((i) => i.hasAbstract).length}/${out.search.items.length}; rate-limit headers=${JSON.stringify(out.search.rateLimitHeaders)}`,
    );
  } else {
    out.search = { ok: false, error: s.error ?? { status: s.status } };
  }

  out.ok = r1.ok && r2.ok && s.ok;
  return out;
}

/* ------------------------- arXiv ------------------------- */

function decodeXmlEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

const collapseWs = (s) => decodeXmlEntities(String(s).replace(/\s+/g, ' ')).trim();

function parseArxivAtom(xml) {
  const total = Number(xml.match(/<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/)?.[1] ?? 0);
  const entries = [];
  const blocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  for (const block of blocks) {
    const tag = (name) => {
      const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
      return m ? collapseWs(m[1]) : null;
    };
    const links = [...block.matchAll(/<link\b([^>]*)\/?>/g)].map((m) => {
      const attrs = {};
      for (const a of m[1].matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
      return attrs;
    });
    const rawId = tag('id') ?? '';
    const idMatch = rawId.match(/abs\/([^v<]+?)(v\d+)?$/);
    const pdfLink = links.find((l) => l.title === 'pdf' || l.type === 'application/pdf');
    const absLink = links.find((l) => l.rel === 'alternate');
    entries.push({
      arxiv_id: idMatch ? idMatch[1] : rawId,
      version: idMatch?.[2] ?? null,
      atom_id: rawId,
      title: tag('title'),
      abstract: tag('summary'),
      published: tag('published'),
      updated: tag('updated'),
      doi: tag('arxiv:doi'),
      primary_category: block.match(/<arxiv:primary_category[^>]*term="([^"]+)"/)?.[1] ?? null,
      categories: [...block.matchAll(/<category[^>]*term="([^"]+)"/g)].map((m) => m[1]),
      authors: [...block.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)].map((m) => collapseWs(m[1])),
      pdf_url: pdfLink?.href ?? null,
      landing_url: absLink?.href ?? null,
      comment: tag('arxiv:comment') ? collapseWs(block.match(/<arxiv:comment[^>]*>([\s\S]*?)<\/arxiv:comment>/)[1]) : null,
    });
  }
  return { totalResults: total, entries };
}

async function probeArxiv(topic) {
  const out = { source: 'arxiv', topic, steps: [] };
  const log = (m) => console.log(`  [arxiv] ${m}`);
  const headers = { 'User-Agent': UA };

  // Phrase query first; fall back to AND-of-terms if the phrase has no hits.
  const attempts = [
    { mode: 'phrase', q: `all:"${topic}"` },
    { mode: 'and-terms', q: topic.split(/\s+/).map((t) => `all:${t}`).join(' AND ') },
  ];
  let searchXml = null;
  for (const a of attempts) {
    const url = `${ARXIV_BASE}?search_query=${encodeURIComponent(a.q)}&start=0&max_results=3&sortBy=relevance&sortOrder=descending`;
    log(`GET ${url}`);
    const res = await httpGet(url, { headers, retries: 1, retryDelayMs: 3000 });
    out.steps.push({ step: `search(${a.mode})`, request: { url }, response: { status: res.status, latencyMs: res.latencyMs, attempts: res.attempts } });
    if (!res.ok) {
      out.ok = false;
      out.error = res.error ?? { status: res.status };
      return out;
    }
    const parsed = parseArxivAtom(res.bodyText);
    if (parsed.entries.length > 0) {
      searchXml = res.bodyText;
      out.queryMode = a.mode;
      out.searchUrl = url;
      out.search = parsed;
      break;
    }
    await sleep(3200); // arXiv asks >=3s between requests
    out.steps[out.steps.length - 1].note = '0 entries, trying fallback query';
  }
  if (!out.search) {
    out.ok = false;
    out.error = 'both phrase and and-terms queries returned 0 entries';
    return out;
  }
  log(`search(${out.queryMode}) -> totalResults=${out.search.totalResults}, entries=${out.search.entries.length}`);
  for (const e of out.search.entries) {
    log(`  entry ${e.arxiv_id}${e.version ?? ''} doi=${e.doi ?? '∅'} published=${e.published} abstractWords=${e.abstract ? e.abstract.split(/\s+/).length : 0}`);
  }

  // Metadata re-query for one arXiv ID.
  const target = out.search.entries[0];
  await sleep(3200);
  const recheckUrl = `${ARXIV_BASE}?id_list=${encodeURIComponent(target.arxiv_id)}&max_results=1`;
  log(`re-query by id: GET ${recheckUrl}`);
  const rc = await httpGet(recheckUrl, { headers, retries: 1, retryDelayMs: 3000 });
  out.steps.push({ step: 'requery-by-id', response: { status: rc.status, latencyMs: rc.latencyMs } });
  if (!rc.ok) {
    out.ok = false;
    out.error = rc.error ?? { status: rc.status };
    return out;
  }
  const rcParsed = parseArxivAtom(rc.bodyText);
  const rcEntry = rcParsed.entries[0] ?? null;
  out.requeryById = {
    ok: Boolean(rcEntry),
    idQueried: target.arxiv_id,
    searchVersion: target.version,
    requeryVersion: rcEntry?.version ?? null,
    title: rcEntry?.title ?? null,
    titlesMatch: rcEntry ? normalizeTitle(rcEntry.title) === normalizeTitle(target.title) : null,
    doi: rcEntry?.doi ?? null,
    published: rcEntry?.published ?? null,
    pdfUrl: rcEntry?.pdf_url ?? null,
  };
  log(`re-query -> ${rc.status}; titlesMatch=${out.requeryById.titlesMatch}; version search=${target.version} vs requery=${out.requeryById.requeryVersion}`);

  // Snapshot stability: same search URL fetched again, >=3s apart.
  await sleep(3200);
  log(`stability re-fetch of search URL`);
  const s2 = await httpGet(out.searchUrl, { headers, retries: 1, retryDelayMs: 3000 });
  if (!s2.ok) {
    out.stability = { ok: false, error: s2.error ?? { status: s2.status } };
    out.ok = out.search && rc.ok && true && s2.ok;
    out.ok = false;
    return out;
  }
  const p1 = out.search.entries;
  const p2 = parseArxivAtom(s2.bodyText).entries;
  const diffs = deepDiff(p1, p2);
  const observed = aggregateDiffs(diffs).map((d) => d.path);
  const observedPlusKnown = [...new Set([...observed, ...KNOWN_VOLATILE.arxiv])];
  out.stability = {
    ok: true,
    rawTextSha256: { fetch1: sha256(searchXml), fetch2: sha256(s2.bodyText) },
    rawTextStable: sha256(searchXml) === sha256(s2.bodyText),
    canonicalEntriesStable: canonicalSha256(p1) === canonicalSha256(p2),
    canonicalPrunedObservedPlusKnownStable:
      canonicalSha256(pruneByPaths(p1, observedPlusKnown)) === canonicalSha256(pruneByPaths(p2, observedPlusKnown)),
    observedMutableFields: aggregateDiffs(diffs),
    recommendedExclusionList: KNOWN_VOLATILE.arxiv,
  };
  log(`stability: rawTextStable=${out.stability.rawTextStable}; canonicalEntriesStable=${out.stability.canonicalEntriesStable}; diff paths=${observed.length ? observed.join(', ') : '(none)'}`);

  out.ok = true;
  return out;
}

/* ------------------------- main ------------------------- */

async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: 'string', default: 'all' },
      topic: { type: 'string', default: TOPIC_DEFAULT },
      doi: { type: 'string' },
    },
  });
  const source = values.source ?? 'all';
  const topic = values.topic ?? TOPIC_DEFAULT;
  const valid = ['openalex', 'crossref', 'arxiv', 'all'];
  if (!valid.includes(source)) {
    console.error(`invalid --source "${source}" (expected ${valid.join('|')})`);
    process.exit(2);
  }
  const wanted = source === 'all' ? ['openalex', 'crossref', 'arxiv'] : [source];

  console.log(`probe start: sources=[${wanted.join(', ')}] topic="${topic}" ua="${UA}"`);
  const results = {};
  let allOk = true;
  for (const s of wanted) {
    console.log(`--- probing ${s} ---`);
    let r;
    if (s === 'openalex') r = await probeOpenAlex(topic);
    else if (s === 'crossref') r = await probeCrossref(topic, values.doi);
    else r = await probeArxiv(topic);
    results[s] = r;
    if (!r.ok) allOk = false;
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  for (const [s, r] of Object.entries(results)) {
    const file = path.join(RESULTS_DIR, `${s}-latest.json`);
    writeFileSync(file, `${JSON.stringify(r, null, 2)}\n`, 'utf8');
    console.log(`results written: ${path.relative(process.cwd(), file)}`);
  }

  const summary = Object.fromEntries(Object.entries(results).map(([s, r]) => [s, { ok: r.ok, error: r.error ?? null }]));
  console.log(`PROBE_RESULT_ALL_OK=${allOk}`);
  console.log(`SUMMARY ${JSON.stringify(summary)}`);
  process.exitCode = allOk ? 0 : 1;
}

main().catch((e) => {
  console.error('probe crashed:', e);
  process.exit(1);
});
