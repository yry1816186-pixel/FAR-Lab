/**
 * .far-proof export engine: 九分量可信证据包导出 (T-W3-04).
 *
 * Authority: FINAL_PACKAGE/15_OPEN_SCIENCE_EXPORT.md §1 + §7 + §9.1 +
 *            22 §4 T-W3-04 + 09 §5 .far-proof 目录结构.
 *
 * 九分量（09 §5 V1 子集）:
 *   1. ro-crate-metadata.json        [V1基本]
 *   2. prov.ttl                       [V1基本]
 *   3. proof_envelopes.jsonl          [V1最小]
 *   4. repro_runs.jsonl               [V1]
 *   5. call_records.redacted.jsonl    [V1] (API key 已脱敏)
 *   6. claim_graph.json               [V1] (evidence_edges + verdict_nodes 子图)
 *   7. otel-trace.jsonl               [V1基本] (call_records 投影 OTel GenAI span)
 *   8. data_manifest.json             [V1]
 *   9. README_REPLAY.md               [V1]
 *
 * V1 诚实边界（15 §8 + 09 §5）:
 *   - claim_graph.json: 数据源 evidence_edges/verdict_nodes 已就绪（0001），导出全图子图。
 *   - otel-trace.jsonl: V1 无原生 OTel SDK / trace_events 表（0019=V2 待实现），
 *     故从 call_records（真实 LLM 调用事件流）投影为 OTel GenAI span 格式（call=span 语义等价）。
 *     每个 span 标注 far_chain.source='call_records_projection'（非原生 SDK 采集），
 *     gen_ai.system='far_chain_gateway'（模型中立，非厂商）。满足 15 §8「V1 只保证文件格式合规，
 *     不保证通过第三方 OTel 验证器」门槛。原生 trace_events 接入 = V2 路线图。
 *   - 不声称过第三方 RO-Crate/PROV-O/OTel 验证器（V3 路线图）。
 *
 * code/ 与 figures/ 目录为占位结构 (实际内容在运行时生成)。
 *
 * 模型中立. 零容忍合规.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { verifyChainHead } from '../evidence_log/verifier.ts';
import type { VerifyResult } from '../evidence_log/types.ts';

export interface FarProofExportInput {
  readonly db: Database.Database;
  readonly outputDir: string;
  readonly runId: string;
  readonly modelSnapshot: string;
  /** git commit SHA at time of computation（fresh-clone 锁定·重放须 HEAD 一致）*/
  readonly gitCommitSha: string;
  /** 环境指纹：影响计算的可复现关键 env/config 的稳定哈希（fresh-clone 锁定·§5.4）*/
  readonly envHash: string;
  /** 可选：导出时间戳（默认 now）；测试注入确定性值。非 hash 输入，不影响 proofHash。*/
  readonly exportedAt?: string;
}

export interface FarProofExportResult {
  readonly outputDir: string;
  readonly filesWritten: readonly string[];
  readonly hashVerification: VerifyResult;
}

/**
 * 导出 .far-proof/ 完整证据包。
 */
