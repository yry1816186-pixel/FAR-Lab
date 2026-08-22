# 线 A：美学与设计规范调研报告（Wave-PRODUCT）

- 调研子 Agent 产出日期：2026-08-22（所有来源均于当日在线核验）
- 方法：WebSearch/WebFetch/浏览器渲染抓取/GitHub 官方仓库原始文件逐项核验；关键数值（WCAG、M3 token）用 curl 直接下载原文二次复核
- 定位：为《产品全景设计规划方案》提供可引用的设计规范证据。所有结论标注来源 URL；未能核验之处显式标注 UNVERIFIED
- 说明：m3.material.io 与 developer.apple.com 均为 JS 渲染站，静态抓取拿不到正文；本报告改用 (a) Playwright 浏览器渲染官方页面、(b) Google 官方 material-web 仓库（Apache-2.0，token 数值与 m3.material.io 同步生成）双重核验

---

## 1. Material 3 (Google)

来源（全部 2026-08-22 核验）：
- 官网 https://m3.material.io/ （正文经浏览器渲染核验：progress indicators、density 博文）
- Token 数值权威载体：material-components/material-web 官方仓库（Apache-2.0）
  - https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-sys-typescale.scss
  - .../\_md-sys-motion.scss、/\_md-sys-shape.scss、/\_md-sys-state.scss（raw 原文已逐行提取）
- Dynamic color：https://github.com/material-foundation/material-color-utilities（Apache-2.0，README 已核验）
- 密度：https://m3.material.io/blog/material-density-web（2020-01-16，Una Kravets，已渲染核验）
- 进度指示器：https://m3.material.io/components/progress-indicators/guidelines（已渲染核验）

### 1.1 色彩系统（dynamic color / tonal palettes）
- material-color-utilities README 核验的组件构成：`dynamiccolor`（按 UI 状态——暗色主题、风格、偏好、对比度要求——取色）、`hct`（基于 CAM16×L\* 的新色彩空间 hue/chroma/tone）、`palettes`（**tonal palette：仅随 tone 变化的色阶**；core palette = 构成 Material 配色方案所需的一组 tonal palette）、`scheme`（从单一颜色或 core palette 生成静态/动态配色方案）、`contrast`（测量对比度、取满足对比度的颜色）
- 对 FAR-Lab 可用规则：
  - 颜色不逐个手选，而是从一个种子色经算法生成 tonal palette（tone 通常取 0-100 的关键档），再映射到语义角色（primary/secondary/tertiary/error + surface 系列）
  - 语义角色（而非原始色值）是组件唯一消费物；支持 light/dark 双主题是 token 系统的第一性要求
  - 对比度是选色算法的输入约束（保证 accessible contrast），而非事后修补
  - 有 TypeScript 实现（npm `@material/material-color-utilities`），FAR-Lab React SPA 可直接引入做主题生成（零 UI 库纪律不受影响——这是 token 库不是组件库）
- Token 分层（material-web 仓库核验）：reference（`md-ref-*`，原始值）→ system（`md-sys-*`，语义组）→ component（`md-comp-*`），依赖严格单向

### 1.2 类型标尺（已从官方 SCSS 逐值核验，16px 基准换算）
| 角色 | size/line-height | tracking | weight |
|---|---|---|---|
| display-large | 57px/64px | -0.25px | 400 |
| display-medium | 45px/52px | 0 | 400 |
| display-small | 36px/44px | 0 | 400 |
| headline-large | 32px/40px | 0 | 400 |
| headline-medium | 28px/36px | 0 | 400 |
| headline-small | 24px/32px | 0 | 400 |
| title-large | 22px/28px | 0 | 400 |
| title-medium | 16px/24px | +0.15px | 500 |
| title-small | 14px/20px | +0.1px | 500 |
| body-large | 16px/24px | +0.5px | 400 |
| body-medium | 14px/20px | +0.25px | 400 |
| body-small | 12px/16px | +0.4px | 400 |
| label-large | 14px/20px | +0.1px | 500 |
| label-medium | 12px/16px | +0.5px | 500 |
| label-small | 11px/16px | +0.5px | 500 |

