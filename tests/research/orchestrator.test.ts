/**
 * tests/research/orchestrator.test.ts — research vertical slice wiring.
 *
 * Proves the FULL pipeline (ground → generate → critique → score → plan →
 * ResearchRun) runs end-to-end on the OFFLINE (synthetic) path: 3 hypotheses,
 * all citations bound, a deterministic primary selection, a plan with
 * objectives, and RECORDED_REPLAY mode. Also pins the pure helpers
 * (aggregateRunMode, selectPrimaryHypothesis).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import { createReplayAdapter } from '../../src/retrieval/index.ts';
import {
  runResearch,
  aggregateRunMode,
  selectPrimaryHypothesis,
} from '../../src/research/orchestrator.ts';
import { RESEARCH_DEMO_DOCS, RESEARCH_DEMO_FIXTURES } from '../../src/research/research_fixtures.ts';

describe('aggregateRunMode (pure)', () => {
  it('LIVE only when all science components are LIVE', () => {
    assert.equal(
      aggregateRunMode({
        modelExecutionMode: 'LIVE',
        retrievalExecutionMode: 'LIVE',
        experimentExecutionMode: 'NOT_EXECUTED',
      }),
      'LIVE',
    );
  });

  it('RECORDED_REPLAY when all are replay/offline', () => {
    assert.equal(
      aggregateRunMode({
        modelExecutionMode: 'RECORDED_REPLAY',
        retrievalExecutionMode: 'RECORDED_REPLAY',
        experimentExecutionMode: 'NOT_EXECUTED',
      }),
      'RECORDED_REPLAY',
    );
  });

  it('MIXED when live + replay are mixed', () => {
    assert.equal(
      aggregateRunMode({
        modelExecutionMode: 'LIVE',
        retrievalExecutionMode: 'RECORDED_REPLAY',
        experimentExecutionMode: 'NOT_EXECUTED',
      }),
      'MIXED',
    );
  });
});

describe('runResearch — offline vertical slice (synthetic, RECORDED_REPLAY)', () => {
  const gateway = createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
  const adapter = createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS);

  it('produces 3 hypotheses, all bound, with a plan and RECORDED_REPLAY mode', async () => {
    const run = await runResearch({
      question: 'Does stellar activity inflate hot Jupiter radii?',
      gateway,
      profile: 'offline_replay',
      grounding: { adapter },
      targetHypothesisCount: 3,
    });

    assert.equal(run.hypotheses.length, 3);
    assert.equal(run.runMode, 'RECORDED_REPLAY');

    // Every hypothesis has a citation binding with 0 unbound citations.
    for (const h of run.hypotheses) {
      const b = run.bindings[h.id];
      assert.ok(b, `binding missing for ${h.id}`);
      assert.equal(b.allBound, true, `unbound citations for ${h.id}: ${b.unbound.join(',')}`);
    }

    // Every hypothesis has a scorecard + a critique.
    for (const h of run.hypotheses) {
      assert.ok(run.scorecards[h.id], `scorecard missing for ${h.id}`);
      assert.ok(run.critiques[h.id], `critique missing for ${h.id}`);
    }

    // Primary selection is one of the hypotheses, and the plan references it.
    assert.ok(run.hypotheses.some((h) => h.id === run.plan.primaryHypothesisId));
    assert.ok(run.plan.objectives.length >= 1);
    assert.ok(run.plan.statisticalMethods.length >= 1);
  });

  it('is deterministic (same fixtures → same hypothesis ids + same primary)', async () => {
    const a = await runResearch({
      question: 'Q',
      gateway,
      profile: 'offline_replay',
      grounding: { adapter },
      targetHypothesisCount: 3,
    });
    const b = await runResearch({
      question: 'Q',
      gateway,
      profile: 'offline_replay',
      grounding: { adapter },
      targetHypothesisCount: 3,
    });
    assert.deepEqual(
      a.hypotheses.map((h) => h.id),
      b.hypotheses.map((h) => h.id),
    );
    assert.equal(a.plan.primaryHypothesisId, b.plan.primaryHypothesisId);
    assert.deepEqual(a.scorecards, b.scorecards);
  });
});

describe('selectPrimaryHypothesis (pure, deterministic)', () => {
  it('picks the Pareto-optimal candidate with the best deterministic total', () => {
    // Use the offline fixtures to build real candidates + scorecards.
    const gateway = createLlmGateway([
      createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES }),
    ]);
    const adapter = createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS);
    // async IIFE-free: call runResearch then re-derive selection deterministically.
    return runResearch({
      question: 'Q',
      gateway,
      profile: 'offline_replay',
      grounding: { adapter },
    }).then((run) => {
      const primary = selectPrimaryHypothesis(run.hypotheses, run.scorecards);
      assert.ok(run.scorecards[primary.id]?.paretoOptimal === true);
    });
  });
});
