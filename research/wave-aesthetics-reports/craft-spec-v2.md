# Craft Spec v2 — FAR-Lab 视觉执行规格（案例驱动，每条带出处）

- 版本：v2 draft（2026-08-22，Wave-Aesthetics P1）｜状态：**待用户批准 = 实施解锁**
- 方法论铁律：本 spec 不含任何无出处的审美判断。出处缩写——[CAR][EUI][ANT][BLP]=`case-datadense-systems.md` 四设计系统；[M3][HIG]=`line-a-design-specs.md`；[PX]=`case-pixels-web.md` 截图收敛；[CLI]=`case-cli-opensource.md`；[NLIB]=`case-cli-node-libs.md`
- 冲突消解原则：官方设计系统数字 > 截图估算；多源一致直接采纳；单源标注"单一出处，弱规则"

## 1. Type Scale（字号冲突消解）

**冲突**：原落地 13.5px 全局（styles.css:125）；M3 body-large 16/24 [M3]；中文细则"正文 14/数据 13.5/极限 12"。**裁决：数据密集工作台正文 14px**——[CAR] body-compact-01（14/18）、[EUI] scale-s、[ANT] fontSize:14、[BLP] $pt-font-size 四家 100% 一致；M3/HIG 的 16-17px 是消费级应用基准，FAR-Lab 是数据密集工作台，按 [CAR]/[EUI] 的"密度分区"策略而非消费级基准。

