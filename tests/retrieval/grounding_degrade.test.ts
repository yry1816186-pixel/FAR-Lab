/**
 * tests/retrieval/grounding_degrade.test.ts — source-failure policy (R4,
 * directive §7 --degrade-on-source-failure): default fail-closed, opt-in
 * degradation with a visible receipt, and never-total degradation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { groundResearchQuestion } from '../../src/retrieval/grounding.ts';
import type { RetrievalAdapter, RetrievalQuery } from '../../src/retrieval/types.ts';
import { RESEARCH_DEMO_DOCS } from '../../src/research/research_fixtures.ts';

const QUESTION = 'Does stellar activity inflate hot Jupiter radii?';

const okAdapter = (source: 'openalex' | 'arxiv'): RetrievalAdapter => ({
  source,
  sourceName: source,
  async retrieve(_query: RetrievalQuery) {
    return RESEARCH_DEMO_DOCS;
  },
});

const failingAdapter = (source: 'openalex' | 'arxiv', message: string): RetrievalAdapter => ({
  source,
  sourceName: source,
  async retrieve(_query: RetrievalQuery) {
    throw new Error(message);
  },
});

describe('grounding source-failure policy (R4)', () => {
  it('DEFAULT: a source failure rejects the whole grounding (fail-closed, unchanged)', async () => {
    await assert.rejects(
      () =>
        groundResearchQuestion({
          question: QUESTION,
          sources: ['openalex', 'arxiv'],
          adapters: {
            openalex: okAdapter('openalex'),
            arxiv: failingAdapter('arxiv', 'arxiv is down'),
          },
        }),
      /arxiv is down/,
    );
  });

  it("DEGRADE: a failed family is dropped WITH a receipt; the corpus grounds on survivors", async () => {
    const grounded = await groundResearchQuestion({
      question: QUESTION,
      sources: ['openalex', 'arxiv'],
      onSourceFailure: 'degrade',
      adapters: {
        openalex: okAdapter('openalex'),
        arxiv: failingAdapter('arxiv', 'retrieval/http: non-2xx status 429 from https://export.arxiv.org/api/query'),
      },
    });
    // The failure is visible, never silent.
    assert.ok(grounded.failedSources !== undefined && grounded.failedSources.length === 1);
    const failure = grounded.failedSources[0]!;
    assert.equal(failure.source, 'arxiv:replay');
    assert.match(failure.error, /non-2xx status 429/);
    // The corpus honestly reflects only the surviving family.
    assert.ok(grounded.sourcesUsed.every((s) => !s.startsWith('arxiv')));
    assert.ok(grounded.corpus.documentCount > 0);
    assert.equal(grounded.cacheHits, 0);
  });

  it('DEGRADE is never total: every family failing still rejects', async () => {
    await assert.rejects(
      () =>
        groundResearchQuestion({
          question: QUESTION,
          sources: ['openalex', 'arxiv'],
          onSourceFailure: 'degrade',
          adapters: {
            openalex: failingAdapter('openalex', 'openalex budget exhausted'),
            arxiv: failingAdapter('arxiv', 'arxiv down'),
          },
        }),
      /every source family failed.*openalex budget exhausted.*arxiv down/,
    );
  });

  it('cacheHits counts replayed documents (honest cache accounting)', async () => {
    const cachedDocs = RESEARCH_DEMO_DOCS.map((d) => ({ ...d, retrievedFrom: 'cache' as const }));
    const cachedAdapter: RetrievalAdapter = {
      source: 'openalex',
      sourceName: 'OpenAlex',
      async retrieve() {
        return cachedDocs;
      },
    };
    const grounded = await groundResearchQuestion({
      question: QUESTION,
      includeCounterEvidence: false,
      adapter: cachedAdapter,
    });
    assert.ok(grounded.cacheHits !== undefined && grounded.cacheHits > 0);
    assert.ok(grounded.corpus.documents.every((d) => d.retrievedFrom === 'cache'));
  });
});
