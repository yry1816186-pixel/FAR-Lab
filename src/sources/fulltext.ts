import type { SourceDocument } from '../domain/source.js';
import { httpGet, type SourceAdapterOptions } from './http.js';
import { isSourceAdapterError } from './error.js';

/**
 * Fulltext phase A (2026-08-22, W-EV2): deepen selected corpus documents from
 * abstract to full text via two keyless, license-clean endpoints —
 *   - arXiv LaTeXML HTML   https://arxiv.org/html/{id}      (probe: 200, ltx markers)
 *   - Europe PMC JATS XML  /rest/{pmcid}/fullTextXML        (probe: 200, JATS article)
 * NOT a SourceAdapter: these do not search/resolve; they deepen an existing
 * document through identifiers the corpus already carries. PDFs are out of
 * scope for phase A (no zero-dep PDF text extraction; AGPL minefield — D-019).
 *
 * Failures are explicit result states, never exceptions for expected outcomes:
 *   'fetched'        — full text extracted, license recorded when present
 *   'not_available'  — the endpoint legitimately has no fulltext for this id
 *   'error'          — infrastructure failure (visible, caller degrades honestly)
 */

export type FullTextVariant = 'arxiv_html_v1' | 'europepmc_jats_v1';

export interface FullTextFetch {
  variant: FullTextVariant;
  /** The URL the text was actually fetched from (provenance for the artifact). */
  sourceUrl: string;
  /** Extracted plain text (paragraph breaks preserved, markup removed). */
  text: string;
  /** License statement carried by the source, when present (recorded on the document). */
  license?: string;
  httpStatus: number;
}

export type FullTextFetchResult =
  | { status: 'fetched'; fetch: FullTextFetch }
  | { status: 'not_available'; reason: string }
  | { status: 'error'; message: string };

export interface FullTextRoute {
  kind: 'arxiv_html' | 'europepmc_jats';
  /** Canonical id: bare arXiv id, PMC-prefixed id, or PMID:-prefixed id. */
  id: string;
  sourceUrl: string;
}

const ARXIV_HTML_BASE = 'https://arxiv.org/html';
const EPMC_BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest';
/** Endpoint families for receipts/notes (not SourceFamily — these never search). */
export const FULLTEXT_FAMILIES = ['arxiv_html', 'europepmc_jats'] as const;
const USER_AGENT = 'FAR-Lab/0.1 (compatible; farlab fulltext phase A)';

/**
 * Route a corpus document to a fulltext endpoint through its identifiers.
 * arXiv ids win (LaTeXML HTML is the richest render); PMC ids second.
 * Deterministic — same doc always routes the same way.
 */
