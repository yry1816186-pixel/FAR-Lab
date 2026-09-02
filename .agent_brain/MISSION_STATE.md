# FAR-Lab Human Experience Final Rebuild — Mission State

> 目标：/goal 2026-09-02「人机交互层最终端到端重建」。
> 本文是可恢复执行状态。每次窗口结束前更新。

## FRAME（问题定界）

- 用户：中英双语科研工作者，高频长期使用。
- 任务：把工程化界面重构为世界级 AI4S Research Workbench（Product+HCI+UX+Visual+Frontend+QA）。
- 前置事实（FACT）：
  - 08-27 已完成 HCI 大重构（Research Map 架构：LabHome `#/` / NewResearch `#lab/new` / StudyMap `#study/<id>`）。
  - 08-30 设计基线走查（`.impeccable/review-baseline-0901/` + `HCI_FINAL_COVERAGE-20260830.md`）登记 **9 Critical + 26 Warning**，修复落点 Wave D（本任务）。
  - 对话流式 P0 已修（streamConversationTurn 存在）；Desktop 打包 P0 已于 09-01 实证（NSIS 旅程）。
  - 覆盖矩阵遗留开放 P0：①选中文字就地追问（SelectionContext，完全不存在）；②CLI verify 只认本地 store bundle id，导出路径无法独立核验。
- 范围：web/ 前端为主（含 i18n dict、CSS、组件）；不触碰工作树中未提交的 Wave B 后端文件（src/agent、src/experiment、src/domain/provenance.ts、experiment-runtime/ 等——兄弟车道资产）。
- 验收：9C+26W 闭账（真实浏览器截图取证）；四常驻门禁保持（zh/en dict 对等、375px 零横向溢出、axe critical/serious=0、键盘核心旅程）；build/typecheck/lint/E2E 全绿。

## 缺陷清单（Wave D 施工索引）

### Critical（9）
| # | 表面 | 缺陷 | 根因定位 |
|---|------|------|---------|
| SC1 | study | 反证线穿过主张文本 | EvidenceGraph 曲线控制点横跨整个列间距，claim 标签 budget=列间距全宽（EvidenceGraph.tsx:177），边必然压字 |
| SC2 | study | 连线交叉成束不可追踪 | 三列独立排序无 barycenter；多对多边 0.85 全不透明 |
| SC3 | study | 画布底部主张截断无滚动指示 | map-graph-frame max-height 640 vs svg 高度≈容器宽×比例（lab.css:895-903），overflow 静默裁切 |
| SC4 | study | 顶部横幅"当前没有进行中的研究"与已完成研究矛盾 | AwarenessBar 空态文案全局渲染（App.tsx:742） |
| SC5 | study | "待你判断 1"沉底状态栏不可见 | status-bar judgment 非交互 span（App.tsx:904） |
| HC1 | home | 判断队列被压在新研究表单下 | FirstUse 固定 render compose→children（LabHome.tsx:136-145, 394-400） |
| HC2 | home | 判断卡标题硬 slice 无省略 | runLabel(r).slice(0,90)（LabHome.tsx:177 等） |
| HC3 | home | 新研究卡片右缘与下方栅格错位 | 待实测（lab.css .nr-embed vs .queue-item 宽度） |
| NC1 | new-375 | 底部列表被固定状态栏截断 | lab-root padding-bottom 不足（lab.css:120/.queue-canvas:285） |

### Warning（26，摘要）
study：W1 假设列中英混排/W2 截断无 tooltip/W3 三列密度失衡/W4 同名研究难辨/W5 已完成徽标冗余/W6 来源节点可供性不明/W7 图例不完整（灰线未解释）/W8 标签统计同层级/W9 反证边对比不足/W10 ✓✗ 图标含义不明。
home：W1 区块间距节奏/W2 空态无引导/W3 会话空态缺失/W4 判断卡与索引卡无区分/W5 chips 无选中态/W6 截断策略不一致/W7 主按钮对比弱/W8 辅助文案对比不足/W9 计数三重冗余/W10 零态噪音。
new-375：W1 触控目标<44px/W2 语言切换过小/W3 字号 11-12px/W4 附件按钮触控/W5 主 CTA 半宽/W6 占位文案 4 行。

