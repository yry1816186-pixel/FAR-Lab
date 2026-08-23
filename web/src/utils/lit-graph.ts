/**
 * Literature-relation graph (pure, deterministic): builds a node/edge network
 * from a Zotero library snapshot, mirroring what Zotero relation plugins
 * infer locally — explicit "related" links, shared keyword tags (rare tags
 * weigh more, IDF-style), and shared authors. No AI/network calls anywhere:
 * the structure is fully derivable from the library itself.
 */

import type { ZoteroLibItem } from '../api/types';

export interface LitNode {
  key: string;
  title: string;
  itemType: string;
  year?: number;
  creators: string[];
  doi?: string;
  url?: string;
  tags: string[];
  /** Sum of incident edge weights (after option filtering). */
  degree: number;
  /** The node's most distinctive tag (highest IDF) — its theme cluster. */
  theme?: string;
}

export interface LitEdge {
  source: string;
  target: string;
  related: boolean;
  tags: boolean;
  authors: boolean;
  weight: number;
}

export interface LitGraph {
  nodes: LitNode[];
  edges: LitEdge[];
  /** Cluster tag -> assigned palette color ("#rrggbb"), top themes only. */
  themeColors: Map<string, string>;
}

export interface GraphOptions {
  enableRelated: boolean;
  enableTags: boolean;
  enableAuthors: boolean;
  /** Drop undirected pairs whose combined weight is below this. */
  minWeight: number;
}

/** Default 0.4 — calibrated on a real 329-item library: 0.8 left only 62 links (a near-empty graph). */
export const DEFAULT_GRAPH_OPTIONS: GraphOptions = { enableRelated: true, enableTags: true, enableAuthors: true, minWeight: 0.4 };

/** Groups larger than this cannot discriminate (a clique would drown the graph). */
const MAX_GROUP_SIZE = 60;
/** Palette for the top theme clusters (deterministic order). */
const PALETTE = ['#2d78bd', '#c2571f', '#3d8b5f', '#8e5aa8', '#b3352c', '#0f7c8c', '#a86b1d', '#5a6fc0'];

const edgeKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

interface EdgeAcc {
  source: string;
  target: string;
  weight: number;
  related: boolean;
  tags: boolean;
  authors: boolean;
}

const addWeight = (acc: Map<string, EdgeAcc>, a: string, b: string, w: number, kind: 'related' | 'tags' | 'authors'): void => {
  const k = edgeKey(a, b);
  const e = acc.get(k) ?? {
    source: a < b ? a : b,
    target: a < b ? b : a,
    weight: 0,
    related: false,
    tags: false,
    authors: false,
  };
  e.weight += w;
  e[kind] = true;
  acc.set(k, e);
};

/** Each tag contributes 1/sqrt(#items sharing it): rare tags dominate (soft IDF). */
const tagWeight = (groupSize: number): number => 1 / Math.sqrt(groupSize);
const AUTHOR_WEIGHT = 1.2;
const RELATED_WEIGHT = 3;

export function buildLitGraph(items: ZoteroLibItem[], opts: GraphOptions): LitGraph {
  const byKey = new Map(items.map((i) => [i.key, i]));

  // index: tag -> members, author -> members (edges emerge from shared groups)
  const tagGroups = new Map<string, ZoteroLibItem[]>();
  const authorGroups = new Map<string, ZoteroLibItem[]>();
  for (const item of items) {
    for (const tag of item.tags) {
      const list = tagGroups.get(tag) ?? [];
      list.push(item);
      tagGroups.set(tag, list);
    }
    for (const creator of item.creators) {
      const list = authorGroups.get(creator) ?? [];
      list.push(item);
      authorGroups.set(creator, list);
    }
  }

  const acc = new Map<string, EdgeAcc>();
  if (opts.enableRelated) {
    // Zotero stores related links on both items — dedupe into one undirected edge.
    const seen = new Set<string>();
    for (const item of items) {
      for (const other of item.relatedKeys) {
        if (other === item.key || !byKey.has(other)) continue;
        const k = edgeKey(item.key, other);
        if (seen.has(k)) continue;
        seen.add(k);
        addWeight(acc, item.key, other, RELATED_WEIGHT, 'related');
      }
    }
  }
  if (opts.enableTags) {
    for (const members of tagGroups.values()) {
      if (members.length < 2 || members.length > MAX_GROUP_SIZE) continue;
      const w = tagWeight(members.length);
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) addWeight(acc, members[i]!.key, members[j]!.key, w, 'tags');
      }
    }
  }
  if (opts.enableAuthors) {
    for (const members of authorGroups.values()) {
      if (members.length < 2 || members.length > MAX_GROUP_SIZE) continue;
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) addWeight(acc, members[i]!.key, members[j]!.key, AUTHOR_WEIGHT, 'authors');
      }
    }
  }

  const edges: LitEdge[] = [...acc.values()]
    .filter((e) => e.weight >= opts.minWeight)
    .map((e) => ({ ...e, weight: Math.round(e.weight * 1000) / 1000 }));

  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + e.weight);
    degree.set(e.target, (degree.get(e.target) ?? 0) + e.weight);
  }

  // theme = the node's highest-IDF tag (its rarest, most distinctive keyword)
  const idf = (tag: string): number => Math.log(items.length / (tagGroups.get(tag)?.length ?? 1));
  const nodes: LitNode[] = items.map((item) => {
    let theme: string | undefined;
    let best = -Infinity;
    for (const tag of item.tags) {
      const score = idf(tag);
      if (score > best) { best = score; theme = tag; }
    }
    return {
      key: item.key,
      title: item.title,
      itemType: item.itemType,
      ...(item.year !== undefined ? { year: item.year } : {}),
      creators: item.creators,
      ...(item.doi !== undefined ? { doi: item.doi } : {}),
      ...(item.url !== undefined ? { url: item.url } : {}),
      tags: item.tags,
      degree: Math.round((degree.get(item.key) ?? 0) * 1000) / 1000,
      ...(theme !== undefined ? { theme } : {}),
    };
  });

  // Palette goes to the themes covering the most nodes (ties: tag name order — deterministic).
  const themeSize = new Map<string, number>();
  for (const node of nodes) {
    if (node.theme !== undefined) themeSize.set(node.theme, (themeSize.get(node.theme) ?? 0) + 1);
  }
  const ranked = [...themeSize.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const themeColors = new Map<string, string>();
  ranked.forEach(([tag], i) => { if (i < PALETTE.length) themeColors.set(tag, PALETTE[i]!); });
  return { nodes, edges, themeColors };
}
