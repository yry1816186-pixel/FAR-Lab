// tests/cli/verify.test.ts
// 测试 far verify 的纯收集器（FI-9 · 04§5）。
// 直接调 verifyEnvelopeV2 / collectVerifyDump / parseProofEnvelopeV2 / verifyChainHeadResult，
// 不 spawn 子进程（镜像 status.test.ts）。runVerify 端到端用临时文件验 exit code（0/7 契约）+ 空格路径（R5）。
// #13 起 runVerify 为 async（browser 轴 Web Crypto）——端到端改 spawnSync 子进程隔离 stdout
// （async mock 窗口会让 node:test reporter 输出插队污染捕获流·竞态）。

import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/index.ts';
import {
  appendEvidenceLog,
  appendRecord,
  GENESIS_PREV_HASH,
  getChainHead,
  type AppendRecordOptions,
  type CallAuditData,
  type ProviderNeutralCredential,
  type SourceAnchor,
} from '../../src/evidence_log/index.ts';
import { runAntiTheaterLint } from '../../src/anti_theater/lint.ts';
import { parseAntiTheaterLintInput } from '../../src/anti_theater/schemas.ts';
import type { AntiTheaterReport } from '../../src/anti_theater/types.ts';
import { buildDemoChain, computeEnvHash, DEMO_GIT_COMMIT_SHA, DEMO_RUN_ID } from '../../src/far_proof/demo_chain.ts';
import { exportFarProof } from '../../src/far_proof/index.ts';
import { sealProofEnvelopeV2 } from '../../src/proof_envelope/v2/sealer.ts';
import type { ProofEnvelopeV2 } from '../../src/proof_envelope/v2/types.ts';
import { getGoldenVector, makeCleanBaseInput } from '../fixtures/anti_theater/golden_vectors.ts';
import { makeValidEnvelopeV2Core } from '../proof_envelope/v2/fixtures.ts';
import {
  checkAntiTheaterReportConsistency,
  collectVerifyDump,
  diffAntiTheaterReport,
  parseProofEnvelopeV2,
  verifyAntiTheaterLint,
  verifyChainHeadResult,
  verifyEnvelopeV2,
  verifyEnvelopeV2WithPython,
  verifyEnvelopeV2WithBrowser,
  type VerifyDump,
  type VerifyMode,
} from '../../src/cli/commands/verify.ts';
import { PACKAGE_ROOT } from '../../src/cli/paths.ts';

// ===== envelope 收集器 =====

function sealedEnvelope(): ProofEnvelopeV2 {
  return sealProofEnvelopeV2(makeValidEnvelopeV2Core()).envelope;
}

/** #11b：clean base 经 runAntiTheaterLint 的报告（findings=[]·score=100·canSealConfirmed=true·RULE-PE-007 PASS）。 */
function cleanAntiTheaterReport(): AntiTheaterReport {
  return runAntiTheaterLint(makeCleanBaseInput());
}

/** #11b：封存含 clean antiTheaterReport 的 envelope（--lint-input happy-path 的对比基准）。 */
function sealedEnvelopeWithCleanReport(): ProofEnvelopeV2 {
  return sealProofEnvelopeV2(
    makeValidEnvelopeV2Core({ antiTheaterReport: cleanAntiTheaterReport() }),
  ).envelope;
}

test('verifyEnvelopeV2: 合法 envelope → tamperStatus clean / 无 FAIL 规则 / antiTheaterConsistent', () => {
  const result = verifyEnvelopeV2(sealedEnvelope());

  assert.equal(result.proofHashOk, true);
  assert.equal(result.tamperStatus, 'clean');
  assert.equal(result.scopeStatus, 'full');
  assert.equal(result.verdict, 'CONFIRMED');
  assert.equal(result.checkSummary.FAIL, 0);
  assert.equal(result.antiTheaterConsistent, true);
  assert.equal(result.errors.length, 0, `errors 应为空，实际: ${JSON.stringify(result.errors)}`);
});

test('verifyEnvelopeV2: 篡改 statisticalResults 不改 proofHash → tamperStatus tampered + dump FAIL', () => {
  const env = sealedEnvelope();
  const first = env.statisticalResults[0];
  assert.ok(first, 'fixture statisticalResults 须非空');
  // 拷贝 + 篡改一个 VC 字段（pValue），proofHash 不重算 → RULE-PE-010 重算捕获。
  const tampered: ProofEnvelopeV2 = {
    ...env,
    statisticalResults: [{ ...first, pValue: 0.999 }],
  };

  const result = verifyEnvelopeV2(tampered);
  assert.equal(result.proofHashOk, false);
  assert.equal(result.tamperStatus, 'tampered');

  const dump = collectVerifyDump(result, undefined, undefined);
  assert.equal(dump.status, 'FAIL');
  assert.equal(dump.recomputation.node, 'fail');
  assert.ok(dump.verifiedLevels.includes('proofEnvelope'));
});

