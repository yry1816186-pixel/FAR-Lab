# 附录 B · Golden Vector 目录（P0 权威集）

> 本附录是 FAR-Chain **verdict / 验证 golden vector 主题的唯一权威集中处**。
> 它从 `FINAL_PACKAGE/67_DETERMINISTIC_FIVE_VALUE_VERDICT_ENGINE.md`、`FINAL_PACKAGE/11_FALSIFICATION_ENGINE.md`、`FINAL_PACKAGE/66_FEC_TO_STATISTICAL_VERDICT_CLOSED_LOOP_DESIGN.md` 与现有 `FAR_LAB_MASTER_PLAN/03`、`04` 增补深度（**不是推倒重写**），把分散在源文件中的红队案例、failure vector、anti-theater 规则收敛为可执行、可对拍的 P0 vector 集。
>
> **路径约定**：所有路径使用 `<REPOSITORY_ROOT>/`（见 `01_SOURCE_OF_TRUTH_AND_STATUS.md` §1）。`far-chain/` 仅作为历史规划路径出现，不作为真实实现根。
>
> **裁决枚举**（与 `03_EVIDENCE_CONTRACT_AND_VERDICT.md` §5、APPENDIX_A_TYPES 权威对齐，**禁止第六值**）：
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
> **LLM 边界**：LLM 不得作为最终裁决者。所有 verdict 由 deterministic verdict kernel 经固定优先级规则表产出（见 `FINAL_PACKAGE/67` §4、`03` §7）。本附录中任何 case 的 `expectedVerdict` 均为 deterministic kernel 输出，不接受 LLM reviewer 的覆盖（case GV-11 专门验证此红线）。

---

## 0. 本附录的状态纪律

| 模块 | 状态 | 说明 |
|---|---|---|
| 五值裁决 enum | `DESIGN_LOCKED` | enum 闭包已锁死，禁新增第六值 |
| verdict kernel 规则优先级（R0-R9） | `DESIGN_LOCKED` | 来源 `FINAL_PACKAGE/67` §4 |
| P0 golden vector 集（GV-01..GV-12） | `DESIGN_LOCKED` | 本附录锁定；新增 case 须走 §6 维护流程。GV-13/GV-14 为 FUSION-OS-13/14 扩展（见 §2），同样走本附录 |
| TS verifier 对拍 | `Pending` | 工程落地状态以 `far status --json` 为准，禁止手填测试数 |
| Python verifier 对拍 | `Pending` | 同上 |
| Browser verifier 对拍 | `Pending` | 同上 |
| 跨语言 byte-equal（数值域边界） | `NEEDS_EXTERNAL_VERIFICATION` | 见 §4.4：RFC 8785 JCS 数值域边界按 `NUMERIC_KNOWN_DIVERGENCE` 归已知分叉 |

> **禁止手填裸数字**：本附录不出现“N 条测试通过”“CI 通过率 X%”等手填统计。涉及数量时一律写 `Pending` 或引用 `far status --json`。

---

## 1. Verdict Kernel 规则优先级（裁决 SSOT，所有 case 的推导依据）

来源：`FINAL_PACKAGE/67_DETERMINISTIC_FIVE_VALUE_VERDICT_ENGINE.md` §4，与 `03_EVIDENCE_CONTRACT_AND_VERDICT.md` §6 的 `DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED` 一致。本附录给出更细的 R0-R9 编号，作为每个 golden vector `expectedReasonCodes` 的可追溯锚点。

| 优先级 | ruleId | 触发条件（确定性） | 落 verdict |
|---|---|---|---|
| 0 | `R0_SCHEMA_INVALID` | ProofEnvelope / FEC schemaVersion 不被 verifier 支持 | `UNTESTED` |
| 1 | `R1_FEC_NOT_COMPILABLE` | FEC 缺可测 implication / 缺 metric / 缺 threshold / 缺 stat plan / 缺多重检验声明 | `UNTESTED` |
| 2 | `R2_NO_VALID_DATASET_BINDING` | datasetRequirements 无任一被 `DatasetBindingSpec` 满足；或 `sourceAnchor.resolved=false` | `UNTESTED` |
| 3 | `R3_CRITICAL_PROTOCOL_DEVIATION` | FEC 不可编译已过，但执行期 critical deviation（post-hoc alpha、late exclusion、stopping rule 违反、measurement code fail）使主检验无效 | `UNTESTED` |
| 4 | `R4_SCOPE_MISMATCH_NONCRITICAL` | 证据覆盖范围窄于 claim scope（population/time/domain），scope 降级规则已在 FEC 冻结，且无同 scope 显著反证 | `DEGRADED_SCOPE` |
| 5 | `R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE` | support 与 refute 均显著，或 multi-implication 部分显著 PASS 部分 FAIL 且无法统一 | `INCONCLUSIVE` |
| 6 | `R6_PRIMARY_TEST_REFUTES` | primary test adjusted p ≤ α 且 effectDirection=refutes，或 negative control 失效，或 contradiction 跨冻结反证阈值 | `REFUTED` |
| 7 | `R7_PRIMARY_TEST_CONFIRMS` | 所有 hard gate PASS：adjusted p ≤ α、effectDirection=supports、observed effect size ≥ minimum、power PASS、无 critical deviation、无同 scope 显著反证 | `CONFIRMED`（bounded support） |
| 8 | `R8_INSUFFICIENT_POWER_OR_NULL` | primary test ran 但 adjusted p > α，或功效不足（post-hoc power < target），或 effect too small，或 assumption WARN-but-not-critical | `INCONCLUSIVE` |
| 9 | `R9_ALL_TESTS_SKIPPED` | 所有 primary test `status='skipped'`，但 FEC 可编译、dataset 已绑定、无 critical deviation | `UNTESTED` |

