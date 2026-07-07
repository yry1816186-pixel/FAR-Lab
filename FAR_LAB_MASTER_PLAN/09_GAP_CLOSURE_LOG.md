# 09 缺漏补齐记录

> 作用域：本文件列出本次全量梳理发现的关键缺漏、对应在 SSOT 中的补齐位置、补齐后的实现级口径、以及本次合并新增的补齐项。
>
> 脊柱保留：本文件以原 12 类缺漏（路径 / 状态 / 身份 / 架构 / FEC / verdict / ProofEnvelope / browser verifier / FAR-Bench / demo / 外部事实 / 维护）为骨架，保留其已解决的冲突与诚实状态纪律。本轮是"增补深度"，不推倒重写。
>
> 状态纪律（遵守 `01_SOURCE_OF_TRUTH_AND_STATUS.md` §3/§4）：所有能力标注状态标签（`IMPLEMENTED_VERIFIED` / `IMPLEMENTED_UNVERIFIED` / `PARTIAL` / `DESIGN_LOCKED` / `ROADMAP` / `RESEARCH` / `RETIRED` / `NEEDS_EXTERNAL_VERIFICATION`）；禁止手填裸数字（测试数 / 文件数 / CI 通过率 / golden 向量数 / commit / 竞品发布时间）；未覆盖字段写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`。
>
> 路径约定（遵守 `01` §1）：所有路径以 `<REPOSITORY_ROOT>/` 开头；`far-chain/` 作为真实实现根是禁用口径（仅可在"已废弃历史规划"语境显式标注后出现，见 `08_TRACEABILITY_MATRIX.md` §2）。
>
> 五值裁决枚举固定（与 `03_EVIDENCE_CONTRACT_AND_VERDICT.md` §5、`07` §4.1、`APPENDIX_F_GLOSSARY.md` §3.1 一致）：`CONFIRMED` / `REFUTED` / `INCONCLUSIVE` / `DEGRADED_SCOPE` / `UNTESTED`，**禁止第六值**。
>
> 自包含声明：本文件内容已完整自包含，不写"详见 FINAL_PACKAGE/X"作为有效依赖；旧 `FINAL_PACKAGE` 编号文档物理档案已退役（备份在 `C:/Users/RichardYuan/FAR-Lab_Backups/`），仅作来源溯源。

---

## 0. 缺漏分类与补齐状态总览

| 类别 | 缺漏表述 | 补齐 SSOT 位置 | 类别状态 |
|---|---|---|---|
| §1 路径缺漏 | 旧文档用 `far-chain/` 当真实实现根 | `01` §1 / `07` D11 | `IMPLEMENTED_VERIFIED` |
| §2 状态缺漏 | 旧文档混用"已实现/应实现"且手填数字 | `01` §3-§6 / `07` D12 | `IMPLEMENTED_VERIFIED` |
| §3 身份缺漏 | FAR-Lab / FAR-Chain / PCR / OS / AI Scientist 摆动 | `00_PROJECT_BRIEF.md` / `APPENDIX_F` §4 | `IMPLEMENTED_VERIFIED` |
| §4 架构缺漏 | 十五层同时必达不可执行 | `02_ARCHITECTURE.md` / `06_ROADMAP_AND_DOD.md` | `DESIGN_LOCKED` |
| §5 FEC 缺漏 | FEC 强调但缺最终最小结构与失败处理 | `03` §1-§2 / `APPENDIX_C` §3 | `DESIGN_LOCKED` |
| §6 Verdict 缺漏 | 四值/五值混杂、LLM label 路径混杂 | `03` §5-§9 / `APPENDIX_E` §1 | `DESIGN_LOCKED` |
| §7 ProofEnvelope 缺漏 | proofHash 输入边界不清、易被读成真理证书 | `04_PROOF_ENVELOPE_AND_VERIFIER.md` / `APPENDIX_A` §8 / `APPENDIX_C` §2 | `DESIGN_LOCKED` |
| §8 Browser verifier 缺漏 | browser verifier 被夸成完整第三方验证 | `04` §7 | `IMPLEMENTED_VERIFIED` |
| §9 FAR-Bench 缺漏 | FAR-Bench 被扩成通用 benchmark | `05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md` / `07` D6 | `DESIGN_LOCKED` |
| §10 Demo 缺漏 | demo 散焦且现场环境风险不足 | `05` / `07` §6.3 Plan B/C/D | `DESIGN_LOCKED` |
| §11 外部事实缺漏 | 旧文档把竞品/论文当永久真理 | `01` §7 / `07` H8 / RK-11 | `NEEDS_EXTERNAL_VERIFICATION` |
| §12 维护缺漏 | 旧材料未指定后续改动写哪里 | `FAR_LAB_MASTER_PLAN/` 顶层 + `08_TRACEABILITY_MATRIX.md` | `IMPLEMENTED_VERIFIED` |
| §13 本次合并新增补齐项 | 跨文档枚举漂移 / stale 零运行时 / packages 路径虚构 / snapshot 时间炸弹 / novelty 维度互斥 | 见 §13 各分项 | 多状态 |

> 本总览表是 13 类缺漏的快速索引；逐类实现级口径见 §1-§13。

---

## 1. 路径缺漏

**问题**：旧文档多处使用 `far-chain/`，但当前实现根在仓库根目录。代码实测（`<REPOSITORY_ROOT>/src/`、`<REPOSITORY_ROOT>/schema/migrations/`、`<REPOSITORY_ROOT>/repro/`）与 `far-chain/` 子目录假设不符。

**处理**：统一为 `<REPOSITORY_ROOT>/`，并在 `01_SOURCE_OF_TRUTH_AND_STATUS.md` §1 写入路径事实。

**当前路径约定（权威）**：

| 约定 | 含义 |
|---|---|
| `<REPOSITORY_ROOT>/src` | TypeScript / 核心实现 |
| `<REPOSITORY_ROOT>/tests` | 测试 |
| `<REPOSITORY_ROOT>/schema` | 数据库 schema 和 migration（实测 `0001-0008`） |
| `<REPOSITORY_ROOT>/frontend` | 前端或 browser verifier 相关资产 |
| `<REPOSITORY_ROOT>/repro` | Python 或其他复核实现 |
| `<REPOSITORY_ROOT>/golden_vectors` | golden vectors |
| `<REPOSITORY_ROOT>/FAR_LAB_MASTER_PLAN` | 最终规划 SSOT |
| `<REPOSITORY_ROOT>/FINAL_PACKAGE` | 设计、规划、答辩和交接档案（待退役） |

**禁用口径**（`07` D11）：`far-chain/` 作为真实实现子目录 = 禁用表述。例外：`07` §6 CI grep 门豁免区（`56_*` / `43_*` / `59_*` / 本附录自身在"订正清单 / 禁用词表"中引用原措辞是元层面演示）。

**状态**：路径订正 `IMPLEMENTED_VERIFIED`（`01` §1 已写入；`07` D11 已禁用）。

**残留边界**：`packages/` 拆包为 V3 开源路线图（见 §13.3），当前实现遵守 `src/` 扁平现实；`packages/` 作为真实实现根同属禁用口径（`07` H9 `RETIRED`）。

---

## 2. 状态缺漏

**问题**：旧文档混用"已实现""应实现""设计建议"，且有手填数量（README 硬编码测试数 / CI 通过率 / 文件数）。

**处理**：

- 引入 8 个状态标签（见下表）；
- 要求 `far status --json` 成为事实源；
- 禁止手填裸统计；
- 将未复核外部事实标记为 `NEEDS_EXTERNAL_VERIFICATION`。

**状态标签全表**（与 `01` §3 权威一致，本文件不改标签集）：

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

**禁止手填裸统计的 7 类字段**（`01` §4 / `07` D12）：

1. 测试数量；
2. TS/Python 文件数量；
3. CI 通过率；
4. benchmark 数量；
5. 当前 commit；
6. 当前外部竞品发布时间和功能；
7. "第一""唯一""最新"等强时效或强 novelty 结论。

**合法来源**（必须来自）：`far status --json` / CI 输出 / `git rev-parse HEAD` / 可复核脚本 / 答辩前重新检索的外部来源。若 status 工具尚未覆盖某字段，该字段在文档中只能写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`。

**Status Dump 最小字段**（`01` §5）：

```json
{
  "project": "FAR-Chain",
  "generatedAt": "ISO-8601",
  "commit": "string",
  "nodeVersion": "string",
  "test": {
    "status": "pass|fail|pending",
    "count": "number|Pending"
  },
  "capabilities": {
    "canonicalHash": "IMPLEMENTED_VERIFIED|...",
    "fiveValueVerdict": "IMPLEMENTED_VERIFIED|...",
    "proofEnvelope": "PARTIAL|...",
    "farVerify": "IMPLEMENTED_VERIFIED|...",
    "browserVerifier": "PARTIAL|...",
    "pythonVerifier": "PARTIAL|..."
  },
  "warnings": [
    "No hand-filled metrics in public materials"
  ]
}
```

**本轮发现并订正的裸数字漂移（HONESTY-A3 · 来源 `59` §2）**：旧 `README.md:9/93/114` 硬编码 "1038 tests / 92.80% coverage / coverage-92% badge"（实测 `test()/it()` 计数口径为 `Pending`，由 `far status` 回填）。订正为占位符 `<TEST_COUNT_FROM_STATUS_DUMP>` 或"实测见 `far status` 输出"。状态：订正动作 `IMPLEMENTED_VERIFIED`（订正口径已固化）；status dump 回填机制 `DESIGN_LOCKED`。

