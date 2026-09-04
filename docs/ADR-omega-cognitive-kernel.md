# ADR: Ω-ULTRA Cognitive Kernel 与统一执行基底（Wave A）

- 日期：2026-09-02 ｜ 状态：ACCEPTED（Wave A 实施依据）｜ 决策人：Ω 主会话
- 证据：四路仓库实测地图（2026-09-02）+ 三路外部源码级评测（AI-Scientist-v2@96bd516 / aviary@a39a658 / paper-qa@57e89f7 / OpenHands-sdk@94fca57 / SWE-agent@3ea751c / dbos-transact-ts@39717dec / langgraphjs@0e1142e / temporal-sdk-ts@66effbd，许可证逐核；取证方式=GitHub API 于钉死 SHA 直读核心源码，物理 clone+run 未做——本 ADR 的全部裁决为模式采用而非代码引入，运行时验证留到首次 EXTRACT 具体代码前补做）

## 问题（系统级瓶颈 1/2/5 + 补充 7/8）

1. 12 阶段 fixed pipeline 是最高科研控制逻辑（STAGE_ORDER 编译期常量，3 条硬编码 reopen，质量门靠 cursor 手术回跳）——所有问题同一剧本。
2. 四个编排面（orchestrator / agent kernel / campaign driver / experiment scheduler）lease/checkpoint/budget/audit 手写多遍、零共享原语；StageContext 拿不到 kernel 能力（工具循环/subagent/沙箱），conversation-agent 是 836 行的第二套工具循环。
3. kernel 传输层每动作全量 transcript 重序列化（P7 最大单点）；compaction 改写 transcript。

## 决策

### D1 形态：固定原语协议 + 动态组合循环（否决纯动态 workflow）

三系统共性证据：AI-Scientist-v2 固定 4 主阶段+LLM 动态子目标；aviary/paper-qa 恒定环境原语+动态性全在工具循环。没有系统让 LLM 每步重发明协议。
**裁决**：12 个既有 stage 降级为**原语**（保留全部实现），Kernel 在其上做动态组合；不重写 stages，不发明自由形式控制流。

### D2 事件溯源为统一脊柱（已有 events 表升级为一等事实源）

OpenHands 证据：事件日志=唯一事实源，LLM 上下文/状态=派生视图，condensation 是不可变日志上的纯视图变换。
**裁决**：`events` append-only 表（已存在）成为全部编排面的统一事实源；scientific-state/memory/LLM 上下文全部改为其派生视图（read-time projection 模式已有雏形 domain/scientific-state.ts）；kernel compaction → **condensation-as-event**（记 forgotten_ids+summary，transcript 永不改写）。迁移后 UI replay/fork/resume 天然成立。

### D3 统一 durable 基底：自研收敛共享原语（否决三外部候选）

dbos-ts 需 Postgres、langgraph-sqlite 需 better-sqlite3 原生、temporal 需独立 server+Rust NAPI——各撞硬约束（zod-only/node:sqlite/单机）。我们已手抄 dbos OAOO（checkpointed、scheduler fence token），本来就在此路上。
**裁决**：以 dbos `system_db_schema`（workflow_status/operation_outputs/queues 语义）为蓝本 + SqliteSaver 写冲突语义（IGNORE/REPLACE+特殊通道）收敛共享原语。**范围修订（2026-09-02 切片实现对拍后，按反悔触发条款预防性行使）**：orchestrator 租约（单写者行级、TTL+watchdog 收养）与 scheduler fence（原子优先队列领取、token 递增）语义不同构——lease/checkpoint 保持各自实现（写域分离本就是既有裁决 scheduler.ts:12-25）；基底收敛到真共享件：事件脊柱词汇、OAOO step_outputs、预算视图、cancel/steer 桥（wire AbortSignal ↔ persisted cancelRequested）、deadline guard。新执行面（agent 步）一律经共享件，存量编排面不强行迁移。

### D4 Workflow-as-data：计划成为类型化域对象

