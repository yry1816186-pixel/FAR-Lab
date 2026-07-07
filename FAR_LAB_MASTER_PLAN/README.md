# FAR-Chain / 真研 FAR-Lab 主规划设计 SSOT（合并终版）

版本：`2026-07-07-merged-master`

本目录 `<REPOSITORY_ROOT>/FAR_LAB_MASTER_PLAN/` 是把两套既有规划——

- **原 `PROJECT_PLAN/`**（现行「单一事实源」工程骨架，~14.8k 行，DESIGN_LOCKED，含附录三权威 A/C/F），与
- **调研优化版 far_lab_final_design_plan**（post-research 竞赛聚焦重构，~3.9k 行，含评委视角/前沿研究/产品定位/demo/答辩/PDF/视频/本地 Agent 提示词）

——**合并后的最终主规划**。合并纪律：工程权威原样保留（原 `PROJECT_PLAN/` 的 00-10 + 附录 A-F + FUSION + DEPTH_LEDGER 一字节不改），调研版的**竞赛叙事独有价值**作为新编号层 20-30 并入，调研版的**模板填充/弱化重复内容**不予携带（丢弃清单与理由见 `MERGE_LOG.md`）。合并后本目录被定为唯一权威主规划，原 `PROJECT_PLAN/` 已从工作树移除、全部引用迁移至此（决议见 `MERGE_LOG.md` §6）。

> 合并不改任何 DESIGN_LOCKED 口径：术语字段名 / enum 值 / canonical 字节规则 / 路径写法仍以「附录三权威」（`APPENDIX_A_TYPES.md` / `APPENDIX_C_CANONICAL.md` / `APPENDIX_F_GLOSSARY.md`）为最终权威。本 README 仅作导航与口径收束，不重定义字段。

---

## 0. 合并带来的一个关键订正：状态纪律调和

这是合并必须解决的唯一**真实内容冲突**，所有读者先读这一节：

| 来源 | 对「工程实现状态」的口径 | 该口径的依据 |
|---|---|---|
| 原 `PROJECT_PLAN/`（现本主规划 00-10） | 状态标签如 `IMPLEMENTED_VERIFIED` 由 `far status --json` 从仓库实测回填，零手填 | 立足于**真实仓库**（含 `src/` `tests/` `packages/` `schema/` `golden_vectors/`） |
| 调研优化版（已并入 20-30） | 把所有实现声称**降级**为 `NEEDS_REPO_VALIDATION` | 调研版作者当时**只拿到文档 ZIP，没见到源码仓库**，故保守降级 |

**本主规划的裁决**：在本主规划所处的真实仓库语境下，调研版的降级前提（「无源码」）**不成立**。因此：

- **工程实现状态以本主规划的 `01_SOURCE_OF_TRUTH_AND_STATUS` + `far status --json` 为权威**——它更准确。
- 调研版 20-30 文件中的 `NEEDS_REPO_VALIDATION` 表述应理解为「调研视角的保守口径」，**不覆盖**真实仓库的实测状态。
- **诚实护栏**：任何 `IMPLEMENTED_VERIFIED` 都可通过在仓库中运行 `far status --json` 复核；若该命令未跑或未通过，对应声称不得对外作为既成事实。合并不替你跑这条命令——它只保证口径框架正确。

一句话：**合并保留原 `PROJECT_PLAN/` 的实测口径框架（现承袭于本主规划），吸收调研版的保守诚实姿态，两者不矛盾——后者是前者的下界护栏。**

---

## 一句话定义

FAR-Chain 是 AI4S 科学声明的可证伪信任闸门（claim-level verification layer）：它把 AI 生成或人机协作生成的科学声明编译成冻结的证据契约（FEC），绑定数据、工作流、统计计划、执行痕迹和反剧场检查，由**确定性五值裁决内核**输出 Evidence-Bound Verdict，封装为可转交、可独立重算、篡改可检测的 ProofEnvelope / Trust Receipt。

> 项目集身份（`真研 FAR-Lab`）与系统主名（`FAR-Chain`）不可互换：谈系统行为用 FAR-Chain，谈项目身份用 真研 FAR-Lab。

---

## 最终命名表（主名 / 弃用名）

