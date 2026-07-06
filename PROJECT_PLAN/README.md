# FAR-Chain / 真研 FAR-Lab 最优项目规划设计 SSOT

版本：`2026-07-01-merged-final`

本文档包位于仓库顶层 `<REPOSITORY_ROOT>/PROJECT_PLAN/`，是对已归档 `FINAL_PACKAGE`（00-86 + `_digest`）全量设计资料的**收束实现级版**。它不追求继续扩张概念，而是把项目改造成可以实施、可以验收、可以答辩、可以防守的最高质量规划设计。

后续开发、答辩、论文和验收默认从这里开始，**不再从 `FINAL_PACKAGE/` 直接读取最终口径**——`FINAL_PACKAGE/` 的物理档案已退役（自包含纪律见 §FINAL_PACKAGE 归档声明），离线完整备份位于 `C:/Users/RichardYuan/FAR-Lab_Backups/`。

> **本次合并（2026-07-01-merged-final）做了什么**：以现有 README 结构为脊柱保留不变，把 `FINAL_PACKAGE/00_WORKSPACE_MAP`、`01_PROJECT_FACTS`、`56_SOURCE_OF_TRUTH_RECONCILIATION`、`76_DESIGN_PHASE_COMPLETION_VERDICT` 蒸馏掉的深度内容（赛事与参赛合规事实底座、W0 硬门纪律、设计阶段完成判定、P0 工程闭环工程入口）完整并入；文档索引扩展为含新增附录 A-F 的完整导航；版本号升级以反映本次合并。术语、字段名、enum 值、路径写法以"附录三权威"（`APPENDIX_A_TYPES.md` / `APPENDIX_C_CANONICAL.md` / `APPENDIX_F_GLOSSARY.md`）为最终权威，本 README 仅作导航与口径收束，不重定义字段。

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
| `far` CLI | 命令前缀（核心 11 子命令·见 05 §9.2：`far status` / `far verify` / `far verify-golden` / `far export receipt` / `far export far-proof` / `far bench run` / `far fec compile` / `far fec freeze` / `far fsm advance` / `far demo` / `far api`） | `far-chain` CLI、`farlab` |
| `competition_aliyun_qwen` | 参赛 provider profile | bailian_profile、qwen_profile |
| `offline_replay` | demo/test profile | production fallback、容灾 profile（非生产兜底） |

**弃用旧主卖点词**：`Auditable`、`Reproducible`、`Operating System`、`proof of scientific truth`。允许作为历史来源被解释，不作为主宣传。V2 叙事口径下用 `Tamper-Evident` 替代 `Auditable`、用 `Independently Re-computable` 替代 `Reproducible`。

> 消歧：`33:219` 的"6 值枚举" = `SciIRDomain` 领域枚举（6 值，含 G5 seismic precursor 领域），**正确·非 verdict 笔误**。verdict 5 值与 domain 6 值是两个不同枚举，勿混。

---

## 文档索引（含附录 A-F）

### 主章节（00-10）

| 文档 | 作用 | 状态 |
|---|---|---|
| [00_PROJECT_BRIEF.md](00_PROJECT_BRIEF.md) | 项目身份、目标、非目标、对外口径、核心卖点、竞争策略、成功标准 | DESIGN_LOCKED |
| [01_SOURCE_OF_TRUTH_AND_STATUS.md](01_SOURCE_OF_TRUTH_AND_STATUS.md) | 单一事实源、状态标签 taxonomy、路径和统计规则、status dump 规范 | DESIGN_LOCKED |
| [02_ARCHITECTURE.md](02_ARCHITECTURE.md) | 最终系统架构、层级（L0-L14）、模块边界、实现原则 | DESIGN_LOCKED |
| [03_EVIDENCE_CONTRACT_AND_VERDICT.md](03_EVIDENCE_CONTRACT_AND_VERDICT.md) | FEC、证据绑定、统计计划、五值裁决内核、anti-theater 规则表 | DESIGN_LOCKED |
| [04_PROOF_ENVELOPE_AND_VERIFIER.md](04_PROOF_ENVELOPE_AND_VERIFIER.md) | ProofEnvelope、proofHash、独立验证器、`.far-proof` bundle、diff report | DESIGN_LOCKED |
| [05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md](05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md) | AI4S 适配、产品演示、FAR-Bench、评委体验、demo 脚本 | DESIGN_LOCKED |
| [06_ROADMAP_AND_DOD.md](06_ROADMAP_AND_DOD.md) | 实施路线（W0-W5）、验收门、Definition of Done | DESIGN_LOCKED |
| [07_RISK_REGISTER_AND_DO_NOT_CLAIM.md](07_RISK_REGISTER_AND_DO_NOT_CLAIM.md) | 风险登记、禁用说法（DO_NOT_CLAIM 7 条 / 假绿 6 条 / V2 专属）、答辩红线 | DESIGN_LOCKED |
| [08_TRACEABILITY_MATRIX.md](08_TRACEABILITY_MATRIX.md) | 旧 00-86 编号→新 SSOT 位置的追踪矩阵（来源溯源；物理档案已退役，备份见 §归档声明） | DESIGN_LOCKED |
| [09_GAP_CLOSURE_LOG.md](09_GAP_CLOSURE_LOG.md) | 本次发现的缺漏及补齐方案（修订项） | DESIGN_LOCKED |
| [10_DEV_ENTRYPOINT.md](10_DEV_ENTRYPOINT.md) | 后续工程开发的最短阅读路径和首批任务（P0 工程闭环入口） | DESIGN_LOCKED |

