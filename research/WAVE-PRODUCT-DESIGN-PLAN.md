# FAR-Lab 产品全景设计规划方案（Wave-PRODUCT 第一阶段）

> 状态：**用户裁决进行中（2026-08-22 第二轮）**——已批：叙事 A「科学方法操作系统」（锁定）、Tier-0 依赖 tailwind/lucide/sonner（批准）、**桌面框架三平台全做**（原"竞赛前不做"被用户否决，改为必做，Tauri v2 路线）。未决：**美学方向**（用户驳回首版三选为"AI 味儿重/无设计感"，要求设计学理论+大量真实案例深调研后重提）、部署形态细则。未经美学方向批准仍不进入实施。
> 每节标注【设计】/【决策】（交用户裁决）/【检查结果】。现状陈述基于主 Agent 逐文件实读；file:line 为短引用（api.ts=src/server/api.ts、main.ts=src/cli/main.ts、其余按 web/src|src 常位解析，全部经本会话亲验）。
> 证据来源：七线调研报告已落盘 `research/wave-product-reports/`（line-a-design-specs / line-b1-web-components / line-b2-desktop-frameworks / line-b3-cli-tui / line-d-trust-science-ui / line-f-competitor-product / line-g-design-benchmark，每条结论带来源 URL+核验日期，全部 2026-08-22）+ 八项审计（前序会话子 Agent 采集 + 本会话主 Agent 全量代码亲读复核定级；头条 2 项被复算驳回已如实记录，本会话另驳回 1 项/新增 6 项，见 §16）。
> **双会话合并披露（诚实）**：本方案由两个并行 Wave-PRODUCT 会话接力完成——前序会话产出全稿（其部分调研引用未落盘，本会话已逐条核对：有源者保留、无源者标注 UNVERIFIED-待核或改写）；本会话完成七线调研落盘 + web/src 全量 27 文件与 CLI/server/providers/docs 亲读复验 + 修订（§6/§7/§8/§9/§10/§11/§14/§15/§16/§17/§18 均含本会话修正）。
> 诚实铁律执行情况：无伪造截图/界面（全部示意图为文字线框）；未验证项标 UNVERIFIED（§11 证据天平原创范式、§14 平台实测缺口）；审计驳回项保留记录。

## 目录
1. 产品定义【设计】 2. 叙事与品牌【设计+决策】 3. 核心用户旅程【设计】 4. 信息架构【设计】 5. Web 体验蓝图【设计】 6. 桌面 GUI 蓝图【设计+决策】 7. CLI 体验蓝图【设计】 8. 视觉语言【设计+决策】 9. 过程可视化规范【设计】 10. 人工干预入口全集【设计】 11. 信任与科学呈现【设计】 12. 交付物设计【设计】 13. 运维与配置体验【设计+决策】 14. 多平台兼容矩阵【设计】 15. 文档体系规划【设计】 16. 八项审计结果汇总【检查】 17. 复用 vs 自建决策表【设计】 18. 实施路线图与风险【设计】

---

## 1. 产品定义【设计】

**用户画像**（基于现状与竞赛场景推导）：
- 主 persona：科研人员/研究生（会提研究问题、能读证据与假设、在乎可证伪性与溯源；不一定会部署服务）
- 次 persona：竞赛评审（快速理解能力边界与真实性的技术读者）；复现者（拿到导出包独立核验的第三方）

**JTBD**：①"给我一个真实研究问题，产出**有证据支撑、可证伪、可排序**的假设集与研究计划"（核心）；②"让我能监督/干预长任务并给反馈修订"（控制）；③"让我能向他人证明结果可信"（复现/交付）。

**市场结构判断**（线 F，11 产品公开面逐一核验，报告=research/wave-product-reports/line-f-competitor-product.md）：市场两极分化——"全自动 AI 科学家"（Sakana AI-Scientist、Robin）离产品化远且无人工科学方法约束；"文献助手"（Elicit/SciSpace/deep-research 类）停留在阅读/检索层。**中间地带"科学方法工作台"（人在环、证据约束、可证伪工程化）为空白**。

**FAR-Lab 已核实的无人区能力**（线 F 核实：11 个对标产品公开面均无对应，详见 line-f 报告独有能力矩阵；注意"别人也有"的项——引用绑定展示（Elicit/Scite/OpenScholar）、反方证据呈现、人机协同编辑——对外话术不得声称独有）：
1. Fail-closed 证据约束（claim 对不上来源即降级，绝不编造）
2. 第三方可复现导出（far verify 10 项独立核验）
3. 决策规则来源披露（decisionRuleProvenance 三档）
4. 多重检验纪律（POPPER multipleTestingPolicy）
5. 假说锦标赛排序（Bradley-Terry + 不确定性）

**推荐主叙事**："**科学方法操作系统**"——不卖"AI 答案"，卖"可审计的科学决策过程"。评审钩子=可证伪性工程化 + 可复现导出。
（候选叙事 B："假设的质检工厂"；C："把同行评审前置到假设生成"——供用户裁决，见 §2）

**成功标准**（与北极星对齐）：评审演示 10 分钟内完成"问题→证据→假设→证伪规范→排名→复现验证"全链可信叙事；用户首次成功 run ≤10 分钟（含配置）；verify 一次通过。

## 2. 产品叙事与品牌【设计+决策】（线 F 结论）

**故事线**（~~三候选供裁决~~ → **已裁决 2026-08-22：A 锁定**）：
- **A（锁定）"科学方法操作系统"**：不卖 AI 答案，卖可审计的科学决策过程。电梯稿："FAR-Lab 把'提出可证伪假设'变成一条每一步都有证据回执、可第三方复现的工程化流水线——它不保证给你对的理论，但保证你能看清每个假设为什么值得赌、怎么输、值多少。"
- **B "假设的质检工厂"**：证据=原料，可证伪性=质检标准，锦标赛=分级，输出=带合格证的假设。更工业化、更比喻化，风险=把科学简化为流水线惹恼方法论敏感的评审
- **C "把同行评审前置到假设生成"**：反证检索+弃权+多重检验=评审的内化。学术共鸣强，但"同行评审"术语有过度承诺风险（系统不是真评审）

**命名与术语体系**：产品名 FAR-Lab 保留（评审已见）；术语表=canonical domain 枚举的单点映射（§4 的 dict 同源方案）；对外话术禁用内部行话（run/stage 对外仍可用——目标用户是科研人员，pipeline 语汇天然亲和；Wave/决策号等内部词汇不入产品面）。

**品牌视觉身份**：与 §8.1 第二轮美学方向绑定（叙事 A 已锁→视觉以"证据排印"为主推荐：三声三字体+「证据行」签名+唯一 anchor 色；候选②仪器面板/③期刊版式，详见 §8.1 各自出处与风险）。【决策】随美学方向一并裁决。

**诚实即品牌的呈现纪律**：不确定性/弃权/三门状态不是脚注而是产品叙事主角（§11 范式落地）；"可复现导出"是唯一竞品没有的信任闭环（线 F 核实），一切对外材料必须演示 `far verify`。

## 3. 核心用户旅程（端到端）【设计】

**现状基线（主 Agent 实读）**：旅程已完整可走——新建（表单三字段+必填校验）→ 列表选中 → 概览（真实 n/9 进度+阶段时间线+失败详情）→ 七 tab 检视 → 取消/恢复（诚实禁用原因）→ 反馈（9 源×5 目标）→ 溯源 tab（回执表+bundle 验证+报告下载）。

