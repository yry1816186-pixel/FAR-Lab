# FAR-Lab Wave-8 Research Report: ag2 + smolagents Mechanism Analysis

**Date:** 2026-08-22
**Repositories Analyzed:**
- ag2 (microsoft/autogen successor): Apache-2.0
- huggingface smolagents: Apache-2.0

**FAR-Lab Context:** TypeScript run engine with 11 persisted stages in node:sqlite.
Pains: P1 frozen-run detection, P2 detached-execution kill recovery, P3 mid-stage resume granularity.

---

## SECTION A: ag2 (AG2ai/microsoft autogen successor)

### A1. HUMAN INPUT MODES

| 维度编号 | 机制名 | 源码位置 | 做法摘要 | 为何高价值/创新 | 移植成本估计 | 风险/许可 | FAR-Lab现状对照 |
|---------|--------|----------|----------|----------------|-------------|-----------|-----------------|
| D1 | HumanHook HITL Middleware | `ag2/hitl.py:16-53` | 定义 HumanHook 类型别名（支持 sync/async callable），wrap_hitl() 将 hook 包装为 middleware 链，default_hitl_hook() 抛出 HumanInputNotProvidedError。Middleware 通过 on_human_input() 链式处理 HumanInputRequest 事件。 | 现代化 HITL 架构：middleware 组合模式替代旧 autogen 的 NEVER/TERMINATE/ALWAYS 三态枚举。支持异步 human-in-the-loop，可插入 UI/CLI/测试桩。 | **低** (TS async middleware 模式直接映射) | Apache-2.0, NOTICE.md 存在 | FAR-Lab 无 HITL 机制；需新增 HumanInputRequest 事件类型和 middleware 扩展点 |
| D4 | AgentRun Context Manager | `ag2/agent.py:400-547` | AgentRun 作为 async context manager：__aenter__ 初始化 turn scope 并注册 subscribers（LLM callback, HITL, tool executor）；result() 驱动 turn 并返回 AgentReply（idempotent）；__aexit__ 取消未完成任务。Push-based observation：subscribe before driving。 | Turn 生命周期管理最佳实践：scope-owned task 防止资源泄漏，支持 start() 后台驱动 + result() 等待分离。解决 P2 detached-execution kill 的结构基础。 | **中** (需适配 TS async context manager 语义到 node:async_hooks 或手动 scope) | Apache-2.0 | FAR-Lab 有 stage scope 但无 turn-level cancellation 语义 |
| B4 | HumanInputRequest Event | `ag2/hitl.py:11`, `ag2/events.py:45` | HumanInputRequest 继承 BaseEvent，通过 context.send(event) 发送到 stream。HITL middleware 拦截并转换为 HumanMessage。 | 事件驱动 HITL：解耦 human input 来源（CLI/UI/API）与处理逻辑。支持多 observer 同时监听（UI 更新 + 日志）。 | **低** (事件类 + stream 发布模式) | Apache-2.0 | FAR-Lab events 表可扩展此事件类型 |

### A2. CACHE / LLM CALL DEDUPLICATION

| 维度编号 | 机制名 | 源码位置 | 做法摘要 | 为何高价值/创新 | 移植成本估计 | 风险/许可 | FAR-Lab现状对照 |
|---------|--------|----------|----------|----------------|-------------|-----------|-----------------|
| D5 | Provider-Level Prompt Caching | `ag2/config/anthropic/anthropic_client.py:111,210-221`, `ag2/config/mistral/config.py:36,67,93`, `ag2/config/openai/config.py:53,95,133` | 各 LLM provider client 注入 provider-specific cache 控制：Anthropic cache_control: {type: ephemeral} 头；Mistral prompt_cache_key 参数；OpenAI prompt_cache_key 透传。非框架级 dedup，而是利用 provider 原生缓存能力。 | 降低重复 prompt 成本（尤其长 system prompt 场景）。但 **无框架级 Cache 类** 做 chat history keying 和结果复用——这是与旧 autogen 的关键差异。 | **极低** (仅需在 TS LLM client 配置层添加可选 cache 参数) | Apache-2.0 | FAR-Lab 可直接采用；当前无任何 caching |
| G3 | History Storage Protocol | `ag2/history.py:14-51` | Storage Protocol 定义 save_event(), get_history(), set_history(), drop_history()。MemoryStorage 默认实现用 defaultdict[StreamId, list[BaseEvent]] 内存存储。History 类封装 stream_id + storage，提供 get_events() 和 replace()。 | 可插拔持久化后端：可替换为 sqlite 实现映射到 FAR-Lab node:sqlite。StreamId 作为 key 天然对应 run_id。 | **低** (Protocol → TS interface, MemoryStorage → sqlite wrapper) | Apache-2.0 | FAR-Lab 已有 node:sqlite events 表；可直接实现 Storage interface |

