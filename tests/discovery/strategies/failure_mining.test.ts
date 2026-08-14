/**
 * tests/discovery/strategies/failure_mining.test.ts — contract +
 * applicability + offline end-to-end for the failure-mining strategy
 * (limitation-seeded conjectures with attested provenance).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { failureMiningStrategy } from '../../../src/discovery/strategies/failure_mining.ts';
import { buildStrategyMessages } from '../../../src/discovery/strategies/strategy.ts';
import { makeCandidate, makeFullCorpus, runStrategyOffline } from './helpers.ts';

describe('failure_mining strategy (contract)', () => {
  it('system prompt demands the LIMITATION_ORIGIN provenance marker', () => {
    const system = buildStrategyMessages(failureMiningStrategy, {
      question: 'q',
      corpusAllowlist: '(allowlist)',
      perCallTarget: 1,
    })[0]!.content;
    assert.ok(system.includes('LIMITATION_ORIGIN:'));
    assert.ok(system.includes('fabricated provenance'));
  });
});

describe('failure_mining strategy (applicability — honest skip)', () => {
  it('applies when at least one corpus document has an abstract', () => {
    const verdict = failureMiningStrategy.evaluateApplicability({
      question: 'q',
      corpus: makeFullCorpus(),
    });
    assert.equal(verdict.applicable, true);
    assert.equal(verdict.skipReason, null);
  });
});

describe('failure_mining strategy (offline end-to-end)', () => {
  it('parses a gap-seeded candidate through discovery_failure_mining', async () => {
    const result = await runStrategyOffline(failureMiningStrategy, {
      hypotheses: [
        makeCandidate({
          statement:
            'The untested gap — whether ceramide dynamics drive relapse after lipid normalization — is itself the conjecture: relapse is driven by residual ceramide pools with slow turnover.',
          assumptions: [
            'LIMITATION_ORIGIN: doc-1: the corpus admits no longitudinal ceramide-following data.',
          ],
        }),
      ],
    });
    assert.equal(result.hypotheses.length, 1);
    assert.ok(
      (result.hypotheses[0]!.assumptions as string[]).some((a) => a.startsWith('LIMITATION_ORIGIN:')),
    );
  });
});
