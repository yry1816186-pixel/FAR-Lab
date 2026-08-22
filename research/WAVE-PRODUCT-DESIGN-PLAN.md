# FAR-Lab 产品全景设计规划方案（Wave-PRODUCT 第一阶段）

> 状态：**已完成，等待用户审阅**——用户批准（含各【决策】点裁决）后方可进入第二阶段实施；未经批准的任何实施代码 = 违规。
> 每节标注【设计】/【决策】（交用户裁决）/【检查结果】。现状陈述基于主 Agent 逐文件实读；file:line 为短引用（api.ts=src/server/api.ts、main.ts=src/cli/main.ts、其余按 web/src|src 常位解析，全部经本会话亲验）。
> 证据来源：线 A/B/D/E/F 六路调研（结论带来源；关键声称经主 Agent 抽验）+ 八项审计（子 Agent 采集 + 主 Agent 独立复核定级；头条 2 项被复算驳回已如实记录）。
> 诚实铁律执行情况：无伪造截图/界面（全部示意图为文字线框）；未验证项标 UNVERIFIED（§11 证据天平原创范式、§14 平台实测缺口）；审计驳回项保留记录。

## 目录
1. 产品定义【设计】 2. 叙事与品牌【设计+决策】 3. 核心用户旅程【设计】 4. 信息架构【设计】 5. Web 体验蓝图【设计】 6. 桌面 GUI 蓝图【设计+决策】 7. CLI 体验蓝图【设计】 8. 视觉语言【设计+决策】 9. 过程可视化规范【设计】 10. 人工干预入口全集【设计】 11. 信任与科学呈现【设计】 12. 交付物设计【设计】 13. 运维与配置体验【设计+决策】 14. 多平台兼容矩阵【设计】 15. 文档体系规划【设计】 16. 八项审计结果汇总【检查】 17. 复用 vs 自建决策表【设计】 18. 实施路线图与风险【设计】

---

## 1. 产品定义【设计】

**用户画像**（基于现状与竞赛场景推导）：
- 主 persona：科研人员/研究生（会提研究问题、能读证据与假设、在乎可证伪性与溯源；不一定会部署服务）
- 次 persona：竞赛评审（快速理解能力边界与真实性的技术读者）；复现者（拿到导出包独立核验的第三方）

**JTBD**：①"给我一个真实研究问题，产出**有证据支撑、可证伪、可排序**的假设集与研究计划"（核心）；②"让我能监督/干预长任务并给反馈修订"（控制）；③"让我能向他人证明结果可信"（复现/交付）。

**市场结构判断**（线 F，来源见 §1.1）：市场两极分化——"全自动 AI 科学家"（Sakana AI-Scientist、Robin）离产品化远且无人工科学方法约束；"文献助手"（Elicit/SciSpace/deep-research 类）停留在阅读/检索层。**中间地带"科学方法工作台"（人在环、证据约束、可证伪工程化）为空白**。

**FAR-Lab 已核实的无人区能力**（线 F 逐一核实，全部竞品均无）：
1. Fail-closed 证据约束（claim 对不上来源即降级，绝不编造）
2. 第三方可复现导出（far verify 10 项独立核验）
3. 决策规则来源披露（decisionRuleProvenance 三档）
4. 多重检验纪律（POPPER multipleTestingPolicy）
5. 假说锦标赛排序（Bradley-Terry + 不确定性）

**推荐主叙事**："**科学方法操作系统**"——不卖"AI 答案"，卖"可审计的科学决策过程"。评审钩子=可证伪性工程化 + 可复现导出。
（候选叙事 B："假设的质检工厂"；C："把同行评审前置到假设生成"——供用户裁决，见 §2）

**成功标准**（与北极星对齐）：评审演示 10 分钟内完成"问题→证据→假设→证伪规范→排名→复现验证"全链可信叙事；用户首次成功 run ≤10 分钟（含配置）；verify 一次通过。

## 2. 产品叙事与品牌【设计+决策】（线 F 结论）

