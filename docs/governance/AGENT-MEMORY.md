# AGENT-MEMORY — FAR-Lab 层级记忆体系操作手册

> **定位**: 这不是一份新记忆库，而是 FAR-Lab **现有记忆资产**的导航与维护规范。
> FAR-Lab 已有成熟的设计治理体系（`.far-design/` 21 个 ADR-* + 3 个 D-* 决策记录（合计 24 项）+ 盲区登记 + 设计债 + 状态机），
> 本文档告诉每个 agent：记忆资产在哪、何时读、何时写、怎么维护、怎么晋升——禁止重复造轮子。
> **权威源**: `AGENTS.md` §10（上下文持久化）+ §3（指令优先级）+ 本文档。
> **创建**: 2026-08-07（调研见 `RESEARCH-FINDINGS.md` §3.4）

---

## 1. 记忆分型与现有资产映射

FAR-Lab 的记忆按**生命周期 + 变更频率**分五型，每型对接一个现有资产位置（单一真相源，不重复）：

| 分型 | 含义 | 现有资产位置 | 变更频率 | agent 权限 |
|------|------|------------|---------|-----------|
| **决策记录 (ADR)** | 为什么做这个架构/产品决策 | `.far-design/DECISIONS/ADR-*.yaml`（21 个）+ `D-S5-*.yaml` + `D-REVIEW-*.yaml`（合计 24 项决策记录·计数以 `scripts/adr_count_check.mjs` 实测为准） | 低（决策冻结后稳定）| 读常驻；写需 P3 授权 |
| **教训记录 (Landmine)** | 已踩过的坑 + 盲区 + 已知缺陷 | `.far-design/BLIND_SPOT_REGISTER.yaml`（11 条）+ `.far-design/DESIGN_DEBT.yaml` + `.far-design/DEFERRAL_REGISTER.yaml` | 中（每次红队/审计追加）| 读常驻；写经审查 |
| **候选规则** | 观察到但未确认的模式/问题 | `.far-design/QUESTIONS.yaml` + `.far-design/RESEARCH_QUESTIONS.yaml` + `.far-design/ACTIVE_QUESTION.yaml` | 中（观察即登记）| 读按需；写自由 |
| **会话状态** | 当前任务/阶段/阻塞/续跑点 | `PROGRESS.md`（会话检查点）+ `.far-design/STATE.yaml` + `.far-design/AUTONOMOUS_STATE.md` | 高（每会话更新）| 读会话首；写会话末 |
| **工作记忆** | 跨会话即时上下文（偏好/约定/近期事实）| `.codebuddy/memory/YYYY-MM-DD.md`（日志）+ `.codebuddy/memory/MEMORY.md`（长期）| 高（每会话追加）| 读会话首；写会话末 |

> **铁律（AGENTS.md §3 单源真相）**: 同一个事实只存在于一个地方。决策进 ADR，不进 PROGRESS；会话进度进 PROGRESS，不进 ADR；盲区进 BLIND_SPOT_REGISTER，不散落注释。重复即腐化。

---

## 2. 决策记录 (ADR) 维护规范

### 2.1 现有格式（`.far-design/DECISIONS/ADR-001.yaml` 实测）

```yaml
adr_id: ADR-001              # 连续编号，forward-only
title: "产品 Thesis：三问证据验证"
status: accepted             # proposed | accepted | superseded | deprecated
context: "..."               # 决策时的背景事实
facts: "..."                 # 可验证的仓库事实（非推断）
assumptions: "..."           # 未验证的假设（显式标注）
forces: "..."                # 推动力（竞赛对齐/基线增量/...）
requirements: "BUS-001/002"  # 关联 REQUIREMENTS.yaml
quality_scenarios: "QS-FEC-01"  # 关联 QUALITY_SCENARIOS.yaml
options: ["C-01..C-10"]      # 被考虑的备选
simple_baseline: "..."       # 最小可行基线
decision: "..."              # 最终选择
rationale: "..."             # 为什么选这个（不是别的）
positive_consequences: "..."
negative_consequences: "..."  # 必须有（无负面后果的决策是戏剧）
risks: ["RSK-S5-01..04"]     # 关联 RISKS.yaml
prototype_evidence: "..."    # 支持决策的原型证据
migration: "..."             # 迁移路径（none 被拒，必须有或显式声明无）
rollback: "..."              # 回滚方法（必须可回滚）
reopen_triggers: ["..."]     # 什么情况下重开此决策
supersedes: null             # 取代了哪个旧 ADR
```

