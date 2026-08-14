/**
 * tests/discovery/strategies/contradiction_mining.test.ts — contract +
 * applicability + offline end-to-end for the contradiction-mining strategy
 * (conflict pairs resolved by a moderating mechanism).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { contradictionMiningStrategy } from '../../../src/discovery/strategies/contradiction_mining.ts';
import { buildStrategyMessages } from '../../../src/discovery/strategies/strategy.ts';
import { makeCandidate, makeFullCorpus, makeSingleDocCorpus, runStrategyOffline } from './helpers.ts';

describe('contradiction_mining strategy (contract)', () => {
  it('system prompt carries the strategy identity, signature, and ALL structural markers', () => {
    const messages = buildStrategyMessages(contradictionMiningStrategy, {
      question: 'q',
      corpusAllowlist: '(allowlist)',
      perCallTarget: 2,
    });
    const system = messages[0]!.content;
    assert.ok(system.includes('contradiction_mining'));
    assert.ok(system.includes(contradictionMiningStrategy.signature));
    for (const marker of contradictionMiningStrategy.requiredMarkers) {
      assert.ok(system.includes(marker), `system prompt must demand ${marker}`);
    }
    // "Both sides locally correct" (not averaging or dismissing) is the differentiator.
    assert.ok(system.includes('locally correct'));
    assert.ok(system.includes('Do NOT average the conflict away'));
  });

  it('shared rules (threshold coherence + citation allowlist) are present', () => {
    const system = buildStrategyMessages(contradictionMiningStrategy, {
      question: 'q',
      corpusAllowlist: '(allowlist)',
      perCallTarget: 1,
    })[0]!.content;
    assert.ok(system.includes('falsificationMethod'));
    assert.ok(system.includes('CITATION RULE'));
  });
});

describe('contradiction_mining strategy (applicability — honest skip)', () => {
  it('skips with a reason when the corpus has fewer than 2 documents', () => {
    const verdict = contradictionMiningStrategy.evaluateApplicability({
      question: 'q',
      corpus: makeSingleDocCorpus(),
    });
    assert.equal(verdict.applicable, false);
    assert.match(verdict.skipReason ?? '', /needs >= 2 corpus documents/);
  });

  it('applies when the corpus can supply a conflict pair', () => {
    const verdict = contradictionMiningStrategy.evaluateApplicability({
      question: 'q',
      corpus: makeFullCorpus(),
    });
    assert.deepEqual(verdict, { applicable: true, skipReason: null });
  });
});

describe('contradiction_mining strategy (offline end-to-end via the fixture seam)', () => {
  it('parses a conflict-pair candidate with all three markers through discovery_contradiction_mining', async () => {
    const result = await runStrategyOffline(contradictionMiningStrategy, {
      hypotheses: [
        makeCandidate({
          statement:
            'The activity–anomaly conflict between the two corpus reports is resolved by spot-correction completeness as a hidden moderator.',
          mechanism:
            'CONFLICT_A: radius anomaly correlates positively with stellar activity index [doc-1]; ' +
            'CONFLICT_B: radius anomaly uncorrelated with activity in the corrected sample [doc-2]; ' +
            'RESOLUTION_MECHANISM: spot-correction completeness moderates both — incomplete correction leaves a spurious correlation that vanishes when correction quality is controlled.',
          falsificationMethod: {
            prediction:
              'Sorting the combined sample by correction quality splits the single reported correlation into a strong (low-quality) and a null (high-quality) conditioned correlation.',
            metric: 'conditioned correlation difference',
            comparator: 'gt',
            value: 1.5,
          },
        }),
      ],
    });
    assert.equal(result.hypotheses.length, 1);
    const mechanism = result.hypotheses[0]!.mechanism as string;
    assert.ok(mechanism.includes('CONFLICT_A:'));
    assert.ok(mechanism.includes('CONFLICT_B:'));
    assert.ok(mechanism.includes('RESOLUTION_MECHANISM:'));
  });
});
