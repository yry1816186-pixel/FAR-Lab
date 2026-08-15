/**
 * tests/discovery/strategies/adjudicability_schema.test.ts — b6-S1 structured
 * adjudicability at the generation boundary.
 *
 * Pins the dual contract:
 *   - NEW GENERATION (requireAdjudicability: true — what generate.ts passes
 *     for every live profile): a model output missing `direction` /
 *     `metricShape` fails structured validation and enters the existing
 *     two-attempt repair path; a complete output parses with both fields
 *     preserved and mapCandidates passes them into the candidate.
 *   - REPLAY / LEGACY (default false — what generate.ts passes for
 *     'offline_replay'): pre-b6 fixtures lacking the fields parse BYTE-STABLY
 *     (the parsed output is byte-identical to the fixture's own serialization
 *     — "not recorded" is never "did not happen").
 *
 * Plus the b6-S1 signature ruling guard: the strategy signature strings (and
 * therefore registry strategySignatureHash values) are UNCHANGED by the schema
 * tightening — pinned as sha256 constants so any future signature edit fails
 * this test loudly instead of silently invalidating old ledger hashes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createLlmGateway } from '../../../src/llm_gateway/gateway.ts';
import type { LlmRequest, LlmResponse, ProviderAdapter } from '../../../src/llm_gateway/types.ts';
import { generateHypothesesMultiStrategy } from '../../../src/discovery/generate.ts';
import { rawSha256Hex } from '../../../src/retrieval/hash.ts';
import { STRATEGY_REGISTRY } from '../../../src/discovery/strategies/index.ts';
import {
  buildStrategySchema,
  buildStrategySystemPrompt,
} from '../../../src/discovery/strategies/strategy.ts';
import { makeCandidate, makeFullCorpus, runStrategyOffline } from './helpers.ts';

const INDUCTION = STRATEGY_REGISTRY.find((s) => s.id === 'induction')!;
const ABDUCTION = STRATEGY_REGISTRY.find((s) => s.id === 'abduction')!;

/** A candidate carrying the b6-S1 structured adjudicability fields. */
function adjudicableCandidate(index: number): Record<string, unknown> {
  const topics = [
    {
      statement: 'Ceramide accumulation blocks insulin signalling via Akt translocation arrest.',
      mechanism: 'REGULARITY_1: intramyocellular lipid tracks insulin resistance; UNIFIED_MECHANISM: lipid-to-ceramide conversion halts Akt membrane recruitment.',
      prediction: 'Ceramide-lowering restores insulin sensitivity proportionally to lipid turnover.',
    },
    {
      statement: 'Predator-prey coupling between immune effectors and tumor cells explains relapse timing.',
      mechanism: 'REGULARITY_1: effector-tumor ratios oscillate pre-relapse; UNIFIED_MECHANISM: lagged Lotka-Volterra damping governs the cycle period.',
      prediction: 'Relapse interval lengthens monotonically with effector expansion rate.',
    },
  ];
  const topic = topics[index] ?? topics[0]!;
  return makeCandidate({
    statement: topic.statement,
    mechanism: topic.mechanism,
    falsificationMethod: {
      prediction: topic.prediction,
      metric: `metric-${index}`,
      comparator: 'gt',
      value: 0.5,
      direction: 'positive',
      metricShape: 'correlation',
    },
  });
}

/** Deterministic live-profile fixture adapter (returns a fixed fixture; ignores messages). */
function liveFixtureAdapter(fixtureFor: (stageId: string) => unknown): ProviderAdapter {
  return {
    profile: 'local_open_weights',
    async call(_request: LlmRequest): Promise<LlmResponse> {
      const stageId = _request.stageId ?? 'unknown-stage';
      return {
        credential: {
          providerProfile: 'local_open_weights',
          providerRequestId: null,
          modelId: 'fixture-adjudicability',
          modelVersion: null,
          capability: 'structured',
          isoTimestamp: '2026-08-15T00:00:00.000Z',
          tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, measured: false },
        },
        content: JSON.stringify(fixtureFor(stageId)),
        raw: null,
      };
    },
  };
}

