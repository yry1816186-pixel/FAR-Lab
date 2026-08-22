# Wave-Aesthetics：HCI 层美学执行重做计划

> 计划版本 v1（2026-08-22）｜档位 Heavy（完整门禁）｜状态：**待用户批准（HARD-GATE）**
> canonical 事实源 = 本文件（项目内）。全局恢复副本 = `~/.zcode/state/plans/plan-wave-aesthetics.md`。每 Phase 末主 Agent 同步两者，漂移以本文件为准。

---

## 0. 事实基础（阶段 0 已完成的侦察结论）

三路并行侦察 + 直接文档核验的浓缩事实（完整证据见各研究报告，本节为决策依据）：

### 0.1 现状实况 [实测]

| 面 | 现状 | 关键证据 |
|---|---|---|
| Web | React 18 + Vite 6 + Tailwind v4 + 自定义 v2 token（OKLCH、三声字体、暗色自动），28 组件 ~5450 行，功能/i18n/ARIA 完整 | `web/src/styles.css`（648 行唯一 CSS）；`web/src/i18n/dict.ts`（1005 行） |
| Desktop | Tauri v2 极简壳 177 行 Rust（spawn server + health 等待 + webview），Windows 实测通过，mac/Linux 声明级 | `desktop/src-tauri/src/main.rs` |
| CLI | 手写 argv 解析，10 命令，零颜色/零 spinner/零交互提示/零 TTY 检测，`--json` 全局可用 | `src/cli/main.ts`（436 行） |
| 设计研究 | 13 份研究报告已存在（M3/HIG/Fluent/GNOME/KDE/WCAG2.2/clig.dev/Wilke 可视化诚实 + 反AI味判别学 + 25 信任模式 + 11 竞品对标） | `research/wave-product-reports/`（13 文件） |
| Wave-PRODUCT | 六期全部 LANDED（D-060~D-067-bis），三声字体/palette/桌面/交付物均已落地 | `.control/DECISIONS.jsonl` |

### 0.2 "丑"的量化根因（六条，全部实测）

1. **字号系统性偏小**：全局基础 13.5px（`styles.css:125`），表头 11.5px、hash 11px。而 line-a §8.2 规定 **M3 body-large 16/24 为正文默认**；WAVE-PRODUCT-DESIGN-PLAN.md:145 规定中文**正文 14/数据 13.5/极限 12**——落地把"数据声 13.5"当成了全局基础，比两份规格的正文档都小。**规格冲突从未消解，落地取了最小值**。
2. **间距无系统**：规格规定 8px 基网格（PLAN.md:168），落地是硬编码 4/6/8/10/12/14/16/18/24/48 任意值，section padding 仅 10-12px，无呼吸感。
3. **层级扁平**：h1 15px / h2 13px / h3 13px（`styles.css:174,231,388`），差异 <2px，无 type scale。
4. **零动效**：line-a §8.3 规定 motion token（150/300ms + cubic-bezier(0.2,0,0,1)），落地仅 skeleton-pulse 和 spin，**无任何 transition**，按钮 hover 只变 border-color。
5. **原生控件直出**：select/textarea/input/progress 浏览器默认外观 + `-webkit-progress` 伪元素补丁，无自定义滚动条。
6. **密度无分层**：EvidenceTab 7 列表、Receipts 9 列表、PlanTab 6+ Section 平铺，紧凑视图与阅读视图无区分——line-a §1.4 明确的 default/compact 两档密度策略未落地。

### 0.3 制度性根因（比 0.2 更深一层）

- **裁决梯子无美学维度**：`WAVE-PRODUCT-DESIGN-PLAN.md:253` 规定"可访问性 > 学术诚信 > 任务效率 > 品牌表达"，`PRODUCT_HCI.md` §13 明文"**好看不是验收标准**"。美学被制度性排除后，每个视觉决策在合规与密度约束下必然取最小值——这是结果不是原因。
- **验收循环无像素证据**：现有验收全是机器可查指标（WCAG 对比度数字、ARIA、token 命名、tsc/vitest），没有任何一项以真实渲染截图为准。合规 ≠ 美观，从未被检验。
- **案例研究是文字分析而非像素采集**：读了 impeccable.style/M3/HIG 的分析文章，但没有实际打开标杆产品采集真实截图校准观感——用户要求的"看大量案例"未闭环。