| 主名 | 用法 | 弃用名 / 历史名（仅作来源溯源，禁作为有效口径） |
|---|---|---|
| `FAR-Chain` | 系统和产品主名 | FAR-Chain Ω |
| `真研 FAR-Lab` | 项目集、实验室和参赛主体名（英文 `FAR-Lab`） | FAR-Lab Ψ、Proof-Carrying AI Scientist OS、Proof-Carrying Scientific Agent Operating System |
| `claim-level verification layer` | 系统定位 | AI Scientist、coding agent、workflow runner、provenance viewer、hash ledger、benchmark、科学真理机器 |
| `FEC` / `FecContract` | 可证伪证据契约 | FalsificationSpec（仅作 FEC 子字段名保留） |
| `ProofEnvelope` | 可转交的证据包（V2 schemaVersion = `"far.proof_envelope.v2"`） | Proof-Carrying Research Object、SciIR envelope |
| `Trust Receipt` | 面向评委、审稿人、合作方的可读验真收据（ProofEnvelope 的 humanSummary 投影，非新事实源） | receipt、proof receipt（非正式别名可接受） |
| `proofHash` | sha256 over canonical proof input | proof hash（正式字段名 `proofHash`） |
| `ledgerRoot` | append-only 链根（Merkle 化产物时可混称 merkle root） | merkle root（仅指 Merkle 化产物） |
| `canonicalHash` / `canonical_hash` | sha256 over canonical_json | canonical hash、hash（泛指时） |
| `golden vectors` | 固定输入→期望 hex 的回归真值机制 | golden_vector、goldenVector |
| `VerdictKind`（5 值） | `CONFIRMED` / `REFUTED` / `INCONCLUSIVE` / `DEGRADED_SCOPE` / `UNTESTED`（详见 §五值裁决 enum） | 4 值 `ACCEPTED/REJECTED/DEGRADED/UNTESTED`（已废弃） |
| `<REPOSITORY_ROOT>/` | 工作区根即实现仓 | `far-chain/`（作为真实实现根，禁用）、`packages/`（V1 多包拆分） |
| `far` CLI | 命令前缀（**17 子命令全落地**·见 05 §9.2） | `far-chain` CLI、`farlab` |
| `competition_aliyun_qwen` | 参赛 provider profile | bailian_profile、qwen_profile |
| `offline_replay` | demo/test profile | production fallback、容灾 profile（非生产兜底） |

**弃用旧主卖点词**：`Auditable`、`Reproducible`、`Operating System`、`proof of scientific truth`。允许作为历史来源被解释，不作为主宣传。V2 叙事口径下用 `Tamper-Evident` 替代 `Auditable`、用 `Independently Re-computable` 替代 `Reproducible`。

> 消歧：`33:219` 的"6 值枚举" = `SciIRDomain` 领域枚举（6 值，含 G5 seismic precursor 领域），**正确·非 verdict 笔误**。verdict 5 值与 domain 6 值是两个不同枚举，勿混。

---

## 文档索引（合并终版 · 完整导航）

### 工程骨架层（00-10，来自原 `PROJECT_PLAN/`，DESIGN_LOCKED，原样保留）