### 2.2 agent 何时读 ADR
- **架构/重构/契约变更任务前**（`AGENTS.md` §4.4 ANALYZE 阶段）：读相关 ADR，理解为什么现状是这样
- **遇到"为什么这样设计"疑问时**：先查 ADR，而非推测
- **trust-kernel 改动前**（`AGENTS.md` §7）：必读 `D-S5-02.concept-eliminations.yaml`（已淘汰概念）+ 相关 ADR

### 2.3 agent 何时写 ADR（P3 授权，非自动）
- 做出**新的架构/产品决策**（非实现细节）—— 例：选择新依赖、改变模块边界、引入新范式
- **推翻或取代**旧决策 —— 新 ADR 的 `supersedes` 指向旧 ADR，旧 ADR `status` 改 `superseded`
- **不写 ADR 的情况**：bug 修复、测试补充、文档更新、纯实现细节（这些进 PROGRESS 或 commit message）

### 2.4 ADR 编号规则
- 连续编号 `ADR-022`, `ADR-023`...（当前 21 个 + 3 个特殊前缀）
- forward-only：不回收编号，不重排
- 特殊前缀：`D-S5-*`（S5 阶段决策）、`D-REVIEW-*`（评审决策）—— 仅用于非连续主题决策

---

## 3. 教训记录 (Landmine) 维护规范

### 3.1 现有载体（三处，按性质分流）

| 载体 | 性质 | 现有内容 | 格式字段 |
|------|------|---------|---------|
| `.far-design/BLIND_SPOT_REGISTER.yaml` | 已发现盲区（设计未覆盖的攻击面/场景）| 11 条（BL-1..BL-11）| `id`/`spot`/`found_by`/`status` |
| `.far-design/DESIGN_DEBT.yaml` | 已知设计债（有意延后的重构）| 见文件 | （待核，按现有格式追加）|
| `.far-design/DEFERRAL_REGISTER.yaml` | 有意延期项（需真实资源/非代码可闭合）| 见文件 | （待核）|

### 3.2 agent 何时读 Landmine
- **红队/安全审查任务前**：读 `BLIND_SPOT_REGISTER.yaml`，了解已知攻击面
- **触及 trust-kernel 前**：读相关 BL 条目（如 BL-9 call_records 哈希、BL-10 启动 integrity_check、BL-11 WAL 尾丢失）
- **计划重构前**：读 `DESIGN_DEBT.yaml`，避免重复已延后的工作

### 3.3 agent 何时写 Landmine
- **红队发现新攻击面** → 追加 `BLIND_SPOT_REGISTER.yaml`（新 BL-12, BL-13...，`found_by` 填审查 trace_id）
- **发现"曾踩过同类坑"** → 追加 `DESIGN_DEBT.yaml`
- **遇到需真实资源才能闭合的项** → 追加 `DEFERRAL_REGISTER.yaml`（而非强行代码修复）

### 3.4 Landmine 写入铁律
- 每条必须有 `found_by`（发现方法/审查 trace）—— 无来源的盲区登记是断言
- 每条必须有 `status`（OPEN/已设计/已修复/登记）—— 状态显式
- `no_findings_evidence_basis` 字段保留（"未发现新盲区"也必须说明基于什么方法，见 `BLIND_SPOT_REGISTER.yaml:56`）

---

## 4. 候选规则晋升路径

