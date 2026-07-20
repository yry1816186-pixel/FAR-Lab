/**
 * stage_receipt_store.ts — stage_receipt 恢复存储(IC-06 · ADR-018)。
 *
 * 语义:
 *   - 每 stage 完成签收据:{seq,iteration,stageId,inputHash,outputHash,ts,prevHash,receiptHash},
 *     receiptHash=sha256(canonical(核心字段))——收据 append-only、**脱敏(不含 payload)**;
 *   - 快照(artifact JSON)与收据分离:收据证明完成,快照支持跳过;
 *   - 重启:加载存储→校验收据链(伪造/断链 fail-closed)→最近有效收据之后的 stage 续跑;
 *   - 重放=幂等跳过(不重复 LLM 调用、不重复落库);输入变化(researchInputHash 不一致)→全量重跑;
 *   - 持久化:tmp 文件 + rename 原子写(防半写损坏)。
 *
 * 边界(合同 non_goals):非通用工作流引擎恢复;不覆盖人为中途改输入(检测并重跑=预期行为)。
 * Windows 进程信号差异:kill 模拟以 gateway 抛错等价(进程级 SIGKILL 语义一致:无收据=重跑)。
 *
 * 零容忍合规:无 any / @ts-ignore / 空 catch / 双重断言。
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import stableStringify from 'fast-json-stable-stringify';
import type { StageArtifact } from './types.ts';

export const RECEIPT_GENESIS_HASH = '0'.repeat(64);

export interface StageReceipt {
  readonly seq: number;
  readonly iteration: number;
  readonly stageId: string;
  readonly inputHash: string;
  readonly outputHash: string;
  readonly ts: string;
  readonly prevHash: string;
  readonly receiptHash: string;
}

interface StoreFile {
  readonly schemaVersion: 1;
  readonly researchInputHash: string;
  readonly receipts: readonly StageReceipt[];
  readonly snapshots: Readonly<Record<string, StageArtifact>>;
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function canonical(value: unknown): string {
  const s = stableStringify(value);
  if (s === undefined) throw new Error('stage_receipt_store: stable stringify returned undefined');
  return s;
}

export function hashResearchInput(researchInput: string): string {
  return sha256Hex(canonical(researchInput));
}

function computeReceiptHash(core: Omit<StageReceipt, 'receiptHash'>): string {
  return sha256Hex(canonical(core));
}

export class StageReceiptForgedError extends Error {
  readonly code = 'STAGE_RECEIPT_FORGED' as const;
  constructor(detail: string) {
    super(`stage_receipt_store: 收据链校验失败(fail-closed)— ${detail}`);
    this.name = 'StageReceiptForgedError';
  }
}

function isStoreFile(value: unknown): value is StoreFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === 1 &&
    typeof v.researchInputHash === 'string' &&
    Array.isArray(v.receipts) &&
    typeof v.snapshots === 'object' &&
    v.snapshots !== null
  );
}

/** 收据链校验:seq 连续 + prevHash 链接 + receiptHash 重算(伪造→throw)。 */
export function verifyReceiptChain(receipts: readonly StageReceipt[]): void {
  let expectedPrev = RECEIPT_GENESIS_HASH;
  receipts.forEach((receipt, index) => {
    if (receipt.seq !== index + 1) {
      throw new StageReceiptForgedError(`seq 不连续:位置 ${index + 1} 处 seq=${receipt.seq}`);
    }
    if (receipt.prevHash !== expectedPrev) {
      throw new StageReceiptForgedError(`prevHash 断链:seq=${receipt.seq}`);
    }
    const { receiptHash, ...core } = receipt;
    if (computeReceiptHash(core) !== receiptHash) {
      throw new StageReceiptForgedError(`receiptHash 重算失配:seq=${receipt.seq}`);
    }
    expectedPrev = receipt.receiptHash;
  });
}

/**
 * stage 收据存储(单文件 JSON;原子写)。
 * 用法:open→loadOrReset(输入变化即重置)→hasSnapshot(key)→snapshot(key)/record(key, artifact)。
 */
