/**
 * anti_theater types —— 反剧场测试工具类型层（权威存储类型 + lint 输入 + 依赖类型）。
 *
 * 类型统一裁决（D1·消除 3 套分裂）：
 *   - 本文件是 AntiTheaterFinding/Report/VerdictConstraint 的**唯一运行时定义点**（APPENDIX_A §7 落地）。
 *   - src/proof_envelope/v2/types.ts 的占位简化版（{findings, overallStatus}）已删除，改 import 本文件。
 *   - src/falsifiability/verdict_kernel_v2.ts 的 kernel 输入型重命名为 KernelAntiTheaterFinding（见 adapters/kernel_adapter.ts）。
 *
 * 双轴纪律（D2）：
 *   - 存储轴 outcome: ProofCheckOutcome（PASS/FAIL/WARN/SKIP）—— 进 ProofEnvelope/proofHash。
 *   - 派生展示轴 severity: AntiTheaterSeverity（INFO/WARN/FAIL/BLOCK）—— 不进存储，由 outcome+blockSeal 派生。
 *
 * 模型中立（F3/C1）：无 qwen/dashscope 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。全 readonly 字段。
 */

import type { ProofCheckOutcome } from '../schema/enums.ts';
import type { FecContractV2 } from '../fec/fec_contract.ts';
import type { VerdictKernelOutput } from '../falsifiability/verdict_kernel_v2.ts';

// ===== 派生展示轴（D2·不进存储）=====

/**
 * 反剧场发现严重性（生产视角·Honesty Wall 展示·不进 proofHash）。
 * INFO=无影响 / WARN=展示不降级 / FAIL=按 forcedVerdict 降级 / BLOCK=拒绝 seal。
 */
export type AntiTheaterSeverity = 'INFO' | 'WARN' | 'FAIL' | 'BLOCK';

// ===== 权威存储类型（APPENDIX_A §7 落地·本文件为唯一运行时定义点）=====

/**
 * 反剧场攻击类别（APPENDIX_A §7 attackKind enum · 21 值）。
 * kebab-case 字面量与 APPENDIX_E §2 attackId（AT-* 前缀）一一对应（见 ATTACK_ID_TO_KIND）。
 * 消费方（verdict kernel / proofHash）一律存本 enum 字面量，不得存 attackId 字符串。
 *
 * 注：原 20 值（03 §8 + APPENDIX_E §2 扩展），2026-07-24 T-003 修复新增
 * `execution-provenance-unbound`（第 21 项）——填补「fixture 冒充真实计算结果」检测空白。
 */
export type AntiTheaterAttackKind =
  // —— 03 §8 最低强制子集（10 项核心攻击）——
  | 'label-only-evidence'
  | 'llm-reviewer-override'
  | 'post-hoc-threshold'
  | 'dataset-drift'
  | 'scope-laundering'
  | 'missing-raw-artifact'
  | 'metric-swapping'
  | 'seed-cherry-picking'
  | 'workflow-digest-mismatch'
  | 'natural-language-verdict-mismatch'
  // —— APPENDIX_E §2 扩展子集（10 项·使全集达 20）——
  | 'fake-pass-forgery'
  | 'dataset-hash-forgery'
  | 'p-hacking-alpha-inflation'
  | 'p-hacking-multiple-testing-uncorrected'
  | 'p-hacking-p-curve-skew'
  | 'harking-revision-after-result'
  | 'stopping-rule-violation'
  | 'optional-stopping-no-spending'
  | 'dependency-float-drift'
  | 'benchmark-overfit'
  | 'fake-degraded-scope'
  // —— T-003 修复新增（2026-07-24·第 21 项）——
  | 'execution-provenance-unbound';

