# v2 Harness / Agent Runtime 剩余项尽调报告

- 日期：2026-08-22。调研方式：只读（GitHub API + 原文读取；zread MCP 持续超时已按预案退回 GitHub 直读）。所有 file:line 均出自真实读取的原文。
- 对照系：FAR-Lab `src/agent/`（loop/tool/mcp/permissions/hooks/skills/subagents/compaction/rollout/budget/telemetry/protocol/capabilities）+ `src/app/orchestrator.ts`。既有 Wave-4 12 仓与 HARNESS_SURVEY 6 仓结论不重复，只报净增量。

## 1. 质量门（4 项，GitHub API 实值）

| 仓库 | license.spdx_id | stars | pushed_at | archived/fork | 裁定 |
|---|---|---|---|---|---|
| modelscope/agentscope | Apache-2.0 | 29,256 | 2026-08-22T01:14Z | false/false | **过门** |
| omnigent-ai/omnigent（用户所称 Databricks-Labs/omnigent **不存在**，API 404；实仓 owner 为 omnigent-ai） | Apache-2.0 | 9,163 | 2026-08-22T10:20Z | false/false | **过门**（但见裁定） |
| mastra-ai/mastra（原 mastra-org/mastra，org 更名迁移） | NOASSERTION→原文核验：核心 Apache-2.0，`ee/` 目录（server/auth 等）独立商业 license | 27,363 | 2026-08-22T15:07Z | false/false | **过门**（引包受限） |
| vercel/ai | NOASSERTION→原文核验：LICENSE 为标准 Apache-2.0（Copyright 2023 Vercel），分类器误判 | 26,349 | 2026-08-22T15:06Z | false/false | **过门** |

无被杀项（4/4 过门）。门值均为 `api.github.com` 实测。

## 2. 过门项深评

### 2.1 modelscope/agentscope（Python；B/C 路线不可行，按机制级 EXTRACT/ADAPT 评估）

**用户描述与实仓不符（重要澄清）**：
- "HarnessAgent" 组件**不存在**。全仓代码搜索 `HarnessAgent` 0 命中，`harness` 关键字（代码+README）0 命中。实际 2.0 架构是 `src/agentscope/` 下的 `Agent` 类（ReAct）+ `app/`（FastAPI agent 服务）+ 独立模块目录。
- "子Agent编排"：`subagent` 全仓 0 命中，不存在该组件。
- "Plan Mode 审批"：无 PLAN 模式。权限模式实为 DEFAULT/EXPLORE/ACCEPT_EDITS/BYPASS/DONT_ASK（`src/agentscope/permission/_engine.py:77-116` 分发注释）。
- 描述属实部分：状态存储（`state/`）、沙箱文件系统（`workspace/`：docker/e2b/daytona/bubblewrap/k8s/opensandbox/applecontainer 适配器）、技能仓库（`skill/`，本地 SKILL.md+frontmatter 加载）、channel 会话路由（`app/channel/`：dingtalk/discord/feishu IM 适配）。

**真增量机制（file:line 均已读）**：

1. **HintBlock 运行时状态注入** — `src/agentscope/agent/_agent.py:1197-1440`（`_inject_runtime_state`）。把墙钟时间（时区感知+间隔触发）、未完成计划任务（被压缩掉后重注入）、上下文水位（接近压缩阈值 `context_buffer_ratio` 时预警）作为 HintBlock **追加到持久上下文而非改 system prompt**，明确为了保住 prompt cache。设计注释完整论述了每维注入时机。→ **ADAPT** 到 `src/agent/loop.ts` + `src/agent/budget.ts`（FAR-Lab 有 budget 但无对模型的状态感知注入）。
2. **权限模式机 + bypass_immune + headless 降级** — `permission/_engine.py`（848 行）：
   - 5 模式各为自包含策略方法（`:77-116`）；
   - `_convert_ask_to_deny`（`:594-633`）：DONT_ASK 不变量"永不返回 ASK"，转 DENY 时携带原 reason 与 `suggested_rules` 供事后补规则；
   - `_is_safety_ask`（`:634-658`）：工具可标记 `bypass_immune=True`（写 `~/.bashrc`、`rm -rf`、注入模式等），DEFAULT/ACCEPT_EDITS 下 allow 规则**不能**吞掉它；
   - `_generate_suggestions`（`:812-848`）：工具级建议规则生成（Bash 前缀 `"npm run:*"`、文件操作目录 `"src/**"`、其余精确匹配）。
   → **ADAPT** 到 `src/agent/permissions.ts`（现 allow/deny/ask+AskHandler 之上加：模式枚举、bypass_immune、无人值守 ask→deny 保建议、规则建议）。