**设计目标旅程**（差距用 ← 标注）：
1. **提问**：输入问题（+可选 domain/goalType）→ 202 → 自动选中跟踪。← 差距：无问题质量预检提示（太宽泛/非科学问题的即时引导）；无预估成本/token 透明
2. **监控**：概览 tab = 单一真相源（阶段时间线 11 阶段真实状态 + attempt 计数 + n/9）。事件流 2s 增量。← 差距：事件流是原始 JSON 事件列表（科研用户可读性待设计——阶段语义分组/关键事件高亮）；无"正在检索什么 query"的过程可见（检索阶段黑盒）
3. **检视证据**：来源表（深度/访问态/验证态/hash）→ claims（逐字绑定徽章+不确定性）→ 关系汇总。← 差距：关系可视化（claim↔hypothesis 支撑/反对网络）当前是文本列表；证据"天平"呈现待设计（§11）
4. **检视假设**：卡片（可测性/新颖性徽章+限定词/完整性检查/证伪规范九字段折叠/邻居文献）。← 差距：锦标赛排名（BT 分数+不确定性区间）在 HypothesesTab 有展示但排序依据/swap 一致性信号不可见（revisions tab 有 op-diff）
5. **人工干预**：取消（带已请求横幅）/恢复（阶段边界续跑）/反馈修订环。← 差距：无"暂停"语义（只有取消）；反馈目标 id 需手输（无从卡片一键"对此假说反馈"）
6. **导出与复现**：CLI `research export --format bundle` → `far verify` 10 检查独立核验；Web 溯源 tab 可验证+下载报告。← 差距：Web 无导出入口（reexport 死路由 P2）；verify 结果的可分享呈现（评审视角）待设计（§12）
7. **结果呈现**：报告 markdown 下载。← 差距：无 PDF/结构化交付物（§12 竞赛八要素）

## 4. 信息架构与导航（三表面统一信息模型）【设计】

**统一领域模型**（单一事实源=domain 枚举；三表面只做投影）：
Run（状态×9）→ Stage（11 阶段×5 态）→ Question → Sources（深度/访问/验证态）→ Claims（绑定态×4）→ Relations（supports/contradicts/qualifies/unknown）→ Hypotheses（可测性×4/新颖性×3/文献判定×4/完整性）→ Tournament（BT 分数+不确定性）→ Plan（+多重检验纪律）→ Feedback→Revision 环 → Receipts/Bundle/Verify。

**现状对照**：Web 7-tab 已是此模型投影（术语经 i18n 类型化词典——缺 key 编译失败，是三表面一致性的机制保障）；CLI 投影=运行控制+检视子集（`research inspect` 四投影，本会话更新）；导出报告投影=科学叙述。**已知破口**（§16）：导出报告原始枚举 vs Web 中文标签（P3）→ 方案：领域枚举→标签的映射表单点化（export.ts 复用 dict 同源 JSON，而非内联英文）。

**导航设计**：
- Web：保持"列表-详情-七 tab"两级（任务模型=选 run→检视/干预；导航深度 2 已证明足够，不增层级）；tab 顺序调整【决策】= 概览→证据→假设→**计划**→修订→溯源→事件（现状即此序，维持）
- 检索/过滤：runs 列表>50 时加状态过滤+搜索（当前数据规模小，机械加控件违反 PRODUCT_HCI §4——触发条件式设计）
- 跨表面跳转：CLI 输出带 Web 深链（`http://localhost:3196/?run=<id>`——Web 需支持 URL 参数选中 run，现状 selectedRunId 不入 URL【设计增量】）；报告 markdown 中 receipt id 可关联 Web 溯源 tab

## 5. Web 体验蓝图【设计】

**现状骨架保留**（审计证实健康）：列表-详情-七 tab 两级导航；自适应轮询（5s/3s/10s/2s seq 游标）；ARIA tablist+键盘导航；语义 token；i18n 类型化词典。

**页面/状态机呈现增量**（按价值排序）：
1. **检索透明面板**（证据 tab 顶部）：query plan（8 查询含反证查询标记）+ 各源命中数 + 各源健康态（OpenAlex 预算态/crossref 回退）——数据已在事件流，做结构化呈现
2. **锦标赛可视化**（假设 tab）：BT 分数分级置信带（§11 范式）替代/补充现有表格；swap 一致性信号入列（数据在 revisions）
3. **假说卡片操作**：一键"反馈此假说"（预填 target）；假说间对比视图（2-3 个卡片并排，证据重叠度显示）
4. **导出入口**：概览 tab 加"导出报告/bundle"按钮（打通 §16 审计 8 的 reexport 死路由 + Web 无导出缺口——服务端 reexport 已带三重守卫）
5. **URL 状态**：selectedRunId/tab 入 URL query（可分享/可回退/CLI 深链前提，§4）
6. **事件流分层**：阶段分组折叠 + 关键事件高亮（§9）
7. **设置页**：路由/密钥状态/数据管理入口（§13）
8. **i18n 补洞**：10 处硬编码中文错误消息收编入 dict（§16 审计 5 P2）；EventsTab polling 指示 i18n 化
9. **冻结可见性**（本会话新增）：概览对 status='running' 但长时间无事件推进的 run 显示"疑似冻结"提示+恢复指引（数据源=API 暴露 lease 或健康面；与 §9 watchdog 事实配套——现状 Web 完全不可见）

**动画规范**：现状唯一动画=骨架脉冲（功能性+reduced-motion 降级）——维持；新增动画仅限状态转移（tab 切换焦点/置信带 hover），无入场装饰动画。

**状态机呈现纪律**（延续 §9）：所有新面板从真实事件/对象渲染；无数据的检查项显示"未产生"而非隐藏。

## 6. 桌面 GUI 蓝图【设计+决策】（线 B 决策矩阵）

**框架决策矩阵**（本会话以 line-b2 报告官方源核验数据重写——前稿的 3-10MB/80-200MB/~5× 数字无来源已撤换）：

| 维度 | Tauri v2 | Electron |
|---|---|---|
| 当前稳定版 | v2.11.5（2026-07-01；GA 2024-10-02） | v43.4.1（2026-08-19；8 周一版、只保 3 版，E43 支持至 2027-01-05） |
| License | MIT OR Apache-2.0 | MIT |
| 体积 | 官方仅"最小 600KB"一句；第三方（Firezone）实测下载 8-12MB | **无官方数字**（FAQ 已核验为空） |
| 内存 | **无官方数字**；第三方实测 GUI 常驻约 100MB | 无官方数字（自带 Chromium，量级常识更高但以实测为准） |
| 系统要求 | Win7+/WebView2（Win10 1803+ 预装）；macOS 10.15+；Linux 需 webkit2gtk-4.1（Debian 12+/Ubuntu 22.04+ 才有该包） | 自带 Chromium，发行版兼容面更宽 |
| Linux 已知坑 | WebKitGTK 驱动冲突（NVIDIA/Wayland 崩溃，公开 issue 有案）+ 发行版 webkit 碎片化 | 刚性升级节奏、体积 |
| 更新机制 | 内置 Updater 插件 | autoUpdater 内置但 Linux 无官方支持（electron-updater 非核心） |
| 安全模型 | capability 权限清单（最小授权面） | contextIsolation/sandbox 默认开，但主进程全 Node 权限需自律 |
| 与现有资产关系 | 前端无关——web/dist 直接装入 webview；Node server 可 sidecar 或连接既有进程（三方案利弊见 line-b2 报告） | 主进程可直接管理 Node server 进程 |

**推荐**【决策→**已裁决 2026-08-22：必做**】：用户否决"竞赛前不做"——**桌面壳三平台（Windows/macOS/Linux）全部实施**，路线=Tauri v2（体积/内存优势、capability 安全模型契合本地单机工具），代价=Rust 工具链+Linux webkit2gtk 支持面（Debian 12+/Ubuntu 22.04+）+三引擎测试矩阵，全部接受；桌面壳=纯 webview 装现有 Web（PRODUCT_HCI §1.2：wrapper 不建第二套业务逻辑）。
**监控面板设想**（触发后）：常驻小窗=run 状态/阶段进度/三门健康；主窗=完整 Web；托盘通知（完成/失败/冻结恢复）。无头 Linux 恒有 Web/CLI 降级（§14）。

## 7. CLI 体验蓝图【设计】

