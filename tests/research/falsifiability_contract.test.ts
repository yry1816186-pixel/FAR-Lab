/**
 * tests/research/falsifiability_contract.test.ts — threshold-coherence contract.
 *
 * Regression coverage for the 2026-08-14 live-run defect:
 *   live Qwen emitted falsificationMethod {comparator:'gt', lower, upper}
 *   (schema-accepted), every hypothesis then FAILED the falsifiability gate,
 *   and the old all-hypotheses fallback still promoted a gate-FAILED
 *   hypothesis to PRIMARY. Three contracts now pinned:
 *     D1  generation-boundary: incoherent threshold combos are rejected by
 *         the model-output schema (and repaired on retry with the error fed back)
 *     D2  fail-closed: no fully-bound+falsifiable candidate → the run aborts;
 *         `far research verify` flags a stored run that violated this
 *     D3  (api gateway-for-run) is covered by tests/api/research*.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { z } from 'zod';
import { createLlmGateway, type LlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import type { LlmRequest, LlmResponse, ProviderAdapter, ProviderProfile } from '../../src/llm_gateway/types.ts';
import { createReplayAdapter } from '../../src/retrieval/index.ts';
import {
  FalsificationMethodZod,
  parseResearchRunJson,
} from '../../src/research/schemas.ts';
import { callStructuredJson } from '../../src/research/llm.ts';
import {
  runResearch,
  admissibleHypotheses,
} from '../../src/research/orchestrator.ts';
import { verifyResearchRunDeterministic } from '../../src/research/verification.ts';
import { computeFalsifiabilityGateReport } from '../../src/research/falsifiability_gate.ts';
import { RESEARCH_DEMO_DOCS, RESEARCH_DEMO_FIXTURES } from '../../src/research/research_fixtures.ts';
import type { ResearchRun } from '../../src/research/types.ts';

const baseMethod = {
  prediction: 'p',
  metric: 'pearson_r',
};

describe('D1 · FalsificationMethodZod threshold coherence (generation boundary)', () => {
  it('REJECTS gt with only lower/upper (the live-defect shape)', () => {
    const result = FalsificationMethodZod.safeParse({
      ...baseMethod,
      comparator: 'gt',
      lower: 0.5,
      upper: 5,
    });
    assert.equal(result.success, false, 'gt without value must be rejected');
    assert.match(result.success ? '' : result.error.issues[0]!.message, /requires a finite numeric "value"/);
  });

  it('REJECTS lt with no threshold at all', () => {
    const result = FalsificationMethodZod.safeParse({ ...baseMethod, comparator: 'lt' });
    assert.equal(result.success, false);
  });

  it('REJECTS range with inverted bounds', () => {
    const result = FalsificationMethodZod.safeParse({
      ...baseMethod,
      comparator: 'range',
      lower: 5,
      upper: 0.5,
    });
    assert.equal(result.success, false);
    assert.match(result.success ? '' : result.error.issues[0]!.message, /lower < upper/);
  });

  it('REJECTS range missing upper', () => {
    const result = FalsificationMethodZod.safeParse({
      ...baseMethod,
      comparator: 'range',
      lower: 0,
    });
    assert.equal(result.success, false);
  });

  it('accepts coherent shapes: gt+value, lt+value, range lower<upper', () => {
    for (const method of [
      { ...baseMethod, comparator: 'gt', value: 0.5 },
      { ...baseMethod, comparator: 'lt', value: 1 },
      { ...baseMethod, comparator: 'range', lower: 0, upper: 1 },
    ]) {
      const result = FalsificationMethodZod.safeParse(method);
      assert.equal(result.success, true, JSON.stringify(method));
    }
  });
});

describe('D1 · callStructuredJson repair feeds the validation error back', () => {
  class RecordingAdapter implements ProviderAdapter {
    readonly profile: ProviderProfile = 'offline_replay';
    readonly requests: LlmRequest[] = [];
    private replies: readonly string[];

    constructor(replies: readonly string[]) {
      this.replies = replies;
    }

    call(request: LlmRequest): Promise<LlmResponse> {
      this.requests.push(request);
      const content = this.replies[Math.min(this.requests.length - 1, this.replies.length - 1)]!;
      return Promise.resolve({
        credential: {
          providerProfile: this.profile,
          providerRequestId: 'req-test',
          modelId: 'test-model',
          modelVersion: null,
          capability: 'structured',
          isoTimestamp: new Date().toISOString(),
          tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        },
        content,
        raw: null,
      });
    }
  }

  it('second attempt includes the schema error and succeeds (attempts=2)', async () => {
    const schema = z.object({ ok: z.boolean() });
    const bad = JSON.stringify({ ok: 'not-a-boolean' });
    const good = JSON.stringify({ ok: true });
    const adapter = new RecordingAdapter([bad, good]);
    const gateway: LlmGateway = createLlmGateway([adapter]);

    const result = await callStructuredJson(gateway, 'offline_replay', 'repair_probe', schema, [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'user' },
    ]);

    assert.deepEqual(result.data, { ok: true });
    assert.equal(result.meta.attempts, 2);
    assert.equal(adapter.requests.length, 2, 'exactly one repair attempt');
    const secondMessages = adapter.requests[1]!.messages;
    const repairMsg = secondMessages[secondMessages.length - 1]!;
    assert.equal(repairMsg.role, 'user');
    assert.match(repairMsg.content, /failed local schema validation/);
    // The original messages are preserved before the repair append.
    assert.equal(secondMessages.length, 3);
  });
});

describe('D2 · fail-closed primary selection contract', () => {
  it('admissibleHypotheses returns EMPTY (no all-hypotheses fallback) when all gate-fail', async () => {
    const gateway = createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
    const adapter = createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS);
    const run = await runResearch({
      question: 'Does stellar activity inflate hot Jupiter radii?',
      gateway,
      profile: 'offline_replay',
      grounding: { adapter },
      targetHypothesisCount: 3,
    });

    // Sabotage every threshold so the recomputed gate fails all hypotheses.
    const sabotaged: ResearchRun = {
      ...run,
      hypotheses: run.hypotheses.map((h) => ({
        ...h,
        falsificationMethod: {
          ...h.falsificationMethod,
          comparator: 'gt',
          value: Number.POSITIVE_INFINITY,
          lower: undefined,
          upper: undefined,
        },
      })),
    };
    const gate = computeFalsifiabilityGateReport(sabotaged.hypotheses);
    for (const h of sabotaged.hypotheses) {
      assert.equal(gate.perHypothesis[h.id]?.passed, false);
    }
    const pool = admissibleHypotheses(sabotaged.hypotheses, sabotaged.bindings, gate);
    assert.equal(pool.length, 0, 'no fallback to inadmissible hypotheses');
  });

  it('runResearch ABORTS when no candidate is falsifiable (schema-valid empty prediction)', async () => {
    // JSON cannot carry Infinity (JSON.stringify → null, schema-rejected), so
    // the honest remaining gate-fail vector through the JSON boundary is an
    // EMPTY prediction: z.string() accepts it, the kernel gate refuses it.
    const hypotheses = JSON.parse(RESEARCH_DEMO_FIXTURES.research_hypotheses!) as {
      hypotheses: Array<Record<string, unknown>>;
    };
    const corrupted = JSON.stringify({
      hypotheses: hypotheses.hypotheses.map((h) => ({
        ...h,
        falsificationMethod: {
          ...(h.falsificationMethod as Record<string, unknown>),
          prediction: '',
        },
      })),
    });
    const fixtures = { ...RESEARCH_DEMO_FIXTURES, research_hypotheses: corrupted };
    const gateway = createLlmGateway([createOfflineReplayAdapter({ fixtures })]);
    const adapter = createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS);

    await assert.rejects(
      runResearch({
        question: 'Does stellar activity inflate hot Jupiter radii?',
        gateway,
        profile: 'offline_replay',
        grounding: { adapter },
        targetHypothesisCount: 3,
      }),
      /fail-closed at primary selection/,
      'the orchestrator must abort instead of promoting a gate-FAILED hypothesis',
    );
  });

  it('verify flags a stored run whose primary is gate-failed (FORBIDDEN, not crash)', async () => {
    const gateway = createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
    const adapter = createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS);
    const run = await runResearch({
      question: 'Does stellar activity inflate hot Jupiter radii?',
      gateway,
      profile: 'offline_replay',
      grounding: { adapter },
      targetHypothesisCount: 3,
    });

    const sabotaged: ResearchRun = {
      ...run,
      hypotheses: run.hypotheses.map((h) => ({
        ...h,
        falsificationMethod: {
          ...h.falsificationMethod,
          prediction: '',
        },
      })),
    };

    const outcome = verifyResearchRunDeterministic(
      parseResearchRunJson(JSON.stringify(sabotaged)),
    );
    assert.equal(outcome.status, 'FAIL');
    assert.ok(
      outcome.failures.some((f) => f.includes('primary selection FORBIDDEN')),
      `expected FORBIDDEN failure, got: ${outcome.failures.join(' | ')}`,
    );
  });
});
