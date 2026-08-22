# OSS 尽调 v2 — 状态机 & DAG 工作流引擎（剩余项）

日期：2026-08-22 · 方法：GitHub API 质量门 → 过门项源码深读（本地/gh api/zread，只读未执行）
Wave-8 基线（不重读）：langgraph put_writes / dbos OAOO / temporal sticky-lease → 已落 D-054（runs 租约+心跳+watchdog+fencing、OAOO step_outputs+ctx.checkpointed）。**本文只报增量。**

## ① 质量门表（API 实值）

| 仓库 | stars | license | pushed_at | archived/fork | 门结果 |
|---|---|---|---|---|---|
| xuemzhan/gecko | 8 | MIT | 2026-01-07（~7.5 月停更） | no/no | **杀**（<500 星且停更>6 月） |
| elizaOS/eliza | 19,126 | MIT | 2026-08-22（当日） | no/no | 过 |
| restatedev/sdk-typescript | 119 | MIT | 2026-08-21 | no/no | **边界过**（<500 星；独特战略价值说理：Restate 官方一手 SDK、durable-execution 领域最接近 FAR-Lab 形态的 TS 实现、任务明令机制级补扫；不作依赖采用） |
| inngest/inngest | 5,755 | **SSPL v1**（LICENSE.md#L1-2: "Server Side Public License, Version 1.0" + Apache-2.0 Future Grant） | 2026-08-22 | no/no | **杀（依赖面）**（SSPL 非 OSI 开源：引擎代码不可 vendor/复制，只能 REFERENCE；TS SDK inngest-js 为另一仓未扫） |

## ② 过门项深评

### elizaOS/eliza — REJECT（机制层）；用户描述四项证伪/降级

- **"基于 LangGraph 封装" = 假**。`packages/typescript/package.json` 依赖仅 `@langchain/core ^1.1.12`（文本切分等工具，非图引擎）；GitHub code search `repo:elizaOS/eliza langgraph` total_count=0。eliza 自研 AgentRuntime（消息/action/evaluator 循环），与 LangGraph 无关。
- **"Atom 执行单元" = 不存在**。全仓路径含 atom 的仅 8 个文件，全部是 `utils/atomic-json.ts`（原子文件写）及 "atomic revision/merge" 测试命名，非执行模型。执行单元实际叫 Action/ActionStep。
- **"runtime 快照" = 误述**。`ServiceRuntime` 是 daemon 包 `getRuntime()` 返回的**进程管理器状态快照**（systemd/launchd 单元状态），属进程运维，非执行快照/检查点。
- **"子流程" = 弱**。`packages/typescript/src/advanced-planning/services/planning-service.ts`（zread 全文真读；zread 输出无行号，以下用符号定位）：`planExecutions`/`activePlans` 为**内存 Map**，`executePlan` 的 `finally` 直接 delete——崩溃即丢，无持久化、无 OAOO、无租约。`executionModel:"dag"` 模式经 `buildDagExecutionOrder`（Kahn+min-heap）拓扑排序后**仍是 for 循环串行 await**（假并行）；`parallel` 模式是无界 `Promise.all`。`adaptPlan` 用 LLM 重排并保留已完成前缀（`steps.slice(0,currentStepIndex)`）——该思想等价于我们 stage 粒度的 resume-skip，无增量。
- **对 D-054 增量：零**。其规划执行栈严格弱于 FAR-Lab 现状。策略：REJECT（与 Wave-8 整框架裁定一致）；REFERENCE 价值仅 `onError: abort|continue|skip` 每步显式失败策略字段（我们已有 per-stage attempt/error 语义，不必引入）。

### restatedev/sdk-typescript — DEFER(带触发) + 2 条 REFERENCE（机制注记）

形态变化：仓库已重构为多包布局，新一代 `packages/libs/restate-sdk-gen/`（fiber 生成器调度）+ 经典 `restate-sdk`（journal 内核下沉 Rust/WASM：`packages/libs/restate-sdk/src/endpoint/handlers/vm/sdk_shared_core_wasm_bindings.wasm`——journal 机器复杂度之高的旁证）。默认分支 main。**inbox 在本仓 grep 全文件树 0 命中**——inbox 是 Restate 服务端概念（per-key 单写排序投递），SDK 侧只有 typed one-way send；其保证形态（每 key 串行单写）FAR-Lab 已由 run 行租约在 run 粒度覆盖，无增量。

真读源码（gh api 拉取本地，行号真实）：