**现状基线（本会话主 Agent 实读 src/cli/main.ts 复验）**：命令面 = runs / verify / research **start|status|inspect|cancel|resume|export|feedback**（`inspect --sources|--evidence|--hypotheses|--plan` 为 W8 会话新增的检视投影，main.ts:26,153-192）；--json 机器可读模式全命令支持；退出码语义（verify verdict→0/1，参数错→2，dist 陈旧拒跑=3，main.ts:9-17）；`status` 已含 W8 冻结检测展示——lease 状态 + `status='running'` 且租约过期时显示 `[FROZEN — resume to recover]`（main.ts:144-148）；printRun 人类可读输出（状态+阶段+attempt+错误原文）；--help 完整。已达 PRODUCT_HCI §8 基本盘。

**设计增量**（按价值排序）：
1. **进度观感**：`research status --watch`（轮询式阶段推进显示——复用 Web 的自适应轮询策略；显示 n/9+当前阶段+attempt+冻结态，无百分比无 ETA）。**现状纠正（本会话实测代码）**：`research start` 为**同步阻塞执行**——main.ts:125 `await orchestrator.execute()` 直至终态才返回（租约制单写者，orchestrator.ts:121-138；"创建即返回"的旧记载描述的是 API 202 路径而非 CLI）。设计决策【决策】：维持同步为默认（单用户直觉）+ 增 `--watch`（前台观察）与可选 `--detach`（对齐 API 的 create-and-poll 语义）；二者都以真实轮询实现，无假进度
2. **彩色纪律**：状态着色（ok=绿/fail=红）但遵守 NO_COLOR 与非 TTY 自动禁用（§8 规范统一；线 B3：NO_COLOR 官方语义=存在且非空即关色）；信息密度优先
3. **交互提示符**：不加交互式 REPL（最小架构：现有一次性命令 + --json 组合已覆盖自动化与人类两态；REPL 是桌面/Web 的领地）
4. **错误三段式**：CLI 错误输出对齐 §15 错误码体系（FAR-E-* 前缀 + 一句人话 + 下一步命令建议——现有 die() 只有消息）
5. **检视面维持现状不扩张**（本会话修订）：`inspect` 四投影已存在（W8 落地），保持只读窄面不加新子命令；表格输出 runs 列表对齐列宽（现状 padEnd 已做）。理由=双表面术语一致性成本与维护面（线 B3 结论同向：CLI 真实缺口是宽度感知对齐+受控颜色，非组件框架）

## 8. 视觉语言【设计+决策】（线 A + 现状基线）

**现状基线已达标**（styles.css）：语义 token/明暗自动/焦点环/对比度注明/中文字体栈/装饰禁令遵守。**本节=第二轮深调研后的系统化重设计**（五份报告：design-r1 理论源流 / r2 科学工具案例×10 / r3 顶级产品案例×10 / r4 反AI味+字体核验 / r5 中文排版 clreq+动效学，全部 2026-08-22 核验，报告在 research/wave-product-reports/）。

### 8.0 反 AI 味底线（先立规矩再谈方向）

- **判别学落地**（r4，源=impeccable.style《Slop》64 模式 59 确定性检测规则 + HN 四高票讨论 + Alex Murrell《The Age of Average》）：被点名字体 Inter/Geist/Space Grotesk/Instrument Serif **不作主字体**（法律可用但"主动选用即穿 AI 制服"）；三种 AI 簇（暖米色+衬线+赤陶 / 近黑+荧光绿 / 报纸细线风）全部不取。
- **现状自查发现（本会话）**：run-item 左侧 3px accent 边条（styles.css:188 `border-left: 3px solid`）恰是 slop 检测器点名的**最高识别度 agent tell（"75%+ agent 会选侧 tab accent border"）**——现行 UI 自带最强 AI 味特征，期 5 必除（改非边条式选中态：背景层/指示符位移）。
- **个性来源原则**（r3+r4 收敛）：Linear/Stripe/Figma 共性=**个性来自信息结构与排印决策，不来自装饰**；Arc 纪律="个性预算集中花在一个锚点上"。

### 8.1 美学方向三选（推荐①，每个决策可溯源到报告）

**①「证据排印 Evidence Typography」（推荐）——把"科学陈述的排印"本身做成签名**
- **概念**：界面=现代实验记录本。三种声音三种字体（先例=Observable 实测三栈：内容 Source Serif 4 + sans UI + mono 代码；Overleaf 工具字/文档字分离）：
  - **UI 声（仪器）**= IBM Plex Sans（OFL 逐字核验；IBM 工程血统=真实科学传统而非贴皮）
  - **数据声（溯源）**= IBM Plex Mono——一切 receipt/hash/时间戳/token 数/退出码
  - **陈述声（科学）**= 思源宋体 / Source Serif 4——研究问题、假设陈述、报告结论（衬线=论文语域）
  - 中文= Noto Sans SC（UI 声）+ 思源宋体（陈述声），全部 OFL
- **签名元素（大胆只花一处）=「证据行」**：每条科学陈述自带行内溯源元数据（等宽/小号/灰阶）+ 认知状态前导符（✓ 已验证 / ✗ 已反驳 / ? 未知 / – 未评）。来源：JupyterLab `In[n]` "可信任单元格"语义 + Git blame 悬停；r2 头号结论=**十个科学工具无一有"UNVERIFIED/已反驳/证据冲突"视觉语义——FAR-Lab 独有责任区，竞品无法抄走的签名**
- **色彩**：Stripe 官方方法论=CIELAB **等对比度等级制**（同 level 全色相同对比度、配对硬规则——r3 称"AI 配色的结构性解药"）+ 灰阶用 Geist 十刻度语义结构（400=边框/900=次级文本）+ Carbon 状态色四件套（含 **undefined 专属紫——直接映射 UNKNOWN 态**）+ Braun ET66 实证纪律（V&A 馆藏：等号是全机唯一黄）→ **全界面一个 anchor 色只给"已验证证据"，唯一才醒目**
- **密度与线条**：Tufte data-ink——1px 分隔线替代卡片框（一条线能解决的不画盒子）；small multiples 用于阶段时间线；表格数字全 `tabular-nums`（AntD 明文推荐）
- **排印底线**（Butterick 18 条取核心）：正文 14px/1.6/行宽 45-90 字符；全大写+5-12% 字距；两段式字体——chrome 系统栈、**大段中文显式 CJK 栈**（MDN 警告 system-ui 不宜中文长文，r5）
- **中文细则**（clreq=Group Note Draft **非 W3C 标准**，如实）：中西间距=1/4 字宽（排版层实现，非"手打空格"教条）；禁则 basic 级；字号下限 12px（正文 14/数据 13.5/极限 12——AntD v5 正文 12→14 公开依据）
- **动效白名单 7 条**（r5，每条带出处）：骨架脉冲/tab 焦点转移/折叠展开/新事件淡入/toast 进出/按压确认/阶段完成一次性标记；M3 **Standard**（官方明示 Web 不支持 Emphasized）：面内 300ms/进入 250ms decelerate/退出 200ms；`prefers-reduced-motion` 全降级 opacity；黑名单：入场装饰/视差/自动轮播/悬停弹跳
- **为何不是 AI 味**：三栈有真实科学工具先例；签名由产品本体（fail-closed 认知状态）推导；字体避开 slop 名单；零装饰
- **风险**：思源宋 web 分发体积（子集化或本地回退）；三栈纪律需执行自律（排印 lint 兜底）

**②「仪器面板 Instrument Panel」——Braun 遗产直接继承**
- Archivo（OFL）+ JetBrains Mono（OFL）+ MiSans（官方 FAQ 免费商用+可嵌入，但禁改/禁单独分发/须署名——分发边界需合规处理）
- 浅暖中性机身+功能分色（ET66 实证：机身黑/功能键棕绿/运算符亮绿/等号唯一黄）；极高密度；按压态物理感
- 适合强化"运行/监控"面；风险：工业感压过学术语域；MiSans 分发合规成本

**③「期刊版式 Journal Setting」**
- Source Serif 4（OFL）为主界面声音+留白+Tufte 脚注式溯源；最贴"论文级交付物"
- 风险：操作面（表单/按钮）用衬线易迟滞；本质是①的子集（①已含衬线陈述声）

