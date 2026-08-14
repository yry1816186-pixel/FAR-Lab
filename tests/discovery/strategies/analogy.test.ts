/**
 * tests/discovery/strategies/analogy.test.ts — contract + applicability +
 * offline end-to-end for the analogy strategy (distant-domain structural
 * mapping with explicit failure conditions).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { analogyStrategy } from '../../../src/discovery/strategies/analogy.ts';
import { buildStrategyMessages } from '../../../src/discovery/strategies/strategy.ts';
import { makeCandidate, makeFullCorpus, runStrategyOffline } from './helpers.ts';

describe('analogy strategy (contract)', () => {
  it('system prompt demands SOURCE_DOMAIN / MAPPING / FAILURE_CONDITIONS markers', () => {
    const system = buildStrategyMessages(analogyStrategy, {
      question: 'q',
      corpusAllowlist: '(allowlist)',
      perCallTarget: 2,
    })[0]!.content;
    for (const marker of analogyStrategy.requiredMarkers) {
      assert.ok(system.includes(marker), `system prompt must demand ${marker}`);
    }
    assert.ok(system.includes('DISTANT domain'));
  });

  it('signature names the cross-domain mapping operation', () => {
    assert.match(analogyStrategy.signature, /distant_domain_repertoire/);
  });
});

describe('analogy strategy (applicability)', () => {
  it('applies to any corpus (no document-count gate)', () => {
    const verdict = analogyStrategy.evaluateApplicability({
      question: 'q',
      corpus: makeFullCorpus(),
    });
    assert.deepEqual(verdict, { applicable: true, skipReason: null });
  });
});

describe('analogy strategy (offline end-to-end)', () => {
  it('parses a schema-valid candidate through discovery_analogy', async () => {
    const result = await runStrategyOffline(analogyStrategy, {
      hypotheses: [
        makeCandidate({
          relationToExistingTheory:
            'SOURCE_DOMAIN: epidemiology; MAPPING: exposure→dose→response maps lipid exposure onto insulin response; FAILURE_CONDITIONS: breaks when turnover varies independently of exposure.',
        }),
      ],
    });
    assert.equal(result.hypotheses.length, 1);
    assert.match(String(result.hypotheses[0]!.relationToExistingTheory), /SOURCE_DOMAIN:/);
  });
});
