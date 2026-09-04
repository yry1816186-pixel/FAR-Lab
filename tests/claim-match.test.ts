import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contentTokens, jaccard, tfidfCosine, thresholdMatch, finalizeCounts, deterministicBandVerdict } from '../eval/claim-match.mjs';

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

describe('deterministic band pre-layer (S2: deterministicBandVerdict)', () => {
  it('opposing directions decide different-finding (the recorded T790M leniency FP shape)', () => {
    // live-measured 2026-08-29: the 5-vote judge blessed this pair (gold FALSE) —
    // restore vs reduce are opposite directions about the same entity
    expect(deterministicBandVerdict(
      'T790M mutations restore EGFR signaling despite drug binding.',
      'The T790M gatekeeper mutation sterically reduces inhibitor binding.',
    )).toBe(false);
  });
  it('correlation vs mechanism decides different-finding (the other recorded FP family)', () => {
    expect(deterministicBandVerdict(
      'Secondary bile acid concentration is inversely correlated with C. difficile growth.',
      'Loss of secondary bile acids inhibits C. difficile germination and growth.',
    )).toBe(false);
  });
  it('same direction abstains — mechanism-layer mismatches stay the LLM band\'s job', () => {
    // gold-FALSE pair the rules must NOT decide (both verbs point down)
    expect(deterministicBandVerdict(
      'Antibiotic depletion of taxa reduces secondary bile acids in the gut lumen.',
      'Antibiotics disrupt the gut microbiota.',
    )).toBeNull();
  });
  it('subject-negation guards the claim (loss-of/without/reduced abstain)', () => {
    // gold-TRUE two-sides-of-one-fact shapes sit behind negated subjects — the
    // effective polarity is not the verb\'s polarity, so the rule must abstain
    expect(deterministicBandVerdict(
      'Loss of secondary bile acids inhibits C. difficile germination and growth.',
      'Reduced concentrations of inhibitory secondary bile acids remove a barrier to C. difficile.',
    )).toBeNull();
  });
  it('mixed directions inside ONE claim abstain (ambiguous assertion)', () => {
    expect(deterministicBandVerdict(
      'The mutation increases affinity and decreases specificity.',
      'The mutation reduces binding.',
    )).toBeNull();
  });
  it('never asserts sameness — the return domain is {false, null}', () => {
    expect(deterministicBandVerdict(
      'Antibiotics disrupt the gut microbiota.',
      'Antibiotic treatment disrupts the gut microbiome.',
    )).toBeNull(); // near-paraphrase, same direction — still the LLM band decides
  });
  it('ZERO gold errors on all 157 pairs, and the fired set is non-trivial — mutation-locked', () => {
    const files = ['eval/claim-pair-gold.jsonl', 'eval/claim-pair-gold-v21.jsonl'];
    const rows = files.flatMap((f) =>
      readFileSync(resolve(process.cwd(), f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as {
        claim: string; counterpart: string | null; bestSim: number; label: boolean;
      }));
    const band = rows.filter((r) => r.bestSim >= 0.10 && r.bestSim < 0.40 && r.claim && r.counterpart);
    const fired = band.filter((r) => deterministicBandVerdict(r.claim, r.counterpart!) === false);
    // the rule only classifies pairs as DIFFERENT findings: every fired row must
    // be gold-false, or the pre-layer is corrupting the zero-error contract
    expect(fired.every((r) => !r.label)).toBe(true);
    // regression guard on coverage: the shipped rules decide >= 6 band pairs
    // (6/109 at 2026-09-05; shrinking below this means a lexicon/rule regressed)
    expect(fired.length).toBeGreaterThanOrEqual(6);
  });
});