（SCSS 原值以 rem 计：display-large-size 3.5625rem 等；tracking 亦为 rem。display/headline/title-large 用 brand 字体，其余用 plain 字体。）

### 1.3 Motion token（官方 SCSS 逐值核验）
- Duration（ms）：short1-4 = 50/100/150/200；medium1-4 = 250/300/350/400；long1-4 = 450/500/550/600；extra-long1-4 = 700/800/900/1000
- Easing（cubic-bezier）：
  - standard = (0.2, 0, 0, 1)；standard-decelerate = (0, 0, 0, 1)；standard-accelerate = (0.3, 0, 1, 1)
  - emphasized = (0.2, 0, 0, 1)；emphasized-decelerate = (0.05, 0.7, 0.1, 1)；emphasized-accelerate = (0.3, 0, 0.8, 0.15)
  - legacy = (0.4, 0, 0.2, 1)（M2 兼容）
- `prefers-reduced-motion` 时官方组件退化为纯 opacity 渐隐（material-web 仓库核验）
- Shape：corner-none/small/medium/large/extra-large/full = 0/8/12/16/28/9999px
- State layer opacity：hover 0.08、focus 0.12、pressed 0.12、dragged 0.16（用主色叠加表达交互态，不改底色）
- 对 FAR-Lab 建议采纳：Web 工作台动效全部走 `short3(150ms)/medium2(300ms)` + `standard(0.2,0,0,1)` 两档起步；hover 态统一 8% 主色叠加

### 1.4 密度（density）
- 密度刻度从 0（default）向负数走（-1/-2/-3...），**每 -1 级组件高度减 4px**，只减纵向不减横向（密度博文原文公式：`36px + 4px * (-3) => 24px`）
- 三档语义：default / comfortable / compact；**compact 适合数据密集场景（表格、长表单），但触控目标无论密度如何 ≥48px**；密度提高时布局边距/栏宽要同步放大以保持可读性
- 对 FAR-Lab：桌面 GUI 与 Web 的证据表格视图用 compact（行高 -4px/级，最多 -3），阅读型视图（假设叙事、研究计划文档）用 default；48px 触控目标下限照抄

### 1.5 进度指示器诚实规范（对 FAR-Lab 核心价值同构，原文核验）
- **"When using a determinate indicator, the indicator must accurately represent the progress of what it's measuring."**（确定性进度条必须如实反映所测进度——禁止假百分比）
- 进度/等待时间未知 → 用 indeterminate（仅表示"进行中"），**"As more information about a process becomes available, a progress indicator should change from indeterminate to determinate."**（信息充分后才切换为确定性）
- 等待时间分档：<200ms 不显示指示器；200ms-5s 用 loading indicator；>5s 用 progress indicator
- 多项加载用**单个**组级指示器，不要每个子活动各挂一个
- 线性指示器轨道与容器对比 <3:1 时必须加 4dp stop indicator（呼应 WCAG 1.4.11）

---

## 2. Apple Human Interface Guidelines

来源（2026-08-22 经 Playwright 渲染核验，静态抓取不可用）：
- Typography: https://developer.apple.com/design/human-interface-guidelines/typography
- Motion: https://developer.apple.com/design/human-interface-guidelines/motion
- Layout: https://developer.apple.com/design/human-interface-guidelines/layout
- Buttons(44pt): https://developer.apple.com/design/human-interface-guidelines/buttons

