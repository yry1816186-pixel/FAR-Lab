/**
 * ProofEnvelope V2 类型层 —— 完整证据嵌入的封存信封（信任根对外接口）。
 *
 * 与 V1（src/proof_envelope/types.ts ProofEnvelope）的关系：
 *   - V1 是 self-check 简化版（falsificationSpec/sourceAnchor/reproHash 桥接锚定，9 rules）。
 *   - V2 补全完整证据嵌入（fecSnapshot/protocolFreeze/datasetBindings/workflowBindings/
 *     experimentRuns/measurementResults/statisticalResults/verdictTrace/antiTheaterReport/ledgerRoot）。
 *   - V1 不删除（功能保留·零容忍 #5），V2 是新增独立路径（proof_envelopes_v2 表共存）。
 *
 * 字段纪律（APPENDIX_C §2.2 + §3）：
 *   - verdict-critical（VC）字段全 required + JSON 稳定（string/number/boolean/null/array/object），
 *     无 undefined（§4.3：TS undefined/null 序列化前须归一为 null；本文件 VC 字段全 required 规避）。
 *   - 非 VC 字段（envelopeId/createdAt/signatures/humanSummary）不进 proofHash。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。全 readonly。模型中立。
 */

import type { NetworkPolicy, Verdict } from '../../schema/enums.ts';
import type {
  FecContractV2,
  ProtocolFreeze,
  ScopeCoverage,
} from '../../fec/fec_contract.ts';
import type { ClaimType } from '../../confounding_gate/types.ts';
import type { VerdictKernelOutput } from '../../falsifiability/verdict_kernel_v2.ts';
// 反剧场类型统一（D1）：AntiTheaterReport 权威定义在 src/anti_theater/types.ts（APPENDIX_A §7）。
// 本文件 import 供 ProofEnvelopeV2.antiTheaterReport 字段注解用；re-export 见下方原 anti-theater 类型位置。
import type { AntiTheaterReport } from '../../anti_theater/types.ts';

/** schema 版本（决定 verifier 路径·V2 固定字面量）。 */
export const PROOF_ENVELOPE_V2_SCHEMA = 'far.proof_envelope.v2' as const;
export type ProofEnvelopeV2SchemaVersion = typeof PROOF_ENVELOPE_V2_SCHEMA;

/** CheckOutcome（与 V1 types.ts 一致·9+1 rules 共用）。 */
export type CheckOutcome = 'PASS' | 'WARN' | 'FAIL' | 'SKIP';

/** Validator rule id（10 条·RULE-PE-001..010）。 */
export const PROOF_VALIDATOR_RULES_V2 = [
  'RULE-PE-001',
  'RULE-PE-002',
  'RULE-PE-003',
  'RULE-PE-004',
  'RULE-PE-005',
  'RULE-PE-006',
  'RULE-PE-007',
  'RULE-PE-008',
  'RULE-PE-009',
  'RULE-PE-010',
] as const;
export type ProofValidatorRuleV2 = (typeof PROOF_VALIDATOR_RULES_V2)[number];

// ===== 子类型（§2.1 完整证据嵌入·APPENDIX_A §8）=====

/**
 * [VC] claim 快照（naturalLanguage 进 proofHash 前 normalizeWhitespace）。
 *
 * claimType（任务 #12 · T-029 · 评委08 F-8-003）：
 *   原仅存在 kernel 输入层（VerdictKernelInput.claimType），caller 可对同一 claim 传不同 claimType
 *   改变 R-causal 门裁决，而 ClaimEnvelope hash 不变——第三方独立复算时若 claimType 不同会得不同
 *   裁决却 hash 一致，破坏「verification not trust」。现 claimType 作为 [VC] 字段进 ClaimEnvelope →
 *   进 proofHash，篡改 claimType → proofHash 失配 → PROOF_HASH_MISMATCH。
 *
 *   类型复用 ClaimType（confounding_gate/types.ts 权威 3 值：existence/quantitative/causal）——
 *   覆盖 V1 三 claimType 全交付（claim_fixtures.ts V1_CLAIM_FIXTURE_ROADMAP），不平行新建枚举（单一真相源）。
 */