export function exportFarProof(input: FarProofExportInput): FarProofExportResult {
  const { db, outputDir, runId, modelSnapshot, gitCommitSha, envHash } = input;
  const exportedAt = input.exportedAt ?? new Date().toISOString();

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, 'code'), { recursive: true });
  mkdirSync(join(outputDir, 'figures'), { recursive: true });

  const hashVerification = verifyChainHead(db);
  const filesWritten: string[] = [];

  // 1. proof_envelopes.jsonl
  filesWritten.push(writeProofEnvelopesJsonl(db, outputDir));

  // 2. repro_runs.jsonl
  filesWritten.push(writeReproRunsJsonl(db, outputDir));

  // 3. call_records.redacted.jsonl (脱敏)
  filesWritten.push(writeCallRecordsRedacted(db, outputDir));

  // 3b. claim_graph.json (evidence_edges + verdict_nodes 子图·09 §5 V1·15 §7)
  filesWritten.push(writeClaimGraphJson(db, outputDir));

  // 3c. otel-trace.jsonl (call_records 投影 OTel GenAI span·09 §5 V1基本·15 §1)
  filesWritten.push(writeOtelTraceJsonl(db, outputDir, runId));

  // 4. ro-crate-metadata.json
  filesWritten.push(
    writeRoCrateMetadata(outputDir, runId, modelSnapshot, gitCommitSha, envHash, exportedAt, hashVerification),
  );

  // 5. prov.ttl
  filesWritten.push(writeProvTtl(outputDir, runId, exportedAt));

  // 6. data_manifest.json
  filesWritten.push(writeDataManifest(outputDir, filesWritten, exportedAt));

  // 7. README_REPLAY.md
  filesWritten.push(
    writeReadmeReplay(outputDir, runId, modelSnapshot, gitCommitSha, envHash, exportedAt, hashVerification),
  );

  // 8. code/MANIFEST.md（code/ 目录诚实说明：快照在 HEAD，重放靠 git checkout）
  filesWritten.push(writeCodeManifest(outputDir, gitCommitSha));

  return {
    outputDir,
    filesWritten,
    hashVerification,
  };
}

// ---------------------------------------------------------------------------
// 各分量写入函数
// ---------------------------------------------------------------------------

function writeProofEnvelopesJsonl(db: Database.Database, dir: string): string {
  const rows = db
    .prepare(
      `SELECT * FROM proof_envelopes ORDER BY created_at ASC`,
    )
    .all();
  const lines = rows.map((row) => JSON.stringify(row)).join('\n');
  const filePath = join(dir, 'proof_envelopes.jsonl');
  writeFileSync(filePath, lines + '\n', 'utf8');
  return filePath;
}

function writeReproRunsJsonl(db: Database.Database, dir: string): string {
  const rows = db
    .prepare(
      `SELECT * FROM repro_runs ORDER BY created_at ASC`,
    )
    .all();
  const lines = rows.map((row) => JSON.stringify(row)).join('\n');
  const filePath = join(dir, 'repro_runs.jsonl');
  writeFileSync(filePath, lines + '\n', 'utf8');
  return filePath;
}

function writeCallRecordsRedacted(db: Database.Database, dir: string): string {
  // 排除 request_payload 和 response_payload (可能含 key)
  // 保留 seq/stage_id/payload_kind/purpose_tag/model_id/repro_hash/prev_hash/current_hash/created_at
  const rows = db
    .prepare(
      `SELECT seq, stage_id, payload_kind, purpose_tag, model_id,
              dashscope_request_id, repro_hash, git_commit_sha, iso_timestamp,
              finish_reason, usage_tokens_total,
              prev_hash, current_hash, created_at
       FROM call_records ORDER BY seq ASC`,
    )
    .all();
  const lines = rows.map((row) => JSON.stringify(row)).join('\n');
  const filePath = join(dir, 'call_records.redacted.jsonl');
  writeFileSync(filePath, lines + '\n', 'utf8');
  return filePath;
}

/** call_records 行（仅取 span 投影所需列·列名同 writeCallRecordsRedacted SELECT） */
interface CallRecordSpanRow {
  readonly seq: number;
  readonly stage_id: string;
  readonly payload_kind: string;
  readonly purpose_tag: string;
  readonly model_id: string;
  readonly dashscope_request_id: string | null;
  readonly repro_hash: string;
  readonly iso_timestamp: string;
  readonly finish_reason: string | null;
  readonly usage_tokens_total: number | null;
}

