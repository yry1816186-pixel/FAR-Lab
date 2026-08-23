import { jaccardFromSignatures, minhashSignature, shingle, type MinhashConfig } from '../../domain/minhash.js';

/**
 * RU-10 A4.5 — deterministic near-duplicate PRE-MERGE for hypothesis clustering.
 *
 * Layering (packet ruling, one owner per mechanism):
 * - lexical layer HERE: MinHash-estimated jaccard ≥ threshold merges verbatim
 *   near-restatements deterministically — zero LLM cost, catches the
 *   under-merge failure mode the LLM grouping call admits in its own comment;
 * - semantic layer: the existing LLM clusterCandidates call remains the sole
 *   judge of paraphrase equivalence beyond lexical identity.
 *
 * Pure function over statements + LLM clusters. Union-find so transitive
 * near-dups land in one cluster. Representative = first member (ascending),
 * matching normalizeClusters convention downstream.
 */

export interface NormalizedCluster {
  /** Indices into the flat candidate list, ascending; first member is the representative. */
  members: number[];
  reason: string;
}

const SIG_CFG: MinhashConfig = { numPerm: 128 };

export function preMergeNearDuplicates(
  statements: readonly string[],
  llmClusters: readonly NormalizedCluster[],
  threshold = 0.9,
): NormalizedCluster[] {
  const n = statements.length;
  if (n === 0) return [];

  // ---- union-find over indices ----
  const parent = new Array<number>(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root]!;
    // path compression
    while (parent[x] !== x) {
      const next = parent[x]!;
      parent[x] = root;
      x = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  // ---- lexical near-dup detection ----
  const sigs = statements.map((s) => minhashSignature(shingle(s), SIG_CFG));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = jaccardFromSignatures(sigs[i]!, sigs[j]!);
      if (sim >= threshold) union(i, j);
    }
  }

  // ---- fold LLM clusters into the same partition ----
  for (const cl of llmClusters) {
    const ms = cl.members.filter((m) => m >= 0 && m < n);
    for (let k = 1; k < ms.length; k++) union(ms[0]!, ms[k]!);
  }

  // ---- materialize groups keyed by root, preserving LLM reasons where present ----
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const arr = groups.get(r) ?? [];
    arr.push(i);
    groups.set(r, arr);
  }

  const reasonByRootCandidate = new Map<number, string>();
  for (const cl of llmClusters) {
    if (cl.members.length === 0) continue;
    const root = find(cl.members[0]!);
    if (!reasonByRootCandidate.has(root)) reasonByRootCandidate.set(root, cl.reason);
  }

  const out: NormalizedCluster[] = [];
  for (const [, members] of groups) {
    members.sort((a, b) => a - b);
    const root = find(members[0]!);
    const llmReason = reasonByRootCandidate.get(root);
    const reason =
      members.length > 1 && llmReason !== undefined
        ? `${llmReason} (+lexical near-dup pre-merge)`
        : members.length > 1
          ? `lexical near-duplicate group (MinHash jaccard >= ${threshold})`
          : (llmReason ?? 'not grouped by clustering; treated as distinct');
    out.push({ members, reason });
  }
  out.sort((a, b) => (a.members[0] ?? 0) - (b.members[0] ?? 0));
  return out;
}
