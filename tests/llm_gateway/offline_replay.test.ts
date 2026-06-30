import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import {
  BASE_URL,
  COMPETITION_BASE_URL,
  COMPETITION_MODEL_SNAPSHOT,
  COMPETITION_MODEL_SNAPSHOT_STATUS,
  MODEL_SNAPSHOT,
} from '../../src/llm_gateway/adapters/aliyun_qwen/snapshot.ts';

test('offline replay adapter runs without cloud credentials', async () => {
  const gateway = createLlmGateway([
    createOfflineReplayAdapter({
      fixtureResponse: '{"ok":true}',
      now: () => '2026-06-27T00:00:00.000Z',
    }),
  ]);

  const response = await gateway.callLlm('offline_replay', {
    responseFormat: 'json_schema',
    messages: [{ role: 'user', content: 'Return JSON.' }],
  });

  assert.equal(response.content, '{"ok":true}');
  assert.equal(response.credential.providerProfile, 'offline_replay');
  assert.equal(response.credential.providerRequestId, null);
  assert.equal(response.credential.modelId, 'offline-replay-fixture');
  assert.equal(response.credential.capability, 'structured');
  assert.equal(response.credential.isoTimestamp, '2026-06-27T00:00:00.000Z');
  assert.equal(response.credential.tokenUsage.totalTokens, 23);
});

test('gateway rejects unregistered profiles instead of falling back silently', async () => {
  const gateway = createLlmGateway();
  await assert.rejects(
    async () =>
      await gateway.callLlm('competition_aliyun_qwen', {
        messages: [{ role: 'user', content: 'ping' }],
      }),
    /no adapter registered/,
  );
});

test('competition constants are isolated in the aliyun_qwen adapter namespace', () => {
  assert.equal(COMPETITION_MODEL_SNAPSHOT, 'qwen3.7-max-2026-05-20');
  assert.equal(MODEL_SNAPSHOT, COMPETITION_MODEL_SNAPSHOT);
  assert.equal(COMPETITION_BASE_URL, 'https://dashscope.aliyuncs.com/compatible-mode/v1');
  assert.equal(BASE_URL, COMPETITION_BASE_URL);
  assert.match(COMPETITION_MODEL_SNAPSHOT_STATUS, /verified_live/);
});

// ---------- fixture-registry 路由（[Task #4] 默认离线路径核心） ----------

test('bare createOfflineReplayAdapter() routes by stageId to the built-in hero demo fixture', async () => {
  // 无参 adapter：靠内置 DEFAULT_DEMO_FIXTURES registry 兜底（使无 API key 默认即可跑通）
  const gateway = createLlmGateway([createOfflineReplayAdapter()]);

  const response = await gateway.callLlm('offline_replay', {
    responseFormat: 'json_schema',
    stageId: 'stage3_hypothesis',
    messages: [{ role: 'user', content: 'generate a falsifiable hypothesis' }],
  });

  // 返回的必须是 schema-valid 的 hypothesis fixture（非 echo 回显）
  const parsed = JSON.parse(response.content) as { kind?: unknown; falsificationMethod?: unknown };
  assert.equal(parsed.kind, 'hypothesis', 'stage3 fixture must parse to kind=hypothesis');
  assert.ok(
    parsed.falsificationMethod !== undefined && parsed.falsificationMethod !== null,
    'stage3 hero hypothesis must carry falsificationMethod (passes the hard falsifiability gate)',
  );
  // raw 携带命中的 stageId（审计可追溯）
  assert.equal(
    (response.raw as { stageId: string | null }).stageId,
    'stage3_hypothesis',
    'raw.stageId must echo the matched stageId',
  );
});

test('custom fixtures registry overrides the built-in default demo', async () => {
  const gateway = createLlmGateway([
    createOfflineReplayAdapter({
      // 自定义 stage1 fixture 覆盖内置 hero demo（adapter 层不校验 JSON·只断言路由命中）
      fixtures: { stage1_understanding: 'CUSTOM_OVERRIDE_SENTINEL' },
    }),
  ]);

  const response = await gateway.callLlm('offline_replay', {
    responseFormat: 'json_schema',
    stageId: 'stage1_understanding',
    messages: [{ role: 'user', content: 'understand the problem' }],
  });

  assert.equal(
    response.content,
    'CUSTOM_OVERRIDE_SENTINEL',
    'custom fixtures[stageId] must override the built-in DEFAULT_DEMO_FIXTURES',
  );
});

test('disableDefaultDemo + unmatched stageId throws a clear error (no silent echo)', async () => {
  const gateway = createLlmGateway([
    createOfflineReplayAdapter({ disableDefaultDemo: true }),
  ]);

  await assert.rejects(
    async () =>
      await gateway.callLlm('offline_replay', {
        responseFormat: 'json_schema',
        stageId: 'stage_unknown',
        messages: [{ role: 'user', content: 'ping' }],
      }),
    /no fixture registered for stageId="stage_unknown"/,
  );
});

test('no stageId and no fixtureResponse throws a clear error (no silent echo fallback)', async () => {
  const gateway = createLlmGateway([createOfflineReplayAdapter()]);

  await assert.rejects(
    async () =>
      await gateway.callLlm('offline_replay', {
        responseFormat: 'json_schema',
        // 故意不传 stageId 也不传 fixtureResponse：调用方未走 agent_loop 路径
        messages: [{ role: 'user', content: 'ping' }],
      }),
    /no stageId and no fixtureResponse provided/,
  );
});