**状态**：状态纪律 `IMPLEMENTED_VERIFIED`；status dump `DESIGN_LOCKED`。

---

## 3. 身份缺漏

**问题**：旧文档在 FAR-Lab、FAR-Chain、PCR、OS、AI Scientist 之间摆动；多版本（1.txt / 2.txt / 3.txt / Psi）命名漂移（FAR-Lab Ψ / FAR-Chain Ω / PCR Runtime）。

**处理**：

- 系统主名为 `FAR-Chain`；
- 项目集和参赛主体为 `真研 FAR-Lab`；
- 身份收束为 AI4S claim verification layer；
- OS 和 full AI Scientist 口径退役（`07` D4 / DO_NOT_CLAIM 7+1）。

**主名与弃用名对照**（与 `APPENDIX_F_GLOSSARY.md` §4 权威一致）：

| 主名 | 弃用名 | 说明 |
|---|---|---|
| `FAR-Chain` | `FAR-Chain Ω` | 系统名 |
| `真研 FAR-Lab` | `FAR-Lab Ψ` | 项目集和参赛主体 |
| `FEC`（Falsification Evidence Contract） | — | 可证伪证据契约 |
| `ProofEnvelope` | — | 可转交证据包（非数学证明） |
| `Trust Receipt` | — | 信任收据（非同行评审替代品） |
| `proofHash` / `ledgerRoot` / `canonicalHash` | — | 信任根 hash 字段 |
| `golden vectors` | — | 锚定 hash 的金向量 |
| AI4S claim verification layer | Proof-Carrying AI Scientist OS / 全自动科学家 | 退役（`07` D4） |
| `PCR Runtime` | — | 退役 |

**裁决依据**（`04_PROJECT_AUDIT.md` §3 / `08` §2）：现状 SSOT 不动；升级构想收敛后作为增量层接入；三版本（1.txt=ScientificClaimIR / 2.txt=4 值 / 3.txt=SciIRNode 19kind）以 3.txt 为骨架 + Psi 18 字段合并单一 schema（→ `08_TRACEABILITY_MATRIX.md` 指向 `APPENDIX_A`）。

**状态**：身份收束 `IMPLEMENTED_VERIFIED`；OS / full AI Scientist 口径退役 `RETIRED`。

---

## 4. 架构缺漏

**问题**：旧架构过宽，十五层（L0-L15）同时必达不可执行；层数与表清单跨版本漂移（1.txt=17 表 / 2.txt=11 表 / 3.txt=4 表 / Psi=16 表）。

**处理**：

- 划分四层（Core Trust Root / Falsification Layer / Proof and Verification Layer / Product and Ecosystem Layer），见 `02_ARCHITECTURE.md`；
- 将 Rust / Go / WASM / formal / transparency log 放入 V2 / V3；
- P0 只追求一个 claim 的可验证闭环；
- W0-W5 分阶段依赖实现（非裁剪·全部必须实现，`24` §8 SSOT）。

**四层架构落点**（`02_ARCHITECTURE.md` 权威）：

| 层 | 内容 | 状态 |
|---|---|---|
| Core Trust Root | canonicalHash 4 字段白名单 + append-only hash chain + 五值裁决 enum + 0001-0008 migration | `IMPLEMENTED_VERIFIED`（白名单 / chain / enum）/ `IMPLEMENTED_UNVERIFIED`（trigger 实测） |
| Falsification Layer | FEC + statistical plan + dataset/workflow/run binding + anti-theater harness | `DESIGN_LOCKED` |
| Proof and Verification Layer | ProofEnvelope V2 + `.far-proof` + `far verify` + `far export receipt` + `far export far-proof` + L1-L6 verifier | `PARTIAL` / `IMPLEMENTED_VERIFIED`（TS/Python/browser proofHash、CLI verify、V1 bundle/export/package、Trust Receipt 已验证；raw evidence 全重放、Rust/Go/WASM、外部 RO-Crate 认证仍未闭环） |
| Product and Ecosystem Layer | `Your Laptop Is The Verifier` demo + FAR-Bench protocol + 开源治理 | `DESIGN_LOCKED` |

**V2/V3 路线图降级项**（`08` §3）：

| 内容 | 状态 |
|---|---|
| Rust / Go independent verifier | V2 `ROADMAP` |
| full WASM verifier | V3 `ROADMAP` |
| external transparency log | V3 `ROADMAP` |
| formal proof of verdict kernel | V3 `RESEARCH` |
| FAR-Level 4 supply-chain profile | V3 `ROADMAP` |
| Model Court / Cross-model reliability court | V2/V3 optional `ROADMAP` |
| public hidden-set leaderboard | V3 `ROADMAP` |
| full claim graph propagation | V2 `ROADMAP` |
| large domain pack ecosystem | V3 `ROADMAP` |
| `packages/` monorepo 拆包 | V3 `ROADMAP`（见 §13.3） |

**状态**：架构分层 `IMPLEMENTED_VERIFIED`（`02` / `06`）；V2/V3 路线 `DESIGN_LOCKED` / `ROADMAP` / `RESEARCH`。

---

## 5. FEC 缺漏

**问题**：旧文档强调 FEC，但缺少最终最小结构和失败处理；`65` §2 审计发现 FEC 当前只是"字段锚点"，`contractInput` 可选、`auditContract` 未生产接入、缺 measurement plan / statistical test freeze / FEC compiler。

**处理**：

- 定义 `FecContract` 最小字段（`03` §1）；
- 定义 compile checks（`03` §2）；
- 明确缺 FEC 不得输出 `CONFIRMED` 或 `REFUTED`（`03` §2 / `07` §5.3）；
- 绑定统计计划和证据要求（`03` §3-§4）。

**`FecContract` 最小结构**（`03` §1 / `APPENDIX_A_TYPES.md` 权威）：

```ts
type FecContract = {
  fecId: string;
  claimId: string;
  measurableImplication: string;
  scope: ScopeSpec;
  requiredEvidence: EvidenceRequirement[];
  datasetRequirements: DatasetRequirement[];
  workflowRequirements: WorkflowRequirement[];
  metric: MetricSpec;
  threshold: ThresholdSpec;
  direction: "greater" | "less" | "equal" | "within" | "noninferior";
  statisticalPlan: StatisticalPlan;
  powerPlan?: PowerPlan;
  multipleTestingPlan?: MultipleTestingPlan;
  seedPolicy: SeedPolicy;
  deviationPolicy: DeviationPolicy;
  freeze: ProtocolFreeze;
};
```

FEC 的核心要求：可测、可反驳、可冻结、可绑定证据、可由第三方重算、缺证据时能诚实降级。

**FEC 编译规则**（`03` §2 · fail-closed）：

| 检查 | 失败结果 | 处理 |
|---|---|---|
| 是否存在可测 implication | `FEC_NOT_COMPILABLE` | throw → 不进链 |
| 是否有明确 scope | `SCOPE_UNBOUNDED` | throw → 不进链 |
| 是否定义 primary metric | `METRIC_MISSING` | throw → 不进链 |
| 是否定义 threshold 与 direction | `THRESHOLD_MISSING` | throw → 不进链 |
| 是否定义 dataset/workflow 要求 | `EVIDENCE_REQUIREMENT_MISSING` | throw → 不进链 |
| 是否定义统计计划 | `STAT_PLAN_MISSING` | throw → 不进链 |
| 是否说明多重检验和 seed | `PROTOCOL_INCOMPLETE` | throw → 不进链 |

失败时不得输出 `CONFIRMED` 或 `REFUTED`。默认进入 `UNTESTED` 或阻断。

**统计计划最小字段**（`03` §4）：primary metric / null / alternative / alpha / effect direction / confidence interval method / multiple testing correction / missing data policy / outlier policy / stopping rule / power or sensitivity statement / scope limitation。Post-hoc threshold、p-hacking、metric swapping 必须被 anti-theater harness 捕获（`03` §8）。

**FEC 当前代码现实（`65` §2）**：

| 子能力 | 当前状态 | 闭环不足 |
|---|---|---|
| `fecAppendClaim()` 原子链路 | `IMPLEMENTED_VERIFIED` | — |
| `registerContract()` | `IMPLEMENTED_VERIFIED` | 同业务输入重复注册 hash 含 ULID |
| `contractInput` 可选 | `PARTIAL` | 缺 measurement plan 时易被看作登记表 |
| `auditContract` | `IMPLEMENTED_UNVERIFIED` | 未生产接入 |
| FEC compiler | `DESIGN_LOCKED` | 缺编译期检查落地 |
| measurement / statistical plan object | `DESIGN_LOCKED` | 缺冻结 hash |
| statistical test freeze | `DESIGN_LOCKED` | 改 alpha / seed / stopping rule 必变 proof head（验收门） |

**红队攻击样例（`65` §5）**：改 `current_hash` 当前能挡（chain verifier 红）；后改 alpha 当前部分挡（contract hash 锁），但 FEC 可选且统计计划字段不足 → 缺口（`66` / `81` 深化）。