**tie-break 规则**（来源 `FINAL_PACKAGE/67` §6）：

```text
sort evidence by (evidenceId, sourceHash)
sort tests by testId
apply rules R0..R9 in fixed order
first decisive rule wins
emit all skipped/warned rules in trace
```

**不得使用的输入**（违反=verifier 红）：

- LLM 自然语言解释作为 verdict 输入；
- wall-clock 当前时间（除非是已 hash 的 sealed/frozen 时间戳）；
- 未 canonical sort 的对象 key 迭代；
- locale-sensitive 字符串比较。

---

## 2. P0 Golden Vector 目录（GV-01 .. GV-14）

每个 case 给出：`caseId`、输入摘要（FEC / 数据 / workflow / 统计结果的关键取值）、`expectedVerdict`、`expectedReasonCodes`、须通过的 verifier（TS / Python / browser）、边界条件。

> **覆盖矩阵**：GV-01 complete support / GV-02 complete refute / GV-03 missing FEC / GV-04 missing dataset / GV-05 narrower population / GV-06 dataset drift / GV-07 underpowered / GV-08 conflicting metrics / GV-09 post-hoc threshold / GV-10 tampered proof input / GV-11 metric swap / GV-12 seed cherry-pick / **GV-13 derivation form mismatch（FUSION-OS-13）** / **GV-14 identifier fabrication（FUSION-OS-14）**。共 14 条（P0 基线 12 + FUSION 扩展 2），满足 P0“≥10 条”要求。

> **统一数值约定**：除非 case 显式声明，所有 α 校正后 `adjustedPValue`、effect size、CI 均为 deterministic 浮点比较，容差 `1e-7`（见 §4.1）。所有 hash 为 64 位小写十六进制 sha256。

---

### GV-01 · complete support → CONFIRMED

| 字段 | 取值 |
|---|---|
| caseId | `GV-01` |
| 场景 | complete support |
| FEC | `contractVersion='FEC/2.0'`；单一 measurable implication M1，`primaryMetric='bls_power'`，`direction='greater'`，`alpha=0.0125`，`correction='bonferroni'`（n=8），`seedPolicy={seed:42,locked:true}`，`statLock.lockedAt` 早于实验结果时间，`revisionAfterResult=false` |
| dataset | 1 个 `DatasetBindingSpec`，`contentHash` 匹配 `datasetRequirements[0]`，`sourceAnchor.resolved=true` |
| workflow | `WorkflowBinding.environmentHash` 匹配，`seedPolicy.seed=42`，`networkPolicy='off'` |
| 统计结果 | `StatisticalTestResult{testId:'M1', status:'ran', effectDirection:'supports', pValue:0.003, adjustedPValue:0.003, effectSizeObserved:0.62, confidenceInterval:[0.21,0.95], assumptionDiagnostics:[]}` |
| expectedVerdict | `CONFIRMED` |
| expectedReasonCodes | `['R7_PRIMARY_TEST_CONFIRMS']` |
| decisiveRuleId | `R7_PRIMARY_TEST_CONFIRMS` |
| 须通过 verifier | TS / Python / browser |
| 边界条件 | `adjustedPValue (0.003) ≤ alpha (0.0125)` 为严格 `≤`，不是 `<`；effect size 0.62 ≥ minimumDetectable（设为 0.2）；CI 下界 0.21 > 0；无 critical deviation；无同 scope 显著反证。**bounded support**：输出 `CONFIRMED` 但 `humanExplanationTemplateId` 渲染“满足冻结契约”而非“证明为真”。 |

**反 theater 自检**：若把 `assumptionDiagnostics` 注入一条 WARN，kernel 必须降级为 `INCONCLUSIVE`（R8），不得假装 `CONFIRMED`。

---

### GV-02 · complete refute → REFUTED

| 字段 | 取值 |
|---|---|
| caseId | `GV-02` |
| 场景 | complete refute |
| FEC | 同 GV-01 结构，但 `direction='greater'`，对应 `nullHypothesis='effect ≤ 0'` |
| dataset | 同 GV-01（binding 有效） |
| workflow | 同 GV-01 |
| 统计结果 | `StatisticalTestResult{status:'ran', effectDirection:'refutes', pValue:0.0008, adjustedPValue:0.0008, effectSizeObserved:-0.71, confidenceInterval:[-1.05,-0.34], assumptionDiagnostics:[]}` |
| expectedVerdict | `REFUTED` |
| expectedReasonCodes | `['R6_PRIMARY_TEST_REFUTES']` |
| decisiveRuleId | `R6_PRIMARY_TEST_REFUTES` |
| 须通过 verifier | TS / Python / browser |
| 边界条件 | `adjustedPValue (0.0008) ≤ alpha` 且 `effectDirection='refutes'`；CI 上界 -0.34 < 0（整个区间在 0 以下）；negative control 须 `PASS`（否则触发 R5 而非 R6）。优先级 R6 高于 R7，故即便另有次要支持指标 PASS，也不得输出 `CONFIRMED`。 |

