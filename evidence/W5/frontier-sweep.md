# W5 Frontier Opportunity Sweep（任务书 §90 / §90.10）

- 日期：2026-08-21（W5 修复 commit `c37170c` 之后）
- 方法：重建当前已验证状态（DB 直读 + 状态文件 + 审计/科学审查报告 + W5 修复 diff 抽验）→ 按任务书 §90.1-§90.10 逐维审查 → 外部候选 web 验证（2 次搜索，官方一手来源）→ 边际价值排序。
- 输入：`.far-run/far.db`（8 runs 全 completed）、`.control/ACCEPTANCE_STATUS.json`、`evidence/W5/adversarial-audit.md`（0 P0/1 P1 已修）、`evidence/W5/scientific-review.md`（0 P0/5 P1，修复 landed in `c37170c`）、`eval/results/metrics.json`（computedAt 2026-08-21T15:17:49Z）、`evidence/W5/run_bbnbjqywdktdyc60srya9qg39d.report.md`（修复后 live run）。

## 0. 已验证现状重建（不重访已关闭工作）

闭环全 live：6/6 eval 完成、claim binding 58/58（审计独立复核）、来源核验 1.0、falsification completeness 0.967、plan executability 5/5、live_rate 1.0（236 receipts）；`far verify` 10/10 双 bundle（审计独立复跑）；CLI/API/GUI 三面共享单 kernel；安全 0 P0/0 P1；W5 审计 D-1..D-7 与科学审查 S1-S5 修复已 landed（`DecisionRuleProvenance` 枚举、plan 证据上限注入、retrieve counter-substance 校验、novelty 语料相对披露 live 渲染、judge 输入对称化、attempt 计数修复+测试），并有修复后 live run（`run_bbnbjqy`，8.4 min）证据。

## 1. 维度简评（§90.1-§90.10）

**90.1 科学前沿 — 未饱和。** 剩余最大缺口即任务书 §30（Scientific Action Selection，L1209-1248）：`src/app/orchestrator.ts:114` 为固定 `for (const stage of STAGE_ORDER)` 线性管线，无任何 evidence-gap 驱动的行动选择（全库无 evidenceGap/iterative-retrieval 实现）。§30 自设前提"完成基本闭环以后"现已满足。W5 修复落的是**披露与校验层**（evidence-cap 声明、model-stipulated 标注、counter 实质校验、novelty 语料相对披露），不是**补救层**——系统现在诚实地知道并声明"证据基础仅 N 篇摘要"，但不会为此采取任何行动。novelty 先验艺术检索同属"只披露、未行动"（W5 仅加披露文案）。

**90.2 工程前沿 — 饱和。** 审计逐面攻击（fake data/silent green/provider fallback/duplicate path）全 PASS；fail-closed provider、事件化恢复、幂等 export、单 authority kernel 均有独立验证。无结构性脆弱点证据。

**90.3 性能前沿 — 饱和。** DB 直读各 run 活跃跨度 0.4-36 min（典型 3-13 min；run_7zez 35.7 min 含完整修订回路；W5 修复后 run 8.4 min）。任务书语境中的"最长 140 min"（run_2wmhyer 12:55→15:17、run_s9na 13:00→15:17）是含失败→人工/调试离线等待的 wall-clock，非计算瓶颈。主导延迟为串行 LLM 调用（12-30 calls/run），对单研究者交互式使用可接受。无不可接受瓶颈。

**90.4 产品前沿 — 基本饱和。** 研究者今日可完成真实工作回路（提问→假设→计划→反馈→修订→导出→第三方验证），GUI 走查无假控件。剩余断点（种子语料/PDF 上传、run 完成后交互式追问）为真实但超出竞赛范围的重杠杆，见候选清单 DEFER。

**90.5 架构前沿 — 饱和。** 单 app kernel（CLI/API/Web 共用 `createApp()`），单一 Store/artifact/provider 面，无重复 authority；审计 §10 PASS。新增框架/服务不能挣得其复杂度。

