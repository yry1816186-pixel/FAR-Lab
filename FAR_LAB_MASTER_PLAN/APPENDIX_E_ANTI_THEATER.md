# 附录 E · 反科研剧场攻击目录（Anti-Theater Attack Catalog）

> 本附录是 FAR-Chain 反剧场（anti-theater）主题的**权威集中处**。
> 它把分散在 `02_ARCHITECTURE.md` §3.1/§8、`03_EVIDENCE_CONTRACT_AND_VERDICT.md` §4/§8、`04_PROOF_ENVELOPE_AND_VERIFIER.md` §8 以及历史档案 `68_ANTI_THEATER_ADVERSARIAL_HARDENING.md`、`81_STATISTICAL_FALSIFICATION_AND_P_HACKING_DEFENSE.md`、`13_RESEARCH_INTEGRITY_FIREWALL.md`、`36_CONFOUNDING_GATE_ALGORITHM.md`、`11_FALSIFICATION_ENGINE.md` 中的反剧场条款，收束为一份可逐条实现、可逐条测试、可逐条验收的攻击目录。
>
> 状态纪律（遵守 `01_SOURCE_OF_TRUTH_AND_STATUS.md` §3/§4）：本附录每一条能力都标注状态标签；本附录**不手填**测试数 / CI 通过率 / 攻击命中数 / commit / 外部竞品发布时间，所有此类字段写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`，最终值由 `far status --json`、CI 输出、`git rev-parse HEAD` 与可复核脚本回填。
>
> 诚实边界：FAR-Chain 不声称 `CONFIRMED` 物理不可伪造（**禁用口径**：物理不可篡改；**正确口径**：篡改可检测、可让 verifier 变红或变黄、可追责）。本附录的目标是把“漂亮报告 + 全 PASS + 语言严谨”掩盖的无证伪力证据链，变成 deterministic verifier 能变红/变黄、能定位字段、能产出 `reasonCode` 的可检测偏差。
>
> 路径约定（遵守 `01` §1）：本附录所有路径使用 `<REPOSITORY_ROOT>/`，不使用 `far-chain/`（历史路径，已 `RETIRED`，见 `08_TRACEABILITY_MATRIX.md` §2）。
>
> 来源溯源：本附录并入的内容来自 `FINAL_PACKAGE/` 编号文档（物理档案已退役，备份位置 `C:/Users/RichardYuan/FAR-Lab_Backups/`；旧编号→新位置映射见 `08_TRACEABILITY_MATRIX.md`）。本附录自包含，不写“详见 FINAL_PACKAGE/X”作为有效依赖。

---

## §0. 定位、边界与术语锚定

### §0.1 什么是“反科研剧场”

“科研剧场”（scientific theater）指：报告字段看起来全 `PASS`、语言严谨、图表精美，但其证据链没有真正的证伪力（falsification power）。反剧场 = 一组 deterministic 检测规则，让这类包装在 `far verify` 与 verdict kernel 面前**变红或变黄**，而不是被静默放行。

反剧场检测**不是**：
- 不是“证明科学真理”（**禁用口径**；正确口径：判断是否满足冻结可证伪证据契约）；
- 不是“物理不可篡改”（**禁用口径**；正确口径：篡改可检测）；
- 不是“完全可复现”（**禁用口径**；正确口径：可独立重算特定 proof input）；
- 不是让 LLM 当裁判判违规（LLM 只可生成候选、解释、报告，**不得**作为最终裁决者；裁决必须 deterministic，见 `07_RISK_REGISTER_AND_DO_NOT_CLAIM.md` §4）。

### §0.2 裁决枚举与优先级（与 `03` §5/§6 一致，本附录不改枚举）

```ts
// 五值裁决 enum —— 固定，禁止第六值（03 §5 / 11 §3 SSOT）
type VerdictKind =
  | "CONFIRMED"
  | "REFUTED"
  | "INCONCLUSIVE"
  | "DEGRADED_SCOPE"
  | "UNTESTED";
```

裁决优先级（`03` §6，`take the strictest`）：

```text
DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED
```

反剧场 finding 触发后，按上述优先级**取严不取宽**映射到 verdict 约束（见 §3.4 `applyVerdictConstraint`）。当多条规则同时触发，取优先级最高（最严）的约束，但 `reasonCode[]` 与 `ruleTrace[]` 必须同时记录全部触发的 finding。

### §0.3 reasonCode 命名规范（本附录 SSOT）

本附录为每条攻击定义一个稳定的 `attackId`（如 `AT-DATA-DRIFT`）与对应的 `reasonCode`（如 `DATASET_HASH_MISMATCH`）。`reasonCode` 进入 `VerdictKernelOutput.reasonCodes[]`（`03` §7）与 `ProofEnvelope.antiTheaterReport`（`04` §2），并在 diff report（`04` §8）中以 `*_MISMATCH` / `*_DEVIATION` 形式出现。

约定：
- `attackId` 前缀 `AT-` + 域缩写（`CIT`/`DATA`/`STAT`/`SCOPE`/`JUDGE`/`PROOF`/`REPORT`）；
- `reasonCode` 全大写、下划线分隔，与 `04` §8 diff report 命名风格一致；
- 同一 `attackId` 可对应多个 `reasonCode`（不同检测子路径）。

### §0.4 状态标签（与 `01` §3 一致）

| 标签 | 含义 |
|---|---|
| `IMPLEMENTED_VERIFIED` | 已在当前代码和测试中核实 |
| `IMPLEMENTED_UNVERIFIED` | 代码存在，但本轮未完成测试核实 |
| `PARTIAL` | 有局部实现，尚未闭环 |
| `DESIGN_LOCKED` | 设计已定，可进入实现 |
| `ROADMAP` | 方向明确，但不作为当前完成能力 |
| `RESEARCH` | 研究设想，不能写入当前功能声明 |
| `RETIRED` | 旧口径废弃，只保留历史解释 |
| `NEEDS_EXTERNAL_VERIFICATION` | 外部事实未在当前回合复核，答辩前必须查证 |

---

## §1. AntiTheaterHarness 接口（与 `68` §1 / `03` §7 对齐）

> **存储类型权威声明（遵守 01 §2 冲突裁决 + 铁律 #10）**：
> `AntiTheaterFinding` 与 `AntiTheaterReport` 的**存储类型**以 `APPENDIX_A_TYPES.md` §7 为权威。本节**不**重定义这两个存储类型，仅作引用；本节新增的 `AntiTheaterFindingExtension` 承载生产视角元数据（affectedProofHashInputs/reasonCode/ruleTraceRef/remediation 等，均为可选），是 `AntiTheaterFinding` 的**叠加扩展**而非替代。
>
> `ProofEnvelopeV2.antiTheaterReport`（`APPENDIX_A_TYPES` §8）字段类型为 A 的 `AntiTheaterReport`，故 A 版本为唯一运行时存储类型。
>
> `AntiTheaterSeverity`（INFO/WARN/FAIL/BLOCK）是**派生展示轴**，不是存储字段。存储 `outcome` 唯一轴为 `ProofCheckOutcome`（A §0 权威枚举）。`severity` 由 `outcome` + finding 上下文派生（映射表见本节末尾）。

```ts
// <REPOSITORY_ROOT>/src/anti_theater/types.ts （已落地·状态：IMPLEMENTED_VERIFIED·D1 单一存储类型源）

// —— 派生展示轴（不进存储，由 outcome + 上下文派生）——
export type AntiTheaterSeverity = "INFO" | "WARN" | "FAIL" | "BLOCK";

// —— 存储类型：引用 APPENDIX_A_TYPES §7 权威定义，本附录不重定义 ——
// AntiTheaterFinding（权威字段集，见 APPENDIX_A_TYPES §7）：
//   findingId, attackKind, outcome: ProofCheckOutcome, hasFail, evidenceRef, message
// AntiTheaterReport（权威字段集，见 APPENDIX_A_TYPES §7）：
//   findings[], hasFail, failCount, warnCount, llmOverrideRejected,
//   antiTheaterScore?, canSealConfirmed?, verdictConstraint?
export type { AntiTheaterFinding, AntiTheaterReport } from "<REPOSITORY_ROOT>/src/types/appendix_a";

// —— 生产视角元数据扩展（叠加在 AntiTheaterFinding 之上，全部可选，不替换存储字段）——
export interface AntiTheaterFindingExtension {
  /** 关联的存储 finding（通过 findingId 关联 APPENDIX_A §7 AntiTheaterFinding）。 */
  findingId: string;

  /** attackId（本附录 §2 目录稳定标识，如 AT-DATA-DRIFT），与 AntiTheaterFinding.attackKind 一一对应（映射表见 APPENDIX_A §7）。 */
  attackId: string;

  /** 派生展示严重程度（由 outcome + 上下文派生；BLOCK → 直接拒绝 seal）。映射见本节末尾。 */
  severity: AntiTheaterSeverity;

  /** 哪些 proofHash-critical 字段被影响（04 §3）。 */
  affectedProofHashInputs?: string[];

  /** 进入 VerdictKernelOutput.reasonCodes[]。 */
  reasonCode?: string;

  /** 指向 integrity_events.event_id / call_records.seq。 */
  ruleTraceRef?: string[];

  /** 结构化修复建议（非 LLM 生成，模版拼接）。 */
  remediation?: string;

  /** ★永远 true（07 §4 / 13 §3）；false 即 CI fail。 */
  deterministic: true;
}

export interface AntiTheaterVerdictConstraint {
  // 取严后的 verdict 约束（03 §6 优先级）；anti-theater 只“降级”，不主动产 REFUTED
  forcedVerdict?: "DEGRADED_SCOPE" | "UNTESTED" | "INCONCLUSIVE"; // undefined = 不约束
  blockSeal: boolean;                      // true → 拒绝 seal（04 §1）
  reasonCodes: string[];
}

export interface AntiTheaterLintInput {
  fec: FecContract;                        // 03 §1
  bindings: EvidenceBinding[];             // dataset / workflow / run bindings，03 §3
  executionTrace: ExecutionTrace[];        // run + measurement 痕迹
  verdict: VerdictKernelOutput;            // 03 §7 内核输出（先于 anti-theater 的初步 verdict）
  envelopeDraft: ProofEnvelopeDraft;       // 04 §2 草稿
  preregistrationRecord: PreregistrationRecord; // FEC freeze 前的预注册快照（81 §2）
  runRegistry: RunRegistry;                // 完整 run 清单（防 hidden failed run）
}

/**
 * 运行时返回的 finding 为 (AntiTheaterFinding, AntiTheaterFindingExtension) 对；
 * 报告存储类型为 APPENDIX_A §7 AntiTheaterReport（生产视角元数据填入其可选字段）。
 */
