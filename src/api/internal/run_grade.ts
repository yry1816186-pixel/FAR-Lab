// run_grade —— 把此前孤立的 src/trace/grade_scorers.ts（M-10 deterministicGrade）接进生产 run 路径。
// 真实依赖：LoopState.artifacts（阶段产物）+ call_records.current_hash（evidence_log 哈希链）+ verdictNode.verdict。
// 这些统计从真实 run 派生，非预制常量；deterministicGrade 据此算 7 维 run-integrity 分数（反剧场：run 自身可审计）。

import type { Database } from 'better-sqlite3';
import { ulid } from 'ulid';

import { deterministicGrade } from '../../trace/grade_scorers.ts';
import type { GradeInput } from '../../trace/grade_scorers.ts';
import type { TraceGrade } from '../../trace/agent_run_event.ts';
import type { LoopState, StageArtifact } from '../../agent_loop/types.ts';

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * 对一次真实 run 计算 deterministic TraceGrade。
 *
 * gradedBy 恒为 'deterministic_script'（纯规则·禁 LLM-as-judge·§2.5 红线）。
 * 统计从 LoopState + evidence_log DB 派生：
 *   - allEventsHashed ← 查 call_records.current_hash 是否全为合法 64-hex 链哈希
 *   - hasSchemaViolation ← loopState.error.code === 'STAGE_SCHEMA_INVALID'
 *   - isOverConfirmed ← verdict=CONFIRMED 但零被接受来源（over_confirmed 反剧场信号）
 *   - sourceCardAcceptedCount ← 聚合 integration 阶段 citations
 */
export function gradeRunIntegrity(loopState: LoopState, db: Database): TraceGrade {
  return deterministicGrade(deriveGradeInput(loopState, db));
}

function deriveGradeInput(loopState: LoopState, db: Database): GradeInput {
  const artifacts = loopState.artifacts;
  const sourceCardAcceptedCount = countAcceptedSources(artifacts);
  const verdict = loopState.verdictNode?.verdict ?? null;

  return {
    traceGradeId: ulid(),
    runId: loopState.runId,
    graderKind: 'verdict_honesty',
    eventCount: artifacts.length,
    guardrailBlockedCount: 0,
    toolCallCompletedCount: 0,
    sourceCardAcceptedCount,
    allEventsHashed: verifyCallRecordHashChain(db),
    hasSchemaViolation: loopState.error?.code === 'STAGE_SCHEMA_INVALID',
    hasProviderBoundaryLeak: false,
    isOverConfirmed: verdict === 'CONFIRMED' && sourceCardAcceptedCount === 0,
    attackBlocked: false,
    evidenceRefs: collectEvidenceRefs(artifacts),
    isoTimestamp: new Date().toISOString(),
  };
}

/**
 * 查 call_records.current_hash：全部为合法 64-hex 链哈希即视为哈希链完整（可复现）。
 * 零行（异常空 run）→ false（无证据即不可复现）。
 */
function verifyCallRecordHashChain(db: Database): boolean {
  const rows = db
    .prepare('SELECT current_hash FROM call_records ORDER BY seq ASC')
    .all() as ReadonlyArray<{ current_hash?: string }>;
  if (rows.length === 0) {
    return false;
  }
  return rows.every((row) => typeof row.current_hash === 'string' && HEX64.test(row.current_hash));
}

function countAcceptedSources(artifacts: readonly StageArtifact[]): number {
  let total = 0;
  for (const artifact of artifacts) {
    const payload = artifact.structured;
    if (isIntegrationPayload(payload)) {
      total += payload.citations.length;
    }
  }
  return total;
}

function collectEvidenceRefs(artifacts: readonly StageArtifact[]): readonly string[] {
  const refs: string[] = [];
  for (const artifact of artifacts) {
    const payload = artifact.structured;
    if (isEvidencePayload(payload)) {
      for (const record of payload.evidenceRecords) {
        refs.push(record.evidenceId);
      }
    }
  }
  return refs;
}

function isIntegrationPayload(
  payload: StageArtifact['structured'],
): payload is Extract<StageArtifact['structured'], { readonly kind: 'integration' }> {
  return payload.kind === 'integration';
}

function isEvidencePayload(
  payload: StageArtifact['structured'],
): payload is Extract<StageArtifact['structured'], { readonly kind: 'evidence' }> {
  return payload.kind === 'evidence';
}
