/**
 * ruleset_versioning.test.ts — IC-01 内核与证明版本化验收(ADR-007 H1+H3)。
 *
 * 验收 Oracle(合同 contract-001):
 *   ① VV-01:含 v1 URI 的新包验证通过;
 *   ② VV-02:旧包(无 URI)按 v1 复算一致;
 *   ③ VV-03/04:伪造高版本/畸形 URI → 验证器 fail-closed(不翻转裁决);
 *      VV-05:未知字段输入不翻转(MINOR 单调兼容;内核级 RT-07 另行重跑);
 *   ④ GV 14/14 不变(由 far verify-golden / golden_vectors 套件回归)。
 *
 * 场景清单: golden_vectors/versioning/vectors.json。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sealProofEnvelope } from '../../src/proof_envelope/sealer.ts';
import { computeProofHash } from '../../src/proof_envelope/proof_hash.ts';
import {
  CURRENT_RULESET_URI,
  RULESET_URI_V1,
  dispatchRulesetVerifier,
  parseRulesetMajor,
  resolveRulesetUri,
} from '../../src/proof_envelope/ruleset_version.ts';
import { verifyProofEnvelopeJsonl, verifyFarProofBundle } from '../../src/far_proof/bundle_verifier.ts';
import { exportFarProof } from '../../src/far_proof/exporter.ts';
import { runMigrations } from '../../src/db/migrator.ts';
import type { ProofEnvelope, SealProofEnvelopeInput } from '../../src/proof_envelope/types.ts';
import type { FalsificationSpec, SourceAnchor } from '../../src/falsifiability/types.ts';

const VECTORS = JSON.parse(
  readFileSync(join(process.cwd(), 'golden_vectors', 'versioning', 'vectors.json'), 'utf8'),
) as { vectors: ReadonlyArray<{ id: string; kind: string; expect: string }> };

const VALID_SPEC: FalsificationSpec = {
  prediction: 'pred',
  metric: 'acc',
  falsificationThreshold: 0.5,
  thresholdSemantics: 'gt',
};

const VALID_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-28T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

function makeInput(overrides: Partial<SealProofEnvelopeInput> = {}): SealProofEnvelopeInput {
  return {
    claimId: 'claim-vv',
    verdictNodeId: 'vn-vv',
    conclusion: 'REFUTED',
    prevProofHash: 'a'.repeat(64),
    checks: [],
    falsificationSpec: VALID_SPEC,
    sourceAnchor: VALID_ANCHOR,
    reproHash: 'd'.repeat(64),
    sealedAt: '2026-06-28T00:00:00.000Z',
    ...overrides,
  };
}

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = OFF'); // 同 proof_envelope.test.ts:聚焦 envelope 自身逻辑
  return db;
}

/** envelope → bundle JSONL 行(snake_case;legacy 时不写 ruleset_uri 键) */
function envelopeToRow(envelope: ProofEnvelope, opts: { omitRulesetUri?: boolean } = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    envelope_id: envelope.envelopeId,
    claim_id: envelope.claimId,
    verdict_node_id: envelope.verdictNodeId,
    conclusion: envelope.conclusion,
    proof_hash: envelope.proofHash,
    prev_proof_hash: envelope.prevProofHash,
    checks: JSON.stringify(envelope.checks),
    known_failures: JSON.stringify(envelope.knownFailures),
    falsification_spec: JSON.stringify(envelope.falsificationSpec),
    source_anchor: JSON.stringify(envelope.sourceAnchor),
    repro_hash: envelope.reproHash,
    sealed_by: envelope.sealedBy,
    sealed_at: envelope.sealedAt,
    created_at: envelope.createdAt,
  };
  if (!opts.omitRulesetUri && envelope.rulesetUri !== undefined) {
    row.ruleset_uri = envelope.rulesetUri;
  }
  return row;
}

function writeJsonl(rows: ReadonlyArray<Record<string, unknown>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'vv-'));
  const p = join(dir, 'proof_envelopes.jsonl');
  writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  return p;
}

test('vectors.json 五场景齐全', () => {
  const kinds = VECTORS.vectors.map((v) => v.kind).sort();
  assert.deepEqual(kinds, [
    'forged_major_v99',
    'legacy_no_uri',
    'malformed_uri',
    'sealed_with_v1_uri',
    'unknown_extra_field',
  ]);
});