export function runAntiTheaterLint(
  input: AntiTheaterLintInput
): AntiTheaterReport;                      // computedBy = "deterministic_compiler"（07 §4）
```

### §1.1 AntiTheaterSeverity ↔ ProofCheckOutcome 映射（双轴对齐）

`ProofCheckOutcome`（A §0 权威，PASS/FAIL/WARN/SKIP）是**唯一存储 outcome 轴**。`AntiTheaterSeverity`（INFO/WARN/FAIL/BLOCK）是**派生展示轴**，由 `outcome` + finding 上下文（是否触发 seal 拒绝）派生。下表为确定性映射规则：

| AntiTheaterSeverity（派生展示） | ProofCheckOutcome（存储 outcome） | 派生条件（额外上下文） |
|---|---|---|
| `BLOCK` | `FAIL` | 同时令 `AntiTheaterReport.canSealConfirmed = false` 与 `verdictConstraint.blockSeal = true` |
| `FAIL` | `FAIL` | `outcome=FAIL` 且未满足 BLOCK 的 seal 拒绝条件 |
| `WARN` | `WARN` | 直接对应 |
| `INFO` | `PASS` | 直接对应（`SKIP` 用于"该检测未运行/不适用"，不映射为 INFO） |

派生方向（运行时）：检测器产出 `(outcome, severity)` 对 → 存储只落 `outcome`（A §7 字段）+ extension 承载 `severity`。报告聚合时 `failCount = count(outcome=FAIL)`，`warnCount = count(outcome=WARN)`，`hasFail = failCount > 0`，`canSealConfirmed` 与 `blockSeal` 由 §4 score 与 BLOCK finding 派生。

> **术语映射登记（APPENDIX_F §3 交叉引用）**：本附录将 `AntiTheaterSeverity`（4 值展示轴）注册为 `ProofCheckOutcome`（4 值存储轴）的派生轴；术语语义冲突以 `APPENDIX_F_GLOSSARY.md` §3 为准。两轴不并存为存储字段——存储只存 `outcome`，`severity` 仅供 Honesty Wall / diff report 展示。

> **禁 LLM 边界（F3）**：`runAntiTheaterLint` 全程 deterministic。源码中 `grep -rE "openai|chat\.completions|llm_gateway"` 在 anti-theater 模块命中 `llm` 调用即 CI fail（与 `13` §8.1 `no_llm_final_judge_scan` 同型 gate）。LLM 可在 finding 产生**后**为人类生成解释文案，但该文案进 `humanSummary`（非 proofHash-critical，`04` §3），**不**进 `reasonCode` / `verdictConstraint`。

---

## §2. 反剧场攻击全目录（20 类，覆盖 15 项强制要求）

> 覆盖任务强制要求的 15 项：label-only evidence、LLM reviewer override、post-hoc threshold、dataset drift、scope laundering、missing raw artifact、metric swapping、seed cherry-picking、workflow digest mismatch、natural-language verdict mismatch、p-hacking、HARKing、stopping-rule 违规、多重检验未校正、optional stopping。
> 本目录在 15 项基础上补齐 5 类（全 PASS 伪造、伪 datasetHash、benchmark overfit、dependency/float drift、fake degraded scope / null laundering），与 `68` §2 的 20 攻击对齐。

### 攻击一览表

| attackId | 攻击中文名 | 检测核心（一句话） | expectedVerdict / expectedFail | 状态 |
|---|---|---|---|---|
| `AT-FAKE-PASS` | 全 PASS 伪造 | required evidence count + evidence sufficiency 交叉检查 | fail（不可 seal） | `IMPLEMENTED_VERIFIED` |
| `AT-LABEL-ONLY` | label-only evidence | evidence type 最低阈值 + 缺 primary raw artifact | `UNTESTED` | `IMPLEMENTED_VERIFIED` |
| `AT-JUDGE-OVERRIDE` | LLM reviewer override | `createdBy !== "deterministic_*"` grep → CI fail | fail（CI 阻断） | `IMPLEMENTED_VERIFIED` |
| `AT-POSTHOC-THRESHOLD` | post-hoc threshold | frozen threshold hash vs executed threshold | `UNTESTED` | `IMPLEMENTED_VERIFIED` |
| `AT-METRIC-SWAP` | metric swapping | primary metric frozen hash vs executed metric | `UNTESTED` | `IMPLEMENTED_VERIFIED` |
| `AT-DATA-DRIFT` | dataset drift | contentHash / schemaHash / statsFingerprint mismatch | `DEGRADED_SCOPE` | `IMPLEMENTED_VERIFIED` |
| `AT-DATA-HASH-FAKE` | 伪 datasetHash | chunk Merkle root vs 声称 contentHash | fail（verifier RED） | `IMPLEMENTED_VERIFIED`(MVP·R6) |
| `AT-SCOPE-LAUNDER` | scope laundering | verdict 支撑 scope < claim scope → 强制 `DEGRADED_SCOPE` | `DEGRADED_SCOPE` | `IMPLEMENTED_VERIFIED` |
| `AT-MISSING-RAW` | missing raw artifact | rawArtifactHashes 缺失 → evidence sufficiency fail | `UNTESTED` | `IMPLEMENTED_VERIFIED` |
| `AT-SEED-CHERRY` | seed cherry-picking | seedPolicy hash + run registry 完整性 | `INCONCLUSIVE` 或 fail | `IMPLEMENTED_VERIFIED` |
| `AT-WORKFLOW-DIGEST` | workflow digest mismatch | workflowHash / containerDigest / envHash mismatch | fail（verifier RED） | `IMPLEMENTED_VERIFIED` |
| `AT-REPORT-MISMATCH` | natural-language verdict mismatch | report verdict string ≠ structured verdict | fail（structured wins） | `IMPLEMENTED_VERIFIED` |
| `AT-PHACK-ALPHA` | p-hacking / alpha inflation | frozen alpha vs executed alpha | `UNTESTED` / deviation | `IMPLEMENTED_VERIFIED` |
| `AT-PHACK-CORRECTION` | 多重检验未校正 | `measurableImplications.length > 1 && correction === "none"` | `INCONCLUSIVE` | `IMPLEMENTED_VERIFIED` |
| `AT-HARK` | HARKing | `hypothesis.sealedAt > experiment.finishedAt` | 禁 `CONFIRMED` → `UNTESTED` | `IMPLEMENTED_VERIFIED` |
| `AT-STOPPING-RULE` | stopping-rule 违规 | interim looks vs declared stopping rule | `UNTESTED` | `IMPLEMENTED_VERIFIED` |
| `AT-OPTIONAL-STOPPING` | optional stopping | sequential 无 alpha-spending → 禁 `CONFIRMED` | `UNTESTED` / `INCONCLUSIVE` | `IMPLEMENTED_VERIFIED`(MVP·static prereg) |
| `AT-DEP-FLOAT-DRIFT` | dependency / float drift | lockfile hash / container digest / numeric tolerance hash | fail（verifier RED） | `IMPLEMENTED_VERIFIED` |
| `AT-OVERFIT` | benchmark overfitting | hidden/private split 强制（public seed 过不过 hidden） | `DEGRADED_SCOPE` | `IMPLEMENTED_VERIFIED`(受限)/`ROADMAP`(完整) |
| `AT-FAKE-DEGRADED` | fake degraded scope / null laundering | direct refutation 优先；null result 不得被吞 | `REFUTED` 优先 / `UNTESTED` | `IMPLEMENTED_VERIFIED` |

> 状态说明：19 条 `IMPLEMENTED_VERIFIED`（detector 落地于 `src/anti_theater/detectors/`，21 golden vectors CI 实测全覆盖·W3.2-W3.3）。`AT-OVERFIT` 受限实现（public-only split → WARN + DEGRADED_SCOPE），完整 hidden/private split 机制仍 `ROADMAP`（W4）。`AT-DATA-HASH-FAKE` MVP 退化（contentHash 格式校验·R6，真 Merkle 重算 W4）；`AT-OPTIONAL-STOPPING` MVP 仅 static prereg check（完整 alpha-spending W5）。

---

### AT-FAKE-PASS · 全 PASS 伪造

- **attackId**：`AT-FAKE-PASS`
- **定义**：攻击者构造一个字段看起来全 `PASS` 的 envelope JSON，但实际未绑定真实证据、未跑真实测量、或 required evidence 数量不足。
- **检测机制（deterministic 规则）**：
  1. `requiredEvidence` 清单非空且**逐项**解析（`03` §2 编译期写入）；
  2. `evidenceSufficiency` 报告对每条 requirement 给 `resolved=true`；
  3. `requiredEvidence.length === measurementResults.length`（数量对齐）；
  4. 任意 `ProofCheck.outcome === "PASS"` 必须有对应的 `call_records.seq` evidence_ref（反“无 evidence 的裸 PASS”）。
- **expectedFail**：`fail`（不可 seal；`04` §1 seal 拒绝）。
- **reasonCode**：`EVIDENCE_INSUFFICIENT` / `REQUIRED_EVIDENCE_MISSING`。
- **golden vector**：`gv-fake-pass-01` —— 全 PASS JSON 但 `requiredEvidence=[primary_result]` 而 `measurementResults=[]` → verifier RED，verdict 强制 `UNTESTED`。
- **关联红线**：`03` §2（`EVIDENCE_REQUIREMENT_MISSING`）、F1（未验证禁 `CONFIRMED`）。

```python
# deterministic 检测伪代码
def detect_fake_pass(input: AntiTheaterLintInput) -> AntiTheaterFinding | None:
    fec = input.fec
    required = fec.requiredEvidence                      # EvidenceRequirement[]
    measurements = input.executionTrace.measurements     # MeasurementResult[]
    if len(required) == 0:
        return None                                       # FEC 自身应在 compile 期被拒（03 §2）
    resolved_ids = {m.requirementId for m in measurements if m.requirementId}
    missing = [r for r in required if r.id not in resolved_ids]
    if missing:
        return finding(
            attack_id="AT-FAKE-PASS",
            severity="BLOCK",
            reason_code="REQUIRED_EVIDENCE_MISSING",
            affected=[f"requiredEvidence[{m.id}]" for m in missing],
            remediation="补齐缺失的 required evidence 或将 claim 降为 UNTESTED",
        )
    # 裸 PASS 检查：每个 PASS check 必须有 evidence_ref
    for check in input.verdict.proofChecks:
        if check.outcome == "PASS" and not check.evidence_ref:
            return finding(
                attack_id="AT-FAKE-PASS",
                severity="BLOCK",
                reason_code="EVIDENCE_INSUFFICIENT",
                affected=[f"proofChecks[{check.checkId}].evidence_ref"],
                remediation="PASS 必须绑定 call_records.seq / evidence_log.evidence_id",
            )
    return None
```

---

### AT-LABEL-ONLY · label-only evidence

- **attackId**：`AT-LABEL-ONLY`
- **定义**：用 LLM 生成的 label / 文本判定（如 `"supports_strongly"`、`"positive"`）充当证据，而没有底层 measurement / raw artifact。
- **检测机制**：
  1. evidence type 最低阈值：`ProofEnvelope.measurementResults` 非空且每条 `rawArtifactHashes.length >= 1`；
  2. label-only 字段（`llmLabel` / `reviewerText` / `naturalLanguageVerdict`）**不**进 `evidenceSufficiency` 计数；
  3. screenshot-only figure 不可作为 primary evidence（与 `68` §2 第 17 条一致）。
- **expectedVerdict**：`UNTESTED`。
- **reasonCode**：`LABEL_ONLY_EVIDENCE` / `NO_PRIMARY_RAW_ARTIFACT`。
- **golden vector**：`gv-label-only-01` —— envelope 仅含 `llmLabel: "confirmed"` 无 measurement → verdict `UNTESTED`。
- **关联**：`03` §8、`07` §4（LLM 不得决定 verdict）。

```python
def detect_label_only(input: AntiTheaterLintInput) -> AntiTheaterFinding | None:
    measurements = input.executionTrace.measurements
    primary = [m for m in measurements if m.role == "primary"]
    if not primary:
        return finding(
            attack_id="AT-LABEL-ONLY",
            severity="FAIL",
            reason_code="NO_PRIMARY_RAW_ARTIFACT",
            affected=["measurementResults"],
            remediation="必须绑定至少一条 primary measurement（含 rawArtifactHashes）",
        )
    for m in primary:
        if not m.rawArtifactHashes:
            return finding(
                attack_id="AT-LABEL-ONLY",
                severity="FAIL",
                reason_code="LABEL_ONLY_EVIDENCE",
                affected=[f"measurementResults[{m.runId}].rawArtifactHashes"],
                remediation="primary measurement 必须含 rawArtifactHashes；llmLabel 不可替代",
            )
    return None
