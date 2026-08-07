// tests/falsifiability/external_facts_gate_branches.test.ts
// Branch coverage boost: external_facts.ts (53.33% → target 90%+) + gate.ts (73.68% → target 90%+).
//
// Covers pure-function error/branch paths not exercised by integration tests:
//   - extractExternalFact: empty gitCommitSha throw + competition_aliyun_qwen vs non-competition dashscopeRequestId
//   - resolveIdentifierClaim: registry undefined → unresolved + resolved/not_found
//   - bindProvenance: empty gitCommitSha / empty claimText throws + happy path
//   - falsifiabilityGate: all validation throws (empty hypothesis/prediction/metric, non-finite threshold,
//     range semantics sub-branches: missing spec, wrong semantics, missing bounds, non-finite bounds, lower>upper)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractExternalFact,
  resolveIdentifierClaim,
  bindProvenance,
  HARNESS_VERIFIED_IDENTIFIERS,
} from '../../src/falsifiability/external_facts.ts';
import { falsifiabilityGate } from '../../src/falsifiability/gate.ts';
import { FalsifiabilityGateError } from '../../src/falsifiability/errors.ts';
import type { LlmResponse } from '../../src/llm_gateway/types.ts';
import type { FalsificationSpec, ThresholdSpec } from '../../src/falsifiability/types.ts';

/** Minimal LlmResponse fixture (provider profile configurable for branch coverage). */
function makeResponse(providerProfile: string, providerRequestId: string | null = null): LlmResponse {
  return {
    credential: {
      providerProfile: providerProfile as LlmResponse['credential']['providerProfile'],
      providerRequestId,
      modelId: 'test-model',
      modelVersion: null,
      capability: 'reasoning',
      isoTimestamp: '2026-01-01T00:00:00.000Z',
      tokenUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    },
    content: 'test-content',
    raw: { replayed: true },
  };
}

/** Minimal FalsificationSpec (thresholdSemantics configurable). */
function makeSpec(overrides: Partial<FalsificationSpec> = {}): FalsificationSpec {
  return {
    prediction: 'metric > threshold',
    metric: 'accuracy',
    falsificationThreshold: 0.8,
    thresholdSemantics: 'gt',
    ...overrides,
  } as FalsificationSpec;
}

describe('extractExternalFact: branch coverage', () => {
  it('throws on empty gitCommitSha', () => {
    assert.throws(
      () => extractExternalFact(makeResponse('offline_replay'), '   '),
      /gitCommitSha must be non-empty/,
    );
  });

  it('competition_aliyun_qwen profile → dashscopeRequestId = providerRequestId (non-null)', () => {
    const anchor = extractExternalFact(
      makeResponse('competition_aliyun_qwen', 'req-123'),
      'a'.repeat(40),
    );
    assert.equal(anchor.dashscopeRequestId, 'req-123');
  });

  it('non-competition profile → dashscopeRequestId = null (previously uncovered branch)', () => {
    const anchor = extractExternalFact(
      makeResponse('offline_replay', 'req-456'),
      'a'.repeat(40),
    );
    assert.equal(anchor.dashscopeRequestId, null);
  });

  it('undefined codeLocation → anchor omits codeLocation field', () => {
    const anchor = extractExternalFact(makeResponse('offline_replay'), 'a'.repeat(40));
    assert.equal(anchor.codeLocation, undefined);
  });
});

describe('resolveIdentifierClaim: branch coverage', () => {
  it('registry undefined → unresolved (previously uncovered branch)', () => {
    const result = resolveIdentifierClaim({ kind: 'doi', value: '10.1/x' }, undefined);
    assert.equal(result.resolutionStatus, 'unresolved');
    assert.equal(result.harnessVerifiedSource, false);
  });

  it('registry contains identifier → resolved', () => {
    const result = resolveIdentifierClaim(
      { kind: 'doi', value: '10.1/far-verified-001' },
      HARNESS_VERIFIED_IDENTIFIERS,
    );
    assert.equal(result.resolutionStatus, 'resolved');
    assert.equal(result.harnessVerifiedSource, true);
  });

  it('registry lacks identifier → not_found', () => {
    const result = resolveIdentifierClaim(
      { kind: 'doi', value: '10.1/nonexistent' },
      HARNESS_VERIFIED_IDENTIFIERS,
    );
    assert.equal(result.resolutionStatus, 'not_found');
    assert.equal(result.harnessVerifiedSource, false);
  });

  it('empty registry set → not_found for any identifier', () => {
    const result = resolveIdentifierClaim({ kind: 'arxiv', value: '2024.0001' }, new Set());
    assert.equal(result.resolutionStatus, 'not_found');
  });
});

