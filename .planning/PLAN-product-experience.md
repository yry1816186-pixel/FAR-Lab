# Product Experience Mission — PEX 二期：全项目彻底升级总计划

> 2026-08-22 用户批准（指令 = FAR-Lab World-Class Human Experience Rebuild 全文，两轮扩范围后终批）。
> 一期切片（S1-S5）见文末历史记录；二期视为失败基线可推翻，覆盖指令 §1-26 全部表面。
> 宪法底线不变：显示↔真实能力一一映射、无假进度、无 design theater、Node 产物零新运行时依赖（web 前端另论）、secrets 不进 UI、科学断言需证据。

## 0. 常设协议（贯穿全程，每批必做）

- **R1 三视角批判**：Product/HCI/Scientific 独立攻击每批结果，P0/P1 必修后复验。
- **R2 dogfood 度量台账**：每批真实任务记录 Steps/Time/Latency/Confusion/Context Switches，与 B1 基线量化对比，落 evidence/W-PEX/。
- **R3 CPP 滚动清单**：3-7 个最高价值产品问题持续维护，P0/P1 未清不做 P3 打磨。
- **R4 定向研究**：每批设计前做精准竞品/HCI 研究，结论直接改实现，不留报告文档。
- **R5 状态落盘**：.planning/.control 每批更新，跨会话断点续作。

## 1. 批次计划（四波 15 批）

### Wave 1 — 根基

- **B0 状态对账**：EXECUTION_STATE 补 S2/S3 证据；散落 yml 移 evidence/W-PEX/；总纲落盘；提交推送。
- **B1 全程审判基线（指令 §2 正式化）**：以首次使用的科研者身份完整走通 Idea→输入→问题→文献→反证→假设→比较质疑→证伪→计划→实验→结果→修订→版本→导出；逐点记录迷惑/后台感/工程细节暴露/信息过载或不足/跳转/响应慢/层级错误/思维断续；产出摩擦清单 + CPP v2 重排 + 各表面设计方向（timebox，结论喂后续批）。
- **B2 工作台骨架重构**：①IA 按任务心智重排——科学面一级（问题/证据/假设/计划/实验/修订链），工程面渐进披露（events/receipts/元数据→「技术细节」检查器），run ID 全面退居次级；②palette 扩全量搜索（按问题搜 run、按陈述搜假设、按文本搜 claim，新增 `GET /api/v1/search?q=` SQL LIKE 零依赖；命令面板本体 S5 已落地，本批接搜索）；③quick capture：`n`/`#new`/全局捕获条/首访 onboarding 空态引导；④视觉层级升级：密度/留白/typography scale/motion tokens 重校（对齐 Wave-Aesthetics craft-spec-v2 既有规格），科学语义组件语言统一；⑤键盘流（n、/、Cmd+K、←→、Esc）+ 响应式审计。
- **B3 等待期根修 + 实时性**：①receipt payload 富化（模型 modelId/purpose/latencyMs；检索 family/query/resultCount/httpStatus，零 schema 变更）；②StageRecord.subtasks 仅真实总量处填充；③note 里程碑让假设逐条浮现、falsify 逐假设播报；④ActivityFeed 富化 + StageTimeline 真实计数；⑤SSE 事件流（Node 原生 http 零依赖，替代 2s 轮询，降级保轮询）；⑥多 run 后台感知条 + web 通知（默认关、真实终态驱动）；⑦版本对比视图（side-by-side before/after + VersionDiff + 剩余不确定项；live v0→v1 真数据已在库——S3 时"无数据"降级已解除）；⑧PlanTab 质疑接线、ExperimentsTab i18n 硬化、对比导出 Markdown、反证检索记录结构化。

### Wave 2 — 科学交互核心（思维碰撞，产品差异化所在）

- **B4 对象级 AI 研究动作**：每个假设/主张/计划可一键 Challenge（AI 接地反驳分析）/最弱前提探测/What would falsify this/Find evidence against（定向反证检索）/Ask（对象上下文问答）/What should I test next。新增 `POST /api/v1/runs/:id/actions`（服务端走既有模型网关，响应带 run 内真实证据接地与出处，流式呈现）；AI 分析标注模型出处，可一键转 feedback 进入因果修订链——AI 输出不冒充事实。
- **B5 假设操作完整性**：Fork（分叉为新候选，版本谱系）、Promote/Reject（人工裁决入事件与反馈链）、Connect（人工绑定 claim↔hypothesis，标 source=human）、对比画布导出 Markdown；决策点：run 级 lineage/项目分组做域模型影响评估后定。
- **B6 ACH 绑定增密（管线，科学评审强制）**：critique_falsify 扩展为全 claims×代表假设 支持/反对/无实质关系 显式判定（区分"未评估"），二次审校既有；绑定密度提升后 ACH 升级全量矩阵画布（显式空格语义）；过 SCIENTIFIC_TRUTH 评审。
- **B7 证据图谱可视化**：claims–sources–hypotheses 关系交互图（SVG 自研零依赖：pan/zoom/极性着色/过滤/点击下钻 receipt），与 ACH/对比/证据表联动。
- **B8 实验执行进 run 生命周期（D-085 尾巴）**：orchestrator execute-stage 集成（RunStageName/STAGE_ORDER/runProgress 分母/长阶段租约续期），计划→实验→判决→修订工作台内闭环；专批红队对抗评审 + 回滚方案先行。

### Wave 3 — 入口与平台