3. **批内权限规则去重** — `agent/_agent.py` `_execute_concurrent_tool_calls`（`:1993-2125`）内 `kept_rules` 累加器：同一批工具调用中，后一个调用若被前面确认产生的建议规则覆盖则不再弹确认（单线程事件循环同步段，免锁）。→ **ADAPT**（小）到 permissions.ts。
4. **Offloader 协议（上下文卸载）** — `workspace/_offload_protocol.py:8-43`（`offload_data_block/offload_context/offload_tool_result` 三方法 Protocol）；`agent/_agent.py:627-631` 压缩产物经 offloader 落工作区文件，上下文留摘要+指针。→ **ADAPT** 到 `src/agent/compaction.ts`（现 microcompact+handoff 之上的"原文不丢"层）。
5. **超大 tool result 边界切分** — `agent/_agent.py:2823-2972`（`_split_tool_result_for_compression`）：按 `tool_result_limit` 反向扫描找边界块，文本块按 token 比例截断，保留/卸载双 deepcopy。→ **ADAPT**（与 4 配套）。
6. **`_next_action` 纯决策函数** — `agent/_agent.py:3248-3455`：只读，返回 `Reasoning|Acting|Exit` 判别联合；副作用全在调用方。含 PENDING/ALLOWED 工具调用状态机、awaiting-permission 时返回**可持久化的 Exit**（会话挂起、审批后恢复）、结构化输出宽限轮次 `structured_output_grace_iters`（超 max_iters 仍允许调结构化输出工具）。→ **REFERENCE**（loop.ts 重构参照）+ 宽限轮次可 **ADAPT**（小）。
7. **并发工具执行纪律** — `_agent.py:1993-2125`：单个失败**不取消**兄弟任务、全部跑完后 `ExceptionGroup` 聚合、sentinel+queue 保证事件流完整后才返回、外部取消时显式取消 worker 并冲刷 `INTERRUPTED` 状态事件。→ **REFERENCE**（subagents.ts/loop.ts 对照；FAR-Lab rollout 的中断轮次分类部分已覆盖）。
8. **工具读缓存** — `state/_state.py:23-143`（`ReadCacheEntry`/`ToolContext.cache_file/clean_file_cache`）+ 压缩后 `_clear_unreserved_read_cache`（`_agent.py:2797`）：文件读取缓存与上下文保留范围联动失效。→ 次要 **ADAPT**（若 FAR-Lab 工具有文件重读场景）。

**已覆盖不重做**：skill 三层加载（FAR-Lab skills.ts 已覆盖，agentscope 仅多 mtime 缓存）；IM channel 路由（dingtalk/discord/feishu 适配）→ **REJECT**（FAR-Lab 单一 Web 产品无 IM 需求）；沙箱 workspace 适配器族 → **DEFER**（触发：科学可测性需要沙箱执行时再评，Direction-B 适配器范畴）。

**决策：ADAPT**（上述 1-5 机制级 TS 重写，Python 源仅作行为规范参照，署名 agentscope/Apache-2.0）；6-8 REFERENCE。

### 2.2 omnigent-ai/omnigent（Python meta-harness，alpha）

