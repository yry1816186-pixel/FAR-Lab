# FAR-Lab 正式开发任务规划（task_plan.md)

> 依据：`FAR-LAB_DEVELOPMENT_MISSION.md`（98 节施工总指令）+ canonical `project-spec/*` + `.control/*` + 实测环境。
> 本文件是本次 Goal 执行的静态规划快照；动态状态一律以 `.control/EXECUTION_STATE.json` / `ACCEPTANCE_STATUS.json` 为准。
> 规划落盘后立即自动继续执行，不等待用户确认。

---

## 0. 地面真相（2026-08-21 实测扫描）

### 0.1 工作区清单

| 区域 | 内容 | 状态 |
| --- | --- | --- |
| `FAR-LAB_DEVELOPMENT_MISSION.md` | 98 节正式施工总指令 | 权威任务书 |
| `project-spec/` 12 个 canonical 文件 | ACCEPTANCE(20 项)/ARCHITECTURE/REQUIREMENTS(FR-01..18, NFR-01..10)/SCIENTIFIC_MODEL/COMPETITION/PRODUCT/INTERFACES/EVALUATION/BUILD_PLAN(W0-W5)/RESEARCH_BASELINE/RISK_REGISTER(R-01..R-18)/INTEGRATION_CATALOG | 完整对齐，无内部冲突 |
| `project-spec/policies/` 7 份细则 | 按需加载（SCIENTIFIC_TRUTH/PRODUCT_HCI/TESTING_EVALUATION/RELIABILITY_SECURITY/ENGINEERING_CONDUCT/RELEASE_OPERATIONS） | 进入领域时读取 |
| `.control/` | EXECUTION_STATE/ACCEPTANCE_STATUS(ACC-01..20 全部 not_started)/BLOCKERS(B-HARNESS-RUNTIME OPEN)/DECISIONS(D-001..D-009) | 控制面就绪 |
| `zcode-harness/` | farlab-control-plane 插件（skills/agents/commands/hooks）+ 6 个确定性脚本（completion-gate/secret-scan/path-hygiene 等） | 本会话 SessionStart hook 已真实触发、skills/agents 已加载 → B-HARNESS-RUNTIME 具备解决证据 |
| `research/` | EVIDENCE_INDEX（路由）+ 727KB 冷参考语料（禁止自动加载） | 冷存 |
| 产品代码 | **不存在（greenfield，零代码）** | 本次任务从零建设 |

### 0.2 运行环境实测

- Node v24.14.0 / npm 11.9.0 / git 2.53.0.windows.1 / Python 3.12.10（Windows 10 x64，Git Bash）。
- 网络实测：OpenAlex=200，Crossref=200，arXiv=301（可跟随），**PubMed 不可达**（SSL 失败，不作为源适配器）。
- 模型凭证实测存在：`ZHIPU_API_KEY`（Z.ai/GLM，`ZAI_BUSINESS_BASE_URL=https://api.z.ai`）、`DEEPSEEK_API_KEY`、`RELAY_API_KEY`（中转网关，base URL 待 W0 探测）；**无 DASHSCOPE_API_KEY**。
- 含义：Model Execution Plane 以 OpenAI 兼容协议为主干（GLM/DeepSeek 均为国产开源模型，满足"基于国产开源大模型"赛道要求）；Qwen/百炼一等公民路径经 RELAY 网关探测，若不可达则如实标注 BLOCKED 并保留适配器 + 官方路由接入位，不伪造 live 证据。
- 工作区**不是 git 仓库** → W0 第一件事：`git init` + 仓库卫生。

### 0.3 竞赛锁定事实（2026-08-21 复核）

- XH-202619 挑战杯揭榜挂帅：基于国产开源大模型的 AI Scientist；Track 1 → Direction 1 → A（科学假设生成与研究计划设计）。
- 官方 A 闭环：问题理解 → 知识整合 → 候选假设生成 → 证据梳理 → 研究计划输出 → 反馈修正。
- 评分：科学价值 40% / 技术深度 30% / 应用价值 30%；技术方案 PDF ≤20 页；需官方要求调用路由的 live 证明。

---

## 1. 目标与完成判据

### 1.1 硬验收条件（用户 Goal 指令，全部满足才算完成）

1. canonical Critical Acceptance（ACC-01..ACC-20）全部通过，每项附可核查证据；
2. 全部缺陷残留清零（P0=0 且 P1=0）；
3. 真实主科研闭环完整落地，能力生产路径可复现验证；
4. Independent Audit 独立审计完整执行并输出审计报告落盘；
5. Frontier Opportunity Sweep 前沿机会扫描完成；
6. 确认不存在仍具备显著价值的可执行关键工作。

### 1.2 完成判定协议