| 文档 | 作用 | 状态 |
|---|---|---|
| [00_PROJECT_BRIEF.md](00_PROJECT_BRIEF.md) | 项目身份、目标、非目标、对外口径、核心卖点、竞争策略、成功标准 | DESIGN_LOCKED |
| [01_SOURCE_OF_TRUTH_AND_STATUS.md](01_SOURCE_OF_TRUTH_AND_STATUS.md) | 单一事实源、状态标签 taxonomy、路径和统计规则、status dump 规范（**工程实现状态权威**） | DESIGN_LOCKED |
| [02_ARCHITECTURE.md](02_ARCHITECTURE.md) | 最终系统架构、层级（L0-L14）、模块边界、实现原则 | DESIGN_LOCKED |
| [03_EVIDENCE_CONTRACT_AND_VERDICT.md](03_EVIDENCE_CONTRACT_AND_VERDICT.md) | FEC、证据绑定、统计计划、五值裁决内核、anti-theater 规则表 | DESIGN_LOCKED |
| [04_PROOF_ENVELOPE_AND_VERIFIER.md](04_PROOF_ENVELOPE_AND_VERIFIER.md) | ProofEnvelope、proofHash、独立验证器、`.far-proof` bundle、diff report | DESIGN_LOCKED |
| [05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md](05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md) | AI4S 适配、产品演示、FAR-Bench、评委体验、demo 脚本 | DESIGN_LOCKED |
| [06_ROADMAP_AND_DOD.md](06_ROADMAP_AND_DOD.md) | 实施路线（W0-W5）、验收门、Definition of Done | DESIGN_LOCKED |
| [07_RISK_REGISTER_AND_DO_NOT_CLAIM.md](07_RISK_REGISTER_AND_DO_NOT_CLAIM.md) | 风险登记、禁用说法（DO_NOT_CLAIM 7 条 / 假绿 6 条 / V2 专属）、答辩红线 | DESIGN_LOCKED |
| [08_TRACEABILITY_MATRIX.md](08_TRACEABILITY_MATRIX.md) | 旧 00-86 编号→新 SSOT 位置的追踪矩阵（来源溯源） | DESIGN_LOCKED |
| [09_GAP_CLOSURE_LOG.md](09_GAP_CLOSURE_LOG.md) | 本次发现的缺漏及补齐方案（修订项） | DESIGN_LOCKED |
| [10_DEV_ENTRYPOINT.md](10_DEV_ENTRYPOINT.md) | 后续工程开发的最短阅读路径和首批任务（P0 工程闭环入口） | DESIGN_LOCKED |

### 竞赛与策略层（20-30，来自调研优化版的独有价值，FAR_LAB_MASTER_PLAN 原缺）

> 这一层是合并的**主要增量**：把调研版真正独有的竞赛叙事并入，使主规划从「工程规格」升级为「工程规格 + 竞赛打法」。

| 文档 | 作用 | 来源（调研版编号） |
|---|---|---|
| [20_COMPETITION_FACT_BASELINE.md](20_COMPETITION_FACT_BASELINE.md) | 事实基线、诚实边界、外部比赛/API/标准来源（含状态纪律调和注） | 01 |
| [21_COMPETITION_AND_JUDGE_VIEW.md](21_COMPETITION_AND_JUDGE_VIEW.md) | 赛题适配、评委最可能质疑与答辩回应、60 秒开场、与普通 demo 区别 | 02 |
| [22_DEEP_RESEARCH_REVIEW.md](22_DEEP_RESEARCH_REVIEW.md) | 前沿研究综述（Co-Scientist/Robin/AI-Scientist-v2/MCP/RO-Crate/RFC6962…）与借鉴/超越/避免撞车 | 03 |
| [23_GAP_AND_OPPORTUNITY.md](23_GAP_AND_OPPORTUNITY.md) | 全球竞品空白、不可替代点、应砍功能清单、必须保留的最小可见版本 | 04 |
| [24_PRODUCT_POSITIONING.md](24_PRODUCT_POSITIONING.md) | 多受众定位（一句话/三句话/评委版/开源版/论文版/开发者版）、它不是什么 | 05 |
| [25_HERO_DEMO_AND_COMPETITION_STORY.md](25_HERO_DEMO_AND_COMPETITION_STORY.md) | 主 Demo A/B/C、TESS 可证伪证据链、现场篡改冲击点 | 11 |
| [26_COMPETITION_PDF_STRUCTURE.md](26_COMPETITION_PDF_STRUCTURE.md) | 16 页参赛 PDF 页面骨架与不可写/必须降级红线 | 15 |
| [27_DEFENSE_SCRIPT_AND_QA.md](27_DEFENSE_SCRIPT_AND_QA.md) | 60s/3min/5min 答辩讲稿 + 10 个尖锐 Q&A | 16 |
| [28_DEMO_VIDEO_SCRIPT.md](28_DEMO_VIDEO_SCRIPT.md) | 11 镜 demo 视频分镜与不可出现/必须出现清单 | 17 |
| [29_OPEN_SOURCE_AND_PAPER_ROUTE.md](29_OPEN_SOURCE_AND_PAPER_ROUTE.md) | 开源仓库结构、README 结构、License、技术报告大纲、论文 title/abstract | 14 |
| [30_EXECUTION_PROMPT_FOR_LOCAL_AGENT.md](30_EXECUTION_PROMPT_FOR_LOCAL_AGENT.md) | 可直接复制给本地 Agent 的总执行提示词 | 20 |

