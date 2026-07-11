# 03 FEC、证据绑定与五值裁决

> 本文件是 FAR-Chain / FAR-Lab **FEC、证据绑定、统计计划、五值裁决、Deterministic Verdict Kernel、anti-theater 与 golden vector 主题**的实现级规格。
> 它从现有骨架（§1-§9 原结构）**原地增补深度**：把分散在历史档案 `FINAL_PACKAGE/`（08 / 09 / 11 / 36 / 66 / 67 / 81 / 83）中、被骨架蒸馏掉的完整类型字段、算法伪代码、JSON schema、failure vectors 与边界条件并入。
>
> **路径约定**（遵守 `01_SOURCE_OF_TRUTH_AND_STATUS.md` §1）：所有路径使用 `<REPOSITORY_ROOT>/`；`far-chain/` 仅作为历史规划路径出现，不作为真实实现根。
>
> **裁决枚举**（与 `APPENDIX_A_TYPES.md` §0、`APPENDIX_B_GOLDEN.md` §0、`APPENDIX_C_CANONICAL.md` §6 权威对齐，**禁止第六值**）：
>
> ```ts
> type VerdictKind =
>   | "CONFIRMED"
>   | "REFUTED"
>   | "INCONCLUSIVE"
>   | "DEGRADED_SCOPE"
>   | "UNTESTED";
> ```
>
> **LLM 边界**：LLM 不得作为最终裁决者。所有 verdict 由 deterministic verdict kernel 经固定优先级规则表（§7 / `APPENDIX_B` §1）产出。LLM 可生成候选 claim、草拟 FEC、渲染自然语言解释，但解释本身不进 `proofHash`，不作为裁决输入。
>
> **状态纪律**：本文件每个能力标注状态标签（`DESIGN_LOCKED` / `IMPLEMENTED_VERIFIED` / `IMPLEMENTED_UNVERIFIED` / `PARTIAL` / `ROADMAP` / `RESEARCH` / `RETIRED` / `NEEDS_EXTERNAL_VERIFICATION`）；本文件**不手填**测试数 / CI 通过率 / golden 向量数 / commit / 竞品发布时间，所有此类字段写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`，由 `far status --json` 与 CI 输出回填。
>
> **禁用词**（仅可在"禁用 / 历史 / 修正"语境出现且必须显式标注）：证明科学真理、物理不可篡改、完全可复现、全自动科学家、通用 AI4S benchmark/排行榜、`far-chain/`（作为真实实现路径）、最新/第一/唯一（无来源支撑）。
>
> **冲突仲裁**：本文件与 `APPENDIX_A_TYPES.md` / `APPENDIX_C_CANONICAL.md` / `APPENDIX_F_GLOSSARY.md` 冲突时，以三个附录为权威（全局规则 10）。本文件与 `APPENDIX_B_GOLDEN.md` / `APPENDIX_E_ANTI_THEATER.md` 冲突时，附录为 verdict golden vector 与 anti-theater 主题的更细实现级口径，但 enum、优先级语义、路径写法不偏离本文件。

---

## 0. 定位与边界

### 0.1 本文件回答的问题

> "一个自然语言科学声明，如何被冻结为可机器裁决的可证伪证据契约（FEC），如何绑定确定性可重算的证据（dataset/workflow/run），如何经确定性五值裁决内核产出 verdict，并在 ProofEnvelope 中可被第三方独立重算与篡改检测？"

本文件是这条主链路的**实现级规格**：FEC → 证据绑定 → 统计计划 → 五值裁决 → Deterministic Verdict Kernel → anti-theater → golden vector。ProofEnvelope 与 verifier 的实现级细节见 `04_PROOF_ENVELOPE_AND_VERIFIER.md`；canonical 序列化与 proofHash 算法见 `APPENDIX_C_CANONICAL.md`；golden vector 完整 case 目录见 `APPENDIX_B_GOLDEN.md`；anti-theater 攻击全目录见 `APPENDIX_E_ANTI_THEATER.md`。

### 0.2 诚实边界（红线锚点）

| 红线 | 在本文件语境的正确口径 | 禁用口径 |
|---|---|---|
| F1 反 theater | 未验证 claim 禁止 `CONFIRMED`，落 `UNTESTED` 并填非空 `untestedReason`；SKIP 冒充 PASS = 假绿，CI 阻断 | 证明科学真理 |
| F2 决策树优先级 | `DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED`，§7 与 `APPENDIX_B` §1 R0-R9 锁死 | — |
| F3 禁 LLM-as-judge | `frozenBy` / `sealedBy` / `compiledBy` / `createdBy` / `computedBy` 永远 deterministic；LLM evidence 单独不能 CONFIRMED/REFUTED | 全自动科学家 |
| F5 数学红线 | 数值/统计判定域内部可取 `'unknown'`，但落到 `ProofCheck.outcome` 必须收窄为 `SKIP + message="L2 无法确定数值判定（F5 数学红线）"` | 假装数值精确 |
| F6 因果诚信 | `confoundingGateStatus='unblocked' && evidenceBasis='observational_only'` → 禁 `CONFIRMED`；F6 算法 SSOT 见 §7.5.1（自包含）；36（已退役）仅作来源溯源 | 因果 LLM 自审 |
| F7 FEC 三件套 | `sourceAnchor + reproHash + falsificationSpec` 缺一 throw（非 fallback，非降级） | — |
| F8 预登记铁律 | `preregistrationHash` + `seed=42` + `alpha'=0.0125`（Bonferroni 1/8）三重同时开关；事后改 = HARKing | — |
| F9 复现失败也是结果 | 数据缺失 → `UNTESTED`；代码不通 → `DEGRADED_SCOPE`；结果不一致 → `INCONCLUSIVE` / `REFUTED`；禁伪造数据补全 | 完全可复现 |
| F10 Formal 可选非 runtime | fresh-clone 无 Lean/Dafny/TLA+ 仍跑 core gate；不可用 → `unknown` 禁 LLM fallback | — |

### 0.3 状态总结速查

| 模块 | 状态 | 说明 |
|---|---|---|
| 五值裁决 enum | `DESIGN_LOCKED` | 闭包锁死，禁第六值 |
| Verdict Kernel 规则优先级 R0-R9 | `DESIGN_LOCKED` | `APPENDIX_B` §1 锁定 |
| FEC 顶层结构 + 全部子类型 | `DESIGN_LOCKED` | 字段集合冻结；实现 `PARTIAL`（见各节） |
| 证据绑定（Dataset/Workflow/Run Binding） | `DESIGN_LOCKED` | hash 字段进 proofHash；实现 `IMPLEMENTED_UNVERIFIED`（chain 已绿，binding 对账待补） |
| 统计计划（StatisticalPlan 全字段） | `DESIGN_LOCKED` | MVP 仅 static prereg check；sequential alpha-spending `ROADMAP`（W5） |
| Deterministic Verdict Kernel | `DESIGN_LOCKED` | `decideVerdict()` 当前 `PARTIAL`（已覆盖五值但规则浅，缺完整 rule trace / evidence sufficiency / contradiction 聚合） |
| Anti-theater 规则集 | `DESIGN_LOCKED` | 20 类攻击目录见 `APPENDIX_E`；19 条 `DESIGN_LOCKED` + 1 条 `ROADMAP`（AT-OVERFIT） |
| Golden vectors（GV-01..GV-14） | `DESIGN_LOCKED` | 完整 case 目录见 `APPENDIX_B` §2（P0 基线 12 + FUSION-OS-13/14 扩展 2） |
| Formal invariants（TLA+/Dafny/Lean） | `RESEARCH` | 仅文本示例；F10 非 runtime；V2/V3 路线图 |

---

## 1. FEC 的定义

FEC 是 Falsification Evidence Contract，即可证伪证据契约。它不是提示词模板，也不是自然语言评语，而是一个**冻结的、可验证的结构化承诺**：声明某个 claim 在哪些 scope、哪些数据集、哪些工作流、哪些统计计划下可以被支持或被反驳。

### 1.1 FEC 的核心要求

FEC 必须同时满足六条核心要求，缺一不可编译：

| # | 要求 | 落点 |
|---|---|---|
| 1 | **可测** | 存在至少 1 条 `measurableImplication`（POPPER 风格可观测蕴含） |
| 2 | **可反驳** | 存在明确的 refutation route（如何被反驳），由 nullHypothesis + threshold 定义 |
| 3 | **可冻结** | `protocolFreeze` 产出 `fecHash`，freeze 后字段不可静默修改 |
| 4 | **可绑定证据** | `datasetRequirements` / `workflowRequirements` 可被 `DatasetBinding` / `WorkflowBinding` 满足 |
| 5 | **可由第三方重算** | 全部 verdict-critical 字段进 `proofHash`（见 `APPENDIX_C` §2.2），第三方用同一输入重算 verdict |
| 6 | **缺证据时能诚实降级** | 缺证据 → `UNTESTED`（不伪造）；scope 收窄 → `DEGRADED_SCOPE`（不洗白）；反证 → `REFUTED`（不隐藏） |

### 1.2 FEC 顶层结构（完整字段 · 对齐 APPENDIX_A §1）

```ts
/**
 * 可证伪证据契约。冻结后不可静默修改；任何 post-hoc 修改须落为 ProtocolDeviation
 * 并可能触发 harking_risk / p_hacking_risk（见 §4.1 F8）。
 *
 * 一个 claim 对应一份冻结的 FEC。FEC 经 deterministic compiler 编译，
 * 输出 FalsificationPlan（含 test_plan / refutation_routes / stat_lock /
 * repro_spec / verdict_mapping / proof_checks 六产物，首里程碑仅交付 3 产物）。
 */
interface FecContract {
  /** [VC] FEC 全局唯一 id，如 "FEC-ASTRO-0001"。进入 canonicalHash 与 proofHash。 */
  fecId: string;

  /** [VC] 回指 Claim.id。 */
  claimId: string;

  /** [VC] 可测蕴含文本（POPPER 风格，至少 1 条）。编译失败 → FEC_NOT_COMPILABLE → UNTESTED。 */
  measurableImplication: string;

  /** [VC] scope 声明。FEC.compile 检查 scope 是否有界；无界 → SCOPE_UNBOUNDED。 */
  scope: ScopeSpec;

  /** [VC] 必需证据清单。缺失任一 critical → EVIDENCE_MISSING → UNTESTED（§2）。 */
  requiredEvidence: EvidenceRequirement[];

  /** [VC] 数据集要求清单。被 DatasetBinding 匹配（§3.1）。 */
  datasetRequirements: DatasetRequirement[];

  /** [VC] 工作流要求清单。被 WorkflowBinding 匹配（§3.2）。 */
  workflowRequirements: WorkflowRequirement[];

  /** [VC] primary metric 定义。无 primary metric → METRIC_MISSING。 */
  metric: MetricSpec;

  /** [VC] threshold 定义。无 threshold/direction → THRESHOLD_MISSING。 */
  threshold: ThresholdSpec;

  /** [VC] effect 与 threshold 的比较方向。 */
  direction: EffectComparator;

  /** [VC] 统计计划。无统计计划 → STAT_PLAN_MISSING（§4）。 */
  statisticalPlan: StatisticalPlan;

  /** [VC] 功效/灵敏度声明。可选但强烈建议；缺失或不足可能触发 INCONCLUSIVE（R8）。 */
  powerPlan?: PowerPlan;

  /** [VC] 多重检验计划。implication > 1 时强制非空且 correction ≠ none。 */
  multipleTestingPlan?: MultipleTestingPlan;

  /** [VC] 随机种子策略。涉及随机时 seed=42 须与 alpha/correction 三重同时开关（§4.1 F8）。 */
  seedPolicy: SeedPolicy;

  /** [VC] 协议偏离处置策略。critical deviation → UNTESTED（§7 伪代码 CRITICAL_DEVIATION）。 */
  deviationPolicy: DeviationPolicy;

  /** [VC] 协议冻结快照。freeze 后字段不可静默修改。 */
  freeze: ProtocolFreeze;
}
```

