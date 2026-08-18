/**
 * verifier_contract.test.ts — PROOF-VERIFY-001 验收：公开 verifier 真实、离线、零遥测。
 *
 * 覆盖宪法验收项：
 *   - offline：withNetworkDenied（fetch 拒绝）下 library runner 全套向量通过
 *   - tamper：tampered 向量必须以具体失败码 FAIL（篡改检测，非仅 PASS/FAIL）
 *   - cross-implementation：CLI（真实子进程 far verify --bundle）与 library 两 runner
 *     对同一向量集各自全过
 *   - privacy/network-deny：静态扫描 0 网络 import / 0 URL 遥测 / 0 凭证读取
 *     （allowlist 呈现）
 *   - browser 资产存在性：诚实条件断言（存在消费方则验 schema；不存在则如实报告）
 *
 * Cannot-prove：见 src/far_proof/verifier_contract.ts 模块头（静态扫描不覆盖传递依赖；
 * fetch stub 不拦截 socket 直连；向量集是抽样锚非全输入空间等价证明）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  buildDemoChain,
  computeEnvHash,
  DEMO_GIT_COMMIT_SHA,
  DEMO_RUN_ID,
} from '../../src/far_proof/demo_chain.ts';
import { exportFarProof } from '../../src/far_proof/index.ts';
import { verifyFarProofBundle } from '../../src/far_proof/bundle_verifier.ts';
import {
  VERIFIER_CONTRACT,
  loadConformanceVectors,
  loadConformanceVectorsFile,
  validateConformanceVectorsDoc,
  verifyConformance,
  makeCliVerifierRunner,
  withNetworkDenied,
  NetworkDeniedError,
  scanVerifierNetworkImports,
  scanVerifierTelemetry,
  scanVerifierCredentialUsage,
  checkBrowserVerifierAsset,
  applyConformanceMutation,
  type ConformanceRunner,
} from '../../src/far_proof/verifier_contract.ts';
import { readFileSync, writeFileSync } from 'node:fs';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** 导出 clean demo bundle 到 tmp/base（与 golden corpus 同构造路径）。 */
function exportDemoBundle(tmp: string): string {
  const db = new Database(':memory:');
  try {
    buildDemoChain(db);
    const envHash = computeEnvHash({
      schemaVersion: 6,
      nodeVersion: process.version,
      providerProfile: 'offline_replay',
    });
    const outputDir = join(tmp, 'base');
    exportFarProof({
      db,
      outputDir,
      runId: DEMO_RUN_ID,
      modelSnapshot: 'offline-replay-fixture@v1',
      gitCommitSha: DEMO_GIT_COMMIT_SHA,
      envHash,
      exportedAt: '2026-08-01T00:00:00.000Z',
    });
    return outputDir;
  } finally {
    db.close();
  }
}

const libraryRunner: ConformanceRunner = (bundleDir) => {
  const r = verifyFarProofBundle(bundleDir, 'full');
  return { ok: r.ok, errors: r.errors };
};

// ---------------------------------------------------------------------------
// 契约与向量集形状
// ---------------------------------------------------------------------------

test('VERIFIER_CONTRACT: 5 条行为保证，每条绑定机器验证手段', () => {
  const ids = VERIFIER_CONTRACT.guarantees.map((g) => g.id);
  assert.deepEqual(ids, [
    'OFFLINE_CAPABLE',
    'NO_MODEL_CREDENTIALS',
    'NO_NETWORK_EGRESS',
    'NO_TELEMETRY',
    'VERDICT_FROM_EXECUTION_ONLY',
  ]);
  for (const g of VERIFIER_CONTRACT.guarantees) {
    assert.ok(g.statement.length > 10, `${g.id} 须有实质陈述`);
    assert.ok(g.verifiedBy.length >= 1, `${g.id} 须绑定验证手段`);
  }
});

