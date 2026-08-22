# 数据密集型界面设计系统规格调研：Carbon / Blueprint / EUI / Ant Design

- 日期：2026-08-22
- 目的：为 FAR-Lab（高密度证据表格 + 假设卡片 + 研究计划文档视图）提取四家企业级设计系统的**像素级规格数字**
- 方法：优先抓官方 GitHub 仓库 token 源文件（SCSS/TS），每个数字标注来源；文档站（carbondesignsystem.com / ant.design）JS 渲染抓取失败，全部改走仓库源码
- 状态标注：`已核验` = 直接读自源码原文；`推导` = 由已核验公式/常量确定性计算；`UNVERIFIED` = 未能核验

---

## 1. IBM Carbon（v11，仓库 master 分支）

### 1.1 Data Table 行高密度阶梯（5 档）

来源：`carbon-design-system/carbon` 仓库 `packages/styles/scss/components/data-table/_data-table.scss`

| size 修饰类 | 行高（thead tr / tbody tr） | 单元格 padding-block | 核验 |
|---|---|---|---|
| `--xs` | 24px | 2px / 2px | 已核验（`block-size: convert.to-rem(24px)`） |
| `--sm` | 32px | 7px / 6px | 已核验 |
| `--md` | 40px | 7px / 6px | 已核验 |
| 默认（无修饰类，React `size="lg"`） | 48px（`block-size: $spacing-09` = 3rem） | — | 48px 已核验；"lg=默认"对应关系为 UNVERIFIED（SCSS 无 `--lg` 类，React 端映射未读） |
| `--xl` | 64px | 16px / 16px（$spacing-05） | 已核验 |

- 单元格 padding-inline：`$spacing-05` = 16px（已核验，同文件 + spacing 表）
- 复选框列宽 32px（`convert.to-rem(32px)`）、展开列 32px（xs 24 / sm 32 / md 40 / xl 64），已核验
- 密度 token 即 spacing 阶梯：`$spacing-01..13` = 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 160px
  来源：`packages/layout/scss/_spacing.scss` 转发 + 发布包 `@carbon/layout/scss/generated/_spacing.scss`（jsdelivr，0.125rem…10rem）

### 1.2 表头 / 正文 / 斑马纹 / 分隔线规则

来源：同 `_data-table.scss`

- 表头（thead）：type-style **heading-compact-01**（=14px / 600 / line-height 1.28572≈18px），背景 `$layer-accent`，th padding-inline 16px
- 表体（tbody）：type-style **body-compact-01**（=14px / 400 / lh 1.28572≈18px），文字色 `$text-secondary`
- 分隔线：每行 td 底边框 **1px solid `$border-subtle-01`**（分层处用 border-subtle-02/03）；行 hover 时上下边框变 `$layer-hover` + 背景 `$layer-hover`
- 斑马纹（可选 `--zebra`）：**偶数行**背景 `$layer-accent` + 上下 1px 边框；奇数行底边框 1px `$layer`
- 选中行：背景 `$layer-selected`，底边框 `$layer-active`；表格标题 heading-03（20px），描述 body-compact-01，描述最大宽度 md 断点 50ch / lg 断点 80ch（已核验）

### 1.3 Type scale 全表（v11 token）

来源：`packages/type/src/styles.js`（token 值）+ `packages/type/src/scale.js`（字号阶梯数组）+ `packages/type/src/fontWeight.js`（300/400/600）
字号阶梯（px）：`12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 54, 60, 68, 76, 84, 92, 102, 112, 122, 132, 144, 156`

| Token | 字号 | line-height（比值→px） | 字重 | 备注 |
|---|---|---|---|---|
| legal-01 / caption-01 / label-01 / code-01 | 12px | 1.33333 → 16px | 400 | 字距 0.32px；code 用 mono |
| legal-02 / caption-02 / label-02 / code-02 | 14px | 1.28572 → 18px | 400 | 字距 0.16-0.32px |
| **body-compact-01**（=body-short-01） | **14px** | **1.28572 → 18px** | 400 | **表格/紧凑正文**，字距 0.16px |
| body-compact-02（=body-short-02） | 16px | 1.375 → 22px | 400 | |
| body-01（=body-long-01） | 14px | 1.42857 → 20px | 400 | 阅读正文 |
| body-02（=body-long-02） | 16px | 1.5 → 24px | 400 | 长文阅读 |
| **heading-compact-01**（=productive-heading-01） | **14px** | **1.28572 → 18px** | **600** | **表头** |
| heading-compact-02 | 16px | 1.375 → 22px | 600 | |
| heading-01 | 14px | 1.42857 → 20px | 600 | |
| heading-02 | 16px | 1.5 → 24px | 600 | |
| heading-03 | 20px | 1.4 → 28px | 400 | 表格区块标题 |
| heading-04 | 28px | 1.28572 → 36px | 400 | |
| heading-05 | 32px | 1.25 → 40px | 400 | |
| heading-06 | 42px | 1.199 | 300 | |
| heading-07 | 54px | 1.199 | 300 | |