**红队旁注**（来源 `FINAL_PACKAGE/67` §9 "direct contradiction"）：若同时存在 support p=0.04 与 refute p=0.001，按优先级 R6 > R7 落 `REFUTED`；若两者 p 值同向同级显著，则落 R5 `INCONCLUSIVE`（见 GV-08）。

---

### GV-03 · missing FEC → UNTESTED

| 字段 | 取值 |
|---|---|
| caseId | `GV-03` |
| 场景 | missing FEC |
| FEC | `frozenFec = null`（未提交）；或 FEC 缺 `measurableImplications`（空数组）；或缺 `metric` / `threshold` |
| dataset | 任取（kernel 在 FEC 校验阶段即短路） |
| workflow | 任取 |
| 统计结果 | `[]`（未执行） |
| expectedVerdict | `UNTESTED` |
| expectedReasonCodes | `['R1_FEC_NOT_COMPILABLE']` |
| decisiveRuleId | `R1_FEC_NOT_COMPILABLE` |
| 须通过 verifier | TS / Python / browser |
| 边界条件 | 缺 `measurableImplications` / 缺 `primaryMetric` / 缺 `thresholdValue` / 缺 `statisticalPlan` 任一即 `R1` 命中。`untestedReason` 必须非空（反 theater：F1）。不得回退到 `INCONCLUSIVE`——“未测试”与“测试了但不确定”互斥。 |

---

### GV-04 · missing dataset → UNTESTED

| 字段 | 取值 |
|---|---|
| caseId | `GV-04` |
| 场景 | missing dataset |
| FEC | 有效（R1 过） |
| dataset | `datasetBindings=[]`；或唯一 binding 的 `contentHash` 与 `datasetRequirements[0]` 不匹配；或 `sourceAnchor.resolved=false` |
| workflow | 任取 |
| 统计结果 | `[]` |
| expectedVerdict | `UNTESTED` |
| expectedReasonCodes | `['R2_NO_VALID_DATASET_BINDING']` |
| decisiveRuleId | `R2_NO_VALID_DATASET_BINDING` |
| 须通过 verifier | TS / Python / browser |
| 边界条件 | 禁止伪造数据补全（F9：复现失败也是结果）。`untestedReason` 含 `EVIDENCE_MISSING`。区别于 GV-06：GV-04 是“完全没有有效 binding”，GV-06 是“binding 存在但内容漂移”。 |

---

### GV-05 · narrower population → DEGRADED_SCOPE

| 字段 | 取值 |
|---|---|
| caseId | `GV-05` |
| 场景 | narrower population（scope laundering 反例） |
| FEC | `claimScope.population='adults 18-65, all sexes'`；`scopeDegradationRule` 已冻结：`{narrowerPopulationAllowed:true, mustReport:true}` |
| dataset | binding 有效，但 `scopeCoverage.population='adults 25-40, male only'`（窄于 claim） |
| workflow | 同 GV-01 |
| 统计结果 | M1 `ran`、`supports`、adjustedPValue=0.004（数值上满足 CONFIRMED 条件） |
| expectedVerdict | `DEGRADED_SCOPE` |
| expectedReasonCodes | `['R4_SCOPE_MISMATCH_NONCRITICAL']` |
| decisiveRuleId | `R4_SCOPE_MISMATCH_NONCRITICAL` |
| 须通过 verifier | TS / Python / browser |
| 边界条件 | **R4 优先级高于 R7**：尽管统计上全 PASS，scope mismatch 必须先判，不得用统计绿灯洗白 scope（来源 `FINAL_PACKAGE/67` §4 "scope laundering → DEGRADED_SCOPE"、`FINAL_PACKAGE/11` §3 `scope_narrow` 路径）。输出必须含非空 `scopeSlipText` 与 impacted scope edges。**若同一 scope 内存在显著反证，则降级为 R6 REFUTED 或 R5 INCONCLUSIVE，不得用 DEGRADED_SCOPE 隐藏反证**（见 `FINAL_PACKAGE/67` §4 优先级原则第二条）。 |

---

### GV-06 · dataset drift → DEGRADED_SCOPE

| 字段 | 取值 |
|---|---|
| caseId | `GV-06` |
| 场景 | dataset drift |
| FEC | 有效；`datasetRequirements[0].contentHash='<hash-A>'` |
| dataset | binding `contentHash='<hash-A>'`（声明匹配）但 `statsFingerprint` 与 frozen baseline 不一致；`schemaHash` 一致 |
| workflow | 同 GV-01 |
| 统计结果 | M1 `ran`、`supports`，但 `assumptionDiagnostics` 含 `{kind:'distribution_drift', severity:'warn'}` |
| expectedVerdict | `DEGRADED_SCOPE` |
| expectedReasonCodes | `['R4_SCOPE_MISMATCH_NONCRITICAL', 'DATASET_DRIFT_WARN']` |
| decisiveRuleId | `R4_SCOPE_MISMATCH_NONCRITICAL` |
| 须通过 verifier | TS / Python / browser |
| 边界条件 | `statsFingerprint` 漂移为非 critical（数据仍可用，但 scope 收窄）。若 drift 严重到 `severity='critical'`（如 schemaHash 也不匹配），升 R3 `UNTESTED`，不得静默 DEGRADED。来源 `FINAL_PACKAGE/66` §7 failure vector "dataset hash 同名不同内容 → binding hash 改变；verifier 红"。 |

---

### GV-07 · underpowered → INCONCLUSIVE