export interface ClaimEnvelope {
  readonly id: string;
  readonly naturalLanguage: string;
  readonly domain: string;
  readonly scope: string;
  /** [VC] claim 类型（R-causal 门消费·任务 #12·T-029）。 */
  readonly claimType: ClaimType;
}

/** [VC] 数据集绑定（§3.1·含 contentHash/schemaHash/statsFingerprint/scopeCoverage）。 */
export interface DatasetBindingV2 {
  readonly datasetId: string;
  readonly contentHash: string;
  readonly schemaHash: string;
  readonly statsFingerprint: string;
  readonly scopeCoverage: readonly ScopeCoverage[];
  readonly sourceAnchor: { readonly resolved: boolean; readonly resolverRef: string };
}

/** [VC] 工作流绑定（§3.1·含 workflowHash/containerDigest/environmentHash/commandHash/seedPolicy/networkPolicy）。 */
export interface WorkflowBindingV2 {
  readonly workflowId: string;
  readonly workflowHash: string;
  readonly containerDigest: string;
  readonly environmentHash: string;
  readonly commandHash: string;
  readonly seedPolicy: { readonly seed: number; readonly locked: boolean };
  readonly networkPolicy: NetworkPolicy;
}

/** [VC] 实验运行绑定（§3.1·含 runId/inputHashes/outputHashes/logHashes/exitCode/deviations）。 */
export interface ExperimentRunBinding {
  readonly runId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly actor: string;
  readonly inputHashes: readonly string[];
  readonly outputHashes: readonly string[];
  readonly logHashes: readonly string[];
  readonly exitCode: number;
  readonly deviations: readonly string[];
}

/** [VC] 测量结果（§3.1·含 metricValue/rawArtifactHashes/runId/stdout/stderr hashes）。 */
export interface MeasurementResultV2 {
  readonly metricKey: string;
  readonly metricValue: number;
  readonly rawArtifactHashes: readonly string[];
  readonly runId: string;
  readonly runEnvironment: string;
  readonly stdoutHash: string;
  readonly stderrHash: string;
}

/** [VC] 统计结果证据快照（§3.1·effectSize/pValue/confidenceInterval/power/correction/assumptions）。 */
export interface StatisticalResultV2 {
  readonly testId: string;
  readonly effectSizeObserved: number;
  readonly pValue: number;
  readonly adjustedPValue: number;
  readonly confidenceInterval: readonly [number, number];
  readonly power: number;
  readonly multipleTestingCorrection: string;
  readonly assumptions: readonly string[];
}

// ===== 反剧场类型（D1 统一·APPENDIX_A §7 权威存储类型）=====
// 历史占位简化版（{findings, overallStatus}）已删除；权威定义在 src/anti_theater/types.ts。
// runAntiTheaterLint（APPENDIX_E §3）产出本类型，进 ProofEnvelopeV2.antiTheaterReport。
// re-export 供 v2/ 消费方（validator/diff/fixtures）单点引用，避免类型分裂（零容忍 #1）。
export type { AntiTheaterReport, AntiTheaterFinding } from '../../anti_theater/types.ts';

/**
 * [VC] 裁决追踪（VerdictKernelOutput 全文 + kernel metadata）。
 * metadata（kernelVersion/rulePriorityTableHash/proofHashInputs）锁定规则优先级表 + 声明依赖输入。
 */
export interface VerdictTraceEnvelope extends VerdictKernelOutput {
  /** 裁决内核版本字符串（锁定 R0-R9 优先级表·§3.1）。 */
  readonly kernelVersion: string;
  /** 规则优先级表的 hash（防"偷偷改优先级"·§3.1）。 */
  readonly rulePriorityTableHash: string;
  /** 本裁决实际依赖的输入字段 hash 列表（数组保序·§3.1）。 */
  readonly proofHashInputs: readonly string[];
}

/** [META] 可选外部签名块（对 proofHash 签名·不进 proofHash·§2.3）。 */
export interface SignatureBlock {
  readonly signerId: string;
  readonly algorithm: string;
  readonly publicKeyFingerprint: string;
  readonly signature: string;
  readonly signedAt: string;
}

// ===== Diff report（§3.4 verdict-critical 字段 mismatch code·12 + PROOF_HASH_MISMATCH 顶层）=====

/**
 * Diff report 失败代码（§3.4 表 12 行 + GV-10 顶层 PROOF_HASH_MISMATCH）。
 * 任何 verifier diff 必须落到其中一个 code。
 */