状态：`DESIGN_LOCKED`。实现 `PARTIAL`（`src/falsifiability/contracts.ts` 已有 `preregistrationHash/measurableImplication/metric/comparator/thresholdValue/alpha/seed/bonferroniApplied/compiledBy/locked`，但 measurement plan / stopping rule / dataset binding / rule trace 待建模）。

### 1.3 FEC V2 JSON Schema（编译期验证）

FEC 在 freeze 前必须通过 deterministic validator。JSON Schema 草案（用于 `validateFEC`）：

```json
{
  "$id": "https://far-chain.org/schema/fec-v2.json",
  "type": "object",
  "required": [
    "fecId",
    "claimId",
    "measurableImplication",
    "scope",
    "datasetRequirements",
    "workflowRequirements",
    "metric",
    "threshold",
    "direction",
    "statisticalPlan",
    "seedPolicy",
    "deviationPolicy",
    "freeze"
  ],
  "properties": {
    "contractVersion": { "const": "FEC/2.0" },
    "measurableImplication": { "type": "string", "minLength": 1 },
    "datasetRequirements": { "type": "array", "minItems": 1 },
    "statisticalPlan": {
      "type": "object",
      "required": [
        "primaryMetric", "nullHypothesis", "alternativeHypothesis", "alpha",
        "effectDirection", "confidenceIntervalMethod",
        "multipleTestingCorrection", "missingDataPolicy",
        "outlierPolicy", "stoppingRule"
      ]
    },
    "threshold": {
      "type": "object",
      "required": ["value", "unit", "thresholdSemantics", "preregistered"]
    },
    "freeze": {
      "type": "object",
      "required": ["fecHash", "actor", "timestamp", "environmentPolicy", "deviationPolicyHash", "frozenBy"],
      "properties": {
        "frozenBy": { "const": "deterministic_freezer" }
      }
    }
  }
}
```

### 1.4 FEC compiler 六产物（设计目标 · 首里程碑交付 3 产物）

FEC 经 deterministic compiler 编译为 `FalsificationPlan`，产出六产物（来源 `FINAL_PACKAGE/11` §1.2，已归档）：

| # | 产物 | 用途 | 首里程碑 | 完整交付 |
|---|---|---|---|---|
| 1 | `test_plan` | MeasurableImplication → 可执行检验步骤 | — | ✓ |
| 2 | `refutation_routes` | 每个 M 的"如何被反驳"路径（POPPER 反证思想） | — | ✓ |
| 3 | `stat_lock` | 预注册统计参数冻结（alpha/correction/testKind 不可后改） | ✓ | ✓ |
| 4 | `repro_spec` | 复现规格（喂 L0 repro_deterministic，绑定 reproHash） | — | ✓ |
| 5 | `verdict_mapping` | 5 路径 → 5 枚举的确定性决策表（§7 / `APPENDIX_B` §1） | ✓ | ✓ |
| 6 | `proof_checks` | 转译为 ProofCheck[]（checkKind/outcome，04 ProofEnvelope 消费） | ✓ | ✓ |

```text
YAML 契约 ──[deterministic_compiler]──▶ { test_plan, refutation_routes, stat_lock,
                                          repro_spec, verdict_mapping, proof_checks }
                                              │
                                              └──▶ FalsificationPlan
```

> **诚实声明**：6 产物全自动编译是【设计目标】。首里程碑仅交付 `stat_lock` + `verdict_mapping` + `proof_checks` 三项；`test_plan` / `refutation_routes` / `repro_spec` 的自动生成属 W3-W4 增量。**不声称 6 产物全自动编译已落地**。

---

## 2. FEC 编译规则

自然语言 claim 必须经过以下检查才能进入冻结。每条检查失败时产出固定的 reasonCode，且**不得输出 `CONFIRMED` 或 `REFUTED`**——默认进入 `UNTESTED` 或阻断 freeze。

### 2.1 编译期检查表（失败码 → verdict）

| # | 检查 | 失败结果（reasonCode） | 落 verdict | 对应 kernel 规则 |
|---|---|---|---|---|
| 1 | 是否存在可测 implication（≥1） | `FEC_NOT_COMPILABLE` | `UNTESTED` | R1 |
| 2 | 是否有明确 scope（population/timeWindow/domainConstraint 非空） | `SCOPE_UNBOUNDED` | `UNTESTED` | R1 |
| 3 | 是否定义 primary metric（`metric.metricKey` 非空、非描述性短语） | `METRIC_MISSING` | `UNTESTED` | R1 |
| 4 | 是否定义 threshold 与 direction（`threshold.value` + `direction`） | `THRESHOLD_MISSING` | `UNTESTED` | R1 |
| 5 | 是否定义 dataset/workflow 要求（`minItems: 1`） | `EVIDENCE_REQUIREMENT_MISSING` | `UNTESTED` | R1 |
| 6 | 是否定义统计计划（StatisticalPlan 全必填字段） | `STAT_PLAN_MISSING` | `UNTESTED` | R1 |
| 7 | 是否说明多重检验（implication > 1 时 correction ≠ none） | `PROTOCOL_INCOMPLETE` | `INCONCLUSIVE`（强制降级） | R5/R8 |
| 8 | 是否说明 seed policy（涉及随机时 `fixed=true` + `seedValue`） | `PROTOCOL_INCOMPLETE` | `UNTESTED`（seed 偏离） | R3 |
| 9 | `freeze.frozenBy === "deterministic_freezer"`（F3） | `LLM_FROZEN` | 阻断 freeze（CI fail） | — |
| 10 | `freeze.timestamp` 不晚于任一 `MeasurementResult.collectedAt`（F8 HARKing） | `HARKING_REVISION_AFTER_RESULT` | 禁 `CONFIRMED`（实际落 `UNTESTED`） | R3 |

### 2.2 编译期检查伪代码

```python
def compile_fec(fec_draft: FecContractDraft) -> FalsificationPlan | CompileError:
    """deterministic compiler；LLM 仅可提 proposal，不可产 verdict。"""
    # 1. 可测 implication
    if not fec_draft.measurableImplication or len(fec_draft.measurableImplications) < 1:
        return CompileError("FEC_NOT_COMPILABLE", "缺可测 implication")
    # 2. scope 有界
    scope = fec_draft.scope
    if not (scope.population and scope.timeWindow and scope.domainConstraint):
        return CompileError("SCOPE_UNBOUNDED", "scope 三要素须非空")
    # 3. primary metric
    if not fec_draft.metric or not fec_draft.metric.metricKey:
        return CompileError("METRIC_MISSING", "缺 primary metric key")
    if is_descriptive_phrase(fec_draft.metric.metricKey):   # 禁 "显著周期" 之类
        return CompileError("METRIC_MISSING", "metricKey 须为稳定 key，禁描述性短语")
    # 4. threshold + direction
    if fec_draft.threshold is None or fec_draft.direction is None:
        return CompileError("THRESHOLD_MISSING", "缺 threshold/direction")
    if fec_draft.threshold.unit != fec_draft.metric.unit:
        return CompileError("THRESHOLD_MISSING", "threshold.unit 须与 metric.unit 一致")
    # 5. dataset/workflow requirement
    if len(fec_draft.datasetRequirements) == 0 or len(fec_draft.workflowRequirements) == 0:
        return CompileError("EVIDENCE_REQUIREMENT_MISSING", "dataset/workflow requirement 须 ≥1")
    # 6. statistical plan
    sp = fec_draft.statisticalPlan
    missing_stat = [f for f in STAT_PLAN_REQUIRED_FIELDS if getattr(sp, f, None) is None]
    if missing_stat:
        return CompileError("STAT_PLAN_MISSING", f"缺统计字段: {missing_stat}")
    # 7. multiple testing
    n_imp = len(fec_draft.measurableImplications)
    if n_imp > 1 and sp.multipleTestingCorrection == "none":
        # 不阻断 compile，但强制降级 + integrityFlag
        emit_warning("MULTIPLE_TESTING_UNCORRECTED")
        fec_draft.integrityFlags += "p_hacking_risk"
    # 8. seed policy
    if involves_randomness(fec_draft) and not fec_draft.seedPolicy.fixed:
        return CompileError("PROTOCOL_INCOMPLETE", "涉及随机须 fixed seed")
    # 9. deterministic freezer
    if fec_draft.freeze.frozenBy != "deterministic_freezer":
        return CompileError("LLM_FROZEN", "freeze 须 deterministic_freezer（F3）")
    # 10. HARKing 时间序
    if fec_draft.freeze.timestamp > min(m.collectedAt for m in measurements):
        return CompileError("HARKING_REVISION_AFTER_RESULT",
                           "freeze.timestamp 不可晚于实验结果时间")
    # 编译为 FalsificationPlan
    return build_falsification_plan(fec_draft)
```

### 2.3 编译失败后的诚实降级

- 编译失败（reasonCode 1-8、10）→ verdict 落 `UNTESTED`，`untestedReason` 非空（F1 反 theater）。
- 编译失败（reasonCode 9 `LLM_FROZEN`）→ **CI 直接阻断**，不走 verdict 降级（否则 LLM-as-judge 会被静默吞掉，违反 `07` §4 与零容忍 #4）。
- **禁止**：编译失败后回退到 `INCONCLUSIVE`（"未测试"与"测试了但不确定"互斥）。

---

## 3. 证据绑定

证据绑定必须**强于"有一个文件"**：每个 binding 须携带可独立重算的 hash，篡改任一 verdict-critical 字段 → binding hash 变 → proofHash 变 → verifier RED。

### 3.1 DatasetBinding（完整字段 · 对齐 APPENDIX_A §3）

```ts
/**
 * 一份被绑定到 FEC 的数据集。
 * contentHash / schemaHash / statsFingerprint 任一不匹配 → DATASET_HASH_MISMATCH（04 §8）。
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

**三层 hash 对账规则**（来源 `FINAL_PACKAGE/66` §7 / `APPENDIX_E` AT-DATA-DRIFT）：

| 字段 | 漂移含义 | 严重程度 | 落 verdict |
|---|---|---|---|
| `contentHash` 不匹配 | 数据字节被改（行增删、值篡改） | FAIL（verifier RED） | `DEGRADED_SCOPE`（或 `UNTESTED` 当严重） |
| `schemaHash` 不匹配 | 列名/类型变化（schema drift） | FAIL（verifier RED） | `DEGRADED_SCOPE`（或 `UNTESTED`） |
| `statsFingerprint` 不匹配 | 统计分布漂移（数据仍可用但分布变） | WARN | `DEGRADED_SCOPE`（非 critical，数据可用但 scope 收窄） |

**DatasetBindingSpec**（kernel 内部表示，匹配 `datasetRequirements`）：

```ts
interface DatasetBindingSpec {
  datasetId: string;
  contentHash: string;
  sourceAnchor: { resolved: boolean; resolverRef?: string };
  scopeCoverage: ScopeCoverage;
}
```

> `sourceAnchor.resolved === false` → R2_NO_VALID_DATASET_BINDING → `UNTESTED`（来源不可解析）。

### 3.2 WorkflowBinding（完整字段 · 对齐 APPENDIX_A §3）

```ts
/**
 * 一份被绑定到 FEC 的工作流。
 * workflowHash / containerDigest / environmentHash / commandHash 任一不匹配 → verifier RED（04 §8）。
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

  /** [VC] 网络策略。Production 默认 OFF 或 allowlist（02 §6.6）。
   * 'unrestricted-with-warning' 不得被包装成 OFF（反 theater：标 OFF 但实际联网 = verifier RED）。 */
  networkPolicy: NetworkPolicy;
}
```

```ts
type NetworkPolicy = "off" | "allowlist" | "unrestricted-with-warning";
```

**四 hash 对账**（来源 `APPENDIX_E` AT-WORKFLOW-DIGEST）：

| 字段 | 漂移含义 | reasonCode |
|---|---|---|
| `workflowHash` | 工作流代码被改 | `WORKFLOW_HASH_MISMATCH` |
| `containerDigest` | 容器镜像被换 | `CONTAINER_DIGEST_MISMATCH` |
| `environmentHash` | 依赖锁/系统库变化 | `ENV_HASH_MISMATCH` |
| `commandHash` | 调用命令变化 | `COMMAND_HASH_MISMATCH` |

> 任一不匹配 → verifier RED（`BLOCK` finding），阻断 seal。

### 3.3 ExperimentRunBinding（完整字段 · 对齐 APPENDIX_A §3）

```ts
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

  /** [VC] 执行者。canIssueVerdict 永远为 false（F3）。 */
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