### 2.1 排版（SF 系列 / 动态字号）
- 平台默认/最小字号表（页内表格核验）：iOS/iPadOS/visionOS **默认 17pt、最小 11pt**；macOS **默认 13pt、最小 10pt**
- 系统字体 SF Pro（macOS/iOS/visionOS）；系统字体自动支持 Dynamic Type 与无障碍字重（Bold Text）；文本样式（text style）= 字重+字号+行距的组合，构成层级（body 供多行舒适阅读、headline 区分标题）
- 字重规则（原文核验）："In general, avoid light font weights" —— 用 Regular/Medium/Semibold/Bold，避免 Ultralight/Thin/Light；细字重自定义字体应放大字号补偿
- Dynamic Type：系统级字号缩放；最大无障碍档 Large Title 达 44pt/52pt（表格核验）；图标（SF Symbols）随字号同步缩放；布局必须在所有字号下自适应、尽量避免截断文本
- 对 FAR-Lab：Web 端实现"文本样式=命名字号+字重+行距组合"（类似 M3 typescale）+ 用户字号偏好（rem/CSS 变量驱动）；正文默认 16-17px、最小 11px；不用细于 400 的字重

### 2.2 反馈与动效原则（Motion 页原文核验）
- 动效必须有目的："Don't add motion for the sake of adding motion"（装饰性/过度动效会分心甚至引发生理不适）
- **"Make motion optional"**：动效不得是传达重要信息的唯一通道；用触感/音频等替代补充（Web 对应：动效之外必须有状态文本）
- 反馈动效要"brief and precise"（简短精确），频繁交互不叠加动效；**"Let people cancel motion"**——不得强迫用户等动画播完才能继续操作
- 帧率 30-60fps 视为流畅下限
- 对 FAR-Lab：所有 transition 200-400ms、可跳过、`prefers-reduced-motion` 全局降级——与 M3 token 档位吻合，可统一采纳

### 2.3 布局
- 相关项分组（负空间/背景形状/分隔线区分组），重要信息给足空间不被次要内容挤压
- 视觉层级：控件与内容区分；重要项放阅读顺序起点（上、前导侧，注意 RTL）；**对齐**用于可扫读性与层级；**渐进披露（progressive disclosure）**用于大集合
- 自适应清单：屏幕尺寸/方向、Dynamic Type 字号变化、RTL/本地化文本长度——布局必须优雅适配且保持可识别的一致性；尊重系统 safe area/margins
- 交互目标（Buttons 页原文核验）："a button needs a hit region of at least **44x44 pt** — in visionOS, 60x60 pt"；自定义按钮必须有 press state

---

## 3. Fluent 2 (Microsoft)

来源（2026-08-22 浏览器渲染核验）：
- https://fluent2.microsoft.design/typography
- https://fluent2.microsoft.design/design-tokens
- 密度：https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/compact-sizing （ms.date 2026-07-06）

### 3.1 Design tokens 方法
- **两层 token**（原文核验）：Global tokens = 上下文无关的原始值（色板 hex、字体、圆角、描边宽度、动画）；Alias tokens = 加语义层的第二层（功能即名称，一眼可知用在哪），阴影/类型等复杂值由 alias 收敛为单一可读条目
- Token 天生为主题与无障碍设计："support OS theming for light, dark, high-contrast, and branded elements, as well as ensure sufficient color contrast across the system"
- 对 FAR-Lab：CSS 变量两层命名——`--far-color-blue-600`（global）→ `--far-color-hypothesis-supporting`（alias）；组件只准消费 alias

### 3.2 Type ramp（web/Segoe UI，页面表格逐值核验）
| 名称 | weight | size/line-height |
|---|---|---|
| Caption 2 / Strong | Regular / Semibold | 10px/14px |
| Caption 1 / Strong / Stronger | Regular / Semibold / Bold | 12px/16px |
| Body 1 / Strong / Stronger | Regular / Semibold / Bold | 14px/20px |
| Subtitle 2 / Stronger | Semibold / Bold | 16px/22px |
| Subtitle 1 | Semibold | 20px/26px |
| Title 3 | Semibold | 24px/32px |
| Title 2 | Semibold | 28px/36px |
| Title 1 | Semibold | 32px/40px |
| Large Title | Semibold | 40px/52px |
| Display | Semibold | 68px/92px |

