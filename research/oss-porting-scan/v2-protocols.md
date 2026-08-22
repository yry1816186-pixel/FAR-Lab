# OSS Porting Scan v2 — 类别：Agent 协议规范（框架无关序列化标准）

日期 2026-08-22。方法：GitHub API 实值（`gh api repos/{owner}/{repo}`，WebFetch 限流后改 gh CLI）+ spec 原文真读（A2A `specification/a2a.proto`、AG-UI `docs/concepts/events.mdx`）+ 本地代码逐行对照（`src/agent/protocol.ts`、`src/agent/rollout.ts`、`src/agent/subagents.ts`、`src/domain/provenance.ts`、`src/domain/hypothesis.ts`、`src/pipeline/stages/export.ts`、`src/server/api.ts`、`src/domain/run.ts`）。本 Agent 只读，未执行任何被调研代码。

---

## 1. 质量门表（API 实值）

| # | 仓库 | Stars | License | 最后 push | 门禁结果 |
|---|---|---|---|---|---|
| 1 | a2aproject/A2A | 25,455 | Apache-2.0 | 2026-08-21（昨日） | **PASS**。v1.0.1 发布于 2026-05-28（v1.0.0 2026-03-12）。LF Governance（repo 内 GOVERNANCE.md，Google 发起） |
| 2 | ag-ui-protocol/ag-ui | 15,486 | MIT | 2026-08-22（当日） | **PASS**。CopilotKit 主导，9 语言 SDK（repo `docs/sdk/{js,py,go,java,dotnet,rust,kotlin,ruby,dart}` 实存） |
| 3 | agentsmd/agents.md | 23,792 | MIT | 2026-03-12 | **PASS**（仅生态位段；见 §4.5） |
| 4 | agi-inc/agent-protocol（原 e2b-dev/agent-protocol，API 重定向证实已转移） | 1,455 | MIT | **2025-04-08（停更 ~16 个月）** | **KILL：停更>6 月**。星数过 500 但维护死亡——v1 REST task/step 设计实际被 A2A 吸收生态 |
| 5 | openpeng/agent-protocol | **0** | MIT | 2026-06-23 | **KILL：<500 星且无影响力豁免**。0 star/0 fork/0 issue，单作者，2026-06-11 建仓 6 周即弃更迹象；无任何已知采用者、无 LF/大厂背书 |
| 6 | JSON-Agents/Standard | **20** | Apache-2.0 | **2025-11-12（停更 9 个月）** | **KILL：<500 星 + 停更>6 月双重杀**。spec 仍是 `draft-jsonagents-spec-00.md`，无采用者证据，无豁免依据 |
| — | agntcy/*（org 仓库 slim-a2a-node、ai-catalog-go、agent-identity-demos 等） | 2–4 | 各异 | 活跃 | 不按仓库星数判：AGNTCY 是 LF AI & Data 项目（Cisco/Google/Accenture 等），生态位说明见 §4.5 |

**影响力豁免执行情况**：本类别无一仓适用豁免——A2A/AG-UI/agents.md 直接过星数门；agi-inc/agent-protocol 过星数但死于停更；openpeng 与 JSON-Agents 既无星也无采用者，豁免无据。

---

## 2. 过门项深评 ①：a2aproject/A2A（v1.0.1）

真读源：`specification/a2a.proto`（v1.0 起核心为 proto 定义的 gRPC + JSON 双序列化；specification/json/ 为 JSON 版）。

### 2.1 核心 schema（proto 实值）

- **TaskState 状态机**（a2a.proto:187-208）：`UNSPECIFIED | SUBMITTED | WORKING | COMPLETED | FAILED | CANCELED | INPUT_REQUIRED | REJECTED | AUTH_REQUIRED`，9 态。`INPUT_REQUIRED` 是人机协作挂起态；`REJECTED`/`AUTH_REQUIRED` 是服务端准入失败态。
- **Task**（:167）：`context_id + artifacts[] + history[] + metadata(Struct)`。TaskStatus 含 `Message + timestamp`。
- **Message**（:260）：role 仅 `user|agent` 二值；Part（:224）为 `oneof text|raw(bytes)|url|data(Value) + metadata + filename + media_type`。
- **Artifact**（:280）：仅 `name + description + metadata + extensions[]`。**无内容哈希/完整性概念**。
- **AgentCard**（:362）：`name + description + supported_interfaces[]（v1.0 多传输：JSON-RPC/gRPC/REST，首选在前）+ provider + version + documentation_url + capabilities + security_schemes + security_requirements + skills[]`。AgentSkill（:436）含 `examples/input_modes/output_modes/security_requirements`。**AgentCardSignature = RFC 7515 JWS 签名**（:441 区段）——卡片可验签。
- **RPC**：`SendMessage / GetTask / CancelTask / GetTaskPushNotificationConfig`（:21-102），push-notification webhook 配置内建。

### 2.2 对照 FAR-Lab 现有面（逐字段）

| A2A 概念 | FAR-Lab 对应（file:line 实证） | 可映射性 |
|---|---|---|
| TaskState 9 态 | `session_finished.status` 4 态 `completed/max_turns/aborted/failed`（protocol.ts:71）+ `RunStatus` 8 态 `created/queued/running/paused/partial/completed/failed/cancelled`（run.ts:5-7） | 映射表即可：`completed→COMPLETED`，`failed/aborted→FAILED/CANCELED`，`queued/created→SUBMITTED`，`running/paused→WORKING`（paused≈INPUT_REQUIRED 语义近似但不等价）。`max_turns` 无 A2A 对应（metadata 携带）。`partial` 无对应 |
| AgentCard 能力发现 | `src/agent/capabilities/`（目录实存）+ `SubagentSpec.toolNames` 工具白名单（subagents.ts:21）+ model-config | 概念同构（capability/skill/工具受限），但我们是进程内注入不是网络发现；AgentCard 只在跨实例时有意义 |
| Task/Message/history | `TranscriptEntry` 7 kinds（protocol.ts:32-59）+ `rollout.jsonl` 7 line-kinds（rollout.ts:19-26） | A2A Message 二值 role 装不下我们的 `task/context/steer/handoff` 区分；反向我们无需 context_id（session 即上下文） |
| Part.data/media_type | `tool_result.payload: unknown`（protocol.ts:50） | 弱映射，无采纳价值 |
| Artifact | `ctx.artifacts.put()` 内容寻址（export.ts:641,706 用其 sha256 hash） | **我们更强**：A2A Artifact 无哈希无完整性，我们的 content-addressed ref + bundle.artifactHashes 是科学复现刚需，反向映射是降级 |
| JWS AgentCard 签名 / security_schemes | 无（单机无网络面） | 不适用 |
| Push notification / SSE transport | 自建 SSE（api.ts:317-360，cursor/Last-Event-ID 续传） | A2A transport 面对我们无调用方 |

### 2.3 判定：A2A → **DEFER + REFERENCE**

- **内部 subagents 是否对齐 A2A 任务语义？否。** `runSubagents`（subagents.ts:42-86）是进程内函数调用（isolated loop、depth 上限、fail-closed），无网络边界、无发现、无准入——A2A 解决的三个问题我们都不存在。为对齐而对齐只会引入 context_id/服务端语义噪声。
- **采纳成本（若触发）**：低-中。一层 adapter（runStatus→TaskState 映射表 + AgentCard 从 capabilities 静态生成 + HTTP server），核心协议面（protocol.ts/rollout）零改动。
- **DEFER 触发器（任一满足即启动评估）**：
  1. 部署形态变为多实例/多机（子 Agent 跨进程边界编排）；
  2. 接入任何第三方 Agent 作为协作者（外部能力发现需要 AgentCard）；
  3. Direction-B 实验执行器拆为远程服务（远程 executor 以 A2A Agent 暴露，TaskState.INPUT_REQUIRED 恰好匹配长实验挂起语义）；
  4. SaaS 多租户阶段（AgentCard security_schemes + JWS 签名直接可用）。

---

## 3. 过门项深评 ②：ag-ui-protocol/ag-ui（agent↔frontend 事件协议）

真读源：`docs/concepts/events.mdx` 全文（zread）。与我们的链路 `AgentEvent(zod) → AgentEventSink → SSE(api.ts:323) → web/` 结构同构，重点对照。

### 3.1 核心 schema（文档实值）

16 个标准事件分 7 类，基础属性 `type + timestamp? + rawEvent?`：

- **Lifecycle**：`RunStarted(threadId, runId, parentRunId?, input?)` → … → `RunFinished(outcome: success|interrupt)` 或 `RunError(message, code?)`；中间可选多对 `StepStarted(stepName)/StepFinished(stepName)`。interrupt 判别联合 + `resume[]` 续跑契约。
- **TextMessage**：`Start(messageId, role) → Content(delta)* → End` 流式三元组（+ Chunk 语法糖自动展开）。role 枚举 `developer|system|assistant|user|tool`。
- **ToolCall**：`Start(toolCallId, toolCallName, parentMessageId?) → Args(delta: JSON 片段)* → End → ToolCallResult(messageId, content)`——调用规格与执行结果分离，参数增量流式。
- **State**：`StateSnapshot(全量)` / `StateDelta(RFC 6902 JSON Patch 数组)` / `MessagesSnapshot(重连/换页)`——snapshot-delta 同步模式。
- **Activity**：`ActivitySnapshot/ActivityDelta`（结构化进行中活动，同样 snapshot-delta）。
- **Special**：`Raw(event, source?)` 外部系统透传、`Custom(name, value)` 扩展。
- **Reasoning**：`ReasoningStart/End + Message 流式 + ReasoningEncryptedValue(加密思维链跨轮携带)`。
- 已废弃：THINKING_* → REASONING_*（1.0.0 将移除）。Draft：MetaEvent（thumbs_up 类旁注）、RunStarted.parentRunId 分支/时间旅行。

### 3.2 对照 FAR-Lab AgentEvent（protocol.ts:62-73，9 事件）

| 我们的事件 | AG-UI 最近对应 | 差异要点 |
|---|---|---|
| `session_started{sessionId, parentSessionId?, task, maxTurns}` | `RunStarted{threadId, runId, parentRunId?}` | **近同构**：parent 链、run 标识一一对应；`maxTurns/capability` 无对应（→Custom） |
| `turn_started{turn}` | `StepStarted{stepName}` | 同构；**我们缺 StepFinished**（turn 完成仅由下一事件隐式推出） |
| `model_call_done{latencyMs, usage}` | 无对应 | 观测维度是我们的独有优势；AG-UI 下只能 `Custom{name:'model_call_done'}` |
| `tool_used{tool, ok, durationMs, truncated, spilledTo, summary}` | `ToolCallStart/Args*/End` + `ToolCallResult` 的**压缩后验版** | 我们是执行后单事件；AG-UI 是规格/结果分离 + 参数流式。`spilledTo/truncated` 无对应 |
| `permission_asked{tool, granted}` | `RunFinished{outcome: interrupt, interrupts[]}` + resume | **语义级差异**：我们记录的是已裁决结果（审计流），AG-UI 是交互式挂起等待人类输入。二者目的不同，非映射关系 |
| `compaction{layer micro/full/degrade, tokensBefore/After}` | 无对应 | →Custom。压缩可见性是我们独有 |
| `steered` / `tool_note` | 无 / ≈ActivityDelta | steered→Custom；tool_note 结构上最接近 Activity 事件族 |
| `session_finished{status: completed/max_turns/aborted/failed}` | `RunFinished(success)` / `RunError` | `max_turns` 无对应（→Custom 或 outcome 扩展）；failed→RunError 天然 |
| （无） | TextMessage 流式三元组 | 我们不下发模型文本增量（loop 不流式输出到前端） |
| （无） | StateSnapshot/StateDelta(RFC 6902) | web/ 目前 GET /runs/:id 全量拉取 + SSE 事件驱动；无增量状态同步 |
| SSE cursor 续传（api.ts:325-329 Last-Event-ID/afterSeq） | `MessagesSnapshot` 重连语义 | **我们已用 cursor 序号解决了同一问题**（append-only 事件存储 + 断点续传），方案不同、目的已达成 |

### 3.3 判定：AG-UI → **DEFER + REFERENCE**

- **是否有对齐价值？** 单消费者（自有 web/）场景下**无采纳必要**：我们的 9 事件在观测维度（usage/latency/compaction/permission 裁决）上比 AG-UI 更贴自身内核，套 AG-UI 会把 4/9 事件挤进 Custom 逃逸口，反降表达力。
- **真有对齐价值的三个点（记为可选低成本借鉴，不引依赖）**：
  1. **Start/Content/End 流式三元组模式**——若未来前端要实时显示模型输出或子 Agent 进度文本；
  2. **StateDelta（RFC 6902）**——若 run 状态对象膨胀到全量拉取成为带宽/延迟瓶颈（当前规模无此问题，属过早优化）；
  3. **interrupt + resume 语义**——若 `permission_asked` 从"记录裁决"升级为"前端交互式授权"（产品化权限 UX 时）。届时应直接借 AG-UI 的 vocabulary 而非自造。
- **DEFER 触发器**：a) 前端需要模型文本/参数增量流式渲染；b) 出现第三方前端/SDK 消费我们的事件流（互操作需求）；c) permission 变为交互式人机回路；d) 状态同步带宽成为实测瓶颈。

---

## 4. 被杀项与生态位

### 4.1 openpeng/agent-protocol — **REJECT**（但用户描述属实）

真读其 repo：确实存在 "Agent Protocol Specification **v3.1.0**"（README 自述，Last Updated 2026-06-23）：`agent.json v3`（元数据）+ `worker.yaml`（pipeline 编排）+ 9 builtin tools + 子 Agent 系统（invoke_parallel）+ Skill/MCP 市场引用 + 9 平台部署适配；specs/ 下有 agent-json-v3.md、worker-yaml.md 等，schemas/ 有 agent/worker/team/workflow 四个 JSON Schema。**用户描述与实物一致，非幻觉**。但 0 star / 0 fork / 0 issue、单作者、无任何采用者与组织背书——不满足任何豁免依据，REJECT。其"agent 定义碎片化"问题陈述与 agents.md/AGNTCY 撞车，且后两者有生态。

### 4.2 agi-inc/agent-protocol（真·Agent Protocol，e2b 系）— **REJECT**

API 调用 `e2b-dev/agent-protocol` 返回的是 `agi-inc/agent-protocol`（仓库已转移至 AGI Inc）。1,455 星、MIT、tech-stack-agnostic task/step REST 接口——但最后 push 2025-04-08，停更超 16 个月，门禁死亡。生态结论：其"统一 Agent HTTP 接口"生态位已被 A2A 实质接管（旁证：AGNTCY 官方仓库 `agntcy/slim-a2a-node` 是"A2A JS SDK 的 SLIM 传输"——AGNTCY 在为 A2A 做传输层，而非另起协议）。

### 4.3 JSON-Agents/Standard — **REJECT**

20 星、停更 9 个月、spec 停在 draft-00。其内容（JSON Schema 2020-12 描述 agent 能力/runtime/治理，schema/ 含 capabilities/extensions/message-envelope）与我们的 capabilities + model-config 概念有重叠但无一处更强；无采用者。即使按"标准影响力豁免"也找不到依据（无 LF/大厂/已知采用者）。死档不引。

### 4.4 对核心问题 ① 的回答（zod 判别联合 + 导出 bundle 是否映射外部标准）

**结论：KEEP 自有标准为权威，不做外部标准映射。** 理由：
- 我们的序列化面（AgentAction/TranscriptEntry/AgentEvent 判别联合 + rollout.jsonl + ReproducibilityBundle）每一处都有比候选标准更强的领域字段（provenance receipts、content-hash、executionMode live/test_only、limitations 强制诚实清单——provenance.ts:66-101、export.ts:667-670）；A2A/AG-UI 均无对应概念，映射即降级。
- 对外互操作已经由**更适合的层**承担：科学语义层走 SWAN JSON-LD（toSwanJsonLd，hypothesis.ts:140-153，W3C 稳定标准）、RO-Crate 信封已 DEFER、第三方核验走 `far verify --bundle`（export.ts:686）。Agent 协议层无需第二个对外承诺。
- 事件流（AgentEvent）与 A2A/AG-UI 的映射表已在本报告 §2.2/§3.2 留档——未来触发时按表写 adapter 即可，成本已被这次尽调预先压低。

### 4.5 AGNTCY / agents.md 生态位一段（不深读）

**agentsmd/agents.md**（23.8k 星，MIT）：AGENTS.md 是"指导编码 Agent 的开放文件格式"（类 robots.txt 的上下文约定），我们自身已是采用者（workspace AGENTS.md）——它是**上下文注入约定而非序列化协议**，与本类别正交，无移植动作，REFERENCE 即可。**AGNTCY**（LF AI & Data，Cisco/Google 等）：定位"Agent Internet"基础设施——Agent Directory（目录/发现）、Agent Identity、SLIM 传输、OASF 分类；其仓库矩阵（slim-a2a-node、ai-catalog-*、agent-identity-demos）显示它**不另造应用层协议，而是在传输/身份/发现层包 A2A**。对 FAR-Lab 的含义：若未来做多实例互操作，跟随 A2A 即自动进入 AGNTCY 兼容轨道，无需单独研究 AGNTCY。

---

## 5. 类别净结论

| 项 | 决策 | 一句话依据 |
|---|---|---|
| a2aproject/A2A | **DEFER(触发见 §2.3) + REFERENCE** | 真标准（LF、25k 星、v1.0.1）但全部价值在网络边界，我们无跨实例调用方；映射表已留档，触发后 adapter 成本低 |
| ag-ui-protocol/ag-ui | **DEFER(触发见 §3.3) + REFERENCE** | 与我们 AgentEvent→SSE 链路同构且设计精（snapshot-delta/interrupt/流式三元组），但单消费者下我们的事件观测维度更强；三个可借鉴语义已记档 |
| agi-inc/agent-protocol | **REJECT** | 真 Agent Protocol 但停更 16 个月，生态位已被 A2A 接管 |
| openpeng/agent-protocol | **REJECT** | 描述属实但零采用零背书 |
| JSON-Agents/Standard | **REJECT** | 20 星 + 停更 9 月 + draft |
| agents.md / AGNTCY | **REFERENCE** | 前者已是我们的实践；后者是 A2A 的传输/发现包装层 |

**内部标准对齐建议（净）**：KEEP `src/agent/protocol.ts` 判别联合为唯一权威；不引任何外部协议依赖；将 AG-UI 的 interrupt/StateDelta/流式三元组三个语义记为"触发即借 vocabulary 不引实现"。

**互操作 DEFER 触发器清单（汇总，供 EXECUTION_STATE/决策面引用）**：
1. A2A：多实例部署 / 第三方 Agent 协作 / 远程 Direction-B executor / SaaS 多租户（任一）。
2. AG-UI：前端需模型输出流式渲染 / 第三方前端消费事件流 / permission 变交互式 / 状态同步成实测瓶颈（任一）。
3. RO-Crate（既有 DEFER 维持）：bundle 需被科研数据平台（Zenodo 类）直接装载时。

**未验证项（UNVERIFIED）**：AG-UI 16 事件在 TS SDK 的 zod/类实现细节（sdks/typescript/src 路径 404，monorepo 已重构，本文档级真读以 docs/concepts/events.mdx 为准）；A2A JSON 序列化与 proto 的字段级全量一致性（仅抽验核心 message）。