export const DIFF_REPORT_CODES = [
  // 顶层 proofHash 不匹配（GV-10·§8）
  'PROOF_HASH_MISMATCH',
  // §3.4 字段级（12 行）
  'CLAIM_HASH_MISMATCH',
  'FEC_HASH_MISMATCH',
  'PROTOCOL_FREEZE_MISMATCH',
  'DATASET_HASH_MISMATCH',
  'WORKFLOW_HASH_MISMATCH',
  'RUN_HASH_MISMATCH',
  'MEASUREMENT_HASH_MISMATCH',
  'STATISTICAL_RESULT_MISMATCH',
  'VERDICT_TRACE_MISMATCH',
  'ANTI_THEATER_FAIL',
  'LEDGER_ROOT_MISMATCH',
  'UNSUPPORTED_SCHEMA_VERSION',
] as const;
export type DiffReportCode = (typeof DIFF_REPORT_CODES)[number];

export interface DiffReportEntry {
  readonly code: DiffReportCode;
  readonly field: string;
  readonly expected: string;
  readonly actual: string;
  readonly detail: string;
}

// ===== ProofEnvelopeV2 顶层（§2.1·16 字段）=====

/** Sealed ProofEnvelope V2（immutable after sealing·append-only）。 */
export interface ProofEnvelopeV2 {
  /** [VC] schema 版本（固定 "far.proof_envelope.v2"）。 */
  readonly schemaVersion: ProofEnvelopeV2SchemaVersion;
  /** [META] envelope 全局唯一 id（ULID）·进索引不进 proofHash。 */
  readonly envelopeId: string;
  /** [META] 封存时间（ISO-8601）·sealed 后 append-only·非裁决字段。 */
  readonly createdAt: string;

  /** [VC] 关联 claim 全文快照。 */
  readonly claim: ClaimEnvelope;
  /** [VC] FEC 内容 hash（与 computeFecHash(fecSnapshot) 互验）。 */
  readonly fecHash: string;
  /** [VC] FEC 全文快照。 */
  readonly fecSnapshot: FecContractV2;
  /** [VC] 协议冻结快照。 */
  readonly protocolFreeze: ProtocolFreeze;
  /** [VC] 数据集绑定列表（数组保序）。 */
  readonly datasetBindings: readonly DatasetBindingV2[];
  /** [VC] 工作流绑定列表（数组保序）。 */
  readonly workflowBindings: readonly WorkflowBindingV2[];
  /** [VC] 实验运行绑定列表（数组保序）。 */
  readonly experimentRuns: readonly ExperimentRunBinding[];
  /** [VC] 测量结果列表（数组保序）。 */
  readonly measurementResults: readonly MeasurementResultV2[];
  /** [VC] 统计结果列表（数组保序）。 */
  readonly statisticalResults: readonly StatisticalResultV2[];
  /** [VC] 裁决追踪（VerdictKernelOutput 全文 + kernel metadata）。 */
  readonly verdictTrace: VerdictTraceEnvelope;
  /** [VC] 反剧场报告。 */
  readonly antiTheaterReport: AntiTheaterReport;
  /** [VC] ledger root（call_records head hash 或 Merkle root）。 */
  readonly ledgerRoot: string;

  /**
   * [VC] proofHash = sha256(canonical_json(本对象全部 VC 字段 - proofHash 自身))。
   * 篡改任一 VC 字段 → proofHash 不匹配 → PROOF_HASH_MISMATCH（§8）。
   */
  readonly proofHash: string;

  /** [META] 可选签名块列表·签名对 proofHash 的结果·不进 proofHash（循环依赖）。 */
  readonly signatures?: readonly SignatureBlock[];
}

/** Seal input（omit proofHash·sealer 计算）。 */
export type SealProofEnvelopeV2Input = Omit<ProofEnvelopeV2, 'proofHash'>;

/** 单条 validator check 结果（V2·10 rules）。 */
export interface ProofCheckResultV2 {
  readonly ruleId: ProofValidatorRuleV2;
  readonly ruleName: string;
  readonly outcome: CheckOutcome;
  readonly detail: string;
}

/** Verdict 5 值（与 schema/enums Verdict 一致·envelope 层复用）。 */
export type { Verdict };