export const fullTextRoute = (doc: Pick<SourceDocument, 'identifiers'>): FullTextRoute | null => {
  for (const id of doc.identifiers) {
    if (id.kind === 'arxiv') {
      const bare = id.value.trim().replace(/v\d+$/, '');
      if (bare) {
        return { kind: 'arxiv_html', id: bare, sourceUrl: `${ARXIV_HTML_BASE}/${bare}` };
      }
    }
  }
  for (const id of doc.identifiers) {
    if (id.kind !== 'pubmed') continue;
    const v = id.value.trim();
    if (/^PMC\d+$/i.test(v)) {
      return { kind: 'europepmc_jats', id: v.toUpperCase(), sourceUrl: `${EPMC_BASE}/${v}/fullTextXML` };
    }
    if (/^\d+$/.test(v)) {
      // Bare PMID: the REST path needs the explicit PMID: prefix.
      return { kind: 'europepmc_jats', id: `PMID:${v}`, sourceUrl: `${EPMC_BASE}/PMID:${v}/fullTextXML` };
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// text extraction — regex-based, zero third-party deps (repo convention, arxiv.ts)
// ---------------------------------------------------------------------------

const stripInertBlocks = (html: string): string =>
  html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<table\b[\s\S]*?<\/table>/gi, ' '); // numeric mash; prose carries the claims

/** Keep paragraph/heading boundaries as newlines before removing inline markup. */
const BLOCK_END = /<\/(?:p|section|h[1-6]|li|figcaption|abstract|title)>/gi;

const tagsToSpaces = (s: string): string =>
  s.replace(BLOCK_END, '\n\n').replace(/<[^>]+>/g, ' ');

const collapseWs = (s: string): string =>
  s
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * LaTeXML (arXiv HTML) text. Returns null when the page is not a LaTeXML render
 * (landing/404 pages are HTML too — the ltx markers are the contract).
 * The bibliography block is dropped: reference lists are not claim material.
 */
export const extractLaTeXmlText = (html: string): string | null => {
  if (!/ltx_(?:document|page|section|author)/.test(html)) return null;
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  let body = bodyMatch !== null ? bodyMatch[1]! : html;
  // Cut at the OPENING TAG of the bibliography section (matching at the class
  // attribute alone would leak a partial unclosed tag into the text).
  const bibTag = body.match(/<[^>]*class="[^"]*ltx_bibliography[^"]*"[^>]*>/i);
  if (bibTag !== null && bibTag.index !== undefined) body = body.slice(0, bibTag.index);
  return collapseWs(tagsToSpaces(stripInertBlocks(body))) || null;
};

export interface JatsExtraction {
  text: string;
  license?: string;
}

/**
 * Europe PMC JATS fullTextXML: one top-level <body> inside <article>; license
 * text from the <license> element inside <permissions> when present.
 * Returns null when the payload is not a JATS article body.
 */
export const extractJatsBodyText = (xml: string): JatsExtraction | null => {
  if (!/<article[\s>]/i.test(xml)) return null;
  const bodyMatch = xml.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch === null) return null;
  const license =
    xml
      .match(/<license\b[^>]*>([\s\S]*?)<\/license>/i)?.[1]
      ?.replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const text = collapseWs(tagsToSpaces(stripInertBlocks(bodyMatch[1]!)));
  if (text.length === 0) return null;
  return { text, license: license !== undefined && license.length > 0 ? license : undefined };
};

// ---------------------------------------------------------------------------
// fetchers
// ---------------------------------------------------------------------------

/** Extracted text below this is a degenerate render — treat as not available. */
const MIN_FULLTEXT_CHARS = 1_500;

export const fetchArxivHtmlFullText = async (
  route: FullTextRoute,
  opts: SourceAdapterOptions = {},
): Promise<FullTextFetchResult> => {
  try {
    const res = await httpGet(route.sourceUrl, {
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs,
      headers: { 'User-Agent': USER_AGENT },
      context: { family: 'arxiv_html', query: route.id },
    });
    if (res.status === 404) {
      return { status: 'not_available', reason: `no HTML rendering for ${route.id} (404)` };
    }
    if (res.status !== 200) {
      return { status: 'error', message: `arxiv html ${route.id}: http ${res.status}` };
    }
    const text = extractLaTeXmlText(res.bodyText);
    if (text === null) {
      return { status: 'not_available', reason: `200 response is not a LaTeXML page for ${route.id}` };
    }
    if (text.length < MIN_FULLTEXT_CHARS) {
      return { status: 'not_available', reason: `degenerate render (${text.length} chars) for ${route.id}` };
    }
    return {
      status: 'fetched',
      fetch: { variant: 'arxiv_html_v1', sourceUrl: route.sourceUrl, text, httpStatus: res.status },
    };
  } catch (e) {
    return { status: 'error', message: `arxiv html ${route.id}: ${e instanceof Error ? e.message : String(e)}` };
  }
};

export const fetchEuropePmcFullText = async (
  route: FullTextRoute,
  opts: SourceAdapterOptions = {},
): Promise<FullTextFetchResult> => {
  // One immediate retry on network failure only (probe 2026-08-22: transient
  // EBI connection drops observed; non-network outcomes are final).
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await httpGet(route.sourceUrl, {
        fetchImpl: opts.fetchImpl,
        timeoutMs: opts.timeoutMs,
        headers: { 'User-Agent': USER_AGENT },
        context: { family: 'europepmc_jats', query: route.id },
      });
      if (res.status === 404 || res.status === 204) {
        return { status: 'not_available', reason: `no OA fulltext for ${route.id} (${res.status})` };
      }
      if (res.status !== 200) {
        return { status: 'error', message: `europepmc ${route.id}: http ${res.status}` };
      }
      const jats = extractJatsBodyText(res.bodyText);
      if (jats === null) {
        return { status: 'not_available', reason: `200 response is not a JATS article for ${route.id}` };
      }
      if (jats.text.length < MIN_FULLTEXT_CHARS) {
        return { status: 'not_available', reason: `degenerate body (${jats.text.length} chars) for ${route.id}` };
      }
      return {
        status: 'fetched',
        fetch: {
          variant: 'europepmc_jats_v1',
          sourceUrl: route.sourceUrl,
          text: jats.text,
          license: jats.license,
          httpStatus: res.status,
        },
      };
    } catch (e) {
      const network = isSourceAdapterError(e) && e.kind === 'network';
      if (network && attempt === 1) continue;
      return { status: 'error', message: `europepmc ${route.id}: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
};

/** Fetch fulltext for a routed document (null route → not_available). */
export const fetchFullTextForRoute = async (
  route: FullTextRoute | null,
  opts: SourceAdapterOptions = {},
): Promise<FullTextFetchResult> => {
  if (route === null) return { status: 'not_available', reason: 'no routable identifier (arxiv/PMC)' };
  return route.kind === 'arxiv_html'
    ? fetchArxivHtmlFullText(route, opts)
    : fetchEuropePmcFullText(route, opts);
};

/** Live default: route by identifiers then fetch. Stages/tests inject their own via ctx. */
export const defaultFetchFullText = async (doc: SourceDocument): Promise<FullTextFetchResult> =>
  fetchFullTextForRoute(fullTextRoute(doc));