**关键发现：ag2 无传统 Cache 类（旧 autogen 的 Cache class 用于对相同 chat history 去重 LLM 调用）。新架构依赖 provider 缓存 + History event log。**

### A3. TERMINATION CONDITIONS

| 维度编号 | 机制名 | 源码位置 | 做法摘要 | 为何高价值/创新 | 移植成本估计 | 风险/许可 | FAR-Lab现状对照 |
|---------|--------|----------|----------|----------------|-------------|-----------|-----------------|
| D6 | Task State Machine | `ag2/task.py:60-76` | TaskState Enum: CREATED → RUNNING → [COMPLETED | FAILED | EXPIRED | CANCELLED]（terminal states 不可变）。TERMINAL_TASK_STATES frozenset 用于守卫检查。 | 清晰的 lifecycle 状态机：防止非法状态转换，terminal state 幂等性（complete/fail/expire 对已 terminal 任务 no-op）。直接映射 FAR-Lab runs.status 字段语义。 | **极低** (Enum 直接移植) | Apache-2.0 | FAR-Lab 有 status 字段但缺 formal state machine 守卫 |
| D6 | Task Checkpoint/Resume | `ag2/task.py:80-97,396-413,423-424` | CheckpointStore Protocol: write(task_id, state) + read(task_id) -> dict|None。Task 构造时接受 checkpoint_store + resume_from。checkpoint(state) 方法持久化 owner-defined opaque JSON dict。Resume 时通过 resumed_state 属性暴露。 | Owner-controlled checkpoint：framework 不检查 payload 内容，owner 决定 checkpoint 什么、何时 checkpoint、如何解释 resume state。完美匹配 FAR-Lab 的 deterministic embedded 约束。 | **低** (Protocol → sqlite read/write, JSON 序列化已有) | Apache-2.0 | FAR-Lab 有 checkpointRef schema field 但 **零用户**——此机制可激活它 |
| B4 | Task Lifecycle Events | `ag2/task.py:36-44,279-349` | Task 发出 typed events: TaskStarted, TaskProgress, TaskCompleted, TaskFailed, TaskExpired, TaskCancelled。每个 terminal transition 都有对应 event + metadata 更新（completed_at, error 等）。 | Event-sourced lifecycle：observer 可追踪完整生命周期而不参与执行。支持 network mirror 远程观测。 | **中** (需定义 TS event types + publish 到 events 表) | Apache-2.0 | FAR-Lab events 表是 append-only journal；天然兼容 |

**关键发现：ag2 无 TerminationCondition composition 类（旧 autogen 的 MaxMessageTermination, TextMentionTermination, TokenUsageTermination）。新架构使用 Task lifecycle + owner-defined termination logic。**

### A4. GROUP CHAT STATE + SAVE/LOAD

