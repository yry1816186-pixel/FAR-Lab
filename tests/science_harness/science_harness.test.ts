/**
 * Science Harness 测试套件（M3 TESS / spec 11 §3 + spec 12）。
 *
 * 覆盖：
 *   1. C-ASTRO-0001 M1-M4 hero demo（M1-M3 PASS + M4 WARN → INCONCLUSIVE · route mixed）
 *   2. dataset_resolver 三值决策树（resolved / degraded / untested）+ contentHash 不命中 + 白名单
 *   3. sandbox_runner 确定性 hash + validateResourceSpec C19 上限强制 + seed=42/networkBlocked 默认
 *   4. mapChecksToVerdict F2 优先级（DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED）
 *
 * 诚实铁律：测试**不**断言机器裁决可产出 CONFIRMED（那是 ASK-9 上游密封降级前的临时态）。
 * 本套件断言 mapChecksToVerdict 的纯函数逻辑——所有路径可达且按 F2 优先级裁决。
 * AT-01：[PASS, SKIP] → INCONCLUSIVE (partial_skip)，SKIP≠PASS（含未测项即未全覆盖，禁升 CONFIRMED）。
 *
 * 零容忍合规：无 any / @ts-ignore / 改测试期望让实现通过。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESOURCE_LIMITS,
  typeLayerSandboxAdapter,
  validateResourceSpec,
  computeArtifactTreeHash,
  computeSandboxRunResult,
  computeSandboxReproFingerprint,
  DEFAULT_SEED,
  DATASET_HOST_WHITELIST,
  resolveDataset,
  datasetStatusToIntegrityFlag,
  isBaselineExempt,
  C_ASTRO_0001_CLAIM,
  C_ASTRO_CHECK_IDS,
  C_ASTRO_DEFAULT_THRESHOLDS,
  buildCAstroChecks,
  mapChecksToVerdict,
  ROUTE_TO_VERDICT,
  type ArtifactManifest,
  type DatasetRef,
  type SandboxExecutionInput,
  type SandboxResourceSpec,
  type ScienceCheck,
} from '../../src/science_harness/index.ts';

// ---------------------------------------------------------------------------
// 1. C-ASTRO-0001 hero demo（spec 12 §9 期望落点）
// ---------------------------------------------------------------------------

test('C-ASTRO-0001 hero demo: M1-M3 PASS + M4 WARN → INCONCLUSIVE (route mixed)', () => {
  // spec §9 期望：M1 p<0.0125 PASS / M2 <3.0σ PASS / M3 >=7.0σ PASS / M4 centroid WARN（近邻污染）。
  const measured = {
    blsPValue: 0.004, // < 0.0125 → PASS
    oddEvenDepthDiff: 1.2, // < 3.0 → PASS
    transitSnr: 9.5, // >= 7.0 → PASS
    centroidShift: 0.4, // 数值 < 1.0 但调用方如实注入 M4=WARN（centroid vetting 近邻污染）
  };

  const checks = buildCAstroChecks(measured, { m4Outcome: 'WARN' });

  // 经 length===4 断言，索引 0-3 必存在（noUncheckedIndexedAccess 不在 length 上收窄，故 ! 窄断言）。
  assert.equal(checks.length, 4);
  assert.equal(checks[0]!.outcome, 'PASS');
  assert.equal(checks[1]!.outcome, 'PASS');
  assert.equal(checks[2]!.outcome, 'PASS');
  assert.equal(checks[3]!.outcome, 'WARN');

  const result = mapChecksToVerdict(checks);
  assert.equal(result.verdict, 'INCONCLUSIVE');
  assert.equal(result.route, 'mixed');
});

test('C-ASTRO-0001 claim text + check ids are stable SSOT', () => {
  assert.ok(C_ASTRO_0001_CLAIM.length > 0);
  assert.deepEqual([...C_ASTRO_CHECK_IDS], [
    'M1_bls_power',
    'M2_odd_even_depth',
    'M3_transit_snr',
    'M4_duration_centroid',
  ]);
  assert.deepEqual([...Object.keys(C_ASTRO_DEFAULT_THRESHOLDS)], [...C_ASTRO_CHECK_IDS]);
});

test('buildCAstroChecks honors injected thresholds (F8 prereg, no hardcode final values)', () => {
  const measured = { blsPValue: 0.05, oddEvenDepthDiff: 4.0, transitSnr: 5.0, centroidShift: 2.0 };
  // 注入更松的阈值 → 全 PASS。
  const checks = buildCAstroChecks(measured, {
    thresholds: {
      M1_bls_power: { op: '<', value: 0.1, unit: 'p-value' },
      M2_odd_even_depth: { op: '<', value: 5.0, unit: 'sigma' },
      M3_transit_snr: { op: '>=', value: 4.0, unit: 'sigma' },
      M4_duration_centroid: { op: '<', value: 3.0, unit: 'pixel' },
    },
  });
  for (const c of checks) {
    assert.equal(c.outcome, 'PASS');
  }
});

// ---------------------------------------------------------------------------
// 2. mapChecksToVerdict F2 优先级（5 路径全部可达）
// ---------------------------------------------------------------------------

function check(id: string, outcome: ScienceCheck['outcome']): ScienceCheck {
  return {
    id,
    label: id,
    primaryMetric: id,
    outcome,
    metricValue: null,
    threshold: { op: '<', value: 0, unit: 'unit' },
    detail: '',
  };
}

test('F2 priority 1: scope_narrow integrity flag → DEGRADED_SCOPE (overrides everything)', () => {
  // 即使全 PASS，scope_narrow 仍优先降级。
  const checks = [check('M1', 'PASS'), check('M2', 'PASS')];
  const result = mapChecksToVerdict(checks, ['scope_narrow']);
  assert.equal(result.verdict, 'DEGRADED_SCOPE');
  assert.equal(result.route, 'scope_narrow');
});

test('F2 priority 2: single FAIL present → REFUTED (route any_refute)', () => {
  const checks = [check('M1', 'PASS'), check('M2', 'FAIL'), check('M3', 'WARN')];
  const result = mapChecksToVerdict(checks);
  assert.equal(result.verdict, 'REFUTED');
  assert.equal(result.route, 'any_refute');
});

test('F2 priority 3: WARN without FAIL → INCONCLUSIVE', () => {
  const checks = [check('M1', 'PASS'), check('M2', 'WARN')];
  const result = mapChecksToVerdict(checks);
  assert.equal(result.verdict, 'INCONCLUSIVE');
  assert.equal(result.route, 'mixed');
});

test('F2 priority 4: [PASS, SKIP] → INCONCLUSIVE (partial_skip · AT-01 · SKIP≠PASS)', () => {
  // AT-01 回归守护：含 PASS 但有 SKIP 未测项 → 未全覆盖 → 禁升 CONFIRMED（原 bug 静默升 CONFIRMED）。
  const checks = [check('M1', 'PASS'), check('M2', 'SKIP')];
  const result = mapChecksToVerdict(checks);
  assert.equal(result.verdict, 'INCONCLUSIVE');
  assert.equal(result.route, 'partial_skip');
});

test('F2 priority 4b: [PASS, PASS, SKIP] → INCONCLUSIVE (partial_skip · 多 PASS 仍被 SKIP 拦)', () => {
  // AT-01：多 PASS 不抵一个 SKIP——任一未测项即破 all_pass 全量条件。
  const checks = [check('M1', 'PASS'), check('M2', 'PASS'), check('M3', 'SKIP')];
  const result = mapChecksToVerdict(checks);
  assert.equal(result.verdict, 'INCONCLUSIVE');
  assert.equal(result.route, 'partial_skip');
});

test('F2 priority 5: all PASS (no SKIP) → CONFIRMED (machine route, ASK-9 seals later)', () => {
  const checks = [check('M1', 'PASS'), check('M2', 'PASS')];
  const result = mapChecksToVerdict(checks);
  assert.equal(result.verdict, 'CONFIRMED');
  assert.equal(result.route, 'all_pass');
});

test('F2 priority 6: all SKIP / data_missing → UNTESTED', () => {
  const checks = [check('M1', 'SKIP'), check('M2', 'SKIP')];
  const result = mapChecksToVerdict(checks, ['data_missing']);
  assert.equal(result.verdict, 'UNTESTED');
  assert.equal(result.route, 'data_missing');
});

test('ROUTE_TO_VERDICT table matches F2 priority routing', () => {
  assert.equal(ROUTE_TO_VERDICT.all_pass, 'CONFIRMED');
  assert.equal(ROUTE_TO_VERDICT.any_refute, 'REFUTED');
  assert.equal(ROUTE_TO_VERDICT.mixed, 'INCONCLUSIVE');
  assert.equal(ROUTE_TO_VERDICT.scope_narrow, 'DEGRADED_SCOPE');
  assert.equal(ROUTE_TO_VERDICT.data_missing, 'UNTESTED');
  // AT-01：partial_skip → INCONCLUSIVE（含 PASS 但有 SKIP 未测项）。
  assert.equal(ROUTE_TO_VERDICT.partial_skip, 'INCONCLUSIVE');
});

// ---------------------------------------------------------------------------
// 3. dataset_resolver 三值决策树（spec 12 §2.2）
// ---------------------------------------------------------------------------

const ref: DatasetRef = {
  resolver: 'astroquery.mast',
  version: '1.0.0',
  retrievedAt: '2026-06-28T00:00:00.000Z',
  contentHash: 'a'.repeat(64),
  ticId: 'TIC-123',
  sector: 27,
};

test('dataset: online + hash match → resolved (exempt=false)', () => {
  const result = resolveDataset({
    onlineAttempt: { ref, hostWhitelisted: true },
    expectedContentHash: ref.contentHash,
    cachedFixture: { ref },
  });
  assert.equal(result.status, 'resolved');
  assert.equal(result.exempt, false);
  assert.ok(result.ref);
});

test('dataset: contentHash mismatch → degraded (DATA_INTEGRITY_FAIL · 02 C8)', () => {
  const result = resolveDataset({
    onlineAttempt: { ref, hostWhitelisted: true },
    expectedContentHash: 'b'.repeat(64), // 不命中
    cachedFixture: { ref },
  });
  assert.equal(result.status, 'degraded');
  assert.equal(result.exempt, true);
  assert.ok(result.reason.includes('contentHash mismatch'));
});

test('dataset: non-whitelist host → degraded cached_fixture fallback (SR-5)', () => {
  const result = resolveDataset({
    onlineAttempt: { ref, hostWhitelisted: false },
    expectedContentHash: ref.contentHash,
    cachedFixture: { ref },
  });
  assert.equal(result.status, 'degraded');
  assert.equal(result.exempt, true);
  assert.ok(result.reason.includes('not in whitelist'));
});

test('dataset: online unavailable + fixture present → degraded (cached_fixture fallback)', () => {
  const result = resolveDataset({
    onlineAttempt: null,
    expectedContentHash: ref.contentHash,
    cachedFixture: { ref },
  });
  assert.equal(result.status, 'degraded');
  assert.equal(result.exempt, true);
  assert.ok(result.reason.includes('cached_fixture fallback'));
});

test('dataset: online unavailable + NO fixture → untested (never fabricate · 02 F1)', () => {
  const result = resolveDataset({
    onlineAttempt: null,
    expectedContentHash: ref.contentHash,
    cachedFixture: null,
  });
  assert.equal(result.status, 'untested');
  assert.equal(result.exempt, true);
  assert.equal(result.ref, null);
  assert.ok(result.reason.includes('never fabricate'));
});

test('datasetStatusToIntegrityFlag maps 3 statuses correctly', () => {
  assert.equal(datasetStatusToIntegrityFlag('resolved'), null);
  assert.equal(datasetStatusToIntegrityFlag('degraded'), 'scope_narrow');
  assert.equal(datasetStatusToIntegrityFlag('untested'), 'data_missing');
});

test('DATASET_HOST_WHITELIST contains MAST + HEASARC', () => {
  assert.ok(DATASET_HOST_WHITELIST.includes('mast.stsci.edu'));
  assert.ok(DATASET_HOST_WHITELIST.includes('heasarc.gsfc.nasa.gov'));
});

test('isBaselineExempt: only baseline_exempt channel is exempt (02 C20)', () => {
  assert.equal(isBaselineExempt('baseline_exempt'), true);
  assert.equal(isBaselineExempt('hypothesis'), false);
  assert.equal(isBaselineExempt('eval'), false);
});

// ---------------------------------------------------------------------------
// 4. sandbox_runner 确定性 hash + C19 上限 + SR 不变量
// ---------------------------------------------------------------------------

const spec: SandboxResourceSpec = {
  cpu: { limitMillicores: 4000 },
  memory: { limitMb: 4096 },
  timeoutMs: 60_000,
};

const artifacts: ArtifactManifest[] = [
  { path: 'plots/transit.png', contentHash: 'f'.repeat(64), bytes: 1024 },
  { path: 'tables/bls.csv', contentHash: 'e'.repeat(64), bytes: 512 },
];

const execInput: SandboxExecutionInput = {
  exitCode: 0,
  stdout: 'transit detected',
  stderr: '',
  artifacts,
  wallClockMs: 5_000,
  timedOut: false,
};

test('computeSandboxRunResult enforces SR invariants (seed=42, networkBlocked=true, singleThreaded=true)', () => {
  const result = computeSandboxRunResult(execInput, spec);
  assert.equal(result.exitCode, 0);
  assert.equal(result.seed, DEFAULT_SEED);
  assert.equal(result.networkBlocked, true);
  assert.equal(result.singleThreaded, true);
  assert.equal(result.timedOut, false);
  // hash 字段为 64 hex。
  assert.match(result.stdoutHash, /^[0-9a-f]{64}$/);
  assert.match(result.stderrHash, /^[0-9a-f]{64}$/);
  assert.match(result.artifactTreeHash, /^[0-9a-f]{64}$/);
});

test('computeSandboxRunResult is deterministic (same input → byte-equal hash)', () => {
  const a = computeSandboxRunResult(execInput, spec);
  const b = computeSandboxRunResult(execInput, spec);
  assert.equal(a.stdoutHash, b.stdoutHash);
  assert.equal(a.artifactTreeHash, b.artifactTreeHash);
  assert.equal(computeSandboxReproFingerprint(a), computeSandboxReproFingerprint(b));
});

test('computeArtifactTreeHash is order-independent (sort by path+hash)', () => {
  const reversed = [...artifacts].reverse();
  assert.equal(computeArtifactTreeHash(artifacts), computeArtifactTreeHash(reversed));
});

test('computeArtifactTreeHash changes when artifact content changes (sensitivity)', () => {
  // 用 map 避免索引访问（noUncheckedIndexedAccess）；map 回调参数有完整 ArtifactManifest 类型。
  const mutated: ArtifactManifest[] = artifacts.map((a, i) =>
    i === 0 ? { ...a, contentHash: '0'.repeat(64) } : a,
  );
  assert.notEqual(computeArtifactTreeHash(artifacts), computeArtifactTreeHash(mutated));
});

test('validateResourceSpec throws on cpu exceeding C19 ceiling', () => {
  const over: SandboxResourceSpec = {
    cpu: { limitMillicores: RESOURCE_LIMITS.cpuMillicores + 1 },
    memory: { limitMb: 4096 },
    timeoutMs: 60_000,
  };
  assert.throws(() => validateResourceSpec(over), /cpu\.limitMillicores.*exceeds C19/);
});

test('validateResourceSpec throws on memory exceeding C19 ceiling', () => {
  const over: SandboxResourceSpec = {
    cpu: { limitMillicores: 4000 },
    memory: { limitMb: RESOURCE_LIMITS.memoryMb + 1 },
    timeoutMs: 60_000,
  };
  assert.throws(() => validateResourceSpec(over), /memory\.limitMb.*exceeds C19/);
});

test('validateResourceSpec throws on timeout exceeding SR-4 ceiling', () => {
  const over: SandboxResourceSpec = {
    cpu: { limitMillicores: 4000 },
    memory: { limitMb: 4096 },
    timeoutMs: RESOURCE_LIMITS.timeoutMs + 1,
  };
  assert.throws(() => validateResourceSpec(over), /timeoutMs.*exceeds SR-4/);
});

test('typeLayerSandboxAdapter.execute delegates to computeSandboxRunResult', () => {
  const result = typeLayerSandboxAdapter.execute(execInput, spec);
  const direct = computeSandboxRunResult(execInput, spec);
  assert.equal(result.stdoutHash, direct.stdoutHash);
  assert.equal(result.artifactTreeHash, direct.artifactTreeHash);
  assert.equal(typeLayerSandboxAdapter.adapterId, 'type-layer-sandbox@v1');
});

test('computeSandboxRunResult honors explicit seed override (SR-2 still reproducible)', () => {
  const result = computeSandboxRunResult({ ...execInput, seed: 7 }, spec);
  assert.equal(result.seed, 7);
  // 同 seed 确定性复现。
  const again = computeSandboxRunResult({ ...execInput, seed: 7 }, spec);
  assert.equal(computeSandboxReproFingerprint(result), computeSandboxReproFingerprint(again));
});