### 附录三权威（A / C / F）

> 这三份附录是术语、字段、canonical 字节规则的**最终权威**。任一对外材料/工程文档/答辩口径与附录冲突时，**改的是那个口径，不是附录**——除非走 `01` 的修订程序同时修改本附录、APPENDIX_A/C/F、schema、golden vectors 和所有 verifier。

| 附录 | 权威域 | 状态 |
|---|---|---|
| [APPENDIX_A_TYPES.md](APPENDIX_A_TYPES.md) | 类型字段名、TS interface 字段、enum 字段集合（`VerdictKind` / `ProofCheckOutcome` / `EvidenceDirection` / `EffectComparator` / `NetworkPolicy`；`Claim` / `FecContract` / 全部子类型 / 证据绑定 / 测量统计 / VerdictKernel / ProtocolDeviation / AntiTheater / ProofEnvelopeV2） | DESIGN_LOCKED |
| [APPENDIX_C_CANONICAL.md](APPENDIX_C_CANONICAL.md) | canonical 序列化字节规则、key 排序、数值格式化、四字段白名单（`stageId` / `cred` / `payloadKind` / `prevHash`）、proofHash 白名单、Merkle/ledgerRoot 算法、inclusion proof、NUMERIC_KNOWN_DIVERGENCE | DESIGN_LOCKED |
| [APPENDIX_F_GLOSSARY.md](APPENDIX_F_GLOSSARY.md) | 术语语义、命名主名/弃用名、状态标签 taxonomy、禁用词表、路径约定、文档优先级、FINAL_PACKAGE 归档声明 | DESIGN_LOCKED |

### 附录补充（B / D / E）

| 附录 | 作用 | 状态 |
|---|---|---|
| [APPENDIX_B_GOLDEN.md](APPENDIX_B_GOLDEN.md) | golden vectors 规格、向量族（canonical_json / chain / merkle / proof_envelope / verdict_trace）、mutation vectors 期望失败点、跨语言对拍纪律 | DESIGN_LOCKED |
| [APPENDIX_D_PROOF_BUNDLE.md](APPENDIX_D_PROOF_BUNDLE.md) | `.far-proof/` bundle 完整结构、打包硬约束（不含密钥 / 不含真实隐私路径 / 离线自验证）、Windows/空格路径/离线模式可运行要求 | DESIGN_LOCKED |
| [APPENDIX_E_ANTI_THEATER.md](APPENDIX_E_ANTI_THEATER.md) | 反剧场攻击库（label-only / LLM-reviewer-override / post-hoc-threshold / dataset-drift / scope-laundering / missing-raw-artifact / metric-swapping / seed-cherry-picking / workflow-digest-mismatch / natural-language-verdict-mismatch）、expected verdict 表、CI gate | DESIGN_LOCKED |

### 融合设计参考（Open Science 工程范式迁移，DESIGN_PROPOSED）

| 文档 | 作用 | 状态 |
|---|---|---|
| [FUSION_OPEN_SCIENCE_DESIGN.md](FUSION_OPEN_SCIENCE_DESIGN.md) | Open Science（Claude Code 分支重品牌化的执行层 agent 工作区）→ FAR-Chain 工程范式融合设计：6 收敛点（C-1..C-6）+ 14 高优先级迁移缺口（FUSION-OS-1..14）+ 12 落地约束 + 执行顺序。**迁移边界**：只迁工程范式（反剧场 / fail-closed 服务门 / 收窄伪造窗口 / 内容寻址 CAS / derivable 标记 / 进程组 kill / AST 结构门），**绝不迁** OS 的 LLM-裁决语义。机器可读接线表见 `DEPTH_LEDGER.md` §C 末段 | DESIGN_PROPOSED |

### 阅读顺序（推荐路径）

