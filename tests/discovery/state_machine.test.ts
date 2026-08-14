/**
 * tests/discovery/state_machine.test.ts — ConjectureState ladder (directive §2.4).
 *
 * Pins: the legal ladder walk, fail-closed evidence requirements for the two
 * terminal promotions (a rediscovery must name the matched literature; a
 * novel validation must cite a human review — AI never self-certifies), and
 * the closed strategy catalog / deterministic subset parsing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONJECTURE_STATES,
  CONJECTURE_TRANSITIONS,
  TERMINAL_CONJECTURE_STATES,
  transitionConjectureState,
  isTerminalConjectureState,
  STRATEGY_IDS,
  parseStrategyIdList,
} from '../../src/discovery/types.ts';
import { STRATEGY_REGISTRY } from '../../src/discovery/strategies/index.ts';

describe('ConjectureState ladder (legal transitions)', () => {
  it('walks the full legal ladder RAW_IDEA → NOVEL_VALIDATED with typed evidence', () => {
    let state = transitionConjectureState('RAW_IDEA', 'STRUCTURED_CONJECTURE', {
      deterministicCheckRef: 'candidate-schema-valid',
    });
    state = transitionConjectureState(state, 'CORROBORATED', {
      deterministicCheckRef: 'corpus-binding-3-docs',
    });
    state = transitionConjectureState(state, 'KERNEL_ADJUDICATED', {
      deterministicCheckRef: 'verdict-run-01M',
    });
    state = transitionConjectureState(state, 'NOVEL_VALIDATED', {
      deterministicCheckRef: 'novelty-distance-0.92',
      humanReviewRef: 'human-review-2026-08-15',
    });
    assert.equal(state, 'NOVEL_VALIDATED');
    assert.equal(isTerminalConjectureState(state), true);
  });

  it('KERNEL_ADJUDICATED → REDISCOVERY with the matching literature named', () => {
    const state = transitionConjectureState('KERNEL_ADJUDICATED', 'REDISCOVERY', {
      matchingLiterature: 'doi:10.1038/s41586-021-03819-2',
    });
    assert.equal(state, 'REDISCOVERY');
    assert.equal(isTerminalConjectureState(state), true);
  });

  it('REDISCOVERY and NOVEL_VALIDATED are the only terminal states', () => {
    assert.deepEqual(
      CONJECTURE_STATES.filter((s) => isTerminalConjectureState(s)),
      ['REDISCOVERY', 'NOVEL_VALIDATED'],
    );
    assert.equal(TERMINAL_CONJECTURE_STATES.size, 2);
  });
});

describe('ConjectureState ladder (fail-closed)', () => {
  it('rejects skipping ladder rungs (RAW_IDEA → CORROBORATED)', () => {
    assert.throws(
      () => transitionConjectureState('RAW_IDEA', 'CORROBORATED'),
      /illegal conjecture transition/,
    );
  });

  it('rejects every transition out of terminal states', () => {
    for (const terminal of ['REDISCOVERY', 'NOVEL_VALIDATED'] as const) {
      for (const target of CONJECTURE_STATES) {
        assert.throws(
          () => transitionConjectureState(terminal, target),
          /illegal conjecture transition/,
          `${terminal} → ${target} must be rejected`,
        );
      }
    }
  });

  it('rejects NOVEL_VALIDATED without a human-review reference (AI never self-certifies)', () => {
    assert.throws(
      () => transitionConjectureState('KERNEL_ADJUDICATED', 'NOVEL_VALIDATED'),
      /humanReviewRef/,
    );
    assert.throws(
      () =>
        transitionConjectureState('KERNEL_ADJUDICATED', 'NOVEL_VALIDATED', {
          humanReviewRef: '   ',
        }),
      /humanReviewRef/,
    );
  });

  it('rejects REDISCOVERY without naming the matched literature', () => {
    assert.throws(
      () => transitionConjectureState('KERNEL_ADJUDICATED', 'REDISCOVERY'),
      /matchingLiterature/,
    );
  });

  it('terminal states have no legal outgoing edges in the transition table', () => {
    assert.deepEqual(CONJECTURE_TRANSITIONS.REDISCOVERY, []);
    assert.deepEqual(CONJECTURE_TRANSITIONS.NOVEL_VALIDATED, []);
  });
});

describe('strategy catalog (directive §2.1 — full catalog 10, min quota 8)', () => {
  it('has 10 unique strategy ids in a fixed catalog order', () => {
    assert.equal(STRATEGY_IDS.length, 10);
    assert.equal(new Set(STRATEGY_IDS).size, 10);
    assert.equal(STRATEGY_IDS[0], 'induction');
    assert.equal(STRATEGY_IDS[9], 'data_driven');
  });

  it('parses a user subset into catalog order regardless of input order', () => {
    assert.deepEqual(parseStrategyIdList('analogy,induction'), ['induction', 'analogy']);
    assert.deepEqual(parseStrategyIdList('data_driven+induction'), ['induction', 'data_driven']);
  });

  it('fail-closes on unknown strategy names and empty lists', () => {
    assert.throws(() => parseStrategyIdList('induction,telepathy'), /unknown strategy id\(s\): telepathy/);
    assert.throws(() => parseStrategyIdList(',,,'), /must not be empty/);
  });

  it('registry registers every catalog strategy exactly once, in catalog order (append-only guard)', () => {
    assert.equal(STRATEGY_REGISTRY.length, STRATEGY_IDS.length);
    assert.deepEqual(
      STRATEGY_REGISTRY.map((s) => s.id),
      [...STRATEGY_IDS],
    );
    // Every registered strategy declares at least one structural marker —
    // the anti-"prompt wrapper" contract (scenario #30 of the decision record).
    for (const s of STRATEGY_REGISTRY) {
      assert.ok(s.requiredMarkers.length >= 1, `${s.id} must declare structural markers`);
      assert.ok(s.maxPerCall >= 1 && s.maxPerCall <= 3, `${s.id} maxPerCall must be 1..3`);
      assert.ok(typeof s.evaluateApplicability === 'function');
    }
  });
});