- 用户所述 owner Databricks-Labs 有误（404）。实仓含 `databricks_ai_gateway.py`/`databricks_model_discovery.py`（Databricks 沙箱/网关适配）但 org 是 omnigent-ai，README 自标 **status: alpha**。
- 架构：对 Claude Code/Codex/Cursor/OpenCode/Hermes/Pi/goose/kimi/kiro/qwen/antigravity 等外部 harness 各设 `*_native_bridge/_forwarder/_permissions/_state` 桥接层；跨设备会话同步（terminal/browser/phone/desktop）；云沙箱（Modal/Daytona/E2B/K8s/Databricks 等 12 家）；策略引擎（`omnigent/policies/`：声明式 PolicySpec + 纯评估器 + engine 做 filter-gate-dispatch-compose，内置 cel/cost/risk_score/safety/routing 等 12 个 builtin；作用域分 server/agent/chat 三层）。
- **对 FAR-Lab 过度（裁定成立）**：FAR-Lab 不编排外部 coding harness，自研 TS agent 层 + orchestrator.ts（租约+心跳+OAOO）已覆盖其控制面对应物；Python+alpha 期引任何代码都不符合最小架构。
- **决策：REJECT**（采用）/ **REFERENCE**（两点：① 策略"纯评估器+引擎组合"与 server→agent→chat 三层作用域的模式，若未来 FAR-Lab 权限/预算规则膨胀可参照；② builtins 里 cost/risk_score 与审批联动的思路）。DEFER 触发：FAR-Lab 若需嵌入外部 harness（Direction-A 路线基本不会）。

### 2.3 mastra-ai/mastra（TS，Apache-2.0 核心 + ee/ 商业目录）

- 发现：`packages/core/src/` 下有字面 `harness/`、`agent-controller/`、`loop/`、`coding-agent/` 目录——mastra 已吸收 coding-agent harness 形态，是 4 仓中与 src/agent/ 重叠最大的 TS 库。正因重叠，引包等于换运行时（zod-only 硬不变量冲突，且 core 依赖面大、ee/ 授权混杂）→ **引包 REJECT**。
- **真增量机制**：
  1. **step/total 双超时预算** — `packages/core/src/loop/timeout.ts`（149 行，全读）：`MastraTimeoutError{timeoutType:'step'|'total', timeoutMs}` 明确区分"超时=失败"与"调用方 abort=干净取消"；`createTimeoutAbortSignal` 把调用方 AbortSignal 与时间预算合成为新信号，`timer.unref()` 不挂住进程，`cleanup` 幂等摘除监听。→ **EXTRACT/ADAPT** 到 `src/agent/loop.ts`（~100 行、零依赖；loop.ts 现 status 机无独立超时类型，providers 层重试不含 loop 级总预算）。
  2. `agent-controller/session.ts`（153KB 骨架读）：`ThreadDataStore` 含 `acquireLock/releaseLock`、`cloneThread`、mode 系统（`currentModeId`/`modeModelId_*`）、reserved metadata keys、`ABORTED_BY_USER_REASON` 常量。锁与租约已被 orchestrator.ts 覆盖；**thread fork/clone** 语义 → **REFERENCE**（与 FAR-Lab 核心环"revision/版本对比"同构，做修订分支对照时参照其 clone+firstUserMessages 批量取数设计）。
  3. loop signals（`drainPendingSignals`/`initialSignalEchoes`/session-bus 放大）→ **REJECT**（A2A/多 agent 总线基建，FAR-Lab 无此形态）。
- **决策：REJECT（引包）/ EXTRACT timeout.ts 机制 / REFERENCE fork-clone**。

### 2.4 vercel/ai（TS，Apache-2.0）

