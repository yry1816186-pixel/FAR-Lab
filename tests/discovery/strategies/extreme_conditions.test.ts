/**
 * tests/discovery/strategies/extreme_conditions.test.ts — contract +
 * applicability + offline end-to-end for the extreme-conditions strategy
 * (observable extreme regime + mechanism handover point).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extremeConditionsStrategy } from '../../../src/discovery/strategies/extreme_conditions.ts';
import { buildStrategyMessages } from '../../../src/discovery/strategies/strategy.ts';
import { makeCandidate, makeFullCorpus, makeSingleDocCorpus, runStrategyOffline } from './helpers.ts';

describe('extreme_conditions strategy (contract)', () => {
  it('system prompt carries the strategy identity, signature, and BOTH structural markers', () => {
    const messages = buildStrategyMessages(extremeConditionsStrategy, {
      question: 'q',
      corpusAllowlist: '(allowlist)',
      perCallTarget: 2,
    });
    const system = messages[0]!.content;
    assert.ok(system.includes('extreme_conditions'));
    assert.ok(system.includes(extremeConditionsStrategy.signature));
    for (const marker of extremeConditionsStrategy.requiredMarkers) {
      assert.ok(system.includes(marker), `system prompt must demand ${marker}`);
    }
    // The handover (not just "extreme") is the strategy's differentiator.
    assert.ok(system.includes('handover'));
    assert.ok(system.includes('OBSERVABLE'));
  });

  it('shared rules (threshold coherence + citation allowlist) are present', () => {
    const system = buildStrategyMessages(extremeConditionsStrategy, {
      question: 'q',
      corpusAllowlist: '(allowlist)',
      perCallTarget: 1,
    })[0]!.content;
    assert.ok(system.includes('falsificationMethod'));
    assert.ok(system.includes('CITATION RULE'));
  });
});

describe('extreme_conditions strategy (applicability)', () => {
  it('applies to a full corpus', () => {
    const verdict = extremeConditionsStrategy.evaluateApplicability({
      question: 'q',
      corpus: makeFullCorpus(),
    });
    assert.deepEqual(verdict, { applicable: true, skipReason: null });
  });

  it('is corpus-size independent (applies even to a single-document corpus)', () => {
    const verdict = extremeConditionsStrategy.evaluateApplicability({
      question: 'q',
      corpus: makeSingleDocCorpus(),
    });
    assert.deepEqual(verdict, { applicable: true, skipReason: null });
  });
});

describe('extreme_conditions strategy (offline end-to-end via the fixture seam)', () => {
  it('parses a handover candidate with both markers through discovery_extreme_conditions', async () => {
    const result = await runStrategyOffline(extremeConditionsStrategy, {
      hypotheses: [
        makeCandidate({
          statement:
            'In the ultra-short-period regime, dominant radius evolution hands over from irradiation-driven inflation to photoevaporative mass loss.',
          mechanism:
            'EXTREME_REGIME: insolation flux pushed above 1e6 W/m^2 (ultra-short-period planets reachable in archival samples); ' +
            'HANDOVER_PREDICTION: below the handover flux the radius grows with flux (inflation); above it the radius shrinks with flux (mass loss).',
          falsificationMethod: {
            prediction:
              'A sample straddling the handover flux shows the radius–flux slope change sign across the switch point.',
            metric: 'radius-flux slope difference',
            comparator: 'gt',
            value: 1.5,
          },
        }),
      ],
    });
    assert.equal(result.hypotheses.length, 1);
    const mechanism = result.hypotheses[0]!.mechanism as string;
    assert.ok(mechanism.includes('EXTREME_REGIME:'));
    assert.ok(mechanism.includes('HANDOVER_PREDICTION:'));
  });
});
