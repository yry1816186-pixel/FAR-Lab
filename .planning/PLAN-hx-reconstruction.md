Status: ACTIVE — HX0-HX7 landed; HX6 TUI residuals are user-physical (publish/mintty feel-check); palette/unified-sidebar continuation in flight — 2026-08-24

# PLAN — Human Experience Layer 全面重构（Research Operating Environment）

> 规范文档：本次重构的唯一设计事实源。基线审计见 `evidence/hx/audit-baseline-2026-08-23.md`。
> 分支 `build/hx-reconstruction`。硬约束：Node 端 zod-only 不动；禁真实 API 实测（验证离线/确定性 + 既有真实持久化数据）；UI 状态必须映射真实系统状态；不确定不编造。

## 1. 产品定义

FAR-Lab 不是聊天机器人，不是科研 Dashboard，而是 **AI 原生研究操作环境**：
科研人员面对的第一层是 **研究问题、资料、AI 进展、发现与决策**；内部复杂性（agent/tool/model/stage/event）通过渐进披露逐层展开。

三层披露模型（全产品统一）：
- **L1 叙事层**：AI 在做什么、为什么、发现了什么、下一步、是否需要我决定。
- **L2 对象层**：证据 / 假设 / 计划与实验 / 修订史 / 导出（科研对象本体）。
- **L3 遥测层**：模型调用、工具轨迹、原始事件、哈希、provenance 收据（默认折叠，可下钻）。

## 2. 目标 IA（v2）

| 表面 | 路由 | 职责 |
|---|---|---|
| Home 开始 | `#/home` | 首次理解产品（3 句话 + 工作原理）、快速开始 composer、最近研究；有研究时=最近+快捷动作 |
| Compose 构思 | `#/compose` | Research Composer 全表面（N 键直达） |
| Study 研究工作区 | `#/run/:id/:tab` | cockpit 叙事 + 对象 tabs + 遥测抽屉 |
| Library 研究库 | `#/library` | 全量库（搜索/过滤/排序/对比入口）；侧栏保留紧凑最近列表 |

侧栏改革：`进行中` 分组置顶（live 研究带真实阶段指示）；`需要处理` 分组仅收纳可行动项且用人话（"3 项研究等待你的反馈"而非裸计数 32）；时间显示相对化（"昨天"/"2 小时前"），绝对时间进 title/详情。

## 3. Research Composer（替换 NewRunForm）

已有真实能力（不得伪造扩展）：`seeds` 摄入管线（PDF 文本/pdfjs、BibTeX/RIS/citation-js、Zotero）、domain/goalType/modelConfig、createRun。

Composer 组成：
1. 自然语言主输入（自动增高 textarea，问题语音 placeholder，示例 chips）。
2. **附件托盘**：真实文件卡（类型图标/名称/大小/解析状态/失败原因/重试/移除/预览摘要）；拖放区即 composer 本体（整卡为 drop target）；粘贴文件支持。
3. 快速添加：URL / DOI / arXiv id 输入行。
4. 约束与范围（可选折叠）：领域、目标类型、范围外说明。
5. 模型与算力（默认"自动路由"，折叠披露当前路由与理由；绝不默认暴露 provider 术语）。
6. 提交前校验与空态诚实（无 provider 配置时给出设置引导而非沉默失败）。

AI 澄清（后续 slice，接后端能力）：提交后若存在重大不确定性，进入澄清对话而非直接起跑——**仅在后端具备真实澄清能力后接线，不伪造聊天**。

## 4. Live Research Cockpit（替换"研究动态真实事件流"为叙事层）

- 叙事由**真实事件派生**（不是装饰文案）：阶段完成→"文献检索完成：找到 14 个来源，12 个通过核验"；子任务进度→确定性计数；模型调用折叠为"本次使用了 glm-4.6（3 次调用）"一行可展开。
- 当前活动卡：正在做什么 / 为什么（stage 目的一句话）/ 已耗时 / 取消或暂停。
- 干预条：Pause/Cancel/Resume/重试/补充资料/改约束/提问——每个按钮映射真实能力，禁用即给原因。
- SSE 断线：可见的"连接中断，正在重连（第 N 次）"状态，恢复后补齐事件（seq 游标幂等已具备）。
- 遥测层：`查看技术轨迹`（模型调用/工具/原始事件流/sha256）全部收纳于此，默认折叠。

## 5. 假设与证据体验

- ID 纪律：内部 id 永不裸奔（`hyp_gb5…` → "假设 1 · 摘要词…"，id 进 title/复制按钮）；`clm_…` 同理。
- 评分表达：公式与权重收进"方法"披露；表格呈现名次+结论摘要+证据平衡条；中英混排警示翻译为当前语言。
- 对比画布：并排卡（2-3 假设）+ 支持证据/反例/不确定性的平衡可视化 + ACH 矩阵保留为下钻。
- 计数一致性：全部 N 假设 vs 排名代表 M，界面必须一句话解释（"10 组假设生成，6 组进入锦标赛排序，4 组因 X 未入组"——以真实数据字段为准，不可得则不显示）。

## 6. 设计系统（定案）