test('verifyEnvelopeV2WithPython: 合法 envelope → Python proofHash 重算 pass', () => {
  const result = verifyEnvelopeV2WithPython(sealedEnvelope());
  assert.equal(result.axis, 'pass', `Python verifier 须 pass，errors=${result.errors.join(' | ')}, warnings=${result.warnings.join(' | ')}`);
});

test('verifyEnvelopeV2WithPython: 篡改 VC 字段不改 proofHash → Python proofHash 重算 fail', () => {
  const env = sealedEnvelope();
  const first = env.statisticalResults[0];
  assert.ok(first, 'fixture statisticalResults 须非空');
  const tampered: ProofEnvelopeV2 = {
    ...env,
    statisticalResults: [{ ...first, pValue: 0.999 }],
  };

  const result = verifyEnvelopeV2WithPython(tampered);
  assert.equal(result.axis, 'fail');
  assert.ok(
    result.errors.some((e) => /mismatch/.test(e)),
    `Python verifier fail 须含 mismatch，实际: ${result.errors.join(' | ')}`,
  );
});

test('verifyEnvelopeV2WithBrowser: 合法 envelope → browser proofHash 重算 pass（#13 接线）', async () => {
  const result = await verifyEnvelopeV2WithBrowser(sealedEnvelope());
  assert.equal(result.axis, 'pass', `browser verifier 须 pass，errors=${result.errors.join(' | ')}, warnings=${result.warnings.join(' | ')}`);
  assert.equal(result.errors.length, 0);
});

test('verifyEnvelopeV2WithBrowser: 篡改 VC 字段不改 proofHash → browser 重算 fail', async () => {
  const env = sealedEnvelope();
  const first = env.statisticalResults[0];
  assert.ok(first, 'fixture statisticalResults 须非空');
  const tampered: ProofEnvelopeV2 = {
    ...env,
    statisticalResults: [{ ...first, pValue: 0.999 }],
  };
  const result = await verifyEnvelopeV2WithBrowser(tampered);
  assert.equal(result.axis, 'fail');
  assert.ok(
    result.errors.some((e: string) => /MISMATCH|mismatch/.test(e)),
    `browser verifier fail 须含 mismatch，实际: ${result.errors.join(' | ')}`,
  );
});

test('verifyEnvelopeV2: RULE-PE-007 违规（hasFail=true + verdict CONFIRMED）→ RULE-PE-007 FAIL（007 隔离·010 PASS）', () => {
  // 注入含 FAIL finding 的报告（hasFail=true·failCount=1·自洽）+ verdict 仍 CONFIRMED（fixture 默认）。
  // sealProofEnvelopeV2 重算 proofHash 使 RULE-PE-010 PASS，隔离 RULE-PE-007。
  const { envelope } = sealProofEnvelopeV2(
    makeValidEnvelopeV2Core({
      antiTheaterReport: {
        findings: [
          {
            findingId: 'F-TEST-POSTHOC',
            attackKind: 'post-hoc-threshold',
            outcome: 'FAIL',
            hasFail: true,
            evidenceRef: 'statisticalResults[0]',
            message: 'test post-hoc threshold violation',
          },
        ],
        hasFail: true,
        failCount: 1,
        warnCount: 0,
        llmOverrideRejected: true,
      },
    }),
  );

  const result = verifyEnvelopeV2(envelope);
  assert.equal(result.proofHashOk, true, 'proofHash 须自洽（隔离 RULE-PE-007·不让 010 抢先）');
  assert.equal(result.antiTheaterConsistent, true);

  const rule007 = result.checks.find((c) => c.ruleId === 'RULE-PE-007');
  assert.ok(rule007, 'RULE-PE-007 须存在');
  assert.equal(rule007.outcome, 'FAIL');
});

