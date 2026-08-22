# Breadth report: deepseek-ai/deepseek-harness (Wave-4, 2026-08-22)

Source: breadth subagent (Explore, 3 轮渠道故障仅回收摘要) + 主 Agent 亲读关键包。MIT（LICENSE "Copyright (c) 2026 DeepSeek"，主 Agent 亲验）。Cordis 元框架 "everything is a plugin"；TS monorepo 40+ packages（compaction/context/core/guard/hooks/llm/plan/session/sandbox/goal/feedback/...）；v0.1.1-rc.2。

**主 Agent 亲验清单**（一手证据，非子 Agent 转述）：
1. `packages/compaction/compaction-basic/src/summarizer.ts:31-66` ✅ — 9 段式 checkpoint 压缩提示（Primary Request/Key Concepts/Files/Errors/Pending/Current Work/Next Step/Critical Context + 规则：保留 verbatim 路径/命令/错误串/数值/签名；不提及压缩本身；先前 checkpoint 合并不照抄）
2. `packages/compaction/compaction-tool-result-pruner/src/config.ts:1-58` ✅ — 确定性无模型剪枝：threshold 8192/head 4096/tail 1024；固定标记 `[... tool result middle pruned ...]`；**Unicode 码点计数（Array.from，代理对安全）**；不变量 head+marker+tail≤threshold 校验；replay-safe
3. `packages/llm/llm-retry/src/index.ts:1-90` ✅ — **官方重试策略**：exponential = min(initialMs·2^min(n-1,1024), maxMs)；jitter = (1-r+2r·random()) 对称乘性抖动；cancellableDelay(AbortSignal)；per-provider retryableCodes；**每次重试等待前持久化调度（durable retry）**；策略键序列化可比较

## 子 Agent 摘要转述项（file:line 未经主 Agent 逐条复验，标注 ◇）

| 组 | 机制 | 位置◇ | 要点 | FAR-Lab 对照 |
|---|---|---|---|---|
| B | 结构化压缩（prefix-cache 对齐） | summarizer.ts + compaction 包 | 9 段 checkpoint；stable 前缀不重建 | 缓延（无多轮） |
| B | Tool-result 微压缩 | compaction-tool-result-pruner | **主 Agent 已亲验**（见上） | 相关（head/tail 非对称剪枝思想；FAR-Lab 全文摘录现为 head-only——尾部含结论段，科学文本或应保尾；改动影响 claim 提取需 live 验证→缓延） |
| C | 工具执行管线 Pre/Guard/Around/Post/Result | `packages/core/tools/src/index.ts:152-198,1342-1380`◇ | 五阶段 AOP：pre 三态(allow/deny/ask)→guard 单调拒绝链→around 可替换 signal/注入超时→post 可 block+纠正性反馈→result 只读冻结快照 | 不适用（无工具执行面；post-block 纠正思想 FAR-Lab 已有 invalid_output 重问等价） |
| C | 并行工具调度器（有界池+有序提交+abort 语义） | `packages/core/agent-loop/src/tool-calls.ts:59-213`◇ | per-call 并发分类+maxParallel 池+动态 re-classify+synthetic error 保 replay | 不适用（无工具循环） |
| B | Tool-pairing 平衡不变量 | `packages/compaction/compaction/src/tool-pairing.ts:29-38`（**主 Agent 亲验**：eventDelta 对 tool-call 计数、tool/result -1，cut 只允许在 delta==0） | 压缩切割点必须保持 tool-call/result 配对平衡，防悬空调用/孤儿结果破坏 replay | 记档（并入 R1 compaction 设计档：引入压缩时的必备安全基线） |
| B | Prefix-cache 对齐压缩 + 专用头 | `compaction-basic/src/summarizer.ts:121-182`◇ + `x-deepseek-harness-compact` 头（**主 Agent 亲验**存在于 llm-deepseek/src/adapter.ts） | 摘要调用复用与原请求完全相同的前缀（KV cache 命中），仅追加一条压缩指令 | 记档（并入 R1） |
| G | Lossless-JSON 工具输出契约 | `packages/core/tools/src/index.ts:212-219,544-553`◇ | 工具输出必须过 output.schema 校验（snapshotJsonValue 拒绝 undefined）+render(模型视图)/presentationMeta(UI 视图)分离投影；ToolOutputError 携带逐字段 violations | 不适用（无工具层；violations 精确错误思想 FAR-Lab zod issues 切片已等价） |
| F | 插件化一切（provider/tool/loop 皆可换） | Cordis 框架 | 架构哲学 | FAR-Lab 端口模式（ports.ts）已达成受控可换性；全插件化违反最小架构 |

## 净结论（主 Agent）

deepseek-harness 对 FAR-Lab 的两大一手可验收获：
1. **官方重试策略形态**（指数×对称抖动×上限×可取消×durable）——与 opencode/hermes/pi-mono/aider/smolagents 五仓收敛一致，且是 FAR-Lab 实际模型厂商的自家实现 → F1 融合的权威参照
2. **确定性 tool-result 剪枝纪律**（码点计数/固定标记/预算不变量）——FAR-Lab 全文摘录截断的升级方向（保尾），但改动触及 claim 提取语义，live 验证前缓延
其余（插件化/工具管线/沙箱）为 coding-agent 面，不适用。压缩 9 段式并入注册表 B 设计档。
