# 附录 A · 完整 TypeScript 类型目录（项目权威类型源）

> 作用域：本附录是 FAR-Chain / FAR-Lab 全部 verdict-critical 与传输类型的最终权威。任一接口/枚举/字段的命名、取值、可选性以此为准；与 02/03/04 章节冲突时以本附录为准。
>
> 命名约定：字段名采用 `camelCase`；枚举值采用全大写 `SCREAMING_SNAKE_CASE`（来自 SQLite CHECK 约束与 canonicalHash 白名单的字符串字面量）。
>
> verdict-critical 标注图例：
> - `[VC]` = verdict-critical：进入 canonicalHash / proofHash / 裁决决策树输入，篡改可检测且可改变 verdict。
> - `[EV]` = evidence：作为证据向量参与裁决，但其单条不直接产 verdict。
> - `[META]` = 元数据：非裁决字段，可删除而不改变 verdict 与 proofHash（除非显式声明进入 proofHash）。
> - `[DOC]` = 人类可读附属字段：永远不进入裁决，仅在 Trust Receipt / Honesty Wall 展示。
>
> 状态纪律：所有类型标注实现状态（`DESIGN_LOCKED` / `IMPLEMENTED_VERIFIED` / `PARTIAL` / `ROADMAP` 等），与 01 章 §3 一致。本附录只描述类型契约，不手填测试数或文件数。

---

## 0. 权威枚举（先定义，被全附录引用）

### VerdictKind

五值裁决唯一枚举。禁止第六值。与 03 章 §5、67 章 §1、07 章 §2 一致。

```typescript
/**
 * 五值裁决唯一合法取值。
 * 决策树优先级（高 → 低）：DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED。
 * LLM 不得直接产出本字段；必须由 deterministic verdict kernel 经 rule trace 产出。
 */
type VerdictKind =
  | "CONFIRMED"        // 冻结 FEC 下证据满足支持条件，且无更高优先级问题；bounded support，非科学真理
  | "REFUTED"          // 冻结证据契约下存在足够反证
  | "INCONCLUSIVE"     // 证据冲突、功效不足、假设不满足或结果落在不确定区
  | "DEGRADED_SCOPE"   // 证据覆盖范围比 claim 窄，或数据/环境漂移导致只能支持较小范围
  | "UNTESTED";        // 不能执行测试、FEC 不完整、数据缺失、协议未冻结或关键证据不存在
```

状态：`DESIGN_LOCKED`（语义冻结，禁止改枚举；工程升级为 metric-first kernel 的任务见 03 章 §7 与 67 章）。

### ProofCheckOutcome

```typescript
/**
 * 单条确定性检查的结果取值。
 * 与 09 章 §1.1 ProofCheck.outcome 一致；SQLite integrity_events / falsification_audit_events
 * 的 CHECK 约束必须与此逐字相等（T7）。
 * 注意：L7-L2 统计层内部的 'unknown' 判定态不得作为本字段字面量出现，
 * 必须收窄为 SKIP + message="L2 无法确定数值判定（F5 数学红线）"（11 章 §2.2）。
 */
type ProofCheckOutcome =
  | "PASS"
  | "FAIL"
  | "WARN"
  | "SKIP";
```

### EvidenceDirection

```typescript
/**
 * 单条统计/测量结果相对 claim 的方向。
 * 进入 verdict kernel 的 statisticalReport.effectiveDirection 聚合（67 章 §5）。
 */
type EvidenceDirection =
  | "supports"
  | "refutes"
  | "neutral"
  | "not_applicable";
```

### EffectComparator

```typescript
/**
 * FEC 声明的 effect 与 threshold 的比较关系（03 章 FecContract.direction）。
 * 与 FalsificationSpec.thresholdSemantics 语义对齐，但取值集合可能不同：
 * direction 用于 FEC 顶层声明；thresholdSemantics 用于 Falsification DSL 的细化语义。
 */
type EffectComparator =
  | "greater"
  | "less"
  | "equal"
  | "within"
  | "noninferior";
```

### NetworkPolicy

```typescript
/**
 * WorkflowBinding 的网络策略。Production 默认 OFF 或 allowlist（02 章 §6.6）。
 * 'unrestricted-with-warning' 不得被包装成 OFF（反 theater：标 OFF 但实际联网 = verifier RED）。
 */
type NetworkPolicy =
  | "off"
  | "allowlist"
  | "unrestricted-with-warning";
```

---

## 1. Claim 与 FEC 顶层

### Claim

03 章 §4、04 章 §2 引用。声明层最小对象，进入 canonicalHash 与 ProofEnvelope.claim。

```typescript
/**
 * 一个科学声明。FAR-Chain 的入口对象。
 * 所有 verdict 最终回答的是"该 claim 在冻结 FEC 下是否被证据支持"。
 */
interface Claim {
  /** [VC] 全局唯一声明 id，如 "C-ASTRO-0001"。进入 canonicalHash 与 proofHash。 */
  id: string;

  /** [DOC] 人类可读自然语言声明。不直接产 verdict；其 normalized 形式进入 proofHash。 */
  naturalLanguage: string;

  /**
   * [VC] 声明所属领域。当前固定 6 值（08 章 §2 SciIRDomain）：
   * astronomy | biology | medicine | social_science | cs | physics。
   */
  domain:
    | "astronomy"
    | "biology"
    | "medicine"
    | "social_science"
    | "cs"
    | "physics";

  /** [VC] scope 顶层引用。FEC 会进一步细化。 */
  scope: ScopeSpec;

  /** [META] 作者/责任方引用。可用于 Trust Receipt 展示，不影响 verdict。 */
  author: ActorRef;

  /** [VC] 声明创建时间（ISO-8601）。用于 HARKing 检查（不可晚于实验结果时间）。 */
  createdAt: string;

  /** [META] 可选的形式化表达（Falsification DSL 产出）。可为空。 */
  formalExpression?: string;

  /** [META] 可选的因果模型。claimType=causal 时 FEC 校验强制非空（08 章 §1.1）。 */
  causalModel?: CausalModel;
}
```

状态：`DESIGN_LOCKED`。

### FecContract

Falsification Evidence Contract。03 章 §1、67 章 §2 的核心类型。一个 claim 对应一份冻结的 FEC。