### 0.4 不可动的既有资产（LOCKED，本 Wave 不重议）

叙事A「科学方法操作系统」｜三声字体（IBM Plex Sans/Mono + Source Serif 4 + CJK 栈）｜OKLCH palette 单一数据源（design-palette-v1.json）｜"无彩色界面、彩色即证据"色彩哲学｜禁紫色 micro-accent｜Tauri v2 桌面｜Tier-0 依赖（tailwind/lucide/sonner）｜HCI §10 禁止清单（紫蓝渐变/发光/玻璃拟态/假终端/装饰图表/无意义动画）｜零运行时依赖红线（zod-only，web Tier-0 除外）。

---

## 1. 定界（阶段 1）

### 1.1 问题陈述

Wave-PRODUCT 交付了功能完整、工程合规的三个交互面，但最终视觉是"工程师合规美学"：小字、扁平、零动效、原生控件、无呼吸感的高密度平铺。用户裁决："太丑了。这个项目是给人看和使用的，不是给机器看的也不是一个汇报展示。" 研究基础存在（13 份文档）但转化链在四处断裂：规格冲突未消解（字号）、规格未落地（间距/动效/密度）、制度排除美学（梯子+§13）、验收无像素证据。**本 Wave 修的是转化链，不是重做研究，也不是换皮。**

### 1.2 用户价值

- 研究者用户/竞赛评审第一眼获得"专业科研仪器"的观感信任，而不是"内部后台工具"的劝退感
- 高密度科学数据与阅读舒适度并存（密度分层，不是全局放大）
- CLI 从"机器可用"升级为"人类友好"（颜色/进度/对齐，遵守诚实纪律）
- 建立"视觉验收以截图为准"的可持续机制，后续任何 UI 改动不再退化

### 1.3 范围边界

**In（逐字对齐用户命令的三层定义）**：
- Web 端视觉执行层重做：token 层（type scale/spacing scale/motion token）、App shell、侧栏、导航、表格、卡片、Tab、控件、空态/加载/错误态、暗色手动切换、滚动条、微交互与动效白名单落地
- 桌面 GUI 打磨：窗口标题栏主题、图标、暗色跟随、打包配置检查（不含签名/分发）
- CLI 交互终端美化：ANSI 色彩纪律、静态文本进度、表格对齐、可行动错误文案（零动画，遵守 clig.dev/gh a11y 纪律）
- UX 流程/操作反馈/过程可视化/状态监看/结果展示/人工干预入口的**呈现层**优化
- 产品全景层中受视觉影响的呈现：信任呈现的视觉强化（glyphs 签名）、空态文案与形态
- 制度修订：HCI 政策裁决梯子加入美学维度（提案，用户批准后生效）

**Out**：
- 后端业务逻辑/调度引擎内部（仅其状态呈现与干预入口属本 Wave）
- API 契约变更、新业务功能、数据模型
- 交付物 PDF 排版与演示视频录制（已另行安排，不在本 Wave）
- 品牌视觉身份重做、命名术语变更（已锁定）
- 新增第三方依赖除经显式 decision 裁决外一律不做
- macOS/Linux 桌面实测（无设备，保持声明级诚实边界）

### 1.4 验收标准（命令级）