| 字段 | 取值 |
|---|---|
| caseId | `GV-07` |
| 场景 | underpowered study |
| FEC | 有效；`powerAssumption={targetPower:0.8, plannedN:120, rationale:'...'}；effectSize.minimumDetectable=0.3` |
| dataset | binding 有效，但实际 `plannedN` 未达；post-hoc power=0.42 |
| workflow | 同 GV-01 |
| 统计结果 | M1 `ran`、`effectDirection='neutral'`、adjustedPValue=0.18（> α）、`effectSizeObserved=0.08`（< 0.3）、assumptionDiagnostics=[] |
| expectedVerdict | `INCONCLUSIVE` |
| expectedReasonCodes | `['R8_INSUFFICIENT_POWER_OR_NULL']` |
| decisiveRuleId | `R8_INSUFFICIENT_POWER_OR_NULL` |
| 须通过 verifier | TS / Python / browser |
| 边界条件 | 三种触发任一即 R8：(a) adjusted p > α；(b) post-hoc power < target；(c) effect size < minimumDetectable。本 case 三者同时成立。**禁止把 underpowered 落 `CONFIRMED`**（来源 `FINAL_PACKAGE/67` §5 INCONCLUSIVE 条件）。`untestedReason` 留空（已测试，只是不确定）。 |

---

### GV-08 · conflicting metrics → INCONCLUSIVE

| 字段 | 取值 |
|---|---|
| caseId | `GV-08` |
| 场景 | conflicting metrics |
| FEC | 多 implication：M1 `direction='greater'`，M2 `direction='less'`（互斥方向） |
| dataset | binding 有效 |
| workflow | 同 GV-01 |
| 统计结果 | M1 `ran`、`supports`、adjustedPValue=0.009（≤ α）；M2 `ran`、`supports`（即 M2 方向也显著，与 M1 冲突）、adjustedPValue=0.011 |
| expectedVerdict | `INCONCLUSIVE` |
| expectedReasonCodes | `['R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE']` |
| decisiveRuleId | `R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE` |
| 须通过 verifier | TS / Python / browser |
| 边界条件 | R5 优先级介于 R4（DEGRADED）与 R6（REFUTED）之间：scope 无 mismatch、无单向显著反证、但 multi-implication 显著结果互相矛盾。**禁止挑有利指标单报**（来源 `FINAL_PACKAGE/67` §5 INCONCLUSIVE 第 1 条 "support/refute evidence conflict"；`FINAL_PACKAGE/11` §3 `mixed` 路径）。 |

---

### GV-09 · post-hoc threshold → fail (UNTESTED via critical deviation)

| 字段 | 取值 |
|---|---|
| caseId | `GV-09` |
| 场景 | post-hoc threshold（HARKing 反例） |
| FEC | `frozenFec` 中 `alpha=0.0125`；但 `ProtocolDeviationLog` 含 `{kind:'alpha_rewrite', frozen:0.0125, used:0.05, detectedAt:'post-result', severity:'critical'}` |
| dataset | binding 有效 |
| workflow | 同 GV-01 |
| 统计结果 | M1 `ran`、`supports`、**但 `adjustedPValue` 是用篡改后的 0.05 算出的** |
| expectedVerdict | `UNTESTED` |
| expectedReasonCodes | `['R3_CRITICAL_PROTOCOL_DEVIATION', 'ALPHA_REWRITE_DETECTED']` |
| decisiveRuleId | `R3_CRITICAL_PROTOCOL_DEVIATION` |
| 须通过 verifier | TS / Python / browser |
| 边界条件 | post-hoc alpha 改写是 critical deviation（来源 `FINAL_PACKAGE/66` §9 "post-hoc hypothesis rewriting"、`FINAL_PACKAGE/11` §4.1 F8）。R3 优先级高于 R7，因此即便数值上"显著"也强制落 `UNTESTED`，**禁止用篡改后的 α 蒙混 CONFIRMED**。`integrityFlags += 'harking_risk'`。`untestedReason` 非空。 |

---

### GV-10 · tampered proof input → verifier RED

| 字段 | 取值 |
|---|---|
| caseId | `GV-10` |
| 场景 | tampered proof input |
| FEC | envelope 内 `fecSnapshot` 与 envelope 外独立计算的 `fecHash` 不一致（fec.json 被替换） |
| dataset | binding `contentHash` 被手动改为另一值 |
| workflow | run-1.json 的 `outputHashes` 被改 |
| 统计结果 | `verdict.json` 的 `verdict` 字段被手改为 `CONFIRMED`（原本是 `INCONCLUSIVE`） |
| expectedVerdict（envelope 内字段） | `CONFIRMED`（被篡改值） |
| expectedVerifierStatus | `FAIL` / `tamperStatus='tampered'` |
| expectedReasonCodes（diff report） | `['PROOF_HASH_MISMATCH', 'FEC_HASH_MISMATCH', 'DATASET_HASH_MISMATCH', 'VERDICT_TRACE_MISMATCH']` |
| decisiveRuleId | `R0_SCHEMA_INVALID` 或 verifier-level FAIL（不进入 verdict kernel） |
| 须通过 verifier | TS / Python / browser（三端必须都红） |
| 边界条件 | 本 case 不测 kernel 输出，**测 verifier 能否检测篡改**。`far verify` 输出 `status='FAIL'`，`diff report` 必须定位到具体字段（见 `04_PROOF_ENVELOPE_AND_VERIFIER.md` §8）。browser verifier 的 tamper demo 须真实修改 verdict-critical 字段（不得伪造 demo）。篡改 detection 不依赖 LLM。 |

