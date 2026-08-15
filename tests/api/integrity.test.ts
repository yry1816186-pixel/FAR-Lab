/**
 * integrity 路由测试——Merkle 完整性信任根的 HTTP 暴露（09§4 / 24§5.3）。
 *
 *            24_API网关与接口规范_API_GATEWAY.md §5.3.
 *
 * 覆盖：
 *   - GET /integrity/root 空库 → ZERO_MERKLE_ROOT + leafCount=0 + null chainHead
 *   - GET /integrity/root N 条记录 → 64-hex merkleRoot + leafCount=N + 链头定位
 *   - GET /integrity/proof/:seq 非法 seq → 400 BAD_REQUEST
 *   - GET /integrity/proof/:seq seq 不存在 → 404 NOT_FOUND
 *   - GET /integrity/proof/:seq seq 存在 → proof + 本地 verifyMerkleInclusionProof(proof).ok===true
 *     （端到端：API 返回的证明可被独立密码学验证·这是包含证明的核心卖点）
 *   - 跨端点一致性：proof.expectedRoot === root.merkleRoot === receipt.merkleRoot
 *   - GET /integrity/receipt → schemaVersion=1 + 全字段 + gitCommitSha 从链头读取
 *   - buildReproReceipt now 注入（generatedAt 可测·禁时间不确定性）
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { buildServer } from '../../src/api/server.ts';
import { appendRecord } from '../../src/evidence_log/index.ts';
import type {
  AppendRecordOptions,
  ProviderNeutralCredential,
  CallAuditData,
  HashedRecord,
} from '../../src/evidence_log/index.ts';
import { verifyMerkleInclusionProof } from '../../src/evidence_log/merkle_root.ts';
import { buildReproReceipt } from '../../src/api/routes/integrity.ts';

const OFFLINE_OPTIONS: AppendRecordOptions = {
  providerProfile: 'offline_replay',
};

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
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
    requestPayload: `{"messages":[{"role":"user","content":"q${index}"}]}`,
    responsePayload: `{"choices":[{"message":{"content":"a${index}"}}]}`,
    finishReason: 'stop',
    usageTokensTotal: index,
  };
}

/**
 * 追加 N 条链式 call_records（cred 递增保证 currentHash 互异）。
 * stageId 在 hypothesis/evidence/plan 间轮转（构造一条多阶段真实链）。
 *
 * 不传 prevHash：appendRecord 内部 getChainHead 自动推导（空库→GENESIS·非空→当前 head），
 * 故 appendChain 可在任意 db 状态下追加（支持 tamper-evident 测试二次追加）。
 */
function appendChain(db: Database.Database, count: number): readonly HashedRecord[] {
  const stageRotation = ['stage3_hypothesis', 'stage4_evidence', 'stage5_plan'] as const;
  const records: HashedRecord[] = [];
  for (let i = 1; i <= count; i += 1) {
    const record = appendRecord(
      db,
      {
        stageId: stageRotation[(i - 1) % stageRotation.length] ?? 'stage3_hypothesis',
        cred: credential(i),
        payloadKind: 'hypothesis',
        purposeTag: 'hypothesis',
      },
      audit(i),
      OFFLINE_OPTIONS,
    );
    records.push(record);
  }
  return records;
}

interface RootDto {
  readonly merkleRoot: string;
  readonly leafCount: number;
  readonly chainHeadSeq: number | null;
  readonly chainHeadHash: string | null;
}

interface ProofDto {
  readonly seq: number;
  readonly leafIndex: number;
  readonly leaf: string;
  readonly siblings: readonly string[];
  readonly expectedRoot: string;
  readonly leafCount: number;
}

