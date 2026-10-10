# HCI 全流程审计（2026-08-30，只读静态）

> 来源：终局接管第一轮并行审计（Explore 子代理，69 次工具调用）。基于工作区现状（含兄弟会话未提交的 conversation-stream 改动，只读）。

## 逐项 CAP

```
CAP-01 | 问题输入(问题框/材料/语音/Zotero) | PASS | web/src/lab/NewResearch.tsx + LabHome.tsx + SeedTray.tsx + DictationButton.tsx + ZoteroPanel.tsx | 无 | e2e core-journey/task-metrics | NewResearch.tsx:268-303
CAP-02 | Scope 预审 | PASS | NewResearch.tsx:71-211 + ScopeReview.tsx | 两套 ScopeReview 入口表单逻辑重复，行为漂移风险 | e2e draft-scope/surfaces §8.2 | surfaces.spec.ts:175-204
CAP-03 | 模型路线选择 | PASS | NewResearch.tsx:372-411 | 无 | core-journey.spec.ts:34-36
CAP-04 | 方法族选择(12 families) | PARTIAL | StudyMap.tsx:895-933(ProblemModelBand 只读展示) | 研究者不能直接改方法族(只能改 scope 间接影响)；规范承诺 correct the system's scientific decisions 但方法选择无人工覆写入口 | scope 审查面板加方法族覆写(入因果修订链) | rg methodSelections 全 web 只此一处展示
CAP-05 | 检索透明 | PASS | EvidenceTab.tsx:234-239(corpus 面板:查询计划/purpose 徽章/命中数/融合统计/源失败) | 无 | TESTING.md §10b
CAP-06 | 证据/来源/绑定 | PASS | EvidenceTab.tsx:176-211 + StudyMap.tsx:509-556 + ClaimInspector.tsx | 无 | surfaces.spec.ts:130-172
CAP-07 | 假设+反证+研究者操作 | PASS | StudyMap.tsx:558-616,766-893(promote/reject/fork/edit) + HypothesesTab.tsx | 无 | role-audit.spec.ts:25-48
CAP-08 | 排序/评分卡 | PASS | HypothesesTab.tsx + viz ScorecardsTable/TournamentCrosstab/RadarCompare | 排名只读(与产品定位一致) | core-journey
CAP-09 | 研究计划 | PASS | PlanTab.tsx + ExperimentsTab.tsx + viz PlanDag/PlanBudget | 无 | role-audit
CAP-10 | 实验执行/数据面 | PASS | ExperimentsTab.tsx(dataset_record+fem_spec+raw 下钻) | loading 用裸文本 "loading…" 非 Skeleton，与其余 tab 不一致 | 换 Skeleton | ExperimentsTab.tsx:90-120
CAP-11 | 协议(人工执行台账) | PARTIAL | ProtocolPanel.tsx + StudyMap.tsx:618-625 | (a)无协议时 band 完全不渲染，违反 HCI §2.1"无协议有诚实空态"；(b)协议加载期无占位,CLS 风险 | 缺席渲染一行"无协议(计算路径)"+加载占位 | StudyMap.tsx:618
CAP-12 | 长任务执行/中断/恢复 | PARTIAL | StudyMap.tsx:683-763(LiveBand n/9+耗时+armed 取消;PartialBand checkpoint 恢复) | StudyMap 上无 SSE 流健康指示(StreamStatusChip 只在 RunDetail 镜头)；map 断流仅靠静默 2s 轮询兜底 | LiveBand 集成同款横幅 | resilience.spec.ts
CAP-13 | 反馈→修订因果链 | PASS | FeedbackDrawer.tsx(focus trap) + RevisionsTab.tsx + StudyMap.tsx:1133-1160 | 无 | TESTING.md §9
CAP-14 | 导出/复现 UI | PASS | ProvenanceTab.tsx(quick strip/bundle 验证/重导出/报告/论文/404 回退) | verify 深层在 legacy #run tab(map 有链接) | 维持(深层 sanctioned) | surfaces.spec.ts:207-232
CAP-15 | 状态覆盖总体 | PARTIAL | 各组件见矩阵；ErrorBox 分级+重试；offline banner App.tsx:736-740 | 主要空洞：CAP-11 协议缺席/加载、CAP-12 map 流健康、ExperimentsTab 裸 loading | 见 top3 | 逐组件 rg
CAP-16 | 信任与透明 | PASS | StudyMap.tsx:942-1167(StateBand:领先解释/最强支持/最强反证/最大未知/置信/证伪器/次优行动/排序依据) + RunHeader truth 徽章 | map 顶栏 truth 徽章仅非 live 才显示，HCI §2.1 要求执行模式常显；RunHeader 内 live 也显示，两处不一致 | map 顶栏常显 live 徽章 | StudyMap.tsx:354-358
CAP-17 | i18n zh/en | PASS | dict.ts(3605 行,Record<DictKey,string> 编译期强制) + web-i18n-keys.test.ts + e2e parity | 残留:ResearchActions.tsx:87-89 插入编辑器的分析文案硬编码中文(EN 泄漏候选) | 文案入 dict | dict.ts:1809-1811
CAP-18 | axe 可访问性覆盖 | PARTIAL | surfaces.spec.ts:118-128(home+map,zh/light) + role-audit.spec.ts(inspector/plan/draft) | 未扫：Library/ConversationView/Settings/Terminal/Palette/EN 语言/暗色主题；useAxeAudit 仅 DEV console | 补扫+EN+dark | role-audit 扩展
CAP-19 | 键盘工作流 | PARTIAL | App.tsx:523-546(n/Ctrl+K) + RunDetail.tsx:226-240(tab 方向键) + focus-trap | e2e 仅覆盖三键；"键盘可完成核心旅程"是 §13 常驻门禁但无全旅程键盘 e2e；StudyMap inspector 无 focus trap | 全键盘旅程 e2e | surfaces.spec.ts:84-101
CAP-20 | responsive/高DPI/ultrawide | PARTIAL | styles.css/lab.css ≤980px 断点;375px 零溢出 e2e | ultrawide 靠 max-width 居中(无 >1920 实测证据)；375px e2e 只测 home+map；无 DPR 处理需求(SVG 矢量) | 375px 门禁扩到全部主要表面 | surfaces.spec.ts:103-116
CAP-21 | 长任务无假进度 | PASS | types.ts:150-162(runProgress 只算核心 n/9) + LiveBand(阶段+确定性计数+elapsedMin)；全 web 无百分比进度条/ETA 编造 | 无 | task-metrics T3
CAP-22 | 设计系统一致性 | PASS | styles.css(:root v2 token+暗色镜像,M3 动效)+lab.css/conversation-dock.css 复用同一 token | styles.css 2682 行单文件偏大,但 token 单源未分裂 | DESIGN.md 与建成代码逐 token 对齐
CAP-23 | CLI/API 术语一致性 | PASS | tones.ts(域枚举→label 单一 owner)；STAGES 与 src/domain/run.ts:14-18 逐字一致；status 8 值一致 | server 错误原文(英文)直接进 UI,设计上如实但未本地化 | 维持(如实原文) | web-i18n-keys.test.ts:21
```