**故事线**（三候选，供用户裁决——推荐 A）：
- **A（推荐）"科学方法操作系统"**：不卖 AI 答案，卖可审计的科学决策过程。电梯稿："FAR-Lab 把'提出可证伪假设'变成一条每一步都有证据回执、可第三方复现的工程化流水线——它不保证给你对的理论，但保证你能看清每个假设为什么值得赌、怎么输、值多少。"
- **B "假设的质检工厂"**：证据=原料，可证伪性=质检标准，锦标赛=分级，输出=带合格证的假设。更工业化、更比喻化，风险=把科学简化为流水线惹恼方法论敏感的评审
- **C "把同行评审前置到假设生成"**：反证检索+弃权+多重检验=评审的内化。学术共鸣强，但"同行评审"术语有过度承诺风险（系统不是真评审）

**命名与术语体系**：产品名 FAR-Lab 保留（评审已见）；术语表=canonical domain 枚举的单点映射（§4 的 dict 同源方案）；对外话术禁用内部行话（run/stage 对外仍可用——目标用户是科研人员，pipeline 语汇天然亲和；Wave/决策号等内部词汇不入产品面）。

**品牌视觉身份**：2-3 方向供选（美学方向定稿依赖 §8 视觉语言，此处给占位）——①"实验室记录本"（纸感中性色+等宽数据字体，呼应可追溯）②"仪器面板"（高密度暗色优先，呼应监控）③"学术期刊"（衬线标题+克制留白，呼应严谨）。【决策】交用户。

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

**现状对照**：Web 7-tab 已是此模型投影（术语经 i18n 类型化词典——缺 key 编译失败，是三表面一致性的机制保障）；CLI 投影=运行控制子集；导出报告投影=科学叙述。**已知破口**（§16）：导出报告原始枚举 vs Web 中文标签（P3）→ 方案：领域枚举→标签的映射表单点化（export.ts 复用 dict 同源 JSON，而非内联英文）。

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

**动画规范**：现状唯一动画=骨架脉冲（功能性+reduced-motion 降级）——维持；新增动画仅限状态转移（tab 切换焦点/置信带 hover），无入场装饰动画。

**状态机呈现纪律**（延续 §9）：所有新面板从真实事件/对象渲染；无数据的检查项显示"未产生"而非隐藏。

## 6. 桌面 GUI 蓝图【设计+决策】（线 B 决策矩阵）

**框架决策矩阵**（线 B，npm/GitHub 官方源核验）：

| 维度 | Tauri v2 | Electron |
|---|---|---|
| 安装包 | 3-10MB | 80-200MB |
| 内存 | 低 ~5× | 高（自带 Chromium） |
| 更新机制 | 内置 updater | electron-updater 成熟 |
| Windows 分发 | 需代码签名预算（无签名则 SmartScreen 警告） | 同样需要签名 |
| 与 React 集成 | 现有 Web 直接装入 webview | 同 |
| 代价 | Rust 工具链/维护面 | 仅 JS |

**推荐**【决策】：**竞赛前不做桌面壳**（Web + CLI 已覆盖全部核心任务；桌面=发布后的分发形态）。若后续做：**Tauri v2**（体积/内存碾压，FAR-Lab 无重量原生需求），桌面壳=纯 webview 装现有 Web（PRODUCT_HCI §1.2：wrapper 不建第二套业务逻辑）。**触发条件**：非技术用户直接安装的分发需求出现。
**监控面板设想**（触发后）：常驻小窗=run 状态/阶段进度/三门健康；主窗=完整 Web。

## 7. CLI 体验蓝图【设计】

**现状基线（主 Agent 实读 src/cli/main.ts）**：命令面 = runs / verify / research start|status|cancel|resume|export|feedback；--json 机器可读模式全命令支持；退出码语义（verify verdict→0/1，参数错→2）；printRun 人类可读输出（状态+阶段+attempt+错误原文）；--help 完整。已达 PRODUCT_HCI §8 基本盘。