test('verifyEnvelopeV2: anti-theater 内嵌报告自洽（hasFail=false + WARN finding）→ RULE-PE-009 WARN / dump WARN', () => {
  // 含空 message 的 WARN finding：RULE-PE-009 WARN（findings transparent），无 FAIL → dump status WARN。
  const { envelope } = sealProofEnvelopeV2(
    makeValidEnvelopeV2Core({
      antiTheaterReport: {
        findings: [
          {
            findingId: 'F-TEST-WARN',
            attackKind: 'post-hoc-threshold',
            outcome: 'WARN',
            hasFail: false,
            evidenceRef: 'statisticalResults[0]',
            message: '   ',
          },
        ],
        hasFail: false,
        failCount: 0,
        warnCount: 1,
        llmOverrideRejected: true,
      },
    }),
  );

  const result = verifyEnvelopeV2(envelope);
  assert.equal(result.proofHashOk, true);
  assert.equal(result.antiTheaterConsistent, true);
  assert.equal(result.checkSummary.FAIL, 0);
  assert.ok(result.checkSummary.WARN >= 1, '须至少 1 条 WARN（RULE-PE-009）');

  const dump = collectVerifyDump(result, undefined, undefined);
  assert.equal(dump.status, 'WARN');
});

// ===== anti-theater 报告自洽 =====

test('checkAntiTheaterReportConsistency: hasFail 与 FAIL 计数不一致 → inconsistent', () => {
  const result = checkAntiTheaterReportConsistency({
    findings: [
      {
        findingId: 'F1',
        attackKind: 'post-hoc-threshold',
        outcome: 'FAIL',
        hasFail: true,
        evidenceRef: 'x',
        message: 'm',
      },
    ],
    hasFail: false, // 与 count(FAIL)=1 矛盾
    failCount: 0, // 同上
    warnCount: 0,
    llmOverrideRejected: true,
  });
  assert.equal(result.consistent, false);
  assert.ok(result.warnings.length >= 2, 'hasFail + failCount 两处不一致');
});

test('checkAntiTheaterReportConsistency: 计数自洽 → consistent', () => {
  const result = checkAntiTheaterReportConsistency({
    findings: [],
    hasFail: false,
    failCount: 0,
    warnCount: 0,
    llmOverrideRejected: true,
  });
  assert.equal(result.consistent, true);
  assert.equal(result.warnings.length, 0);
});

// ===== parseProofEnvelopeV2（untrusted 输入结构校验）=====

test('parseProofEnvelopeV2: 合法 envelope JSON → ok', () => {
  const json = JSON.parse(JSON.stringify(sealedEnvelope())) as unknown;
  const parsed = parseProofEnvelopeV2(json);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.envelope.proofHash.length, 64);
  }
});

test('parseProofEnvelopeV2: schemaVersion 错 → ok:false（UNSUPPORTED_SCHEMA_VERSION）', () => {
  const env = sealedEnvelope();
  const parsed = parseProofEnvelopeV2({ ...env, schemaVersion: 'far.proof_envelope.v1' });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.error, /schemaVersion/);
  }
});

test('parseProofEnvelopeV2: proofHash 非 64-hex → ok:false', () => {
  const env = sealedEnvelope();
  const parsed = parseProofEnvelopeV2({ ...env, proofHash: 'not-a-hash' });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.error, /proofHash/);
  }
});

test('parseProofEnvelopeV2: 根节点非对象 → ok:false', () => {
  const parsed = parseProofEnvelopeV2('not-an-object');
  assert.equal(parsed.ok, false);
});

// ===== collectVerifyDump（verifiedLevels + status 转移）=====

test('collectVerifyDump: verifiedLevels 反映执行的校验层', () => {
  const envResult = verifyEnvelopeV2(sealedEnvelope());
  assert.deepEqual(collectVerifyDump(envResult, undefined, undefined).verifiedLevels, ['proofEnvelope']);
  // chain-only：用空 DB（无 call_records → verifyChainHead ok·verifiedCount 0）。
  const db = openChainDb();
  try {
    const chainResult = verifyChainHeadResult(db);
    assert.deepEqual(collectVerifyDump(undefined, chainResult, undefined).verifiedLevels, ['chain']);
    assert.deepEqual(
      collectVerifyDump(envResult, chainResult, undefined).verifiedLevels,
      ['proofEnvelope', 'chain'],
    );
  } finally {
    db.close();
  }
});

// ===== chain 收集器（L2·verifyChainHead 包装）=====

const OFFLINE_OPTIONS: AppendRecordOptions = { providerProfile: 'offline_replay' };

function openChainDb(path = ':memory:'): Database.Database {
  const db = new Database(path);
  runMigrations(db);
  return db;
}

function credential(index: number): ProviderNeutralCredential {
  return {
    modelId: 'offline-replay-fixture',
    dashscopeRequestId: null,
    reproHash: `${index}`.repeat(64).slice(0, 64),
    gitCommitSha: 'b'.repeat(40),
    isoTimestamp: `2026-06-27T00:00:0${index}.000Z`,
  };
}

function audit(index: number): CallAuditData {
  return {
    requestPayload: `{"q":${index}}`,
    responsePayload: `{"a":${index}}`,
    finishReason: 'stop',
    usageTokensTotal: index,
  };
}