**推荐①的论证**：①是②③的母集——②的密度与功能色纪律、③的衬线语域均被①吸收；而①的三栈+「证据行」签名是唯一**由产品本体推导**（溯源/认知状态=fail-closed 命题）而非外部风格搬运的方向。对"最真实"诉求：每个决策可溯源到五份报告的具体条目。

### 8.2 token 体系（方向① 实施草案，定稿在期 5 前做等对比度计算）

| 组 | 决策 | 出处 |
|---|---|---|
| 色彩 | OKLCH 构建；中性 10 刻度语义命名；状态色=Carbon 四件套+undefined 紫；anchor 唯一（候选色相 2-3 个实施期以 CIELAB 等级制计算后提交） | r1/r3 |
| 字体 | 三栈：Plex Sans 14/1.6 正文·Plex Mono 数据·思源宋陈述；Noto Sans SC 中文 UI；全大写+8% 字距 | r2(Observable)/r4(OFL) |
| 字阶 | 五层：页面 20/28·陈述 17/28 衬线·正文 14/22·标签 12/18·元数据 12 mono（下限 12px） | Butterick/r5 |
| 间距 | 8px 基网格+光学对齐修正；两档密度 default/compact（compact=监控默认） | r1(网格)/r3(Carbon) |
| 圆角 | 4px 单值（数据区 2px） | r3(Geist 更严版) |
| elevation | 三级受控阴影+彩色阴影禁用；分隔线优先于盒子 | r1(Comeau 三律) |
| 动效 | 白名单 7 条；Standard 300/250/200ms；reduced-motion 全 opacity 降级 | r5 全表 |

### 8.3 方向① 定稿提案 v1（frontend-design skill 全流程产物：token 系统→线框→反通用自审）

**色彩论文：「无彩色界面，彩色即证据」**——chrome 全中性（连主按钮都是近黑，无品牌 accent 色）；饱和色**只**出现在认知状态语义上。看到绿色=已验证证据，看到紫色=未知。这使"彩色"本身成为 fail-closed 命题的视觉签名（AI 味设计到处泼 accent，此处反其道）。

**色板（全部实算验证，零口说；脚本 `spikes/design-palette-probe.mjs`，数值 `research/wave-product-reports/design-palette-v1.json`；OKLCH→sRGB 按 CSS Color 4 矩阵，对比度按 WCAG 相对亮度公式）**：

亮色（surface `#fafcfe`）：
| token | hex | 验证 |
|---|---|---|
| text-1 主文本 | `#4b4d4f` | 8.26:1（≥7 过 AAA 级） |
| text-2 次文本 | `#717375` | 4.63:1（≥4.5 过 AA） |
| text-3 占位 | `#909295` | 3.03:1 |
| 表单边框 | `#909295` | 3.03:1（WCAG 1.4.11 非文本 3:1——**现行 UI 的浅边框不达此线，此为修复**） |
| 主按钮底 | `#0f1215` | 白字 18.79:1 |
| verified 已验证 | text `#2c8447` / tint 底 `#ddfbe2`（tint 上专用深文本变体再验 4.51:1） | anchor，受保护 |
| refuted 已反驳 | `#c44c44` / `#ffe7e2`（on-tint 4.55:1） | |
| unknown 未知 | `#8463b8` / `#f6ecff`（on-tint 4.57:1） | Carbon undefined-紫映射 |
| caution 弱化 | `#8a7300` / `#fbf2d0`（on-tint 4.62:1） | |
| info 运行中 | `#2d78bd` / `#dcf5ff`（on-tint 4.57:1） | |

暗色（surface `#151719`）：text-1 `#acaeb0` 8.07:1 / text-2 `#7e8082` 4.53:1 / 表单边框 `#636567` 3.07:1 / 主按钮=高亮中性 `#d4d8dd`（黑字 13.19:1）/ 五状态色各有暗色变体（如 verified `#3f9557` 4.83:1，tint `#0f2e17` 上 4.52:1）——全部过线，见 JSON。焦点环=text-1 同色（vs pageBg 7.69:1，SC 2.4.11 过）。
方法论注记：状态色每色**双文本变体**（on-surface 与 on-tint 各自独立搜索 L 满足 4.5:1，Primer/Carbon 同法）——初版 on-tint 全 FAIL（3.7-4.15:1）被自己的验证脚本抓出后修正，这就是"计算而非目测"的价值。

**字阶 specimen（三声制）**：
| 声 | 字体 | 规格 | 用途 |
|---|---|---|---|
| 陈述声 | 思源宋体 SemiBold（中）/ Source Serif 4 SemiBold（西） | 17/28 | 研究问题、假设陈述、报告结论 |
| UI 声 | IBM Plex Sans | 正文 14/22 · 标签 12/18 · 页题 20/28 Medium · eyebrow 12px+8% 字距 | 界面 chrome |
| 溯源声 | IBM Plex Mono | 12/16（.92em）· 全数据列 `tabular-nums` | receipt/hash/时间戳/ID/BT 分数 |

**线框一·工作台**（选中态=整行底色变化，**无左侧彩条**——slop 头号 tell 已除）：
```
┌────────────────────────────────────────────────────────────────┐
│ FAR-Lab · 科学方法工作台                        中文 | EN        │ ← chrome 全无彩
├───────────────┬────────────────────────────────────────────────┤
│ 研究 run (3)  │ run_k3f9 · 概览                                  │
│───────────────│────────────────────────────────────────────────│
│ ● run_k3f9    │ 问题（陈述声·衬线）                               │
│   running 6/9 │ 「什么机制驱动医院环境中抗生素耐药基因的水平转移？」 │
│───────────────│ ────────────────────────────────────            │
│ ○ run_a82d    │ 阶段时间线（small multiples·1px 线·无卡片框）      │
│   completed   │ scope✓ retrieve✓ verify✓ evidence✓ hyp ⋯        │
│───────────────│        42s     1m10s    8s    2m03s             │
│ ○ run_c71f    │                                                  │
│   failed ✗    │                                                  │
├───────────────┤                                                  │
│ + 新建研究     │                                                  │
└───────────────┴────────────────────────────────────────────────┘
```

**线框二·证据行（签名元素解剖）**——状态前导符是界面里唯一彩色的地方：
```
✓ c_07  已验证·逐字                                    claim_8xk2
  「TLR9 激活与无转移生存相关（HR 0.62, 95%CI 0.45–0.86）。」      ← 陈述声（衬线）
  └ openalex:9f3a · §Results ¶3 · 校验=verbatim · 2026-08-22     ← 溯源声（等宽·灰）

✗ r_02  相反证据                                       rel_q71m
  「队列 B（n=1,240）中该相关不显著。」
  └ claim_c4d1 ← contradicts ← hyp_h2 · strength=moderate         ← 等宽
```
前导符集：`✓` 已验证（绿）/ `✗` 已反驳（红）/ `？` 未知（紫）/ `–` 未评（灰）/ `▲` 弱化（琥珀）。

**线框三·假说卡**：
```
H2 · 假说（v3）                    [可测:现在] [新颖:证据接地 ？语料相对]
「耐药元件通过外膜囊泡转移，速率受膜应力调控。」                    ← 衬线陈述声
机制：…（UI 声 14px）
证伪规范 ▸（折叠）: 观测=囊泡转移率 · 判定规则=HR<0.8 支持…
证据：✓×3（c_07 c_12 c_31）  ✗×1（r_02）  ？×2
BT #1/5 · 0.62 [0.51–0.73] · swap 一致 15/15                     ← 等宽 tabular
[对此假说反馈]                                                    ← 近黑按钮
```