- 每级三档字重（Regular/Semibold/Bold）表达强调——比 M3 更适合"正文需要内嵌强调"的科学文本界面
- 排版规则：句首大写（sentence case），禁全大写吸引注意；基线对齐分配纵向空间；LTR 语言左对齐、长文本不右对齐；标准文本对比 ≥4.5:1，大文本（>18.5px bold 或 >24px regular）≥3:1（与 WCAG 1.4.3 一致）
- 跨平台用系统原生字体保证可及性（web 用 Segoe UI 栈）

### 3.3 密度
- Fluent 2 官网无独立 density 页（404，实测）；密度规范在 WinUI：**仅两档 default/compact，无任意值 API**（Microsoft Learn 核验）；compact 通过资源字典整体降低控件高度与内边距，适用"生产力/数据录入（表格、表单、设置）"，触屏/消费应用用 default，混合应用可只对设置面板局部套 compact，支持运行时切换
- 对 FAR-Lab：桌面 GUI 提供 comfortable/compact 两档（不要三档以上），按视图类型选择而非全局一刀切

---

## 4. 桌面 Linux HIG（GNOME + KDE）

### 4.1 GNOME HIG
来源（2026-08-22 核验）：https://developer.gnome.org/hig/ （GTK4 + libadwaita，CC 许可的官方文档）
- 范式分类（patterns 索引核验）：Containers（Windows/Header Bars/Popovers/Utility Panes/**Boxed Lists**/Grid Views/**List & Column Views**/Selection & Edit Modes）、Navigation（Browsing/View Switchers/Tabs/**Sidebars**/Search）、Controls、Feedback（**Notifications/Toasts**/Banners/**Progress Bars/Spinners**/Dialogs/**Placeholder Pages**/Tooltips）
  - 对 FAR-Lab 直接对应：三栏工作台 = Sidebar + List & Column View + Utility Pane；空态/加载态/错误态 = Placeholder Pages 模式（每个视图必须设计，不许空白）
- Toasts（子页核验）：应用内瞬态横幅，"always transient and user dismissible"；必须有短标题；按钮可选（典型用途 = 破坏性操作后提供 undo）；底部居中；持续状态用 banner 不用 toast；应用不在前台时要触达用户就升级为系统通知
- 键盘导航（guidelines/keyboard + reference/keyboard 核验）：**"It should be possible to move around and interact with every part of your user interface using the keyboard"**；快捷键约定：Ctrl+O/S/F/W/N/P/Q、Ctrl+Z/Y(Shift+Z)/A/X/C/V、F1 帮助、Ctrl+Q 退出；导航 F10 菜单、Ctrl+Tab 切换页、Alt+←/→ 前进后退、Ctrl+W 关闭、Ctrl+F 查找、Ctrl+G/F3 再找下一个
- 无障碍清单（5 项，原文核验）：高对比模式全部 UI 正确渲染；大字模式所有标签可读；**纯键盘可完成全部导航与交互**；屏幕阅读器逐元素朗读且 accessible name 准确（"Can you turn the display off and still use the app?"）；屏幕键盘可完成全部文本输入
- 文案风格（design principles 核验）：简洁、可扫描、句子格式、按钮标签用动词、不要在 UI 文案里幽默/计算机术语/重复