```typescript
/**
 * 可证伪证据契约。冻结后不可静默修改；任何 post-hoc 修改须落为 ProtocolDeviation
 * 并可能触发 harking_risk / p_hacking_risk（08 章 §7）。
 *
 * FEC 必须满足：可测、可反驳、可冻结、可绑定证据、可由第三方重算、缺证据时能诚实降级。
 */
interface FecContract {
  /** [VC] FEC 全局唯一 id，如 "FEC-ASTRO-0001"。 */
  fecId: string;

  /** [VC] 回指 Claim.id。 */
  claimId: string;

  /** [VC] 可测蕴含文本（POPPER 风格，至少 1 条）。编译失败 → FEC_NOT_COMPILABLE → UNTESTED。 */
  measurableImplication: string;

  /** [VC] scope 声明。FEC.compile 检查 scope 是否有界；无界 → SCOPE_UNBOUNDED。 */
  scope: ScopeSpec;

  /** [VC] 必需证据清单。缺失任一 → EVIDENCE_MISSING → UNTESTED（03 章 §2）。 */
  requiredEvidence: EvidenceRequirement[];

  /** [VC] 数据集要求清单。 */
  datasetRequirements: DatasetRequirement[];

  /** [VC] 工作流要求清单。 */
  workflowRequirements: WorkflowRequirement[];

  /** [VC] primary metric 定义。无 primary metric → METRIC_MISSING。 */
  metric: MetricSpec;

  /** [VC] threshold 定义。无 threshold/direction → THRESHOLD_MISSING。 */
  threshold: ThresholdSpec;

  /** [VC] effect 与 threshold 的比较方向。 */
  direction: EffectComparator;

  /** [VC] 统计计划。无统计计划 → STAT_PLAN_MISSING。 */
  statisticalPlan: StatisticalPlan;

  /** [VC] 功效/灵敏度声明。可选但强烈建议；缺失可能触发 INCONCLUSIVE（功效不足）。 */
  powerPlan?: PowerPlan;

  /** [VC] 多重检验计划。implication > 1 时强制非空且 correction ≠ none。 */
  multipleTestingPlan?: MultipleTestingPlan;

  /** [VC] 随机种子策略。涉及随机时 seed=42 须与 alpha/correction 三重同时开关（11 章 §4.1）。 */
  seedPolicy: SeedPolicy;

  /** [VC] 协议偏离处置策略。 */
  deviationPolicy: DeviationPolicy;

  /** [VC] 协议冻结快照。freeze 后字段不可静默修改。 */
  freeze: ProtocolFreeze;
}
```

状态：`DESIGN_LOCKED`。

---

## 2. FEC 子类型

### ScopeSpec

```typescript
/**
 * 声明/证据的适用范围声明。scope laundering（用窄证据支持宽 claim）→ DEGRADED_SCOPE（03 章 §6）。
 */
interface ScopeSpec {
  /** [VC] 人口/样本/对象描述，如 "TESS sector 14, TIC 123456789"。 */
  population: string;

  /** [VC] 时间窗口，如 "2019-07-18 to 2019-08-15"。可为 open。 */
  timeWindow: string;

  /** [VC] 领域限定。可与 Claim.domain 不同（claim=medicine, scope=adults-with-T2D）。 */
  domainConstraint: string;

  /** [META] 自由文本边界条件（如 "排除已知食双"）。 */
  boundaryConditions?: string[];

  /** [VC] 已知 scope 缩窄描述。非空 → verdict kernel 须评估是否 DEGRADED_SCOPE。 */
  knownNarrowing?: ScopeCoverage[];
}
```

状态：`DESIGN_LOCKED`。

### ScopeCoverage

```typescript
/**
 * 一份证据实际覆盖的 scope 切片。用于 DatasetBinding.scopeCoverage 与 ScopeReport。
 */
interface ScopeCoverage {
  /** [VC] 切片维度名，如 "age_group"、"sector"、"instrument"。 */
  dimension: string;

  /** [VC] 该维度上的覆盖取值或区间，如 "adults 18-65"、"sector 14"。 */
  value: string;

  /**
   * [VC] 该切片相对 claim scope 的关系：
   * 'within'（claim ⊇ 切片，可用）/ 'partial'（部分重叠）/ 'outside'（不适用）。
   */
  relation: "within" | "partial" | "outside";
}
```

### MetricSpec

```typescript
/**
 * primary metric 定义。事后换 metric = metric swapping → UNTESTED 或 anti-theater fail（03 章 §8）。
 */
interface MetricSpec {
  /** [VC] metric 的稳定 key，如 "bls_power"、"lomb_scargle_peak_power"。禁描述性短语。 */
  metricKey: string;

  /** [DOC] metric 的人类可读定义。不进裁决。 */
  description: string;

  /** [VC] metric 单位，如 "sigma"、"dimensionless"。参与 threshold 比较语义。 */
  unit: string;

  /** [VC] 计算 metric 所需的 dataset/workflow 引用。解析失败 → METRIC_MISSING。 */
  computationRef: string;

  /** [VC] metric 是否为 deterministic 计算（vs 随机/统计）。影响 R9 skip 判定。 */
  isDeterministic: boolean;
}
```

### ThresholdSpec

```typescript
/**
 * 证伪/支持阈值。post-hoc 改阈值 → p_hacking_risk（11 章 §4.1）。
 */
interface ThresholdSpec {
  /** [VC] 阈值数值。 */
  value: number;

  /** [VC] 阈值单位（须与 MetricSpec.unit 一致；不一致 → THRESHOLD_MISSING）。 */
  unit: string;

  /**
   * [VC] 阈值语义：observed metric 与 threshold.value 的比较关系。
   * 对齐 FalsificationSpec.thresholdSemantics（08 章 §1.2）。
   */
  thresholdSemantics: "lt" | "gt" | "eq" | "ne" | "range";

  /** [VC] range 语义时的上界（thresholdSemantics='range' 时必填）。 */
  rangeUpper?: number;

  /** [VC] 该 threshold 是否为预注册（preregistered）。false → harking_risk。 */
  preregistered: boolean;
}
```

### StatisticalPlan

```typescript
/**
 * 统计计划。必须在 evidence run 前冻结（03 章 §4）。
 * 最小字段集合（任一缺失 → STAT_PLAN_MISSING）。
 */
interface StatisticalPlan {
  /** [VC] primary metric key（与 MetricSpec.metricKey 一致）。 */
  primaryMetric: string;

  /** [VC] H0 原假设。 */
  nullHypothesis: string;

  /** [VC] H1 备择假设。 */
  alternativeHypothesis: string;

  /** [VC] 显著性水平 α。预注册后不可改。 */
  alpha: number;

  /** [VC] effect 方向。 */
  effectDirection: "greater" | "less" | "two_sided";

  /** [VC] 置信区间方法，如 "wald"、"bootstrap-10k"、"profile-likelihood"。 */
  confidenceIntervalMethod: string;

  /** [VC] 多重检验校正方法。implication > 1 时禁 none。 */
  multipleTestingCorrection: "none" | "bonferroni" | "holm" | "bh_fdr";

  /** [VC] 缺失数据处理策略。 */
  missingDataPolicy: string;

  /** [VC] 离群值处理策略。 */
  outlierPolicy: string;

  /** [VC] 停止规则（sequential 时为 alpha-spending 函数；static 时为 "fixed-n"）。 */
  stoppingRule: string;

  /** [META] scope 限制自由文本。 */
  scopeLimitation?: string;
}
```

### PowerPlan

```typescript
/**
 * 功效/灵敏度声明。缺失或不足可能触发 INCONCLUSIVE（R8_INSUFFICIENT_POWER_OR_NULL）。
 */
interface PowerPlan {
  /** [VC] 目标功效，如 0.8。 */
  targetPower: number;

  /** [VC] 假设的最小可检测效应量（MDE）。 */
  minimumDetectableEffect: number;

  /** [VC] 样本量（或等效观测数）。 */
  sampleSize: number;

  /** [VC] 功效计算方法，如 "analytic-ttest"、"simulation-10k"。 */
  powerMethod: string;

  /** [VC] 计算功效所用 α（须与 StatisticalPlan.alpha 一致；不一致 → deviation）。 */
  alphaAssumed: number;
}
```

