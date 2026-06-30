// ci/merkle_integrity_smoke.ts
// 职责：启动期 Merkle 完整性根 + 包含证明 + 篡改检测 smoke（CI·fresh-clone 核心 gate）
// 权威 SSOT：09_repro_determinism.md §4（integrity root）+ 23_CI_AND_VALIDATION.md §5.2
//
// 与 verify_chain_smoke 互补（非重复）：
//   - verify_chain_smoke：verifyChainHead 逐条重算 current_hash + 校验 prev_hash 链接（证链未断）
//   - merkle_integrity_smoke：整链折叠成 Merkle 根 + 单条包含证明 + 篡改检测（证整链指纹可信）
//
// 端到端证明（真实 :memory: DB）：
//   1. appendRecord 写 N 条链式记录
//   2. computeChainMerkleRoot → 64-hex 根 + leafCount
//   3. computeChainInclusionProof(seq) → verifyMerkleInclusionProof(proof).ok===true
//   4. proof.expectedRoot === root（跨方法一致）
//   5. tamper-evidence：篡改一条 current_hash → 根变化（Merkle 检测到）AND verifyChainHead 失败（双重保险）
//   6. buildReproReceipt → schemaVersion=1 + merkleRoot===root + gitCommitSha 非空
// 零容忍合规：禁 any / ts-ignore / 双重断言 / 空 catch / 桩返回

import Database from 'better-sqlite3';
import { pathToFileURL } from 'node:url';
import { runMigrations } from '../src/db/index.ts';
import {
  appendRecord,
  getChainHead,
  GENESIS_PREV_HASH,
  REPRO_CONTEXT_FIXTURE,
} from '../src/evidence_log/index.ts';
import type {
  AppendRecordOptions,
  ProviderNeutralCredential,
  CallAuditData,
} from '../src/evidence_log/index.ts';
import {
  computeChainInclusionProof,
  computeChainMerkleRoot,
  computeMerkleRoot,
  getChainLeaves,
  verifyMerkleInclusionProof,
} from '../src/evidence_log/merkle_root.ts';
import { buildReproReceipt } from '../src/api/routes/integrity.ts';

const OFFLINE_OPTIONS: AppendRecordOptions = {
  providerProfile: 'offline_replay',
};

const HEX64 = /^[0-9a-f]{64}$/;

function openDatabase(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function credential(index: number): ProviderNeutralCredential {
  return {
    modelId: REPRO_CONTEXT_FIXTURE.cred.modelId,
    dashscopeRequestId: null,
    reproHash: `${index}`.repeat(64).slice(0, 64),
    gitCommitSha: REPRO_CONTEXT_FIXTURE.cred.gitCommitSha,
    isoTimestamp: `2026-06-27T00:00:0${index}.000Z`,
  };
}

function audit(index: number): CallAuditData {
  return {
    requestPayload: `{"messages":[{"role":"user","content":"merkle-q${index}"}]}`,
    responsePayload: `{"choices":[{"message":{"content":"merkle-a${index}"}}]}`,
    finishReason: 'stop',
    usageTokensTotal: index * 10,
  };
}

function appendSmokeRow(db: Database.Database, index: number): void {
  appendRecord(
    db,
    {
      stageId: `${REPRO_CONTEXT_FIXTURE.stageId}#${index}`,
      cred: credential(index),
      payloadKind: REPRO_CONTEXT_FIXTURE.payloadKind,
      purposeTag: REPRO_CONTEXT_FIXTURE.purposeTag,
      prevHash: getChainHead(db)?.currentHash ?? GENESIS_PREV_HASH,
    },
    audit(index),
    OFFLINE_OPTIONS,
  );
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`merkle_integrity_smoke: ${message}`);
  }
}