| # | 标准 | 命令/证据 |
|---|---|---|
| A1 | 差距审计报告逐条对照 0.2 六根因，每条含"规格条款→落地像素→修复方案" | `research/wave-aesthetics-reports/gap-audit.md` |
| A2 | 截图基线覆盖全部页面状态（列表空/有、7 tab、暗/亮、加载/错误/离线横幅） | `evidence/W-A/baseline/*.png` + 采集命令记录 |
| A3 | 每实施 Phase 产出前后对比截图，用户视觉评审通过（human-verify 记录） | `evidence/W-A/p2..p6/` |
| A4 | craft spec v2 消解字号冲突：正文档 ≥14px（M3/HIG 依据显式引用），spacing 8px 网格、motion 档位、密度分层映射表成文 | `research/wave-aesthetics-reports/craft-spec-v2.md` |
| A5 | Web 门禁全绿不弱化 | `cd web && npm run typecheck && npm run build`（exit 0）；根 `npx vitest run` 全绿 |
| A6 | WCAG AA 对比度复验通过（重定义字号/间距后重跑 palette 对比验证） | 对比度验证脚本输出 |
| A7 | prefers-reduced-motion / 键盘焦点 / aria-live 全部保持 | TESTING.md 走查更新 + 逐项勾选记录 |
| A8 | CLI：颜色默认关（TTY+NO_COLOR+TERM=dumb+--no-color 四重检测）、非 TTY 零动画、`--json` 不变 | `far runs` / `NO_COLOR=1 far runs` / `far runs --json` / 管道 `far runs \| cat` 输出对比 |
| A9 | HCI 政策修订经用户批准并落盘；DECISIONS.jsonl 记录本 Wave 全部决策 | `.control/DECISIONS.jsonl` + `project-spec/policies/PRODUCT_HCI.md` diff |
| A10 | 收口门禁 | `node zcode-harness/scripts/completion-gate.mjs` + secret-scan + path-hygiene PASS |

### 1.5 风险清单

| 等级 | 风险 | 缓解 |
|---|---|---|
| R2 | 方向误判：重做执行层但用户实际想换美学方向 | P1 末 decision 三案裁决（见 §3.1），证据最充分时点由用户终裁 |
| R2 | 密度-美感张力：科学工具高密度是刚需，全局放密度会牺牲可用性 | 密度分层映射表（表格 compact / 阅读 default），不全局一刀切 |
| R1 | 视觉大改回归破坏 ARIA/i18n/轮询逻辑 | 每 Phase 全量门禁 A5/A6/A7；组件语义结构（tablist/role）不动只动呈现 |
| R2 | 暗色+亮色双主题翻倍工作量与不一致 | token 驱动 + 双主题截图成对采集进 A2 基线 |
| R1 | CLI 打破零运行时依赖红线 | §3.2 decision 显式裁决，默认零依赖手写 |
| R3 | 无头/实机截图环境差异（字体渲染、缩放） | 本机 Windows 实机 Playwright，固定 viewport+deviceScaleFactor |
| R2 | 大改 styles.css 引发选择器互相抵消/遗漏 | P2 前先 grep BEM 引用图（见 §4 破坏性门槛），分批落地每批截图 |

### 1.6 执行档位

**Heavy**。理由：用户核心痛点、跨 web/desktop/CLI/政策多面、视觉质量本身难以自评需要人工评审回路、且用户已两次表达不满不允许再失败一次。

---

## 2. 工件声明（工件门控）

| 工件 | 产出 Phase | 路径 |
|---|---|---|
| 本计划 | 已产出 | `.planning/PLAN.md`（canonical）+ `~/.zcode/state/plans/plan-wave-aesthetics.md` |
| 差距审计报告 | P0 | `research/wave-aesthetics-reports/gap-audit.md` |
| 截图基线集 | P0 | `evidence/W-A/baseline/` |
| 案例像素采集报告 | P1 | `research/wave-aesthetics-reports/case-pixels.md` |
| Craft Spec v2 | P1 | `research/wave-aesthetics-reports/craft-spec-v2.md` |
| 代码变更 + 每 Phase 前后截图 | P2-P6 | `web/` `src/cli/` `desktop/` + `evidence/W-A/pN/` |
| 政策修订 + 决策记录 + 走查更新 | P7 | `PRODUCT_HCI.md` / `.control/DECISIONS.jsonl` / `TESTING.md` |
| 验收清单（对照 §1.4 逐项勾选） | P7 | `evidence/W-A/acceptance.md` |

---

## 3. Phase 序列（阶段 2）

> 每任务 bite-sized：精确路径 + 验收 + 可复制验证命令。执行时主 Agent 在本节内滚动细化到任务级，不另建跟踪文件。

### P0 差距审计与截图基线