（expressive/fluid 系列为响应式断点字号，数据密集场景不用，略；全部已核验）

---

## 2. Palantir Blueprint（v6，前缀 bp6，仓库 master）

### 2.1 表格密度

**HTMLTable（静态表）** 来源：`palantir/blueprint` 仓库 `packages/core/src/components/html-table/_html-table.scss` + `packages/core/src/common/_mixins.scss`（`centered-text` 公式：`floor((行高 − floor(14 × 1.28581)) / 2)` = `floor((行高 − 18) / 2)`）

| 档 | 行高 | 单元格 padding | 推导 |
|---|---|---|---|
| 默认 | `$pt-spacing × 10` = **40px** | **11px**（四边） | 已核验（公式确定） |
| `.bp6-compact` | `$pt-spacing × 7.5` = **30px** | 上下 **6px**，左右 11px | 已核验 |

- 字号 `$pt-font-size` = 14px；th 字重 600、色 `$pt-heading-color`；td 色 `$pt-text-color`；行内文字行高 ≈18px（`$pt-line-height: 1.28581`，注释明言凑成 18px）
- 分隔线：`tbody tr:first-child td` 起 inset box-shadow **1px** `$pt-divider-black`；斑马纹可选：奇数行 `rgba($gray3, 0.15)`；interactive 行 hover `rgba($gray3, 0.3)` / active 0.35

**Table（虚拟化大数据表）** 来源：`packages/table/src/table.tsx` defaultProps（raw 源码读取）

| 常量 | 值 |
|---|---|
| `defaultRowHeight` | **20px** |
| `minRowHeight` | **20px** |
| `maxRowHeight` | 9999 |
| `defaultColumnWidth` | **150px** |
| `minColumnWidth` | 50px |

（即 Blueprint 证据表格场景默认 20px 行；加载占位 ghost cell 20×150px，来源 `packages/table/src/common/grid.ts`）

### 2.2 字号与基础尺寸体系

来源：`packages/core/src/common/_variables.scss`

| Token | 值 |
|---|---|
| `$pt-spacing`（新间距基数） | **4px**（legacy 10px grid） |
| `$pt-font-size` | **14px**（= 4 × 3.5） |
| `$pt-font-size-large` | 16px |
| `$pt-font-size-small` | 12px |
| `$pt-line-height` | 1.28581（≈18px @14px） |
| 阅读文本行高（`running-typography`） | 1.5（≈21px @14px），来源 `_mixins.scss` |
| 图标 | 16px / 20px 两档 |
| 按钮/输入框高 | 30px（standard）/ 24px（small）/ 20px（smaller）/ 40px（large）；输入框 30/24/40 |
| 导航栏高 | 50px（4 × 12.5） |

### 2.3 中性色阶数量

来源：`packages/colors/src/_colors.scss`：**17 档** = `$black #111418` + dark-gray1-5 + gray1-5 + light-gray1-5 + `$white`；每个彩色色相各 5 档（blue1-5 等）。已核验。

---

## 3. Elastic EUI（Kibana，仓库 master，Borealis 主题）

### 3.1 基础尺度

来源：`packages/eui-theme-common/src/global_styling/variables/size.ts`（类型注释给出默认值）+ `packages/eui-theme-borealis/src/variables/_typography.ts`

**size 尺度（px）**：xxs 2 / xs 4 / s 8 / m 12 / base 16 / l 24 / xl 32 / xxl 40 / xxxl 48 / xxxxl 64（已核验）

**font scale（ratio → px @base16）**：xxxs 0.5625→9 / xxs 0.6875→11 / xs 0.75→**12** / s 0.875→**14** / m 1→16 / l 1.25→20 / xl 1.5→24 / xxl 1.875→30（已核验，"loosely Major Third 1.200"）
**字重**：300 / 400 / 450(medium) / 500(semiBold) / 600(bold)；**正文默认 scale `s` = 14px / 400**；baseline = base/4 = 4px；lineHeightMultiplier = 1.5（已核验）

