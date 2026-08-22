import { describe, it, expect } from 'vitest';
import { contentTokens, jaccard, tfidfCosine, thresholdMatch, finalizeCounts } from '../eval/claim-match.mjs';

/**
 * Judge-hardening unit tests (rediscovery eval v2): the deterministic matcher must be
 * reproducible by construction — same inputs, same outputs, no LLM in the core path.
 */
describe('contentTokens', () => {
  it('drops stopwords, folds crude plurals, keeps scientific terms', () => {
    const t = contentTokens('The conjugative plasmids are the dominant mechanisms in hospitals');
    expect([...t].sort()).toEqual(['conjugative', 'dominant', 'hospital', 'mechanism', 'plasmid']);
  });
  it('handles empty/non-string input without throwing', () => {
    expect(contentTokens('').size).toBe(0);
    expect(contentTokens(undefined).size).toBe(0);
  });
});

describe('jaccard / tfidfCosine', () => {
  it('jaccard: identical sets 1, disjoint 0', () => {
    const a = contentTokens('bile acid germination');
    expect(jaccard(a, contentTokens('bile acid germination'))).toBe(1);
    expect(jaccard(a, contentTokens('crispr cas9 mismatch'))).toBe(0);
  });
  it('tfidf-cosine separates paraphrase from unrelated (calibration anchors)', () => {
    const para = [
      'Conjugative plasmid transfer is the dominant mechanism driving ARG spread in hospital environments.',
      'Conjugative plasmids are the dominant horizontal-transfer vector for resistance genes in hospital settings.',
    ];
    const unrel = [
      'Antibiotics disrupt the gut microbiota.',
      'Off-target editing arises because the Cas9-guide RNA complex tolerates sequence mismatches.',
    ];
    const sim = tfidfCosine([...para, ...unrel].map(contentTokens));
    expect(sim(0, 1)).toBeGreaterThan(sim(2, 3));
    expect(sim(2, 3)).toBeLessThan(0.1);
  });
});

describe('thresholdMatch + finalizeCounts', () => {
  const agent = [
    'Acquired EGFR TKI resistance in NSCLC is primarily driven by secondary T790M gatekeeper mutations.',
    'Unrelated claim about totally different biology like ocean acidification effects on corals.',
  ];
  const gt = [
    'The dominant acquired-resistance mechanism is the EGFR T790M gatekeeper mutation in the kinase domain.',
    'Patient-to-patient transmission amplifies spread in hospitals.',
  ];
  it('disjoint claims auto-reject; lexically-different paraphrases go to the borderline band (calibrated: 0.239)', () => {
    const m = thresholdMatch(agent, gt, { high: 0.35, low: 0.15 });
    // the coral claim shares no tokens with any gt claim -> deterministic -1
    expect(m.agentSide[1]?.match).toBe(-1);
    // the T790M paraphrase pair is semantically equal but lexically different (sim 0.239)
    // -> NOT auto-matched; it must be adjudicated (this is the designed division of labor)
    expect(m.agentSide[0]?.match).toBeNull();
    expect(m.agentSide[0]?.sim).toBeGreaterThan(0.15);
    expect(m.borderline.length).toBe(2); // the T790M pair from both sides
    const adjudicated = finalizeCounts(agent, gt, m, m.borderline.map(() => ({ matched: true })));
    expect(adjudicated.agentMatched).toBe(1); // pair counted once adjudicated
    const rejected = finalizeCounts(agent, gt, m, m.borderline.map(() => ({ matched: false })));
    expect(rejected.agentMatched).toBe(0);
  });
  it('is a pure function: identical inputs give identical results', () => {
    const a = thresholdMatch(agent, gt, { high: 0.55, low: 0.15 });
    const b = thresholdMatch(agent, gt, { high: 0.55, low: 0.15 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('borderline entries flip only with adjudication; unmatched baseline is conservative', () => {
    const m = thresholdMatch(agent, gt, { high: 0.99, low: 0.001 }); // nonzero-sim pairs become borderline
    expect(m.borderline.length).toBeGreaterThan(0);
    const noVotes = finalizeCounts(agent, gt, m, m.borderline.map(() => ({ matched: false })));
    const allYes = finalizeCounts(agent, gt, m, m.borderline.map(() => ({ matched: true })));
    expect(allYes.agentMatched).toBeGreaterThan(noVotes.agentMatched);
    expect(allYes.agentMatched).toBeLessThanOrEqual(agent.length);
  });
});