- 每轮迭代必须附真实证据（命令 + 退出码 + 关键输出 / 文件 diff / 审计日志），禁止纯文字宣称。
- `node zcode-harness/scripts/completion-gate.mjs` 退出码 0 是必要条件（非充分）。
- ACC 状态迁移只允许沿 `not_started → implemented → integrated → tested → live_verified` 真实阶梯推进，evidence 数组必须非空且指向真实工件。
- 迭代熔断：最多 45 轮；连续 3 轮无实质进展 → 强制换策略。
- 结束时输出根目录 `final_delivery.md`（task_plan 执行情况 + 全部验收结果 + 审计报告链接 + 遗留风险清单）。

---

## 2. 技术路线决策（W0 spike 验证后锁定）

按 D-005 纪律：以下为 W0 候选，spike 证据推翻则替换，决策记入 `.control/DECISIONS.jsonl`。

| 决策点 | W0 候选 | 验证方式 | 替代 |
| --- | --- | --- | --- |
| 核心运行时 | TypeScript + Node 24 单仓 | 全链路类型检查 + 纵向切片实跑 | — |
| 持久化 | Node 内置 `node:sqlite`（零原生依赖） | 事务/并发/损坏恢复/迁移 spike | better-sqlite3（需预编译二进制） |
| Schema/校验 | zod | 领域 schema + 模型结构化输出校验 spike | 手写校验器 |
| Web | React + Vite（由 server 静态服务） | IA 设计 + 构建产物实跑 | 更轻 SSR 方案 |
| HTTP 层 | 极简自研路由（fetch 风格，零框架）或 Hono | API spike | Fastify |
| 模型面 | 自研薄 OpenAI 兼容 client（fetch），provider=GLM(Z.ai)/DeepSeek/RELAY(→Qwen?) | live 结构化调用 + receipt spike | 厂商 SDK（增加依赖面，否决倾向） |
| 源适配器 | OpenAlex + Crossref + arXiv（HTTPS API） | 真实检索 + 快照 + 引用解析 spike | PubMed（本机不可达，排除） |
| 工件存储 | 文件系统内容寻址（sha256 命名不可变区） | 快照不可变性 + 复现 bundle spike | — |
| 测试 | Vitest（单测/集成/故障注入） | 真实路径测试 | node:test |

**明确不做**（D-007）：微服务、外部 workflow 引擎、图/向量数据库、通用 agent 框架、HPC、桌面壳。编排 = 自研持久化阶段状态机。

---

## 3. 目标架构（对齐 ARCHITECTURE.md 分层）

```text
apps: CLI(far) / HTTP API / Web workbench(React)
        |
application use-cases + orchestrator（阶段状态机）
        |
canonical scientific domain（zod schema + 领域逻辑）
        |
providers(模型) / sources(检索) / persistence(sqlite+artifacts) / provenance
```

- 仓库布局：根级 npm 单包 + `src/`（domain/app/persistence/providers/sources/pipeline/cli/server）+ `web/`（React）+ `eval/`（问题集/基线/指标）+ `tests/`。
- 领域对象：ResearchQuestion/Scope/Constraints → ResearchRun → CorpusSnapshot → SourceDocument → ScientificClaim → EvidenceRelation(support/counter/conflict/methodological_limit/unknown) → HypothesisCandidate → Assumption/FalsificationSpec → HypothesisScorecard → ResearchPlan/ValidationTask → FeedbackSignal → Revision → VersionDiff → ProvenanceReceipt → ReproducibilityBundle。
- Run 生命周期：created→running→(paused/partial)→completed/failed/cancelled + stage checkpoints；禁止编造百分比进度。
- 状态所有权：SQLite 事务库 = 可变状态唯一权威；append-only events/receipts = 审计；内容寻址工件区 = 不可变载荷。`.far-run/` 导出仅为快照。

---

## 4. Wave 工作图（依赖感知）

### W0 — 地基与真实 spike（关键路径起点）
1. git init + 仓库卫生 + npm 骨架 + tsconfig + Vitest。
2. **Spike-SQLite**：node:sqlite 事务/崩溃恢复/并发写 spike → 锁定持久化路线。
3. **Spike-Model**：GLM(Z.ai)/DeepSeek live 结构化调用（JSON schema 输出 + zod 校验 + receipt：provider/model/usage/耗时/哈希）；RELAY 探测（Qwen 可达性）→ 锁定模型面 + 生产路由；不可达者如实 BLOCKED。
4. **Spike-Source**：OpenAlex/Crossref/arXiv 真实检索 + 引用解析（DOI/arXiv ID 回查）+ 不可变快照 + 哈希 → 锁定源面。
5. 领域 schema v1（zod）+ run 状态机定义。
6. 研究者任务流/IA 纸面设计（Web 之前）。
7. 决策落盘（DECISIONS.jsonl 增量）+ B-HARNESS-RUNTIME 关闭（本会话 hook 已触发的运行时证据）。
- **出口**：无未决地基问题；三条 spike 均有真实运行输出。

