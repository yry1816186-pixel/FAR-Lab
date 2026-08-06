/**
 * verdict_stage —— runAgentLoop 收敛后的第 7 阶段（裁决接通）。
 *
 * 职责：六阶段收敛后，把 stage3 hypothesis + stage4 evidence 喂入 falsifiability 引擎，
 *   产出真实 VerdictNode（落 verdict_nodes·关联 evidence_log 行），填入 LoopState.verdictNode。
 *
 *   镜像 fec/orchestrator.fecAppendClaim 的「evidence_log + V2 verdict kernel + recordVerdict」模式，
 *   但不新建 call_record——裁决是「衍生计算」（复用既有证据链·不增链长·verifiedCount 仍===6）。
 *   hypothesis 落一条 evidence_log 行（关联 stage3 的 call_record seq），既满足 verdict_nodes
 *   的 evidence_id FK，也满足 recordVerdict 对 CONFIRMED 的 assertConfirmedEvidenceExists 守卫
 *   （Red Line #7：CONFIRMED 必须有非空 evidence_payload）。
 *
 * 类型转换（agent_loop EvidenceRecord → falsifiability EvidenceRecord）：
 *   - supportsOrRefutes='supports' → supportsClaim=true, refutesClaim=false
 *   - supportsOrRefutes='refutes'   → supportsClaim=false, refutesClaim=true
 *   - supportsOrRefutes='neutral'  → 过滤（中性证据无投票信号·不臆造 supports/refutes；
 *     亦避免触发 decideVerdict.assertEvidenceRecord 的「supportsClaim/refutesClaim 恰一为真」断言）
 *   - 不映射 entailmentScore → metricValue：entailmentScore 是 bge-reranker 文献蕴含分数，
 *     与 falsificationSpec 的实验指标阈值（如 effect_size_cohens_d >= 0.8）是不同量纲。
 *     把文献蕴含分数当实验指标阈值属语义错误（混淆两种证据语义）。裁决基于 stage4 的
 *     supports/refutes 投票——这正是 AI4S 文献驱动研究代理在「未跑实验前」能诚实产出的裁决语义。
 *   - scopeNarrowerThanClaim=false：stage4 产物无 scope-slip 字段·不臆造（反幻觉）。
 *
 * 诚实降级：缺 hypothesis/evidence artifact 或空证据链 → 返回 null。
 *   null 仅用于文档化的「无裁决前提」，不掩盖错误；主循环已收敛，verdictNode=null 不改变
 *   terminationReason（feedback_converged）。计算路径上的真实异常（verdict kernel/recordVerdict 抛错）
 *   会自然向上传播→被 fsm_runner 外层 try 捕获→reason='error'（符合预期·非静默吞错）。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩返回。判别联合用 kind narrow·禁 as 强转。
 */

import type { Database } from 'better-sqlite3';

import { appendEvidenceLog, getChainHead } from '../evidence_log/index.ts';
import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import type { SourceAnchor } from '../evidence_log/index.ts';
import { decideFiveValueVerdict, recordVerdict } from '../falsifiability/index.ts';
import type {
  EvidenceRecord as FalsEvidenceRecord,
  FalsificationSpec,
  ThresholdSpec,
  VerdictNode,
} from '../falsifiability/index.ts';
import {
  buildLegacyVerdictKernelInput,
  extractVerdictTrace,
  makeLegacyCompatFec,
  verdictResultFromKernelOutput,
} from '../falsifiability/legacy_kernel_adapter.ts';
import { toFalsificationSpecAndThreshold } from './stages/stage3_hypothesis.ts';
import type {
  EvidencePayload,
  HypothesisPayload,
  StageArtifact,
} from './types.ts';
import type { EvidenceRecord } from './types.ts';

/** Input parameters for operations involving run verdict stage args. */
export interface RunVerdictStageArgs {
  readonly db: Database;
  readonly artifacts: readonly StageArtifact[];
  readonly gitCommitSha: string;
  readonly runId: string;
}

// ---------- 纯转换逻辑（导出供单测·无副作用） ----------

/**
 * 把 stage4 产出的 agent_loop EvidenceRecord[] 转为 falsifiability EvidenceRecord[]。
 *
 * 转换规则见模块头注释。中性证据被过滤（无投票信号）。
 *
 * @param claim 被裁决的假设陈述（所有证据共用同一 claim·falsifiability EvidenceRecord.claim）
 * @param sourceAnchor 裁决级溯源锚（所有证据共享·per-record 的文献引用详情已存于 stage4 call_record）
 */
