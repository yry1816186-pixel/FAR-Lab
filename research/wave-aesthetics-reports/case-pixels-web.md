# Web 标杆案例像素采集与解构（Wave-Aesthetics P1）

- 采集日期：2026-08-22｜方法：Playwright 实机导航 + viewport 截图（存 `evidence/W-A/cases/`，9 张）+ 视觉模型逐张解构
- 声明：视觉解构由分析模型产出，字号/间距为估算值（标注 ≈），与 `case-datadense-systems.md` 的设计系统官方数字互相校准；引用时官方数字优先
- 诚实边界：Semanticscholar 搜索页截图为加载态+Cookie 弹窗，无结果列表（已如实标注，不硬凑）；Linear/Vercel/Elicit 登录墙内的产品界面未采集，用的是公开页

## 逐案例解构

### 1. Linear（linear.app 首页）— case-linear-home.png
- 布局：顶部导航 + 大标题区 + 内嵌产品 UI 演示区（左侧栏+内容区的产品截图直接当视觉主体）
- 色彩：近黑背景 + 白字，强调色饱和度克制；产品演示区内以中性灰阶为主
- 层级：标题区与导航/正文字号对比强烈；大留白
- **可抄**：把产品真实 UI 作为首屏视觉主体（FAR-Lab 空态/首次启动可直接呈现"最后一次 run 的工作台缩略"而非空白）；层级对比强度

### 2. Observable（observablehq.com 首页）— case-observable-home.png
- 布局：左右分栏——左侧文字（标题/CTA），右侧代码块+图表+数据表格的可视化拼贴；底部全宽数据表格
- 色彩：深色背景（≈#1e1e1e）+ 强调青绿（≈#00d4aa），中性主体+单一饱和强调
- **可抄**：左右分栏叙事（文字解释 + 并列真实数据演示）；"单一强调色贯穿"与 FAR-Lab info 蓝策略同构，验证方向

### 3. GitHub Issues（microsoft/vscode）— case-github-issues.png
- 列表：顶部工具栏（按钮/搜索/筛选下拉/计数）→ 行式列表，每行 = 状态图标 + 标题 + 元信息（标签/参与者/时间），行高均匀、无卡片边框、靠 1px 分隔线分区
- 色彩：中性主导；饱和色只在状态图标（开放绿/关闭紫）与标签底色
- 标签形态：圆角胶囊 + 浅底色 + 深同色文字
- **可抄**：行式列表无卡片化（FAR-Lab RunsSidebar/EventsTab 同构）；标签胶囊规格；语义色仅出现在状态符号

### 4. Stripe Docs（docs.stripe.com）— case-stripe-docs.png
- 布局：顶部品牌导航 + 二级导航 + 模块卡片网格（每模块 3 链接）+ "试一试"区（左列表+右代码）
- 层级：标题/正文/链接三级字阶清晰；卡片细边框不重
- **可抄**：文档/阅读视图的信息架构（FAR-Lab PlanTab 报告阅读态）；左列表右详情的对照式呈现（已有 RetrievalPanel 同构，可强化）

### 5. Elicit（elicit.com 首页）— case-elicit-home.png
- 竞品（AI 科研工具）：白底、黑字、标题 "AI for Scientific Research"、研究论文表格演示
- **可抄**：白底科研感（FAR-Lab 亮色主题定位一致）；论文表格 = 行式 + 元数据列 + 状态标识

### 6. Raycast（raycast.com 首页）— case-raycast-home.png
- 层级：超大标题（≈48px/900 字重）vs 导航 ≈14px——**层级对比强度是视觉签名**
- 间距：大留白（副标题→按钮 ≈80px、标题→副标题 ≈32px、导航项 24px、按钮组 16px）
- 键盘符号 ≈12px 浅灰不干扰主内容
- **可抄**：标题层级对比强度（FAR-Lab h1 15px vs h3 13px 的扁平层级反面印证）；键盘符号的弱化呈现

### 7. Vercel Geist（vercel.com/geist）— case-vercel-geist.png
- 色板：8 色系（灰/蓝/紫/粉/红/橙/绿/青）可访问性色板
- 组件形态：细边框 ≈1px、小圆角 ≈2-4px、白卡片浮在浅灰底上
- **可抄**：小圆角纪律（FAR-Lab 现 6px 圆角可收敛到 4px 系）；1px 细边框 + 底色微差的卡片层次（不靠阴影）

### 8. Connected Papers（connectedpapers.com 首页）— case-connectedpapers-home.png
- 签名：主视觉区用**抽象学术图谱背景**（蓝绿节点+灰线条）直接传达产品本质——视觉符号 = 产品功能本身
- 色彩：白底 + 蓝品牌色（≈#0077b6/#005a87）+ 蓝绿节点；专业冷静
- 规格：核心标题 ≈36px 粗体、导航 ≈14px、搜索框高 ≈40px 圆角 ≈4px、按钮深蓝
- **可抄**：**签名元素 = 产品自身语义的抽象**（FAR-Lab 的 Evidence-line glyphs ✓✗▲– 是同构思路：证据语义即视觉签名，应放大为页面级元素而非 11px 徽章）

### 9. Semantic Scholar — case-semanticscholar-search.png
- 加载态 + Cookie 弹窗，无结果列表可见。仅记录：浅灰底 #f5f5f5、深灰字 #333。**不作为规格依据**

## 跨案例收敛（≥2 个独立案例才列）

| # | 收敛结论 | 案例出处 |
|---|---|---|
| C1 | 层级靠字号对比强度（超大标题 vs 小导航），不靠颜色 | Raycast、Linear、Connected Papers |
| C2 | 中性主体 + 饱和色仅出现在语义/状态/单一强调色 | 全部 8 个有效案例 |
| C3 | 行式列表不卡片化，1px 分隔线分区 | GitHub、Observable 底表、Elicit |
| C4 | 大留白用于区块级（32-80px），元素级紧凑（8-24px） | Raycast、Linear、Stripe |
| C5 | 细边框 1px + 小圆角 2-4px + 底色微差分层，不靠重阴影 | Geist、Stripe、GitHub |
| C6 | 签名元素来自产品自身语义的抽象（图谱/真实 UI 内嵌） | Connected Papers、Linear、Observable |
| C7 | 产品真实输出（代码/表格/图表）作为营销与空态的视觉主体 | Observable、Linear、Stripe"试一试" |
| C8 | 标签 = 圆角胶囊 + 浅底 + 深同色文字 | GitHub（与 FAR-Lab Badge 同构，规格可对齐） |
