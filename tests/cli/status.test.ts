// tests/cli/status.test.ts
// 测试 far status 的 collectStatusDump 收集器（FI-10 · W0 phase A+B+C）。
// 不依赖真实 DB / 不跑全量 test（chainHead / testCount 默认 pending 或注入 mock）；
// cheap 字段在仓库内实测可重现。

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { runStatus } from '../../src/cli/commands/status.ts';
import { collectStatusDump, TEST_GLOBS, toStatusJson } from '../../src/cli/status_dump.ts';

test('collectStatusDump: phase A cheap 字段从仓库实测', () => {
  const dump = collectStatusDump();

  // commitSha：非空（本地有 commit 则为 40 字符 hex；无 commit 则降级 no-commits-yet）
  assert.ok(dump.commitSha.length > 0, 'commitSha 应非空');

  // tsFileCount：src/**/*.ts 实测（项目 > 100 个 .ts）
  assert.ok(dump.tsFileCount > 50, `tsFileCount 应 > 50，实际: ${dump.tsFileCount}`);

  // migrationCount：0001-0019 共 19 个（status_dump 从 schema/migrations/*.sql readdir 实测·非硬编码；
  // 0019 = ruleset_uri·IC-01 内核版本化 ADR-007；0018 = FUSION-OS-6 evidence provenance DB trigger）。
  assert.strictEqual(dump.migrationCount, 19);
  assert.ok(dump.migrationFiles.includes('0001_initial.sql'));
  assert.ok(dump.migrationFiles.includes('0008_anti_theater_fail_coverage.sql'));
  assert.ok(
    dump.migrationFiles.includes('0011_anti_theater_trigger_v2.sql'),
    '0011 anti-theater trigger V2 须在 migrationFiles',
  );

  // docCount：docs/**/*.md 实测（纯净仓库口径·docs/ 是用户文档根）
  assert.ok(dump.docCount > 0, 'docCount 应 > 0');
});

test('collectStatusDump: golden 印证 01§4.4（REPRO_CONTEXT_FIXTURE 单向量 hex 非 merkle 根）', () => {
  const dump = collectStatusDump();
  assert.ok(dump.goldenVectorCount > 0, 'GOLDEN_VECTORS 应非空');
  assert.strictEqual(
    dump.goldenReproFixtureHex,
    '96a6372bdf040677c26700456856ec365b478f9e3bf8824e4b2b9d123af4abf4',
  );
});

test('collectStatusDump: 默认 chainHead pending（无 --db）', () => {
  const dump = collectStatusDump();
  assert.strictEqual(dump.chainHead.status, 'pending');
  assert.ok(
    dump.chainHead.reason?.includes('--db') === true,
    `reason 应提示 --db，实际: ${dump.chainHead.reason}`,
  );
});

test('collectStatusDump: chainHead 可由调用方注入（CLI 层 --db 算出后传入）', () => {
  const dump = collectStatusDump({ chainHead: { status: 'ok', verifiedCount: 5 } });
  assert.strictEqual(dump.chainHead.status, 'ok');
  assert.strictEqual(dump.chainHead.verifiedCount, 5);
});

test('collectStatusDump: broken chainHead 含 brokenAtSeq', () => {
  const dump = collectStatusDump({
    chainHead: { status: 'broken', verifiedCount: 3, brokenAtSeq: 4 },
  });
  assert.strictEqual(dump.chainHead.status, 'broken');
  assert.strictEqual(dump.chainHead.brokenAtSeq, 4);
});

test('collectStatusDump: 默认 testCount pending（collectStatusDump 不跑全量 test）', () => {
  const dump = collectStatusDump();
  assert.ok('pending' in dump.testCount, '默认 testCount 应 pending');
  if ('pending' in dump.testCount) {
    assert.strictEqual(dump.testCount.phaseB, true);
    assert.ok(dump.testCount.reason.length > 0);
  }
});

test('collectStatusDump: testCount 可注入实测（CLI 层 spawn 后传入）', () => {
  const dump = collectStatusDump({ testCount: { total: 669, pass: 669, fail: 0 } });
  assert.ok(!('pending' in dump.testCount), '注入后 testCount 应非 pending');
  if (!('pending' in dump.testCount)) {
    assert.strictEqual(dump.testCount.total, 669);
    assert.strictEqual(dump.testCount.pass, 669);
    assert.strictEqual(dump.testCount.fail, 0);
  }
});

test('collectStatusDump: 默认 coverage pending（collectStatusDump 不 spawn coverage）', () => {
  const dump = collectStatusDump();
  for (const field of [dump.coverageLine, dump.coverageBranch]) {
    if (typeof field === 'number') {
      assert.fail('coverage 默认应 pending·不应为 number');
      continue;
    }
    assert.strictEqual(field.pending, true);
    assert.strictEqual(field.phaseB, true);
    assert.ok(field.reason.length > 0, 'pending 字段须有 reason（反幻觉：标注为何未实测）');
  }
});

test('collectStatusDump: suiteIntegrityRoot 默认读 benchmark_report.json（phase C·零 spawn·实测）', () => {
  const dump = collectStatusDump();
  assert.ok(
    typeof dump.suiteIntegrityRoot === 'string',
    `suiteIntegrityRoot 应默认实测 string，实际: ${JSON.stringify(dump.suiteIntegrityRoot)}`,
  );
  if (typeof dump.suiteIntegrityRoot === 'string') {
    assert.ok(
      /^[0-9a-f]{64}$/.test(dump.suiteIntegrityRoot),
      `suiteIntegrityRoot 应为 64 hex，实际: ${dump.suiteIntegrityRoot}`,
    );
    assert.strictEqual(
      dump.suiteIntegrityRoot,
      'f70dc3bd1377dad2d8d048df209e4cab6e248503c6da69f6e4df0a9c1d7542df',
      'suiteIntegrityRoot 应 = benchmark_report.json 的确定性锚 hex',
    );
  }
});

