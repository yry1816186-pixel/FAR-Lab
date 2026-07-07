// scripts/recompute_proof_hashes.ts
// 职责：读取 .far-proof 导出包中的 proof_envelopes.jsonl，对每条信封**独立重算**
//       proofHash 并与记录值字节比对（"verification not trust" 演示）。
// 历史溯源：FINAL_PACKAGE/09_PROOF_CARRYING_RESEARCH_OBJECT.md §4（已归档·备份 FAR-Lab_Backups/）·运行时 SSOT 以本文件源码实测为准（proofHash 自排除重算）+
//            15_OPEN_SCIENCE_EXPORT.md §1（replay step 3）。
//
// 退出码：
//   0 — 所有信封 proofHash 字节级一致
//   1 — 文件缺失 / 解析失败 / 任一 proofHash 不匹配
//
// 这是 README_REPLAY.md 第 3 步引用的重算脚本。fresh-clone 后跑此脚本即可独立验证
// 导出包未被篡改（即使导出机器不可信）。
//
// 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { computeProofHash } from '../src/proof_envelope/proof_hash.ts';
import type {
  ProofEnvelope,
  ProofCheckResult,
  CheckOutcome,
} from '../src/proof_envelope/types.ts';
import type { FalsificationSpec } from '../src/falsifiability/types.ts';
import type { Verdict } from '../src/falsifiability/types.ts';

// ---------------------------------------------------------------------------
// JSONL 解析（行级容错：空行跳过，坏行报错不静默）
// ---------------------------------------------------------------------------

interface RawEnvelopeRow {
  readonly envelope_id: string;
  readonly claim_id: string;
  readonly verdict_node_id: string;
  readonly conclusion: string;
  readonly proof_hash: string;
  readonly prev_proof_hash: string;
  readonly checks: string; // JSON 字符串（SQLite 落库形态）
  readonly known_failures: string; // JSON 字符串
  readonly falsification_spec: string; // JSON 字符串
  readonly source_anchor: string; // JSON 字符串
  readonly repro_hash: string;
  readonly sealed_by: string;
  readonly sealed_at: string;
  readonly created_at: string;
}

function parseJsonArrayChecks(raw: string): ProofCheckResult[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('recompute: checks is not a JSON array');
  }
  return parsed.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`recompute: checks[${index}] is not an object`);
    }
    const record = entry as Record<string, unknown>;
    const ruleId = String(record.rule_id ?? record.ruleId ?? '');
    const ruleName = String(record.rule_name ?? record.ruleName ?? '');
    const outcome = String(record.outcome) as CheckOutcome;
    const detail = String(record.detail ?? '');
    return { ruleId, ruleName, outcome, detail } as ProofCheckResult;
  });
}

function rowToEnvelope(row: RawEnvelopeRow): ProofEnvelope {
  return {
    envelopeId: row.envelope_id,
    claimId: row.claim_id,
    verdictNodeId: row.verdict_node_id,
    conclusion: row.conclusion as Verdict,
    proofHash: row.proof_hash,
    prevProofHash: row.prev_proof_hash,
    checks: parseJsonArrayChecks(row.checks),
    knownFailures: JSON.parse(row.known_failures) as string[],
    falsificationSpec: JSON.parse(row.falsification_spec) as FalsificationSpec,
    // source_anchor 不参与 proofHash 计算（computeProofHash 仅取指定字段），
    // 但保留完整解析以维持 ProofEnvelope 类型完整。
    sourceAnchor: JSON.parse(row.source_anchor),
    reproHash: row.repro_hash,
    sealedBy: 'deterministic_sealer',
    sealedAt: row.sealed_at,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// 主逻辑
// ---------------------------------------------------------------------------

export interface RecomputeResult {
  readonly checked: number;
  readonly mismatches: ReadonlyArray<{
    readonly envelopeId: string;
    readonly expected: string;
    readonly actual: string;
  }>;
}

/**
 * 对 proof_envelopes.jsonl 逐条重算 proofHash 并比对。
 * 返回检查数与不匹配清单（不抛错，由调用方决定退出码）。
 */
export function recomputeProofHashes(jsonlPath: string): RecomputeResult {
  if (!existsSync(jsonlPath)) {
    throw new Error(`recompute: proof_envelopes.jsonl not found at ${jsonlPath}`);
  }
  const text = readFileSync(jsonlPath, 'utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error(`recompute: ${jsonlPath} contains no envelope rows`);
  }

  const mismatches: Array<{
    readonly envelopeId: string;
    readonly expected: string;
    readonly actual: string;
  }> = [];
  for (const [index, line] of lines.entries()) {
    const row = JSON.parse(line) as RawEnvelopeRow;
    const envelope = rowToEnvelope(row);
    const { proofHash: _stored, ...fieldsForHash } = envelope;
    void _stored;
    const recomputed = computeProofHash(fieldsForHash);
    if (recomputed !== envelope.proofHash) {
      mismatches.push({
        envelopeId: envelope.envelopeId,
        expected: envelope.proofHash,
        actual: recomputed,
      });
    }
    void index;
  }

  return { checked: lines.length, mismatches };
}

function main(): void {
  // 默认读取 ./.far-proof/，可通过 argv[2] 覆盖目录。
  const dirArg = process.argv[2];
  const proofDir = dirArg !== undefined ? resolve(dirArg) : resolve('.far-proof');
  const jsonlPath = join(proofDir, 'proof_envelopes.jsonl');

  try {
    const result = recomputeProofHashes(jsonlPath);
    if (result.mismatches.length > 0) {
      console.error(
        `RECOMPUTE_PROOF_HASHES: FAIL — ${result.mismatches.length}/${result.checked} envelope(s) hash mismatch`,
      );
      for (const mismatch of result.mismatches) {
        console.error(
          `  ${mismatch.envelopeId}: expected=${mismatch.expected.slice(0, 16)}… actual=${mismatch.actual.slice(0, 16)}…`,
        );
      }
      process.exitCode = 1;
      return;
    }
    console.log(
      `RECOMPUTE_PROOF_HASHES: OK — ${result.checked} envelope(s) byte-equal recompute verified`,
    );
    process.exitCode = 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`RECOMPUTE_PROOF_HASHES: FAIL — ${message}`);
    process.exitCode = 1;
  }
}

// 仅当作为脚本直接运行时执行 main()（被测试 import 时不触发）。
const argv1 = process.argv[1];
const invokedDirectly = argv1 !== undefined && pathToFileURL(argv1).href === import.meta.url;
if (invokedDirectly) {
  main();
}