### 附录三权威（A / C / F）— 术语 / canonical / 字段的最终权威

> 这三份附录是术语、字段、canonical 字节规则的**最终权威**。任一对外材料/工程文档/答辩口径与附录冲突时，**改的是那个口径，不是附录**——除非走 `01` 的修订程序同时修改本附录、APPENDIX_A/C/F、schema、golden vectors 和所有 verifier。

| 附录 | 权威域 | 状态 |
|---|---|---|
| [APPENDIX_A_TYPES.md](APPENDIX_A_TYPES.md) | 类型字段名、TS interface 字段、enum 字段集合（`VerdictKind` / `ProofCheckOutcome` / `EvidenceDirection` / `EffectComparator` / `NetworkPolicy`；`Claim` / `FecContract` / 全部子类型 / 证据绑定 / 测量统计 / VerdictKernel / ProtocolDeviation / AntiTheater / ProofEnvelopeV2） | DESIGN_LOCKED |
| [APPENDIX_C_CANONICAL.md](APPENDIX_C_CANONICAL.md) | canonical 序列化字节规则、key 排序、数值格式化、四字段白名单（`stageId` / `cred` / `payloadKind` / `prevHash`）、proofHash 白名单、Merkle/ledgerRoot 算法、inclusion proof、NUMERIC_KNOWN_DIVERGENCE | DESIGN_LOCKED |
| [APPENDIX_F_GLOSSARY.md](APPENDIX_F_GLOSSARY.md) | 术语语义、命名主名/弃用名、状态标签 taxonomy、禁用词表、路径约定、文档优先级、FINAL_PACKAGE 归档声明 | DESIGN_LOCKED |

### 附录补充（B / D / E）

| 附录 | 作用 | 状态 |
|---|---|---|
| [APPENDIX_B_GOLDEN.md](APPENDIX_B_GOLDEN.md) | golden vectors 规格、向量族、mutation vectors 期望失败点、跨语言对拍纪律 | DESIGN_LOCKED |
| [APPENDIX_D_PROOF_BUNDLE.md](APPENDIX_D_PROOF_BUNDLE.md) | `.far-proof/` bundle 完整结构、打包硬约束、Windows/空格路径/离线模式可运行要求 | DESIGN_LOCKED |
| [APPENDIX_E_ANTI_THEATER.md](APPENDIX_E_ANTI_THEATER.md) | 反剧场攻击库、expected verdict 表、CI gate | DESIGN_LOCKED |

### 融合设计参考与交接账本

| 文档 | 作用 | 状态 |
|---|---|---|
| [FUSION_OPEN_SCIENCE_DESIGN.md](FUSION_OPEN_SCIENCE_DESIGN.md) | Open Science → FAR-Chain 工程范式融合：6 收敛点 + 14 迁移缺口（FUSION-OS-1..14）+ 落地约束。只迁工程范式，不迁 OS 的 LLM-裁决语义 | DESIGN_PROPOSED |
| [DEPTH_LEDGER.md](DEPTH_LEDGER.md) | 跨窗口深度接线账本（agent 无关 SSOT）：next_action topo、status 枚举、FUSION 接线表 | 工作日志/交接 |
| [MERGE_LOG.md](MERGE_LOG.md) | **本次合并的逐文件 keep/add/drop 决策与理由**（可审计） | MERGE-2026-07-07 |

---

## 三条阅读路径（按角色）