function appendRow(db: Database.Database, index: number): void {
  appendRecord(
    db,
    {
      stageId: `stage${index}`,
      cred: credential(index),
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: getChainHead(db)?.currentHash ?? GENESIS_PREV_HASH,
    },
    audit(index),
    OFFLINE_OPTIONS,
  );
}

test('verifyChainHeadResult: 合法链 → ok + verifiedCount', () => {
  const db = openChainDb();
  try {
    appendRow(db, 1);
    appendRow(db, 2);
    appendRow(db, 3);

    const result = verifyChainHeadResult(db);
    assert.equal(result.ok, true);
    assert.equal(result.verifiedCount, 3);
    assert.equal(result.brokenAtSeq, null);
  } finally {
    db.close();
  }
});

test('verifyChainHeadResult: current_hash 篡改 → ok:false + brokenAtSeq', () => {
  const db = openChainDb();
  try {
    appendRow(db, 1);
    // trigger-bypass 后篡改（镜像 append_verify.test.ts）。
    db.exec('DROP TRIGGER trg_call_records_no_update');
    db.prepare("UPDATE call_records SET current_hash = 'tampered' WHERE seq = 1").run();

    const result = verifyChainHeadResult(db);
    assert.equal(result.ok, false);
    assert.equal(result.brokenAtSeq, 1);
  } finally {
    db.close();
  }
});

const VERIFY_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-07-19T00:00:00Z',
  rawResponseHash: 'd'.repeat(64),
};

function insertTamperedDerivableRow(db: Database.Database, evidenceId: string, seq: number): void {
  // 模拟 DB 文件级篡改（raw INSERT derivable=1 但 evidence_payload_hash 与字节失配·镜像 derivable.test.ts:143）。
  db.prepare(
    `INSERT INTO evidence_log (
      evidence_id, call_record_seq, stage_id, payload_kind, evidence_payload,
      source_anchor, source_anchor_git, source_anchor_req, source_anchor_ts,
      source_anchor_path, source_anchor_lineno, derivable, evidence_payload_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1, ?)`,
  ).run(
    evidenceId,
    seq,
    'stage3_hypothesis',
    'hypothesis',
    '{"claimId":"tampered"}',
    '{"gitCommitSha":"x","dashscopeRequestId":null,"isoTimestamp":"2026-07-19T00:00:00Z","rawResponseHash":"y"}',
    VERIFY_SOURCE_ANCHOR.gitCommitSha,
    null,
    VERIFY_SOURCE_ANCHOR.isoTimestamp,
    '0'.repeat(64), // 故意失配的 hash（≠ sha256 of evidence_payload）
  );
}

test('verifyChainHeadResult: derivable=1 evidence_payload 篡改 → payloadHashOk:false（FUSION-OS-10 生产 READ 接线）', () => {
  // RED→GREEN：接线前 verifyChainHeadResult 不调 verifyEvidencePayloadHashes（payloadHashOk 字段不存在）；
  // 接线后生产 verify 路径重算 derivable=1 行 hash 比对，DB 文件级篡改 → 失配检出。
  const db = openChainDb();
  try {
    appendRow(db, 1); // call_records seq=1（FK 锚）

    // 生产 WRITE（镜像 verdict_stage/orchestrator 的 derivable:1）：落 evidence_payload_hash。
    appendEvidenceLog(db, {
      callRecordSeq: 1,
      evidencePayload: { kind: 'hypothesis_verdict_input', claim: 'C1', evidenceCount: 1 },
      sourceAnchor: VERIFY_SOURCE_ANCHOR,
      derivable: 1,
    });
    assert.equal(verifyChainHeadResult(db).payloadHashOk, true, '篡改前 payloadHashOk=true');

    insertTamperedDerivableRow(db, 'TAMPERED-VRFY-001', 1);

    const result = verifyChainHeadResult(db);
    assert.equal(result.ok, true, '链头未篡改 → ok=true（payload-hash 与链式 current_hash 正交）');
    assert.equal(result.payloadHashOk, false, 'evidence_payload 篡改 → payloadHashOk=false');
    assert.ok(result.tamperedEvidenceIds.includes('TAMPERED-VRFY-001'), 'tamperedEvidenceIds 须含失配行');
  } finally {
    db.close();
  }
});

