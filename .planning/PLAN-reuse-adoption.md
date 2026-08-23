Status: ACTIVE — docling-mcp live-validated (evidence/oss-integration/), product wiring pending; playwright-mcp queued — 2026-08-24

# 复用优先采纳计划（Reuse-First Adoption Plan）

> 2026-08-22 用户指令：**"如果你做不到，直接去 github 调研找高性能强大的项目直接移植源码，不要闭门造车"**。
> 四路并行 OSS 尽调（PDF/引用解析、图/表性能、diff/ACH/通知、KaTeX/性能/a11y），全部候选经 2026-08 实时核验（GitHub/npm 许可、最后发布、性能实证）。
> 本计划是 PEX Phase-2（`.planning/PLAN-product-experience.md` B0-B14）的**执行方式修正案**：剩余难项一律复用优先，自研仅在"无合格轮子或轮子劣于现状"时保留（判据见 §2）。

## 1. 定界

**问题陈述**：B0-B14 剩余批次（B5/B6/B8/B9/B11 尾/B12 尾/B13/B14）中含多项"高难拿不准"能力（PDF 解析、引用格式解析、大图渲染、大表虚拟化、词级 diff、公式排版、性能度量、a11y 审计）。按用户指令改为 GitHub 调研→移植/依赖一流实现，禁止闭门自研这些已有一流解的问题。

**用户价值**：剩余批次从"自研风险项"变为"集成成熟件"——更快的交付、更高的质量下限、更少的维护负担；供应链与许可风险经尽调前置消除。

**范围边界**：
- In：下表 11 个面的选型裁决 + 引入方式（npm 依赖 vs vendor 源码）+ 对应批次的实施 Phase + 许可/供应链门禁。
- Out：Node 产物侧零运行时依赖不变式（zod-only，protected invariant 不变——复用全部落在 web 前端侧或 vendor）；兄弟会话已覆盖面（模型配置 D-096、agent 内核 D-097）；一期已排除方案（见 §6 台账）。

**验收标准（命令级）**：
- A1 每个引入依赖出现在 `web/package.json` 且 `npm run build` 0 错误；`npm ls --depth=0` 无预期外新增
- A2 许可门禁：`npx license-checker --direct` 输出全部为 MIT/BSD/Apache-2.0/MPL-2.0（无 GPL/AGPL）
- A3 PDF 拖放实测：拖入真实论文 PDF → 文本提取填充问题框（GUI dogfood 截图 evidence/W-PEX/）
- A4 .bib/.ris 实测：粘贴真实 BibTeX → 解析出 title/authors/year/doi 徽章
- A5 Zotero 实测（装有 Zotero 时）：localhost:23119 列出条目；未装时诚实降级提示
- A6 版本对比词级 diff 高亮实测（v0→v1 run）
- A7 KaTeX 实测：含 LaTeX 片段的假设/主张渲染为公式（trust:false）
- A8 axe dev 审计：0 critical violation 或全部修复
- A9 web-vitals attribution：B14 报告含 LCP/INP/CLS/TTFB 实测值
- A10 全量门禁：vitest 656+ / 双端 tsc+build 0 / secret-scan PASS / completion-gate PASS（终局）

**风险**：R2（新依赖引入供应链面——用精确 pin + license-checker 门禁缓解）；R2（@antv/G6 有 2022 npm 投毒史——已弃用不引入）；R1（react-katex 与 R18 兼容性已核验 v3.1.0 OK）；R3（Sigma.js 迁移时机误判——用阈值触发+实测数据决定）。档位：**Heavy**（改依赖面+跨多批）。

## 2. 选型裁决表（2026-08 实测尽调）

