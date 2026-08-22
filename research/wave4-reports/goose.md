# Breadth report: block/goose (Wave-4, 2026-08-22)

Source: breadth subagent (Explore) over `.cache/repos/goose` (Apache-2.0 "Copyright 2024 Block, Inc.", main-agent license-verified). Full 30-entry table received with verified file:line.
Main-agent spot-checks: `crates/goose-context-management/src/lib.rs:32-64`（trait 化 compaction API + DEFAULT_COMPACTION_THRESHOLD=0.8）✅；`src/structured.rs:14-80`（lenient 反序列化族）✅。

## Repo overview

Apache-2.0。Rust 单仓 15 crates / 518 .rs。goose-agent（状态机+Operation trait）、goose-context-management（专用压缩 crate）、goose-mcp、goose-providers（12 内置 + 44 声明式 JSON）、goose-cli、evals/harbor。

## 机制精选（全表见子 Agent 输出；主 Agent 校正 FAR-Lab 对照）

| 组 | 机制 | file:line | 要点 | FAR-Lab 对照 |
|---|---|---|---|---|
| B | Lenient StructuredSummary + raw-text 回退 | `goose-context-management/src/structured.rs:14-38,128-193` | 9 语义字段宽松反序列化（对象→字符串化、标量→包裹数组、未知字段 flatten 保留）；解析全败时保留原始文本=零信息损失 | 缓延（无压缩场景；lenient 思想 FAR-Lab 容错链同族） |
| B | 渐进式 tool-response 丢弃 | `summarize.rs:14,37-74,131` | 摘要器自身溢出→按 [0,10,20,50,100]% 中间向外丢弃 tool response 重试 | 缓延（同上） |
| B | Brace-balanced JSON 提取 | `structured.rs:216-290` | `</analysis>` 终止符+fence+花括号深度（字符串感知）从噪声输出提取 JSON | 相关度低（strict-FC 默认传输后参数已是干净 JSON 串；json_object 回退路径可用） |
| B | CompactingProvider 透明装饰器 | `provider.rs:18-110` | 包装任意 provider 拦截 ContextLengthExceeded→压缩→重试；manages_own_context() 选择退出 | 缓延 |
| C | MCP memory server + 路径遍历防护 | `goose-mcp/src/memory/mod.rs:23-40,184-215` | 类别名拒绝 `..`/分隔符/Windows 保留名；tag 分隔存储；全局记忆被动注入 | 缓延（无跨会话记忆需求当下） |
| D | Review orchestrator 有界并行 | `goose-cli/src/commands/review/orchestrator.rs:46,86-154` | Semaphore(4)+子进程隔离+per-check 失败回退空 findings 不中止兄弟+JSON 契约 | 相关度低（FAR-Lab eval 按公平比较设计为顺序） |
| E | 供应链 deny 策略 | `deny.toml:1-13` | yanked=deny；RUSTSEC 忽略带理由注释 | 部分（FAR-Lab zod-only 零运行时依赖=更强约束；npm audit 无策略文件——低价值） |
| F | 声明式 provider 注册表 | `goose-providers/src/declarative/definitions/`（44 JSON） | 加 provider=一个 JSON 文件 | **已覆盖等价**（FAR-Lab models.dev 目录 D-033 + provider 注册） |
| G | Harbor benchmark 框架 | `evals/harbor/README.md:1-239` | Docker 跑 terminal-bench-2（89 任务）；cost/token/turn 指标；compare 模式回归检测 | 已有等价（FAR-Lab eval 体系 + 判分 v2） |
| D | StateMachine + Operation/Inference trait | `goose-agent/src/machine.rs:34-153` | 步=副作用 Operation 或 Inference；Inference 聚合所有 Operation 的 tools/prompt；协作取消 | 缓延（FAR-Lab 线性阶段机更简单且够用；触发=阶段需动态组合） |

## Top-5（子 Agent 排序；主 Agent 期望值校正）

1. goose-context-management 全家——**缓延**（无多轮会话；设计档并入注册表 B compaction 条目）
2. 声明式 provider 注册表——**已覆盖**（models.dev D-033）
3. Review orchestrator 并行模式——**低相关**（eval 顺序设计是有意的公平性选择）
4. Memory server——**缓延**（触发：跨会话用户偏好需求）
5. StateMachine trait 组合——**缓延**（最小架构）

## 净结论

goose 的压缩 crate 是全场最完整的 compaction 工程（宽松 schema+回退+渐进丢弃+装饰器四件套），全部记入注册表 B 的 compaction 设计档（与 deepseek 9 段 checkpoint、cline 双策略合并为一条，反转触发=多轮会话）。对当下 FAR-Lab 净新增为零。