### MultipleTestingPlan

```typescript
/**
 * 多重检验计划。implication > 1 时强制非空且 correction ≠ none（11 章 §4.2）。
 */
interface MultipleTestingPlan {
  /** [VC] 校正方法。 */
  correction: "bonferroni" | "holm" | "bh_fdr";

  /** [VC] 被校正的检验族大小（implication 数）。 */
  familySize: number;

  /** [VC] 校正后的 α'（如 bonferroni: α/n）。预注册。 */
  adjustedAlpha: number;

  /** [VC] 校正是否在 evidence run 前冻结。false → p_hacking_risk。 */
  preregistered: boolean;
}
```

### SeedPolicy

```typescript
/**
 * 随机种子策略。涉及随机的 workflow 必须声明（02 章 §6.7）。
 * seed=42 与 alpha/correction 三重同时开关（11 章 §4.1）。
 */
interface SeedPolicy {
  /** [VC] 是否使用固定种子。false 须有 justification。 */
  fixed: boolean;

  /** [VC] 固定种子值（fixed=true 时必填，如 42）。 */
  seedValue?: number;

  /** [VC] 是否允许 seed cherry-picking。false 为生产默认；true → seed_cherry_picking risk。 */
  allowCherryPick: boolean;

  /** [DOC] justification 文本（fixed=false 或 allowCherryPick=true 时必填）。不进裁决。 */
  justification?: string;
}
```

### DeviationPolicy

```typescript
/**
 * 协议偏离处置策略。critical deviation → UNTESTED（03 章 §7 伪代码 CRITICAL_DEVIATION）。
 */
interface DeviationPolicy {
  /** [VC] 哪些偏离类别被视为 critical（命中即 UNTESTED）。 */
  criticalCategories: string[];

  /** [VC] 非临界偏离的处理：'tolerate'（容忍但记录）/ 'degrade'（降级为 DEGRADED_SCOPE）/ 'block'（阻断 = UNTESTED）。 */
  nonCriticalHandling: "tolerate" | "degrade" | "block";

  /** [VC] 偏离是否必须显式登记（false → 静默偏离 = anti-theater fail）。 */
  requireExplicitLog: boolean;
}
```

### ProtocolFreeze

```typescript
/**
 * 协议冻结快照。freeze 后任何字段变更须落为 ProtocolDeviation。
 * freeze.timestamp 不可晚于实验结果时间（HARKing 红线）。
 */
interface ProtocolFreeze {
  /** [VC] FEC 内容的 canonicalHash。篡改 → FEC_HASH_MISMATCH（04 章 §8）。 */
  fecHash: string;

  /** [VC] 冻结操作者。 */
  actor: ActorRef;

  /** [VC] 冻结时间（ISO-8601）。早于所有 MeasurementResult.collectedAt。 */
  timestamp: string;

  /** [VC] 环境策略快照（容器摘要、依赖锁、网络策略）。 */
  environmentPolicy: string;

  /** [VC] 偏离策略引用（指向 DeviationPolicy 的序列化 hash）。 */
  deviationPolicyHash: string;

  /** [VC] 冻结是否由 deterministic freezer 产出（禁 LLM 冻结）。 */
  frozenBy: "deterministic_freezer";
}
```

### EvidenceRequirement

```typescript
/**
 * 单条必需证据声明。缺失 → EVIDENCE_MISSING → UNTESTED。
 */
interface EvidenceRequirement {
  /** [VC] 证据 id，如 "EVD-DATASET-PRIMARY"。 */
  evidenceId: string;

  /** [VC] 证据类别：dataset / workflow / measurement / statistical / external。 */
  kind: "dataset" | "workflow" | "measurement" | "statistical" | "external";

  /** [VC] 该证据是否为 critical（缺失即阻断，vs 可降级）。 */
  critical: boolean;

  /** [DOC] 证据描述。不进裁决。 */
  description: string;

  /** [VC] 验证该证据是否就位的 deterministic 检查 id（映射 ProofCheck.checkId）。 */
  verificationCheckId: string;
}
```

### DatasetRequirement

```typescript
/**
 * FEC 对数据集的要求。被 DatasetBinding 匹配。
 */
interface DatasetRequirement {
  /** [VC] 要求数据集的逻辑名，如 "TESS-lightcurve-primary"。 */
  name: string;

  /** [VC] 期望 contentHash 算法，如 "sha256"。 */
  contentHashAlgorithm: string;

  /** [VC] 是否允许使用合成数据。false 时 binding 含合成数据 → data_synthetic_unlabeled risk。 */
  allowSynthetic: boolean;

  /** [VC] 许可证要求（如 "CC-BY-4.0"）。 */
  requiredLicense?: string;

  /** [VC] 隐私/知情同意要求。 */
  consentOrPrivacyTag?: string;

  /** [VC] schema 指纹要求（与 DatasetBinding.schemaHash 对齐）。 */
  schemaFingerprintRequired: boolean;
}
```

### WorkflowRequirement

```typescript
/**
 * FEC 对工作流的要求。被 WorkflowBinding 匹配。
 */
interface WorkflowRequirement {
  /** [VC] 要求工作流的逻辑名。 */
  name: string;

  /** [VC] 期望 engine 类型。 */
  engine: "nextflow" | "snakemake" | "cwl" | "notebook" | "script" | "manual";

  /** [VC] 容器摘要是否必需。 */
  requireContainerDigest: boolean;

  /** [VC] 命令是否需固定 hash（commandHash）。 */
  requireCommandHash: boolean;

  /** [VC] 期望网络策略。binding.networkPolicy 宽于此 → deviation。 */
  expectedNetworkPolicy: NetworkPolicy;

  /** [VC] 是否要求固定种子（与 SeedPolicy 联动）。 */
  requireFixedSeed: boolean;
}
```

状态：FEC 子类型整体 `DESIGN_LOCKED`。

---

## 3. 证据绑定对象

### DatasetBinding

03 章 §3.1。证据绑定必须强于"有一个文件"。

```typescript
/**
 * 一份被绑定到 FEC 的数据集。contentHash/schemaHash/statsFingerprint 任一不匹配 → DATASET_HASH_MISMATCH。
 */
interface DatasetBinding {
  /** [VC] 数据集 id。 */
  datasetId: string;

  /** [VC] 内容 hash（sha256 等）。 */
  contentHash: string;

  /** [VC] schema 指纹（列结构 hash）。 */
  schemaHash: string;

  /** [META] 行数。用于 statsFingerprint 校验。 */
  rowCount?: number;

  /** [META] 列指纹（每列统计摘要的 hash）。 */
  columnFingerprint?: string;

  /** [VC] 数据集统计指纹（聚合统计的 hash，用于 drift 检测）。 */
  statsFingerprint?: string;

  /** [META] 来源 URI。 */
  sourceUri?: string;

  /** [META] 检索时间（ISO-8601）。 */
  retrievalTimestamp?: string;

  /** [META] 许可证。 */
  license?: string;

  /** [META] 隐私/知情同意标签。 */
  consentOrPrivacyTag?: string;

  /** [VC] 该数据集实际覆盖的 scope 切片。用于 ScopeReport 评估 scope_narrow。 */
  scopeCoverage: ScopeCoverage;
}
```

