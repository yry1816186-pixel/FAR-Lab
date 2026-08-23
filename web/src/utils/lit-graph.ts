/**
 * Literature relation graph (ZoteroPanel graph view): builds a force-graph from
 * the unified library items. Edges = shared keywords / co-authors / Zotero
 * "related" links; node theme = most frequent keyword (drives the legend).
 * Pure functions — no DOM, fully unit-testable.
 */
import type { ZoteroLibItem } from '../api/types';

export interface GraphOptions {
  enableRelated: boolean;
  enableTags: boolean;
  enableAuthors: boolean;
  /** Drop edges below this weight (0 keeps everything). */
  minWeight: number;
}

export const DEFAULT_GRAPH_OPTIONS: GraphOptions = {
  enableRelated: true,
  enableTags: true,
  enableAuthors: true,
  minWeight: 0.5,
};

export interface LitGraphNode {
  key: string;
  title: string;
  year?: number;
  creators: string[];
  tags: string[];
  /** Number of surviving edges — drives node radius and the side panel. */
  degree: number;
  /** Most frequent tag (legend color bucket); undefined for untagged nodes. */
  theme?: string;
}

export interface LitGraphEdge {
  source: string;
  target: string;
  /** Additive strength: shared-tag 1 each + shared-author 1 each + related 1.5. */
  weight: number;
  /** True when at least part of the weight comes from a Zotero "related" link. */
  related: boolean;
}

export interface LitGraph {
  nodes: LitGraphNode[];
  edges: LitGraphEdge[];
  /** Theme label -> legend color, stable order by frequency then name. */
  themeColors: Map<string, string>;
}

const LEGEND_COLORS = [
  '#3d7dd8', '#c94f4f', '#2f9e6e', '#b8860b', '#8a5fc2',
  '#d97a29', '#2e9aa8', '#c2477f', '#6b8e23', '#708090',
] as const;

/** Build the relation graph. Deterministic: same items+options -> same graph. */
export function buildLitGraph(
  items: readonly ZoteroLibItem[],
  options: GraphOptions,
): LitGraph {
  // --- nodes with degree + theme ---
  const tagCount = new Map<string, number>();
  for (const it of items) {
    for (const tag of new Set(it.tags)) {
      if (tag.length === 0) continue;
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }
  }
  const nodes: LitGraphNode[] = items.map((it) => {
    let bestTag: string | undefined;
    let bestN = 0;
    for (const tag of it.tags) {
      const n = tagCount.get(tag) ?? 0;
      // tie-break lexicographically so equal-frequency themes stay stable
      if (n > bestN || (n === bestN && bestTag !== undefined && tag < bestTag)) { bestTag = tag; bestN = n; }
    }
    return {
      key: it.key,
      title: it.title,
      ...(it.year !== undefined ? { year: it.year } : {}),
      creators: it.creators,
      tags: it.tags,
      degree: 0,
      ...(bestTag !== undefined && bestN > 1 ? { theme: bestTag } : {}),
    };
  });

  // --- edges: pairwise relation strength ---
  const keySet = new Set(nodes.map((n) => n.key));
  const edgeMap = new Map<string, LitGraphEdge>();
  const addEdge = (a: string, b: string, w: number, related: boolean): void => {
    if (a === b || !keySet.has(a) || !keySet.has(b)) return;
    const [s, t] = a < b ? [a, b] : [b, a];
    const k = `${s}\u0000${t}`;
    const prev = edgeMap.get(k);
    if (prev === undefined) edgeMap.set(k, { source: s, target: t, weight: w, related });
    else {
      prev.weight += w;
      prev.related = prev.related || related;
    }
  };
  const authorSet = (it: ZoteroLibItem): Set<string> =>
    new Set(it.creators.map((c) => c.trim().toLowerCase()).filter((c) => c.length > 0));
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i]!;
      const b = items[j]!;
      if (options.enableTags) {
        const bt = new Set(b.tags);
        for (const tag of a.tags) if (bt.has(tag)) addEdge(a.key, b.key, 1, false);
      }
      if (options.enableAuthors) {
        const aa = authorSet(a);
        for (const author of authorSet(b)) if (aa.has(author)) addEdge(a.key, b.key, 1, false);
      }
      if (options.enableRelated) {
        const rk = new Set(b.relatedKeys);
        if (a.relatedKeys.some((k) => rk.has(k) || k === b.key)) addEdge(a.key, b.key, 1.5, true);
      }
    }
  }

  // --- minWeight filter + degree rollup ---
  const edges = [...edgeMap.values()].filter((e) => e.weight >= options.minWeight);
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  for (const n of nodes) n.degree = degree.get(n.key) ?? 0;

  // --- legend colors: top themes by (count desc, name asc) ---
  const themeColors = new Map<string, string>();
  [...tagCount.entries()]
    .filter(([, n]) => n > 1)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, LEGEND_COLORS.length)
    .forEach(([tag], i) => themeColors.set(tag, LEGEND_COLORS[i]!));

  return { nodes, edges, themeColors };
}