test('collectStatusDump: coverage 可注入实测（CLI 层 spawn 后传入）', () => {
  const dump = collectStatusDump({ coverage: { line: 93.07, branch: 82.22 } });
  assert.ok(typeof dump.coverageLine === 'number', '注入后 coverageLine 应为 number');
  assert.ok(typeof dump.coverageBranch === 'number', '注入后 coverageBranch 应为 number');
  if (typeof dump.coverageLine === 'number' && typeof dump.coverageBranch === 'number') {
    assert.strictEqual(dump.coverageLine, 93.07);
    assert.strictEqual(dump.coverageBranch, 82.22);
  }
});

test('toStatusJson: 输出机器可读 SSOT，不把 pending 伪装成数字', () => {
  const json = toStatusJson(collectStatusDump(), '2026-07-02T00:00:00.000Z');

  assert.strictEqual(json.project, 'FAR-Chain');
  assert.strictEqual(json.generatedAt, '2026-07-02T00:00:00.000Z');
  assert.strictEqual(json.nodeVersion, process.version);
  assert.strictEqual(json.platform.os, process.platform);
  assert.strictEqual(json.test.status, 'pending');
  assert.strictEqual(json.test.totalCount, 'Pending');
  assert.strictEqual(json.coverage.status, 'pending');
  assert.strictEqual(json.coverage.line, 'Pending');
  assert.strictEqual(json.fileCounts.tsSourceCount > 50, true);
  assert.strictEqual(
    json.goldenVectors.reproContextFixtureExpectedHex,
    '96a6372bdf040677c26700456856ec365b478f9e3bf8824e4b2b9d123af4abf4',
  );
  assert.strictEqual(json.capabilities.canonicalHash, 'IMPLEMENTED_VERIFIED');
  assert.strictEqual(json.capabilities.farVerify, 'IMPLEMENTED_VERIFIED');
  assert.strictEqual(json.capabilities.farExportReceipt, 'IMPLEMENTED_VERIFIED');
  assert.strictEqual(json.capabilities.farExportFarProof, 'IMPLEMENTED_VERIFIED');
  assert.strictEqual(json.capabilities.farBenchRun, 'IMPLEMENTED_VERIFIED');
  assert.strictEqual(json.capabilities.browserVerifier, 'IMPLEMENTED_VERIFIED');
  assert.strictEqual(json.capabilities.pythonVerifier, 'IMPLEMENTED_VERIFIED');
});

test('toStatusJson: 注入 testCount/coverage 后输出实测 pass 字段', () => {
  const dump = collectStatusDump({
    testCount: { total: 10, pass: 9, fail: 1, skipped: 2 },
    coverage: { line: 91.23, branch: 80.5 },
  });
  const json = toStatusJson(dump, '2026-07-02T00:00:00.000Z');

  assert.strictEqual(json.test.status, 'fail');
  assert.strictEqual(json.test.totalCount, 10);
  assert.strictEqual(json.test.passedCount, 9);
  assert.strictEqual(json.test.failedCount, 1);
  assert.strictEqual(json.test.skippedCount, 2);
  assert.strictEqual(json.coverage.status, 'pass');
  assert.strictEqual(json.coverage.line, 91.23);
  assert.strictEqual(json.coverage.branch, 80.5);
});

test('TEST_GLOBS: 与 package.json test script 一致（含 tests/cli 自身 + tests/anti_theater + tests/proof_envelope/v2）', () => {
  assert.ok(TEST_GLOBS.length >= 20, `TEST_GLOBS 应 >= 20 项，实际: ${TEST_GLOBS.length}`);
  assert.ok(
    TEST_GLOBS.every((g) => g.startsWith('tests/') && /\.test\.(ts|mjs)$/.test(g)),
    'TEST_GLOBS 每项须 tests/ 前缀 + .test.ts/.test.mjs 后缀（package.json test script 含 tests/scripts/*.test.mjs）',
  );
  assert.ok(TEST_GLOBS.includes('tests/cli/*.test.ts'), 'TEST_GLOBS 须含 tests/cli（自身测试入口径）');
  assert.ok(
    TEST_GLOBS.includes('tests/proof_envelope/v2/*.test.ts'),
    'TEST_GLOBS 须含 tests/proof_envelope/v2（RULE-PE-010 跨语言对拍 + V2 10-rule validator CI 注册）',
  );
  assert.ok(
    TEST_GLOBS.includes('tests/confounding_gate/*.test.ts'),
    'TEST_GLOBS 须含 tests/confounding_gate（与 package.json test script 一致）',
  );
});

test('runStatus: repoRoot 无 .git → exit 2 + far doctor 指引（installed-package 降级，不 crash ENOENT docs/）', () => {
  const nonRepoRoot = mkdtempSync(join(tmpdir(), 'far-status-nogit-'));
  const chunks: string[] = [];
  const realWrite = process.stderr.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stderr.write;
  try {
    const exitCode = runStatus({ json: false }, nonRepoRoot);
    assert.strictEqual(exitCode, 2, '非 repo checkout 须 exit 2，不得 crash ENOENT docs/');
    const stderr = chunks.join('');
    assert.match(stderr, /not a repository checkout/);
    assert.match(stderr, /use `far doctor`/);
    assert.match(stderr, /has no \.git/);
  } finally {
    process.stderr.write = realWrite;
    rmSync(nonRepoRoot, { recursive: true, force: true });
  }
});