| 面 | 裁决 | 依据（实时核验） |
|---|---|---|
| PDF 文本提取（浏览器） | **unpdf**（npm，MIT，1.2k★，活跃） | 内联 PDF.js v5 serverless 构建，`extractText(mergePages)` 正中需求；Apache 的 pdfjs-dist 需配 worker，unpdf 免配置 |
| BibTeX+RIS 解析 | **citation-js** core+bibtex+ris（npm，MIT） | 双格式一等支持、CSL-JSON 归一化输出；bibtex-parse 系碎片化无 RIS |
| Zotero 本地集成 | **自写 ~80 行 fetch 包装**（localhost:23119/api v3） | 官方 client 或 AGPL（zotero-api-node ✗）或低维护薄封装；REST 本身稳定文档化——无轮可造 |
| 大图渲染（>500 节点） | **既定迁移路径 Sigma.js**（MIT，WebGL，5k 节点/10 万边实证）；**当前保留自研 SVG** | SVG 在 ~1-3k DOM 元素封顶；当前单 run ~40 节点 SVG 最优；阈值触发迁移（代码注释+计划记录） |
| 大表虚拟化 | **TanStack Virtual**（npm，MIT，周更）按 B14 实测引入 | react-window 维护模式（bvaughn 离队）；TanStack 10 万行实证、TS 一等、headless 契合现有表格 |
| 词级 diff（版本对比） | **jsdiff**（npm，BSD-3）+ Intl.Segmenter CJK 适配 | `diffWordsWithSpace` 输出直接 map 渲染；DMP 无词级 API（备用参考不引入） |
| ACH 方法论 | **EMR-ACH 思想引入**（MIT Python 论文实现）：判别性加权=方差权重，与我们 shared/discriminating 语义形式等价；**对比性约束**作 B6 输入校验 | 无可移植 JS 代码（Burton GPL+PHP 死、open-synthesis AGPL 归档）；方法论验证+引用，不搬码 |
| 通知 | **已完成**（裸 Notification API，B3-2）——尽调证实无库必要 | 生态三域（服务端推送/应用内 toast/日历调度）均非我们的问题 |
| LaTeX 公式 | **KaTeX + react-katex v3.1.0**（npm，MIT；trust:false 防 CVE-2025-23207） | 同步渲染快 10 倍；MathJax 4 ~1MB 仅在重 CJK 数学排版时备选 |
| 性能度量 | **web-vitals@6.1.1 attribution**（npm，Apache-2.0） | LCP/INP/CLS/TTFB 全含 + LoAF 归因，B14 预算工作正解 |
| a11y 审计 | **axe-core 直接用**（npm，MPL-2.0 弱 copyleft 安全；**@axe-core/react 不支持 React 18 ✗**） | dev-only 钩子 console 报告；WCAG 2.1/2.2 AA 规则集 |

**自研保留判据**（何时"不找轮子"是对的）：① 当前规模下自研更小更优（SVG 图谱 vs 40KB WebGL 引擎）；② 领域无合格实现（Zotero 本地 client、ACH JS 库）；③ 40 行内标准 API 即可（Notification）。三者均已在裁决表显式记录，非闭门造车。

## 3. Phase 序列

### R1 — B9 入口升级（复用主批）
- depends_on：本计划批准（web 依赖变更即授权，名单封闭于 §2）
- must_haves：`npm i unpdf @citation-js/core @citation-js/plugin-bibtex @citation-js/plugin-ris`；NewRunForm 粘贴识别（DOI/arXiv/URL/BibTeX/RIS 正则 + 徽章）；拖放 .pdf/.txt/.md/.bib/.ris（PDF→unpdf 提取，文本→直接填充，上限 64KB）；Zotero fetch 包装（未装诚实降级）；api.ts `POST /runs` seed 扩展（user-provided sources，provenance 标注）——**需与兄弟会话协调 api.ts**；A3/A4/A5 验收
- estimate：~180k tokens / 6 任务 / 置信度 med
- checkpoint：GUI dogfood（真实 PDF+BibTeX）→ human-verify

### R2 — B4 路由挂载 + B11 CLI 收尾
- depends_on：R0（api.ts 已释放，路由代码已就绪）
- must_haves：actions 路由（已写好待挂）+ actions HTTP 测试；`far completion bash|zsh|pwsh`、`far new` 交互向导、`far research status --watch`（TTY 检测、真实阶段重绘、Ctrl-C 退出）；HELP 更新
- estimate：~120k tokens / 5 任务 / med
- checkpoint：CLI 冒烟（completion 输出、watch 一轮 run）→ human-verify