export function convertEvidenceRecords(
  records: ReadonlyArray<EvidenceRecord>,
  claim: string,
  sourceAnchor: SourceAnchor,
): FalsEvidenceRecord[] {
  const converted: FalsEvidenceRecord[] = [];
  for (const record of records) {
    if (record.supportsOrRefutes === 'neutral') {
      // 中性证据无 supports/refutes 投票信号——排除出裁决投票（正确语义·非 bug 掩盖）。
      continue;
    }
    converted.push({
      claim,
      supportsClaim: record.supportsOrRefutes === 'supports',
      refutesClaim: record.supportsOrRefutes === 'refutes',
      scopeNarrowerThanClaim: false,
      sourceAnchor,
      // 不设 metricValue：entailmentScore 与 falsification 阈值不同量纲·禁混用（见模块头）。
    });
  }
  return converted;
}

/**
 * 从 FalsificationSpec 构造 verdict kernel adapter 所需的 ThresholdSpec。
 *
 * toFalsificationSpecAndThreshold 对 range 返回 thresholdSpec（含 lower/upper），
 * 对 gt/lt 返回 undefined（阈值在 spec.falsificationThreshold）。本函数统一为
 * legacy adapter 所需的非空 ThresholdSpec。
 *
 * @throws Error range 语义但缺 lower/upper
 */
export function resolveThresholdSpec(
  spec: FalsificationSpec,
  rangeThreshold: ThresholdSpec | undefined,
): ThresholdSpec {
  if (spec.thresholdSemantics === 'range') {
    if (
      rangeThreshold === undefined ||
      rangeThreshold.lower === undefined ||
      rangeThreshold.upper === undefined
    ) {
      throw new Error(
        `resolveThresholdSpec: range semantics require lower+upper (metric="${spec.metric}")`,
      );
    }
    return { semantics: 'range', lower: rangeThreshold.lower, upper: rangeThreshold.upper };
  }
  return { semantics: spec.thresholdSemantics, value: spec.falsificationThreshold };
}

// ---------- artifact 检索（discriminatedUnion kind narrow） ----------

function findLastHypothesis(artifacts: readonly StageArtifact[]): HypothesisPayload | undefined {
  for (let i = artifacts.length - 1; i >= 0; i -= 1) {
    const artifact = artifacts[i];
    if (artifact !== undefined && artifact.structured.kind === 'hypothesis') {
      return artifact.structured;
    }
  }
  return undefined;
}

function findLastEvidence(artifacts: readonly StageArtifact[]): EvidencePayload | undefined {
  for (let i = artifacts.length - 1; i >= 0; i -= 1) {
    const artifact = artifacts[i];
    if (artifact !== undefined && artifact.structured.kind === 'evidence') {
      return artifact.structured;
    }
  }
  return undefined;
}

/**
 * 解析 hypothesis evidence_log 行应关联的 call_record seq。
 *
 * 优先 stage3_hypothesis 的最近 call_record（被裁决假设的出处·语义最紧）；
 * 回退链头（stage6 的 seq·裁决在整链建成后计算）。空链 → null。
 */
function resolveHypothesisCallRecordSeq(db: Database): number | null {
  const stage3Row = db
    .prepare('SELECT seq FROM call_records WHERE stage_id = ? ORDER BY seq DESC LIMIT 1')
    .get('stage3_hypothesis') as { seq?: number } | undefined;
  if (stage3Row !== undefined && typeof stage3Row.seq === 'number') {
    return stage3Row.seq;
  }
  const head = getChainHead(db);
  return head === undefined ? null : head.seq;
}

// ---------- runVerdictStage 主入口 ----------

/**
 * 第 7 阶段：裁决接通。六阶段收敛后产真实 VerdictNode。
 *
 * 流程（单事务·原子）：
 *   1. 检索最近 hypothesis + evidence artifact；缺失 → 返回 null。
 *   2. toFalsificationSpecAndThreshold（复用 stage3 单一转换权威）+ resolveThresholdSpec。
 *   3. convertEvidenceRecords（过滤 neutral·投票映射）。
 *   4. 解析 hypothesis call_record seq；空链 → 返回 null。
 *   5. 事务内：appendEvidenceLog（hypothesis 证据行）→ V2 verdict kernel → recordVerdict。
 *
 * @returns VerdictNode（落库读回）；缺前提时返回 null（文档化降级·非错误）
 */