## 状态覆盖矩阵（✓/✗；offline 为 shell 级 ◐ 全表面共享）

| 组件 | loading | empty | error | partial | offline | reconnecting | blocked | approval | recovery | large-data |
|---|---|---|---|---|---|---|---|---|---|---|
| LabHome | ✓骨架 | ✓ | ✓+retry | ✓ | ◐ | — | — | ✓ | ✓ | ✓ |
| NewResearch | ✓busy | — | ✓+retry+校验 | — | ◐ | — | ✓ | ✓scope审查 | ✓draft keep/discard | ✓ |
| ScopeReview | ✓busy | ✓ | ✓+retry | — | ◐ | — | ✓409 | ✓启动确认 | ✓ | — |
| StudyMap | ✓预留 | ✓ | ✓+spine 404 | ✓PartialBand | ◐ | ✗(仅轮询兜底) | ✓ | ✓决策+dispatch | ✓resume/取消/删除 | ✓截断+计数 |
| Claim/Hyp Inspector | ✓busy禁用 | ✓ | ✓+focus | — | ◐ | — | — | ✓排除需理由 | ✓reinstate | — |
| ProtocolPanel | ✗无占位 | ✗缺席静默 | ✓ | ✓终态只读 | ◐ | — | ✓伦理fail-closed | ✓审批表单 | ✓paused/unblock | — |
| EvidenceTab | ✓Skeleton | ✓阶段感知 | ✓+retry | — | ◐ | — | — | — | — | ✓筛选+graph截断 |
| HypothesesTab | ✓Skeleton | ✓ | ✓+retry | — | ◐ | — | — | — | — | ✓代表卡+折叠 |
| Plan/ExperimentsTab | ✓/裸文本 | ✓ | ✓+retry | — | ◐ | — | — | — | — | ✓raw下钻 |
| RevisionsTab | ✓Skeleton | ✓"有反馈无修订" | ✓+retry | — | ◐ | — | — | — | — | — |
| ProvenanceTab | ✓Skeleton | ✓多路空态 | ✓+404回退 | ✓degraded | ◐ | — | — | — | — | ✓receipts分组 |
| ConversationView | ✓phase流 | ✓占位诚实 | ✓+retry | ✓cancelled保留 | ◐ | ✓connecting/reconnecting | — | ✓审批卡+remember | ✓失败轮询对账 | ✓事件2000上限 |
| TerminalPanel | — | ✓无PTY诚实说明 | ✓ | ✓dead会话标注 | ◐ | — | — | — | ✓重开session | ✓会话上限 |
| Library | ✓文本 | ✓成因空态 | ✓+retry | — | ◐ | — | — | — | — | ✓分页+搜索上限 |
| RunDetail 镜头 | ✓ | ✓ | ✓ | ✓冻结提示 | ◐ | ✓StreamStatusChip | — | — | ✓ | ✓ |

## Top 3 最高杠杆改进

1. **常驻门禁做成全表面扫描**（CAP-18/19/20）：axe 只扫 zh/light 的 home+map；375px 只测 home+map；键盘只测三键。参数化循环扫 Library/Conversation/Settings/Terminal/EN/暗色——系统性防回归机制，§13 明文要求。
2. **Live 表面的连接真相与缺席真相**（CAP-11/12/16）：StudyMap LiveBand 加 StreamStatusChip 同款横幅；协议缺席渲染诚实空态；map 顶栏 live 徽章常显。
3. **方法族人工覆写入口**（CAP-04）：PRODUCT.md 承诺 correct the system's scientific decisions，claims/hypotheses 已可覆写，方法选择只读。加方法族覆写并进因果修订链。

## 证伪清单

- EN 模式触发 ResearchActions 分析插入 → 若中文泄漏则 CAP-17 降 PARTIAL（ResearchActions.tsx:87-89）。
- 打开无协议 settled run → 看不到"无协议"说明则证实 CAP-11。
- live run 时 kill SSE → StudyMap 无重连指示则证实 CAP-12。
- 2560/3440px ultrawide 实测 → 内容失衡则 CAP-20 降级。
- role-audit 扩扫 conversation/settings/terminal → 出现 critical/serious 违规则 CAP-18 "未扫"升级为"实际违规"。