export class StageReceiptStore {
  private readonly path: string;
  private readonly researchInputHash: string;
  private receipts: StageReceipt[];
  private snapshots: Record<string, StageArtifact>;

  private constructor(path: string, researchInputHash: string, receipts: StageReceipt[], snapshots: Record<string, StageArtifact>) {
    this.path = path;
    this.researchInputHash = researchInputHash;
    this.receipts = receipts;
    this.snapshots = snapshots;
  }

  /**
   * 打开存储:文件存在则加载+校验(伪造 fail-closed);
   * researchInputHash 不一致(输入变化)→ 收据失效,全量重置重跑(合同语义)。
   */
  static open(path: string, researchInput: string): StageReceiptStore {
    const inputHash = hashResearchInput(researchInput);
    if (!existsSync(path)) {
      return new StageReceiptStore(path, inputHash, [], {});
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      throw new StageReceiptForgedError(`存储文件不可解析: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isStoreFile(parsed)) {
      throw new StageReceiptForgedError('存储文件结构非法(schemaVersion/receipts/snapshots 缺失)');
    }
    verifyReceiptChain(parsed.receipts);
    // 快照与收据一致性:每个收据的 outputHash 须等于对应快照 structured 的重算(防快照篡改)
    for (const receipt of parsed.receipts) {
      const key = `${receipt.iteration}:${receipt.stageId}`;
      const snapshot = parsed.snapshots[key];
      if (snapshot === undefined) {
        throw new StageReceiptForgedError(`收据 ${key} 缺对应快照`);
      }
      if (sha256Hex(canonical(snapshot.structured)) !== receipt.outputHash) {
        throw new StageReceiptForgedError(`快照与收据 outputHash 失配: ${key}(快照被篡改)`);
      }
    }
    if (parsed.researchInputHash !== inputHash) {
      // 输入变化 → 收据失效重跑(检测语义;不报错)
      return new StageReceiptStore(path, inputHash, [], {});
    }
    return new StageReceiptStore(path, inputHash, [...parsed.receipts], { ...parsed.snapshots });
  }

  /** key = `${iteration}:${stageId}` */
  hasSnapshot(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.snapshots, key);
  }

  snapshot(key: string): StageArtifact {
    const artifact = this.snapshots[key];
    if (artifact === undefined) {
      throw new StageReceiptForgedError(`快照缺失: ${key}(收据与快照不一致)`);
    }
    return artifact;
  }

  receiptCount(): number {
    return this.receipts.length;
  }

  /** 签收+快照落盘(原子写:tmp+rename)。 */
  record(iteration: number, stageId: string, artifact: StageArtifact): void {
    const key = `${iteration}:${stageId}`;
    if (Object.prototype.hasOwnProperty.call(this.snapshots, key)) {
      return; // 重放幂等:已签收不再重复记录
    }
    const prevHash = this.receipts.length === 0 ? RECEIPT_GENESIS_HASH : (this.receipts[this.receipts.length - 1]?.receiptHash ?? RECEIPT_GENESIS_HASH);
    const core: Omit<StageReceipt, 'receiptHash'> = {
      seq: this.receipts.length + 1,
      iteration,
      stageId,
      inputHash: this.researchInputHash,
      outputHash: sha256Hex(canonical(artifact.structured)),
      ts: new Date().toISOString(),
      prevHash,
    };
    const receipt: StageReceipt = { ...core, receiptHash: computeReceiptHash(core) };
    this.receipts = [...this.receipts, receipt];
    this.snapshots[key] = artifact;
    this.persist();
  }

  private persist(): void {
    const file: StoreFile = {
      schemaVersion: 1,
      researchInputHash: this.researchInputHash,
      receipts: this.receipts,
      snapshots: this.snapshots,
    };
    const tmpPath = `${this.path}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(file, null, 2), 'utf8');
    renameSync(tmpPath, this.path);
  }
}
