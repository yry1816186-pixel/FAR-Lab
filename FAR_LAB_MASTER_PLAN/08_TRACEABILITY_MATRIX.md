# 08 旧文档追踪矩阵

本文件说明旧 `00`-`86` 如何被本 SSOT 吸收、修正或废弃，并注明物理档案已退役、备份位置。它是**来源溯源**文档，不是有效事实源——所有有效口径以 `01_SOURCE_OF_TRUTH_AND_STATUS.md`（P0）和 `APPENDIX_A_TYPES.md` / `APPENDIX_C_CANONICAL.md` / `APPENDIX_F_GLOSSARY.md`（附录三权威）为准。

> 物理档案状态：`FINAL_PACKAGE/`（旧 `00`-`86` + `_digest/`）是**已归档历史口径**，物理档案已退役。离线完整备份位于 `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/`。本文件中出现的旧编号（`02` / `56` / `59` / `67` / `76` 等）仅作来源溯源，不作为有效依赖——其内容已完整并入 `FAR_LAB_MASTER_PLAN/` 顶层或对应附录。

---

## 0. 读取约定与状态纪律

### 0.1 文档优先级（与 `01` §2、`APPENDIX_F` §8 一致）

| 优先级 | 来源 | 角色 |
|---|---|---|
| **P0** | 顶层 `FAR_LAB_MASTER_PLAN/`（含附录 A/C/F 三权威与本文件） | 最终规划和执行口径 |
| **P1** | `far status --json`、CI、测试输出 | 实现状态与数量的唯一事实源 |
| **P2** | 当前代码（`<REPOSITORY_ROOT>/src` 等） | 接口和能力以实际代码为准 |
| **P3** | 旧 `00`-`86` 与 `_digest/`（物理档案已退役，备份 `C:/Users/RichardYuan/FAR-Lab_Backups/`） | 历史来源，不直接覆盖 P0/P1/P2 |

冲突裁决：

- 若 P0 与代码现实（P2）冲突 → 开修订项（`09_GAP_CLOSURE_LOG.md`），**不**用旧文档覆盖代码；
- 若 P0 与 P3 冲突 → P0 胜，P3 仅作来源溯源（本文件保留旧编号 → 新位置映射）；
- 若 P0 内部三附录冲突 → 类型字段以 `APPENDIX_A_TYPES.md` 为准、canonical 字节规则以 `APPENDIX_C_CANONICAL.md` 为准、术语语义以 `APPENDIX_F_GLOSSARY.md` 为准。

### 0.2 状态标签（与 `01` §3、`APPENDIX_F` §5 一致）

本文件所有吸收/降级/废弃条目必须标注状态标签，禁止"已实现"与"应实现"混写：

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

### 0.3 禁止手填裸统计（与 `01` §4、`56` §3、`APPENDIX_F` §5.2 一致）

本文件**不得手填**测试数 / TS/Python 文件数 / CI 通过率 / benchmark 数 / commit / 外部竞品发布时间。这些必须来自：

1. `far status --json`（唯一 SSOT 数字源）；
2. CI 输出；
3. `git rev-parse HEAD`；
4. 可复核脚本；
5. 答辩前重新检索的外部来源。