describe('buildStrategySchema — requireAdjudicability matrix (b6-S1)', () => {
  it('default (replay/legacy): a pre-b6 fixture without the fields still parses', () => {
    const parsed = buildStrategySchema(3).parse({ hypotheses: [makeCandidate()] });
    assert.equal(parsed.hypotheses.length, 1);
    assert.equal(parsed.hypotheses[0]!.falsificationMethod.direction, undefined);
    assert.equal(parsed.hypotheses[0]!.falsificationMethod.metricShape, undefined);
  });

  it('requireAdjudicability rejects a candidate missing direction (repair path entry)', () => {
    const missingDirection = makeCandidate({
      falsificationMethod: {
        prediction: 'p', metric: 'm', comparator: 'gt', value: 1,
        metricShape: 'correlation',
      },
    });
    assert.throws(
      () => buildStrategySchema(3, { requireAdjudicability: true }).parse({ hypotheses: [missingDirection] }),
      /direction/,
    );
  });

  it('requireAdjudicability rejects a candidate missing metricShape', () => {
    const missingShape = makeCandidate({
      falsificationMethod: {
        prediction: 'p', metric: 'm', comparator: 'gt', value: 1,
        direction: 'positive',
      },
    });
    assert.throws(
      () => buildStrategySchema(3, { requireAdjudicability: true }).parse({ hypotheses: [missingShape] }),
      /metricShape/,
    );
  });

  it('requireAdjudicability rejects values outside the closed enums (fail-closed, never guessed)', () => {
    const badDirection = makeCandidate({
      falsificationMethod: {
        prediction: 'p', metric: 'm', comparator: 'gt', value: 1,
        direction: 'up', metricShape: 'correlation',
      },
    });
    assert.throws(
      () => buildStrategySchema(3, { requireAdjudicability: true }).parse({ hypotheses: [badDirection] }),
      /direction/,
    );
    const badShape = makeCandidate({
      falsificationMethod: {
        prediction: 'p', metric: 'm', comparator: 'gt', value: 1,
        direction: 'positive', metricShape: 'slope',
      },
    });
    assert.throws(
      () => buildStrategySchema(3, { requireAdjudicability: true }).parse({ hypotheses: [badShape] }),
      /metricShape/,
    );
  });

  it('requireAdjudicability accepts a complete candidate and preserves both fields', () => {
    const parsed = buildStrategySchema(3, { requireAdjudicability: true }).parse({
      hypotheses: [adjudicableCandidate(0)],
    });
    assert.equal(parsed.hypotheses[0]!.falsificationMethod.direction, 'positive');
    assert.equal(parsed.hypotheses[0]!.falsificationMethod.metricShape, 'correlation');
  });

  it('threshold coherence is not diluted by the new fields (gt without value still rejected)', () => {
    const incoherent = makeCandidate({
      falsificationMethod: {
        prediction: 'p', metric: 'm', comparator: 'gt',
        direction: 'positive', metricShape: 'correlation',
      },
    });
    assert.throws(
      () => buildStrategySchema(3, { requireAdjudicability: true }).parse({ hypotheses: [incoherent] }),
      /value/,
    );
  });
});

describe('offline replay byte-stability (b6-S1 constraint 2)', () => {
  it('an old fixture replays through the strategy seam byte-identically across runs', async () => {
    const fixture = makeCandidate();
    const first = await runStrategyOffline(INDUCTION, { hypotheses: [fixture] });
    const second = await runStrategyOffline(INDUCTION, { hypotheses: [fixture] });
    const firstBytes = JSON.stringify(first);
    const secondBytes = JSON.stringify(second);
    assert.equal(firstBytes, secondBytes, 'same fixture → byte-identical parse output');
    assert.equal(firstBytes, JSON.stringify({ hypotheses: [fixture] }), 'parse output equals the fixture serialization (no field injection/stripping)');
  });

  it('offline_replay fan-out accepts pre-b6 fixtures (the orchestrator replay path stays intact)', async () => {
    const gateway = createLlmGateway([liveFixtureAdapterForReplay({ hypotheses: [makeCandidate()] })]);
    const result = await generateHypothesesMultiStrategy(gateway, 'offline_replay', {
      question: 'Why does insulin resistance develop in skeletal muscle?',
      corpus: makeFullCorpus(),
      strategyIds: ['induction'],
    });
    assert.equal(result.hypotheses.length, 1);
    assert.equal(result.hypotheses[0]!.falsificationMethod.direction, undefined, 'fields stay absent on replayed pre-b6 content');
    assert.equal(result.hypotheses[0]!.falsificationMethod.metricShape, undefined);
  });
});