**重要**：tampered case 的 `expectedVerdict` 字段记的是"被篡改后的 envelope 内值"，**不是合法 verdict**。合法行为是 verifier 全红。这区别于其他 case：GV-10 的断言对象是 verifier 而非 kernel。

---

### GV-11 · metric swap → UNTESTED (LLM override guard)

| 字段 | 取值 |
|---|---|
| caseId | `GV-11` |
| 场景 | metric swap + LLM reviewer override（双重 anti-theater） |
| FEC | frozen `primaryMetric='bls_power'`；执行期 measurement 用了 `secondaryMetric='chi_square'` 并上报 `CONFIRMED` |
| dataset | binding 有效 |
| workflow | 同 GV-01 |
| 统计结果 | 用 `chi_square` 算出 adjustedPValue=0.002，方向 supports；但 `StatisticalTestResult.testId` 与 frozen `primaryMetric` 不对应 |
| 旁路输入 | 一条 `EvidenceRecord`，`source='llm-reviewer'`，`proposedDirection='supports'`，自然语言写"该结果高度显著，应判 CONFIRMED" |
| expectedVerdict | `UNTESTED` |
| expectedReasonCodes | `['R3_CRITICAL_PROTOCOL_DEVIATION', 'METRIC_SWAP_DETECTED']` |
| decisiveRuleId | `R3_CRITICAL_PROTOCOL_DEVIATION` |
| 须通过 verifier | TS / Python / browser |
| 边界条件 | 双红线：(1) metric swap 是 critical deviation（来源 `FINAL_PACKAGE/66` §7 "multiple tests 无 correction / metric 替换"、`03` §8 anti-theater "metric swapping → UNTESTED"）；(2) **LLM reviewer 单独不能 CONFIRMED/REFUTED**（来源 `FINAL_PACKAGE/67` §8 测试计划 `llm_evidence_guard`、`FINAL_PACKAGE/11` §1.1 F8、`03` §8 "LLM reviewer override → fail"）。即便移除 metric swap，仅凭 LLM evidence 也不得升 CONFIRMED。`integrityFlags += 'p_hacking_risk'`。 |

---

### GV-12 · seed cherry-pick → INCONCLUSIVE

| 字段 | 取值 |
|---|---|
| caseId | `GV-12` |
| 场景 | seed cherry-pick |
| FEC | `seedPolicy={seed:42, locked:true}`（预登记 seed=42） |
| dataset | binding 有效 |
| workflow | `WorkflowBinding.seedPolicy.seed=137`（被换 seed）；`runRegistry` 显示 seed=42 时 adjustedPValue=0.34（不显著），seed=137 时 adjustedPValue=0.008（显著），只上报后者 |
| 统计结果 | 上报的 M1 `ran`、`supports`、adjustedPValue=0.008 |
| expectedVerdict | `INCONCLUSIVE` |
| expectedReasonCodes | `['R8_INSUFFICIENT_POWER_OR_NULL', 'SEED_CHERRY_PICK_WARN']` |
| decisiveRuleId | `R8_INSUFFICIENT_POWER_OR_NULL` |
| 须通过 verifier | TS / Python / browser |
| 边界条件 | seed cherry-pick 触发 `integrityFlags += 'p_hacking_risk'`（来源 `FINAL_PACKAGE/11` §4.1 F8 "换 seed = p-hacking"、`03` §8 "seed cherry-picking → INCONCLUSIVE 或 fail"）。`runRegistry`（anti-theater）须记录已知失败 run（seed=42），缺记录则 verifier WARN。若 seed 偏离且无 run registry，升 R3 critical deviation → `UNTESTED`。本 case 设 runRegistry 存在，故降级为 R8 `INCONCLUSIVE`。 |

### GV-13 · derivation form mismatch → INCONCLUSIVE

| 字段 | 取值 |
|---|---|
| caseId | `GV-13` |
| 场景 | derivation form mismatch（literal 被静默换为 derived·数值相等） |
| FEC | `statisticalPlan.expectedDerivationForm='literal'`（预登记原始测量形态） |
| dataset | binding 有效 |
| workflow | seed locked；无 protocol deviation |
| 统计结果 | `statistics[].derivationForm='derived'`（与预登记 `literal` 不符·p=0.008 supports、effectSize=0.62 数值本身合格） |
| expectedVerdict | `INCONCLUSIVE` |
| expectedReasonCodes | `['R_DERIVATION_FORM_MISMATCH']` |
| decisiveRuleId | `R_DERIVATION_FORM_MISMATCH` |
| 须通过 verifier | TS / Python / browser |
| 边界条件 | FUSION-OS-13「Agreement-is-not-verification」反 theater 范式：即便统计数值支持 claim，只要 evidence 的 `derivationForm` 与 FEC 预登记的 `expectedDerivationForm` 不符（literal↔derived↔formula↔auto），内核即降级。防「数值对得上但来源形态被偷换」的静默伪造。零回归 GV-01..12（既有 12 case 无 derivationForm 字段·formMismatch 恒 false·R0-R9 cascade 字节不变）。 |

### GV-14 · identifier fabrication → REFUTED