**设计增量**（按价值排序）：
1. **进度观感**：`research status --watch`（轮询式阶段推进显示——复用 Web 的自适应轮询策略；显示 n/9+当前阶段+attempt，无百分比无 ETA）；长任务 `research start` 默认即时返回 runId+查看指引（现状已如此——README 有"创建即返回执行继续"的诚实记录）
2. **彩色纪律**：状态着色（ok=绿/fail=红）但遵守 NO_COLOR 与非 TTY 自动禁用（§8 规范统一）；信息密度优先
3. **交互提示符**：不加交互式 REPL（最小架构：现有一次性命令 + --json 组合已覆盖自动化与人类两态；REPL 是桌面/Web 的领地）
4. **错误三段式**：CLI 错误输出对齐 §15 错误码体系（FAR-E-* 前缀 + 一句人话 + 下一步命令建议——现有 die() 只有消息）
5. **表格输出**：runs 列表对齐列宽（现状 padEnd 已做）；证据/假设子命令**不加**（Web 是检视领地，CLI 保持运行控制+导出+验证的窄面——决策：CLI 面不扩张，理由=双表面术语一致性成本与维护面）

## 8. 视觉语言【设计+决策】（线 A + 现状基线）

**现状基线已达标**（styles.css）：语义 token/明暗自动/焦点环/对比度注明/中文字体栈/装饰禁令遵守。**本节=在此基线上的系统化升级**。

**设计 token 体系**（分四组）：
1. **色彩**：采纳 M3 tonal palette 算法但**裁剪角色**（保留 primary/secondary/surface/on-surface/outline/error，弃 tertiary/dynamic-color——科研工具不需品牌表达色）；语义状态色独立于品牌色（Fluent 2 惯例：accent/success/warning/error 四系——现状已是此结构）；暗色=算法生成但全部过 WCAG 验证（不过标的 tone 手动上调）
2. **字阶**（M3 五层收敛 + 中文行高 ×1.15）：页面标题 Headline-L 32/40、假说标题 Title-M 16/24×500、正文 Body-M 14/23、标签 Label-M 12/18×500、元数据 Label-S 11/18
3. **间距/密度**：8dp 网格 + **dense 为默认**（Fluent 2 三级密度变体：compact×0.75/comfortable×1.0/spacious×1.25；行高 32-36px——Apple 专业应用密度；Run 监控页默认 compact）；侧栏 240-280px
4. **圆角**：收敛 4-8px（Fluent 2/KDE 工具感——弃 M3 默认 12-28px 消费级圆润）；数据密集区 0-4px；动效曲线：仅状态转移，缓动 standard (cubic-bezier 0.2,0,0,1)

**美学方向 2-3 选**【决策】（接 §2 品牌占位）：
- ①**实验室仪器**（推荐）：dense 布局+4-6px 圆角+等宽数据字体+克制单 accent——呼应"科学方法操作系统"叙事；现状 styles.css 最接近此向，迁移成本最低
- ②**学术期刊**：衬线标题+留白+衬线数字（tabular-nums）——庄重但与工具属性有张力
- ③**记录本纸感**：暖中性色+手写感点缀——亲切但严肃性弱
**裁决优先级梯子**（线 A，全产品生效）：**可访问性(WCAG 2.2 AA) > 学术诚信(诚实呈现) > 任务效率(密度/布局) > 品牌表达**——任何视觉决策不得为美观牺牲前两级。

**可访问性数值基线**（线 A 核实自 W3C）：正文 4.5:1/大字 3:1/UI 组件 3:1（SC 1.4.3/1.4.11）；目标 ≥24×24px（SC 2.5.8）；焦点指示器对比 ≥3:1（SC 2.4.11 新增）——修复 §16 审计 4 P2（小按钮）即按此。CI 建议：axe-core 自动检测阻断。

## 9. 过程可视化与状态监看规范【设计】