**反通用自审（skill 第二遍：逐元素问"给任何类似 brief 我会不会也产出这个"）**：
- 初稿"verified 处处绿 tint 徽章"→ **修订**：彩色预算纪律——密集列表中状态=前导符+文字（无 tint 底）；tint 底只保留给三类时刻（失败横幅/部分结果/弃权说明），否则绿成海洋=又一种噪声
- 初稿主按钮蓝色 → **修订**：近黑。蓝色会与 info 状态色争抢，破坏"彩色即证据"论文
- **如实承认**：近黑按钮+灰阶边框本身已是常见组合（Geist 风）——接受它作为"安静的底座"，个性预算全部花在三声排印+证据行签名（skill：大胆只花一处）
- 待裁决的开放选项：是否把「？ 未知」紫作为交互焦点的微 accent（增强独特性但引入第二彩色语义，我倾向不用）
- 线框全部为文字示意（诚实铁律）；真实渲染效果在实施期以真实 run 数据验证，不用 mock 截图冒充

**裁决优先级梯子**（不变，全产品生效）：**可访问性(WCAG 2.2 AA) > 学术诚信(诚实呈现) > 任务效率(密度/布局) > 品牌表达**——任何视觉决策不得为美观牺牲前两级。8.3 的色板即按此梯子生成：每个颜色先过数学验证再谈观感。

**可访问性数值基线**（核实自 W3C）：正文 4.5:1/大字 3:1/UI 组件 3:1（SC 1.4.3/1.4.11）；目标 ≥24×24px（SC 2.5.8）；焦点指示器对比 ≥3:1（SC 2.4.11）。CI：axe-core 自动检测阻断。

## 9. 过程可视化与状态监看规范【设计】

**现状达标项**（保留；本会话复验+补充）：n/9 计数进度（非百分比——PRODUCT_HCI §2 合规）；11 阶段时间线含未开始灰态（不隐藏）；attempt 计数显示于 running 态；失败阶段列表+lastError 原文；断连横幅+自动重试（connection.tsx 从不乐观置在线——首报后才可离线，诚实）；轮询暂停/恢复（页面可见性）。**可靠性用户面已落地件（W8，本会话核验）**：CLI `status` 冻结检测展示（main.ts:144-148）+ server 端 watchdog 对 status='running' 且租约过期的 run 在 30s 轮询周期内自动领养续跑并记 `watchdog_adoption` 事件（api.ts:184-202）——崩溃/冻结的检测与恢复已从"手动 sweep"升为自动（北极星 run-reliability 的用户面）。**残余缺口**：Web 端看不到冻结推断（lease 未暴露——§5 增量 9）。

**设计规范**（新增，全部真值驱动）：
- 阶段时长：done 阶段显示实际耗时（startedAt/endedAt 已在数据中）——服务真实测量，非 ETA
- 检索透明：retrieve 阶段展示 query plan（8 查询含强制反证查询）与各源命中数——数据在事件流中，需结构化呈现
- 事件流分层：默认按阶段分组折叠，关键事件（失败/重试/降级）高亮；原始 seq 视图保留为"开发者视图"
- 禁止项（延续）：无 ETA、无假百分比、无装饰动画；不确定即"未知"

## 10. 人工干预操作入口全集【设计】

| 干预 | Web | CLI | 降级（无头/无图形） |
|---|---|---|---|
| 新建 run | 表单 | `research start` | API POST |
| 取消 | 按钮（诚实禁用+已请求横幅） | `research cancel` | API POST |
| 恢复 | 按钮（阶段边界续跑+反馈重启语义） | `research resume`（跨进程租约：他人持有时报 RunLeaseHeldError，orchestrator.ts:17-20） | API POST |
| 反馈 | 表单（9 源×5 目标） | `research feedback`（main.ts:253-291 已核） | API POST |
| 检视证据/假设/计划/来源 | 七 tab | `research inspect --sources|--evidence|--hypotheses|--plan`（main.ts:153-192，W8 已落地） | API GET |
| 重导出 | **缺口（死路由）**→ 补入口 | **缺口** → `research export` 幂等重跑 | API POST reexport |
| 验证 bundle | 溯源 tab（发现的 bundle chips+手输） | `far verify`（exit code 语义） | API GET |
| 冻结检测/恢复 | **缺口（本会话新增）**：lease 不暴露给 Web——需 API 增 lease 字段或 health 面，概览显示"疑似冻结+恢复指引" | `research status` 已显示 lease+[FROZEN]（main.ts:144-148）；server 端 watchdog 30s 自动领养续跑（api.ts:184-202） | 同 CLI/API |
| 暂停 | **设计决策【决策】：是否引入 pause 语义**（当前取消+恢复已覆盖，pause 增加状态机复杂度——推荐不加，用"取消+可恢复"话术替代） | — | — |
| 对特定假说反馈 | **设计**：假说卡片一键"反馈此假说"（预填 targetKind/targetId） | `--target-kind/--target-id` 已支持 | API POST |

## 11. 信任与科学呈现【设计】（线 D 结论）

**设计原则**（线 D 已核验来源）：明确展示"不确定/弃权"的表达能降低用户过度依赖——Kim et al. "I'm Not Sure, But…"（**CHI 2024**，经 NN/g 2025-02 文转述+检索快照核验；ACM 全文 403 未直接核验，如实标注）——弃权必须是一等状态。（前稿"CHI 2023 实证"系年份误记，本会话更正。）

**领域概念→呈现范式映射**（线 D 六子题 → FAR-Lab 八概念）：

| FAR-Lab 概念 | 采纳范式 | 交互要点（线框粒度） |
|---|---|---|
| BT 分数+不确定性 | 分级置信带（Wilke dataviz ch16）+ 透明主柱误差条（Datawrapper 抗 within-the-bar bias） | hover=点估计+区间+N；柱体透明化使区间两侧视觉等权 |
| 证伪规范三分支（支持/弱化/证伪） | Kialo 式 pro/con 论证树 | 支持绿色枝/反对红色枝/强度标注（✅强 ⚠️弱 ❌已证伪）；底部平衡指示条 |
| uncertainties 数组 | 多层置信带 + Evidence Gap Map（PCORI 范式） | 二维散点：研究质量×效应方向；灰=证据空白一眼可见 |
| decisionRuleProvenance 三档 | 引用色标（Zotero/Paperpile 范式） | 🟢evidence-derived/🟡community-standard/🔴model-stipulated——阈值来源一眼可辨 |
| 诚实弃权（P5） | 弃权一等状态徽章（Kim et al. CHI 2024，经 NN/g 转述核验——见本节来源状态披露） | 独特色系（不与成功/失败混淆）+置信度+阈值+缺失原因+三出口（看原始信号/调阈值/人工裁定） |
| 非 live 回执警告 | Dagster stale asset 范式 | 现状已有 callout（ProvenanceTab nonLiveWarn）——保持并推广到一切非 live 工件 |
| bundle verify 10 检查 | CI check-run 徽章组 + Etherscan 式详情 | 默认语义状态词折叠、hash 主动展开才显示+一键复制；hash 等宽字体置顶 |
| claim→来源绑定 | Git blame 式悬停溯源 | claim 悬停→来源引用+绑定状态+提取时间；未对齐绑定即降级提示（现有 binding 徽章保留） |

**原创范式缺口**（线 D UNVERIFIED 如实记录）："红蓝对抗证据天平"无成熟产品案例——基于论证树+Gap Map 元素原创，标注为设计假设需用户测试验证。
**来源状态披露（本会话核对）**：上表已核验来源=Wilke ch16 误差条纪律/GRADE 森林图/Primer 空态五件套/Perplexity 盾牌标签/Scite 三分类/NNg+CHI 2024/Model Cards/Datasheets（详见 line-d 报告 P1-P25）；表中具名的 Kialo、Datawrapper、PCORI Gap Map、Zotero/Paperplug、Etherscan、Dagster stale、Git-blame 悬停等**产品范式名为前序会话调研遗留、报告未落盘——本会话未核验，标 UNVERIFIED-待核**；但对应映射要点（pro/con 树/透明误差条/色标/等宽 hash 置顶）本身为无依赖可实现的设计选择，采纳与否不依赖那些具名产品是否如此做过。
**映射实现原则**：以上全部为 React 无依赖可实现（SVG/CSS）；引图表库的决策入 §17。

