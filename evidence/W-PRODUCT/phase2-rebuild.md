# Wave-PRODUCT Phase-2 — 产品体验重构（IA 质变批次，2026-08-22）

> 会话目标：把"工程工作台"重构为"研究者工作台"——IA 从 8 个管线投影 tab 重组为
> 6 个任务区，研究者语言全统一，研究页头/结论摘要/证据概览/研究库侧栏四个新表面，
> CLI 四符印签名。基于 craft-spec-v2（不推翻 token 验证链）+ 4 路增量调研
> （research/wave-product-reports/phase2-design-intelligence-2026-08-22.md）。

## Before/After

| 表面 | Before（audit-01/02 截图） | After（after-01..04 截图） |
|---|---|---|
| Run 详情 IA | 8 平铺 tab（概览/证据/假设/计划/实验执行/修订/溯源/事件流）= 管线表投影 | 6 任务区：研究/证据/假设/计划与实验/修订史/核验与导出 |
| 页面骨架 | banner + tab 条（纯文字）+ section 卡片堆叠 | **研究页头**：陈述声（Source Serif 4 22px）问题大标题 + 状态徽章 + 领域/时间/id 元信息 + 阶段叙事行（运行中带脉搏）；图标分段导航 |
| 概览页 | 运行控制台（动态/问题/时间线/控制 4 等权卡） | 研究首页：**结论摘要卡**（top 假设陈述+名次+BT/胜率+证据平衡+语料计数，数据驱动仅 settled 态渲染）→ 活动叙事 → 时间线 → 范围 → 控制；原始事件流收进"完整过程记录"披露 |
| 侧栏 | 51 项平铺；已完成项仍带"当前阶段: 导出"+进度条噪音；"研究 Runs" | "我的研究"图书馆：两行制条目（运行中=脉搏+阶段+微进度条；完成=领域·时间），研究库默认 12 条+"显示全部 51 项研究"，进行中/需注意分组 |
| 欢迎页 | 72px Logo + 表单 | 问题输入为第一锚点 + **示例问题 chips**（3 个真实问题一键填充） |
| 证据页 | 4 个 section 直接堆叠 | 顶部**证据概览条**（N 来源·M 主张·✓支持·✗反对，真实计数） |
| 术语 | "研究 Runs"/"事件流"/"溯源 Receipts"/"本 run…" | "我的研究/研究库/过程记录/核验与导出/本研究…"（zh 22 处 run 残留清理） |
| CLI | done/skipped 文字着色 | **四符印** ✓✗●▲—（与 Web ev-glyph 同语义映射，非 UTF8 降级 ASCII）+ 错误三段式（→ 下一步命令） |

## hash 兼容（旧链接永不破）

`resolveTabId`：overview→research, events→research, experiments→plan, provenance→verify。
实测：`#/run/x/provenance` → "核验与导出" tab 激活，87 行回执正常渲染。

## 真实路径验证（GUI，Playwright）

1. **新建研究全旅程（真实 run）**：示例 chip 一键填充 "Does vitamin D supplementation
   reduce the risk of respiratory tract infections?" → 提交 → run_jpktce50q7wqc68rkg64ztm3me
   创建即落自己研究页 → 页头"第 1/9 阶段·文献检索" + banner 运行中叙事 + 侧栏脉搏点
   → 完成 → 结论摘要卡渲染（Rank 1 · BT 5.82 · 胜率 100% · 8 主张 15 关系 · top 陈述
   "The protective effect of Vitamin D against respiratory infection is contingent upon
   sufficient bioav…"）。zai live 路由，一次真实执行即止（Key 纪律）。
2. **暗色模式**：data-theme=dark（bg #0d0f10，页头 #acaeb0，active tab info 色）——after-02。
3. **英文界面**：6 tabs/Research outcome/Rank 1/My research 全英文渲染——after-03。
4. **命令面板**：跳转组=新 6 区；切换研究组按问题文本列出。
5. **证据概览条**：12 来源·18 主张·47✓·17✗（run_hzxxc7tgjjq3arkvckdnm6nv4c）。
6. **CLI**：`research status` → `✓ done` 阶段行；`status run_bad_format` →
   `far invalid run id format… / → copy the id from: far runs`。