```

---

### AT-JUDGE-OVERRIDE · LLM reviewer override

- **attackId**：`AT-JUDGE-OVERRIDE`
- **定义**：LLM reviewer（或任何非 deterministic actor）直接写入 / 覆盖 `VerdictNode` / `ProofCheck.outcome`，或把 `UNTESTED` 文案改成 `CONFIRMED`。
- **检测机制（CI grep + runtime 双守卫）**：
  1. CI 静态扫描：`grep -rE "createdBy\s*[:=]\s*['\"]llm['\"]" <REPOSITORY_ROOT>/src/` 命中即 fail（`13` §8.1）；
  2. runtime：`VerdictNode.createdBy` / `ProofCheck.computedBy` 必须 `startsWith("deterministic_")`；
  3. report verdict mismatch：`report.naturalLanguageVerdict` ≠ `verdictTrace.verdict` → structured wins（与 `AT-REPORT-MISMATCH` 联动）。
- **expectedFail**：`fail`（CI 直接阻断，**不**走 verdict 降级——否则 LLM-as-judge 会被静默吞掉，违反 `07` §4 与零容忍 #4）。
- **reasonCode**：`LLM_AS_FINAL_JUDGE` / `JUDGE_NEUTRALITY_VIOLATION`。
- **golden vector**：`gv-judge-override-01` —— LLM reviewer 写 `"supports_strongly"` → kernel verdict 不变；`gv-judge-override-02` —— `createdBy: "llm"` → CI fail。
- **关联红线**：F3（禁 LLM-as-judge）、`13` §2 `RULE-JUDGE-001`（fatal 级）。

```python
def detect_judge_override(input: AntiTheaterLintInput) -> AntiTheaterFinding | None:
    for node in input.verdict.verdictNodes:
        if not node.createdBy.startswith("deterministic_"):
            return finding(
                attack_id="AT-JUDGE-OVERRIDE",
                severity="BLOCK",
                reason_code="LLM_AS_FINAL_JUDGE",
                affected=[f"verdictNodes[{node.id}].createdBy"],
                remediation="verdict 必须由 deterministic kernel 产出（F3）；LLM 输出仅可进 humanSummary",
            )
    for check in input.verdict.proofChecks:
        if check.computedBy and not check.computedBy.startswith("deterministic_"):
            return finding(
                attack_id="AT-JUDGE-OVERRIDE",
                severity="BLOCK",
                reason_code="JUDGE_NEUTRALITY_VIOLATION",
                affected=[f"proofChecks[{check.checkId}].computedBy"],
                remediation="ProofCheck.computedBy 必须 deterministic（13 §2 RULE-JUDGE-001）",
            )
    return None
```

> CI 闸门（独立于 runtime 检测，编译期阻断）：
> ```yaml
> # <REPOSITORY_ROOT>/.github/workflows/anti-theater.yml （DESIGN_LOCKED）
> - name: no_llm_final_judge_scan
>   run: |
>     ! grep -rE "createdBy\s*[:=]\s*['\"]llm['\"]" src/ || \
>       (echo "F3 violation: LLM-as-judge detected"; exit 1)
> ```

---

### AT-POSTHOC-THRESHOLD · post-hoc threshold

- **attackId**：`AT-POSTHOC-THRESHOLD`
- **定义**：实验看到结果后，事后调整 `threshold` / `direction` / `thresholdSemantics` 让数据通过（`03` §4 / `81` §3）。
- **检测机制**：`preregistrationRecord.thresholdHash`（freeze 前快照）≠ `executed.thresholdHash`（实际执行值）→ deviation。
- **expectedVerdict**：`UNTESTED`（protocol deviation 视同未在冻结契约下测试）。
- **reasonCode**：`POSTHOC_THRESHOLD_DEVIATION`。
- **golden vector**：`gv-posthoc-threshold-01` —— freeze `threshold=0.05`，executed `threshold=0.08` → `UNTESTED` + `POSTHOC_THRESHOLD_DEVIATION`。
- **关联**：`03` §4、F8（预登记铁律）、`81` §3。

```python
def detect_posthoc_threshold(input: AntiTheaterLintInput) -> AntiTheaterFinding | None:
    frozen = input.preregistrationRecord.thresholdHash        # sha256(canonical(threshold,direction,semantics))
    executed = canonical_hash(input.fec.threshold, input.fec.direction, input.fec.thresholdSemantics)
    if frozen != executed:
        return finding(
            attack_id="AT-POSTHOC-THRESHOLD",
            severity="FAIL",
            reason_code="POSTHOC_THRESHOLD_DEVIATION",
            affected=["fec.threshold", "fec.direction", "fec.thresholdSemantics"],
            remediation="恢复 freeze 时的 threshold，或在报告中标 protocol deviation（verdict 降为 UNTESTED）",
        )
    return None
```

---

### AT-METRIC-SWAP · metric swapping

- **attackId**：`AT-METRIC-SWAP`
- **定义**：primary metric 在结果出来后换成另一个更有利的指标（`81` §3 `switching primary endpoint`）。
- **检测机制**：`preregistrationRecord.primaryMetricHash` ≠ `executed.primaryMetricHash`。
- **expectedVerdict**：`UNTESTED`。
- **reasonCode**：`PRIMARY_METRIC_SWAPPED`。
- **golden vector**：`gv-metric-swap-01` —— freeze `primaryMetric=bls_power`，executed `primaryMetric=lomb_scargle_peak` → `UNTESTED`。
- **关联**：`03` §4、F8。

```python
def detect_metric_swap(input: AntiTheaterLintInput) -> AntiTheaterFinding | None:
    frozen = input.preregistrationRecord.primaryMetricHash
    executed = canonical_hash(input.fec.metric)
    if frozen != executed:
        return finding(
            attack_id="AT-METRIC-SWAP",
            severity="FAIL",
            reason_code="PRIMARY_METRIC_SWAPPED",
            affected=["fec.metric"],
            remediation="恢复 freeze 时的 primaryMetric；post-hoc 换指标 = p-hacking（81 §3）",
        )
    return None
```

---

### AT-DATA-DRIFT · dataset drift

- **attackId**：`AT-DATA-DRIFT`
- **定义**：dataset 内容、schema 或统计指纹在 freeze 后被替换或漂移（列重命名、行增删、统计量变化）。
- **检测机制**：`DatasetBinding` 三层 hash 对账（`03` §3.1）：`contentHash` / `schemaHash` / `statsFingerprint` 任一与 freeze 时不符。
- **expectedVerdict**：`DEGRADED_SCOPE`（或 recompute required；`03` §8）。
- **reasonCode**：`DATASET_HASH_MISMATCH` / `DATASET_SCHEMA_MISMATCH` / `DATASET_STATS_MISMATCH`（与 `04` §8 `DATASET_HASH_MISMATCH` 命名一致）。
- **golden vector**：`gv-data-drift-01` —— 改 1 byte row → contentHash 变 → verifier RED → `DEGRADED_SCOPE`；`gv-data-drift-02` —— schema column rename → schemaHash 变 → RED。
- **关联**：`03` §3.1 / §8、`68` §3 攻击 1/6。

```python
def detect_dataset_drift(input: AntiTheaterLintInput) -> list[AntiTheaterFinding]:
    findings = []
    for binding in input.bindings:
        if not isinstance(binding, DatasetBinding):
            continue
        frozen = lookup_freeze_record(binding.datasetId)     # 来自 protocolFreeze
        if binding.contentHash != frozen.contentHash:
            findings.append(finding(
                attack_id="AT-DATA-DRIFT", severity="FAIL",
                reason_code="DATASET_HASH_MISMATCH",
                affected=[f"datasetBindings[{binding.datasetId}].contentHash"],
                remediation="数据内容漂移；恢复 freeze 数据或重算并标 DEGRADED_SCOPE"))
        if binding.schemaHash != frozen.schemaHash:
            findings.append(finding(
                attack_id="AT-DATA-DRIFT", severity="FAIL",
                reason_code="DATASET_SCHEMA_MISMATCH",
                affected=[f"datasetBindings[{binding.datasetId}].schemaHash"],
                remediation="schema 漂移（列名/类型变化）；同上"))
        if binding.statsFingerprint and binding.statsFingerprint != frozen.statsFingerprint:
            findings.append(finding(
                attack_id="AT-DATA-DRIFT", severity="WARN",
                reason_code="DATASET_STATS_MISMATCH",
                affected=[f"datasetBindings[{binding.datasetId}].statsFingerprint"],
                remediation="统计指纹变化；需评估是否影响 primary metric"))
    return findings
```

---

### AT-DATA-HASH-FAKE · 伪 datasetHash

- **attackId**：`AT-DATA-HASH-FAKE`
- **定义**：声称的 `contentHash` 与实际数据字节不匹配（伪造 hash 而非真改数据）。`68` §2 第 2 条。
- **检测机制**：chunk Merkle root 重算 vs 声称 `contentHash`；或独立重算 contentHash 比对。
- **expectedFail**：`fail`（verifier RED；`04` §8 `DATASET_HASH_MISMATCH`）。
- **reasonCode**：`DATASET_HASH_FORGERY`。
- **golden vector**：`gv-data-hash-fake-01` —— contentHash 声称 `abc...` 但 Merkle root 重算得 `def...` → RED。
- **关联**：`04` §8、Core Trust Root（`02` §2.1 hash chain / Merkle root）。

```python
def detect_data_hash_fake(input: AntiTheaterLintInput) -> list[AntiTheaterFinding]:
    findings = []
    for binding in input.bindings:
        if not isinstance(binding, DatasetBinding):
            continue
        actual = recompute_merkle_root(binding.chunkHashes)   # 独立重算
        if actual != binding.contentHash:
            findings.append(finding(
                attack_id="AT-DATA-HASH-FAKE", severity="BLOCK",
                reason_code="DATASET_HASH_FORGERY",
                affected=[f"datasetBindings[{binding.datasetId}].contentHash"],
                remediation="contentHash 与数据字节不匹配；独立重算揭示伪造"))
    return findings