**Run 完整性规则**（反 seed cherry-pick，来源 `APPENDIX_E` AT-SEED-CHERRY）：

- `runRegistry` 必须完整：每个声明的 seed 都有 run 记录；
- 缺失 run（hidden failed run）→ `HIDDEN_FAILED_RUN` → `INCONCLUSIVE` 或 fail；
- `exitCode !== 0` 且未登记 deviation → anti-theater fail（伪造成功）。

### 3.4 三种 binding 的一致性矩阵

| 维度 | DatasetBinding | WorkflowBinding | ExperimentRunBinding |
|---|---|---|---|
| 进 proofHash 的 hash | contentHash / schemaHash / statsFingerprint | workflowHash / containerDigest / environmentHash / commandHash | inputHashes / outputHashes / logHashes |
| 不匹配的 reasonCode | `DATASET_HASH_MISMATCH` | `WORKFLOW_HASH_MISMATCH` 等 | `RUN_HASH_MISMATCH` |
| scope 字段 | `scopeCoverage` | — | — |
| 时间约束 | `retrievalTimestamp` 不约束 verdict | — | `startedAt` 须晚于 `freeze.timestamp` |

---

## 4. 统计计划

统计计划必须在 evidence run **前**冻结（`statLock.lockedAt` 早于实验结果时间，F8 HARKing 红线）。Post-hoc threshold、p-hacking、metric swapping 必须被 anti-theater harness 捕获。

### 4.1 StatisticalPlan（完整必填字段 · 对齐 APPENDIX_A §2）

```ts
/**
 * 统计计划。必须在 evidence run 前冻结（§4 F8）。
 * 最小字段集合（任一缺失 → STAT_PLAN_MISSING）。
 */
interface StatisticalPlan {
  /** [VC] primary metric key（与 MetricSpec.metricKey 一致）。 */
  primaryMetric: string;

  /** [VC] H0 原假设。 */
  nullHypothesis: string;

  /** [VC] H1 备择假设。 */
  alternativeHypothesis: string;

  /** [VC] 显著性水平 α。预注册后不可改；事后改 = alpha inflation = p-hacking。 */
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

### 4.2 PowerPlan / MultipleTestingPlan / SeedPolicy（配套子计划）

```ts
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

### 4.3 F8 三重约束（同时开关）

来源 `FINAL_PACKAGE/11` §4.1（已归档）：

| 约束 | 开关 | 违反后果 |
|---|---|---|
| `preregistrationHash` 锁定 primaryMetric / alpha / correction | ON | 改 = HARKing → `integrityFlags += harking_risk` → 禁 `CONFIRMED` |
| `seed=42` 固定（涉及随机时） | ON | 换 seed = p-hacking → `integrityFlags += p_hacking_risk` |
| `alpha'=0.0125`（Bonferroni 1/8）预登记 | ON | `p>0.0125` 只诚实报告"未达校正后显著"，不事后改 α |

> **三重约束必须同时开关**：不允许只开一项（如只锁 metric 不锁 alpha）。任一关闭 → `integrityFlags += p_hacking_risk`。

### 4.4 StoppingRule（sequential 测试）

来源 `FINAL_PACKAGE/81` §5（已归档）：

```ts
interface StoppingRule {
  type: "fixed_n" | "group_sequential" | "alpha_spending" | "bayesian_stop" | "none_declared";
  plannedLooks: number;
  spendingFunction?: string;   // Pocock / O'Brien-Fleming；sequential 时必填
  maxN?: number;
}
```

> **诚实边界**：完整 alpha-spending 计算为 W5 `ROADMAP`。MVP 仅做 static preregistration check（校验"是否预声明了 spending function"），**不**声称实现了完整 sequential Type-I error control。若 `type ∈ {"group_sequential","alpha_spending"}` 且 `spendingFunction` 为空 → `OPTIONAL_STOPPING_NO_SPENDING` → 禁 `CONFIRMED`。

### 4.5 P-Hacking 检测规则矩阵

来源 `FINAL_PACKAGE/81` §3 + `APPENDIX_E` AT-PHACK-*：

| 攻击 | 检测规则 | expected verdict | reasonCode |
|---|---|---|---|
| alpha inflation（事后抬 α） | frozen alpha ≠ executed alpha（精确比较，不容差） | `UNTESTED` | `ALPHA_INFLATION_DEVIATION` |
| multiple endpoint fishing（多指标无校正） | `implications.length > 1 && correction === "none"` | `INCONCLUSIVE`（强制降级） | `MULTIPLE_TESTING_UNCORRECTED` |
| optional stopping（sequential 无 spending） | `type ∈ {group_sequential, alpha_spending} && spendingFunction === null` | `UNTESTED` / `INCONCLUSIVE` | `OPTIONAL_STOPPING_NO_SPENDING` |
| exclusion after seeing data（事后排除） | exclusion criteria freeze 比对 | `UNTESTED` | `EXCLUSION_DEVIATION` |
| covariate fishing（模型规格事后调） | model spec hash freeze 比对 | `UNTESTED` | `MODEL_SPEC_DEVIATION` |
| cherry-pick seed（换 seed） | seedPolicy hash + run registry 完整性 | `INCONCLUSIVE` | `SEED_POLICY_MISMATCH` / `HIDDEN_FAILED_RUN` |
| hidden failed run（删失败 run） | run registry 完整性比对 | `INCONCLUSIVE` | `HIDDEN_FAILED_RUN` |
| switching primary endpoint（换主指标） | primaryMetric frozen hash ≠ executed | `UNTESTED` | `PRIMARY_METRIC_SWAPPED` |
| HARKing（结果后改假设） | `hypothesis.sealedAt > experiment.finishedAt` | 禁 `CONFIRMED` → `UNTESTED` | `HARKING_REVISION_AFTER_RESULT` |

---

## 5. 五值裁决

唯一合法 verdict enum（与 `APPENDIX_A` §0、`APPENDIX_B` §0、`APPENDIX_C` §6 权威对齐）：

```ts
type VerdictKind =
  | "CONFIRMED"
  | "REFUTED"
  | "INCONCLUSIVE"
  | "DEGRADED_SCOPE"
  | "UNTESTED";
```

> **禁止第六值**：新增第六值须同时修改本 SSOT、schema CHECK 约束、所有 verifier、所有 golden vectors 的 `expectedVerdict` 与答辩口径（`APPENDIX_B` §6.3）。任一遗漏 = 系统不可信。本文件**不预期触发此流程**。
>
> **澄清**：`UNTESTED` 是第五值。SQLite `RAISE(ABORT)` 是数据库触发器操作，**不是**裁决值。

### 5.1 五值的精确定义（与 kernel 规则对应）

| Verdict | 精确含义 | 触发规则（`APPENDIX_B` §1） |
|---|---|---|
| `CONFIRMED` | 在冻结 FEC、scope 和统计计划下，证据满足支持条件（adjusted p ≤ α、effect direction supports、effect size ≥ minimum、power PASS、无 critical deviation、无同 scope 显著反证）且**无更高优先级问题**。**bounded support，非科学真理** | R7 |
| `REFUTED` | 冻结证据契约下存在足够反证（primary test significant in refuting direction / negative control 失效 / contradiction 越冻结反证阈值 / dataset binding 证明 claim 必要条件为假） | R6 |
| `INCONCLUSIVE` | 证据冲突（support 与 refute 同时显著）、功效不足（post-hoc power < target）、假设诊断 WARN、或结果落在不确定区（adjusted p > α 但已测试） | R5 / R8 |
| `DEGRADED_SCOPE` | 证据覆盖范围比 claim 窄（population/time/domain），或数据/环境漂移导致只能支持较小范围；**无同 scope 显著反证**（否则升 R6 REFUTED） | R4 |
| `UNTESTED` | 不能执行测试（FEC 不完整、数据缺失、协议未冻结、关键证据不存在、所有 primary test skipped、measurement code 失败） | R1 / R2 / R3 / R9 |

### 5.2 verdict_mapping 五路径（来源 `FINAL_PACKAGE/11` §3）

verdict_mapping 是 FEC compiler 的产物 5，是落 verdict 的**唯一确定性通道**。严格 5 路径 → 5 枚举，禁新增路径：

| 路径 | 触发条件（确定性） | 落 verdict | F2 优先级 |
|---|---|---|---|
| `all_pass` | 所有 ProofCheck.outcome=PASS 且无 integrityFlags 且（causal 时 confoundingGateStatus=blocked） | `CONFIRMED`（bounded support） | 4 |
| `any_refute` | 任一 refutation_route 命中 FAIL（nullHyp 被数据支持 / 反证成立） | `REFUTED` | 2 |
| `data_missing` | sourceAnchor/datasetRef 解析失败 / repro 缺失（F7 throw 前） | `UNTESTED` | 5 |
| `scope_narrow` | 检验通过但适用范围收窄（样本不足、仅 exploratory、降级 baseline_exempt F11） | `DEGRADED_SCOPE` | 1（最高） |
| `mixed` | 部分通过部分失败，无法统一裁决 | `INCONCLUSIVE` | 3 |

---

## 6. Verdict priority

裁决优先级（`take the strictest`，F2 锁死）：

```text
DEGRADED_SCOPE
  > REFUTED
  > INCONCLUSIVE
  > CONFIRMED
  > UNTESTED
```

### 6.1 优先级原则

来源 `APPENDIX_B` §1 / `FINAL_PACKAGE/67` §4：

1. **`UNTESTED` 优先于"不知道但已测试"的 `INCONCLUSIVE`**：未测试与测试了但不确定互斥。
2. **`REFUTED` 不得被 `DEGRADED_SCOPE` 隐藏**：若同一 scope 内有显著反证，先 `REFUTED`，不得用 `DEGRADED_SCOPE` 洗白（`APPENDIX_E` AT-FAKE-DEGRADED）。
3. **`DEGRADED_SCOPE` 只在 claim scope 大于证据 scope 且没有同 scope refutation 时使用**。
4. **`CONFIRMED` 必须所有 hard gates PASS**：adjusted p ≤ α、effect direction supports、effect size ≥ minimum、power PASS、无 critical deviation、无同 scope 显著反证、无 integrityFlags。
5. **多条规则同时触发取最严**：`reasonCode[]` 与 `ruleTrace[]` 必须同时记录全部触发的 finding，但 decisive rule 只取优先级最高的一条。

