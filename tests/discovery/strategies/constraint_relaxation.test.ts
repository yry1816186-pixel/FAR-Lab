/**
 * tests/discovery/strategies/constraint_relaxation.test.ts — contract +
 * applicability + offline end-to-end for the constraint-relaxation strategy
 * (perturb one domain-default assumption in exactly one direction).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { constraintRelaxationStrategy } from '../../../src/discovery/strategies/constraint_relaxation.ts';
import { buildStrategyMessages } from '../../../src/discovery/strategies/strategy.ts';
import { makeCandidate, makeFullCorpus, makeSingleDocCorpus, runStrategyOffline } from './helpers.ts';

describe('constraint_relaxation strategy (contract)', () => {
  it('system prompt carries the strategy identity, signature, and BOTH structural markers', () => {
    const messages = buildStrategyMessages(constraintRelaxationStrategy, {
      question: 'q',
      corpusAllowlist: '(allowlist)',
      perCallTarget: 2,
    });
    const system = messages[0]!.content;
    assert.ok(system.includes('constraint_relaxation'));
    assert.ok(system.includes(constraintRelaxationStrategy.signature));
    for (const marker of constraintRelaxationStrategy.requiredMarkers) {
      assert.ok(system.includes(marker), `system prompt must demand ${marker}`);
    }
    // Both perturbation directions must be offered; the placeholder pins the unused one.
    assert.ok(system.includes('RELAX it'));
    assert.ok(system.includes('TIGHTEN it'));
    assert.ok(system.includes('(not used — direction: relax)'));
  });

  it('shared rules (threshold coherence + citation allowlist) are present', () => {
    const system = buildStrategyMessages(constraintRelaxationStrategy, {
      question: 'q',
      corpusAllowlist: '(allowlist)',
      perCallTarget: 1,
    })[0]!.content;
    assert.ok(system.includes('falsificationMethod'));
    assert.ok(system.includes('CITATION RULE'));
  });
});

describe('constraint_relaxation strategy (applicability)', () => {
  it('applies to a full corpus', () => {
    const verdict = constraintRelaxationStrategy.evaluateApplicability({
      question: 'q',
      corpus: makeFullCorpus(),
    });
    assert.deepEqual(verdict, { applicable: true, skipReason: null });
  });

  it('is corpus-size independent (applies even to a single-document corpus)', () => {
    const verdict = constraintRelaxationStrategy.evaluateApplicability({
      question: 'q',
      corpus: makeSingleDocCorpus(),
    });
    assert.deepEqual(verdict, { applicable: true, skipReason: null });
  });
});

describe('constraint_relaxation strategy (offline end-to-end via the fixture seam)', () => {
  it('parses a one-direction candidate carrying the filled marker AND the explicit placeholder', async () => {
    const result = await runStrategyOffline(constraintRelaxationStrategy, {
      hypotheses: [
        makeCandidate({
          statement:
            'Dropping the field-default linear dose–response reveals a threshold regime the corpus reports as anomalous scatter.',
          mechanism:
            'RELAXED_ASSUMPTION: relaxing the default linearity of the dose–response — an inflected response predicts anomalously large high-dose effects that linear fits absorb as noise; ' +
            'TIGHTENED_ASSUMPTION: (not used — direction: relax)',
          falsificationMethod: {
            prediction:
              'Under a threshold (spline) fit, the high-dose residuals shrink by more than the linear fit leaves behind.',
            metric: 'residual reduction ratio',
            comparator: 'gt',
            value: 1.5,
          },
        }),
      ],
    });
    assert.equal(result.hypotheses.length, 1);
    const mechanism = result.hypotheses[0]!.mechanism as string;
    assert.ok(mechanism.includes('RELAXED_ASSUMPTION:'));
    assert.ok(mechanism.includes('TIGHTENED_ASSUMPTION: (not used — direction: relax)'));
  });
});