**现状达标项**（保留）：n/9 计数进度（非百分比——PRODUCT_HCI §2 合规）；11 阶段时间线含未开始灰态（不隐藏）；attempt 计数显示于 running 态；失败阶段列表+lastError 原文；断连横幅+自动重试；轮询暂停/恢复（页面可见性）。

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
| 恢复 | 按钮（阶段边界续跑+反馈重启语义） | `research resume` | API POST |
| 反馈 | 表单（9 源×5 目标） | `research feedback`（main.ts:247 已核） | API POST |
| 重导出 | **缺口（死路由）**→ 补入口 | **缺口** → `research export` 幂等重跑 | API POST reexport |
| 验证 bundle | 溯源 tab（发现的 bundle chips+手输） | `far verify`（exit code 语义） | API GET |
| 暂停 | **设计决策【决策】：是否引入 pause 语义**（当前取消+恢复已覆盖，pause 增加状态机复杂度——推荐不加，用"取消+可恢复"话术替代） | — | — |
| 对特定假说反馈 | **设计**：假说卡片一键"反馈此假说"（预填 targetKind/targetId） | — | — |

## 11. 信任与科学呈现【设计】（线 D 结论）

**设计原则**（ACM CHI 2023 实证）：明确展示"弃权"的系统用户信任度显著高于强行给低置信答案——弃权必须是一等状态。

**领域概念→呈现范式映射**（线 D 六子题 → FAR-Lab 八概念）：

| FAR-Lab 概念 | 采纳范式 | 交互要点（线框粒度） |
|---|---|---|
| BT 分数+不确定性 | 分级置信带（Wilke dataviz ch16）+ 透明主柱误差条（Datawrapper 抗 within-the-bar bias） | hover=点估计+区间+N；柱体透明化使区间两侧视觉等权 |
| 证伪规范三分支（支持/弱化/证伪） | Kialo 式 pro/con 论证树 | 支持绿色枝/反对红色枝/强度标注（✅强 ⚠️弱 ❌已证伪）；底部平衡指示条 |
| uncertainties 数组 | 多层置信带 + Evidence Gap Map（PCORI 范式） | 二维散点：研究质量×效应方向；灰=证据空白一眼可见 |
| decisionRuleProvenance 三档 | 引用色标（Zotero/Paperpile 范式） | 🟢evidence-derived/🟡community-standard/🔴model-stipulated——阈值来源一眼可辨 |
| 诚实弃权（P5） | 弃权一等状态徽章（CHI 2023） | 独特色系（不与成功/失败混淆）+置信度+阈值+缺失原因+三出口（看原始信号/调阈值/人工裁定） |
| 非 live 回执警告 | Dagster stale asset 范式 | 现状已有 callout（ProvenanceTab nonLiveWarn）——保持并推广到一切非 live 工件 |
| bundle verify 10 检查 | CI check-run 徽章组 + Etherscan 式详情 | 默认语义状态词折叠、hash 主动展开才显示+一键复制；hash 等宽字体置顶 |
| claim→来源绑定 | Git blame 式悬停溯源 | claim 悬停→来源引用+绑定状态+提取时间；未对齐绑定即降级提示（现有 binding 徽章保留） |

**原创范式缺口**（线 D UNVERIFIED 如实记录）："红蓝对抗证据天平"无成熟产品案例——基于 Kialo 树+Gap Map 元素原创，标注为设计假设需用户测试验证。
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
| Web 工作台 | ✅ 浏览器 | ✅ | ✅ | ✅ 远程访问（HOST=0.0.0.0）+ 无 JS 降级=无（SPA 依赖 JS——诚实标注） |
| 桌面 GUI | 线 B 决策矩阵后定（§6） | 同左 | 同左 | N/A（远程 Web 替代） |
| 已知平台坑 | Git Bash tar/路径（内部已档） | — | — | 轮询页面不可见时暂停（已实现） |

**跨平台声明纪律**（PRODUCT_HCI §1.2）：本矩阵"✅"中仅 Windows 为本工作区实测；macOS/Linux 为代码层推断（Node/浏览器跨平台性质），交付前须各平台实测一次才能宣称——【检查结果】当前 README 未做平台声明（诚实：未宣称即未夸大，合规）。

## 15. 文档体系规划【设计】（线 E 结论 + 现状）

