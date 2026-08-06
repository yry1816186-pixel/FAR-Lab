/**
 * arena/court 真实 provider 选项测试（G3 闭合收尾·2026-08-06）。
 *
 * 验证 runArenaSession / runCourtSession 的 options 接线：
 *   1. 缺省（无 options）→ datasetSource='replay' + offline honestNote（回归·零回归）；
 *   2. options.gateway + modelSnapshot 提供 → datasetSource='real' + honestNote 标注真实
 *      provider + 完整 loop 跑通（mock gateway·无网络无计费·环境锚走 loop_runner G3 路径）；
 *   3. mock 凭证对齐（providerProfile/modelId/providerRequestId·反 theater 校验通过）。
 *
 * Authority: src/api/internal/arena_service.ts + court_service.ts（ArenaSessionOptions/
 *            CourtSessionOptions·2026-08-06）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runArenaSession } from '../../src/api/internal/arena_service.ts';
import { runCourtSession } from '../../src/api/internal/court_service.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type { LlmRequest, LlmResponse } from '../../src/llm_gateway/types.ts';

const MODEL_SNAPSHOT = 'qwen3.7-max-2026-05-20';
const GIT_SHA = 'a'.repeat(40);

/**
 * 真实 provider 语义的 mock gateway（fixture 内容来自 offline_replay adapter·
 * 凭证对齐 competition：profile/modelId/providerRequestId·反 theater 校验通过）。
 */
function createCompetitionLikeGateway(): LlmGateway {
  const adapter = createOfflineReplayAdapter();
  return {
    register: () => {},
    callLlm: async (_profile: string, request: LlmRequest): Promise<LlmResponse> => {
      const response = await adapter.call(request);
      return {
        ...response,
        credential: {
          ...response.credential,
          providerProfile: 'competition_aliyun_qwen',
          providerRequestId: 'mock-request-id-001',
          modelId: MODEL_SNAPSHOT,
        },
      };
    },
    registeredProfiles: () => ['competition_aliyun_qwen'],
  };
}

test('arena 缺省：datasetSource=replay + offline honestNote（回归·零回归）', async () => {
  const res = await runArenaSession(
    'C-ASTRO-0001: TIC lightcurve exhibits a transit-like periodic signal',
    ['scope-launderer'],
    GIT_SHA,
  );
  assert.equal(res.datasetSource, 'replay');
  assert.match(res.honestNote, /offline_replay/);
  assert.ok(res.originalVerdict !== null, 'fixture 路径须产出裁决');
});

test('arena options：真实 provider → datasetSource=real + honestNote 标注（G3 收尾）', async () => {
  const res = await runArenaSession(
    'C-ASTRO-0001: TIC lightcurve exhibits a transit-like periodic signal',
    ['scope-launderer', 'post-hoc-threshold'],
    GIT_SHA,
    { gateway: createCompetitionLikeGateway(), modelSnapshot: MODEL_SNAPSHOT, providerProfile: 'competition_aliyun_qwen', providerLabel: 'competition_aliyun_qwen' },
  );
  assert.equal(res.datasetSource, 'real');
  assert.match(res.honestNote, /real provider adversarial arena/);
  assert.match(res.honestNote, /competition_aliyun_qwen/);
  // 完整 loop 跑通（mock·确定性内核产出裁决·attempts 有真实结果）
  assert.ok(res.originalVerdict !== null, '真实路径须产出裁决（mock fixture 驱动）');
  assert.equal(res.attempts.length, 2);
  for (const a of res.attempts) {
    assert.equal(a.error, null, 'mock 路径不得报错');
    assert.ok(a.verdict !== null);
  }
});

test('court 缺省：datasetSource=replay + unanimous（回归·零回归）', async () => {
  const cert = await runCourtSession('C-ASTRO-0001: TIC lightcurve transit signal', ['qwen-plus', 'qwen-turbo'], GIT_SHA);
  assert.equal(cert.datasetSource, 'replay');
  assert.match(cert.honestNote, /offline_replay/);
  assert.equal(cert.agreement, 'unanimous', 'fixture 回放必然 unanimous');
});

test('court options：真实 provider → datasetSource=real + honestNote 标注', async () => {
  const cert = await runCourtSession(
    'C-ASTRO-0001: TIC lightcurve transit signal',
    ['qwen-plus', 'qwen-turbo'],
    GIT_SHA,
    { gateway: createCompetitionLikeGateway(), modelSnapshot: MODEL_SNAPSHOT, providerProfile: 'competition_aliyun_qwen', providerLabel: 'competition_aliyun_qwen' },
  );
  assert.equal(cert.datasetSource, 'real');
  assert.match(cert.honestNote, /real provider cross-model court/);
  assert.equal(cert.modelCount, 2);
  for (const v of cert.verdicts) {
    assert.equal(v.error, null);
    assert.ok(v.verdict !== null);
  }
});

