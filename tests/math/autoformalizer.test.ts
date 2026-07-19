// spec 38 · Autoformalizer tests.
// Covers: CoreNeutralAutoformalizer (model-neutral, rule-based) and
// CompetitionMathAutoformalizer (Qwen-Math profile with core fallback).
//
// FormalExpression (spec §1): { target: FormalTarget, source: string, ... }.
// `target` is the formal language; `source` carries the structured expression
// text (CAS JSON / SMT JSON / numerical config JSON). Tests parse `source`.
//
// Uses FakeGateway to test the competition adapter without real API calls.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type {
  LlmCallCredential,
  LlmRequest,
  LlmResponse,
  ProviderAdapter,
  ProviderProfile,
} from '../../src/llm_gateway/types.ts';
import {
  CoreNeutralAutoformalizer,
  createCoreNeutralAutoformalizer,
} from '../../src/math/autoformalizer.ts';
import type { AutoformalizeInput } from '../../src/math/autoformalizer.ts';
import {
  CompetitionMathAutoformalizer,
  createCompetitionMathAutoformalizer,
} from '../../src/math/competition_math_adapter.ts';
import type { BackendKind } from '../../src/math/math_claim.ts';

// ============================================================
// FakeGateway — test double for LlmGateway
// ============================================================

class FakeGateway implements LlmGateway {
  private readonly responseContent: string;
  private readonly shouldFail: boolean;
  callCount = 0;

  constructor(responseContent: string, shouldFail = false) {
    this.responseContent = responseContent;
    this.shouldFail = shouldFail;
  }

  register(_adapter: ProviderAdapter): void {
    // no-op for fake gateway
  }

  async callLlm(profile: ProviderProfile, _request: LlmRequest): Promise<LlmResponse> {
    this.callCount++;
    if (this.shouldFail) {
      throw new Error('fake gateway error');
    }
    const credential: LlmCallCredential = {
      providerProfile: profile,
      providerRequestId: 'fake_req_001',
      modelId: 'qwen-math-test',
      modelVersion: 'v1',
      capability: 'structured',
      isoTimestamp: '2026-06-27T00:00:00.000Z',
      tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    };
    return {
      credential,
      content: this.responseContent,
      raw: null,
    };
  }

  registeredProfiles(): readonly ProviderProfile[] {
    return ['competition_aliyun_qwen'];
  }
}

// ============================================================
// Helpers
// ============================================================

function makeInput(nl: string, kind: AutoformalizeInput['claimKind'], backend?: BackendKind): AutoformalizeInput {
  return {
    naturalLanguage: nl,
    claimKind: kind,
    ...(backend === undefined ? {} : { targetBackend: backend }),
    mustBeVerifiedBy: backend ? [backend] : ['cas'],
  };
}

// ============================================================
// §1  CoreNeutralAutoformalizer — identity
// ============================================================

test('CoreNeutralAutoformalizer has formalizerId=core_neutral@v1', () => {
  const af = new CoreNeutralAutoformalizer();
  assert.equal(af.formalizerId, 'core_neutral@v1');
});

test('CoreNeutralAutoformalizer has isModelNeutralCore=true', () => {
  const af = new CoreNeutralAutoformalizer();
  assert.equal(af.isModelNeutralCore, true);
});

test('createCoreNeutralAutoformalizer factory produces working instance', () => {
  const af = createCoreNeutralAutoformalizer();
  assert.equal(af.formalizerId, 'core_neutral@v1');
});

// ============================================================
// §2  CoreNeutralAutoformalizer — CAS source generation
// ============================================================

test('autoformalize algebraic_identity produces CAS source with lhs/rhs', async () => {
  const af = new CoreNeutralAutoformalizer();
  const result = await af.autoformalize(makeInput('x+y equals y+x', 'algebraic_identity', 'cas'));
  assert.equal(result.target, 'smtlib');
  const source = JSON.parse(result.source) as { lhs: string; rhs: string };
  assert.equal(source.lhs, 'x+y');
  assert.equal(source.rhs, 'y+x');
  assert.ok(result.confidence >= 0.5, 'confidence should be high for recognized pattern');
});