test('GET /api/v1/integrity/root empty db → ZERO_MERKLE_ROOT + null chainHead', async () => {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/api/v1/integrity/root' });
    assert.equal(response.statusCode, 200);
    const body = (response.json() as { readonly ok: boolean; readonly data: RootDto }).data;
    assert.equal(body.merkleRoot, '0'.repeat(64), 'empty chain root must be ZERO_MERKLE_ROOT');
    assert.equal(body.leafCount, 0);
    assert.equal(body.chainHeadSeq, null);
    assert.equal(body.chainHeadHash, null);
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/integrity/root 3 records → 64-hex root + leafCount=3 + chainHead', async () => {
  const db = openDb();
  const records = appendChain(db, 3);
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/api/v1/integrity/root' });
    assert.equal(response.statusCode, 200);
    const body = (response.json() as { readonly ok: boolean; readonly data: RootDto }).data;
    assert.match(body.merkleRoot, /^[0-9a-f]{64}$/);
    assert.equal(body.leafCount, 3);
    const last = records[records.length - 1];
    assert.ok(last !== undefined, 'chain must have records');
    assert.equal(body.chainHeadSeq, last.seq);
    assert.equal(body.chainHeadHash, last.currentHash);
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/integrity/proof/:seq rejects non-positive-integer seq with 400', async () => {
  const db = openDb();
  appendChain(db, 2);
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    for (const badSeq of ['0', '-1', 'abc']) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/integrity/proof/${badSeq}`,
      });
      assert.equal(response.statusCode, 400, `seq=${badSeq} must be 400`);
      const body = response.json() as { error_code: string };
      assert.equal(body.error_code, 'BAD_REQUEST');
    }
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/integrity/proof/:seq returns 404 when seq not in chain', async () => {
  const db = openDb();
  appendChain(db, 2);
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/api/v1/integrity/proof/999' });
    assert.equal(response.statusCode, 404);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'NOT_FOUND');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/integrity/proof/:seq returns a proof that verifies independently + matches root', async () => {
  const db = openDb();
  const records = appendChain(db, 5);
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    // 取中间一条（非边界·seq=3）
    const target = records[2];
    assert.ok(target !== undefined, 'target record must exist');

    const proofResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/integrity/proof/${target.seq}`,
    });
    assert.equal(proofResponse.statusCode, 200);
    const proof = (proofResponse.json() as { readonly ok: boolean; readonly data: ProofDto }).data;
    assert.equal(proof.seq, target.seq);
    assert.equal(proof.leaf, target.currentHash);

    // 端到端核心：API 返回的证明可被本地 verifyMerkleInclusionProof 独立验证
    const verification = verifyMerkleInclusionProof({
      leafIndex: proof.leafIndex,
      leafCount: proof.leafCount,
      leaf: proof.leaf,
      siblings: proof.siblings,
      expectedRoot: proof.expectedRoot,
    });
    assert.equal(verification.ok, true, 'proof must verify independently');

    // 跨端点一致：proof.expectedRoot === /integrity/root 的 merkleRoot
    const rootResponse = await app.inject({ method: 'GET', url: '/api/v1/integrity/root' });
    const root = (rootResponse.json() as { readonly ok: boolean; readonly data: RootDto }).data;
    assert.equal(proof.expectedRoot, root.merkleRoot, 'proof root must equal chain root');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /api/v1/integrity/receipt returns schemaVersion=1 + all fields + gitCommitSha from head', async () => {
  const db = openDb();
  const records = appendChain(db, 4);
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/api/v1/integrity/receipt' });
    assert.equal(response.statusCode, 200);
    const receipt = (response.json() as { readonly ok: boolean; readonly data: {
      schemaVersion: number;
      merkleRoot: string;
      leafCount: number;
      chainHeadSeq: number | null;
      chainHeadHash: string | null;
      gitCommitSha: string | null;
      generatedAt: string;
    } }).data;
    assert.equal(receipt.schemaVersion, 1);
    assert.match(receipt.merkleRoot, /^[0-9a-f]{64}$/);
    assert.equal(receipt.leafCount, 4);
    const last = records[records.length - 1];
    assert.ok(last !== undefined);
    assert.equal(receipt.chainHeadSeq, last.seq);
    assert.equal(receipt.chainHeadHash, last.currentHash);
    // gitCommitSha 从链头 call_record 读取（credential.gitCommitSha = 'b'.repeat(40)）
    assert.equal(receipt.gitCommitSha, 'b'.repeat(40));
    assert.match(receipt.generatedAt, /^\d{4}-\d{2}-\d{2}T/);

    // 跨端点一致：receipt.merkleRoot === root.merkleRoot
    const rootResponse = await app.inject({ method: 'GET', url: '/api/v1/integrity/root' });
    const root = (rootResponse.json() as { readonly ok: boolean; readonly data: RootDto }).data;
    assert.equal(receipt.merkleRoot, root.merkleRoot);
  } finally {
    await app.close();
    db.close();
  }
});

test('buildReproReceipt honors injected now (deterministic generatedAt·no time nondeterminism)', () => {
  const db = openDb();
  appendChain(db, 2);
  try {
    const receipt = buildReproReceipt(db, { now: () => '2026-06-30T00:00:00.000Z' });
    assert.equal(receipt.generatedAt, '2026-06-30T00:00:00.000Z');
    assert.equal(receipt.schemaVersion, 1);
    assert.equal(receipt.leafCount, 2);
  } finally {
    db.close();
  }
});

test('integrity root is tamper-evident: appending a record changes the root', async () => {
  const db = openDb();
  appendChain(db, 2);
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const before = ((await app.inject({ method: 'GET', url: '/api/v1/integrity/root' })).json() as { readonly ok: boolean; readonly data: RootDto }).data;

    // 追加一条新记录（append-only·模拟 run 继续产出证据）
    appendChain(db, 1);

    const after = ((await app.inject({ method: 'GET', url: '/api/v1/integrity/root' })).json() as { readonly ok: boolean; readonly data: RootDto }).data;
    assert.notEqual(before.merkleRoot, after.merkleRoot, 'root must change when chain grows');
    assert.equal(after.leafCount, before.leafCount + 1);
  } finally {
    await app.close();
    db.close();
  }
});
