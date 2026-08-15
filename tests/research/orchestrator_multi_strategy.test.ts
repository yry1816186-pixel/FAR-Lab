/**
 * tests/research/orchestrator_multi_strategy.test.ts — the discovery fan-out
 * wired into the full Track-1A pipeline (offline end-to-end).
 *
 * Proves: multi_strategy mode runs all 8 stages with per-strategy receipts +
 * a deterministic fan-out receipt; candidates carry strategyOrigin; the
 * deterministic merge gates truncate to targetCount. Since the b3 default
 * flip the bare pipeline IS multi-strategy; the explicit legacy flag keeps
 * the original single-shot path (zero-regression guard).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import { createReplayAdapter } from '../../src/retrieval/index.ts';
import { runResearch } from '../../src/research/orchestrator.ts';
import type { FanoutMeta } from '../../src/discovery/generate.ts';
import { RESEARCH_DEMO_DOCS, RESEARCH_DEMO_FIXTURES } from '../../src/research/research_fixtures.ts';

const QUESTION = 'Why are hot Jupiter radii larger than structure models predict?';

function buildGateway() {
  return createLlmGateway([
    createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES }),
  ]);
}

describe('runResearch with hypothesisGenerationStrategy: multi_strategy (full pipeline)', () => {
  it('runs all stages on the fan-out path with per-strategy provenance', async () => {
    // Holder object: TS flow analysis does not track assignments inside the
    // async callback, a bare `let` would narrow to `never` after the guard.
    const holder: { meta?: FanoutMeta } = {};
    const run = await runResearch({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      hypothesisGenerationStrategy: 'multi_strategy',
      targetHypothesisCount: 3,
      onFanoutComplete: (meta) => {
        holder.meta = meta;
      },
    });

    // Fan-out accounting: 10 strategies ran (demo corpus: docs have no digits
    // in abstracts → data_driven skips honestly; the rest contribute).
    const fanout = holder.meta;
    assert.ok(fanout !== undefined, 'onFanoutComplete must fire');
    assert.equal(fanout.strategiesPlanned.length, 10);
    const skipped = fanout.perStrategy.filter((r) => r.skipReason !== null);
    assert.ok(
      skipped.length === 0 || skipped.every((r) => r.strategyId === 'data_driven'),
      `unexpected skips: ${skipped.map((r) => r.strategyId).join(',')}`,
    );
    // Deterministic truncation to the 3-candidate target.
    assert.equal(run.hypotheses.length, 3);
    assert.equal(fanout.finalCount, 3);
    assert.ok(fanout.truncated.length >= 5, 'the wide fan-out must have been truncated');
    // Every kept candidate is attributed to its strategy.
    assert.ok(run.hypotheses.every((h) => typeof h.strategyOrigin === 'string'));

    // Per-strategy model receipts + the deterministic merge receipt.
    const discoveryReceipts = run.stageReceipts.filter((r) =>
      r.stageId.startsWith('discovery_'),
    );
    const modelReceipts = discoveryReceipts.filter((r) => r.component === 'model');
    assert.ok(modelReceipts.length >= 8, `expected >= 8 strategy receipts, got ${modelReceipts.length}`);
    const fanoutReceipt = discoveryReceipts.find((r) => r.stageId === 'discovery_fanout');
    assert.ok(fanoutReceipt !== undefined, 'deterministic discovery_fanout receipt must exist');
    assert.equal(fanoutReceipt.component, 'deterministic');
    assert.ok(fanoutReceipt.inputHash !== null && fanoutReceipt.outputHash !== null);

    // Downstream stages stayed intact on the fan-out path.
    assert.ok(run.citationGate.gateVerdict.length > 0);
    assert.equal(
      Object.keys(run.falsifiabilityGate.perHypothesis).length,
      run.hypotheses.length,
      'every fan-out candidate passed through the falsifiability gate',
    );
    assert.equal(run.runMode, 'RECORDED_REPLAY');
    assert.ok(run.plan.objectives.length > 0);
  });

  it('strategy subsets flow through (two strategies, honest accounting)', async () => {
    const holder: { meta?: FanoutMeta } = {};
    const run = await runResearch({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      hypothesisGenerationStrategy: 'multi_strategy',
      discoveryStrategies: ['induction', 'contradiction_mining'],
      targetHypothesisCount: 2,
      onFanoutComplete: (meta) => {
        holder.meta = meta;
      },
    });
    const fanout = holder.meta;
    assert.ok(fanout !== undefined);
    assert.deepEqual(fanout.strategiesPlanned, ['induction', 'contradiction_mining']);
    assert.equal(run.hypotheses.length, 2);
    const origins = new Set(run.hypotheses.map((h) => h.strategyOrigin));
    assert.deepEqual([...origins].sort(), ['contradiction_mining', 'induction']);
  });
});

describe('hypothesis-generation default (b3 flip: multi-strategy is the default)', () => {
  it('without the flag the pipeline runs the discovery fan-out', async () => {
    const run = await runResearch({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
    });
    assert.ok(run.hypotheses.length >= 1);
    // Fan-out candidates carry strategy attribution; accounting persisted.
    assert.ok(run.hypotheses.every((h) => h.strategyOrigin !== undefined));
    assert.ok(run.stageReceipts.some((r) => r.stageId === 'discovery_fanout'));
    assert.ok(run.stageReceipts.some((r) => r.stageId === 'discovery_safety_gate'));
    assert.ok(run.discovery !== null && run.discovery.strategy === 'multi_strategy');
    assert.ok(run.discovery.fanout !== null);
  });

  it('explicit legacy flag keeps the original single-shot path (zero-regression guard)', async () => {
    const run = await runResearch({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
      hypothesisGenerationStrategy: 'legacy',
    });
    assert.equal(run.hypotheses.length, 3);
    // Legacy candidates carry NO strategy attribution.
    assert.ok(run.hypotheses.every((h) => h.strategyOrigin === undefined));
    // Original generation receipt; no fan-out/safety receipts on this path.
    // (The deterministic tournament is strategy-agnostic and DOES run.)
    assert.ok(run.stageReceipts.some((r) => r.stageId === 'research_hypotheses'));
    assert.deepEqual(
      run.stageReceipts.filter((r) => r.stageId.startsWith('discovery_')).map((r) => r.stageId),
      ['discovery_tournament'],
    );
    // Legacy runs still record their strategy honestly in the discovery block.
    assert.ok(run.discovery !== null && run.discovery.strategy === 'legacy');
    assert.equal(run.discovery.fanout, null);
  });
});
