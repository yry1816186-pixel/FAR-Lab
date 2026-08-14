/**
 * tests/discovery/strategies/induction.test.ts — contract + applicability +
 * offline end-to-end for the induction strategy (unify ≥2 corpus regularities).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { inductionStrategy } from '../../../src/discovery/strategies/induction.ts';
import { buildStrategyMessages } from '../../../src/discovery/strategies/strategy.ts';
import { makeCandidate, makeFullCorpus, makeSingleDocCorpus, runStrategyOffline } from './helpers.ts';

describe('induction strategy (contract)', () => {
  it('system prompt carries the strategy identity, signature, and BOTH structural markers', () => {
    const messages = buildStrategyMessages(inductionStrategy, {
      question: 'q',
      corpusAllowlist: '(allowlist)',
      perCallTarget: 2,
    });
    const system = messages[0]!.content;
    assert.ok(system.includes('induction'));
    assert.ok(system.includes(inductionStrategy.signature));
    for (const marker of inductionStrategy.requiredMarkers) {
      assert.ok(system.includes(marker), `system prompt must demand ${marker}`);
    }
    // The unification rule is the strategy's differentiator — not generic prose.
    assert.ok(system.includes('unified causal mechanism'));
  });

  it('shared rules (threshold coherence + citation allowlist) are present', () => {
    const system = buildStrategyMessages(inductionStrategy, {
      question: 'q',
      corpusAllowlist: '(allowlist)',
      perCallTarget: 1,
    })[0]!.content;
    assert.ok(system.includes('falsificationMethod'));
    assert.ok(system.includes('CITATION RULE'));
  });
});

describe('induction strategy (applicability — honest skip)', () => {
  it('skips with a reason when the corpus has fewer than 2 documents', () => {
    const verdict = inductionStrategy.evaluateApplicability({
      question: 'q',
      corpus: makeSingleDocCorpus(),
    });
    assert.equal(verdict.applicable, false);
    assert.match(verdict.skipReason ?? '', /needs >= 2 corpus documents/);
  });

  it('applies when the corpus spans multiple documents', () => {
    const verdict = inductionStrategy.evaluateApplicability({
      question: 'q',
      corpus: makeFullCorpus(),
    });
    assert.deepEqual(verdict, { applicable: true, skipReason: null });
  });
});

describe('induction strategy (offline end-to-end via the fixture seam)', () => {
  it('parses a schema-valid candidate through discovery_induction', async () => {
    const result = await runStrategyOffline(inductionStrategy, {
      hypotheses: [makeCandidate()],
    });
    assert.equal(result.hypotheses.length, 1);
    assert.ok((result.hypotheses[0]!.statement as string).length > 0);
  });

  it('rejects threshold-incoherent candidates at the zod layer (gt without value)', async () => {
    await assert.rejects(
      () =>
        runStrategyOffline(inductionStrategy, {
          hypotheses: [
            makeCandidate({
              falsificationMethod: {
                prediction: 'p',
                metric: 'm',
                comparator: 'gt',
                lower: 0,
                upper: 1,
              },
            }),
          ],
        }),
      /failed local schema validation|value/,
    );
  });
});
