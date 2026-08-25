import type { SourceDocument } from '../domain/source.js';
import { httpGet, type SourceAdapterOptions } from './http.js';
import { isSourceAdapterError } from './error.js';
import { parseJats } from '../ingest/parsers/jats.js';
import { parseTei } from '../ingest/parsers/tei.js';
import { parseLatexml } from '../ingest/parsers/latexml.js';
import type { SdmDocument } from '../ingest/sdm.js';

/**
 * Fulltext phase A (2026-08-22, W-EV2): deepen selected corpus documents from
 * abstract to full text via keyless, license-clean endpoints —
 *   - arXiv LaTeXML HTML   https://arxiv.org/html/{id}      (probe: 200, ltx markers)
 *   - Europe PMC JATS XML  /rest/{pmcid}/fullTextXML        (probe: 200, JATS article)
 * Phase B via OpenAlex content API (2026-08-22, D-028): server-side GROBID TEI XML
 *   - https://content.openalex.org/works/{W-id}.grobid-xml  (probe: metadata keyless,
 *     download requires OPENALEX_API_KEY; $0.01/file, free key ~100/day ≥ our ≤3/run cap).
 *     This SUPERSEDES a local GROBID sidecar (registry B): same GROBID output, zero infra.
 *     Keyless docs simply stay abstract-depth — honest not_available, no error, no cost.
 * NOT a SourceAdapter: these do not search/resolve; they deepen an existing
 * document through identifiers the corpus already carries. Raw-PDF fetching stays
 * out of scope (no zero-dep PDF text extraction; AGPL minefield — D-019).
 *
 * Failures are explicit result states, never exceptions for expected outcomes:
 *   'fetched'        — full text extracted, license recorded when present
 *   'not_available'  — the endpoint legitimately has no fulltext for this id
 *   'error'          — infrastructure failure (visible, caller degrades honestly)
 */

export type FullTextVariant = 'arxiv_html_v1' | 'europepmc_jats_v1' | 'openalex_tei_v1';

export interface FullTextFetch {
  variant: FullTextVariant;
  /** The URL the text was actually fetched from (provenance for the artifact). */
  sourceUrl: string;
  /** Extracted plain text (paragraph breaks preserved, markup removed). */
  text: string;
  /**
   * SDM-1 structured understanding of the SAME payload (MULTIMODAL lane,
   * 2026-08-24): typed blocks/figures/tables/equations/citations with
   * elementPath provenance and honest parseStatus. Present on every 'fetched'
   * result; `text` above stays byte-identical to the legacy projection so
   * corpus artifacts and receipts are unaffected. Consumers persist via
   * ingestSdm/persistSdm and keep the artifact ref on the document.
   */
  sdm: SdmDocument;
  /** License statement carried by the source, when present (recorded on the document). */
  license?: string;
  httpStatus: number;
}

export type FullTextFetchResult =
  | { status: 'fetched'; fetch: FullTextFetch }
  | { status: 'not_available'; reason: string }
  | { status: 'error'; message: string };

export interface FullTextRoute {
  kind: 'arxiv_html' | 'europepmc_jats' | 'openalex_tei';
  /** Canonical id: bare arXiv id, PMC-prefixed id, PMID:-prefixed id, or bare OpenAlex W-id. */
  id: string;
  sourceUrl: string;
}

const ARXIV_HTML_BASE = 'https://arxiv.org/html';
const EPMC_BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest';
const OPENALEX_CONTENT_BASE = 'https://content.openalex.org/works';
/** Wait before the single network-error retry against EuropePMC (WP2 F5). */
const EPMC_RETRY_BACKOFF_MS = 1_000;
const USER_AGENT = 'FAR-Lab/0.1 (compatible; farlab fulltext phase A)';
/**
 * Accepts modern (`2401.04088`) and legacy (`math.GT/0309136`) arXiv ids while rejecting
 * anything path/scheme-hostile (`..`, `?`, `#`, `%`, `:`, whitespace) — the id is
 * interpolated into a URL, so the sibling routes' strict regex discipline applies here
 * too (Wave-G WP2 sources review F4).
 */
const ARXIV_ID_RE = /^(?![.-/])[A-Za-z0-9._/-]{4,40}$/;