1. **先读红线与边界**：本 README → `00_PROJECT_BRIEF` → `07_RISK_REGISTER_AND_DO_NOT_CLAIM` → `APPENDIX_F_GLOSSARY` §6。
2. **再读信任根与 canonical**：`APPENDIX_C_CANONICAL` → `APPENDIX_A_TYPES` → `01_SOURCE_OF_TRUTH_AND_STATUS`。
3. **读裁决与证据契约**：`03_EVIDENCE_CONTRACT_AND_VERDICT` → `APPENDIX_E_ANTI_THEATER`。
4. **读 ProofEnvelope 与验证器**：`04_PROOF_ENVELOPE_AND_VERIFIER` → `APPENDIX_D_PROOF_BUNDLE` → `APPENDIX_B_GOLDEN`。
5. **读落地与验收**：`06_ROADMAP_AND_DOD` → `10_DEV_ENTRYPOINT` → `05_AI4S_PRODUCT_DEMO_AND_BENCHMARK`。
6. **读架构与追踪**：`02_ARCHITECTURE` → `08_TRACEABILITY_MATRIX` → `09_GAP_CLOSURE_LOG`。

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

> **DB 层强制（DESIGN_PROPOSED·FUSION-OS-11）**：当前五值 enum 由内核 + 附录冻结；未来在 `verdict_nodes.verdict` 列加 `CHECK(verdict IN ('CONFIRMED','REFUTED','INCONCLUSIVE','DEGRADED_SCOPE','UNTESTED'))` 约束，使 DB 层也拒绝第六值（Open Science `verification_checks` CHECK 范式），与新 migration 重建 trigger 纳入。接线表见 `DEPTH_LEDGER.md` §C FUSION-OS-11。

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
| **P0-1 FEC V2 mandatory** | `src/falsifiability/contracts.ts`、`schema/migrations/0005_falsifiability_contracts.sql`、`src/fec/orchestrator.ts` | 每个 `fecAppendClaim` 必须有 frozen FEC；FEC 含 measurable implication / dataset binding / metric / threshold / direction / alpha / multiple-testing plan / seed / scope；缺失 FEC 不允许输出 `CONFIRMED`/`REFUTED`，只能进入 `UNTESTED` 或 fail-closed |
| **P0-2 Deterministic verdict kernel** | `src/falsifiability/verdict.ts`、`src/fec/verdict_stage.ts`、`src/proof_envelope/sealer.ts` | verdict 不依赖 LLM 字面标签；每次输出 rule trace；五值优先级稳定；golden vectors 覆盖 support / refute / mixed / missing / scope narrower / tampered plan |
| **P0-3 ProofEnvelope V2** | `src/proof_envelope/types.ts`、`src/proof_envelope/validator.ts`、`src/proof_envelope/proof_hash.ts` | proofHash 绑定 FEC / dataset binding / workflow binding / statistical plan / evidence IDs / verdict trace / ledger root；相同 sealed envelope 在 TS/Python/browser 中 hash 一致；改任一关键字段 → verify fail |
| **P0-4 `far verify`** | `src/cli/far.ts`、`repro/far_chain_repro/verify_chain.py`、browser verifier 入口 | `far verify receipt.json` 可在 clean checkout 中运行；输出 five-value verdict / proof head / tamper status / scope status / independent recomputation status；Windows / 空格 / 离线路径都可演示 |
| **P0-5 Anti-theater harness** | 现有 anti-theater guard、新增 attack corpus、CI smoke | 至少覆盖 label-only evidence / post-hoc threshold / dataset drift / scope laundering / missing raw artifact / LLM reviewer override；每个 attack 有 expected verdict 或 expected fail reason；demo 中展示至少三个失败样例 |

> **实时接线延伸（DESIGN_PROPOSED·FUSION-OS-1）**：P0-5 覆盖离线 attack corpus + CI smoke；但运行时 verdict 路径当前 `orchestrator.ts:199` 硬编码 `antiTheaterFindings:[]`，20 个检测器（`src/anti_theater/lint.ts`）仅 `verify.ts:412` 离线调用——实时 verdict 不消费检测器输出。FUSION-OS-1 把 `runAntiTheaterLint` 注入 `buildVerdictKernelInput`，闭合 R-anti-theater-fail / seed-cherry / R8-warn 实时路径（当前最大活体缺口，最高杠杆）。接线表见 `DEPTH_LEDGER.md` §C FUSION-OS-1。

### 直接给工程团队的实施顺序（来自设计阶段完成判定）

1. 固化 `FEC_V2_SCHEMA` 和 migration。
2. 把 `fecAppendClaim` 改成 contract-required path。
3. 把 `decideVerdict` 改成 metric-first deterministic kernel。
4. 生成 `verdictTrace` 并写入 ProofEnvelope。
5. 扩展 proofHash canonical input（白名单见 `APPENDIX_C` §2.2）。
6. 增加 Python proofHash verifier。
7. 增加 browser ProofEnvelope verifier。
8. 实现 `far verify`。
9. 接入 10 个 golden vectors。
10. 接入 6 个 anti-theater attack cases。
11. 生成一个 demo receipt。
12. 用 clean clone 跑验收脚本。

开发接手时先读 [10_DEV_ENTRYPOINT.md](10_DEV_ENTRYPOINT.md)。

### V2 / V3 分界（避免把路线写成当前完成）