### 6.2 优先级对应的 kernel 规则编号（R0-R9）

`APPENDIX_B` §1 给出更细的 R0-R9 编号，作为每个 golden vector `expectedReasonCodes` 的可追溯锚点：

| 优先级 | ruleId | 触发条件（确定性） | 落 verdict |
|---|---|---|---|
| 0 | `R0_SCHEMA_INVALID` | ProofEnvelope / FEC schemaVersion 不被 verifier 支持 | `UNTESTED` |
| 1 | `R1_FEC_NOT_COMPILABLE` | FEC 缺可测 implication / 缺 metric / 缺 threshold / 缺 stat plan / 缺多重检验声明 | `UNTESTED` |
| 2 | `R2_NO_VALID_DATASET_BINDING` | datasetRequirements 无任一被 DatasetBindingSpec 满足；或 `sourceAnchor.resolved=false` | `UNTESTED` |
| 3 | `R3_CRITICAL_PROTOCOL_DEVIATION` | FEC 可编译已过，但执行期 critical deviation（post-hoc alpha、late exclusion、stopping rule 违反、measurement code fail、metric swap）使主检验无效 | `UNTESTED` |
| 4 | `R4_SCOPE_MISMATCH_NONCRITICAL` | 证据覆盖范围窄于 claim scope（population/time/domain），scope 降级规则已在 FEC 冻结，且无同 scope 显著反证 | `DEGRADED_SCOPE` |
| 5 | `R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE` | support 与 refute 均显著，或 multi-implication 部分显著 PASS 部分 FAIL 且无法统一 | `INCONCLUSIVE` |
| 6 | `R6_PRIMARY_TEST_REFUTES` | primary test adjusted p ≤ α 且 effectDirection=refutes，或 negative control 失效，或 contradiction 跨冻结反证阈值 | `REFUTED` |
| 7 | `R7_PRIMARY_TEST_CONFIRMS` | 所有 hard gate PASS：adjusted p ≤ α、effectDirection=supports、observed effect size ≥ minimum、power PASS、无 critical deviation、无同 scope 显著反证 | `CONFIRMED`（bounded support） |
| 8 | `R8_INSUFFICIENT_POWER_OR_NULL` | primary test ran 但 adjusted p > α，或功效不足（post-hoc power < target），或 effect too small，或 assumption WARN-but-not-critical | `INCONCLUSIVE` |
| 9 | `R9_ALL_TESTS_SKIPPED` | 所有 primary test `status='skipped'`，但 FEC 可编译、dataset 已绑定、无 critical deviation | `UNTESTED` |

### 6.3 deterministic tie-break

来源 `FINAL_PACKAGE/67` §6 / `APPENDIX_C` §6.2：

```text
sort evidence by (evidenceId, sourceHash)
sort tests by testId
apply rules R0..R9 in fixed order
first decisive rule wins
emit all skipped/warned rules in trace
```

**不得使用的输入**（违反 = verifier RED）：

- LLM 自然语言解释作为 verdict 输入；
- wall-clock 当前时间（除非是已 hash 的 sealed/frozen 时间戳）；
- 未 canonical sort 的对象 key 迭代；
- locale-sensitive 字符串比较。

---

## 7. Deterministic Verdict Kernel

### 7.1 内核输入（完整字段 · 对齐 APPENDIX_A §5）

```ts
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

  /** [VC] 反剧场发现列表。hasFail → INCONCLUSIVE 或 UNTESTED（§8）。 */
  antiTheaterFindings: AntiTheaterFinding[];

  /** [VC] 证据充分性报告（67 章字段，对应 evaluateEvidenceSufficiency 产出）。 */
  evidenceSufficiency: EvidenceSufficiencyReport;

  /** [VC] scope 评估（对应 evaluateScope 产出）。 */
  scopeAssessment: ScopeReport;

  /** [VC] 矛盾证据集合（用于 R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE）。 */
  contradictionSet: ContradictionEvidence[];
}
```

### 7.2 内核输出（完整字段 · 对齐 APPENDIX_A §5）

```ts
/**
 * 裁决内核输出。verdict 必须由 deterministic rule trace 产出；
 * humanExplanationTemplateId + ruleTrace 渲染自然语言解释，解释本身不进 proofHash。
 */
interface VerdictKernelOutput {
  /** [VC] 最终五值裁决。 */
  verdict: VerdictKind;

  /** [VC] reason code 列表（人类可读 + 机器可读），如 ["R6_PRIMARY_TEST_REFUTES", "SCOPE_FULL"]。 */
  reasonCodes: string[];

  /** [VC] 规则追踪。每条规则的输入须可复算 hash；改 input 必变 proofHash。 */
  ruleTrace: VerdictRuleTrace[];

  /** [VC] 决定性规则 id（67 章字段，03 章早期结构为 priorityRule，二者等价）。 */
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

  /** [VC] 证据摘要（67 章字段，含 effect/p/CI 聚合）。 */
  evidenceSummary: EvidenceSummary;
}
```

### 7.3 完整伪代码（确定性 · LLM-free）

> **字段命名约定**：本伪代码字段名以 `APPENDIX_A_TYPES.md` 为准（`camelCase`）；`snake_case` 仅作 Python 等价示意（如本地变量名），不得用于访问 `VerdictKernelInput` / `FecContract` / `StatisticalResult` / `StatisticalReport` 等附录对象的字段。

**输入结构（与 `APPENDIX_A` §5 `VerdictKernelInput` 完全对齐）**：

```text
VerdictKernelInput = {
  fec, datasetBindings, workflowBindings, runs, measurements, statistics,
  protocolDeviations, antiTheaterFindings,
  evidenceSufficiency,   ← 顶级字段（EvidenceSufficiencyReport），由 evaluateEvidenceSufficiency 产出后回填
  scopeAssessment,       ← 顶级字段（ScopeReport），由 evaluateScope 产出后回填
  contradictionSet,      ← 顶级字段（ContradictionEvidence[]），用于 R5/R6
}
```

> R6 / R7 / R8 消费 `input.scopeAssessment.isDegraded` / `input.evidenceSufficiency.powerStatus` / `input.contradictionSet` 等顶级字段（这三个顶级字段由 §7.4 的 `evaluate_scope` / `evaluate_statistics` 产出后回填到 `VerdictKernelInput`，再由本内核读取）。

```python
def decide_five_value_verdict(input: VerdictKernelInput) -> VerdictKernelOutput:
    """
    确定性五值裁决内核。全程无 LLM；按 R0..R9 固定优先级，首条决定性规则胜出。
    tie-break: sort evidence by (evidenceId, sourceHash); sort tests by testId。
    """
    rule_trace = []

    # ── R0 schema invalid ──
    if not is_supported_schema(input.fec):
        return emit("UNTESTED", ["R0_SCHEMA_INVALID"], rule_trace)

    # ── R1 FEC not compilable ──
    if input.fec is None or not is_frozen_and_compilable(input.fec):
        return emit("UNTESTED", ["R1_FEC_NOT_COMPILABLE"], rule_trace,
                    untestedReason="FEC_NOT_READY")

    # ── R2 no valid dataset binding ──
    if missing_required_evidence(input) or not any_valid_dataset_binding(input):
        return emit("UNTESTED", ["R2_NO_VALID_DATASET_BINDING"], rule_trace,
                    untestedReason="EVIDENCE_MISSING")

    # ── R3 critical protocol deviation ──
    if critical_protocol_deviation(input):   # post-hoc alpha / late exclusion / stopping violation / metric swap
        return emit("UNTESTED", ["R3_CRITICAL_PROTOCOL_DEVIATION"], rule_trace,
                    untestedReason="CRITICAL_DEVIATION")

    # 评估 scope / statistics / anti-theater（顺序无关，各自确定性产出）。
    # evaluate_scope / evaluate_statistics 产出后回填 input.scopeAssessment /
    # input.evidenceSufficiency / input.contradictionSet（见 §7.4），本内核随后读取顶级字段。
    scope = evaluate_scope(input)               # → ScopeReport，同步回填 input.scopeAssessment
    stats = evaluate_statistics(input)          # → StatisticalReport，同步回填 input.evidenceSufficiency
    theater = evaluate_anti_theater(input)

    # ── R4 scope mismatch noncritical ──
    # 注意：若同 scope 内有显著反证，不落 R4，而落 R6 REFUTED（优先级原则 2）
    if scope.isDegraded and not scope.hasSameScopeRefutation:
        return emit("DEGRADED_SCOPE",
                    ["R4_SCOPE_MISMATCH_NONCRITICAL"] + scope_drift_codes(scope),
                    rule_trace,
                    scopeSlipText=scope.scopeSlipText)

    # ── anti-theater hasFail ──
    if theater.hasFail:
        return inconclusive_or_untested(theater, rule_trace)   # FAIL → UNTESTED；WARN → INCONCLUSIVE

    # ── R5 contradictory significant evidence ──
    if stats.conflicting or has_multi_implication_split(input):
        return emit("INCONCLUSIVE", ["R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE"], rule_trace)

    # ── R6 primary test refutes ──
    if stats.refutes:   # adjustedPValue ≤ α 且 effectDirection=refutes；或 negative control 失效
        return emit("REFUTED", ["R6_PRIMARY_TEST_REFUTES"], rule_trace)

    # ── R7 primary test confirms（所有 hard gate PASS）──
    if (stats.supports
            and stats.primaryAdjustedPValue is not None
            and stats.primaryAdjustedPValue <= input.fec.statisticalPlan.alpha   # ≤ 含等号
            and stats.primaryEffectSize is not None
            and stats.primaryEffectSize >= input.fec.powerPlan.minimumDetectableEffect
            and input.evidenceSufficiency.status == "sufficient"
            and not scope.hasSameScopeRefutation
            and no_integrity_flags(input)):
        return emit("CONFIRMED", ["R7_PRIMARY_TEST_CONFIRMS"], rule_trace,
                    boundedSupport=True)   # bounded support，非科学真理

    # ── R8 insufficient power or null ──
    if ((stats.primaryAdjustedPValue is not None
            and stats.primaryAdjustedPValue > input.fec.statisticalPlan.alpha)
        or input.evidenceSufficiency.powerStatus == "underpowered"
        or (stats.primaryEffectSize is not None
            and stats.primaryEffectSize < input.fec.powerPlan.minimumDetectableEffect)
        or has_warn_assumption(stats)):
        return emit("INCONCLUSIVE", ["R8_INSUFFICIENT_POWER_OR_NULL"], rule_trace)

    # ── R9 all tests skipped ──
    if all_tests_skipped(input):
        return emit("UNTESTED", ["R9_ALL_TESTS_SKIPPED"], rule_trace,
                    untestedReason="NO_DECISION_PATH")

    return emit("UNTESTED", ["NO_DECISION_PATH"], rule_trace)
```

> **浮点比较容差**：所有 verdict-critical 数值比较（`adjustedPValue ≤ alpha`、`effectSizeObserved ≥ minimumDetectable`、CI 边界、power）使用确定性浮点比较，容差 `1e-7`（与 `APPENDIX_B` §4.1 一致）：`|a - b| ≤ 1e-7 → 视为相等`；`a ≤ b + 1e-7 → 视为 a ≤ b`。三端（TS/Python/browser）必须用同一比较函数与同一容差。

### 7.4 辅助评估函数

