Status: EXECUTED (V1-V6 landed d749d4e..d3161b9) — 2026-08-24

# PROPOSAL — 可视化与交互深化波（VIZ，暂名 HX9）

> **状态：EXECUTED（2026-08-23）— V1-V6 全部落地（用户批准范围），栈 A。**
> 提交：d749d4e (V1) / b6509c6 (V2) / 60ff38e (V3) / 25006b4 (V4) / 2c1c47b (V5) / d3161b9 (V6)。
> 证据：evidence/W-VIZ/v1..v6-verification.md（每批单测+全量门禁+真实数据 DOM 回放）。
> 缓延（理由在档）：模型菜单定价（兄弟在途文件）、库分布（小数据集规则）、ACH/logLR live 触发（全库无 evidence_body/ach_analysis 对象）、像素级截图（IAB 环境限制，入 ENV-LIMITED GUI 重验债）。
>
> 原始触发：2026-08-23 用户实测反馈「本项目在真实的用户体验使用中发现，缺少更多可视化、可交互的设计和规划」。

## 0. 现状诊断（实证，非印象）

HX 重构后产品在**叙事、ID 纪律、信任呈现**上达标，但可视化/交互是系统性最薄面：

- **全工作台真正的图形编码只有 3 处**：EvidenceGraph（自研 SVG 固定三列布局）、EvidenceBalance（CSS 双向天平条）、rank-bar（比例填充条）。其余全部是表格/卡片/文本。
- **scout-c 定案的可视化栈（@xyflow/react 12 + echarts 6）标注「HX4 用时再装」，从未安装**（package.json 零命中）。d3-force 仅兄弟会话在制品 Zotero 力导图在用。
- HX7 走查 12 步全过的前提是「能正确完成任务」；本次用户反馈的是更高一层：**任务完成了，但科学对象的关系、分布、结构、演化没有被"看见"**。

## 1. 缺口清单（全部经代码核验）

### A 类：数据在、图不在（最高价值——真实字段已持久化，从未渲染）

| # | 表面 | 现状（file 证据） | 已有未渲染的真实数据 |
|---|---|---|---|
| A1 | 实验统计（ExperimentsTab） | **全工作台最薄**：CI 渲染为文本 `CI0.95[lo, hi]`（ExperimentsTab.tsx:106）、point 为 mono 文本、零图表 | `ci{level,low,high}`、`pointEstimate`、`impliedPower`、`verdict`、`adjustedAlpha`、`metrics` kv |
| A2 | 研究计划（PlanTab） | `dependsOn` 顿号连接的一行字（PlanTab.tsx:216）——**把 DAG 渲染成了文本** | `PlanStep.dependsOn[]`（DAG）、`estimatedCost`、`decisionRules` 四判据、`failureConditions[]` |
| A3 | 假设评分与排序 | 仅 rank-bar 一维条；雷达/热图/bracket 全无 | `DimensionScore`（维度×假设矩阵）、`TournamentMatch`（对局树）、`AchDiagnosticityScore.netByHypothesis`（判别力） |
| A4 | 阶段时间（StageTimeline） | 只有起止时间文本，**时长从未被计算**（grep 无 duration/elapsed） | `startedAt/endedAt`（时长）、`subtasks{done,total}`、`attempt`（重试次数） |
| A5 | 证据体 | EvidenceGraph 固定三列 SVG，40 节点/列静默截断；关系边上无强度标签 | `logLrBand`/`qbafScore`/`experimentalAxes`（types.ts 定义，全库零渲染）、`EvidenceRelation.strength/uncertainties` |
| A6 | 修订史（RevisionsTab） | 线性垂直链（已有词级 diff，好） | `qualityDelta` 序列（跨修订趋势）、版本树分叉 |
| A7 | 遥测（ProvenanceTab） | 回执表不可过滤；usage 仅逐条展开 | `usage tokens`/`latencyMs` 聚合（总 token、每阶段延迟分布） |

### B 类：只读、不可交互

| # | 表面 | 缺口 |
|---|---|---|
| B1 | PlanTab | 步骤不可点击跳转、依赖不可高亮、不可重排 |
| B2 | ExperimentsTab | 无状态/模型过滤、无跨实验对比 |
| B3 | EventsTab | 原始 JSON 流，无事件类型过滤 |
| B4 | CompareView | 证据平衡行是纯计数文本，**没有复用 EvidenceBalance（logLR 天平没进对比视图）** |
| B5 | 库（侧栏/Library） | 无状态/领域分布视图、无跨研究对比入口 |
| B6 | 模型菜单 | `pricing`/`active`/`fallbackConfigIds` 字段存在但不显示 |

## 2. 设计原则（继承 PRODUCT_HCI §7 + 宪法 §6）