/** APPENDIX_E §2 attackId（人类可读 AT-* 前缀）→ APPENDIX_A §7 attackKind（kebab-case 存储字段）映射。 */
export const ATTACK_ID_TO_KIND: Readonly<Record<string, AntiTheaterAttackKind>> = {
  'AT-LABEL-ONLY': 'label-only-evidence',
  'AT-JUDGE-OVERRIDE': 'llm-reviewer-override',
  'AT-POSTHOC-THRESHOLD': 'post-hoc-threshold',
  'AT-DATA-DRIFT': 'dataset-drift',
  'AT-SCOPE-LAUNDER': 'scope-laundering',
  'AT-MISSING-RAW': 'missing-raw-artifact',
  'AT-METRIC-SWAP': 'metric-swapping',
  'AT-SEED-CHERRY': 'seed-cherry-picking',
  'AT-WORKFLOW-DIGEST': 'workflow-digest-mismatch',
  'AT-REPORT-MISMATCH': 'natural-language-verdict-mismatch',
  'AT-FAKE-PASS': 'fake-pass-forgery',
  'AT-DATA-HASH-FAKE': 'dataset-hash-forgery',
  'AT-PHACK-ALPHA': 'p-hacking-alpha-inflation',
  'AT-PHACK-CORRECTION': 'p-hacking-multiple-testing-uncorrected',
  'AT-PHACK-PCURVE': 'p-hacking-p-curve-skew',
  'AT-HARK': 'harking-revision-after-result',
  'AT-STOPPING-RULE': 'stopping-rule-violation',
  'AT-OPTIONAL-STOPPING': 'optional-stopping-no-spending',
  'AT-DEP-FLOAT-DRIFT': 'dependency-float-drift',
  'AT-OVERFIT': 'benchmark-overfit',
  'AT-FAKE-DEGRADED': 'fake-degraded-scope',
  // T-003 修复新增（2026-07-24·填补 fixture 冒充检测空白）
  'AT-PROVENANCE-UNBOUND': 'execution-provenance-unbound',
};

/**
 * attackKind → attackId 反向查找（Honesty Wall 展示用）。
 * 遍历 ATTACK_ID_TO_KIND（覆盖 21 值全集），未命中即不可达——kind 是闭合 enum。
 */
export function attackKindToId(kind: AntiTheaterAttackKind): string {
  for (const [id, k] of Object.entries(ATTACK_ID_TO_KIND)) {
    if (k === kind) {
      return id;
    }
  }
  // unreachable：kind 是 20 值闭合 enum，ATTACK_ID_TO_KIND 覆盖全集
  throw new Error(`attackKindToId: unmapped attackKind '${kind}' (invariant violated)`);
}

/**
 * 单条反剧场发现（APPENDIX_A §7 权威存储类型）。
 * hasFail=true → verdict kernel 倾向 INCONCLUSIVE 或 UNTESTED。
 */
export interface AntiTheaterFinding {
  /** [VC] 检查 id（稳定唯一·如 'AT-POSTHOC-THRESHOLD'；多 finding 时带后缀如 '-CONTENT_HASH'）。 */
  readonly findingId: string;
  /** [VC] 攻击类别（20 值 enum·与 attackId 一一对应）。 */
  readonly attackKind: AntiTheaterAttackKind;
  /** [VC] 检查结果（存储轴·PASS/FAIL/WARN/SKIP）。 */
  readonly outcome: ProofCheckOutcome;
  /** [VC] 该发现是否阻断（outcome=FAIL 时 true → kernel inconclusiveOrUntested 分支）。 */
  readonly hasFail: boolean;
  /** [VC] 指向的 evidence record（call_records.seq 或 evidence_log 记录 id）。 */
  readonly evidenceRef: string;
  /** [DOC] 机器可读 + 人类可读说明。 */
  readonly message: string;
}

/**
 * 取严后的 verdict 约束（APPENDIX_A §7 + APPENDIX_E §1 + 03 §6.1/§8.2）。
 *
 * 支持度降级模型（D17·constraint.ts 实现）：anti-theater 只把 verdict 从高支持度（CONFIRMED）降到低支持度，
 * 不升级也不洗白 kernel 已否定的结论。forcedVerdict 取支持度最低（最严）的候选。
 *
 * D16（REFUTED forced·揭示隐藏反证）：03 §8.2 称 anti-theater 不"主动产"REFUTED，但 REFUTATION_HIDDEN_BY_SCOPE
 * finding 揭示的是已被 scopeReport.hasSameScopeRefutation 证明的同 scope 反证（被 DEGRADED_SCOPE 掩盖），
 * 执行 §6.1 原则 2"REFUTED 不得被隐藏"。故 forcedVerdict 含 REFUTED（唯一 REFUTED forced 来源）。
 */
export interface AntiTheaterVerdictConstraint {
  /** 取严后的 verdict 约束（支持度降级·D17）。undefined = 不约束（forced 不如 current 严）。 */
  readonly forcedVerdict?: 'REFUTED' | 'DEGRADED_SCOPE' | 'UNTESTED' | 'INCONCLUSIVE';
  /** true → 拒绝 seal（04 §1）。 */
  readonly blockSeal: boolean;
  /** reasonCode 列表（全部触发 finding 的 reasonCode 去重并集）。 */
  readonly reasonCodes: readonly string[];
}

