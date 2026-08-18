// tests/llm_gateway/router.test.ts
//
// ORCH-ROUTER-001 验收测试：路由决策基于能力/风险/成本——硬约束过滤、
// 确定性择优、fail-closed 无匹配错误（带逐 profile 拒绝理由）、独立性批次
// 去重、provider health 注入。纯函数测试。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROFILE_CATALOG,
  route,
  routeIndependentBatch,
  RouterNoProfileError,
  type ProfileCatalogEntry,
  type RoutingTask,
} from '../../src/llm_gateway/router.ts';
import { KNOWN_PROVIDER_PROFILES } from '../../src/llm_gateway/types.ts';

function makeTask(overrides: Partial<RoutingTask> = {}): RoutingTask {
  return {
    taskId: 'stage3_hypothesis',
    requiredCapabilities: ['reasoning', 'structured'],
    contextTokens: 4096,
    structuredOutput: true,
    riskLevel: 'high',
    reproducible: true,
    offlineOnly: true,
    budget: { maxCostPerMTokens: null, maxP50LatencyMs: null },
    ...overrides,
  };
}

test('catalog registers exactly the known provider profiles (alignment, no orphans)', () => {
  assert.deepEqual(
    PROFILE_CATALOG.map((e) => e.profile).sort(),
    [...KNOWN_PROVIDER_PROFILES].sort(),
  );
});

test('offline high-risk reproducible task routes to offline_replay (only admissible survivor)', () => {
  const d = route(makeTask());
  assert.equal(d.selected, 'offline_replay');
  // 决策理由结构化可审计：约束面 + 幸存者名单 + 拒绝理由表。
  assert.ok(d.rationale.some((r) => r.includes('offline_replay')));
  const rejected = d.candidates.filter((c) => !c.accepted);
  assert.ok(rejected.every((c) => c.reasons.length > 0));
  assert.ok(rejected.some((c) => c.profile === 'research_best_available' && c.reasons.join(' ').includes('reproducible')));
});

test('capability filtering: vision requirement rejects all but research_best_available', () => {
  const d = route(makeTask({ requiredCapabilities: ['reasoning', 'vision'], offlineOnly: false, reproducible: false, riskLevel: 'low' }));
  assert.equal(d.selected, 'research_best_available');
});

test('budget constraints: cost/latency caps eliminate over-budget profiles deterministically', () => {
  // 成本上限 1.0 → 只剩 local_open_weights (0.2) 与 offline_replay (0)。
  const d = route(
    makeTask({
      requiredCapabilities: ['reasoning'],
      structuredOutput: false,
      riskLevel: 'low',
      reproducible: true,
      offlineOnly: false,
      budget: { maxCostPerMTokens: 1.0, maxP50LatencyMs: null },
    }),
  );
  assert.equal(d.selected, 'offline_replay'); // 0 成本 < 0.2
  // candidates 表按 catalog 序返回（决策审计面）；幸存者集合用排序比较。
  assert.deepEqual(
    d.candidates.filter((c) => c.accepted).map((c) => c.profile).sort(),
    ['local_open_weights', 'offline_replay'],
  );

  // 延迟上限 200ms → 只剩 offline_replay(15ms)。
  const fast = route(
    makeTask({
      offlineOnly: false,
      budget: { maxCostPerMTokens: null, maxP50LatencyMs: 200 },
    }),
  );
  assert.equal(fast.selected, 'offline_replay');
});

test('high-risk task cannot use a non-reproducible profile even when cheapest/richest', () => {
  assert.throws(
    () =>
      route(
        makeTask({
          requiredCapabilities: ['reasoning', 'vision'],
          offlineOnly: false,
          reproducible: true,
          riskLevel: 'high',
        }),
      ),
    (err: unknown) => {
      assert.ok(err instanceof RouterNoProfileError);
      const visionCapable = err.candidates.find((c) => c.profile === 'research_best_available');
      assert.ok(visionCapable?.reasons.some((r) => r.includes('high-risk task requires an auditable')));
      return true;
    },
  );
});

test('fail-closed: no matching profile throws RouterNoProfileError with per-profile reasons, never a silent default', () => {
  let threw: RouterNoProfileError | null = null;
  try {
    route(makeTask({ requiredCapabilities: ['reasoning', 'embedding'], offlineOnly: false }));
  } catch (e) {
    assert.ok(e instanceof RouterNoProfileError);
    threw = e;
  }
  assert.ok(threw !== null);
  assert.equal(threw.candidates.length, PROFILE_CATALOG.length);
  assert.ok(threw.candidates.every((c) => !c.accepted && c.reasons.length > 0));
  assert.match(threw.message, /no profile satisfies task/);
  assert.match(threw.message, /missing capabilities: embedding/);
});

test('provider health injection removes a profile from routing without touching catalog', () => {
  const d = route(
    makeTask({
      offlineOnly: false,
      reproducible: true,
      riskLevel: 'low',
      requiredCapabilities: ['reasoning'],
      budget: { maxCostPerMTokens: null, maxP50LatencyMs: null },
      structuredOutput: false,
    }),
    { unhealthyProfiles: ['offline_replay'] },
  );
  assert.equal(d.selected, 'local_open_weights'); // offline(0成本) 被健康面剔除后最便宜幸存者
  const off = d.candidates.find((c) => c.profile === 'offline_replay');
  assert.ok(off?.reasons.some((r) => r.includes('health')));
});

test('independent batch: dedupes by provider, picks cheapest per provider, fails when short', () => {
  const batch = routeIndependentBatch(
    makeTask({ offlineOnly: false, riskLevel: 'low', requiredCapabilities: ['reasoning'], structuredOutput: false }),
    3,
  );
  assert.equal(batch.length, 3);
  assert.equal(new Set(batch).size, 3);

  // 需求 4 个独立 provider——catalog 只有 3 个独立提供方 → fail-closed。
  assert.throws(() => routeIndependentBatch(makeTask({ offlineOnly: false, riskLevel: 'low' }), 4), RouterNoProfileError);
});

test('determinism: same task + same catalog always yields byte-identical decision', () => {
  const a = route(makeTask({ offlineOnly: false, riskLevel: 'low' }));
  const b = route(makeTask({ offlineOnly: false, riskLevel: 'low' }));
  assert.deepEqual(a, b);
});

test('tie-break is cost then latency then lexicographic profile name', () => {
  const tieCatalog: readonly ProfileCatalogEntry[] = [
    { ...PROFILE_CATALOG[0]!, profile: 'zzz_same_cost', costPerMTokens: 1, p50LatencyMs: 100 },
    { ...PROFILE_CATALOG[0]!, profile: 'aaa_same_cost', costPerMTokens: 1, p50LatencyMs: 100 },
    { ...PROFILE_CATALOG[0]!, profile: 'slower_same_cost', costPerMTokens: 1, p50LatencyMs: 200 },
  ];
  const d = route(
    makeTask({ offlineOnly: false, riskLevel: 'low', requiredCapabilities: ['reasoning'], structuredOutput: true, reproducible: false }),
    { catalog: tieCatalog },
  );
  assert.equal(d.selected, 'aaa_same_cost');
});
