Status: EXECUTED (kernel turns + read-tool plane + approval cards + automations landed 2026-08-23) — 2026-08-24

# PROPOSAL: 常驻项目 Agent（Resident Project Agent）——对话即操作面

状态：**已批准并落地 R1+R2+R3**（2026-08-23 用户指示「按照最强、最优、最好体验来做」：统一入口、读自由动审批+记住授权、定时+完成双触发、状态含预算透明）
日期：2026-08-23
落地映射：src/server/conversation-agent.ts（kernel 带工具回合+读工具面+propose_action）/ conversations.ts（提案解析/执行/免批/automation 记录）/ automations.ts（触发引擎）/ domain conversation+automation / api.ts（提案与自动化路由）/ web ConversationView（工具动作条+审批卡+自动化管理）。测试：tests/conversations.test.ts（HTTP 全链 11 例）+ tests/automations.test.ts（引擎 5 例）全绿；后端 tsc+build 绿。剩余：web 正式 build 被兄弟会话听写功能在途错误阻塞（dict.ts en 词典缺失 + vite worker format），待其自愈后重跑。

## 1. 差距（诚实盘点）

用户设想 vs 现状：

| 维度 | 用户设想 | 现状（conversation-first Slice 1） |
|---|---|---|
| 视野 | 讨论项目**任何内容**（run/假设/证据/计划/报告/状态） | Agent 只见对话转录窗口(24轮)+材料摘要，**对项目全盲** |
| 行动 | 发布指令→Agent 执行工作 | 不能做任何事，只能提出候选问题 |
| 引擎 | 常驻、有工具的 Agent | 单次 structuredCall，无工具循环（提案自己注明 Slice 3 才做） |
| 自动化 | 各种自动化工作 | 无 |

关键事实：**缺口只在接线层**。agent kernel（src/agent/loop.ts，H1 已落地）就是工具循环 Agent——ToolRegistry/预算/收据/PermissionEngine/compaction/subagents 完备，目前只被研究管线使用。兄弟会话在建的 TIS/MCP 层把外部工具桥进同一注册表。缺的是：把对话回合从"单次调用"升级为"挂在 kernel 上的带工具会话"，并给 Agent 一套项目工具。

## 2. 目标形态

```
┌─ 对话（唯一主入口，常驻）────────────────────────────┐
│ 研究者：「上次那个 run 的反证为什么只有 1 条？」          │
│    Agent: [读工具] list_runs → get_run → get_evidence   │
│          「因为检索词漏了 X 方向，我可以……」              │
│ 研究者：「补一轮反证检索」                               │
│    Agent: [行动工具→审批卡] refine_run(scope=counter)    │
│          → 研究者点击批准 → 执行 → 收据入账 → 回报结果    │
│ 研究者：「以后每个 run 完成时自动给我一段结果简评」         │
│    Agent: [自动化工具→审批卡] create_automation(trigger)  │
└──────────────────────────────────────────────────────┘
```

研究前头脑风暴不是被删除，而是变成这个通用 Agent 在「尚无 run 可谈」情境下的自然行为（prompt 层职责，非独立产品面）。

## 3. 设计原则（继承 + 新增）

继承 conversation-first 全部原则（不伪造聊天、对话一等持久实体、材料链复用、研究者决策权、上下文预算、模型路由跟随选择）。新增：

1. **读自由、动审批**：读类工具（查 run/假设/证据/计划/状态）Agent 直接用；一切有副作用或花钱的行动（起 run、refine、导出、建自动化）必须先在对话内出**审批卡**，研究者点击才执行（kernel 的 PermissionEngine 做执行层闸门，UI 审批卡做人的闸门，双层）。
2. **工具活动可见**：Agent 每次用工具在对话流里渲染为折叠的「动作条」（用了什么工具、一句话结果）——不是黑盒回复；这正是 HX-3 Cockpit 叙事层需要的同一套事件→叙事推导。
3. **每个行动有收据**：行动工具全部走现有 receipt 基建；对话消息上的 usage 摘要扩展为含工具收据计数。
4. **自动化是一等实体**：trigger（run 完成/定时/材料变更）+ 目标（Agent 会话任务）+ 预算上限 + 随时可杀；不是隐藏后台魔法。复用 EEL lane 的 scheduler 基建（ACC-25）方向对齐但归属本 lane。
5. **预算治理复用 BP1**：常驻 Agent 每回合 token 预算、自动化任务独立预算上限，防失控烧钱。
6. **失败可见**：工具失败按 kernel 纪律回灌模型为结构化错误、对话内如实显示，不静默吞。

## 4. 工具面（第一版清单）

**读（自由）**：`list_runs` / `get_run`（含假设/证据/计划摘要）/ `search_evidence`(复用 FTS5)/ `get_plan` / `get_report` / `list_conversations` / `workspace_status`（runs 进行中/阻塞/预算水位）。
**动（审批）**：`launch_research`（从对话凝结问题起 run，复用现有桥接）/ `refine_run` / `export_run` / `propose_candidates`（无副作用的候选问题，保持现有交互）/ `create_automation` / `cancel_automation`。
**外部（审批，走 TIS/MCP）**：研究者自配的 MCP 工具按其 risk class 进同一注册表（兄弟 lane 落地后接线，`ToolCreatedBy` 已含 `'conversation'`，设计上已互认）。

## 5. 分期

- **R1 眼睛（先做，可独立交付）**：对话回合升级为 kernel 会话（带读工具）；对话 UI 渲染工具动作条；头脑风暴行为由 prompt 保持。离线 stub 全链测试。
- **R2 手**：行动工具 + 对话内审批卡 + 收据入账 + 失败/重试路径。
- **R3 常驻自动化**：trigger→Agent 任务、结果回投对话（Slice 2 的通知顺路解决）、预算上限与总闸。
- **并行对齐**：HX6 TUI 与本提案共用同一 service 层（对话能力在 service，终端/Web 两端消费）。

## 6. 风险（诚实说明）

- 每回合从单次调用变为多轮工具循环：延迟与费用上升，靠回合预算+compaction 控制；实现期全离线 stub 测试（no-live-API 纪律），真实体验由用户实测。
- 通用 Agent prompt 比窄头脑风暴 prompt 更难保持「科研合作者」人设与收敛意识——需要在 R1 用测试固定行为基线。
- 与兄弟 lane 的 TIS/MCP 在-flight 文件有边界交叉：本 lane 只消费其注册表接口，不碰其实现文件。

## 7. 待用户确认的决策点

1. **统一 vs 并存**：现有「头脑风暴对话」直接升格为通用 Agent 对话（推荐，一个入口），还是保留窄对话、另开一个「Agent 控制台」？
2. **审批粒度**：起 run/refine/导出每次都审批，还是同类行动可「本会话内不再问」？
3. **自动化范围**：R3 的 trigger 先只做「run 完成→简评回投」，还是定时任务一起上？
4. **读工具范围**：workspace_status 是否包含预算/收据明细（涉及你自己的消费透明度偏好）？
