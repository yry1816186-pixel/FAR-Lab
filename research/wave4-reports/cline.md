# Breadth report: cline/cline (Wave-4, 2026-08-22)

Source: breadth subagent (Explore) over `.cache/repos/cline` (Apache-2.0 "Copyright 2026 Cline Bot Inc.", main-agent license-verified). Subagent's FAR-Lab-对照列为推测性描述，主 Agent 已按 FAR-Lab 实际代码校正关键条目。

## Repo overview

Apache-2.0. TS monorepo（2232 .ts；sdk/packages 6 包：core/llms/agents/shared/sdk/ui + apps；682 .test.ts）。Extension/Hook/Plugin 三层架构；RuntimeHost 支持 local/hub/remote；15+ provider 网关；Zod 工具 schema + Preset 组合 + Policy 门控；Basic/Agentic 双策略压缩；git-stash 影子检查点。

## Mechanism inventory（主 Agent 校正后）

| 组 | 机制名 | file:line | 做法摘要 | 价值 | 成本 | FAR-Lab 实际对照（主 Agent 校正） |
|---|---|---|---|---|---|---|
| A | Plan/Act/Search/YOLO 四模式工具预设 | `sdk/packages/core/src/extensions/tools/presets.ts:20-111` | 预设精确控制 10 工具启停；plan 模式在 runtime-builder 注册期就不注入 editor 工具（结构性移除而非 UI 开关）；yolo 同时设 toolPolicy autoApprove | 结构性权限分离 | 低 | 缺失（FAR-Lab 无模式切换；pipeline 阶段即隐式分离） |
| A | 工具名别名规范化 | `extensions/tools/runtime-builder.ts:95-112` | 12 个别名映射（apply_diff→editor 等）归一化 | 降模型输出变异失败率 | 低 | 部分（llm.ts 枚举规范化同思路，更严格） |
| B | 双策略压缩（Basic+Agentic）+ 溢出恢复强制确定性路径 | `extensions/context/compaction.ts:51,150-175` + `agentic-compaction.ts:116-150` + `compaction-shared.ts:13-19` | TRIGGER_RATIO=0.9；DEFAULT_PRESERVE_RECENT_TOKENS=20k；CONTEXT_WINDOW_INPUT_RATIO=0.9；模型拒绝压缩请求（overflowRecovery）→ 强制走 Basic 确定性路径避免级联 LLM 失败 | 生产级硬化 | 中 | 缺失（FAR-Lab 单次调用无会话历史——不适用当下，记注册表 B） |
| B | Tool-result/文件内容截断上限 | `extensions/context/compaction-shared.ts:21-23,102-126` | TOOL_RESULT_CHAR_LIMIT=2000；截断加 `...[truncated N chars]` 显式标记；thinking block 同样 2000 | 防单结果吃满窗口 | 低 | **缺失（相关：FAR-Lab 证据 payload 注入）** |
| B | 预算投影引擎（主动预测溢出） | `extensions/context/budget-projection/project.ts` | 压缩决策前预计算预算分配，"将在 N 轮后溢出" | 主动 vs 被动 | 中 | 缺失 |
| C | str_replace 单次出现校验 | `extensions/tools/executors/editor.ts:87-149,170-199` | 出现 0 或 >1 次拒绝；CRLF 归一；unified diff 审计输出 | 防静默错位编辑 | 低 | 不适用（FAR-Lab 无文件编辑面） |
| C | Plan 模式命令守卫黑名单 | `extensions/tools/command-guard.ts:23-176` | ~70 条（POSIX/Windows/PowerShell/git/npm 子命令级）；sudo/env wrapper 跳过到达真实命令；自我声明"不是 shell 解释器" | 纵深防御最后一道 | 低 | 不适用（FAR-Lab 无 shell 暴露面） |
| C | Zod 宽容 schema（别名 union + coerce） | `extensions/tools/schemas.ts:75-106` | z.union 8 种变体；z.coerce.number()；别名归一化 | 宽容不拒绝 | 低 | 部分（llm.ts 容错链同思路） |
| D | Agenda 任务管理器（乐观并发审批） | `tasks/agenda-task-api.ts:16-43` | approveTask(taskId, actor, expectedRevision) 乐观并发；自动化策略 | 带审批任务队列 | 中 | 部分（orchestrator 状态机已有事务性） |
| D | spawn_agent 子代理委派 | `extensions/tools/team/spawn-agent-tool.ts:30-47,117-151` | {systemPrompt, task}；独立 conversationId；parentAgentId 追踪；角色工具过滤；生命周期钩子 | 递归代理 | 中 | 缺失（按最小架构不变量暂不引入） |
| E | Git-stash 检查点+未跟踪文件捕获 | `hooks/checkpoint-hooks.ts:11-14,117-150` | `git stash create` + third-parent 技术捕获未跟踪文件（临时 index + write-tree + commit-tree） | 影子回滚点 | 中 | 不适用（FAR-Lab 状态在 sqlite，已有事务恢复） |
| E | 原子检查点恢复事务 | `session/checkpoint-restore.ts:50-150` | private ref `refs/cline/restore-transactions/{uuid}`；commit()/rollback()（reset --hard + clean -fd + stash apply） | 原子恢复模式 | 中 | 不适用（同上） |
| G | 穷举 stream-part 分类（never 编译安全网） | `llms/providers/middleware/stream-part-classification.ts:46-100` | switch 全分类 + `never` catch-all 使新增类型编译失败；分类驱动重试资格与事件转换 | 编译期防护 API 变更 | 低 | **可借鉴（FAR-Lab 非流式但错误分类可用同穷举纪律）** |
| I | 15+ Provider 网关工厂注册表 | `llms/providers/compat.ts:29-44,146-176` | 工厂映射 + transport/protocol 优先解析 + OpenAI-compatible 兜底 | 协议归一化 | 高 | 部分（FAR-Lab 三 provider + models.dev 目录已覆盖目标） |
| I | 统一流式类型（discriminated union） | `llms/providers/stream.ts:17-129` | text/media/reasoning/usage/tool_calls/done；usage 携带 cacheWrite/Read tokens + totalCost | 类型即协议 | 中 | 不适用（非流式） |

## Top-5（子 Agent 排序；主 Agent 期望值校正）

1. 双策略压缩 + 溢出恢复强制确定性路径——**缓延**（FAR-Lab 单次调用无会话历史；反转触发：引入多轮会话）
2. Git-stash 检查点 + 原子恢复——**不适用**（FAR-Lab sqlite 事务恢复已覆盖）
3. Plan/Act 预设 + 命令守卫——**缓延**（无 shell/写面；触发：引入工具执行面）
4. 穷举分类 + never 安全网——**低成本可借鉴**（错误分类穷举纪律）
5. spawn_agent 委派——**缓延**（最小架构）

## 主 Agent 备注

cline 对 FAR-Lab 的净可收割面窄（coding-agent 专用面多），但两处工程纪律值得吸收：①穷举分类编译安全网思想；②截断显式标记约定（`...[truncated N chars]`）与 FAR-Lab 截断现状对照。
