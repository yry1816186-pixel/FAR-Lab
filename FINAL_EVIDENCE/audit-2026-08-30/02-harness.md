# Agent/Harness 长程可靠性审计（2026-08-30，只读）

> 来源：终局接管第一轮并行审计（Explore 子代理，76 次工具调用）。基线：主工作区 far.db 105 runs / 7090 receipts / 343 memory items；gold 工作区 work/gold/far.db 实测直查。
> 注意：src/agent/loop.ts、src/server/conversation-{agent,stream}.ts、src/server/conversations.ts、src/domain/conversation.ts 当时属兄弟会话未提交车道。

```
CAP-01 | planning/replanning 与 run 状态机 | PASS | src/app/orchestrator.ts（STAGE_ORDER 游标循环 L424-584；reopenStages() L768；质量门重生成 L491-530；迭代轮有界递归 L645-667；budget-skip/template-refusal/evidence-debt/feedback 四类自动重开 L275-391；stopAfter 停车为 paused L594-607）；src/app/iteration.ts；src/server/api.ts:1014-1024 动作派发重开 | 阶段集合固定（12 段），reopen 是预定义腿非模型驱动动态重规划 | 低 | 一次跨≥3轮迭代的崩溃-续跑零重复副作用（OAOO） | tests/wave8-durability.test.ts:67；gold run 实测 stage attempt：generate_hypotheses a10 / critique a7 / build_evidence a4 | work/gold/far.db runs.doc
CAP-02 | supervisor 语义 | PASS | src/app/supervisor.ts（analyzeTrajectory 纯函数，stalled_horizon 30min/repeated_failure 3x/unproductive_cycle）；消费点仅两处：orchestrator.ts:618 边界持久化 note、conversation-agent.ts:469 run_supervision 工具 | stalled_horizon 只持久化不自动执行——worker 活着但 30min 无事件时无自动干预 | 低 | 每个 pass 边界恰 1 条 supervisor_observation | gold run 实测 supervisor_observation=4 == 迭代轮数 4 | tests/supervisor-integration.test.ts
CAP-03 | 子代理/工具选择/并行度控制 | PASS | src/agent/subagents.ts（隔离 loop、depth≤1 fail-closed、maxConcurrent 3 mapBounded、toolNames 白名单）；全局并发 src/pipeline/llm.ts:97 withModelSlot；MCP 准入 src/agent/capabilities/assembly.ts:86-96 | 并行度静态（无过载自适应降并发）；FARLAB_MIN_CALL_INTERVAL_MS pacing 默认 0=关闭 | 中 | 过载时全局 in-flight 自动收缩，或 pacing 默认开启 | tests/agent-subagents.test.ts
CAP-04 | budget allocation | PASS | src/app/run-budget.ts（spentTokensForRun 从 receipt 重推导；耗尽=带因 skip，export 永不门禁）；usage-ledger.ts（无发明价格）；spend-limit.ts（USD 上限）；src/providers/http.ts:140 totalBudgetFromEnv（默认 300s；529 spacing 15s/30s、429 RPM 20s/40s、quota 1113 fail-closed） | FARLAB_RUN_TOKEN_BUDGET 默认 null=不限；无按 stage 分配；http.ts L132 注释漂移（写 120s 实为 300s） | 中（无人值守默认无限 token 池） | 预算默认值收敛 + pacing 默认启用 | gold run 实测 139,552 tokens 穿过持续过载完成 | tests/run-budget.test.ts
CAP-05 | context compiler/compaction | PASS | src/agent/compaction.ts（microcompact → full handoff 收据化 LLM 摘要 → degrade 丢最旧 tool_result 三层链；per-source token 记账）；门控 src/agent/loop.ts:258-293 | estimateTokens 是估算非真 tokenizer；compaction 压力测试全部离线 stub——真模型长会话下 handoff 摘要质量无 live 证据 | 中 | ≥50 turn 真模型会话触发 full handoff 且目标保持可验证 | tests/agent-compaction.test.ts、context-compiler.test.ts
CAP-06 | memory 跨 run substrate | PASS | src/persistence/db.ts v6 迁移（memory_items CHECK 镜像 zod + FTS5）；检索 store.ts:1143 searchMemory（FTS5 phrase/OR + CJK 三元组 + LIKE 降级）+ memory.ts:104 memoryActivation（ACT-R 半衰期 14d）；投毒围栏 store.ts:1089 putMemory；巩固 src/app/memory.ts 确定性幂等零 LLM | 消费面窄；ACT-R 14 天衰减从未被真实长期数据检验；CJK 依赖 FTS 降级近似 | 低-中 | ≥7 天跨度检索排序 sanity + 一次 poisoning 注入红队 | 主 far.db 实测 22 episodic + 318 semantic + 1 experiment_outcome | tests/memory-substrate.test.ts
CAP-07 | checkpoint/resume/cancel | PASS(live 实证) | checkpointed 每 family 输入指纹门控（orchestrator.ts:212-234）；LEASE_TTL_MS=660s + 每次持久写续租 + RunLeaseLostError 双检；cancel 双通道：wire AbortController 毫秒级 + 跨进程持久标志 | 无 | 低 | 断点续跑零重复付费 | gold run 10:32→12:50（2h18m）34 次 run_resumed 152 receipts 穿 529/1302 完成 12 段；49.3h 跨度 run 5 resume | tests/wave8-durability.test.ts
CAP-08 | human interrupt/approval | PASS | conversation-agent.ts:488-570（propose_action 循环内永不执行，每回合≤10 张）；自动化回合 autoApprove 强制清空 automations.ts:66；run_command 卡片完整命令+timeoutMs 1s-120s | kernel 的 steer 注入缝（loop.ts cfg.steer）无任何生产调用方——人类运行中转向只靠取消 | 中 | 一条生产路径接通 steer 队列 | tests/tool-proposals.test.ts、automations.test.ts
CAP-09 | failure recovery 与 provider failover | PASS | src/providers/fallback.ts（LiteLLM 源验证语义：failover 错误类、60s cooldown、链路 receipt 可见；invalid_output/4xx 不 failover 保复现）；provider-resolver.ts（环切除）；http.ts（Retry-After 优先 30s 封顶、network error 有界重试、D-082 thinking-only 矫正）；recovery-state.ts（14 相位） | ACC-31 仅 "tested"：failover 链只有离线 double 验证，无真跨 provider 切换 live run | 中 | 一次 route-A→route-B live failover run 留 receipt | tests/model-plane-v2.test.ts；gold run 529/1302 receipted
CAP-10 | tool lifecycle 与 MCP/skills/hooks/plugins | PARTIAL | MCP src/agent/mcp.ts（stdio 30s 超时）+ mcp-http.ts + mcp-manager.ts + assembly.ts（trust:'external'，RU-3）；skills.ts 双源相关性选择；plugins/manifest.ts（子进程 host）；workspace 实配 2 个 MCP 实测通过（Playwright 24 工具 263ms / Docling 3 工具 4067ms） | 只是代码+测试、零实例：hook_rule/plugin 在全部 7 个 far.db 中 0 条；automation 引擎代码完备但 0 实例——多日定时驱动从未 live 跑过 | 低-中 | 每 plane 至少 1 个 live 实例跑 ≥72h | tests/agent-mcp.test.ts 等全套
CAP-11 | silent hang 防护 | PASS(留一条缝) | 服务器 watchdog api.ts:274-330（30s 轮询 expired-lease，收养退避，sweep 失败计数暴露 /health）；provider 每 attempt AbortController+总预算；MCP 30s；agent loop stepTimeoutMs/totalTimeoutMs 双预算；run_command ≤120s；sweep-zombie-runs.mjs=运维态修正器 | 缝：agent loop 的 tool.execute 无通用 per-tool 超时包装（loop.ts:477 裸 await）——无内部超时的未来工具可永久挂起 turn | 中 | loop 层 per-tool deadline + 挂死工具测试 | tests/wave8-durability.test.ts:403-472
CAP-12 | 长时任务（数小时/数天）语义 | PARTIAL | 实测：gold run 2h18m 墙钟；49.3h 跨度 run（含空闲）；主库第 3 长 5.4h。连续计算最长实证 ≈2-5h 级 | 单测无长程实证的环节：真模型长会话 compaction、跨 provider failover live、automations 多日调度（0 实例）、supervisor stalled_horizon 从未真触发、ACT-R 14d、记忆负向条件化 A/B | 中 | ≥72h 无人值守 soak：≥2 轮自动迭代 + 1 次断电级恢复 + 记忆跨天检索留痕 | far.db created_at/updated_at 全量直查
```

