/**
 * tests/discovery/generate.test.ts — the fan-out driver and its deterministic
 * merge gates: fail-soft isolation, honest skips, exact dedup, paraphrase
 * flagging, deterministic truncation, budget caps, and fail-closed on total
 * failure / zero candidates.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import { STRATEGY_REGISTRY } from '../../src/discovery/strategies/index.ts';
import { generateHypothesesMultiStrategy } from '../../src/discovery/generate.ts';
import { PARAPHRASE_RISK_MARKER } from '../../src/discovery/types.ts';
import { makeFullCorpus } from './strategies/helpers.ts';

/** Distinct candidate payloads per strategy (no accidental paraphrase overlap). */
function candidateFor(strategyId: string, index: number): Record<string, unknown> {
  const topics: Record<string, { statement: string; mechanism: string }[]> = {
    induction: [
      {
        statement: 'Ceramide accumulation unifies lipid-overload regularities into one insulin-signalling blockade.',
        mechanism: 'Lipid-to-ceramide conversion blocks Akt translocation across both reported regularities.',
      },
      {
        statement: 'A shared unfolded-protein response explains ER-stress and cytokine observations jointly.',
        mechanism: 'Endoplasmic reticulum stress drives cytokine secretion through one upstream sensor.',
      },
    ],
    analogy: [
      {
        statement: 'Predator-prey cycles imported from ecology explain immune-effector tumor dynamics.',
        mechanism: 'Effector and tumor populations form a Lotka-Volterra pair with lagged damping.',
      },
      {
        statement: 'Network percolation imported from geology explains sudden seizure onsets.',
        mechanism: 'Neuronal connectivity crosses a critical percolation threshold before onset.',
      },
    ],
    failure_mining: [
      {
        statement: 'The untested longitudinal ceramide-relapse gap seeds a slow-turnover reservoir conjecture.',
        mechanism: 'Residual ceramide pools with slow turnover maintain signalling blockade after lipid normalization.',
      },
      {
        statement: 'The admitted absence of interventional data seeds a counterfactual dosing conjecture.',
        mechanism: 'Stepped ceramide-lowering dosing should produce a threshold response in sensitivity.',
      },
    ],
  };
  const topic = topics[strategyId]?.[index] ?? {
    statement: `Distinct statement ${strategyId}-${index}`,
    mechanism: `Distinct mechanism ${strategyId}-${index}`,
  };
  return {
    statement: topic.statement,
    mechanism: `${topic.mechanism} [strategy ${strategyId} variant ${index}]`,
    falsificationMethod: {
      prediction: `Prediction ${strategyId}-${index}`,
      metric: `metric-${strategyId}-${index}`,
      comparator: 'gt',
      value: 0.5 + index,
    },
    supportingCitations: [],
    counterEvidenceCitations: [],
    relationToExistingTheory: `theory-${strategyId}-${index}`,
    alternativeExplanations: [`alt-${strategyId}-${index}`],
    observablePredictions: [`pred-${strategyId}-${index}`],
    distinguishingObservations: [`dist-${strategyId}-${index}`],
    noveltyRelativeToCorpus: `novelty-${strategyId}-${index}`,
    assumptions: [`assumption-${strategyId}-${index}`],
    risks: [`risk-${strategyId}-${index}`],
  };
}

function gatewayWith(fixtures: Record<string, unknown>) {
  return createLlmGateway([
    createOfflineReplayAdapter({
      fixtures: Object.fromEntries(
        Object.entries(fixtures).map(([k, v]) => [k, JSON.stringify(v)]),
      ),
    }),
  ]);
}

const QUESTION = 'Why does insulin resistance develop in skeletal muscle?';