状态：`DESIGN_LOCKED`。

### WorkflowBinding

03 章 §3.2。

```typescript
/**
 * 一份被绑定到 FEC 的工作流。workflowHash/containerDigest/environmentHash 任一不匹配 → verifier RED（04 章 §8）。
 */
interface WorkflowBinding {
  /** [VC] 工作流 id。 */
  workflowId: string;

  /** [VC] 工作流内容 hash。 */
  workflowHash: string;

  /** [VC] 引擎类型。 */
  engine: "nextflow" | "snakemake" | "cwl" | "notebook" | "script" | "manual";

  /** [VC] 容器摘要（如 sha256:...）。 */
  containerDigest?: string;

  /** [VC] 环境 hash（依赖锁、系统库版本）。 */
  environmentHash: string;

  /** [VC] 命令 hash（固定 invocation）。 */
  commandHash?: string;

  /** [VC] 种子策略（须与 FEC.seedPolicy 一致）。 */
  seedPolicy: SeedPolicy;

  /** [VC] 网络策略。 */
  networkPolicy: NetworkPolicy;
}
```

状态：`DESIGN_LOCKED`。

### ExperimentRunBinding

03 章 §3.3。

```typescript
/**
 * 一次实验运行绑定。runId 唯一；inputHashes/outputHashes/logHashes 进 proofHash。
 */
interface ExperimentRunBinding {
  /** [VC] 运行 id。 */
  runId: string;

  /** [VC] 起始时间（ISO-8601）。须晚于 ProtocolFreeze.timestamp。 */
  startedAt: string;

  /** [META] 结束时间。 */
  endedAt?: string;

  /** [VC] 执行者。 */
  actor: ActorRef;

  /** [VC] 输入文件 hash 列表。 */
  inputHashes: string[];

  /** [VC] 输出文件 hash 列表。 */
  outputHashes: string[];

  /** [VC] 日志文件 hash 列表（stdout/stderr/otel）。 */
  logHashes: string[];

  /** [VC] 进程退出码。非 0 → 可能 critical deviation。 */
  exitCode?: number;

  /** [META] 资源画像。 */
  resourceProfile?: ResourceProfile;

  /** [VC] 该运行期间发生的协议偏离列表。空为合规。 */
  deviations: ProtocolDeviation[];
}
```

状态：`DESIGN_LOCKED`。

---

## 4. 测量与统计结果

### MeasurementResult

02 章 §4、03 章 §7 引用。

```typescript
/**
 * 一次测量产生的结构化结果。rawArtifactHashes 缺失 → anti-theater fail（label-only evidence）。
 */
interface MeasurementResult {
  /** [VC] 测量 id。 */
  measurementId: string;

  /** [VC] 关联的 runId。 */
  runId: string;

  /** [VC] metric key（与 MetricSpec.metricKey 对应）。 */
  metricKey: string;

  /** [VC] 测量值。 */
  metricValue: number;

  /** [VC] metric 单位（与 MetricSpec.unit 对齐）。 */
  unit: string;

  /** [VC] 该测量是否由 deterministic 路径产出（影响统计层 outcome 取值）。 */
  isDeterministic: boolean;

  /** [VC] 原始产物 hash 列表（raw data、中间文件）。缺失 → label-only evidence → UNTESTED。 */
  rawArtifactHashes: string[];

  /** [VC] stdout hash。 */
  stdoutHash?: string;

  /** [VC] stderr hash。 */
  stderrHash?: string;

  /** [META] 运行环境摘要（容器、CPU、GPU）。 */
  runEnvironment?: string;

  /** [VC] 采集时间（ISO-8601）。须晚于 ProtocolFreeze.timestamp。 */
  collectedAt: string;
}
```

状态：`DESIGN_LOCKED`。

### StatisticalResult

02 章 §4、67 章 §2 引用。

```typescript
/**
 * 统计检验的结构化结果。进入 verdict kernel 的 statisticalReport 聚合。
 * assumptionDiagnostics 任一 WARN（非 critical）→ 倾向 INCONCLUSIVE。
 */
interface StatisticalResult {
  /** [VC] 检验 id。 */
  testId: string;

  /** [VC] 检验状态：ran（已执行）/ skipped（跳过）/ failed（执行失败）。 */
  status: "ran" | "skipped" | "failed";

  /** [VC] 该结果相对 claim 的方向。 */
  effectDirection: EvidenceDirection;

  /** [VC] 原始 p 值。可为 null（status≠ran 时）。 */
  pValue: number | null;

  /** [VC] 校正后 p 值（多重检验后）。裁决以本字段与 alpha 比较。 */
  adjustedPValue: number | null;

  /** [VC] 观测到的效应量。 */
  effectSizeObserved: number | null;

  /** [VC] 置信区间 [lower, upper]。null 表示未计算。 */
  confidenceInterval: [number, number] | null;

  /** [VC] 假设诊断列表（正态性、方差齐性等）。 */
  assumptionDiagnostics: Diagnostic[];
}
```

### Diagnostic

```typescript
/**
 * 单条假设诊断。severity=critical → 阻断；warn → INCONCLUSIVE 倾向；info → 仅记录。
 */
interface Diagnostic {
  /** [VC] 诊断项 id，如 "normality-shapiro"。 */
  diagnosticId: string;

  /** [VC] 严重程度。 */
  severity: "info" | "warn" | "critical";

  /** [DOC] 诊断信息（人类可读）。 */
  message: string;

  /** [VC] 诊断输出数值（如检验统计量）。 */
  value?: number;
}
```

状态：`DESIGN_LOCKED`。

---

## 5. 裁决内核（Verdict Kernel）

本节类型来自 03 章 §7 与 67 章 §2-§3。二者字段集合存在历史差异：67 章引入更细粒度的 kernel（含 decisiveRuleId / humanExplanationTemplateId），03 章保留早期结构。本附录以 67 章为权威升级方向，03 章字段作为兼容映射保留。

### VerdictKernelInput