/**
 * 反剧场检查聚合报告（APPENDIX_A §7 权威存储类型·进入 ProofEnvelopeV2.antiTheaterReport）。
 * 前 5 个字段（findings/hasFail/failCount/warnCount/llmOverrideRejected）为 verdict-critical 核心字段；
 * 后 3 个可选字段为生产视角元数据（APPENDIX_E §1 承载·全部可选）。
 */
export interface AntiTheaterReport {
  /** [VC] 全部反剧场发现。 */
  readonly findings: readonly AntiTheaterFinding[];
  /** [VC] 是否存在任何 fail（= failCount > 0）。 */
  readonly hasFail: boolean;
  /** [VC] fail 数量。 */
  readonly failCount: number;
  /** [VC] warn 数量。 */
  readonly warnCount: number;
  /** [VC] 是否所有 LLM reviewer override 均被拒绝（structured verdict wins）。 */
  readonly llmOverrideRejected: boolean;
  /** [META] 反剧场评分 [0,100]·越低越危险（APPENDIX_E §4）。 */
  readonly antiTheaterScore?: number;
  /** [META] 是否可 seal CONFIRMED（score<70 或存在 BLOCK finding → false）。 */
  readonly canSealConfirmed?: boolean;
  /** [META] 取严后的 verdict 约束。 */
  readonly verdictConstraint?: AntiTheaterVerdictConstraint;
}

// ===== 生产视角扩展（运行时附在 finding 上供 Honesty Wall 展示·不进存储）=====

/**
 * 反剧场发现扩展（APPENDIX_E §1 AntiTheaterFindingExtension·severity/reasonCode 等派生元数据）。
 * 与 AntiTheaterFinding（存储型）通过 findingId 关联；lint 聚合后存储型入库，扩展供展示。
 */
export interface AntiTheaterFindingExtension {
  /** 关联的 AntiTheaterFinding.findingId。 */
  readonly findingId: string;
  /** APPENDIX_E §2 attackId（AT-* 前缀·人类可读）。 */
  readonly attackId: string;
  /** 派生展示轴严重性（D2·由 outcome + blockSeal 派生）。 */
  readonly severity: AntiTheaterSeverity;
  /** 该 finding 影响的 proofHash 输入字段路径（APPENDIX_E §7.2·标注入受影响 VC 字段）。 */
  readonly affectedProofHashInputs?: readonly string[];
  /** 机器可读原因代码（进入 VerdictKernelOutput.reasonCodes）。 */
  readonly reasonCode?: string;
  /** 修复建议（Honesty Wall 展示）。 */
  readonly remediation?: string;
  /** 是否确定性产出（F3·恒 true·反 LLM-as-judge）。 */
  readonly deterministic: true;
}

/** detector 运行时产出（存储型 finding + 派生扩展·lint 聚合后拆分入库）。 */
export interface DetectorFinding {
  readonly stored: AntiTheaterFinding;
  readonly ext: AntiTheaterFindingExtension;
}

// ===== 4 个新依赖类型（APPENDIX_E §1·字段从 §2 detect_* 伪代码反推）=====

/** 测量痕迹（ExecutionTrace.measurements 元素·detector 消费 rawArtifactHashes/role/splitName）。 */
export interface MeasurementTrace {
  readonly requirementId?: string;
  readonly role: 'primary' | 'secondary' | 'control';
  readonly rawArtifactHashes: readonly string[];
  readonly runId: string;
  /** AT-OVERFIT 消费（'public'/'hidden' split）。 */
  readonly splitName?: string;
  readonly metricKey: string;
  readonly metricValue: number;
  /**
   * T-003 · Evidence provenance binding（2026-07-24 评委逼问第 1 轮 F-2-005 修复）。
   *
   * 可选字段：当 FEC 要求 `requireExecutionProvenance: true` 时，primary measurement 须携带
   * 64-hex sha256（来自 sandbox_runner.stdoutHash/artifactTreeHash），证明 metricValue 是
   * 本次 sandbox 执行产出的（非手工注入 fixture 冒充）。AT-PROVENANCE-UNBOUND detector 消费。
   *
   * 与 rawArtifactHashes 的区别：
   *   - rawArtifactHashes 证明「有原始产物」（产物存在性）；
   *   - executionProvenanceHash 证明「产物是这次执行产出的」（执行-产物绑定·防 fixture 冒充）。
   *
   * 缺省不强制（向后兼容·V1 demo seed fixture 不设置此字段）。
   */
  readonly executionProvenanceHash?: string;
}

