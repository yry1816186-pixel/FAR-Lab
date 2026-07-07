# FAR-Chain 项目铁律（覆盖所有 Agent）

> 本文件是项目级 SSOT，优先级高于任何 Agent 的默认行为。任何 Agent（Claude / GPT / 其他）在本仓库工作前必须先读完本文件。
> 全局 `~/.claude/CLAUDE.md` 与 `~/.claude/rules/*.md` 仍生效；本文件在其之上追加 FAR-Chain 专属约束。

> ⛔ **STOP — 任何 Agent（Claude / GPT / Cursor / Copilot / 其他）写任何代码前必读三件套**：
> 1. `<REPOSITORY_ROOT>/.agent/AGENT_ENTRY_PROTOCOL.md`（4 步入口协议 + T0-T8 自检）
> 2. `<REPOSITORY_ROOT>/FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md` §A（next_action）+ §C（机器可读深度接线表）
> 3. `<REPOSITORY_ROOT>/.agent/AGENT_ANTISKIM_TRIPWIRES.md`（逐条 skim 模式 + 机检钩子）
>
> 三重硬门由 `scripts/depth_gate.mjs`（CI required job）+ 仓库文件强制。当前态深度功能未接线，depth_gate 确定 exit 1——任何不带真实接线的 PR 都会被拦在 CI 层，与你是哪个 agent 无关。说不出来本次工作驱动的**单一真实依赖**（真实 SymPy / DashScope HTTP / venv 子进程 / 哈希重算 之一）就 STOP，不要动手。

## 0. 背景与目标

本仓库是竞赛交付物（XH-202619《基于国产开源大模型的 AI Scientist 的研发与应用》）。
FAR-Chain = AI4S 科学声明的**声明级验证层**。核心价值是「可独立复算、篡改可检测、反剧场」的验证内核，**不是测试套件**。

历史问题：任何 Agent 接手都陷入「反复跑测试」循环，而深度功能（FEC 强制编译、metric-first 判定内核、7 个缺失 CLI、真实后端接线）停在 DESIGN_LOCKED。根因已由 16-agent 深度审计（2026-07）锁定，见 §4 施工蓝图。

## 1. 进度定义：构造优先，不是「测试变绿」

- **PROGRESS = 真实依赖端到端接线成功**，不是 `pnpm test` 全绿。当前套件已绿，且其中约 25% 是同义反复（断言常量数组、grep 缺词），再绿一次等于零进度。
- 写任何新测试前，先说出它证明存在的**单一真实依赖**（真实 SymPy 调用 / 真实 DashScope HTTP / 真实 venv 子进程 / 真实哈希重算）。说不出 = 你在循环，停下来去接线。
- 一项工作「完成」= 一个**生产调用方**（非测试）在**真实输入**上驱动了此前孤立的逻辑 **AND** 一条此前 RED、现在只在真实（非 Fake）路径上 GREEN 的端到端测试。重跑已绿套件永远不算进度。
- 禁止话术：「我提升了测试覆盖率」。允许话术：「我把 X（file:line）接进了生产路径 Y（file:line），这是 diff 与一条只在真实路径上由 RED→GREEN 的测试」。
- 当套件已绿且被要求「改进测试」时，正确动作是识别并接线一个未接线的深度功能（见 §4），不是给已绿的桩补测试。

## 2. 注释最小化（竞赛铁律）

> **既有注释一律不动。本条只约束新增与改动代码。**

本仓库用于竞赛评审。密集的 AI 生成解释性注释（`// 这个函数先做 X，再做 Y`）会被评委判定为「无含金量 / AI 代写」。**禁止新增这类注释。**

**允许**的新注释：
1. 代码强制、读者无法自行推导的**不变式**（`// canonicalHash 必须排除 purposeTag/seq/currentHash —— 它们非确定性，见 APPENDIX_C §1.2`）
2. 非显然工程决策的**为什么-不是-什么**（`// 用 Koller-Friedman Bayes-Ball，不用 §7.5.1 伪代码 —— 伪代码的 collider 分支方向反了，见 d_separation.ts:6-18`）
3. fail-closed 保证与红线（`// CG-1: 本目录禁止任何 LLM import`）
4. 诚实的状态/延期说明（`// V1 类型层：无真实子进程 —— V2 路线，见 F4`）