/**
 * Route a corpus document to a fulltext endpoint through its identifiers.
 * arXiv ids win (LaTeXML HTML is the richest render); PMC ids second.
 * Deterministic — same doc always routes the same way.
 */
export const fullTextRoute = (doc: Pick<SourceDocument, 'identifiers'>): FullTextRoute | null => {
  for (const id of doc.identifiers) {
    if (id.kind === 'arxiv') {
      const bare = id.value.trim().replace(/v\d+$/, '');
      if (ARXIV_ID_RE.test(bare) && !bare.split('/').some((seg) => seg === '.' || seg === '..')) {
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
  // OpenAlex server-side GROBID TEI (phase B, D-028): last priority — keyless-key
  // docs stay abstract-depth, and arXiv/EPMC render richer structures for free.
  for (const id of doc.identifiers) {
    if (id.kind !== 'openalex') continue;
    const bare = id.value.trim().replace(/^https?:\/\/openalex\.org\//i, '').replace(/^W/i, (m) => m.toUpperCase());
    if (/^W\d+$/.test(bare)) {
      return { kind: 'openalex_tei', id: bare, sourceUrl: `${OPENALEX_CONTENT_BASE}/${bare}.grobid-xml` };
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// text extraction — regex-based, zero third-party deps (repo convention, arxiv.ts)
// ---------------------------------------------------------------------------

const stripInertBlocks = (html: string): string => {
  // Non-greedy spans stop at the FIRST closer, so nested tables (common in LaTeXML
  // renders) leave outer-table markup behind — repeat until stable (Wave-G WP2 F9).
  let out = html;
  for (;;) {
    const next = out
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<table\b[\s\S]*?<\/table>/gi, ' '); // numeric mash; prose carries the claims
    if (next === out) return out;
    out = next;
  }
};

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
 * W6/F5 (OpenScholar ADAPT, open_scholar.py:717-720): numeric citation markers
 * inherited from the source render ([12], [3,7], [1-4] incl. en-dash ranges)
 * are layout noise in deepened fulltext, not claim material. Numeric-only
 * brackets keep legitimate bracketed prose ("[Figure 3]", "[in review]") intact.
 */
export const stripCitationMarkers = (s: string): string => {
  // Punctuation absorption happens ONLY where a marker is actually removed —
  // a global "space-before-punctuation" rule would glue legitimate prose
  // parentheses onto the preceding word ("results (n = 30)" — W6 audit P2-1).
  const beforePunct = / ?\[\s*\d+(?:\s*[,\u2013-]\s*\d+)*\s*\][ \t]*(?=[.,;:)])/g;
  const anyMarker = /\[\s*\d+(?:\s*[,\u2013-]\s*\d+)*\s*\]/g;
  return s.replace(beforePunct, '').replace(anyMarker, ' ').replace(/ {2,}/g, ' ').trim();
};

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
  return stripCitationMarkers(collapseWs(tagsToSpaces(stripInertBlocks(body)))) || null;
};

export interface JatsExtraction {
  text: string;
  license?: string;
}

/**
 * GROBID TEI XML (OpenAlex content API variant, D-028): root <TEI> with a
 * <teiHeader> (dropped — metadata, not claim material) and <text><body> prose.
 * The trailing <listBibl> bibliography is cut like the LaTeXML case. Returns
 * null when the payload is not a TEI document.
 */
export const extractTeiBodyText = (xml: string): string | null => {
  if (!/<TEI[\s>]/i.test(xml)) return null;
  const bodyMatch = xml.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch === null) return null;
  let body = bodyMatch[1]!;
  const bibStart = body.search(/<listBibl\b/i);
  if (bibStart > 0) body = body.slice(0, bibStart);
  body = body.replace(/<figure\b[\s\S]*?<\/figure>/gi, ' ');
  const text = stripCitationMarkers(collapseWs(tagsToSpaces(stripInertBlocks(body))));
  return text.length > 0 ? text : null;
};

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
  const text = stripCitationMarkers(collapseWs(tagsToSpaces(stripInertBlocks(bodyMatch[1]!))));
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
      fetch: {
        variant: 'arxiv_html_v1',
        sourceUrl: route.sourceUrl,
        text,
        sdm: parseLatexml(res.bodyText, { name: `arxiv-${route.id}-latexml.html`, url: route.sourceUrl }),
        httpStatus: res.status,
      },
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
          sdm: parseJats(res.bodyText, {
            name: `europepmc-${route.id}-jats.xml`,
            url: route.sourceUrl,
            ...(jats.license !== undefined ? { license: jats.license } : {}),
          }),
          license: jats.license,
          httpStatus: res.status,
        },
      };
    } catch (e) {
      const network = isSourceAdapterError(e) && e.kind === 'network';
      if (network && attempt === 1) {
        // Politeness backoff, not an immediate tight re-entry (WP2 F5): a persistent
        // EBI outage must not turn this loop into a sub-second request hammer.
        await new Promise<void>((resolve) => { setTimeout(resolve, EPMC_RETRY_BACKOFF_MS); });
        continue;
      }
      return { status: 'error', message: `europepmc ${route.id}: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
};

/**
 * OpenAlex content API GROBID TEI (phase B, D-028). Download REQUIRES an API key
 * (probe 2026-08-22: keyless → 401 "Content downloads require an API key"); without
 * OPENALEX_API_KEY (or opts.apiKey) the doc honestly stays abstract-depth — no
 * error, no cost. 401/404 are not_available (capability/coverage facts), 5xx/other
 * are visible errors.
 */
export const fetchOpenAlexTeiFullText = async (
  route: FullTextRoute,
  opts: SourceAdapterOptions & { apiKey?: string } = {},
): Promise<FullTextFetchResult> => {
  const apiKey = opts.apiKey ?? process.env['OPENALEX_API_KEY'] ?? '';
  if (apiKey === '') {
    return {
      status: 'not_available',
      reason: `openalex TEI for ${route.id}: content downloads require an API key (free at openalex.org/users) — OPENALEX_API_KEY not set`,
    };
  }
  try {
    const res = await httpGet(`${route.sourceUrl}?api_key=${encodeURIComponent(apiKey)}`, {
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs,
      headers: { 'User-Agent': USER_AGENT },
      context: { family: 'openalex_tei', query: route.id },
    });
    if (res.status === 404) {
      return { status: 'not_available', reason: `no GROBID TEI content for ${route.id} (404)` };
    }
    if (res.status === 401 || res.status === 403) {
      return { status: 'not_available', reason: `openalex TEI ${route.id}: key rejected (${res.status}) — check OPENALEX_API_KEY` };
    }
    if (res.status !== 200) {
      return { status: 'error', message: `openalex tei ${route.id}: http ${res.status}` };
    }
    const text = extractTeiBodyText(res.bodyText);
    if (text === null) {
      return { status: 'not_available', reason: `200 response is not GROBID TEI for ${route.id}` };
    }
    if (text.length < MIN_FULLTEXT_CHARS) {
      return { status: 'not_available', reason: `degenerate TEI body (${text.length} chars) for ${route.id}` };
    }
    return {
      status: 'fetched',
      fetch: {
        variant: 'openalex_tei_v1',
        sourceUrl: route.sourceUrl,
        text,
        sdm: parseTei(res.bodyText, { name: `openalex-${route.id}-tei.xml`, url: route.sourceUrl }),
        httpStatus: res.status,
      },
    };
  } catch (e) {
    return { status: 'error', message: `openalex tei ${route.id}: ${e instanceof Error ? e.message : String(e)}` };
  }
};

/** Fetch fulltext for a routed document (null route → not_available). */
export const fetchFullTextForRoute = async (
  route: FullTextRoute | null,
  opts: SourceAdapterOptions = {},
): Promise<FullTextFetchResult> => {
  if (route === null) return { status: 'not_available', reason: 'no routable identifier (arxiv/PMC/openalex)' };
  return route.kind === 'arxiv_html'
    ? fetchArxivHtmlFullText(route, opts)
    : route.kind === 'europepmc_jats'
      ? fetchEuropePmcFullText(route, opts)
      : fetchOpenAlexTeiFullText(route, opts);
};

/** Live default: route by identifiers then fetch. Stages/tests inject their own via ctx. */
export const defaultFetchFullText = async (doc: SourceDocument): Promise<FullTextFetchResult> =>
  fetchFullTextForRoute(fullTextRoute(doc));
