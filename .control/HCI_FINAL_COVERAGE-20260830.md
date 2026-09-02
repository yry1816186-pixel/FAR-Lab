# FAR-Lab 全触点 HCI 接管覆盖矩阵（2026-08-30）

状态：`IN_PROGRESS`。本表是本轮施工索引，不是能力声明；每一行的等级以代码、测试和真实运行证据为准。

## 设计门禁结论

- 用户：高频、长期使用的中英双语科研工作者；需要快速形成问题，也需要审计证据、执行协议与复现工件。尚无真实 persona 访谈数据。
- JTBD：从一个问题/资料进入，持续理解研究正在做什么、为什么、产出了什么与仍未知什么；能干预、质疑、修订、失败恢复，并把结果交给另一环境核验。
- 信息层级：研究问题与当前科学判断 > 当前阶段/阻塞/可操作动作 > 证据与反证 > 假设比较 > 计划/执行/QC > 修订因果链 > 导出完整性；工程事件与内部 id 只作为下钻审计层。
- 高风险：范围编辑静默丢失、取消被误解为立即终止外部副作用、模型输出被当作机械判决、部分产出丢失、假独立验证、危险操作误触、私有思维链暴露。
- 可见科学事实：执行模式、来源、反证、冲突、不确定性、最弱环节、exploratory/confirmatory、机械规则与模型建议的区别、人工背书 actor。
- 交互原则：一个连续 ResearchWorkspace；真实流与持久化对象渐进出现；对象原位操作；完整技术数据作为同页 lens；所有失败说明发生了什么、原因、保留内容与恢复动作。

## User task × surface × state × action × truth source × gap × verification

