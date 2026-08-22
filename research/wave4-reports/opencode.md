# Breadth report: sst/opencode (Wave-4, 2026-08-22)

Source: breadth subagent (Explore) over `.cache/repos/opencode` (MIT, main-agent license-verified).
Spot-checks by main agent: `packages/opencode/src/session/retry.ts:26-33` (RETRY_* constants + RETRYABLE_MESSAGE_PATTERNS) ✅ verified; `packages/core/src/instruction-context.ts:40-60` (AGENTS.md fs.up discovery + global merge) ✅ verified.

## Repo overview

MIT (`LICENSE:3`). TypeScript monorepo (29+ packages, ~3255 ts/tsx), Effect-TS core + SolidJS TUI (OpenTUI), Drizzle ORM + SQLite persistence, 11 LLM providers × 6 protocol adapters, plugin system (hook-driven), primary/subagent orchestration, LSP integration, MCP support.

## Mechanism inventory (top per group)

| 组 | 机制名 | file:line | 做法摘要 | 为何高价值 | 移植成本 | FAR-Lab 对照 |
|---|--------|-----------|----------|------------|----------|--------------|
| A | 多模型系统提示路由 | `packages/opencode/src/session/system.ts:27-49` | provider() 按 model id 前缀返回 9 套模型家族专属系统提示模板 | 提示工程模型感知自适应 | 低 | 缺失（单提示） |
| A | 环境上下文自动注入 | `packages/opencode/src/session/system.ts:67-103` | 自动构建 cwd/git 状态/平台/日期/引用列表的结构化 env 块注入系统提示 | 降低幻觉+资源边界感知 | 低 | 部分 |
| A | Skill/MCP 能力声明式注入 | `packages/opencode/src/session/system.ts:105-135` | skill 列表与 MCP server 指令以 XML 块注入，按权限过滤 | 能力透明度 | 低 | 缺失 |
| B | AGENTS.md 层级发现与合并 | `packages/core/src/instruction-context.ts:40-101` | fs.up 向上遍历找 AGENTS.md，与全局合并去重，按来源路径渲染注入 | 全局→项目→子目录三级指令继承 | 低 | 缺失 |
| B | 智能 Compaction 引擎 | `packages/opencode/src/session/compaction.ts:28-120` | PRUNE_MINIMUM=20000/PRUNE_PROTECT=40000 token 阈值；TOOL_OUTPUT_MAX_CHARS=2000；preserveRecentBudget() 保留最近 25% 窗口；truncate() 截断加 [truncated] 标记；splitTurn() 按轮次切分 | 三级策略（保护最近+截断工具输出+LLM 摘要） | 中 | 部分（无显式 compaction） |
| B | 会话持久化（Drizzle+SQLite） | `packages/opencode/src/session/session.ts:39-118` | 会话实体含 tokens/cost/revert/summary，fromRow/toRow 双向序列化，parentID 子会话追踪 | 消息级持久化（比 FAR-Lab 阶段级更细） | 中 | 已有（阶段粒度） |
| C | 类型安全 Tool Schema | `packages/llm/src/tool.ts:15-206` | ToolSchema 约束纯数据 Schema；Tool 接口捆绑 description/parameters/success/execute；Typed+Dynamic 双模式 | 编译期+运行时双重类型安全 | 低 | 缺失（无 tool 层） |
| C | 权限门控工具可见性 | `packages/opencode/src/permission/index.ts:204-219` + `tool/registry.ts:81-87` | disabled() 按权限规则过滤工具；visibleTools() 只暴露允许集合；plan 模式隐藏 edit | 最小权限落地 | 低 | 部分 |
| D | Primary/SubAgent 双模式 | `packages/opencode/src/agent/agent.ts:140-195` | agent 定义 mode: primary/subagent/all；各自独立 permission/model/temperature/prompt；TaskTool 委托 | 职责分离+沙箱隔离 | 中 | 缺失 |
| D | Plan 模式（计划/执行分离） | `packages/opencode/src/agent/agent.ts:156-181` | plan agent edit 全 deny，仅允许写 .opencode/plans/*.md；PlanExitTool 流转 | 人机协同审查点 | 低 | 缺失（FAR-Lab 有 plan 阶段但非审批门） |
| E | 通配符权限匹配引擎 | `packages/opencode/src/permission/index.ts:28-38,178-198` | Wildcard.match 双维度通配符；fromConfig 展平嵌套配置；expand() 处理 ~/$HOME | 灵活权限 DSL（"*.env": "ask"） | 低 | 缺失 |
| E | 异步权限审批流 | `packages/opencode/src/permission/index.ts:67-167` | ask() 创建 Deferred 挂起；reply() 支持 reject/once/always；reject 联动拒绝同 session 全部待审批 | 三种粒度+防批量绕过 | 中 | 部分（同步确认） |
| G | retry-after 感知指数退避 | `packages/opencode/src/session/retry.ts:26-207` | RETRY_INITIAL=2000/FACTOR=2/JITTER=0.25/MAX=5；delay() 优先解析 retry-after-ms/retry-after 头（秒+HTTP date）；RETRYABLE_MESSAGE_PATTERNS 正则族 | 尊重服务端指导+抖动+cap | 低 | 部分（有重试无 retry-after） |
| G | 结构化输出 Tool Call 强制 | `packages/llm/src/llm.ts:80-186` | generateObject() 创建合成工具 + toolChoice 强制调用 | 跨协议统一 JSON mode | 低 | **已有等价**（strict-FC D-026） |
| I | 11-Provider 多协议抽象 | `packages/llm/src/providers/index.ts` + `protocols/` | 6 协议适配器（openai-chat/responses/anthropic/gemini/bedrock/compatible）；ToolAccumulator 跨 chunk 累积 | 业界最全覆盖 | 高 | 部分（OpenAI 兼容） |
| I | Model Catalog + small() 启发式 | `packages/core/src/catalog.ts:13-286` | catalog 维护 provider/model 字典；small() 用 cost+age+name 关键词加权选轻量模型 | "快速初筛→慢速精验"模型选择 | 中 | 部分（有 models.dev 目录 D-033） |
| H | SolidJS+OpenTUI 终端渲染 | `packages/tui/src/app.tsx` | 响应式 TUI 框架、命令面板、多会话 tab | 现代 TUI | 高 | 不适用 |
| J | （无内置 eval 框架） | — | 靠 e2e+dogfooding | — | — | FAR-Lab 领先 |

## Top-5 移植建议（子 Agent 排序；主 Agent 交叉比对后重新排序见 scout §3）

1. **AGENTS.md 层级指令加载**（~100 行，MIT）：FAR-Lab 场景 → 实验协议/项目规范三级注入
2. **通配符权限引擎**（~200 行）：FAR-Lab 权限域 data_delete/external_api/model_call/experiment_overwrite
3. **retry-after 感知重试**（~100 行）：升级 http.ts W1 纪律（retry-after 头解析 + jitter + 正则族分类）
4. **结构化输出 tool call 强制**（~80 行）——主 Agent 注：FAR-Lab strict-FC（D-026）已等价实现，此项降级为已覆盖
5. **Primary/SubAgent 编排**（~400 行）：coordinator + literature_worker/stats_worker 分工

## 附录：Plan 模式（30 行级别）、Model Catalog small()、Compaction 引擎——按需引入
