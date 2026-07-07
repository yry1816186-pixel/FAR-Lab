/**
 * FallbackChain → degraded_from 端到端桥接集成测试。
 *
 * 历史溯源（已归档）: FAR_CHAIN_DEV_SPEC/05 §8.2/§9 + 0007_add_degraded_from.sql。
 *
 * 目的：证明 FallbackChainResult.degradedFrom → CallAuditData.degradedFrom →
 *       call_records.degraded_from 列 的桥接契约端到端可行（离线，caller 注入 mock）。
 *
 * 边界声明（诚实，非幻觉）：
 *   - 本测试证明"桥接契约可行"（降级信息能从 FallbackChain 流到审计列），
 *     不等于生产 competition adapter 已编排 executeFallbackChain。
 *   - 生产编排（competition adapter 实际跑降级链 + 真实 DashScope API 触发降级）
 *     需真实 API 环境，竞赛提交时验证，本测试用 caller 注入离线模拟，绝不伪造真实调用。
 *
 * 零容忍合规：无 any / @ts-ignore / 改期望掩盖实现 / 双重断言。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  executeFallbackChain,
  BailianRateLimitError,
  type FallbackCaller,
  type FallbackModelTarget,
} from '../../src/llm_gateway/fallback_chain/index.ts';
import { appendRecord, getCallRecordBySeq } from '../../src/evidence_log/repository.ts';
import { runMigrations } from '../../src/db/index.ts';
import type {
  AppendRecordInput,
  ProviderNeutralCredential,
  CallAuditData,
} from '../../src/evidence_log/types.ts';
import type { FallbackChainResult } from '../../src/llm_gateway/fallback_chain/index.ts';

const CHAIN: readonly FallbackModelTarget[] = [
  { modelId: 'primary', role: 'primary' },
  { modelId: 'backup_1', role: 'backup_1' },
];

interface CallerBehavior {
  readonly data?: string;
  readonly error?: unknown;
}

function makeCaller(behaviors: Record<string, CallerBehavior>): FallbackCaller<string> {
  return async (target) => {
    const beh = behaviors[target.modelId];
    if (beh === undefined) {
      throw new Error(`test caller: no behavior for ${target.modelId}`);
    }
    if (beh.error !== undefined) {
      throw beh.error;
    }
    return { data: beh.data ?? `response-from-${target.modelId}`, dashscopeRequestId: null };
  };
}

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function credFor(modelId: string): ProviderNeutralCredential {
  return {
    modelId,
    dashscopeRequestId: null,
    reproHash: 'a'.repeat(64),
    gitCommitSha: 'b'.repeat(40),
    isoTimestamp: '2026-06-28T00:00:00.000Z',
  };
}

/** succeededModelId 耗尽时为 null；成功场景下收窄为 string（显式守卫，无断言/fallback 掩盖）。 */
function requireModelId(value: string | null): string {
  if (value === null) {
    throw new Error('test setup: expected non-null succeededModelId (success path)');
  }
  return value;
}

const OFFLINE = { providerProfile: 'offline_replay' as const };

/**
 * 桥接契约（spec 05 §8.2）：调用方拿到 FallbackChainResult 后，用 degradedFrom 构造 CallAuditData。
 * 这是"降级留痕落库"的桥接点——生产 adapter 在此处把 result.degradedFrom 注入 audit。
 */
function bridgeResultToAudit(
  result: Pick<FallbackChainResult<unknown>, 'degradedFrom'>,
  baseAudit: CallAuditData,
): CallAuditData {
  return { ...baseAudit, degradedFrom: result.degradedFrom };
}

test('bridge: FallbackChain degradation → degradedFrom persisted to degraded_from column', async () => {
  // primary 429 → backup_1 success → degradedFrom='primary'
  const result = await executeFallbackChain(
    CHAIN,
    makeCaller({
      primary: { error: new BailianRateLimitError(null, 'req-1') },
      backup_1: { data: 'ok-backup' },
    }),
  );
  assert.equal(result.degradedFrom, 'primary');
  assert.equal(result.succeededModelId, 'backup_1');

  const db = openDb();
  try {
    const baseAudit: CallAuditData = {
      requestPayload: '{"q":"r"}',
      responsePayload: '{"a":"ok-backup"}',
      finishReason: 'stop',
      usageTokensTotal: 10,
    };
    const audit = bridgeResultToAudit(result, baseAudit);
    const input: AppendRecordInput = {
      stageId: 'stage-bridge-degraded',
      cred: credFor(requireModelId(result.succeededModelId)),
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
    };
    const rec = appendRecord(db, input, audit, OFFLINE);
    const row = getCallRecordBySeq(db, rec.seq);
    assert.equal(row.degraded_from, 'primary', 'degraded_from must record the degraded primary modelId');
  } finally {
    db.close();
  }
});

test('bridge: no degradation → degradedFrom null → degraded_from column null', async () => {
  const result = await executeFallbackChain(
    CHAIN,
    makeCaller({ primary: { data: 'ok-primary' } }),
  );
  assert.equal(result.degradedFrom, null);
  assert.equal(result.succeededModelId, 'primary');

  const db = openDb();
  try {
    const baseAudit: CallAuditData = {
      requestPayload: '{"q":"r"}',
      responsePayload: '{"a":"ok-primary"}',
      finishReason: 'stop',
      usageTokensTotal: 8,
    };
    const audit = bridgeResultToAudit(result, baseAudit);
    const input: AppendRecordInput = {
      stageId: 'stage-bridge-no-degrade',
      cred: credFor('primary'),
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
    };
    const rec = appendRecord(db, input, audit, OFFLINE);
    const row = getCallRecordBySeq(db, rec.seq);
    assert.equal(row.degraded_from, null);
  } finally {
    db.close();
  }
});

test('bridge: degraded_from does NOT affect canonical_hash (audit column only)', async () => {
  // 降级路径与非降级路径：相同 canonicalInput（stageId/cred/payloadKind/prevHash）→ currentHash 必须相同。
  // 证明 degraded_from 是纯审计列，桥接不破坏 hash 确定性（不进白名单）。
  const degraded = await executeFallbackChain(
    CHAIN,
    makeCaller({
      primary: { error: new BailianRateLimitError(null, 'req-1') },
      backup_1: { data: 'ok' },
    }),
  );
  const clean = await executeFallbackChain(
    CHAIN,
    makeCaller({ primary: { data: 'ok' } }),
  );

  // 故意用相同 cred（hash 只看 canonicalInput 的 stageId/cred/payloadKind/prevHash）
  const sameInput: AppendRecordInput = {
    stageId: 'stage-hash-invariance',
    cred: credFor('primary'),
    payloadKind: 'hypothesis',
    purposeTag: 'hypothesis',
  };
  const baseAudit: CallAuditData = {
    requestPayload: '{"q":"r"}',
    responsePayload: '{"a":"ok"}',
    finishReason: 'stop',
    usageTokensTotal: 5,
  };

  const db1 = openDb();
  const r1 = appendRecord(db1, sameInput, bridgeResultToAudit(degraded, baseAudit), OFFLINE);
  db1.close();

  const db2 = openDb();
  const r2 = appendRecord(db2, sameInput, bridgeResultToAudit(clean, baseAudit), OFFLINE);
  db2.close();

  assert.equal(r1.currentHash, r2.currentHash);
});