## 12. 交付物设计【设计】（竞赛八要素视角）

1. **技术方案 PDF**：信息设计 = 结论前置 + 证据链可下钻；结构建议：一页架构图（C4）→ 能力叙事（5 无人区）→ 诚实边界（三门/不确定披露）→ 复现指引；图表规范见 §15（Nature 级图注）；数字全部实跑带证据引用（延续 D-022 复算纪律）
2. **演示视频（≤10 分钟）脚本框架**（分镜级，待用户批准后细化）：0-1min 问题输入（真实科研问题）→ 1-3min 检索透明性（query plan+反证查询）→ 3-5min 假说卡+证伪规范+锦标赛 → 5-7min 反馈修订环（人在环）→ 7-9min `far verify` 独立核验 + 复现包内容 → 9-10min 诚实边界（不确定性/弃权/三门状态）。原则：全程真实 run 录制，无剪辑造假；失败路径若出现如实展示恢复
3. **可调用测试 API**：现有 /api/v1 15 端点即测试面（33 项 api.test.ts）；增补：一键演示脚本（seed run + verify walkthrough）+ API 参考（§15 Reference 层）
4. **复现包体验**：verify 10 检查报告的用户可读呈现（§11 线 D 结论汇聚后细化）

## 13. 运维与配置体验【设计+决策】

**现状基线（主 Agent 实测盘点）**：
- 配置面 = **20 个环境变量**（3 模型路由 ×key/model/base + OPENALEX 4 项 + FARLAB_DATA_DIR/GIT_COMMIT/STRICT 等）——全 env、无配置文件、无首启引导；错配行为 fail-closed（unknown provider 直接抛错拒绝静默回退，providers/index.ts:58-65）
- 数据：`.far-run/`（sqlite far.db + WAL + artifacts/ + exports/）单目录，可整体备份；无清理/导出导入工具
- 启动：`npm run build && npm run serve`（3196）或裸 `node dist/server/main.js`（8787）——**双入口双默认端口**（§16 审计 1 发现）
- 健康检查：无 /health 端点（连接状态靠前端轮询 runs 推断——App.tsx online 标记）；无自助诊断命令

**设计**：
1. **首启引导**：首次运行检测（.far-run 不存在）→ CLI 输出三步引导（选路由→配 key→验证 probe）；Web 首页顶部引导条（可关）。检测点真实（目录存在性），不发明状态
2. **密钥体验闭环**：引导-验证-提示。每路由一命令 probe（`far probe deepseek`——复用 spikes/qwen-route-probe.mjs 模式）；验证结果三态（就绪/缺 key/余额耗尽——与 D-036 实测分类对齐）；Web 设置页只显 env 变量**名**与状态（值永不入前端——listProviders 已是此纪律）
3. **统一入口**【决策】：收敛为 `npm run serve` 单一推荐入口（README 主推）；裸 main.ts 保留但文档明确其为开发者路径且端口不同；或统一默认端口（3196）消除分裂——推荐后者
4. **健康检查**：GET /api/v1/health（真实现：DB 可读 + provider liveReady 状态 + 版本/GIT_COMMIT）——替代前端"能列 runs 即在线"的推断
5. **数据管理**：`far data info/clean/export`（runs 计数/体积、按年龄清理、整目录导出）；增长当前无界（WAL+artifacts）——首版至少给 info
6. **升级迁移**：sqlite schema 当前无版本迁移机制（store.ts 直建）——若 schema 演进需迁移层；当前版本内无需（记录为风险非即建）
7. **部署形态**【决策】：竞赛演示=单机本地（默认）；服务器多用户=远期（当前无鉴权面，XSS 已审但 API 无 auth——多用户前必须加鉴权，记为前提条件而非本期）；无头=CLI/API 已是完整降级形态（§14）

## 14. 多平台兼容矩阵【设计】

| 能力 | Windows | macOS | Linux 桌面 | Linux 无头 |
|---|---|---|---|---|
| CLI 全命令 | ✅（本工作区即 Windows 实测） | ✅（Node 跨平台；路径处理已 cwd-relative 化） | ✅ | ✅ |
| Web 工作台 | ✅ 浏览器 | ✅ | ✅ | ⚠️ **本会话纠正**：`HOST=0.0.0.0` 不足以开放远程访问——F-1 安全守卫只放行 loopback Host/Origin（api.ts:600-616，DNS-rebinding/CSRF 防护），远程浏览器会被 400 拒绝。远程形态=【决策】显式安全开关（如 FARLAB_ALLOW_REMOTE + token 鉴权）后才可用，当前按"本机单用户"设计是**有意的安全边界**而非缺陷；无 JS 降级=无（SPA 依赖 JS——诚实标注） |
| 桌面 GUI | 竞赛前不做；若做= Tauri v2（§6 决策矩阵） | 同左 | 同左（Linux 支持面 Debian 12+/Ubuntu 22.04+） | N/A（CLI/API 完整替代——inspect/runs/verify 全命令在位） |
| 已知平台坑 | Git Bash tar/路径（内部已档） | — | — | 轮询页面不可见时暂停（已实现） |

**跨平台声明纪律**（PRODUCT_HCI §1.2）：本矩阵"✅"中仅 Windows 为本工作区实测；macOS/Linux 为代码层推断（Node/浏览器跨平台性质），交付前须各平台实测一次才能宣称——【检查结果】当前 README 未做平台声明（诚实：未宣称即未夸大，合规）。

## 15. 文档体系规划【设计】（线 E 结论 + 现状）

**现状**：README（诚实、命令级、含三门披露）+ START_HERE（会话入口）+ TESTING.md（手工走查）+ project-spec/ + 控制面文档。缺口：用户指南/API 文档/教程不存在；README 测试数随并行开发漂移（274→332 本会话时点，持续漂移中）；README:14 快速开始含一条不存在命令（§16 审计 7 P2）；START_HERE "web/ later" 过时。

**信息架构**：采用 **Diataxis 四象限**（Tutorial→How-to→Concepts→Reference，业界五标杆 Stripe/Tailscale/Rust/Next.js/Python 共同模式）：
- **Tutorial**（评审 5 分钟路径）：一个真实问题跑通全链 → 对应竞赛演示脚本（§12）
- **How-to**（科研用户任务导向）：提交问题/中断恢复/反馈修订/导出复现/换模型路由/配 key
- **Concepts**：证据约束哲学/可证伪性工程化/锦标赛与不确定性/回执与 provenance——面向论文与评审深读
- **Reference**：CLI 全命令/API 15 端点/错误码表/术语表/配置项

**工具决策【决策】**：文档站点 **@docusaurus/core v3**（MIT，3.10.2/2026-07-10；**包名更正（line-b1）**：npm `docusaurus` 是 2021 年 v1 遗留包勿装，须用 `@docusaurus/core`；官方 `@docusaurus/theme-mermaid` 可直接渲染架构图）。竞赛前优先级：Markdown 文档集 > 站点化（站点化可后置）；备选 Starlight（0.41.7，MIT，ADAPT）。