test('conformance vectors: ≥10 条、4 类全覆盖、共享 schema 字段齐全', () => {
  const doc = loadConformanceVectors();
  assert.ok(doc.vectors.length >= 10, `向量数 ${doc.vectors.length} 须 ≥10`);
  const kinds = new Set<string>(doc.vectors.map((v) => v.kind));
  for (const k of ['valid', 'tampered', 'malformed', 'missing_artifact']) {
    assert.ok(kinds.has(k), `kind ${k} 缺失`);
  }
  for (const v of doc.vectors) {
    assert.ok(typeof v.vectorId === 'string' && v.vectorId.length > 0);
    assert.equal(v.inputRef.base, 'far-proof-demo-chain@v1');
    assert.ok(v.expectedOutcome.status === 'PASS' || v.expectedOutcome.status === 'FAIL');
    if (v.expectedOutcome.status === 'FAIL') {
      assert.ok(v.expectedOutcome.errorCode.length > 3, `${v.vectorId} FAIL 向量须带具体失败码`);
    }
    assert.match(v.derivedFrom, /empirical/);
  }
});

// ---------------------------------------------------------------------------
// 公开 JSON Schema（draft-07）——规范工件 + schema 驱动校验真实接线
// ---------------------------------------------------------------------------

test('公开 schema 工件: draft-07 声明 + 顶层 required 覆盖 formatVersion/vectors', () => {
  const schema = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../src/far_proof/conformance_vectors.schema.json', import.meta.url)),
      'utf8',
    ),
  ) as { readonly $schema: string; readonly required: readonly string[]; readonly properties: Record<string, unknown> };
  assert.match(schema.$schema, /draft-07/);
  assert.deepEqual([...schema.required].sort(), ['formatVersion', 'generated', 'vectors']);
  assert.ok(Object.keys(schema.properties).length >= 3);
  // expectedOutcome 的 oneOf 两分支：PASS 无 errorCode / FAIL 必带 errorCode
  const outcome = JSON.stringify(schema);
  assert.match(outcome, /"const":\s*"PASS"/);
  assert.match(outcome, /"const":\s*"FAIL"/);
});

test('schema 校验真实接线: 出厂 vectors 文档 0 违规（loadConformanceVectors 加载即校验）', () => {
  const doc = loadConformanceVectors(); // 内部走 validateConformanceVectorsDoc——坏文档会抛
  assert.equal(doc.formatVersion, 1);
  assert.equal(validateConformanceVectorsDoc(doc).length, 0, '出厂文档必须对公开 schema 0 违规');
});

test('schema 校验负向: 篡改向量文档必须被 schema 校验拒绝（契约可证伪）', () => {
  const rawJson = readFileSync(
    fileURLToPath(new URL('../../src/far_proof/conformance_vectors.json', import.meta.url)),
    'utf8',
  );
  interface MutableDoc {
    formatVersion: unknown;
    vectors: { [key: string]: unknown }[];
    [key: string]: unknown;
  }
  const cases: readonly { readonly name: string; readonly mutate: (d: MutableDoc) => void; readonly expect: RegExp }[] = [
    { name: '缺 derivedFrom', mutate: (d) => { delete d.vectors[0]!.derivedFrom; }, expect: /missing required property 'derivedFrom'/ },
    { name: 'kind 非法', mutate: (d) => { d.vectors[0]!.kind = 'bogus'; }, expect: /not in enum/ },
    { name: 'FAIL 缺 errorCode', mutate: (d) => { d.vectors[0]!.expectedOutcome = { status: 'FAIL' }; }, expect: /oneOf/ },
    { name: 'mutate.action 非法', mutate: (d) => { d.vectors[0]!.inputRef = { base: 'far-proof-demo-chain@v1', mutate: { target: 'x', action: 'nuke' } }; }, expect: /not in enum/ },
    { name: '未知顶层键', mutate: (d) => { d.extraKey = 1; }, expect: /additional property/ },
    { name: 'formatVersion 漂移', mutate: (d) => { d.formatVersion = 2; }, expect: /expected const 1, got 2/ },
  ];
  for (const c of cases) {
    const doc = JSON.parse(rawJson) as MutableDoc;
    c.mutate(doc);
    const violations = validateConformanceVectorsDoc(doc);
    assert.ok(violations.length > 0, `${c.name}: 必须产生违规`);
    assert.match(
      violations.map((v) => `${v.path}: ${v.message}`).join('; '),
      c.expect,
      `${c.name}: 违规信息须指路（got: ${violations.map((v) => v.message).join('; ')}）`,
    );
  }
});

