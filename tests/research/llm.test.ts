/**
 * tests/research/llm.test.ts — structured-JSON call helper.
 *
 * Pins the live-evidence repair (2026-08-14): on large inputs DashScope
 * compatible-mode occasionally returns the JSON object DOUBLE-ENCODED (root
 * parses to a string). callStructuredJson unwraps once and re-validates
 * against the schema — within the attempt budget, never weakening the schema.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { callStructuredJson } from '../../src/research/llm.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type { LlmCallCredential, LlmMessage, LlmRequest } from '../../src/llm_gateway/types.ts';

function fakeCredential(): LlmCallCredential {
  return {
    providerProfile: 'offline_replay',
    providerRequestId: null,
    modelId: 'offline-replay-fixture',
    modelVersion: null,
    capability: 'structured',
    isoTimestamp: '2026-08-14T00:00:00.000Z',
    tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, measured: false },
    finishReason: 'stop',
  };
}

/** A gateway whose single response is `content` (offline, hermetic). */
function gatewayWith(content: string, calls: { count: number }): LlmGateway {
  return {
    register(): void {
      // no-op — the fake adapter is registered implicitly by callLlm
    },
    async callLlm(_profile, _request: LlmRequest) {
      calls.count += 1;
      return { credential: fakeCredential(), content, raw: null };
    },
    registeredProfiles() {
      return ['offline_replay' as const];
    },
  };
}

const Schema = z.object({ ok: z.boolean(), n: z.number() });
const messages: readonly LlmMessage[] = [{ role: 'user', content: 'q' }];

describe('callStructuredJson (double-encoded repair)', () => {
  it('accepts a plain object (normal path)', async () => {
    const calls = { count: 0 };
    const { data } = await callStructuredJson(
      gatewayWith(JSON.stringify({ ok: true, n: 1 }), calls),
      'offline_replay',
      't1',
      Schema,
      messages,
    );
    assert.deepEqual(data, { ok: true, n: 1 });
    assert.equal(calls.count, 1);
  });

  it('unwraps a double-encoded JSON string and validates against the schema', async () => {
    const calls = { count: 0 };
    const inner = JSON.stringify({ ok: true, n: 42 });
    const { data } = await callStructuredJson(
      gatewayWith(JSON.stringify(inner), calls), // content = "\"{\"ok\":true,...}\""
      'offline_replay',
      't2',
      Schema,
      messages,
    );
    assert.deepEqual(data, { ok: true, n: 42 });
    assert.equal(calls.count, 1, 'unwrapped within the first attempt');
  });

  it('still fails closed when the unwrapped payload violates the schema', async () => {
    const calls = { count: 0 };
    await assert.rejects(
      callStructuredJson(
        gatewayWith(JSON.stringify(JSON.stringify({ ok: 'not-bool' })), calls),
        'offline_replay',
        't3',
        Schema,
        messages,
      ),
      /structured output failed/,
    );
    assert.equal(calls.count, 2, 'two attempts then fail-closed');
  });

  it('still fails closed when the string is not valid JSON at all', async () => {
    const calls = { count: 0 };
    await assert.rejects(
      callStructuredJson(gatewayWith('"not json', calls), 'offline_replay', 't4', Schema, messages),
      /structured output failed/,
    );
    assert.equal(calls.count, 2);
  });
});