| 维度编号 | 机制名 | 源码位置 | 做法摘要 | 为何高价值/创新 | 移植成本估计 | 风险/许可 | FAR-Lab现状对照 |
|---------|--------|----------|----------|----------------|-------------|-----------|-----------------|
| - | GroupChat (REMOVED) | `website/mkdocs/_website/llms_txt.py:44` | 文档明确声明：initiate_chat, GroupChat has been removed — do not use it. | **机制不存在**。ag2 放弃了旧 autogen 的 multi-agent group chat manager 模式，转向 single-agent + subtask spawning（TaskConfig, run_task tool）。 | N/A | N/A | Apache-2.0 | FAR-Lab 当前也是单 agent loop；无需移植 |
| D5 | Subtask Spawning | `ag2/agent.py:102-121`, `ag2/tools/subagents/run_task.py` | TaskConfig dataclass 定义子任务参数继承规则（tools include/exclude/extra）。Subtask Agent 继承 parent tools 但不接收 run_subtask tool（防止递归）。run_task tool 实现 subtask 调用。 | 结构化子任务：替代 GroupChat 的 managed delegation。Depth limiting 通过工具白名单自然实现（无递归风险）。 | **中** (需实现 subtask lifecycle 管理 + 工具注入) | Apache-2.0 | FAR-Lab 无 subtask 机制；如需 multi-step decomposition 可考虑 |

---

## SECTION B: smolagents (HuggingFace)

### B1. AGENT LOOP: run() STEP LOOP

| 维度编号 | 机制名 | 源码位置 | 做法摘要 | 为何高价值/创新 | 移植成本估计 | 风险/许可 | FAR-Lab现状对照 |
|---------|--------|----------|----------|----------------|-------------|-----------|-----------------|
| D1 | MultiStepAgent._run_stream() Generator | `smolagents/agents.py:540-611` | 核心循环：while not returned_final_answer and step_number <= max_steps。每步 yield ActionStep/PlanningStep/FinalAnswerStep。Generator 模式支持 streaming (stream=True 返回 generator) 和 non-streaming（list(_run_stream(...)) 收集所有步骤）。 | **Streaming-first 设计**：generator 自然支持实时 UI 更新（Rich Live display）和事后回放。Step-numbered execution 映射 FAR-Lab events 表的 append-only 语义。 | **低** (TS generator/async iterator 直接映射) | Apache-2.0 | FAR-Lab 有 11 stages 但缺 step-level granularity；此机制的 step_number 可作为 events.step_id |
| D4 | max_steps Termination | `smolagents/agents.py:545,606-611` | max_steps 参数（默认 20）控制最大迭代次数。超出时调用 _handle_max_steps_reached() 生成最终答案并标记 AgentMaxStepsError。RunResult.state 区分 success vs max_steps_error。 | 显式 budget control：防止无限循环 LLM 调用。Error 状态保留在 RunResult 中而非静默失败。 | **极低** (整数计数器 + 状态标志) | Apache-2.0 | FAR-Lab 无 per-run step limit；P1 frozen-run 检测可借鉴此 max_steps + timeout 双重保护 |
| D5 | Step-Numbered Memory | `smolagents/memory.py:50-90` | ActionStep dataclass 包含 step_number: int, timing: Timing, model_input_messages, tool_calls, observations, error, token_usage。.dict() 方法序列化为 JSON-compatible dict。.to_messages() 转换为 LLM input messages（含 summary_mode 参数用于压缩历史）。 | **结构化 memory persistence**：每步完整记录（input/output/error/tokens）可直接序列化到 sqlite。to_messages() 的 summary_mode 解决上下文窗口限制（P3 resume granularity 的核心问题）。 | **中** (dataclass → TS interface, .dict() → sqlite row, .to_messages() → context reconstruction logic) | Apache-2.0 | FAR-Lab events 表可存储 ActionStep.dict() 输出；summary_mode 可优化 resume 时的 context rebuild |

### B2. ERROR RECOVERY IN-LOOP

