import { describe, expect, it } from 'vitest';
import {
  aggregate,
  compareReports,
  computeRunMetrics,
  ndcgAtK,
} from '../eval/retrieval-baseline.mjs';

/** Hand-built fixture mirroring persisted object shapes (corpus_snapshot / source_document / receipt). */
const snapshot = {
  id: 'corp_test',
  runId: 'run_test',
  queries: [
    { purpose: 'counter_evidence', text: 'EGFR resistance failed replication', family: 'openalex' },
    { purpose: 'counter_evidence', text: 'EGFR resistance critique', family: 'arxiv' },
    { purpose: 'discovery', text: 'EGFR resistance mechanisms', family: 'openalex' },
    { purpose: 'discovery', text: 'EGFR resistance mechanisms', family: 'arxiv' },
    { purpose: 'discovery', text: 'EGFR resistance mechanisms', family: 'crossref' },
    { purpose: 'supporting', text: 'EGFR T790M resistance', family: 'openalex' },
  ],
  documentIds: ['src1', 'src2', 'src3'],
  createdAt: '2026-08-22T00:00:00.000Z',
  familyFailures: [],
  fusion: { algorithm: 'rrf-k60+llm-listwise-rerank-v1', poolSize: 13, rerankApplied: true, counterSeatsKept: 4 },
} as const;

const docs = [
  {
    id: 'src1', runId: 'run_test', family: 'openalex',
    identifiers: [{ kind: 'doi', value: '10.1/a' }],
    title: 'Doc One', publicationYear: 2020, parseStatus: 'ok', abstractText: 'alpha beta',
    verification: { resolved: true, titleMatch: true, method: 'crossref_doi' },
  },
  {
    id: 'src2', runId: 'run_test', family: 'arxiv',
    identifiers: [{ kind: 'arxiv', value: '2401.00001' }],
    title: 'Doc Two', publicationYear: 2018, parseStatus: 'partial',
    verification: { resolved: false, titleMatch: false, method: 'arxiv_id', detail: 'not found' },
  },
  {
    id: 'src3', runId: 'run_test', family: 'openalex',
    identifiers: [{ kind: 'openalex', value: 'W1' }],
    title: 'Doc Three', parseStatus: 'ok', abstractText: 'gamma',
    // no verification yet -> pendingOrError
  },
] as Array<Record<string, unknown>>;

const receipts = [
  { kind: 'source_retrieval', stage: 'retrieve', sourceRetrieval: { family: 'openalex', query: 'EGFR resistance failed replication', httpStatus: 200, resultCount: 6 } },
  { kind: 'source_retrieval', stage: 'retrieve', sourceRetrieval: { family: 'arxiv', query: 'EGFR resistance critique', httpStatus: 200, resultCount: 0 } },
  { kind: 'source_retrieval', stage: 'retrieve', sourceRetrieval: { family: 'openalex', query: 'EGFR resistance mechanisms', httpStatus: 200, resultCount: 5 } },
  { kind: 'source_retrieval', stage: 'retrieve', sourceRetrieval: { family: 'arxiv', query: 'EGFR resistance mechanisms', httpStatus: 200, resultCount: 0 } },
  { kind: 'source_retrieval', stage: 'retrieve', sourceRetrieval: { family: 'crossref', query: 'EGFR resistance mechanisms', httpStatus: 429, resultCount: 0 } },
  { kind: 'source_retrieval', stage: 'retrieve', sourceRetrieval: { family: 'openalex', query: 'EGFR T790M resistance', httpStatus: 200, resultCount: 2 } },
] as Array<Record<string, unknown>>;

describe('retrieval-baseline: per-run deterministic metrics', () => {
  const m = computeRunMetrics(snapshot as never, docs, receipts as never);

  it('replays the plan shape and the R-05 counter vocabulary gate', () => {
    expect(m.plan.queryTotal).toBe(6);
    expect(m.plan.byPurpose).toEqual({ discovery: 3, supporting: 1, counter_evidence: 2 });
    expect(m.plan.byFamily).toEqual({ openalex: 3, arxiv: 2, crossref: 1 });
    expect(m.plan.counterGatePass).toBe(true);
  });

  it('counts zero-result and failed searches, including counter-search emptiness', () => {
    expect(m.searches.attempted).toBe(6);
    expect(m.searches.ok).toBe(5);
    expect(m.searches.failed).toBe(1);
    expect(m.searches.zeroResult).toBe(2);
    expect(m.searches.zeroResultRate).toBeCloseTo(0.4, 6);
    // counter[1] went to arxiv and returned nothing -> 1 empty counter search
    expect(m.searches.counterOk).toBe(2);
    expect(m.searches.counterZero).toBe(1);
    expect(m.searches.totalResultCount).toBe(13);
  });

  it('computes pool yield as poolSize / raw results', () => {
    expect(m.pool.poolSize).toBe(13);
    expect(m.pool.poolYield).toBeCloseTo(1, 6);
    expect(m.pool.rerankApplied).toBe(true);
    expect(m.pool.counterSeatsKept).toBe(4);
  });

  it('measures corpus coverage, resolvability ceiling, family share, year median', () => {
    expect(m.corpus.size).toBe(3);
    expect(m.corpus.abstractCoverage).toBeCloseTo(2 / 3, 4);
    expect(m.corpus.parseOk).toBeCloseTo(2 / 3, 4);
    // src3 carries only an openalex id -> NOT doi/arxiv resolvable
    expect(m.corpus.identifierResolvability).toBeCloseTo(2 / 3, 4);
    expect(m.corpus.familyShare.arxiv).toBeCloseTo(1 / 3, 4);
    expect(m.corpus.familyShare.crossref).toBe(0);
    expect(m.corpus.yearMedian).toBe(2020);
    expect(m.corpus.distinctKeys).toBe(3);
  });

  it('replays verification outcomes incl. the BEIR-hole analogue', () => {
    expect(m.verification.checked).toBe(2);
    expect(m.verification.resolved).toBe(1);
    expect(m.verification.resolvedRate).toBeCloseTo(1 / 3, 4);
    expect(m.verification.titleMatchRate).toBe(1);
    expect(m.verification.notFound).toBe(1);
    expect(m.verification.pendingOrError).toBe(1);
    // hole = share of corpus without resolved verification = 2/3
    expect(m.verification.holeRate).toBeCloseTo(2 / 3, 4);
  });
});

