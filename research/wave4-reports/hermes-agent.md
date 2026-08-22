# Breadth report: NousResearch/hermes-agent (Wave-4, 2026-08-22)

Source: breadth subagent (Explore) over `.cache/repos/hermes-agent` (MIT, main-agent license-verified).
Spot-checks by main agent: `agent/tool_guardrails.py:20-40` (IDEMPOTENT_TOOL_NAMES frozenset) ✅; `agent/retry_utils.py:90-128` (jittered_backoff: min(base*2^(n-1), max) + uniform jitter [0, 0.5*delay], time_ns^counter seed) ✅; `agent/background_review.py:37-60` (_BackgroundReviewRun cancel/request handshake) ✅.

## Repo overview

MIT (LICENSE:5-8). Python core (agent/ 140+ modules; run.py 1.5MB, conversation_loop.py 472KB) + TS UI. "Self-improving agent": skills-from-experience learning loop, persistent memory, FTS5 session search, 15+ provider adapters, 7-platform messaging gateway. Released 2026-02.

## Mechanism inventory (30 entries, condensed to the load-bearing ones)

| 组 | 机制名 | file:line | 做法摘要 | 价值 | 成本 | FAR-Lab 对照 |
|---|---|---|---|---|---|---|
| A | 三层系统提示（stable/context/volatile） | `agent/system_prompt.py:10-24,340-921` | 身份层永不重建（prefix cache 温热），memory/skills 每轮可变独立层 | 缓存友好的稳定性解耦 | 中 | 部分 |
| A | Slash Skill 标记化注入 | `agent/skill_commands.py:54-62,311` | `[IMPORTANT: user invoked "x"]` 标记 + 内存提供者剥离 skill 全文只存纯指令 | 载荷可识别/可剥离 | 低 | 缺失 |
| B | 辅助模型压缩器 | `agent/context_compressor.py:1-100` | 廉价 aux model 总结中间轮次，保护 head/tail；迭代式 summary；tool output 预修剪；summary budget 与压缩量成正比 | 双模型分工压缩 | 高 | 部分 |
| B | OpenAI 原生服务端压缩（gate+fallback） | `agent/native_compaction.py:1-67` | Responses API context_management.compaction；native 阈值比 local 低 8K 安全余量；local 兜底 | 双层 ownership | 高 | 缺失 |
| B | MemoryManager 单集成点 | `agent/memory_manager.py:1-81` | 单外部 memory provider 强制限制；initialize→prompt_block→prefetch→sync_turn→shutdown 生命周期 + hooks | 防 schema 膨胀 | 中 | 缺失 |
| C | 工具 stall 检测守卫 | `agent/tool_guardrails.py:20-100` | IDEMPOTENT/MUTATING/POLL 三类；连续 3 次相同调用(工具+参数+结果 byte-equal)触发 stall 通知；重复结果>512B 替换为引用 stub(120 字符参数预览) | 防死循环+省 context | 低 | 缺失 |
| C | 并行工具批调度 | `agent/tool_executor.py:116-119` | 8 并发池；NEVER_PARALLEL 强制串行；大结果溢出磁盘 `<persisted-output>` | 吞吐/安全平衡 | 中 | 部分 |
| D | Background Review 学习叉 | `agent/background_review.py:37-113,1478` | 每轮后可选 fork daemon agent 回放快照自问"该存什么 skill/memory"；继承运行时；工具白名单；写直达 store；cancel timeout 2s | **核心创新**：经验→知识闭环 | 高 | 缺失 |
| D | MoA 编排 + 隐私过滤 | `agent/moa_loop.py:26-73` | reference model 输出聚合；redact secrets+PII 三档模式 | 多模型协作 | 中 | 部分 |
| E | 正则秘密脱敏（vendor 前缀族） | `agent/redact.py:1-100` | 导入时快照 env 防运行时绕过；短 token 全遮蔽、长 token 保首6尾4；20+ vendor 前缀；query 名+body key 双维 | 安全默认 ON | 低 | 已有（可补 vendor 列表） |
| E | 结构化错误分类器 | `agent/error_classifier.py:30-100,765` | 25+ FailoverReason 枚举；retryable/should_compress/should_rotate_credential/should_fallback 四维恢复提示 | 分类驱动恢复 | 中 | 部分（3 类 vs 25+） |
| F | 事件 Hook 系统 | `gateway/hooks.py:54-229` | ~/.hermes/hooks/ 发现 HOOK.yaml+handler；7 事件 + command:* 通配；emit_collect() 决策型；错误不阻塞 | 轻量扩展点 | 低 | 缺失 |
| F | /learn 标准引导创建 | `agent/learn_prompt.py:34-237` | 隐性知识→标准 skill：name<=64/description<=60/version 0.1.0；source hygiene 防注入；大源料分 chapter 按需加载 | 标准化沉淀流水线 | 中 | 缺失 |
| F | Curator 空闲维护 | `agent/curator.py:70-80` | 空闲+>7d 触发 aux 审核只动 agent-created skills；只 archive 不删；pinned 跳过；合并默认关 | 防膨胀保守默认 | 中 | 部分 |
| G | 被动验证证据账本 | `agent/verification_evidence.py:1-54` | 记录执行过的命令+结果分类；SQLite WAL；30 天过期；每 session 最多 100 条；被动不阻断 | 可审计不侵入 | 低 | 部分 |
| G | 抖动退避 + provider-aware 重试 | `agent/retry_utils.py:90-191` | decorrelated jitter；per-provider 自适应（如长退避表 30→60→90→120s）；parse_retry_after_seconds() RFC7231 | 重试风暴防护 | 低 | 部分（无 jitter/retry-after） |
| G | Usage Insights 成本引擎 | `agent/insights.py:1-100` | token/成本按 model/provider 聚合；sub-cent 不坍塌 ~$0.00 | 成本透明 | 中 | 缺失 |
| I | Reasoning Effort 阶梯 clamp | `agent/reasoning_effort.py:50-213` | 8 级内部词汇→per-provider wire 集；不支持时取最近弱级（never silent cost escalation）；单调保证 | 单一真相源消 bug 类 | 中 | 部分 |
| J | Eval 三件套（含 compaction 回归） | `evals/compaction/` 等 | 压缩是有损的必须回归验证；fixtures+policies+runner+HTML report | eval 方法论 | 中 | 已有（可交叉参考） |

## Top-5（子 Agent 排序）

1. **Background Review 自改进闭环**（价值5×可行4）：orchestrator 完成后 optional fork 轻量模型回顾"有无方法论值得沉淀"，白名单写 knowledge-base，cancel timeout 2s
2. **/methodology 标准引导创建**（5×3）：description<=60 硬截断保路由信号；source hygiene；chapter 按需加载
3. **Stall 检测守卫**（4×4）：~100 行纯函数：{tool, args_hash, result_hash} 滑窗，连续 3 次相同→notice+stub 替换，轮询类豁免
4. **事件 Hook 系统**（4×3）：hypothesis:created / experiment:* / phase:transitioned 事件 + 决策型 emit_collect
5. **抖动退避 + provider-aware + Retry-After**（3×4）：http.ts 重试环升级

## 附录值得保留的设计模式

MemoryProvider ABC；Reasoning Effort clamp 单调表；Learning Graph 词法重叠边；file safety 三级（deny/approve-once/approve-always）；Curator idle-trigger；native compaction 双层 gate；Subagent HMAC capability handle。