| 用户任务 | 页面/组件 | 必须覆盖的状态 | 真实操作 | 数据/状态权威 | 当前证据与缺口 | 本轮验证 |
| --- | --- | --- | --- | --- | --- | --- |
| 首次进入并理解产品 | Web `LabHome`、Desktop shell、CLI/TUI help | loading / empty / offline / degraded / permission | 输入问题、导入、打开设置 | `/health`、runs、model configs | Web 已实现；低对比/焦点弱；Desktop/CLI 首次引导不一致 | 375/768/1280/1440，zh/en，light/dark，键盘，axe |
| 携资料启动 | `LabHome` / `NewResearch` / Conversation composer | parsing / ready / partial / failed / too-many | 文件、DOI、URL、Zotero、语音、IME | ingest parser + seed schema | 已接真实解析；错误态需统一；长文本/慢解析待压测 | 浏览器真实文件、IME、慢网、大文本 |
| 预览和修改范围 | `ScopeReview` / draft API | created / generating / paused / failed / saved | 生成提议、修改、保存、启动 | question PATCH + run resume | **P0：编辑后直接启动未保存，静默丢字段** | E2E：修改→启动→GET question 等值 |
| 运行中理解与干预 | `ResearchWorkspace` live narrative | queued / running / retrying / paused / partial / failed / cancelled / completed / offline | 取消、停止、恢复、重试、检查点续接 | run row + stages + append-only events + lease | Run SSE 已有；只呈文本事件；canonical 无 retrying；StudyMap 未显示 stream health | 断网重连、刷新续接、取消、失败恢复、已产出保留 |
| 渐进看到科研对象 | Workspace evidence/hypothesis/plan/execution bands | pending / arriving / stable / stale / failed / empty / too-many | 展开、筛选、定位、下钻 raw | object store + `/science` + object APIs | 4 秒并发 6 请求且未 abort；错误多被吞成空；布局顺序割裂 | 真实事件触发重取、竞态测试、慢网/大数据 |
| 核验证据与来源 | Evidence / Claim inspector / Library | verified / unverified / conflict / counter / excluded | 定位原文、查来源、置顶、排除、恢复、连假设 | source snapshot + locators + relation store | 真实能力存在；主图过早且拥挤，完整对象藏在 deep page | claim→source 原文、表格替代、键盘下钻 |
| 比较和修订假设 | Hypotheses / inspector / compare lens | forming / active / promoted / rejected / superseded | 比较、展开、置顶、排除、编辑、分叉、质疑 | hypothesis + scorecard + ACH + revision | 操作已真实接线；主视图仅前 6，完整比较切换到另一 UI | 操作→反馈→revision/version diff E2E |
| 审阅计划与执行 | Plan / Experiments / Protocol | draft / preregistered / queued / awaiting-human / in-progress / paused / failed / completed / aborted | 看依赖/变量/资源/风险/停止条件，审批/QC/人工记录 | plan/spec/result/protocol ledger | 能力存在但藏在 `#run`；机械 verdict 与人工作业需同页连续 | 计划→执行/协议→raw→机械规则 |
| 反馈与因果修订 | Feedback / Revisions | draft / submitted / consumed / superseded / failed | 纠正、反馈、消费、看 before/after/why | feedback + revision + version diff | 真实链存在；入口分散，选区无法直接进入 | selection→feedback→revision→反向定位 |
| 对话与科研判断 | Conversation dock/full | idle / running / reconnecting / partial / cancelled / failed / completed | 自由输入、澄清选项、批准动作、停止、重试 | conversation doc + rollout + provider receipts | **P0：整轮 POST + 等待占位；无 token/结构块流、停止、重连；原样展示 thinking** | 真实 provider chunk、工具块、停止、刷新重连、无思维链 |
| 选中文字就地追问 | 全部科研正文 + dock | selection / toolbar / context-carried / failed / saved | 解释、追问、质疑、查证、反证、纠正、转反馈 | structured selection context + conversation/feedback | **P0：完全不存在** | 鼠标/触屏/键盘、Esc、失焦、跨段、ARIA、反向定位 |
| 历史复访与文献库 | Rail / Home / Library / search | loading / empty / stale / too-many / failed | 搜索、重命名、删除、回到对象 | SQLite/FTS/library projection | 基础存在；错误降级和规模策略待核 | 大数据、搜索、危险操作、恢复导航 |
| 导出与独立验证 | Verify lens / report / CLI `far verify` | building / partial / stale / verified / failed | 预览清单、下载、验证、复访 | bundle manifest + artifact hashes + receipts | **P0：CLI 只按本地 bundle id 查 Store，导出路径不能独立 verify**；包内投影 freshness 风险 | 新目录/无原 DB 下 verify，篡改负例 |
| 设置、权限与通知 | Settings / header / system notification | unavailable / invalid / permission-denied / degraded | 模型路由、主题、语言、通知授权 | model config/meta/browser permission | 已实现基础；文案和失败解释需统一 | permission 拒绝、键盘、主题/语言持久化 |
| Desktop 长期复用 | Tauri | starting / server-failed / port-conflict / update/build failure | 启动、关闭、恢复 Web 工作区 | canonical Node app + same far.db | **P0：安装包依赖源码仓库定位与系统 Node，非自包含** | clean Windows 安装环境启动/退出/恢复 |
| CLI/TUI/终端自动化 | `far`, `packages/tui`, TerminalPanel | all run states / disconnected / non-interactive / NO_COLOR | start/watch/cancel/resume/export/verify，`--json` | same API/domain/store | TUI 基线 49 tests green；状态词与 retrying/失败说明待统一 | PTY/piped/JSON/exit code/NO_COLOR/interrupt |

## 根重构边界

1. `ResearchWorkspace` 取代 StudyMap 与 RunDetail 的整页切换：研究叙事永远保留，完整 evidence/hypothesis/plan/revision/verify 作为同页可定位 lens。
2. 对话改为可重连 turn stream：真实 provider output delta + 经筛选的结构化活动；研究者消息先持久化，部分回复明确标 `partial`，停止走服务端取消，刷新按 seq 续接。
3. 引入结构化 `SelectionContext`，所有正文对象提供 run/object/source 锚点；上下文动作进入真实 conversation 或 feedback/revision API。
4. 统一 canonical lifecycle 与媒介投影；不得用前端动画发明 `retrying`、百分比或 ETA。
5. 导出包成为自说明、可搬移、可离线核验的权威工件；Desktop 只打包 canonical runtime，不复制业务逻辑。

## 当前门禁