**禁止**的新注释：
- 用散文复述代码（`// 遍历 items 求和`）
- 解释显而易见的库调用（`// sha256 对输入做哈希`）
- 与函数名重复的分区横幅
- 任何「删掉它读者也不会损失工程信息」的注释

判定法：删掉这条注释后，读者是否在**不变式 / 非显然决策 / 红线**上严格损失信息？是→留；否→删。拿不准时，把理由写进 commit message 或 FAR_LAB_MASTER_PLAN 条目，而不是内联注释。

## 3. 验证策略（避免测试循环）

**必须**（改完这些就跑定向测试）：
- 改 canonical-hash / proofHash / fecHash / Merkle combine → 跑 `cross_lang_consistency` + 相关 golden-vector
- 改判定关键逻辑（kernel 规则、FEC 编译检查、anti-theater 检测器）→ 跑对应分支的 GV / 攻击语料测试
- 改 schema/migration → 跑 append-only 触发器测试 + diff 测试
- 把孤立模块接进生产路径 → 加**一条**真实（非 Fake）路径的端到端 RED→GREEN 测试

**commit / PR 前**：增量档 = typecheck + lint + 你改的文件对应的**具体**测试 + 你新写的端到端测试。**不要**把全量套件当例行门禁。

**要避开的测试循环陷阱**：
- 逻辑没变却重跑 `pnpm test`「找存在感」—— 套件已绿，重跑无信息量，视为 no-op
- 给桩后端补测试 —— `tests/math/*` 用 FakeBackend、`tests/science_harness/hero_*` 喂硬编码指标，结构性绿在未建功能上；只给真实后端路径补测试
- 把 Python 环境失败（verifyEnvelopeV2WithPython、cross_lang）或工具缺失（SymPy/Z3/Lean/Dafny）误当代码 bug —— 先读 `scripts/ensure_py_deps.mjs` 探针；axis skipped = 环境问题，不是你的
- 分不清失败是逻辑还是环境时，单文件 `pnpm vitest <file>` verbose 跑，不要重跑全量套件盯着同一面绿墙

**不需要**（别拿这些当门禁）：纯 doc / FAR_LAB_MASTER_PLAN 改动、仅注释改动、重命名局部变量、加无运行时效果的类型。

## 4. 施工蓝图（依赖序，权威 backlog）

源自 16-agent 深度审计（2026-07），逐子系统证据见审计报告。**按顺序取下一项，不要 ad-hoc。**

### P0 — W2 硬门（缺它则下游全是空中楼阁）
- **P0-1** 把 `compileFec` 接进生产 verdict+seal 路径：`src/fec/orchestrator.ts` 的 `fecAppendClaim` 在 makeVerdict 前先 `compileFec(fec)`，HARD_FAIL → 强制 verdict=UNTESTED，使「缺 FEC 不允许 CONFIRMED」在运行时生效。〔依赖：无〕
- **P0-2** 4 个生产路径用 `decideFiveValueVerdict` 替换 V1 `makeVerdict`：`fec/orchestrator.ts:73`、`agent_loop/verdict_stage.ts:234`、`far_proof/demo_chain.ts:215`、`falsifiability/render.ts:26`；传 `StatisticalResult[]` 而非预制 `supportsClaim` 布尔，封出 reasonCodes/ruleTrace/decisiveRuleId/evidenceSufficiency。〔依赖：P0-1〕
- **P0-3** 加**一条**端到端测试：经真实 demo_chain 路径，无/坏 FEC 的声明无法封 CONFIRMED（此前 RED，接线后 GREEN）。〔依赖：P0-1, P0-2〕
- **P0-4** 让 `decideFiveValueVerdict` 消费 `compileFec` 的 Plan，替换其内联 4 字段浅检查（`verdict_kernel_v2.ts:526-533`），使 R1 与编译检查同条件触发。〔依赖：P0-1, P0-2〕