test('autoformalize inequality (<) produces CAS source with op=<', async () => {
  const af = new CoreNeutralAutoformalizer();
  const result = await af.autoformalize(makeInput('x < y', 'inequality', 'cas'));
  const source = JSON.parse(result.source) as { lhs: string; rhs: string; op: string };
  assert.equal(source.op, '<');
});

test('autoformalize inequality (>) produces CAS source with op=>', async () => {
  const af = new CoreNeutralAutoformalizer();
  const result = await af.autoformalize(makeInput('x > y', 'inequality', 'cas'));
  const source = JSON.parse(result.source) as { lhs: string; rhs: string; op: string };
  assert.equal(source.op, '>');
});

// ============================================================
// §3  CoreNeutralAutoformalizer — SMT source generation
// ============================================================

test('autoformalize theorem produces SMT source with script/query', async () => {
  const af = new CoreNeutralAutoformalizer();
  const result = await af.autoformalize(makeInput('x > 0 implies x > -1', 'theorem', 'smt'));
  assert.equal(result.target, 'smtlib');
  const source = JSON.parse(result.source) as { script: string; query: string };
  assert.equal(typeof source.script, 'string');
  assert.ok(source.script.length > 0);
  assert.equal(source.query, 'unsat');
});

// ============================================================
// §4  CoreNeutralAutoformalizer — numerical source generation
// ============================================================

test('autoformalize numerical_reproduction produces source with bound', async () => {
  const af = new CoreNeutralAutoformalizer();
  const result = await af.autoformalize(makeInput('value in range [0, 1]', 'numerical_reproduction', 'numerical'));
  const source = JSON.parse(result.source) as {
    bound: { min: number; max: number; sampleCount: number };
    expression: string;
  };
  assert.equal(typeof source.bound, 'object');
  assert.ok(source.bound !== null);
  assert.equal(source.bound.min, 0);
  assert.equal(source.bound.max, 1);
  assert.ok(source.bound.sampleCount > 0);
});

// ============================================================
// §5  CoreNeutralAutoformalizer — honest degradation
// ============================================================

test('autoformalize unrecognized pattern produces low confidence (<0.5)', async () => {
  const af = new CoreNeutralAutoformalizer();
  const result = await af.autoformalize(makeInput('some obscure statement', 'theorem', 'cas'));
  assert.ok(result.confidence < 0.5, 'confidence should be low for unrecognized pattern');
});

test('autoformalize result includes formalizerId and non-empty source', async () => {
  const af = new CoreNeutralAutoformalizer();
  const result = await af.autoformalize(makeInput('x equals x', 'algebraic_identity', 'cas'));
  assert.equal(result.formalizerId, 'core_neutral@v1');
  assert.ok(result.source.length > 0, 'source must be non-empty');
  const source = JSON.parse(result.source) as { lhs: string; rhs: string };
  assert.equal(source.lhs, 'x');
  assert.equal(source.rhs, 'x');
});

// ============================================================
// §6  CompetitionMathAutoformalizer — identity
// ============================================================

test('CompetitionMathAutoformalizer has isModelNeutralCore=false', () => {
  const adapter = new CompetitionMathAutoformalizer({ competitionModelSnapshot: 'qwen-math-test-v1' });
  assert.equal(adapter.isModelNeutralCore, false);
});

test('CompetitionMathAutoformalizer embeds snapshot in formalizerId', () => {
  const adapter = new CompetitionMathAutoformalizer({ competitionModelSnapshot: 'qwen-math-test-v1' });
  assert.equal(adapter.formalizerId, 'competition_qwen_math@qwen-math-test-v1');
});

test('CompetitionMathAutoformalizer rejects empty competitionModelSnapshot', () => {
  assert.throws(() => new CompetitionMathAutoformalizer({ competitionModelSnapshot: '' }));
});

// ============================================================
// §7  CompetitionMathAutoformalizer — fallback when no gateway
// ============================================================