function writeClaimGraphJson(db: Database.Database, dir: string): string {
  // 09 §5 claim_graph.json [V1] = evidence_edges + verdict_nodes 子图（15 §7）。
  // 全图导出（不按 root 裁剪）：整个运行的所有节点 + 边，供第三方重构证据 DAG。
  // SELECT *：claim_graph.json 非 hash 输入，列顺序按表定义稳定（同库同表）。
  const nodes = db
    .prepare(`SELECT * FROM verdict_nodes ORDER BY created_at ASC`)
    .all();
  const edges = db
    .prepare(`SELECT * FROM evidence_edges ORDER BY created_at ASC`)
    .all();
  const graph = {
    format: 'far-chain-claim-graph',
    version: '0.0.0',
    authority: '09 §5 + 15 §7',
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges,
  };
  const filePath = join(dir, 'claim_graph.json');
  writeFileSync(filePath, JSON.stringify(graph, null, 2), 'utf8');
  return filePath;
}

function writeOtelTraceJsonl(db: Database.Database, dir: string, runId: string): string {
  // 09 §5 otel-trace.jsonl [V1基本]：OpenTelemetry GenAI spans。
  // V1 诚实边界（15 §8）：无原生 OTel SDK / trace_events 表（0019=V2 待实现），故从 call_records
  // （真实 LLM 调用事件流）投影为 OTel span 格式（call=span 语义等价，信息无损）。
  // 每个 span 标注 far_chain.source='call_records_projection'（非原生 SDK 采集）；
  // gen_ai.system='far_chain_gateway'（模型中立，非厂商）。原生 trace_events 接入 = V2 路线图。
  const rows = db
    .prepare(
      `SELECT seq, stage_id, payload_kind, purpose_tag, model_id,
              dashscope_request_id, repro_hash, iso_timestamp, finish_reason, usage_tokens_total
       FROM call_records ORDER BY seq ASC`,
    )
    .all() as CallRecordSpanRow[]; // 窄断言依据：SELECT 列已知 + CallRecordSpanRow 显式定义

  // traceId/spanId 确定性派生（sha256·无 Math.random/Date.now·零容忍合规）
  const traceId = createHash('sha256').update(`trace:${runId}`, 'utf8').digest('hex').slice(0, 32);

  const spans = rows.map((row) => {
    const spanId = createHash('sha256').update(`span:${row.seq}`, 'utf8').digest('hex').slice(0, 16);
    return {
      traceId,
      spanId,
      parentSpanId: null,
      name: `llm_call/${row.purpose_tag}/${row.stage_id}`,
      kind: 'SPAN_KIND_INTERNAL',
      startTime: row.iso_timestamp,
      endTime: row.iso_timestamp, // V1: call_records 未记录 duration，start=end（诚实：duration 未采集）
      attributes: {
        'gen_ai.system': 'far_chain_gateway',
        'gen_ai.request.model': row.model_id,
        'gen_ai.response.id': row.dashscope_request_id ?? '',
        'gen_ai.response.finish_reason': row.finish_reason ?? '',
        'gen_ai.usage.total_tokens': row.usage_tokens_total ?? 0,
        'far_chain.seq': row.seq,
        'far_chain.stage_id': row.stage_id,
        'far_chain.payload_kind': row.payload_kind,
        'far_chain.purpose_tag': row.purpose_tag,
        'far_chain.repro_hash': row.repro_hash,
        'far_chain.source': 'call_records_projection',
      },
      status: { code: 'STATUS_CODE_OK' },
    };
  });

  const lines = spans.map((s) => JSON.stringify(s)).join('\n');
  const filePath = join(dir, 'otel-trace.jsonl');
  writeFileSync(filePath, lines.length > 0 ? lines + '\n' : '', 'utf8');
  return filePath;
}