行高公式（`packages/eui/src/global_styling/functions/typography.ts`，已核验）：`floor(round(字号 × 1.5) / 4) × 4`（字号 ≤ 16px 时乘 1.5）→ 12px 字 → 16px 行高；14px 字 → 20px；16px 字 → 24px

### 3.2 EuiTable（基础表格）密度

来源：`packages/eui/src/components/table/table.styles.ts` + `table_cells_shared.styles.ts`

| 档 | 字号 | 行高 | 单元格内容 padding | 整行高（推导） |
|---|---|---|---|---|
| 默认（uncompressed） | euiFontSize `s` = **14px** | 取 `m` 档行高 = 24px | `size.s` = **8px** | ≈ 24 + 2×8 = **40px** |
| compressed | euiFontSize `xs` = **12px** | 16px | `size.xs` = **4px** | ≈ 16 + 2×4 = **24px** |

表头单元格：字号 `xs`（12px）+ 字重 semiBold（**500**）+ 色 textHeading；数字列开启 tabular numbers（`font-feature-settings: 'tnum' 1`，DataGrid 同样）。已核验。

### 3.3 EuiDataGrid 密度切换（用户可切换的实现方式）

来源：`packages/eui/src/components/datagrid/controls/display_selector.tsx` + `data_grid.styles.ts`（已核验）

**3 档：compact / normal / expanded**，每档 = (fontSize 档, cellPadding 档) 组合：

| 密度 | fontSize | cellPadding | 实际值 | 行高（推导，行高=行内行高+2×padding） |
|---|---|---|---|---|
| compact | `s` | `s` | 12px 字 + `size.xs`=4px padding | 16 + 8 ≈ **24px** |
| normal（默认） | `m` | `m` | 14px 字 + `size.m`/2 = **6px** padding | 20 + 12 ≈ **32px** |
| expanded | `l` | `l` | 14px 字（l 档映射同 m） + `size.s`=8px padding | 20 + 16 ≈ **36px** |

关键实现细节（可抄）：
- 密度档间差值不是单一 px，而是**字号档 ×2（12→14px）+ padding 档 ×2（4→6→8px）** 的联动；expanded 档只加 padding 不加字号
- 切换入口在工具栏 Display options 弹层（EuiPopover + 三段 EuiButtonGroup），带"Reset to default"按钮（与初始 gridStyles 对比 `isEqual` 决定显隐）
- 另有"Lines per row"行高控制：Auto（内容自适应）/ Static + 行数输入（1-20 行封顶），映射到 `rowHeightsOptions.defaultHeight: 'auto' | {lineCount}`；支持逐行独立高度
- 表格线三档 `border: none / horizontal / all`；斑马纹 `stripes` 可选（默认关）；表头 `shade`（默认）/ underline / none

---

## 4. Ant Design（v5，关键数字取自 5.24.0 tag 原始文件）

### 4.1 v5 字号体系

来源：`components/theme/themes/seed.ts`（seed：`fontSize: 14`、`sizeUnit: 4`、`sizeStep: 4`、`controlHeight: 32`、`borderRadius: 6`、`lineWidth: 1`，master 已核验）+ `shared/genFontSizes.ts`（公式：阶梯 `base·e^(i/5)` 取整到偶数，行高 `(size+8)/size`）+ `shared/genFontMapToken.ts`（映射）+ `util/alias.ts` @5.24.0（padding=size 映射，已核验）

| Token | 值 | 核验 |
|---|---|---|
| fontSize（正文） | **14px** | 已核验（seed） |
| fontSizeSM | 12px | 推导（genFontSizes(14)[0]=12，公式确定性） |
| fontSizeLG | 16px | 推导（同上 [2]=16） |
| fontSizeXL | 20px | 推导（[3]=20） |
| Heading1-5 | 38 / 30 / 24 / 20 / 16px | 推导（[6][5][4][3][2]） |
| lineHeight | (14+8)/14 = 1.5714（22px） | 推导（公式已核验） |
| lineHeightSM / LG | 1.6667（12px）/ 1.5（16px） | 推导 |
| padding 尺度 | `sizeUnit×sizeStep` 步进：**4, 8, 12, 16, 20, 24, 32, 48** | 已核验（genSizeMapToken 注释：sizeXXS 4 … sizeXXL 48；alias.ts：padding=size=16, paddingSM=12, paddingXS=8, paddingLG=24） |