### 4.2 KDE HIG
来源（2026-08-22 核验，页面 dateModified 2026-03-05，内容 CC-BY-SA-4.0）：
- 索引 https://develop.kde.org/hig/ ；布局 https://develop.kde.org/hig/layout_and_nav/ ；状态 https://develop.kde.org/hig/status_changes/ ；无障碍 https://develop.kde.org/hig/accessibility/
- 布局与间距（表格逐值核验，Kirigami units）：**gridUnit = 18px**；smallSpacing = 3px；mediumSpacing = 10px；largeSpacing = 18px；mediumSpacing = roundedUnits(10)；IconSizes: small 16 / smallMedium 22 / medium 32 / large 48 / huge 64 / enormous 128 / enormousPlus 256；cornerRadius = gridUnit/4；项目高度 = iconSize + 2×smallSpacing
- 响应式断点表：≥300px 手机单列（推荐 Kirigami PagePool）；≥500px 窄横屏手机；≥700px 平板/桌面窗口（推荐 master-detail）；≥1000px 桌面多列（Navigation Sidebar + PageRouter）；≥1200px 大屏桌面（可折叠 sidebar + PageRouter）
- 布局原则：项目位置传达重要性/工作流/分组（用户从 top-leading 开始扫描）；对齐传达组织；用标题分组、留白区隔；列表/网格详细规范见 "displaying content"（本次未抓子页，列目录为证）
- **状态沟通（status_changes 页核验，对 FAR-Lab 高价值）**：
  - "Minimize status messages"——成功通过**改变相关界面元素本身**来体现，而不是弹完成通知（长任务用户可能遗忘除外）
  - 错误层级（优→劣）：自动恢复无需报错 → 描述+修复动作 → 描述+继续指引 → 仅描述（不可接受）→ 技术乱码/静默失败（"Never ever ever"）；所有错误必须可行动、用平实语言、第三方故障要明确归属
  - 语义色：蓝=高亮/选中，橙=警告/非默认设置，红=错误/危险；**绝不单独依赖颜色**（配图标/形状/文本）
  - 应用内通知：低重要度用 passive notification；需注意但不打断用 InlineMessage（置于页面头部）；系统通知仅用于应用在后台时的可行动事件，分 Low/Normal/Critical 紧急度；"Excessive notifications drive users crazy"
  - 任务管理器进度徽章：仅用于显式、长时、用户主动发起的任务
- 无障碍：可用性优先于美观；遵循本 HIG 即已相当可及，仍须模拟感官/障碍测试（键盘、对比度、色盲、文本缩放、屏幕阅读器与缩放工具）

---

## 5. WCAG 2.2（W3C Recommendation）

来源：https://www.w3.org/TR/WCAG22/ （2026-08-22 直接下载原文 512KB 逐项 grep + 全文阅读双重核验）
- 版本事实（原文核验）：当前版本为 **W3C Recommendation 12 December 2024**（REC-WCAG22-20241212，勘误重发布）；首发 **2023-10-05**；**4.1.1 Parsing 已移除**（"removed one success criterion"）

### 5.1 AA 审计最相关成功标准（FAR-Lab Web 工作台审计清单）
| SC | 级别 | 精确要求（原文核验） |
|---|---|---|
| 1.4.3 对比度(最低) | AA | 文本视觉呈现对比 ≥**4.5:1**；大文本（≥18pt 或 ≥14pt bold）≥**3:1**；纯装饰/Inactive UI 组件豁免 |
| 1.4.11 非文本对比 | AA | UI 组件状态边界、图形关键部分对比 ≥**3:1**（相邻色） |
| 2.4.7 焦点可见 | A | 任何操作模式键盘焦点指示可见 |
| 2.4.11 焦点不被遮挡(最低) ★新 | AA | 焦点元素不被作者内容遮挡到"完全不可见"（Enhanced AAA 版要求完全不被遮挡） |
| 2.5.7 拖拽动作 ★新 | AA | 拖拽不能是唯一操作方式（单指针替代，除非拖拽必要或用户代理提供）——FAR-Lab 排序/锦标赛拖拽必须给按钮替代 |
| 2.5.8 目标尺寸(最低) ★新 | AA | 指针目标 ≥**24×24 CSS px**；例外：间距充足、内联、UA 处理、等效控制 ≥24px、自定义必需 |
| 3.2.6 一致帮助 ★新 | A | 帮助入口（人工/自动/自助/联系）在一组页面的**相同相对位置**出现 |
| 3.3.7 冗余输入 ★新 | A | 同流程中已输入的信息不要求重复输入（自动填充/可复制可用）；安全例外 |
| 3.3.8 可访问认证(最低) ★新 | AA | 认知功能测试（记忆/转录/拼图）不得是认证唯一方式（"A cognitive function test"原文核验），须有替代或辅助；无例外翻译 |
| 辅助相关：1.4.10 Reflow | AA | 320 CSS px 宽无需双向滚动（原文 320 CSS pixels 核验） |
| 1.4.12 文本间距 | AA | 行高 1.5×、段距 2×、字距 0.12×、词距 0.16× 可覆盖而无内容丢失 |
| 2.1.1 键盘 | A | 全功能键盘可操作 |
| 4.1.3 状态消息 | AA | 无焦点变化的状态更新须以 role/属性编程可达（aria-live 等）——FAR-Lab 异步任务进度必须用 |
| 2.4.13 焦点外观 | AAA | 焦点指示 ≥2 CSS px 周界（原文公式核验："2 CSS pixel perimeter around a rectangle is 4"）、≥3:1 对比、相邻 4px 内不变更——AA 审计建议参照执行 |

