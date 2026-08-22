# Breadth report: All-Hands-AI/OpenHands (Wave-4, 2026-08-22)

Source: breadth subagent (Explore) over `.cache/repos/OpenHands` (MIT "The MIT License (MIT)", main-agent license-verified). Full 28-entry table received.

## 结构澄清（重要）

本仓 HEAD 已是**纯前端 Agent Canvas**（@openhands/agent-canvas v1.15.0，1214 .ts/.tsx，0 个 Python 包目录）。后端（agent 运行时/condenser 算法/沙箱/SWE-bench eval）已迁至 `OpenHands/software-agent-sdk` 仓（本次未克隆——若需后端机制深钻需另行获取，已如实记录）。本报告价值=后端 wire shape 的类型投影 + 前端消费逻辑。

## 机制精选（主 Agent 校正 FAR-Lab 对照）

| 组 | 机制 | file:line | 要点 | FAR-Lab 对照 |
|---|---|---|---|---|
| B | Condensation 事件协议 | `src/types/agent-server/core/events/condensation-event.ts:5-52` | forgotten_event_ids[] + summary + summary_offset；Request/Event/Summary 三事件 | 缓延（并入 compaction 设计档；可观测协议形状值得记档） |
| B | 事件流去重排序不变量 | `src/stores/use-event-store.ts:55-100` | 有序数组+Set 去重双结构；批量乱序重排；会话切换原子重置 | 已有等价（FAR-Lab sqlite appendEvent + run 状态机） |
| D | Goal loop + judge verdict | `conversation-state-event.ts:67-97` | objective/score/complete/missing + running/complete/capped/interrupted | **概念已覆盖**（FAR-Lab falsify spec + testability + tournament 即此思想的领域化实现） |
| D | 确认策略三级 | `agent-server-adapter.ts:593-605` | NeverConfirm/ConfirmRisky(HIGH)/AlwaysConfirm 映射 | 不适用（无逐操作人机面） |
| E | per-action SecurityRisk | `common.ts:59-64` + `action.ts:61-62` | UNKNOWN/LOW/MEDIUM/HIGH 由 llm/pattern/policy_rail 分析器填充 | 不适用（无工具执行面） |
| E | LookupSecret 引用模式 | `agent-server-adapter.ts:540-591` | 前端永不持明文；Fernet token + url 引用延迟解析 | 部分（FAR-Lab env-only 密钥策略已达成同等目标——密钥不进库不进对话；无需改） |
| F | Hook 事件 6 类 | `hook-execution-event.ts:6-100` | PreToolUse/PostToolUse/UserPromptSubmit/SessionStart/SessionEnd/Stop + blocked 语义 | 缓延（同 hermes hooks 条目） |
| G | CriticResult 结构化自评 | `critic.ts:43-50` | score(0-1)/message/分类特征+概率 | **概念已覆盖**（FAR-Lab scorecard + uncertainties + falsify 即领域化实现） |
| G | stuck_detection + max_iterations | `agent-server-adapter.ts:1125-1126` | 重复行为检测+确定性上限 | 部分（FAR-Lab 阶段 attempt 计数 + invalid_output 3 次上限同族） |
| J | mock-LLM E2E 基础设施 | `tests/e2e/mock-llm/` | mock server 发真实 wire shape 事件测前端，11 领域 | 已有等价（FAR-Lab test-stub provider 脚本化响应 + 281 测试） |

## 净结论

前端仓对 FAR-Lab 的直接移植价值低（无后端实现），但其类型层验证了 EventStream/goal-loop/critic 的协议形状——这些概念 FAR-Lab 均已有领域化等价物（falsify/testability/tournament/scorecard）。唯一记档：condensation 事件协议的 forgotten_ids+summary 形状（并入 compaction 设计档）。后端 sdk 仓未克隆如实记录；如未来需要 sandbox/condenser 实现细节需补克隆。