/** offline_replay-profile fixture adapter (same shape as the live fixture adapter, keyed to the replay profile). */
function liveFixtureAdapterForReplay(fixture: unknown): ProviderAdapter {
  return {
    profile: 'offline_replay',
    async call(_request: LlmRequest): Promise<LlmResponse> {
      void _request;
      return {
        credential: {
          providerProfile: 'offline_replay',
          providerRequestId: null,
          modelId: 'fixture-replay',
          modelVersion: null,
          capability: 'structured',
          isoTimestamp: '2026-08-15T00:00:00.000Z',
          tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, measured: false },
        },
        content: JSON.stringify(fixture),
        raw: null,
      };
    },
  };
}

describe('live generation wiring (generate.ts profile gate, b6-S1)', () => {
  const QUESTION = 'Why does insulin resistance develop in skeletal muscle?';

  it('a live profile REQUIRES the fields: an old-style fixture fails fail-soft with the violation recorded', async () => {
    const gateway = createLlmGateway([
      liveFixtureAdapter((stageId) =>
        stageId === 'discovery_induction'
          ? { hypotheses: [adjudicableCandidate(0)] }
          : { hypotheses: [makeCandidate({ statement: `Other ${stageId}`, mechanism: `REGULARITY_1: mech ${stageId}` })] },
      ),
    ]);
    const result = await generateHypothesesMultiStrategy(gateway, 'local_open_weights', {
      question: QUESTION,
      corpus: makeFullCorpus(),
      strategyIds: ['induction', 'abduction'],
    });
    const inductionReceipt = result.meta.perStrategy.find((r) => r.strategyId === 'induction')!;
    const abductionReceipt = result.meta.perStrategy.find((r) => r.strategyId === 'abduction')!;
    assert.equal(inductionReceipt.error, null, 'complete fixture passes the strict contract');
    assert.ok(abductionReceipt.error !== null && /direction|metricShape/.test(abductionReceipt.error), 'missing fields surface in the recorded error (repair path exhausted)');
    assert.equal(result.hypotheses.length, 1, 'only the compliant strategy contributes');
    assert.equal(result.hypotheses[0]!.falsificationMethod.direction, 'positive', 'mapCandidates passes the structured fields through');
    assert.equal(result.hypotheses[0]!.falsificationMethod.metricShape, 'correlation');
  });

  it('complete live fixtures carry the structured fields end-to-end', async () => {
    const gateway = createLlmGateway([
      liveFixtureAdapter((stageId) => ({
        hypotheses: [adjudicableCandidate(stageId === 'discovery_induction' ? 0 : 1)],
      })),
    ]);
    const result = await generateHypothesesMultiStrategy(gateway, 'local_open_weights', {
      question: QUESTION,
      corpus: makeFullCorpus(),
      strategyIds: ['induction', 'abduction'],
      targetCount: 2,
    });
    assert.equal(result.hypotheses.length, 2);
    assert.ok(result.hypotheses.every((h) => h.falsificationMethod.direction === 'positive' && h.falsificationMethod.metricShape === 'correlation'));
  });
});

describe('signature semantics ruling guard (b6-S1: signature strings unchanged)', () => {
  it('strategy signature hashes are pinned — a schema tightening must NOT invalidate old ledger hashes', () => {
    // Values computed 2026-08-15 from the registry strings (rawSha256Hex of the
    // signature). If this test fails, a signature string was edited: that is a
    // CONTRACT change and requires an explicit registry-provenance ruling.
    assert.equal(
      rawSha256Hex(INDUCTION.signature),
      '98c16a9855efebc0f0713e70d788f6706c2723413cd8abaac633b24ead573661',
    );
    assert.equal(
      rawSha256Hex(ABDUCTION.signature),
      '9ccc1a0cbf18ca51074972cbc4a22ee6c6ac8363f50a69d4a48bb959316b88ee',
    );
  });

  it('the system prompt instructs the model about the structured fields (generation-time contract)', () => {
    const prompt = buildStrategySystemPrompt(INDUCTION, 1);
    assert.ok(prompt.includes('STRUCTURED ADJUDICABILITY'));
    assert.ok(prompt.includes('"metricShape"'));
    assert.ok(prompt.includes('"direction"'));
  });
});