test('collectVerifyDump: chain 轴 payloadHashOk=false → status FAIL + tamperStatus tampered（FUSION-OS-10 端到端）', () => {
  // 生产接线端到端：verifyChainHeadResult 的 payload-hash 失配经 collectVerifyDump 翻 status=FAIL（产品信任根闭合）。
  const db = openChainDb();
  try {
    appendRow(db, 1);
    insertTamperedDerivableRow(db, 'TAMPERED-DUMP-001', 1);

    const chainResult = verifyChainHeadResult(db);
    const dump = collectVerifyDump(undefined, chainResult, undefined);
    assert.equal(dump.status, 'FAIL', 'payload-hash 失配 → status FAIL');
    assert.equal(dump.tamperStatus, 'tampered', 'chain 轴 payload 篡改 → tamperStatus tampered');
    assert.ok(dump.errors.some((e) => e.includes('evidence payload hash mismatch')), 'errors 须含 payload mismatch');
  } finally {
    db.close();
  }
});

// ===== runVerify 端到端（exit code 契约 + 空格路径 R5）=====

async function runVerifyCapture(options: {
  readonly bundlePath?: string;
  readonly envelopePath?: string;
  readonly dbPath?: string;
  readonly lintInputPath?: string;
  readonly mode: VerifyMode;
}): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> {
  // #13：runVerify 为 async（browser 轴 Web Crypto·async mock 窗口会让 node:test reporter
  // 输出插队污染捕获流·竞态）→ 改 spawnSync 子进程隔离 stdout（verify_golden.test.ts 既有先例）。
  const args = ['src/cli/far.ts', 'verify', '--mode', options.mode, '--json'];
  if (options.bundlePath !== undefined) args.push('--bundle', options.bundlePath);
  if (options.envelopePath !== undefined) args.push('--envelope', options.envelopePath);
  if (options.dbPath !== undefined) args.push('--db', options.dbPath);
  if (options.lintInputPath !== undefined) args.push('--lint-input', options.lintInputPath);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: PACKAGE_ROOT });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

async function runVerifyJson(options: {
  readonly bundlePath?: string;
  readonly envelopePath?: string;
  readonly dbPath?: string;
  readonly lintInputPath?: string;
  readonly mode: VerifyMode;
}): Promise<{ readonly code: number; readonly dump: VerifyDump; readonly stderr: string }> {
  const { code, stdout, stderr } = await runVerifyCapture(options);
  // exit 0/7 恒产 JSON（collectVerifyDump → stdout）；单层 as：runVerify 输出即 VerifyDump（测试上下文）。
  const dump = JSON.parse(stdout) as VerifyDump;
  return { code, dump, stderr };
}

function writeDemoBundle(parentDir: string): string {
  const db = new Database(':memory:');
  try {
    buildDemoChain(db);
    const outputDir = join(parentDir, '.far-proof');
    exportFarProof({
      db,
      outputDir,
      runId: DEMO_RUN_ID,
      modelSnapshot: 'offline-replay-fixture@v1',
      gitCommitSha: DEMO_GIT_COMMIT_SHA,
      envHash: computeEnvHash({
        schemaVersion: 6,
        nodeVersion: process.version,
        providerProfile: 'offline_replay',
      }),
      exportedAt: '2026-06-28T00:00:00.000Z',
    });
    return outputDir;
  } finally {
    db.close();
  }
}