**现状**：README（诚实、命令级、含三门披露）+ START_HERE（会话入口）+ TESTING.md（手工走查）+ project-spec/ + 控制面文档。缺口：用户指南/API 文档/教程不存在；README 测试数随并行开发漂移（274→298）；START_HERE "web/ later" 过时。

**信息架构**：采用 **Diataxis 四象限**（Tutorial→How-to→Concepts→Reference，业界五标杆 Stripe/Tailscale/Rust/Next.js/Python 共同模式）：
- **Tutorial**（评审 5 分钟路径）：一个真实问题跑通全链 → 对应竞赛演示脚本（§12）
- **How-to**（科研用户任务导向）：提交问题/中断恢复/反馈修订/导出复现/换模型路由/配 key
- **Concepts**：证据约束哲学/可证伪性工程化/锦标赛与不确定性/回执与 provenance——面向论文与评审深读
- **Reference**：CLI 全命令/API 15 端点/错误码表/术语表/配置项

**工具决策【决策】**：文档站点 **Docusaurus v3**（MIT，版本化+i18n+生态最成熟；备选 Starlight/Astro 亦 MIT）。竞赛前优先级：Markdown 文档集 > 站点化（站点化可后置）。

**规范采纳**：
- 中文写作规范 v1.0 = 中文文案排版指北（sparanoid/chinese-copywriting-guidelines，CC BY 4.0）——中英之间加空格/全角标点/数字阿拉伯；textlint 自动检查入 CI（修复审计 5 分隔符混用 P3 的制度性方案）
- 架构文档 = **arc42 为骨 + C4 为肉**（C4 Level-1+2 一页图入 PDF；mermaid 绘制导出 SVG，≥300DPI；图注规范：编号/单位/来源/自包含——Nature 级图注纪律）
- ADR = Nygard 模板；FAR-Lab 已有 DECISIONS.jsonl（更细粒度），方案：技术方案 PDF 附录选摘 5-8 条关键决策改写为 ADR 格式
- **错误码体系**：FAR-E-{域}-{4位}（MODEL/DATA/API/AUTH/SYS）+ 每码一页文档（/errors/{CODE}）——现状 ErrorBox 已有 code 字段（common.tsx:51），扩展为注册表；三段式（发生了什么/为什么/怎么办）与现有 ErrorBox 结构一致，补"怎么办"行动项
- **README 重构**：双版本（README.md 平衡版 + 评审导向段落于前 30 行含架构图）；测试数改为"以 npm test 实跑为准"（消除漂移）；补 BibTeX 引用块（学术竞赛惯例）

## 16. 八项审计结果汇总【检查】（主 Agent 定级；子 Agent 证据 + 主 Agent 独立复算）

**定级复核纪律**：子 Agent 头条声称两项经主 Agent 复算驳回（对比度 4.04→实测 5.53 过标；"evidence_relation 后端不认"→枚举合法，实为存在性检查缺口），证明复核必要。