| 字段 | 取值 |
|---|---|
| caseId | `GV-14` |
| 场景 | identifier fabrication（claim 引用可校验 identifier 但无 harness-verified 来源） |
| FEC | `claimIdentifiers` 含可校验 identifier（DOI / arXiv / accession / author_year） |
| dataset | binding 有效 |
| workflow | 无 protocol deviation |
| 统计结果 | 统计本身支持（supports） |
| expectedVerdict | `REFUTED` |
| expectedReasonCodes | `['UNVERIFIED_IDENTIFIER']` |
| decisiveRuleId | `R_IDENTIFIER_FABRICATION` |
| 须通过 verifier | TS / Python / browser |
| 边界条件 | FUSION-OS-14「fabricated-references EXCEPTION」反 theater 范式：claim 带可校验 identifier（DOI/arXiv/accession/author_year）但无 harness-verified 来源 → `REFUTED`（非 `UNTESTED`·五值优先级 REFUTED>UNTESTED）。插 R5 后 R6 前·三态：not_found=REFUTED / unresolved=UNTESTED / resolved=不触发·unresolved 优先。caller opt-in 接线。零回归 GV-01..13。 |

---

## 3. Golden Vector 汇总速查表

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
| GV-13 | derivation form mismatch | `INCONCLUSIVE` | R_DERIVATION_FORM_MISMATCH | TS/Py/browser | agreement≠verification；form 偷换降级 |
| GV-14 | identifier fabrication | `REFUTED` | R_IDENTIFIER_FABRICATION | TS/Py/browser | 可校验 identifier 无来源 → REFUTED（非 UNTESTED） |

---

## 4. Verifier 对拍规则（TS / Python / browser 三端）

### 4.1 浮点比较容差（1e-7）

所有 verdict-critical 数值比较（`adjustedPValue ≤ alpha`、`effectSizeObserved ≥ minimumDetectable`、CI 边界、power）使用确定性浮点比较，容差 `1e-7`：

```text
|a - b| ≤ 1e-7  →  视为相等
a ≤ b + 1e-7    →  视为 a ≤ b（防边界误判）
```

**边界 case 设计要求**：每个 verdict-critical 数值阈值必须有"恰好等于阈值 ± 1e-9"的边界子 case。例如 GV-01 须有子 case：`adjustedPValue === alpha (0.0125)` 时仍判 `CONFIRMED`（`≤` 含等号）；`adjustedPValue === alpha + 1e-8` 时判 `INCONCLUSIVE`（R8）。

**三端一致**：TS、Python、browser 三端必须用**同一**比较函数与同一容差；不得一端用 `<`、另一端用 `≤`。CI `golden_vector_cross_lang.test.ts`（或等价）断言三端输出逐字相等。

### 4.2 Unicode 与字符串处理

- claim text / scope text 可含 Unicode（CJK、emoji、组合字符）；canonical 序列化使用 NFC 归一化后再 sha256。
- hash 输入**禁用 locale-sensitive 字符串比较**（来源 `FINAL_PACKAGE/67` §6）。所有 sort 使用 codepoint order 或 `fast-json-stable-stringify`（TS）/ `json.dumps(sort_keys=True, ensure_ascii=False)`（Python）。
- golden vector 的 `caseId` 仅用 ASCII（`GV-01`..`GV-12`），不参与 hash。

### 4.3 null / undefined / 字段排序 / 时间格式

| 边界 | 规则 |
|---|---|
| `null` vs 缺字段 | TS 侧 `undefined` 与 `null` 在 canonical 序列化前必须先归一为统一的 `null`（缺字段 = null，不得二者混用）。Python 侧无 `undefined`，仅 `None`。 |
| 字段排序 | canonical JSON 必须递归 sort key（TS `fast-json-stable-stringify@^2.1`；Python `sort_keys=True`）。字段乱序不得改变 hash（来源 `FINAL_PACKAGE/66` §8 `property_fec_hash`）。 |
| 时间格式 | 所有时间戳为 ISO-8601 UTC（`Z` 后缀，如 `2026-07-01T12:00:00Z`）。`frozenAt` / `sealedAt` 进入 proofHash；wall-clock 当前时间**不**进入 hash。 |
| 数字格式 | 整数无小数点；浮点不强制科学计数。**已知分叉**：RFC 8785 JCS 数值域（如指数零填充）TS/Python 序列化可能不一致，按 `NUMERIC_KNOWN_DIVERGENCE` 归 RED，待 V3 迁移（见 `FINAL_PACKAGE/03` §4 golden_vectors 状态）。 |

### 4.4 跨语言 byte-equal 门（R2 gate）

来源：`FINAL_PACKAGE/03_EXISTING_ARCHITECTURE.md` §4。

```text
TS currentHash  ──┐
                  ├──▶ assert byte-equal ──▶ 三端全绿 = golden 对拍 PASS
Python recompute ┘                              任一不一致 = RED（已知数值域分叉除外）
browser (Web Crypto) sha256 ──┘
```

- **真绿口径**：核心算法（canonicalHash / verdict kernel / proofHash）跨语言对拍 byte-equal。
- **已知分叉**：RFC 8785 JCS 数值域边界（如 N2b 指数零填充）按 `NUMERIC_KNOWN_DIVERGENCE` 诚实归 RED，**非设计期故意红，非 bug**，待 V3 迁移。本附录所有 golden vector 设计时**避开**已知分叉区（所有数值用整数或常规浮点表示，不构造触发 JCS 边界的极值）。
- **不冒充**：browser verifier 若使用 TS 编译产物，不得包装成"完全不同语言实现"（见 `04_PROOF_ENVELOPE_AND_VERIFIER.md` §7）。