```

---

### AT-SCOPE-LAUNDER · scope laundering

- **attackId**：`AT-SCOPE-LAUNDER`
- **定义**：证据只覆盖窄 scope（如单一人群、单一数据集），却声称覆盖宽 scope；或把直接反证藏进 `DEGRADED_SCOPE` 以逃避 `REFUTED`（`68` §2 第 19 条）。
- **检测机制**：
  1. `verdict.supportedScope` vs `claim.scope`：若 `supportedScope ⊂ claim.scope`（严格窄）→ 强制 `DEGRADED_SCOPE`；
  2. `scopeNarrowerThanClaim === true` 但 `naturalLanguageConclusion` 用全称 → `AT-REPORT-MISMATCH` 联动；
  3. direct refutation 优先：若存在直接反证，不得用 `DEGRADED_SCOPE` 掩盖 → 必须 `REFUTED`。
- **expectedVerdict**：`DEGRADED_SCOPE`（或 `REFUTED` 当存在直接反证）。
- **reasonCode**：`SCOPE_LAUNDERED` / `REFUTATION_HIDDEN_BY_SCOPE`。
- **golden vector**：`gv-scope-launder-01` —— 证据仅覆盖 "adults 18-65" 但 claim 写 "all adults" → `DEGRADED_SCOPE`；`gv-scope-launder-02` —— 存在直接反证但标 `DEGRADED_SCOPE` → 强制 `REFUTED`。
- **关联**：`03` §6（优先级）、`13` §2 `RULE-SCOPE-001`、F2。

```python
def detect_scope_launder(input: AntiTheaterLintInput) -> AntiTheaterFinding | None:
    scope = input.verdict.scopeReport
    if scope.isStrictSubset(input.claim.scope):
        # 直接反证优先：若 any_refute 路径命中，不得用 DEGRADED_SCOPE 掩盖
        if input.verdict.hasDirectRefutation:
            return finding(
                attack_id="AT-SCOPE-LAUNDER", severity="FAIL",
                reason_code="REFUTATION_HIDDEN_BY_SCOPE",
                affected=["verdictTrace.verdict"],
                remediation="存在直接反证；verdict 必须为 REFUTED（03 §6 优先级高于 DEGRADED_SCOPE）")
        # honest-degrade 裁决（TS 实现对齐 D4）：若 kernel 已诚实降级到 DEGRADED_SCOPE/REFUTED/
        # INCONCLUSIVE/UNTESTED（input.verdict.verdict != 'CONFIRMED'），detector 职责
        # （expectedVerdict=DEGRADED_SCOPE）已达成，overclaim 不存在 → 放行（return None）。
        # 仅 verdict='CONFIRMED'（overclaim：claim 全局但证据仅覆盖子集）才产 SCOPE_LAUNDERED。
        # R4 路径（verdict_kernel_v2 R4）必然产 coverage='partial'，无此裁决则任何诚实 R4
        # 降级都被误判 theater（违反承诺误报率=0）。详见 src/anti_theater/detectors/scope_launder.ts。
        if input.verdict.verdict == 'CONFIRMED':
            return finding(
                attack_id="AT-SCOPE-LAUNDER", severity="FAIL",
                reason_code="SCOPE_LAUNDERED",
                affected=["verdictTrace.supportedScope"],
                remediation="证据 scope 严格窄于 claim scope；verdict 强制 DEGRADED_SCOPE（03 §8）")
        return None  # honest degrade：kernel 已降级，非 theater
    return None
```

---

### AT-MISSING-RAW · missing raw artifact

- **attackId**：`AT-MISSING-RAW`
- **定义**：`MeasurementResult.rawArtifactHashes` 缺失或为空，仅留 summary 数字（`68` §2 第 17 条 screenshot-only 同型）。
- **检测机制**：每条 `MeasurementResult` 必须含 `rawArtifactHashes.length >= 1`；缺 → evidence sufficiency fail。
- **expectedVerdict**：`UNTESTED`。
- **reasonCode**：`RAW_ARTIFACT_MISSING`。
- **golden vector**：`gv-missing-raw-01` —— measurement 仅含 `{"value": 3.14}` 无 raw hash → `UNTESTED`。
- **关联**：`03` §8、`68` §2 第 11/17 条。

```python
def detect_missing_raw(input: AntiTheaterLintInput) -> list[AntiTheaterFinding]:
    findings = []
    for m in input.executionTrace.measurements:
        if not m.rawArtifactHashes:
            findings.append(finding(
                attack_id="AT-MISSING-RAW", severity="FAIL",
                reason_code="RAW_ARTIFACT_MISSING",
                affected=[f"measurementResults[{m.runId}].rawArtifactHashes"],
                remediation="补齐 raw artifact hash（stdout/stderr/intermediate）；screenshot 不可作为 primary evidence"))
    return findings
```

---

### AT-SEED-CHERRY · seed cherry-picking

- **attackId**：`AT-SEED-CHERRY`
- **定义**：跑了多个 seed，只报告有利的 seed 结果（`68` §2 第 4 条；`81` §3 `cherry-pick seed`）。
- **检测机制**：
  1. `WorkflowBinding.seedPolicy` hash 进 proofHash（`03` §3.2）；
  2. `runRegistry` 必须完整：每个声明的 seed 都有 run 记录；
  3. 缺失 run（hidden failed run）→ WARN/FAIL（`68` §2 第 6 条）。
- **expectedVerdict**：`INCONCLUSIVE`（或 fail 当 hidden run 被检测到）。
- **reasonCode**：`SEED_POLICY_MISMATCH` / `HIDDEN_FAILED_RUN`。
- **golden vector**：`gv-seed-cherry-01` —— seedPolicy 声明 `[42, 7, 99]` 但 runRegistry 仅含 seed=42 的 run → `INCONCLUSIVE` + `HIDDEN_FAILED_RUN`；`gv-seed-cherry-02` —— seed 42 改 43 → seedPolicy hash 变 → proof head 变。
- **关联**：`03` §3.2、F8、`68` §2 第 4/6 条。

```python
def detect_seed_cherry(input: AntiTheaterLintInput) -> list[AntiTheaterFinding]:
    findings = []
    declared_seeds = input.fec.seedPolicy.declaredSeeds         # 来自 freeze
    ran_seeds = {r.seed for r in input.runRegistry.runs}
    missing = set(declared_seeds) - ran_seeds
    if missing:
        findings.append(finding(
            attack_id="AT-SEED-CHERRY", severity="FAIL",
            reason_code="HIDDEN_FAILED_RUN",
            affected=[f"runRegistry (missing seeds {sorted(missing)})"],
            remediation="补齐所有 declared seed 的 run（含失败 run）；hidden failed run 违反 run 完整性"))
    # seedPolicy hash 变化（seed 被偷换）
    frozen_sp = input.preregistrationRecord.seedPolicyHash
    if canonical_hash(input.fec.seedPolicy) != frozen_sp:
        findings.append(finding(
            attack_id="AT-SEED-CHERRY", severity="FAIL",
            reason_code="SEED_POLICY_MISMATCH",
            affected=["fec.seedPolicy"],
            remediation="恢复 freeze 时的 seedPolicy；换 seed = p-hacking（F8）"))
    return findings
```

---

### AT-WORKFLOW-DIGEST · workflow digest mismatch

- **attackId**：`AT-WORKFLOW-DIGEST`
- **定义**：`workflowHash` / `containerDigest` / `environmentHash` / `commandHash` 任一在 freeze 后被替换（`68` §2 第 15 条）。
- **检测机制**：`WorkflowBinding` 四 hash 与 freeze 记录逐项比对（`03` §3.2）。
- **expectedFail**：`fail`（verifier RED；`04` §8）。
- **reasonCode**：`WORKFLOW_HASH_MISMATCH` / `CONTAINER_DIGEST_MISMATCH` / `ENV_HASH_MISMATCH`。
- **golden vector**：`gv-workflow-digest-01` —— containerDigest 变 → RED。
- **关联**：`03` §3.2、`04` §8、`02` §2.1。

```python
def detect_workflow_digest(input: AntiTheaterLintInput) -> list[AntiTheaterFinding]:
    findings = []
    for wb in input.bindings:
        if not isinstance(wb, WorkflowBinding):
            continue
        frozen = lookup_freeze_record(wb.workflowId)
        checks = [
            (wb.workflowHash, frozen.workflowHash, "WORKFLOW_HASH_MISMATCH", "workflowHash"),
            (wb.containerDigest, frozen.containerDigest, "CONTAINER_DIGEST_MISMATCH", "containerDigest"),
            (wb.environmentHash, frozen.environmentHash, "ENV_HASH_MISMATCH", "environmentHash"),
        ]
        for actual, expected, code, field in checks:
            if expected and actual != expected:
                findings.append(finding(
                    attack_id="AT-WORKFLOW-DIGEST", severity="BLOCK",
                    reason_code=code,
                    affected=[f"workflowBindings[{wb.workflowId}].{field}"],
                    remediation=f"{field} 与 freeze 时不符；恢复 freeze 版本或标 protocol deviation"))
    return findings
```

---

### AT-REPORT-MISMATCH · natural-language verdict mismatch

- **attackId**：`AT-REPORT-MISMATCH`
- **定义**：报告 / markdown / README 中的自然语言 verdict（如“证明了 X”）与 structured verdict（如 `INCONCLUSIVE`）不一致；或把 `UNTESTED` 文案改成 `CONFIRMED`（`68` §3 攻击 4）。
- **检测机制**：
  1. `report.naturalLanguageVerdict` 必须从 `verdictTrace.verdict` deterministic 渲染（`02` §6 原则 3：解释字段可删除而不改 verdict）；
  2. `conclusionStrength` 严格强于 `verdict` → mismatch（`13` §2 `RULE-SCOPE-001`）；
  3. structured verdict wins（`03` §8）。
- **expectedFail**：`fail`（不阻断 seal，但 report verdict 被强制回退到 structured；`04` §3 `humanSummary` 不进 proofHash）。
- **reasonCode**：`REPORT_VERDICT_MISMATCH` / `OVERCLAIMING`。
- **golden vector**：`gv-report-mismatch-01` —— verdict `UNTESTED` 但 README 写“确认发现”→ mismatch，structured wins。
- **关联**：`03` §8、`13` §2 `RULE-SCOPE-001`、`02` §6 原则 3。

```python
# verdict → 允许的自然语言强度（deterministic 映射表）
VERDICT_STRENGTH = {
    "CONFIRMED":       {"supports", "confirms"},
    "REFUTED":         {"refutes", "rejects"},
    "INCONCLUSIVE":    {"inconclusive", "mixed", "insufficient"},
    "DEGRADED_SCOPE":  {"partial", "narrow-scope", "degraded"},
    "UNTESTED":        {"untested", "not-tested", "no-evidence"},
}
OVERCLAIM_WORDS = {"proves", "证明了", "definitively", "guarantees", "确保"}

def detect_report_mismatch(input: AntiTheaterLintInput) -> AntiTheaterFinding | None:
    v = input.verdict.verdict
    report = input.envelopeDraft.humanSummary or ""
    allowed = VERDICT_STRENGTH[v]
    report_lower = report.lower()
    # 1. 直接 mismatch：report 用了不属于该 verdict 强度的词
    used = [w for w in all_strength_words() if w in report_lower and w not in allowed]
    # 2. 绝对化用词（任何 verdict 都禁）
    overclaim = [w for w in OVERCLAIM_WORDS if w in report_lower]
    if used or overclaim:
        return finding(
            attack_id="AT-REPORT-MISMATCH", severity="FAIL",
            reason_code="REPORT_VERDICT_MISMATCH" if used else "OVERCLAIMING",
            affected=["envelopeDraft.humanSummary"],
            remediation=f"natural language verdict 必须从 structured verdict={v} 渲染；"
                        f"禁用词：{overclaim}；不当强度词：{used}")
    return None
```

---

### AT-PHACK-ALPHA · p-hacking / alpha inflation

- **attackId**：`AT-PHACK-ALPHA`
- **定义**：事后抬高 `alpha`（如 `0.0125 → 0.05`）让原本不显著的结果通过（`68` §2 第 8 条；`81` §3 `alpha inflation`）。
- **检测机制**：`preregistrationRecord.alpha` ≠ `executed.alpha` → deviation。
- **expectedVerdict**：`UNTESTED`（protocol deviation）。
- **reasonCode**：`ALPHA_INFLATION_DEVIATION`。
- **golden vector**：`gv-phack-alpha-01` —— freeze `alpha=0.0125`，executed `alpha=0.05` → `UNTESTED` + `ALPHA_INFLATION_DEVIATION`。
- **关联**：F8、`81` §3、`03` §4。

```python
def detect_phack_alpha(input: AntiTheaterLintInput) -> AntiTheaterFinding | None:
    frozen = input.preregistrationRecord.alpha
    executed = input.fec.statisticalPlan.alpha
    if not floats_equal(frozen, executed, tol=0):              # alpha 精确比较，不容差
        return finding(
            attack_id="AT-PHACK-ALPHA", severity="FAIL",
            reason_code="ALPHA_INFLATION_DEVIATION",
            affected=["fec.statisticalPlan.alpha"],
            remediation=f"恢复 freeze alpha={frozen}；事后改 alpha = p-hacking（F8）")
    return None