### W1 — 第一条真实 Direction-A 纵向切片（P0 核心）
- 持久层（迁移/事务/事件/工件区）+ 编排状态机（scope→retrieve→verify→evidence→hypotheses→critique/falsify→rank→plan→export）。
- 证据管线：查询多样化（支持/反对/方法论三类）→ 检索 → 快照 → 声明抽取 → 引用绑定（fail-closed）→ 证据关系（含反证搜索）。
- 假设引擎：多策略生成（证据条件/矛盾驱动/机制驱动/类比等，实测择优）+ 语义去重聚类 + 多样性证据 + FalsificationSpec + 可解释 Scorecard（分数带 rationale/不确定性，不冒充客观概率）。
- 研究计划生成：变量/对照/数据/方法/指标/判停/资源/风险 + 确定性可执行性检查。
- ProvenanceReceipt 真实采集 + 初版导出（人读报告 + 机器 bundle）。
- CLI：start/status/inspect/export + 一条真实失败路径 + checkpoint/resume。
- **真实科研问题端到端实跑**（非 fixture）。
- **出口**：第三方可检查输入/来源/假设/计划/溯源并复现到声明等级。

### W2 — 反馈/修订/证据加固
- FeedbackSignal + 因果 Revision + 结构化 VersionDiff（What/Why/Which evidence/quality delta）。
- 反证/冲突/不确定性强化；确定性引用/证伪/计划完备性检查器。
- 取消传播、重试/幂等、损坏检查点恢复（真实故障注入验证）。
- CLI 全命令面（feedback/cancel/resume/verify + --json 机读模式）。

### W3 — Web 工作台（同一应用内核）
- HTTP API（版本化/幂等/结构化错误/真实事件流）。
- React workbench：Runs/Evidence/Hypotheses/Plan/Revisions/Provenance/Run 控制七大区；真实空/加载/部分/错误/取消/恢复态；键盘可达 + 中英双语 + 响应式；无假控件。
- 浏览器 GUI 实测（Playwright 黑盒走查主工作流）。

### W4 — 评估/性能/安全加固
- 代表性科研问题集（5-8 题，覆盖普通/困难/反证丰富/信息不足/来源冲突/长任务/恢复）。
- 可运行强基线：同模型直接结构化 prompt、同模型简单 RAG 管线；预声明指标与采样协议；不挑结果。
- 指标：引用可解析率/声明-来源对齐/反证覆盖/假设多样性/证伪规格质量/计划可执行性/伪造率/复现完备性。
- 故障/对抗/恢复/安全测试（密钥/注入/路径/网络/子进程边界）。
- 性能实测（端到端+分段延迟/成本/并发预算），测量后定预算。

### W5 — 发布/复现/独立审计
- ReproducibilityBundle 第三方独立演练（fresh 目录重放/重算）。
- 独立对抗审计（adversarial-auditor + scientific-reviewer 子Agent，攻击 23 类造假面）+ 修复回归。
- secret-scan/path-hygiene/completion-gate 全绿；打包安装实测；文档对齐已验证现实。
- Frontier Opportunity Sweep（90.1-90.10 十维复查 + 边际价值测试）。
- `final_delivery.md`。

### 关键路径
W0 → W1（持久/编排→证据→假设→计划→CLI）→ W2 → W3 ∥ W4（部分并行）→ W5。

---

## 5. 并行策略（子Agent 派发纪律）

- 只并行**独立可合并**工作；写所有权互斥（每个子Agent 独占目录/模块）；核心耦合域模型由主 Agent 集成。
- 典型并行位：W0 三 spike（SQLite/Model/Source）、W2 检查器组、W3 Web 各视图、W4 基线/问题集/安全审计、W5 双审计。
- 每个子Agent 产出 = 有界工作包（目标/范围/证据/交付物），主 Agent 交叉复核关键结论后集成。
- 子Agent 类型优先：general-purpose（实现）、code-reviewer（对抗审查）、security-auditor、adversarial-auditor、scientific-reviewer、architecture-critic、performance-engineer。

---

## 6. 迭代协议

- 每轮 = 选最高杠杆问题 → 实现 → 集成 → 真实路径执行 → 测试 → 证据落盘 → `.control` 更新 → 重排问题集。
- 证据统一收口：`evidence/` 目录（命令输出、运行工件、审计日志，按 ACC-ID 命名可检索）+ `ACCEPTANCE_STATUS.json.evidence` 指针。
- 熔断与换道纪律同 §1.2。

## 7. 主要风险（对齐 RISK_REGISTER）

R-02 官方路由 live 证明（RELAY 不可达则 BLOCKED 如实申报）｜R-03 引用-声明对齐（内容级校验 + fail-closed）｜R-05 只找支持证据（三类查询强制）｜R-07 假反馈假修订（因果 Revision 结构）｜R-13 无界循环（预算+熔断）｜R-17 harness 未加载（本会话已证伪，待关闭）。

---

**规划完成。以下自动继续执行：W0 开始。**
