/**
 * stage_receipt_store_coverage.test.ts — L2 coverage 补充（Z16 Core branch ≥75%）。
 *
 * 本文件为 stage_receipt_store.ts 的**缺失分支**提供定向覆盖（对照 coverage_gate
 * uncovered lines 99-100 102-103 145-146 153-154 156-157 181-182 200-201）：
 *   1. verifyReceiptChain：seq 不连续 → fail-closed throw；
 *   2. verifyReceiptChain：prevHash 断链 → fail-closed throw；
 *   3. open：存储文件结构非法（schemaVersion/receipts/snapshots 缺失）→ throw；
 *   4. open：收据缺对应快照 → throw；
 *   5. open：快照 structured 与收据 outputHash 失配（快照被篡改）→ throw；
 *   6. snapshot(key)：缺失 → throw；
 *   7. record()：同 key 幂等——重复签收直接返回，不重复追加、不重复落盘。
 *
 * 覆盖方式：先用 record() 生成真实合法收据文件（receiptHash 由源码正确计算），
 * 再篡改文件字段定向触发各守卫分支——与 resume.test ③ 不同，此处每次篡改
 * 都从**干净文件**出发，确保命中目标分支而非被前置检查拦截。
 *
 * 说明：118-119（private 字段声明行）为纯声明、无执行语义，无法也不需覆盖。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  StageReceiptStore,
  StageReceiptForgedError,
  verifyReceiptChain,
} from '../../src/agent_loop/stage_receipt_store.ts';
import type { StageArtifact } from '../../src/agent_loop/types.ts';
import type { LlmResponse } from '../../src/llm_gateway/types.ts';

const INPUT = 'coverage probe input';

/** 最小合法 understanding artifact（record 不做 zod 校验·只需 JSON 可序列化 + structured 稳定）。 */
function makeArtifact(): StageArtifact {
  const callResult: LlmResponse = {
    credential: {
      providerProfile: 'offline_replay',
      providerRequestId: null,
      modelId: 'offline-replay-fixture',
      modelVersion: null,
      capability: 'structured',
      isoTimestamp: new Date(0).toISOString(),
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    },
    content: '{"kind":"understanding"}',
    raw: null,
  };
  return {
    stageId: 'stage1_understanding',
    payloadKind: 'understanding',
    structured: {
      kind: 'understanding',
      problemStatement: 'coverage probe',
      scope: 'laboratory',
      keyTerms: ['coverage'],
      falsifiableAngle: 'probe affects branch coverage',
    },
    callResult,
    degraded: false,
    degradationReason: null,
  };
}

interface StoreFileShape {
  readonly schemaVersion: number;
  readonly researchInputHash: string;
  readonly receipts: Array<Record<string, unknown>>;
  readonly snapshots: Record<string, unknown>;
}

/** 生成一张干净收据文件（stage1+stage2 两张收据），返回文件路径。 */
function freshStoreFile(): { path: string; read(): StoreFileShape } {
  const dir = mkdtempSync(join(tmpdir(), 'srs-cov-'));
  const path = join(dir, 'receipts.json');
  const store = StageReceiptStore.open(path, INPUT);
  store.record(1, 'stage1_understanding', makeArtifact());
  store.record(2, 'stage2_integration', makeArtifact());
  const read = (): StoreFileShape => JSON.parse(readFileSync(path, 'utf8')) as StoreFileShape;
  return { path, read };
}

function cleanup(path: string): void {
  rmSync(join(path, '..'), { recursive: true, force: true });
}

test('verifyReceiptChain：seq 不连续 → fail-closed throw（99-100）', () => {
  const { path, read } = freshStoreFile();
  try {
    const file = read();
    file.receipts[1] = { ...file.receipts[1], seq: 99 };
    writeFileSync(path, JSON.stringify(file), 'utf8');
    assert.throws(() => StageReceiptStore.open(path, INPUT), StageReceiptForgedError);
    // 直接调用 verifyReceiptChain 也应抛（导出函数契约）
    const f2 = read();
    assert.throws(() => verifyReceiptChain(f2.receipts as never), StageReceiptForgedError);
  } finally {
    cleanup(path);
  }
});