function writeRoCrateMetadata(
  dir: string,
  runId: string,
  modelSnapshot: string,
  gitCommitSha: string,
  envHash: string,
  exportedAt: string,
  verification: VerifyResult,
): string {
  const metadata = {
    '@context': 'https://w3id.org/ro/crate/1.1/context',
    '@graph': [
      {
        '@id': 'ro-crate-metadata.json',
        '@type': 'CreativeWork',
        identifier: `far-proof-${runId}`,
        name: `FAR-Chain Proof Export: ${runId}`,
        description:
          'Falsifiable, Auditable, Reproducible research evidence package. ' +
          'NOT validated against third-party RO-Crate/PROV-O validators (V3 roadmap).',
        datePublished: exportedAt,
        version: '0.0.0',
      },
      {
        '@id': '#model_snapshot',
        '@type': 'SoftwareApplication',
        name: modelSnapshot,
        description: 'Model snapshot active at time of computation',
      },
      {
        '@id': '#git_commit',
        '@type': 'SoftwareSourceCode',
        sha: gitCommitSha,
        description: 'Code HEAD at time of computation (fresh-clone replay must match)',
      },
      {
        '@id': '#env_hash',
        '@type': 'PropertyValue',
        name: 'environment hash',
        value: envHash,
        description: 'Stable hash of repro-affecting env/config (fresh-clone lock, §5.4)',
      },
      {
        '@id': '#hash_verification',
        '@type': 'PropertyValue',
        name: 'canonicalHash chain verification',
        value: verification.ok ? 'verified' : `broken at seq=${verification.brokenAtSeq ?? '?'}`,
      },
    ],
  };
  const filePath = join(dir, 'ro-crate-metadata.json');
  writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf8');
  return filePath;
}

function writeProvTtl(dir: string, runId: string, exportedAt: string): string {
  // 修复：runId 必须在两个引用处都插值（曾因单引号字符串导致 ${runId} 字面量残留·bug）。
  const activityIri = `<urn:far-chain:run:${runId}>`;
  const ttl = [
    '@prefix prov: <http://www.w3.org/ns/prov#> .',
    '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
    '',
    `${activityIri} a prov:Activity ;`,
    `    prov:startedAtTime "${exportedAt}"^^xsd:dateTime ;`,
    '    prov:generated <urn:far-chain:proof:export> .',
    '',
    '<urn:far-chain:proof:export> a prov:Entity ;',
    `    prov:wasGeneratedBy ${activityIri} ;`,
    '    prov:description "FAR-Chain ProofEnvelope export bundle"@en .',
    '',
  ].join('\n');
  const filePath = join(dir, 'prov.ttl');
  writeFileSync(filePath, ttl, 'utf8');
  return filePath;
}

function writeDataManifest(dir: string, filesWritten: readonly string[], exportedAt: string): string {
  const manifest = {
    generatedAt: exportedAt,
    files: filesWritten.map((f) => f.replace(dir + '/', '').replace(dir + '\\', '')),
    totalFiles: filesWritten.length,
  };
  const filePath = join(dir, 'data_manifest.json');
  writeFileSync(filePath, JSON.stringify(manifest, null, 2), 'utf8');
  return filePath;
}

