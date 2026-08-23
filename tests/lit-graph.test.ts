import { describe, expect, it } from 'vitest';
import { buildLitGraph, DEFAULT_GRAPH_OPTIONS } from '../web/src/utils/lit-graph';
import type { ZoteroLibItem } from '../web/src/api/types';

const item = (key: string, over: Partial<ZoteroLibItem> = {}): ZoteroLibItem => ({
  key,
  title: `论文 ${key}`,
  itemType: 'journalArticle',
  creators: [],
  tags: [],
  collections: [],
  relatedKeys: [],
  ...over,
});

const opts = (over: Partial<Parameters<typeof buildLitGraph>[1]> = {}): Parameters<typeof buildLitGraph>[1] => ({
  ...DEFAULT_GRAPH_OPTIONS,
  minWeight: 0, // tests assert on raw structure unless testing the filter
  ...over,
});

const edgeBetween = (graph: ReturnType<typeof buildLitGraph>, a: string, b: string) =>
  graph.edges.find((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));

describe('buildLitGraph', () => {
  it('links items via shared tags and weighs rare tags higher than common ones', () => {
    // rare tag shared by 2; common tag shared by all 4
    const items = [
      item('A', { tags: ['罕见主题', '常见主题'] }),
      item('B', { tags: ['罕见主题', '常见主题'] }),
      item('C', { tags: ['常见主题'] }),
      item('D', { tags: ['常见主题'] }),
    ];
    const g = buildLitGraph(items, opts());
    const rare = edgeBetween(g, 'A', 'B');
    const common = edgeBetween(g, 'C', 'D');
    expect(rare?.tags).toBe(true);
    expect(common?.tags).toBe(true);
    // rare pair weight = rare(1/sqrt2≈0.707) + common(1/2) ; common pair = 0.5 only
    expect(rare!.weight).toBeGreaterThan(common!.weight);
    expect(rare!.weight).toBeCloseTo(1 / Math.sqrt(2) + 0.5, 3);
  });

  it('links co-authored items and dedupes reciprocal related links into one edge', () => {
    const items = [
      item('A', { creators: ['张三'], relatedKeys: ['B'] }),
      item('B', { creators: ['张三', '李四'], relatedKeys: ['A'] }),
      item('C', { creators: ['李四'] }),
    ];
    const g = buildLitGraph(items, opts());
    const ab = edgeBetween(g, 'A', 'B');
    expect(ab).toBeDefined();
    expect(ab?.related).toBe(true);
    expect(ab?.authors).toBe(true);
    expect(ab?.weight).toBeCloseTo(3 + 1.2, 3);
    expect(edgeBetween(g, 'B', 'C')?.authors).toBe(true);
    // exactly one undirected A-B edge despite reciprocal relatedKeys
    expect(g.edges.filter((e) => edgeKeyMatches(e, 'A', 'B')).length).toBe(1);
  });

  it('drops dangling relation targets (related key not in library)', () => {
    const g = buildLitGraph([item('A', { relatedKeys: ['ZZZZ9999'] })], opts());
    expect(g.edges.length).toBe(0);
    expect(g.nodes[0]?.degree).toBe(0);
  });

  it('respects option toggles and the minWeight filter', () => {
    const items = [
      item('A', { tags: ['共享'], creators: ['张三'] }),
      item('B', { tags: ['共享'], creators: ['张三'] }),
    ];
    // only the tag edge remains; 1/sqrt(2)≈0.707 < 0.8 -> filtered out entirely
    const tagOnly = buildLitGraph(items, opts({ enableAuthors: false, enableRelated: false, minWeight: 0.8 }));
    expect(tagOnly.edges.length).toBe(0);
    // below-threshold cutoff of 0.7 keeps it
    const tagOnlyKept = buildLitGraph(items, opts({ enableAuthors: false, enableRelated: false, minWeight: 0.7 }));
    expect(tagOnlyKept.edges.length).toBe(1);
  });

  it('minWeight filter drops weak edges but stronger combos survive', () => {
    const items = [
      item('A', { tags: ['共享'], creators: ['张三'], relatedKeys: ['B'] }),
      item('B', { tags: ['共享'], creators: ['张三'] }),
      item('C', { tags: ['弱关联'] }),
      item('D', { tags: ['弱关联'] }),
    ];
    const g = buildLitGraph(items, opts({ minWeight: 1.5 }));
    expect(edgeBetween(g, 'A', 'B')).toBeDefined();
    expect(edgeBetween(g, 'C', 'D')).toBeUndefined();
  });

  it('assigns each node its rarest tag as theme and colors only the top clusters', () => {
    const items = [
      item('A', { tags: ['主题甲', '大众'] }),
      item('B', { tags: ['主题甲', '大众'] }),
      item('C', { tags: ['主题乙', '大众'] }),
    ];
    const g = buildLitGraph(items, opts());
    const byKey = new Map(g.nodes.map((n) => [n.key, n]));
    expect(byKey.get('A')?.theme).toBe('主题甲'); // rarer than 大众 (freq 2 vs 3)
    expect(g.themeColors.has('主题甲')).toBe(true);
    expect(g.themeColors.has('主题乙')).toBe(true);
    expect([...g.themeColors.values()].every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
  });

  it('skips hyper-common groups that would form a clique (MAX_GROUP_SIZE guard)', () => {
    const many = Array.from({ length: 80 }, (_, i) => item(`N${i}`, { tags: ['巨型标签'] }));
    const g = buildLitGraph(many, opts());
    expect(g.edges.length).toBe(0); // 80-member tag group contributes nothing
    expect(g.nodes.length).toBe(80);
  });
});

const edgeKeyMatches = (e: { source: string; target: string }, a: string, b: string): boolean =>
  (e.source === a && e.target === b) || (e.source === b && e.target === a);
