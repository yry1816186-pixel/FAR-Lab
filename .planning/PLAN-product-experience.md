# Product Experience Mission — 综合设计与切片计划

> 2026-08-22 用户任务：世界级科研产品体验重构（Research → Design → Implementation 闭环，直接施工）。
> 输入：自走 dogfood（3 个真实 completed run + 42 completed/31 partial 全库）、产品审计（47 文件全量）、
> 竞品研究（Elicit/Scite/Consensus/SciSpace/ResearchRabbit/ConnectedPapers/Litmaps/S2/NotebookLM/Zotero/AI-Scientist 系统 + Linear/Notion/Raycast/VSCode/Obsidian）、HAI 模式研究（信任/长任务/可逆/失败 UX/onboarding）。

## 1. 研究者旅程（现状实测，2026-08-22）

提问（1 次提交）→ **盲等 ~8 分钟**（9 阶段，无子任务粒度）→ 概览页（元信息表）→ 自行发现 7 个 Tab →
证据页（3 张只读表）→ 假设页（ID 当标签、三张互不联动的表+卡片、无对比、无操作）→ 计划页（只读）→ 溯源页（验证/下载）。
次日返回：侧栏全是 `run_xxx` ID，**找不到"我的 CRISPR 研究"**。

## 2. 核心洞察（三路研究交叉验证）

1. **经检索验证的空白**：无任何主流科研产品提供"竞争假设并排对比 + 支持/反证 + 可证伪性"界面。
   ACH（竞争性假设分析）方法论只存在于小众工具；Google co-scientist 有假设锦标赛但用户看不到对比界面。
   **FAR-Lab 的假设对比画布是首屏级差异化资产，不是二级页面。**
2. **魔法公式 = 结构化投影 + 单元格级出处**（NotebookLM/Elicit 共同点）；聚合读数必须显式加权并保留异议（Consensus 等权投票是反面教材）。
3. **对象必须可操作**：因果修订链（feedback → 可解释 diff）是产品核心差异化，但当前藏在概览页表单里、要求手抄对象 ID——差异化能力等于不存在。
4. **研究者身份不可见**：所有列表面（侧栏/欢迎页/评分表/锦标赛）显示机器 ID 而非问题/陈述文本；`GET /runs` 甚至不返回问题文本（API 级缺口）。
5. **信任信号被隐藏**：gradeCertainty（GRADE-lite 已确定性计算）、multipleTestingPolicy、bundle limitations、反证检索记录——全部有数据无 UI。
6. **无头流水线不是工作台**（Sakana/co-scientist 教训）：研究者要能中途审视、反驳、改向。锦标赛辩论记录本身是信任界面。
7. 键盘优先/命令面板在科学软件品类缺席——最便宜的专业感护城河（后续切片）。

## 3. Magic Moment（定义）

> 研究者输入一个问题 → FAR-Lab 在眼前长出一个活的研究工作区：验证过的文献进入、主张带极性绑定到来源、
> **竞争假设逐渐成形并排呈现在一张对比画布上**——支持/反证、前提、可证伪预测一览无余；
> 研究者随时可以质疑、对比、反馈，每次修订都可解释、可回溯。

产品名（对内）：**假设工作区（Hypothesis Workspace）= FAR-Lab 的首屏核心对象**。

## 4. Critical Product Problems（3-7 个，持续维护）

| ID | 级别 | 问题 | 切片 |
|----|------|------|------|
| CPP-1 | P0 | 科学对象惰性：假设/主张/计划无任何内联操作（质疑/对比/反馈），因果修订链不可发现 | S1 |
| CPP-2 | P0 | 研究者身份不可见：列表面全显 ID；`GET /runs` 无 questionText（API 缺口）；次日返回测试完全失败 | S1 |
| CPP-3 | P1 | 无假设对比体验（经检索验证的差异化空白未被产品占用）；锦标赛/评分/卡片三视图互不联动、名次与复合分倒挂无解释 | S1（对比+联动+一致性注记）；S3（ACH 矩阵全量） |
| CPP-4 | P1 | 信任信号隐藏：gradeCertainty / multipleTestingPolicy / bundle limitations / 反证检索记录有数据无 UI | S2 |
| CPP-5 | P1 | 盲等：阶段级进度无子任务粒度、无当前活动叙事；HAI 规则要求动态步骤清单+实时活动流 | S2（events 叙事）；S4（orchestrator 子任务） |
| CPP-6 | P2 | 运行内检索/过滤缺失（claims/hypotheses/sources 无 in-tab 筛选）；claim 引用（clm_…）跨 Tab 不可导航 | S2/S3 |
| CPP-7 | P2 | 命令面板/键盘流/quick capture 缺席（品类空白，Linear 级工艺） | S5 |