## 执行计划

1. [SKIPPED-MERGED] BEFORE 截图：用 09-01 既有基线（`.impeccable/review-baseline-0901/`，9C+26W 在册）。
2. [DONE-代码落地] 批次一（结构类）：HC1 队列优先（CSS order 保 DOM 稳定）、SC4 横幅（AwarenessBar idleVisible）、SC5 状态栏判断芯片可点击、SC1/SC2 图谱 barycenter+走廊+halo+透明度、SC3 取消嵌套滚动、HC2 词边界省略（共享 text.ts）、W4 日期后缀、W9 计数冗余、W2 tooltip、W6 来源文档字形、W7 图例补全（locator 条目+✓/✗语义）、W10 rank 入框+计数芯片、W10-home 终端(0)零态、home-W2 空态引导、new-W1/W2/W4/W5/W6 触控/CTA/占位/字号。
3. [RUNNING] envboot2（claude 类型子代理，有 shell）：build（含 typecheck）+ gold 副本 + serve 3311 + AFTER1 截图（.impeccable/waved-after1）+ DOM 实测（HC3 对齐/NC1 底部裁切/图谱溢出）。
4. [TODO] zai 视觉评审 AFTER1 vs 基线 → 迭代修复（含 HC3/NC1 依实测）。
5. [TODO] 门禁：web typecheck/build、root typecheck、E2E surfaces（zh/en 对等、375px、axe、键盘）、相关 vitest。
6. [TODO] 提交（只 stage web/ 文件 + .agent_brain/），更新 .control 与本文件。
7. [STRETCH] SelectionContext P0 / CLI verify 独立性 P0。

## 环境与工具事实

- 主会话与 general-purpose 子代理均无 shell 工具；shell 需派 `claude`/`code-reviewer`/`commit-writer` 类型子代理（envboot 教训：general-purpose 15min 无产出已终止）。
- impeccable Skill 不在会话中（覆盖矩阵在案）；替代闭环 = 真实浏览器截图+ DOM 实测 + zai 视觉模型评审。
- 金标准数据：`work/gold`；副本 `work/gold-hxd`；服务端口 3311（serve-3311-hxd.log/.err）。
- 截图工具：`web/scripts/capture-surfaces.mjs`（baseUrl outDir runId；zh+light、1600×1000+375×812、含 overflow/对齐/滚动性实测）。
- E2E 无 DOM 顺序依赖已核（draft-scope .first()=判断区仍为 DOM 首个 queue-section；perf awareness-bar 在 home+active run 可见）。
- 已改文件：web/src/components/detail/EvidenceGraph.tsx、web/src/components/AwarenessBar.tsx、web/src/App.tsx、web/src/lab/LabHome.tsx、web/src/lab/NewResearch.tsx、web/src/lab/StudyMap.tsx、web/src/lab/text.ts(新)、web/src/lab/lab.css、web/src/styles.css、web/src/i18n/dict.ts、web/scripts/capture-surfaces.mjs(新)。dict 变更：+legendLocator/+judgmentHint/+terminalIdle/+placeholderShort/-chipCounts（zh/en 对等）。

## 状态

