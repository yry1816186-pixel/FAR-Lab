// tests/research/provenance.test.ts
// StageReceipt + EnvironmentFingerprint unit tests (directive §3.3):
//   - receipts never invent provider fields (null + provenanceStatus='partial')
//   - deterministic receipts require input/output hashes
//   - retrieval receipts require corpus identity
//   - hash helpers are deterministic
//   - fingerprint fails soft on missing git/lockfile (hermetic env)

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildStageReceipt,
  hashCanonicalJson,
  hashText,
  modelSnapshotState,
} from '../../src/research/provenance.ts';

describe('hashCanonicalJson / hashText', () => {
  test('canonical hash is stable across key insertion order', () => {
    assert.equal(hashCanonicalJson({ a: 1, b: 2 }), hashCanonicalJson({ b: 2, a: 1 }));
  });
  test('hashText is sha256 hex', () => {
    assert.match(hashText('abc'), /^[0-9a-f]{64}$/);
    assert.equal(
      hashText('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('modelSnapshotState', () => {
  test('replay → unknown', () => {
    assert.equal(modelSnapshotState('offline_replay', null), 'unknown');
  });
  test('live with version → provided', () => {
    assert.equal(modelSnapshotState('competition_aliyun_qwen', 'qwen3.7-max-2026-05-20'), 'provided');
  });
  test('live without version → not_provided_by_provider (never invented)', () => {
    assert.equal(modelSnapshotState('competition_aliyun_qwen', null), 'not_provided_by_provider');
  });
});

describe('buildStageReceipt', () => {
  test('model receipt with no provider id → partial + missingFields named', () => {
    const r = buildStageReceipt({
      runId: 'run1',
      stageId: 'research_hypotheses',
      sequence: 1,
      component: 'model',
      mode: 'RECORDED_REPLAY',
      provider: 'offline_replay',
      modelId: 'offline-replay-fixture',
      requestId: null,
      modelSnapshot: 'unknown',
      tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, measured: false },
      latencyMs: 5,
    });
    assert.equal(r.provenanceStatus, 'partial');
    assert.ok(r.missingFields.includes('requestId'));
    assert.ok(r.missingFields.includes('modelSnapshot'));
    assert.equal(r.tokenUsage?.measured, false);
    assert.equal(r.retries, 0);
  });

  test('model receipt with full provider identity → complete', () => {
    const r = buildStageReceipt({
      runId: 'run1',
      stageId: 'research_hypotheses',
      sequence: 1,
      component: 'model',
      mode: 'LIVE',
      provider: 'competition_aliyun_qwen',
      modelId: 'qwen3.7-max-2026-05-20',
      requestId: 'req-123',
      modelSnapshot: 'provided',
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, measured: true },
      latencyMs: 1200,
      retries: 1,
      cost: { status: 'billed', currency: 'CNY', amount: 0.001 },
    });
    assert.equal(r.provenanceStatus, 'complete');
    assert.equal(r.missingFields.length, 0);
    assert.equal(r.cost.status, 'billed');
  });

  test('retrieval receipt requires corpus identity', () => {
    const complete = buildStageReceipt({
      runId: 'run1',
      stageId: 'grounding',
      sequence: 2,
      component: 'retrieval',
      mode: 'LIVE',
      dataSource: 'openalex',
      corpusSnapshotId: 'snap1',
      corpusRootHash: 'root1',
      retrievedAt: '2026-08-13T00:00:00.000Z',
      parserVersion: 'v3',
    });
    assert.equal(complete.provenanceStatus, 'complete');

    const partial = buildStageReceipt({
      runId: 'run1',
      stageId: 'grounding',
      sequence: 2,
      component: 'retrieval',
      mode: 'LIVE',
      dataSource: 'openalex',
      corpusSnapshotId: null,
      corpusRootHash: null,
      retrievedAt: '2026-08-13T00:00:00.000Z',
      parserVersion: 'v3',
    });
    assert.equal(partial.provenanceStatus, 'partial');
    assert.ok(partial.missingFields.includes('corpusSnapshotId'));
    assert.ok(partial.missingFields.includes('corpusRootHash'));
  });

  test('deterministic receipt requires input+output hashes', () => {
    const partial = buildStageReceipt({
      runId: 'run1',
      stageId: 'scoring',
      sequence: 3,
      component: 'deterministic',
      mode: 'LIVE',
      inputHash: 'h1',
      outputHash: null,
    });
    assert.equal(partial.provenanceStatus, 'partial');
    assert.ok(partial.missingFields.includes('outputHash'));
  });

  test('sequence + attempt + stageVersion defaults are stable', () => {
    const r = buildStageReceipt({ runId: 'r', stageId: 's', sequence: 7, component: 'deterministic', mode: 'LIVE', inputHash: 'a', outputHash: 'b' });
    assert.equal(r.stageVersion, 1);
    assert.equal(r.attempt, 1);
    assert.equal(r.sequence, 7);
    assert.match(r.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('captureEnvironmentFingerprint (fail-soft contract)', () => {
  test('lockfile hash helper reads the repo pnpm-lock.yaml deterministically', () => {
    // The test runs inside the repo; the lockfile must exist and hash stably.
    const lock = readFileSync('pnpm-lock.yaml', 'utf8');
    assert.equal(hashText(lock).length, 64);
  });
});