7. **修订史空态**（诚实）："本研究尚无反馈信号"。

## 变更面

- `src/server/api.ts`：GET /runs/:id 投影 questionText/domain（研究页头数据源；同 listRuns 语义）
- `web/src/components/RunDetail.tsx`：6 TabId + LEGACY_TABS + 图标分段导航 + 统一 tab-content 容器
- `web/src/components/detail/RunHeader.tsx`（新）、`ResearchSummary.tsx`（新）
- `RunsSidebar.tsx`（两行制+研究库截断）、`WelcomeView.tsx`（hero 收紧）、`NewRunForm.tsx`（示例 chips）
- `EvidenceTab.tsx`（概览条）、`OverviewTab.tsx`（摘要接入+onNavigate）、8 个 tab 组件根容器 fragment 化
- `App.tsx`（resolveTabId 接线+palette 导航）
- `i18n/dict.ts`：tab/组名/22 处 run 术语/新键（runHeader.*/summary.*/evidence.stat*/events.disclosureTitle/example.*）
- `styles.css`：run-header/分段导航/侧栏两行制/研究摘要/证据概览/示例 chips/text-autospace/tab hover
- `src/cli/main.ts`：STAGE_GLYPH 四符印 + die(hint) 三段式

## 门禁（2026-08-22 实跑）

- vitest 805/806（新增 api 投影判别测试 1 项；2 skip=既有环境项）——退出码 0
- typecheck 双端 0 错（tsc 根 + web）
- build 双端成功（dist-freshness 守卫过）
- eslint：改动文件 0 错误（既有 export.ts 1 错误属 EEL lane 所有权文件，未触碰，如实记录）
- secret-scan：PASS
- GUI 走查：上文 7 项，截图存档 evidence/W-PRODUCT/

## 记录的后续候选（不阻塞本批）

- VSUP 粒度坍缩、CLI TSV 双模式/相对时间、修订链 OSF 式视觉增强（见 phase2-design-intelligence §B）

## 对抗审计与修复（同日追加）

独立 adversarial-auditor 子 Agent 对 commit 703296b 审计 7 项主张：4 PASS / 3 FAIL。
FAIL 全部修复并验证（commit "fix(pex): adversarial-audit fixes…"）：
1. **侧栏选中截断缺陷**（审计发现的真实缺陷）：深链/palette 导航到研究库第 13+ 项时
   选中项不可见——修复=选中索引 ≥ LIBRARY_PREVIEW 时自动展开全库。GUI 实证：
   深链 run_fbcc5ksh4pqbxvz89e5e2swvzg（第 13 项）→ 52 项全显+选中可见（硬刷新后）。
2. **CLI UNICODE_OK 探测 no-op**：`isTTY !== false` 在 Node 永真（isTTY∈{true,undefined}）
   → 改 `=== true`。实证：管道输出现在正确降级 ASCII（`+ done`）。
3. **i18n 残留**：en 'form.tryExamples' 误存中文、5 处 event/controls zh 'run' 残留、
   runs.loading——全部清理。
审计同时确认：IA 重定向全路径正确、旧 tab 零死引用、ResearchSummary 全分支诚实、
服务端投影空值安全且测试具判别力。

## 最终门禁（审计修复后）

- vitest 全量 842/844 通过（2 skip=既有环境项；期间一次 5-fail 为兄弟会话管线
  中间态，非本批，复跑全绿）——退出码 0
- typecheck 双端 0 错；build 双端成功；secret-scan PASS；completion-gate PASS
- 已知遗留：export.ts 1 个既有 eslint 错误（EEL lane 所有权文件，本会话未触碰，如实记录）
