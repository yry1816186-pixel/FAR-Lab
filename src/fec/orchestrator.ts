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
  makeVerdict,
  recordVerdict,
  registerContract,
} from '../falsifiability/index.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  FalsifiabilityContract,
  RegisterContractInput,
  ThresholdSpec,
  VerdictNode,
  VerdictNodeKind,
  VerdictResult,
} from '../falsifiability/index.ts';

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
   * F8 预登记契约输入(可选·spec 11 反 p-hacking)。提供时在 makeVerdict 前 registerContract
   * 锁定 preregistrationHash。§2-M2 修复:接线原死代码 registerContract caller。
   * 不提供则跳过(向后兼容,result.contract=null)。
   */
  readonly contractInput?: RegisterContractInput;
}

export interface FecAppendClaimResult {
  readonly callRecord: HashedRecord;
  readonly evidence: EvidenceLogEntry;
  readonly decision: VerdictResult;
  readonly verdictNode: VerdictNode;
  /** F8 预登记契约(§2-M2 接线)。contractInput 未提供时为 null。 */
  readonly contract: FalsifiabilityContract | null;
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
    // F8 预登记(反 p-hacking·spec 11):执行检验(makeVerdict)前锁定可证伪契约的 preregistrationHash。
    // §2-M2 修复:接线 registerContract caller(原死代码零调用)。事务内——若后续步骤抛错则连同 contract 一起回滚(原子性)。
    const contract = args.contractInput ? registerContract(db, args.contractInput) : null;
    const decision = makeVerdict({
      claim: args.claim,
      evidences: args.evidences,
      falsificationSpec: args.falsificationSpec,
      thresholdSpec: args.thresholdSpec,
    });
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
      verdictNode,
      contract,
    };
  });

  return append();
}