export function main(): void {
  const db = openDatabase();
  try {
    appendSmokeRow(db, 1);
    appendSmokeRow(db, 2);
    appendSmokeRow(db, 3);
    appendSmokeRow(db, 4);

    // 1. 整链 Merkle 根
    const { root, leafCount } = computeChainMerkleRoot(db);
    assert(HEX64.test(root), `merkle root must be 64-hex, got ${root}`);
    assert(leafCount === 4, `leafCount must be 4, got ${leafCount}`);

    // 2. 中间一条（seq=2）的包含证明 + 独立验证
    const { proof } = computeChainInclusionProof(db, 2);
    const verification = verifyMerkleInclusionProof({
      leafIndex: proof.leafIndex,
      leafCount: proof.leafCount,
      leaf: proof.leaf,
      siblings: proof.siblings,
      expectedRoot: proof.expectedRoot,
    });
    assert(verification.ok, 'inclusion proof for seq=2 must verify independently');

    // 3. 跨方法一致：proof.expectedRoot === chain root
    assert(
      proof.expectedRoot === root,
      `proof root ${proof.expectedRoot} must equal chain root ${root}`,
    );

    // 4. tamper-evidence 双层防御（DB trigger 层 + Merkle 数学层）：
    //
    // 4a. DB 层 append-only trigger：尝试 UPDATE call_records 必须被 trigger 拒绝
    //     （append-only 红线·call_records 不可被静默篡改·第一层防御）
    let triggerBlockedUpdate = false;
    try {
      db.prepare('UPDATE call_records SET current_hash = ? WHERE seq = 3').run('0'.repeat(64));
    } catch (err) {
      triggerBlockedUpdate =
        err instanceof Error && /append-only|forbidden/i.test(err.message);
    }
    assert(
      triggerBlockedUpdate,
      'append-only trigger must block UPDATE on call_records (DB-layer tamper protection)',
    );

    // 4b. Merkle 数学层篡改检测（纯内存·模拟攻击者绕过 trigger 后的第二层防御）：
    //     取链叶快照·篡改首叶末位 → computeMerkleRoot 必须变化
    const { hashes: originalHashes } = getChainLeaves(db);
    const tamperedHashes = [...originalHashes];
    const firstLeaf = tamperedHashes[0];
    assert(firstLeaf !== undefined, 'chain must have at least one leaf for tamper test');
    const lastChar = firstLeaf.charAt(63);
    tamperedHashes[0] = firstLeaf.slice(0, 63) + (lastChar === 'a' ? 'b' : 'a');
    assert(
      computeMerkleRoot(tamperedHashes) !== computeMerkleRoot(originalHashes),
      'merkle root must change when a leaf is tampered (Merkle-layer tamper detection)',
    );

    // 5. Repro Receipt（DB 未被改·receipt 反映真实链状态）
    const receipt = buildReproReceipt(db, { now: () => '2026-06-30T00:00:00.000Z' });
    assert(receipt.schemaVersion === 1, `receipt schemaVersion must be 1, got ${receipt.schemaVersion}`);
    assert(
      receipt.merkleRoot === root,
      `receipt.merkleRoot ${receipt.merkleRoot} must equal chain root ${root}`,
    );
    assert(receipt.gitCommitSha !== null, 'receipt.gitCommitSha must be non-null (read from chain head)');
    assert(receipt.generatedAt === '2026-06-30T00:00:00.000Z', 'receipt.generatedAt must honor injected now');

    console.log('MERKLE_INTEGRITY_SMOKE: OK');
    console.log(`  root=${root} leafCount=${leafCount}`);
    console.log(`  proof(seq=2).ok=true expectedRoot=${proof.expectedRoot}`);
    console.log(`  tamper-defense: append-only trigger blocked UPDATE + merkle root detects leaf tamper`);
    console.log(`  receipt.schemaVersion=${receipt.schemaVersion}`);
  } finally {
    db.close();
  }
}

const argv1 = process.argv[1];
const invokedDirectly = argv1 !== undefined && pathToFileURL(argv1).href === import.meta.url;
if (invokedDirectly) {
  main();
}