**状态**：FEC 契约 `DESIGN_LOCKED`；`fecAppendClaim` / `registerContract` `IMPLEMENTED_VERIFIED`；FEC compiler / measurement plan freeze `DESIGN_LOCKED`（`66` 深化路线）。

---

## 6. Verdict 缺漏

**问题**：历史材料出现四值/五值、类型系统类比和 LLM label 路径混杂（2.txt=4 值作废；3.txt/Psi=5 值）；`65` §2 审计发现裁决规则过浅、无 metric 时消费 LLM/人工标签、无 evidence sufficiency / rule trace 结构。

**处理**：

- 固定五值 enum（`03` §5 / `07` §4.1）；
- 固定优先级（`03` §6）；
- 定义 deterministic kernel input/output（`03` §7）；
- LLM label 只可辅助，不能决定 verdict（`07` §4 / `APPENDIX_E` §1 F3）；
- 需要 10 个 golden vectors（`03` §9）。

**五值 enum（SSOT · 禁止第六值）**：

```ts
type VerdictKind =
  | "CONFIRMED"
  | "REFUTED"
  | "INCONCLUSIVE"
  | "DEGRADED_SCOPE"
  | "UNTESTED";
```

**裁决优先级**（高 → 低）：

```text
DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED
```

| Verdict | 含义 |
|---|---|
| `UNTESTED` | 不能执行测试、FEC 不完整、数据缺失、协议未冻结或关键证据不存在 |
| `DEGRADED_SCOPE` | 证据覆盖范围比 claim 窄，或数据/环境漂移导致只能支持较小范围 |
| `REFUTED` | 冻结证据契约下存在足够反证 |
| `INCONCLUSIVE` | 证据冲突、功效不足、假设不满足或结果落在不确定区 |
| `CONFIRMED` | 在冻结 FEC、scope 和统计计划下，证据满足支持条件且无更高优先级问题 |

**Deterministic Verdict Kernel**（`03` §7 · LLM 不得作为最终裁决者，F3）：

```ts
function decideFiveValueVerdict(input: VerdictKernelInput): VerdictKernelOutput {
  if (!isFrozenAndCompilable(input.fec)) return untested("FEC_NOT_READY");
  if (missingRequiredEvidence(input)) return untested("EVIDENCE_MISSING");
  if (criticalProtocolDeviation(input)) return untested("CRITICAL_DEVIATION");

  const scope = evaluateScope(input);
  const stats = evaluateStatistics(input);
  const theater = evaluateAntiTheater(input);

  if (scope.isDegraded) return degraded("SCOPE_DEGRADED", scope);
  if (theater.hasFail) return inconclusiveOrUntested(theater);
  if (stats.refutes) return refuted(stats);
  if (stats.conflicting || stats.underpowered) return inconclusive(stats);
  if (stats.supports) return confirmed(stats);
  return untested("NO_DECISION_PATH");
}
```

内核输入 `VerdictKernelInput`：`fec` / `datasetBindings` / `workflowBindings` / `runs` / `measurements` / `statistics` / `protocolDeviations` / `antiTheaterFindings`。内核输出 `VerdictKernelOutput`：`verdict` / `reasonCodes` / `ruleTrace` / `decisiveRuleId` / `evidenceSufficiency` / `scopeReport` / `statisticalReport` / `protocolDeviations` / `verdictKernelVersion` / `rulePriorityTableHash` / `proofHashInputs` / `inputHashes` / `humanExplanationTemplateId`（`[META]`·不进 proofHash）。**字段集以 `APPENDIX_C` §2.2 / `04` §3.1 / `APPENDIX_A_TYPES` §5 为权威**（旧 7 字段子集是缺漏快照，已订正为完整权威集）。

**Anti-Theater 规则（`03` §8 · 至少覆盖）**：

| 攻击 | 期望处理 |
|---|---|
| label-only evidence | `UNTESTED` 或 fail |
| LLM reviewer override | fail，LLM 不能覆盖 deterministic verdict |
| post-hoc threshold | `UNTESTED` 或 anti-theater fail |
| dataset drift | `DEGRADED_SCOPE` 或 recompute required |
| scope laundering | `DEGRADED_SCOPE` |
| missing raw artifact | `UNTESTED` |
| metric swapping | `UNTESTED` |
| seed cherry-picking | `INCONCLUSIVE` 或 fail |
| workflow digest mismatch | verifier RED |
| natural-language verdict mismatch | structured verdict wins |

**10 个 golden vectors（`03` §9 · P0 必需）**：

| Case | 预期 |
|---|---|
| complete support | `CONFIRMED` |
| complete refute | `REFUTED` |
| missing FEC | `UNTESTED` |
| missing dataset | `UNTESTED` |
| narrower population | `DEGRADED_SCOPE` |
| dataset drift | `DEGRADED_SCOPE` |
| underpowered study | `INCONCLUSIVE` |
| conflicting metrics | `INCONCLUSIVE` |
| post-hoc threshold | fail or `UNTESTED` |
| tampered proof input | verifier RED |

向量数与覆盖率**不手填**，一律来自 `far status`；缺失字段写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`。

**裁决当前代码现实（`65` §2）**：

| 子能力 | 当前状态 | 闭环不足 |
|---|---|---|
| 五值纯函数 `decideVerdict()` | `IMPLEMENTED_VERIFIED` | 规则过浅 |
| threshold evaluation | `IMPLEMENTED_VERIFIED` | — |
| PlanB gate | `IMPLEMENTED_VERIFIED` | — |
| 无 metric 时消费 LLM/人工标签 | `PARTIAL` | LLM evidence label 自举风险（`67` / `81` 深化） |
| evidence sufficiency / rule trace 结构 | `DESIGN_LOCKED` | 缺 deterministic statistical kernel（`67` 深化） |

**状态**：五值 enum + 优先级 `DESIGN_LOCKED`；`decideVerdict()` `IMPLEMENTED_VERIFIED`（浅）；deterministic statistical kernel `DESIGN_LOCKED`（`67` 深化）。

---

## 7. ProofEnvelope 缺漏

**问题**：ProofEnvelope 容易被误解为科学真理证明；proofHash 输入边界不清；V1 缺 self-check / SciIR objectHash / ledgerRoot / inclusionProof；跨语言 proofHash 未闭环。

**处理**：

- 明确 ProofEnvelope 只证明满足冻结契约（`04` §1.1-§1.2 / `07` D1）；
- 列出必须进入 proofHash 的字段（`04` §3.1）；
- 定义 `.far-proof` bundle（`04` §4 / `APPENDIX_D_PROOF_BUNDLE.md`）；
- 定义 `far verify` 输出（`04` §5）；
- 定义 Trust Receipt 限制（`04` §9）。

**ProofEnvelope 的诚实边界**（`04` §1.2 / `07` D1）：

| 不声称 | 理由 |
|---|---|
| 科学结论绝对正确 | `verdict` 是 bounded support，不是终局科学真理证书 |
| 实验在物理世界中不可篡改 | 口径是 **tamper-evident**，非 tamper-proof（`07` D2） |
| 同行评审可以被替代 | Trust Receipt 是过程可信收据，不是同行评审替代品（`07` D5） |
| 所有未来数据都会支持该结论 | `verdict` 只对冻结 FEC 下的当前证据负责 |
| 完全可复现 | 真实 LLM 轨道续跑 byte-equal 在 LLM 非确定性下不成立（`07` D3 / `04` §12.2） |

**proofHash 必须进入的字段白名单（权威子集，完整见 `04` §3.1）**：

`schemaVersion` / `claim.id + normalized text` / `claim.domain + scope` / `fecHash` / `fecSnapshot` / `protocolFreeze` / `datasetBindings[]` / `workflowBindings[]` / `experimentRuns[]` / `measurementResults[]` / `statisticalResults[]` / `verdictTrace.verdict` / `verdictTrace.reasonCodes` / `verdictTrace.ruleTrace` / `verdictTrace.decisiveRuleId` / `verdictTrace.evidenceSufficiency` / `verdictTrace.protocolDeviations` / `antiTheaterReport` / `ledgerRoot` / `verdictKernelVersion` / `rulePriorityTableHash` / `proofHashInputs[]`。

**不可进入 proofHash 的字段**：`proofHash`（自身·自指）/ `envelopeId`（索引）/ `signatures[]`（循环依赖）/ `humanSummary` 渲染产物 / UI 字段 / 本地绝对路径 / 非 freeze/seal 的 wall-clock 时间戳 / debug 日志全文 / recomputation 报告本身（消费者非生产者）。

**proofHash 计算伪代码（`04` §3.3 · 与 `APPENDIX_C` §2.4 一致）**：

```text
function computeProofHash(envelope): string
  proofInput = {
    schemaVersion, claim(normalized), fecHash, fecSnapshot, protocolFreeze,
    datasetBindings, workflowBindings, experimentRuns,
    measurementResults, statisticalResults,
    verdictTrace(stripped), antiTheaterReport, ledgerRoot,
    verdictKernelVersion, rulePriorityTableHash, proofHashInputs,
  }
  // Omit: envelopeId, proofHash, signatures, humanSummary, recomputation, UI
  assert envelope.fecHash === sha256(canonicalJson(envelope.fecSnapshot))  // FEC 一致性 fast-fail
  assertNoNaN(proofInput)                                                  // 递归扫描 NaN/Infinity → throw
  canonical = canonicalJson(proofInput)                                    // APPENDIX_C §1
  return sha256hex(canonical)                                              // 64 hex 小写，无 salt，无 domain tag
