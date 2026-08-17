// src/db/dr.ts
// 职责：CAMPAIGN-DR-001（本地半）—— 备份 checksum / 保留策略 / 恢复演练 / DR receipt。
//
// 宪法（DOMAIN_PROTOCOLS E4）：至少具备本机副本、独立介质/远端副本、checksum、保留策略、
// 定期恢复演练；「备份不等于可恢复；未演练的备份不能作为可靠性证据」。
// 本模块覆盖本地可完成的四件：sha256 checksum、保留策略（--keep）、恢复演练（drillRestore
// 随机抽样语义 = 每次全表计数对拍 + 完整性 + 哈希三关）、DR receipt（含 RPO/RTO 实测值）。
//
// 边界（诚实声明）：独立介质/远端副本需要操作者资产（第二磁盘/远端存储），本模块不做
// 也不假装——receipt 的 offsiteCopied 字段默认 false，由操作者置真并自行承担其真实性。
// Cannot-prove：drill 证明「此刻此副本可恢复」；不证明未来任意时刻可恢复（持续性由
// 定期重跑 drill 保证——宪法要求的制度面，receipt.chain 即历次演练台账）。

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { openFarDb } from './open.ts';

/** DR receipt 文件名后缀约定：<backup>.dr-receipt.json（与备份一一成对）。 */
export const DR_RECEIPT_SUFFIX = '.dr-receipt.json';

export interface DrReceipt {
  readonly backupPath: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  /** ISO 时间（备份完成时刻）。 */
  readonly createdAt: string;
  /** 备份时刻的源库表行数（drill 对拍的锚点）。 */
  readonly tableCounts: Readonly<Record<string, number>>;
  /** 独立介质副本：默认 false——操作者真实拷贝到第二介质后置真（自担真实性）。 */
  readonly offsiteCopied: boolean;
  /** 距上一份 receipt 的秒数（RPO 实测；首份 = null）。 */
  readonly rpoSeconds: number | null;
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function tableCountsOf(dbPath: string, readonly: boolean): Record<string, number> {
  const db = openFarDb(dbPath, { readonly, integrityCheck: 'quick' });
  try {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const counts: Record<string, number> = {};
    for (const t of tables) {
      counts[t.name] = (db.prepare(`SELECT COUNT(*) AS c FROM "${t.name}"`).get() as { c: number }).c;
    }
    return counts;
  } finally {
    db.close();
  }
}

export function drReceiptPath(backupPath: string): string {
  return `${backupPath}${DR_RECEIPT_SUFFIX}`;
}

/** 全目录扫描已有 receipt，按 createdAt 取最新（RPO 基线）。 */
export function latestReceiptInDir(dir: string): DrReceipt | null {
  if (!existsSync(dir)) return null;
  let latest: DrReceipt | null = null;
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(DR_RECEIPT_SUFFIX)) continue;
    const r = readDrReceipt(join(dir, entry));
    if (r !== null && (latest === null || r.createdAt > latest.createdAt)) latest = r;
  }
  return latest;
}

export function readDrReceipt(path: string): DrReceipt | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<DrReceipt>;
    if (
      typeof raw.backupPath !== 'string' ||
      typeof raw.sha256 !== 'string' ||
      typeof raw.sizeBytes !== 'number' ||
      typeof raw.createdAt !== 'string' ||
      typeof raw.tableCounts !== 'object' || raw.tableCounts === null ||
      typeof raw.offsiteCopied !== 'boolean' ||
      (raw.rpoSeconds !== null && typeof raw.rpoSeconds !== 'number')
    ) {
      return null; // 结构不完整 = 不可信 receipt（fail-closed 读取）
    }
    return raw as DrReceipt;
  } catch {
    return null;
  }
}

export interface BuildReceiptInput {
  readonly sourceDbPath: string;
  readonly backupPath: string;
  readonly previous: DrReceipt | null;
  readonly now?: () => Date;
}