### 4.5 Verifier 输出契约（三端共用）

每个 golden vector 经三端 verifier 运行后，输出须含以下字段，且三端逐字相等：

```json
{
  "caseId": "GV-01",
  "verdict": "CONFIRMED",
  "decisiveRuleId": "R7_PRIMARY_TEST_CONFIRMS",
  "reasonCodes": ["R7_PRIMARY_TEST_CONFIRMS"],
  "proofHash": "64-hex-lowercase",
  "tamperStatus": "clean",
  "verifierBackend": "node|python|browser",
  "diffReport": []
}
```

GV-10 例外：`tamperStatus='tampered'`，`diffReport` 非空，三端 `proofHash` 须一致地指向"被篡改后重算的值"（即三端都检测到同一篡改）。

---

## 5. Golden Vector 物理存放与运行

### 5.1 目录结构

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

### 5.2 单个 case 文件 schema（GV-01 示例）

```json
{
  "caseId": "GV-01",
  "scenario": "complete support",
  "fec": {
    "contractVersion": "FEC/2.0",
    "claimId": "C-DEMO-0001",
    "contractId": "FC-DEMO-0001",
    "measurableImplications": [
      {
        "implicationId": "M1",
        "primaryMetric": "bls_power",
        "direction": "greater",
        "alpha": 0.0125,
        "correction": "bonferroni",
        "seedPolicy": { "seed": 42, "locked": true }
      }
    ],
    "statLock": { "lockedAt": "2026-06-01T00:00:00Z", "revisionAfterResult": false }
  },
  "datasetBindings": [
    { "datasetId": "D1", "contentHash": "<hash>", "sourceAnchor": { "resolved": true } }
  ],
  "workflowBindings": [
    { "workflowId": "W1", "environmentHash": "<hash>", "seedPolicy": { "seed": 42 }, "networkPolicy": "off" }
  ],
  "statisticalResults": [
    {
      "testId": "M1",
      "status": "ran",
      "effectDirection": "supports",
      "pValue": 0.003,
      "adjustedPValue": 0.003,
      "effectSizeObserved": 0.62,
      "confidenceInterval": [0.21, 0.95],
      "assumptionDiagnostics": []
    }
  ],
  "expected": {
    "verdict": "CONFIRMED",
    "decisiveRuleId": "R7_PRIMARY_TEST_CONFIRMS",
    "reasonCodes": ["R7_PRIMARY_TEST_CONFIRMS"],
    "tamperStatus": "clean"
  }
}
```

### 5.3 运行命令

```bash
# 三端分别跑
far verify-golden --backend node     --case GV-01
far verify-golden --backend python   --case GV-01
far verify-golden --backend browser  --case GV-01

# 全量对拍
far verify-golden --all --cross-lang
```

输出汇总到 `golden_vectors/runs/<timestamp>/summary.json`，三端任一不一致即 CI 红（已知数值域分叉 case 须显式标 `known_divergence: true` 并从 cross-lang 断言中豁免）。

---

## 6. Golden Vector 维护流程

### 6.1 新增 / 修改 case 的强制步骤

1. **提 RFC**：在 `FAR_LAB_MASTER_PLAN/09_GAP_CLOSURE_LOG.md` 记录新增/修改理由、对应红队场景、预期 verdict。
2. **不可改 expectedVerdict 以迎合实现**：若实现输出与 case 预期不符，**修实现，不修 case**（除非 case 本身被证明语义错误，此时须走 §6.2 废止流程）。
3. **三端同步**：TS / Python / browser runner 同步更新；任一端缺 case 即 CI 红。
4. **cross-lang 断言**：新增 case 默认进 cross-lang 断言集；若触发已知数值域分叉，须显式标 `known_divergence` 并附 RFC 链接。
5. **状态标签**：case 文件须含 `status` 字段（`DESIGN_LOCKED` / `IMPLEMENTED_VERIFIED` / `RETIRED`）。

### 6.2 废止 case

- 废止不删除文件，改 `status='RETIRED'` 并附 `retiredReason` + `retiredAt`。
- 物理档案（旧 case 历史 JSON）备份至 `C:/Users/RichardYuan/FAR-Lab_Backups/`（与 08 追踪矩阵备份位置一致），并在本附录 §7 溯源表登记旧编号→备份位置。

### 6.3 enum 变更（极罕见）

若需新增第六个 verdict 值（**默认禁止**），须同时修改：本附录 §0 enum、`03` §5、schema CHECK 约束、所有 verifier、所有 golden vector 的 expectedVerdict、答辩口径。任一遗漏 = 系统不可信。本附录**不预期触发此流程**。

---

## 7. 溯源映射（旧编号 → 本附录位置）

> 物理档案 `FINAL_PACKAGE/` 即将退役（见 09 追踪矩阵）。下表保留旧编号→本附录位置的映射作为**来源溯源**，物理档案备份至 `C:/Users/RichardYuan/FAR-Lab_Backups/`。本附录内容已**完整并入**，不依赖 FINAL_PACKAGE 作为运行时引用。