### 路径 A · 工程实施者（开发 / 本地 Agent）
1. 本 README §0（状态纪律调和）→ `01_SOURCE_OF_TRUTH_AND_STATUS` → `07_RISK_REGISTER_AND_DO_NOT_CLAIM` → `APPENDIX_F_GLOSSARY` §6。
2. `APPENDIX_C_CANONICAL` → `APPENDIX_A_TYPES` → `02_ARCHITECTURE`。
3. `03_EVIDENCE_CONTRACT_AND_VERDICT` → `APPENDIX_E_ANTI_THEATER` → `04_PROOF_ENVELOPE_AND_VERIFIER` → `APPENDIX_D_PROOF_BUNDLE` → `APPENDIX_B_GOLDEN`。
4. `06_ROADMAP_AND_DOD` → `10_DEV_ENTRYPOINT`（P0 闭环）→ `30_EXECUTION_PROMPT_FOR_LOCAL_AGENT`（可直接复制给 Agent）。

### 路径 B · 竞赛答辩者（评委 / 答辩 / 材料）
1. `24_PRODUCT_POSITIONING`（多受众定位）→ `21_COMPETITION_AND_JUDGE_VIEW`（赛题适配 + 评委质疑表）。
2. `23_GAP_AND_OPPORTUNITY`（不可替代点）→ `22_DEEP_RESEARCH_REVIEW`（差异化与避免撞车）。
3. `25_HERO_DEMO_AND_COMPETITION_STORY`（主 Demo）→ `26_COMPETITION_PDF_STRUCTURE`（16 页 PDF）→ `27_DEFENSE_SCRIPT_AND_QA`（讲稿 + Q&A）→ `28_DEMO_VIDEO_SCRIPT`（视频分镜）。
4. `07_RISK_REGISTER_AND_DO_NOT_CLAIM`（答辩红线）→ `20_COMPETITION_FACT_BASELINE`（外部来源）。

### 路径 C · 开源 / 论文贡献者
1. `24_PRODUCT_POSITIONING`（开源版 + 论文版定位）→ `29_OPEN_SOURCE_AND_PAPER_ROUTE`（仓库结构 + 技术报告大纲 + abstract）。
2. `04_PROOF_ENVELOPE_AND_VERIFIER` → `APPENDIX_D_PROOF_BUNDLE` → `FUSION_OPEN_SCIENCE_DESIGN`（RO-Crate/PROV/WRROC 导出）。
3. `08_SCIIR` 相关 schema 见 `APPENDIX_A_TYPES`；canonical 互操作见 `APPENDIX_C_CANONICAL`。
4. `05_AI4S_PRODUCT_DEMO_AND_BENCHMARK`（benchmark 设计）。

---

## 五值裁决 enum（固定，禁止第六值）

```ts
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

**禁止增加第六值**，除非同时修改本 SSOT、APPENDIX_A/C/F、schema、golden vectors、所有 verifier 和答辩口径。`DEGRADED_SCOPE` 必须在 `CONFIRMED` 前判定。SQLite `RAISE(ABORT)` 是数据库触发器操作，**不是**裁决值。

---

## 最高设计原则

1. 信任根只落在确定性结构、哈希、冻结协议、可重算执行和机器检查上。
2. LLM 可以生成候选、解释、报告和形式化草稿，**但不能作为最终裁决者**；裁决必须 deterministic（F3）。
3. 科学声明必须先变成可测、可反驳、可冻结、可重算的 FEC（三件套硬约束 F7：`source_anchor + repro_hash + FalsificationSpec`，任一缺失硬 throw，非 fallback）。
4. 五值裁决是项目语义核心：`CONFIRMED`、`REFUTED`、`INCONCLUSIVE`、`DEGRADED_SCOPE`、`UNTESTED`。
5. ProofEnvelope 证明的是"该声明是否满足冻结证据契约"，**不是证明科学真理**。
6. 任何实现状态、测试数量、路径、外部竞品事实都必须来自可复核来源（`far status --json` / CI / `git rev-parse HEAD` / 可复核脚本），**不允许手填裸数字**。
7. 诚实护城河：一个敢在交付前自爆数字漂移 / 路径虚构 / 反向 over-claim 的项目，比把这些藏起来的项目在诚信维度更强——"诚实本身是反-theater 项目最强的护城河演示"。

---

## 当前最高优先级（P0 工程闭环）

P0 不是继续写宏大叙事。P0 是让一个真实或半真实 AI4S claim 完成闭环：

```text
claim -> FEC V2 -> dataset/workflow binding -> protocol freeze
      -> measurement -> statistical evaluation
      -> five-value verdict (deterministic kernel + rule trace)
      -> ProofEnvelope V2 -> far verify
      -> independent recomputation (TS / Python / browser)
      -> tamper red (修改任一 verdict-critical 字段后 verify fail)
