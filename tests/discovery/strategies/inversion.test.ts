/**
 * tests/discovery/strategies/inversion.test.ts — contract + applicability +
 * offline end-to-end for the inversion strategy (negate the mainstream
 * explanation, derive the discriminating observation).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { inversionStrategy } from '../../../src/discovery/strategies/inversion.ts';
import { buildStrategyMessages } from '../../../src/discovery/strategies/strategy.ts';
import { makeCandidate, makeFullCorpus, makeSingleDocCorpus, runStrategyOffline } from './helpers.ts';

describe('inversion strategy (contract)', () => {
  it('system prompt carries the strategy identity, signature, and BOTH structural markers', () => {
    const messages = buildStrategyMessages(inversionStrategy, {
      question: 'q',
      corpusAllowlist: '(allowlist)',
      perCallTarget: 2,
    });
    const system = messages[0]!.content;
    assert.ok(system.includes('inversion'));
    assert.ok(system.includes(inversionStrategy.signature));
    for (const marker of inversionStrategy.requiredMarkers) {
      assert.ok(system.includes(marker), `system prompt must demand ${marker}`);
    }
    // The discriminating observation is the strategy's differentiator.
    assert.ok(system.includes('discriminating observation'));
  });

  it('shared rules (threshold coherence + citation allowlist) are present', () => {
    const system = buildStrategyMessages(inversionStrategy, {
      question: 'q',
      corpusAllowlist: '(allowlist)',
      perCallTarget: 1,
    })[0]!.content;
    assert.ok(system.includes('falsificationMethod'));
    assert.ok(system.includes('CITATION RULE'));
  });
});

describe('inversion strategy (applicability)', () => {
  it('applies to a full corpus', () => {
    const verdict = inversionStrategy.evaluateApplicability({
      question: 'q',
      corpus: makeFullCorpus(),
    });
    assert.deepEqual(verdict, { applicable: true, skipReason: null });
  });

  it('is corpus-size independent (applies even to a single-document corpus)', () => {
    const verdict = inversionStrategy.evaluateApplicability({
      question: 'q',
      corpus: makeSingleDocCorpus(),
    });
    assert.deepEqual(verdict, { applicable: true, skipReason: null });
  });
});

describe('inversion strategy (offline end-to-end via the fixture seam)', () => {
  it('parses an inverted candidate with both markers through discovery_inversion', async () => {
    const result = await runStrategyOffline(inversionStrategy, {
      hypotheses: [
        makeCandidate({
          statement:
            'If the dominant starspot-contamination explanation is false, radius residuals should still anti-correlate with activity after spot correction.',
          mechanism:
            'MAINSTREAM_ASSUMPTION: the corpus-dominant explanation — hot-Jupiter radius inflation is unocculted starspot contamination; ' +
            'IF_FALSE_OBSERVABLE: if false, corrected radius anomalies should persist and instead track orbital-period-dependent tidal heating.',
          falsificationMethod: {
            prediction:
              'After spot-model correction, residual radius anomaly correlates with orbital period, not activity index.',
            metric: 'pearson_r',
            comparator: 'gt',
            value: 0.5,
          },
        }),
      ],
    });
    assert.equal(result.hypotheses.length, 1);
    const mechanism = result.hypotheses[0]!.mechanism as string;
    assert.ok(mechanism.includes('MAINSTREAM_ASSUMPTION:'));
    assert.ok(mechanism.includes('IF_FALSE_OBSERVABLE:'));
  });
});