export function runVerdictStage(args: RunVerdictStageArgs): VerdictNode | null {
  const hypothesis = findLastHypothesis(args.artifacts);
  const evidence = findLastEvidence(args.artifacts);
  if (hypothesis === undefined || evidence === undefined) {
    return null;
  }

  const { spec, thresholdSpec: rangeThreshold } = toFalsificationSpecAndThreshold(
    hypothesis.falsificationMethod,
  );
  const thresholdSpec = resolveThresholdSpec(spec, rangeThreshold);

  const callRecordSeq = resolveHypothesisCallRecordSeq(args.db);
  if (callRecordSeq === null) {
    return null;
  }

  // 先从原始记录算投票摘要（用于 rawResponseHash·打破 sourceAnchor↔converted 的循环依赖）
  const evidenceVotes = evidence.evidenceRecords.map((record) => ({
    supports: record.supportsOrRefutes === 'supports',
    refutes: record.supportsOrRefutes === 'refutes',
  }));
  const isoTimestamp = new Date().toISOString();
  // 裁决输入的确定性指纹（rawResponseHash 语义：绑定「裁决了什么」·可复算·非伪造）
  const verdictInputHash = hashCanonicalJson({
    runId: args.runId,
    claim: hypothesis.claim,
    falsificationSpec: spec,
    thresholdSpec,
    evidenceVotes,
  });
  const sourceAnchor: SourceAnchor = {
    gitCommitSha: args.gitCommitSha,
    dashscopeRequestId: null,
    isoTimestamp,
    rawResponseHash: verdictInputHash,
    codeLocation: { filePath: 'src/agent_loop/verdict_stage.ts', location: 'runVerdictStage' },
  };
  const convertedEvidences = convertEvidenceRecords(
    evidence.evidenceRecords,
    hypothesis.claim,
    sourceAnchor,
  );

  const txn = args.db.transaction((): VerdictNode => {
    const evidenceLogEntry = appendEvidenceLog(args.db, {
      callRecordSeq,
      evidencePayload: {
        kind: 'hypothesis_verdict_input',
        runId: args.runId,
        claim: hypothesis.claim,
        evidenceCount: convertedEvidences.length,
        conflictingEvidenceCount: evidence.conflictingEvidenceCount,
      },
      sourceAnchor,
      // FUSION-OS-10：hypothesis_verdict_input 是系统构造的裁决输入摘要（非 raw 外部观测）→ derivable=1
      // 内容寻址密封：appendEvidenceLog 落 sha256(canonical JSON)，verify 命令重算比对检测 DB 文件级篡改。
      derivable: 1,
    });

    const fec = makeLegacyCompatFec({
      claimId: args.runId,
      falsificationSpec: spec,
      thresholdSpec,
      frozenAt: isoTimestamp,
    });
    const kernelOutput = decideFiveValueVerdict(
      // FUSION-OS-1:agent_loop 是文献投票路径(输入为文献蕴含 supports/refutes 投票·非实验数据),
      // anti-theater 检测实验 theater(seed-cherry/p-hacking/metric-swap)对文献投票不适用——无实验数据
      // 无 theater 风险。故 buildLegacyVerdictKernelInput 不加 anti_theater_not_linted flag(见该函数注释)。
      // CONTRA-005 PATH-A(Round 4 裁决):标 evidenceBasis='observational_only'——文献投票证据非实验产出,
      // 若声明 claimType='causal' 且 ConfoundingGate FAIL → kernel 追加 F6_CAUSAL_HONESTY reasonCode(诚实降级,
      // 不新增第六值,保 INV-01)。文献 CONFIRMED 语义保持(非因果声明不受影响)。实验路径的 anti-theater
      // 强制门在 orchestrator fecAppendClaim。
      buildLegacyVerdictKernelInput({
        claim: hypothesis.claim,
        evidences: convertedEvidences,
        falsificationSpec: spec,
        thresholdSpec,
        fec,
        evidenceBasis: 'observational_only',
      }),
    );
    const decision = verdictResultFromKernelOutput(kernelOutput);

    return recordVerdict(args.db, {
      evidenceId: evidenceLogEntry.evidenceId,
      parentVerdictId: null,
      nodeKind: 'root',
      verdict: decision.verdict,
      falsificationSpec: spec,
      thresholdSpec,
      metricValue: decision.metricValue,
      conflictingEvidenceCount: decision.conflictingEvidenceCount,
      scopeSlipText: decision.scopeSlipText,
      untestedReason: decision.untestedReason,
      sourceAnchor,
      replayProver: null,
      // P0-2-EXT：与 decision 同源 kernelOutput（line 245），落库 trace 供 verdict_nodes 审计 + current_hash 绑定。
      verdictTrace: extractVerdictTrace(kernelOutput),
    });
  });

  // IMMEDIATE 事务（CONCURRENCY · 镜像 recordVerdict/append/apply .immediate() 既有纪律）：
  // 本事务体 appendEvidenceLog + recordVerdict（写 verdict_nodes 链·getVerdictChainHead→INSERT）。
  // better-sqlite3 嵌套事务用 SAVEPOINT——recordVerdict 内部的 insert.immediate() 在本外层事务内
  // 退化为 SAVEPOINT，不获取 RESERVED 锁。故锁级由本最外层事务决定：txn()=DEFERRED 会使整个
  // 链写在 DEFERRED 下（读链头后才获 RESERVED·跨进程 TOCTOU 窗口），须用 txn.immediate() 在
  // BEGIN 即获 RESERVED 锁，使 chainHead 读 + INSERT 原子化（防两条记录接同一 prevHash 分叉）。
  // 单进程 better-sqlite3 同步执行下 immediate 不自阻塞；跨进程高争用时 SQLITE_BUSY=fail-closed（期望行为）。
  return txn.immediate();
}
