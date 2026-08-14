/**
 * tests/discovery/strategies/abduction.test.ts — contract + applicability +
 * offline end-to-end for the abduction strategy (minimal joint explanation).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { abductionStrategy } from '../../../src/discovery/strategies/abduction.ts';
import { buildStrategyMessages } from '../../../src/discovery/strategies/strategy.ts';
import { makeCandidate, makeFullCorpus, makeSingleDocCorpus, runStrategyOffline } from './helpers.ts';

describe('abduction strategy (contract)', () => {
  it('system prompt carries the strategy identity, signature, and ALL structural markers', () => {
    const messages = buildStrategyMessages(abductionStrategy, {
      question: 'q',
      corpusAllowlist: '(allowlist)',
      perCallTarget: 2,
    });
    const system = messages[0]!.content;
    assert.ok(system.includes('abduction'));
    assert.ok(system.includes(abductionStrategy.signature));
    for (const marker of abductionStrategy.requiredMarkers) {
      assert.ok(system.includes(marker), `system prompt must demand ${marker}`);
    }
    // Parsimony is the strategy's differentiator — not generic prose.
    assert.ok(system.includes('JOINTLY explains'));
    assert.ok(system.includes('MINIMAL set of mechanisms'));
  });

  it('shared rules (threshold coherence + citation allowlist) are present', () => {
    const system = buildStrategyMessages(abductionStrategy, {
      question: 'q',
      corpusAllowlist: '(allowlist)',
      perCallTarget: 1,
    })[0]!.content;
    assert.ok(system.includes('falsificationMethod'));
    assert.ok(system.includes('CITATION RULE'));
  });
});

describe('abduction strategy (applicability — honest skip)', () => {
  it('skips with a reason when the corpus has fewer than 2 documents', () => {
    const verdict = abductionStrategy.evaluateApplicability({
      question: 'q',
      corpus: makeSingleDocCorpus(),
    });
    assert.equal(verdict.applicable, false);
    assert.match(verdict.skipReason ?? '', /needs >= 2 corpus documents/);
  });

  it('applies when the corpus can supply a phenomenon set', () => {
    const verdict = abductionStrategy.evaluateApplicability({
      question: 'q',
      corpus: makeFullCorpus(),
    });
    assert.deepEqual(verdict, { applicable: true, skipReason: null });
  });
});

describe('abduction strategy (offline end-to-end via the fixture seam)', () => {
  it('parses a minimal-set candidate with all three markers through discovery_abduction', async () => {
    const result = await runStrategyOffline(abductionStrategy, {
      hypotheses: [
        makeCandidate({
          statement:
            'A single mechanism — lipid-to-ceramide conversion — minimally explains both the lipid–insulin-resistance correlation and the Akt blockade.',
          mechanism:
            'PHENOMENON_1: intramyocellular lipid correlates with insulin resistance [doc-1]; ' +
            'PHENOMENON_2: ceramide accumulation blocks Akt translocation [doc-2]; ' +
            'MINIMAL_SET: one mechanism — lipid-to-ceramide conversion downstream of lipid oversupply blocks insulin signalling.',
          falsificationMethod: {
            prediction:
              'Joint prediction: removing the ceramide step (pharmacological inhibition) abolishes BOTH the lipid–resistance correlation and the Akt blockade.',
            metric: 'HOMA-IR change from baseline',
            comparator: 'gt',
            value: 0.5,
          },
        }),
      ],
    });
    assert.equal(result.hypotheses.length, 1);
    const mechanism = result.hypotheses[0]!.mechanism as string;
    assert.ok(mechanism.includes('PHENOMENON_1:'));
    assert.ok(mechanism.includes('PHENOMENON_2:'));
    assert.ok(mechanism.includes('MINIMAL_SET:'));
  });

  it('rejects threshold-incoherent candidates at the zod layer (gt without value)', async () => {
    await assert.rejects(
      () =>
        runStrategyOffline(abductionStrategy, {
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
