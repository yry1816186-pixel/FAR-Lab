// src/cli/commands/replay.ts
// far replay <run-id> | --db <path> | --bundle <dir> —— 重放某次 run 的证据链（时光机）。
//
// 从持久化 DB 或 .far-proof bundle 读 call_records，按 seq 逐条展示证据链构建
// （prev_hash → current_hash 链接 · 信任根锚点）。末尾给出 chain head + verifyChainHead 结果。
// 诚实边界：重放展示「链工程完整性 + 防篡改链接」，不重跑原始计算（非可执行重放·那是 sandbox_runner 职责）。

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { verifyChainHead } from '../../evidence_log/verifier.ts';

type ChainVerify = Awaited<ReturnType<typeof verifyChainHead>>;

export interface ReplayArgs {
  readonly dbPath: string | null;
  readonly bundleDir: string | null;
  readonly json: boolean;
}

export function parseReplayArgs(argv: readonly string[]): ReplayArgs {
  let dbPath: string | null = null;
  let bundleDir: string | null = null;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === '--db') {
      dbPath = argv[++i] ?? '';
      continue;
    }
    if (a === '--bundle') {
      bundleDir = argv[++i] ?? '';
      continue;
    }
    if (a === '--json') {
      json = true;
      continue;
    }
    if (a.startsWith('--')) {
      throw new Error(`far replay: 未知参数 "${a}"`);
    }
    // 位置参数当作 dbPath（便捷：far replay <db-path>）
    if (dbPath === null && bundleDir === null) {
      dbPath = a;
    }
  }

  if (dbPath === null && bundleDir === null) {
    throw new Error('far replay: 须指定 --db <path> 或 --bundle <dir>');
  }
  return { dbPath, bundleDir, json };
}

interface RecordRow {
  readonly seq: number;
  readonly stage_id: string;
  readonly payload_kind: string;
  readonly purpose_tag: string;
  readonly model_id: string;
  readonly prev_hash: string;
  readonly current_hash: string;
  readonly created_at: string;
}

function shortHash(h: string): string {
  return h.length > 12 ? `${h.slice(0, 8)}…` : h;
}

function renderTimeline(rows: readonly RecordRow[], json: boolean, verify: ChainVerify | null): void {
  if (json) {
    const lastRow = rows[rows.length - 1];
    process.stdout.write(
      `${JSON.stringify({
        recordCount: rows.length,
        chainHead: lastRow === undefined ? null : lastRow.current_hash,
        verify: verify === null ? null : { verified: verify.ok, brokenAtSeq: verify.brokenAtSeq ?? null },
        records: rows.map((r) => ({
          seq: r.seq,
          stageId: r.stage_id,
          payloadKind: r.payload_kind,
          purposeTag: r.purpose_tag,
          modelId: r.model_id,
          prevHash: r.prev_hash,
          currentHash: r.current_hash,
        })),
      }, null, 2)}\n`,
    );
    return;
  }

  process.stdout.write('\n  FAR-Chain · far replay（证据链时光机）\n');
  process.stdout.write('  ─────────────────────────────────────────────────\n');
  for (const r of rows) {
    const linked = r.seq === 1 ? 'GENESIS' : `prev=${shortHash(r.prev_hash)}`;
    process.stdout.write(
      `  #${String(r.seq).padStart(4, '0')}  ${r.stage_id.padEnd(22)} ${r.purpose_tag.padEnd(10)} ${r.model_id}\n` +
        `        ${linked}  →  curr=${shortHash(r.current_hash)}\n`,
    );
  }
  const lastRow = rows[rows.length - 1];
  const head = lastRow === undefined ? '<空链>' : lastRow.current_hash;
  process.stdout.write('  ─────────────────────────────────────────────────\n');
  process.stdout.write(`  chain head : ${head}\n`);
  process.stdout.write(`  records    : ${rows.length}\n`);
  if (verify !== null) {
    const status = verify.ok ? '✓ verified（hash 链自洽）' : `✗ broken @ seq ${verify.brokenAtSeq}`;
    process.stdout.write(`  verify     : ${status}\n`);
  }
  process.stdout.write(
    '\n  ⚠ honest : 重放展示证据链工程 + 防篡改链接，非重跑原始计算（sandbox_runner 职责）。\n\n',
  );
}

function readFromBundle(dir: string): readonly RecordRow[] {
  const path = resolve(dir, 'call_records.redacted.jsonl');
  const content = readFileSync(path, 'utf8');
  const rows: RecordRow[] = [];
  for (const line of content.split('\n')) {
    if (line.trim() === '') continue;
    const obj = JSON.parse(line) as RecordRow;
    rows.push(obj);
  }
  rows.sort((a, b) => a.seq - b.seq);
  return rows;
}

export function runReplay(argv: readonly string[]): number {
  const args = parseReplayArgs(argv);

  if (args.dbPath !== null) {
    const db = new Database(args.dbPath, { readonly: true, fileMustExist: true });
    try {
      const rows = db
        .prepare(
          `SELECT seq, stage_id, payload_kind, purpose_tag, model_id, prev_hash, current_hash, created_at
           FROM call_records ORDER BY seq ASC`,
        )
        .all() as RecordRow[];
      let verify: ChainVerify | null = null;
      try {
        verify = verifyChainHead(db);
      } catch {
        verify = null;
      }
      renderTimeline(rows, args.json, verify);
      return 0;
    } finally {
      db.close();
    }
  }

  // bundle 模式（只读 jsonl，无 DB 可 verifyChainHead）
  const dir = args.bundleDir as string;
  const rows = readFromBundle(dir);
  renderTimeline(rows, args.json, null);
  return 0;
}