（★ = WCAG 2.2 新增。4.1.1 Parsing 移除后不要再审计它。）

### 5.2 终端/CLI 可访问性公认做法
- **无 CLI 等价 WCAG**：GitHub 工程博客（https://github.blog/engineering/user-experience/building-a-more-accessible-github-cli/ ，2026-08-22 核验）明确指出终端无 DOM，屏幕阅读器只能"分析布局推断结构"；W3C WCAG2ICT 只给方向不给具体技术。其落地实践（gh a11y，v2.72+）：
  - 动画 spinner（盲文字符旋转重绘屏幕）→ 换成**静态文本进度指示**（"Working…"），重绘/动画不得是唯一信号
  - 颜色要计入用户可控的终端背景色；对齐 **ANSI 4-bit 16 色**表让用户可完全自定义配色
  - 交互 prompt 用屏幕阅读器可传达的库（huh）重建
- **NO_COLOR 惯例**（https://no-color.org/ ，原文核验）："Command-line software which adds ANSI color to its output by default should check for a NO_COLOR environment variable"，当该变量**存在且非空字符串（不论值）**时禁用 ANSI 颜色；仅管颜色不管粗体/斜体；config/命令行旗标可覆盖该变量
- GNOME HIG 的可及性测试法（键盘-only、屏幕阅读器关闭显示器使用、大字、高对比）同样适用于桌面 GUI 表面
- 对 FAR-Lab CLI 纪律：默认关色（TTY 检测 + NO_COLOR + TERM=dumb + --no-color 四重判断）；无 TTY 时零动画零 spinner；提供 `--json` 让屏幕阅读器用户/管道消费同一条数据通路

---

## 6. 终端 TUI/CLI 设计惯例（clig.dev）

来源：https://clig.dev/ （Command Line Interface Guidelines；仓库许可 **CC-BY-SA-4.0**，GitHub API 核验；正文 2026-08-22 核验）
- **人类默认/机器 --json**："Humans come first, machines second"；人类可读输出优先，检测 TTY；`--json` 输出格式化 JSON；多行表格破坏管道时提供 `--plain`
- **输出流纪律**：结果数据 → stdout；日志/错误/诊断 → stderr（保证管道干净）
- **退出码**：成功 0、失败非 0；非 0 退出码映射到最重要的失败模式
- **错误信息**：为人类改写（给修复指引，如 "You might need to make it writable by running 'chmod +w file.txt'"）；重要信息放输出末尾；意外错误附 debug/traceback 与报 bug 指引；能猜出意图（拼写错误）就建议修正但不静默执行
- **安静原则**："Display output on success, but keep it brief"；静默会被当成挂死；提供 -q/--quiet；**"If you change state, tell the user"**
- **颜色**：有意使用，全都是颜色=没有颜色；非 TTY、NO_COLOR 非空、TERM=dumb、--no-color 任一成立即关色
- **配置优先级**：flags > 环境变量 > 项目级 .env > 用户级 > 系统级；遵循 XDG Base Directory
- **破坏性操作**：确认分级——轻（单文件删除，可免确认）/中（提示 + dry-run）/重（要求输入资源名或 --confirm="name-of-thing"）；`-n/--dry-run` 描述将发生什么而不执行
- **进度与响应性**：长操作必须显示进度（否则像挂死）；**"Print something to the user in <100ms"**（含网络请求前）；stdout 非 TTY 时不显示任何动画；进度条下隐藏的日志要在出错时打印
- **交互守卫**：仅当 stdin 是 TTY 才允许交互 prompt，否则报错并指明所需 flag；尊重 --no-input；**secrets 不进 flag/环境变量**（ps/docker inspect 泄漏面），用凭证文件/stdin/管道

