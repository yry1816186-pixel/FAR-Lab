import type Database from 'better-sqlite3';
import {
  appendEvidenceLog,
  appendRecord,
} from '../evidence_log/index.ts';
import type {
  AppendRecordInput,
  AppendRecordOptions,
  CallAuditData,
  EvidenceLogEntry,
  HashedRecord,
  SourceAnchor,
} from '../evidence_log/index.ts';
import {
  decideFiveValueVerdict,
  evaluateThreshold,
  falsifiabilityGate,
  recordVerdict,
  registerContract,
} from '../falsifiability/index.ts';
import type {
  DatasetBindingSpec,
  EvidenceRecord,
  EvidenceSufficiencyReport,
  FalsificationSpec,
  FalsifiabilityContract,
  RegisterContractInput,
  StatisticalResult,
  ThresholdSpec,
  VerdictKernelInput,
  VerdictKernelOutput,
  VerdictNode,
  VerdictNodeKind,
  VerdictResult,
} from '../falsifiability/index.ts';
import { compileFec } from './compiler.ts';
import {
  assertFecGate,
  enforceFecMandatoryGate,
  type FecGateDecision,
} from './fec_mandate.ts';
import type { FecContractV2 } from './fec_contract.ts';
import type {
  ClaimType,
  ConfoundingGateResult,
  EvidenceBasis,
} from '../confounding_gate/types.ts';

export interface FecAppendClaimArgs {
  readonly callRecord: AppendRecordInput;
  readonly callAudit: CallAuditData;
  readonly appendOptions: AppendRecordOptions;
  readonly evidencePayload: Record<string, unknown>;
  readonly sourceAnchor: SourceAnchor;
  readonly claim: string;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec;
  readonly evidences: ReadonlyArray<EvidenceRecord>;
  readonly parentVerdictId: string | null;
  readonly nodeKind: VerdictNodeKind;
  /**
   * F8 预登记契约输入(可选·spec 11 反 p-hacking)。提供时在 verdict kernel 前 registerContract
   * 锁定 preregistrationHash。§2-M2 修复:接线原死代码 registerContract caller。
   * 不提供则跳过(向后兼容,result.contract=null)。
   */
  readonly contractInput?: RegisterContractInput;
  /**
   * FEC V2 强制契约（W2-A·03 §2.3）。在 verdict kernel 前 compileFec + enforceFecMandatoryGate：
   * 编译失败 → fail-closed UNTESTED；LLM_FROZEN → CI 阻断 throw。
   */
  readonly fecV2: {
    readonly contract: FecContractV2;
    readonly measurementCutoff?: string | null;
  };
  /**
   * 真实统计结果（P1-5 接线点）。提供时 buildVerdictKernelInput 直接消费，跳过 evidenceToStatisticalResult
   * 的布尔降维——该降维不注入 pValue/adjustedPValue/CI → kernel `significant` 永空 → R5/R6/R7 不触发。
   * 不提供则向后兼容走 evidences.map(evidenceToStatisticalResult)。
   */
  readonly statistics?: readonly StatisticalResult[];
  /**
   * claim 类型（P1-5·激活 kernel R-causal 门 verdict_kernel_v2.ts:344）。'causal' + confoundingGateResult
   * 触发单层 ConfoundingGate 降级（禁双层——与 science_harness 共用 confoundingOutcomeVerdictEffect SSOT）。
   */
  readonly claimType?: ClaimType;
  /** 证据基础（F6 红线·'observational_only' + ConfoundingGate FAIL → F6_CAUSAL_HONESTY reasonCode）。 */
  readonly evidenceBasis?: EvidenceBasis;
  /** ConfoundingGate 裁决（caller pre-compute via adjudicateConfounding·镜像 evidenceSufficiency 模式）。 */
  readonly confoundingGateResult?: ConfoundingGateResult;
}