test('verifyReceiptChain：prevHash 断链 → fail-closed throw（102-103）', () => {
  const { path, read } = freshStoreFile();
  try {
    const file = read();
    file.receipts[1] = { ...file.receipts[1], prevHash: 'f'.repeat(64) };
    writeFileSync(path, JSON.stringify(file), 'utf8');
    assert.throws(() => StageReceiptStore.open(path, INPUT), StageReceiptForgedError);
    const f2 = read();
    assert.throws(() => verifyReceiptChain(f2.receipts as never), StageReceiptForgedError);
  } finally {
    cleanup(path);
  }
});

test('open：存储文件结构非法（缺 receipts/snapshots）→ fail-closed throw（145-146）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'srs-cov-'));
  const path = join(dir, 'receipts.json');
  try {
    // 合法 JSON 但缺 receipts/snapshots 字段 → isStoreFile 失败
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, researchInputHash: 'x'.repeat(64) }), 'utf8');
    assert.throws(() => StageReceiptStore.open(path, INPUT), StageReceiptForgedError);
    // 顶层非对象（数组）→ isStoreFile 失败
    writeFileSync(path, JSON.stringify([1, 2, 3]), 'utf8');
    assert.throws(() => StageReceiptStore.open(path, INPUT), StageReceiptForgedError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('open：收据缺对应快照 → fail-closed throw（153-154）', () => {
  const { path, read } = freshStoreFile();
  try {
    const file = read();
    const missingKey = `${file.receipts[1]?.iteration}:${file.receipts[1]?.stageId}`;
    delete file.snapshots[missingKey];
    writeFileSync(path, JSON.stringify(file), 'utf8');
    assert.throws(() => StageReceiptStore.open(path, INPUT), StageReceiptForgedError);
  } finally {
    cleanup(path);
  }
});

test('open：快照 structured 与收据 outputHash 失配（快照被篡改）→ fail-closed throw（156-157）', () => {
  const { path, read } = freshStoreFile();
  try {
    const file = read();
    const firstKey = Object.keys(file.snapshots)[0];
    if (firstKey === undefined) throw new Error('expected snapshots');
    const snap = file.snapshots[firstKey] as { structured: Record<string, unknown> };
    file.snapshots[firstKey] = { ...snap, structured: { kind: 'tampered' } };
    writeFileSync(path, JSON.stringify(file), 'utf8');
    assert.throws(() => StageReceiptStore.open(path, INPUT), StageReceiptForgedError);
  } finally {
    cleanup(path);
  }
});

test('snapshot(key)：缺失快照 → fail-closed throw（181-182）', () => {
  const { path } = freshStoreFile();
  try {
    const store = StageReceiptStore.open(path, INPUT);
    assert.equal(store.hasSnapshot('9:stage1_understanding'), false, '缺失 key 不应有快照');
    assert.throws(() => store.snapshot('9:stage1_understanding'), StageReceiptForgedError);
  } finally {
    cleanup(path);
  }
});

test('record() 幂等：同 key 重复签收直接返回，不重复追加（200-201）', () => {
  const { path } = freshStoreFile();
  try {
    const store = StageReceiptStore.open(path, INPUT);
    store.record(1, 'stage1_understanding', makeArtifact());
    store.record(1, 'stage1_understanding', makeArtifact());
    store.record(1, 'stage1_understanding', makeArtifact());
    assert.equal(store.receiptCount(), 2, '重复签收不得追加收据');
    // 落盘文件同样只有 2 张（幂等写入）
    const reopened = StageReceiptStore.open(path, INPUT);
    assert.equal(reopened.receiptCount(), 2, 'reopen 后收据数不变（幂等已落盘）');
  } finally {
    cleanup(path);
  }
});

test('record() 首张收据：prevHash=genesis + 幂等不干扰后续新 key（基线回归）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'srs-cov-'));
  const path = join(dir, 'receipts.json');
  try {
    const store = StageReceiptStore.open(path, INPUT);
    store.record(1, 'stage1_understanding', makeArtifact());
    // 新 key 仍正常追加（幂等只作用于已存在 key）
    store.record(2, 'stage2_integration', makeArtifact());
    assert.equal(store.receiptCount(), 2);
    const file = JSON.parse(readFileSync(path, 'utf8')) as StoreFileShape;
    assert.equal(file.receipts[0]?.seq, 1);
    assert.equal(file.receipts[1]?.seq, 2);
    assert.equal(file.receipts[0]?.prevHash, '0'.repeat(64), '首张收据 prevHash 须为 genesis');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