---

## 7. 数据可视化诚实呈现

### 7.1 Claus Wilke《Fundamentals of Data Visualization》
- 来源：https://clauswilke.com/dataviz/ （免费完整在线作者手稿，**CC BY-NC-ND 4.0**——署名-非商业-禁止演绎，2026-08-22 原文核验；印刷版 O'Reilly 2019）
- 30 章：Part I 数据到可视化（含分布/比例/关联/时间序列/不确定性各专章）；Part II 图形设计原则；Part III 其他
- 可引用的诚实原则：
  - 第 1 章 "Ugly, bad, and wrong figures" 三分框架：美学缺陷 ≠ 实质性错误（wrong = 误导数据）
  - **第 17 章"比例墨水原则"（proportional ink）**：墨量必须与数据量成正比——柱状图禁用非零基线截断、面积图必须映射真实面积
  - 第 3 章：非线性轴必须显式标注；第 19 章：数据值禁止非单调色标；第 26 章：避免无意义 3D
  - 第 18 章：重叠点处理；第 20 章：颜色使用陷阱；第 24 章：更大的轴标签
- 对 FAR-Lab：锦标赛对比/证据统计图表纳入"比例墨水 + 零基线 + 不确定性显式呈现（Part I 第16 章可视化不确定性）"三条硬规则；引用时遵守 NC-ND（可引用可链接，不可改绘后商用）

### 7.2 DAG/流程图可读性（Mermaid 官方文档惯例）
- 来源：https://mermaid.js.org/syntax/flowchart.html （2026-08-22 核验）
- 方向声明：`flowchart TD|TB|BT|RL|LR`；子图可设自身 direction，但**子图节点一旦连向外部，子图方向被忽略**（布局陷阱，需在评审时检查）
- 节点形状语义（v11.3+ 语义命名 `@{ shape: rect }`）：rect=Process、rounded=Event、stadium=Terminal、fr-rect=Subprocess、cyl=Database、hex=Preparation/条件步、diam=Decision——FAR-Lab 研究计划 DAG 可直接映射：假设=rounded、实验步骤=rect、判定点=diam、数据存储=cyl
- 边类型：`-->` 实线箭头、`-.->` 虚线（可用于"弱证据支持"）、`==>` 粗线（强依赖）、`---` 无箭头、`~~~` 不可见边（布局辅助）；`A-->|label|B` 标注关系语义
- 可读性官方警告：链式简写会"making the flowchart harder to read"——官方引瑞典语 *lagom*（适度）；大图/复杂图用 **elk 渲染器**；样式用 classDef 不用外部 CSS；`%%` 注释；小写 `end` 会破坏解析（用 `End`）；id 以 o/x 开头需空格
- 许可：Mermaid 为 MIT（其仓库 LICENSE，公认事实——本报告未单独核验，标 UNVERIFIED-低风险）

### 7.3 进度呈现诚实原则
- 主引证：Material 3 官方指南（见 §1.5，原文核验）：**确定性指示器必须如实反映被测进度**；未知等待时间用 indeterminate 并在信息充足后切换；<200ms 不显示；组级单指示器
- 与 FAR-Lab 宪章 §6 "If exact progress is unknown, do not invent a percentage" 完全同构——可引用 M3 作为产业规范背书
- 辅助引证：KDE HIG status_changes（进度徽章仅用于显式、长时、用户主动发起的任务）；clig.dev（非 TTY 零动画、<100ms 首次输出、静默=疑似挂死）

---

## 8. 对 FAR-Lab 的十条最强可采纳规则（跨规范收敛）