| 必须在 V2 完成 | 才考虑 V3 |
|---|---|
| FEC V2 | Rust/Go/WASM full verifier |
| deterministic verdict kernel | external transparency log |
| ProofEnvelope V2 | full formal specification（TLA+/Dafny 路线） |
| `far verify` | FAR-Level 4 supply-chain profile |
| Python/browser independent recomputation | large public benchmark expansion |
| FAR-Bench125 | third-party verifier ecosystem |
| demo receipt | |
| anti-theater attack corpus | |

---

## 当前代码现实与设计下一步

> 状态纪律：本表为"现状 → 设计后下一步"映射，所有能力状态以代码为准（PARTIAL 表示有局部实现未闭环）。具体测试数 / 文件数 / CI 通过率 / commit 由 `far status --json` 实测回填，本 README 不手填裸数字。

| 能力 | 当前现实（状态） | 设计后的下一步 |
|---|---|---|
| FEC | 已有 optional contract 与 append-only 表（`PARTIAL`） | 升级为 mandatory FEC V2，绑定 statistical plan 和 evidence requirements |
| Five-value verdict | 已有 pure verdict function（`PARTIAL`） | 改成 metric-first deterministic kernel，输出 rule trace 和 reason codes |
| Evidence log | 有 chain hash、Merkle、TS/Python/browser 局部验证（`PARTIAL`） | 将 payload/evidence/verdict 纳入 canonical proof binding |
| ProofEnvelope | 有 V1 self-check 和 proofHash（`PARTIAL`） | 增加 SciIR fields、claim graph、cross-language proofHash（V2） |
| CLI | 核心 11 子命令已落地（`IMPLEMENTED_VERIFIED`·见 05 §9.2）：status / verify / verify-golden / export receipt / export far-proof / bench run / fec compile / fec freeze / fsm advance / demo / api | 继续收紧 fresh-clone 留证与完整 demo receipt；`far ask/repl/stream`、`packages/cli` 仍为产品路线图 |
| Browser verifier | Merkle/Suite + standalone ProofEnvelope V2 proofHash verifier 已有（`IMPLEMENTED_VERIFIED`） | 增加 verdict trace viewer；raw evidence / RO-Crate 外部认证不在当前浏览器路径内 |
| Python verifier | chain/Merkle + ProofEnvelope V2 proofHash verifier 已有（`IMPLEMENTED_VERIFIED`） | 增加完整 verdict trace 重放与更多 golden vectors |
| AI evidence path | LLM label 可进入 verdict（`PARTIAL`） | 改为 metric-first，LLM 只能辅助解释和候选生成 |
| canonicalHash（四字段白名单） | TS/Python byte-equal `IMPLEMENTED_VERIFIED` | 维持；浮点科学计数法鸿沟按 NUMERIC_KNOWN_DIVERGENCE 诚实归 RED，V3 迁 RFC 8785 JCS |
| Anti-theater 实时接线（FUSION-OS-1） | 20 个检测器仅 `verify.ts:412` 离线调，运行时 `orchestrator.ts:199` 硬编码 `antiTheaterFindings:[]`（`PARTIAL`·当前最大活体缺口） | `runAntiTheaterLint` 注入 `buildVerdictKernelInput`，闭合 R-anti-theater-fail / seed-cherry / R8-warn 实时路径（Open Science fail-closed 服务门范式） |

---

## 三个统一卖点（设计阶段已收敛）

| 卖点 | 一句话 |
|---|---|
| **第一卖点：Your Laptop Is The Verifier** | 评委不需要信任主办方后端或参赛者演示机，而是在自己的机器上重算 proof head、Merkle inclusion、verdict trace 和 integrity status |
| **第二卖点：五值 anti-theater verdict** | 系统不把所有失败挤成"失败"或"通过"，而是区分 `CONFIRMED` / `REFUTED` / `INCONCLUSIVE` / `DEGRADED_SCOPE` / `UNTESTED` |
| **第三卖点：platform-independent trust receipt** | ProofEnvelope 把 claim、evidence、FEC、statistical plan、workflow run、dataset binding、verdict trace 和 dependency graph 绑定成可转交对象 |

---

## 竞赛与参赛合规事实底座（自包含并入）

> 本节并入 `FINAL_PACKAGE/01_PROJECT_FACTS` 的赛事合规事实（旧 §1 来源已归档，备份见 §归档声明）。外部事实（snapshot 维护期、外部竞品发布时间）标 `NEEDS_EXTERNAL_VERIFICATION`。

