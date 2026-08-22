# WAVE8-SCOUT · 编排/持久化工作流框架源码远征（证据门重访）

日期 2026-08-22 · 状态：shortlist 定稿，进入融合执行。
方法：痛点测量先行（`evidence/W8/pain-report.md`，3/3 实证）→ 9 仓源码远征（6 份 breadth 报告，主 Agent file:line 抽验通过）→ 跨仓交叉比对 → shortlist。注册表既有裁决维持：Temporal/DBOS 整框架 REJECT、LiteLLM REJECT——本 Wave 只做**源码级机制抽取**，零框架引入、零新服务、零新依赖（zod-only 不变量不动）。

## 0. 痛点输入（全部实测，详见 evidence/W8/pain-report.md）

| # | 痛点 | 实测值 |
|---|---|---|
| P1 | 冻结 run：死 worker 留 `status='running'`，无自动检测/恢复 | 检测延迟 93/121/243 分钟（人工 sweep）；0/17 partial 曾被自动恢复；合法信号间隔 p99=57.4s、max=122.9min（纯 staleness 阈值不安全） |
| P2 | 分离执行无人监护（CLI `start` 打印 runId 后阻塞执行；宿主 reap 即丢） | 3 个静默 kill run 各弃置 21/24/34 个已付费模型调用；CLI 与 server 跨进程无单写者锁（api.ts 仅进程内 Map） |
| P3 | resume 粒度 = stage 行，stage 内零检查点 | 构造实验：10 子任务 kill 在第 6 个后 → 持久化 0、resume 重做 10/10；rank 均值 17 调用全量重付；`checkpointRef` 字段零使用 |

## 1. 远征对象与许可（三重门之一，fetch 时逐仓核验 LICENSE）

| 仓库 | 许可 | 报告 |
|---|---|---|
| langchain-ai/langgraph | MIT | research/wave8-reports/langgraph.md |
| temporalio/sdk-typescript + samples-typescript | MIT | research/wave8-reports/temporal-sdk.md |
| dbos-inc/dbos-ts（原 dbos-transact-typescript，已更名） | MIT | research/wave8-reports/dbos-ts.md |
| openai/openai-agents-js | MIT | research/wave8-reports/openai-agents-js.md |
| ag2ai/ag2（microsoft/autogen 后继） | Apache-2.0 | research/wave8-reports/ag2-smolagents.md |
| huggingface/smolagents（Wave-4 缓存复用） | Apache-2.0 | 同上（合报） |
| crewAIInc/crewAI | MIT | research/wave8-reports/crewai-claudeflow.md |
| ruvnet/claude-flow | MIT | 同上（合报；crates/v3 符号链接 Windows 不可解压，诚实缺口） |

主 Agent 抽验记录：dbos 冲突检测/同步计数器、crewai sqlite checkpoints 表与 is_replaying 守卫、temporal heartbeat 语义、openai-agents 持久化偏移量（行号 1949→实为 1988，已在报告注明）、langgraph WRITES_IDX_MAP/interrupt()/SqliteSaver WAL schema——全部属实。

## 2. Shortlist（每项绑定痛点编号 + KEEP 对照）

### S1 · 租约/心跳 + 过期接管（EXTRACT+ADAPT）——P1+P2 【四仓收敛：dbos+temporal+langgraph+crewai】

**源码依据**：
- DBOS `recoverPendingWorkflows()` 启动扫描孤儿 PENDING 行（`src/dbos-executor.ts:1340-1361`）+ `reenqueueWorkflowsForRecovery()`（`system_database.ts:1402-1424`）+ executor_id 所有权列（`schemas/system_db_schema.ts:4-42`）
- Temporal sticky lease 超时回收死 worker 所有权（`packages/worker/src/worker-options.ts:398-403`）+ `Context.heartbeat(details)` 进度检查点语义（`packages/activity/src/index.ts:385-407`，服务端按 heartbeatTimeout 判死）
- langgraph SqliteSaver 单写者 + WAL 纪律（`libs/checkpoint-sqlite/.../sqlite/__init__.py:139,168`）
- crewAI 全局事件自动检查点触发器（`state/checkpoint_listener.py:229-244`，惰性注册零开销）