| 角色 | size/line-height | 字重 | 字体声 | 出处 |
|---|---|---|---|---|
| 页面标题 h1（run 问题/视图名） | 22/28 | 600 | UI | [M3] title-large + [PX]C1 对比强度 |
| 区块标题 h2 | 16/22 | 600 | UI | [CAR] heading-01（16/22/600）[PX]C1 |
| 小节标题 h3 | 14/20 | 600 | UI | [CAR] heading-02 |
| 正文（工作区） | **14/18** | 400 | UI | [CAR][EUI][ANT][BLP] 四家一致 |
| 正文（阅读视图：假设叙事/计划/报告） | 14/**21**（lh 1.5） | 400 | UI | [CAR] 阅读区行高 1.4-1.5；同字号不同行高分密度区（[CAR]策略） |
| 陈述声（研究问题/假设声明正文） | 15-16/24 | 400 | Serif | 单一出处（现行三声制保留放大），弱规则，落地截图评审定 |
| 辅助/元数据 | 12/16 | 400 | UI | [CAR] body-short-02/label-01，[M3] label-medium |
| 数据声（ID/hash/时间戳/数字列） | 12-13/16-20 | 400/600 | Mono | [ANT] 12px + [CAR] 数据展示惯例；hash 不再 11px |
| 表格内正文 | 14/18 | 400 | UI | [CAR] 表格=body-compact-01 |
| 表头 | 14/18 | **600** | UI | [EUI] 500-600、[ANT] 600；四家"同字号重字重" |
| 下限 | 12px（11px 仅装饰性 badge 单一场景） | — | — | [ANT] 12、[M3] label-small 11（极限档） |

**禁止**：h1-h3 差距 <4px 的扁平层级（现状 h1 15/h2 13/h3 13，违反 [PX]C1 全部案例）。

## 2. Spacing Scale（4px 基网格）

- 基网格 **4px**，token 阶梯 `2/4/8/12/16/24/32/48`——[CAR] spacing-01..08、[EUI][ANT][BLP] 一致 [CAR]（推翻落地硬编码 4/6/10/14/18px 任意值；6/10/14/18 全部收敛到网格）
- **区块级留白 24-32px，元素级 8-16px，标题与正文间 8px**——[PX]C4（Raycast 32-80 区块/8-24 元素的双层节奏；工作台取下限避免空旷）
- section padding：现状 10-12px → **16px（横向）/12px（纵向首末）**，卡片间距 16px——[CAR] $spacing-05 + [PX]C5
- 侧栏宽度 340px 维持（布局不动，本 Wave 只动视觉执行层）

## 3. 密度分层映射（同字号不同行高/行距分区）

出处：[CAR] productive/compact 双档 + [EUI] Display Selector 三档（24/32/36 推导）；[M3] §1.4 密度刻度。

| FAR-Lab 视图 | 档位 | 行高/规格 |
|---|---|---|
| SourcesTable、Receipts、Scorecards、Events 列表 | compact | 行高 32px（信息行内 lh 18px）；列间距 16px |
| Hypotheses 卡片列表、RunsSidebar | 中间档 | 行高/卡片间距 40px 节奏 |
| PlanTab、假设叙事、报告预览（阅读视图） | default | 正文 14/21，段落距 12px |
| 用户级密度切换 | 可选增强 | [EUI] 三段按钮模式，**P3 落地后再议，非本 Wave 必须** |

## 4. 表格规格（数据密集核心）

| 项 | 规格 | 出处 |
|---|---|---|
| 表头 | 14/18/600 + 浅底色（中性 surface-2）+ 1px 底边框 | [EUI][ANT] |
| 行分隔 | 默认 1px 横向分隔线；斑马纹**不做默认**（可后续作 0.15 tint 开关） | [CAR][EUI][ANT][BLP] 四家默认横线 |
| 行 hover | 整行高亮（surface-2）+ 边框同色 | [CAR] |
| 数字列 | 等宽字体 + `font-variant-numeric: tabular-nums` 右对齐 | [EUI] tnum |
| 列间 1px 竖线 | 仅高密度宽表（Receipts 9 列）使用，高 ≈1.6em 居中 | [ANT]（单一出处，弱规则，截图评审定） |
| 行式列表不卡片化 | RunsSidebar/Events 维持行式 + 1px 分隔 | [PX]C3（GitHub/Observable/Elicit） |

## 5. 控件规格

| 项 | 规格 | 出处 |
|---|---|---|
| 输入类（select/textarea/input） | 统一自定义外观：高 32px（compact）/36px（default）、1px 边框、4px 圆角、focus 2px ring（text-1 色，对比 ≥3:1） | [ANT][M3] 控件高 + [WCAG] 2.4.7/2.4.13 |
| 按钮 | 高 28（小）/32（默认），主按钮近黑 ink 维持；hover/active 态见 §6 | [CAR][M3] state layer |
| progress | 替换原生 `<progress>`：轨道 surface-2 + 填充 info，高 4px 圆角 2px；已知量 `N of M` 文本并列 | [M3] §1.5 进度诚实 + [CLI] 共性③ |
| Badge/标签 | 圆角胶囊（radius 全宽）、浅 tint 底 + on-tint 文字、字号升到 12px | [PX]C8（GitHub 标签同构） |
| 圆角体系统一 | 控件/卡片 4px（从 6px 收敛）、胶囊 999px | [PX]C5（Geist 2-4px）+ [M3] corner-small 8px 上限 |
| 滚动条 | 8px、thumb 中性 border 色、hover 加深；暗色反转 | 单一出处（Geist/MacOS 惯例），弱规则 |
| 暗色模式 | 手动切换按钮（header）+ localStorage + 无记忆时跟随 prefers-color-scheme | [M3] token 出厂双主题惯例 |

## 6. Motion（白名单执行细则）

出处：[M3] motion token（short3=150ms / medium2=300ms，standard = cubic-bezier(0.2,0,0,1)；state layer hover 8%/focus 12%）。

| 交互 | 动效 |
|---|---|
| 全部 hover（按钮/行/标签/tab） | 150ms standard；按钮叠加 8% state layer，表格行切 surface 底色 |
| focus | 150ms ring 过渡 |
| 数据到达（轮询刷新/骨架→内容） | 200ms fade-in（opacity 0→1），无位移 |
| Tab 切换 | 150ms fade；不做滑动 |
| 模态/toast | 300ms（sonner 默认已合规，校验即可） |
| 禁止 | 位移/缩放/视差/无限循环（骨架 pulse 除外）；`prefers-reduced-motion` 全局降级为瞬时（现状已合规，保持） |

## 7. 层级与色彩执行修正

- 标题层级对比：h1 22 与正文 14 差 8px+600 字重——[PX]C1；现状 h1 15px 全局最大字号即"页面无标题"（修正为上表 type scale）
- 颜色 token 不动（design-palette-v1.json LOCKED）；执行修正仅：border 用于分隔的对比可保持（1.44:1 装饰性分隔 [CAR] 允许），但 hover 态需 3:1 可感知（[WCAG] 1.4.11）
- 1px 细边框 + 底色微差（surface vs surface-2）替代阴影分层——[PX]C5

## 8. Signature：Evidence-line 升级

出处：[PX]C6（签名=产品语义抽象）+ 既有 D-061-bis glyphs。

- 状态四符印（✓✗▲–）从 11px 徽章升级：假设卡片/声明行的符印放大为 16-20px 独立视觉位（Serif/Mono 声部），tint 底色条宽 3px 内嵌（**注意**：非侧 tab accent border 模式——那是已排除的 agent tell；此处是"符印+底色块"与内容语义绑定）
- 空态/首次启动：采用 [PX]C7（产品真实输出作为视觉主体）——空 runs 列表展示一次真实 run 的时间线示意（来自 smoke 数据），非插画
- 具体形态在 P2/P3 出 2 个变体截图供用户选（human-verify）

## 9. CLI 规格（Node/TS 实现）——终端 agent 体验范式

> 本节经用户点名双案例（opencode + claude code，2026-08-22 源码级/解包级调研完成）升级：从"传统 CLI 工具"范式升级为"终端 agent 长任务体验"范式。出处新增 [OC]=`case-opencode.md`、[CC]=`case-claude-code.md`。

| 项 | 规格 | 出处 |
|---|---|---|
| 颜色库 | **vendored 抄 picocolors**（76 行 ISC 源码入 `src/cli/vendor/`，保留版权声明）——含 NO_COLOR/FORCE_COLOR/win32/isTTY/CI 完整判定顺序 | [NLIB] 组合 A + 用户"抄/借鉴/使用"授权 |
| 色彩语义（6 色最小集） | 绿=verified/成功、红=refuted/错误、黄=UNVERIFIED/caution、cyan=进行中、muted=元信息、bold=强调——**固定 6 色 ANSI，不做 truecolor**（天然免疫色深降级问题） | [OC] CLI 固定 6 色最小集 + [CLI] 共性① |
| 关色纪律 | 非 TTY / NO_COLOR 非空 / TERM=dumb / --no-color 任一 → 零 ANSI；非 TTY 零动画 | [OC] 非 TTY 剥 ANSI + [CLI] 共性② + clig.dev |
| **阶段输出形态** | `⏺ 阶段名(关键参数)` 一行摘要（Windows 降级 `●`）+ `--verbose` 内联展开证据原文——长流水线不刷屏零丢失 | [CC] Tool 行摘要 + verbose 展开；符号降级 darwin/其他 |
| 进度 | 已知量 `Stage k of N`（阶段清单可勾选 ✻/✓/→ 状态符）+ 动词式状态行（"检索中…"/"生成假设…"）；**禁止百分比**（宪法 §6 不发明进度） | [CC] todo 清单+动词 spinner 禁百分比 + [M3] §1.5 + [OC] 子任务单行镜像 |
| 流式转写 | 阶段事件按 scrollback 追加打印（非全屏重绘）；子动作单行镜像 `↳ 动作 · N calls · 时长` | [CC] scrollback 转写 + [OC] 运行态镜像 |
| 日志格式 | `[LEVEL FAR-NNNN] msg` 消息编号制（编号段按模块分配）；思考/内部细节用暗淡（opacity 0.6 等价=ANSI 90 灰）不换色 | [CLI] OpenROAD utl::Logger + [OC] thinkingOpacity |
| 输出通道 | **stdout/stderr 物理分离**：人读 report/结果表 → stdout 无前缀；日志/进度/状态行 → stderr；`--json` 时 stdout 只产 NDJSON 事件 | [OC] ui.ts/run.ts 双通道 + [CLI] OpenROAD + clig.dev |
| **JSON 信封** | result 信封照抄 claude code 契约：`{subtype: success|error_*, is_error, result?, error?, duration_ms, usage}`——subtype 与 is_error 分离，错误原文进 result 字段 | [CC] result 信封 schema（npm 解包实证） |
| 表格 | padEnd 对齐 + **CJK 双宽字符修正**（East Asian Width 计算） | [NLIB] 零依赖坑④ |
| 错误呈现 | 结构化块：`⏺` 红色标题行 + 缩进字段（cause/stage/fix 建议）+ 内嵌关键日志摘录；退出码非 0 | [CLI] Snakemake 错误块 + [CC] 权限框样式（带色边框框住原文） |
| 交互确认 | 破坏性操作三选项内联面板（是/总是/否+理由），非交互模式自动决策并打印决策 | [OC] 权限三选项 + [CC] 允许一次/不再询问/拒绝 |
| 机读 | `--json` 全局保持；`far probe --json` 等回归验证；新增 result 信封 schema 对齐 | 既有纪律 + [CC] |

**不建议抄**（[OC]/[CC] 明确标注）：Knight Rider 品牌 spinner、34 套主题、完整 TUI 栈（opentui/Ink fork 成熟度与 Windows 兼容 UNVERIFIED；FAR-Lab CLI 为非交互优先 + --json 通道，不需要全屏 TUI）。

## 10. 现状→spec 差距总表（P2-P5 实施清单映射）

| 现状（实测） | spec | 出处 | 实施 Phase |
|---|---|---|---|
| 基础 13.5px/1.55 | 正文 14/18，阅读 14/21 | §1 | P2 |
| h1 15/h2 13/h3 13 | 22/16/14 + 600 | §1 | P2 |
| 硬编码 4/6/10/14/18 | 4px 网格 token | §2 | P2 |
| section pad 10-12px | 16/12 | §2 | P2 |
| 零 transition | 150/300ms 白名单 | §6 | P2/P4 |
| 原生 select/progress | 自定义控件套件 | §5 | P4 |
| 表头 11.5px | 14/600/浅底/1px 底线 | §4 | P3 |
| 行高无体系 | 24/32/40 密度分层映射 | §3 | P3 |
| Badge 11px | 12px 胶囊 | §5 | P3 |
| glyphs 11px 徽章 | 16-20px 页面级签名 | §8 | P3 |
| 无手动暗色切换 | header 切换+持久化 | §5 | P2 |
| 圆角 6px 混用 | 4px 体系统一 | §5 | P2 |
| CLI 零色/零进度/裸 print | §9 全套 | [CLI][NLIB] | P5 |

## 11. 本 spec 未决项（需用户裁决/评审时定）

1. §3 密度切换是否做用户级控件（EUI 模式）——建议 P3 后按截图效果定
2. §8 signature 两变体二选一——P2/P3 截图评审时定
3. §1 陈述声 15-16px 单一出处弱规则——截图评审定
4. §9 vendored picocolors（复制源码）vs npm 依赖 picocolors——vendored 不破零依赖红线且用户已授权"抄"，默认 vendored；若用户倾向直接依赖则改 npm
