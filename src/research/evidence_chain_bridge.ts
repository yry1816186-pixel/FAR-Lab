/**
 * evidence_chain_bridge.ts — 研究任务 → call_records 证据链的确定性桥（双账本统一·R3）。
 *
 * 问题（R2 实测发现）：研究任务（POST /research 的 offline_replay/live 运行）把阶段溯源
 * 收据写进**文件型** RunStore（.far/research-runs/<id>/），从不触碰 SQLite call_records
 * 哈希链——/evidence 的整链 Merkle 根因此只覆盖 ask/seed 路径（任务完成后叶数恒 1，
 * 2026-08-19 真机实测）。两条账本各说各话，信任根不覆盖产品主路径。
 *
 * 本桥（写路径统一·最小附加面）：
 *   - 研究运行进入终态 COMPLETED 时，向 call_records 追加**一条**运行摘要叶：
 *     payloadKind='meta' · purposeTag='baseline_exempt'（非 LLM 调用·免基线对比）·
 *     cred.reproHash = runSummaryDigest（见下）· isoTimestamp = 运行完成时刻（非追加时刻）。
 *   - runSummaryDigest = sha256(canonical(运行摘要投影))——投影只收**稳定字段**
 *     （runId/question/runMode/startedAt + 每收据的 sequence/stageId/stageVersion/attempt/
 *     component/mode/inputHash/outputHash/corpusSnapshotId/corpusRootHash），
 *     不收墙钟/延迟/成本等易变面——同一冻结运行的重算字节稳定。
 *   - 幂等：response_payload 为该投影的 canonical JSON（字节稳定）；追加前精确匹配
 *     已有叶 → 跳过（resume/重复完成事件/进程重启后的重放均不双写）。
 *
 * 边界（cannot-prove · §7 诚实声明）：
 *   - 本叶证明「该运行摘要（含各阶段 I/O 哈希与语料根）在追加时点被锚入证据链」；
 *   - 不证明运行的科学正确性，不证明文件型收据在追加后未被替换——事后校验走
 *     verifyRunSummaryRecord（按摘要重算比对，检出=篡改/漂移）；
 *   - 触发面：仅 API 驱动的运行（路由持有 db 与 store 双柄）；CLI 直驱 orchestrator
 *     的运行不经本桥（其文件收据链仍是其溯源面）——此为如实边界，非缺陷。
 *
 * 零容忍合规：无 any 类型、无 ts-ignore 指令、无空 catch、无桩。链写走 appendRecord（prevHash
 * fail-closed + IMMEDIATE 事务）——本模块不另造链逻辑。
 */

import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import canonicalize from '../vendor/canonicalize.js';

import { appendRecord } from '../evidence_log/repository.ts';
import type { ProvenanceReceipt } from './provenance.ts';
import type { ResearchRun } from './types.ts';

/** 桥叶在链上的 stageId（稳定标识符·幂等查询键之一）。 */
export const RUN_SUMMARY_STAGE_ID = 'research_run_summary';

/** 桥叶的确定性执行者标识（cred.modelId——非模型调用，如实命名）。 */
export const RUN_SUMMARY_ACTOR = 'deterministic-research-bridge';

/** 运行摘要投影（canonical 化后做 sha256 的输入）。 */
export interface RunSummaryProjection {
  readonly runId: string;
  readonly question: string;
  readonly runMode: string;
  readonly startedAt: string;
  readonly stageReceipts: readonly RunSummaryReceiptProjection[];
}

/** 单条阶段收据的稳定字段投影（墙钟/延迟/成本等易变面不入投影）。 */
export interface RunSummaryReceiptProjection {
  readonly sequence: number;
  readonly stageId: string;
  readonly stageVersion: number;
  readonly attempt: number;
  readonly component: ProvenanceReceipt['component'];
  readonly mode: ProvenanceReceipt['mode'];
  readonly inputHash: string | null;
  readonly outputHash: string | null;
  readonly corpusSnapshotId: string | null;
  readonly corpusRootHash: string | null;
}

function canonical(value: unknown): string {
  return canonicalize(value);
}

/** ResearchRun → 稳定投影（仅收冻结后不变的字段）。 */
export function projectRunSummary(run: ResearchRun): RunSummaryProjection {
  return {
    runId: run.runId,
    question: run.question,
    runMode: run.runMode,
    startedAt: run.startedAt,
    stageReceipts: run.stageReceipts.map((r) => ({
      sequence: r.sequence,
      stageId: r.stageId,
      stageVersion: r.stageVersion,
      attempt: r.attempt,
      component: r.component,
      mode: r.mode,
      inputHash: r.inputHash,
      outputHash: r.outputHash,
      corpusSnapshotId: r.corpusSnapshotId,
      corpusRootHash: r.corpusRootHash,
    })),
  };
}

