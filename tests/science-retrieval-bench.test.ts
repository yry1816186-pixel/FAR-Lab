import { describe, expect, it } from 'vitest';
import { fusedOrder, selectFinal, type PoolEntry } from '../src/pipeline/stages/retrieve.js';
import type { RawSourceRecord } from '../src/shared/ports.js';

/**
 * SCIENCE lane benchmark (2026-08-24) — offline multi-domain qrels retrieval suite.
 *
 * Deterministic fixtures across three disciplines; graded gold relevance (0..3);
 * metrics: nDCG@10 (formula parity with eval/retrieval-baseline.mjs ndcgAtK) and
 * the counter-evidence seat floor. PURPOSE: every future change to RRF fusion /
 * pool selection / quota logic gets a zero-API, before/after gold-standard check
 * instead of relying on live-run self-reports.
 */

const doc = (
  key: string, title: string, abstract: string, family: PoolEntry['family'],
): RawSourceRecord => ({
  identifiers: [{ kind: 'doi', value: `10.9/${key}` }],
  title,
  abstractText: abstract,
  contentDepth: 'abstract',
  accessState: 'open',
  publicationYear: 2024,
  ...(family === 'openalex' ? { normalized: {} } : {}),
});

const entry = (
  key: string, title: string, abstract: string, family: PoolEntry['family'],
  ranks: { target: number; rank: number }[],
  counter = false,
): PoolEntry => ({
  key: `doi:10.9/${key}`,
  record: doc(key, title, abstract, family),
  family,
  firstSeen: ranks[0]?.target ?? 0,
  purposes: new Set(counter ? (['counter_evidence'] as const) : (['discovery'] as const)),
  ranks,
});

/** nDCG@k with log2 discount — same formula family as eval/retrieval-baseline.mjs. */
const ndcgAtK = (rankedKeys: readonly string[], qrels: Record<string, number>, k: number): number => {
  const dcg = rankedKeys.slice(0, k).reduce((acc, key, i) => acc + (qrels[key] ?? 0) / Math.log2(i + 2), 0);
  const ideal = Object.values(qrels).sort((a, b) => b - a).slice(0, k)
    .reduce((acc, g, i) => acc + g / Math.log2(i + 2), 0);
  return ideal > 0 ? dcg / ideal : 0;
};

/** nDCG of a SINGLE list (rank order within target t), for the fusion-vs-single comparison. */
const singleListOrder = (pool: readonly PoolEntry[], t: number): string[] =>
  pool
    .filter((e) => e.ranks.some((r) => r.target === t))
    .sort((a, b) => (a.ranks.find((r) => r.target === t)!.rank) - (b.ranks.find((r) => r.target === t)!.rank))
    .map((e) => e.key);

describe('qrels retrieval benchmark — biomed (IL-6 blockade in sepsis)', () => {
  // gold: 3 = directly answers, 2 = closely relevant, 1 = background, 0 = noise
  const qrels: Record<string, number> = {
    'doi:10.9/b1': 3, 'doi:10.9/b2': 3, 'doi:10.9/b3': 2, 'doi:10.9/b4': 2,
    'doi:10.9/b5': 1, 'doi:10.9/b6': 1, 'doi:10.9/b7': 0, 'doi:10.9/b8': 0, 'doi:10.9/b9': 0,
  };
  const pool: PoolEntry[] = [
    entry('b1', 'Tocilizumab mortality sepsis RCT', 'IL-6 blockade trial', 'openalex', [{ target: 0, rank: 1 }]),
    entry('b2', 'IL-6 receptor blockade septic shock outcome', 'randomized mortality endpoint', 'europepmc', [{ target: 1, rank: 2 }]),
    entry('b3', 'Cytokine adsorption in sepsis meta-analysis', 'pooled mortality IL-6 axis', 'openalex', [{ target: 0, rank: 2 }, { target: 1, rank: 3 }]),
    entry('b4', 'Sarisilimab phase II sepsis', 'anti-IL-6 trial results', 'crossref', [{ target: 2, rank: 1 }]),
    entry('b5', 'Inflammation biomarkers review', 'broad sepsis immunology', 'openalex', [{ target: 0, rank: 4 }]),
    entry('b6', 'Sepsis bundle timing study', 'general sepsis care', 'europepmc', [{ target: 1, rank: 1 }]),
    entry('b7', 'IL-6 in rheumatoid arthritis', 'different disease entirely', 'crossref', [{ target: 2, rank: 2 }]),
    entry('b8', 'Machine learning sepsis prediction', 'unrelated method angle', 'openalex', [{ target: 0, rank: 3 }]),
    entry('b9', 'Gut microbiome sepsis review', 'adjacent but off-target', 'europepmc', [{ target: 1, rank: 4 }]),
  ];

  it('RRF fusion beats or matches EVERY single source list on nDCG@10 (no regression window)', () => {
    const fused = fusedOrder(pool).map((e) => e.key);
    const fusedScore = ndcgAtK(fused, qrels, 10);
    for (const t of [0, 1, 2]) {
      const single = ndcgAtK(singleListOrder(pool, t), qrels, 10);
      expect(fusedScore, `fusion vs single list target ${t}`).toBeGreaterThanOrEqual(single - 1e-9);
    }
    expect(fusedScore).toBeGreaterThan(0.8); // fusion should land the top graded docs up front
  });

  it('fusion is deterministic: identical pool -> byte-identical order', () => {
    expect(fusedOrder(pool).map((e) => e.key)).toEqual(fusedOrder(pool).map((e) => e.key));
  });
});