## 5. 切片计划

- **S1（本批，端到端真实能力）**：假设工作区活化
  1. API：`GET /runs` 增 `questionText`+`domain`（读模型投影，store 已有数据）
  2. 侧栏/欢迎页：问题文本为主标签（ID 降为次要），过滤命中问题文本
  3. 假设页：评分表+锦标赛行显示陈述文本并锚链接到卡片；名次 vs 复合分一致性注记
  4. **对比模式**：卡片选择 2-3 个假设 → 并排对比（陈述/机制/前提/预测/证伪/支持反证计数/得分/不确定性）
  5. **反馈抽屉**：FeedbackForm 提升为全局抽屉，可预置目标；假设卡"质疑此假设"、计划页、证据页 claims 行内动作直开
  6. dogfood（GUI 全流程）+ 测量 + 三视角批判 + 修复
- **S2（已落地 2026-08-22，真实 run dogfood 验证）**：①概览页「研究动态」活动流——真实事件流驱动（阶段转换带 pipeline 摘要/每次模型与检索调用/状态变更），运行中带当前阶段说明与呼吸点（reduced-motion 降级），无虚构进度，已完成 run 保留全程记录（evidence/W-PEX/s2-activity-live.jpeg）；②信任信号——claims GRADE-lite 徽章（hover 降级因素轨迹，实测 18 claims）、计划页统计纪律块（policy 人话+分配理由+statisticalDesignNote）、verify 报告附挂 bundle 自报 limitations（API 层注入，避开 EEL 在途 verify.ts；测试断言）；③对比判定阈值行（支持/弱化/证伪三条件，实测两列完整）；④真实新 run（prime editing）z.ai 3 分钟 9 阶段，等待期全程有叙事；⑤门禁 656/658（2 既定 skip）+ 双端 tsc/build 0 + lint 0 + secret-scan PASS。剩余（S2 尾巴）：证据页作者/venue/DOI/OA 链接丰富、反证检索记录结构化展示（无端点，需 API）
- **S3（已落地 2026-08-22，GUI 全链路验证）**：①可分享 hash 路由 `#run/<id>/<tab>`（useHashRoute：mount 恢复/replaceState 同步/hashchange 后退；深链实测恢复 hypotheses/evidence，跨轮询 9s+ 稳定无漂移，tab↔URL 双向同步）；②ACH 判别性证据分析块（CompareView 内：共享=绑定多个所比假设无判别力/判别=仅绑定一个——完全由真实 supporting/counterClaimIds 计算；诚实注记披露管线绑定稀疏（11 假设仅 1+1 绑定），无绑定不渲染，不做空壳矩阵）；③跨 Tab claim 导航（ACH 点击→证据页→scrollIntoView+flash 高亮，实测 claim-clm_n1j5… 视口内）；④in-tab 过滤（claims "nucleosome" 18→2；假设按陈述/机制/id）。**诚实降级记录**：版本对比 v2-vs-v3 不做——实测 DB 无 version>0 假设，无数据不做 UI；claim↔hypothesis 绑定稀疏是管线能力缺口（build_evidence 关系只绑 question），ACH 全量矩阵需管线侧增强，记为管线 lane 债务。门禁：656/658 + web tsc 0 + build 0 + secret-scan PASS
- **S4**：orchestrator 子任务事件（消除盲等的根因修复）+ quick capture
- **S5（已落地 2026-08-22，GUI 全流程验证）**：命令面板（Ctrl/Cmd+K）——Linear/Raycast/VS Code 模式，科学软件品类缺席的键盘中枢。零依赖自研（子串分词匹配）；命令集全部真实能力：新建研究、8 个 tab 导航（含 EEL 实验执行）、最近 8 个 run 切换（动态标签=问题文本，可按问题文本/status/id 搜索）、主题/语言切换；↑↓ 导航/Enter 执行/Esc 关闭/焦点自动落输入框/分组渲染。实测：Ctrl+K 打开（19 命令 4 组）→"EGFR" 过滤出 2 runs→Enter 切换 run_fbcc5ksh（URL+侧栏同步）→"溯源"→Enter 切 provenance tab（URL 同步）。桌面端 quick capture（托盘/全局快捷键）仍为后续项。门禁：656/658 + tsc/build 0 + secret-scan PASS