describe('retrieval-baseline: nDCG (trec_eval linear-gain formula)', () => {
  const qrels: Record<string, number> = { a: 3, b: 2, c: 1 };

  it('returns 1 for the ideal order and 0 without relevant docs', () => {
    expect(ndcgAtK(['a', 'b', 'c'], qrels, 3)).toBeCloseTo(1, 10);
    expect(ndcgAtK(['a', 'b', 'c'], qrels, 10)).toBeCloseTo(1, 10);
    expect(ndcgAtK(['x', 'y'], {}, 2)).toBe(0);
    expect(ndcgAtK(['x', 'y'], qrels, 2)).toBe(0);
  });

  it('returns the hand-computed value for a reversed ranking', () => {
    // DCG(c,b,a) = 1/log2(2) + 2/log2(3) + 3/log2(4) = 3.76186…
    // IDCG(a,b,c) = 3/log2(2) + 2/log2(3) + 1/log2(4) = 4.76186…
    // ratio = 3.76186…/4.76186… = 0.7899980…
    expect(ndcgAtK(['c', 'b', 'a'], qrels, 3)).toBeCloseTo(0.789998, 5);
  });

  it('discounts late hits below early ones at the same gain', () => {
    // DCG(x,a) = 3/log2(3) = 1.892789…; IDCG@2 = 3/1 + 2/log2(3) = 4.261860…
    // ratio = 0.4441228…  vs  early hit (a,x): 3/4.261860… = 0.7039181…
    expect(ndcgAtK(['x', 'a'], qrels, 2)).toBeCloseTo(0.444123, 5);
    expect(ndcgAtK(['a', 'x'], qrels, 2)).toBeCloseTo(0.703918, 5);
    expect(ndcgAtK(['x', 'a'], qrels, 2)).toBeLessThan(ndcgAtK(['a', 'x'], qrels, 2));
  });
});

describe('retrieval-baseline: guarded before/after comparison', () => {
  const report = (resolvedRate: number, zeroRate: number, counterZero: number, holeRate: number) => {
    const run = {
      runId: 'r', snapshotCreatedAt: 't',
      plan: { counterGatePass: true },
      searches: { zeroResultRate: zeroRate, counterZero },
      pool: { counterSeatsKept: 4, poolSize: 20, poolYield: 0.5, rerankApplied: true },
      corpus: { size: 12, abstractCoverage: 0.9, identifierResolvability: 1, truncated: true, yearMedian: 2020 },
      verification: { resolvedRate, holeRate, resolved: 11, titleMatchRate: 1, checked: 12 },
    };
    return { meta: { db: 'x' }, aggregate: aggregate([run] as never), runs: [run] };
  };

  it('flags a guarded regression (verify-rate drop) and exits non-zero semantics', () => {
    const before = report(0.99, 0.4, 1, 0.01);
    const after = report(0.9, 0.4, 1, 0.1);
    const cmp = compareReports(before as never, after as never);
    expect(cmp.verdict).toBe('HAS_REGRESSIONS');
    expect(cmp.rows.filter((r) => r.verdict === 'REGRESSION').map((r) => r.metric)).toEqual(
      expect.arrayContaining(['verification.resolvedRate', 'verification.holeRate']),
    );
    expect(cmp.counterSeatsFloorHeld).toBe(true);
  });

  it('passes with zero guarded regression when metrics hold or improve', () => {
    const before = report(0.9, 0.4, 1, 0.1);
    const after = report(0.95, 0.2, 0, 0.05);
    const cmp = compareReports(before as never, after as never);
    expect(cmp.verdict).toBe('ZERO_GUARDED_REGRESSION');
    expect(cmp.regressionCount).toBe(0);
  });
});