- **depends_on**: 无（批准本计划后立即）
- **must_haves**: gap-audit.md（六根因逐条：规格条款 file:line → 落地像素 file:line → 修复方案）＋ baseline 截图集（≥14 张：列表空/有 × 7 tab × 亮/暗 + 离线横幅 + 加载骨架 + 错误态）
- **任务**:
  1. `rg` 全量提取 styles.css 字号/间距/transition 实测值 → 审计表数据列
  2. Playwright 起 smoke-server（`node scripts/smoke-server.mjs`）采集基线截图（viewport 1440×900，DSF=2，亮/暗成对）
  3. 撰写 gap-audit.md（含规格冲突消解建议，供 P1 采纳）
- **estimate**: ~80k tokens / 3 任务 / 置信度 **med**
- **checkpoint**: human-verify——用户查看基线截图，确认共同事实基础（哪些页面最丑、丑在哪）

### P1 案例驱动研究 + Craft Spec v2（用户指令：直接大量采集，审美判断权归案例共识）

> **方法论铁律（用户 2026-08-22 指令）**：不信任 Agent 自身审美。craft spec 的**每一条规格必须标注出处**（抄自哪个案例/设计系统的哪个数字/哪个项目源码的哪段实现）。无出处的主观审美判断一律不进 spec。宁可抄成熟作品的成熟决策，不自己发明。

- **depends_on**: 与 P0 并行启动（研究不依赖基线）
- **must_haves**:
  - `case-pixels-web.md`：Web 标杆产品 Playwright 实机截图采集与像素级解构（Observable、Linear、Stripe、GitHub、Raycast、Vercel、Semantic Scholar/Connected Papers 等科学同类 + 登录墙如实标注改用公开页）
  - `case-cli-opensource.md`：开源 CLI/TUI 案例源码级解构——**用户点名项目必覆盖：OpenROAD、PyHessian、Hermes**（找不到/不适用须如实报告），补充高质量候选（gh、Snakemake、PyTorch Lightning、rich/textual 生态、DVC/Optuna、btop/lazygit 等）；每个案例：实际输出形态、用什么库/怎么实现（源码证据）、可抄元素
  - `case-datadense-systems.md`：数据密集界面设计系统规格数字提取（IBM Carbon、Palantir Blueprint、Elastic EUI、Ant Design 数据模式）——表格/密度/字号/行高的具体数字
  - `craft-spec-v2.md`：全部规格表，**每条带案例出处标注**（type scale 含字号冲突消解、spacing 网格、密度分层映射表、控件规格、motion 细则、滚动条/暗色切换、signature 强化）
- **任务**:
  1. 并行子任务：点名 CLI 项目源码研究（zread/WebFetch 读仓库）+ Node/TS CLI 视觉库生态调研 + 数据密集设计系统数字提取
  2. 主 Agent Playwright 实机截图采集 Web 标杆（截图工作不委托子代理）
  3. 解构共性 → 规格表（多条独立证据收敛才成规则；单一来源标注"单一出处，弱规则"）
  4. 自审：逐条检查出处标注完整性
- **estimate**: ~200k tokens / 5 任务 / 置信度 **med**
- **checkpoint**: **decision（§3.1 美学方向终裁 + §3.2 CLI 方案选型）+ human-verify（craft spec 批准 = 实施解锁 HARD-GATE）**

### P2 Web 骨架与全局层

- **depends_on**: P1 批准
- **must_haves**: styles.css token 层重定义（type scale CSS 变量、spacing scale 变量、motion token）＋ App shell/header/侧栏/tabs 呼吸感重做 ＋ 暗色手动切换（localStorage 持久化 + OS 默认跟随）＋ 自定义滚动条 ＋ 前后对比截图
- **任务**（执行时细化，预估 5 个：token 层 / shell 布局 / 侧栏 / tabs+header / 暗色切换+滚动条）
- **验证**: `cd web && npm run typecheck && npm run build`；截图对比；`npx vitest run` 全绿
- **estimate**: ~150k tokens / 5 任务 / 置信度 **med**
- **checkpoint**: human-verify（骨架截图评审，不过则迭代后再进 P3）