- **现状资产（保留并扩展）**：v2 token 体系已在 `styles.css` 落地——light/dark 全量、三声三字体（IBM Plex Sans/Mono + Source Serif 4）、认知语义色（彩色只表达证据语义）、字号/间距/动效/圆角 token、`@theme inline` 已映射 Tailwind 4 utilities。这是既有产品身份，不推倒。
- **组件基座（Scout C 定案）**：shadcn/ui copy-in 模式 + Radix 原语（MIT，React 16.8-19 peer）→ `web/src/components/ui/`。Base UI 为反悔选项（shadcn 多底座可切换）。React Aria 拒绝（Apache-2.0+DOM 骨架摩擦）。
- **采纳纪律**：只为能力缺口引入原语（Dialog 焦点管理/Tooltip/DropdownMenu/Popover/Collapsible）；已工作且有 a11y 的手写件（tablist、命令面板含 IME guard）不churn，随所属 slice 机会性迁移。
- **可视化栈（HX4 用时再装）**：@xyflow/react 12（证据图，自定义节点=React 组件天然下钻）+ echarts 6（科学分布/不确定性，按需 echarts/core，aria+DOM 表格回退）；sigma>1k 节点再议；plotly/recharts 拒绝。
- **渲染（HX5 用时再装）**：react-markdown+remark-gfm+shiki(core, JS engine)+@tanstack/react-virtual；streamdown（Apache-2.0）需先做 React18/Vite6 兼容 spike（Scout A UNVERIFIED 项）。
- **iconography**：lucide 全面替换文本字形（✓✗▲—≫↳●◈ 等）；状态色语义保持 token 化。
- **Motion**：视图过渡 CSS+View Transitions；交互物理 motion/react（`MotionConfig reducedMotion="user"`），按需引入。
- 禁止蓝紫渐变/发光/玻璃拟态/粒子/满屏 card（PRODUCT_HCI 禁令）不变。

## 7. 复用映射（Scout A/C 已回填；B 待 HX6）

- Scout A（AI workspaces，`research/hx/scout-a-ai-workspaces.md`）：
  - **LibreChat（MIT，唯一主源可提取）**：composer `ChatForm`+`useTextarea`（IME 三重防护/enterToSend/粘贴即附件/折叠渐隐）；parts 分片模型（TEXT/TOOL_CALL/THINK memo、连续工具调用分组、PendingSkillCall 乐观占位卡→映射我们的步骤流）；Artifacts 侧板（Radix Tabs、多版本、移动端 sheet snap）。
  - **Dify（改版 Apache2.0，仅 pattern/adapt）**：Cmd+↑↓ 输入历史、sendOnEnter CJK 选项、Safari compositionend 补丁；file-uploader 骨架（zustand+原生 DnD+类型图标+PDF 引文高亮）；四态步骤面板语义色。
  - **闭源 pattern（不抄码不像素）**：ChatGPT calm-default composer/单一 + 入口/模式 chip；Claude artifacts 常驻入口按钮；豆包界面降噪。
  - **法律红线**：LobeChat/Open WebUI 主仓代码不搬；@lobehub/ui 避 antd 体系不引入。
  - 状态架构：zustand slice 三件套；流式防重渲染 memo 隔离（LibreChat ChatFormWrapper 手法）。
- Scout C（foundations/viz，`research/hx/scout-c-foundations-viz.md`）：见 §6；另有 workbench IA 12 原则（命名分区+布局持久化、命令面板即渐进披露、多面板同模型多投影、对比为一等视图、事件流与状态投影分离、状态永远派生等）。
- [ ] Scout B（terminal agents）→ HX6 时回填。

## 8. 工作图与批次

| 批次 | 内容 | 验证门 |
|---|---|---|
| HX0 | 分支保护 + 基线审计（已完成） | 审计文档 + 截图 |
| HX1 | 设计系统基座 + App Shell v2（Home/routing/rail） | tsc/build/vitest + 浏览器实测 Home/Library |
| HX2 | Research Composer（附件托盘/URL/DOI/折叠配置） | 真实解析路径实测（本地文件）+ 空态/失败态 |
| HX3 | Live Cockpit（叙事层/干预条/SSE 重连 UX） | 既有真实 run 数据回放 + 事件流叙事单测 |
| HX4 | 假设/证据体验（ID 纪律/对比画布/平衡可视化） | 真实 run 走查 + axe |
| HX5 | 结果工作区与导出中心 | 导出包真实校验（far verify） |
| HX6 | CLI→TUI（Scout B 定案后细化） | 终端实测 + --json 回归 |
| HX7 | Desktop（Tauri）回归 + 验收旅程 12 步全走查 | 全旅程截图存档 |

每批次完成即 commit（conventional msg）+ 全量门禁（vitest + tsc/build + secret-scan）绿后才进下一批。

## 9. 验收旅程（终局标准，来自任务书）

首次打开即理解入口 → 自然输入科研目标 → 上传论文/数据/代码有成熟文件体验 → AI 主动澄清（真实能力）→ 开始研究 → 清楚 AI 在做什么/为什么 → 查看 evidence/hypothesis/tool/experiment 进展 → 可暂停/干预/补充 → 结构化可交互结果 → 追溯 provenance → 继续迭代而非重启 → 导出真实 artifacts。终端侧完成尽量一致的核心旅程。

## 10. Anti-Mediocrity Gate

每完成一个体验面自问：这像 2026 年成熟 AI 产品吗？与 ChatGPT/Claude/OpenHands 并排是否像学生项目？科研人员明天会主动再打开吗？隐藏 logo 仍能看出是认真打磨的产品吗？——答案不好则不交付。