## Top 3 最高杠杆改进

1. **封掉 agent kernel 的 tool.execute 超时缝（CAP-11）**：loop.ts:477 用 per-tool deadline 包装工具执行。分层超时体制里唯一剩下的 silent-hang 路径，改动集中一处。验证：挂死工具 + stepTimeoutMs 短值，修复前挂起、修复后返回 step_timeout。（当前 loop.ts 在兄弟车道，待其落地后接手。）
2. **预算与 pacing 从 opt-in 变默认防线（CAP-04/10）**：FARLAB_RUN_TOKEN_BUDGET 默认 null 与 MIN_CALL_INTERVAL 默认 0 意味无人值守无默认花费护栏。建议 automation fire 时强制继承 run 预算视图 + 默认温和 pacing，并跑 ≥72h 无人值守 soak。
3. **failover 链与长程记忆各补一次 live 实证（CAP-09/06/12）**：ACC-31 仅 tested；一次 route-A→route-B 真 failover run；≥7 天后重放 memory-live-check 验证 ACT-R 排序未退化。

## 证伪清单

- gold run events 中 run_resumed=34 / receipts=152（本审计直查值）；若不符则 CAP-07/12 断点续跑实证强度需重估。
- 若任何生产路径给 runAgentLoop 传了 cfg.steer（grep 零命中），则"steer 未接线"死亡。
- 若 far.db 存在 hook_rule/skill/plugin/automation objects（逐库直查全 0），则"机制真实、采用为空"死亡。
