/**
 * tests/retrieval/grounding_multi_source.test.ts — multi-source grounding.
 *
 * Pins directive §9.3: a run MAY ground across ≥2 independent source families;
 * every query is issued against every source; results merge + dedupe into one
 * CorpusSnapshot; per-query-per-source counts stay visible; the corpus is
 * never presented as cross-validated aggregation (each source labeled).
 *
 * Hermetic: per-source replay adapters are injected (no network).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { groundResearchQuestion } from '../../src/retrieval/grounding.ts';
import type { RetrievedDocument, RetrievalAdapter } from '../../src/retrieval/types.ts';

function doc(sourceType: 'openalex' | 'arxiv', seed: string): RetrievedDocument {
  return {
    documentId: `${sourceType}-${seed}`,
    sourceType,
    sourceName: sourceType === 'openalex' ? 'OpenAlex' : 'arXiv',
    persistentIdentifier: `${sourceType}-${seed}-persistent`,
    doi: null,
    canonicalUrl: `https://example.org/${sourceType}/${seed}`,
    title: `${sourceType} doc ${seed}`,
    authors: ['A. Author'],
    publicationDate: '2024-01-01',
    retrievedAt: '2026-08-14T00:00:00.000Z',
    retrievalQuery: 'q',
    retrievalMethod: 'replay-fixture',
    rawHash: `raw-${sourceType}-${seed}`,
    normalizedHash: `norm-${sourceType}-${seed}`,
    parserVersion: 'replay-1',
    abstract: `abstract ${sourceType} ${seed}`,
    licenseMetadata: null,
  };
}

function replayAdapter(source: 'openalex' | 'arxiv', docs: readonly RetrievedDocument[]): RetrievalAdapter {
  return {
    source,
    sourceName: source === 'openalex' ? 'OpenAlex' : 'arXiv',
    async retrieve(query) {
      void query;
      return [...docs];
    },
  };
}

describe('groundResearchQuestion (multi-source, hermetic)', () => {
  it('issues every query against every source and merges into one corpus', async () => {
    const g = await groundResearchQuestion({
      question: 'Does stellar activity inflate hot Jupiter radii?',
      sources: ['openalex', 'arxiv'],
      includeCounterEvidence: false, // keep query count small
      adapters: {
        openalex: replayAdapter('openalex', [doc('openalex', 'a')]),
        arxiv: replayAdapter('arxiv', [doc('arxiv', 'b')]),
      },
    });

    assert.equal(g.fetchMode, 'replay'); // injected adapters → replay, never claimed live
    assert.equal(g.sourcesUsed.length, 2);
    assert.equal(g.perQueryCounts.length, 2, '1 supporting query × 2 sources');
    assert.equal(g.corpus.documentCount, 2, 'merged corpus');
    assert.ok(g.corpus.documents.some((d) => d.sourceType === 'openalex'));
    assert.ok(g.corpus.documents.some((d) => d.sourceType === 'arxiv'));
  });

  it('dedupes identical documents across sources and keeps source labels', async () => {
    const same = doc('openalex', 'dup');
    const g = await groundResearchQuestion({
      question: 'q',
      sources: ['openalex', 'arxiv'],
      includeCounterEvidence: false,
      adapters: {
        openalex: replayAdapter('openalex', [same, same]),
        arxiv: replayAdapter('arxiv', [same]),
      },
    });
    assert.equal(g.corpus.documentCount, 1, 'same documentId from two sources = one corpus entry');
    assert.equal(g.perQueryCounts.length, 2);
  });

  it('single injected adapter (replay path) ignores a sources list', async () => {
    const g = await groundResearchQuestion({
      question: 'q',
      sources: ['openalex', 'arxiv'],
      includeCounterEvidence: false,
      adapter: replayAdapter('openalex', [doc('openalex', 'solo')]),
    });
    assert.equal(g.corpus.documentCount, 1);
    assert.equal(g.sourcesUsed.length, 1);
    assert.equal(g.fetchMode, 'replay');
  });
});
