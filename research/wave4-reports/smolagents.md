# Breadth report: huggingface/smolagents (Wave-4, 2026-08-22)

Source: breadth subagent (Explore) over `.cache/repos/smolagents` (Apache-2.0, main-agent license-verified).
Spot-checks by main agent: `utils.py:257-265` (truncate_content: keep-first-half + marker + keep-last-half, default 20000) ✅; `default_tools.py:83-90` (FinalAnswerTool) ✅; `memory.py:24-40` (typed ToolCall/step dataclasses) ✅.

## Repo overview

Apache-2.0 (`LICENSE:1-2`). Pure Python, ~10k LOC core, 26 test files. Minimalist agent library: CodeAgent (code-as-action) + ToolCallingAgent (JSON FC) share one ReAct loop; local AST interpreter sandbox; 9 model backends; externalized YAML prompt templates.

## Mechanism inventory (condensed; full table in subagent output)

| 组 | 机制名 | file:line | 做法摘要 | 价值 | 成本 | FAR-Lab 对照 |
|---|---|---|---|---|---|---|
| A | Jinja2 外置提示模板（YAML） | `agents.py:102-107` + `prompts/code_agent.yaml` | 全部提示外置 YAML+StrictUndefined；few-shot 完整思维链内嵌；工具签名按 agent 类型渲染 | 提示=可迭代资产 | 低 | 部分（提示在代码内） |
| A/B | 代码即动作原语 | `agents.py:1638-1764` | LLM 生成代码块（可组合多工具+算术+分支）在沙箱执行，状态跨步持久 | 比单次 JSON FC 更可组合 | 高 | 缺失（不适用：FAR-Lab 无代码执行需求，灵魂边界） |
| B | 类型化 Step 记忆 + summary_mode | `memory.py:24-316` | TaskStep/ActionStep/PlanningStep/FinalAnswerStep 各自 to_messages()；plan 的 summary_mode 防上下文膨胀 | 结构化可重放记忆 | 低 | 部分 |
| B | truncate_content 双半截断 | `utils.py:257-265` | 保留前半+后半+截断标记（前缀=设置，后缀=结果） | 简单有效的防爆膨 | 极低 | **缺失（立即可用）** |
| B | 沙箱跨步状态持久 | `local_python_executor.py:1688-1766` | 变量在步间持久；send_tools/send_variables 注入 | 有状态执行 | 中 | 不适用 |
| C | @tool 装饰器→自动 schema | `tools.py:1061-1168` | 类型注解+docstring→JSON schema→Tool 子类 | 低摩擦工具创作 | 中 | 不适用（FAR-Lab 无 tool 层） |
| C | 工具双渲染（code/JSON） | `tools.py:258-290` | 同一工具按 agent 范式自描述 | 一注册表两范式 | 低 | 部分 |
| D | ReAct 循环 + max_steps 优雅降级 | `agents.py:540-611,810-853` | 步数耗尽→provide_final_answer 从历史合成结论而非挂死 | 防无限循环+优雅收尾 | 低 | 部分（FAR-Lab 阶段机线性无此问题，但 stage 内部循环可借鉴） |
| D | planning_interval 显式规划步 | `agents.py:549-567,639-747` | 每 N 步独立规划调用；plan 以 summary_mode 注入不占动作预算 | 规划/动作分离 | 低 | 部分 |
| D | final_answer 强制终止语义 | `default_tools.py:83-90` + executor exception | 必须调用 final_answer 才结束；BaseException 防生成代码吞掉终止信号 | 消灭"循环不收尾"失败模式 | 中 | 缺失（不直接适用：FAR-Lab 单次调用无循环） |
| D | managed_agents 层级（子代理=工具） | `agents.py:369-388,868-890` | 子代理以 name/description 注册为父工具；结构化 report 返回 | 轻量 manager-worker | 低 | 缺失 |
| G | final_answer_checks 验证钩子 | `agents.py:287,613-618` | 可插拔验证器数组 (answer, memory, agent)=>bool，失败抛错 | 领域质量门 | 极低 | **可借鉴（FAR-Lab 已有 gate 阶段类似物）** |
| G | 异常层级分类恢复 | `utils.py:92-137` | Parsing/Execution/Generation/MaxSteps 分离；执行错误回喂上下文带"勿重复错误"指导；实现 bug 重抛 | 分型恢复策略 | 低 | 部分 |
| I | ApiModel 基类（限流+退避重试） | `models.py:1159-1188` + `utils.py:497-606` | RateLimiter + Retrying（3 次/60s 基/2x/jitter）统一注入所有 API 模型；429 字符串谓词 | ~80 行生产级韧性 | 低 | 部分（FAR-Lab http.ts 已有类似纪律） |
| I | stop-sequence 优雅降级 | `models.py:79-91,418-438` | 不支持 stop 参数的模型（o3/o4/gpt-5/grok）用事后正则截断 | 模型现实适配 | 低 | 适用 |
| J | benchmark runner（Hub 数据集+并行+JSONL） | `examples/smolagents_benchmark/run.py` | 3 模式对比（code/FC/vanilla）同任务集；并行；中间步存储 | 多模式同任务对比 | 中 | 已有（FAR-Lab eval 已强） |

## Top-5（子 Agent 排序）

1. **Jinja2/YAML 外置提示模板 + few-shot 样例**（72 分）：提示迭代不改编译代码；code_agent.yaml 的 6 个 few-shot 是错误恢复/组合/final_answer 使用的示范
2. **final_answer 强制终止 + final_answer_checks 验证钩子**（80 分）：消灭循环不收尾；可插拔领域质量门
3. **ApiModel 限流+退避基类**（70 分）
4. **类型化 Step 记忆 + summary_mode**（63 分）
5. **代码即动作原语**（54 分）——主 Agent 注：与 FAR-Lab 灵魂边界/无代码执行冲突，仅记为不适用

## 主 Agent 交叉比对备注

- truncate_content（双半截断）是 FAR-Lab 检索全文/长 claim 文本注入的立即可用小机制（zero-dep）
- final_answer_checks 模式与 FAR-Lab guard/verify 阶段同构——融合价值低（已有）
- 提示外置 YAML：FAR-Lab 提示在 stages 内联——外置可提升迭代速度但会动所有 stage 文件；价值/成本比待 Gate 评估