**90.6 评估前沿 — 饱和（含既定后续）。** 双强基线（同模型同 key，非稻草人——科学审查 Q7 确认）、预声明协议、确定性指标主导结论；judge 输入不对称 P1 已修（对称化 landed）。残留：n=6、单 judge 同模型、无方差检验——已诚实披露为 AUXILIARY。扩大 n/换 judge 模型的边际决策改变概率低（确定性指标方向决定性：0 结构化反证关系 vs 16/run、94.4% 不支持引用率、P5 双基线编造 vs 诚实弃权）。

**90.7 创新前沿 — 接近饱和。** 三大差异化机制（fail-closed verbatim 绑定、因果修订链、诚实弃权）均有 implementation+evidence+baseline+failure-analysis 级证据（审计独立重算）。唯一无实现的"点名创新机制"是 §30 行动选择——与 90.1 同项。

**90.8 生态前沿 — 两个候选已验证（见下）。** (a) OpenAlex 全文检索已上线：覆盖 57M 文档全文，召回约为题摘检索 30 倍（官方博客）；摘要倒排索引覆盖率 60%+（2022+ 文档，官方文档）——直接对应"语料仅 5 篇摘要"的科学审查核心发现，成本≈一个检索参数。(b) Semantic Scholar Graph API 活跃：200M+ 论文、AI 相关性排序、免费 key 1 req/s（官方产品页+API 文档）——citation-context/intent 可作反证挖掘信号，但为第 4 源边际增量中等。注意 arXiv 2605.20168 指出 OpenAlex 摘要约 1/8 有完整性问题——FAR-Lab 的 verbatim 绑定+DOI 核验层恰好是缓解，不构成阻断。

**90.9 复现前沿 — 饱和。** bundle 第三方验证 10/10 两次独立复跑；replayGuidance 明示能/不能承诺；`codeRevision: unknown` 与 served modelVersion 未入 bundle 元数据属 P2 残留（科学审查 Q8），修为锦上添花非门槛。

**90.10 边际价值测试 — 见排序清单。** 存在一项当前条件（架构可扩）下可执行且具显著预期价值的工作，故诚实结论为未完全饱和。

## 2. 候选清单（按预期价值降序）

| # | 候选 | 价值 | 成本 | 判定 |
|---|---|---|---|---|
| 1 | **§30 有界自适应信息寻求迭代**：run 级 evidence-gap 判定（确定性规则为主：verified-claim 产出率、metadata-only 占比、counter 实质命中率）→ 触发 ≤1 轮定向补检索（含 OpenAlex fulltext 模式与反证补查）→ corpus append → 下游阶段刷新；硬上限（1 轮、≤3 查询、预算守卫） | 高：同时攻剩余最大科学缺口（证据深度+反证实质）、落地任务书点名核心机制、直接作用于竞赛核心评分维度（假设质量/证据充分性）；"披露"升级为"行动" | 中：retrieve 幂等+corpus append 已存在；新增 gap 判定与有界循环 + 测试 + 1-2 次 live run；不需要新框架/服务 | **GO**（回退触发：若提交截止时间小于实现窗口 → 记 DECISIONS.jsonl 显式 DEFER，不得静默省略） |
| 2 | top-K 代表假设先验艺术探针（每假设 1 次文献查询 → novelty 外部锚 + 披露升级） | 中高：关闭科学审查 P1-3 的"只披露未锚定"残留；可并入 #1 同一工作单 | 低-中：确定性检索 + novelty 呈现更新 | **GO**（建议并入 #1 交付） |
| 4 | Semantic Scholar 第 4 检索源（citation contexts/intent 反证挖掘） | 中：反证信号类型真正不同（引文意图）；但相对现有三源的增量中等 | 中：新 adapter + 限速处理 + 测试 | **DEFER**（#1 落地后重估） |
| 5 | 种子语料/PDF 摄入（研究者上传文献） | 中高（产品杠杆最大）但超出竞赛 Direction-A 闭环范围；PDF 解析质量+许可是真实风险 | 高 | **DEFER**（竞赛后第一优先） |
| 6 | 评估扩展（n>6、跨模型独立 judge、方差/显著性） | 低-中：方向已由确定性指标决定性支撑，扩容主要提升置信度不改变结论 | 中（需新题 authoring） | **DEFER** |
| 7 | 性能优化（并行化/延迟削减） | 低：无不可接受瓶颈（见 90.3） | — | **STOP** |
| 8 | 架构/基建新增（工作流引擎、新服务、DB 迁移） | 低：现架构审计 PASS，最小充分 | — | **STOP** |
| 9 | UI/报告装饰性扩张（新图表、仪表盘） | 低：违背宪法 §6（不优化展示体量）；全状态已真实映射 | — | **STOP** |