### R3 — B5 假设操作 + B13 部分硬化
- depends_on：R1（jsdiff 引入）
- must_haves：`npm i diff react-katex`；Fork/Promote/Reject/Connect（domain 生命周期 status 字段 + API + UI；Connect 标 source=human 入 ACH 三源）；版本对比升级为 jsdiff 词级高亮（v0→v1 实测）；KaTeX 渲染假设/计划中 `$...$` 片段（trust:false）；`npm i axe-core` dev 审计钩子 + 修复 critical
- estimate：~220k tokens / 8 任务 / med
- checkpoint：三视角批判 → decision（生命周期字段 schema——变更确认线）

### R4 — B6 绑定增密（EMR-ACH 方法论基准）
- depends_on：R3（ACH 三源已扩）
- must_haves：critique_falsify 判定覆盖扩展（显式"无实质关系"区分"未评估"）；EMR-ACH 判别性方差权重进 rank 参考 + 对比性约束（零判别力证据入库时标注）；科学评审（scientific-reviewer agent）+ 真实 run A/B 绑定密度对比
- estimate：~200k tokens / 5 任务 / low-med
- checkpoint：decision（科学语义变更）→ human-verify

### R5 — B8 实验进 run 生命周期
- depends_on：R4；兄弟会话空窗
- must_haves：execute-stage 集成（RunStageName/STAGE_ORDER/runProgress/租约续期）；红队对抗评审前置；回滚方案
- estimate：~250k tokens / 6 任务 / low
- checkpoint：decision → adversarial review

### R6 — B12 差距盘点 + B14 性能/终局
- depends_on：R1-R5
- must_haves：对照 D-096 已建模型配置面盘点 B12 剩余（探针触发/健康/用途展示）；`npm i web-vitals`；B14 全指标实测（TanStack Virtual 按数据引入；Sigma 阈值判定）；axe 修复清零；completion-gate + 对抗审计（adversarial-auditor + architecture-critic）+ 终局 dogfood 对比 B1 基线
- estimate：~250k tokens / 7 任务 / med
- checkpoint：human-verify（终局评审）

## 4. 高影响决策（已选型如上；此记录引入方式异构案）

**决策：依赖引入方式**（对全部 npm 引入项）
- 案A（推荐）：npm 精确 pin（`"x.y.z"` 无 `^`）+ license-checker 门禁进 B14 收口——供应链可控、升级路径清晰
- 案B：全部 vendor 进 `web/src/vendor/`（unpdf/citation-js 是聚合包，vendor 体积与更新成本反超）
- 案C：mix——仅 jsdiff（25KB 单文件气质）vendor，其余 npm
- 推荐 **A**：我们的威胁模型（本地单用户竞赛产品）下 pin+审计已足；vendor 留给 Node 侧（那里才是零依赖硬约束）

## 5. 工件

本计划（canonical）+ `.planning/PLAN-product-experience.md`（B 批次索引不变，实施方式按本表）+ 全局副本 `~/.zcode/state/plans/plan-reuse-adoption.md` + active-task.md 更新。DECISIONS 落 D-098（批准后）。

## 6. 已排除方案（防重试台账，含继承）