| 维度编号 | 机制名 | 源码位置 | 做法摘要 | 为何高价值/创新 | 移植成本估计 | 风险/许可 | FAR-Lab现状对照 |
|---------|--------|----------|----------|----------------|-------------|-----------|-----------------|
| D6 | Error-to-Observation Feedback Loop | `smolagents/agents.py:594-602`, `smolagents/memory.py:138-148` | **核心机制**：_run_stream() catch AgentError（非 AgentGenerationError），将 error 存入 action_step.error，然后 action_step.to_messages() 生成包含错误信息的 TOOL_RESPONSE message：Error: {str(e)} Now let's retry: take care not to repeat previous errors!... 下轮 LLM 调用自动接收此错误作为 context。 | **Self-healing agent loop**：错误不终止运行，而是转化为观察反馈给 LLM 让其自我纠正。这是 ReAct 框架的关键 resilience 特性。直接解决 P2 detached-execution kill 后的恢复问题（error state 已持久化在 memory 中）。 | **低** (try/catch + error message 格式化 + memory append) | Apache-2.0 | FAR-Lab 当前 killed worker 丢失状态；此机制让 error 成为 first-class memory citizen |
| D5 | Double Truncation Strategy | `smolagents/utils.py:257-265`, `smolagents/agents.py:1752-1753` | truncate_content(content, max_length) 执行 head+tail 截断：保留前 max_length//2 字符 + truncation notice + 后 max_length//2 字符。CodeAgent 在 line 1752 对 code_output.output 二次截断后拼入 observation。 | **防止 context explosion**：双层截断确保即使大输出也不会撑爆 LLM context window。Head+tail 策略保留关键信息（开头结论 + 结尾数据）。 | **极低** (字符串切片函数) | Apache-2.0 | FAR-Lab 无 observation 截断；长时间运行的 agent 可能因累积大 observations 而 OOM |
| D4 | Parsing Error Classification | `smolagents/agents.py:804-807,1331,1711-1713` | 三层异常层次：AgentParsingError（格式解析失败，可重试）、AgentExecutionError（工具执行失败，可重试）、AgentGenerationError（LLM 调用失败，不可重试-raise 终止）。_run_stream() line 595-596 只 raise AgentGenerationError，其他错误继续循环。 | **Structured error handling**：区分 fatal vs recoverable errors。Fatal error 立即终止避免浪费 token；recoverable error 进入 feedback loop。 | **低** (异常类层次 + catch filter) | Apache-2.0 | FAR-Lab 无错误分类；所有错误可能同等对待或静默丢失 |

### B3. MONITORING / STEP-CALLBACK OBSERVABILITY + TOKEN COUNTING

| 维度编号 | 机制名 | 源码位置 | 做法摘要 | 为何高价值/创新 | 移植成本估计 | 风险/许可 | FAR-Lab现状对照 |
|---------|--------|----------|----------|----------------|-------------|-----------|-----------------|
| B4 | CallbackRegistry (Per-Type Step Hooks) | `smolagents/memory.py:280-316` | CallbackRegistry 维护 dict[Type[MemoryStep], list[Callable]]。register(step_cls, callback) 按步骤类型注册。callback(memory_step, **kwargs) 通过 MRO 遍历调用所有匹配回调（支持单参数和多参数签名向后兼容）。 | **类型安全的事件钩子**：不同步骤类型（ActionStep/PlanningStep/FinalAnswerStep）可有不同监控逻辑。MRO 匹配允许基类回调自动应用于子类。 | **低** (Map<Type, Callback[]> + 反射调用) | Apache-2.0 | FAR-Lab 无 step-level 回调系统；stage-level hooks 过于粗粒度 |
| G3 | Monitor Token Accumulator | `smolagents/monitoring.py:82-117` | Monitor 类跟踪 total_input_token_count, total_output_token_count, step_durations[]。update_metrics(step_log) 在每步结束时调用（通过 _finalize_step() → step_callbacks.callback() chain）。输出格式：[Step N: Duration Xs | Input tokens: Y | Output tokens: Z]。 | **Real-time cost visibility**：运行时累计 token 用量，支持预算控制（可与 max_steps 结合做 dual-limit termination）。Step duration 监控检测慢速步骤（P1 frozen-run 检测的数据源）。 | **极低** (计数器累加 + 格式化输出) | Apache-2.0 | FAR-Lab 无运行时 token tracking；仅靠事后 billing 发现超支 |
| D5 | TokenUsage Dataclass | `smolagents/monitoring.py:37-54` | TokenUsage(input_tokens, output_tokens) 自动计算 total_tokens = input + output。.dict() 序列化为 JSON。嵌入每个 ActionStep 和 PlanningStep。 | **Granular token accounting**：每步独立计费，支持事后分析哪步消耗最多 token（优化 prompt engineering 的数据来源）。 | **极低** (dataclass with computed property) | Apache-2.0 | FAR-Lab objects 表可存储 TokenUsage dict；缺失 per-step granularity |
| B4 | Step Finalization Hook | `smolagents/agents.py:620-623` | _finalize_step(memory_step) 在每步结束调用（finally block 确保）：设置 end_time，调用 self.step_callbacks.callback(memory_step, agent=self)。 | **Guaranteed callback execution**：即使步骤抛出非 fatal error，finalization 仍运行（monitoring 数据不丢失）。 | **低** (try/finally + method call) | Apache-2.0 | FAR-Lab stage completion回调可能因异常跳过 |