- 2026-08-30 施工前：root typecheck PASS；web typecheck PASS；TUI 49/49 PASS。
- `impeccable` Skill 未在当前会话提供；不得伪造调用。使用仓库 visual QA + 多视口真实浏览器截图完成可执行部分，并把 Skill 缺席保留为工具可用性事实。
- 旧 `.control/ACCEPTANCE_STATUS.json` 的 ACC-16 `live_verified` 与本轮代码/用户证据冲突，必须在完成上述 P0 并重新走真实旅程后才可继续成立。

## 设计基线走查 2026-09-01（Wave A 波末 · v9 任务书 [v9增补]）

方法：三份方法论前置（PRODUCT_HCI 全文 + impeccable SKILL 4.1.1 + frontend-design）；
e2e 形态真实服务器（FARLAB_DATA_DIR=work/gold 金标准数据）+ Playwright 截图
4 表面 × 2 视口（desktop 1600×1000 / narrow 375×812），zai 视觉模型按
PRODUCT_HCI 清单结构化评审。截图存 `.impeccable/review-baseline-0901/`。
修复执行落点=Wave D（任务书 §8 Wave A 增补原文）；本节=在册底稿。

### Critical（9 条，Wave D 必修）

| # | 表面 | 缺陷 |
|---|------|------|
| SC1 | study | 反证红虚线穿过主张文本（连线压字不可读） |
| SC2 | study | 连线交叉成束，主张→假设映射不可目视追踪（该图核心任务） |
| SC3 | study | 画布底部主张被视口截断且无滚动指示 |
| SC4 | study | 顶部横幅"当前没有进行中的研究"与已完成研究并存自相矛盾 |
| SC5 | study | 唯一待办入口"待你判断 1"沉底状态栏不可见 |
| HC1 | home | 待判断队列被压在新研究表单之下（首要任务优先级倒置） |
| HC2 | home | 判断卡标题在 "older" 人群限定词处无省略号截断（信息丢失） |
| HC3 | home | 新研究卡片右缘与下方卡片栅格错位 20-30px |
| NC1 | new-375 | 底部列表被固定状态栏截断（padding-bottom 缺失） |

### Warning（26 条摘要，Wave D 应修）

study：W1 假设列中英混排 / W2 省略号截断无 tooltip / W3 三列密度失衡 /
W4 最近研究同名难辨 / W5 已完成徽标冗余 / W6 来源复选框可供性不明 /
W7 图例语义不完整 / W8 标签与统计胶囊同层级 / W9 反证边对比不足 /
W10 品牌 ✓✗ 图标含义不明。
home：W1 区块间距节奏失衡 / W2 空态裸文本无引导 / W3 会话区空态缺失 /
W4 判断卡与索引卡双入口无区分 / W5 chips 无选中态 / W6 截断策略不一致 /
W7 主按钮对比度弱 / W8 辅助文案对比不足 / W9 计数三重冗余 / W10 零态噪音
（绿点无 tooltip、终端(0) 占位）。
new-375：W1 顶栏图标触控目标 <44px / W2 语言切换过小 / W3 正文字号 11-12px
偏小 / W4 附件按钮未达触控标准 / W5 主 CTA 被分摊半宽 / W6 占位文案折 4 行。

### 顺带取证

- gold 服务器页面有一处稳定 404：`GET /runs/:id/protocol`（协议缺席态，
  UI 已有缺席呈现——非缺陷，记录在案）。

---

## Wave D 闭账（2026-09-02，人机体验最终重建会话）

方法：7 个实现批次（图重构/结构重排/窄屏/级联修复/inspector/图谱微调/撤稿与措辞），
每批落盘 → 真实服务器（work/gold-hxd 副本，端口 3311）+ Playwright 截图（4 表面 × 2 视口
× {zh-light, zh-dark, en-light} + study-graph 定点 + study-inspector 交互）→ zai 视觉模型
结构化评审 → DOM measures 交叉验证 → 迭代。工具：`web/scripts/capture-surfaces.mjs`
（新增，含 overflow/对齐/滚动性实测）。证据目录：`.impeccable/waved-final|waved-dark|waved-en`。