function writeCodeManifest(dir: string, gitCommitSha: string): string {
  const content = [
    '# Code Snapshot',
    '',
    'Code is **not** copied into this export. The authoritative code snapshot is the git',
    `commit \`${gitCommitSha}\` (HEAD at time of computation).`,
    '',
    'Fresh-clone replay:',
    '```bash',
    `git checkout ${gitCommitSha}`,
    'pnpm install --frozen-lockfile',
    'pip install -e .',
    '```',
    '',
    'Honesty: code is verified only against the recorded HEAD — no formal verification (V3 roadmap).',
    '',
  ].join('\n');
  const codeDir = join(dir, 'code');
  mkdirSync(codeDir, { recursive: true });
  const filePath = join(codeDir, 'MANIFEST.md');
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function writeReadmeReplay(
  dir: string,
  runId: string,
  modelSnapshot: string,
  gitCommitSha: string,
  envHash: string,
  exportedAt: string,
  verification: VerifyResult,
): string {
  const content = [
    '# FAR-Chain Proof Export — Replay Instructions',
    '',
    `**Run ID**: \`${runId}\``,
    `**Model Snapshot**: \`${modelSnapshot}\``,
    `**Git Commit (HEAD)**: \`${gitCommitSha}\``,
    `**Env Hash**: \`${envHash}\``,
    `**Generated**: ${exportedAt}`,
    '',
    '## Fresh-Clone Replay',
    '',
    '```bash',
    '# 0. Fresh clone + checkout the recorded HEAD (code snapshot lock)',
    `git clone <repo> && cd far-chain`,
    `git checkout ${gitCommitSha}`,
    '',
    '# 1. Install dependencies (frozen — lock files are part of the proof)',
    'pnpm install --frozen-lockfile',
    'pip install -e .',
    '',
    '# 2. Verify evidence_log hash chain',
    'pnpm exec tsx ci/verify_chain_smoke.ts',
    '',
    '# 3. Recompute ProofEnvelope proof hashes (byte-equal replay)',
    'pnpm exec tsx scripts/recompute_proof_hashes.ts',
    '',
    '# 4. Replay demo chain (C-ASTRO-0001 → FEC → ProofEnvelope)',
    'pnpm exec tsx scripts/replay_demo_chain.ts',
    '```',
    '',
    '## Hash Verification Status',
    '',
    verification.ok
      ? `✅ Chain verified: ${verification.verifiedCount} records, all hashes consistent.`
      : `❌ Chain broken at seq=${verification.brokenAtSeq ?? '?'}: expected \`${verification.expectedHash?.slice(0, 16) ?? 'N/A'}…\`, actual \`${verification.actualHash?.slice(0, 16) ?? 'N/A'}…\``,
    '',
    '## Files in this export',
    '',
    '| File | Description |',
    '|------|-------------|',
    '| `proof_envelopes.jsonl` | Sealed proof envelopes (one per claim) |',
    '| `repro_runs.jsonl` | Reproduction run records |',
    '| `call_records.redacted.jsonl` | Call record chain (API keys redacted) |',
    '| `claim_graph.json` | Evidence DAG subgraph (evidence_edges + verdict_nodes, 09 §5 V1) |',
    '| `otel-trace.jsonl` | OTel GenAI spans projected from call_records (V1: far_chain.source=call_records_projection, not native SDK; native trace_events = V2) |',
    '| `ro-crate-metadata.json` | RO-Crate metadata (V1 minimal, not validator-compliant) |',
    '| `prov.ttl` | PROV-O provenance trace |',
    '| `data_manifest.json` | File manifest of this export |',
    '| `README_REPLAY.md` | This file |',
    '| `code/` | Code snapshot at time of computation |',
    '| `figures/` | Generated figures (if any) |',
    '',
    '## Known Limitations',
    '',
    '- This export does NOT pass third-party RO-Crate or PROV-O validators (V3 roadmap).',
    '- Call record payloads (request/response) are redacted to protect API keys.',
    '- The `CONFIRMED` verdict requires human scientific endorsement (ASK-9).',
    '- Code is verified only against the current HEAD — no formal verification.',
    '',
    '## Honesty Declaration',
    '',
    'FAR-Chain produces **reliability evidence packages**, not proofs of scientific truth. ',
    'Every claim is accompanied by its falsification spec, verdict, audit trail, and ',
    'cryptographic hash chain — so a reviewer can independently verify:',
    '',
    '1. That the claim was registered BEFORE the evidence was collected (pre-registration hash).',
    '2. That the hash chain is unbroken (append-only ledger).',
    '3. That the verdict follows deterministically from the evidence (anti-theater CI gate).',
    '4. That the computation is reproducible (WIP E4 golden_vectors).',
    '',
    'We do NOT claim:',
    '- Absolute scientific truth.',
    '- Physical process isolation.',
    '- General-purpose benchmark capability.',
    '- Fully automated discovery.',
  ].join('\n');

  const filePath = join(dir, 'README_REPLAY.md');
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}