describe('bindProvenance: branch coverage', () => {
  it('throws on empty gitCommitSha (previously uncovered branch)', () => {
    assert.throws(
      () =>
        bindProvenance(makeResponse('offline_replay'), {
          gitCommitSha: '',
          isoTimestamp: '2026-01-01T00:00:00Z',
          claimText: 'claim',
          canonicalSystemInput: {},
        }),
      /gitCommitSha must be non-empty/,
    );
  });

  it('throws on empty claimText (previously uncovered branch)', () => {
    assert.throws(
      () =>
        bindProvenance(makeResponse('offline_replay'), {
          gitCommitSha: 'a'.repeat(40),
          isoTimestamp: '2026-01-01T00:00:00Z',
          claimText: '   ',
          canonicalSystemInput: {},
        }),
      /claimText must be non-empty/,
    );
  });

  it('happy path → BoundProvenance with systemClaimHash + null dashscopeRequestId', () => {
    const bound = bindProvenance(makeResponse('offline_replay'), {
      gitCommitSha: 'a'.repeat(40),
      isoTimestamp: '2026-01-01T00:00:00Z',
      claimText: 'test claim',
      canonicalSystemInput: { foo: 1 },
    });
    assert.equal(bound.provenanceClass, 'llm_generated');
    assert.equal(bound.anchor.dashscopeRequestId, null);
    assert.match(bound.systemClaimHash, /^[0-9a-f]{64}$/);
    assert.equal(bound.anchor.isoTimestamp, '2026-01-01T00:00:00Z'); // systemContext, not response.credential
  });

  it('codeLocation provided → anchor includes it', () => {
    const bound = bindProvenance(makeResponse('offline_replay'), {
      gitCommitSha: 'a'.repeat(40),
      isoTimestamp: '2026-01-01T00:00:00Z',
      claimText: 'claim',
      canonicalSystemInput: {},
      codeLocation: { filePath: 'src/x.ts', location: 'L10' },
    });
    assert.equal(bound.anchor.codeLocation?.filePath, 'src/x.ts');
  });
});

describe('falsifiabilityGate: validation branch coverage', () => {
  it('throws on empty hypothesis', () => {
    assert.throws(
      () => falsifiabilityGate({ hypothesis: '  ', falsificationSpec: makeSpec() }),
      (err: unknown) => err instanceof FalsifiabilityGateError && /hypothesis is empty/.test((err as Error).message),
    );
  });

  it('throws on empty prediction', () => {
    assert.throws(
      () => falsifiabilityGate({ hypothesis: 'h', falsificationSpec: makeSpec({ prediction: '' }) }),
      /prediction is empty/,
    );
  });

  it('throws on empty metric (previously uncovered branch)', () => {
    assert.throws(
      () => falsifiabilityGate({ hypothesis: 'h', falsificationSpec: makeSpec({ metric: '  ' }) }),
      /metric is empty/,
    );
  });

  it('throws on non-finite falsificationThreshold (NaN)', () => {
    assert.throws(
      () => falsifiabilityGate({ hypothesis: 'h', falsificationSpec: makeSpec({ falsificationThreshold: NaN }) }),
      /falsificationThreshold is not finite/,
    );
  });

  it('throws on non-finite falsificationThreshold (Infinity)', () => {
    assert.throws(
      () => falsifiabilityGate({ hypothesis: 'h', falsificationSpec: makeSpec({ falsificationThreshold: Infinity }) }),
      /falsificationThreshold is not finite/,
    );
  });

  it('happy path (gt semantics) → returns spec unchanged', () => {
    const spec = makeSpec();
    const result = falsifiabilityGate({ hypothesis: 'h', falsificationSpec: spec });
    assert.equal(result, spec);
  });
});

describe('falsifiabilityGate: range semantics sub-branches', () => {
  const rangeSpec = (overrides: Partial<ThresholdSpec> = {}): ThresholdSpec =>
    ({ semantics: 'range', lower: 0.1, upper: 0.9, ...overrides }) as ThresholdSpec;

  it('range semantics without thresholdSpec → throws', () => {
    assert.throws(
      () => falsifiabilityGate({
        hypothesis: 'h',
        falsificationSpec: makeSpec({ thresholdSemantics: 'range' }),
      }),
      /range semantics requires thresholdSpec/,
    );
  });

  it('range semantics with non-range thresholdSpec.semantics → throws', () => {
    assert.throws(
      () => falsifiabilityGate({
        hypothesis: 'h',
        falsificationSpec: makeSpec({ thresholdSemantics: 'range' }),
        thresholdSpec: { semantics: 'gt', lower: 0.1, upper: 0.9 } as ThresholdSpec,
      }),
      /requires thresholdSpec.semantics=range/,
    );
  });

  it('range semantics with missing lower → throws', () => {
    assert.throws(
      () => falsifiabilityGate({
        hypothesis: 'h',
        falsificationSpec: makeSpec({ thresholdSemantics: 'range' }),
        thresholdSpec: { semantics: 'range', upper: 0.9 } as ThresholdSpec,
      }),
      /requires lower and upper/,
    );
  });

  it('range semantics with non-finite lower → throws', () => {
    assert.throws(
      () => falsifiabilityGate({
        hypothesis: 'h',
        falsificationSpec: makeSpec({ thresholdSemantics: 'range' }),
        thresholdSpec: rangeSpec({ lower: NaN }),
      }),
      /lower and upper must be finite/,
    );
  });

  it('range semantics with lower > upper → throws', () => {
    assert.throws(
      () => falsifiabilityGate({
        hypothesis: 'h',
        falsificationSpec: makeSpec({ thresholdSemantics: 'range' }),
        thresholdSpec: rangeSpec({ lower: 0.9, upper: 0.1 }),
      }),
      /lower 0.9 is greater than upper 0.1/,
    );
  });

  it('range semantics happy path → returns spec', () => {
    const spec = makeSpec({ thresholdSemantics: 'range' });
    const result = falsifiabilityGate({
      hypothesis: 'h',
      falsificationSpec: spec,
      thresholdSpec: rangeSpec(),
    });
    assert.equal(result, spec);
  });
});
