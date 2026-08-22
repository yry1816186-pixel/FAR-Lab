# Wave-PRODUCT 线 B1：Web 组件体系复用 vs 自建 — 证据核验报告

- 日期：2026-08-22（所有版本/日期为当日实查值，UTC）
- 数据源：npm registry（`https://registry.npmjs.org/<pkg>` 直查 JSON）、GitHub API（`https://api.github.com/repos/<repo>`）、GitHub raw（LICENSE/README/package.json 原文）、ui.shadcn.com 官方文档（WebFetch）
- 上下文：`web/` 为 React 18 + Vite SPA，全部手写组件（styles.css 563 行），前端依赖不受「Node 核心包零依赖」不变量约束，但须过三重门（License 兼容 / 供应链安全 / 维护活跃）
- 核验方法说明：GitHub raw 直连偶发 ECONNRESET，均已改经 api.github.com（base64 contents）复核；无任何版本号取自记忆

## 一、总表

三重门 = License 兼容 / 供应链安全 / 维护活跃。结论取值：ADOPT（直接采用）| ADAPT（改造后采用）| REJECT（拒绝）| DEFER（暂缓）。

| # | 包 / 项目 | 最新版本 | 发布日期 | License | 维护活跃度（最近 npm 发布 / 仓库 push / stars） | 适用性 | 结论 |
|---|---|---|---|---|---|---|---|
| 1 | shadcn/ui（CLI 拷贝模式，非 npm 依赖） | —（registry 随仓库） | — | MIT（LICENSE.md 实查） | / 2026-08-21 / 121.8k | 高：组件源码进项目、可改可审，无运行时黑盒 | ADOPT |
| 2 | @radix-ui/*（primitives） | react-dialog 1.1.23 等五包 | 2026-07-24 | MIT | 2026-07-24 / 2026-08-08 / 19.2k | 高：无样式可访问性原语，shadcn 底层 | ADOPT |
| 2b | radix-ui（统一包） | 1.6.7 | 2026-07-24 | MIT | 同上 | 高：单包引入全部原语 | ADOPT |
| 3 | tailwindcss | 4.3.3 | 2026-07-16 | MIT | 2026-07-16（registry modified 2026-08-14）/ 2026-08-14 / 97.3k | 高：v4 稳定（Oxide 引擎，CSS-first 配置），`@tailwindcss/vite` 4.3.3 原生支持 Vite | ADOPT |
| 4a | @tanstack/react-query | 5.101.4 | 2026-07-21 | MIT | 2026-07-21 / 2026-08-22 / 50.2k | 高：服务端状态/缓存/重试，peer `^18 \|\|^19` 匹配 React 18 | ADOPT |
| 4b | @tanstack/react-table | 9.1.2 | 2026-08-09 | MIT | 2026-08-09 / 2026-08-21 / 28.4k | 高：表头分组/排序/虚拟化协作；注意 v9 为新大版本 | ADOPT |
| 5 | motion（原 Framer Motion） | 13.1.1 | 2026-08-20 | MIT | 2026-08-20 / 2026-08-20 / 33.3k | 高：更名已坐实（见详注），peer `^18 \|\|^19` | ADOPT |
| 6a | recharts | 3.10.1 | 2026-07-25 | MIT | 2026-07-25 / 2026-08-21 / 27.5k | 高：声明式快速出图，React 组合式 | ADOPT |
| 6b | @visx/*（Airbnb） | 4.0.0（visx/scale/axis/group/shape 同批） | 2026-06-11 | MIT | 2026-06-11 / 2026-06-22 / 21.0k | 中：D3 原语+React 封装，深度定制用；peer `^18 \|\|^19` | ADAPT（按需子包） |
| 7 | @xyflow/react（React Flow） | 12.11.3 | 2026-08-12 | MIT | 2026-08-12 / 2026-08-21 / 38.1k | 高：假设图谱/研究计划流程图节点编辑器，peer `>=17` | ADOPT |
| 8 | @dnd-kit/core（+sortable） | 6.3.1（sortable 10.0.0） | **2024-12-05** ⚠️ | MIT | **npm 停发 ~20 个月** / 2026-07-13 / 17.6k | 中：能力合适但发布停滞 | DEFER |
| 9 | cmdk | 1.1.1 | **2025-03-14** ⚠️ | MIT | **npm 停发 ~17 个月** / 2025-10-29 / 12.9k | 中高：⌘K 命令面板（shadcn 依赖它）；范围小、API 稳定 | ADOPT（锁版本，经 shadcn 引入） |
| 10 | sonner | 2.0.8 | 2026-08-09 | MIT | 2026-08-09 / 2026-08-10 / 12.9k | 高：toast 通知，peer `^18 \|\|^19` | ADOPT |
| 11 | lucide-react | 1.33.0 | 2026-08-19 | ISC（LICENSE 原文实查） | 2026-08-19 / 2026-08-20 / 24.1k | 高：1500+ 图标按需 tree-shake，peer 覆盖 ^16.5–^19 | ADOPT |
| 12a | @docusaurus/core（v3） | 3.10.2 | 2026-07-10 | MIT | 2026-07-10 / 2026-08-21 / 66.0k | 高：文档站 + 内置 Mermaid 主题包；⚠️ npm 包 `docusaurus` 是 v1 遗留勿装 | ADOPT |
| 12b | @astrojs/starlight | 0.41.7 | 2026-08-05 | MIT | 2026-08-05 / 2026-08-22 / 9.1k | 中高：内容型文档极优，仍 0.x | ADAPT（备选） |
| 12c | mermaid | 11.17.0 | 2026-08-19 | MIT | 2026-08-19 / 2026-08-21 / 89.9k | 高：流程图渲染（研究计划/证据链图示） | ADOPT |
| 12d | textlint | 15.8.0 | 2026-08-01 | MIT | 2026-08-01 / 2026-08-21 / 3.2k | 高：可插拔文本 lint 本体活跃 | ADOPT |
| 12e | textlint-rule-zh-*（darkyzhou 系列） | 0.0.3 | **2021-06-21** ⚠️ | MIT | **停滞 ~5 年** | 低：中文专用规则生态薄弱 | REJECT（改用 prh 自写） |
| 12f | textlint-rule-prh | 6.1.0 | registry 实查 | MIT | 在 textlint-rule org 维护 | 中高：YAML 词典规则，可承载中文文案规则 | ADOPT（配自写规则） |
| 12g | sparanoid/chinese-copywriting-guidelines | 非 npm（文档仓库） | — | **MIT（声称的 CC BY 4.0 未获证实，见详注）** | / 2026-07-07 / 15.6k | 高：作为中文文案规则蓝本（学规则，不抄文本） | ADOPT（蓝本） |
| 附 | zhlint（中文专用 linter 备选） | 0.8.2 | 2024-08-20 | MIT | 发布停约 1 年 | 中 | DEFER |

**红牌（AGPL/SSPL/CC-BY-NC 等强传染或非商业 License）：无。全部核验项为 MIT 或 ISC（lucide），二者对商用与闭源均无约束。**

## 二、分项详注

### 1. shadcn/ui — 代码分发平台，非组件库

- 机制（ui.shadcn.com/docs 原文）："This is not a component library. It is how you build your component library."；"shadcn/ui hands you the actual component code."——CLI（`shadcn add <component>`）把组件 TSX 源码拷贝进用户项目，归用户所有、可任意改。官方定位 "a code distribution platform"。
- License：仓库 `LICENSE.md` 原文实查 = **MIT**（Copyright (c) 2023 shadcn）。拷贝源码进 FAR-Lab 仓库完全合规（保留版权行即可）。
- 底层证据（`apps/v4/package.json` 实查 deps）：`radix-ui`（统一包）、`@base-ui/react`、`@tailwindcss/postcss`、`cmdk`、`sonner`、`lucide-react`、`motion`、`tailwind-merge`。"组件源自 Radix" 对既有 registry 成立；新 v4 registry 已是 **radix-ui + Base UI 双轨**（Base UI 为 Radix 团队成员新启的无样式原语项目）。
- 活跃度：121.8k stars（同类最高），仓库 2026-08-21 仍在推送。2302 个 open issues 反映用户量大而非风险。
- 三重门：MIT ✓ / 源码进库可审计、无运行时供应链黑盒 ✓ / 极活跃 ✓。**ADOPT**。
- 来源：https://ui.shadcn.com/docs ；https://github.com/shadcn-ui/ui （LICENSE.md 经 api.github.com 读取原文）

### 2. @radix-ui/* primitives（含统一包 radix-ui）

- 实查：`radix-ui` 1.6.7、`@radix-ui/react-dialog` 1.1.23、`react-dropdown-menu` 2.1.24、`react-popover` 1.1.23、`react-tabs` 1.1.21，全部 **2026-07-24 同批发布**，License 全部 MIT，仓库 radix-ui/primitives（19.2k stars，push 2026-08-08）。
- 能力：无样式、可访问性（WAI-ARIA）完备的交互原语（Dialog/Dropdown/Popover/Tabs/Tooltip/Select 等），shadcn 与大量设计系统的底层。
- 适用性：正好补 FAR-Lab 手写组件最缺的「交互正确性」（焦点陷阱、Esc 关闭、aria 属性）。可用统一包 `radix-ui` 简化依赖管理。
- 三重门全绿。**ADOPT**。来源：https://registry.npmjs.org/radix-ui ；https://api.github.com/repos/radix-ui/primitives

### 3. tailwindcss（v4 稳定状态）

- 实查：`tailwindcss` 4.3.3（2026-07-16）、`@tailwindcss/vite` 4.3.3（同日）。registry modified 2026-08-14（有 4.x 线内更新节奏）。MIT。
- v4 状态：v4 于 2025-01 进入稳定，当前 4.3.x 为成熟线；CSS-first 配置（`@theme`），Oxide 引擎，Vite 插件为一等公民（无需 PostCSS）。
- 适用性：web/ 563 行手写 CSS 的规模化替代；原子类 + design tokens 与 FAR-Lab 后续视觉规范天然对接。注意 v4 与 v3 生态教程差异大，团队学习面。
- 三重门全绿（Tailwind Labs 商业支持，97.3k stars）。**ADOPT**。来源：https://registry.npmjs.org/tailwindcss

### 4. @tanstack/react-query 与 @tanstack/react-table

- react-query 5.101.4（2026-07-21，MIT，TanStack/query 50.2k stars，push 2026-08-22=今日仍在动）。peer `react ^18 || ^19` 与 React 18 精确匹配。FAR-Lab 前端与模型调用/工作流 API 的服务端状态层（缓存、失效、重试、并发去重）事实标准；query/headless 无 UI 绑定，符合「确定性关注点进确定性代码」。
- react-table 9.1.2（2026-08-09，MIT，28.4k stars）。headless 表格（排序/过滤/分组/列钉住/行选择），配 Tailwind 自绘。**注意 v9 为较新 major**（v8 长期主流），采用时以 v9 文档为准。
- 三重门全绿。均 **ADOPT**。来源：https://registry.npmjs.org/@tanstack/react-query ；https://registry.npmjs.org/@tanstack/react-table

### 5. motion（原 Framer Motion）— 更名已坐实

- 实查：`motion` 13.1.1（2026-08-20T10:57:12Z）与 `framer-motion` 13.1.1（2026-08-20T10:57:10Z）**同日同版本号、同一仓库 URL（motiondivision/motion）**——framer-motion 现为 motion 的兼容别名/过渡包，新项目应直接用 `motion`（`import { motion } from "motion/react"`）。
- 仓库 motiondivision/motion：33.3k stars，push 2026-08-20（发布当日仍在推送）。MIT。peer `^18 || ^19`。
- 注意：旧路径 `motion-dev/motion` 已 404（组织已更名 motiondivision）。
- 三重门全绿。**ADOPT（用 `motion` 包名）**。来源：https://registry.npmjs.org/motion ；https://registry.npmjs.org/framer-motion ；https://api.github.com/repos/motiondivision/motion

### 6. recharts 与 @visx/*

- recharts 3.10.1（2026-07-25，MIT，27.5k stars，push 2026-08-21）。声明式 React 图表（线/柱/面/饼/雷达），v3 大版本线（2025 年中起）活跃维护。peer 覆盖 ^16.8–^19。适合 FAR-Lab 证据强度分布、不确定性、时间线等标准统计图的快速交付。
- @visx/* 4.0.0（`@visx/visx` meta 包与 scale/axis/group/shape 子包同批 2026-06-11，MIT，airbnb/visx 21.0k stars，push 2026-06-22）。peer `^18 || ^19`。D3 原语的 React 封装，自由度高、上手成本高。**License 澄清：GitHub API 与 npm 双源均为 MIT**（其 d3 传递依赖为 BSD-3-Clause/ISC 等宽松协议）。
- 决策：默认 recharts 出图；仅当出现高度定制（如证据图谱叠加可视化）再引入 visx 子包。recharts **ADOPT**，visx **ADAPT（按需）**。来源：https://registry.npmjs.org/recharts ；https://registry.npmjs.org/@visx/visx

### 7. @xyflow/react（React Flow 12）

- 实查：12.11.3（2026-08-12，MIT，xyflow/xyflow 38.1k stars，push 2026-08-21）。peer `react >=17`。
- 能力：节点/边画布、拖拽、缩放、小地图、自定义节点渲染——FAR-Lab 核心域对象（假设树、证据-主张图、研究计划 DAG）的最佳现成渲染基座。OSS 版 MIT 无功能阉割（Pro 仅是托管服务）。
- 三重门全绿。**ADOPT**。来源：https://registry.npmjs.org/@xyflow/react

### 8. dnd-kit（@dnd-kit/core）— 维护性黄牌

- 实查：`@dnd-kit/core` 6.3.1（**2024-12-05**，此后 npm 无新发布，距今约 20 个月）；`@dnd-kit/sortable` 10.0.0（2024-12-04）。MIT。仓库 clauderic/dnd-kit（17.6k stars，push 2026-07-13——有零星维护但未发版）。peer `react >=16.8`（React 18 可用）。
- 能力本身优秀（无依赖、可访问性、传感器抽象），但 npm 发布停滞是供应链/演进风险信号；React 后续大版本适配节奏不可预期。
- 结论：**DEFER**。FAR-Lab 首批交互（排序、看板）需求出现时再在「锁定 6.3.1 使用」与「Atlassian pragmatic-drag-and-drop」间做一次专项决策；不建议现在进基座。来源：https://registry.npmjs.org/@dnd-kit/core ；https://api.github.com/repos/clauderic/dnd-kit

### 9. cmdk

- 实查：1.1.1（**2025-03-14** 最后 npm 发布，距今约 17 个月；仓库 push 2025-10-29）。MIT。peer `^18 || ^19`。
- 能力：⌘K 命令面板（搜索+分组+嵌套），shadcn 的 Command 组件即基于它。包小、API 稳定、无依赖激进变化，停更风险可控。
- 结论：**ADOPT（锁 1.1.1，随 shadcn 引入；升级前看仓库恢复情况）**。对 AI 工作台的全局命令入口是高杠杆小件。来源：https://registry.npmjs.org/cmdk

### 10. sonner

- 实查：2.0.8（2026-08-09，MIT，emilkowalski/sonner 12.9k stars，push 2026-08-10）。peer `^18 || ^19`。
- 能力：toast/通知（堆叠、promise 态、自定义），为 shadcn 默认 toast 方案，与长任务（模型调用/工作流）的失败-重试-部分成功 UX 直接对应（工作区宪法第 6 条要求 failure/cancel/retry 为产品行为）。
- 三重门全绿。**ADOPT**。来源：https://registry.npmjs.org/sonner

### 11. lucide-react

- 实查：1.33.0（2026-08-19，**ISC**）。注意：GitHub API 对 lucide-icons/lucide 的 spdx 判为 NOASSERTION，但 raw `LICENSE` 原文实查 = **ISC License**（Copyright (c) 2026 Lucide Icons and Contributors），与 npm package.json 声明一致——ISC 与 MIT 同级宽松，无风险。24.1k stars，push 2026-08-20。
- 能力：1500+ 图标按需导入、tree-shakable，shadcn 默认图标库。peer `^16.5.1 || ^17 || ^18 || ^19`。
- 三重门全绿。**ADOPT**。来源：https://registry.npmjs.org/lucide-react ；https://raw.githubusercontent.com/lucide-icons/lucide/main/LICENSE

### 12. 文档站与文风工具

**12a. docusaurus（v3 现状）**
- ⚠️ 陷阱：npm 包 `docusaurus` 停在 **1.14.7（2021-03-09）**，那是 v1 遗留包，勿装。现行版本为 `@docusaurus/core` **3.10.2**（2026-07-10，与 preset-classic、**theme-mermaid** 同批同版），MIT，facebook/docusaurus 66.0k stars，push 2026-08-21，极活跃。
- v3 现状：成熟稳定线（MDX3、Rspack 支持），且官方 `@docusaurus/theme-mermaid` 原生集成 Mermaid——研究计划/证据链图示与文档同源。
- 三重门全绿。**ADOPT（@docusaurus/core 3.x，禁用 v1 包名）**。来源：https://registry.npmjs.org/@docusaurus/core

**12b. @astrojs/starlight**
- 实查：0.41.7（2026-08-05，MIT，withastro/starlight 9.1k stars，push 2026-08-22=今日）。基于 Astro（MIT）的内容型文档框架，性能与阅读体验优。
- 仍为 0.x（承诺遵守 semver，但生态位小于 Docusaurus）；FAR-Lab 若文档站以「内容阅读」为主可作轻量替代。**ADAPT（备选）**。来源：https://registry.npmjs.org/@astrojs/starlight

**12c. mermaid**
- 实查：11.17.0（2026-08-19，MIT，89.9k stars，push 2026-08-21）。流程图/时序图/甘特图文本渲染，配合 Docusaurus theme-mermaid 或 web/ 内嵌（研究计划 DAG 的只读渲染轻量方案，交互编辑仍归 @xyflow/react）。
- 三重门全绿。**ADOPT**。来源：https://registry.npmjs.org/mermaid

**12d. textlint 与中文规则**
- 本体：textlint 15.8.0（2026-08-01，MIT，仓库 push 2026-08-21，活跃）。**ADOPT**。
- 中文专用规则现状（registry search 实查）：darkyzhou/textlint-rule-preset-zh-technical-writing 系列是唯一的中文规则族，但 `textlint-rule-zh-core`、`zh-space-between-zh-and-en-or-num`、`zh-no-redundant-punctuation`、`textlint-util-zh` 全部停在 **0.0.3 / 2021-06-21**，停滞约 5 年——**REJECT（不可依赖）**。
- 可行路径：`textlint-rule-prh` 6.1.0（MIT，textlint-rule org 维护）+ 自写 prh YAML 词典实现中文文案规则（中英文空格、标点全半角等）；辅以语言中立规则（no-unmatched-pair、sentence-length、max-comma、no-zero-width-spaces，均 MIT）。备选专用工具 `zhlint` 0.8.2（2024-08-20，MIT，发布亦近 1 年停滞）→ DEFER。
- 来源：https://registry.npmjs.org/textlint ；registry search API `?text=textlint-rule zh`

**12g. sparanoid/chinese-copywriting-guidelines — CC BY 4.0 声称核验：未获证实**
- 声称「License=CC BY 4.0」与当前仓库事实**不符**：
  - 根目录 `LICENSE` 文件原文（raw 实查 HTTP 200）= **MIT License, Copyright (c) 2023 Sparanoid, Inc.**；
  - GitHub API `license.spdx_id` = MIT；
  - 三语 README（README.md 繁中 / README.zh-Hans.md / README.en.md）全文检索 **无任何 CC BY / 許可 / License 段落**（"CC" 关键字索引 = -1）；2014-03-17 初始提交的 README（94 字节 stub）亦无。
  - 官网 sparanoid.com/chinese-copywriting-guidelines/ 当前 404（历史 CC 声明可能存在于旧版页面，UNVERIFIED）。
- 使用结论：按当前仓库证据（MIT）采用；正确用法是**作为规则蓝本把规则写进自家 prh YAML / lint 配置**（学规则不抄文本），则无论 MIT 还是 CC BY 4.0 均无风险；若逐字复制其文案文本，按 MIT + 保留版权行处理，并在 PR 里注明证据快照（License 判定随仓库状态可变）。
- 活跃度：15.6k stars，push 2026-07-07。**ADOPT（蓝本）**。来源：https://api.github.com/repos/sparanoid/chinese-copywriting-guidelines

## 三、三重门汇总

- **红牌：0 个。** 无 AGPL/SSPL/Elastic/CC-BY-NC 或任何传染性/非商业 License；全部为 MIT（lucide 为等价宽松的 ISC）。
- **黄牌（维护活跃度）：**
  1. @dnd-kit/core — npm 停发 ~20 个月 → DEFER；
  2. cmdk — npm 停发 ~17 个月，但包小且为 shadcn 依赖 → 锁版本 ADOPT；
  3. textlint-rule-zh-* — 停滞 ~5 年 → REJECT，改 prh 自写；
  4. zhlint — 停发 ~1 年 → DEFER。
- 供应链：所有采用项均为 registry 直查的官方发布（无第三方 fork 包）；shadcn 为源码拷贝，无运行时依赖锁定问题。

## 四、推荐的 FAR-Lab Web 组件基座组合

**主推组合（shadcn 路线，全部 ADOPT 项）：**

| 层 | 选型 | 理由 |
|---|---|---|
| 样式 | tailwindcss 4.3.x + @tailwindcss/vite | 替换 563 行手写 CSS；design tokens；Vite 一等支持 |
| 组件 | shadcn/ui（CLI 拷贝；底层 radix-ui 1.6.7 / @base-ui/react） | 源码可审计可改——契合「确定性关注点进确定性代码」与证据纪律；拷贝即 MIT 合规 |
| 服务端状态 | @tanstack/react-query 5.x | 模型调用/工作流 API 的缓存、重试、失效、乐观更新 |
| 表格 | @tanstack/react-table 9.x（headless） | 假设排序/证据对比/文献表；配 Tailwind 自绘 |
| 图表 | recharts 3.x（标准图）+ mermaid 11.x（只读流程图） | 快速出图；文档与 web 共用 Mermaid 语法 |
| 图编辑 | @xyflow/react 12.x | 假设树/证据-主张图/研究计划 DAG 的交互画布 |
| 动效/反馈 | motion 13.x + sonner 2.x + cmdk 1.1.x（锁版）+ lucide-react 1.x | 长任务失败-重试 UX（sonner）、全局命令入口（cmdk）、图标 |
| 文档站 | @docusaurus/core 3.10.x + @docusaurus/theme-mermaid | 活跃、MIT、原生 Mermaid；勿装 v1 遗留包 `docusaurus` |
| 文风 | textlint 15.x + textlint-rule-prh + 自写中文词典（蓝本：chinese-copywriting-guidelines，MIT） | 中文规则生态弱，自写词典最稳 |

组合内在一致性：shadcn 官方栈本身就是 radix + tailwind + cmdk + sonner + lucide + motion + tailwind-merge（apps/v4/package.json 实查），采用主推组合等于与上游同构，升级摩擦最小。

**替代组合：**
1. 轻文档路线：文档站换 @astrojs/starlight（0.41.x）——内容阅读体验更好、构建更快；代价是 0.x 与较小生态。适用场景：FAR-Lab 文档以「研究报告阅读」为主时。
2. 深定制可视化路线：图表层换/加 @visx 4.0 子包（scale/axis/shape）——当证据图谱需要 recharts 表达不了的定制视觉时按需引入，不进初始基座。
3. 拖拽需求出现时的专项决策：@dnd-kit 6.3.1（锁版、MIT、能力成熟）vs Atlassian pragmatic-drag-and-drop——届时以「React 19+ 适配与发布恢复证据」为准再定，本期 DEFER。
4. 不推荐「Radix 直用 + 继续 CSS Modules」路线：可访问性收益被样式成本吃掉，且放弃了 shadcn 的分发与升级通道。

## 五、证据与限制

- 版本/日期/License：均来自 registry.npmjs.org JSON（dist-tags.latest + time[latest] + versions[].license）与 api.github.com / raw.githubusercontent.com 原文，2026-08-22 采集；GitHub raw 偶发 ECONNRESET 已通过重试与 api.github.com base64 通道复核。
- UNVERIFIED 项：chinese-copywriting-guidelines 历史上是否存在过 CC BY 4.0 页面声明（当前仓库无、官网 404）；Starlight 所属 Astro 框架自身版本未单独核验（License=MIT 已核验）。
- 本报告未改动仓库任何现有文件；唯一产出为本文件。
