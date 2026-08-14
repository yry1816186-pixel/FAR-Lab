/**
 * tests/discovery/strategies/counterfactual.test.ts — contract + applicability
 * + offline end-to-end for the counterfactual strategy (remove/invert one key
 * variable and map the collapse surface).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { counterfactualStrategy } from '../../../src/discovery/strategies/counterfactual.ts';
import { buildStrategyMessages } from '../../../src/discovery/strategies/strategy.ts';
import { makeCandidate, makeFullCorpus, makeSingleDocCorpus, runStrategyOffline } from './helpers.ts';

describe('counterfactual strategy (contract)', () => {
  it('system prompt carries the strategy identity, signature, and BOTH structural markers', () => {
    const messages = buildStrategyMessages(counterfactualStrategy, {
      question: 'q',
      corpusAllowlist: '(allowlist)',
      perCallTarget: 2,
    });
    const system = messages[0]!.content;
    assert.ok(system.includes('counterfactual'));
    assert.ok(system.includes(counterfactualStrategy.signature));
    for (const marker of counterfactualStrategy.requiredMarkers) {
      assert.ok(system.includes(marker), `system prompt must demand ${marker}`);
    }
    // The collapse surface (not just "what if") is the strategy's differentiator.
    assert.ok(system.includes('collapse surface'));
    assert.ok(system.includes('implicit causal structure'));
  });

  it('shared rules (threshold coherence + citation allowlist) are present', () => {
    const system = buildStrategyMessages(counterfactualStrategy, {
      question: 'q',
      corpusAllowlist: '(allowlist)',
      perCallTarget: 1,
    })[0]!.content;
    assert.ok(system.includes('falsificationMethod'));
    assert.ok(system.includes('CITATION RULE'));
  });
});

describe('counterfactual strategy (applicability)', () => {
  it('applies to a full corpus', () => {
    const verdict = counterfactualStrategy.evaluateApplicability({
      question: 'q',
      corpus: makeFullCorpus(),
    });
    assert.deepEqual(verdict, { applicable: true, skipReason: null });
  });

  it('is corpus-size independent (applies even to a single-document corpus)', () => {
    const verdict = counterfactualStrategy.evaluateApplicability({
      question: 'q',
      corpus: makeSingleDocCorpus(),
    });
    assert.deepEqual(verdict, { applicable: true, skipReason: null });
  });
});

describe('counterfactual strategy (offline end-to-end via the fixture seam)', () => {
  it('parses a collapse-map candidate with both markers through discovery_counterfactual', async () => {
    const result = await runStrategyOffline(counterfactualStrategy, {
      hypotheses: [
        makeCandidate({
          statement:
            'In a zero-starspot counterfactual, the activity–radius-anomaly correlation collapses while the tidal dependence on orbital period survives — exposing contamination as the hidden load-bearing variable.',
          mechanism:
            'COUNTERFACTUAL_VARIABLE: starspot covering fraction inverted to zero (a hypothetical quiet-star sample); ' +
            'COLLAPSE_CONSEQUENCE: the activity–radius-anomaly correlation collapses; the orbital-period dependence of the anomaly survives.',
          falsificationMethod: {
            prediction:
              'Near-counterfactual quiet-star sub-samples already show a measurably weaker activity–anomaly correlation than active samples.',
            metric: 'correlation difference (active minus quiet)',
            comparator: 'gt',
            value: 1.5,
          },
        }),
      ],
    });
    assert.equal(result.hypotheses.length, 1);
    const mechanism = result.hypotheses[0]!.mechanism as string;
    assert.ok(mechanism.includes('COUNTERFACTUAL_VARIABLE:'));
    assert.ok(mechanism.includes('COLLAPSE_CONSEQUENCE:'));
  });
});
