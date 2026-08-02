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
import { verifyFarProofBundle, verifyProofEnvelopeJsonl } from '../../src/far_proof/bundle_verifier.ts';
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