/** 运行摘要内容寻址摘要：sha256(canonical(projection))。 */
export function computeRunSummaryDigest(run: ResearchRun): string {
  return createHash('sha256').update(canonical(projectRunSummary(run)), 'utf8').digest('hex');
}

/** 桥叶追加结果。 */
export interface RunSummaryAppendResult {
  readonly appended: boolean;
  readonly seq: number;
  readonly currentHash: string;
  readonly runDigest: string;
}

/**
 * appendRunSummaryToChain —— 把一个已完成运行的摘要锚入 call_records 链。
 *
 * 幂等：同一运行（response_payload 字节相同）已锚定 → 返回既有叶（appended=false）。
 * 链完整性由 appendRecord 保证（prevHash 必须等于当前链头，否则抛错 fail-closed）。
 *
 * @param completedAt 运行完成时刻（checkpoint.completedAt；桥叶的时间语义=运行时间，非追加时间）
 */
export function appendRunSummaryToChain(
  db: Database.Database,
  run: ResearchRun,
  opts: { readonly completedAt: string; readonly providerProfile: import('../llm_gateway/types.ts').ProviderProfile },
): RunSummaryAppendResult {
  const projection = projectRunSummary(run);
  const runDigest = createHash('sha256').update(canonical(projection), 'utf8').digest('hex');
  const responsePayload = canonical({
    runId: run.runId,
    runDigest,
    stageReceiptCount: run.stageReceipts.length,
    runMode: run.runMode,
  });

  const existing = db
    .prepare(
      `SELECT seq, current_hash AS currentHash FROM call_records
       WHERE stage_id = ? AND response_payload = ?`,
    )
    .get(RUN_SUMMARY_STAGE_ID, responsePayload) as
    | { readonly seq: number; readonly currentHash: string }
    | undefined;
  if (existing !== undefined) {
    return { appended: false, seq: existing.seq, currentHash: existing.currentHash, runDigest };
  }

  const appended = appendRecord(
    db,
    {
      stageId: RUN_SUMMARY_STAGE_ID,
      cred: {
        modelId: RUN_SUMMARY_ACTOR,
        dashscopeRequestId: null,
        reproHash: runDigest,
        gitCommitSha: run.environment.gitCommit ?? 'unknown',
        isoTimestamp: opts.completedAt,
      },
      payloadKind: 'meta',
      purposeTag: 'baseline_exempt',
    },
    {
      requestPayload: canonical(projection),
      responsePayload,
      finishReason: 'stop',
      usageTokensTotal: null,
    },
    { providerProfile: opts.providerProfile },
  );
  return { appended: true, seq: appended.seq, currentHash: appended.currentHash, runDigest };
}

/** 运行摘要校验结果。 */
export interface RunSummaryVerifyResult {
  readonly ok: boolean;
  readonly reason:
    | 'match'
    | 'leaf_absent'
    | 'digest_drift';
  readonly runDigest: string;
  readonly seq: number | null;
}

/**
 * verifyRunSummaryRecord —— 按（可能被篡改的）运行文件重算摘要并比对链上叶。
 *
 * 用途：追加后若有人改动了 .far/research-runs/<id>/ 的冻结文件，重算 digest 即漂移，
 * 与链上 cred.reproHash 不符 → 篡改/漂移可检出（不声称能恢复真值——检测即边界）。
 */
export function verifyRunSummaryRecord(
  db: Database.Database,
  run: ResearchRun,
): RunSummaryVerifyResult {
  const runDigest = computeRunSummaryDigest(run);
  const rows = db
    .prepare(
      `SELECT seq, repro_hash AS reproHash FROM call_records
       WHERE stage_id = ? AND response_payload LIKE ?`,
    )
    .all(RUN_SUMMARY_STAGE_ID, `%"runId":"${run.runId}"%`) as readonly {
    readonly seq: number;
    readonly reproHash: string;
  }[];
  if (rows.length === 0) {
    return { ok: false, reason: 'leaf_absent', runDigest, seq: null };
  }
  const hit = rows.find((r) => r.reproHash === runDigest);
  if (hit !== undefined) {
    return { ok: true, reason: 'match', runDigest, seq: hit.seq };
  }
  return { ok: false, reason: 'digest_drift', runDigest, seq: rows[0]?.seq ?? null };
}