status 工具尚未覆盖的字段，写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`。

### 0.4 `far status` CLI 规格摘要（唯一 SSOT 数字源 · 禁手填 · 来自 `56` §3）

```bash
far status              # 实测生成单一 SSOT 状态报告（人类可读）
far status --json       # 机器可读，供文档构建时回填占位符
```

输出字段（全部从 `git HEAD` 实测，零手填）：

| 字段 | 来源 | 用途 |
|---|---|---|
| `testCount` | `pnpm test` 实跑 pass 数 | 替换全文档 `<TEST_COUNT_FROM_STATUS_DUMP>` |
| `tsFileCount` | `glob src/**/*.ts` | 替换"137/145 TS 文件"漂移 |
| `migrationCount` | `glob schema/migrations/*.sql` | 替换"0001-0008 vs 0018/0026"矛盾 |
| `goldenVectorCount` | 读 `golden_vectors.json` | 替换"8/9/10 向量"漂移 |
| `coverageLine` / `coverageBranch` | `pnpm coverage` 实跑 | 替换"92.80% / 79.56%"漂移 |
| `suiteIntegrityRoot` | 实跑 `runBenchmark` | 替换 golden 根声称 |
| `docCount` | `glob FINAL_PACKAGE/*.md`（归档前）/ `FAR_LAB_MASTER_PLAN/*.md`（归档后） | 替换"32/39/43 份"漂移 |
| `commitSha` | `git rev-parse HEAD`（若存在） | 替换旧 commit 引用 |

> **构建时回填**：CI 在文档构建阶段跑 `far status --json`，把占位符替换为实测值。**禁手填数字**——这是 W0 验收门的 grep 校验项。

---

## 1. 最高权重来源

旧文档 → 新位置映射。下列旧编号作为**来源溯源**保留；其物理档案随 `FINAL_PACKAGE/` 退役，备份在 `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/`。

| 旧文档 | 吸收内容 | 新位置 | 状态 |
|---|---|---|---|
| `02_CONSTRAINTS_AND_RED_LINES.md` | 红线、五值、反剧场、LLM 边界 | `07_RISK_REGISTER_AND_DO_NOT_CLAIM.md`、`APPENDIX_F` §3/§6 | 完整并入 |
| `56_SOURCE_OF_TRUTH_RECONCILIATION.md` | 路径 SSOT、状态事实源、手填数字问题、status-dump CLI 规格、DO_NOT_CLAIM V2 | `01_SOURCE_OF_TRUTH_AND_STATUS.md`、本文件 §0/§4 | 完整并入 |
| `59_ADVERSARIAL_AUDIT_VERDICT_AND_CORRECTIONS.md` | 6 个存活致命盲点、诚实边界、降级策略、4 项设计决策、7 类措辞订正 | `07_RISK_REGISTER_AND_DO_NOT_CLAIM.md`、本文件 §2/§6 | 完整并入 |
| `60_ULTIMATE_OPTIMIZATION_MASTER_PLAN.md` | Your Laptop Is The Verifier 主线 | `05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md` | 完整并入 |
| `67_DETERMINISTIC_FIVE_VALUE_VERDICT_ENGINE.md` | 五值裁决内核、规则优先级、rule trace、reason codes | `03_EVIDENCE_CONTRACT_AND_VERDICT.md` §5/§6/§7、`APPENDIX_A` §5、`APPENDIX_C` §6 | 完整并入 |
| `69_INDEPENDENT_RECOMPUTATION_VERIFIER_ARCHITECTURE.md` | 独立重算架构、CLI/Python/Rust-Go-WASM verifier 分层 | `04_PROOF_ENVELOPE_AND_VERIFIER.md` | 完整并入 |
| `70_PROOF_ENVELOPE_COMPOSABILITY_AND_CLAIM_GRAPH.md` | ProofEnvelope V2 和 claim graph、aggregate verdict | `04_PROOF_ENVELOPE_AND_VERIFIER.md`、本文件 §3（claim graph 降级 V2） | 完整并入 |
| `75_ENGINEERING_IMPLEMENTATION_BLUEPRINT.md` | 模块、接口、状态机、错误模型、验收清单 | `02_ARCHITECTURE.md`、`06_ROADMAP_AND_DOD.md` | 完整并入 |
| `76_DESIGN_PHASE_COMPLETION_VERDICT.md` | 设计完成判定、P0 工程入口（P0-1 到 P0-5）、V2/V3 分界、反幻觉清单 | 全部 SSOT、`06_ROADMAP_AND_DOD.md`、本文件 §5 | 完整并入 |
| `83_FORMAL_SPECIFICATION_AND_VERDICT_INVARIANTS.md` | invariant 和 formal route | V3 路线（本文件 §3） | 降级为 V3 |
| `86_FINAL_NATIONAL_GRAND_PRIZE_ARGUMENT.md` | 最终总论证、诚实边界 | `00_PROJECT_BRIEF.md`、`05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md` | 完整并入 |

> 编号订正说明（来自 `59` 顶部）：`59_ADVERSARIAL_AUDIT_VERDICT_AND_CORRECTIONS.md` 原占 58 号槽位，与 `43` §3 文档地图预定的 `58 = 前端反 AIslop 纪律` 编号碰撞。按 SSOT 纪律让出 58，本册改 59 号。**58 唯一指前端反 AIslop，59 唯一指本订正纲领**。

---

## 2. 被修正的旧口径

下列旧口径在 `FINAL_PACKAGE` 中曾作为有效结论出现，现 `RETIRED` 或订正。仅作溯源与防回归，不得作为有效口径。修正依据主要为 `56` §2/§4 与 `59` §2/§6 主 agent 代码层交叉核实。

### 2.1 路径与命名修正

| 旧口径 | 新口径 | 原因 | 修正来源 |
|---|---|---|---|
| `far-chain/` 是真实实现子目录 | `<REPOSITORY_ROOT>/` 是当前实现根（工作区根即实现仓） | 当前仓库结构不匹配；旧文档 `far-chain/` 路径出现约 146 处（`56` §2.2 实测，数字随 W0 订正递减） | `56` §2.2 → `01` §1 / `APPENDIX_F` §7 |
| `packages/` 多包拆分（`packages/cli\|arena\|court\|verifier-protocol`） | `src/` 扁平实现；`packages/` 拆包为 V3 开源路线图 | 实测 `packages/` 不存在，代码在单一 `src/` 扁平结构；真拆 monorepo 增加 fresh-clone 风险 | `59` §3/§5 决策② → `APPENDIX_F` §7.3 |
| FAR-Lab 是最终唯一产品名 | `FAR-Chain` 为系统主名，`真研 FAR-Lab` 为项目集主名 | 兼容后期文档和答辩辨识度；OS 口径过宽 | `76` §3.1 / `APPENDIX_F` §1 |
| 旧"Proof-Carrying AI Scientist OS" / "Proof-Carrying Scientific Agent Operating System" | AI4S claim-level verification layer | OS 口径过宽，已降级为历史灵感 | `APPENDIX_F` §4.1（`RETIRED`） |

### 2.2 卖点与裁决口径修正

| 旧口径 | 新口径 | 原因 | 修正来源 |
|---|---|---|---|
| Auditable / Reproducible 是主卖点 | Tamper-Evident / Independently Re-computable | 避免软词撞车和语义过宽 | `76` §3.3、`APPENDIX_F` §3.7/§3.8 |
| 四值 verdict（`ACCEPTED/REJECTED/DEGRADED/UNTESTED`，2.txt 原始） | 五值 verdict（`CONFIRMED/REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED`） | 五值是最终 SSOT；禁止第六值 | `02` §F2 / T1 → `03` §5、`APPENDIX_A` §0、`APPENDIX_C` §6 |
| 所有层一次性实现 | W0-W5 分阶段依赖实现 | 工程可控 | `76` §5/§6 |
| FAR-Bench 是通用 AI4S 榜单 | FAR-Bench verification protocol / attack corpus（profile_id 永远 `competition_aliyun_qwen`，禁与 CORE-Bench 横向比较） | 避免过度宣称；守 C13 通用 benchmark 红线 | `02` §7.3、`APPENDIX_F` §6.1 D6 |
| Browser verifier 完整第三方验证 | browser verifier 有明确验证范围（L3 Web Crypto，ProofEnvelope V2 proofHash + Merkle/Suite；非第三语言、非 raw evidence verifier） | 避免 same-code 夸大 | `76` §4、`APPENDIX_C` §2.5 |
| offline replay 是生产兜底 | offline replay 是无-key 离线 **demo/test profile**（非生产降级兜底） | 避免误导；FallbackChain 三档全为真实 qwen 模型，无 offline_replay 兜底档 | `59` §6 并行项 / `APPENDIX_F` §4.4 |

### 2.3 物理拦截 / tamper 措辞修正（R6 · W0-3）

| 旧口径 | 新口径 | 原因 | 修正来源 |
|---|---|---|---|
| "物理拦截" / "物理隔离" / "物理不可篡改" / "事后篡改不可行" | "DB 层 append-only **tamper-evident**（链头 hash 变化可检测）；trigger 防 UPDATE/DELETE 但 **DROP TRIGGER 可绕过 DB 层防护**，靠 external anchor（gitCommitSha / crossref DOI）兜底为 tamper-evident **非 tamper-proof**；前置编造由五值裁决 + BreakerProbe 留痕**约束**（非拦截）" | SQLite trigger 技术局限（root 可 DROP）；诚实边界 | `59` §4 critic (c) / `56` §4 R6 → `APPENDIX_C` §11 / `APPENDIX_F` §3.8 |

### 2.4 跨语言字节相等的诚实口径（R7）

| 旧口径 | 新口径 | 原因 | 修正来源 |
|---|---|---|---|
| "跨语言字节相等已实证 LIVE"（全域无 hedge） | "4 字段白名单（`stageId`/`cred`/`payloadKind`/`prevHash`）+ 数值类已实证 byte-equal；**已知 `1e-7` 科学计数法鸿沟**（TS→`1e-7` / Py→`1e-07`）诚实披露，归 `NUMERIC_KNOWN_DIVERGENCE`，待 V3 RFC 8785 JCS 迁移" | 浮点科学计数法零填充跨语言不一致 | `56` §4 R7 → `APPENDIX_C` §8 |

### 2.5 golden vectors 反向 over-claim 修正（R2）

| 旧口径 | 新口径 | 原因 | 修正来源 |
|---|---|---|---|
| `9f1d2f0c…0000` 是 golden 占位值待 E4 回填 | `RETIRED`（W0 FI-10 被真实 `96a6372bdf04…af4abf4` 取代） | 项目已达成真绿，却被自己文档描述为未完成（反向 over-claim） | `56` §2.3 → `APPENDIX_C` §10.2 |
| `96a6372bdf04…af4abf4` 是 merkle 根 / 根哈希 | `REPRO_CONTEXT_FIXTURE` 单向量 expectedHex（**非 merkle 根，非 proofHash，非 suite root**） | `golden_vectors.ts:18` 注释明确；`golden_vectors.json` 无此值 | `56` §2.3 → `APPENDIX_C` §10 / `APPENDIX_F` §2.9 |

### 2.6 commit 引用与文档计数修正

| 旧口径 | 新口径 | 原因 | 修正来源 |
|---|---|---|---|
| 引用 `commit 07a8005` 作为 fresh-clone 复验锚点 | 移除 commit 引用；或待仓库实际有 commit 后由 status-dump 实测回填；fresh-clone 复验锚点改用"status-dump 输出 + golden root 比对" | 仓库早期无 commit，引用无法验证 | `56` §2.5 → `01` §4 |
| 文档计数漂移（"32/39/43 份"） | 由 status-dump 自动生成 `docCount` | 40/41/42 在 39 号审计后补，索引未更新 | `56` §2.6 |
| 测试计数四方漂移（"546/662/1038/1092 tests"，README badge 硬编码 `1038 tests pass / 92.80% coverage`） | 全部替换为 `<TEST_COUNT_FROM_STATUS_DUMP>`，由 `far status --json` 回填 | 实测 `test()/it()` ≈ 769；无单一真源；红队凭空造出第 4 个漂移数字 1092 | `56` §2.1 / `59` §2 HONESTY-A3 → `01` §4 / `APPENDIX_F` §5.2 |

### 2.7 5 值 vs 6 值消歧（已核实部分撤回 · MEDIUM）

| 旧判断 | 新判断 | 原因 | 修正来源 |
|---|---|---|---|
| `33:219` 的"多域扩展 6 值枚举"是 verdict 笔误，须订正为 5 值 | 撤回。`33:219` 的 6 值 = `SciIRDomain` **领域枚举**（6 值：`astronomy\|biology\|medicine\|social_science\|cs\|physics`，含 G5 seismic precursor），**正确·非 verdict 笔误**。verdict 仍是冻结的 5 值（`02` §F2），domain 6 值与 verdict 5 值是两个不同枚举，勿混 | 主 agent 代码层核实 | `56` §2.4 → `APPENDIX_A` §1 Claim.domain / `APPENDIX_F` §4.2 消歧注 |

### 2.8 Core 中立 overclaim 修正（W0-4/W0-5 · 来自 `59` §3）

| 旧口径 | 新口径 | 原因 | 修正来源 |
|---|---|---|---|
| "Core 目录 grep `qwen\|dashscope\|bailian` = 0 命中"（`07` §6.3 C1） | "Core **算法**（canonicalHash / verdict_mapping / appendRecord 的哈希与裁决逻辑）模型中立；但 L0/L2 核心模块含 `competition_aliyun_qwen` profile 钩子（`repository.ts` / `llm_record.ts` / `external_facts.ts`，厂商特定约束分发点，非算法依赖）；`src/fec/` 真零命中" | L0/L2 硬编码 `competition_aliyun_qwen`（含 qwen 子串）；`contracts.ts:13` 注释自称"模型中立:不含 qwen/dashscope 字面量"与同目录代码矛盾 | `59` §3 → 本文件 §6 W0-4/W0-5 |
| `src/falsifiability/contracts.ts:13` 注释"模型中立: 不含 qwen/dashscope/bailian 字面量" | 删除该注释，或改为"本模块（contracts）模型中立；同目录 `external_facts.ts` 含 `competition_aliyun_qwen` profile 钩子（厂商约束分发）" | 注释撒谎（与同目录代码矛盾） | `59` §3 / §6 W0-5 |
| "模型可插拔信任根一字节不改"（灵魂时刻⑥ / `44`/`53`） | "Core 算法模型中立；切换基座须调整 `competition_aliyun_qwen` profile 钩子 + 重算 golden hex，**非零改动**；信任根算法（canonicalHash/verdict）不变 ≠ 行为不变" | 字节不变 ≠ 行为不变（换 DeepSeek 时条件分支不命中，`competitionModelSnapshot` 强制约束失效） | `59` §3 / §6 W0-6 → `APPENDIX_F` §3.7 |

### 2.9 snapshot 维护期修正（W0-2 · Z1-SNAPSHOT）

| 旧口径 | 新口径 | 原因 | 修正来源 |
|---|---|---|---|
| "snapshot 维护期 ~2026-07-08"（V1 文档 01-42 + `_digest/` 系列 10+ 处） | "snapshot 下线风险（`snapshot.ts:19` 团队 2026-06-27 verified_live，**无百炼官方维护期承诺**；须竞赛周 day-0 实测 GET /v1/models 复核）；删去无来源的 07-08 具体日期" | `snapshot.ts` 无 07-08 字面量；`~2026-07-08` 仅团队自写预期，无百炼官方来源；CI `graceful skip`（无 key 返回 exit 0）不算通过 | `59` §2 Z1-SNAPSHOT / §6 W0-2 → `07` 风险登记 |

---

## 3. 保留但降级为 V2/V3 的内容

以下内容方向保留，但实现状态为 `ROADMAP`（V2）或 `RESEARCH`（V3），不作为当前完成能力。V2/V3 分界来自 `76` §6。

### 3.1 V2 必须完成（P0 工程闭环，`76` §6）

| 内容 | V2 目标 | 当前状态 |
|---|---|---|
| FEC V2 mandatory | `fecAppendClaim` 走 contract-required path；每个 claim 必须有 frozen FEC（含 measurable implication、dataset binding、metric、threshold、direction、alpha、multiple-testing plan、seed、scope） | `DESIGN_LOCKED`（V1 = optional contract，`PARTIAL`） |
| deterministic verdict kernel | `decideVerdict` 改成 metric-first，输出 rule trace + reason codes；五值优先级稳定；禁 LLM 直接产出 verdict | `IMPLEMENTED_VERIFIED`（pure verdict function 已覆盖五值但规则浅，缺完整 rule trace）→ 升级 `DESIGN_LOCKED` |
| ProofEnvelope V2 | proofHash 绑定 FEC、dataset binding、workflow binding、statistical plan、evidence IDs、verdict trace、ledger root；TS/Python/browser hash 一致 | `PARTIAL`（V1 有 self-check + proofHash） |
| `far verify` | `far verify --envelope <env.json> [--db <db.sqlite>] [--mode chain\|envelope\|full] [--json] [--explain]` 与 `far verify --bundle <.far-proof> [--mode chain\|envelope\|full] [--json]` 在 clean checkout 中运行；输出 10 字段 schema（status/verdict/proofHash/ledgerRoot/tamperStatus/scopeStatus/recomputation/errors/warnings/verifiedLevels）；Windows/空格/离线路径可演示 | `IMPLEMENTED_VERIFIED`（envelope/chain/full；`--lint-input` 20-detector 重算；`--bundle` V1 minimal 自验证，valid→exit 0/WARN，tampered→exit 7） |
| Python/browser independent recomputation | Python proofHash verifier；browser ProofEnvelope verifier | `IMPLEMENTED_VERIFIED`（Python proof envelope hash 已接入 `far verify`；browser standalone `frontend/public/verify.html` 已重算 ProofEnvelope V2 proofHash） |
| FAR-Bench125 | 125 case benchmark + 评分 + 隐藏集 + 泄漏防御 | `DESIGN_LOCKED` |
| demo receipt | 一个真实 claim 带 FEC V2、evidence、verdict trace、ProofEnvelope V2，被 `far verify` 重算通过 | `PARTIAL`（`far export receipt` 已可从 V2 envelope / V1 `.far-proof` 生成 Trust Receipt；完整 FEC V2 真实 demo claim 仍待闭环） |
| anti-theater attack corpus | 至少覆盖 label-only evidence / post-hoc threshold / dataset drift / scope laundering / missing raw artifact / LLM reviewer override；每个 attack 有 expected verdict 或 expected fail reason | `DESIGN_LOCKED` |

### 3.2 V3 才考虑（`76` §6 / `APPENDIX_F` §10 检查表）

| 内容 | V3 目标 | 当前状态 |
|---|---|---|
| Rust/Go/WASM full verifier | L4 Rust/Go + L6 形式化验证核心 invariant | `ROADMAP`（V2）→ `RESEARCH`（V3 full） |
| full WASM verifier | WASM proofHash 跨语言重算 | `ROADMAP`（V3） |
| external transparency log | 公开 transparency log 作为 external anchor | `ROADMAP`（V3） |
| formal proof of verdict kernel | TLA+/Dafny 全系统形式化；局部 invariant 锚点为 V2 | `RESEARCH`（V3 全系统） |
| FAR-Level 4 supply-chain profile | 映射 SLSA/in-toto/Sigstore/SBOM 到 scientific custody | `ROADMAP`（V3） |
| Model Court / Cross-model reliability court | FI-3 跨模型法庭（满血需真实多模型 + 多 key） | `NEEDS_HUMAN_OPERATION`（多 key 物理约束） |
| public hidden-set leaderboard | 公开隐藏集排行榜 | `ROADMAP`（V3） |
| full claim graph propagation | claim graph 完整传播规则 + aggregate verdict | `ROADMAP`（V2，来自 `70`） |
| large domain pack ecosystem | 大规模 DomainPack 生态 | `ROADMAP`（V3） |
| RFC 8785 JCS 迁移 | 消除浮点科学计数法零填充差异 + emoji/ZWJ/大整数边界 | `ROADMAP`（V3，见 `APPENDIX_C` §8） |

---

## 4. 旧 digest 的吸收方式

`_digest/` 系列是旧 `00`-`86` 的蒸馏摘要，物理档案随 `FINAL_PACKAGE/` 退役，备份在 `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/_digest/`。吸收映射如下（来源溯源，不作有效依赖）。

| Digest | 作用 | 吸收去向 | 状态 |
|---|---|---|---|
| `_digest/digest_C01.md` | Core trust root 和 canonical hash 背景（四字段白名单 byte-equal） | `APPENDIX_C` §3、`APPENDIX_F` §2.8 | 完整并入 |
| `_digest/digest_C02.md` | Agent layer 作为输入来源，不作为 FAR 主体 | `00_PROJECT_BRIEF.md`、`APPENDIX_F` §1.1 | 完整并入 |
| `_digest/digest_C03a.md` | evidence/log/verdict/proof 多数被吸收 | `03`、`04`、`APPENDIX_A` §3-§5 | 完整并入 |
| `_digest/digest_C03b.md` | FEC/FAR-Bench/UQ 保留为设计和路线，去除过度宣称 | `03`、`05`、`06`；过度宣称降级 | 完整并入 |
| `_digest/digest_C04.md` | 工程和 DevOps 风险进入路线图 | `06_ROADMAP_AND_DOD.md`、`07` 风险登记 | 完整并入 |
| `_digest/digest_C05.md` | 规划治理进入 SSOT 规则 | `01`、本文件 §6/§7 | 完整并入 |
| `_digest/digest_HIST.md` | 历史冲突用于废弃旧口径（4 值 verdict、`far-chain/` 路径、OS 口径） | 本文件 §2、`APPENDIX_F` §4（`RETIRED`） | 完整并入 |
| `_digest/digest_KB.md` | 外部研究只作为背景，答辩前需复核 | `05` 竞品定位、`APPENDIX_F` §10 检查表 | 完整并入（标 `NEEDS_EXTERNAL_VERIFICATION`） |
| `_digest/digest_PSI.md` | OS / Proof-Carrying 口径降级为历史灵感 | `APPENDIX_F` §4.1（`RETIRED`） | 完整并入 |

---

## 5. P0 工程入口（来自 `76` §5）

P0 不再写宏大叙事，要把一个 demo claim 从 hypothesis 到 final receipt 全链路跑通。工程入口逐项绑定：

### 5.1 P0-1：FEC V2 mandatory

| 项 | 内容 |
|---|---|
| 工程入口 | `src/falsifiability/contracts.ts`、`schema/migrations/0005_falsifiability_contracts.sql`、`src/fec/orchestrator.ts` |
| 验收 | 每个 `fecAppendClaim` 必须有 frozen FEC；FEC 包含 measurable implication、dataset binding、metric、threshold、direction、alpha、multiple-testing plan、seed、scope；缺失 FEC 不允许输出 `CONFIRMED` 或 `REFUTED`，只能进入 `UNTESTED` 或 fail-closed |
| 状态 | `DESIGN_LOCKED`（V1 = optional contract） |

### 5.2 P0-2：Deterministic verdict kernel

| 项 | 内容 |
|---|---|
| 工程入口 | `src/falsifiability/verdict.ts`、`src/fec/verdict_stage.ts`、`src/proof_envelope/sealer.ts` |
| 验收 | verdict 不再依赖 LLM 字面支持/反对标签；每次 verdict 输出 rule trace；五值优先级稳定（`DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED`）；golden vectors 覆盖 support/refute/mixed/missing/scope narrower/tampered plan |
| 状态 | `IMPLEMENTED_VERIFIED`（pure function）→ 升级中（rule trace 待补） |

### 5.3 P0-3：ProofEnvelope V2

| 项 | 内容 |
|---|---|
| 工程入口 | `src/proof_envelope/types.ts`、`src/proof_envelope/validator.ts`、`src/proof_envelope/proof_hash.ts` |
| 验收 | proofHash 绑定 FEC、dataset binding、workflow binding、statistical plan、evidence IDs、verdict trace、ledger root；相同 sealed envelope 在 TS/Python/browser 中 hash 一致；修改任一关键字段会导致 verify fail |
| 状态 | `PARTIAL`（V1 有 self-check + proofHash） |

### 5.4 P0-4：`far verify`

| 项 | 内容 |
|---|---|
| 工程入口 | `src/cli/far.ts`、`repro/far_chain_repro/verify_chain.py`、browser verifier 入口 |
| 验收 | `far verify receipt.json` 可在 clean checkout 中运行；输出 five-value verdict、proof head、tamper status、scope status、independent recomputation status；Windows 路径、空格路径、离线模式都可演示 |
| 状态 | `IMPLEMENTED_VERIFIED`（`src/cli/commands/verify.ts`·envelope/chain/full + `--lint-input` + `--bundle` V1 minimal；`src/cli/commands/export_receipt.ts`·`far export receipt` Trust Receipt DOC 投影；`src/cli/commands/export_far_proof.ts`·`far export far-proof` V1 self-verifiable bundle/package；`src/cli/commands/bench.ts`·`far bench run` demo benchmark profile）；外部 RO-Crate/PROV-O validator 合规仍 `NEEDS_EXTERNAL_VERIFICATION` / `ROADMAP` |

### 5.5 P0-5：Anti-theater harness

| 项 | 内容 |
|---|---|
| 工程入口 | 现有 anti-theater guard、新增 attack corpus、CI smoke |
| 验收 | 至少覆盖 label-only evidence、post-hoc threshold、dataset drift、scope laundering、missing raw artifact、LLM reviewer override；每个 attack 有 expected verdict 或 expected fail reason；demo 中展示至少三个失败样例 |
| 状态 | `IMPLEMENTED_VERIFIED`（任务 #10 W3.1-W3.5） |
| 落地映射 | `src/anti_theater/`（types/lint/score/constraint + 20 detectors + adapters/kernel_adapter）；21 golden vectors 覆盖全部 20 attackId（`tests/fixtures/anti_theater/golden_vectors.ts`）；5 测试 gate + 2 grep gate（ci-04 `no_llm_final_judge_scan` / ci-at `anti_theater_deterministic_scan`，注册于 `scripts/ci_all.mjs` + `.github/workflows/ci.yml` + `.github/workflows/build-integrity.yml`）；V2 anti-theater trigger（`schema/migrations/0011_anti_theater_trigger_v2.sql`，D10 forward-only）；验收 6 类攻击全覆盖 + 20 attackId 全覆盖；CI 实测 `node scripts/ci_all.mjs` 全绿（827 TS + 110 py tests + Z16 coverage 94.12% line / 82.92% branch） |

> 实施顺序（`76` §7）：① 固化 `FEC_V2_SCHEMA` + migration → ② `fecAppendClaim` 改 contract-required → ③ `decideVerdict` 改 metric-first kernel → ④ 生成 `verdictTrace` 写入 ProofEnvelope → ⑤ 扩展 proofHash canonical input → ⑥ Python proofHash verifier → ⑦ browser ProofEnvelope verifier → ⑧ 实现 `far verify` → ⑨ 接入 golden vectors → ⑩ 接入 anti-theater attack cases → ⑪ 生成 demo receipt → ⑫ clean clone 跑验收脚本。

---

## 6. 6 个存活致命盲点与 7 类措辞订正（来自 `59` §2/§6）

以下经 143-agent 6 维度 × 3 镜头对抗审视 + 主 agent 代码层交叉核实。L0-L3 信任根完好无损（绝非 BLOCKED），但有 6 个存活致命盲点须先做 4 项设计决策 + 7 类措辞订正方可启动 W0。本节是后续所有订正的纲领溯源。

### 6.1 6 个存活致命盲点（全部经主 agent 核实为真 · CRITICAL）

| ID | 盲点 | 核实证据 | 击穿的核心声称 | 处置去向 |
|---|---|---|---|---|
| **NOVELTY-C1** | FI-3 novelty 维度归属自相矛盾（`48` 说 40 分科学价值，`43§4` 计入先进性 30 分列，互斥） | `48:6/14/218` vs `43§4` 评分表 | 先进性/novelty 核心声称 | `59` §5 决策①（锁定先进性 30 分） |
| **NOVELTY-A2** | blindspot typology 五类判据无可复现算法（自然语言，无阈值/伪代码） | `48§3.3` 五类全自然语言；`48§3.1` 现有原语 `verdictAgree`(布尔)+`anchorJaccard`(集合) 无法判定 `citation_split`/`definition_ambiguous` | novelty=0 真解药声称 | `59` §6 并行项（算法化或标超界） |
| **FRESH-A1** | 历史盲点：far CLI + `packages/` + RULE-PE-010 三不存在 → W0/W1/W2 循环依赖 | 已关闭 CLI 与 RULE-PE-010：`src/cli/far.ts` / `src/proof_envelope/v2/validator.ts` / `tests/proof_envelope/v2/validator.10-rules-coverage.test.ts`；`packages/` 仍按 `src/` 扁平决策标 V3 | fresh-clone 可验入口曾为零；当前仍需非项目成员 fresh-clone 留证 | `59` §5 决策②（`src/` 扁平，`packages/` 标 V3） |
| **WOW-A1** | 灵魂时刻④ Arena arbiter + ⑤ npx 入口零代码 = vaporware | `src/` grep arbiter/RefutationPayload 仅命中无关 `math_claim.ts`；`@far-chain/sci` 全仓 0 命中 | 体量与惊艳度（6 灵魂时刻仅 3 个真可演：①③②） | `59` §5 决策③（双轨：最小实现 + mode=vision） |
| **Z1-SNAPSHOT** | snapshot 07-08 时间炸弹 + 代码层查无此日期 + CI graceful skip 不算通过 | `snapshot.ts:19-20` 只有 `[verified_live: ... as of 2026-06-27]`，无 07-08；`~2026-07-08` 仅 `ci/snapshot_liveness_smoke.ts:7`+`docs/DAY1_VERIFICATION.md:38`；无 key 时 graceful skip 返回 exit 0 | proof-carrying 可演示 | 本文件 §2.9（删 07-08 虚构日期） |
| **Z2-BOOTSTRAP** | AI-验证-AI 自举循环信任——`18§8` Q&A 无预案 | `18§8` 11 问逐条读过，最接近"hash能证明结果对吗"答"不证正确"，无一条回答"证据链全是 AI 产物，可信性何来" | 诚实护城河 | `59` §6 W0-7（增补第 12 问） |

> 主 agent 交叉核实新增（`59` §3）：Core 中立 overclaim（`07§6.3` C1 字面为假）、`packages/` 路径虚构（`56§2.2` 漏订正）、灵魂时刻⑥ overclaim（字节不变 ≠ 行为不变）。详见本文件 §2.1/§2.8。

### 6.2 4 项设计/架构决策（`59` §5，主 agent 自主裁定，标 [待用户复核]）

| 决策 | 裁定 | 理由 |
|---|---|---|
| ① novelty 维度归属 | FI-3 命中【先进性 30 分】非科学性 30 分 | 当前 typology 无可复现算法；demo 日真实多模型须多 key 降级为 persona fixture，不构成"科学发现"；先进性维度更可辩护 |
| ② packages/ 边界 | 当前用 `src/` 扁平实现（`src/far_verifier/`、`src/cli/`），`packages/` 标注为 V3 路线图 | 当前代码全在 `src/` 扁平；真拆 monorepo 增 fresh-clone 风险；FI-9 verifier 放 `src/far_verifier/` 同样可达 fresh-clone exit 0 |
| ③ 灵魂时刻④⑤降级 | 双轨——(a) demo-day 前优先最小实现（arbiter.ts 纯函数 + far CLI 最小壳）；(b) ④⑤明示 `mode=vision`（预录屏 + 诚实标注"设计愿景 demo，最小实现进行中"），npx 入口改为"pnpm far verify 项目内脚本 + 评委按键" | 既兑现 wow（最小实现）又守诚实（vision 标注）；①③② 已落地真 wow 足以撑起"3 个评委忘不掉的瞬间" |
| ④ 差异化口径收紧 | (a) R2H 4 维从"差异化支柱"降级为"加分项"，硬差异收紧为"声明级 5 值 anti-theater 裁决 + FEC 可证伪绑定 + 国产基座"3 项；(b) 查新清单扩展加 MLAgentBench/SCITT/C2PA/Sigstore（标"待查新同构度评估"，**不**断言一票否决）；(c) PDF 第 1 页明示 R2H 派生能力评估表 | 收紧到真硬差异更可辩护；扩展查新清单覆盖遗漏竞品，但不断言同构度（避免 RR-14 overclaim） |

### 6.3 7 类措辞订正清单（`59` §6，W0 范畴或并行 · 立即生效）

| # | 文档位置 | 原措辞 | 订正措辞 | 证据/红线 |
|---|---|---|---|---|
| W0-1 | `README.md:9/93/114` | "1038 tests pass / 92.80% coverage / coverage-92% badge" | 占位符 `<TEST_COUNT_FROM_STATUS_DUMP>` 或"实测见 `far status` 输出"（W0 启动前第一件事，不等 CLI） | HONESTY-A3 |
| W0-2 | `56§6 RR-7` | "snapshot 维护期 ~2026-07-08" | 见本文件 §2.9（删无来源 07-08 日期，day-0 实测复核） | Z1-SNAPSHOT |
| W0-3 | `56§4` + 全文档"物理不可篡改" | 见本文件 §2.3 | 见本文件 §2.3 | critic (c) |
| W0-4 | `07§6.3 C1` | 见本文件 §2.8 第一行 | 见本文件 §2.8 第一行 | Core 中立 overclaim |
| W0-5 | `src/falsifiability/contracts.ts:13` | 见本文件 §2.8 第二行 | 见本文件 §2.8 第二行 | 注释撒谎 |
| W0-6 | `53§3` 灵魂时刻⑥ + `44`/`53`"模型可插拔" | 见本文件 §2.8 第三行 | 见本文件 §2.8 第三行 | 灵魂时刻⑥ overclaim |
| W0-7 | `18§8` Q&A | （11 问无自举条目） | 增补第 12 问："证据链全是 AI 产物，可信性何来？"→"我们不证明 LLM 说的对——我们证明它说了什么之后**不可篡改、可独立复算、可证伪**；可信性 = reproducibility（字节相等重算）+ falsifiability（可被反例推翻）的联合属性，非 LLM 自评；external anchor gitCommitSha/crossref DOI 是可外部验证的离线锚点" | Z2-BOOTSTRAP |
| 并行 | `48§3.3` | 五类盲区判据（自然语言） | 每类给确定性判定函数签名+阈值常量（如 `data_sensitive`: ≥3 数据子集 run 中 verdict 翻转率 ≥50%），或诚实标注"超出确定性边界→需人工裁决"不纳入自动 typology | NOVELTY-A2 |
| 并行 | `56§4`/`24§5`"降级走 offline_replay" | "FallbackChain 降级走 offline_replay" | 见本文件 §2.2 最后一行（offline_replay 是 demo profile 非生产兜底） | critic §5 |

---

## 7. 缺失编号处理

旧包中缺失的编号不补写伪历史文件。本 SSOT 直接补齐其应承担的交接和规划功能。

| 缺失编号 | 处置 | 依据 |
|---|---|---|
| `41` | 不补写伪历史文件；其交接功能由 `10_DEV_ENTRYPOINT.md` 承担 | `76` §1 边界说明 |
| `63_NEXT_WINDOW_HANDOFF_PROMPT.md` | 不存在的事实已被 `76` §1 记录；本次不伪造读取记录，也不补写旧编号文件 | `76` §1："本轮没有伪造读取记录，也没有补写旧编号文件" |
| 其他缺失编号 | 由 status-dump `docCount` 自动生成文档计数；索引不再手填 | `56` §2.6 |

> 历史文档计数漂移（"32/39/43 份"）已由 status-dump 自动生成取代。若读者需查阅 FINAL_PACKAGE 完整编号清单做历史溯源，路径是 `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/`。

---

## 8. 后续维护规则

新增或修改文档必须遵守：

1. **若是最终口径**，写入顶层 `FAR_LAB_MASTER_PLAN/`（P0）；
2. **若是历史补充**，标明 `ARCHIVE` 并注明备份位置 `C:/Users/RichardYuan/FAR-Lab_Backups/`；
3. **若修改状态**，更新 `01_SOURCE_OF_TRUTH_AND_STATUS.md`；
4. **若修改架构**，更新 `02_ARCHITECTURE.md`；
5. **若修改 verdict 或 proofHash**，更新 golden vectors（`APPENDIX_B_GOLDEN.md`）、canonical 算法（`APPENDIX_C_CANONICAL.md`）和所有 verifier；
6. **若引入外部事实**，标注来源和读取日期；外部竞品/论文标 `NEEDS_EXTERNAL_VERIFICATION` 并 hedge；
7. **若修改类型字段/enum**，更新 `APPENDIX_A_TYPES.md`（字段名权威）；同时检查 `APPENDIX_C`（字节规则）与 `APPENDIX_F`（术语语义）一致性——冲突时类型字段以 A 为准、canonical 字节规则以 C 为准、术语语义以 F 为准；
8. **若新增"进入 hash 的字段"或"不进入 hash 的字段"**，必须更新 `APPENDIX_C` §2/§3 白名单，并同步 golden vectors（白名单优先，禁 spread 黑名单 API-1）；
9. **数字一律来自 `far status --json`**，禁手填裸数字（测试数/文件数/CI 通过率/benchmark 数/commit/竞品发布时间）；status 工具尚未覆盖的字段写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`；
10. **路径一律写 `<REPOSITORY_ROOT>/`**，禁 `far-chain/` 作为真实实现根、禁 `packages/` 作为当前实现（V3 路线图除外）；
11. **verdict 一律 5 值**（`CONFIRMED/REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED`），禁第六值；
12. **裁决必须 deterministic**，LLM 不得作为最终裁决者（F3）。

---

## 9. 反幻觉清单（来自 `76` §10，发布前过一遍）

每次更新报告、答辩稿或 README 前，必须检查：

- 是否把旧版"可审计/可复现"英文口号当作主卖点（应改 Tamper-Evident / Independently Re-computable）；
- 是否暗示 FAR 取代同行评审；
- 是否把 hash 说成物理安全（应 tamper-evident 非 tamper-proof）；
- 是否声称所有 verification 已跨语言完成（应指明已验证语言和字段范围）；
- 是否把 LLM reviewer 当 final judge（禁）；
- 是否把 V3 路线（Rust/Go/WASM full verifier / external transparency log / full formal specification / FAR-Level 4 supply-chain profile / large public benchmark / third-party verifier ecosystem）写成当前完成；
- 是否写入真实个人路径、用户名、邮箱、密钥或本机信息（守 S1 / 隐私门）；
- 是否把 `63` 当成已读取材料（不存在，不伪造读取记录）；
- 是否手填裸数字（应来自 `far status --json`）；
- 是否出现禁用词（`APPENDIX_F` §6：D1-D15 / V2-1 至 V2-10 / DO_NOT_CLAIM 7 条 / 假绿 6 条）；
- 是否每个能力都带了 §0.2 状态标签，未混写"已实现"和"应实现"；
- 是否引用未复核外部事实（应标 `NEEDS_EXTERNAL_VERIFICATION`）。

---

## 10. 仍 UNVERIFIED 项（来自 `59` §10，诚实标注）

| 项 | 状态 | 核实方式 |
|---|---|---|
| Right-to-History (arXiv:2602.20214) 同构度 | `NEEDS_EXTERNAL_VERIFICATION` | PDF 前打开 arXiv 原文核作者/机构/方法 |
| MLAgentBench/SCITT/C2PA/Sigstore 同构度 | `NEEDS_EXTERNAL_VERIFICATION`（本文件 §6.2 决策④新增入查新清单） | 逐条核原文，评估与 FAR-Chain 声明级可靠性 + 密码学锚定的真实同构度 |
| snapshot qwen3.7-max-2026-05-20 竞赛周是否在线 | `NEEDS_EXTERNAL_VERIFICATION` | day-0 实测 GET /v1/models（无 key 不算通过） |
| 真实多模型 Court（FI-3 满血） | `NEEDS_HUMAN_OPERATION` | 多 key 物理约束 |
| ProbeAtlas 真实 GPU p<0.05 | `NEEDS_GPU_VALIDATION` | 物理设备约束 |
| 测试数真值 | `Pending` | `far status --json` 实测回填 |

---

> 本文件是旧文档追踪矩阵 SSOT。它把 143-agent 对抗审视（`59`）+ 真相统一（`56`）+ 设计完成判定（`76`）的全部来源溯源收敛为：旧编号 → 新位置映射、被修正旧口径、降级 V2/V3 内容、digest 吸收、缺失编号处理、维护规则、反幻觉清单、UNVERIFIED 项。**物理档案已退役，备份在 `C:/Users/RichardYuan/FAR-Lab_Backups/`。后续维护引用本文件与 `APPENDIX_A_TYPES.md` / `APPENDIX_C_CANONICAL.md` / `APPENDIX_F_GLOSSARY.md` 三权威即可，不再回引旧编号作为有效依赖。**