### 4.1 现有载体
- `.far-design/QUESTIONS.yaml` —— 开放问题（待确认的模式）
- `.far-design/RESEARCH_QUESTIONS.yaml` —— 研究问题
- `.far-design/ACTIVE_QUESTION.yaml` —— 当前活跃问题

### 4.2 晋升流程（观察 → 确认 → 决策/规则）

```
agent 观察到重复模式/可疑行为
        │
        ▼
登记到 QUESTIONS.yaml（候选状态，标 UNCONFIRMED）
        │
        ▼  （经多次验证 / 红队确认 / 用户确认）
        │
   ┌────┴────┐
   ▼         ▼
是架构决策   是工程规则
   │         │
   ▼         ▼
写 ADR      写入 .claude/rules/*.md（路径触发规则）
（DECISIONS/）  或 AGENTS.md 对应章节
```

### 4.3 agent 何时写候选规则
- **观察到"这件事反复出问题"**（≥2 次）→ 登记到 `QUESTIONS.yaml`
- **不能直接写 ADR 或 rules**——候选规则必须先经确认，禁止把未验证的观察直接固化为规则

---

## 5. 会话状态维护（`PROGRESS.md` + `STATE.yaml`）

### 5.1 PROGRESS.md（会话检查点，`AGENTS.md` §10）

**新会话第一动作读**（`AGENTS.md` §2）：读 `PROGRESS.md` 顶部"本会话续跑点"段落，了解当前状态。

**会话末更新**（`AGENTS.md` §10）：追加 checkpoint，含：
- 当前状态（branch / 基线数字：typecheck/lint/test/demo）
- 已完成工作（带证据：commit hash + 命令输出）
- 待办项（按优先级）
- 排除方案（防盲目重试）
- 铁律提醒（trust kernel ADDITIVE ONLY 等）

> **卫生规则**: PROGRESS.md 历史 checkpoint 超过 30 天的，提炼要点到 `.codebuddy/memory/MEMORY.md` 后可归档到 `docs/historical/`。当前 556 行含 9+ 轮历史，已需提炼（见 `RESEARCH-FINDINGS.md` §3.3.3）。

### 5.2 STATE.yaml / AUTONOMOUS_STATE.md（自主状态机）
- `.far-design/STATE.yaml` —— 自主开发状态机（阶段/门禁/续跑点）
- `.far-design/AUTONOMOUS_STATE.md` —— 自主状态叙述
- agent 在自主开发流程中读写这两个文件（`DEVELOPMENT_ROADMAP.yaml:3` 提及 dev-pipeline-orchestrator 读取）

---

## 6. 工作记忆（`.codebuddy/memory/`）

### 6.1 载体（按 system prompt 定义）
- `.codebuddy/memory/YYYY-MM-DD.md` —— 日志（append-only，每日一文件）
- `.codebuddy/memory/MEMORY.md` —— 长期记忆（curated，更新替换）

### 6.2 agent 何时读
- **会话开始**：若任务可能涉及先前上下文，读 `MEMORY.md` + 最近的日日志（今日 + 昨日）

### 6.3 agent 何时写（强制，`AGENTS.md` §10 + system prompt）
- **会话末**：追加今日日志（完成的工作、决策、踩的坑）
- **用户告知偏好/约定**：更新 `MEMORY.md`（长期事实）
- **不写**: 临时搜索结果、临时文件路径、工具错误（这些是 transient，无跨会话价值）

### 6.4 与 `.far-design/` 的边界
- `.codebuddy/memory/` = **即时跨会话上下文**（agent 运行时偏好、近期决策摘要、约定）
- `.far-design/` = **项目治理真相源**（ADR/盲区/状态/契约——版本化、可审计）
- **不重复**: 一个决策确认后进 ADR，从工作记忆中移除（工作记忆只保留"待确认"或"摘要指针"）

---

## 7. 记忆体系维护铁律