### P3 Web 数据呈现层

- **depends_on**: P2
- **must_haves**: 表格美学（行 hover/分隔优化/sticky header/等宽数字右对齐）＋ PlanTab/EvidenceTab/ProvenanceTab 渐进披露（密度分层映射表落地：摘要行+展开、折叠 Section）＋ HypothesisCard 强化 ＋ Evidence-line glyphs 签名放大 ＋ 空态/加载态 Placeholder Pages 化（GNOME 模式）
- **estimate**: ~180k tokens / 6 任务 / 置信度 **med**
- **checkpoint**: human-verify（数据屏截图评审）

### P4 Web 控件与微交互层（可与 P3 并行）

- **depends_on**: P2（不依赖 P3）
- **must_haves**: select/textarea/input/progress 自定义外观统一 ＋ 按钮 hover/focus/active 三态 + transition（150/300ms 档）＋ toast 体系按 KDE 分层纪律扩展 ＋ reduced-motion 全保持
- **estimate**: ~120k tokens / 4 任务 / 置信度 **med**
- **checkpoint**: human-verify（控件态截图评审）

### P5 CLI 视觉

- **depends_on**: P1 批准（与 P2-P4 并行独立）
- **must_haves**: 终端工具模块（四重关色检测：isTTY + NO_COLOR 非空 + TERM=dumb + --no-color；ANSI 16 色语义映射复用 tones 语义；静态文本进度；表格 padEnd 对齐美化）＋ 错误文案可行动化复核 ＋ `--json`/管道行为回归不变
- **决策前置**: §3.2 依赖路线裁决
- **estimate**: ~100k tokens / 4 任务 / 置信度 **med**
- **checkpoint**: human-verify（真实终端输出效果）

### P6 Desktop 壳打磨

- **depends_on**: P2（web 视觉稳定）
- **must_haves**: 窗口标题栏主题（暗色跟随页面主题）＋ 图标复核 ＋ `npm run tauri build` 配置复核（不含签名）＋ Windows 实机走查截图 ＋ README 边界诚实更新
- **estimate**: ~80k tokens / 3 任务 / 置信度 **med**

### P7 视觉回归防护 + 收口

- **depends_on**: P2-P6 全部
- **must_haves**: 截图基线入库 + 对比采集流程固化（脚本化）＋ TESTING.md 走查更新（新增视觉走查节）＋ HCI 政策修订落盘（§3.3 裁决结果）＋ DECISIONS 记录 ＋ acceptance.md 逐项勾选 ＋ completion-gate + secret-scan + path-hygiene
- **estimate**: ~60k tokens / 3 任务 / 置信度 **high**

### 3.1 高影响决策一：美学方向处置（P1 终裁）

| 案 | 内容 | tradeoff |
|---|---|---|
| **A（推荐）** | 保留 Evidence Typography 方向与全部锁定资产，做执行层 craft 重做 + 裁决梯子插入美学维度 | ✅ 根因有证据（0.2/0.3）；字体/色彩投资保留；研究基础扎实。⚠️ 若用户不满指向方向本身则不解恨 |
| B | 方向重审：重新征集 3 个美学方向案再选 | ✅ 彻底回应"太丑"。❌ 推翻已投资资产、重走研究循环；且不修制度根因，新方向执行层同样会失守再丑一次 |
| C | 混合：保留 token/字体资产，重做版式语言与布局密度策略 | ✅ 折中。⚠️ 本质是 A 的子集，边界模糊反而难验收 |

**推荐 A**，但把终裁放在 P1（案例像素采集后）：届时用户看着真实标杆案例与 spec 对比终裁，证据最充分。

### 3.2 高影响决策二：CLI 视觉实现路线（P1 研究后定案）

> 用户 2026-08-22 指令已改变前提："去抄、去借鉴、去使用"（点名 OpenROAD/PyHessian/Hermes 等开源项目）——**直接使用成熟方案已被授权**，决策从"是否引入依赖"变为"抄/用哪个成熟方案"。具体选型在 case-cli-opensource.md 证据齐后定，落 DECISIONS。