/** 实验运行痕迹（ExecutionTrace.runs 元素·AT-HARK 消费 endedAt/AT-STOPPING-RULE 消费 isInterim/earlyStopped）。 */
export interface ExperimentRunTrace {
  readonly runId: string;
  /** ISO-8601 结束时间（AT-HARK max(endedAt) vs hypothesisSealedAt）。 */
  readonly endedAt: string;
  /** 是否 interim look（AT-STOPPING-RULE 消费）。 */
  readonly isInterim: boolean;
  /** 是否提前停止（AT-STOPPING-RULE 消费）。 */
  readonly earlyStopped: boolean;
  /** 随机种子（AT-SEED-CHERRY 消费）。 */
  readonly seed: number;
}

/** 执行痕迹（单一对象·D3 调和 APPENDIX_E §1 数组签名 vs §2 伪代码对象访问的不一致）。 */
export interface ExecutionTrace {
  readonly measurements: readonly MeasurementTrace[];
  readonly runs: readonly ExperimentRunTrace[];
}

/** 零结果记录（AT-FAKE-DEGRADED 消费 enteredProofHash）。 */
export interface NullResultRecord {
  readonly nullResultId: string;
  readonly testId: string;
  readonly reason: 'no_effect' | 'underpowered' | 'measurement_failed' | 'assumption_failed';
  /** 必须 true（AT-FAKE-DEGRADED 检查 declared null result 是否进 proofHash）。 */
  readonly enteredProofHash: boolean;
  readonly linkedVerdictRule: string;
}

/** ProofEnvelope 草稿（AT-REPORT-MISMATCH 消费 humanSummary）。 */
export interface ProofEnvelopeDraft {
  readonly envelopeId: string;
  /** 人类可读摘要（LLM 可生成·不进 proofHash·AT-REPORT-MISMATCH 检查与 verdict 强度一致）。 */
  readonly humanSummary: string;
  readonly nullResults: readonly NullResultRecord[];
}

/** 数据集 freeze 记录（AT-DATA-DRIFT 三层 hash 对账·frozen 端）。 */
export interface DatasetFreezeRecord {
  readonly datasetId: string;
  readonly contentHash: string;
  readonly schemaHash: string;
  readonly statsFingerprint: string;
}

/** 工作流 freeze 记录（AT-WORKFLOW-DIGEST hash 对账·frozen 端）。 */
export interface WorkflowFreezeRecord {
  readonly workflowId: string;
  readonly workflowHash: string;
  readonly containerDigest: string;
  readonly environmentHash: string;
}

/**
 * 预注册记录（FEC freeze 前的快照·detector frozen vs executed 比对的"frozen"端）。
 * 字段从 APPENDIX_E §2 detect_* 伪代码反推。
 */
export interface PreregistrationRecord {
  /** sha256(canonical(threshold, direction, semantics))——AT-POSTHOC-THRESHOLD 消费。 */
  readonly thresholdHash: string;
  /** sha256(canonical(fec.metric))——AT-METRIC-SWAP 消费。 */
  readonly primaryMetricHash: string;
  /** 预注册 alpha——AT-PHACK-ALPHA 精确比较（tol=0）。 */
  readonly alpha: number;
  /** sha256(canonical(fec.seedPolicy))——AT-SEED-CHERRY 消费。 */
  readonly seedPolicyHash: string;
  /** 假设封存时间（ISO-8601·AT-HARK vs max(runs.endedAt)）。 */
  readonly hypothesisSealedAt: string;
  /** lockfile hash（AT-DEP-FLOAT-DRIFT 消费·optional）。 */
  readonly lockfileHash?: string;
  /** numeric tolerance 是否 freeze（AT-DEP-FLOAT-DRIFT 消费）。 */
  readonly toleranceFrozen: boolean;
  /** per-dataset freeze 记录（AT-DATA-DRIFT 消费·optional·W3 MVP 可缺·退化见 detector 注释）。 */
  readonly datasetFreezeRecords?: readonly DatasetFreezeRecord[];
  /** per-workflow freeze 记录（AT-WORKFLOW-DIGEST 消费·optional·W3 MVP 可缺）。 */
  readonly workflowFreezeRecords?: readonly WorkflowFreezeRecord[];
  /** 声明的种子集合（AT-SEED-CHERRY 消费 declaredSeeds ⊆ ran seeds·optional）。 */
  readonly declaredSeeds?: readonly number[];
}

