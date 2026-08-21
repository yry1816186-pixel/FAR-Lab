import type { SourceFamily } from '../domain/source.js';
import type { SourceAdapter } from '../shared/ports.js';
import { type SourceAdapterOptions } from './http.js';
import { createArxivAdapter, type ArxivAdapterOptions } from './arxiv.js';
import { createCrossrefAdapter, type CrossrefAdapterOptions } from './crossref.js';
import { createOpenAlexAdapter, type OpenAlexAdapterOptions } from './openalex.js';

/** Union of family-specific factory options — each adapter ignores what it doesn't use. */
export interface AdapterFactoryOptions extends SourceAdapterOptions {
  /** OpenAlex/Crossref polite-pool identifier. */
  mailto?: string;
  /** arXiv politeness floor (0 disables; unit tests). */
  minIntervalMs?: number;
}

type AdapterFactory = (opts?: AdapterFactoryOptions) => SourceAdapter;

const FACTORIES: Record<SourceFamily, AdapterFactory> = {
  openalex: (o) => createOpenAlexAdapter(o satisfies OpenAlexAdapterOptions | undefined),
  arxiv: (o) => createArxivAdapter(o satisfies ArxivAdapterOptions | undefined),
  crossref: (o) => createCrossrefAdapter(o satisfies CrossrefAdapterOptions | undefined),
};

export const SOURCE_FAMILIES: readonly SourceFamily[] = ['openalex', 'arxiv', 'crossref'];

/** Small factory registry: fetch the adapter for a family (optionally configured). */
export const sourceAdapterFor = (family: SourceFamily, opts?: AdapterFactoryOptions): SourceAdapter => {
  const factory = FACTORIES[family];
  if (factory === undefined) {
    throw new Error(`no source adapter registered for family: ${String(family)}`);
  }
  return factory(opts);
};

export {
  createArxivAdapter,
  type ArxivAdapterOptions,
  createCrossrefAdapter,
  type CrossrefAdapterOptions,
  createOpenAlexAdapter,
  type OpenAlexAdapterOptions,
};
export { excludeVolatile, snapshotHash } from './snapshot.js';
export { parseArxivAtom, type ArxivEntry, type ArxivFeed } from './arxiv.js';
export { rebuildInvertedAbstract } from './openalex.js';
export { SourceAdapterError, isSourceAdapterError, type SourceAdapterErrorKind } from './error.js';
export type { FetchLike, FetchResponseLike, SourceAdapterOptions } from './http.js';