1. **Token 两层架构**（M3 ref→sys→comp + Fluent 2 global→alias）：原始值层绝不进组件，组件只消费语义层；light/dark/high-contrast 三主题是 token 系统出厂能力而非后期功能
2. **类型标尺取 M3 15 角色数值 + Fluent 三档字重**：body-large 16/24 为正文默认，最小 11px（=label-small，也是 Apple 下限）；不用 <400 字重
3. **动效 token 化**：duration 只允许 {50,100,150,200,250,300,350,400,450,500,550,600,700,800,900,1000}ms 中取值，默认 150/300 两档；easing 默认 cubic-bezier(0.2,0,0,1)；`prefers-reduced-motion` 全局降级为 opacity；动效可跳过、不承载唯一信息（Apple "Make motion optional"）
4. **进度诚实双规范**（M3 + 宪章）：已知进度才显示百分比且必须准确；未知用 indeterminate + 确定性事实（"已检索 12/30 库"）；<200ms 不显示；组级单指示器
5. **可访问对比底线**（WCAG AA）：文本 4.5:1 / 大文本 3:1 / UI 组件与图形 3:1；焦点指示满足 2.4.7(A) 并参照 2.4.13(AAA)：≥2px 周界、3:1 对比
6. **目标尺寸**：指针目标 ≥24×24 CSS px（WCAG 2.5.8 AA 硬底线）；主操作/触屏 ≥44px（Apple 44pt≈M3 48px 呼应）；密度再高不破 48px（M3）
7. **拖拽必须有单指针/按钮替代**（WCAG 2.5.7 AA）：锦标赛排序、证据关联拖拽一律配上下移按钮
8. **CLI 纪律**（clig.dev + NO_COLOR + gh a11y）：人类默认、`--json` 机器通道；数据 stdout / 诊断 stderr；退出码映射失败模式；颜色默认关（TTY+NO_COLOR+TERM=dumb+--no-color）；非 TTY 零动画零 spinner（用静态文本进度）；破坏性操作确认分级 + --dry-run；<100ms 首次输出；secrets 不进 argv/env
9. **状态沟通最小化**（KDE + GNOME）：成功靠界面元素自身变化体现而非弹通知；错误必须可行动（描述+修复动作），分层通知（toast 瞬态可撤销 / banner 持续状态 / 系统通知仅后台关键事件）；语义色蓝/橙/红且永不单独依赖颜色；异步状态更新用 aria-live（WCAG 4.1.3）
10. **科学图表诚实三原则**（Wilke）：比例墨水（柱图零基线、面积=数据）、非线性轴显式标注、不确定性显式可视化；DAG 用 Mermaid 语义形状（rect/stadium/diam/cyl）+ elk 渲染 + 虚线表弱证据，遵守 lagom 适度原则

---

## 附：UNVERIFIED / 边界说明（诚实清单）

- Apple HIG 完整 Dynamic Type 默认档位表（各 text style 在各 size 档的逐 pt 值）未逐行抄录（表格在 JS 页内，本次仅核验 17pt/11pt、macOS 13/10、无障碍档 44/52 等可见值）；逐档精确值可从 Apple Design Resources 下载（页面内链接核验存在）
- GNOME HIG "displaying content" 子页（列表/网格细则）与 typography 子页本次未抓取正文（目录已核验存在）
- Fluent 2 官网无 density 独立页（404 实测）；密度规则以 Microsoft Learn WinUI compact sizing 为准（已核验）
- Mermaid MIT 许可未单独核验（低风险公认事实）
- WCAG 2.2 各 SC 的完整逐字文本以 https://www.w3.org/TR/WCAG22/ 为准；本报告引号内容均经原文下载复核（512KB HTML），数值类（24px/3:1/4.5:1/320px/2px perimeter/两个日期）全部 grep 命中
- m3.material.io 其余组件页未逐一抓取；M3 token 数值以 material-web 官方仓库（Apache-2.0）为权威载体，与官网同源生成