**裁决**：新增 `WorkflowPlan` 域对象（zod：steps[{kind: stage|agent|experiment|human, target, deps, completion 谓词, 迭代上限, 预算份额}]）；`defaultWorkflow(question)` = 现 STAGE_ORDER 策略；orchestrator 主循环改为执行计划而非数组；3 条 reopen 通道与质量门回跳统一为**计划修订操作**（audit event 记录修订理由）；完成谓词/迭代上限/截断语义一等公民（三系统教训：否则动态循环不收敛）。

### D5 能力面：StepContext 开放 kernel 能力

**裁决**：StageContext 后继者 StepContext 增加 `runAgent(capability, task, resultSchema)`、`runExploration(code)`、MCP 工具访问——stages 获得工具循环/subagent/沙箱；conversation-agent 与 kernel 收敛为单一 runtime（删除 836 行平行实现，迁移其对话面到 kernel loop + 会话事件流）。产物走既有 36 域对象，不新增平行 JSON。

### D6 kernel 补齐（SWE-agent/OpenHands 模式 EXTRACT）

stuck detector 五模式+nudge、退出码终态分类学、requery 纠错不污染主历史、agent.verify 工具契约（resume 时校验）、unmatched-action 崩溃恢复。KEEP：one-JSON-action 协议、subagents、MCP、Docker 沙箱/sidecar。

## 迁移纪律（增量、可验证、可回滚）

1. substrate 先并行落地，与 orchestrator/scheduler 现实现**对拍**（行为等价测试）后逐面切换。
2. WorkflowPlan executor 先以 defaultWorkflow（=STAGE_ORDER）跑通全量 pin 对拍（eval/omega compare，锚点=omega-baseline-w0 CURRENT 腿），指标不降才开动态组合。
3. conversation-agent 收敛与 StageContext→StepContext 分独立切片，各配删除 ticket。
4. 每切片走增量档验证；Wave A 出口走全量门禁 + pin 对比 + corpus-check。

## 删除 ticket（D5 纪律）

- T1：旧 orchestrator 主循环（计划执行器等价替换后，触发条件=pin 对比通过）
- T2：conversation-agent.ts 平行工具循环（触发=对话面迁移完成 + conversation e2e 绿）
- T3：kernel 旧 compaction 改写路径（触发=condensation 事件化 + rollout 回归绿）

## 删除 ticket 状态（2026-09-03 夜批）

- **T1 ✓ 构造性闭**：计划驱动执行器等价替换 + 全量门禁绿（Wave A 出口对账在 MISSION STATE）。
- **T2 侦察判决：收敛而非删除，当前不可触发**。2026-09-03 只读侦查（file:line 证据链入会话）证实：
  「第二套工具循环」指控已过时——conversation-agent.ts:11,712 与 capability-plane.ts:117 同跑
  runAgentLoop，真正平行的只是 ~60 行 assembly/telemetry/rollout 包装。kernel plane 缺口（无流式
  出口 emit=no-op、无 resume 透传、无 skills、runId 必填不适配 workspace 级对话）恰是对话面核心
  UX；web/e2e 零 conversation spec，「conversation e2e 绿」前置客观不成立。收敛形态：扩展
  KernelAgentRequest（emit/onModelOutput/initialTranscript+resume/skills/作用域放宽）后让
  generateConversationTurn 改走 plane，被替代包装段才成为删除对象。
- **T3 ✓ 闭（a49050d）**：事实核验——持久层本已事件化（pushEntry 即时落盘 loop.ts:190、rollout
  仅 append、compacted=基线事件、reconstructSession=纯投影、effect ledger 独立存活）；票面缺口仅
  compacted 事件缺遗忘集。补 forgotten {entries, turns}（ADR D2 字面要求）+ loop/rollout 双回归，
  全量门禁 244 文件 2440 测试 exit 0。已知残余（如实披露）：micro 压缩不落事件（原条目仍在日志，
  可推导；replay 后视图偏胖无害）。

## 反悔触发

- substrate 对拍发现 scheduler/orchestrator 语义无法统一（写域冲突不可参数化）→ 回退为共享类型+各自实现。
- WorkflowPlan 在 pin 对比上指标下降且两周内无法归因 → 冻结动态组合，保留计划执行器仅作等价重构。
