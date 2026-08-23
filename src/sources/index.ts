import type { SourceFamily } from '../domain/source.js';
import type { SourceAdapter } from '../shared/ports.js';
import { type SourceAdapterOptions } from './http.js';
import { createArxivAdapter, type ArxivAdapterOptions } from './arxiv.js';
import { createCrossrefAdapter, type CrossrefAdapterOptions } from './crossref.js';
import { createEuropePmcAdapter, type EuropePmcAdapterOptions } from './europepmc.js';
import { createOpenAlexAdapter, type OpenAlexAdapterOptions } from './openalex.js';

/** Union of family-specific factory options — each adapter ignores what it doesn't use. */
export interface AdapterFactoryOptions extends SourceAdapterOptions {
  /** OpenAlex/Crossref polite-pool identifier. */
  mailto?: string;
  /** arXiv politeness floor (0 disables; unit tests). */
  minIntervalMs?: number;
}

type AdapterFactory = (opts?: AdapterFactoryOptions) => SourceAdapter;

const FACTORIES: Record<SourceFamily, AdapterFactory | null> = {
  openalex: (o) => createOpenAlexAdapter(o satisfies OpenAlexAdapterOptions | undefined),
  arxiv: (o) => createArxivAdapter(o satisfies ArxivAdapterOptions | undefined),
  crossref: (o) => createCrossrefAdapter(o satisfies CrossrefAdapterOptions | undefined),
  // Keyless biomed family: restores abstract-bearing redundancy when the OpenAlex
  // keyless daily budget is exhausted (2026-08-22 live observation on the vitamin-D
  // run: OpenAlex 429s collapsed retrieval to abstract-less Crossref metadata).
  europepmc: (o) => createEuropePmcAdapter(o satisfies EuropePmcAdapterOptions | undefined),
  // User-provided seeds never search — no adapter can exist for this family.
  user_provided: null,
};

export const SOURCE_FAMILIES: readonly SourceFamily[] = ['openalex', 'arxiv', 'crossref', 'europepmc'];

/** Small factory registry: fetch the adapter for a family (optionally configured). */
export const sourceAdapterFor = (family: SourceFamily, opts?: AdapterFactoryOptions): SourceAdapter => {
  const factory = FACTORIES[family];
  if (factory === undefined || factory === null) {
    // 'user_provided' lands here too — seeds never search, by design.
    throw new Error(`no source adapter registered for family: ${String(family)}`);
  }
  return factory(opts);
};

export {
  createArxivAdapter,
  type ArxivAdapterOptions,
  createCrossrefAdapter,
  type CrossrefAdapterOptions,
  createEuropePmcAdapter,
  type EuropePmcAdapterOptions,
  createOpenAlexAdapter,
  type OpenAlexAdapterOptions,
};
export { excludeVolatile, snapshotHash } from './snapshot.js';
export { parseArxivAtom, type ArxivEntry, type ArxivFeed } from './arxiv.js';
export { rebuildInvertedAbstract } from './openalex.js';
export { SourceAdapterError, isSourceAdapterError, type SourceAdapterErrorKind } from './error.js';
export type { FetchLike, FetchResponseLike, SourceAdapterOptions } from './http.js';
export {
  defaultFetchFullText,
  extractJatsBodyText,
  extractLaTeXmlText,
  fetchArxivHtmlFullText,
  fetchEuropePmcFullText,
  fetchFullTextForRoute,
  fullTextRoute,
  type FullTextFetch,
  type FullTextFetchResult,
  type FullTextRoute,
  type FullTextVariant,
} from './fulltext.js';