1. **单源真相**（`AGENTS.md` §3）: 同一事实只存一处。违反 = 腐化。
2. **证据 > 断言**（`AGENTS.md` §4.1）: ADR 的 `facts` 必须可验证；Landmine 的 `found_by` 必须有 trace；候选规则必须标 `UNCONFIRMED` 直到验证。
3. **forward-only**: ADR 编号不回收；Landmine 的 BL-id 不回收；migration 不回改（`AGENTS.md` §7）。
4. **可回滚**: ADR 必须有 `rollback` 字段（`none` 被拒）；状态变更必须可追溯。
5. **诚实边界**: ADR 必须有 `negative_consequences`（无负面后果的决策是戏剧）；Landmine 的 `no_findings_evidence_basis` 必须说明基于什么方法。
6. **不预加载**: 记忆资产按需读取（`AGENTS.md` §2 + `agent/README.md` progressive disclosure），不全部预载进上下文。
7. **腐化检测**: 每次写记忆前，先读现有内容，确认不重复（同键覆盖，非同键追加）。

---

## 8. agent 快速参考（读这份文档后该做什么）

| 场景 | 读什么 | 写什么 |
|------|--------|--------|
| 新会话开始 | `PROGRESS.md` 顶部 + `.codebuddy/memory/` 近期 | — |
| 架构/重构任务 | 相关 `ADR-*.yaml` + `DESIGN_DEBT.yaml` | 若有新决策 → 写 ADR（P3 授权）|
| trust-kernel 改动 | `D-S5-02` + 相关 ADR + `BLIND_SPOT_REGISTER.yaml` | 改动 additive only（`AGENTS.md` §7）|
| 红队/安全审查 | `BLIND_SPOT_REGISTER.yaml` + `RISKS.yaml` | 新攻击面 → 追加 BL 条目 |
| 遇到"为什么" | `ADR-*.yaml`（按 `REPOSITORY_FACT_MAP.yaml` 索引）| — |
| 观察到重复问题 | `QUESTIONS.yaml` | 登记候选规则（UNCONFIRMED）|
| 会话结束 | — | 更新 `PROGRESS.md` + `.codebuddy/memory/YYYY-MM-DD.md` |
| 用户告知偏好 | — | 更新 `.codebuddy/memory/MEMORY.md` |

---

## 9. 现有资产清单（agent 可直接引用）

**决策记录**（`.far-design/DECISIONS/`，21 个 ADR-* + 3 个 D-* = 24 项）:
ADR-001..ADR-021（连续）+ D-S5-01.thesis-and-scope + D-S5-02.concept-eliminations + D-REVIEW-2026-07-27
（计数口径：`ADR-*.yaml` = 21；含 D- 前缀决策记录 = 24。对拍脚本 `scripts/adr_count_check.mjs`）

**教训/盲区**（`.far-design/`）:
`BLIND_SPOT_REGISTER.yaml`（BL-1..BL-11）+ `DESIGN_DEBT.yaml` + `DEFERRAL_REGISTER.yaml` + `RISKS.yaml`

**状态**（`.far-design/`）:
`STATE.yaml` + `AUTONOMOUS_STATE.md` + `RESUME.md` + `NEXT_WINDOW_PROMPT.md`

**候选规则**（`.far-design/`）:
`QUESTIONS.yaml` + `RESEARCH_QUESTIONS.yaml` + `ACTIVE_QUESTION.yaml`

**索引/追溯**（`.far-design/`）:
`REPOSITORY_FACT_MAP.yaml` + `EVIDENCE_INDEX.yaml` + `TRACEABILITY.csv` + `IMPACT_GRAPH.yaml` + `COVERAGE_MATRIX.yaml` + `GATE_MAP.yaml` + `COMPATIBILITY_MATRIX.yaml` + `CHANGE_IMPACT.yaml`

**会话检查点**:
`PROGRESS.md`（根目录）+ `CHANGELOG.md`（根目录）

**工作记忆**:
`.codebuddy/memory/MEMORY.md` + `.codebuddy/memory/YYYY-MM-DD.md`