```

---

### AT-PHACK-CORRECTION · 多重检验未校正

- **attackId**：`AT-PHACK-CORRECTION`
- **定义**：多个 measurable implications（multiple endpoints）但无多重检验校正（`81` §3 `multiple endpoint fishing`；`13` §9 完整示例）。
- **检测机制**：`measurableImplications.length > 1 && statisticalPlan.multipleTestingCorrection === "none"` → FAIL（`13` §2 `RULE-STAT-001`）。
- **expectedVerdict**：`INCONCLUSIVE`（`13` §9.3 verdict 被强制从 `CONFIRMED` 降为 `INCONCLUSIVE`）。
- **reasonCode**：`MULTIPLE_TESTING_UNCORRECTED`。
- **golden vector**：`gv-phack-correction-01` —— 3 个 implications，`correction="none"`，verdict 原 `CONFIRMED` → 强制 `INCONCLUSIVE`（即 `13` §9 的 `n_trap_phack_001`）。
- **关联**：F8、`13` §2/§9、`11` §4.2。

```python
def detect_phack_correction(input: AntiTheaterLintInput) -> AntiTheaterFinding | None:
    n = len(input.fec.measurableImplications) if hasattr(input.fec, "measurableImplications") else 1
    correction = input.fec.statisticalPlan.multipleTestingCorrection   # "none"|"bonferroni"|"holm"|"bh_fdr"
    if n > 1 and correction == "none":
        return finding(
            attack_id="AT-PHACK-CORRECTION", severity="FAIL",
            reason_code="MULTIPLE_TESTING_UNCORRECTED",
            affected=["fec.statisticalPlan.multipleTestingCorrection"],
            remediation=f"{n} 个 implications 须校正（bonferroni/holm/bh_fdr）；verdict 强制 INCONCLUSIVE（13 §9）")
    return None
```

---

### AT-HARK · HARKing

- **attackId**：`AT-HARK`
- **定义**：Hypothesizing After Results are Known——先看结果再倒推假设（`13` §2 `RULE-HARK-001`；`81` §3）。
- **检测机制**：`hypothesis.sealedAt > experiment.finishedAt`（`revisionAfterResult === true`，`11` §1.1 / `13` §2）。
- **expectedVerdict**：禁 `CONFIRMED` → 强制 `claimStrength="exploratory"`，verdict 不可 `CONFIRMED`（实际落 `UNTESTED` 或 `INCONCLUSIVE`）。
- **reasonCode**：`HARKING_REVISION_AFTER_RESULT`。
- **golden vector**：`gv-hark-01` —— `hypothesis.sealedAt=2026-07-01`，`experiment.finishedAt=2026-06-28` → HARK → 禁 `CONFIRMED`。
- **关联**：F1/F8、`11` §1.1、`13` §2。

```python
def detect_hark(input: AntiTheaterLintInput) -> AntiTheaterFinding | None:
    hyp_sealed = input.preregistrationRecord.hypothesisSealedAt
    exp_finished = max(r.endedAt for r in input.executionTrace.runs if r.endedAt)
    if hyp_sealed > exp_finished:
        return finding(
            attack_id="AT-HARK", severity="FAIL",
            reason_code="HARKING_REVISION_AFTER_RESULT",
            affected=["preregistrationRecord.hypothesisSealedAt"],
            remediation="假设在结果之后才 seal = HARKing；强制 claimStrength=exploratory，verdict 不可 CONFIRMED（F1/F8）")
    return None
```

---

### AT-STOPPING-RULE · stopping-rule 违规

- **attackId**：`AT-STOPPING-RULE`
- **定义**：声明的 stopping rule（fixed_n / group_sequential / alpha_spending）与实际 interim looks 不符，或 early stop 未登记（`68` §2 第 9 条；`81` §3/§5）。
- **检测机制**：
  1. `StoppingRule.type` 与 `interim_looks` 数量比对（`81` §5）；
  2. early stop 必须在 `runRegistry` 登记 + 时间戳晚于 freeze；
  3. freeze 后修改 stopping rule → FAIL。
- **expectedVerdict**：`UNTESTED`（stopping rule 违规使 Type-I error 控制失效）。
- **reasonCode**：`STOPPING_RULE_VIOLATION` / `UNREGISTERED_EARLY_STOP`。
- **golden vector**：`gv-stopping-rule-01` —— `StoppingRule.type="fixed_n"` 但实际有 3 次 interim look → `UNTESTED`；`gv-stopping-rule-02` —— freeze 后补 early stop → FAIL。
- **关联**：`81` §5、F8、`68` §2 第 9 条。

```python
def detect_stopping_rule(input: AntiTheaterLintInput) -> list[AntiTheaterFinding]:
    findings = []
    sr = input.fec.statisticalPlan.stoppingRule               # StoppingRule (81 §5)
    interim_looks = [r for r in input.executionTrace.runs if r.isInterim]
    if sr.type == "fixed_n" and len(interim_looks) > 1:
        findings.append(finding(
            attack_id="AT-STOPPING-RULE", severity="FAIL",
            reason_code="STOPPING_RULE_VIOLATION",
            affected=["executionTrace.runs (interim looks)"],
            remediation="fixed_n 不允许多次 interim look；改用 group_sequential 并预声明"))
    if sr.type == "none_declared" and len(interim_looks) > 1:
        findings.append(finding(
            attack_id="AT-STOPPING-RULE", severity="FAIL",
            reason_code="STOPPING_RULE_VIOLATION",
            affected=["fec.statisticalPlan.stoppingRule"],
            remediation="未声明 stopping rule 却有 interim look；须预注册 sequential plan"))
    # early stop 未登记
    declared_stops = {s.runId for s in sr.declaredEarlyStops} if sr.declaredEarlyStops else set()
    actual_stops = {r.runId for r in interim_looks if r.earlyStopped}
    unregistered = actual_stops - declared_stops
    if unregistered:
        findings.append(finding(
            attack_id="AT-STOPPING-RULE", severity="FAIL",
            reason_code="UNREGISTERED_EARLY_STOP",
            affected=[f"executionTrace.runs[{rid}]" for rid in unregistered],
            remediation="early stop 必须在 stopping rule 中预声明（81 §5）"))
    return findings
```

---

### AT-OPTIONAL-STOPPING · optional stopping

- **attackId**：`AT-OPTIONAL-STOPPING`
- **定义**：使用 sequential 测试但未声明 alpha-spending（边看边停、无 spending function 保护），导致 Type-I error 膨胀（`81` §5；`11` §4.3）。
- **检测机制**：`StoppingRule.type in {"group_sequential","alpha_spending"}` 但 `spendingFunction` 为空 → 禁 `CONFIRMED`。
- **expectedVerdict**：`UNTESTED` 或 `INCONCLUSIVE`（`81` §5 末：sequential 无 alpha spending → `CONFIRMED` blocked）。
- **reasonCode**：`OPTIONAL_STOPPING_NO_SPENDING`。
- **golden vector**：`gv-optional-stopping-01` —— `type="group_sequential"`, `plannedLooks=5`, `spendingFunction=null` → 禁 `CONFIRMED`。
- **关联**：`81` §5、`11` §4.3（W5 路线图，MVP 仅 static prereg check）。

> **诚实边界（对齐 `11` §4.3）**：完整 alpha-spending 计算为 W5 `ROADMAP`。MVP 仅做 static preregistration check（校验“是否预声明了 spending function”），**不**声称实现了完整 sequential Type-I error control。

```python
def detect_optional_stopping(input: AntiTheaterLintInput) -> AntiTheaterFinding | None:
    sr = input.fec.statisticalPlan.stoppingRule
    if sr.type in ("group_sequential", "alpha_spending") and not sr.spendingFunction:
        return finding(
            attack_id="AT-OPTIONAL-STOPPING", severity="FAIL",
            reason_code="OPTIONAL_STOPPING_NO_SPENDING",
            affected=["fec.statisticalPlan.stoppingRule.spendingFunction"],
            remediation="sequential 测试须声明 spendingFunction（Pocock/O'Brien-Fleming）；否则 CONFIRMED blocked（81 §5）")
    return None
```

---

### AT-DEP-FLOAT-DRIFT · dependency / float drift

- **attackId**：`AT-DEP-FLOAT-DRIFT`
- **定义**：依赖版本（lockfile）、容器 digest、数值容差（tolerance）在 freeze 后变化，导致“同代码不同结果”（`68` §2 第 15/16 条）。
- **检测机制**：
  1. lockfile hash（`package-lock.json` / `pnpm-lock.yaml` / `requirements.txt`）进 proofHash；
  2. `containerDigest` 比对（与 `AT-WORKFLOW-DIGEST` 互补，此处针对 environment-wide）；
  3. numeric tolerance hash：`tolerance` 未 freeze → FAIL（`68` §2 第 16 条）。
- **expectedFail**：`fail`（verifier RED）。
- **reasonCode**：`LOCKFILE_HASH_MISMATCH` / `NUMERIC_TOLERANCE_UNFROZEN`。
- **golden vector**：`gv-dep-drift-01` —— lockfile 改一行 → proof head 变；`gv-float-drift-01` —— tolerance `1e-9` 改 `1e-7` → FAIL（已知 1e-7 divergence，`68` §2 第 14 条）。
- **关联**：`02` §2.1、`68` §2 第 14-16 条。

```python
def detect_dep_float_drift(input: AntiTheaterLintInput) -> list[AntiTheaterFinding]:
    findings = []
    frozen_lock = input.preregistrationRecord.lockfileHash
    actual_lock = hash_file("<REPOSITORY_ROOT>/package-lock.json")
    if frozen_lock and actual_lock != frozen_lock:
        findings.append(finding(
            attack_id="AT-DEP-FLOAT-DRIFT", severity="BLOCK",
            reason_code="LOCKFILE_HASH_MISMATCH",
            affected=["environment.lockfileHash"],
            remediation="lockfile 变化会改 proof head；恢复 freeze 版本或重算并标 deviation"))
    tol = input.fec.statisticalPlan.numericTolerance
    if tol is not None and not input.preregistrationRecord.toleranceFrozen:
        findings.append(finding(
            attack_id="AT-DEP-FLOAT-DRIFT", severity="FAIL",
            reason_code="NUMERIC_TOLERANCE_UNFROZEN",
            affected=["fec.statisticalPlan.numericTolerance"],
            remediation="numeric tolerance 必须 freeze（68 §2 第16条）；未 freeze = floating nondeterminism"))
    return findings
