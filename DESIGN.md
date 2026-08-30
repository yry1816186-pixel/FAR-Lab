# DESIGN.md — FAR-Lab 视觉世界（从建成代码记录）

> Ground truth over intention：本文档描述 `web/src/styles.css` 与 lab 层已建成的
> 视觉系统，作为后续扩展/复核的权威参考。2026-08-29 玻尔/豆包同级壳层
>（AppRail、问题优先欢迎区、文献库、会话管理）在同一世界内扩展，未换身份；
>2026-08-30 AOSSA 表面（问题模型带、协议面板、数据面 + raw 下钻、终端全局
>面板）同世界补齐，身份未变。

## 定位

「精密科研仪器 × 研究编辑器 × 高质量出版物」的融合——不是通用 AI 聊天
美学。产品是证据约束下的假设生成工作台：颜色只承载证据语义，布局服务于
研究者的判断流。**操作型界面（Operate）**：可扫读、一致、真实使用场景
优先于表达；品牌活在精确的细节里。

## Token 体系（authoritative v2，`:root` 浅色 + 暗色镜像）

- **中性阶**（hue 250, C 0.004）：`--v2-page-bg #f1f4f6`（页面底）→
  `--v2-surface #fafcfe`（面板）→ `--v2-surface-2 #ebedef`（次级/悬停）→
  `--v2-border #d2d4d7`（**仅装饰分隔**，1.44:1 不可用于控件边框）→
  `--v2-form-border #909295`（控件边框，3.03:1 WCAG 1.4.11）。
- **文字三阶**：`--v2-text-1 #4b4d4f`（8.26:1）/ `--v2-text-2 #717375`
  （4.63:1）/ `--v2-text-3 #909295`（仅占位符，3.03:1）。
- **认知语义色**（颜色=证据语义，五态全带 tint/on-tint 三件套）：
  verified 绿 `#2c8447`、refuted 红 `#c44c44`、unknown 紫 `#8463b8`、
  caution 琥珀 `#8a7300`、info 蓝 `#2d78bd`。**禁**用语义色做装饰。
- **主按钮**：near-black `--v2-btn-ink #0f1215` + 白前景（18.79:1），
  不是品牌色按钮——克制的中性权威。

## 三声部字体（three voices）

- `--font-ui`：IBM Plex Sans + Noto Sans SC 栈——界面控件与正文。
- `--font-data`：IBM Plex Mono——数据/代码/测量值（不做"技术感"装扮）。
- `--font-statement`：Source Serif 4 + Noto Serif SC——陈述性文字
  （研究问题、结论），出版物质感。

字号阶（14px body 四系统共识）：h1 22/28·600，h2 16/22·600，h3 14/20·600，
body 14/18，read 14/21，aux 12/16，data 12.5 mono。间距 4px 基格
（--sp-1..7 = 4/8/12/16/24/32/48）。动效 M3 short3/medium2 + 标准缓动。

## 布局骨架（2026-08-29 壳层定型）

```
app-header（品牌+连接+通知/设置/palette/主题/语言）
└─ app-body（flex 行）
   ├─ app-rail 232px（折叠 52px；<900px 隐藏）  ← 豆包式持久导航
   │   主导航（工作台/新研究/文献库，非 active 500/active 600）
   │   最近研究 / 会话（重命名·armed-confirm 删除） / 底部设置
   ├─ content（各表面）
   │   #/        LabHome：问题优先欢迎区（居中输入+快捷任务）
   │             + 判断队列 + 研究索引 + 会话 chips ← 玻尔式问题入口
   │   #lab/new  NewResearch（问题+种子+路线；?q= 预填）
   │   #library  Library（跨研究去重文献，引用 chip 回跳）
   │   #study/…  StudyMap（脊柱：问题模型带→状态带→证据→假设→协议带→判决
   │             + 证据—假设结构图谱；claim/hyp 点击开 inspector）
   │   #run/…    深层工具（six tabs：research/evidence/hypotheses/plan/
   │             revisions/verify，sanctioned deep layer；research tab 内
   │             ExperimentsTab 数据面小节：dataset_record 表 + fem_spec
   │             列表 + raw 下钻——行点击从内容寻址工件加载头部行，mono 呈现）
   └─ 全局层：TerminalPanel（终端=全局面板，非装饰假终端）+ 会话 dock
       （消息流/工具轨迹折叠/审批卡/复制/占位诚实指示/用量 up·down 分列）
```

- 欢迎区：白 surface 卡，标题 24px/700 居中，输入框 640px 上限 +
  near-black 提交按钮，快捷 chips 圆角胶囊（hover 进 info tint）。
- rail：分组标题 10.5px 大写 0.08em；导航项 12.5px/500（active tint 底）；
  列表项 12px/400——字重与分组标题共同区分层级。
- armed-confirm 模式（删除/取消共用）：灰图标 → 红 is-armed 实底按钮，
  4s 超时自动复位；危险操作永不裸触发。
- AOSSA 脊柱带（08-30，同 band 语言）：ProblemModelBand 居 StateBand 之上
  （问题类徽章/目标×方法族对/未决理由/未知项⚠计数）；协议带居假设带与
  结论回退之间（planHash 冻结徽章、伦理门 fail-closed 审批表单、依赖序
  步骤台账按钮态、QC 徽章、armed 暂停/中止、终态只读）——披露优先，
  未立新视觉范式。
- 数据面诚实：raw 下钻一次一样本（行点击切换），mono pre + aria 标签，
  数字只从内容寻址工件来；dataset_record/fem_spec 列表与任何汇总一样
  可下钻（HCI 第 7 条的 AOSSA 具体化）。

## 组件语言与红线

- 控件边框一律 `--v2-form-border`（非装饰 border token）；focus 环
  `outline: 2px solid var(--v2-info)` + 1px offset——不用 box-shadow 环。
- 圆角：小件 6-7px，面板 `--radius-m`；胶囊仅快捷 chips。
- 图标 lucide-react 等重细线（12-15px），不混 emoji/unicode 装饰。
- 空态诚实：文献库空态说明"研究启动后文献才会汇总"，不造假数据。
- zh/en 全量对等（dict.ts 单事实源，EN 泄漏=e2e 失败）；375px 零横向
  溢出是常驻门禁；axe critical/serious=0。
- 克制线：无渐变文字、无玻璃拟态、无彩色左/右边框条、无 hero 大数字
  模板——数字只出现在有真实对象支撑的地方。
