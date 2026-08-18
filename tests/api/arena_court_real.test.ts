import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runArenaSession } from '../../src/api/internal/arena_service.ts';
import {
  CourtConfigurationError,
  runCourtSession,
  type CourtModelTarget,
} from '../../src/api/internal/court_service.ts';
import { createLiveFixtureGateway } from './live_fixture_gateway.ts';

const GIT_SHA = 'a'.repeat(40);

// Strict-contract alignment: the competition evidence gate requires the observed
// model identity (credential.modelId) to equal the pinned snapshot, exactly like
// the production primary path (modelId === COMPETITION_MODEL_SNAPSHOT). The
// fixture gateway reports modelId = target id, so the per-target snapshot is the
// same value — snapshot pinning and identity allowlisting stay coherent.
function target(id: string, independenceKey: string): CourtModelTarget {
  return {
    id,
    gateway: createLiveFixtureGateway(id),
    providerProfile: 'competition_aliyun_qwen',
    modelSnapshot: id,
    allowedModelIds: [id],
    independenceKey,
    providerLabel: `test:${id}`,
  };
}

test('arena requires a complete execution context and reports a live assessment', async () => {
  const result = await runArenaSession(
    'C-ASTRO-0001: TIC lightcurve exhibits a transit-like periodic signal',
    ['scope-launderer', 'post-hoc-threshold'],
    GIT_SHA,
    {
      gateway: createLiveFixtureGateway('arena-model'),
      modelSnapshot: 'arena-model',
      providerProfile: 'competition_aliyun_qwen',
      providerLabel: 'test-live-fixture',
    },
  );
  assert.equal(result.datasetSource, 'real');
  assert.ok(result.originalVerdict !== null);
  assert.equal(result.attempts.length, 2);
  assert.ok(result.assessment === 'ROBUST' || result.assessment === 'BREACHED');
  assert.equal(result.originalError, null);
});

test('arena never reports ROBUST when a required execution fails', async () => {
  const failingGateway = {
    register: () => {},
    registeredProfiles: () => ['competition_aliyun_qwen'],
    callLlm: async () => {
      throw new Error('provider unavailable');
    },
  };
  const result = await runArenaSession(
    'testable claim',
    ['adversarial-check'],
    GIT_SHA,
    {
      gateway: failingGateway,
      modelSnapshot: 'unreachable-snapshot',
      providerProfile: 'competition_aliyun_qwen',
    },
  );
  assert.equal(result.assessment, 'INCONCLUSIVE');
  assert.equal(result.robust, false);
  assert.match(result.honestNote, /Missing results are not counted as defenses/);
});

test('court executes independently configured targets and verifies observed model identities', async () => {
  const certificate = await runCourtSession(
    'C-ASTRO-0001: TIC lightcurve transit signal',
    ['model-a', 'model-b'],
    GIT_SHA,
    { targets: [target('model-a', 'provider-account-a'), target('model-b', 'provider-account-b')] },
  );
  assert.equal(certificate.datasetSource, 'real');
  assert.equal(certificate.modelCount, 2);
  assert.equal(certificate.agreement, 'unanimous');
  for (const verdict of certificate.verdicts) {
    assert.equal(verdict.error, null);
    assert.deepEqual(verdict.observedModelIds, [verdict.model]);
  }
});

test('court rejects relabelled targets that share one independence boundary', async () => {
  await assert.rejects(
    () => runCourtSession(
      'claim',
      ['model-a', 'model-b'],
      GIT_SHA,
      { targets: [target('model-a', 'shared'), target('model-b', 'shared')] },
    ),
    (error: unknown) =>
      error instanceof CourtConfigurationError && error.code === 'COURT_TARGETS_NOT_INDEPENDENT',
  );
});