test('runVerify: 合法 envelope 文件（含空格路径）→ exit 0 + status PASS', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'far verify dir-')); // 路径含空格（R5）
  try {
    const envPath = join(dir, 'envelope.json');
    writeFileSync(envPath, JSON.stringify(sealedEnvelope(), null, 2));

    const { code, dump } = await runVerifyJson({ envelopePath: envPath, mode: 'envelope' });
    assert.equal(code, 0, 'PASS → exit 0');
    assert.equal(dump.status, 'PASS');
    assert.equal(dump.tamperStatus, 'clean');
    assert.equal(dump.recomputation.node, 'pass');
    assert.equal(dump.recomputation.python, 'pass');
    assert.equal(dump.recomputation.browser, 'pass', '#13: browser 轴已接线');
    assert.deepEqual(dump.verifiedLevels, ['proofEnvelope', 'pythonProofHash', 'browserProofHash']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runVerify: 篡改 envelope 文件 → exit 7 + status FAIL + tamperStatus tampered', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-verify-tampered-'));
  try {
    const env = sealedEnvelope();
    const first = env.statisticalResults[0];
    assert.ok(first);
    const tampered = { ...env, statisticalResults: [{ ...first, pValue: 0.999 }] };
    const envPath = join(dir, 'tampered.json');
    writeFileSync(envPath, JSON.stringify(tampered, null, 2));

    const { code, dump } = await runVerifyJson({ envelopePath: envPath, mode: 'envelope' });
    assert.equal(code, 7, 'FAIL → exit 7');
    assert.equal(dump.status, 'FAIL');
    assert.equal(dump.tamperStatus, 'tampered');
    assert.equal(dump.recomputation.node, 'fail');
    assert.ok(dump.errors.length > 0, 'FAIL 须有 errors');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runVerify --bundle: V1 .far-proof 包（含空格路径）→ exit 0 + status WARN（诚实边界）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'far verify bundle-'));
  try {
    const bundlePath = writeDemoBundle(dir);
    const { code, dump } = await runVerifyJson({ bundlePath, mode: 'full' });
    assert.equal(code, 0, 'WARN → exit 0');
    assert.equal(dump.status, 'WARN');
    assert.equal(dump.tamperStatus, 'clean');
    assert.equal(dump.recomputation.node, 'pass');
    assert.equal(dump.recomputation.python, 'not-run', 'V1 bundle proofHash 是 TS 自洽；V2 envelope 才跑 Python 轴');
    assert.ok(dump.verifiedLevels.includes('bundle'));
    assert.ok(dump.verifiedLevels.includes('chain'));
    assert.ok(dump.verifiedLevels.includes('proofEnvelope'));
    assert.match(dump.ledgerRoot ?? '', /^[0-9a-f]{64}$/);
    assert.ok(
      dump.warnings.some((w) => /V1 minimal/.test(w)),
      `须披露 V1 minimal 诚实边界: ${dump.warnings.join(' | ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runVerify --bundle: 篡改 proof_envelopes.jsonl → exit 7 + PROOF_HASH_MISMATCH', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-verify-bundle-tamper-'));
  try {
    const bundlePath = writeDemoBundle(dir);
    const envelopePath = join(bundlePath, 'proof_envelopes.jsonl');
    const row = JSON.parse(readFileSync(envelopePath, 'utf8').trim()) as Record<string, unknown>;
    row.proof_hash = 'f'.repeat(64);
    writeFileSync(envelopePath, `${JSON.stringify(row)}\n`, 'utf8');

    const { code, dump } = await runVerifyJson({ bundlePath, mode: 'full' });
    assert.equal(code, 7, 'FAIL → exit 7');
    assert.equal(dump.status, 'FAIL');
    assert.equal(dump.tamperStatus, 'tampered');
    assert.ok(
      dump.errors.some((e) => e.includes('PROOF_HASH_MISMATCH')),
      `须含 PROOF_HASH_MISMATCH: ${dump.errors.join(' | ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runVerify --bundle: 篡改 sealed_by → exit 7（deterministic sealer 守卫）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-verify-bundle-sealed-by-'));
  try {
    const bundlePath = writeDemoBundle(dir);
    const envelopePath = join(bundlePath, 'proof_envelopes.jsonl');
    const row = JSON.parse(readFileSync(envelopePath, 'utf8').trim()) as Record<string, unknown>;
    row.sealed_by = 'llm_judge';
    writeFileSync(envelopePath, `${JSON.stringify(row)}\n`, 'utf8');

    const { code, dump } = await runVerifyJson({ bundlePath, mode: 'full' });
    assert.equal(code, 7, 'FAIL → exit 7');
    assert.equal(dump.status, 'FAIL');
    assert.equal(dump.tamperStatus, 'tampered');
    assert.ok(
      dump.errors.some((e) => e.includes('sealed_by must be deterministic_sealer')),
      `须含 sealed_by 守卫错误: ${dump.errors.join(' | ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ===== T-001 回归：verify 对缺失/不存在 bundle 路径 fail-closed（exit 7，非 0）=====
// 第 1 轮 F-3-001 实测早期版本 exit=0（假阳性）；当前 verifyFarProofBundle 已产
// MISSING_REQUIRED_FILE errors → status FAIL → exit 7。本测试锁住该行为，防回归。
test('runVerify --bundle: 不存在的 bundle 路径 → exit 7 + 10 MISSING_REQUIRED_FILE（fail-closed · T-001 回归）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-verify-missing-bundle-'));
  try {
    // 不创建任何文件，直接指向不存在的子目录（镜像 README 早期 examples/tess-offline/output/demo.far-proof 场景）。
    const ghostBundlePath = join(dir, 'does-not-exist', 'demo.far-proof');
    const { code, dump } = await runVerifyJson({ bundlePath: ghostBundlePath, mode: 'full' });

    assert.equal(code, 7, '缺失 bundle 路径必须 fail-closed exit=7（T-001·禁止假阳性 exit=0）');
    assert.equal(dump.status, 'FAIL', 'status 须 FAIL（10 MISSING_REQUIRED_FILE errors）');
    assert.equal(dump.tamperStatus, 'tampered');
    assert.equal(dump.recomputation.node, 'fail');
    assert.ok(
      dump.verifiedLevels.includes('bundle'),
      'verifiedLevels 须含 bundle（即使全部缺失，bundle 轴已运行）',
    );
    assert.equal(
      dump.errors.filter((e) => e.startsWith('MISSING_REQUIRED_FILE:')).length,
      10,
      `full 模式须含 10 条 MISSING_REQUIRED_FILE（全部 required files 缺），实际 errors: ${dump.errors.join(' | ')}`,
    );
    assert.ok(
      dump.errors.some((e) => e.includes('ro-crate-metadata.json')),
      '须列出具体缺失文件（ro-crate-metadata.json）',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runVerify --bundle --mode chain: 不存在路径 → exit 7 + MISSING_REQUIRED_FILE call_records.redacted.jsonl', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-verify-missing-chain-'));
  try {
    const ghostBundlePath = join(dir, 'ghost');
    const { code, dump } = await runVerifyJson({ bundlePath: ghostBundlePath, mode: 'chain' });

    assert.equal(code, 7, 'chain 模式缺失路径同样 fail-closed');
    assert.equal(dump.status, 'FAIL');
    assert.ok(
      dump.errors.some((e) => e.includes('MISSING_REQUIRED_FILE: call_records.redacted.jsonl')),
      `chain 模式须缺 call_records.redacted.jsonl: ${dump.errors.join(' | ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ===== #11b · diffAntiTheaterReport（重算报告 vs envelope 内嵌报告·深度对比）=====

test('diffAntiTheaterReport: clean↔clean → consistent / 无发散', () => {
  const report = runAntiTheaterLint(makeCleanBaseInput());
  const { consistent, divergences } = diffAntiTheaterReport(report, report);
  assert.equal(consistent, true);
  assert.equal(divergences.length, 0);
});

test('diffAntiTheaterReport: gv-posthoc 重算 vs clean 内嵌 → not consistent + post-hoc-threshold 发散', () => {
  const recomputed = runAntiTheaterLint(getGoldenVector('gv-posthoc-threshold-01').build());
  const embedded = runAntiTheaterLint(makeCleanBaseInput());
  const { consistent, divergences } = diffAntiTheaterReport(recomputed, embedded);
  assert.equal(consistent, false);
  assert.ok(
    divergences.some((d) => /post-hoc-threshold/.test(d)),
    `须含 post-hoc-threshold 发散: ${divergences.join(' | ')}`,
  );
});

test('diffAntiTheaterReport: embedded 有 antiTheaterScore 且不等 → META 发散', () => {
  const recomputed = runAntiTheaterLint(makeCleanBaseInput()); // score=100
  const embedded: AntiTheaterReport = { ...recomputed, antiTheaterScore: 50 }; // META 发散
  const { consistent, divergences } = diffAntiTheaterReport(recomputed, embedded);
  assert.equal(consistent, false);
  assert.ok(divergences.some((d) => /antiTheaterScore/.test(d)));
});

test('diffAntiTheaterReport: embedded 缺 META（早期 envelope）→ consistent（向后兼容）', () => {
  const recomputed = runAntiTheaterLint(makeCleanBaseInput());
  // 早期 envelope 内嵌报告仅 5 VC 核心，无 META 三字段。
  const embedded: AntiTheaterReport = {
    findings: recomputed.findings,
    hasFail: recomputed.hasFail,
    failCount: recomputed.failCount,
    warnCount: recomputed.warnCount,
    llmOverrideRejected: recomputed.llmOverrideRejected,
  };
  const { consistent, divergences } = diffAntiTheaterReport(recomputed, embedded);
  assert.equal(consistent, true, `向后兼容：embedded 缺 META 不算发散: ${divergences.join(' | ')}`);
  assert.equal(divergences.length, 0);
});

// ===== #11b · verifyAntiTheaterLint（runAntiTheaterLint 重算 + diff 安全网）=====

test('verifyAntiTheaterLint: clean envelope + clean input → recomputedOk=true / 零发散', () => {
  const envelope = sealedEnvelopeWithCleanReport();
  const result = verifyAntiTheaterLint(envelope, makeCleanBaseInput());
  assert.equal(result.recomputedOk, true);
  assert.equal(result.divergences.length, 0, `clean 重算应零发散: ${result.divergences.join(' | ')}`);
});

test('verifyAntiTheaterLint: clean envelope + gv-posthoc input → 发散', () => {
  const envelope = sealedEnvelopeWithCleanReport();
  const result = verifyAntiTheaterLint(envelope, getGoldenVector('gv-posthoc-threshold-01').build());
  assert.equal(result.recomputedOk, true);
  assert.ok(result.divergences.length > 0, 'gv 攻击 input 重算须与 clean 内嵌报告发散');
});

test('verifyAntiTheaterLint: 深层损坏 input（删 fec.threshold·骨架不拦）→ 重算中止', () => {
  // 经 parser 路由（与 loadLintInputFile 一致）：skeleton 过，runAntiTheaterLint 访问 threshold.thresholdSemantics 抛 TypeError。
  const damagedRaw: Record<string, unknown> = JSON.parse(JSON.stringify(makeCleanBaseInput()));
  const fec = damagedRaw.fec as Record<string, unknown>; // 单层 as（测试·构造深层损坏 input）
  delete fec.threshold;
  const damaged = parseAntiTheaterLintInput(damagedRaw);
  assert.equal(damaged.ok, true, '骨架须通过（parser 不查 fec.threshold）');
  if (damaged.ok) {
    const envelope = sealedEnvelopeWithCleanReport();
    const result = verifyAntiTheaterLint(envelope, damaged.input);
    assert.equal(result.recomputedOk, false);
    assert.ok(
      result.errors.some((e) => e.includes('recompute aborted')),
      `须含「重算中止」: ${result.errors.join(' | ')}`,
    );
  }
});

// ===== #11b · runVerify --lint-input 端到端（exit code 契约 + 空格路径 R5）=====

test('runVerify --lint-input: envelope + clean lint-input（含空格路径）→ exit 0 / PASS / verifiedLevels 含 antiTheaterLint', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'far verify lint-')); // 路径含空格（R5）
  try {
    const envelope = sealedEnvelopeWithCleanReport();
    writeFileSync(join(dir, 'envelope.json'), JSON.stringify(envelope, null, 2));
    writeFileSync(join(dir, 'lint-input.json'), JSON.stringify(makeCleanBaseInput(), null, 2));

    const { code, dump } = await runVerifyJson({
      envelopePath: join(dir, 'envelope.json'),
      lintInputPath: join(dir, 'lint-input.json'),
      mode: 'envelope',
    });
    assert.equal(code, 0, 'PASS → exit 0');
    assert.equal(dump.status, 'PASS');
    assert.ok(dump.verifiedLevels.includes('antiTheaterLint'), '须透明披露 antiTheaterLint 层');
    assert.equal(dump.errors.length, 0, `PASS 须无 errors: ${JSON.stringify(dump.errors)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runVerify --lint-input: envelope + 攻击 lint-input（gv-posthoc）→ exit 7 / FAIL / errors 含 divergence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-verify-lint-mismatch-'));
  try {
    const envelope = sealedEnvelopeWithCleanReport();
    writeFileSync(join(dir, 'envelope.json'), JSON.stringify(envelope, null, 2));
    writeFileSync(
      join(dir, 'lint-input.json'),
      JSON.stringify(getGoldenVector('gv-posthoc-threshold-01').build(), null, 2),
    );

    const { code, dump } = await runVerifyJson({
      envelopePath: join(dir, 'envelope.json'),
      lintInputPath: join(dir, 'lint-input.json'),
      mode: 'envelope',
    });
    assert.equal(code, 7, 'FAIL → exit 7');
    assert.equal(dump.status, 'FAIL');
    assert.ok(
      dump.errors.some((e) => /anti-theater lint divergence/.test(e)),
      '须含 anti-theater lint divergence',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runVerify --lint-input: 骨架非法 lint-input（{bad:1}）→ exit 1 / stderr 含载入失败', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-verify-lint-malformed-'));
  try {
    const envPath = join(dir, 'envelope.json');
    const lintPath = join(dir, 'lint-input.json');
    writeFileSync(envPath, JSON.stringify(sealedEnvelopeWithCleanReport(), null, 2));
    writeFileSync(lintPath, JSON.stringify({ bad: 1 }));

    const { code, stderr } = await runVerifyCapture({
      envelopePath: envPath,
      lintInputPath: lintPath,
      mode: 'envelope',
    });
    assert.equal(code, 1, 'runtime error → exit 1');
    assert.match(stderr, /failed to load lint input/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runVerify --lint-input: 无 --envelope → exit 2 / stderr 含「须配合 --envelope」', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-verify-lint-noenv-'));
  try {
    const lintPath = join(dir, 'lint-input.json');
    writeFileSync(lintPath, JSON.stringify(makeCleanBaseInput(), null, 2));

    const { code, stderr } = await runVerifyCapture({ lintInputPath: lintPath, mode: 'envelope' });
    assert.equal(code, 2, 'arg error → exit 2');
    assert.match(stderr, /requires --envelope/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