```python
def evaluate_scope(input: VerdictKernelInput) -> ScopeReport:
    """评估证据 scope 是否窄于 claim scope。产出后回填 input.scopeAssessment。"""
    claim_scope = input.fec.scope
    evidence_scope = union_dataset_scope_coverage(input.datasetBindings)
    coverage = compute_coverage_relation(claim_scope, evidence_scope)   # full / partial / none
    is_degraded = coverage != "full"
    impacted = [e for e in evidence_scope if e.relation != "within"]
    has_same_scope_refutation = any(
        c.crossesRefutationThreshold and same_scope(c, claim_scope)
        for c in input.contradictionSet
    )
    report = ScopeReport(
        isDegraded=is_degraded,
        coverage=coverage,
        impactedScopeEdges=impacted,
        scopeSlipText=render_scope_slip(impacted) if is_degraded else None,
        hasSameScopeRefutation=has_same_scope_refutation,
    )
    input.scopeAssessment = report   # 回填顶级字段（供 §7.3 R4/R6/R7 读取）
    return report


def evaluate_statistics(input: VerdictKernelInput) -> StatisticalReport:
    """聚合统计结果。refutes/supports/conflicting/underpowered 由 deterministic 规则产出。
    产出后回填 input.evidenceSufficiency.powerStatus（供 §7.3 R7/R8 读取顶级字段）。"""
    alpha = input.fec.statisticalPlan.alpha
    primary = [s for s in input.statistics if s.testId == input.fec.metric.metricKey]
    refutes = any(s.adjustedPValue is not None
                  and s.adjustedPValue <= alpha
                  and s.effectDirection == "refutes" for s in primary)
    supports = any(s.adjustedPValue is not None
                   and s.adjustedPValue <= alpha
                   and s.effectDirection == "supports" for s in primary)
    conflicting = refutes and supports
    underpowered = (input.evidenceSufficiency.powerStatus == "underpowered")
    effective = aggregate_effective_direction(primary)
    report = StatisticalReport(
        refutes=refutes, supports=supports, conflicting=conflicting,
        underpowered=underpowered, effectiveDirection=effective,
        primaryAdjustedPValue=primary[0].adjustedPValue if primary else None,
        primaryEffectSize=primary[0].effectSizeObserved if primary else None,
        primaryConfidenceInterval=primary[0].confidenceInterval if primary else None,
    )
    return report
```

### 7.5 与 ConfoundingGate（F6 因果）的集成

> **实现状态**：`IMPLEMENTED_VERIFIED(#12)`。`src/confounding_gate/`（d-separation + 后门路径 + `adjudicateConfounding` + `generateRationale`）+ `verdict_kernel_v2.ts` R-causal 门（R7 CONFIRMED 前门控·双 guard `claimType==='causal' && confoundingGateResult!==undefined`·非因果 claim 字节级零回归）+ `science_harness` hero-B 路径（`decideVerdictWithConfounding`）+ CG-1/2/5/6 CI 门（`pnpm run confounding-gate-scan`）已落地。全量验证：TS 946/946、Py 110/110、`ci_all` PASS、反模式扫描零命中。实现与 §7.5.1 伪代码的两处偏差（d-separation collider 语义修正 + 后门路径逐路径阻断）见 §7.5.1 实现偏差披露。

当 `claimType='causal'` 时，verdict kernel 在 R7 CONFIRMED 判定前**额外**调用 ConfoundingGate（算法 SSOT 见本节 §7.5.1（自包含）；36 §3 仅作来源溯源（已退役，备份 `C:/Users/RichardYuan/FAR-Lab_Backups/`））。

**ConfoundingGate outcome 判定规则（缩略表，一句话口径）**：

| outcome | 判定条件（一句话） |
|---|---|
| `PASS` | `find_backdoor_paths` 结果为空（所有后门路径被 `controlledConfounders` 阻断，`d_separation` 成立） |
| `WARN` | 存在后门路径但 `unmeasuredConfoundersSuspected` 为空（路径未阻断但所有混淆变量均已测量） |
| `FAIL` | 存在后门路径且 `unmeasuredConfoundersSuspected` 非空（存在未测量的未阻断混杂） |

**ConfoundingGate outcome → verdict 影响**：

| ConfoundingGate outcome | 对 verdict 的影响 |
|---|---|
| `PASS`（所有后门路径被阻断） | 不影响（按正常 R0-R9 裁决） |
| `WARN`（路径未阻断但变量全测） | 若 verdict_mapping 产出 `CONFIRMED` → 降级为 `INCONCLUSIVE`；若产出 `REFUTED` → 保持 `REFUTED`（混杂不影响反证） |
| `FAIL`（存在未测量混杂） | `scope_narrow` → `DEGRADED_SCOPE`（因果声称因不可测量混杂无法裁决）；`evidenceBasis='observational_only'` 时强制禁 `CONFIRMED`（F6：相关 ≠ 因果） |

```python
def decide_verdict_with_confounding(verdict_mapping_result, confounding_result):
    if confounding_result.outcome == "PASS":
        return verdict_mapping_result
    if confounding_result.outcome == "FAIL":
        return VerdictNode(
            verdict="DEGRADED_SCOPE", verdictPath="scope_narrow",
            degradedFrom="causal_confounding",
            degradedReason=f"Unmeasured confounders: {confounding_result.unmeasuredConfounders}")
    if confounding_result.outcome == "WARN":
        if verdict_mapping_result.verdict == "CONFIRMED":
            return VerdictNode(
                verdict="INCONCLUSIVE", verdictPath="mixed",
                verdictRationale="ConfoundingGate WARN prevents CONFIRMED")
        return verdict_mapping_result
```

> **F6 红线**：ConfoundingGate 是确定性图算法（d-separation + 后门路径枚举），**不是 LLM 推理混杂**。源码 `grep -rE "openai|chat\.completions|llm"` 在 confounding gate 模块命中 LLM 调用即 CI fail（CG-1）。完整 d-separation 算法（`d_separation` / `find_backdoor_paths` / `adjudicate_confounding`）的伪代码与 fixture DAG 模版见 **本节 §7.5.1（自包含 SSOT）**；36 §3 / §2.1 仅作来源溯源（已退役，物理档案备份至 `C:/Users/RichardYuan/FAR-Lab_Backups/`）。

### 7.5.1 ConfoundingGate 算法（自包含 SSOT）

> 本子节是 `d_separation` / `find_backdoor_paths` / `adjudicate_confounding` 的**自包含 SSOT**（来源：退役档案 `FINAL_PACKAGE/36_CONFOUNDING_GATE_ALGORITHM.md` §3 / §7，已退役，备份 `C:/Users/RichardYuan/FAR-Lab_Backups/`）。本子节之后，§7.5、§10 及其他章节对"ConfoundingGate 算法 SSOT"的引用一律指向本子节；36 §3 仅作来源溯源（已退役）。
>
> **字段对齐**：伪代码消费 `APPENDIX_A_TYPES.md` §10 `CausalModel` 字段（`nodes` / `edges` / `controlledConfounders` / `unmeasuredConfoundersSuspected`，camelCase）。`snake_case` 仅作 Python 等价示意，不得用于访问附录对象字段。
>
> **实现偏差披露（#12 · 反幻觉·修根因不修症状）**：`src/confounding_gate/` 的运行时实现**未**逐字照抄下方伪代码，两处修正了伪代码的算法缺陷（修正实现 + canonical DAG 单测锁定正确行为，未放宽任何测试期望）：
>
> 1. **`d_separation` collider 语义反转（(1) 伪代码 line 1024-1029）**：伪代码对 collider 取 `if (V ∉ Z 且后代 ∉ Z) → pass（通）；否则 → continue（阻断）`，即「collider 未条件化时放行」。这**反转了**标准 d-separation 的 collider 规则——标准是「collider 默认阻断路径，仅当 V 或其后代 ∈ Z 时才打开」。实现改用 Koller-Friedman *Probabilistic Graphical Models* 的 Bayes-Ball / reachability 标准算法（Phase I 祖域闭包 A = Z ∪ ancestors(Z)；Phase II BFS over `(node, 'up'|'down')` 状态对，collider 在 A 中才放行），并以 canonical DAG 单测（chain `A→B→C` / fork `A←B→C` / collider `A→B←C` × Z=∅ / Z={B}）锁定正确语义。偏差依据见 `src/confounding_gate/d_separation.ts` 文件头注释。
> 2. **`block_backdoor_paths` 路径无关循环（(2) 伪代码 line 1085-1089）**：伪代码 `for path in backdoor_paths: if d_separation(dag, exposure, outcome, Z):` 在每次迭代用**相同参数**调用全局 d-separation（参数不含 `path`）——这是退化 no-op：要么把**所有**后门路径判 blocked、要么全部 unblocked；且当存在 `exposure→outcome` 直接因果边时全局 `d_separation(exposure, outcome, Z)` 恒为 `False`（直接边不可阻断），导致永不出 PASS。实现改用**逐路径阻断** `isPathBlocked(path, Z)`（标准定义：路径被阻断 ⟺ 某中间节点阻断——collider 除非其自身或后代 ∈ Z 否则阻断；非 collider 在 ∈ Z 时阻断），partition 精确到单条路径。偏差依据见 `src/confounding_gate/backdoor.ts` 文件头注释。
>
> **结论**：两处修正均使实现更接近因果推断教科书定义；伪代码保留作设计意图来源，运行时以实现 + canonical 单测为准。下游 `adjudicateConfounding`（§7.5.1 (3)）的三值 outcome 口径（PASS/WARN/FAIL）与 outcome→verdict 映射表（§7.5:955-961）**不变**。

#### (1) `d_separation(dag, X, Y, Z)` — Bayes-Ball / reachability 完整伪代码

判定 X 和 Y 在给定调整集 Z 条件下是否 d-分离。算法：从 X 出发沿无向路径 BFS（Bayes-Ball reachability），收集所有可达节点；若 Y 可达 → d-连接（可能依赖，返回 `False`），否则 d-分离（独立，返回 `True`）。

```python
def d_separation(dag, X, Y, Z):
    """
    判断 X 与 Y 在给定 Z 条件下是否 d-分离。
    返回 True = d-分离（独立）/ False = d-连接（可能依赖）。
    Z = 调整集（对应 CausalModel.controlledConfounders）。
    """
    # Phase 1: 找出 X 与 Y 的祖先集合（用于 collider 后代判断）
    ancestors = get_ancestors(dag, X) | get_ancestors(dag, Y)

    # Phase 2: BFS 遍历无向路径，记录 (当前节点, 上一步节点, 进入方向)
    # direction: 'forward'（沿箭头方向）/ 'backward'（逆箭头方向）
    visited = set()
    queue = deque()
    for neighbor in dag.neighbors(X):
        if dag.has_edge(X, neighbor):      # X → neighbor
            queue.append((neighbor, X, 'forward'))
        if dag.has_edge(neighbor, X):      # neighbor → X
            queue.append((neighbor, X, 'backward'))

    while queue:
        current, prev, direction = queue.popleft()
        if (current, prev, direction) in visited:
            continue
        visited.add((current, prev, direction))
        if current == Y:
            return False  # Y 可达 → d-连接

        # collider 判定：上一步指向 current 且下一步亦从 current 出（i → current ← j）
        is_collider = dag.has_edge(prev, current) and any(
            dag.has_edge(other, current) for other in dag.neighbors(current) if other != prev
        )
        if is_collider:
            # collider 规则：collider 及其后代均不在 Z 中 → 路径通；否则阻断此方向
            if current not in Z and not any(d in Z for d in get_descendants(dag, current)):
                pass  # 允许继续遍历（collider 不阻断）
            else:
                continue  # collider 在 Z 或其后代在 Z → 阻断
        else:
            # 非 collider（链 i→V→j 或分叉 i←V→j）：在 Z 中 → 阻断
            if current in Z:
                continue

        for neighbor in dag.neighbors(current):
            if dag.has_edge(current, neighbor):    # current → neighbor
                queue.append((neighbor, current, 'forward'))
            if dag.has_edge(neighbor, current):    # neighbor → current
                queue.append((neighbor, current, 'backward'))

    return True  # Y 不可达 → d-分离
```