test('loadConformanceVectorsFile 负向: 坏 JSON 文件按 schema 拒绝（端到端）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-vc-schema-'));
  try {
    const rawJson = readFileSync(
      fileURLToPath(new URL('../../src/far_proof/conformance_vectors.json', import.meta.url)),
      'utf8',
    );
    const bad = JSON.parse(rawJson) as { vectors: { [key: string]: unknown }[] };
    delete bad.vectors[0]!.vectorId;
    const badPath = join(tmp, 'bad_vectors.json');
    writeFileSync(badPath, JSON.stringify(bad), 'utf8');
    assert.throws(
      () => loadConformanceVectorsFile(badPath),
      /violate the public schema.*vectorId/,
      '坏文件必须被加载路径拒绝（schema 是加载时契约，不是摆设）',
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// cross-implementation conformance（library + CLI 各自实证）
// ---------------------------------------------------------------------------

test('library runner: 全套 conformance 向量通过（valid→PASS / tampered→具体失败码 / malformed / missing）', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-vc-lib-'));
  try {
    const base = exportDemoBundle(tmp);
    const summary = await verifyConformance(libraryRunner, base, join(tmp, 'ws'));
    assert.equal(summary.allPassed, true, JSON.stringify(summary.cases.filter((c) => !c.pass), null, 1));
    assert.equal(summary.caseCount, loadConformanceVectors().vectors.length);
    // tampered 向量的错误码必须被命中（ errorCodeMatched === true，非 null）
    for (const c of summary.cases) {
      if (c.kind === 'tampered') {
        assert.equal(c.errorCodeMatched, true, `${c.vectorId} 篡改向量须命中具体失败码`);
        assert.equal(c.expectedStatus, 'FAIL');
      }
      if (c.kind === 'valid') {
        assert.equal(c.actualOk, true, `${c.vectorId} 合法向量须 PASS`);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI runner: 同一向量集经真实 CLI 子进程（far verify --bundle）全过——跨实现一致', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-vc-cli-'));
  try {
    const base = exportDemoBundle(tmp);
    const cliRunner = makeCliVerifierRunner({ repoRoot: REPO_ROOT });
    const summary = await verifyConformance(cliRunner, base, join(tmp, 'ws'));
    assert.equal(
      summary.allPassed,
      true,
      JSON.stringify(summary.cases.filter((c) => !c.pass).map((c) => ({ id: c.vectorId, ok: c.actualOk, matched: c.errorCodeMatched })), null, 1),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('conformance 杀伤力: 橡皮章 runner（一切 ok:true）必须被判 FAIL——向量集能检出不作验证的实现', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-vc-sab-'));
  try {
    const base = exportDemoBundle(tmp);
    const rubberStamp: ConformanceRunner = () => ({ ok: true, errors: [] });
    const summary = await verifyConformance(rubberStamp, base, join(tmp, 'ws'));
    assert.equal(summary.allPassed, false, '橡皮章 runner 不得通过 conformance');
    // 除 valid 向量外全部必须 fail（它们期望 FAIL + 错误码，橡皮章给不出）
    const valid = summary.cases.filter((c) => c.kind === 'valid');
    const nonValid = summary.cases.filter((c) => c.kind !== 'valid');
    assert.equal(valid.length, 1);
    assert.equal(valid[0]?.pass, true);
    assert.equal(nonValid.every((c) => !c.pass), true, 'tampered/malformed/missing 向量必须全部击杀橡皮章');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// offline（network-deny）测试
// ---------------------------------------------------------------------------

test('offline: fetch 全程被拒绝的环境下 library runner 全套向量仍通过', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-vc-off-'));
  try {
    const base = exportDemoBundle(tmp);
    const summary = await withNetworkDenied(() => verifyConformance(libraryRunner, base, join(tmp, 'ws')));
    assert.equal(summary.allPassed, true, 'verifier 在无网络环境必须完整工作（OFFLINE_CAPABLE 保证）');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('withNetworkDenied 机制自证: 作用域内 fetch 抛 NetworkDeniedError，退出后恢复原 fetch', async () => {
  const before = globalThis.fetch;
  let threw: unknown = null;
  const result = await withNetworkDenied(async () => {
    try {
      await fetch('https://example.invalid/');
    } catch (e) {
      threw = e;
    }
    return 'survived';
  });
  assert.ok(threw instanceof NetworkDeniedError, '作用域内 fetch 必须抛 NetworkDeniedError');
  assert.equal(result, 'survived');
  assert.equal(globalThis.fetch, before, '退出后 fetch 必须恢复');
});

// ---------------------------------------------------------------------------
// privacy / network-deny 静态扫描
// ---------------------------------------------------------------------------

test('静态扫描: verifier 模块 0 网络 import / 0 裸 fetch 调用（allowlist 呈现且仅含 harness 自身）', () => {
  const r = scanVerifierNetworkImports(REPO_ROOT);
  assert.equal(r.ok, true, `发现违规: ${JSON.stringify(r.findings)}`);
  assert.equal(r.scannedFiles, 6, '契约覆盖 6 个 verifier 模块');
  assert.deepEqual(
    r.allowlist.map((a) => a.file),
    ['src/far_proof/verifier_contract.ts'],
    '唯一 allowlist = withNetworkDenied 测试装备自身（无业务豁免）',
  );
});

test('静态扫描: verifier 模块 0 URL 字面量 / 0 endpoint 遥测常量（零遥测）', () => {
  const r = scanVerifierTelemetry(REPO_ROOT);
  assert.equal(r.ok, true, `发现遥测模式: ${JSON.stringify(r.findings)}`);
  assert.deepEqual(r.allowlist, [], '遥测扫描无豁免');
});

test('静态扫描: verifier 模块 0 凭证形 env 读取 / 0 llm_gateway import（无模型凭证）', () => {
  const r = scanVerifierCredentialUsage(REPO_ROOT);
  assert.equal(r.ok, true, `发现凭证模式: ${JSON.stringify(r.findings)}`);
  assert.deepEqual(r.allowlist, [], '凭证扫描无豁免');
});

// ---------------------------------------------------------------------------
// 浏览器/WASM 资产存在性（只读、诚实条件断言）
// ---------------------------------------------------------------------------

test('checkBrowserVerifierAsset: 前端 verifier 资产如实报告；若存在 conformance 消费方则 schema 校验通过', () => {
  const report = checkBrowserVerifierAsset(REPO_ROOT);
  assert.ok(Array.isArray(report.frontendVerifierFiles), '资产清单须为数组');
  if (report.consumingFiles.length > 0) {
    assert.equal(report.consumesConformanceVectorsFormat, true, '存在消费方时共享格式必须校验通过');
  } else {
    // 诚实缺口：当前无浏览器端 verifier 消费 conformance vectors——报告不得假装跨端一致
    assert.equal(report.consumesConformanceVectorsFormat, false);
    assert.match(report.note, /no frontend file consumes conformance_vectors/);
  }
});

// ---------------------------------------------------------------------------
// 向量应用机制边界
// ---------------------------------------------------------------------------

test('applyConformanceMutation: delete 不存在目标抛错；action none 为 no-op', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-vc-mut-'));
  try {
    assert.throws(() => applyConformanceMutation(tmp, { target: 'no-such.file', action: 'delete' }), /missing/);
    assert.doesNotThrow(() => applyConformanceMutation(tmp, { action: 'none' }));
    assert.throws(() => applyConformanceMutation(tmp, { target: 'x', action: 'append' }), /ENOENT/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