| 案 | 内容 | tradeoff |
|---|---|---|
| A | 抄视觉不引库：按成熟 CLI 案例的输出形态（颜色语义/进度样式/表格对齐）零依赖复刻 | ✅ 零依赖红线不破。⚠️ 复刻质量取决于案例解构深度 |
| B | 用成熟库组合：Node/TS 生态等价物（picocolors/cli-table3/@clack 类，视调研结果），抄点名项目的视觉方案 | ✅ 用户已授权"使用"；成熟度有保障。❌ 需 DECISIONS 记录依赖变更 |
| **推荐** | 以 P1 案例证据定：若点名项目普遍依赖成熟库（如 rich）且有 Node 等价物 → B；若其视觉可低成本复刻 → A | 避免 Agent 主观拍板，与用户方法论一致 |

### 3.3 高影响决策三：裁决梯子修订（P7 落盘，P1 一并确认）

| 案 | 内容 | tradeoff |
|---|---|---|
| **A（推荐）** | 梯子改为：可访问性 > 学术诚信 > 任务效率 ∥ 审美质量（并行硬门，每 Phase 截图评审通过才算过）> 品牌表达 | ✅ 密度刚需不牺牲；美学从"不在梯子"升为硬门。⚠️ "并行"需在 spec 里写清冲突时谁让步（密度映射表承担） |
| B | 美学提到第二位（高于任务效率） | ❌ 科学工具高密度是可用性刚需，全局放密度会伤任务效率 |
| C | 维持原梯子，本 Wave 特批美学优先 | ❌ 制度不一致，下个 Wave 又退化 |

### 3.4 Estimate 基线（供 actuals 校准，超 20% 停下重估）

| Phase | 预算 tokens | 任务数 | 置信度 |
|---|---|---|---|
| P0 | 80k | 3 | med |
| P1 | 150k | 4 | med |
| P2 | 150k | 5 | med |
| P3 | 180k | 6 | med |
| P4 | 120k | 4 | med |
| P5 | 100k | 4 | med |
| P6 | 80k | 3 | med |
| P7 | 60k | 3 | high |
| **合计** | **920k** | **32** | med（跨多会话执行，每 Phase 末同步本文件与 active-task.md） |

---

## 4. 破坏性门槛与回滚

- **styles.css 大改（>5 行删除）**：P2 动手前先 `rg -o "className=\"[^\"]+\"" web/src --glob '*.tsx' | sort -u` 建立 BEM 类引用图，重构保持类名兼容或同步改全部引用点；tones.ts 语义映射、i18n dict 文案、api/ 层**不动**。
- **政策修改（PRODUCT_HCI.md）**：属 project-spec 变更，先出 diff 提案经用户批准（§3.3），批准前不改。
- **分支策略**：新建分支 `wave/aesthetics`（版本控制已授权）；每 Phase 内小步 commit，Phase 末门禁绿才合下一 Phase；回滚 = `git revert` 或按 Phase 边界 reset（force 覆盖已授权，仅限本分支）。
- **不弱化**：任何测试/断言/ARIA/对比度不得为视觉让步；违反即返工。

---

## 5. 已排除方案（防后续会话重试）

**继承有效（Wave-PRODUCT 已否决，继续排除）**：紫蓝渐变/发光边框/玻璃拟态｜居中 hero + eyebrow pill + bento 网格｜Linear 克隆暗色 SaaS 风｜shadcn/Tailwind 默认模板直出｜3px 左侧 accent border｜Inter/Geist/Space Grotesk/Instrument Serif 字体｜HarmonyOS Sans SC（协议可撤销）｜OPPO Sans（分发冲突）｜假进度百分比｜全局"AI 可能出错"横幅｜来源陈列当信任装饰｜裸置信度百分比｜纯黑 #000 文字｜HSL 手写色值｜Electron｜引入 shadcn/MUI/AntD 组件库换皮。

**本计划新增排除**：