test('CompetitionMathAutoformalizer falls back to core when no gateway provided', async () => {
  const adapter = new CompetitionMathAutoformalizer({ competitionModelSnapshot: 'qwen-math-test-v1' });
  const result = await adapter.autoformalize(makeInput('x equals x', 'algebraic_identity', 'cas'));
  // Fallback → core neutral formalizerId
  assert.equal(result.formalizerId, 'core_neutral@v1');
});

// ============================================================
// §8  CompetitionMathAutoformalizer — gateway success
// ============================================================

test('CompetitionMathAutoformalizer calls gateway when provided and parses response', async () => {
  // The model produces the formal SOURCE; the caller (adapter) decides the
  // target language from the target backend (spec §6).
  const gatewayResponse = JSON.stringify({
    source: '{"lhs":"x+y","rhs":"y+x"}',
    confidence: 0.95,
  });
  const gateway = new FakeGateway(gatewayResponse);
  const adapter = new CompetitionMathAutoformalizer({
    competitionModelSnapshot: 'qwen-math-test-v1',
    gateway,
  });
  const result = await adapter.autoformalize(makeInput('x+y equals y+x', 'algebraic_identity', 'cas'));

  assert.equal(gateway.callCount, 1);
  assert.equal(result.formalizerId, 'competition_qwen_math@qwen-math-test-v1');
  assert.equal(result.target, 'smtlib');
  assert.equal(result.source, '{"lhs":"x+y","rhs":"y+x"}');
  assert.equal(result.confidence, 0.95);
});

test('CompetitionMathAutoformalizer uses default confidence 0.5 when response omits it', async () => {
  const gatewayResponse = JSON.stringify({ source: '{"lhs":"x","rhs":"x"}' });
  const gateway = new FakeGateway(gatewayResponse);
  const adapter = new CompetitionMathAutoformalizer({
    competitionModelSnapshot: 'qwen-math-test-v1',
    gateway,
  });
  const result = await adapter.autoformalize(makeInput('x equals x', 'algebraic_identity', 'cas'));
  assert.equal(result.confidence, 0.5);
});

// ============================================================
// §9  CompetitionMathAutoformalizer — gateway failure fallback
// ============================================================

test('CompetitionMathAutoformalizer falls back to core on gateway error', async () => {
  const gateway = new FakeGateway('', true);
  const adapter = new CompetitionMathAutoformalizer({
    competitionModelSnapshot: 'qwen-math-test-v1',
    gateway,
  });
  const result = await adapter.autoformalize(makeInput('x equals x', 'algebraic_identity', 'cas'));
  assert.equal(result.formalizerId, 'core_neutral@v1');
  assert.equal(gateway.callCount, 1);
});

test('CompetitionMathAutoformalizer falls back to core on invalid JSON response', async () => {
  const gateway = new FakeGateway('not valid json');
  const adapter = new CompetitionMathAutoformalizer({
    competitionModelSnapshot: 'qwen-math-test-v1',
    gateway,
  });
  const result = await adapter.autoformalize(makeInput('x equals x', 'algebraic_identity', 'cas'));
  assert.equal(result.formalizerId, 'core_neutral@v1');
});

test('CompetitionMathAutoformalizer falls back to core on missing source in response', async () => {
  const gateway = new FakeGateway(JSON.stringify({ confidence: 0.9 }));
  const adapter = new CompetitionMathAutoformalizer({
    competitionModelSnapshot: 'qwen-math-test-v1',
    gateway,
  });
  const result = await adapter.autoformalize(makeInput('x equals x', 'algebraic_identity', 'cas'));
  assert.equal(result.formalizerId, 'core_neutral@v1');
});

test('createCompetitionMathAutoformalizer factory produces working instance', () => {
  const adapter = createCompetitionMathAutoformalizer({ competitionModelSnapshot: 'qwen-math-test-v1' });
  assert.equal(adapter.isModelNeutralCore, false);
  assert.equal(adapter.formalizerId, 'competition_qwen_math@qwen-math-test-v1');
});