**FAR-Lab 融合（最小充分）**：
- `runs` 行加两列 `lease_holder TEXT / lease_expires_at TEXT`（行级列而非 doc JSON，便于 SQL 扫描；zod schema 同步扩展 optional 字段，旧库 migration 幂等）
- 心跳搭便车：`execute()` 内每次已持久化的写（stage 转移 appendEvent / putObject / recordReceipt）同事务续租——零额外定时器、零额外写放大
- 跨进程单写者：`acquireLease` 条件 UPDATE（`WHERE lease_holder IS NULL OR lease_expires_at < now`）——CLI 与 server 双执行在同一入口被租约拒绝（修复 api.ts 进程内 Map 的盲区）
- watchdog：**内嵌**于现有 server 进程（setInterval 轮询过期租约 run → 记 `run_status_changed` 事件 reason=stale-lease → 直接 `orchestrator.execute(runId)` 接管，resume 语义天然跳过 done stage）；CLI 侧 `createApp` 时机会式扫描（只标不接管，避免 CLI 短命进程拉起长任务）
- 保留 zombie sweep 脚本为兜底工具（互补：watchdog 需要"有进程活着"；全灭场景仍靠 sweep/人工）

**KEEP 对照**：现状=人工 sweep（93-243min、0% 自动恢复、无所有权概念、跨进程可双执行）。改善目标：检测+恢复 < 1 个轮询周期；双执行结构性消除。

### S2 · 幂等 step 检查点（OAOO）（EXTRACT）——P3 【四仓收敛：dbos+langgraph+openai-agents+crewai】

**源码依据**：
- DBOS `operation_outputs(workflow_uuid, function_id)` + **同步递增计数器在任何 await 之前**（`context.ts:93-117`）+ `#runAndRecordResult` 先查缓存后执行（`system_database.ts:5402-5431`）+ ON CONFLICT 双执行检测（`:5344-5352`）——exactly-once 语义的参考实现
- langgraph task 级 `put_writes`：数据写 `INSERT OR IGNORE`（重试安全）/ 控制写 `INSERT OR REPLACE`（幂等覆盖），负索引区分控制面（`sqlite/__init__.py:445-464` + `base/__init__.py:795` WRITES_IDX_MAP）
- openai-agents `_currentTurnPersistedItemCount` 持久化偏移量（`runState.ts:1988`）——崩溃恢复不重做已持久项的边界追踪
- crewAI `@persist` 方法级装饰器（`flow/persistence/decorators.py:147-191`）

**FAR-Lab 融合（最小充分）**：
- 新表 `step_outputs(run_id, stage, step_key, json, created_at, PRIMARY KEY(run_id, stage, step_key))` + `step_fingerprints(run_id, stage, fingerprint)`（node:sqlite，migration 幂等；输入指纹门=Wave-5 审计 P3 修复，升级后 resume 不重放过期缓存，DBOS application_version 门控的内嵌形态）
- Store API：`getStepOutput(runId, stage, key)` / `putStepOutput(...)`（put 时发 `checkpoint_saved` 事件——该事件类型在 RunEvent 枚举中已存在且零使用，天然落点）
- StageContext 增加 Memoization 助手 `ctx.checkpointed<T>(stage, key, fn)`：先查表，命中返回，未命中执行+落表
- 采纳顺序（按痛值）：**rank**（评分批 keyed by batch首hyp id；锦标赛对局 keyed by `aId:bId`——17 调用均值、全内存累积的最大受害者）→ **generate_hypotheses**（per-strategy key）。**critique_falsify / build_evidence KEEP**：已通过域状态重入跳过（per-hyp/per-doc 落库）实现同等幂等，不为统一而重写
- key 纪律（DBOS 教训）：key 必须在执行前同步确定、稳定不依赖执行序（用领域 id 而非循环计数——比 DBOS 的 function_id 计数器更强，不受并行化影响）

**KEEP 对照**：现状=stage 级检查点（60% 已完成子任务丢失、17 调用全量重付）。改善目标：kill 后重做数=在飞子任务数（0-1 个）。

### S3 · 同 seed 同输出（反回归铁律）——融合的验收约束

- S1/S2 均为纯持久化/调度机制，不触碰 prompt/payload/聚合逻辑；resume 复用已存子任务结果=逐字节同输出
- 验证：故障注入 harness（确定性 fake provider，离线可跑，不依赖 D-036 阻塞的模型路由）——kill 前后对象集合与最终 bundle 一致性断言

## 3. 评估后不采用（记入注册表，防重复调研）