1. **单一 journal-race 挂起点 = 确定性边界**（`packages/libs/restate-sdk-gen/src/scheduler.ts:31-37` 不变量 S1："The ONLY async suspension point is the single `await lib.race` per main-loop iteration"；主循环 :484-548）。用户代码跑在 fiber 生成器上，崩溃重放时 race winner 逐字节重演。这是 dbos 整函数 memoization 之外的另一条确定性路线，代价 = 生成器/fiber 全家桶。**对 FAR-Lab 无增量**：我们的 step 是独立 keyed 计算、无顺序耦合，粗粒度 OAOO（`src/app/orchestrator.ts:154-175` fingerprint+step_output）已够；引入 fiber 等于重建一套引擎，违反最小架构。
2. **awakeable / durable signals（唯一真缺口候选）**（`restate-operations.ts:373-391`：`sleep/awakeable<T>()->{id,promise}/signal<T>(name)`；`durable-promise.ts:16-21`：`peek/resolve/reject/get`，其中 `peek()` 可无副作用探测）。语义 = 跨进程持久"等待外部完成者"。FAR-Lab 现状：反馈/修订走"跑完再重开"（`orchestrator.ts:214` feedback/revise/export 重开 + 版本比较领域模型），**不需要**中途无限期挂起。DEFER 触发条件见 ③；触发时按此语义 BUILD 一张 completions 表（MIT 许可允许参考，但我们 pg+zod 栈重实现 <1 表+API，不引 SDK）。
3. **cancellation 非粘性**（`scheduler.ts:106-124`：每次取消后**替换** AbortController，恢复代码看到新 signal；父 attempt-end 信号才粘性）。精巧的健壮性语义，仅当 FAR-Lab 未来支持"进程内取消后继续恢复执行"才适用——我们取消即弃权/收养（disowned，`orchestrator.ts:179`），暂不适用。REFERENCE。
4. 附带：`channel.ts:20-35`（workflow 内 channel 刻意做成只能 `yield*` 触发、外部世界必须走 journal 化 awakeable——类型级强制边界的好设计）；`state.ts:63-80`（虚拟对象 state 写为同步立即记 journal）。

### inngest — REJECT（采用面）/ REFERENCE（一段）

机制族与 restate/dbos 同宗：`step.run` 记账化（"控制流就是普通 JS"= journal 确定性的另一表述，D-054 家族已覆盖）、`step.WaitForEvent` ≈ awakeable、`step.Sleep` 持久定时器（FAR-Lab 无日历/跨天定时用例，watchdog+租约时钟即活性）、fan-out/优先级/并发控制是 SaaS 控制面特性。**决定性杀点是 license**：引擎 SSPL v1，不可复制/内嵌/改造分发（Apache-2.0 future grant 附条件），且采用托管服务与"产品 model-agnostic、自包含"路线冲突。仅留 REFERENCE：其"step 工具函数内嵌 memoization"API 形态是 `ctx.checkpointed()` 的另一包装，无新增量。

### xuemzhan/gecko（被杀项备忘，一句话）

README 实读：COW 状态隔离 = 并行节点各持 `_COWDict` 写时复制 state + **共享只读 history 避免深拷贝大上下文** + 层结束 diff 合并；Team RACE = 首胜+CancelScope 取消（anyio winner lock）。对 D 的参考价值：仅当 FAR-Lab 出现"领域并行 fan-out 因共享大上下文拷贝产生内存压力"时才值得 D 记一条——目前 step 输出隔离在 DB（更强隔离），不需要。

## ③ 类别净结论：线性 stage 机是否需要升级 DAG/图引擎？——**不需要（DEFER，带明确触发）**

- **拓扑事实**：管线是固定规范序（`STAGE_ORDER` 自 `src/domain/run.ts`，`orchestrator.ts:5,242`），跨 stage 零分支点；唯一"非线性"是 feedback/revise 的有界重开环（`orchestrator.ts:214`），属固定模式而非任意图。领域并行（多假设证据/排序）是 stage **内**数据并行，由 checkpointed per-step OAOO 收敛，无跨节点持久依赖调度需求。DAG 引擎的价值=动态控制流分支+持久节点级依赖，我们对不上任何一条。
- **D-054 边界**：已覆盖 OAOO（fingerprint+step_output，:154-175）、租约/fencing（:61-78）、写即心跳（:110-111）、断点续跑跳过已完成（:185-195）。四大引擎残余独有语义=(a) fiber 级确定性重放（仅当 step 间出现顺序耦合才有意义，届时优先建模为线性机子 stage 而非引引擎）；(b) awakeable 中途外部挂起（见触发）；(c) per-key inbox（run 租约等价）；(d) 持久定时器（无用例）。
- **重开触发条件（任一命中才重开本类别）**：
  1. 出现第二条管线拓扑（如 Direction-B 适配器并发实验分支且分支间有持久跨节点依赖）→ 先评估"线性机+子 stage"是否仍够，仍不够才立项图调度；
  2. 某 stage 需在进程生命周期之外等待外部完成者（如运行中人审批准暂停数天）→ 按 restate `durable-promise.ts:16-21` 语义 **BUILD** completions 表（小造，勿引引擎）；
  3. stage 内 step 图变为顺序耦合/部分失败需保留已完成 DAG 前缀重排 → 参照 eliza `adaptPlan` 前缀保留 + 我们 stage 前缀 resume 的合成，仍在线性机内解。
- **本类别合计**：0 ADOPT / 0 EXTRACT 立即项 / REJECT×2（eliza 机制层、inngest 采用面）/ 杀×1（gecko）/ DEFER×1（restate awakeable 语义，带触发 2）/ REFERENCE×3（restate 取消非粘性 + channel 类型级边界、gecko COW、eliza onError 字段）。