describe('qrels retrieval benchmark — ML (scaling laws)', () => {
  const qrels: Record<string, number> = {
    'doi:10.9/m1': 3, 'doi:10.9/m2': 2, 'doi:10.9/m3': 3, 'doi:10.9/m4': 1,
    'doi:10.9/m5': 0, 'doi:10.9/m6': 0,
  };
  const pool: PoolEntry[] = [
    entry('m1', 'Chinchilla scaling laws compute-optimal LLMs', 'parameter-token tradeoff laws', 'arxiv', [{ target: 0, rank: 2 }]),
    entry('m2', 'Emergent abilities milestone models', 'scale-driven capability jumps', 'openalex', [{ target: 1, rank: 1 }]),
    entry('m3', 'Scaling laws for neural language models', 'Kaplan power laws', 'arxiv', [{ target: 0, rank: 1 }, { target: 1, rank: 2 }]),
    entry('m4', 'Data scaling ablations vision transformers', 'cross-domain scaling', 'crossref', [{ target: 2, rank: 1 }]),
    entry('m5', 'Attention is all you need', 'architecture not scaling', 'arxiv', [{ target: 0, rank: 3 }]),
    entry('m6', 'RLHF preferences overview', 'alignment not scaling', 'openalex', [{ target: 1, rank: 3 }]),
  ];

  it('fusion >= every single list; cross-list corroboration (2 lists) outranks single-list hits', () => {
    const fused = fusedOrder(pool).map((e) => e.key);
    const fusedScore = ndcgAtK(fused, qrels, 10);
    for (const t of [0, 1, 2]) {
      expect(fusedScore).toBeGreaterThanOrEqual(ndcgAtK(singleListOrder(pool, t), qrels, 10) - 1e-9);
    }
    // m3 (graded 3, appears in BOTH lists) must fuse above m2 (graded 2, one list, rank 1)
    expect(fused.indexOf('doi:10.9/m3')).toBeLessThan(fused.indexOf('doi:10.9/m2'));
  });
});

describe('counter-evidence seat floor — negative results are not buried (bias control)', () => {
  it('selectFinal keeps counter-origin docs inside the cap even when the fused rank would drop them', () => {
    // 8 supporting docs all ranked ABOVE the one counter (failed replication) doc
    const pool: PoolEntry[] = [
      entry('s1', 'Supporting study A', 'positive finding', 'openalex', [{ target: 0, rank: 1 }]),
      entry('s2', 'Supporting study B', 'positive finding', 'openalex', [{ target: 0, rank: 2 }]),
      entry('s3', 'Supporting study C', 'positive finding', 'openalex', [{ target: 0, rank: 3 }]),
      entry('s4', 'Supporting study D', 'positive finding', 'openalex', [{ target: 0, rank: 4 }]),
      entry('s5', 'Supporting study E', 'positive finding', 'openalex', [{ target: 0, rank: 5 }]),
      entry('s6', 'Supporting study F', 'positive finding', 'openalex', [{ target: 0, rank: 6 }]),
      entry('c1', 'Failed replication of the effect', 'null result, rigorous n=400', 'europepmc', [{ target: 1, rank: 9 }], true),
    ];
    const ordered = fusedOrder(pool);
    // WITHOUT the quota, cap=6 over the fused order drops the counter doc (rank 7)
    const plain = ordered.slice(0, 6).map((e) => e.key);
    expect(plain).not.toContain('doi:10.9/c1');
    // WITH the floor (min 1 of 6), the lowest-ranked supporting doc is swapped out
    const floored = selectFinal(ordered, 6, 1).map((e) => e.key);
    expect(floored).toContain('doi:10.9/c1');
    expect(floored).toHaveLength(6);
    // deterministic
    expect(selectFinal(ordered, 6, 1).map((e) => e.key)).toEqual(floored);
  });
});