| # | 审计 | 发现数 | 定级概要（主 Agent 终审） |
|---|---|---|---|
| 1 | 一致性 | ~8 | **P2** TARGET_STORE_KINDS 漏 evidence_relation → 定向反馈存在性检查被跳过（api.ts:79 vs ids.ts:39 vs store.ts:16；修复=补一行映射）；**P3** 导出报告原始枚举 `[supports]`/`strength=` vs Web 中文标签（export.ts:238 vs dict.ts testability.*）——建议共享标签映射；**P3** 双入口双端口（server/main.ts 默认 8787 vs serve.mjs 3196，README/TESTING.md 各执一词） |
| 2 | 状态真值 | ~7 | **核心全绿**（主 Agent 亲验）：RunControls 禁用即真实原因、runProgress n/9 来自真实 STAGE_ORDER（types.ts:87-95 非硬编码）、tones 全映射、cancelRequested 横幅真实；**P2** bundle id 发现靠事件正则扫描（ProvenanceTab.tsx:11-19）应升为一等 API；**P3** aria-live 值待审 |
| 3 | 错误信息 | ~10 | ErrorBox=金标准（码+消息+可重试徽章+重试钮，common.tsx:45-63）；**P3** 操作级错误（RunControls/FeedbackForm）只显消息缺码——可复用 ErrorBox |
| 4 | 无障碍 | ~24 | tablist/sr-only/reduced-motion/键盘导航已实现；**对比度 P1 驳回**（主 Agent 复算 #3568b5 vs #fff=5.53:1 过 AA）；**P2** btn--small≈22.6px、chip-button≈21.8px < WCAG 2.2 SC 2.5.8 AA 的 24px（子 Agent 误引 2.5.5 AAA，已纠正） |
| 5 | 中文与排版 | 18+ | **P2** 10 处 ApiError message 硬编码中文（client.ts:46,87,100 / endpoints.ts:72,94 / normalize.ts:59 / NewRunForm:45 / ProvenanceTab:217 / RunControls:57 / FeedbackForm:54）——英文界面下错误仍显中文，双语承诺破口；**P3** 列表分隔符混用（PlanTab 内 `；`vs`、` 并存；RevisionsTab/OverviewTab tags 用半角 `, `）；**已达标**：中文字体栈/index.html lang=zh-CN/UTF-8/唯一动画 skeleton-pulse 为功能性且带 reduced-motion 降级 |
| 6 | 空状态与首次引导 | 20+ | **空态全绿**：17 处 EmptyState 全部带 stage 感知提示（404 与空数组分支齐全）；骨架屏 10 处规范；首启引导=空态文案指路（最小可用）；**P2** 无 onboarding 流程、无帮助入口（header 仅语言切换+连接状态）——首次用户无"下一步"教学 |
| 7 | 文档真实性 | 25+ | **README 端口"P1"驳回**（主 Agent 复核：README 写 `npm run serve` 默认 3196 正确——serve.mjs:28 以 opts.port 传入；api.ts:564 的 8787 是裸入口缺省，agent 未追溯参数链）；**P3 确认**：README 274/274 陈旧（现 298，且随并行 Wave 持续漂移→建议改为"以 npm test 实跑为准"）；START_HERE "web/ later" 过时；TESTING.md 与代码逐条一致（13 条宣称全对上） |
| 8 | 死功能/未绑定/装饰 | 15+ | **P2 确认（主 Agent 亲验）**：`POST /runs/:id/reexport` 服务端完整实现（含 busy/无 bundle/无新修订三重诚实守卫，api.ts:420-432）但 Web 与 CLI 均无入口——"修订→重导出"闭环用户不可达；**P3** EventsTab 硬编码 `● polling · 2s / ⏸` 绕过 i18n（EventsTab.tsx:24-28）；CSS 未引用类清单（conn/sidebar-title/stage-row--* 等）为**待精确确认**（采集员自述动态拼接/未读文件可能漏检）；**装饰元素零**（唯一动画=功能性骨架脉冲+无障碍降级，符合禁令清单） |

---

## 17. 复用 vs 自建决策表【设计】（线 B 逐项核验：npm registry + GitHub API，零 UNVERIFIED）

**总判断**【决策】：Web 端零依赖已过"从资产到负债"的临界点（15 组件/5269 行手写维持成本 > 精选依赖的供应链成本）；后端 zod-only 运行时不变量**不动**。分层引入（每层可独立否决）：

