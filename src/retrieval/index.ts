/**
 * retrieval — real literature-retrieval layer for FAR-Lab (forensic K1, 2026-08-12).
 *
 * Public surface:
 *   - types:      RetrievedDocument (rich provenance), RetrievalQuery/Result/Adapter
 *   - adapters:   openalex (Phase 1); arXiv/Crossref (Phase 2)
 *   - http:       allowlisted, fail-closed, rate-limited fetch helper
 *   - retrieve(): orchestrator → RetrievalResult (live or replay)
 *
 * Design contract (directive §10/§12/§20): every RetrievedDocument is
 * program-populated from a real network response; documentId is a deterministic
 * hash, never LLM-supplied. Retrieved text is UNTRUSTED DATA — callers must
 * route it through sanitizeExternalContent before any model context.
 */
export * from './types.ts';
export * from './hash.ts';
export * from './http.ts';

export { openalexAdapter, parseOpenAlexResults, buildOpenAlexUrl } from './adapters/openalex.ts';

import type { RetrievedDocument, RetrievalAdapter, RetrievalQuery, RetrievalResult } from './types.ts';
import { openalexAdapter } from './adapters/openalex.ts';

/** Select the live adapter for a source. Throws for unknown/ungated sources. */
export function selectLiveAdapter(source: RetrievalQuery['source']): RetrievalAdapter {
  switch (source) {
    case 'openalex':
      return openalexAdapter;
    default:
      throw new Error(`retrieval: no live adapter wired yet for source '${source}' (Phase 2)`);
  }
}

/** Run a live retrieval against the configured adapter for the query source. */
export async function retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
  const adapter = selectLiveAdapter(query.source);
  const documents = await adapter.retrieve(query);
  return {
    query,
    documents,
    fetchMode: 'live',
    retrievedAt: new Date().toISOString(),
  };
}

/**
 * Build a REPLAY adapter that serves pre-recorded documents (for hermetic
 * tests / offline CI / cached-snapshot demos). The documents carry their
 * original provenance (including retrievedAt/retrievalQuery from when they were
 * really fetched); the adapter marks itself as replay so downstream code never
 * mistakes a cached snapshot for a fresh live fetch (directive §55).
 */
export function createReplayAdapter(
  source: RetrievalQuery['source'],
  sourceName: string,
  fixtureDocuments: readonly RetrievedDocument[],
): RetrievalAdapter {
  return {
    source,
    sourceName,
    async retrieve(query: RetrievalQuery): Promise<readonly RetrievedDocument[]> {
      // Replay returns the recorded documents as-is (provenance preserved),
      // capped at query.maxResults. It does NOT re-fetch.
      return fixtureDocuments.slice(0, Math.max(0, query.maxResults));
    },
  };
}