**规范采纳**：
- 中文写作规范 v1.0 = 中文文案排版指北（sparanoid/chinese-copywriting-guidelines）——**License 更正（本会话 line-b1 实查）**：仓库 LICENSE 原文=**MIT**（2023），历史流传的"CC BY 4.0"声称未获证实（GitHub API 亦报 MIT，官网 404）——按 MIT 使用，规则内容（中英之间加空格/全角标点/数字用阿拉伯）照常采纳；textlint 自动检查入 CI；**textlint 中文规则族实查为停更状态**（textlint-rule-zh-* 停在 0.0.3/2021-06，line-b1 判 REJECT）→ 制度性方案=textlint 本体（15.8.0 活跃）+ prh 自写中文词典（修复审计 5 分隔符混用 P3）
- 架构文档 = **arc42 为骨 + C4 为肉**（C4 Level-1+2 一页图入 PDF；mermaid 绘制导出 SVG，≥300DPI；图注规范：编号/单位/来源/自包含——Nature 级图注纪律）
- ADR = Nygard 模板；FAR-Lab 已有 DECISIONS.jsonl（更细粒度），方案：技术方案 PDF 附录选摘 5-8 条关键决策改写为 ADR 格式
- **错误码体系**：FAR-E-{域}-{4位}（MODEL/DATA/API/AUTH/SYS）+ 每码一页文档（/errors/{CODE}）——现状 ErrorBox 已有 code 字段（common.tsx:51），扩展为注册表；三段式（发生了什么/为什么/怎么办）与现有 ErrorBox 结构一致，补"怎么办"行动项
- **README 重构**：双版本（README.md 平衡版 + 评审导向段落于前 30 行含架构图）；测试数改为"以 npm test 实跑为准"（消除漂移）；补 BibTeX 引用块（学术竞赛惯例）

## 16. 八项审计结果汇总【检查】（主 Agent 定级；子 Agent 证据 + 主 Agent 独立复算）

**定级复核纪律**：子 Agent 头条声称两项经主 Agent 复算驳回（对比度 4.04→实测 5.53 过标；"evidence_relation 后端不认"→枚举合法，实为存在性检查缺口），证明复核必要。**本会话第二轮复核**（全量代码亲读）：再驳回 1 项（审计 8"CSS 未引用类"——实为全部引用）、新增 6 项（README:14 命令不存在 P2 / CLI 第二处 STORE_KINDS / HypothesesTab 裸表格 P3 / OverviewTab·HypothesisCard 中文标点硬编码 / FeedbackForm 原始枚举 P3 / Web 冻结不可见——见 §5 增量 9）；前稿引用的 api.ts 行号随代码演进口径偏移已全部按本会话实读校正。

| # | 审计 | 发现数 | 定级概要（主 Agent 终审） |
|---|---|---|---|
| 1 | 一致性 | ~8 | **P2** TARGET_STORE_KINDS 漏 evidence_relation → 定向反馈存在性检查被跳过（api.ts:86-91 vs ids.ts:37-44 枚举 vs store.ts:13-28 kind 表；**本会话新增：同一缺口在 CLI 第二处**——main.ts:273 STORE_KINDS 同缺，修复须两处同改）；**P3** 导出报告原始枚举 `[supports]`/`strength=` vs Web 中文标签（export.ts:238 本会话亲验 vs dict.ts testability.*）——建议共享标签映射；**P3** 双入口双端口（server/main.ts:13 默认 8787 vs serve.mjs:28 默认 3196，README/TESTING.md 各执一词）；**P3 新增**：FeedbackForm source/targetKind 下拉显示原始枚举值不译（FeedbackForm.tsx:73,105-109）——与 Web 全标签化纪律不一致 |
| 2 | 状态真值 | ~7 | **核心全绿**（本会话全量亲验）：RunControls 禁用即真实原因（RunControls.tsx:27-45）、runProgress n/9 来自真实 STAGE_ORDER（types.ts:81-96 非硬编码）、tones 全映射、cancelRequested 横幅真实（OverviewTab.tsx:55-57）、connection 非乐观（connection.tsx:19-27）、events 上限 300 渲染带诚实计数（EventsTab.tsx:8,34-36）；**P2** bundle id 发现靠事件正则扫描（ProvenanceTab.tsx:11-19 本会话亲验）应升为一等 API；**P3** aria-live 已复核：polling 指示 aria-live=off 属有意防读屏刷屏（EventsTab.tsx:24），残余=新事件/阶段转移无 polite 播报——建议仅播报阶段转移 |
| 3 | 错误信息 | ~10 | ErrorBox=金标准（码+消息+可重试徽章+重试钮，common.tsx:45-63）；**P3** 操作级错误（RunControls/FeedbackForm）只显消息缺码——可复用 ErrorBox |
| 4 | 无障碍 | ~24 | tablist/sr-only/reduced-motion/键盘导航已实现；**对比度 P1 驳回**（主 Agent 复算 #3568b5 vs #fff=5.53:1 过 AA）；**P2** btn--small≈22.6px、chip-button≈21.8px < WCAG 2.2 SC 2.5.8 AA 的 24px（子 Agent 误引 2.5.5 AAA，已纠正） |
| 5 | 中文与排版 | 18+ | **P2** 10 处 ApiError message 硬编码中文（client.ts:46,87,100 / endpoints.ts:72,94 / normalize.ts:59 / NewRunForm:45 / ProvenanceTab:217 / RunControls:57 / FeedbackForm:54——本会话逐处亲验属实）——英文界面下错误仍显中文，双语承诺破口；**P3** 列表分隔符混用（PlanTab:34,96,143-146,174-176 内 `；`vs`、` 并存；RevisionsTab:116 `, ` vs :123 `；`；**本会话新增** OverviewTab:65 失败阶段 join('、') 硬编码、HypothesisCard:34,46,233 `；` 硬编码——en 语境全部不当地显示中文标点）；**已达标**：中文字体栈/index.html lang=zh-CN+JS 切换同步/UTF-8/唯一动画 skeleton-pulse 为功能性且带 reduced-motion 降级 |
| 6 | 空状态与首次引导 | 20+ | **空态全绿**：17 处 EmptyState 全部带 stage 感知提示（404 与空数组分支齐全）；骨架屏 10 处规范；首启引导=空态文案指路（最小可用）；**P2** 无 onboarding 流程、无帮助入口（header 仅语言切换+连接状态）——首次用户无"下一步"教学 |
| 7 | 文档真实性 | 25+ | **README 端口"P1"驳回**（主 Agent 复核：README 写 `npm run serve` 默认 3196 正确——serve.mjs:28 以 opts.port 传入；api.ts:592 的 8787 是裸入口缺省，agent 未追溯参数链）；**P2 新增（本会话）**：README:14 快速开始命令 `node dist/cli/main.js research runs` **不存在**——`runs` 是顶层命令（main.ts:80），`research runs` 报 unknown subcommand exit 2；按 README 逐字走快速开始的用户第一步就撞墙（同段 :11 `research start`、:15-16 export/verify 命令则正确）；**P3 确认**：README 274/274 陈旧（本会话时点最新提交口径 332/332，且随并行 Wave 持续漂移→建议改为"以 npm test 实跑为准"）；START_HERE "web/ later" 过时；TESTING.md 与代码逐条一致（本会话抽验走查步骤 1-4 全对上） |
| 8 | 死功能/未绑定/装饰 | 15+ | **P2 确认（本会话亲验）**：`POST /runs/:id/reexport` 服务端完整实现（含 busy/无 bundle/无新修订三重诚实守卫，api.ts:447-459）但 Web 与 CLI 均无入口——"修订→重导出"闭环用户不可达；**P3** EventsTab 硬编码 `● polling · 2s / ⏸` 绕过 i18n（EventsTab.tsx:24-28）；**"CSS 未引用类"声称本会话驳回**：conn/conn-dot（App.tsx:177-178）、sidebar-title（App.tsx:211）、stage-row--*（StageTimeline.tsx:33 模板串动态拼接）**全部在引用**——不成立；**P3 新增（本会话）**：HypothesesTab.tsx:64 锦标赛表 `className="table"` 无对应样式（styles.css 仅定义 .data-table）——排序结果表裸样式渲染，与其余表格不一致；**装饰元素零**（唯一动画=功能性骨架脉冲+无障碍降级，符合禁令清单）；另**正面记录**：server 侧安全面真实在位（loopback Host/Origin 守卫、JSON-only 变更动词、1MB 上限、路径穿越防护、静态根缺失时诚实提示——api.ts:600-616,228-267,144-154,468-482） |

---

## 17. 复用 vs 自建决策表【设计】（线 B1/B3 报告实查：npm registry + GitHub，版本号全部 registry 现值 2026-08-22）