| 组件 | 版本/状态（线 B 核验） | License | 决策 | 用途/理由 |
|---|---|---|---|---|
| tailwindcss v4 | 活跃 | MIT | **Tier 0 ADOPT** | 设计 token 系统化（现状手写 CSS 变量→token 工程） |
| lucide-react | 活跃 | ISC | **Tier 0 ADOPT** | 图标（现状无图标库） |
| sonner | 活跃 | MIT | **Tier 0 ADOPT** | toast 反馈（替代/增强 callout） |
| @tanstack/react-query | 活跃 | MIT | **Tier 1 按需** | 轮询/缓存/重试系统化（现状 usePolling/useResource 手写已够用——数据面复杂化时换） |
| motion | 活跃 | MIT | **Tier 1 按需** | 状态转移动画（§5 规范内） |
| cmdk | 活跃 | MIT | **Tier 1 按需** | 命令面板（快捷任务入口） |
| recharts | 活跃 | MIT | **Tier 1 按需** | 锦标赛置信带/Gap Map（§11——SVG 手写亦可，引入时才用） |
| shadcn/ui | 活跃 | MIT | **Tier 2 条件** | copy-paste 组件源码模式（非 npm 依赖，与手写并存自然） |
| Radix primitives | 活跃 | MIT | **Tier 2** | 无障碍复杂交互件（dialog/menu）需要时 |
| @xyflow/react | 活跃 | MIT | **Tier 2** | 仅当论证树做画布式交互（§11 Kialo 范式若选 DAG 呈现） |
| TanStack Table/Router、dnd-kit、visx | 活跃 | MIT | **DEFER** | 当前数据规模/任务不需 |
| ink+@clack/prompts+listr2+ora | 活跃 | MIT | **DEFER** | CLI REPL/富交互——§7 决策 CLI 面不扩张，暂不引 |
| yocto-spinner | — | — | **REJECT** | 被 ora 覆盖 |
| Docusaurus v3 | 活跃 | MIT | **ADOPT（文档站点，竞赛后）** | §15 |
| 字体：MiSans/HarmonyOS Sans/Noto Sans SC | — | 可商用授权 | **系统栈优先+子集化兜底** | 现有系统字体栈已达可用；品牌定稿（§8）时评估 |

**三重门执行**：全部 MIT/ISC（AGPL 零命中）；克隆仓库代码永不执行；每项引入走 v2 雄心门（可测提升或消除实证失败类）。

## 18. 实施路线图与风险【设计】

**分期**（每期 DoD + 北极星映射；全部待用户批准后启动）：
- **期 1 信任与诚实呈现**（最高价值，对齐叙事）：§11 范式四件（弃权一等状态/决策规则来源色标/verify 徽章组/置信带）+ §9 检索透明面板 + 导出入口打通（reexport 死路由复活）。DoD：真实 run 数据驱动渲染 + 手工走查（TESTING.md 扩展）+ axe 零 critical。北极星：无直接指标但服务评审叙事
- **期 2 审计修复包**：§16 全部 P2（TARGET_STORE_KINDS 一行/bundle 一等 API/24px 目标/10 处 i18n 收编/EventsTab 文案）+ 分隔符统一（textlint）。DoD：每项带判别测试；北极星零回退（298+ 全绿）
- **期 3 配置与运维体验**：§13（首启引导/probe 三态/health 端点/data info/端口统一【决策】）。DoD：真实首启路径实测
- **期 4 交付物**：§12（PDF 信息设计/演示视频脚本/API 参考）+ §15 文档（README 重构/术语映射单点化/错误码注册表）。DoD：文档真实性审计复跑全绿
- **期 5 视觉系统升级**（最晚，风险最高）：§8 token 化 + Tier 0 依赖引入【决策】。DoD：视觉回归对比 + 全量 a11y 扫描
- **期 6 远期触发式**：桌面壳（Tauri，分发需求触发）/多用户服务器（鉴权前置）/文档站点（竞赛后）

**依赖关系**：期 2 独立可先行；期 1 依赖设计定稿（§8 美学方向裁决）；期 4 依赖期 1（演示素材来自信任呈现）。
**风险与未知（如实）**：①三门（DeepSeek 余额/DASHSCOPE/OPENALEX）未解——期 1/4 的真实素材生产被阻塞（演示视频必须真实 run，不可伪造）；②并行 Wave（6/7/8/9）仍在改后端——期 2 的 api.ts 一行修复需与 Wave-7 会话协调（其所有权）；③子 Agent 审计通道多次丢失完整表——§16 以主 Agent 复核子集为准，未尽明细标注；④Tier 0 依赖引入改变 Web 构建面——需一次完整回归；⑤"证据天平"原创范式无成熟先例——需用户测试验证。