| 维度 | 口径 | 状态 |
|---|---|---|
| 赛事编号 | XH-202619 | NEEDS_EXTERNAL_VERIFICATION（赛前核实） |
| 赛事全称 | 《基于国产开源大模型的 AI Scientist 的研发与应用》 | NEEDS_EXTERNAL_VERIFICATION |
| 锁定方向 | 方向一A：科学问题的假设生成（非 1B 数据分析） | DESIGN_LOCKED |
| 评分三维 | 科学价值 40 / 技术深度 30 / 应用潜力 30 | NEEDS_EXTERNAL_VERIFICATION（赛前核实评分单） |
| 参赛 profile | `competition_aliyun_qwen`（锁 Qwen + 百炼/DashScope） | DESIGN_LOCKED |
| 参赛基座快照 | `COMPETITION_MODEL_SNAPSHOT` 固定值以 `snapshot.ts` 为权威，**无百炼官方维护期承诺**；竞赛周 day-0 须用 GET /v1/models 实测复核 | NEEDS_EXTERNAL_VERIFICATION（day-0 实测） |
| 百炼 base_url | `https://dashscope.aliyuncs.com/compatible-mode/v1`（OpenAI-compatible） | NEEDS_EXTERNAL_VERIFICATION |
| Qwen 家族白名单 / FallbackChain | 字段与取值以 `02_ARCHITECTURE` §provider 为权威；禁越 Qwen 家族 | DESIGN_LOCKED |
| 结构化安全模型 | `STRUCTURED_SAFE_MODEL` 非 thinking 钉版本，字段以代码为权威 | DESIGN_LOCKED |

> **Day-1 实测项**（不能由 LLM 代办，标 `NEEDS_REAL_ENV` / `NEEDS_REAL_TEST` / `NEEDS_HUMAN_OPERATION`）：snapshot liveness（GET /v1/models）、dashscopeRequestId 字段名（curl -i）、addCycleGuard 钻石拓扑防环、golden_vectors 双向生成回填、threadpool_info() CI 可观测性、competition_qwen_smoke 真实计费调用 + 控制台截图。具体清单与状态以 `10_DEV_ENTRYPOINT` 为准。

---

## 五张核心表（数据契约，设计冻结）

> 本节并入 `FINAL_PACKAGE/01_PROJECT_FACTS` §2.3 的数据契约事实底座。完整 DDL 以 `<REPOSITORY_ROOT>/schema/migrations/` 为权威；本表仅作导航。

| 表 | 主键策略 | 性质 | 状态 |
|---|---|---|---|
| `call_records` | seq AUTOINCREMENT | append-only 链式 hash 日志（2 trigger 守卫 no_update/no_delete） | DESIGN_LOCKED |
| `evidence_log` | ULID TEXT | call_records 转写层 | DESIGN_LOCKED |
| `verdict_nodes` | ULID TEXT | append-mostly（仅 verdict/metric_value/updated_at 可变，4 trigger） | DESIGN_LOCKED |
| `evidence_edges` | ULID TEXT | DAG 边（方案 B 应用层 `addCycleGuard` + `SQL_HAS_PATH`，禁方案 A trigger 嵌 CTE） | DESIGN_LOCKED |
| `repro_runs` | ULID TEXT | append-only 复现记录 | DESIGN_LOCKED |

**migration 编号体系**：0001-0008 已锁死（禁 ADD COLUMN，除 `verdict_nodes` 经 Ask 裁决的 `uq_grade` / `repro_certificate_id` / `sensitivity_envelope_id` 例外 C29）；0009-0011 已锁或设计冻结；0012-0015（ProbeAtlas / UQ-Witness / FAR-Bench / multimodal）为设计草案，部分待 Ask 确认。migration 必须可逆（up + down），禁 DROP TABLE 无 down，禁破坏 append-only。

> FEC **不新增任何表 / hash / 枚举**，只新增编排协议层（复用 0001 五表 + repro 链，C18）。

> **内容寻址 blob CAS 候选（DESIGN_PROPOSED·FUSION-OS-9）**：未来新增 `far_blob_store(hash PK)` CAS 表，evidence / FEC Plan / kernel trace 按 hash 引用去重（Open Science `content_snapshots` 范式）；新 migration 避开 0013-0015（ProbeAtlas / UQ-Witness / FAR-Bench / multimodal）草案编号。接线表见 `DEPTH_LEDGER.md` §C FUSION-OS-9。

---

## 禁用词与诚实红线（口径收束）

> 完整禁用词表与改写对照见 `07_RISK_REGISTER_AND_DO_NOT_CLAIM` 与 `APPENDIX_F_GLOSSARY` §6。本 README 仅列最高频红线，作为导航。

**核心禁用词**（仅可在"禁用 / 历史 / 修正"语境显式标注后出现）：

- 证明科学真理 / 物理不可篡改 / 完全可复现 / 全自动科学家 / 通用 AI4S benchmark 或排行榜；
- `far-chain/`（作为真实实现路径）—— 一律写 `<REPOSITORY_ROOT>/`；
- 最新 / 第一 / 唯一（无来源支撑时）。

**最高频改写**：