### 4.2 Table 组件密度（v5 三档）

来源：`components/table/style/index.ts` @ **5.24.0 raw**（token 赋值原文已核验：`cellPaddingBlock: padding` / `cellPaddingBlockMD: paddingSM` / `cellPaddingBlockSM: paddingXS` 等；`cellFontSize/MD/SM` 三档全部 = `fontSize`）

| size | padding-block × padding-inline | 字号 | 单行行高（推导） |
|---|---|---|---|
| large（默认） | **16px × 16px** | 14px | 22 + 32 ≈ **54px** |
| middle | **12px × 8px** | 14px | 22 + 24 ≈ **46px** |
| small | **8px × 8px** | 14px | 22 + 16 ≈ **38px** |

其他已核验：表头背景 `colorFillAlter` 实色化、表头字重 `fontWeightStrong`（600）、表头列间分隔用 `::before` 1px 竖线（高 1.6em，色 colorBorderSecondary）、行 hover/选中背景 token、`borderRadiusLG` 表头圆角；antd 默认只有行底 1px `border-bottom`（`borderSpacing:0; border-collapse:separate`），无内建斑马纹（官方用 `rowClassName` 自定义实现）。

---

## 5. 共性收敛与 FAR-Lab 应用建议

### 5.1 四家共识数字

| 维度 | Carbon | Blueprint | EUI | antd v5 | **共识** |
|---|---|---|---|---|---|
| 正文字号 | 14px（body-compact-01） | 14px（$pt-font-size） | 14px（scale s） | 14px（fontSize） | **14px 四家完全一致** |
| 辅助/表内小字 | 12px（caption/label-01） | 12px（small） | 12px（scale xs） | 12px（fontSizeSM） | **12px 四家完全一致** |
| 表头字重 | 600 | 600 | 500（semiBold） | 600 | 600 为主（EUI 500） |
| 表头字号 | 14px（同正文） | 14px | 12px（小一档） | 14px | 14px 同字号为主 |
| 密表格行高（紧凑档） | 24px（xs）/ 32px（sm） | 20px（虚拟表）/ 30px（compact） | ≈24px（compact，推导） | ≈38px（small，推导） | **紧凑 24-32px** |
| 标准行高 | 48px（默认） | 40px（HTMLTable 默认） | ≈32px（normal）/ ≈40px（EuiTable 默认，推导） | ≈46px（middle）/ ≈54px（默认，推导） | **舒适 40-48px** |
| 密度档位数 | 5 档（24/32/40/48/64，开发者级 size prop） | 2 档（40/30）+ 虚拟表 20 | 3 档（用户可切换） | 3 档（large/middle/small） | **3 档最常见** |
| 间距基网格 | 4px（2/4/8/12/16/24/32/40/48/64…） | 4px（$pt-spacing） | 4px（baseline=base/4，尺度 2/4/8/12/16/24/32/40/48/64） | 4px（sizeUnit 4 × step 4 → 4/8/12/16/20/24/32/48） | **4px 基网格四家一致** |
| 分隔线 | 默认行底 1px；斑马纹可选（偶行 tint） | 默认 1px；斑马纹可选（奇行 tint） | border none/horizontal/all 三档 + stripes 可选 | 默认行底 1px；斑马纹需自写 | **默认横向 1px 分隔线，斑马纹可选项** |
| 阅读文本行高 | body-01 20px / body-02 24px（lh 1.43-1.5） | 1.5（21px @14） | lh 公式≈1.43-1.5（20-24px @14-16） | lineHeight 1.5714（22px） | **阅读区行高 20-24px（1.4-1.5 倍）** |

### 5.2 "证据表格 + 阅读视图混合"的分区密度策略（各家做法）

- **Carbon（最直接的范式）**：同一字号 14px 下分两个 token——表格/元数据用 `body-compact-01`（14/18px lh1.29），长文阅读用 `body-01/02`（14/20px、16/24px lh1.43-1.5）。**密度差异做在行高与 padding，不做在字号**；表格区块标题固定 heading-03（20px）
- **EUI**：组件双轨——EuiDataGrid/EuiTable(compressed) 走紧凑 token（12-14px 字 + 4-8px padding）；阅读内容走 EuiText/EuiTitle 独立排版（scale m-xl 16-24px）；且把密度开放给最终用户切换（3 档 + 行数控制 + 重置）
- **antd**：Table 三档只动 padding（16/12/8）不动字号（14 恒定）；阅读交给 Typography 组件（title/paragraph 独立字号行高）
- **Blueprint**：紧凑表 30px/虚拟表 20px；正文阅读 14/1.5；交互控件（按钮 30/24/20）与表格行高共用同一 4px 网格倍数体系