---

## FAR-Lab FUSION CANDIDATES (Ranked against P1/P2/P3)

### TOP 1: smolagents Error-to-Observation Feedback Loop (D6)
**Addresses:** P1 (frozen-run), P2 (detached-execution kill recovery), P3 (mid-stage resume)

**Mechanism:** `smolagents/agents.py:594-602` + `smolagents/memory.py:138-148`

**Why #1:**
- **P1 Frozen-run detection**: Error state persisted in step memory → resume 时 LLM 自动看到上次错误并自我纠正，无需人工干预
- **P2 Kill recovery**: Killed worker 的最后一步 error 已写入 memory（如果 kill 发生在 step boundary）；resume 从 next step 继续
- **P3 Resume granularity**: Step-numbered memory + error field = 精确知道 resume 从哪步开始，且知道上步为何失败

**KEEP Comparison vs Current FAR-Lab:**
- Current: Killed worker → status=running forever, 0 partials auto-resumed
- Proposed: Each step finalizes memory (including errors) before incrementing step_number → crash at any point leaves complete previous steps + current step error state → resume loads memory, continues from step_number+1

**Porting Effort:** ~2-3 days (TS error classes + memory dataclass + _run_stream try/catch + to_messages() error formatting)

### TOP 2: ag2 Task Checkpoint/Resume Protocol (D6)
**Addresses:** P3 (resume granularity), P2 (kill recovery)

**Mechanism:** `ag2/task.py:80-97,396-413,423-424`

**Why #2:**
- **Owner-controlled opaque state**: FAR-Lab 已有 checkpointRef schema field（零用户），此协议可正式激活它
- **JSON-serializable dict**: 直接存入 node:sqlite objects 表，无需新 schema
- **Resume-from-task-id**: 支持 resume_from=prior_run_id 模式，读取 prior checkpoint 继续执行

**KEEP Comparison vs Current FAR-Lab:**
- Current: checkpointRef field exists but unused, mid-stage kill loses 100% completed subtasks
- Proposed: Agent calls task.checkpoint({step_number, memory_hash, partial_results}) at strategic points → kill 后新 worker Task(resume_from=killed_task_id) 读取 _resumed_state 继续

**Porting Effort:** ~2 days (CheckpointStore sqlite implementation + Task constructor resume logic)

### TOP 3: smolagents Monitor + CallbackRegistry (G3+B4)
**Addresses:** P1 (frozen-run detection via step duration monitoring), Cost control

**Mechanism:** `smolagents/monitoring.py:82-117` + `smolagents/memory.py:280-316`