| 方案 | 否决理由 |
|---|---|
| 扔掉 Evidence Typography 方向从零重做 | 根因证据（0.2/0.3）指向执行与制度而非方向；不修根因换方向会再丑一次（作为 §3.1-B 保留给用户终裁，默认排除） |
| 一次性大爆炸重写 styles.css | 无中间验证点，回归面不可控；分 Phase 分批 + 每批截图 |
| 为视觉引入图表库/动画库/粒子特效 | HCI §10 禁令 + data-ink 纪律 + 零依赖红线 |
| 重做业务逻辑/API 以"配合视觉" | 范围外；三端语义对齐已验证，只动呈现层 |
| 无头容器截图替代实机截图 | 字体渲染/亚像素差异导致基线失真；必须本机实机 Playwright |
| PDF 排版与视频脚本并入本 Wave | 已另行安排（D-067-bis 交付物体系），混入会失焦 |

---

## 6. 当前状态（执行时滚动更新）

- [x] **P-PRO 主动智能层（2026-08-22 完成，用户指令"更强的主动意识和功能"，提交 7ec2eef+604d746）**：设计铁律=主动感只由真实系统信号驱动（宪法 §6 不造假）。① 首页健康状态条（真实 GET /api/v1/health 投影：db/watchdog/live 路由就绪度，fail-visible 未知态，30s 轮询——前端首次消费此 API）② RunStatusBanner 运行叙事横幅（running/queued 实时叙述[阶段+N/M+时长+距上次更新秒数+pulse]、冻结租约恢复建议、配额感知恢复建议+内联按钮、完成下一步引导——全部真实 run 状态派生）③ 首页"继续最近的研究"任务卡（3 张最新，点击进入）④ 锦标赛 win-rate 排名条（比例墨水：宽度=真实胜率零基线线性映射；BT 分数非 0-1 比率不画条防误导）。实测：健康条"2/3 路由就绪"、配额横幅+恢复按钮、3 卡、7 排名条。running 分支当时无活跃实例未截图（与实测分支同构，如实记录）
- [x] **P-IA 首启体验与信息架构重做（2026-08-22 完成，用户裁决"设计思路不对，重新做"后的最高优先级）**：Logo（证据四象限 mark=产品语义签名）＋ WelcomeView 工作台首页（品牌 hero + 中心创建卡片[大输入+折叠高级+主按钮] + 三步引导 + 诚实脚注，IDE 范式"身份-行动-指引"）＋ 侧栏任务分组（进行中/需注意/已完成，真 fallback）＋"新建研究"主按钮回家 ＋ useCreateRun hook（逻辑原样提取）。实测修复分组重复 bug（144→72）。视觉复评："主行动入口成为第一视觉锚点，基本达到可用产品首页水准"
- [x] P0 差距审计与截图基线（gap-audit.md G1-G10 + 12 张基线）
- [x] P1 案例驱动研究 + craft-spec-v2（spec §9 已按 opencode+claude code 升级为终端 agent 范式）
- [x] P2 Web 骨架层（41339c6）｜ [x] P3 数据呈现层（bbf1b7f）｜ [x] P4 控件层（f2396ed）｜ final 截图（3aa6605）
- [ ] P5 CLI 视觉 — spec §9 已定案（终端 agent 范式）；**缓行：并行会话正在改 src/cli（D-069 jsonOutput 修复已提交 5cebe30）+ 工作区有其未提交变更，避免撞车，待其落地后动工**
- [ ] P6 Desktop 壳打磨 — 同因缓行（并行会话刚提交 D-068 Linux 验证）
- [ ] P7 回归防护 + TESTING.md + 政策修订 + completion-gate — 缓行（DECISIONS.jsonl 正被并行会话写入）

**状态（2026-08-22 收口）：Web 三层（P2/P3/P4）全部完成、提交并经视觉复评（"从原型稿升级为产品级"，字体层级 8.5/10）。P5/P6/P7 因并行会话在同一仓库活跃推进 CLI/desktop/DECISIONS 而暂缓，避免双写冲突。测试红澄清：tests/glm-anthropic-provider.test.ts 失败源于并行会话未提交的 eval/glm-anthropic-provider.mjs 删除，与本 Wave 无关（排除后 610/610 绿）。**

**状态：P1 研究完成，craft-spec-v2 待用户批准（HARD-GATE），未进入实施。**