| 旧来源（FINAL_PACKAGE，已归档） | 并入位置（本附录） | 备份位置 |
|---|---|---|
| `67_DETERMINISTIC_FIVE_VALUE_VERDICT_ENGINE.md` §4 规则优先级 R0-R9 | §1 Verdict Kernel 规则优先级 | `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/67_*.md` |
| `67_*.md` §6 deterministic tie-break | §1 tie-break 规则 | 同上 |
| `67_*.md` §8 测试计划（`llm_evidence_guard` / `verdict_priority` / `untested_recall`） | GV-11 / GV-05 / GV-03 对应 | 同上 |
| `67_*.md` §9 红队案例（all LLM / direct contradiction / scope laundering / alpha rewrite / no primary test） | GV-11 / GV-02 / GV-05 / GV-09 / GV-03 | 同上 |
| `11_FALSIFICATION_ENGINE.md` §3 verdict_mapping 5 路径 | §1（R4-R9 与 5 路径对齐） | `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/11_*.md` |
| `11_*.md` §4.1 F8 预登记三重约束 | GV-09 / GV-11 / GV-12 | 同上 |
| `66_FEC_TO_STATISTICAL_VERDICT_CLOSED_LOOP_DESIGN.md` §5 算法草案 | §1 规则优先级（伪代码对齐） | `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/66_*.md` |
| `66_*.md` §7 failure vectors（alpha 改 / stopping rule / dataset hash / post-hoc / LLM judge / missing data / multiple tests / failed run omitted） | GV-09 / GV-12 / GV-06 / GV-09 / GV-11 / GV-04 / GV-11 / GV-10 | 同上 |
| `66_*.md` §9 红队（post-hoc rewrite / p-hacking / optional stopping / cherry-pick / dataset drift / LLM injection / fake degraded scope） | GV-09 / GV-11 / GV-12 / GV-12 / GV-06 / GV-11 / GV-05 | 同上 |
| `03_EXISTING_ARCHITECTURE.md` §4 golden_vectors 状态（RFC 8785 已知分叉） | §4.4 跨语言 byte-equal 门 | `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/03_*.md` |
| 现有 `FAR_LAB_MASTER_PLAN/03_EVIDENCE_CONTRACT_AND_VERDICT.md` §9（10 个 golden vector 速记） | §2 GV-01..GV-12（完整实现级扩展） | —（仍为现行 P0 文档） |
| 现有 `FAR_LAB_MASTER_PLAN/04_PROOF_ENVELOPE_AND_VERIFIER.md` §5 / §7 / §8 | §4.5 verifier 输出契约 / §4.4 browser 边界 / GV-10 diff report | —（仍为现行 P0 文档） |

---

## 8. 诚实边界与 DO_NOT_CLAIM

| 项 | 口径 |
|---|---|
| Golden vector 覆盖度 | P0 锁定 12 条 + FUSION-OS-13/14 扩展 2 条 = 14 条，**不声称**覆盖所有科研场景。新红队发现须走 §6.1 流程补 case。 |
| 三端对拍 | 核心算法 byte-equal；数值域边界为已知分叉（RED），**不声称**"所有字段三端完全一致"。 |
| Browser verifier | 验证 Merkle / chain / proofHash / inclusion proof 的具体范围；**不声称**是"完全不同语言的独立第三方验证生态"。 |
| Verdict 正确性 | Golden vector 验证的是 **deterministic kernel 在固定输入下输出稳定**，**不声称** verdict 本身是科学真理。 |
| LLM 角色 | LLM 可生成 case 草案、可解释 verdict，**不得**作为 verifier 或 kernel 的裁决输入（GV-11 专门锁定此红线）。 |
| Tamper detection | GV-10 验证篡改可检测，**不声称**"物理不可篡改"。 |
| 数量统计 | 本附录不写"N 条测试通过""CI 通过率 X%"。运行时数量以 `far status --json` 与 CI 输出为准。 |

---

## 9. 与其他文档的一致性锚点

| 概念 | 本附录写法 | 权威源 |
|---|---|---|
| 五值 enum | `CONFIRMED` / `REFUTED` / `INCONCLUSIVE` / `DEGRADED_SCOPE` / `UNTESTED` | `03` §5；APPENDIX_A_TYPES（权威） |
| 优先级 | R0..R9（细编号），等价于 `DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED` | `03` §6；`FINAL_PACKAGE/67` §4 |
| 规则 id | `R0_SCHEMA_INVALID` .. `R9_ALL_TESTS_SKIPPED` | `FINAL_PACKAGE/67` §4 |
| integrityFlags | `harking_risk` / `p_hacking_risk` / `citation_unresolved` / `insufficient_falsification` 等 | `FINAL_PACKAGE/11` §7.3、§1.1 F8；APPENDIX_A_TYPES |
| 路径 | `<REPOSITORY_ROOT>/golden_vectors/` | `01_SOURCE_OF_TRUTH_AND_STATUS.md` §1 |
| proofHash 输入 | claim / FEC / bindings / measurement / statistics / deviations / verdict trace | `04_PROOF_ENVELOPE_AND_VERIFIER.md` §3；`FINAL_PACKAGE/66` §6 |
| tamperStatus 取值 | `clean` / `tampered` / `unknown` | `04_PROOF_ENVELOPE_AND_VERIFIER.md` §5 |

> **冲突仲裁**：本附录与 `APPENDIX_A_TYPES.md` / `APPENDIX_C_CANONICAL.md` / `APPENDIX_F_GLOSSARY.md` 冲突时，以三个附录为权威（见全局规则 10）。本附录与 `03` / `04` 冲突时，本附录为 verdict golden vector 主题的更细实现级口径，但 enum 与优先级语义不偏离 `03`。