/** RunRegistry 条目（完整 run 清单·防 hidden failed run）。 */
export interface RunRegistryEntry {
  readonly runId: string;
  readonly seed: number;
}

/** 完整 run 清单（AT-SEED-CHERRY 消费 runs.seed）。 */
export interface RunRegistry {
  readonly runs: readonly RunRegistryEntry[];
  readonly declaredNullResults: readonly NullResultRecord[];
}

// ===== EvidenceBinding 联合（anti_theater trace 视角·带 kind discriminant·避免与 V2 types 循环依赖）=====

/** 数据集绑定 trace（AT-DATA-DRIFT/AT-DATA-HASH-FAKE 消费 contentHash/schemaHash/statsFingerprint/chunkHashes）。 */
export interface DatasetBindingTrace {
  readonly kind: 'dataset';
  readonly datasetId: string;
  readonly contentHash: string;
  readonly schemaHash: string;
  readonly statsFingerprint: string;
  /** 数据块 hash 列表（AT-DATA-HASH-FAKE Merkle root 重算·R6 MVP 缺时退化为 contentHash 格式校验）。 */
  readonly chunkHashes?: readonly string[];
}

/** 工作流绑定 trace（AT-WORKFLOW-DIGEST 消费 workflowHash/containerDigest/environmentHash）。 */
export interface WorkflowBindingTrace {
  readonly kind: 'workflow';
  readonly workflowId: string;
  readonly workflowHash: string;
  readonly containerDigest: string;
  readonly environmentHash: string;
}

/** EvidenceBinding 联合（dataset/workflow·detector 用 kind discriminant 分流）。 */
export type EvidenceBinding = DatasetBindingTrace | WorkflowBindingTrace;

// ===== AntiTheaterLintInput（APPENDIX_E §1·runAntiTheaterLint 输入）=====

/** runAntiTheaterLint 输入（APPENDIX_E §1·7 字段·computedBy="deterministic_compiler"）。 */
export interface AntiTheaterLintInput {
  /** FEC 契约（03 §1·detector 消费 threshold/metric/statisticalPlan/seedPolicy/datasetRequirements）。 */
  readonly fec: FecContractV2;
  /** dataset/workflow 绑定联合列表（detector 用 kind 分流）。 */
  readonly bindings: readonly EvidenceBinding[];
  /** 执行痕迹（单一对象·D3·measurements + runs）。 */
  readonly executionTrace: ExecutionTrace;
  /** 先于 anti-theater 的初步 verdict（AT-SCOPE-LAUNDER/AT-FAKE-DEGRADED 消费 scopeReport）。 */
  readonly verdict: VerdictKernelOutput;
  /** ProofEnvelope 草稿（AT-REPORT-MISMATCH 消费 humanSummary）。 */
  readonly envelopeDraft: ProofEnvelopeDraft;
  /** 预注册记录（frozen 端·多 detector 消费）。 */
  readonly preregistrationRecord: PreregistrationRecord;
  /** 完整 run 清单（AT-SEED-CHERRY 防 hidden failed run）。 */
  readonly runRegistry: RunRegistry;
}

// ===== AttackCase（APPENDIX_E §5.1·golden vector 结构）=====

/** golden vector mutation 描述（字段级 mutation·field 是点路径如 'fec.statisticalPlan.alpha'）。 */
export interface AttackMutation {
  readonly field: string;
  readonly from: unknown;
  readonly to: unknown;
  readonly description: string;
}

/**
 * AttackCase（APPENDIX_E §5.1·反剧场攻击测试向量）。
 * base envelope 经 mutation 后送 runAntiTheaterLint，断言 findings/forcedVerdict/reasonCode。
 */
export interface AttackCase {
  readonly attackId: string;
  readonly attackClass: 'mutation' | 'forgery' | 'omission' | 'override';
  readonly baseEnvelopePath: string;
  readonly mutation: AttackMutation;
  readonly expectedVerifierStatus: 'RED' | 'YELLOW';
  readonly expectedVerdict: 'REFUTED' | 'INCONCLUSIVE' | 'DEGRADED_SCOPE' | 'UNTESTED' | 'UNCHANGED_BUT_MISMATCH';
  readonly expectedReasonCode: string;
}