| 禁用 | 改写 |
|---|---|
| 物理拦截 / 物理隔离 / 物理不可篡改 | DB 层 append-only **tamper-evident**（链头 hash 变化可检测）；trigger 防 UPDATE/DELETE 但 DROP TRIGGER 可绕过，靠 external anchor 兜底，**非 tamper-proof** |
| 完全可复现 | 可独立重算特定 proof input（independently re-computable） |
| 跨语言字节相等已实证 LIVE（无 hedge） | 四字段白名单 + 数值类已实证；已知 `1e-7` 科学计数法鸿沟（TS→`1e-7` / Py→`1e-07`）诚实披露 |
| 据我们所知首个（无查新） | "据我们所知首个" + D1/D2/D3 + 查新；未查新前标 `UNVERIFIED_PRIOR_ART` |
| 第三方验证生态已完成 / .far-proof 已通过 IETF 官方认证 | P0 independent recomputation；第三方生态是 V2/V3；IETF VAP 是进行中草案非 RFC |

**DO_NOT_CLAIM 7 条**（绝对禁称已实现，`02` §7.1）：完全自动发现新天文规律；已实现 eval-ring 物理隔离；FAR-Bench 是通用 benchmark；LLM 可作最终科学裁判；证明科学结论绝对为真；全流程绝对无人参与；无真实百炼调用也声称参赛 profile 已闭环。

**不允许假绿 6 条**（`02` §7.2）：纯 fixture mock 代替真实 appendRecord；未真实跑百炼却声称 request_id 已验证；未导出 proof 却显示 passed；LLM 自评代替 verdict protocol；图表无数据绑定；source_anchor 指向不可访问来源。

**LLM 使用边界**（`07` §4）：允许生成候选 claim / 辅助 FEC 草案 / 解释 verdict / 生成报告 / 生成形式化证明草稿；**禁止**直接输出最终 verdict、覆盖 deterministic kernel、隐藏 protocol deviation、在 proofHash 外悄悄改 evidence、把自然语言 reviewer 当独立真相源、自动把 `UNTESTED` 改成 `CONFIRMED`。

---

## W0 硬门纪律（自包含并入）

> 本节并入 `FINAL_PACKAGE/56_SOURCE_OF_TRUTH_RECONCILIATION` 的 W0 硬门纪律。这是 V2.1 升级的前置硬门（未过则 W1-W5 不启动）。

### 为什么是 W0 硬门

文档系统曾存在三方数字漂移（测试计数 `1038/662/546/1092`）、`far-chain/` 子目录路径虚构、`golden_vectors` 的 `96a6372bdf04…` 被误当根哈希、`5 值 vs 6 值` 笔误。**这是诚信红线**——而诚信本身是反-theater 项目的护城河，自毁即出局。如果文档里路径虚构、数字漂移、commit 不存在，评委照文档跑会直接失败——FI-9（第三方验证器）再完美也被路径级崩溃拖垮。

### status-dump CLI（唯一 SSOT 数字源，禁手填）

```bash
far status              # 实测生成单一 SSOT 状态报告
far status --json       # 机器可读，供文档构建时回填占位符
```

输出字段（全部从 `git HEAD` 实测，零手填）：`testCount` / `tsFileCount` / `migrationCount` / `goldenVectorCount` / `coverageLine` / `coverageBranch` / `suiteIntegrityRoot` / `docCount` / `commitSha`。CI 在文档构建阶段跑 `far status --json`，把占位符替换为实测值。**禁手填数字**——这是 W0 验收门的 grep 校验项。

### 关键订正（已生效）

| 原口径（overclaim / stale） | 订正口径 |
|---|---|
| `1038/662/546/1092 tests` | `<TEST_COUNT_FROM_STATUS_DUMP>` |
| `far-chain/` 子目录 | `<REPOSITORY_ROOT>/`（工作区根即实现仓） |
| `96a6372bdf04 是根哈希` | `REPRO_CONTEXT_FIXTURE` 单向量 expectedHex（非 merkle 根，非 proofHash） |
| `物理拦截` / `物理隔离` / `物理不可篡改` | DB 层 append-only tamper-evident；trigger 防 UPDATE/DELETE 但 DROP TRIGGER 可绕过，靠 external anchor 兜底为 tamper-evident 非 tamper-proof |
| `跨语言字节相等已实证 LIVE` | 4 字段白名单 + 数值类已实证；已知 `1e-7` 科学计数法鸿沟诚实披露 |
| `据我们所知首个`（裸） | "据我们所知首个" + D1/D2/D3 + 查新（`UNVERIFIED_PRIOR_ART` 查新前） |
| `.far-proof 第三方独立验证` | 路径 A（过 RO-Crate 校验）或 路径 B（项目自验证离线重算包，V1 minimal） |
| `形式化证明 / 全系统形式化` | 局部形式化锚点（一处可机械验证的核心不变式），非全系统形式化 |
| 历史 `9f1d2f0c…0000` golden 占位值 | RETIRED，被真实 `96a6372bdf04…af4abf4` 取代 |
| 历史 4 值 verdict | 5 值 verdict（+ `UNTESTED`） |

### 红队风险登记（节选 · 完整见 `07` 与 `56` §6）