/** 备份完成后构建 + 落盘 receipt（与备份同目录成对）。 */
export function writeDrReceipt(input: BuildReceiptInput): DrReceipt {
  const now = input.now ?? (() => new Date());
  const receipt: DrReceipt = {
    backupPath: input.backupPath,
    sha256: sha256File(input.backupPath),
    sizeBytes: readFileSync(input.backupPath).length,
    createdAt: now().toISOString(),
    tableCounts: tableCountsOf(input.sourceDbPath, true),
    offsiteCopied: false,
    rpoSeconds:
      input.previous === null
        ? null
        : Math.max(0, Math.round((now().getTime() - Date.parse(input.previous.createdAt)) / 1000)),
  };
  writeFileSync(drReceiptPath(input.backupPath), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return receipt;
}

export interface DrillResult {
  readonly ok: boolean;
  /** 三关（哈希/完整性/表计数）各自结论——问题逐条可定位。 */
  readonly problems: readonly string[];
  /** 演练耗时毫秒（RTO 实测分量）。 */
  readonly rtoMs: number;
  readonly receipt: DrReceipt | null;
}

/**
 * 恢复演练：sha256 复核 → 备份库 quick_check → 与 receipt.tableCounts 全表对拍。
 * 无 receipt = 未演练备份不可作为可靠性证据（宪法原文）→ ok=false 明示。
 */
export function drillRestore(backupPath: string): DrillResult {
  const start = Date.now();
  const problems: string[] = [];
  const receipt = readDrReceipt(drReceiptPath(backupPath));
  if (receipt === null) {
    problems.push(`no DR receipt at ${drReceiptPath(backupPath)} — unexercised backup is not reliability evidence`);
  }
  if (!existsSync(backupPath)) {
    problems.push(`backup missing: ${backupPath}`);
    return { ok: false, problems, rtoMs: Date.now() - start, receipt: null };
  }
  const actualSha = sha256File(backupPath);
  if (receipt !== null && actualSha !== receipt.sha256) {
    problems.push(`sha256 mismatch: receipt ${receipt.sha256.slice(0, 12)}… vs actual ${actualSha.slice(0, 12)}… (tampered or stale)`);
  }
  let backupCounts: Record<string, number> | null = null;
  try {
    backupCounts = tableCountsOf(backupPath, true); // quick_check 内含
  } catch (error) {
    problems.push(`backup unreadable/corrupt: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (receipt !== null && backupCounts !== null) {
    const expected = receipt.tableCounts;
    const keys = new Set([...Object.keys(expected), ...Object.keys(backupCounts)]);
    for (const k of keys) {
      const e = expected[k];
      const a = backupCounts[k];
      if (e === undefined || a === undefined || e !== a) {
        problems.push(`table '${k}' count drift: receipt ${e ?? '(absent)'} vs backup ${a ?? '(absent)'}`);
      }
    }
  }
  return { ok: problems.length === 0, problems, rtoMs: Date.now() - start, receipt };
}

export interface RetentionResult {
  readonly kept: readonly string[];
  readonly pruned: readonly string[];
}

/** 保留策略：同目录按 receipt.createdAt 新→旧保留前 keep 份（备份+receipt 成对删除）。 */
export function applyRetention(backupPath: string, keep: number): RetentionResult {
  if (keep < 1) throw new Error(`applyRetention: keep must be >= 1 (got ${keep})`);
  const dir = dirname(backupPath);
  const pairs: { backup: string; createdAt: string }[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(DR_RECEIPT_SUFFIX)) continue;
    const receipt = readDrReceipt(join(dir, entry));
    if (receipt !== null) pairs.push({ backup: receipt.backupPath, createdAt: receipt.createdAt });
  }
  pairs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // 新在前
  const kept = pairs.slice(0, keep);
  const pruned = pairs.slice(keep);
  for (const p of pruned) {
    rmSync(p.backup, { force: true });
    rmSync(drReceiptPath(p.backup), { force: true });
  }
  return { kept: kept.map((k) => k.backup), pruned: pruned.map((k) => k.backup) };
}