| 候选 | 来源 | 裁决 | 理由与反转触发 |
|---|---|---|---|
| 事件溯源全量重放引擎（deterministic replay interpreter） | temporal `internals.ts:174` isReplaying / activation | REJECT-for-now | FAR-Lab 的 run 行+step_outputs 即达成等效恢复；LLM stage 天然非确定，Temporal 的解释器级确定性约束（活动结果入 history 不重执行）在我们的架构里就是 step_outputs 本身。反转触发：出现需要逐指令重放的审计场景 |
| HITL interrupt（interrupt()/Command(resume)、needsApproval、pending_feedback） | langgraph `types.py:851`/`_loop.py:904`；openai-agents `tool.ts:487`；crewai `flow/persistence/sqlite.py:71-113` | DEFER | 管线无 mid-run 人工审批调用方（feedback stage 是事后反馈非中断）。反转触发：产品加入运行中审批门（注意 openai-agents 版无审批 TTL——若移植必须补） |
| fork/时间旅行分支 | langgraph `_loop.py:960`、`main.py:1480` | DEFER | 无调用方；runs.parentRunId 已服务 revision 血缘。反转触发：需要 what-if 分叉实验 |
| 重试分类器（RetryPolicy/nonRetryableErrorTypes） | temporal `retry-policy.ts:9-45` | SKIP（车道避让） | Wave-4 会话在途的 provider 重试/退避融合拥有该车道；W8 不重复不冲突 |
| guardrails（并行输入/输出护栏） | openai-agents `guardrails.ts` | DEFER | 无策略门需求实证 |
| 错误回灌（error-to-model） | smolagents `agents.py:594-602`；openai-agents `toolExecution.ts:674-786` | KEEP 现状 | callStructured 纠正性重问已落地（0d1706e，~99% 恢复）——同机制已在库 |
| ag2 GroupChat/Storage 协议 | ag2 `ag2/task.py:60-97` | KEEP 现状 | 上游已删 GroupChat；Storage 协议薄于 FAR-Lab 现有 events/objects；CheckpointStore 协议思想已被 S2 吸收 |
| claude-flow 持久化原语 | 提取部分 | REJECT | 抽取部分（plugins/，无 crates/v3）不含任何 checkpoint/session-resume/持久任务队列机制；ruflo-arena RunStore 仅比赛结果 JSON 文件 |
| Monitor/CallbackRegistry 令牌观测 | smolagents `monitoring.py:82-117` | KEEP 现状 | receipts 已带 per-call usage 记账（Wave-3 已验证） |

## 4. 验证计划（北极星直接负责，全离线可执行）

**run-reliability（ownerWaves: W8）**
- baseline：注入失败（kill/freeze）100% 在一个轮询周期内检测并自动恢复（对照：93-243min + 0% 自动恢复）
- target：20-run soak（确定性 fake provider + 随机 kill 点）零冻结
- 载体：`spikes/wave8-fault-injection.mjs`（子进程真 kill → server watchdog 接管 → 断言终态/重做调用数/同输出）

**run-wall-clock（stretch，条件性）**：并行化 p50≤4.5min 且同 seed 同输出——本 Wave 不启动并行化（live 测量被 D-036 阻塞；S2 的领域-id key 设计已为并行化预留确定性）。如实记录差距。

## 5. 野心阶梯（baseline→target→stretch，只达 baseline 如实记录）

| 指标 | baseline | target | stretch |
|---|---|---|---|
| 注入失败恢复 | 100% 一个轮询周期内自动恢复 | — | — |
| soak 零冻结 | — | 20-run 零冻结 | — |
| rank kill 重做调用 | 17 → ≤1 | — | — |
| run-wall-clock | 不回退（不并行化） | — | p50≤4.5min（条件性，本 Wave 不启动） |

## 6. 执行序列（DoD 对齐开场序列第 5-6 步）

1. S2 先行（step_outputs + Store API + ctx helper + rank/hypotheses 采纳 + 测试）
2. S1（lease 列 + 心跳续租 + acquireLease 单写者 + server watchdog + CLI 机会式扫描 + 测试）
3. 故障注入 harness + 20-run soak + 同 seed 同输出断言 → evidence/W8/
4. mutation 抽查（判别力证明）+ 对抗审计（子 Agent 审，主 Agent 修）
5. 北极星 current 更新 + DECISIONS + 注册表 + completion-gate + 提交