1. **每图真实数据驱动**：装饰性图表禁止；图的每个像素可追溯到持久化字段。
2. **可下钻**：任何可视结果点击可到原始证据对象（继承证据图→claim 闪光的既有模式）。
3. **不确定永不因呈现而抹除**：CI 带宽、uncertainty 后缀、未校准注记必须随图呈现。
4. **a11y 回退**：每图带文本/表格替代（aria + DOM 表），Canvas/WebGL 仅在高密度科学可视化确有价值时采用。
5. **不编造视觉编码**：轴/单位/来源/时间戳齐全；无数据字段支撑的图不做。

## 3. 批次提案（按科学决策价值排序）

### V1 假设对比画布升级 —— 排序决策的核心可视化
- 评分维度**雷达图**（2-3 假设叠加，进 CompareView）
- **假设×维度热图**（全部代表的总览，一眼看出维度差异来源）
- 锦标赛 **bracket 对局树**（matches 已有 rationale/verdict）
- ACH **判别力热图**（netByHypothesis 全量，替代 top-3 文本）
- CompareView 证据平衡行换成 EvidenceBalance 组件（logLR 天平 + logLrBand 标签进对比）
- 渲染 qbafScore / experimentalAxes
- 验证门：run_jpktce50q7wqc68rkg64ztm3me 真实数据回放 + axe 扫描

### V2 研究计划结构化交互 —— 「可交互的规划」（用户原话直击）
- **步骤 DAG 图**：节点=步骤、边=dependsOn；点击→步骤卡定位；hover→上下游依赖高亮；关键路径强调；invalid-ref 既有检测接入图上警示
- **决策规则树**：四判据 → support/weakening/falsification 三出口的可视决策树
- **预算汇总条**：estimatedCost 累计 + 每步骤分段
- 验证门：真实 plan 回放（含无效引用负例）+ 键盘可达

### V3 实验统计可视化 —— 证伪闭环的着陆面
- **CI 误差条 / 森林图**（每个 StatReport 一条，阈值线叠加）
- **verdict 网格**（假设 × 实验的判定矩阵）
- metrics 仪表行 + impliedPower 表达（含 underpowered 警示一体化）
- 验证门：EEL 真实实验数据（W-EEL live 记录在库）回放

### V4 阶段时空图
- 阶段**甘特条**（时长=endedAt-startedAt，数据在从未算）+ subtask 进度微条 + attempt 重试标记
- 验证门：真实 run 回放时长与 StageTimeline 表格一致性

### V5 证据图升级
- >40 节点策略（聚合/聚类或分页，消灭静默截断）
- 节点拖拽 + 边强度标签 + source 节点点击面
- 验证门：大语料 run 回放

### V6 横切交互
- EventsTab 类型过滤；receipts 过滤 + token/延迟聚合行
- 修订质量趋势线（qualityDelta 序列）
- 模型菜单补定价/active/fallback；库状态/领域分布
- 验证门：各自表面真实数据 + 既有全量门禁

## 4. 技术栈决策（待裁决）

| 选项 | 内容 | 权衡 |
|---|---|---|
| **A（推荐）** | `echarts/core` 按需引入（雷达/热图/森林图/甘特——科学图表成熟、有 aria/DOM 表格回退）+ DAG 沿用自研 SVG（复用 EvidenceGraph 已验证的 pan/zoom/键盘模式） | 最小充分：统计图不重复造轮子，DAG 是领域特异结构自研更贴 |
| B | scout-c 原案全上：@xyflow/react 12 + echarts 6 | DAG 交互（拖拽/小地图）白得；代价=新依赖 + React18 集成面 + 自研模式作废 |
| C | 全自研零依赖 | 零新依赖；但雷达/热图/森林图每个都是定制件，成本与缺陷面最大 |

注：d3-force 已在树（Zotero 图）；三个选项均不动 Node 端 zod-only 不变量（web-only 依赖）。

## 5. 边界与纪律

- **不动兄弟会话在制品**：ZoteroPanel.tsx / lit-graph.ts / zotero.ts / api.ts 等未提交区一律不碰；提交一律 pathspec 显式清单。
- **禁真实 API 实测令遵守**：全部验证用既有持久化 run/实验数据离线回放。
- 每批完成即 commit（conventional）+ 全量门禁（vitest + 双端 tsc/build + secret-scan）。
- 依赖引入走 oss-due-diligence（license/供应链核验）后进 `web/package.json`。

## 6. 待用户裁决

1. **范围**：V1-V6 全量分批，还是先做科学核心 V1-V3？
2. **技术栈**：A / B / C。
3. **归档**：并入 PLAN-hx-reconstruction.md 作 HX9 批次，或独立 PLAN-viz（本提案升级为规范计划）。