```

### P0 工程闭环（P0-1 至 P0-5，工程入口绑定）

| P0 项 | 工程入口（`<REPOSITORY_ROOT>/`） | 验收要点 |
|---|---|---|
| **P0-1 FEC V2 mandatory** | `src/falsifiability/contracts.ts`、`schema/migrations/0005_falsifiability_contracts.sql`、`src/fec/orchestrator.ts` | 每个 `fecAppendClaim` 必须有 frozen FEC；缺失 FEC 只能进入 `UNTESTED` 或 fail-closed |
| **P0-2 Deterministic verdict kernel** | `src/falsifiability/verdict.ts`、`src/fec/verdict_stage.ts`、`src/proof_envelope/sealer.ts` | verdict 不依赖 LLM 字面标签；每次输出 rule trace；五值优先级稳定；golden vectors 覆盖全分支 |
| **P0-3 ProofEnvelope V2** | `src/proof_envelope/types.ts`、`src/proof_envelope/validator.ts`、`src/proof_envelope/proof_hash.ts` | proofHash 绑定 FEC/dataset/workflow/statistical plan/evidence IDs/verdict trace/ledger root；TS/Python/browser hash 一致；改任一关键字段→verify fail |
| **P0-4 `far verify`** | `src/cli/far.ts`、`repro/far_chain_repro/verify_chain.py`、browser verifier | `far verify receipt.json` 在 clean checkout 可运行；输出 five-value verdict / proof head / tamper / scope / independent recomputation；Windows/空格/离线路径可演示 |
| **P0-5 Anti-theater harness** | 现有 anti-theater guard、新增 attack corpus、CI smoke | 覆盖 label-only / post-hoc threshold / dataset drift / scope laundering / missing raw / LLM reviewer override；每 attack 有 expected verdict 或 expected fail；demo 展示≥3 失败样例 |

> **实时接线延伸（DESIGN_PROPOSED·FUSION-OS-1）**：运行时 verdict 路径当前 `orchestrator.ts:199` 硬编码 `antiTheaterFindings:[]`，20 个检测器仅 `verify.ts:412` 离线调用。FUSION-OS-1 把 `runAntiTheaterLint` 注入 `buildVerdictKernelInput`，闭合实时路径（当前最大活体缺口，最高杠杆）。接线表见 `DEPTH_LEDGER.md` §C FUSION-OS-1。

### V2 / V3 分界（避免把路线写成当前完成）

| 必须在 V2 完成 | 才考虑 V3 |
|---|---|
| FEC V2、deterministic verdict kernel、ProofEnvelope V2、`far verify`、Python/browser independent recomputation、FAR-Bench125、demo receipt、anti-theater attack corpus | Rust/Go/WASM full verifier、external transparency log、full formal specification（TLA+/Dafny）、FAR-Level 4 supply-chain profile、large public benchmark expansion、third-party verifier ecosystem |

---

## 三个统一卖点（设计阶段已收敛）

| 卖点 | 一句话 |
|---|---|
| **第一卖点：Your Laptop Is The Verifier** | 评委不需要信任主办方后端或参赛者演示机，而是在自己的机器上重算 proof head、Merkle inclusion、verdict trace 和 integrity status |
| **第二卖点：五值 anti-theater verdict** | 系统不把所有失败挤成"失败"或"通过"，而是区分 `CONFIRMED` / `REFUTED` / `INCONCLUSIVE` / `DEGRADED_SCOPE` / `UNTESTED` |
| **第三卖点：platform-independent trust receipt** | ProofEnvelope 把 claim、evidence、FEC、statistical plan、workflow run、dataset binding、verdict trace 和 dependency graph 绑定成可转交对象 |

---

## 竞赛与参赛合规事实底座

> 外部事实（snapshot 维护期、外部竞品发布时间）标 `NEEDS_EXTERNAL_VERIFICATION`。完整 Day-1 实测清单见 `10_DEV_ENTRYPOINT`。

| 维度 | 口径 | 状态 |
|---|---|---|
| 赛事编号 | XH-202619 | NEEDS_EXTERNAL_VERIFICATION（赛前核实） |
| 赛事全称 | 《基于国产开源大模型的 AI Scientist 的研发与应用》 | NEEDS_EXTERNAL_VERIFICATION |
| 锁定方向 | 方向一A：科学问题的假设生成（非 1B 数据分析） | DESIGN_LOCKED |
| 评分三维 | 科学价值 40 / 技术深度 30 / 应用潜力 30 | NEEDS_EXTERNAL_VERIFICATION（赛前核实评分单） |
| 参赛 profile | `competition_aliyun_qwen`（锁 Qwen + 百炼/DashScope） | DESIGN_LOCKED |
| 参赛基座快照 | `COMPETITION_MODEL_SNAPSHOT` 以 `snapshot.ts` 为权威，**无百炼官方维护期承诺**；竞赛周 day-0 须用 GET /v1/models 实测复核 | NEEDS_EXTERNAL_VERIFICATION（day-0 实测） |
| 百炼 base_url | `https://dashscope.aliyuncs.com/compatible-mode/v1`（OpenAI-compatible） | NEEDS_EXTERNAL_VERIFICATION |
| Qwen 家族白名单 / FallbackChain | 字段与取值以 `02_ARCHITECTURE` §provider 为权威；禁越 Qwen 家族 | DESIGN_LOCKED |