### 5.3 FAR-Lab 最可直接抄的 5 条

1. **正文/表格 14px + 辅助 12px**（四家 100% 共识）：证据表格正文 14/18px（lh≈1.29，抄 Carbon body-compact-01），来源引用、时间戳、标签用 12/16px；阅读视图（研究计划文档）同字号提到 lh 1.5（21-24px），抄 Carbon body-01/02 的"同字号不同行高"分区法
2. **表格行高三档 24 / 32 / 40px**（8px 步进，全档共用 4px 网格）：紧凑档 24（Carbon xs、EUI compact 同值）；按 EUI 的 Display Selector 实现**用户级密度切换**（三段按钮 + Reset），密度 = 字号档（12↔14）× padding 档（4/6/8px）联动
3. **表头规格**：字号 14px（同正文）+ 字重 600 + 浅底色（Carbon `$layer-accent` / antd colorFillAlter 级别）+ 底边 1px 分隔线；列间分隔可用 1px 竖线高 1.6em（antd 做法）；数字/证据编号列开 `font-feature-settings: 'tnum'`（EUI 做法）
4. **行分隔与斑马纹**：默认每行底边 1px 浅灰（border-subtle 级），斑马纹做成可选开关（偶行浅 tint，透明度 0.15 量级——Blueprint rgba(gray,0.15)）；行 hover 整行高亮（背景 tint + 边框同色，Carbon 做法）
5. **密度 token 化**：间距全走 4px 基网格阶梯（2/4/8/12/16/24/32/48），密度档 = 行高 + 单元格 padding 的成对 token（如 compact=行 24/padding-y 2-4、normal=行 32/padding-y 6-7、comfort=行 40+/padding-y 8-16），跨控件（按钮 24/30/32、输入框 24/30/32）与表格共用同一网格——四家皆如此

---

## 附：来源清单

**Carbon**（`github.com/carbon-design-system/carbon` @ master）
- `packages/styles/scss/components/data-table/_data-table.scss`（行高/表头/斑马纹/分隔线/padding）
- `packages/type/src/styles.js`、`scale.js`、`fontWeight.js`（type token 全表）
- `packages/layout/scss/_spacing.scss` + jsdelivr `@carbon/layout/scss/generated/_spacing.scss`（spacing 数值）

**Blueprint**（`github.com/palantir/blueprint` @ master）
- `packages/core/src/common/_variables.scss`（字号/间距/控件高）
- `packages/core/src/common/_mixins.scss`（centered-text 公式、running-typography lh1.5）
- `packages/core/src/components/html-table/_html-table.scss`（40/30px 行高、斑马纹）
- `packages/table/src/table.tsx` defaultProps（raw 读取：20px 默认行高等）
- `packages/colors/src/_colors.scss`（17 档中性阶）

**EUI**（`github.com/elastic/eui` @ master）
- `packages/eui/src/components/datagrid/controls/display_selector.tsx`（密度 3 档映射与切换 UI）
- `packages/eui/src/components/datagrid/data_grid.styles.ts`（cellPadding/fontSize 变量）
- `packages/eui/src/components/table/table.styles.ts`、`table_cells_shared.styles.ts`（EuiTable 密度/表头）
- `packages/eui/src/global_styling/functions/typography.ts`（行高公式）
- `packages/eui-theme-common/src/global_styling/variables/size.ts`（size 尺度）
- `packages/eui-theme-borealis/src/variables/_typography.ts`（font scale 8 档/字重/正文 s=14）

**Ant Design**（`github.com/ant-design/ant-design`）
- `components/table/style/index.ts` @ **5.24.0**（https://raw.githubusercontent.com/ant-design/ant-design/5.24.0/components/table/style/index.ts，三档 padding/字号）
- `components/theme/themes/seed.ts` @ master（fontSize 14 / sizeUnit 4 等）
- `components/theme/themes/shared/genSizeMapToken.ts`、`genFontMapToken.ts`、`genFontSizes.ts` @ master（尺度阶梯与字号公式）
- `components/theme/util/alias.ts` @ **5.24.0**（padding=size 映射）