```typescript
/**
 * 确定性裁决内核的输入。所有字段均进入 rule trace 与 proofHash 计算。
 * LLM 产出的内容不得作为本对象的直接字段（须经 deterministic 校验降级为 EvidenceFact）。
 */
interface VerdictKernelInput {
  /** [VC] 被裁决的 FEC。null → R1_FEC_NOT_COMPILABLE → UNTESTED。 */
  fec: FecContract | null;

  /** [VC] 数据集绑定列表。空或全无效 → R2_NO_VALID_DATASET_BINDING → UNTESTED。 */
  datasetBindings: DatasetBinding[];

  /** [VC] 工作流绑定列表。 */
  workflowBindings: WorkflowBinding[];

  /** [VC] 实验运行绑定列表。 */
  runs: ExperimentRunBinding[];

  /** [EV] 测量结果列表。 */
  measurements: MeasurementResult[];

  /** [EV] 统计结果列表。 */
  statistics: StatisticalResult[];

  /** [VC] 协议偏离列表。含 critical → R3_CRITICAL_PROTOCOL_DEVIATION → UNTESTED。 */
  protocolDeviations: ProtocolDeviation[];

  /** [VC] 反剧场发现列表。hasFail → INCONCLUSIVE 或 UNTESTED（03 章 §8）。 */
  antiTheaterFindings: AntiTheaterFinding[];

  /** [VC] 证据充分性报告（67 章字段，03 章早期结构未含，本附录补齐）。 */
  evidenceSufficiency: EvidenceSufficiencyReport;

  /** [VC] scope 评估（67 章字段，对应 03 章的 evaluateScope 产出）。 */
  scopeAssessment: ScopeReport;

  /** [VC] 矛盾证据集合（67 章字段，用于 R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE）。 */
  contradictionSet: ContradictionEvidence[];
}
```

状态：`DESIGN_LOCKED`（67 章升级方向为 metric-first kernel；当前 `decideVerdict()` 已覆盖五值但规则浅，见 67 章 §0）。

### VerdictKernelOutput

```typescript
/**
 * 裁决内核输出。verdict 必须由 deterministic rule trace 产出；
 * humanExplanationTemplateId + ruleTrace 渲染自然语言解释，解释本身不进 proofHash。
 */
interface VerdictKernelOutput {
  /** [VC] 最终五值裁决。 */
  verdict: VerdictKind;

  /** [VC] reason code 列表（人类可读 + 机器可读），如 ["R6_PRIMARY_TEST_REFUTES", "SCOPE_FULL"]。 */
  reasonCodes: string[];

  /** [VC] 规则追踪。每条规则的输入须可复算 hash；改 input 必变 proofHash（67 章 §8 rule_trace_hash.test）。 */
  ruleTrace: VerdictRuleTrace[];

  /** [VC] 决定性规则 id（67 章 §3 字段，03 章早期结构为 priorityRule，二者等价）。 */
  decisiveRuleId: string;

  /** [VC] 证据充分性报告（与 input.evidenceSufficiency 对应的最终评估）。 */
  evidenceSufficiency: EvidenceSufficiencyReport;

  /** [VC] scope 报告。 */
  scopeReport: ScopeReport;

  /** [VC] 统计报告。 */
  statisticalReport: StatisticalReport;

  /** [VC] 进入 proofHash 的全部 input hash 列表（canonicalHash of 各 input 子对象）。 */
  inputHashes: string[];

  /** [META] 人类解释模板 id（如 "tmpl-confirmed-bounded-support"）。不进 proofHash。 */
  humanExplanationTemplateId: string;

  /** [VC] 证据摘要（67 章 §3 字段，含 effect/p/CI 聚合）。 */
  evidenceSummary: EvidenceSummary;
}
```

### VerdictRuleTrace

```typescript
/**
 * 单条规则的执行追踪。inputs 改动 → ruleTrace hash 变 → proofHash 变（67 章 §8）。
 */
interface VerdictRuleTrace {
  /** [VC] 规则 id，如 "R6_PRIMARY_TEST_REFUTES"。对应 67 章 §4 优先级表。 */
  ruleId: string;

  /** [VC] 规则执行结果。 */
  outcome: ProofCheckOutcome;

  /** [VC] 规则输入快照（canonical-serializable）。 */
  inputs: Record<string, string | number | boolean | null>;

  /** [VC] 消息 code（机器可读，如 "p_below_alpha_in_refuting_direction"）。 */
  messageCode: string;

  /** [META] 规则优先级（67 章 §4 的 1-10 数字；非裁决字段，仅排序辅助）。 */
  priority?: number;
}
```

### EvidenceSufficiencyReport

```typescript
/**
 * 证据充分性报告。power 不足或证据缺失 → 倾向 INCONCLUSIVE 或 UNTESTED。
 */
interface EvidenceSufficiencyReport {
  /** [VC] 证据是否充分：'sufficient' / 'insufficient' / 'missing'。 */
  status: "sufficient" | "insufficient" | "missing";

  /** [VC] 已满足的必需证据 id 列表（映射 EvidenceRequirement.evidenceId）。 */
  satisfiedEvidenceIds: string[];

  /** [VC] 缺失的必需证据 id 列表。 */
  missingEvidenceIds: string[];

  /** [VC] 功效评估：'adequate' / 'underpowered' / 'unknown'。 */
  powerStatus: "adequate" | "underpowered" | "unknown";

  /** [DOC] 缺失/不足的说明（人类可读）。不进裁决。 */
  notes?: string;
}
```

### ScopeReport

```typescript
/**
 * scope 评估报告。isDegraded=true → R4_SCOPE_MISMATCH_NONCRITICAL → DEGRADED_SCOPE（67 章 §4）。
 */
interface ScopeReport {
  /** [VC] scope 是否降级。 */
  isDegraded: boolean;

  /** [VC] claim scope 与证据 scope 的关系：'full' / 'partial' / 'none'。 */
  coverage: "full" | "partial" | "none";

  /** [VC] 受影响的 scope 边（dimension + value + relation）。 */
  impactedScopeEdges: ScopeCoverage[];

  /** [DOC] scope 缩窄的人类可读文本（67 章 §5 要求由 ruleTrace 生成，不手写）。 */
  scopeSlipText?: string;

  /** [VC] 是否存在同 scope 的直接反证（若有 → REFUTED 优先于 DEGRADED_SCOPE，67 章 §4）。 */
  hasSameScopeRefutation: boolean;
}
```

### StatisticalReport

```typescript
/**
 * 统计聚合报告。refutes=true → R6；supports=true 且无更高优先级 → R7 CONFIRMED；
 * conflicting 或 underpowered → R5/R8 INCONCLUSIVE（67 章 §4-§5）。
 */
interface StatisticalReport {
  /** [VC] 是否存在显著反证。 */
  refutes: boolean;

  /** [VC] 是否存在显著支持。 */
  supports: boolean;

  /** [VC] 证据是否冲突（supports 与 refutes 同时存在）。 */
  conflicting: boolean;

  /** [VC] 是否功效不足。 */
  underpowered: boolean;

  /** [VC] 聚合后的有效方向（多数/优先统计检验的方向）。 */
  effectiveDirection: EvidenceDirection;

  /** [VC] 主检验的校正后 p 值。 */
  primaryAdjustedPValue: number | null;

  /** [VC] 主检验的效应量。 */
  primaryEffectSize: number | null;

  /** [VC] 主检验的置信区间。 */
  primaryConfidenceInterval: [number, number] | null;
}
```

### ContradictionEvidence

```typescript
/**
 * 矛盾证据条目。用于 R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE → INCONCLUSIVE。
 */
interface ContradictionEvidence {
  /** [VC] 矛盾证据 id。 */
  contradictionId: string;

  /** [VC] 该证据的方向（与主证据相反）。 */
  direction: EvidenceDirection;

  /** [VC] p 值。 */
  pValue: number | null;

  /** [VC] 来源 hash（指向 measurement 或 statistical result）。 */
  sourceHash: string;

  /** [VC] 是否越过冻结的 refutation threshold（67 章 §5 REFUTED 条件之一）。 */
  crossesRefutationThreshold: boolean;
}
```