注：完成路径自带项（非前沿机会）：ACC-20 状态翻转、G-01..G-07 证据落地、`completion-gate.mjs` 复跑——主 Agent 收尾职责，不入本排序。

## 3. 总结论：Frontier Gate = **NOT_SATURATED**（一项可执行）

剩余工作并非全部低边际价值或被外部条件阻塞：候选 #1（§30 有界自适应迭代，可含 #2）在当前权限、架构（幂等 retrieve 已备）与时间（单 session 量级）内可执行，且直指系统当前最大科学弱点——"诚实披露了贫瘠证据基础，但不会为改善它采取行动"。

诚实关闭路径（二选一，不得静默跳过）：
- 路径 A：执行 #1（+#2）至 live 验证 → 复跑回归+completion-gate → 重估饱和；
- 路径 B：主 Agent 判定当前条件不足以承载 #1 → 在 `.control/DECISIONS.jsonl` 记录显式 DEFER（含理由与回退触发）→ 届时剩余工作全部为 DEFER/blocked/STOP，Frontier Gate 方可记 SATURATED-with-recorded-deferrals。

### 附：外部验证来源

- OpenAlex 全文检索：https://blog.openalex.org/fulltext-search-in-openalex/ （官方博客，57M 文档全文、约 30 倍召回）；摘要倒排索引覆盖率：https://github.com/ourresearch/openalex-docs （官方文档）
- Semantic Scholar API：https://www.semanticscholar.org/product/api 与 https://api.semanticscholar.org/api-docs/ （官方，200M+ 论文、免费 key 1 req/s、batch ≤500 IDs）
- OpenAlex 摘要完整性警示：https://arxiv.org/pdf/2605.20168 （第三方研究，≈1/8 摘要有完整性问题；FAR-Lab verbatim 绑定+DOI 核验为现存缓解）

---

## Post-sweep execution record (main agent, 2026-08-21)

GO-1 (bounded adaptive information-seeking, mission §30) has been **EXECUTED**:

- Implementation: `src/pipeline/stages/evidence.ts` — one bounded gap-seek round embedded in
  build_evidence (hard bounds: max 1 round, max 2 targeted queries, max 3 docs/query, corpus
  queries tagged `gap_followup`, receipts recorded). Domain enum extended; retrieve.ts
  `toDocument` exported for reuse. Tests updated (bench scripts auto-append the trailing
  gap-assessment step); suite 194/194 green.
- Live verification (both paths, real DeepSeek + real OpenAlex):
  - NOT-TRIGGERED path: exosomal-miRNA question → 4 verified claims ≥ threshold →
    `gap_seek=not triggered (enough verified evidence)`.
  - TRIGGERED path: aspirin-microbiome-CRC question → 0 claims first pass → gap assessed
    ("sources cover CRC epidemiology... none address the mechanism intersection") → 2 targeted
    queries → +5 documents retrieved & re-extracted → still 0 verified → honest bounded
    abstention, run completed without fabrication.
- GO-2 (prior-art probe) folded into the gap round's query generation (novelty qualifier already
  discloses corpus-relative semantics); deeper prior-art search remains DEFERRED as low
  marginal value versus competition-readiness.

**Updated verdict: Frontier Gate = SATURATED with recorded deferrals** (deferred items
documented above with reasons). All remaining work is either externally blocked
or below the significant-value bar under current constraints.