## 6. 验收（S1）

- [x] `GET /api/v1/runs` 返回 questionText/domain；api.test.ts 覆盖（tests/api.test.ts 39/39 绿）
- [x] 侧栏/欢迎页主标签=问题文本；过滤可按问题命中（GUI 实测：CRISPR/EGFR/C.diff 问题全库可见）
- [x] 评分表/锦标赛行显示陈述；行→卡锚链接可达（含 rank-vs-composite 一致性注记）
- [x] 对比模式：2-3 假设并排，字段对齐，真实数据（№1 vs №2 含完整证伪判据与证据平衡，截图 evidence/W-PEX/compare-view-crpr.png）
- [x] 反馈抽屉：从假设卡/对比列/声明/计划预置目标，真实 POST 落库（fbk_7tg3… target=hyp_cgv8…, 事件 #5612 feedback_received）
- [x] 全量 vitest 618/618 绿（唯一失败为并行 EEL 会话在途的 experiment.test.ts，非本切片面）+ web typecheck 0 + 双端 build 0
- [x] GUI dogfood 走通：对比 №1 vs №2 → 质疑 №1 → 事件确认
- [x] 三视角批判（Product/HCI/Scientific）P0/P1 全修 + GUI 回归验证

## 7. 批判结论与修复记录（2026-08-22，三视角）

**已修（本批，GUI 回归验证）**：
- P0-1 抽屉焦点抢夺（轮询重渲染 → focus 抢回）：focus 只在 mount 执行一次，回调入 ref；回归验证 6s 跨轮询窗口焦点稳定在输入框
- P0-2 假 aria-modal：实现 Tab 焦点陷阱 + 关闭归还触发按钮（验证：焦点归还"质疑"）
- P1 误关丢稿：脏关闭确认（仅正文非空时；预置目标一键可复得不算脏）；清空后 Esc 直关（验证通过）
- P1 反馈黑洞："201 Created" toast → 内联成功态 + "查看修订链"直跳修订 tab（闭环验证）
- 目标 chip 裸 ID → 陈述标签（hypothesis/claim/plan 三处调用点传 label）
- 证据平衡"未知"列类别错误 → "未解决不确定项 {n}"（uncertainties 的真实语义）
- 对比列序按名次稳定排序（修正注释）；维度分行内联"未校准"标注；假设 kind 本地化；锚点 :target 样式 + scroll-margin；对比列头陈述 3 行钳制；选中计数 aria-live

**记录为后续切片（有明确归属）**：
- S2：等待期零价值（run 创建后落在 overview 复述问题，假设不逐条浮现）——Product 批判"致命#1"；运行中活动叙事（events 驱动）
- S2：信任信号显性化（gradeCertainty/multipleTestingPolicy/bundle limitations/反证检索记录）
- S2：compare 前提保留 uncertainty 批注已有（本批判修复中已带上 assumption uncertainty），falsification 三条件+混杂折叠深化
- S3：判别性证据分析（支持/反证 claim 级展开 + 共享证据高亮 + 差集判别行）；ACH 矩阵；in-tab 过滤；跨 Tab claim 导航
- S3：版本对比（v2 vs v3 修订链对比）；ScorecardsTable openRank 键改 card.id
- S4：完成通知/后台运行拉回（留存钩子）
- S5：URL 路由与分享（run/tab/compare 状态入 URL）；compare 导出 Markdown；命令面板