#### (2) `find_backdoor_paths(dag, exposure, outcome)` — DFS 枚举 + 消费 `CausalModel` 字段

找出所有 exposure 到 outcome 的**后门路径**（以指向 exposure 的边开始，即非因果路径）。枚举后，用 `CausalModel.controlledConfounders`（调整集 Z）尝试阻断；`CausalModel.unmeasuredConfoundersSuspected` 用于裁决 outcome 倾向。

```python
def find_backdoor_paths(dag, exposure, outcome):
    """
    枚举所有 exposure → outcome 的后门路径（以指向 exposure 的边开始）。
    返回 list[list[str]]，每个内层 list 是一条路径的 nodeId 序列。
    """
    paths = []

    def dfs(current, path, visited, started_backward):
        if current == outcome and started_backward:
            paths.append(path[:])
            return
        for neighbor in dag.neighbors(current):
            if neighbor in visited:
                continue
            edge_forward = dag.has_edge(current, neighbor)    # current → neighbor
            edge_backward = dag.has_edge(neighbor, current)   # neighbor → current
            if edge_forward:
                if current == exposure and not started_backward:
                    continue  # 不能以 exposure → 开始（那是因果路径，非后门）
                dfs(neighbor, path + [neighbor], visited | {neighbor}, started_backward)
            if edge_backward:
                dfs(neighbor, path + [neighbor], visited | {neighbor}, True)

    dfs(exposure, [exposure], {exposure}, False)
    return paths


def block_backdoor_paths(dag, exposure, outcome, causal_model):
    """
    用 CausalModel.controlledConfounders 作为调整集 Z，对每条后门路径做 d-separation 阻断判定。
    返回 (blocked_paths, unblocked_paths)。
    Z = set(causal_model.controlledConfounders)  ← 消费 APPENDIX_A §10 CausalModel 字段
    """
    backdoor_paths = find_backdoor_paths(dag, exposure, outcome)
    Z = set(causal_model.controlledConfounders)   # 调整集（已控制混淆子）
    blocked, unblocked = [], []
    for path in backdoor_paths:
        if d_separation(dag, exposure, outcome, Z):
            blocked.append(path)
        else:
            unblocked.append(path)
    return blocked, unblocked
```

#### (3) `adjudicate_confounding()` — 三值 outcome（PASS / WARN / FAIL）

确定性混杂裁决——全程无 LLM。综合后门路径阻断结果与 `CausalModel.unmeasuredConfoundersSuspected` 产出三值 outcome。

```python
def adjudicate_confounding(causal_model, exposure, outcome):
    """
    确定性混杂裁决（PASS / WARN / FAIL）。全程无 LLM。
    消费 CausalModel.controlledConfounders（调整集）与 unmeasuredConfoundersSuspected（怀疑未测混淆）。
    """
    dag = build_dag(causal_model.nodes, causal_model.edges)
    blocked, unblocked = block_backdoor_paths(dag, exposure, outcome, causal_model)
    suspected = set(causal_model.unmeasuredConfoundersSuspected)   # 怀疑未测混淆子

    # 判定 outcome（与 §7.5 outcome 缩略表一句话口径一致）：
    #   PASS  = find_backdoor_paths 结果为空（所有后门路径被 controlledConfounders 阻断，d-separation 成立）
    #   WARN  = 存在后门路径但 unmeasuredConfoundersSuspected 为空（路径未阻断但变量全测）
    #   FAIL  = 存在后门路径且 unmeasuredConfoundersSuspected 非空（存在未测量的未阻断混杂）
    if len(unblocked) == 0:
        outcome_val = "PASS"
    elif len(suspected) == 0:
        outcome_val = "WARN"
    else:
        outcome_val = "FAIL"

    unblocked_confounders = sorted({n for path in unblocked for n in path} - {exposure, outcome})
    return ConfoundingGateResult(
        outcome=outcome_val,
        unblockedConfounders=unblocked_confounders,
        blockedConfounders=sorted({n for path in blocked for n in path} - {exposure, outcome}),
        unmeasuredConfounders=sorted(suspected),
        backdoorPaths=find_backdoor_paths(dag, exposure, outcome),
        blockedPaths=blocked,
        unblockedPaths=unblocked,
        rationale=generate_rationale(outcome_val, unblocked_confounders, suspected),
    )
```

> **实现边界（fixture 模版 → 完整运行时，均必须实现）**：fixture 版使用预定义因果 DAG 模版（首个开发里程碑，喂 verdict 决策树·支撑 hero demo 重放）；完整 d-separation 运行时从 `CausalModel` + SciIRNode 推导（完整交付）。fixture/runtime 是诚实分层，非功能裁剪。**禁止路径**：不允许用 LLM 直接输出 `causalDag`/`CausalModel` 再交给 ConfoundingGate 裁决（= LLM 自己定义图结构再自己裁决，违反 F6）。BreakerProbe 的 `citation_lookup` 作为兜底，从外部文献中发现 LLM 漏掉的 confounder。
>
> **CI 验证门**（来源退役档案 36 §8）：CG-1 ConfoundingGate 源码不含 `openai`/`chat.completions`/`llm` 导入（fail-closed）；CG-2 `causalDag` 必须无环（拓扑排序验证）；CG-5 禁 `generateConfounders`/`askLLM`（fail-closed）；CG-6 `generate_rationale` 是纯模版函数（fail-closed）。

### 7.6 与 anti-theater（§8）的集成顺序

```text
VerdictKernelInput
  ├─ fec / bindings / runs / measurements / statistics / deviations
  └─ antiTheaterFindings[]      ◀── §8 anti-theater 产出（kernel 后的约束扫，或 kernel 前的预扫）
        │
        ▼
decide_five_value_verdict(input)   （§7.3）
        │
        ▼
VerdictKernelOutput
  ├─ verdict
  ├─ reasonCodes[]              ◀── 含 anti-theater reasonCode
  ├─ ruleTrace[]
  └─ evidenceSufficiency
        │
        ▼
ProofEnvelope.antiTheaterReport （04 §2）
```

> anti-theater 在 verdict kernel **之后**运行（kernel 先产出初步 verdict，anti-theater 再约束）。anti-theater 只**降级**（把不合规的 `CONFIRMED` 拉下来），**不**主动产 `REFUTED`（`REFUTED` 由 kernel 的 `any_refute` 路径产出）。

---

## 8. Anti-Theater rules

反科研剧场（anti-theater）= 一组 deterministic 检测规则，让"漂亮报告 + 全 PASS + 语言严谨"掩盖的无证伪力证据链，在 `far verify` 与 verdict kernel 面前**变红或变黄**，而不是被静默放行。

> 完整 20 类攻击目录、severity → verdict 约束映射、AntiTheaterScore 算法、CI gates 见 `APPENDIX_E_ANTI_THEATER.md`。本节给出与 FEC/verdict 直接耦合的 15 项强制覆盖规则。

### 8.1 至少覆盖的攻击矩阵（15 项强制 + 5 项扩展）

| 攻击 | attackId | 期望处理 | reasonCode | 落 verdict |
|---|---|---|---|---|
| label-only evidence | AT-LABEL-ONLY | evidence type 最低阈值 + 缺 primary raw artifact | `LABEL_ONLY_EVIDENCE` / `NO_PRIMARY_RAW_ARTIFACT` | `UNTESTED` |
| LLM reviewer override | AT-JUDGE-OVERRIDE | `createdBy !== "deterministic_*"` grep → CI fail | `LLM_AS_FINAL_JUDGE` | fail（CI 阻断） |
| post-hoc threshold | AT-POSTHOC-THRESHOLD | frozen threshold hash vs executed threshold | `POSTHOC_THRESHOLD_DEVIATION` | `UNTESTED` |
| dataset drift | AT-DATA-DRIFT | contentHash / schemaHash / statsFingerprint mismatch | `DATASET_HASH_MISMATCH` / `DATASET_SCHEMA_MISMATCH` / `DATASET_STATS_MISMATCH` | `DEGRADED_SCOPE`（或 recompute required） |
| scope laundering | AT-SCOPE-LAUNDER | verdict 支撑 scope < claim scope → 强制 `DEGRADED_SCOPE`；直接反证优先 | `SCOPE_LAUNDERED` / `REFUTATION_HIDDEN_BY_SCOPE` | `DEGRADED_SCOPE`（或 `REFUTED`） |
| missing raw artifact | AT-MISSING-RAW | `rawArtifactHashes` 缺失 → evidence sufficiency fail | `RAW_ARTIFACT_MISSING` | `UNTESTED` |
| metric swapping | AT-METRIC-SWAP | primary metric frozen hash vs executed metric | `PRIMARY_METRIC_SWAPPED` | `UNTESTED` |
| seed cherry-picking | AT-SEED-CHERRY | seedPolicy hash + run registry 完整性 | `SEED_POLICY_MISMATCH` / `HIDDEN_FAILED_RUN` | `INCONCLUSIVE` 或 fail |
| workflow digest mismatch | AT-WORKFLOW-DIGEST | workflowHash / containerDigest / envHash mismatch | `WORKFLOW_HASH_MISMATCH` 等 | fail（verifier RED） |
| natural-language verdict mismatch | AT-REPORT-MISMATCH | report verdict string ≠ structured verdict | `REPORT_VERDICT_MISMATCH` / `OVERCLAIMING` | fail（structured wins） |
| p-hacking / alpha inflation | AT-PHACK-ALPHA | frozen alpha vs executed alpha（精确比较） | `ALPHA_INFLATION_DEVIATION` | `UNTESTED` |
| HARKing | AT-HARK | `hypothesis.sealedAt > experiment.finishedAt` | `HARKING_REVISION_AFTER_RESULT` | 禁 `CONFIRMED` → `UNTESTED` |
| stopping-rule violation | AT-STOPPING-RULE | interim looks vs declared stopping rule | `STOPPING_RULE_VIOLATION` / `UNREGISTERED_EARLY_STOP` | `UNTESTED` |
| multiple testing uncorrected | AT-PHACK-CORRECTION | `implications.length > 1 && correction === "none"` | `MULTIPLE_TESTING_UNCORRECTED` | `INCONCLUSIVE`（强制降级） |
| optional stopping | AT-OPTIONAL-STOPPING | sequential 无 alpha-spending | `OPTIONAL_STOPPING_NO_SPENDING` | `UNTESTED` / `INCONCLUSIVE` |

**扩展 5 类**（与 `FINAL_PACKAGE/68` §2 对齐，详见 `APPENDIX_E` §2）：AT-FAKE-PASS（全 PASS 伪造）、AT-DATA-HASH-FAKE（伪 datasetHash）、AT-DEP-FLOAT-DRIFT（依赖/浮点 drift）、AT-OVERFIT（benchmark overfit，`ROADMAP`）、AT-FAKE-DEGRADED（fake degraded scope / null laundering）。

### 8.2 severity → verdict 约束映射（取严不取宽）