状态：裁决内核整体 `DESIGN_LOCKED`；当前实现为 `PARTIAL`（67 章 §0：`decideVerdict()` 已覆盖五值但规则浅，缺完整 rule trace / evidence sufficiency / statistical uncertainty / protocol deviation 聚合）。

---

## 6. 协议偏离

### ProtocolDeviation

```typescript
/**
 * 单条协议偏离记录。category 命中 DeviationPolicy.criticalCategories → critical=true → UNTESTED。
 */
interface ProtocolDeviation {
  /** [VC] 偏离 id。 */
  deviationId: string;

  /** [VC] 偏离类别，如 "alpha-rewrite"、"seed-change"、"workflow-digest-mismatch"。 */
  category: string;

  /** [VC] 是否临界（命中 deviationPolicy.criticalCategories）。 */
  critical: boolean;

  /** [VC] 关联的 runId（可选；非运行相关偏离可为空）。 */
  runId?: string;

  /** [VC] 偏离发生时间（ISO-8601）。 */
  detectedAt: string;

  /** [VC] 偏离前后值的 hash（before/after canonicalHash）。 */
  beforeHash: string;

  /** [VC] 偏离后值的 hash。 */
  afterHash: string;

  /** [DOC] 人类可读说明。 */
  description: string;
}
```

状态：`DESIGN_LOCKED`。

---

## 7. Anti-Theater

### AntiTheaterFinding

03 章 §8 引用。反剧场检查的产物。

```typescript
/**
 * 单条反剧场检查发现。hasFail=true → verdict kernel 倾向 INCONCLUSIVE 或 UNTESTED。
 */
interface AntiTheaterFinding {
  /** [VC] 检查 id，如 "AT-POSTHOC-THRESHOLD"。 */
  findingId: string;

  /**
   * [VC] 攻击类别。
   * 03 章 §8 表为最低强制子集（10 项核心攻击）；全集见本 enum 与 APPENDIX_E §2 attackId 一一对应（20 项）。
   */
  attackKind:
    // —— 03 §8 最低强制子集（10 项核心攻击）——
    | "label-only-evidence"
    | "llm-reviewer-override"
    | "post-hoc-threshold"
    | "dataset-drift"
    | "scope-laundering"
    | "missing-raw-artifact"
    | "metric-swapping"
    | "seed-cherry-picking"
    | "workflow-digest-mismatch"
    | "natural-language-verdict-mismatch"
    // —— APPENDIX_E §2 扩展子集（10 项，使全集达到 20 项）——
    | "fake-pass-forgery"
    | "dataset-hash-forgery"
    | "p-hacking-alpha-inflation"
    | "p-hacking-multiple-testing-uncorrected"
    | "harking-revision-after-result"
    | "stopping-rule-violation"
    | "optional-stopping-no-spending"
    | "dependency-float-drift"
    | "benchmark-overfit"
    | "fake-degraded-scope";

  /** [VC] 检查结果。 */
  outcome: ProofCheckOutcome;

  /** [VC] 该发现是否阻断（fail=true → kernel 进入 inconclusiveOrUntested 分支，03 章 §7 伪代码）。 */
  hasFail: boolean;

  /** [VC] 指向的 evidence record（call_records.seq 或 evidence_log 记录 id）。 */
  evidenceRef: string;

  /** [DOC] 机器可读 + 人类可读说明。 */
  message: string;
}
```

#### attackKind 与 APPENDIX_E §2 attackId 映射表

本 enum 的 kebab-case 字面量与 `APPENDIX_E_ANTI_THEATER.md` §2 attackId 一一对应。`APPENDIX_E` §2 attackId 为人类可读稳定标识（`AT-` 前缀），本 enum 为 verdict-critical 存储字段。消费方（如 verdict kernel、proofHash）一律存本 enum 字面量，不得存 attackId 字符串。

| AntiTheaterFinding.attackKind | APPENDIX_E §2 attackId |
|---|---|
| `label-only-evidence` | `AT-LABEL-ONLY` |
| `llm-reviewer-override` | `AT-JUDGE-OVERRIDE` |
| `post-hoc-threshold` | `AT-POSTHOC-THRESHOLD` |
| `dataset-drift` | `AT-DATA-DRIFT` |
| `scope-laundering` | `AT-SCOPE-LAUNDER` |
| `missing-raw-artifact` | `AT-MISSING-RAW` |
| `metric-swapping` | `AT-METRIC-SWAP` |
| `seed-cherry-picking` | `AT-SEED-CHERRY` |
| `workflow-digest-mismatch` | `AT-WORKFLOW-DIGEST` |
| `natural-language-verdict-mismatch` | `AT-REPORT-MISMATCH` |
| `fake-pass-forgery` | `AT-FAKE-PASS` |
| `dataset-hash-forgery` | `AT-DATA-HASH-FAKE` |
| `p-hacking-alpha-inflation` | `AT-PHACK-ALPHA` |
| `p-hacking-multiple-testing-uncorrected` | `AT-PHACK-CORRECTION` |
| `harking-revision-after-result` | `AT-HARK` |
| `stopping-rule-violation` | `AT-STOPPING-RULE` |
| `optional-stopping-no-spending` | `AT-OPTIONAL-STOPPING` |
| `dependency-float-drift` | `AT-DEP-FLOAT-DRIFT` |
| `benchmark-overfit` | `AT-OVERFIT` |
| `fake-degraded-scope` | `AT-FAKE-DEGRADED` |

### AntiTheaterReport

```typescript
/**
 * 反剧场检查聚合报告。进入 ProofEnvelope（04 章 §2）。
 * 本类型为权威存储类型（APPENDIX_E §1 引用本定义，不再重定义）。
 * 前五个字段（findings/hasFail/failCount/warnCount/llmOverrideRejected）为 verdict-critical 核心字段，
 * 后三个可选字段（antiTheaterScore/canSealConfirmed/verdictConstraint）为生产视角元数据（APPENDIX_E §1 承载，全部可选）。
 */
interface AntiTheaterReport {
  /** [VC] 全部反剧场发现。 */
  findings: AntiTheaterFinding[];

  /** [VC] 是否存在任何 fail。 */
  hasFail: boolean;

  /** [VC] fail 数量。 */
  failCount: number;

  /** [VC] warn 数量。 */
  warnCount: number;

  /** [VC] 是否所有 LLM reviewer override 均被拒绝（structured verdict wins）。 */
  llmOverrideRejected: boolean;

  /** [META] 反剧场评分 [0,100]，越低越危险。算法定义见 APPENDIX_E §4。可选生产视角元数据。 */
  antiTheaterScore?: number;

  /** [META] 是否可 seal CONFIRMED。score < 70 或存在 BLOCK finding → false。可选生产视角元数据。 */
  canSealConfirmed?: boolean;

  /** [META] 取严后的 verdict 约束（APPENDIX_E §1 AntiTheaterVerdictConstraint）。可选生产视角元数据。 */
  verdictConstraint?: AntiTheaterVerdictConstraint;
}
```