```

---

### AT-OVERFIT · benchmark overfitting

- **attackId**：`AT-OVERFIT`
- **定义**：在 public split / public seed 上调参过拟合，hidden split 上不成立（`68` §2 第 12 条）。
- **检测机制**：强制 hidden/private split；public seed 过拟合必须在 hidden split 上验证（`02` §2.4 FAR-Bench 定位为 verification protocol / attack corpus，**非**通用 AI4S 排行榜）。
- **expectedVerdict**：`DEGRADED_SCOPE`（public-only 结果范围窄于 claim）。
- **reasonCode**：`PUBLIC_ONLY_OVERFIT`。
- **golden vector**：`gv-overfit-01` —— 仅 public split 通过，hidden split 未跑 → `DEGRADED_SCOPE`。
- **关联**：`68` §2 第 12 条、`02` §2.4、C13（不冒充通用 benchmark）。
- **状态**：`ROADMAP`（依赖 hidden/private split 机制，方向明确，不作为当前完成能力）。

```python
def detect_overfit(input: AntiTheaterLintInput) -> AntiTheaterFinding | None:
    splits_run = {m.splitName for m in input.executionTrace.measurements if m.splitName}
    if "hidden" not in splits_run and "public" in splits_run:
        return finding(
            attack_id="AT-OVERFIT", severity="WARN",
            reason_code="PUBLIC_ONLY_OVERFIT",
            affected=["executionTrace.measurements"],
            remediation="public split 结果须在 hidden split 复核；否则 verdict 强制 DEGRADED_SCOPE")
    return None
```

---

### AT-FAKE-DEGRADED · fake degraded scope / null laundering

- **attackId**：`AT-FAKE-DEGRADED`
- **定义**：
  1. **fake degraded scope**：用 `DEGRADED_SCOPE` 掩盖本应是 `REFUTED` 的直接反证（与 `AT-SCOPE-LAUNDER` 第 2 子路径一致，`68` §2 第 19 条）；
  2. **null laundering**：把 null result（无效应）藏起来不报，或把 null result 当失败 hidden run 吞掉（`68` §6 null result first-class）。
- **检测机制**：
  1. direct refutation 优先于 `DEGRADED_SCOPE`（`03` §6 优先级）；
  2. `NullResultRecord` 必须进 proofHash（`68` §6）；null result 不得被 hidden failed run 吞。
- **expectedVerdict**：`REFUTED`（当存在直接反证）/ `UNTESTED`（当 null result 被吞，证据不全）。
- **reasonCode**：`REFUTATION_HIDDEN_BY_SCOPE` / `NULL_RESULT_LAUNDERED`。
- **golden vector**：`gv-fake-degraded-01` —— 直接反证存在却标 `DEGRADED_SCOPE` → 强制 `REFUTED`；`gv-fake-degraded-02` —— null result 未进 proofHash → `UNTESTED`。
- **关联**：`68` §6、`03` §6、F1。

```python
def detect_fake_degraded(input: AntiTheaterLintInput) -> list[AntiTheaterFinding]:
    findings = []
    # 1. fake degraded scope（与 AT-SCOPE-LAUNDER 联动，此处独立产出 reasonCode）
    if input.verdict.verdict == "DEGRADED_SCOPE" and input.verdict.hasDirectRefutation:
        findings.append(finding(
            attack_id="AT-FAKE-DEGRADED", severity="FAIL",
            reason_code="REFUTATION_HIDDEN_BY_SCOPE",
            affected=["verdictTrace.verdict"],
            remediation="存在直接反证；verdict 必须为 REFUTED（03 §6 优先级）"))
    # 2. null laundering：null result 未进 proofHash
    declared_nulls = input.runRegistry.declaredNullResults or []
    sealed_nulls = {n.nullResultId for n in input.envelopeDraft.nullResults}
    for nr in declared_nulls:
        if nr.nullResultId not in sealed_nulls and not nr.enteredProofHash:
            findings.append(finding(
                attack_id="AT-FAKE-DEGRADED", severity="FAIL",
                reason_code="NULL_RESULT_LAUNDERED",
                affected=[f"nullResults[{nr.nullResultId}]"],
                remediation="null result 是证据不是失败（68 §6）；必须进 proofHash，不得被 hidden run 吞"))
    return findings
```

> **NullResultRecord 结构（与 `68` §6 一致）**：
> ```ts
> export interface NullResultRecord {
>   nullResultId: string;
>   testId: string;
>   reason: "no_effect" | "underpowered" | "measurement_failed" | "assumption_failed";
>   enteredProofHash: boolean;     // 必须 true
>   linkedVerdictRule: string;     // 关联的 reasonCode
> }
> ```
> 规则：null result 可导致 `INCONCLUSIVE` 或 `REFUTED`，**不得**默认 `CONFIRMED`。

---

## §3. 确定性检测总伪代码（编排器）

`runAntiTheaterLint` 是所有 `detect_*` 函数的编排器。它**取严不取宽**地汇总 findings → `AntiTheaterReport`。

```python
# <REPOSITORY_ROOT>/src/anti_theater/lint.ts （已落地·状态：IMPLEMENTED_VERIFIED）
# computedBy = "deterministic_compiler"（07 §4 / 13 §3）

DETECTORS = [
    detect_fake_pass,            # AT-FAKE-PASS
    detect_label_only,           # AT-LABEL-ONLY
    detect_judge_override,       # AT-JUDGE-OVERRIDE
    detect_posthoc_threshold,    # AT-POSTHOC-THRESHOLD
    detect_metric_swap,          # AT-METRIC-SWAP
    detect_dataset_drift,        # AT-DATA-DRIFT
    detect_data_hash_fake,       # AT-DATA-HASH-FAKE
    detect_scope_launder,        # AT-SCOPE-LAUNDER
    detect_missing_raw,          # AT-MISSING-RAW
    detect_seed_cherry,          # AT-SEED-CHERRY
    detect_workflow_digest,      # AT-WORKFLOW-DIGEST
    detect_report_mismatch,      # AT-REPORT-MISMATCH
    detect_phack_alpha,          # AT-PHACK-ALPHA
    detect_phack_correction,     # AT-PHACK-CORRECTION
    detect_hark,                 # AT-HARK
    detect_stopping_rule,        # AT-STOPPING-RULE
    detect_optional_stopping,    # AT-OPTIONAL-STOPPING
    detect_dep_float_drift,      # AT-DEP-FLOAT-DRIFT
    detect_overfit,              # AT-OVERFIT (ROADMAP)
    detect_fake_degraded,        # AT-FAKE-DEGRADED
]

def run_anti_theater_lint(input: AntiTheaterLintInput) -> AntiTheaterReport:
    findings: list[AntiTheaterFinding] = []
    for detector in DETECTORS:
        result = detector(input)                    # deterministic，无 LLM
        if result is None:
            continue
        if isinstance(result, list):
            findings.extend(result)
        else:
            findings.append(result)

    score = compute_anti_theater_score(findings)    # 见 §4
    constraint = apply_verdict_constraint(findings, input.verdict.verdict)

    return AntiTheaterReport(
        envelope_id=input.envelopeDraft.envelopeId,
        anti_theater_score=score,
        findings=findings,
        can_seal_confirmed=(score >= 70 and not any(f.severity == "BLOCK" for f in findings)
                            and constraint.forced_verdict not in ("UNTESTED",)),
        verdict_constraint=constraint,
    )
```

### §3.1 severity → verdict 约束映射

| severity | 含义 | 对 seal 的影响 | 对 verdict 的影响 |
|---|---|---|---|
| `INFO` | 记录性 | 无 | 无 |
| `WARN` | 软告警 | 无（但 Honesty Wall 展示） | 无（除非累积扣分到阈值） |
| `FAIL` | 硬失败 | 受 `score` 与 `forcedVerdict` 决定 | 按 `forcedVerdict` 降级（取严） |
| `BLOCK` | 拒绝 seal | **直接拒绝 seal**（`04` §1） | 强制 `UNTESTED`（不可 seal 即不可 `CONFIRMED`） |

### §3.2 forcedVerdict 决策（取严不取宽，遵守 `03` §6 优先级）

```python
# 优先级：DEGRADED_SCOPE > UNTESTED > INCONCLUSIVE（anti-theater 只降级，不产 REFUTED/CONFIRMED）
SEVERITY_TO_FORCED = {
    "AT-DATA-DRIFT":          "DEGRADED_SCOPE",   # 数据漂移 → 范围收窄
    "AT-SCOPE-LAUNDER":       "DEGRADED_SCOPE",
    "AT-OVERFIT":             "DEGRADED_SCOPE",
    "AT-FAKE-PASS":           None,               # BLOCK，由 blockSeal 处理
    "AT-LABEL-ONLY":          "UNTESTED",
    "AT-MISSING-RAW":         "UNTESTED",
    "AT-POSTHOC-THRESHOLD":   "UNTESTED",
    "AT-METRIC-SWAP":         "UNTESTED",
    "AT-HARK":                "UNTESTED",
    "AT-STOPPING-RULE":       "UNTESTED",
    "AT-PHACK-ALPHA":         "UNTESTED",
    "AT-FAKE-DEGRADED":       None,               # 由 hasDirectRefutation 决定 REFUTED（非 anti-theater 产）
    "AT-SEED-CHERRY":         "INCONCLUSIVE",
    "AT-PHACK-CORRECTION":    "INCONCLUSIVE",
    "AT-OPTIONAL-STOPPING":   "INCONCLUSIVE",
    "AT-JUDGE-OVERRIDE":      None,               # BLOCK（CI 阻断）
    "AT-DATA-HASH-FAKE":      None,               # BLOCK
    "AT-WORKFLOW-DIGEST":     None,               # BLOCK
    "AT-DEP-FLOAT-DRIFT":     None,               # BLOCK（部分子项 WARN）
    "AT-REPORT-MISMATCH":     None,               # 不降级（structured wins，report 回退）
}

def apply_verdict_constraint(findings, current_verdict):
    priorities = {"DEGRADED_SCOPE": 3, "UNTESTED": 2, "INCONCLUSIVE": 1}
    forced = None
    for f in findings:
        candidate = SEVERITY_TO_FORCED.get(f.attack_id)
        if candidate and (forced is None or priorities[candidate] > priorities[forced]):
            forced = candidate
    block_seal = any(f.severity == "BLOCK" for f in findings)
    if block_seal:
        forced = forced or "UNTESTED"             # BLOCK 时至少降到 UNTESTED
    # 与 current_verdict 取严（03 §6）
    if forced and priorities.get(forced, 0) >= priorities.get(map_to_priority(current_verdict), 0):
        final = forced
    else:
        final = forced  # forced 为空则不约束
    return AntiTheaterVerdictConstraint(
        forced_verdict=final,
        block_seal=block_seal,
        reason_codes=list({f.reasonCode for f in findings}),
    )
```

> **纪律**：anti-theater 只“降级”（把不合规的 `CONFIRMED` 拉下来），**不**主动产 `REFUTED`（`REFUTED` 由 `03` §7 verdict kernel 的 `any_refute` 路径产出，证据反例）。这与 `13` §3.1 `FailureVerdict` 仅 3 值子集的设计一致，非枚举漂移。

---

## §4. AntiTheaterScore 算法（与 `68` §7 一致）

```text
score = 100
  - 25 * critical_protocol_deviation      # AT-POSTHOC-THRESHOLD / AT-METRIC-SWAP / AT-PHACK-ALPHA / AT-HARK / AT-STOPPING-RULE / AT-OPTIONAL-STOPPING
  - 20 * missing_primary_evidence         # AT-FAKE-PASS / AT-LABEL-ONLY / AT-MISSING-RAW
  - 15 * hidden_failed_run                # AT-SEED-CHERRY (HIDDEN_FAILED_RUN)
  - 10 * weak_dataset_binding             # AT-DATA-DRIFT (WARN) / AT-DATA-HASH-FAKE (recoverable)
  - 10 * llm_only_support                 # AT-JUDGE-OVERRIDE (non-fatal) / AT-LABEL-ONLY
  - 10 * no_negative_control              # FEC 缺 negative control（81 §2）
  - 10 * report_proof_mismatch            # AT-REPORT-MISMATCH
