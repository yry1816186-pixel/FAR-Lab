// src/cli/stage_receipt.ts
// 职责：per-stage stageReceipt 哈希链（P2-2）。
// 真实依赖：sha256(prevReceipt + hashCanonicalJson(stageOutput))（node:crypto 真实重算，非 mock）。

import { createHash } from 'node:crypto';

import { hashCanonicalJson } from '../evidence_log/hasher.ts';

import type { CliState } from './state_machine.ts';

// 与 evidence_log GENESIS_PREV_HASH 同值（'0'.repeat(64)），FSM 链首采用同一 SSOT 口径。
/** Constant: GENESIS_RECEIPT. */
export const GENESIS_RECEIPT = '0'.repeat(64);

/** Interface defining stage receipt. */
export interface StageReceipt {
  readonly stage: CliState;
  readonly prevReceipt: string;
  readonly outputHash: string;
  readonly receipt: string;
}

/**
 * compute stage receipt.
 */
export function computeStageReceipt(prevReceipt: string, stageOutput: unknown): string {
  if (prevReceipt.length === 0) {
    throw new Error('computeStageReceipt: prevReceipt 不能为空（链首须用 GENESIS_RECEIPT）');
  }
  // 真实依赖：hashCanonicalJson 内部 stableStringify + sha256（确定性 key 排序、UTF-8、无空格）。
  const outputHash = hashCanonicalJson(stageOutput as Record<string, unknown>);
  return createHash('sha256').update(`${prevReceipt}${outputHash}`, 'utf8').digest('hex');
}

/**
 * verify stage receipt chain.
 */
export function verifyStageReceiptChain(receipts: readonly StageReceipt[]): boolean {
  if (receipts.length === 0) return true;
  let expectedPrev = GENESIS_RECEIPT;
  for (const r of receipts) {
    if (r.prevReceipt !== expectedPrev) return false;
    const recomputed = createHash('sha256')
      .update(`${r.prevReceipt}${r.outputHash}`, 'utf8')
      .digest('hex');
    // 末位字节相等：逐位重算后整串 hex 必须严格匹配（64-char sha256 摘要）。
    if (recomputed !== r.receipt) return false;
    expectedPrev = r.receipt;
  }
  return true;
}
