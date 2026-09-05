import { describe, it, expect } from 'vitest';
import { preMergeNearDuplicates, preferEvidenceConditionedRepresentative } from '../src/pipeline/stages/hypothesis-dedup.js';
import type { NormalizedCluster } from '../src/pipeline/stages/hypothesis-dedup.js';

// RU-10 A4.5 — deterministic near-duplicate pre-merge feeding the hypothesis
// clustering stage. Lexical layer (MinHash-LSH, jaccard >= 0.9) catches verbatim
// near-restatements the LLM grouping call may under-merge; the semantic layer
// (LLM clusters) stays the sole judge of paraphrase equivalence. One owner:
// src/domain/minhash.ts provides the primitive.

const cluster = (members: number[], reason: string): NormalizedCluster => ({ members: [...members].sort((a, b) => a - b), reason });

describe('preMergeNearDuplicates', () => {
  const statements = [
    'Dopamine modulates reward prediction error signals in the ventral striatum.', // 0
    'Dopamine modulates reward prediction error signals in the ventral striatum', // 1 — near-verbatim of 0 (punctuation only)
    'Serotonin regulates mood appetite and sleep through the human brainstem.', // 2 — distinct
    'Gabaergic interneurons control cortical oscillations via fast inhibition.', // 3 — distinct
  ];

  it('merges a near-verbatim pair even when LLM clustering left them apart', () => {
    const llmClusters: NormalizedCluster[] = [cluster([0], 'singleton'), cluster([1], 'not grouped'), cluster([2], 'not grouped'), cluster([3], 'not grouped')];
    const merged = preMergeNearDuplicates(statements, llmClusters, 0.9);
    expect(merged.some((c) => c.members.includes(0) && c.members.includes(1))).toBe(true);
    // distinct docs stay singletons
    const s2 = merged.find((c) => c.members.includes(2));
    expect(s2?.members).toEqual([2]);
  });

  it('keeps genuinely different statements unmerged at the lexical layer', () => {
    const llmClusters: NormalizedCluster[] = [cluster([0], 'a'), cluster([2], 'b'), cluster([3], 'c')];
    const merged = preMergeNearDuplicates([statements[0]!, statements[2]!, statements[3]!], llmClusters, 0.9);
    expect(merged).toHaveLength(3);
  });

  it('does not double-merge: members already in one LLM cluster stay together exactly once', () => {
    const llmClusters: NormalizedCluster[] = [cluster([0, 1], 'llm saw the restatement')];
    const merged = preMergeNearDuplicates(statements.slice(0, 2), llmClusters, 0.9);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.members.sort()).toEqual([0, 1]);
  });

  it('reason discloses the deterministic lexical basis', () => {
    const llmClusters: NormalizedCluster[] = [cluster([0], 'singleton'), cluster([1], 'not grouped')];
    const merged = preMergeNearDuplicates(statements.slice(0, 2), llmClusters, 0.9);
    expect(merged[0]?.reason).toContain('lexical');
  });

  it('handles empty input safely', () => {
    expect(preMergeNearDuplicates([], [], 0.9)).toHaveLength(0);
  });

  it('union-find chains transitive near-duplicates into one cluster', () => {
    const base = 'Memory consolidation depends on hippocampal replay during slow wave sleep.';
    const v2 = 'Memory consolidation depends on hippocampal replay during slow-wave sleep'; // near-verbatim (hyphen)
    const v3 = 'memory consolidation depends on hippocampal replay during slow wave sleep.'; // case+punct only
    const llmClusters: NormalizedCluster[] = [cluster([0], 'x'), cluster([1], 'y'), cluster([2], 'z')];
    const merged = preMergeNearDuplicates([base, v2, v3], llmClusters, 0.9);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.members).toEqual([0, 1, 2]);
  });
});

describe('preferEvidenceConditionedRepresentative (S2)', () => {
  const cands = [
    { strategy: 'mechanism_novelty', inputClaimIds: [] as string[] },
    { strategy: 'evidence_conditioned', inputClaimIds: ['clm_a', 'clm_b'] },
    { strategy: 'mechanism_novelty', inputClaimIds: [] },
    { strategy: 'evidence_conditioned', inputClaimIds: [] as string[] }, // no claim linkage — no preference
  ];

  it('a lower-index novelty paraphrase no longer swallows the claim-conditioned member', () => {
    const out = preferEvidenceConditionedRepresentative([cluster([0, 1], 'same mechanism')], cands);
    expect(out[0]!.members[0]).toBe(1); // evidence_conditioned with claims leads
    expect(out[0]!.members).toEqual([1, 0]);
    expect(out[0]!.reason).toContain('claim-conditioned');
  });

  it('no conditioned member (or conditioned without claims) keeps ascending order', () => {
    const out = preferEvidenceConditionedRepresentative([cluster([0, 2], 'same mechanism'), cluster([3], 'x')], cands);
    expect(out[0]!.members).toEqual([0, 2]);
    expect(out[1]!.members).toEqual([3]);
  });

  it('already-preferred and singleton clusters pass through untouched', () => {
    const out = preferEvidenceConditionedRepresentative([cluster([1, 0], 'already ordered')], cands);
    // cluster() helper sorts ascending; pass an explicitly ordered one instead
    const ordered: NormalizedCluster[] = [{ members: [1, 0], reason: 'explicit order' }];
    const out2 = preferEvidenceConditionedRepresentative(ordered, cands);
    expect(out2[0]!.members).toEqual([1, 0]); // 1 stays first, no reorder needed
    expect(out2[0]!.reason).toBe('explicit order');
    expect(out).toBeTruthy();
  });
});