- **B9 入口升级**：文本粘贴/DOI/URL/BibTeX·RIS（DOI/URL 走既有 OpenAlex 客户端）/Zotero 本地 API/剪贴板自动识别（DOI/arXiv）/拖放区/语音（Web Speech API）/截图图像（走模型网关视觉路由，决策点）；`POST /runs` 扩 seed 字段（provenance=user_provided）；PDF 不进 Node（桌面 Rust 侧 or 诚实降级，决策点）。
- **B10 桌面产品化（Tauri）**：托盘、全局快速捕获热键、原生通知、深链 far://run/<id>、文件拖放打开、单实例、窗口状态记忆、对比多窗口、server 不可见优雅降级页；Rust 插件依赖落地当批按确认线报备。
- **B11 CLI 成熟化**：far completion（bash/zsh/pwsh）、research status --watch 流式叙事、交互式 far new 向导、错误分类+建议统一、帮助重写、--json 全命令审计。
- **B12 能力管理面**：模型路由管理器（健康/延迟/用途/默认路由策略/探针触发，secrets 不显示）+ 检索族/实验适配器注册表 + 配置健康检查；MCP 先 OSS 尽调评估再决策。

### Wave 4 — 品质与终局

- **B13 信任/真相/无障碍硬化**：渐进披露完成度全查；错误/空态/失败全产品统一组件（What failed/Why/Still valid/Unknown/Retryable/Changeable）；i18n 清零硬编码；科学排版（KaTeX 公式/长文/大表/中英双语）+ a11y 全面审计（纯键盘全程/对比度/缩放/读屏/reduced-motion）。
- **B14 性能与交互工艺终局**：①性能预算实测全指标（冷热启动/导航/输入/搜索/TTFF/大列表/大表/图谱/SSE 延迟/内存）超标即修；②交互工艺 pass（§12 全状态动效清单，动效只服务方向/连续/因果/反馈）；③终局 dogfood 量化对比 B1 基线；④独立对抗审计（adversarial-auditor + architecture-critic）；⑤completion-gate + 全量门禁 + 证据齐备。

## 2. 执行顺序与断点

B0→B1→B2→B3→B4→B5→B6→B7→B8→B9→B10→B11→B12→B13→B14。每批：设计前定向研究→实现→集成→真实路径 dogfood→度量→三视角批判→修复→门禁（vitest 全量+双端 tsc/build+secret-scan）→提交推送→状态落盘。批间天然断点可续。

## 3. Definition of Done（指令 §25）

idea 零摩擦进入→活的研究工作区→证据/反证/冲突/未知与竞争假设并排可比较可质疑可分叉→AI 思维碰撞接地可信→计划→实验→判决→修订全链 GUI 闭环→版本对比→导出复现；快/透明/可信/可控/可恢复/可复现；首次打开即成熟专业科研产品，而非 AI 生成的管理后台。

---

## 一期历史记录（S1-S5，全部已落地验证）

- **S1（b60d761，D-086）**：研究者身份（GET /runs 增 questionText/domain；侧栏/欢迎页问题文本主标签）；假设对比画布（2-3 假设并排：陈述/机制/前提/预测/证伪/证据平衡/得分/不确定性）；反馈抽屉全局化（假设卡/对比列/claim 行内直开，预置目标 chip 用陈述标签；焦点陷阱/脏关闭确认/内联成功态→修订链直跳）。三视角批判 P0/P1 全修（焦点抢夺/假 aria-modal/误关丢稿/反馈黑洞等 8 项）。验收：618/618 + tsc/build 0 + GUI dogfood（fbk_7tg3… 事件 #5612 闭环）。
- **S2（3dbe944，D-088）**：概览「研究动态」真实事件流叙事（阶段+模型/检索调用+状态变更，reduced-motion 降级，无虚构进度）；信任信号（GRADE-lite 徽章+降级轨迹、计划页统计纪律块、bundle limitations 附挂、对比判定阈值行）；真实新 run 全程等待期叙事。尾巴：来源链接丰富、反证检索记录结构化（→B3⑧/B13）。
- **S3（be4ddd0，D-089）**：hash 路由 #run/<id>/<tab>（mount 恢复/双向同步/后退）；ACH 判别性证据块（真实 supporting/counterClaimIds 计算，共享 vs 判别，绑定稀疏诚实注记）；跨 Tab claim 导航（flash 高亮）；in-tab 过滤（claims/假设）。诚实降级：版本对比因无 version>0 数据未做（EEL live 修订后已解除，→B3⑦）；claim↔hyp 绑定稀疏记为管线债务（→B6）。
- **S5（669fd2e，D-090）**：命令面板 Ctrl/Cmd+K（零依赖子串分词匹配；19 命令 4 组：新建/8 tab 导航/最近 8 run 按问题文本搜索切换/主题语言；↑↓/Enter/Esc/listbox 语义；实测 EGFR 过滤切 run、溯源切 tab、URL 同步）。桌面 quick capture 未做（→B10）。
- **S4 未独立成批**：子任务事件吸收进 B3①-④；quick capture 吸收进 B2③。

## 4. 一期批判修复存档（2026-08-22，三视角）

- P0-1 抽屉焦点抢夺（轮询重渲染）：focus 只在 mount 执行一次，回调入 ref
- P0-2 假 aria-modal：真 Tab 焦点陷阱 + 关闭归还触发按钮
- P1 误关丢稿：脏关闭确认（仅正文非空）；清空后 Esc 直关
- P1 反馈黑洞："201 Created" toast → 内联成功态 + 修订链直跳
- 目标 chip 裸 ID → 陈述标签（三处调用点）
- 证据平衡"未知"列 → "未解决不确定项 {n}"（uncertainties 真实语义）
- 对比列序按名次稳定排序；维度分行"未校准"标注；锚点 :target + scroll-margin；陈述 3 行钳制；选中计数 aria-live