**Why #3:**
- **Step duration tracking**: Monitor.step_durations[] 记录每步耗时 → 可检测 frozen step（duration > threshold → alert/terminate）
- **Token budget accumulation**: Real-time token counting → 可实现 TokenUsageTermination （ag2 缺失但 smolagents 有原始数据）
- **Per-type callbacks**: 不同 step type 不同监控逻辑（e.g., PlanningStep 记录 plan quality metric, ActionStep 记录 tool success rate）

**KEEP Comparison vs Current FAR-Lab:**
- Current: No runtime observability, frozen-run detected only after 93-243min undetected
- Proposed: After each step, monitor.update_metrics(step_log) checks duration > 5min? → emit FROZEN_WARNING event; total_tokens > budget? → emit TERMINATE event

**Porting Effort:** ~1-2 days (Monitor class + CallbackRegistry + integrate into existing stage completion hooks)

### TOP 4 (Honorable Mention): smolagents Double Truncation (D5)
**Addresses:** P3 (context window management on long-running agents)

**Mechanism:** `smolagents/utils.py:257-265`

Why considered but ranked lower:
- Simple string utility, high value but trivial to implement independently
- Prevents OOM on long-running agents with large observations
- Should be combined with Top 1 (error messages also get truncated before feeding back to LLM)

**Porting Effort:** ~2 hours (single function port)

### TOP 5 (Honorable Mention): ag2 History Storage Protocol (G3)
**Addresses:** General architecture alignment

**Mechanism:** `ag2/history.py:14-51`

Why considered:
- Clean abstraction over FAR-Lab's existing node:sqlite events table
- Storage Protocol → SqliteStorage implementation straightforward
- StreamId → run_id mapping natural

**Porting Effort:** ~1 day (implement Storage interface over existing sqlite schema)

---

## SUMMARY TABLE: MECHANISM PRESENCE MATRIX

| Mechanism | ag2 (new) | smolagents | Port Priority for FAR-Lab |
|-----------|-----------|------------|---------------------------|
| Human Input Modes (NEVER/TERMINATE/ALWAYS) | Removed (middleware-based HITL) | N/A | Low (future feature) |
| Cache class (LLM call dedup) | Removed (provider caching only) | N/A | Low (provider-level sufficient) |
| TerminationCondition composition | Removed (Task lifecycle) | max_steps + final_answer | **High** (smolagents model simpler) |
| GroupChat save/load | Removed | N/A | N/A (removed upstream) |
| Task Checkpoint/Resume protocol | CheckpointStore | Implicit (memory.steps list) | **High** (ag2 protocol cleaner) |
| Error-to-Observation feedback loop | Implicit (events) | Explicit (ActionStep.error) | **Critical** (smolagents reference impl) |
| Step-numbered memory | History events | ActionStep.step_number | **High** (both have, smolagents more structured) |
| Monitoring/CallbackRegistry | Observers pattern | CallbackRegistry + Monitor | **Medium-High** (smolagents lighter weight) |
| Token counting per-step | UsageEvent | TokenUsage per step | **Medium** (both adequate) |
| Double truncation | Absent | truncate_content() | **Medium** (simple but important) |

---

## LICENSE COMPLIANCE NOTES

Both repositories are **Apache-2.0 licensed**:
- ag2: `SPDX-License-Identifier: Apache-2.0` in all source files, NOTICE.md present at repo root
- smolagents: Standard Apache-2.0 LICENSE file, copyright 2024 The HuggingFace Inc. team

**FAR-Lab Integration Risk Assessment:**
- All mechanisms analyzed are framework orchestration patterns (not domain-specific business logic)
- Apache-2.0 permits modification, redistribution, and use in proprietary systems (with NOTICE preservation)
- No GPL/viral license concerns
- Recommended: Include attribution comment in ported TS code referencing original source files and line numbers

---

**Report Generated:** 2026-08-22  
**Analyst:** ZCode Explore Agent (source-expedition breadth agent for FAR-Lab Wave-8)  
**Verification Status:** All file:line references verified by direct source code reading (no documentation-only claims)