---

## 禁用词与诚实红线（口径收束 · 节选）

完整禁用词表与改写对照见 `07_RISK_REGISTER_AND_DO_NOT_CLAIM` 与 `APPENDIX_F_GLOSSARY` §6。

**核心禁用词**（仅可在"禁用 / 历史 / 修正"语境显式标注后出现）：证明科学真理 / 物理不可篡改 / 完全可复现 / 全自动科学家 / 通用 AI4S benchmark 或排行榜；`far-chain/`（作为真实实现路径）——一律写 `<REPOSITORY_ROOT>/`；最新 / 第一 / 唯一（无来源支撑时）。

**DO_NOT_CLAIM 7 条**（`02` §7.1）：完全自动发现新天文规律；已实现 eval-ring 物理隔离；FAR-Bench 是通用 benchmark；LLM 可作最终科学裁判；证明科学结论绝对为真；全流程绝对无人参与；无真实百炼调用也声称参赛 profile 已闭环。

**不允许假绿 6 条**（`02` §7.2）：纯 fixture mock 代替真实 appendRecord；未真实跑百炼却声称 request_id 已验证；未导出 proof 却显示 passed；LLM 自评代替 verdict protocol；图表无数据绑定；source_anchor 指向不可访问来源。

**LLM 使用边界**（`07` §4）：允许生成候选 claim / 辅助 FEC 草案 / 解释 verdict / 生成报告 / 生成形式化证明草稿；**禁止**直接输出最终 verdict、覆盖 deterministic kernel、隐藏 protocol deviation、在 proofHash 外悄悄改 evidence、把自然语言 reviewer 当独立真相源、自动把 `UNTESTED` 改成 `CONFIRMED`。

---

## W0 硬门纪律（数字 / 路径不漂移）

文档系统曾存在三方数字漂移、`far-chain/` 子目录路径虚构、`golden_vectors` 根哈希误标、5 值 vs 6 值笔误。**这是诚信红线**——自毁即出局。

**status-dump CLI（唯一 SSOT 数字源，禁手填）**：

```bash
far status              # 实测生成单一 SSOT 状态报告
far status --json       # 机器可读，供文档构建时回填占位符
```

输出字段全部从 `git HEAD` 实测，零手填：`testCount` / `tsFileCount` / `migrationCount` / `goldenVectorCount` / `coverageLine` / `coverageBranch` / `suiteIntegrityRoot` / `docCount` / `commitSha`。**禁手填数字**——这是 W0 验收门的 grep 校验项。

> 合并特别提示：本主规划吸收的 20-30 竞赛层文件中，凡涉及具体实现数字处，一律以 `far status --json` 实测值为准；调研版当时因未见源码而写的保守 `NEEDS_REPO_VALIDATION`，不覆盖真实仓库实测结果（详见 §0）。