describe('generateHypothesesMultiStrategy (happy path + accounting)', () => {
  it('merges per-strategy candidates with full deterministic accounting', async () => {
    const gateway = gatewayWith({
      discovery_induction: { hypotheses: [candidateFor('induction', 0), candidateFor('induction', 1)] },
      discovery_analogy: { hypotheses: [candidateFor('analogy', 0)] },
      discovery_failure_mining: { hypotheses: [candidateFor('failure_mining', 0)] },
    });
    const result = await generateHypothesesMultiStrategy(gateway, 'offline_replay', {
      question: QUESTION,
      corpus: makeFullCorpus(),
      targetCount: 3,
      strategyIds: ['induction', 'analogy', 'failure_mining'],
    });
    assert.equal(result.hypotheses.length, 3);
    assert.equal(result.meta.finalCount, 3);
    assert.equal(result.meta.quotaShortfall, 0);
    assert.equal(result.meta.exactDuplicatesDropped, 0);
    assert.equal(result.meta.paraphraseFlagged.length, 0);
    assert.deepEqual(result.meta.strategiesPlanned, ['induction', 'analogy', 'failure_mining']);
    // Every kept candidate carries its strategy attribution.
    assert.ok(result.hypotheses.every((h) => typeof h.strategyOrigin === 'string'));
    // Deterministic order: strategy index first.
    assert.equal(result.hypotheses[0]!.strategyOrigin, 'induction');
    // Per-strategy provenance receipts preserved.
    assert.ok(result.meta.perStrategy.every((r) => r.meta !== null && r.error === null));
  });

  it('defaults to every registered strategy when no subset is given', async () => {
    const fixtures: Record<string, unknown> = {};
    for (const s of STRATEGY_REGISTRY) {
      fixtures[`discovery_${s.id}`] = { hypotheses: [candidateFor(s.id, 0)] };
    }
    const result = await generateHypothesesMultiStrategy(gatewayWith(fixtures), 'offline_replay', {
      question: QUESTION,
      corpus: makeFullCorpus(),
      targetCount: 3,
    });
    assert.deepEqual(
      result.meta.strategiesPlanned,
      STRATEGY_REGISTRY.map((s) => s.id),
    );
  });
});

describe('fan-out fail-soft isolation', () => {
  it('one strategy failing does not sink the fan-out — error recorded, others stand', async () => {
    // discovery_analogy has NO fixture → its offline call fails (2 attempts) → fail-soft.
    const gateway = gatewayWith({
      discovery_induction: { hypotheses: [candidateFor('induction', 0)] },
      discovery_failure_mining: { hypotheses: [candidateFor('failure_mining', 0)] },
    });
    const result = await generateHypothesesMultiStrategy(gateway, 'offline_replay', {
      question: QUESTION,
      corpus: makeFullCorpus(),
      targetCount: 2,
      strategyIds: ['induction', 'analogy', 'failure_mining'],
    });
    assert.equal(result.hypotheses.length, 2);
    const analogy = result.meta.perStrategy.find((r) => r.strategyId === 'analogy')!;
    assert.equal(analogy.candidates.length, 0);
    assert.match(analogy.error ?? '', /discovery_analogy/);
    assert.equal(analogy.meta, null);
  });

  it('every attempted strategy failing throws fail-closed with per-strategy reasons', async () => {
    const gateway = gatewayWith({ discovery_unused: { hypotheses: [] } });
    await assert.rejects(
      () =>
        generateHypothesesMultiStrategy(gateway, 'offline_replay', {
          question: QUESTION,
          corpus: makeFullCorpus(),
          strategyIds: ['analogy'],
        }),
      /failed on every attempted strategy \(fail-closed\).*analogy/,
    );
  });

  it('an honest skip is recorded, not fabricated around (single-doc corpus)', async () => {
    // induction skips (<2 docs); with induction as the ONLY strategy the merge
    // has nothing → fail-closed naming the skip reason.
    const gateway = gatewayWith({
      discovery_induction: { hypotheses: [candidateFor('induction', 0)] },
    });
    const singleDoc = makeFullCorpus();
    const tinyCorpus = {
      ...singleDoc,
      documents: [singleDoc.documents[0]!],
      documentCount: 1,
    };
    await assert.rejects(
      () =>
        generateHypothesesMultiStrategy(gateway, 'offline_replay', {
          question: QUESTION,
          corpus: tinyCorpus,
          strategyIds: ['induction'],
        }),
      /zero merged candidates.*induction: induction needs >= 2 corpus documents/,
    );
  });
});