| severity | 含义 | 对 seal 的影响 | 对 verdict 的影响 |
|---|---|---|---|
| `INFO` | 记录性 | 无 | 无 |
| `WARN` | 软告警 | 无（但 Honesty Wall 展示） | 无（除非累积扣分到阈值） |
| `FAIL` | 硬失败 | 受 `score` 与 `forcedVerdict` 决定 | 按 `forcedVerdict` 降级（取严） |
| `BLOCK` | 拒绝 seal | **直接拒绝 seal**（04 §1） | 强制 `UNTESTED`（不可 seal 即不可 `CONFIRMED`） |

> **纪律**：anti-theater 只"降级"（把不合规的 `CONFIRMED` 拉下来），**不**主动产 `REFUTED`/`CONFIRMED`。`forcedVerdict` 仅 3 值子集：`DEGRADED_SCOPE` / `UNTESTED` / `INCONCLUSIVE`（与 `FINAL_PACKAGE/13` §3.1 `FailureVerdict` 一致，非枚举漂移）。

### 8.3 禁 LLM 边界（F3）

`runAntiTheaterLint` 全程 deterministic。源码中 `grep -rE "openai|chat\.completions|llm_gateway"` 在 anti-theater 模块命中 LLM 调用即 CI fail（`APPENDIX_E` §1）。LLM 可在 finding 产生**后**为人类生成解释文案，但该文案进 `humanSummary`（非 proofHash-critical），**不**进 `reasonCode` / `verdictConstraint`。

---

## 融合织入（Open Science 工程范式迁移·DESIGN_PROPOSED·2026-07-05）

> 来源：`FAR_LAB_MASTER_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md` + `FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md` §C 末段。Open Science = Claude Code 分支重品牌化的执行层 agent 工作区；FAR-Chain = 验证层。迁移边界：只迁工程范式（反剧场 / fail-closed 服务门 / 收窄伪造窗口 / 内容寻址 CAS / derivable 标记 / 进程组 kill / AST 结构门），绝不迁 OS 的 LLM-裁决语义。下述条目原为融合 backlog；当前 FUSION-OS-1..14 已由受控突变双跑写回 `WIRED_GREEN`，唯一剩余红项见 DEPTH_LEDGER §A `P1-3_DASHSCOPE_CI_EVIDENCE`。

### 与本文档（03_EVIDENCE_CONTRACT_AND_VERDICT）相关的融合缺口

- **FUSION-OS-1**（最高杠杆·当前最大活体缺口）：`runAntiTheaterLint` 的 20 个反剧场检测器当前仅 `verify.ts:412` 离线调用，`orchestrator.ts:199` 运行时硬编码 `antiTheaterFindings:[]` → 把检测器输出注入 `buildVerdictKernelInput`，使 R-anti-theater-fail / seed-cherry / R8-warn 在实时 verdict 路径生效（Open Science fail-closed 服务门范式：lint 不通过则 verdict 不可封 CONFIRMED）。
- **FUSION-OS-13**：`StatisticalResult` 加 `derivationForm: literal|derived|formula|auto` 字段；五值内核在 form 不匹配时即使数值相等也降级（如 literal→derived 静默替换）—— Open Science "Agreement is not verification" 范式，反剧场 sentinel-form 可执行化。
- **FUSION-OS-14**（R0-R9 候选新规则·插 R6 前）：`R-identifier-fabrication` —— claim 带可校验 identifier（DOI/arXiv/accession）但无 harness-verified 来源锚点 → REFUTED（非 UNTESTED）；Open Science fabricated-references EXCEPTION 范式。须同步加 golden vector（见 APPENDIX_B）。

> 接线时升 WIRED_RED，物证由 keystone bot CI 双跑写回 WIRED_GREEN（见 DEPTH_LEDGER §D）。取序建议见 CLAUDE.md §4 P-FUSION。

---

## 9. Golden vectors

P0 至少需要 10 个 verdict golden vectors。完整 P0 锁定 12 条（GV-01..GV-12）+ FUSION-OS-13/14 扩展 2 条（GV-13 derivation form mismatch / GV-14 identifier fabrication），覆盖矩阵与实现级 case 内容见 **`APPENDIX_B_GOLDEN.md` §2**。本节给出速查表与覆盖矩阵。

### 9.1 P0 Golden Vector 速查表

| caseId | 场景 | expectedVerdict | decisiveRuleId | 须通过 verifier | 核心反 theater 锚点 |
|---|---|---|---|---|---|
| GV-01 | complete support | `CONFIRMED` | R7 | TS/Py/browser | bounded support；anti-theater self-check |
| GV-02 | complete refute | `REFUTED` | R6 | TS/Py/browser | R6 > R7 优先级 |
| GV-03 | missing FEC | `UNTESTED` | R1 | TS/Py/browser | F1 反 theater；`untestedReason` 非空 |
| GV-04 | missing dataset | `UNTESTED` | R2 | TS/Py/browser | F9 复现失败也是结果 |
| GV-05 | narrower population | `DEGRADED_SCOPE` | R4 | TS/Py/browser | scope laundering 反例；R4 > R7 |
| GV-06 | dataset drift | `DEGRADED_SCOPE` | R4 | TS/Py/browser | statsFingerprint 漂移 |
| GV-07 | underpowered | `INCONCLUSIVE` | R8 | TS/Py/browser | 禁把 underpowered 落 CONFIRMED |
| GV-08 | conflicting metrics | `INCONCLUSIVE` | R5 | TS/Py/browser | 禁挑有利指标 |
| GV-09 | post-hoc threshold | `UNTESTED` | R3 | TS/Py/browser | F8 预登记；harking_risk |
| GV-10 | tampered proof input | (verifier RED) | R0/verifier | TS/Py/browser | tamperStatus='tampered'；三端必红 |
| GV-11 | metric swap + LLM override | `UNTESTED` | R3 | TS/Py/browser | metric swap + LLM 非 judge 双红线 |
| GV-12 | seed cherry-pick | `INCONCLUSIVE` | R8 | TS/Py/browser | seed locked；p_hacking_risk |
| GV-13 | derivation form mismatch | `INCONCLUSIVE` | R_DERIVATION_FORM_MISMATCH | TS/Py/browser | FUSION-OS-13·agreement≠verification |
| GV-14 | identifier fabrication | `REFUTED` | R_IDENTIFIER_FABRICATION | TS/Py/browser | FUSION-OS-14·可校验 identifier 无来源→REFUTED |

### 9.2 原始 10 vector 清单（保留为最小覆盖要求）

与原 §9 一致，作为 P0 最小覆盖要求（12 条满足"≥10 条"）：

| Case | 预期 | 对应 GV |
|---|---|---|
| complete support | `CONFIRMED` | GV-01 |
| complete refute | `REFUTED` | GV-02 |
| missing FEC | `UNTESTED` | GV-03 |
| missing dataset | `UNTESTED` | GV-04 |
| narrower population | `DEGRADED_SCOPE` | GV-05 |
| dataset drift | `DEGRADED_SCOPE` | GV-06 |
| underpowered study | `INCONCLUSIVE` | GV-07 |
| conflicting metrics | `INCONCLUSIVE` | GV-08 |
| post-hoc threshold | fail or `UNTESTED` | GV-09 |
| tampered proof input | verifier RED | GV-10 |

### 9.3 Golden vector 物理存放与运行

```text
<REPOSITORY_ROOT>/golden_vectors/
  ├─ cases/
  │   ├─ GV-01-complete-support.json
  │   ├─ GV-02-complete-refute.json
  │   ├─ ...
  │   └─ GV-12-seed-cherry-pick.json
  ├─ expected/
  │   └─ expected-verdicts.json     # 所有 case 的 expectedVerdict + reasonCodes
  ├─ runners/
  │   ├─ run-node.mjs               # TS verifier driver
  │   ├─ run-python.py              # Python verifier driver
  │   └─ run-browser.html           # browser verifier driver（Web Crypto）
  └─ README.md
```

> 状态：`golden_vectors/` 目录落地状态以 `far status --json` 为准，禁止手填文件数。

```bash
# 三端分别跑
far verify-golden --backend node     --case GV-01
far verify-golden --backend python   --case GV-01
far verify-golden --backend browser  --case GV-01

# 全量对拍
far verify-golden --all --cross-lang
```

输出汇总到 `golden_vectors/runs/<timestamp>/summary.json`，三端任一不一致即 CI 红（已知数值域分叉 case 须显式标 `known_divergence: true` 并从 cross-lang 断言中豁免，见 `APPENDIX_B` §4.4 / `APPENDIX_C` §8）。

> 这些 vectors 必须被 TS、Python、browser verifier 使用；后续 Rust/Go verifier（V2/V3 路线图）亦须对拍。

---

## 10. Formal invariants（指向 V3 · 非 runtime）

> **F10 红线**：CAS/SMT/Formal 是**可选验证工具，非 runtime 依赖**。fresh-clone 无 Lean/Z3/TLA+/Dafny/Alloy 仍可跑 core gate（§7 verdict kernel 全用 TS 确定性实现）。形式化工具不可用时 outcome='unknown'，**禁 LLM fallback**。本节为 V2/V3 形式化锚点，**不**把"形式化方向"吹成"全系统已形式化"。

### 10.1 关键不变量（8 条）

来源 `FINAL_PACKAGE/83` §1（已归档）：

1. 影响 verdict 的字段必须进入 proofHash。
2. protocol freeze 后承重字段变化必须改变 head（`fecHash` 变 → proofHash 变）。
3. 五值裁决互斥（任一输入只输出一个 verdict）。
4. 五值裁决完备（任一输入必输出一个 verdict）。
5. `UNTESTED` 不能误报 `CONFIRMED`。
6. `DEGRADED_SCOPE` 不能隐藏 same-scope refutation。
7. verifier 跨语言输出一致（TS === Python === Browser，已知数值域分叉除外）。
8. append-only log 不允许 update/delete 不留痕（SQLite trigger 守卫）。

### 10.2 Tool Mapping

| Tool | FAR 用途 | 状态 |
|---|---|---|
| TLA+ | state machine / freeze invariant | `RESEARCH`（V2 一条 freeze invariant） |
| Dafny | hash input / verdict function contracts | `RESEARCH`（V3） |
| Lean | V3 proof of exclusivity/completeness（verdict lattice） | `RESEARCH`（V3） |
| Alloy | graph dependency / cycle checks（evidence_graph 无环） | `RESEARCH`（W4 可选） |

### 10.3 TLA+ Sketch（仅文本示例 · 非已写 .tla 文件）

```text
VARIABLES state, fec, evidence, verdict, proofHead

Freeze == state = "FEC_VALIDATED" /\ fecHash' = Hash(fec)
MutateAfterFreeze == state \in {"FEC_FROZEN", "EVIDENCE_BOUND"} /\ fec' # fec
Invariant == MutateAfterFreeze => proofHead' # proofHead
```

### 10.4 Property-based tests（V1 · 已落地的形式化替代）

V1 不依赖 TLA+/Dafny，而是用 property-based tests 守护不变量（来源 `FINAL_PACKAGE/83` §5）：

- random field mutation changes hash（任一 verdict-critical 字段变化 → proofHash 变）；
- random evidence sets output exactly one verdict（五值互斥完备）；
- no evidence always `UNTESTED`；
- scope narrower + refutation priority invariant（R4 vs R6 优先级）；
- proofHash excludes only proofHash field（自指排除）。

### 10.5 V1/V2/V3 形式化范围

| Version | Formal scope | 状态 |
|---|---|---|
| V1 | property tests + golden vectors | `IMPLEMENTED_UNVERIFIED`（property 框架待补；golden vectors `DESIGN_LOCKED`） |
| V2 | TLA+ one freeze invariant + Alloy graph cycle | `RESEARCH` |
| V3 | Dafny/Lean kernel anchors + cross-language conformance | `RESEARCH` |