### Critical（9/9 闭账）

| # | 闭账方式 | 证据 |
|---|---------|------|
| SC1 | 图谱走廊路由+标签预算+halo：连线不再压字 | waved-final/study-graph.png 视觉评审第 1 项达标；SVG 走廊 x∈[650,758] 无标签 |
| SC2 | barycenter 聚类（确定性三趟排序）+ 边透明度分层 + "按来源/按假设聚类"切换 | study-graph 评审：右段短而近平行；单源长扇束为数据本质，切换键缓解 |
| SC3 | 移除 map-graph-frame 嵌套滚动（页面为唯一滚动主） | DOM：graphClipped 76px→0（after2 起持续） |
| SC4 | AwarenessBar idle 态仅在 home 渲染（idleVisible） | DOM：study/library 面 awarenessBar=null；措辞改"后台无运行中的研究" |
| SC5 | 状态栏判断芯片改可点击按钮（导航至队列） | App.tsx status-item--action + graph 评审确认芯片存在 |
| HC1 | 判断队列在 compose 之上（CSS order 保 DOM 稳定防 remount） | DOM：queueSection.top < compose.top；waved-final/home 视觉确认 |
| HC2 | 共享 ellipsize（词边界；拉丁文强制词边界，CJK 字符切） | text.ts；home 评审第 2 项（rail 批次八修复后） |
| HC3 | 判定为视觉误判：DOM 实测 compose 与 queue 卡边缘同为 504/1328px | envboot2 after2 measures（两轮一致） |
| NC1 | 判定为视口伪象：content 滚动器 canReachBottom=true + bottomClearance≥166px | 同上；窄屏批次仍加固了触控/CTA/字号 |

### Warning 闭账（26 项摘要）

study：W1 假设列混排=数据事实保留（无伪造翻译）；W2 tooltip 全补；W3 走廊+三列再平衡；
W4 研究切换器加日期、当前项去冗余；W5 completed→muted 语义（执行态≠科学结论）；
W6 来源节点改文档字形；W7 图例一行三段带计数（含出处连线）；W8 计数芯片独立走廊；
W9 支持 0.65/反证 0.5 透明度+图例 text-2；W10 rank 入框+✓n/✗n 计数+⊘/◆ 研究者层标记。
home：W1 min-height 132+统一节奏；W2 空态加引导句；W3 会话区诚实空态+新建 CTA；
W4 左缘严重度色条（单编码：去圆点留条）；W5 chips text-1+form-border（评审过：一次性
模板填充无选中态为正确设计）；W6 全表面统一 ellipsize；W7 主按钮 4.64:1 过 AA（实测）；
W8 图例 text-2；W9 chipCounts 移除（图例+带为准）；W10 终端(0)→终端、绿点有 title。
new-375：W1/W2 触控 40px（媒体块移文件尾修复级联）；W3 12px 字号下限；W4 工具钮 40px；
W5 主 CTA 全宽栈叠；W6 短占位（matchMedia）。

### 顺带修复（评审发现的新缺陷）

- 图谱 claim↔claim 同列边鼓包路由（旧有缺陷：竖直线压节点列）；
- inspector 覆盖→推挤布局（.is-inspector-open padding，≤900px 回落覆盖）；
- DOI 不断行；绑定状态 zh 本地化（binding.*.zh）；"影响"→"已连接假设"措辞；
- 撤稿/更正标记 ⚠ 前置于来源行（循证工具中撤稿状态优先于标题）；
- 截图工具两处系统性缺陷（localStorage 时机/滚动不重置）——旧评审中
  "dark/en 无差异"与"图谱缺失"均系工具问题，已修复并入档。

### 剩余开放（非本轮范围）

- SelectionContext（选中文字就地追问）P0：未实现（覆盖矩阵在案）；
- CLI verify 只认本地 store bundle id：未实现文件路径独立核验（覆盖矩阵在案）；
- 主张列单源长扇束：数据本质（17 主张中 13 条同一来源），聚类切换已缓解；
- gold 库中无排除/置顶样例：⊘/◆ 图谱渲染路径由 surfaces.spec E2E 覆盖。