export interface FecAppendClaimResult {
  readonly callRecord: HashedRecord;
  readonly evidence: EvidenceLogEntry;
  readonly decision: VerdictResult;
  readonly kernelOutput: VerdictKernelOutput;
  readonly verdictNode: VerdictNode;
  /** F8 预登记契约(§2-M2 接线)。contractInput 未提供时为 null。 */
  readonly contract: FalsifiabilityContract | null;
  /** FEC V2 门禁决策（W2-A 接线）。 */
  readonly fecGate: FecGateDecision;
}

export function fecAppendClaim(
  db: Database.Database,
  args: FecAppendClaimArgs,
): FecAppendClaimResult {
  const append = db.transaction((): FecAppendClaimResult => {
    const callRecord = appendRecord(db, args.callRecord, args.callAudit, args.appendOptions);
    const evidence = appendEvidenceLog(db, {
      callRecordSeq: callRecord.seq,
      evidencePayload: args.evidencePayload,
      sourceAnchor: args.sourceAnchor,
    });
    // F8 预登记(反 p-hacking·spec 11):执行检验(verdict kernel)前锁定可证伪契约的 preregistrationHash。
    // §2-M2 修复:接线 registerContract caller(原死代码零调用)。事务内——若后续步骤抛错则连同 contract 一起回滚(原子性)。
    const contract = args.contractInput ? registerContract(db, args.contractInput) : null;

    const compileResult = compileFec({
      fec: args.fecV2.contract,
      measurementCutoff: args.fecV2.measurementCutoff ?? null,
    });
    const fecGate = enforceFecMandatoryGate(compileResult);
    // W2-A：LLM_FROZEN 是 CI 阻断级（§2.3 禁静默吞 LLM-as-judge）→ throw，事务整体回滚。
    assertFecGate(fecGate);

    falsifiabilityGate({
      hypothesis: args.claim,
      falsificationSpec: args.falsificationSpec,
      thresholdSpec: args.thresholdSpec,
    });

    const integrityFlags =
      compileResult.ok
        ? compileResult.plan.integrityFlags
        : args.fecV2.contract.integrityFlags;
    const kernelOutput = decideFiveValueVerdict(buildVerdictKernelInput(args, integrityFlags));
    let decision: VerdictResult;
    if (!fecGate.allowed) {
      // 缺/坏 FEC 的 claim 禁止走 kernel：否则 V1 布尔计数器可能在「证据全支持」时落 CONFIRMED，
      // 违反 W2-A「缺 FEC 不允许 CONFIRMED」。fail-closed → UNTESTED，理由记入 untestedReason。
      decision = {
        verdict: 'UNTESTED',
        scopeSlipText: null,
        untestedReason: fecGate.reason,
        conflictingEvidenceCount: 0,
        metricValue: kernelOutput.statisticalReport.primaryEffectSize,
      };
    } else {
      decision = verdictResultFromKernelOutput(kernelOutput);
    }
    const verdictNode = recordVerdict(db, {
      evidenceId: evidence.evidenceId,
      parentVerdictId: args.parentVerdictId,
      nodeKind: args.nodeKind,
      verdict: decision.verdict,
      falsificationSpec: args.falsificationSpec,
      thresholdSpec: args.thresholdSpec,
      metricValue: decision.metricValue,
      conflictingEvidenceCount: decision.conflictingEvidenceCount,
      scopeSlipText: decision.scopeSlipText,
      untestedReason: decision.untestedReason,
      sourceAnchor: args.sourceAnchor,
      replayProver: null,
    });

    return {
      callRecord,
      evidence,
      decision,
      kernelOutput,
      verdictNode,
      contract,
      fecGate,
    };
  });

  return append();
}

function buildVerdictKernelInput(
  args: FecAppendClaimArgs,
  integrityFlags: readonly string[],
): VerdictKernelInput {
  const statistics =
    args.statistics !== undefined
      ? args.statistics
      : args.evidences.map((evidence, index) => evidenceToStatisticalResult(evidence, index, args));
  return {
    fec: args.fecV2.contract,
    datasetBindings: args.evidences.map(evidenceToDatasetBinding),
    statistics,
    protocolDeviations: [],
    antiTheaterFindings: [],
    evidenceSufficiency: summarizeEvidenceSufficiency(args, statistics),
    contradictionSet: [],
    integrityFlags,
    ...(args.claimType !== undefined ? { claimType: args.claimType } : {}),
    ...(args.evidenceBasis !== undefined ? { evidenceBasis: args.evidenceBasis } : {}),
    ...(args.confoundingGateResult !== undefined ? { confoundingGateResult: args.confoundingGateResult } : {}),
  };
}