### P1 — 接线与缺口闭合
- P1-1 `far fec compile` / `far fec freeze` CLI（新建 `src/cli/commands/fec.ts`，接进 `far.ts` dispatcher）〔依赖：P0-1〕
- P1-2 把 `executeFallbackChain` 接进生产调用方（loop_runner / qwen_vl_adapter），429/5xx/timeout 穿透 fallback chain，落 degraded_from，chainExhausted → verdict=UNTESTED〔依赖：无〕
- P1-3 生产级文本-only aliyun_qwen HTTP adapter（`src/llm_gateway/adapters/aliyun_qwen/qwen_adapter.ts`）〔依赖：P1-2〕
- P1-4 12 条 verdict golden vectors 落盘 `golden_vectors/cases/GV-01..GV-12.json` + 实现 `far verify-golden --backend {node|python|browser} --case|--all --cross-lang`〔依赖：P0-2〕
- P1-5 3 个 hero fixture 接进真实 pipeline（buildX→mapChecksToVerdict→fecAppendClaim→sealProofEnvelope），用真实沙箱指标替换硬编码〔依赖：P0-1, P0-2〕
- P1-6 `sandbox_runner` 真起 venv 子进程、`dataset_resolver` 真拉数据（lightkurve/astroquery.mast + host 白名单）〔依赖：P1-5〕

### P2 — 深度覆盖
- P2-1 `tests/real_backends/` 档（按环境能力 skip）跑真实 SymPy/Z3/Dafny/Lean spawn+parse + Python 侧 sympy_backend 测试〔依赖：无〕
- P2-2 spec 的 9-state CLI 协议 FSM（CLAIM_CANDIDATE→…→VERIFIED）+ per-stage stageReceipt 哈希〔依赖：P1-1〕
- P2-3 删除/合并同义反复测试（dialogue_types、claim_fixtures、合并 red_line_grep + n3_anti_hallucination 进 zero_tolerance_scan.mjs）〔依赖：无〕

### P3 — 卫生
- P3-1 suite 起跑时单条 Python-axis 能力探针，打印 `Python axis: available|skipped`〔依赖：无〕

### P-FUSION — Open Science 工程范式迁移（DESIGN_PROPOSED，未来 backlog，不抢 P0-P3 依赖序）

> 来源：`FAR_LAB_MASTER_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md`。Open Science 经实证为 Claude Code 分支重品牌化的**执行层 agent 工作区**（sanitize-runtime 长 byte CLAUDE→SCIENC 替换；内部 Anthropic Messages API + universal-llm 翻译网关；science-sonnet-4-6 = claude-*）；FAR-Chain 是**验证层声明级裁决内核**。**层级不同**：迁移 OS 的**工程范式**（反剧场 / fail-closed 服务门 / 收窄伪造窗口 / 内容寻址 CAS / derivable 标记 / 进程组 kill / AST 结构门），**绝不迁移** OS 的 LLM-裁决语义。6 项收敛点（C-1..C-6：来源不可自填 / 失败闭环门 / LLM-非裁决者 / 自排除规范哈希 / 冻结契约工件 / 从磁盘派生花名册）FAR-Chain 已独立达到，不重复立项。机器可读接线表见 `FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md` §C 末段 FUSION-OS-1..14（全 NOT_BUILT，由 keystone bot CI 双跑写回 WIRED_GREEN，agent 不得手填）。

