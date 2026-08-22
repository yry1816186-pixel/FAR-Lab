# Wave-8 最高执行指令 · 编排/持久化工作流框架源码远征（证据门重访）

> 使用方式：整份作为 /goal 交给新窗口。共同基线见 `research/WAVE-PROMPTS/_COMMON-BASELINE.md`（粘贴时一并带上）。

## 〇、接续点

**开启 Wave-8：高并发子 Agent 深读 agent 编排/持久化工作流框架源码。注册表既有裁决：Temporal/DBOS 整框架 REJECT（自研状态机已过对抗审计）、LiteLLM REJECT——本 Wave 不是翻案 Adopt 框架，而是**源码级抽取其机制**：检查点/恢复语义、人机中断（human-in-the-loop interrupt）、重放（replay）、幂等、状态图可视化、多 agent 状态所有权模式，判定哪些能以最小改动加强 FAR-Lab 的 run 引擎与子 Agent 编排。以证据说话：抽取某机制必须先测量 FAR-Lab 现状的真实痛点（如崩溃恢复粒度、resume 语义、并发 run 干扰——本会话已见过冻结 run 与 CLI 创建即返回分离执行两类现象）。**

## 一、对象清单（起点；核实许可，主动扩充）

| 框架 | 线索 | 重点 |
|---|---|---|
| langchain-ai/langgraph | MIT 核实 | 状态图/checkpoint/中断-恢复/时间旅行调试——与 FAR-Lab run 引擎最同构 |
| temporalio/temporal（含 TypeScript SDK 示例与 docs） | MIT 核实 | 持久执行语义：deterministic replay、heartbeat、activity 重试分类 |
| dbos-inc/dbos-transact-typescript | MIT 核实 | Postgres 上的轻量持久化步骤——TS 原生参考价值最高 |
| openai/openai-agents（Agents SDK py/js） | 核实 | handoff/session/.guardrail 机制、轻量编排原语 |
| microsoft/autogen（→ag2ai）与 huggingface/smolagents | 核实 | 多 agent 对话编排、code-agent 循环的安全模式 |
| crewAIInc/crewAI | 核实 | 角色化团队编排的记忆/任务流（对照 FAR-Lab 单主+子Agent 模式找可取子机制） |
| 同类主动扩充 | claude-flow、pi 的编排层（Wave-4 已覆盖 pi/codex 的编排面——读其 SCOUT 防重） | 同维度解剖 |

## 二、本 Wave 特有警戒
- **先测量后融合**：任何"持久化/重试/编排"机制入选前，必须有 FAR-Lab 侧的真实痛点测量（复现一次崩溃/冻结/resume 场景并量化损失）；无痛点=KEEP 现状并记录，拒绝为炫技引入复杂度（宪法 §5 最小充分架构）。
- 不得引入新运行时服务/数据库；一切以确定性代码内嵌模式落地（node:sqlite 已在位）。
- 冻结 run 清扫已有脚本（zombie sweep）——恢复语义改进要与其互补而非重复。

## 三、维度侧重（维度体系 v2 编号）
重点组：**D1/D4/D5/D6（子 Agent 生命周期、循环控制、长任务、协作）**、**B4（会话/运行持久化与 resume）**、**G3（错误恢复分类学）**、**F1（hooks 与拦截）**；每框架普查+痛点对照深钻。

## 四、开场序列
| 步 | 动作 | DoD |
|---|---|---|
| 1 | 基线恢复序；status→IN_PROGRESS，phase=wave8-orchestration-durability | 控制面一致 |
| 2 | **痛点测量先行**：构造并量化 2-3 个 FAR-Lab 恢复/编排真实缺陷场景 | 测量报告（无痛点即早收口） |
| 3 | 并发分发调研（每框架一个，对照痛点清单找机制） | 机制清单带 file:line |
| 4 | shortlist → `research/WAVE8-SCOUT.md`（每项绑定痛点编号与"KEEP 现状"对照） | 排序+决策 feed |
| 5 | 执行融合（确定性内嵌、零新服务）+ 测试 + 故障注入验证 + 对抗审计 | 证据落 evidence/W8/ |
| 6 | 收口（基线 DoD 全项） | 三处一致，提交成功 |