describe('deterministic merge gates', () => {
  it('exact content-hash duplicates across strategies are dropped and counted', async () => {
    const twin = candidateFor('induction', 0);
    const gateway = gatewayWith({
      discovery_induction: { hypotheses: [twin] },
      discovery_analogy: { hypotheses: [twin] },
    });
    const result = await generateHypothesesMultiStrategy(gateway, 'offline_replay', {
      question: QUESTION,
      corpus: makeFullCorpus(),
      targetCount: 3,
      strategyIds: ['induction', 'analogy'],
    });
    assert.equal(result.hypotheses.length, 1);
    assert.equal(result.meta.exactDuplicatesDropped, 1);
  });

  it('near-duplicate paraphrase pairs: later dropped, kept candidate stamped PARAPHRASE_RISK', async () => {
    const base = candidateFor('induction', 0);
    // Same statement; mechanism differs ONLY by a stopword the tokenizer
    // removes → different content hash, lexical similarity ≈ 1.
    const nearTwin = {
      ...base,
      mechanism: `${String(base.mechanism)} the`,
    };
    const gateway = gatewayWith({
      discovery_induction: { hypotheses: [base] },
      discovery_analogy: { hypotheses: [nearTwin] },
    });
    const result = await generateHypothesesMultiStrategy(gateway, 'offline_replay', {
      question: QUESTION,
      corpus: makeFullCorpus(),
      targetCount: 3,
      strategyIds: ['induction', 'analogy'],
    });
    assert.equal(result.hypotheses.length, 1);
    assert.equal(result.meta.paraphraseFlagged.length, 1);
    const flag = result.meta.paraphraseFlagged[0]!;
    assert.equal(flag.keptStrategy, 'induction');
    assert.equal(flag.droppedStrategy, 'analogy');
    assert.ok(flag.similarity >= 0.85);
    assert.ok(
      result.hypotheses[0]!.risks.some((r) => r.startsWith(PARAPHRASE_RISK_MARKER)),
      'kept candidate must carry the PARAPHRASE_RISK stamp in risks',
    );
  });

  it('truncation to targetCount is deterministic (strategy index, then id) and recorded', async () => {
    const gateway = gatewayWith({
      discovery_induction: {
        hypotheses: [candidateFor('induction', 0), candidateFor('induction', 1)],
      },
      discovery_analogy: { hypotheses: [candidateFor('analogy', 0), candidateFor('analogy', 1)] },
    });
    const opts = {
      question: QUESTION,
      corpus: makeFullCorpus(),
      targetCount: 2,
      strategyIds: ['induction', 'analogy'] as const,
    };
    const a = await generateHypothesesMultiStrategy(gateway, 'offline_replay', opts);
    const b = await generateHypothesesMultiStrategy(gateway, 'offline_replay', opts);
    assert.equal(a.hypotheses.length, 2);
    assert.equal(a.meta.truncated.length, 2);
    assert.deepEqual(a.hypotheses.map((h) => h.id), b.hypotheses.map((h) => h.id));
    assert.deepEqual(a.meta.truncated, b.meta.truncated);
    // All truncated entries are from the later strategy (index 1).
    assert.ok(a.meta.truncated.every((t) => t.strategyId === 'analogy'));
  });

  it('quota shortfall is reported honestly, never padded', async () => {
    const gateway = gatewayWith({
      discovery_analogy: { hypotheses: [candidateFor('analogy', 0)] },
    });
    const result = await generateHypothesesMultiStrategy(gateway, 'offline_replay', {
      question: QUESTION,
      corpus: makeFullCorpus(),
      targetCount: 3,
      strategyIds: ['analogy'],
    });
    assert.equal(result.hypotheses.length, 1);
    assert.equal(result.meta.quotaShortfall, 2);
  });

  it('maxStrategies caps the strategy LIST deterministically (later strategies never called)', async () => {
    // Only induction gets a fixture; the cap keeps analogy from being called,
    // so its missing fixture would NOT fail the run.
    const gateway = gatewayWith({
      discovery_induction: { hypotheses: [candidateFor('induction', 0)] },
    });
    const result = await generateHypothesesMultiStrategy(gateway, 'offline_replay', {
      question: QUESTION,
      corpus: makeFullCorpus(),
      targetCount: 1,
      strategyIds: ['induction', 'analogy'],
      maxStrategies: 1,
    });
    assert.deepEqual(result.meta.strategiesPlanned, ['induction']);
    assert.equal(result.meta.perStrategy.length, 1);
    assert.equal(result.hypotheses.length, 1);
  });
});