### AntiTheaterVerdictConstraint（APPENDIX_E §1 承载，本附录仅锁类型引用）

> 本类型定义于 `APPENDIX_E_ANTI_THEATER.md` §1；`APPENDIX_A_TYPES.md` 在此列出引用以使 `AntiTheaterReport.verdictConstraint` 类型可解析。字段权威以 `APPENDIX_E` §1 为准。

```typescript
interface AntiTheaterVerdictConstraint {
  /** 取严后的 verdict 约束（03 §6 优先级）；anti-theater 只"降级"，不主动产 REFUTED。undefined = 不约束。 */
  forcedVerdict?: "DEGRADED_SCOPE" | "UNTESTED" | "INCONCLUSIVE";

  /** true → 拒绝 seal（04 §1）。 */
  blockSeal: boolean;

  /** reasonCode 列表。 */
  reasonCodes: string[];
}
```

状态：`DESIGN_LOCKED`。

---

## 8. ProofEnvelope V2 与签名

### ProofEnvelopeV2

04 章 §2 引用。可转交的机器可检证据包。

```typescript
/**
 * ProofEnvelope V2。schemaVersion 固定 "far.proof_envelope.v2"。
 * humanSummary 不进入 verdict 决策；若进入 proofHash 仅作非裁决字段并需明确分区。
 */
interface ProofEnvelopeV2 {
  /** [VC] schema 版本，固定 "far.proof_envelope.v2"。 */
  schemaVersion: "far.proof_envelope.v2";

  /** [VC] envelope 全局唯一 id（ULID）。 */
  envelopeId: string;

  /** [META] 封存时间（ISO-8601）。sealed 后 append-only。 */
  createdAt: string;

  /** [VC] 关联的 claim（全文快照）。 */
  claim: Claim;

  /** [VC] FEC 内容 hash（与 ProtocolFreeze.fecHash 一致）。 */
  fecHash: string;

  /** [VC] FEC 全文快照。 */
  fecSnapshot: FecContract;

  /** [VC] 协议冻结快照。 */
  protocolFreeze: ProtocolFreeze;

  /** [VC] 数据集绑定列表。 */
  datasetBindings: DatasetBinding[];

  /** [VC] 工作流绑定列表。 */
  workflowBindings: WorkflowBinding[];

  /** [VC] 实验运行绑定列表。 */
  experimentRuns: ExperimentRunBinding[];

  /** [VC] 测量结果列表。 */
  measurementResults: MeasurementResult[];

  /** [VC] 统计结果列表。 */
  statisticalResults: StatisticalResult[];

  /** [VC] 裁决追踪（VerdictKernelOutput 全文）。 */
  verdictTrace: VerdictKernelOutput;

  /** [VC] 反剧场报告。 */
  antiTheaterReport: AntiTheaterReport;

  /** [VC] ledger root（call_records head hash 或 ledger_events Merkle root）。 */
  ledgerRoot: string;

  /**
   * [VC] proofHash = sha256(canonical_json(本对象全部 verdict-critical 字段 - proofHash 自身))。
   * 篡改任一 VC 字段 → proofHash 不匹配 → PROOF_HASH_MISMATCH（04 章 §8）。
   */
  proofHash: string;

  /** [META] 可选签名块列表。 */
  signatures?: SignatureBlock[];

  /** [DOC] 可选的面向人的收据摘要。不进裁决。 */
  humanSummary?: TrustReceiptSummary;
}
```

状态：`DESIGN_LOCKED`；当前实现为 `PARTIAL`（V1 存在，P0 须升级为 V2 proofHash binding）。

### SignatureBlock

```typescript
/**
 * 单个签名块。可选；FAR-Chain 不强制签名，但支持外部签名挂载。
 */
interface SignatureBlock {
  /** [META] 签名者标识。 */
  signerId: string;

  /** [META] 签名算法，如 "ed25519"、"rsa-pss-sha256"。 */
  algorithm: string;

  /** [META] 公钥指纹（sha256）。 */
  publicKeyFingerprint: string;

  /** [META] 签名值（base64）。对 proofHash 签名。 */
  signature: string;

  /** [META] 签名时间（ISO-8601）。 */
  signedAt: string;
}
```

### TrustReceiptSummary

04 章 §9 引用。面向人的收据摘要。

```typescript
/**
 * Trust Receipt 的结构化摘要。不是新事实源，是 ProofEnvelope 的可读投影。
 * 对外口径须含"bounded support，非科学真理证书"声明（04 章 §9）。
 */
interface TrustReceiptSummary {
  /** [DOC] claim 摘要文本。 */
  claimSummary: string;

  /** [DOC] verdict（与 verdictTrace.verdict 一致；不一致 → natural-language-verdict-mismatch finding）。 */
  verdict: VerdictKind;

  /** [DOC] 证据 scope 摘要。 */
  evidenceScope: string;

  /** [DOC] proofHash（hex）。 */
  proofHash: string;

  /** [DOC] 验证命令示例，如 "far verify --bundle x.far-proof --json"。 */
  verifierCommand: string;

  /** [DOC] tamper 状态：'clean' / 'tampered' / 'unknown'。 */
  tamperStatus: "clean" | "tampered" | "unknown";

  /** [DOC] 局限性声明列表（如"仅 TESS sector 14 单目标"）。 */
  limitations: string[];

  /** [DOC] 要求的下一步动作（如"需多 sector 复核"）。 */
  requiredNextAction?: string;
}
```

状态：`DESIGN_LOCKED`。

---

## 9. 通用引用对象

### ActorRef

```typescript
/**
 * 执行者/责任方引用。出现在 Claim.author、ProtocolFreeze.actor、ExperimentRunBinding.actor。
 */
interface ActorRef {
  /** [META] 执行者 id（人类用户、CI bot、deterministic_freezer 等）。 */
  actorId: string;

  /** [META] 执行者类型：'human' / 'ci-bot' / 'deterministic-tool' / 'llm-assistant'。 */
  actorKind: "human" | "ci-bot" | "deterministic-tool" | "llm-assistant";

  /**
   * [VC] 该执行者是否可作为最终裁决者。永远为 false（F3：禁 LLM-as-judge；
   * 也禁人类手填 verdict；verdict 只由 deterministic kernel 产出）。
   */
  canIssueVerdict: false;
}
```

### ResourceProfile

```typescript
/**
 * 运行资源画像。出现在 ExperimentRunBinding.resourceProfile。
 * seed/nthread=1 等确定性参数与 09 章 repro 七分量对齐。
 */
interface ResourceProfile {
  /** [META] CPU 核数。 */
  cpuCores?: number;

  /** [META] GPU 型号/数量。 */
  gpu?: string;

  /** [META] 内存（MB）。 */
  memoryMb?: number;

  /** [META] 确定性线程数（repro 要求 nthread=1）。 */
  deterministicThreads?: number;

  /** [META] 随机种子（与 SeedPolicy 联动）。 */
  seedValue?: number;

  /** [META] 容器镜像摘要。 */
  containerDigest?: string;
}
```