| ID | 风险 | 严重度 | 缓解 |
|---|---|---|---|
| RR-1 | 数字/路径/反向 over-claim 漂移在交付前未消解 → fresh-clone 路径级崩溃 | CRITICAL | W0 硬门：status-dump CLI + 全文档订正 |
| RR-2 | `.far-proof` 自验证冒充第三方验证 → 击穿 proof-carrying 卖点 | CRITICAL | 路径 A/B 二选一前置 |
| RR-3 | Right-to-History 同构 → "首个"崩塌，一票否决 | HIGH | 查新第一优先；PDF 第 1 页钉死 D1/D2/D3 |
| RR-5 | WASM `1e-7` 鸿沟现场暴露 → 跨语言字节相等亮点崩塌 | HIGH | 把鸿沟做成 demo 卖点（现场 diff），不掩盖 |
| RR-7 | snapshot 下线风险（无官方维护期承诺）→ demo 崩 | HIGH | day-0 实测 GET /v1/models 复核；demo 兜底走 `offline_replay` profile；FallbackChain 接线 |

---

## FINAL_PACKAGE 归档声明（自包含纪律）

> 本节满足"FINAL_PACKAGE 即将被删除，禁止写'详见 FINAL_PACKAGE/X'作为有效依赖"的自包含铁律。

**物理档案状态**：`FINAL_PACKAGE/`（旧 `00`-`86` + `_digest`）是**已归档历史口径**，物理档案已退役。离线完整备份位于 `C:/Users/RichardYuan/FAR-Lab_Backups/`。

**本 README 的自包含声明**：

- 本 README 所有内容已**完整并入** PROJECT_PLAN（不再依赖 FINAL_PACKAGE 作为有效事实源）；
- 本 README 中引用的 `00`、`01`、`02`、`03`、`04`、`05`、`07`、`08`、`09`、`10` 等 PROJECT_PLAN 编号是**当前有效章节**；引用的 `44`、`56`、`76` 等 FINAL_PACKAGE 编号仅作**来源溯源**（`08_TRACEABILITY_MATRIX.md` 旧编号 → 新位置映射），**不作为有效依赖**；
- 任何"详见 FINAL_PACKAGE/X"在本 README 中均已被改写为：要么内容完整并入本节/对应章节，要么显式标注为"已归档历史口径·备份在 `C:/Users/RichardYuan/FAR-Lab_Backups/`"；
- 若读者需要查阅 FINAL_PACKAGE 原文做历史溯源，路径是 `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/`。

**本次合并来源溯源**（旧 FINAL_PACKAGE 来源 → 并入位置）：

| 本次并入内容 | 旧 FINAL_PACKAGE 来源（已归档） | 并入方式 |
|---|---|---|
| 一句话定义、最终命名、五值裁决、最高设计原则 | 现有 PROJECT_PLAN/README.md（保留脊柱） | 保留并精确化 |
| 赛事与参赛合规事实底座、五张核心表事实 | `01_PROJECT_FACTS` §1-§2 | 完整并入（§竞赛与参赛合规、§五张核心表） |
| 当前代码现实与设计下一步、P0 工程闭环工程入口、V2/V3 分界、三个统一卖点 | `76_DESIGN_PHASE_COMPLETION_VERDICT` §4-§6 | 完整并入（§当前代码现实、§P0 工程闭环） |
| W0 硬门纪律、status-dump CLI、关键订正清单、红队风险登记 | `56_SOURCE_OF_TRUTH_RECONCILIATION` §1-§7 | 完整并入（§W0 硬门纪律） |
| 文档包导航与阅读顺序 | `00_WORKSPACE_MAP` §5、§9 | 简化为本 README 的文档索引与阅读顺序 |
| 禁用词、DO_NOT_CLAIM、假绿 6 条、LLM 使用边界 | `02_CONSTRAINTS_AND_RED_LINES` §7 + `56` §4-§5 | 收束为§禁用词与诚实红线（完整版在 `07` 与 `APPENDIX_F` §6） |

> **08 追踪矩阵**保留旧 `00`-`86` 编号 → 新 SSOT 位置的映射，作为**来源溯源**（非有效依赖）；物理档案已退役，备份位置 `C:/Users/RichardYuan/FAR-Lab_Backups/`。

---

## 路径约定（权威见 `APPENDIX_F` §7）

所有工程路径以 `<REPOSITORY_ROOT>/` 开头。`<REPOSITORY_ROOT>` 即**工作区根目录**（包含 `src/` `schema/` `frontend/` `tests/` `golden_vectors/` 的目录），**不是** `far-chain/` 子目录。

标准路径表（节选，完整见 `APPENDIX_F_GLOSSARY.md` §7.2）：

