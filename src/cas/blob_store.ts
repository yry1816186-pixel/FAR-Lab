/**
 * cas/blob_store —— 内容寻址 blob CAS（Content-addressable Storage·FUSION-OS-9）。
 *
 *            + PROJECT_PLAN/DEPTH_LEDGER.md §C FUSION-OS-9 + schema/migrations/0015_far_blob_store.sql。
 *
 * 设计（内容寻址·去重·append-only）：
 *   - hash = sha256(canonical JSON of payload)（复用 evidence_log/hasher.ts hashCanonicalJson·字节稳定）。
 *   - 同 payload 写两次 → INSERT OR IGNORE 去重（单行·单 hash）。
 *   - 篡改 content → hash 失配 → 查不到（反剧场：artifact 不可静默替换）。
 *   - 表 append-only（trigger 禁 UPDATE/DELETE·0015）→ hash 不可变保证 CAS 完整性。
 *
 * 与 evidence_log 正交：evidence 按链式 prev_hash（链完整性），blob 按内容 hash（去重 + 内容寻址）。
 * 落点：offline_package 导出时把 FEC Plan / kernel trace / evidence payload 写进 CAS，manifest 引用 hash。
 */

import type Database from 'better-sqlite3';
import { canonicalJson, hashCanonicalJson } from '../evidence_log/hasher.ts';

export interface FarBlobRow {
  readonly hash: string;
  readonly content: string;
  readonly size_bytes: number;
  readonly created_at: string;
}

/**
 * 存储 payload 到 CAS，返回完整行（hash + content + size_bytes + created_at）。
 * 同 payload（同 canonical JSON）→ 同 hash → INSERT OR IGNORE 去重（幂等）。
 */
export function storeBlob(db: Database.Database, payload: Record<string, unknown>): FarBlobRow {
  const hash = hashCanonicalJson(payload);
  const content = canonicalJson(payload, 'storeBlob');
  const sizeBytes = Buffer.byteLength(content, 'utf8');
  db.prepare(
    'INSERT OR IGNORE INTO far_blob_store (hash, content, size_bytes) VALUES (?, ?, ?)',
  ).run(hash, content, sizeBytes);
  const row = getBlob(db, hash);
  if (row === undefined) {
    // CAS 不变量违反：INSERT 成功但 SELECT 不到（trigger 误拦 / 并发删除 / DB 损坏）。
    throw new Error(`storeBlob: CAS invariant violated — row not found after INSERT for hash ${hash}`);
  }
  return row;
}

/** 按 hash 取 blob 行；不存在返回 undefined。 */
export function getBlob(db: Database.Database, hash: string): FarBlobRow | undefined {
  return db.prepare(
    'SELECT hash, content, size_bytes, created_at FROM far_blob_store WHERE hash = ?',
  ).get(hash) as FarBlobRow | undefined;
}

/** hash 是否已存于 CAS。 */
export function blobExists(db: Database.Database, hash: string): boolean {
  const row = db.prepare('SELECT 1 FROM far_blob_store WHERE hash = ?').get(hash);
  return row !== undefined;
}
