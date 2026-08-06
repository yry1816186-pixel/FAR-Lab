// src/cli/commands/replay.ts
// far replay <run-id> | --db <path> | --bundle <dir> —— 重放某次 run 的证据链（时光机）。
//
// 从持久化 DB 或 .far-proof bundle 读 call_records，按 seq 逐条展示证据链构建
// （prev_hash → current_hash 链接 · 信任根锚点）。末尾给出 chain head + verifyChainHead 结果。
// 诚实边界：重放展示「链工程完整性 + 防篡改链接」，不重跑原始计算（非可执行重放·那是 sandbox_runner 职责）。

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { verifyChainHead, verifyEvidencePayloadHashes } from '../../evidence_log/verifier.ts';
import type { VerifyEvidencePayloadResult } from '../../evidence_log/types.ts';
import { hashCanonicalJson } from '../../evidence_log/hasher.ts';

type ChainVerify = Awaited<ReturnType<typeof verifyChainHead>>;

/** Input parameters for operations involving replay args. */
export interface ReplayArgs {
  readonly dbPath: string | null;
  readonly bundleDir: string | null;
  readonly json: boolean;
}

/**
 * parse replay args.
 */
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
      throw new Error(`far replay: unknown argument "${a}"`);
    }
    // 位置参数当作 dbPath（便捷：far replay <db-path>）
    if (dbPath === null && bundleDir === null) {
      dbPath = a;
    }
  }

  if (dbPath === null && bundleDir === null) {
    throw new Error('far replay: must specify --db <path> or --bundle <dir>');
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

function renderTimeline(
  rows: readonly RecordRow[],
  json: boolean,
  verify: ChainVerify | null,
  payloadHash: VerifyEvidencePayloadResult | null,
): void {
  if (json) {
    const lastRow = rows[rows.length - 1];
    process.stdout.write(
      `${JSON.stringify({
        recordCount: rows.length,
        chainHead: lastRow === undefined ? null : lastRow.current_hash,
        verify: verify === null ? null : { verified: verify.ok, brokenAtSeq: verify.brokenAtSeq ?? null },
        payloadHash:
          payloadHash === null
            ? null
            : { ok: payloadHash.ok, tamperedCount: payloadHash.tamperedEvidenceIds.length, tamperedEvidenceIds: payloadHash.tamperedEvidenceIds },
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

  process.stdout.write('\n  FAR-Lab · far replay (evidence-chain time machine)\n');
  process.stdout.write('  ─────────────────────────────────────────────────\n');
  for (const r of rows) {
    const linked = r.seq === 1 ? 'GENESIS' : `prev=${shortHash(r.prev_hash)}`;
    process.stdout.write(
      `  #${String(r.seq).padStart(4, '0')}  ${r.stage_id.padEnd(22)} ${r.purpose_tag.padEnd(10)} ${r.model_id}\n` +
        `        ${linked}  →  curr=${shortHash(r.current_hash)}\n`,
    );
  }
  const lastRow = rows[rows.length - 1];
  const head = lastRow === undefined ? '<empty chain>' : lastRow.current_hash;
  process.stdout.write('  ─────────────────────────────────────────────────\n');
  process.stdout.write(`  chain head : ${head}\n`);
  process.stdout.write(`  records    : ${rows.length}\n`);
  if (verify !== null) {
    const status = verify.ok ? '✓ verified (hash chain self-consistent)' : `✗ broken @ seq ${verify.brokenAtSeq}`;
    process.stdout.write(`  verify     : ${status}\n`);
  }
  // FUSION-OS-10：derivable=1 evidence_payload hash 重算（反剧场·DB 文件级篡改检测·与链式 current_hash 正交）。
  if (payloadHash !== null) {
    const phStatus = payloadHash.ok
      ? `✓ ${payloadHash.verifiedCount} derivable=1 payload hashes verified`
      : `✗ PAYLOAD TAMPERED (${payloadHash.tamperedEvidenceIds.length} derivable=1 rows)`;
    process.stdout.write(`  payload    : ${phStatus}\n`);
  }
  process.stdout.write(
    '\n  ⚠ honest : replay shows evidence-chain engineering + tamper-detectable linking, not a re-run of the original computation (sandbox_runner job).\n\n',
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

interface VerdictAudit {
  readonly verdictId: string;
  readonly verdict: string;
  readonly decisiveRuleId: string;
  readonly reasonCodes: readonly string[];
  readonly evidenceSufficiencyStatus: string;
  readonly powerStatus: string;
  readonly traceHash: string;
  readonly traceHashMatch: boolean;
}

interface VerdictTraceRow {
  readonly verdict_id: string;
  readonly verdict: string;
  readonly verdict_trace_json: string;
  readonly verdict_trace_hash: string;
}

function queryVerdictAudit(db: Database.Database): VerdictAudit | null {
  const row = db
    .prepare(
      `SELECT verdict_id, verdict, verdict_trace_json, verdict_trace_hash
       FROM verdict_nodes ORDER BY created_at DESC LIMIT 1`,
    )
    .get() as VerdictTraceRow | undefined;
  if (row === undefined) return null;
  const trace = JSON.parse(row.verdict_trace_json) as {
    decisiveRuleId: string;
    reasonCodes: readonly string[];
    evidenceSufficiency: { status: string; powerStatus: string };
  };
  const recomputed = hashCanonicalJson({ verdictTraceJson: row.verdict_trace_json });
  return {
    verdictId: row.verdict_id,
    verdict: row.verdict,
    decisiveRuleId: trace.decisiveRuleId,
    reasonCodes: trace.reasonCodes,
    evidenceSufficiencyStatus: trace.evidenceSufficiency.status,
    powerStatus: trace.evidenceSufficiency.powerStatus,
    traceHash: row.verdict_trace_hash,
    traceHashMatch: recomputed === row.verdict_trace_hash,
  };
}

function renderVerdictAudit(audit: VerdictAudit, json: boolean): void {
  if (json) return; // JSON 模式已含 records；verdict audit 仅人类可读模式追加
  process.stdout.write('\n  ─── verdict audit (verdict_nodes · P0-2-EXT trace) ───\n');
  process.stdout.write(`  verdict      : ${audit.verdict}\n`);
  process.stdout.write(`  decisiveRule : ${audit.decisiveRuleId}  (${audit.reasonCodes.join(', ')})\n`);
  process.stdout.write(`  evidenceSuff : ${audit.evidenceSufficiencyStatus} (power=${audit.powerStatus})\n`);
  const mark = audit.traceHashMatch ? '✓ recomputed match' : '✗ MISMATCH';
  process.stdout.write(`  traceHash    : ${shortHash(audit.traceHash)}  ${mark}\n`);
}

/**
 * Runs the far replay command: replays an evidence chain from a DB or bundle.
 *
 * Reads call_records, displays each record stage and hash chain, verifies integrity.
 * @param argv - Raw CLI argument tokens for far replay.
 * @returns Exit code: 0 success, 1 error, 2 argument error.
 */
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
      let payloadHash: VerifyEvidencePayloadResult | null = null;
      try {
        verify = verifyChainHead(db);
        payloadHash = verifyEvidencePayloadHashes(db);
      } catch {
        verify = null;
      }
      renderTimeline(rows, args.json, verify, payloadHash);
      const audit = queryVerdictAudit(db);
      if (audit !== null) {
        renderVerdictAudit(audit, args.json);
      }
      return 0;
    } finally {
      db.close();
    }
  }

  // bundle 模式（只读 jsonl，无 DB 可 verifyChainHead）
  const dir = args.bundleDir as string;
  const rows = readFromBundle(dir);
  renderTimeline(rows, args.json, null, null);
  return 0;
}