- 2026-09-02：intake + 代码通读完成。
- 窗口-2：批次一+二落盘；两次 build 失败根因（单泛型 → rightOrder 漏返回）已修；根 dist D-031 解锁（根 tsc 重编译）。
- **after2（真实修复构建）DOM 实证闭账**：SC3（graphClipped 76→0）、SC4（非 home 面无横幅）、HC1（队列在上）、HC3（compose/queue 边缘同为 504/1328——旧评审为视觉误判）、NC1（canReachBottom+166px 富余——旧截图为视口伪象）、8 面全部 375px 零横向溢出。
- **after2 视觉评审**：SC1 ✓（连线不压字）；SC2 右段（主张→假设）大改善/左段仍有交叉 → 批次三加"按来源/按假设聚类切换"；SC5 已落地（可点击）但可见性弱；新缺陷：计数芯片坐标压标签（已修：移走廊右端 x=758）、图例分散（已合并一行）、select 当前项冗余（已去前缀）。
- **home after2 评审**：HC1/HC2/严重度色条/chips 对比度/已完成中性灰 全部确认；新修（批次四）：侧栏词边界省略、判断卡去点留条、横幅措辞"后台无运行中的研究"、qwSub 缩短+balance、索引卡 3 行钳制、judgmentSub 白话化。
- **new-narrow after2 评审**：工具按钮 42-46px ✓；触控媒体块因 CSS 级联败给 .btn--small(min-height:24) 未生效 → 块已移文件末尾+状态栏字号 12px；placeholderShort 再缩短。
- 批次三+变体（after3/dark/en）截图完成。**after3 measures**：全部面 375px 零溢出/可到底保持；SC3 graphClipped=0 保持。
- **截图工具两处系统性缺陷已修**（envboot2 诊断）：①localStorage 在 SPA 启动后写入不生效（hash 导航不重载）→ addInitScript；②measure 阶段把 .content 滚到底且 hash 导航不重置滚动 → 每面截图前重置到顶 + 新增 study-graph 定点截图。**此前 dark/en 组为逐字节相同的伪变体；study 面截在错误滚动位置（图谱从未入镜）**。after3 的 study 视觉评审因此作废，等最终轮重评。
- **批次五**（窄屏级联修复）：触控目标媒体块移 styles.css 末尾（此前同特异性败给 .btn--small 的 min-height:24）、状态栏窄屏 12px/30px、placeholderShort 再缩短。
- **批次六**（inspector 评审落地）：inspector 改 push 布局（.lab-root.is-inspector-open padding-right，≤900px 回落 overlay）、DOI 不断行、binding 状态 zh 本地化（binding.*.zh 键）。
- **inspector after2 评审确认良好**：Esc 关闭、来源引文+DOI 链接、armed-confirm 排除需原因、置顶/重分类/批注可发现。
- **批次八/九（终批）**：text.ts 拉丁文强制词边界（rail 评审残留"supplementatio…"）；"影响"→"已连接假设"措辞；撤稿/更正 ⚠ 前置于来源行（claim 带+inspector）。
- **inspector 终评全过**：推挤布局 ✓（卡片无词中截断）、DOI 不断行 ✓、绑定状态中文化 ✓。
- **home 终评**：队列置顶/无点有条 ✓、横幅措辞 ✓、白话副标题 ✓；会话空态在折叠线下（渲染存在）。
- **图谱终评**：不压字 ✓、图例三段 ✓、聚类切换 ✓、排名+文档图标 ✓、无截断 ✓；计数芯片与支持线可见性微调（批次七）。
- 门禁整包改派 envboot2（gates 代理无产出已停）：build→root tsc→lint→e2e chromium(3313)→全量 vitest→最终 dark/en 变体重截。
- 账本：HCI_FINAL_COVERAGE-20260830.md 已写入 Wave D 闭账节（9/9C + 26W + 顺带修复 + 剩余开放）。
- 待办：门禁绿 → 提交（stage 白名单见下）→ 终局报告。

## 提交清单（只 stage 这些）

web/src/components/detail/EvidenceGraph.tsx、web/src/components/AwarenessBar.tsx、web/src/App.tsx、web/src/lab/{LabHome,NewResearch,StudyMap,AppRail,ClaimInspector,text}.tsx(+text.ts 新)、web/src/lab/lab.css、web/src/styles.css、web/src/tones.ts、web/src/i18n/dict.ts、web/scripts/capture-surfaces.mjs(新)、.agent_brain/、.control/HCI_FINAL_COVERAGE-20260830.md。
绝不 stage：src/**、experiment-runtime/**、tests/exploration-sandbox*、scripts/verify-exploration-sandbox.mjs、brand/、competition-inputs/、submission/、AGENTS.md、FARLAB_REBUILD_MASTER_MISSION.md、.impeccable/（证据留盘不入库，账本引用路径）。

## 教训

- 子代理类型：general-purpose 无 shell；claude 类型有 PowerShell（envboot2 可用且响应可靠，回消息用 SendMessage to main）。
- 编辑期间跑 build 会拿到不一致快照——build 失败后旧 dist 仍被 serve；重建必须以 typecheck 先行、失败即停。
- vision 模型对"删除线"的误读：claim 排除态（is-excluded）在图谱中的呈现需要语义说明（后续给图谱排除节点加 ⊘ 标记）。