```

阈值（与 `68` §7 一致）：

| score | 后果 |
|---|---|
| `< 70` | 不可 seal `CONFIRMED`（`canSealConfirmed=false`） |
| `< 50` | 强制 `UNTESTED` 或 `INCONCLUSIVE` |
| 任一 `BLOCK` finding | `canSealConfirmed=false`，`blockSeal=true` |

```python
def compute_anti_theater_score(findings: list[AntiTheaterFinding]) -> int:
    score = 100
    attack_ids = {f.attackId for f in findings}
    if attack_ids & {"AT-POSTHOC-THRESHOLD","AT-METRIC-SWAP","AT-PHACK-ALPHA",
                     "AT-HARK","AT-STOPPING-RULE","AT-OPTIONAL-STOPPING"}:
        score -= 25
    if attack_ids & {"AT-FAKE-PASS","AT-LABEL-ONLY","AT-MISSING-RAW"}:
        score -= 20
    if any(f.reasonCode == "HIDDEN_FAILED_RUN" for f in findings):
        score -= 15
    if attack_ids & {"AT-DATA-DRIFT","AT-DATA-HASH-FAKE"}:
        if any(f.severity == "WARN" for f in findings if f.attackId in ("AT-DATA-DRIFT",)):
            score -= 10
    if attack_ids & {"AT-JUDGE-OVERRIDE","AT-LABEL-ONLY"}:
        score -= 10
    # no_negative_control：检查 FEC 是否声明 negative control（81 §2）
    if not has_negative_control(current_fec):
        score -= 10
    if "AT-REPORT-MISMATCH" in attack_ids:
        score -= 10
    return max(score, 0)
