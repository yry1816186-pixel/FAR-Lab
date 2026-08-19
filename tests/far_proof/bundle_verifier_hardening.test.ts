/**
 * bundle_verifier_hardening.test.ts — .far-proof bundle 验证对抗回归(2026-07-20 对抗轮)。
 *
 * 覆盖发现:
 *   F-V09-03 信封链引用悬空(删除在先信封)检出;
 *   F-V09-04 full 模式空账本升级 error;
 *   V05-F5/F-V09-02 lifecycle_events.jsonl 篡改/抹除/claim_graph 不一致检出。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildDemoChain } from '../../src/far_proof/demo_chain.ts';
import { exportFarProof } from '../../src/far_proof/exporter.ts';
import { verifyFarProofBundle, verifyProofEnvelopeJsonl, verifyLifecycleEventsJsonl } from '../../src/far_proof/bundle_verifier.ts';
import { computeProofHash } from '../../src/proof_envelope/proof_hash.ts';
import { GENESIS_PROOF_HASH } from '../../src/proof_envelope/types.ts';
import { applyLifecycleTransition } from '../../src/evidence_log/index.ts';
import { runMigrations } from '../../src/db/migrator.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function exportDemo(db: Database.Database): string {
  const outDir = mkdtempSync(join(tmpdir(), 'bv-hard-'));
  exportFarProof({
    db,
    outputDir: outDir,
    runId: 'bv-hard',
    modelSnapshot: 'bv-model',
    gitCommitSha: 'e'.repeat(40),
    envHash: 'f'.repeat(64),
  });
  return outDir;
}

function makeEnvelopeRow(id: string, prevProofHash: string): Record<string, unknown> {
  const base = {
    envelopeId: id,
    claimId: 'CLM-TEST',
    verdictNodeId: `VN-${id}`,
    conclusion: 'CONFIRMED' as const,
    prevProofHash,
    checks: [{ ruleId: 'RULE-PE-001' as const, ruleName: 'r', outcome: 'PASS' as const, detail: 'd' }],
    knownFailures: [] as string[],
    falsificationSpec: { prediction: 'p', metric: 'm', falsificationThreshold: 0.5, thresholdSemantics: 'gt' as const },
    sourceAnchor: { gitCommitSha: 'b'.repeat(40), dashscopeRequestId: null, isoTimestamp: '2026-07-20T00:00:00.000Z', rawResponseHash: 'c'.repeat(64) },
    reproHash: 'a'.repeat(64),
    sealedBy: 'deterministic_sealer' as const,
    sealedAt: '2026-07-20T00:00:00.000Z',
    createdAt: '2026-07-20T00:00:00.000Z',
  };
  const proofHash = computeProofHash(base);
  return {
    envelope_id: id,
    claim_id: base.claimId,
    verdict_node_id: base.verdictNodeId,
    conclusion: base.conclusion,
    proof_hash: proofHash,
    prev_proof_hash: prevProofHash,
    checks: JSON.stringify(base.checks),
    known_failures: JSON.stringify(base.knownFailures),
    falsification_spec: JSON.stringify(base.falsificationSpec),
    source_anchor: JSON.stringify(base.sourceAnchor),
    repro_hash: base.reproHash,
    sealed_by: base.sealedBy,
    sealed_at: base.sealedAt,
    created_at: base.createdAt,
  };
}

test('F-V09-04 full 模式空账本 → error;chain 模式保留警告兼容', () => {
  const db = openDb(); // 无 call_records → 空账本
  const outDir = exportDemo(db);
  const full = verifyFarProofBundle(outDir, 'full');
  assert.equal(full.ok, false);
  assert.ok(full.errors.some((e) => e.startsWith('CHAIN_EMPTY')), `errors: ${full.errors.join('; ')}`);
  const chainOnly = verifyFarProofBundle(outDir, 'chain');
  assert.equal(chainOnly.ok, true, `chain errors: ${chainOnly.errors.join('; ')}`);
  assert.ok(chainOnly.warnings.some((w) => w.startsWith('CHAIN_EMPTY')));
  db.close();
});

test('F-V09-03 信封链:合法链接通过;删除在先信封 → 悬空检出', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bv-link-'));
  const p = join(dir, 'proof_envelopes.jsonl');
  const envA = makeEnvelopeRow('PE-A', GENESIS_PROOF_HASH);
  const envB = makeEnvelopeRow('PE-B', envA.proof_hash as string);

  writeFileSync(p, `${JSON.stringify(envA)}\n${JSON.stringify(envB)}\n`, 'utf8');
  const legit = verifyProofEnvelopeJsonl(p);
  assert.equal(legit.mismatches.length, 0);
  assert.equal(legit.linkageErrors.length, 0);

  // 删除首信封 → B 的 prev 悬空
  writeFileSync(p, `${JSON.stringify(envB)}\n`, 'utf8');
  const dangling = verifyProofEnvelopeJsonl(p);
  assert.equal(dangling.linkageErrors.length, 1);
  assert.match(dangling.linkageErrors[0] ?? '', /PROOF_CHAIN_DANGLING: PE-B/);

  // 乱序(B 在 A 前)→ B 的 prev 在其出现时不可解析
  writeFileSync(p, `${JSON.stringify(envB)}\n${JSON.stringify(envA)}\n`, 'utf8');
  const reordered = verifyProofEnvelopeJsonl(p);
  assert.equal(reordered.linkageErrors.length, 1);
});

test('V05-F5/F-V09-02 合法撤回包 full verify 通过;篡改/抹除/翻转均检出', () => {
  const db = openDb();
  buildDemoChain(db);
  applyLifecycleTransition(db, { targetKind: 'claim', targetId: 'C-ASTRO-0001', toState: 'contested', actor: 'a', reason: 'counter' });
  applyLifecycleTransition(db, { targetKind: 'claim', targetId: 'C-ASTRO-0001', toState: 'retracted', actor: 'a', reason: 'fabrication' });
  const outDir = exportDemo(db);

  const base = verifyFarProofBundle(outDir, 'full');
  assert.equal(base.ok, true, `baseline errors: ${base.errors.join('; ')}`);

  // 篡改 to_state(不重算 hash)→ 链断
  const tampered = mkdtempSync(join(tmpdir(), 'bv-lc-tamper-'));
  cpSync(outDir, tampered, { recursive: true });
  const lcPath = join(tampered, 'lifecycle_events.jsonl');
  const lines = readFileSync(lcPath, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  const last = JSON.parse(lines[lines.length - 1] ?? '{}') as Record<string, unknown>;
  last.to_state = 'active';
  lines[lines.length - 1] = JSON.stringify(last);
  writeFileSync(lcPath, `${lines.join('\n')}\n`, 'utf8');
  const tamperResult = verifyFarProofBundle(tampered, 'full');
  assert.equal(tamperResult.ok, false);
  assert.ok(tamperResult.errors.some((e) => e.startsWith('LIFECYCLE_CHAIN_BROKEN')), `errors: ${tamperResult.errors.join('; ')}`);

  // 抹除整个文件 → LIFECYCLE_STRIPPED
  const stripped = mkdtempSync(join(tmpdir(), 'bv-lc-strip-'));
  cpSync(outDir, stripped, { recursive: true });
  rmSync(join(stripped, 'lifecycle_events.jsonl'));
  const stripResult = verifyFarProofBundle(stripped, 'full');
  assert.equal(stripResult.ok, false);
  assert.ok(stripResult.errors.some((e) => e.startsWith('LIFECYCLE_STRIPPED')), `errors: ${stripResult.errors.join('; ')}`);

  // claim_graph.lifecycleStates 翻转(事件不动)→ LIFECYCLE_STATE_MISMATCH
  const flipped = mkdtempSync(join(tmpdir(), 'bv-lc-flip-'));
  cpSync(outDir, flipped, { recursive: true });
  const cgPath = join(flipped, 'claim_graph.json');
  const graph = JSON.parse(readFileSync(cgPath, 'utf8')) as { lifecycleStates: Record<string, string> };
  graph.lifecycleStates['claim:C-ASTRO-0001'] = 'active';
  writeFileSync(cgPath, JSON.stringify(graph, null, 2), 'utf8');
  const flipResult = verifyFarProofBundle(flipped, 'full');
  assert.equal(flipResult.ok, false);
  assert.ok(flipResult.errors.some((e) => e.startsWith('LIFECYCLE_STATE_MISMATCH')), `errors: ${flipResult.errors.join('; ')}`);
  db.close();
});

test('回归基线:无生命周期事件的 demo 包 full verify 仍通过', () => {
  const db = openDb();
  buildDemoChain(db);
  const outDir = exportDemo(db);
  const result = verifyFarProofBundle(outDir, 'full');
  assert.equal(result.ok, true, `errors: ${result.errors.join('; ')}`);
  db.close();
});

test('lifecycle_events.jsonl 含不可解析行 → LIFECYCLE_ROW_UNREADABLE（此前未测错误路径）', () => {
  // bundle_verifier.verifyLifecycleEventsJsonl 对每行 JSON.parse 包 try/catch：
  // 不可解析 → push LIFECYCLE_ROW_UNREADABLE + continue（不中断后续行校验）。
  // 此前测覆盖篡改/抹除/翻转但未覆盖“行本身损坏”这条防御路径。
  const db = openDb();
  buildDemoChain(db);
  applyLifecycleTransition(db, { targetKind: 'claim', targetId: 'C-ASTRO-0001', toState: 'contested', actor: 'a', reason: 'counter' });
  const outDir = exportDemo(db);
  const tampered = mkdtempSync(join(tmpdir(), 'bv-lc-unread-'));
  cpSync(outDir, tampered, { recursive: true });
  // 追加一行非法 JSON（独占一行·JSONL）→ JSON.parse 抛错
  const lcPath = join(tampered, 'lifecycle_events.jsonl');
  const original = readFileSync(lcPath, 'utf8');
  writeFileSync(lcPath, `${original}{ this is not valid json }}}\n`, 'utf8');
  const result = verifyFarProofBundle(tampered, 'full');
  assert.equal(result.ok, false, '不可解析的 lifecycle 行须导致 verify 红');
  assert.ok(
    result.errors.some((e) => e.startsWith('LIFECYCLE_ROW_UNREADABLE')),
    `须报 LIFECYCLE_ROW_UNREADABLE: ${result.errors.join('; ')}`,
  );
  db.close();
});

test('bundle 文件不可解析 → 对应 *_UNREADABLE 错误（CALL_RECORDS/PROOF_ENVELOPES/CLAIM_GRAPH·此前未测 catch 块）', () => {
  // 三个独立 catch 块此前 0 测覆盖：proof_envelopes.jsonl / call_records.redacted.jsonl /
  // claim_graph.json 被损坏为非法 JSON 时，各验证函数的 try/catch 须 push 对应 *_UNREADABLE。
  const cases = [
    { file: 'proof_envelopes.jsonl', code: 'PROOF_ENVELOPES_UNREADABLE' },
    { file: 'call_records.redacted.jsonl', code: 'CALL_RECORDS_UNREADABLE' },
    { file: 'claim_graph.json', code: 'CLAIM_GRAPH_UNREADABLE' },
  ];
  const db = openDb();
  buildDemoChain(db);
  const base = exportDemo(db);
  try {
    for (const { file, code } of cases) {
      const tampered = mkdtempSync(join(tmpdir(), 'bv-unread-'));
      cpSync(base, tampered, { recursive: true });
      writeFileSync(join(tampered, file), '{ this is not valid json }}}', 'utf8');
      const result = verifyFarProofBundle(tampered, 'full');
      assert.equal(result.ok, false, `${file} 不可解析须导致 verify 红`);
      assert.ok(
        result.errors.some((e) => e.startsWith(code)),
        `${file} 不可解析须报 ${code}: ${result.errors.join('; ')}`,
      );
    }
  } finally {
    db.close();
  }
});

test('proof envelope checks 字段非数组 → fail-closed throw(parseJsonArrayChecks·防篡改)', () => {
  // rowToEnvelope(row) 调 parseJsonArrayChecks(row.checks)：JSON.parse 后非数组→抛
  // 'checks is not a JSON array'(rowToEnvelope 内无 try/catch·从 verify 循环裸传播)。
  // 此前零测(现有信封测覆盖链接/悬挂,未测 checks 字段形状守卫)。
  const dir = mkdtempSync(join(tmpdir(), 'bv-checks-'));
  try {
    const p = join(dir, 'proof_envelopes.jsonl');
    const env = makeEnvelopeRow('PE-CHECKS', GENESIS_PROOF_HASH);
    env.checks = '"not-an-array"'; // checks 是合法 JSON 字符串但 parse 后非数组
    writeFileSync(p, `${JSON.stringify(env)}\n`, 'utf8');
    assert.throws(
      () => verifyProofEnvelopeJsonl(p),
      /checks is not a JSON array/,
      '非数组 checks 须 fail-closed 抛错',
    );

    // checks 数组含非对象元素 → 'checks[N] is not an object'
    const env2 = makeEnvelopeRow('PE-CHECKS2', GENESIS_PROOF_HASH);
    env2.checks = '[123]';
    writeFileSync(p, `${JSON.stringify(env2)}\n`, 'utf8');
    assert.throws(
      () => verifyProofEnvelopeJsonl(p),
      /checks\[0\] is not an object/,
      '数组内非对象元素须报 checks[N] is not an object',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── 2026-08-20 mutation 盲区补杀（74 位点全跑存活 10 → 目标 <10%）─────────────
// 存活根因：既有用例偏重篡改场景的 errors 文本断言，缺少「通过场景结果对象字段」
// 断言（ok / requiredFilesPresent / proofEnvelopeOk / dbAnchor 合法锚 / 签名
// mismatchPaths 路径 / envFingerprint 比对分支）。

test('mutation 盲区: 合法 demo bundle full verify 结果对象全字段断言（通过场景）', () => {
  const db = openDb();
  buildDemoChain(db);
  const dir = exportDemo(db);
  try {
    const r = verifyFarProofBundle(dir, 'full', { dbAnchor: db });
    // ok 组合布尔（errors.length === 0 位点）
    assert.equal(r.ok, true, `合法包 ok 必须 true，实际 errors: ${JSON.stringify(r.errors)}`);
    // requiredFilesPresent（missingFiles.length === 0 位点）
    assert.equal(r.requiredFilesPresent, true, '合法包必需文件齐全');
    // proofEnvelopeOk 组合（mismatches===0 && linkageErrors===0 两个位点）
    assert.equal(r.proofEnvelopeRan, true);
    assert.equal(r.proofEnvelopeOk, true, `信封校验通过，实际 mismatches: ${JSON.stringify(r.proofEnvelopeMismatches)}`);
    assert.equal(r.chainRan, true);
    // dbAnchor 合法锚：typeof payload_hash === 'string' 位点——变异后 hash 变 null
    // → anchor 对比必然 mismatch；合法锚场景断言零 DB_EXPORT_ANCHOR_* 即杀。
    assert.deepEqual(
      r.errors.filter((e) => e.startsWith('DB_EXPORT_ANCHOR')),
      [],
      '同 DB 锚比对必须零错误',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutation 盲区: verifyLifecycleEventsJsonl 的 ok/checkedCount 组合布尔三向', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bv-mut-'));
  try {
    // claim_graph 不可解析 → ok:false（CLAIM_GRAPH_UNREADABLE 快速路径的 ok 位点）
    writeFileSync(join(dir, 'claim_graph.json'), '{not-json', 'utf8');
    const bad = verifyLifecycleEventsJsonl(join(dir, 'lifecycle.jsonl'), join(dir, 'claim_graph.json'));
    assert.equal(bad.ok, false, 'claim_graph 不可解析必须 ok=false');
    assert.equal(bad.checkedCount, 0);

    // 两侧皆无生命周期记录 → ok:true, checkedCount:0（缺失路径 ok 组合位点）
    writeFileSync(join(dir, 'claim_graph.json'), '{"lifecycleStates":{}}', 'utf8');
    const noLifecycle = verifyLifecycleEventsJsonl(join(dir, 'nonexistent.jsonl'), join(dir, 'claim_graph.json'));
    assert.equal(noLifecycle.ok, true, '两侧无记录 legacy 兼容必须 ok=true');

    // lifecycle 文件存在但为空、graph 无声明 → ok:true（空文件路径 ok 组合位点）
    writeFileSync(join(dir, 'lifecycle.jsonl'), '\n', 'utf8');
    const empty = verifyLifecycleEventsJsonl(join(dir, 'lifecycle.jsonl'), join(dir, 'claim_graph.json'));
    assert.equal(empty.ok, true, '空 lifecycle 且无声明必须 ok=true');
    assert.equal(empty.checkedCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutation 盲区: 签名失效须报 paths differ 路径明细（mismatchPaths 分支）', async () => {
  const { generateKeyPair, signFileManifest } = await import('../../src/security/ed25519.ts');
  const { buildFileManifest } = await import('../../src/security/file_manifest.ts');
  const { BUNDLE_SIGNATURE_SIDECAR_SUFFIX } = await import('../../src/far_proof/bundle_signature.ts');
  const db = openDb();
  buildDemoChain(db);
  const dir = exportDemo(db);
  try {
    const key = generateKeyPair();
    const manifest = buildFileManifest(dir);
    const sig = signFileManifest(manifest, key.privateKeyPem, '2026-08-20T00:00:00.000Z');
    writeFileSync(`${dir}${BUNDLE_SIGNATURE_SIDECAR_SUFFIX}`, JSON.stringify(sig), 'utf8');
    // 签名后篡改一个文件 → 验签失败且 mismatchPaths 非空 → evidence 走 'paths differ' 分支
    const target = join(dir, 'README_REPLAY.md');
    writeFileSync(target, `${readFileSync(target, 'utf8')}\nTAMPERED\n`, 'utf8');
    const r = verifyFarProofBundle(dir, 'full');
    assert.equal(r.ok, false, '签名失效必须 ok=false');
    const sigErr = r.errors.find((e) => e.startsWith('ED25519_SIGNATURE_INVALID'));
    assert.ok(sigErr !== undefined, `须报 ED25519_SIGNATURE_INVALID，实际: ${JSON.stringify(r.errors)}`);
    assert.match(sigErr, /paths differ/, 'mismatchPaths 非空时 evidence 必须列路径明细');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(`${dir}${BUNDLE_SIGNATURE_SIDECAR_SUFFIX}`, { force: true });
  }
});

test('mutation 盲区: envFingerprint 漂移双向（比对分支 + 警告产出）', async () => {
  const { computeEnvFingerprint } = await import('../../src/far_proof/env_fingerprint.ts');
  const db = openDb();
  buildDemoChain(db);
  const dir = exportDemo(db);
  try {
    // 基线：当前环境验证当前导出 → 无 ENV_DRIFT
    const clean = verifyFarProofBundle(dir, 'full');
    assert.ok(!clean.warnings.some((w) => w.startsWith('ENV_DRIFT')), '同环境验证不得报 ENV_DRIFT');

    // 篡改 manifest 的 node 版本 → 比对分支必须产出 ENV_DRIFT 警告
    const manifestPath = join(dir, 'data_manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    const fp = computeEnvFingerprint('1970-01-01T00:00:00.000Z');
    manifest.envFingerprint = { ...fp, node: 'v0.0.0-mutated', fingerprintHash: '0'.repeat(64) };
    writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
    const drifted = verifyFarProofBundle(dir, 'full');
    assert.ok(
      drifted.warnings.some((w) => w.startsWith('ENV_DRIFT')),
      `跨环境指纹必须披露 ENV_DRIFT，实际 warnings: ${JSON.stringify(drifted.warnings)}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutation 盲区: DB 行 hash 非空时合法锚必须零错误（typeof payload_hash 位点）', async () => {
  // demo DB 的 call_records hash 全 null → anchor 走 legacy 跳过，typeof 位点变异在
  // demo 场景语义等价。杀灭需要真实锚场景：appendRecord 写入带真实 payload hash 的
  // 记录（正规 API，触发器合规）→ 导出行投影为字符串 → 变异（string→null）后锚变
  // 空串 → tampered 检出 → 合法锚断言失败。
  const { appendRecord, getChainHead } = await import('../../src/evidence_log/index.ts');
  const { hashCanonicalJson } = await import('../../src/evidence_log/hasher.ts');
  const db = openDb();
  buildDemoChain(db);
  const req = { q: 'anchor' };
  const res = { a: 'anchor' };
  appendRecord(
    db,
    {
      stageId: 'stage9_anchor_fixture',
      cred: {
        modelId: 'fixture',
        dashscopeRequestId: null,
        reproHash: '9'.repeat(64),
        gitCommitSha: 'b'.repeat(40),
        isoTimestamp: '2026-08-20T00:00:00.000Z',
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: getChainHead(db)?.currentHash ?? (() => { throw new Error('demo chain must have a head'); })(),
    },
    {
      requestPayload: JSON.stringify(req),
      responsePayload: JSON.stringify(res),
      requestPayloadHash: hashCanonicalJson(req),
      responsePayloadHash: hashCanonicalJson(res),
      finishReason: 'stop',
      usageTokensTotal: 1,
    },
    { providerProfile: 'offline_replay' },
  );
  const dir = exportDemo(db);
  try {
    const r = verifyFarProofBundle(dir, 'full', { dbAnchor: db });
    assert.deepEqual(
      r.errors.filter((e) => e.startsWith('DB_EXPORT_ANCHOR')),
      [],
      `DB hash 非空的合法锚必须零错误，实际: ${JSON.stringify(r.errors)}`,
    );
    // 变异杀灭的另一半：篡改带锚的导出行（seq=2；seq=1 是 legacy 行无锚可比）
    // → 必须检出（证明锚比对真实发生，非空转）。
    const recPath = join(dir, 'call_records.redacted.jsonl');
    const lines = readFileSync(recPath, 'utf8').trim().split('\n');
    const idx = lines.findIndex((l) => (JSON.parse(l) as { seq: number }).seq === 2);
    assert.ok(idx !== -1, '导出须含 seq=2（appendRecord 的带锚行）');
    const line = lines[idx];
    if (line === undefined) throw new Error('unreachable: idx validated above');
    const row = JSON.parse(line) as Record<string, unknown>;
    row.request_payload_hash = 'e'.repeat(64);
    lines[idx] = JSON.stringify(row);
    writeFileSync(recPath, lines.join('\n'), 'utf8');
    const tampered = verifyFarProofBundle(dir, 'full', { dbAnchor: db });
    assert.ok(
      tampered.errors.some((e) => e.startsWith('DB_EXPORT_ANCHOR_MISMATCH')),
      '篡改导出锚必须检出 DB_EXPORT_ANCHOR_MISMATCH',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutation 盲区: lifecycle 正常重放路径 ok=true 且 checkedCount>0（返回路径 ok 组合位点）', () => {
  const db = openDb();
  buildDemoChain(db);
  applyLifecycleTransition(db, { targetKind: 'claim', targetId: 'C-ASTRO-0001', toState: 'contested', actor: 'a', reason: 'counter' });
  const dir = exportDemo(db);
  try {
    // 直接对导出产物调用（full verify 只消费 errors；返回值 ok/checkedCount 需直接断言）
    const r = verifyLifecycleEventsJsonl(join(dir, 'lifecycle_events.jsonl'), join(dir, 'claim_graph.json'));
    assert.equal(r.ok, true, `合法 lifecycle 重放必须 ok=true，实际 errors: ${JSON.stringify(r.errors)}`);
    assert.ok(r.checkedCount > 0, '有事件必须 checkedCount>0（证明走的是正常路径返回而非快速路径）');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutation 盲区: envelope 模式下 chain 字段必须保持 false（初始化位点 + mode 分支）', () => {
  const db = openDb();
  buildDemoChain(db);
  const dir = exportDemo(db);
  try {
    const r = verifyFarProofBundle(dir, 'envelope');
    assert.equal(r.chainRan, false, 'envelope 模式不跑 chain 检查，chainRan 必须 false');
    assert.equal(r.chain.ok, false, '未跑 chain 的空结果 ok 必须 false（emptyChainResult 位点）');
    assert.equal(r.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutation 盲区: 信封链悬空场景 proofEnvelopeOk=false（and_to_or 组合位点·fixture 构造）', () => {
  const db = openDb();
  buildDemoChain(db);
  const dir = exportDemo(db);
  try {
    // demo bundle 仅 1 行信封（删首行=删全部，走的是别的分支）——用 fixture 构造两行合法链：
    // A: prev=GENESIS → B: prev=A.proofHash。删 A → B 悬空（linkageErrors 非空）且 B 的
    // proof_hash 重算仍一致（mismatches 空）→ 恰好命中 `mismatches===0 && linkage===0` 的
    // and 位点：变异 or 后 proofEnvelopeOk 错误地为 true。
    const rowA = makeEnvelopeRow('PE-LINK-A', GENESIS_PROOF_HASH);
    const rowB = makeEnvelopeRow('PE-LINK-B', rowA.proof_hash as string);
    const p = join(dir, 'proof_envelopes.jsonl');
    writeFileSync(p, `${JSON.stringify(rowA)}\n${JSON.stringify(rowB)}\n`, 'utf8');
    // 基线：两行合法链 → proofEnvelopeOk=true
    const intact = verifyFarProofBundle(dir, 'full');
    assert.equal(intact.proofEnvelopeRan, true);
    assert.equal(
      intact.proofEnvelopeOk,
      true,
      `两行合法链必须通过（PROOF_ errors: ${JSON.stringify(intact.errors.filter((e) => e.startsWith('PROOF_')))}）`,
    );
    // 断链：删 A 行 → B 悬空
    writeFileSync(p, `${JSON.stringify(rowB)}\n`, 'utf8');
    const r = verifyFarProofBundle(dir, 'full');
    assert.equal(r.proofEnvelopeRan, true);
    assert.ok(
      r.errors.some((e) => e.toUpperCase().includes('LINKAGE') || e.includes('PE-LINK-B')),
      `悬空须产出 linkage 错误，实际: ${JSON.stringify(r.errors)}`,
    );
    assert.equal(
      r.proofEnvelopeOk,
      false,
      `悬空场景 proofEnvelopeOk 必须 false（mismatches=${JSON.stringify(r.proofEnvelopeMismatches)}）`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutation 盲区: 删除 SOURCES-ATTRIBUTION.txt → attributionPresent=false（初值+赋值位点）', () => {
  const db = openDb();
  buildDemoChain(db);
  const dir = exportDemo(db);
  try {
    rmSync(join(dir, 'SOURCES-ATTRIBUTION.txt'));
    const r = verifyFarProofBundle(dir, 'chain');
    assert.equal(r.attributionPresent, false, '归属声明缺失必须如实上报 false（never load-bearing 但须真实）');
    assert.ok(r.warnings.some((w) => w.startsWith('SOURCES_ATTRIBUTION')), '缺失须出警告');
    // 基线对照：完整包 attributionPresent=true
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutation 盲区: 完整包 attributionPresent=true（赋值位点 true_to_false）', () => {
  const db = openDb();
  buildDemoChain(db);
  const dir = exportDemo(db);
  try {
    const r = verifyFarProofBundle(dir, 'chain');
    assert.equal(r.attributionPresent, true, '归属声明在包内必须上报 true');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutation 盲区: chain 模式下信封字段必须保持 false（初始化位点）', () => {
  const db = openDb();
  buildDemoChain(db);
  const dir = exportDemo(db);
  try {
    const r = verifyFarProofBundle(dir, 'chain');
    assert.equal(r.proofEnvelopeRan, false, 'chain 模式不跑信封检查，proofEnvelopeRan 必须 false');
    assert.equal(r.proofEnvelopeOk, false, 'proofEnvelopeOk 初值 false 必须如实透出');
    assert.equal(r.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutation 盲区: verifyRedactedCallRecordsJsonl 断链快速路径 ok=false（两处位点）', async () => {
  const { verifyRedactedCallRecordsJsonl } = await import('../../src/far_proof/bundle_verifier.ts');
  const dir = mkdtempSync(join(tmpdir(), 'bv-red-'));
  try {
    const mk = (seq: number, prevHash: string) =>
      JSON.stringify({
        seq,
        stage_id: 'stage1_grounding',
        payload_kind: 'citation',
        purpose_tag: 'hypothesis',
        model_id: 'fixture',
        dashscope_request_id: null,
        repro_hash: 'a'.repeat(64),
        git_commit_sha: 'b'.repeat(40),
        iso_timestamp: '2026-08-20T00:00:00.000Z',
        prev_hash: prevHash,
        current_hash: 'f'.repeat(64),
      });
    const p = join(dir, 'call_records.redacted.jsonl');
    // prev_hash 断链（expected GENESIS，实际 0xdead）→ 第一快速路径 ok:false
    writeFileSync(p, `${mk(1, 'dead'.repeat(16))}
`, 'utf8');
    const brokenPrev = verifyRedactedCallRecordsJsonl(p);
    assert.equal(brokenPrev.ok, false, 'prev_hash 断链必须 ok=false');
    assert.equal(brokenPrev.brokenAtSeq, 1);
    // prev_hash 合法（GENESIS）但 current_hash 与重算不符 → 第二快速路径 ok:false
    writeFileSync(p, `${mk(1, '0'.repeat(64))}
`, 'utf8');
    const brokenCurrent = verifyRedactedCallRecordsJsonl(p);
    assert.equal(brokenCurrent.ok, false, 'current_hash 重算失配必须 ok=false');
    assert.equal(brokenCurrent.brokenAtSeq, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutation 盲区: 公钥归属失败走 reason 分支（mismatchPaths 空时 evidence 不得为空路径文本）', async () => {
  const { generateKeyPair, signFileManifest } = await import('../../src/security/ed25519.ts');
  const { buildFileManifest } = await import('../../src/security/file_manifest.ts');
  const { BUNDLE_SIGNATURE_SIDECAR_SUFFIX } = await import('../../src/far_proof/bundle_signature.ts');
  const db = openDb();
  buildDemoChain(db);
  const dir = exportDemo(db);
  try {
    const keyA = generateKeyPair();
    const keyB = generateKeyPair();
    const sig = signFileManifest(buildFileManifest(dir), keyA.privateKeyPem, '2026-08-20T00:00:00.000Z');
    writeFileSync(`${dir}${BUNDLE_SIGNATURE_SIDECAR_SUFFIX}`, JSON.stringify(sig), 'utf8');
    // 期望公钥是 B、实际签名来自 A → 归属失败：manifest 无路径差异（mismatchPaths=[]）
    // → evidence 必须走 reason 分支（含 'expected public key'），不得退化为空 'paths differ: '。
    const r = verifyFarProofBundle(dir, 'full', { expectedPubKeyPem: keyB.publicKeyPem });
    assert.equal(r.ok, false);
    const sigErr = r.errors.find((e) => e.startsWith('ED25519_SIGNATURE_INVALID'));
    assert.ok(sigErr !== undefined, `须报 ED25519_SIGNATURE_INVALID，实际: ${JSON.stringify(r.errors)}`);
    assert.match(sigErr, /expected public key/, 'mismatchPaths 空时 evidence 必须是 reason（非空路径文本）');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(`${dir}${BUNDLE_SIGNATURE_SIDECAR_SUFFIX}`, { force: true });
  }
});

test('mutation 盲区: ruleset_uri=null 行按 v1 默认派发且重算一致（or_to_and 位点）', () => {
  const db = openDb();
  buildDemoChain(db);
  const dir = exportDemo(db);
  try {
    // ruleset_uri=null（DB legacy 行）→ 正常代码 envelope 无 rulesetUri 键（exactOptionalPropertyTypes）
    // → computeProofHash 与存储值一致。变异 and 后 else 分支塞 rulesetUri:null → envelope 形状变
    // → proof_hash 重算 mismatch → 断言失败。
    const rowC = makeEnvelopeRow('PE-RS-NULL', GENESIS_PROOF_HASH) as Record<string, unknown>;
    rowC.ruleset_uri = null;
    const p = join(dir, 'proof_envelopes.jsonl');
    writeFileSync(p, `${JSON.stringify(rowC)}
`, 'utf8');
    const r = verifyFarProofBundle(dir, 'full');
    assert.ok(
      !r.errors.some((e) => e.startsWith('PROOF_HASH_MISMATCH')),
      `ruleset_uri=null 须按 v1 默认派发且重算一致，实际: ${JSON.stringify(r.errors.filter((e) => e.startsWith('PROOF_')))}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutation 盲区: 未知 from_state 的 lifecycle 行必须报非法迁移（allowed undefined 支）', async () => {
  const { computeEventHash } = await import('../../src/evidence_log/lifecycle.ts');
  const dir = mkdtempSync(join(tmpdir(), 'bv-lc-'));
  try {
    const GENESIS_EVENT_HASH = '0'.repeat(64);
    // from_state 必须合法（'active'，否则连续性检查先拦、到不了迁移表行）；
    // 非法性在 to_state：active 只允许 →contested，→retracted 须被迁移表拦下。
    const currentHash = computeEventHash({
      targetKind: 'claim',
      targetId: 'C-X',
      fromState: 'active',
      toState: 'retracted',
      actor: 'a',
      reason: 'r',
      prevHash: GENESIS_EVENT_HASH,
    });
    writeFileSync(
      join(dir, 'lifecycle_events.jsonl'),
      `${JSON.stringify({
        event_id: 'EV-1', target_kind: 'claim', target_id: 'C-X',
        from_state: 'active', to_state: 'retracted', actor: 'a', reason: 'r',
        prev_hash: GENESIS_EVENT_HASH, current_hash: currentHash,
      })}
`,
      'utf8',
    );
    writeFileSync(join(dir, 'claim_graph.json'), '{"lifecycleStates":{}}', 'utf8');
    const r = verifyLifecycleEventsJsonl(join(dir, 'lifecycle_events.jsonl'), join(dir, 'claim_graph.json'));
    assert.ok(
      r.errors.some((e) => e.includes('LIFECYCLE_CHAIN_BROKEN') && e.includes('retracted')),
      `active→retracted 非法迁移必须报错，实际: ${JSON.stringify(r.errors)}`,
    );
    assert.equal(r.ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