function evidenceToDatasetBinding(evidence: EvidenceRecord, index: number): DatasetBindingSpec {
  validateEvidenceRecord(evidence);
  return {
    datasetId: `legacy-evidence-${index + 1}`,
    contentHash: evidence.sourceAnchor.rawResponseHash,
    sourceAnchor: {
      resolved:
        evidence.sourceAnchor.rawResponseHash.trim().length > 0 &&
        evidence.sourceAnchor.gitCommitSha.trim().length > 0,
    },
    scopeCoverage: {
      dimension: 'claim_scope',
      value: evidence.claim,
      relation: evidence.scopeNarrowerThanClaim ? 'partial' : 'within',
    },
  };
}

function evidenceToStatisticalResult(
  evidence: EvidenceRecord,
  index: number,
  args: FecAppendClaimArgs,
): StatisticalResult {
  validateEvidenceRecord(evidence);
  const testId = args.fecV2.contract.metric.metricKey;
  if (evidence.metricValue === undefined) {
    return {
      testId: `${testId}:${index + 1}`,
      status: 'skipped',
      effectDirection: evidenceDirectionFromFlags(evidence),
      assumptionDiagnostics: [],
    };
  }

  return {
    testId,
    status: 'ran',
    effectDirection: evidenceDirectionFromMetric(evidence.metricValue, args.thresholdSpec),
    effectSizeObserved: evidence.metricValue,
    assumptionDiagnostics: [],
  };
}

function summarizeEvidenceSufficiency(
  args: FecAppendClaimArgs,
  statistics: readonly StatisticalResult[],
): EvidenceSufficiencyReport {
  if (args.evidences.length === 0 || statistics.every((stat) => stat.status === 'skipped')) {
    return { status: 'insufficient', powerStatus: 'unknown' };
  }
  return {
    status: 'sufficient',
    powerStatus: args.fecV2.contract.powerPlan === undefined ? 'unknown' : 'adequate',
  };
}

function verdictResultFromKernelOutput(output: VerdictKernelOutput): VerdictResult {
  return {
    verdict: output.verdict,
    scopeSlipText: output.scopeReport.scopeSlipText,
    untestedReason:
      output.verdict === 'UNTESTED'
        ? output.untestedReason ?? output.reasonCodes.join(', ')
        : null,
    conflictingEvidenceCount: output.statisticalReport.conflicting ? 1 : 0,
    metricValue: output.statisticalReport.primaryEffectSize,
  };
}

function evidenceDirectionFromMetric(
  metricValue: number,
  thresholdSpec: ThresholdSpec,
): StatisticalResult['effectDirection'] {
  const evaluation = evaluateThreshold(metricValue, thresholdSpec);
  return evaluation.supportsClaim ? 'supports' : 'refutes';
}

function evidenceDirectionFromFlags(evidence: EvidenceRecord): StatisticalResult['effectDirection'] {
  if (evidence.supportsClaim && !evidence.refutesClaim) {
    return 'supports';
  }
  if (evidence.refutesClaim && !evidence.supportsClaim) {
    return 'refutes';
  }
  return 'neutral';
}

function validateEvidenceRecord(evidence: EvidenceRecord): void {
  if (evidence.claim.trim().length === 0) {
    throw new Error('fecAppendClaim: evidence claim must be non-empty');
  }
  if (evidence.metricValue !== undefined && !Number.isFinite(evidence.metricValue)) {
    throw new Error(`fecAppendClaim: metricValue must be finite for evidence "${evidence.claim}"`);
  }
  if (evidence.metricValue === undefined && evidence.supportsClaim === evidence.refutesClaim) {
    throw new Error(
      `fecAppendClaim: evidence without metricValue must set exactly one of supportsClaim/refutesClaim for "${evidence.claim}"`,
    );
  }
}