---

## 路径约定（权威见 `APPENDIX_F` §7）

所有工程路径以 `<REPOSITORY_ROOT>/` 开头——即**工作区根目录**（包含 `src/` `schema/` `frontend/` `tests/` `golden_vectors/` 的目录），**不是** `far-chain/` 子目录。命令示例中**禁止**写 `cd far-chain && pnpm install`；Windows 路径、空格路径、离线目录都必须可运行（`far verify` P0 验收项）。

---

## 文档优先级（P0-P3）

| 优先级 | 来源 | 说明 |
|---|---|---|
| **P0** | 本主规划 `FAR_LAB_MASTER_PLAN/`（含附录三权威 A/C/F） | 最终规划和执行口径 |
| **P1** | 可执行状态命令（`far status --json`）、CI、测试输出 | 实现状态与数量的唯一事实源 |
| **P2** | 当前代码（`<REPOSITORY_ROOT>/src` 等） | 接口和能力以实际代码为准 |
| **P3** | 旧 `00`-`86` 与 `_digest`（已归档至 `C:/Users/RichardYuan/FAR-Lab_Backups/`）；以及合并前的源文件夹 `PROJECT_PLAN/`（已并入本目录并移除）、`11111/` | 历史来源，不直接覆盖 P0/P1/P2 |

**冲突裁决规则**：P0 与代码现实（P2）冲突→**开修订项**（`09_GAP_CLOSURE_LOG.md`），不是用旧文档覆盖代码；P0 内部三附录冲突→类型字段以 A 为准、canonical 字节规则以 C 为准、术语语义以 F 为准；P0 与 P3 冲突→P0 胜。

> 本次合并的源文件夹 `PROJECT_PLAN/` 与 `11111/far_lab_final_design_plan/` 为历史来源：`11111/` 保留以供溯源；`PROJECT_PLAN/` 的内容已逐字节并入本目录后从工作树移除（决议见 `MERGE_LOG.md` §6）。两者**均不再作为有效事实源**——有效口径以本 `FAR_LAB_MASTER_PLAN/` 为准。

---

## 术语使用检查表（发布前过一遍）

完整版见 `APPENDIX_F_GLOSSARY.md` §10。每次更新 README / PPT / 答辩稿 / 报告前必查：

- [ ] 用主名（最终命名表），未用弃用名；
- [ ] verdict 只用 5 值，无第六值；
- [ ] 未出现禁用词（D1-D15 / V2-1 至 V2-10 / DO_NOT_CLAIM 7 条 / 假绿 6 条）；
- [ ] 未手填裸数字（测试数 / 文件数 / CI 通过率 / benchmark 数 / commit / 竞品时间）——应来自 `far status --json`；
- [ ] 路径写 `<REPOSITORY_ROOT>/`，未写 `far-chain/`（作为真实实现根）；
- [ ] 未把"可验证"读成"证明为真"；未暗示 FAR 取代同行评审；
- [ ] 未把 hash 说成物理安全（应 tamper-evident 非 tamper-proof）；
- [ ] 未把 V3 路线写成当前完成；
- [ ] 未写入真实个人路径、用户名、邮箱、密钥或本机信息（守 S1 / 隐私门）；
- [ ] 每个能力都带状态标签，未混写"已实现"和"应实现"；
- [ ] 未把 `.far-proof` 自验证冒充第三方验证（RR-2）；
- [ ] 未引用未复核外部事实（应标 `NEEDS_EXTERNAL_VERIFICATION`）；
- [ ] 竞赛层（20-30）中的 `NEEDS_REPO_VALIDATION` 已按 §0 与真实仓库状态对齐。

---

## 合并溯源（一句话）

本 `FAR_LAB_MASTER_PLAN/` = 原 `PROJECT_PLAN/`（工程骨架，00-10 + 附录 A-F + FUSION + DEPTH_LEDGER，原样保留）⊕ `11111/far_lab_final_design_plan/` 的竞赛独有价值（重编号 20-30）⊖ 调研版的模板填充/弱化重复（丢弃清单见 `MERGE_LOG.md`）。本目录已定为唯一权威主规划，原 `PROJECT_PLAN/` 内容并入后移除。