**继承有效**：Electron｜MLflow/DVC/Ray/Modal/W&B（D-083）｜vendored ssh2 npm（D-087 用系统 OpenSSH）｜shadcn/MUI/AntD 换皮｜紫蓝渐变/发光/玻璃拟态等 HCI §10 全清单｜图表/动画/粒子库引入（视觉剧场禁令——Sigma.js 不属此类：性能阈值触发，非装饰）
**本轮新增排除**：
| 方案 | 否决理由 |
|---|---|
| zotero-api-node | AGPL-3.0 传染许可，且为远端 Web API 设计 |
| vis-network | 官方确认停止积极维护；>1-2k 节点性能劣化 |
| @antv/G6 | ~500KB+ 深依赖树 + 2022 @antv/* npm 投毒史（供应链）；vendor 不可行 |
| react-window | 维护模式（作者离队），新项目不应采用 |
| diff-match-patch 生产引入 | 无词级 API（需 4 年未更新的三方扩展）；仅作 jsdiff 劣化时参考 |
| MathJax 4（默认） | ~1MB 体积；仅重 CJK 数学排版时再评估 |
| @axe-core/react | 官方不支持 React 18（issue #500）——直接用 axe-core |
| Burton/open-synthesis ACH 代码 | GPL/AGPL + PHP/Rails + 死档 |
| 自研 PDF/BibTeX 解析 | 用户指令禁止 + 一流 MIT 实现存在（unpdf/citation-js） |
| 立即引入 Sigma.js 替换 SVG | 当前 ~40 节点规模 SVG 更优；阈值 >500 元素再迁（避免为迁移而迁移） |

## 7. estimate 基线（供 actuals 校准，超 20% 停下重估）

R1 180k / R2 120k / R3 220k / R4 200k / R5 250k / R6 250k，合计 ~1.22M tokens / 37 任务 / 整体 med-low（跨多会话，兄弟会话并行项不计入）

## 8. 手写面复审（2026-08-22 用户指令强化："特别难的、做不到的，去 GitHub 拿开源源码融入，不闭门造车"）

对项目至今所有手写自研表面的逐项裁决（每条有实跑/实时核验依据）：

| 手写面 | 裁决 | 依据 |
|---|---|---|
| 全局搜索 SQL LIKE | **改用 SQLite FTS5**（内置，零新依赖）：bm25 排名 + `snippet()` 高亮 + unicode61 分词，直接消掉 B2 批判 P0/P1（无排序/无片段）两大遗留 | 本机实测 `PRAGMA compile_options` 含 `ENABLE_FTS5`，`MATCH` 查询通过（Node v24.14.0 自带；Node<24 无 FTS5 的旧约束不再适用）；[nodejs/node#56951](https://github.com/nodejs/node/issues/56951) 已在 Node 24 线落地 |
| 命令面板（~250 行手写） | **移植 cmdk 的 IME 守卫**（`event.nativeEvent.isComposing` 检查）：cmdk v1.1.1 修的正是 Enter 在中文输入法组词期双触发——我们的面板无此守卫，中文用户必踩。整体换 cmdk 不做：面板已 live 验证（焦点归还/Tab 圈禁/扁平 option），cmdk（现 dip/cmdk，2.6M 周下载，MIT）作为其劣化时的既定替换路径记入 D-090 reversal trigger | cmdk v1.1.1 changelog 实核（IME double-triggering fix）；[dip/cmdk](https://github.com/dip/cmdk) |
| 证据图谱 SVG（零依赖） | 维持既定阈值迁移：>500 元素换 Sigma.js（MIT，WebGL 5k 节点实证）。当前 ~40 节点 SVG 更优 | B7 尽调（PLAN §2） |
| 实验规格起草（LLM 闭域提案） | **保留自研闭域合同**——不存在可直接采用的"plan→实验规格"开源库；执行引擎已是 sklearn sidecar（复用）。AutoGluon/FLAML 等重型 AutoML 作为 sidecar 候选记入未来评估，不在本程 | 领域检索（R1 尽调 + B8 实作）；live 抓到的列漂移/超参漂移均已加确定性守卫+重试 |
| SSE 事件流（~60 行） | 保留：Node 原生 http 的规范用法，无值得引入的库（ws/socket.io 为全双工场景，过重） | 标准库纪律 |
| CLI completion 脚本生成 | 保留：~90 行纯函数+测试已验（bash -n / pwsh AST）；commander/oclif 是路由器重写非补全增强 | R2 实作 |
| 已采纳面 | pdfjs-dist/citation-js/jsdiff/KaTeX/axe-core/web-vitals（R1/R3/B14）；TanStack Virtual 按 B14 实测引入 | §2 裁决表 |

**新增排除**：整包换 cmdk（现面板已验证，仅移植其 IME 守卫这一关键修复）；引入 socket.io/ws 做 SSE（场景不符）。