**总判断**【决策】：Web 端零依赖已过"从资产到负债"的临界点（15 组件/5269 行手写维持成本 > 精选依赖的供应链成本）；后端 zod-only 运行时不变量**不动**；CLI **维持零依赖手写路线**（线 B3 结论：真实缺口=宽度感知对齐+受控颜色+阶段行，vendored picocolors（ISC，6.4KB）即可闭环；富 TUI 需求出现时再走 Gemini CLI 先例的 esbuild 单文件打包路线并记 DECISIONS 例外）。分层引入（每层可独立否决）：

| 组件 | 版本/状态（line-b1/b3 实查） | License | 决策 | 用途/理由 |
|---|---|---|---|---|
| tailwindcss | 4.3.3 活跃 | MIT | **Tier 0 ADOPT** | 设计 token 系统化（现状手写 CSS 变量→token 工程） |
| lucide-react | 1.33.0 活跃（GitHub spdx=NOASSERTION 但 LICENSE 原文实查=ISC，等价宽松） | ISC | **Tier 0 ADOPT** | 图标（现状无图标库） |
| sonner | 2.0.8 活跃 | MIT | **Tier 0 ADOPT** | toast 反馈（替代/增强 callout） |
| motion（原 Framer Motion，已更名同仓库双包同版本 13.1.1） | 活跃 | MIT | **Tier 1 按需** | 状态转移动画（§5 规范内） |
| @tanstack/react-query | 5.101.4 活跃 | MIT | **Tier 1 按需** | 轮询/缓存/重试系统化（现状 usePolling/useResource 手写已够用——数据面复杂化时换） |
| cmdk | 停发约 17 个月（包小且为 shadcn 依赖） | MIT | **Tier 1 锁版** | 命令面板（快捷任务入口）——锁版本采用，关注复活 |
| recharts | 3.10.1 活跃 | MIT | **Tier 1 按需** | 锦标赛置信带/Gap Map（§11——SVG 手写亦可，引入时才用） |
| shadcn/ui | 121.8k stars 极活跃；**非 npm 依赖=CLI 拷源码模式**；registry v4 已是 Radix+Base UI 双轨 | MIT（2023 shadcn） | **Tier 2 条件** | copy-paste 组件源码（与手写并存自然） |
| Radix primitives（radix-ui 1.6.7） | 活跃 | MIT | **Tier 2** | 无障碍复杂交互件（dialog/menu）需要时 |
| @xyflow/react | 12.11.3 活跃 | MIT | **Tier 2** | 仅当论证树做画布式交互（§11 若选 DAG 呈现） |
| @dnd-kit/core | **npm 停发约 20 个月**（6.3.1/2024-12-05） | MIT | **DEFER（黄牌）** | 维护性疑虑，拖拽需求出现时重评 |
| TanStack Table 9.1.2（v9 新 major）/Router、@visx 4.0.0 | 活跃 | MIT | **DEFER** | 当前数据规模/任务不需 |
| ink 7.1.1 / @clack/prompts 1.7.0 / listr2 11.0.0 / ora 9.4.1 | 活跃 | MIT | **DEFER（CLI 不变量）** | 零依赖路线下不引；esbuild 打包例外须 DECISIONS |
| yocto-spinner | 1.2.2 活跃（**本会话修正：前稿"REJECT 被 ora 覆盖"理由不实**——它是比 ora 更小的正选，SIGINT 优雅处理） | MIT | **DEFER** | 零依赖路线下不引；若走打包路线为最小 spinner 候选 |
| picocolors | 1.1.1（2024-10 后休眠但 API 冻结、0 依赖 6.4KB） | ISC | **候选 vendor**（线 B3：零依赖下受控颜色的最小实现） | CLI 着色 |
| @docusaurus/core | 3.10.2（2026-07-10） | MIT | **ADOPT（文档站点，竞赛后）** | §15（注意勿装 npm 遗留包 `docusaurus` 1.14.7） |
| textlint | 15.8.0 活跃 | MIT | **ADOPT + prh 自写词典** | 中文排版 CI（zh 规则族停更 REJECT） |
| 字体：MiSans/HarmonyOS Sans/Noto Sans SC | — | 可商用授权 | **系统栈优先+子集化兜底** | 现有系统字体栈已达可用；品牌定稿（§8）时评估 |

**三重门执行**：全部 MIT/ISC（AGPL 零命中；线 G 侧的 Cal.com/Plausible/Grafana/AppFlowy/Dub 均 AGPL——只学公开界面模式，永不复制代码）；克隆仓库代码永不执行；每项引入走 v2 雄心门（可测提升或消除实证失败类）。**诚实更正（前稿"零 UNVERIFIED"不实）**：dnd-kit/cmdk 维护性黄牌、lucide spdx 标注歧义、chinese-copywriting-guidelines 的 CC BY 历史声称未证实（实为 MIT）——均已如实标注。

## 18. 实施路线图与风险【设计】

**分期**（每期 DoD + 北极星映射；全部待用户批准后启动）：
- **期 1 信任与诚实呈现**（最高价值，对齐叙事）：§11 范式四件（弃权一等状态/决策规则来源色标/verify 徽章组/置信带）+ §9 检索透明面板 + 导出入口打通（reexport 死路由复活）+ Web 冻结可见性（§5.9）。DoD：真实 run 数据驱动渲染 + 手工走查（TESTING.md 扩展）+ axe 零 critical。北极星：无直接指标但服务评审叙事
- **期 2 审计修复包**：§16 全部 P2（TARGET_STORE_KINDS 两处一行/bundle 一等 API/24px 目标/10 处 i18n 收编/EventsTab 文案/**README:14 快速开始命令修正**）+ 分隔符统一（textlint+prh）。DoD：每项带判别测试；北极星零回退（当前基线 332/332 全绿——本会话校准；后续以 npm test 实跑为准）
- **期 3 配置与运维体验**：§13（首启引导/probe 三态/health 端点/data info/端口统一【决策】）。DoD：真实首启路径实测
- **期 4 交付物**：§12（PDF 信息设计/演示视频脚本/API 参考）+ §15 文档（README 重构/术语映射单点化/错误码注册表）。DoD：文档真实性审计复跑全绿
- **期 5 视觉系统升级**：§8.2 token 化（含**移除 run-item 侧 accent 边条**——slop 头号 tell，§8.0）+ 三声三字体落地 + Tier 0 依赖引入（已批）。DoD：视觉回归对比 + 全量 a11y 扫描 + 排印 lint（三栈纪律机器化）
- **期 6 桌面壳与扩展形态**（**必做，用户裁决 2026-08-22**）：Tauri v2 三平台（Win/macOS/Linux webkit2gtk 面）+ 托盘/通知/监控小窗（§6）；多用户服务器（鉴权前置+远程安全开关）；文档站点（@docusaurus/core）。DoD：三平台各一次真实安装实测（PRODUCT_HCI §1.2 跨平台声明须实测）

**依赖关系**：期 2 独立可先行；期 1 依赖设计定稿（§8 美学方向裁决）；期 4 依赖期 1（演示素材来自信任呈现）。
**风险与未知（如实）**：①三门（DeepSeek 余额/DASHSCOPE/OPENALEX）未解——期 1/4 的真实素材生产被阻塞（演示视频必须真实 run，不可伪造）；②并行 Wave（6/7/8/9）仍在改后端——本会话核对时 §7/§10 的 CLI 面就因 W8 落地 inspect 而更新过，实施期改动面（api.ts/web/src）虽不在各 Wave 所有权表内，仍须每次提交前 `git status` 防漂移、修复与 W8 的 orchestrator/lease 语义对齐；③前序会话的审计子 Agent 报告未落盘——§16 以前序会话定级+本会话全量亲读复核为准，两轮复核各驳回 1-2 项已如实记录；④Tier 0 依赖引入改变 Web 构建面——需一次完整回归；⑤"证据天平"原创范式无成熟先例——需用户测试验证；⑥本方案由两会话接力产出（披露见卷首）——若前序会话仍活跃可能再次写入本文件，裁决以用户批准时点的版本为准。