```

---

## §5. 攻击 corpus 与 golden vectors

### §5.1 AttackCase 结构（与 `68` §4 一致）

```ts
export interface AttackCase {
  attackId: string;                              // AT-DATA-DRIFT 等
  attackClass: string;                           // "mutation" | "forgery" | "omission" | "override"
  baseEnvelopePath: string;                      // <REPOSITORY_ROOT>/tests/fixtures/anti_theater/<base>.json
  mutation: MutationSpec;                        // 字段级 mutation 描述
  expectedVerifierStatus: "RED" | "YELLOW";      // far verify 输出 status
  expectedVerdict: "REFUTED" | "INCONCLUSIVE" | "DEGRADED_SCOPE" | "UNTESTED" | "UNCHANGED_BUT_MISMATCH";
  expectedReasonCode: string;                    // 进入 VerdictKernelOutput.reasonCodes[]
}
```

### §5.2 P0 最小 golden vectors（与 `03` §9 的 10 vectors 对齐，反剧场子集）

| golden vector | 攻击 | base → mutation | expected |
|---|---|---|---|
| `gv-fake-pass-01` | AT-FAKE-PASS | 全 PASS JSON 删 measurementResults | RED, `UNTESTED`, `REQUIRED_EVIDENCE_MISSING` |
| `gv-label-only-01` | AT-LABEL-ONLY | 删 rawArtifactHashes 留 llmLabel | RED, `UNTESTED`, `LABEL_ONLY_EVIDENCE` |
| `gv-judge-override-01` | AT-JUDGE-OVERRIDE | `createdBy: "llm"` | RED, CI fail, `LLM_AS_FINAL_JUDGE` |
| `gv-posthoc-threshold-01` | AT-POSTHOC-THRESHOLD | threshold 0.05→0.08 | YELLOW, `UNTESTED`, `POSTHOC_THRESHOLD_DEVIATION` |
| `gv-metric-swap-01` | AT-METRIC-SWAP | primaryMetric bls_power→lomb_scargle | YELLOW, `UNTESTED`, `PRIMARY_METRIC_SWAPPED` |
| `gv-data-drift-01` | AT-DATA-DRIFT | 改 1 byte row | RED, `DEGRADED_SCOPE`, `DATASET_HASH_MISMATCH` |
| `gv-data-drift-02` | AT-DATA-DRIFT | schema column rename | RED, `DEGRADED_SCOPE`, `DATASET_SCHEMA_MISMATCH` |
| `gv-scope-launder-01` | AT-SCOPE-LAUNDER | supportedScope ⊂ claimScope | YELLOW, `DEGRADED_SCOPE`, `SCOPE_LAUNDERED` |
| `gv-missing-raw-01` | AT-MISSING-RAW | 删 rawArtifactHashes | RED, `UNTESTED`, `RAW_ARTIFACT_MISSING` |
| `gv-seed-cherry-01` | AT-SEED-CHERRY | 删 seed=7,99 的 run | YELLOW, `INCONCLUSIVE`, `HIDDEN_FAILED_RUN` |
| `gv-workflow-digest-01` | AT-WORKFLOW-DIGEST | 改 containerDigest | RED, `BLOCK`, `CONTAINER_DIGEST_MISMATCH` |
| `gv-report-mismatch-01` | AT-REPORT-MISMATCH | README 写“确认”但 verdict UNTESTED | YELLOW, structured wins, `REPORT_VERDICT_MISMATCH` |
| `gv-phack-alpha-01` | AT-PHACK-ALPHA | alpha 0.0125→0.05 | YELLOW, `UNTESTED`, `ALPHA_INFLATION_DEVIATION` |
| `gv-phack-correction-01` | AT-PHACK-CORRECTION | 3 implications, correction=none | YELLOW, `INCONCLUSIVE`, `MULTIPLE_TESTING_UNCORRECTED` |
| `gv-hark-01` | AT-HARK | hypothesisSealedAt > finishedAt | YELLOW, `UNTESTED`, `HARKING_REVISION_AFTER_RESULT` |
| `gv-stopping-rule-01` | AT-STOPPING-RULE | fixed_n 但 3 interim looks | YELLOW, `UNTESTED`, `STOPPING_RULE_VIOLATION` |
| `gv-fake-degraded-01` | AT-FAKE-DEGRADED | 直接反证 + DEGRADED_SCOPE | RED, `REFUTED`, `REFUTATION_HIDDEN_BY_SCOPE` |

> 数量纪律（`01` §4）：上表 17 个 golden vector 为**设计清单**，实际命中的攻击数 / false green rate / CI 通过率写 `Pending`，由 `<REPOSITORY_ROOT>/tests/anti_theater/*.test.ts` 与 CI 输出回填，**不**手填。

### §5.3 10 个现场演示攻击（与 `68` §3 一致，用于答辩 tamper demo）

1. 改 dataset row → chain head 改，dataset binding RED（`gv-data-drift-01`）。
2. 改 alpha → FEC hash 改，protocol deviation（`gv-phack-alpha-01`）。
3. 删 failed run → completeness lint FAIL（`gv-seed-cherry-01`）。
4. 把 `UNTESTED` 报告文案改成 `CONFIRMED` → report/proof mismatch（`gv-report-mismatch-01`）。
5. LLM reviewer 写“supports strongly” → kernel 不变（`gv-judge-override-01`）。
6. schema column rename → schemaHash RED（`gv-data-drift-02`）。
7. seed 42 改 43 → seedPolicy RED（`gv-seed-cherry-02`）。
8. stopping rule 后补 → freeze timestamp 后修改 FAIL（`gv-stopping-rule-02`）。
9. fake `DEGRADED_SCOPE` → 同 scope refutation 优先（`gv-fake-degraded-01`）。
10. screenshot-only figure → evidence sufficiency 不过（`gv-label-only-01` 同型）。

---

## §6. CI Gates（与 `68` §5 / `13` §8.1 一致）

| CI gate | 路径（已落地） | 断言 | 状态 |
|---|---|---|---|
| `anti_theater_attack_corpus` | `tests/anti_theater/anti_theater_attack_corpus.test.ts` | 20 attacks 全部被检测（attackKind/reasonCode/forcedVerdict/blockSeal 命中） | `IMPLEMENTED_VERIFIED` |
| `false_green_rate` | `tests/anti_theater/false_green_rate.test.ts` | attack corpus false green rate = 0（全部 `hasFail \|\| blockSeal`） | `IMPLEMENTED_VERIFIED` |
| `known_failures_transparency` | `tests/anti_theater/known_failures_transparency.test.ts` | known failure + `CONFIRMED` → WARN/FAIL（不隐藏） | `IMPLEMENTED_VERIFIED` |
| `report_proof_mismatch` | `tests/anti_theater/report_proof_mismatch.test.ts` | markdown verdict 不可信，proof verdict 为准（structured wins） | `IMPLEMENTED_VERIFIED` |
| `llm_judge_injection` | `tests/anti_theater/llm_judge_injection.test.ts` | prompt injection 不可改 kernel output（`llmOverrideRejected=true`） | `IMPLEMENTED_VERIFIED` |
| `no_llm_final_judge_scan` | `scripts/no_llm_final_judge_scan.mjs`（ci-04·注册于 `ci_all.mjs` STEP 1b + `.github/workflows/ci.yml`） | src 出现 LLM-as-judge 模式 → exit 1（反 theater F1 硬门） | `IMPLEMENTED_VERIFIED` |
| `deterministic_lint_grep` | `scripts/anti_theater_deterministic_scan.mjs`（ci-at·注册于 `ci_all.mjs` STEP 1c + `.github/workflows/ci.yml`） | `src/anti_theater` 含 `openai`/`dashscope`/`chat.completions` → exit 1（F3 deterministic） | `IMPLEMENTED_VERIFIED` |

> 数字纪律：上表断言已由 CI 实测回填——5 测试 gate 随 `pnpm test`（827 TS tests 全绿），2 grep gate 随 `node scripts/ci_all.mjs`（STEP 1b/1c 全绿）。21 golden vectors 命中 20 attackId 全覆盖（`tests/fixtures/anti_theater/golden_vectors.ts`）。

---

## §7. 与系统其他层的集成

### §7.1 与 verdict kernel（`03` §7）的集成

`runAntiTheaterLint` 在 verdict kernel **之后**运行（kernel 先产出初步 verdict，anti-theater 再约束）：

```text
VerdictKernelInput
  ├─ fec / bindings / runs / measurements / statistics / deviations
  └─ antiTheaterFindings[]      ◀── 本附录产出（先于 kernel 的可选预扫，或 kernel 后的约束扫）
        │
        ▼
decideFiveValueVerdict(input)   （03 §7）
        │
        ▼
VerdictKernelOutput
  ├─ verdict
  ├─ reasonCodes[]              ◀── 含本附录的 reasonCode
  ├─ ruleTrace[]
  └─ evidenceSufficiency
        │
        ▼
ProofEnvelope.antiTheaterReport （04 §2）
```

### §7.2 与 ProofEnvelope（`04` §2/§3）的集成

`AntiTheaterReport` 进 `ProofEnvelope.antiTheaterReport`，且 `findings[].affectedProofHashInputs` 标注的字段必须进 `proofHash`（`04` §3）。`humanSummary` 中由 LLM 生成的解释文案**不**进 proofHash。

### §7.3 与 Integrity Firewall（`13`）的集成

本附录的 6 类核心攻击与 `13` §2 的 6 条 `RULE` 对应：

| 本附录 attackId | `13` ruleId | 关系 |
|---|---|---|
| AT-JUDGE-OVERRIDE | `RULE-JUDGE-001`（fatal） | 同源，CI 阻断 |
| AT-LABEL-ONLY / AT-MISSING-RAW | `RULE-CIT-001` / `RULE-DATA-001` | evidence sufficiency 联动 |
| AT-PHACK-CORRECTION | `RULE-STAT-001` | 同规则，`13` §9 完整示例 |
| AT-HARK | `RULE-HARK-001` | 同规则 |
| AT-SCOPE-LAUNDER / AT-REPORT-MISMATCH | `RULE-SCOPE-001` | scope/conclusion 一致性 |
| AT-DATA-DRIFT | `RULE-DATA-001` | dataset resolution 联动 |

> 分工：`13` 是 L9 runtime gate（每条 rule 产 1 个 `ProofCheck`），本附录是 envelope 级 lint（汇总产 `AntiTheaterReport`）。两者**不重复定义** ProofCheck 枚举，本附录的 `reasonCode` 与 `13` 的 `rule_id` 互补。

### §7.4 与 ConfoundingGate（`36`）的集成

因果类 claim（`claimType="causal"`）的 anti-theater 检查由 `36` 的 ConfoundingGate 承担（`unblocked` + `observational_only` → 禁 `CONFIRMED`，F6）。本附录**不**重复混杂检测，仅在 `AT-SCOPE-LAUNDER` 中处理“用 `DEGRADED_SCOPE` 掩盖因果反证”的同型问题。

---

## 融合织入（Open Science 工程范式迁移·DESIGN_PROPOSED·2026-07-05）

> 来源：`FAR_LAB_MASTER_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md` + `FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md` §C 末段。Open Science = Claude Code 分支重品牌化的执行层 agent 工作区；FAR-Chain = 验证层。迁移边界：只迁工程范式（反剧场 / fail-closed 服务门 / 收窄伪造窗口 / 内容寻址 CAS / derivable 标记 / 进程组 kill / AST 结构门），绝不迁 OS 的 LLM-裁决语义。下述条目原为融合 backlog；当前 FUSION-OS-1..14 已由受控突变双跑写回 `WIRED_GREEN`，唯一剩余红项见 DEPTH_LEDGER §A `P1-3_DASHSCOPE_CI_EVIDENCE`。

### 与本文档（APPENDIX_E_ANTI_THEATER）相关的融合缺口

- **FUSION-OS-1**（当前最大活体缺口·DESIGN_PROPOSED）：本附录列出的 20 类攻击（label-only / seed-cherry-picking / metric-swapping / workflow-digest-mismatch / natural-language-verdict-mismatch 等）在 `<REPOSITORY_ROOT>/src/anti_theater/lint.ts` 有 20 个检测器实现，但**仅 `<REPOSITORY_ROOT>/src/far_proof/verify.ts:412` 离线调用**；`<REPOSITORY_ROOT>/src/fec/orchestrator.ts:199` 运行时 verdict 路径硬编码 `antiTheaterFindings:[]` —— 即实时 verdict 从不消费检测器输出。FUSION-OS-1 把 `runAntiTheaterLint` 注入 `buildVerdictKernelInput` 闭合此缺口（对应 §7.1 集成图中的 `antiTheaterFindings[]` 通道在运行时为空）。**expected verdict 表（§5.2）不变，但运行时强制生效。**
- **FUSION-OS-6**（新攻击条目候选·forged-citation·DESIGN_PROPOSED）：LLM 产出虚假 provenance（来源由被验证方自填而非系统重算）—— 加 `provenanceClass` tag + 系统 hash 重算绑定检测。若落地，将作为 §2 攻击目录的第 21 类（attackId 候选 `AT-FORGED-CITATION`），expected verdict 取严映射到 `UNTESTED`（与 `AT-LABEL-ONLY` 同型：label-only 不可作 primary evidence）。
- **FUSION-OS-14**（expected verdict = REFUTED·DESIGN_PROPOSED）：identifier-fabrication 攻击（claim 带可校验 identifier DOI/arXiv/accession 但无 harness-verified 来源）的 expected verdict 从 `UNTESTED` 升为 **`REFUTED`**（须同步加 GV，见 `APPENDIX_B_GOLDEN_VECTORS.md`）。此为 §2 攻击目录 expected verdict 表的**唯一升严条目**，与 §3.2「anti-theater 只降级不产 REFUTED」纪律不冲突——`REFUTED` 由 verdict kernel `any_refute` 路径产出（§3.2 备注），identifier-fabrication 触发该路径的 deterministic 条件。

> 接线时升 `WIRED_RED`，物证由 keystone bot CI 双跑写回 `WIRED_GREEN`（见 `DEPTH_LEDGER.md` §D）。取序建议见 `CLAUDE.md` §4 P-FUSION（FUSION-OS-1 最高杠杆 → FUSION-OS-11 红线级 → FUSION-OS-13/14 内核规则 → 其余）。当前态：6 收敛点 C-1..C-6（来源不可自填 / 失败闭环门 / LLM-非裁决者 / 自排除规范哈希 / 冻结契约工件 / 从磁盘派生花名册）FAR-Chain 已独立达到，不重复立项。

---

## §8. 诚实边界与禁用口径（与 `07` 一致）

| **禁用口径** | **正确口径**（本附录语境） |
|---|---|
| 证明科学真理 | 判断证据链是否满足冻结可证伪契约，并把常见造假模式变成 verifier 可见 deviation |
| 物理不可篡改 | 篡改可检测、可定位字段、可产出 reasonCode |
| 完全可复现 | 可独立重算特定 proof input |
| 全自动科学家 | anti-theater 是 deterministic lint，不是 AI 裁判 |
| 通用 AI4S benchmark | FAR-Bench 是 verification protocol / attack corpus（`02` §2.4） |
| far-chain/ 作为实现根 | `<REPOSITORY_ROOT>/` 是实现根（`08` §2 修正） |
| 最新/第一/唯一 | 据已复核来源，hedge，标 `NEEDS_EXTERNAL_VERIFICATION` |

> 反幻觉纪律：本附录所有 `detect_*` 函数均 deterministic。不编造未在 `FINAL_PACKAGE` 出现的 API / 路径 / 数字。`AT-OVERFIT` 依赖的 hidden/private split 机制标 `ROADMAP`，不声称已落地。完整 sequential alpha-spending 标 W5 `ROADMAP`（`11` §4.3），MVP 仅 static prereg check。

---

## §9. 状态与边界总结

| 模块 / 攻击 / CI gate | 状态 | 备注 |
|---|---|---|
| `AntiTheaterHarness` 接口（§1） | `IMPLEMENTED_VERIFIED` | `src/anti_theater/{types,errors,schemas,finding_factory,utils}.ts` 落地（W3.1） |
| 20 类攻击目录（§2） | 19×`IMPLEMENTED_VERIFIED` + AT-OVERFIT `IMPLEMENTED_VERIFIED`(受限)/`ROADMAP`(完整) | 20 detectors 落地 `src/anti_theater/detectors/`（W3.2）；AT-OVERFIT 受限于 public-only split 检测，完整 hidden/private split 仍 `ROADMAP` |
| 确定性检测编排器（§3） | `IMPLEMENTED_VERIFIED` | `runAntiTheaterLint`（`src/anti_theater/lint.ts`）+ 20 detectors 顺序遍历，取严不取宽，禁 LLM（W3.2） |
| AntiTheaterScore（§4） | `IMPLEMENTED_VERIFIED` | `computeAntiTheaterScore` 7 桶去重扣分，阈值 70/50 与 A §7 一致（W3.2） |
| golden vectors（§5.2） | `IMPLEMENTED_VERIFIED` | CI 实测 **21/21 命中**（17 P0 + 3 补充 + gv-overfit-01，覆盖全部 20 attackId·`tests/fixtures/anti_theater/golden_vectors.ts`） |
| 7 个 CI gates（§6） | `IMPLEMENTED_VERIFIED` | CI 实测 **7/7 通过**（`node scripts/ci_all.mjs` 全绿：827 TS + 110 py tests + Z16 coverage 94.12% line / 82.92% branch） |
| 完整 sequential alpha-spending | `ROADMAP`（W5） | MVP 仅 static prereg check（`11` §4.3） |
| hidden/private split（AT-OVERFIT） | `ROADMAP` | 方向明确，不作为当前完成能力 |
| Lean/TLA+ 形式化 anti-theater invariant | `RESEARCH`（F10 非 runtime） | 路线图，不依赖 |

**一句话边界**：本附录是反剧场主题的**权威集中处**，把 20 类科研造假模式编译成 deterministic 检测规则，让“漂亮报告 + 全 PASS”在 `far verify` 与 verdict kernel 面前变红或变黄。所有裁决经确定性函数产出，**禁 LLM-as-judge**（F3），所有数字（攻击命中数 / false green rate / CI 通过率）由 CI 与 `far status --json` 回填，**不**手填。FAR-Chain 不声称 `CONFIRMED` 物理不可伪造，只声称可检测、可追责、可让 verifier 变红/变黄。

---

## §10. 来源溯源（物理档案已退役）

本附录并入的内容来自以下 `FINAL_PACKAGE/` 编号文档。物理档案已退役，备份位于 `C:/Users/RichardYuan/FAR-Lab_Backups/`。旧编号→新位置映射见 `08_TRACEABILITY_MATRIX.md`。本附录自包含，以下仅作来源溯源（非有效依赖）：

| 旧编号文档 | 并入内容 | 并入位置 |
|---|---|---|
| `68_ANTI_THEATER_ADVERSARIAL_HARDENING.md` | 20 攻击目录、AntiTheaterScore、AttackCase、CI gates、null result first-class | §1/§2/§4/§5/§6 |
| `81_STATISTICAL_FALSIFICATION_AND_P_HACKING_DEFENSE.md` | StatisticalPlan fields、p-hacking detection rules、StoppingRule、null/inconclusive/untested | §2 (AT-PHACK-*/AT-STOPPING-*/AT-OPTIONAL-STOPPING) |
| `13_RESEARCH_INTEGRITY_FIREWALL.md` | 12 类风险、6 条 RULE、severity/failureVerdict、CI grep 闸门 | §2 (AT-JUDGE-OVERRIDE/AT-HARK/AT-SCOPE-LAUNDER)、§3.1、§6、§7.3 |
| `11_FALSIFICATION_ENGINE.md` | F1/F2/F3/F8 红线、verdict_mapping 5 路径、statLock、sequential 路线图 | §0.2、§2 (AT-POSTHOC/AT-METRIC/AT-PHACK)、§8 |
| `36_CONFOUNDING_GATE_ALGORITHM.md` | 因果混杂裁决确定性算法（F6） | §7.4（不重复，仅引用） |
| `02_ARCHITECTURE.md`（现 SSOT） | 四层分区、模块边界、anti-theater failure modes | §0/§7 |
| `03_EVIDENCE_CONTRACT_AND_VERDICT.md`（现 SSOT） | FEC、证据绑定、五值裁决、anti-theater rules（§8）、golden vectors | §0.2、§2、§5、§7.1 |
| `04_PROOF_ENVELOPE_AND_VERIFIER.md`（现 SSOT） | ProofEnvelope V2、proofHash 纪律、diff report | §1、§7.2 |

> 冲突处理（遵守 `01` §2）：本附录（P0）与上述来源冲突时，以本附录与 `02`/`03`/`04`（P0）为准；旧 `FINAL_PACKAGE` 编号文档（P3）仅作来源。裁决枚举、优先级、路径写法以 `03` §5/§6 与 `01` §1 为权威。