- **FUSION-OS-1** 反剧场检测器接实时 verdict 路径：`runAntiTheaterLint` 的 20 个检测器当前仅 `verify.ts:412` 离线调，`orchestrator.ts:199` 运行时硬编码 `antiTheaterFindings:[]` → 注入 `buildVerdictKernelInput`，闭合 R-anti-theater-fail / seed-cherry / R8-warn 实时路径。**当前最大活体缺口，最高杠杆。**〔依赖：P0-1〕
- **FUSION-OS-2/3/4/7/8** sandbox 加固：进程组 kill（detached + kill(-pgid)）/ seal 时序窗口收窄 / spawnVenv 前 fs 预扫（用户态降级，真 OS 隔离仍 V2 见 07 §188）/ wall-cpu-peak_rss 执行指纹 / secret 剥离 + dlopen 防护。〔依赖：P1-6〕
- **FUSION-OS-5** verifier 加载期 AST 结构门（禁顶层 network/IO/LLM call，TS Compiler API）。〔依赖：无〕
- **FUSION-OS-6** LLM 产出 provenance 强制 null + 系统 hash 重算绑定 + provenanceClass tag —— 反剧场红线「来源不可自填」可执行化。〔依赖：FUSION-OS-5〕
- **FUSION-OS-9** 内容寻址 blob CAS 表（far_blob_store hash PK，evidence / FEC Plan / kernel trace 按 hash 去重）。〔依赖：无〕
- **FUSION-OS-10** evidence derivable 标记 + 强制重算验证。〔依赖：FUSION-OS-9〕
- **FUSION-OS-11** verdict_nodes.verdict 加 CHECK 约束固化五值枚举（DB 层禁第六值，红线级强制）。〔依赖：无〕
- **FUSION-OS-12** verdict.superseded_by 前向指针（重评写新行，WHERE superseded_by IS NULL 查当前）。〔依赖：FUSION-OS-11〕
- **FUSION-OS-13** StatisticalResult.derivationForm（literal/derived/formula/auto）+ kernel form 不匹配即使值相等也降级。〔依赖：P0-2〕
- **FUSION-OS-14** R-identifier-fabrication：claim 带可校验 identifier（DOI/arXiv/accession）无 harness-verified 来源 → REFUTED（非 UNTESTED，须同步 GV）。〔依赖：P0-2〕

> 取序建议：FUSION-OS-1（最高杠杆）→ FUSION-OS-11（红线级）→ FUSION-OS-13/14（内核规则）→ 其余 sandbox/schema 项。**取任何 FUSION-OS-* 前先确认 P0-P3 当前 next_action 已完成或显式让位**（见 `DEPTH_LEDGER.md` §A）。

## 5. 不可逾越的项目红线（来自 FAR_LAB_MASTER_PLAN，与全局零容忍叠加）

- 五值裁决枚举**固定**：CONFIRMED / REFUTED / INCONCLUSIVE / DEGRADED_SCOPE / UNTESTED，**禁第六值**，优先级 DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED
- **LLM 不得作最终裁决者**（裁决由 R0-R9 确定性内核给出）
- **禁手填裸统计数字**（测试数 / 文件数 / CI 通过率 / commit 数）—— W0 硬门 RR-1，必须由命令实时生成
- 路径写法用 `<REPOSITORY_ROOT>/` 占位
- 禁用词：证明科学真理 / 物理不可篡改 / 完全可复现 / 全自动科学家 / 通用 AI4S benchmark / 把 far-chain/ 当实现根 / 裸「第一唯一最新」
- 不把 V2/V3 路线写成当前完成（状态标签必须诚实）
- **Open Science 融合迁移边界**：迁移 OS 的工程范式（反剧场 / fail-closed 服务门 / 收窄伪造窗口 / 内容寻址 CAS / derivable 标记 / 进程组 kill / AST 结构门），**绝不迁移** OS 的 LLM-裁决语义（universal-llm 翻译网关 / LLM-审核者 / skills / MCP / metadata.yaml agent）—— FAR-Chain 红线「LLM 不作最终裁决者，确定性 R0-R9 内核」高于任何融合。Open Science 经实证为 Claude Code 分支重品牌化的执行层 agent 工作区，与 FAR-Chain（验证层）层级不同。详见 `FAR_LAB_MASTER_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md`。