---

## 11. 端到端示例（C-ASTRO-0001 的 FEC → verdict）

来源 `FINAL_PACKAGE/11` §9 / `FINAL_PACKAGE/66` §4（已归档）。claim：TIC 123456789 光变曲线存在周期约 2.3 天的盒形亮度下降（TESS existence claim，**非因果**，止于 L2）。

### 11.1 FEC（YAML 契约）

```yaml
contractId: FEC-ASTRO-0001
claimId: C-ASTRO-0001
claimType: existence                # 非因果，L3 ConfoundingGate 不强制
domain: astronomy
preregistrationHash: <sha256@prereg>
revisionAfterResult: false
measurableImplications:
  - { implicationId: M1, testKind: frequentist,              primaryMetric: bls_power,         alpha: 0.0125, correction: bonferroni }
  - { implicationId: M2, testKind: deterministic_exact_check, primaryMetric: odd_even_depth_diff }
  - { implicationId: M3, testKind: deterministic_exact_check, primaryMetric: duration_consistency }
  - { implicationId: M4, testKind: deterministic_exact_check, primaryMetric: centroid_shift }
verdictMapping: { all_pass: CONFIRMED, any_refute: REFUTED, data_missing: UNTESTED, scope_narrow: DEGRADED_SCOPE, mixed: INCONCLUSIVE }
```

### 11.2 执行结果（剧本示例 · 非真实跑出 · 待实测）

| M | check | outcome | 备注 |
|---|---|---|---|
| M1 BLS power | frequentist α'=0.0125 | PASS | p<0.0125，检测到周期信号 |
| M2 odd-even | exact check | WARN | 深度差异接近阈值，未明确 FAIL |
| M3 duration | exact check | PASS | 与恒星参数自洽 |
| M4 centroid | exact check | SKIP | 数据 SNR 不足以判质心偏移 |

### 11.3 verdict_mapping 路径推导

- M4 SKIP → 非全 PASS → 不走 `all_pass`；
- M2 WARN → 部分通过部分存疑 → 走 **`mixed`** → **INCONCLUSIVE**；
- integrityFlags：M4 SKIP 不触发 risk flag（诚实 SKIP ≠ 假绿），但 verdict 已降级。

**最终**：`SciIRNode.verdict = INCONCLUSIVE`（与 `APPENDIX_B` GV-07/GV-08 同型；bounded support，非 CONFIRMED）。

> **诚实声明**：上述 M1-M4 outcome 是【剧本示例数字 · 待实测】，非真实 TESS 数据跑出。真实运行时 M4 可能 FAIL（背景食）→ 走 `any_refute` → `REFUTED`，或 M1 也 SKIP → `data_missing` → `UNTESTED`。"检测到周期性下降" ≠ `CONFIRMED`（C15），须 M1-M4 全 PASS 且排除假阳性才可升 `CONFIRMED`（bounded support）。

---

## 12. 诚实边界与 DO_NOT_CLAIM

| 项 | 口径 |
|---|---|
| Verdict 正确性 | Golden vector 验证的是 **deterministic kernel 在固定输入下输出稳定**，**不声称** verdict 本身是科学真理。`CONFIRMED` = bounded support，非证明为真。 |
| LLM 角色 | LLM 可生成 case 草案、可解释 verdict，**不得**作为 verifier 或 kernel 的裁决输入（GV-11 专门锁定此红线）。 |
| FEC compiler | 6 产物全自动编译是设计目标；首里程碑仅交付 3 产物（`stat_lock` + `verdict_mapping` + `proof_checks`）。**不声称** 6 产物全自动已落地。 |
| Sequential alpha-spending | 完整 sequential Type-I error control 为 W5 `ROADMAP`；MVP 仅 static preregistration check。**不声称**已实现完整 spending 计算。 |
| Formal invariants | TLA+/Dafny/Lean 为 V2/V3 `RESEARCH`，F10 非 runtime。**不声称**形式化覆盖整个系统。 |
| 数值域精度 | 数值/统计判定域内部可取 `'unknown'`，但落到 ProofCheck.outcome 必须收窄为 `SKIP`（F5）。**不声称**数值域 verdict 精确。 |
| Tamper detection | GV-10 验证篡改可检测（tamper-evident），**不声称**物理不可篡改。 |
| 因果观察性数据 | `evidenceBasis='observational_only' && confoundingGateStatus='unblocked'` → 强制禁 `CONFIRMED`（F6）。**不声称**观察性数据可确证因果。 |
| 数量统计 | 本文件不写"N 条测试通过""CI 通过率 X%""golden 向量 N 条命中"。运行时数量以 `far status --json` 与 CI 输出为准。 |

---

## 13. 与其他文档的一致性锚点

| 概念 | 本文件写法 | 权威源 |
|---|---|---|
| 五值 enum | `CONFIRMED` / `REFUTED` / `INCONCLUSIVE` / `DEGRADED_SCOPE` / `UNTESTED` | `APPENDIX_A_TYPES` §0（权威）；本文件 §5 |
| 优先级 | `DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED`；细编号 R0..R9 | 本文件 §6；`APPENDIX_B` §1 |
| 规则 id | `R0_SCHEMA_INVALID` .. `R9_ALL_TESTS_SKIPPED` | `APPENDIX_B` §1 |
| verdict_mapping 五路径 | `all_pass` / `any_refute` / `data_missing` / `scope_narrow` / `mixed` | 本文件 §5.2 |
| FEC 类型 | `FecContract` + 子类型（ScopeSpec / MetricSpec / ThresholdSpec / StatisticalPlan / PowerPlan / MultipleTestingPlan / SeedPolicy / DeviationPolicy / ProtocolFreeze / EvidenceRequirement / DatasetRequirement / WorkflowRequirement） | `APPENDIX_A_TYPES` §1-§2（权威） |
| 证据绑定 | `DatasetBinding` / `WorkflowBinding` / `ExperimentRunBinding` | `APPENDIX_A_TYPES` §3（权威） |
| Verdict Kernel I/O | `VerdictKernelInput` / `VerdictKernelOutput` / `VerdictRuleTrace` / Reports | `APPENDIX_A_TYPES` §5（权威） |
| integrityFlags | `harking_risk` / `p_hacking_risk` / `citation_unresolved` / `insufficient_falsification` / `causal_model_mismatch` 等 | `APPENDIX_A_TYPES`；`FINAL_PACKAGE/08` §7（已归档） |
| 路径 | `<REPOSITORY_ROOT>/golden_vectors/` | `01_SOURCE_OF_TRUTH_AND_STATUS.md` §1 |
| proofHash 输入 | claim / FEC / bindings / measurement / statistics / deviations / verdict trace | `04_PROOF_ENVELOPE_AND_VERIFIER.md` §3；`APPENDIX_C_CANONICAL.md` §2.2 |
| tamperStatus 取值 | `clean` / `tampered` / `unknown` | `04_PROOF_ENVELOPE_AND_VERIFIER.md` §5 |
| ConfoundingGate 算法 | d-separation + 后门路径枚举（确定性图算法） | 本文件 §7.5.1（自包含 SSOT）；`FINAL_PACKAGE/36` §3 仅作来源溯源（已退役，备份 `C:/Users/RichardYuan/FAR-Lab_Backups/`） |
| Anti-theater 攻击目录 | 20 类（AT-FAKE-PASS .. AT-FAKE-DEGRADED） | `APPENDIX_E_ANTI_THEATER.md` §2（权威） |
| Golden vectors | GV-01..GV-14 完整 case | `APPENDIX_B_GOLDEN.md` §2（权威） |

> **冲突仲裁**：本文件与 `APPENDIX_A_TYPES.md` / `APPENDIX_C_CANONICAL.md` / `APPENDIX_F_GLOSSARY.md` 冲突时，以三个附录为权威（全局规则 10）。

---

## 14. 来源溯源（物理档案已退役）

本文件并入的深度内容来自以下 `FINAL_PACKAGE/` 编号文档。物理档案已退役，备份位于 `C:/Users/RichardYuan/FAR-Lab_Backups/`。旧编号 → 本文件位置的映射作为**来源溯源**保留（非有效运行时依赖）。本文件内容已**完整并入**，不依赖 FINAL_PACKAGE 作为运行时引用。

| 旧来源（FINAL_PACKAGE，已归档） | 并入内容 | 并入位置（本文件） | 备份位置 |
|---|---|---|---|
| `08_SCIIR_SPEC.md` §1.1-§1.3 | CausalModel / FalsificationSpec / SourceAnchor 字段（FEC 三件套） | §1.2 / §3（引用 APPENDIX_A） | `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/08_*.md` |
| `08_*.md` §9 | MeasurableImplication 与 POPPER 映射 | §1.4 / §11.1 | 同上 |
| `09_PROOF_CARRYING_RESEARCH_OBJECT.md` §1-§3 | ProofEnvelope / ProofCheck / VerdictNode 与 verdict kernel 的衔接 | §7.6（引用 04 / APPENDIX_A） | `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/09_*.md` |
| `11_FALSIFICATION_ENGINE.md` §1.1-§1.2 | FEC YAML 契约 + compiler 六产物 | §1.3 / §1.4 | `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/11_*.md` |
| `11_*.md` §2-§3 | L7 三层 + verdict_mapping 五路径 | §5.2 / §7.5 | 同上 |
| `11_*.md` §4.1 | F8 三重约束同时开关 | §4.3 | 同上 |
| `11_*.md` §9 | C-ASTRO-0001 端到端示例 | §11 | 同上 |
| `36_CONFOUNDING_GATE_ALGORITHM.md` §3 / §7 | ConfoundingGate d-separation 算法 + 与 verdict_mapping 集成 | §7.5 / §7.5.1（自包含 SSOT） | `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/36_*.md` |
| `66_FEC_TO_STATISTICAL_VERDICT_CLOSED_LOOP_DESIGN.md` §2-§3 | FEC V2 schema + JSON Schema 草案 | §1.2 / §1.3 | `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/66_*.md` |
| `66_*.md` §5 | 算法草案（与 §7.3 伪代码对齐） | §7.3 | 同上 |
| `66_*.md` §6-§7 | proofHash 输入清单 + failure vectors | §3 / §8 | 同上 |
| `67_DETERMINISTIC_FIVE_VALUE_VERDICT_ENGINE.md` §2-§4 | VerdictKernelInput/Output + R0-R9 规则优先级 | §6.2 / §7.1 / §7.2 | `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/67_*.md` |
| `67_*.md` §5-§6 | 五值规则 + deterministic tie-break | §5.1 / §6.3 | 同上 |
| `67_*.md` §8-§9 | 测试计划 + 红队案例 | §9（指向 APPENDIX_B） | 同上 |
| `81_STATISTICAL_FALSIFICATION_AND_P_HACKING_DEFENSE.md` §2-§5 | StatisticalPlan 全字段 + StoppingRule + sequential | §4.1 / §4.4 | `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/81_*.md` |
| `81_*.md` §3 | P-Hacking 检测规则矩阵 | §4.5 | 同上 |
| `83_FORMAL_SPECIFICATION_AND_VERDICT_INVARIANTS.md` §1-§6 | 8 条关键不变量 + Tool Mapping + V1/V2/V3 | §10 | `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/83_*.md` |

> 后续维护引用本文件与 `APPENDIX_A/B/C/E/F` 即可，不再回引旧 FINAL_PACKAGE 编号作为有效依赖。