| 约定 | 含义 |
|---|---|
| `<REPOSITORY_ROOT>/src` | TypeScript / 核心实现 |
| `<REPOSITORY_ROOT>/tests` | 测试 |
| `<REPOSITORY_ROOT>/schema` | 数据库 schema 和 migration |
| `<REPOSITORY_ROOT>/schema/migrations` | SQL migration（0001-0008 已锁，0009+ 走独立 migration） |
| `<REPOSITORY_ROOT>/frontend` | 前端或 browser verifier 相关资产 |
| `<REPOSITORY_ROOT>/repro` | Python 或其他复核实现 |
| `<REPOSITORY_ROOT>/repro/far_chain_repro` | Python canonical_hash / verify_chain 等确定性复核 |
| `<REPOSITORY_ROOT>/golden_vectors` | golden vectors |
| `<REPOSITORY_ROOT>/PROJECT_PLAN` | 最终规划和执行口径（P0 文档源） |
| `<REPOSITORY_ROOT>/PROJECT_PLAN/APPENDIX_A_TYPES.md` | 类型权威附录 |
| `<REPOSITORY_ROOT>/PROJECT_PLAN/APPENDIX_C_CANONICAL.md` | canonical 序列化权威附录 |
| `<REPOSITORY_ROOT>/PROJECT_PLAN/APPENDIX_F_GLOSSARY.md` | 术语语义 / 表述口径权威附录 |
| `<REPOSITORY_ROOT>/FINAL_PACKAGE` | 【已归档历史口径】物理档案已退役，备份在 `C:/Users/RichardYuan/FAR-Lab_Backups/` |

路径纪律：命令示例中**禁止**写 `cd far-chain && pnpm install`——评委照此跑会直接失败（路径级崩溃）；命令一律写 `<REPOSITORY_ROOT>/` 或显式"工作区根即实现仓"；Windows 路径、空格路径、离线目录都必须可运行（`far verify` P0 验收项）。

---

## 文档优先级（P0-P3）

> 与 `01_SOURCE_OF_TRUTH_AND_STATUS.md` §2 一致。冲突时按 P0 → P1 → P2 → P3 处理。

| 优先级 | 来源 | 说明 |
|---|---|---|
| **P0** | 顶层 `PROJECT_PLAN/`（含附录三权威 A/C/F） | 最终规划和执行口径 |
| **P1** | 可执行状态命令（`far status --json`）、CI、测试输出 | 实现状态与数量的唯一事实源 |
| **P2** | 当前代码（`<REPOSITORY_ROOT>/src` 等） | 接口和能力以实际代码为准 |
| **P3** | 旧 `00`-`86` 与 `_digest`（已归档至 `C:/Users/RichardYuan/FAR-Lab_Backups/`） | 历史来源，不直接覆盖 P0/P1/P2 |

**冲突裁决规则**：

- 若 P0 与代码现实（P2）冲突 → **开修订项**（`09_GAP_CLOSURE_LOG.md`），**不是**用旧文档覆盖代码；
- 若 P0 内部三附录冲突 → 类型字段以 A 为准、canonical 字节规则以 C 为准、术语语义以 F 为准；
- 若 P0 与 P3 冲突 → P0 胜，P3 仅作来源溯源（`08_TRACEABILITY_MATRIX.md` 保留旧编号 → 新位置映射）。

---

## 术语使用检查表（发布前过一遍）

每次更新 README / PPT / 答辩稿 / 报告前，必须检查（完整版见 `APPENDIX_F_GLOSSARY.md` §10）：

- [ ] 是否用了主名（最终命名表），未用弃用名；
- [ ] verdict 是否只用 5 值（§五值裁决 enum），无第六值；
- [ ] 是否出现禁用词（D1-D15 / V2-1 至 V2-10 / DO_NOT_CLAIM 7 条 / 假绿 6 条）；
- [ ] 是否手填裸数字（测试数 / 文件数 / CI 通过率 / benchmark 数 / commit / 竞品时间）——应来自 `far status --json`；
- [ ] 路径是否写 `<REPOSITORY_ROOT>/`，未写 `far-chain/`（作为真实实现根）；
- [ ] 是否把"可验证"读成"证明为真"；
- [ ] 是否暗示 FAR 取代同行评审；
- [ ] 是否把 hash 说成物理安全（应 tamper-evident 非 tamper-proof）；
- [ ] 是否声称所有 verification 已跨语言完成（应四字段白名单 + 数值类已实证，浮点鸿沟诚实披露）；
- [ ] 是否把 LLM reviewer 当 final judge；
- [ ] 是否把 V3 路线（Rust/Go/WASM full verifier / external transparency log / full formal specification / FAR-Level 4 supply-chain profile / large public benchmark / third-party verifier ecosystem）写成当前完成；
- [ ] 是否写入真实个人路径、用户名、邮箱、密钥或本机信息（守 S1 / 隐私门）；
- [ ] 是否每个能力都带了状态标签，未混写"已实现"和"应实现"；
- [ ] 是否把 `.far-proof` 自验证冒充第三方验证（RR-2）；
- [ ] 是否引用未复核外部事实（应标 `NEEDS_EXTERNAL_VERIFICATION`）；
- [ ] 是否遗漏 Trust Receipt 的 `limitations` 段。
