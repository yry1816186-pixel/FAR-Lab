# Breadth report: Aider-AI/aider (Wave-4, 2026-08-22)

Source: breadth subagent (Explore) over `.cache/repos/aider` (Apache-2.0, main-agent license-verified). Full 28-entry table received.

## Repo overview

Apache-2.0（LICENSE.txt:192-194）。Python 147 .py / ~38k 行。litellm 网关；coders/ 15+ 编辑格式协议栈；benchmark/ polyglot 评估。

## Mechanism inventory（主 Agent 精选收敛项）

| 组 | 机制名 | file:line | 做法摘要 | 价值 | 成本 | FAR-Lab 对照 |
|---|---|---|---|---|---|---|
| A | CoderPrompts 插槽继承 | `aider/prompts.py:6-22` + `coders/base_prompts.py:1-10` | prompt 模板组合继承，子类按需覆写插槽 | 模板工程化 | 低 | 部分（stages 内联提示） |
| A | SwitchCoder 热切换 | `aider/commands.py:30-31` | 异常重建 Coder 实例不退会话 | 运行时切引擎 | 中 | 不适用 |
| B | 递归二分聊天摘要 | `aider/history.py:33-96` | 超 max_tokens 从中间 split，weak_model 摘要前半再递归；深度 3；保留近期原文的非对称策略 | 长史压缩 | 中 | 缓延（无多轮） |
| B | Repo-map AST+PageRank+二分预算 | `aider/repomap.py:365-574,676-706` | tree-sitter 标签→MultiDiGraph→PageRank→二分搜索找最接近 map_tokens 的子集（误差<15%） | **算法创新**：预算内最优子集 | 高 | **高相关**：FAR-Lab 文献选择可类比（检索池→token 预算内最优子集）——但 FAR-Lab 已有 LLM listwise rerank + 池小（max 44） |
| B | ChatChunks 7 桶+缓存控制 | `aider/coders/chat_chunks.py:28-53` | 仅静态桶打 Anthropic cache_control: ephemeral | 精细缓存 | 低 | 不适用（DeepSeek 服务端自动缓存） |
| C | 编辑格式协议栈 5 级工厂 | `aider/coders/base_coder.py:124-201` | 模型-格式映射声明式配置（weak=whole, strong=diff） | 模型能力适配 | 中 | 部分（strict-FC/json_object 双传输已是此思想） |
| C | RelativeIndenter+相似行建议 | `aider/coders/search_replace.py:18-100` + `editblock_coder.py:100-117` | 相对缩进匹配；失败给 "Did you mean" 模糊建议 | 渐进容错+self-correction | 高 | 思想可借（FAR-Lab 容错链已同族） |
| D | **Architect-Editor 弱强分工** | `aider/coders/architect_coder.py:22-31` | 强模型出方案（禁输出全文件）→弱模型执行编辑；实测成本降 50-70% | 战略级成本优化 | 高 | **候选**：FAR-Lab 阶段模型分工（强模型 hypotheses/弱模型 normalize 类）——需 live 路由恢复后评估，记 B |
| D | Reflection 自修正循环（上限3） | `aider/coders/base_coder.py:924-944` | lint/test 失败→错误回喂→重生成；计数防无限 | 生成-验证-修正闭环 | 低 | **已有等价+**（http.ts invalid_output 3 次纠正性重问 D-034；FAR-Lab 领先在确定性 zod 反馈） |
| E | scrub_sensitive_info | `aider/format_settings.py:1-9` | API key→...{last4} | 防截图泄漏 | 低 | 相关（与 codex sanitizer 合并为错误/日志脱敏候选） |
| G | 指数退避+错误分类+上下文溢出降级 | `aider/coders/base_coder.py:1449-1512` | 0.125s 起翻倍至 60s 上限；分类可重试/不可重试/溢出 | 同族收敛（第 4 个仓库同类机制） | 低 | 部分（W1 纪律已有，缺 jitter/retry-after） |
| G | malformed_responses 统计指标 | `aider/coders/base_coder.py:97-98` + `benchmark/benchmark.py:587-588` | 格式良好率作为模型选型指标 | 指令遵循可观测 | 低 | **可借**（FAR-Lab receipt 已有 finishReason/重试计数——可在 metrics 汇总为 schema-conformity rate） |
| I | 三模型架构 main/weak/editor | `aider/models.py:603-645` | 摘要/commit 用 weak model fallback main | 任务路由 | 中 | 部分（models.dev 目录+provider 注册已有基础） |
| J | **Polyglot benchmark 框架** | `benchmark/benchmark.py:161-860` | 目录隔离+config.json+断点续跑+多维评分+回归 diff（show_diffs） | 工程成熟度最高 | 中 | **相关**：FAR-Lab eval 已有判分；增量=统一编排层+回归 diff 门禁（价值待 Gate：FAR-Lab eval 任务数少，编排层收益有限） |
| J | 多维评分（cost/latency/error taxonomy） | `benchmark/benchmark.py:468-629` | 12+ 维度含性价比 | 评测维度工程 | 中 | 部分（EV1 已记 token 成本） |

## Top-5（子 Agent 排序）

1. Repo-map 算法（图排名+二分预算）——**缓延**（FAR-Lab 检索池小+已有 rerank；触发：池>60 时与 ONNX rerank 项合并评估）
2. Architect-Editor 分工——**缓延**（需 live 多模型路由验证成本假设；触发：路由恢复+成本数据）
3. Reflection 循环——**已有**（invalid_output 纠正性重问）
4. Polyglot benchmark 框架——**缓延**（任务集小）
5. ChatChunks 缓存——**不适用**（DeepSeek 自动缓存）

## 主 Agent 备注

aider 的最大遗产是验证了 FAR-Lab 三处既有设计（纠正性重问、双传输、token 记账）与业界一致；净新增=malformed-rate 指标思想 + repo-map 算法记档。