test('VV-01: 新密封信封携带 v1 ruleset_uri,hash 自洽,bundle 验证通过', () => {
  const db = openDb();
  const { envelope } = sealProofEnvelope(db, makeInput());
  assert.equal(envelope.rulesetUri, RULESET_URI_V1);
  assert.equal(envelope.rulesetUri, CURRENT_RULESET_URI);
  // DB 行持久化
  const row = db.prepare('SELECT ruleset_uri FROM proof_envelopes WHERE envelope_id = ?').get(envelope.envelopeId) as { ruleset_uri: string };
  assert.equal(row.ruleset_uri, RULESET_URI_V1);
  // JSONL 复算
  const p = writeJsonl([envelopeToRow(envelope)]);
  const result = verifyProofEnvelopeJsonl(p);
  assert.equal(result.checked, 1);
  assert.equal(result.mismatches.length, 0);
  // 完整 bundle 导出+验证(manifest 嵌入 ruleset)
  const outDir = mkdtempSync(join(tmpdir(), 'vv-bundle-'));
  exportFarProof({
    db,
    outputDir: outDir,
    runId: 'vv01',
    modelSnapshot: 'vv-model',
    gitCommitSha: 'e'.repeat(40),
    envHash: 'f'.repeat(64),
  });
  const bundle = verifyFarProofBundle(outDir, 'full');
  assert.equal(bundle.ok, true, `bundle errors: ${bundle.errors.join('; ')}`);
  const manifest = JSON.parse(readFileSync(join(outDir, 'data_manifest.json'), 'utf8')) as { ruleset?: { currentUri?: string } };
  assert.equal(manifest.ruleset?.currentUri, RULESET_URI_V1);
  const roCrate = readFileSync(join(outDir, 'ro-crate-metadata.json'), 'utf8');
  assert.match(roCrate, /farlab\.dev\/ruleset\/v1/);
  db.close();
});

test('VV-02: legacy 信封(无 ruleset_uri)按 v1 默认派发,复算一致', () => {
  const db = openDb();
  const { envelope } = sealProofEnvelope(db, makeInput());
  // 构造 legacy 形态:去掉 rulesetUri 与 proofHash 后重算 hash(版本化前密封的语义:canonical 输入无 URI 字段)
  const { rulesetUri: _uri, proofHash: _oldHash, ...legacyFields } = envelope;
  void _uri;
  void _oldHash;
  const legacyHash = computeProofHash(legacyFields);
  const legacyEnvelope: ProofEnvelope = { ...legacyFields, proofHash: legacyHash };
  const row = envelopeToRow(legacyEnvelope, { omitRulesetUri: true });
  assert.equal('ruleset_uri' in row, false);
  // 读取侧解析:缺省 → v1
  assert.equal(resolveRulesetUri(null), RULESET_URI_V1);
  assert.equal(dispatchRulesetVerifier(undefined), 1);
  const p = writeJsonl([row]);
  const result = verifyProofEnvelopeJsonl(p);
  assert.equal(result.mismatches.length, 0, 'legacy 信封按 v1 复算不一致');
  db.close();
});

test('VV-03: 伪造高版本 URI → 验证器 fail-closed(RULESET_VERSION_UNSUPPORTED)', () => {
  const db = openDb();
  const { envelope } = sealProofEnvelope(db, makeInput());
  const row = { ...envelopeToRow(envelope), ruleset_uri: 'farlab.dev/ruleset/v99' };
  const p = writeJsonl([row]);
  assert.throws(() => verifyProofEnvelopeJsonl(p), /RULESET_VERSION_UNSUPPORTED/);
  // seal 侧同样 fail-closed
  assert.throws(() => sealProofEnvelope(db, makeInput({ rulesetUri: 'farlab.dev/ruleset/v99' })), /unsupported ruleset_uri/);
  db.close();
});

test('VV-04: 畸形 URI → 验证器 fail-closed(RULESET_VERSION_MALFORMED)', () => {
  const db = openDb();
  const { envelope } = sealProofEnvelope(db, makeInput());
  const row = { ...envelopeToRow(envelope), ruleset_uri: 'https://evil.example/ruleset/v9' };
  const p = writeJsonl([row]);
  assert.throws(() => verifyProofEnvelopeJsonl(p), /RULESET_VERSION_MALFORMED/);
  assert.throws(() => sealProofEnvelope(db, makeInput({ rulesetUri: 'not-a-ruleset-uri' })), /malformed ruleset_uri/);
  assert.equal(parseRulesetMajor('farlab.dev/ruleset/v1'), 1);
  assert.equal(parseRulesetMajor('farlab.dev/ruleset/vx'), null);
  db.close();
});

test('VV-05: 未知扩展字段被忽略,hash/判定不翻转', () => {
  const db = openDb();
  const { envelope } = sealProofEnvelope(db, makeInput());
  const row = {
    ...envelopeToRow(envelope),
    unknownFutureField: 'DENY_ALL_CLAIMS_NOW',
    nestedUnknown: { ignore: 'me' },
  };
  const p = writeJsonl([row]);
  const result = verifyProofEnvelopeJsonl(p);
  assert.equal(result.mismatches.length, 0, '未知字段导致 hash 翻转');
  db.close();
});