---

## 10. 因果模型（claimType=causal 时强制）

### CausalModel

08 章 §1.1 引用。对齐 COLLECTION_03 §32 SSOT（弃用旧 backdoorSet/identificationStatus/variableType/edgeType/bidirected）。

```typescript
/**
 * 因果模型。claimType=causal 时 FEC 校验强制非空，且 L7-L3 ConfoundingGate 强制启用（11 章 §2.3）。
 */
interface CausalModel {
  /** [VC] DAG 节点列表。 */
  nodes: CausalDagNode[];

  /** [VC] DAG 边列表（CausalEdgeKind 3 值，无 bidirected）。 */
  edges: CausalEdge[];

  /** [VC] 已控制混淆子 nodeId 列表（调整集 Z，替代旧 backdoorSet）。 */
  controlledConfounders: string[];

  /** [VC] 怀疑未测混淆子 nodeId 列表（非空 → ConfoundingGate 倾向 unblocked）。 */
  unmeasuredConfoundersSuspected: string[];
}

interface CausalDagNode {
  /** [VC] 节点 id。 */
  nodeId: string;

  /** [VC] 变量名。 */
  variableName: string;

  /** [VC] 节点类型：observed / latent / intervention / outcome（4 值）。 */
  nodeKind: "observed" | "latent" | "intervention" | "outcome";

  /** [DOC] 变量描述。 */
  description?: string;
}

interface CausalEdge {
  /** [VC] 起点 nodeId。 */
  fromNodeId: string;

  /** [VC] 终点 nodeId。 */
  toNodeId: string;

  /** [VC] 边类型：direct_cause / probable_cause / spurious_correlation（3 值，无 bidirected）。 */
  edgeKind: "direct_cause" | "probable_cause" | "spurious_correlation";

  /** [DOC] 因果机制说明（F6 因果诚信）。 */
  mechanismRationale?: string;
}
```

状态：`DESIGN_LOCKED`；ConfoundingGate 算法 SSOT 见 36 章（本附录仅锁类型契约）。

---

## 11. 跨文档一致性映射

本附录与既有章节的字段对齐关系（任一不一致以本附录为权威）：

| 类型 | 02 章 | 03 章 | 04 章 | FINAL_PACKAGE 来源 |
|---|---|---|---|---|
| `Claim` | §4 数据对象 | — | §2 ProofEnvelope.claim | 08 §1 SciIRNode 投影 |
| `FecContract` | §4 | §1 最小结构 | — | 11 §1.1 YAML 契约映射 |
| `VerdictKind` | — | §5 | §5 verify 输出 | 67 §1 / 08 §1 / 11 §3 |
| `VerdictKernelInput` | — | §7 | — | 67 §2（细粒度） |
| `VerdictKernelOutput` | — | §7 | — | 67 §3（含 decisiveRuleId / humanExplanationTemplateId） |
| `ProofEnvelopeV2` | — | — | §2 | 09 §1（ProofEnvelope schema） |
| `DatasetBinding` | §4 | §3.1 | §2 | — |
| `WorkflowBinding` | §4 | §3.2 | §2 | — |
| `ExperimentRunBinding` | §4 | §3.3 | §2 | — |
| `MeasurementResult` | §4 | — | §2 | — |
| `StatisticalResult` | §4 | — | §2 | 67 §2 StatisticalTestResult |
| `AntiTheaterFinding` / `Report` | — | §8 | §2 | 09 §2 ProofCheckKind 投影 |

差异裁决记录（本附录相对早期章节的字段补齐与命名锁定）：

1. `VerdictKernelOutput`：67 章引入 `decisiveRuleId` 与 `humanExplanationTemplateId`，03 章早期结构为 `priorityRule`。本附录以 67 章为权威升级方向，`priorityRule` 视为 `decisiveRuleId` 的历史别名（08 追踪矩阵保留映射）。
2. `VerdictKernelInput`：67 章含 `evidenceSufficiency` / `scopeAssessment` / `contradictionSet` 三个细粒度字段，03 章早期结构未显式列出（隐含于 evaluateScope / evaluateStatistics 内部）。本附录将三者提升为显式字段。
3. `Claim.domain`：本附录锁定为 SciIRDomain 6 值（08 章 §2），早期能力口径中 domain 为自由文本，已收窄。
4. `StatisticalResult`：本附录字段名对齐 67 章 `StatisticalTestResult`（`adjustedPValue` / `effectSizeObserved` / `confidenceInterval` / `assumptionDiagnostics`），03 章早期 `StatisticalResult` 字段集合较粗。
5. `protocolDeviations` 与 `antiTheaterFindings`：03 章同时出现于 input；67 章将 `protocolDeviations` 列为独立 input 字段，`antiTheaterFindings` 由 03 章 §8 表定义。本附录保留两者并存。
6. `compiledBy` / `createdBy` / `sealedBy` / `frozenBy`：分别对应 SciIRNode（08 §1）/ VerdictNode（09 §1.2）/ ProofEnvelope（09 §1）/ ProtocolFreeze 四个不同语义层的 deterministic 产出者标记，皆禁 `llm`（F3 反 theater 跨层投影）。

---

## 12. 状态总结

| 类型族 | 状态 | 备注 |
|---|---|---|
| 权威枚举（VerdictKind / ProofCheckOutcome / EvidenceDirection / EffectComparator / NetworkPolicy） | `DESIGN_LOCKED` | 枚举值冻结，禁止扩值（VerdictKind 第六值禁） |
| Claim / FecContract 及全部子类型 | `DESIGN_LOCKED` | 字段集合冻结；实现状态以代码为准（`PARTIAL` 待核实） |
| 证据绑定（DatasetBinding / WorkflowBinding / ExperimentRunBinding） | `DESIGN_LOCKED` | hash 字段进 proofHash |
| MeasurementResult / StatisticalResult / Diagnostic | `DESIGN_LOCKED` | 统计层 MVP 实现 `PARTIAL`（11 章 §2.2） |
| VerdictKernelInput / Output / RuleTrace / Reports | `DESIGN_LOCKED` | 当前 `decideVerdict()` 实现 `PARTIAL`（67 章 §0 规则浅） |
| ProtocolDeviation / AntiTheaterFinding / Report | `DESIGN_LOCKED` | 反剧场规则集 03 章 §8 |
| ProofEnvelopeV2 / SignatureBlock / TrustReceiptSummary | `DESIGN_LOCKED` | V1 `PARTIAL`，P0 升级 V2 |
| ActorRef / ResourceProfile | `DESIGN_LOCKED` | 通用引用对象 |
| CausalModel / CausalDagNode / CausalEdge | `DESIGN_LOCKED` | 算法 SSOT 见 36 章；类型契约在本附录 |

> 未在本附录列出的类型（如 CausalEdgeKind 的扩展、UQ-Witness 的 ReproCertificate、ledger_events 的 MerkleInclusionProof）属于增量层（L3/L12/L14），其类型 SSOT 见对应细化文档（44 / 09 §7 / 11 §5）。本附录仅锁裁决主链路的 verdict-critical 类型。