```

**`.far-proof` bundle 实现态九分量（`04` §4.2 · `<REPOSITORY_ROOT>/src/far_proof/exporter.ts` V1 实测）**：

```text
.far-proof/
├── proof_envelopes.jsonl          # 已 seal 的 ProofEnvelope（每行一条）
├── repro_runs.jsonl               # 复现运行记录
├── call_records.redacted.jsonl    # call_records 链（已脱敏：排除 request/response payload）
├── claim_graph.json               # claim 依赖子图（verdict_nodes + evidence_edges）
├── otel-trace.jsonl               # OTel GenAI span（V1 从 call_records 投影，非原生 SDK）
├── ro-crate-metadata.json         # RO-Crate 元数据（V1 minimal，非 validator-compliant）
├── prov.ttl                       # PROV-O provenance（V1 基本）
├── data_manifest.json             # 本包文件清单 + 计数
├── README_REPLAY.md               # fresh-clone 重放手册
├── code/MANIFEST.md               # code/ 目录诚实说明：快照在 HEAD，重放靠 git checkout
└── figures/                       # 运行时生成的图（占位结构）
```

`exporter.ts` 实测原文自声明："This export does NOT pass third-party RO-Crate or PROV-O validators (V3 roadmap)" + "RO-Crate metadata (V1 minimal, not validator-compliant)"。**未过合规前，禁止把 `.far-proof` 包装为"第三方独立验证路径"**（`07` D9）。

**ProofEnvelope Validator 规则（`04` §2.4 · 9+1 条）**：`RULE-PE-001`（claim_non_empty）/ `002`（verdict_node_exists）/ `003`（falsification_spec_present）/ `004`（source_anchor_present）/ `005`（repro_hash_present · 长度=64）/ `006`（prev_proof_hash_valid · `/^[0-9a-f]{64}$/`）/ `007`（conclusion_matches_checks · 反 theater F1）/ `008`（sealed_by_deterministic · 恒 `deterministic_sealer`）/ `009`（known_failures_not_hidden）/ `010`（independently_recomputable · FI-9 新增协议规则）。

`RULE-PE-010` 是 FI-9 新增的**协议规则**，不是"既有规则测试"。当前已先 spec 后测试：`validator.10-rules-coverage.test.ts` 覆盖 10 条逐条结果，`cross_lang.test.ts` / browser standalone / 离线包路径覆盖独立重算。

**`far verify` 输出 JSON schema（`04` §5.2 · 设计态 P0 权威）**：

```json
{
  "status": "PASS",
  "verdict": "CONFIRMED",
  "proofHash": "64hex",
  "ledgerRoot": "64hex",
  "tamperStatus": "clean",
  "scopeStatus": "full",
  "recomputation": {
    "node": "pass",
    "python": "not-run",
    "browser": "not-run"
  },
  "errors": [],
  "warnings": []
}
```

CLI exit code：`0` = 全链重算匹配（PASS）；`7` = repro 不匹配（FAIL，篡改或漂移）；非 0 非 7 = 运行时错误。

**ProofEnvelope 当前代码现实（`65` §2）**：

| 子能力 | 当前状态 | 闭环不足 |
|---|---|---|
| 10 rule validator | `IMPLEMENTED_VERIFIED` | — |
| sealer / proofHash / DB backstop / TS 重算脚本 | `IMPLEMENTED_VERIFIED` | — |
| V1 self-check | `PARTIAL` | — |
| SciIR objectHash / ledgerRoot / inclusionProof | `DESIGN_LOCKED` | 未闭环 |
| 跨语言 proofHash | `IMPLEMENTED_VERIFIED`（TS/Python/browser JS/Web Crypto）；Rust/Go/WASM `ROADMAP` | raw evidence / full verdict trace / RO-Crate 外部认证未闭环 |

**状态**：ProofEnvelope V1 `IMPLEMENTED_VERIFIED`；V2 proofHash binding 与 10-rule validator `IMPLEMENTED_VERIFIED`（raw evidence / full verdict trace 仍未闭环）；`far verify` CLI `IMPLEMENTED_VERIFIED`（envelope/chain/full/bundle）。

---

## 8. Browser verifier 缺漏

**问题**：旧文档容易把 browser verifier 夸成完整第三方验证；`65` §2 发现 frontend Merkle verifier 是 TS 编译产物，被包装成"3 cross-language"是 overclaim。

**处理**：

- 定义独立验证等级 L1-L6（`04` §6）；
- browser verifier 必须标注验证范围（`04` §7）；
- same-language / compiled artifact 不得包装成完全独立语言（`07` D8 / `04` §17.2）；
- 保留其作为评委体验核心，但不夸大。

**独立验证等级 L1-L6（`04` §6.2 · 对外口径表）**：

| 等级 | 含义 | 当前状态 |
|---|---|---|
| L1 | 同仓库 Node 重算 | `verifyChainHead()` / `verifyProofHashV2()` / `validateProofEnvelopeV2()` / `far verify` CLI（envelope/chain/full/bundle）`IMPLEMENTED_VERIFIED` |
| L2 | Python 独立实现重算 | SQLite/JSON chain verifier、Merkle verifier、`canonical_json.py`、ProofEnvelope V2 `proof_hash.py` `IMPLEMENTED_VERIFIED`；`far verify` 已接 `recomputation.python` |
| L3 | Browser Web Crypto / standalone verifier | `frontend/src/lib/merkle.ts`（Merkle/Suite）+ `frontend/public/verify.html`（ProofEnvelope V2 proofHash，Web Crypto）`IMPLEMENTED_VERIFIED` |
| L4 | Rust / Go / WASM 独立实现 | Rust/Go `ROADMAP`（V2）；WASM `ROADMAP`（V3） |
| L5 | 第三方维护 verifier | `ROADMAP` |
| L6 | 形式化验证核心 invariant | `RESEARCH`（`04` §14） |

**Browser verifier 诚实边界（`04` §7.2 · 反 overclaim）**：

| 边界 | 说明 |
|---|---|
| TS 编译产物 | 若 browser 使用 TS 编译产物，**不得**包装成完全不同语言实现 |
| schema 与 canonicalization | Web Crypto 能独立计算 hash，但 schema 和 canonicalization 仍需 golden vectors 锚定 |
| proof envelope hash | Browser 覆盖 ProofEnvelope V2 proofHash；不覆盖 raw evidence、V1 `.far-proof` bundle 或外部 RO-Crate 认证 |
| 页面离线 | 页面必须离线可打开或有 U 盘 Plan B（standalone `verify.html` 零网络依赖） |
| 篡改演示 | 篡改演示必须**真实修改 verdict-critical 字段**，不得只改 UI |

**诚实口径（`04` §6.3 · `07` D8）**：当前诚实口径是 Node / Python 异语言链路 + Browser 独立环境 Merkle / Suite / ProofEnvelope V2 proofHash 重算；Browser **不是**第三种语言实现（standalone JS + Web Crypto），也不验证 raw evidence 或外部 RO-Crate 合规。V2 明确补 Rust / Go，V3 补 WASM / formal spec。**不把设计规划伪装成已实现。**

**状态**：`merkle.ts`（Merkle/Suite）`IMPLEMENTED_VERIFIED`；standalone `frontend/public/verify.html` ProofEnvelope V2 proofHash verifier `IMPLEMENTED_VERIFIED`（断网可打开，页面内联脚本由 `browser_standalone.test.ts` 直接执行验证）。

---

## 9. FAR-Bench 缺漏

**问题**：旧文档将 FAR-Bench 扩展为大而全 benchmark，风险过高；`04` O7 / `07` D6 / C13 红线约束 FAR-Bench 不得声称通用 AI4S benchmark / 排行榜。

**处理**：

- 定位为 verification protocol / attack corpus（`05` / `07` D6）；
- 定义 P0 十个最小 case（`05`）；
- 排除泛 AI4S 能力排行口径（`07` DO_NOT_CLAIM 第 3 条 / C13）；
- `profile_id` 永远 `competition_aliyun_qwen`，禁与 CORE-Bench 横向比较。

**FAR-Bench 定位边界**：

| 项 | 口径 |
|---|---|
| 是 | verification protocol / attack corpus（测"声明能否被结构化证伪"） |
| 不是 | 通用 AI4S benchmark / 通用 AI4S 排行榜 / "找出最准的模型"（`07` D6） |
| profile_id | 永远 `competition_aliyun_qwen`（`07` D6 / C13） |
| 禁止 | 与 CORE-Bench 横向比较（`07` D6） |
| 状态 | `DESIGN_LOCKED`（C33 spec-only · 禁运行时落地，非"缺失"，是红线有意约束） |

**FAR-Bench 当前代码现实（`65` §2）**：

| 子能力 | 当前状态 | 闭环不足 |
|---|---|---|
| demo seeds + benchmark_report + `far bench run` | `IMPLEMENTED_VERIFIED` | 6-seed demo profile 可由 CLI 重跑并复现 `suiteIntegrityRoot`；评委追问样本太少仍属规模问题（`71` / `84` 深化） |
| 规模统计意义 | `PARTIAL` | N 太少 |

**状态**：FAR-Bench protocol `DESIGN_LOCKED`（C33 spec-only）；6-seed demo runtime + `far bench run` `IMPLEMENTED_VERIFIED`；规模统计意义深化 `PARTIAL`（`71` / `84`）。

---

## 10. Demo 缺漏

**问题**：旧 demo 有多个亮点但容易散焦（`59` §7 战略洞察：6 灵魂时刻仅 3 个建立在已落地信任根上），且现场环境风险不足（Windows / 无 build tools / 断网 / 版本不匹配）。

**处理**：

- 主线收束为 `Your Laptop Is The Verifier`（`05` / `60`）；
- 四幕演示（`05`）；
- 加入 U 盘、离线、Windows、无 Python 等 Plan B/C/D（`07` §6.3）；
- `offline_replay` 标注为 demo/test profile（非生产降级兜底，`59` W0-7 并行订正）。

**演示失败三级后备（`07` §6.3 · Plan B/C/D）**：

| Plan | 触发 | 后备动作 | 诚实话术 |
|---|---|---|---|
| **B** | 网络/安装失败 | 预打包 `.far-proof.tar.zst` 离线包（已含 `verify.sh` + `integrity.json` 自验证）+ standalone `verify.html`；预编译 `better-sqlite3` binary / 离线 `node_modules` 属 demo-day 环境包，仍需单独准备 | "为规避环境差异，使用离线包" |
| **C** | 评委笔记本彻底不可用 | 主讲人自备已验证环境笔记本 HDMI 投屏；评委可上台亲手操作主讲人笔记本 | "为规避环境差异，使用预验证环境，评委可上台亲手操作" |
| **D** | 极端故障（全黑） | 预录三路验真全流程 4K 录屏兜底；现场至少保留"主讲人翻转一个字符 → 指出哈希链断裂位置"的口算演示（不依赖任何软件） | 直接说"切换到 Plan B/C/D"，**不可掩饰** |

**铁律**：演示失败时不可掩饰，直接说"切换到 Plan B"。诚实本身就是反 theater。Plan B/C/D 必须答辩前 3 天各演练一次。

**三个失败路径演示（必演 · `07` §6.2）**：

1. 三路字节相等（Node/Python/Browser 同 hash）→ 一字节翻转三路同时红 `TAMPER DETECTED at seq=4`。
2. `1e-7` 红灯特写：`cross_lang_consistency.test` N2b_sci_1e-7 `assert.notEqual('{"n":1e-7}', '{"n":1e-07}')` → "这是我们没解决的 1e-7 鸿沟——它证明字节相等是真跑出来的。"
3. 谱系图承认后发（PCC1996→CT→...→FAR-Chain）→ "我们是这条赛道上科学证伪专用的变体，不是开创者。"

**`offline_replay` 诚实订正（`59` W0-7 并行）**：`offline_replay` 是无-key 离线 **demo profile**（非生产降级兜底）；FallbackChain 三档全为真实 qwen 模型，**无 `offline_replay` 兜底档**。

**Demo 当前代码现实（`65` §2）**：

| 子能力 | 当前状态 | 闭环不足 |
|---|---|---|
| 60/61 demo 剧本 | `IMPLEMENTED_VERIFIED` | AI4S 闭环仍需升级（`73` / `85`） |
| 灵魂时刻①③② | `IMPLEMENTED_VERIFIED` | — |
| 灵魂时刻④ Arena arbiter | `DESIGN_LOCKED` | 承重代码为零（`59` §5 决策③ 双轨） |
| 灵魂时刻⑤ npx 入口 | `DESIGN_LOCKED` | 承重代码为零（`59` §5 决策③ 双轨） |

**状态**：`Your Laptop Is The Verifier` 主线 `DESIGN_LOCKED`；Plan B/C/D `DESIGN_LOCKED`；灵魂时刻④⑤ `DESIGN_LOCKED`（最小实现 + `mode=vision` 诚实标注）。

---

## 11. 外部事实缺漏

**问题**：旧文档包含时效性竞品和论文判断（Robin Nature / PaperRepro / SocSci 26xx / CodeEvolve / Right-to-History arXiv:2602.20214 / POPPER arXiv:2502.09858 / PCA ACSAC2025 / MLAgentBench / SCITT / C2PA / Sigstore），未来可能过期；arXiv 编号格式与 DOI 可能编造（`04` O9）。

**处理**：

- 本 SSOT 不把外部事实作为永久真理（`01` §7）；
- 答辩前统一复核（`07` H8 / RK-11）；
- 未复核项用 `NEEDS_EXTERNAL_VERIFICATION`。

**外部事实纪律（`01` §7 · 强制）**：

1. 答辩或提交前重新检索；
2. 记录来源链接和读取日期；
3. 使用 hedge 措辞；
4. 避免"绝对第一""无人做到"；
5. 若无法复核，标注 `NEEDS_EXTERNAL_VERIFICATION`。

**未复核外部事实清单（须 PDF 前逐条核实 · 来源 `04` O9 / `59` §10）**：

| 项 | 状态 | 核实方式 |
|---|---|---|
| Robin Nature s41586-026-10652-y | `NEEDS_EXTERNAL_VERIFICATION` | PDF 前核原文 |
| PaperRepro 2603.00058 | `NEEDS_EXTERNAL_VERIFICATION` | PDF 前核原文 |
| SocSci 2606.11447 | `NEEDS_EXTERNAL_VERIFICATION` | PDF 前核原文 |
| CodeEvolve 2605.04677 | `NEEDS_EXTERNAL_VERIFICATION` | PDF 前核原文 |
| Right-to-History (arXiv:2602.20214) 同构度 | `NEEDS_EXTERNAL_VERIFICATION`（`07` §7.2 / Q6） | PDF 前打开 arXiv 原文核作者/机构/方法 |
| POPPER (arXiv:2502.09858) 差异化 | `NEEDS_EXTERNAL_VERIFICATION` | PDF 前核原文（POPPER 是 agent 非 benchmark） |
| PCA (ACSAC2025) 差异化 | `NEEDS_EXTERNAL_VERIFICATION`（`07` Q3） | PDF 前核原文 |
| MLAgentBench / SCITT / C2PA / Sigstore 同构度 | `NEEDS_EXTERNAL_VERIFICATION`（`59` §10 新增入查新清单） | 逐条核原文，评估与 FAR-Chain 声明级可靠性 + 密码学锚定的真实同构度，**不**断言一票否决 |
| snapshot `qwen3.7-max-2026-05-20` 竞赛周是否在线 | `NEEDS_EXTERNAL_VERIFICATION`（`07` RK-01） | day-0 实测 GET /v1/models（无 key 不算 graceful skip 通过） |
| novelty/priority 查新（proof-carrying 科研闭环优先级） | `NEEDS_EXTERNAL_VERIFICATION`（`07` D10 / D15） | PDF 前做一次查新，无查新前标 `UNVERIFIED_PRIOR_ART` |
| ProbeAtlas 真实 GPU p<0.05 | `NEEDS_GPU_VALIDATION`（`07` RK-08） | 物理设备约束 |

**"首个"优先级 hedging（`25` §1 角色 1 / `59` §6 W0-1）**：所有"首个"声明须带"据我们所知" + 差异化三连（D1 缺位补位 / D2 runtime 非 benchmark / D3 国产基座）+ 查新（答辩前）。未查新前标 `UNVERIFIED_PRIOR_ART`。PDF 引用前**必须**做一次 novelty/priority 查新。

**状态**：外部事实纪律 `IMPLEMENTED_VERIFIED`（`01` §7）；所有具体外部事实 `NEEDS_EXTERNAL_VERIFICATION` / `NEEDS_GPU_VALIDATION`。

---

## 12. 维护缺漏

**问题**：旧材料没有明确后续改动写哪里。

**处理**：

- 顶层 `FAR_LAB_MASTER_PLAN/` 成为最终规划 SSOT；
- 旧 `00`-`86` 成为来源档案（物理档案已退役，备份 `C:/Users/RichardYuan/FAR-Lab_Backups/`）；
- `08_TRACEABILITY_MATRIX.md` 负责追踪吸收和废弃关系。

**文档优先级（`01` §2）**：

| 优先级 | 来源 | 说明 |
|---|---|---|
| P0 | 顶层 `FAR_LAB_MASTER_PLAN/` | 最终规划和执行口径 |
| P1 | 可执行状态命令、CI、测试输出 | 实现状态与数量的唯一事实源 |
| P2 | 当前代码 | 接口和能力以实际代码为准 |
| P3 | 旧 `00`-`86` 与 `_digest` | 历史来源，不直接覆盖 P0/P1/P2 |

冲突时按 P0 → P1 → P2 → P3 处理。若 P0 与代码现实冲突，应开修订项，而不是用旧文档覆盖代码。

**后续维护规则（`08` §6 · 强制）**：

1. 若是最终口径，写入顶层 `FAR_LAB_MASTER_PLAN/`；
2. 若是历史补充，标明 `ARCHIVE`；
3. 若修改状态，更新 `01_SOURCE_OF_TRUTH_AND_STATUS.md`；
4. 若修改架构，更新 `02_ARCHITECTURE.md`；
5. 若修改 verdict 或 proofHash，更新 golden vectors 和 verifier；
6. 若引入外部事实，标注来源和读取日期。

**缺失编号处理（`08` §5）**：旧包中缺失的编号，如 `41`、`63`，不补写伪历史文件。本 SSOT 直接补齐其应承担的交接和规划功能。`63_NEXT_WINDOW_HANDOFF_PROMPT.md` 不存在的事实已经被 `76` 记录，不伪造读取记录。

**旧编号→新位置溯源**：物理档案已退役（`FINAL_PACKAGE/` 待删除），溯源用途仅作历史来源解释；权威内容以本 SSOT 与 `APPENDIX_A_TYPES.md` / `APPENDIX_C_CANONICAL.md` / `APPENDIX_F_GLOSSARY.md` 为准。完整旧编号→新位置映射见 `08_TRACEABILITY_MATRIX.md` §1；旧口径修正对照见 `08` §2；V2/V3 降级内容见 `08` §3；旧 digest 吸收方式见 `08` §4。备份位置：`C:/Users/RichardYuan/FAR-Lab_Backups/`。后续维护引用本 SSOT 与三附录即可，不再回引旧编号作为有效依赖。

**状态**：维护规则 `IMPLEMENTED_VERIFIED`；旧档案退役 `RETIRED`（仅来源溯源）。

---

## 13. 本次合并新增补齐项

> 以下 6 项是本次把 `25` / `39` / `65` / `59` / `04` 深度内容并入 SSOT 时新登记的补齐项。它们不在原 12 类缺漏里，而是跨文档审计（`39` 终审 / `59` 终极对抗 / `65` 浅点审计）发现的新缺口。每项给出当前状态、SSOT 落点与残留边界。

### 13.1 跨文档枚举漂移（`evidence_basis` / `purpose_tag`）

**缺漏**（来源 `39` §2.F-01 / §2.F-13）：

- `evidence_basis` 枚举漂移：11 用 `experimental/observational_only/n_a`，`02`§F6 / `08` / `32` 用 `interventional/observational_only/mixed`。
- `purpose_tag` 枚举越界：`34:66` `purpose_tag='probeatlas_treatment'` + `37:104` `purpose_tag='far_bench_probe'` 不在 9 值 SSOT（0001 CHECK / `02` §3.1 / 红线#4），INSERT 会被 CHECK 拒绝。

**处理**（以 `02` 为 SSOT）：

- `evidence_basis` 对齐 **3 值**：`'interventional'` / `'observational_only'` / `'mixed'`（11 §7.2 DDL 已订正）。
- `purpose_tag` 两处均改 `'eval'`（T/C 身份由 `FEC_TREATMENT_MODE` 承载，与 14 §2.3.3-b 一致）。全 surface grep 确认活文档残余 `purpose_tag` 仅 `eval` / `baseline_exempt`（SSOT 内）。

**`purpose_tag` 有效值 SSOT（8 值·0001 CHECK / `02` §3.1 / 红线#4）**：

| # | 有效值 | 说明 |
|---|---|---|
| 1 | `eval` | 评测用（T/C 身份由 `FEC_TREATMENT_MODE` 承载） |
| 2 | `baseline` | 基线运行 |
| 3 | `baseline_exempt` | 基线豁免 |
| 4 | `probeatlas_control` | Probe Atlas 控制组（统一拼写 `probeatlas`） |
| 5 | `probeatlas_treatment` | Probe Atlas 处理组（统一拼写 `probeatlas`） |
| 6 | `far_bench` | FAR-Bench 评测 |
| 7 | `uq_witness` | 不确定性见证 |
| 8 | `court` | Court 复核 |

**有效值以 0001 CHECK 与 `02` §3.1 为准**（拼写统一为 `probeatlas`，历史误拼 `probatlas` 见下表）。

**历史值（已订正，禁用·不混入 SSOT 有效值集合）**：

| 历史值 | 性质 | 订正去向 |
|---|---|---|
| `probatlas_treatment` | 历史误拼（应为 `probeatlas_treatment`） | 改写为 `probeatlas_treatment` |
| `far_bench_probe` | 历史越界（不在 SSOT） | 订正为 `eval`（T/C 身份由 `FEC_TREATMENT_MODE` 承担） |

> 修正语境标注：上表中两个历史值仅在"历史/禁用/修正"语境出现，不是合法有效 `purpose_tag` 值，INSERT 会被 0001 CHECK 拒绝。

**状态**：枚举订正 `IMPLEMENTED_VERIFIED`（`39` §2.F-01 / §2.F-13 已闭口）；历史漂移记入 `33` FP2-DELIVERY-003 档案（D2 档案·全文保留）。

### 13.2 stale「零运行时」当前态声明

**缺漏**（来源 `39` §2.F-07 / `04` §0 / `25` §10）：旧文档 03 / 04 / 17 / 23 / 25 / 26 称「零运行时 / F(零) / far-chain 未建」，与 `<REPOSITORY_ROOT>/src/` 核心证明链已落地（typecheck 退出 0 / 测试绿·具体计数由 `far status` 回填·不手填）矛盾。属"写作期诚实·落地后 stale"。

**处理**：全部订正为「核心证明链已落地（落地度 `Pending`·由 `far status` 报告）·剩余模块待完整交付」；`04` CRITICAL → `RESOLVED`。

**当前能力口径（`01` §6 · 进入开发前仍须由 `far status`、CI 和代码审计重新确认）**：

| 能力 | 规划口径 |
|---|---|
| evidence log chain | 已有实现痕迹，需以代码和测试确认状态 |
| canonical hash / golden vector | 属于核心信任根，必须保持最高优先级 |
| five-value verdict | 语义已锁定，工程上需升级为 metric-first deterministic kernel |
| ProofEnvelope V1 | 视为 partial，P0 要升级为 V2 proofHash binding |
| Python verifier | ProofEnvelope V2 proofHash 已扩展完成；完整 verdict trace 重放仍待补 |
| Browser verifier | standalone ProofEnvelope V2 proofHash 已完成；需继续标注 raw evidence / RO-Crate 边界 |
| `far status` | 应成为状态事实源 |
| `far verify` | P0 envelope/chain/full/bundle 已补齐；fresh-clone 非项目成员留证仍待补 |
| FAR-Bench | 当前按 evaluation protocol / attack corpus 处理，不宣称泛 benchmark 成熟 |

**状态**：stale 声明订正 `IMPLEMENTED_VERIFIED`（`39` §2.F-07 已闭口）；落地度具体数字 `Pending`（守 D12）。

### 13.3 `packages/` 路径虚构

**缺漏**（来源 `59` §3 / `07` H9）：旧文档 54§2 架构图 + 43-57 多处声称 `packages/cli|arena|court|...|verifier-protocol`，实测 `packages/` 不存在，代码在单一 `src/` 扁平结构。

**处理**（`59` 决策② · 主 agent 自主裁定 · 标 `[待用户复核]`）：当前用 `src/` 扁平实现（如 `<REPOSITORY_ROOT>/src/far_verifier/`、`<REPOSITORY_ROOT>/src/cli/`），`packages/` 标注为 V3 路线图（未来开源拆包）。禁止文档声称 `packages/` 而代码在 `src/`（FI-9 verifier 不能重蹈 `far-chain/` 路径虚构）。

**理由**：当前代码全在 `src/` 扁平，真拆 monorepo 工作量大且增加 fresh-clone 风险（pnpm-workspace 复杂度、`better-sqlite3` native 多包编译）；FI-9 verifier 放 `src/far_verifier/` 同样可达 fresh-clone exit 0；`packages/` 拆包是"开源社区贡献"导向，属 V3，非竞赛周必需。

**状态**：`packages/` 作为真实路径 `RETIRED`；`src/` 扁平实现 `IMPLEMENTED_VERIFIED`；V3 拆包 `ROADMAP`。

### 13.4 snapshot 时间炸弹（Z1-SNAPSHOT）

**缺漏**（来源 `59` §2 Z1 / `07` RK-01）：snapshot `qwen3.7-max-2026-05-20` 07-08 时间炸弹 + 代码层查无此日期（`<REPOSITORY_ROOT>/src/.../snapshot.ts` 只有 `[verified_live: ... as of 2026-06-27]`，无 07-08 字面量）；`~2026-07-08` 仅在 `ci/snapshot_liveness_smoke.ts:7` + `docs/DAY1_VERIFICATION.md:38`（团队自写预期，无百炼官方来源）；`snapshot_liveness_smoke.ts` 无 key 时 graceful skip 返回 exit 0（不算通过）。

**处理**（`59` W0-2）：删去无来源的 07-08 具体日期；订正为"snapshot 下线风险（`snapshot.ts` 团队 2026-06-27 verified_live，**无官方维护期承诺**；须竞赛周 day-0 实测复核）"；day1:verify 强制 day-0 实测（无 key 不算 graceful skip 通过）+ 下线降级脚本 + 日历告警。

**降级链**（`07` §3.2 RK-01 / FallbackChain · `DESIGN_LOCKED`）：FallbackChain 三档全为真实 qwen 模型（**无 `offline_replay` 兜底档**，见 §10）；cached LLM 响应离线 Demo 兜底；day-0 GET /v1/models 实测复核为准。

**状态**：snapshot 时效 `NEEDS_EXTERNAL_VERIFICATION`（待 E1 竞赛周 day-0 实测）；FallbackChain `DESIGN_LOCKED`。

### 13.5 novelty 维度归属互斥

**缺漏**（来源 `59` §2 NOVELTY-C1 / `07` RK-04 / `25` §1 角色 1）：FI-3 novelty 维度归属自相矛盾——`48` 自称"科学价值 40 分维度 / 最具科学价值的举措"；`43`§4 评分表把 FI-3 计入"先进性 30 分"列、科学性列无 FI-3。两份核心文档对 FI-3 命中哪个维度互斥，连分值都错（48 说 40 分，实际 30+30+30+10）。

**处理**（`59` 决策① · 主 agent 自主裁定 · 标 `[待用户复核]`）：**FI-3 命中先进性 30 分**（产品/方法新颖性出口），不命中科学性 30 分。

**理由**：

1. 当前 `48`§3.3 typology 无可复现算法（`59` NOVELTY-A2）；
2. demo 日真实多模型须多 key（物理约束）降级为 persona fixture，persona fixture 不构成"科学发现"；
3. 先进性维度更可辩护（runtime novelty + 产品新颖性）；
4. 科学性 30 分应由 L0-L3 信任根（已落地真绿）支撑，不该押在未实现的 FI-3。

**novelty 命门补救战略**（`04` §4.2 / `07` RK-04）：

- novelty=0 压 6-12 分（40 分里估）；
- 不赌 novelty，赌"可证伪 + 篡改可检测 + 可独立复算的方法学创新"；
- 把"novelty 缺失"转化为"方法学创新主场"——强调"据我们所知，首个面向 AI Scientist 的 proof-carrying 可证伪科研闭环"（方法新颖性，非科学发现新颖性；**优先级 `UNVERIFIED_PRIOR_ART`，PDF 前须前沿查新**）；
- 诚实声明"我们不声称发现新科学规律，我们声称让 AI 的科研声明可被机器检验"——这本身是诚信加分项。

**状态**：novelty 维度归属 `DESIGN_LOCKED`（FI-3 → 先进性 30 分）；`48`§3.3 typology 算法化 `DESIGN_LOCKED`（`59` §6 并行）；查新 `NEEDS_EXTERNAL_VERIFICATION`。

### 13.6 Core 中立 overclaim 与 contracts.ts:13 注释撒谎

**缺漏**（来源 `59` §3 Core 中立 overclaim / W0-4 / W0-5）：`07`§6.3 C1 字面声明"Core 目录 grep `qwen|dashscope|bailian` = 0 命中"，但实测 L0 `<REPOSITORY_ROOT>/src/evidence_log/repository.ts:260/265` + `llm_record.ts:112`、L2 `<REPOSITORY_ROOT>/src/falsifiability/external_facts.ts:26` 硬编码 `competition_aliyun_qwen`（含 qwen 子串）；`<REPOSITORY_ROOT>/src/falsifiability/contracts.ts:13` 注释自称"模型中立：不含 qwen/dashscope 字面量"与同目录代码矛盾（注释撒谎）；`golden_vectors.ts` 多处硬编码 `qwen3.7-max-2026-05-20`。`<REPOSITORY_ROOT>/src/fec/` 干净（0 命中）。

**处理**（`59` W0-4 / W0-5）：

- `07`§6.3 C1 订正为"Core **算法**（canonicalHash / verdict_mapping / appendRecord 的哈希与裁决逻辑）模型中立；但 L0/L2 核心模块含 `competition_aliyun_qwen` profile 钩子（厂商特定约束分发点，非算法依赖）；`src/fec/` 真零命中"。
- `src/falsifiability/contracts.ts:13` 注释删除，或改为"本模块（contracts）模型中立；同目录 `external_facts.ts` 含 `competition_aliyun_qwen` profile 钩子（厂商约束分发）"。

**模型中立核验结论（`39` §7 · 红线#1）**：核心算法文档（07 / 08 / 09 / 11 / 14 / 34-38）grep `qwen|dashscope|bailian|百炼` 命中均为合法类——① 中立规则本身（07:80/241/359/371/ADR-05「禁 Qwen 字面量进 Core」）② adapter 节（07 §6.2 `adapters/aliyun_qwen/` 唯一漏斗）③ profile 作注入参数（`competition_aliyun_qwen` ∈ ProviderProfile 枚举）④ 溯源字段名 `dashscopeRequestId`（Z13 锁定 schema 决策·非本次可改）⑤ 竞赛实验被测对象（14 / 34 / 35 / 37 Qwen 作 ProbeAtlas / FAR-Bench 自测主体·C13 允许）。**FEC / canonicalHash / verdict_mapping / 证据链核心算法零 Qwen 逻辑**，红线#1 满足。

**状态**：Core 算法中立 `IMPLEMENTED_VERIFIED`；profile 钩子存在 `IMPLEMENTED_VERIFIED`（非算法依赖）；`contracts.ts:13` 注释订正 `IMPLEMENTED_VERIFIED`（`59` W0-5）。

---

## 14. 浅点审计与深化路线映射

> 本节把 `65_SHALLOW_POINT_AUDIT_AND_DEEPENING_ROADMAP.md` 的 34 项浅点审计与 P0 深化路线图映射到 SSOT 中的补齐位置，作为本次合并新增的"工程蓝图入口"。`65` 标注"P0 未清零；本阶段是设计规划，不能声称已完成"——本节诚实继承该判定。

**当前三号卖点核对（`65` §1）**：

| 卖点 | 当前证据 | 真实状态 | 深化方向 |
|---|---|---|---|
| Your Laptop Is The Verifier | `verifyChainHead` 在 `<REPOSITORY_ROOT>/src/evidence_log/verifier.ts`；Python chain/proofHash verifier 在 `<REPOSITORY_ROOT>/repro/far_chain_repro/`；Browser Merkle verifier 与 standalone proofHash verifier 在 `<REPOSITORY_ROOT>/frontend/`；离线包在 `<REPOSITORY_ROOT>/src/far_proof/offline_package.ts` | 部分闭环。TS/Python/browser ProofEnvelope V2 proofHash、CLI bundle、离线 tar.zst 均已验证；外部 RO-Crate 认证、raw evidence 全重放、非项目成员 fresh-clone 留证未闭环 | `04` §10 / `APPENDIX_D` §7 |
| 五值反剧场裁决 | `<REPOSITORY_ROOT>/src/falsifiability/verdict.ts` 纯规则覆盖五值；SQL enum 同步 | 部分闭环。规则确定，但目前主要消费 `supportsClaim` / `refutesClaim` 布尔或简单 threshold；统计计划与 rule trace 不够深 | `66` / `67` / `81` → `03` §6-§9 |
| 脱平台密码学主权 | offline replay、hash chain、proofHash、no-LLM final judge scan | 部分闭环。provider 不在 trust root，但部分 agent evidence label 仍来自 LLM | `67` / `68` / `82` → `07` §4 |

**P0 深化路线图（`65` §4 · 最小可实现 vs 特等奖级 vs 验收）**：

| P0 缺口 | 最小可实现版本 | 特等奖级版本 | 验收 |
|---|---|---|---|
| FEC 闭环 | FEC schema + measurement / statistical plan object + freeze hash | FEC compiler + validator + sandbox measurement + rule trace | 改 alpha / seed / stopping rule 必变 proof head |
| LLM 自举 | LLM evidence 标成 proposal；不能单独 CONFIRMED / REFUTED | deterministic measurement facts 取代 LLM vote | no-LLM-final-judge scan 覆盖 verdict path |
| ProofEnvelope verifier | `far verify` 重算 chain / proofHash；Python/browser/离线包路径已覆盖 | Rust / Go / WASM differential verifier | golden + mutation + Windows offline + 非项目成员 fresh-clone 留证 |
| Anti-theater | 20 攻击 corpus + lint | hidden failed run / p-hack / null result first-class | false green rate 0 on attack corpus |
| AI4S adapter | TableDataset + WorkflowRun adapter | CWL / Nextflow / Snakemake / MLflow / DVC / RO-Crate adapters | ingest artifact hash 进入 ProofEnvelope |

**红队攻击样例（`65` §5 · 当前能否挡住）**：

| 攻击 | 当前能否挡住 | 缺口 | 补强 |
|---|---|---|---|
| 改 `current_hash` | 能，chain verifier 红 | CLI 包装不足 | `69` → `04` §5 |
| WARN + CONFIRMED | 能，TS + DB backstop | 合法全 PASS 无法识别 | `68` → `APPENDIX_E` |
| LLM 输出 supports | 不能完全挡 | 无 deterministic measurement fact | `67` → `03` §7 |
| 后改 alpha | 部分，contract hash 锁 | FEC 可选且统计计划字段不足 | `66` / `81` → `03` §1-§4 |
| hidden failed run | 不足 | only `knownFailures` transparency | `68` / `81` → `APPENDIX_E` |
| dataset same name updated | 不足 | 无 DatasetBindingSpec | `80` → `03` §3.1 |
| workflow notebook exfiltration | 不足 | sandbox / adapters 未实现 | `79` → `07` §3.3 |
| ProofEnvelope claim graph 孤岛 | 不足 | dependencies 未建模 | `70` → `04` §13 |

**`65` 验收结论（诚实继承）**：

- P0 未清零；本阶段是设计规划，不能声称已完成。
- P0 均有对应深化文档：`66` / `67` / `68` / `69` / `70` / `71` / `73` / `74` / `77`-`82` / `85` / `86`。
- 可直接交给工程师的蓝图由 `75` 收束（→ `02_ARCHITECTURE.md` / `06_ROADMAP_AND_DOD.md`）。
- `76` 必须复核：`63` 缺失、旧文档不改、隐私扫描、已实现/待实现边界。

**状态**：P0 深化路线图 `DESIGN_LOCKED`；P0 缺口清零 `PARTIAL`（未清零·不能声称已完成）。

---

## 15. 与其他章节的咬合

| 文档 | 关系 |
|---|---|
| `01_SOURCE_OF_TRUTH_AND_STATUS.md` | 路径约定（§1）/ 状态标签（§2）/ 禁手填数字（§2）/ 外部事实纪律（§11）/ Status Dump 规范（§2） |
| `02_ARCHITECTURE.md` | 四层架构分层（§4）/ 模块接口（`75` 蓝图入口·§14） |
| `03_EVIDENCE_CONTRACT_AND_VERDICT.md` | FEC 契约（§5）/ 五值裁决（§6）/ deterministic kernel（§6）/ anti-theater 规则（§6）/ golden vectors（§6） |
| `04_PROOF_ENVELOPE_AND_VERIFIER.md` | ProofEnvelope V2 / `.far-proof` / `far verify` / L1-L6 verifier / browser verifier 边界（§7-§8） |
| `05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md` | `Your Laptop Is The Verifier` 主线（§10）/ FAR-Bench protocol（§9） |
| `06_ROADMAP_AND_DOD.md` | W0-W5 分阶段（§4）/ DoD 验收 |
| `07_RISK_REGISTER_AND_DO_NOT_CLAIM.md` | 禁用口径 D1-D15 / V2-1..10 / DO_NOT_CLAIM 7+1 / 假绿 6 条（贯穿全文）/ snapshot 时间炸弹（§13.4）/ novelty 命门（§13.5）/ Core 中立（§13.6） |
| `08_TRACEABILITY_MATRIX.md` | 旧编号→新位置映射 / 旧口径修正对照 / V2/V3 降级内容 / 旧 digest 吸收 / 缺失编号处理 / 维护规则（§12） |
| `APPENDIX_A_TYPES.md` | 类型 / 字段名 / enum 值权威（`FecContract` / `ProofEnvelopeV2` / `VerdictKernelInput` / `VerdictKernelOutput` / `TrustReceiptSummary` / `purpose_tag` 9 值） |
| `APPENDIX_C_CANONICAL.md` | canonical 序列化 / proofHash / ledgerRoot / Merkle 算法权威（§5 / §7） |
| `APPENDIX_E_ANTI_THEATER.md` | anti-theater reasonCode / attackId 权威（§6 / §13.6） |
| `APPENDIX_F_GLOSSARY.md` | 术语语义权威：主名 / 弃用名 / 五值 enum / `purpose_tag`（§3 / §13.1） |

---

## 16. 来源溯源（物理档案已退役）

本文件并入的深度内容来自以下 `FINAL_PACKAGE/` 编号文档。物理档案已退役，离线完整备份位于 `C:/Users/RichardYuan/FAR-Lab_Backups/`。旧编号→新位置映射见 `08_TRACEABILITY_MATRIX.md`。本文件自包含，以下仅作来源溯源（非有效依赖）：

| 旧编号文档 | 并入内容 | 并入位置 |
|---|---|---|
| `04_PROJECT_AUDIT.md` | 18 项过度声明清单（O1-O18）/ 五维审计 / 跨文档冲突裁决 / 命门分析 / 强点确认 / 薄弱点定级 / 红线核查 | §2（HONESTY-A3）/ §3（身份裁决）/ §6（4 值作废）/ §11（外部事实清单·O9 / O18）/ §13.2（stale 零运行时）/ §13.5（novelty 命门补救） |
| `25_SELF_CRITIQUE_AND_FINAL_REPAIR.md` | 9 角色对抗式自查 / 15 条发现矩阵 / 残留已知局限 10 条（L1-L10）/ 修复验证 grep / 术语一致性 | §2（HONESTY-A3）/ §6（裁决纪律）/ §11（"首个" hedging·角色 1）/ §13.5（novelty 角色 1） |
| `39_FINAL_AUDIT_REPORT.md` | 终审完整性评分表 / 13 条跨文档矛盾闭口（F-01..F-13）/ 90-gap 追溯矩阵（簇级）/ 模型中立核验 / stale 零运行时订正 | §13.1（evidence_basis / purpose_tag 漂移·F-01 / F-13）/ §13.2（stale 零运行时·F-07）/ §13.6（Core 中立核验·§7） |
| `59_ADVERSARIAL_AUDIT_VERDICT_AND_CORRECTIONS.md` | 143-agent 6 维度对抗审视 / 6 个存活致命盲点 / 主 agent 交叉核实新增盲点 / 4 项设计决策 / 7 类措辞订正 / 战略收敛 | §10（`offline_replay` 订正·W0-7 并行）/ §13.3（packages/ 路径虚构·决策②）/ §13.4（snapshot 时间炸弹·Z1 / W0-2）/ §13.5（novelty 维度互斥·决策①）/ §13.6（Core 中立 overclaim·W0-4 / W0-5） |
| `65_SHALLOW_POINT_AUDIT_AND_DEEPENING_ROADMAP.md` | 三号卖点核对 / 代码现实快照 / 34 项浅点审计总表 / P0 深化路线图 / 红队攻击样例 / 验收结论 | §5（FEC 代码现实）/ §6（裁决代码现实）/ §7（ProofEnvelope 代码现实）/ §9（FAR-Bench 代码现实）/ §10（Demo 代码现实）/ §14（浅点审计与深化路线映射） |

> 冲突处理（遵守 `01` §2）：本文件（P0）与上述来源冲突时，以本文件与 `APPENDIX_A_TYPES.md` / `APPENDIX_C_CANONICAL.md` / `APPENDIX_F_GLOSSARY.md`（P0）为准；旧 `FINAL_PACKAGE` 编号文档（P3）仅作来源。裁决枚举、优先级、路径写法、禁用词以 `APPENDIX_F` §3.1/§3.2/§7/§6 与 `01` §1 为权威；anti-theater reasonCode / attackId 以 `APPENDIX_E` §0.3 为权威；canonical / proofHash 算法以 `APPENDIX_C` 为权威。

---

> 本文件冻结 13 类缺漏（含本次合并新增 6 项）+ 浅点审计深化路线的实现级口径。任何修改五值 enum、proofHash 白名单、`purpose_tag` 9 值、路径约定（`<REPOSITORY_ROOT>/`）、状态标签集（8 值）、`packages/` 拆包边界、snapshot 时效口径、novelty 维度归属、Core 中立边界的提议，必须同时修改本文件、`01_SOURCE_OF_TRUTH_AND_STATUS.md`、`03_EVIDENCE_CONTRACT_AND_VERDICT.md`、`04_PROOF_ENVELOPE_AND_VERIFIER.md`、`07_RISK_REGISTER_AND_DO_NOT_CLAIM.md`、`08_TRACEABILITY_MATRIX.md`、`APPENDIX_A_TYPES.md`、`APPENDIX_C_CANONICAL.md`、`APPENDIX_F_GLOSSARY.md`、golden vectors、所有 verifier 与答辩口径——否则不成立。

---

## 融合织入（Open Science 工程范式迁移·DESIGN_PROPOSED·2026-07-05）

> 来源：`FAR_LAB_MASTER_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md` + `FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md` §C 末段。Open Science = Claude Code 分支重品牌化的执行层 agent 工作区；FAR-Chain = 验证层。迁移边界：只迁工程范式（反剧场 / fail-closed 服务门 / 收窄伪造窗口 / 内容寻址 CAS / derivable 标记 / 进程组 kill / AST 结构门），绝不迁 OS 的 LLM-裁决语义。下述条目全 NOT_BUILT，属未来 backlog，不抢当前 next_action。

### 与本文档（09_GAP_CLOSURE_LOG）相关的融合缺口

- **融合衍生缺漏（DESIGN_PROPOSED·2026-07-05 发现）**：Open Science 工程范式审计发现 14 项可迁移缺口（FUSION-OS-1..14），全 NOT_BUILT，已落入 `DEPTH_LEDGER.md` §C 末段（机器可读接线表）+ `FUSION_OPEN_SCIENCE_DESIGN.md`（设计全文）。
- **最高杠杆缺漏**：FUSION-OS-1（反剧场检测器实时接线·当前最大活体缺口 —— 20 个检测器仅 `verify.ts:412` 离线调，`orchestrator.ts:199` 运行时硬编码 `[]`）。
- **红线级缺漏**：FUSION-OS-11（verdict_nodes.verdict CHECK 约束固化五值 enum·DB 层禁第六值）。
- **迁移边界**：只迁工程范式，绝不迁 OS 的 LLM-裁决语义（FAR-Chain 红线：确定性 R0-R9 内核，LLM 非裁决者）。
- **闭合路径**：每项接线须升 DEPTH_LEDGER §C 行至 WIRED_RED，物证由 keystone bot CI 双跑写回 WIRED_GREEN。

> 接线时升 WIRED_RED，物证由 keystone bot CI 双跑写回 WIRED_GREEN（见 DEPTH_LEDGER §D）。取序建议见 CLAUDE.md §4 P-FUSION。
