/**
 * ProofEnvelope sealer: 封装完整密封流程.
 *
 * 模型中立. sealedBy = 'deterministic_sealer'. 无 LLM.
 * 零容忍合规.
 */

import { ulid } from 'ulid';
import type Database from 'better-sqlite3';
import { validateProofEnvelope, hasAntiTheaterViolation } from './validator.ts';
import { computeProofHash } from './proof_hash.ts';
import type { ProofEnvelope, SealProofEnvelopeInput, ProofCheckResult } from './types.ts';

export interface SealResult {
  readonly envelope: ProofEnvelope;
  readonly checks: readonly ProofCheckResult[];
  readonly hasWarnings: boolean;
}

/**
 * 密封一个 ProofEnvelope: 验证→计算 proofHash→落库→返回
 *
 * 关键:
 *   - 算法完全确定性（禁 LLM, sealedBy = 'deterministic_sealer'）
 *   - knownFailures 不可隐藏 (F9)
 *   - WARN check + CONFIRMED → trigger 层阻断 (F1 机器化)
 *   - 不签发 CONFIRMED 终审 (ASK-9, 需人类背书)
 */
export function sealProofEnvelope(
  db: Database.Database,
  input: SealProofEnvelopeInput,
): SealResult {
  const envelopeId = ulid();

  // 1. 执行 9 规则验证
  const checks = validateProofEnvelope(input);

  // 1b. TS 层反 theater 防线（AT-02 修复，2026-06-29）：WARN/FAIL check + CONFIRMED → throw，绝不签发。
  //     第一道防线。旧版仅依赖 DB trigger 且 trigger 只匹配 WARN → FAIL+CONFIRMED 可落库（F1 机器化漏洞）。
  //     DB trigger (migration 0008 匹配 WARN/FAIL) 作为物理兜底，防直接 SQL INSERT 绕过 sealer。
  if (hasAntiTheaterViolation(checks, input.conclusion)) {
    throw new Error(
      'proof_envelope: WARN/FAIL check present, cannot seal CONFIRMED (anti-theater F1 · AT-02)',
    );
  }

  const hasWarnOrFail = checks.some(
    (c) => c.outcome === 'WARN' || c.outcome === 'FAIL',
  );

  // 2. 构造 envelope (不含 proofHash)
  const knownFailures: readonly string[] = input.knownFailures ?? [];

  const envelopeWithoutHash: Omit<ProofEnvelope, 'proofHash'> = {
    envelopeId,
    claimId: input.claimId,
    verdictNodeId: input.verdictNodeId,
    conclusion: input.conclusion,
    prevProofHash: input.prevProofHash,
    checks,
    knownFailures,
    falsificationSpec: input.falsificationSpec,
    sourceAnchor: input.sourceAnchor,
    reproHash: input.reproHash,
    sealedBy: 'deterministic_sealer',
    sealedAt: input.sealedAt,
    createdAt: new Date().toISOString(),
  };

  // 3. 计算 proofHash
  const proofHash = computeProofHash(envelopeWithoutHash);

  const envelope: ProofEnvelope = {
    ...envelopeWithoutHash,
    proofHash,
  };

  // 4. 落库 (anti-theater 已在 step 1b 由 TS 层阻断；trigger 0008 匹配 WARN/FAIL 作物理兜底)
  db.prepare(
    `INSERT INTO proof_envelopes (
      envelope_id, claim_id, verdict_node_id, conclusion,
      proof_hash, prev_proof_hash, checks, known_failures,
      falsification_spec, source_anchor, repro_hash,
      sealed_by, sealed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    envelope.envelopeId,
    envelope.claimId,
    envelope.verdictNodeId,
    envelope.conclusion,
    envelope.proofHash,
    envelope.prevProofHash,
    JSON.stringify(envelope.checks),
    JSON.stringify(envelope.knownFailures),
    JSON.stringify(envelope.falsificationSpec),
    JSON.stringify(envelope.sourceAnchor),
    envelope.reproHash,
    envelope.sealedBy,
    envelope.sealedAt,
    envelope.createdAt,
  );

  return {
    envelope,
    checks,
    hasWarnings: hasWarnOrFail,
  };
}

/**
 * 从数据库按 verdict_node_id 查询所有关联的 proof_envelopes
 */
export function getProofEnvelopesByVerdictNode(
  db: Database.Database,
  verdictNodeId: string,
): ProofEnvelope[] {
  const rows = db
    .prepare(
      `SELECT envelope_id, claim_id, verdict_node_id, conclusion,
              proof_hash, prev_proof_hash, checks, known_failures,
              falsification_spec, source_anchor, repro_hash,
              sealed_by, sealed_at, created_at
       FROM proof_envelopes
       WHERE verdict_node_id = ?
       ORDER BY created_at ASC`,
    )
    .all(verdictNodeId) as Array<Record<string, unknown>>;

  return rows.map((row) => rowToProofEnvelope(row));
}

function rowToProofEnvelope(row: Record<string, unknown>): ProofEnvelope {
  return {
    envelopeId: String(row.envelope_id),
    claimId: String(row.claim_id),
    verdictNodeId: String(row.verdict_node_id),
    conclusion: String(row.conclusion) as ProofEnvelope['conclusion'],
    proofHash: String(row.proof_hash),
    prevProofHash: String(row.prev_proof_hash),
    checks: JSON.parse(String(row.checks)) as ProofCheckResult[],
    knownFailures: JSON.parse(String(row.known_failures ?? '[]')) as string[],
    falsificationSpec: JSON.parse(String(row.falsification_spec)),
    sourceAnchor: JSON.parse(String(row.source_anchor)),
    reproHash: String(row.repro_hash),
    sealedBy: 'deterministic_sealer',
    sealedAt: String(row.sealed_at),
    createdAt: String(row.created_at),
  };
}