- 引包即引入整个 AI SDK 运行时（zod-only 硬不变量冲突）→ **引包 REJECT**；但其 `packages/ai/src/generate-text/` 是循环原语机制密度最高的单目录，文件级提取全部零 npm 依赖：
  1. **签名工具审批** — `packages/ai/src/generate-text/tool-approval-signature.ts`（90 行，全读）：HMAC-SHA256（Web Crypto `crypto.subtle`，Node 18+ 内建）对 `['ai-sdk-tool-approval-v1', approvalId, toolCallId, toolName, inputDigest]` 签名，`inputDigest` 为输入的规范化哈希；JSON 数组序列化保证编码单射（带版本前缀域分隔，含 legacy 换行拼接格式的 verify 兼容+废弃计划）。执行前验签 → ask 与 execute 之间的审批伪造/TOCTOU 不可行。→ **ADAPT** 到 `src/agent/permissions.ts`（AskHandler 返回值携签，执行前验签；~60 行零依赖）。
  2. **StopCondition 组合子** — `stop-condition.ts`：`type StopCondition = ({steps}) => boolean|Promise<boolean>`，内置 `isStepCount(n)`/`hasToolCall(...names)`/`isLoopFinished()`，叠加自然终止条件（非 tool-calls finish reason/无 execute 工具/需审批）。→ **ADAPT** 到 `src/agent/loop.ts`（把 max_turns 从特例泛化为组合式停止条件，类型化且可测）。
  3. **损坏 tool call 修复回路** — `tool-call-repair-function.ts`：`ToolCallRepairFunction` 收到 `NoSuchToolError|InvalidToolInputError` + 消息/工具集/schema，返回修复后的调用（或 null）。FAR-Lab 产品模型无关（接入全世界模型，含弱模型），zod 校验失败即失败会浪费轮次。→ **ADAPT** 到 `src/agent/tool.ts`（校验失败带错误上下文回喂模型一次修复机会；注意预算上限防循环）。
  4. **PrepareStepFunction**（`prepare-step.ts`：每步动态换 model/tools/messages）→ **REFERENCE**（FAR-Lab 现无每步切换需求；`prune-messages.ts` 等压缩类已被 compaction.ts 覆盖不取）。
- **决策：REJECT（引包）/ EXTRACT 1-3（file:line 已核，均小而零依赖）**。

## 3. 类别净结论（对 src/agent/ 层的净增量清单）

按目标文件归组（全部机制级、零新 npm 依赖，符合 zod-only 与最小架构；无任何 B/C 路线建议）：

1. `src/agent/permissions.ts` ← 净增量最大：命名权限模式机 + `bypass_immune` 安全问询 + 无人值守 ask→deny（保留 suggested_rules）+ 工具级建议规则与批内去重（agentscope `_engine.py:77-848`、`_agent.py:1993+`）+ **HMAC 审批签名/验签**（vercel/ai `tool-approval-signature.ts`）。
2. `src/agent/loop.ts` ← step/total 双超时预算与独立错误类型（mastra `timeout.ts`）+ 组合式 StopCondition（vercel/ai `stop-condition.ts`）+ 结构化输出宽限轮次（agentscope `_agent.py:3290s`）+（参照）`_next_action` 纯决策与"挂起等审批可恢复 Exit"。
3. `src/agent/compaction.ts` ← Offloader 协议（压缩产物/超大工具结果落盘+摘要指针回填，agentscope `_offload_protocol.py`）+ 超大 tool result 边界切分/比例截断（`_agent.py:2823-2972`）。
4. `src/agent/loop.ts`+`budget.ts` ← HintBlock 运行时状态注入（时间/任务/水位，追加式保 prompt cache，agentscope `_agent.py:1197-1440`）。
5. `src/agent/tool.ts` ← 损坏 tool call 修复回路（vercel/ai `tool-call-repair-function.ts`，服务"模型无关"卖点）。
6. REFERENCE 不落地：omnigent 策略三层作用域+纯评估器；mastra thread fork/clone（版本对比环）；agentscope 并发 ExceptionGroup+事件完整性。
7. 明确不取：agentscope IM channel 路由与沙箱适配器族（DEFER）、omnigent 全部（REJECT）、mastra/vercel 引包（REJECT，zod-only）。
8. 已覆盖不重做：skills 三层、rollout 崩溃重建/中断分类、subagents 并行、hooks、MCP stdio、token 预算、orchestrator 租约+OAOO、providers 重试/脱敏/strict-FC。
