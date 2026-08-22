# Wave-5 Scout — Scientific AI Systems Source Expedition (2026-08-22)

**Mission** (user /goal): deep-read all obtainable automated-scientific-discovery system sources —
AI-Scientist v1/v2 (NOASSERTION, mechanism-only), paper-qa, aviary, robin (remainder),
AgentLaboratory, OpenScholar, MLR-Bench internals, co-scientist reproductions (Kaimen + LLNL)
— cross-compare on C4/C5 (evidence paragraph anchoring & citation presentation), D2-D5
(multi-hypothesis pipeline / review-revision / scheduling), B5/B6 (literature context budget &
fidelity), J1/J2 (self-eval & iteration); shortlist → source-level fusion with offline
benchmarks (live blocked by D-036) → adversarial audit → closeout.

**Method**: 10 repos fetched to `.cache/repos/` (codeload tarballs), licenses verified on
disk. Reports in `research/wave5-reports/` (6 subagent-written, 3 main-agent-written after
subagent rate-limiting [1302] killed 7 of 13 dispatches; robin's "failed" agent had already
written its complete report). Main agent spot-verified file:line claims across all reports
(6/6 checks passed on first pass; robin/Kaimen/LLNL/aviary verified by direct authorship).
**Parallel-session ownership**: Wave-4 fusion (F1 retry + F3 redact) holds uncommitted writes
on `src/providers/*`, `src/pipeline/llm.ts`, `src/shared/ports.ts`, `src/domain/provenance.ts`,
`eval/llm-judge.mjs` — Wave-5 fusion landing zones avoid all of these.

**License gate results**: AI-Scientist v1+v2 = RAIL-family custom ("AI Scientist Source Code
License v1.0") → mechanism-only, clean-room paraphrase, zero verbatim prompt/code copying.
paper-qa / aviary / robin / OpenScholar / Kaimen = Apache-2.0. AgentLaboratory / LLNL /
mlrbench = MIT. All others reachable; no AGPL, no no-license contamination.

## 1. Repo inventory

| repo | license | report | one-line verdict |
|---|---|---|---|
| SakanaAI/AI-Scientist | RAIL-family (mechanism-only) | AI-Scientist.md (subagent) | end-to-end + auto-review reference; v1 ideation loop = the diversity-injection origin |
| SakanaAI/AI-Scientist-v2 | RAIL-family (mechanism-only) | AI-Scientist-v2.md | "Workshop committee" is really an orchestrator + ~12 schema'd call points; T1 full-history ideation + T2 ensemble review are the takes |
| Future-House/paper-qa | Apache-2.0 | paper-qa.md | deepest C4/C5/B5 source; NO verbatim-quote loop in v5 (FAR-Lab's alignment gate is AHEAD); strip_citations + sanitization + score-then-cap are the takes |
| Future-House/aviary | Apache-2.0 | aviary.md | RL gymnasium — 不适用; recorded to prevent re-expedition |
| Future-House/robin | Apache-2.0 | robin.md | remainder: 3-partite experimental-insights taxonomy + tested-entities blacklist; tournament already ported; upstream stale-folder bug documented |
| SamuelSchmidgall/AgentLaboratory | MIT | AgentLaboratory.md | 3-persona adversarial review + NeurIPS-form JSON; revision loop is coarse (whole-chain recursion, dead iteration cap = anti-patterns to avoid) |
| AkariAsai/OpenScholar | Apache-2.0 | OpenScholar.md | post-hoc attribution w/ leave-uncited + gap→question→edit + max_per_paper + MinHash/query-echo dedup + edit regression guard |
| chchenhui/mlrbench | MIT | mlrbench-internals.md | judge = single call + anchored 5-band rubric + anti-leniency + non-average Overall; anchors win by STRUCTURE (zero iteration); no votes/debate exists |
| Kaimen-Inc/Co-Scientist | Apache-2.0 | Co-Scientist.md | best co-scientist repro; verbatim-excerpt review evidence + entities[] + budget shares + idempotent matches; whole mechanism stays rejected (registry C) |
| llnl/open-ai-co-scientist | MIT | open-ai-co-scientist.md | demo-grade (lenient defaults, static meta-review strings) — nothing ported; recorded |

## 2. Cross-cutting comparison (convergent findings)

### 2.1 收敛机制族（≥2 仓独立同构 → 高置信）

| 机制族 | 谁做得最好 | FAR-Lab 现状 | 判定 |
|---|---|---|---|
| 源论文引文噪声剥离（下游匹配/引用前 strip "(Author 2020)"） | paper-qa utils.py:127-131（evidence summaries）; OpenScholar open_scholar.py:37-38（retrieved passages，防 [n] 序号冲突） | claim 文本与 matching 归一化均不剥离 | **真缺口，W5-F2**（rediscovery F1 直连） |
| 近重复文档/段落去重 + 查询回声 | OpenScholar MinHash 13-gram LSH Jaccard≥0.8 + query 先入 hash（deduplication.py:28-90）; paper-qa doc_id=md5(doi+content_hash) + Context hash dedup | 检索按 identifier 去重——**跨库同文不同 id 的近重复漏网**（arXiv/OpenAlex/crossref 同文异 id） | **真缺口，W5-F1**（多源融合后的精确率面） |
| 多假设多样性回路（负约束/历史可见/演化算子） | AI-Scientist-v2 T1（全历史序列化+显式差异化）; Kaimen evolution（combine-most-distant/simplify/out_of_box + parent_ids）; AgentLab M29 反重复指令 | 3 策略+supplement+聚类；历史不全可见、supplement 只有一种算子 | **部分，W5-F4**（重复候选失败类已实证：DUPLICATE_MARKER 记录在案） |
| 评审锚定带（anchored bands）+ 反宽松 | mlrbench（5 全句带 + "Avoid giving high scores by default" + 非平均 Overall + 单一致命弱点否决）; AgentLab（15 字段表 + 加权合成）; AIS2（n 评审 + AC 元评审 + 截断均值） | relation 裁决 prompt 有定义但无锚定带；无多票 | **部分，W5-F5**（盲评一致率 0.61→0.80 直连） |
| fail-closed 生成端引用纪律 | paper-qa（Valid Keys 白名单 + 畸形引用 few-shot + 事后 sanitize）; Kaimen（评审 evidence 必须 verbatim excerpt）; OpenScholar（事后归属插入+允许不引用） | verify 门（claim→doc 绑定）强于多数上游；生成端白名单/事后 sanitize 缺 | 部分→P1 呈现层缓延（FAR-Lab verify 已是强项） |
| 修订回环纪律 | FAR-Lab causal-link-required（最强）; 对面可借鉴：AgentLab prev_*+评审原文成对注入形状 / OpenScholar edit regression guard / paper-qa key invalidation / AIS2 检查器矩阵+幂等早退 | causal chain 已有；回归护栏与检查器注入形状缺 | 记档+小步吸收（不立项——单点小，live 验证前不动修订语义） |
| 上下文预算（文献） | paper-qa score-then-cap 序列化器（-score,name 排序+cap+floor+旋钮阶梯 10/5/100w→30/15/300w）; OpenScholar max_per_paper 多样性帽 | 每 doc ≤4 claims + corpus cap 12 + counter seats——按 claim 压缩（同族思想） | 已有等价（记 knob ladder 为校准数据） |
| 成本记账 | AIS2 token_tracker（含 reasoning/cached，只记不控）; Kaimen per-agent budget shares（锁控准入）; AgentLab 全局累计 | receipts 全链记账（强于多数） | 部分；预算执行（Kaimen shares）DEFER→B（earn-complexity） |

### 2.2 FAR-Lab 已领先/已覆盖（防重做，记档）

Verbatim-quote 对齐门（paper-qa v5 已删除其 PaperQA1 引文校验——FAR-Lab checkQuoteAlignment 反而领先上游）；fail-closed verify（全家族最强）；结构化输出（zod+strict-FC vs 对面 prompt-beg+repair）；检索栈（3 源+RRF+listwise rerank vs 单源）；HITL 门（AIS2 为零，反面参照）；token 记账 receipts；评估统计（stats.mjs bootstrap+permutation 超过 mlrbench 仓内一切）；tournament+BT（已移植并加 swap 不一致信号）。

### 2.3 一致判定不适用（灵魂边界/最小架构/域边界）

RL 环境（aviary）；实验执行树/代码沙箱（AIS2 T4/M20 仅作 Direction-B 适配器接口参考蓝图）；常驻多 agent 委员会（AIS2 §3.1 证明"角色=schema 调用点"即可——FAR-Lab 阶段机已是此形态）；角色扮演层级（AgentLab 六角色=叙事开销）；Elo 排名核心与 generate-debate-evolve 整机制（registry C：符号翻转证据）；peS2o 自托管索引；引用计数先验（OpenScholar——偏旧偏热，科学上拒）；LLNL 全部；co-scientist CLI 后端。

### 2.4 诚实记录的对方缺陷（反面教材，防照抄）

mlrbench：Output-Format 块重复、"五/六维"漂移、broken retry loop（idea_generator.py:84-86）、无污染控制；OpenScholar：bare except 吞错、year 字段存了 title；AgentLab：修订回环默认死配置（review_total_steps=0）、input() 返回值丢弃、lit-review-backend 死配置；AIS2：README 宣传的自动阶段规划是死代码（grep 验证）、关键词扫杀进程、seed=0 与多样性目标自相矛盾；robin：experimental 轮排序读旧 dossier 文件夹的上游 bug；Kaimen/LLNL：宽松默认值掩盖失败（LLNL）。

## 3. Shortlist（EV-ranked；裁定口径=价值×当下可执行性——live 全断（D-036）→ 凡需 live LLM 才能出数字的项自动降档为"落地+排队验证"或缓延）

> **执行期修订（2026-08-22，前提实测后）**：并发现场发现并行会话已执行 W6/W7/W8/W9
> （DECISIONS 至 D-044）——retrieve.ts 被 Wave-6 会话锁定（F1 wiring 缓延）、eval/llm-judge.mjs
> 归 W4-F4、judge v2.1 已由 W9 落地（金标 0.40/0.12 + 固定 GT）。逐项前提实测结果：
> **W5-F2 REJECTED**（金标 104 对 claim 文本引文噪声模式命中 0/104——rediscovery 的 claim 是
> 命题抽取不含参考文献标记；匹配层剥离是死代码，评估后不采用）；**W5-F1→DEFER 注册表 B**
> （实测已录 46 runs 仅 3 对同 run 跨标识符近重复 ~0.5% 文档——失败类真实但材料性低于融合门槛；
> 探针 `spikes/wave5-near-dup-probe.mjs` 留存，反转触发=W6 把 counter 查询改道 crossref 后重跑探针）；
> **W5-F4 GO 获实测加强**（重复率 136/455=30%，37/40 runs 受累，最差 12 选 7 重复——
> `spikes/wave5-diversity-probe.mjs`）；**W5-F5 设计修订**：温度-0 三票多数在管线内是退化的
> （同载荷三连发=1 票），改为**单次独立对抗审计 pass**（换框架复核：审计者 vs 提出者，锚定带
> 纪律 + confirm/relabel/drop；审计失败保原件+可见告警）——对应主落点 falsify.ts（北极星 0.61
> 测的就是 claim→hypothesis 批判关系）+ evidence.ts 跨关系锚定带；**A1 已审**：rank.ts 无缺陷
> （整赛复用幂等 rank.ts:484-497 + W8 在飞的逐对域键 checkpoint 恰好覆盖 Kaimen 发现）。

| # | 候选 | 来源（license） | 期望值 | 决策 | 理由 |
|---|---|---|---|---|---|
| W5-F4 | 多假设多样性回路：跨策略 previouslyProposed 负向条件化 + supplement 四算子库（integrate/reduce/make-feasible/transplant） | AI-Scientist-v2 T1（NOASSERTION→机制级转述）+ Kaimen 演化算子分类（Apache-2.0） | **高** | **GO（已执行）** | 30% 重复率实证失败类；payload 形状测试确定性可验；F1 影响 live 排队 |
| W5-F5 | 关系裁决加固：falsify 锚定带 + 独立链接审计 pass（applyLinkAudit 纯函数）+ evidence 跨关系锚定带 | mlrbench 锚定带（MIT）+ AIS2/v1 集成评审（机制级）+ 悲观评审者默认 | **高** | **GO（已执行）** | relation-blind-agreement 0.61→0.80 直连；聚合确定性测试；盲评复测 live 排队 |
| W5-F3 | MLR-Bench 适配器保真：questionFor 结构保真（反 flattening）+ renderProposal 补渲染 predictions/证伪设计/决策规则 + proposal judge 附 idea 一致性上下文（对称） | mlrbench internals（MIT） | **高** | **GO（已执行）** | 差距归因逐条对应；dry-run+render-only 离线验证通过；判分协议变化 DECISIONS 披露（新旧口径不可直接比） |
| W5-F2 | claim 匹配引文噪声剥离 | paper-qa strip_citations（Apache-2.0） | — | **REJECTED（评估后不采用）** | 金标实测 0/104 命中——前提证伪 |
| W5-F1 | 跨源近重复文档卫生 | OpenScholar MinHash（Apache-2.0） | 低（当下） | **DEFER→注册表 B** | 实测 3 对/46 runs；retrieve.ts 并行锁定；探针留存+反转触发 |
| W5-A1 | rank 锦标赛崩溃-恢复双计审计 | Kaimen idempotent match | — | **AUDIT PASS（无缺陷）** | 整赛复用幂等已在；W8 checkpoint 补强在飞 |
| R1 | paper-qa 引用呈现 sanitize 管线 | paper-qa | 中 | **DEFER→B**（P1 产品 Wave 触发） | 呈现层 |
| R2 | 结构化 gap-question 定向补证环 | OpenScholar corrective RAG | 中 | **DEFER→B** | gap-seek+revise 已覆盖骨架；增量需 live 验证 |
| R3 | per-stage 预算执行 | Kaimen budgets.py | 低-中 | **DEFER→B** | earn-complexity |
| R4 | 嵌入式确定性去重聚类 | Kaimen proximity.py | 中（未来） | **DEFER→B** | 需嵌入端点 |
| R5 | Robin 三段式实验洞察 taxonomy + tested-entities 黑名单 | robin | 中（未来） | **DEFER→B** | Direction-B 适配器/多轮触发 |
| R6 | 修订回归护栏+检查器矩阵 | OpenScholar/AIS2 | 低-中 | **REJECT（当下）** | 修订语义=灵魂边界；长度比门误伤合法删除 |
| R7 | LLNL 任何子机制 / aviary / Elo 核心 / 常驻 agent 委员会 | — | — | **REJECT** | 记档防重访 |

## 4. Fusion plan（Marginal Value Gate 排序；不变量逐项对照）

执行顺序 **W5-F2 → W5-F1 → W5-F3 → W5-F4 → W5-F5 → W5-A1**（F2 最小且全离线先出数字；
F1 触及检索权威路径次之；F3 评估面独立；F4/F5 prompt+聚合层落地排队 live；A1 收尾审计）。

**不变量对照（全部项）**：零新运行时依赖（全部为纯 TS 函数/正则/提示词——zod-only 保持）；
灵魂边界（hypothesis/evidence/falsification/plan/revision/provenance 语义 FAR-Lab 原创不
动——F4 只改"生成看到什么"，F5 只改裁决呈现与聚合，判定语义不变）；不触碰并行会话
文件（providers/*、pipeline/llm.ts、shared/ports.ts、domain/provenance.ts、eval/llm-judge.mjs）；
新旧口径并报（F2 matching 口径变化按 D-037 先例记 DECISIONS）。

- **F2 设计**（依据 paper-qa `utils.py:127-131` 双 regex：`Author et al. (2020)` 与含年份圆括号）：
  eval/claim-match.mjs `contentTokens` 前置 `stripInlineCitations()`（双侧对称应用）；
  校准：claim-match-calibrate.mjs 对 recorded v1 claim 集复算 Jaccard/cosine 带移，报告
  borderline 带内改善对数与 F1 投影（旧/新并报）；pipeline 侧 build_evidence SYSTEM_PROMPT
  增一行"claim text must not contain inline reference citations"（live 排队验证）。
- **F1 设计**（依据 OpenScholar `deduplication.py:28-90` 13-gram LSH 思想，降依赖重实现）：
  retrieve.ts 配额选择前对候选池做确定性近重复合并——shingle(title+abstract) Jaccard ≥0.8
  视为同文，保留 identifier 最全者，合并 family 溯源（receipted）；查询回声：问题词高覆盖
  的文档（question-token containment ≥0.9）不因回声得利（仅当其检索分为纯文本回声时降权
  ——保守起见 v1 只做合并不做回声降权，回声防护记 B 项）。测试：合成跨源同文 fixture +
  真实近重复样例；离线测量：对已录 corpus 快照跑合并，报告近重复率与被合并对。
- **F3 设计**（依据 mlrbench-internals §2 表 12/13 + §1.2）：eval/mlr-bench.mjs 适配器
  （a）任务呈现附"聚焦单一主题"指引（anti-flattening，忠实呈现而非改写——适配器此前的
  flattening 是保真缺陷）；（b）proposal 渲染强制方法学结构段（算法步骤/数学/评估指标，
  LaTeX $…$/$$…$$ 约定——数据已有，渲染缺陷）；（c）FAR-Lab 自用 judge prompt（mlr-bench
  同评委比较路径）加锚定带+反宽松+非平均 Overall（措辞自写，结构借鉴）；--render-only
  离线验证渲染完整性。
- **F4 设计**（依据 AIS2 `perform_ideation_temp_free.py:99-125` 机制 + Kaimen 算子分类）：
  hypotheses.ts 每策略调用 payload 增 `existingRepresentatives`（已入库代表的 statement+
  mechanism，上限 8）；策略指令增显式负约束（必须与列出假设在机制或核心前提上不同）；
  diversity-supplement 的指令按四算子模板轮换（combine-远距组合/simplify-负荷剥离/
  feasibility/out_of_box-跨域综合——clean-room 措辞）。离线测试：payload 形状断言+算子
  轮换确定性；live F1 复测排队。
- **F5 设计**（依据 mlrbench 锚定带结构 + D-037 三票先例）：evidence.ts CrossRelationOut
  裁决 prompt 重写为锚定带（contradicts/supports/qualifies/not_comparable 各一段全句锚定
  + 反宽松 + 存疑默认 not_comparable）；聚合改为 3 次独立裁决（温度 0，批量）逐对多数票，
  分歧对记 uncertainty 字段（不隐藏分歧）；幂等（已有 existingCross 检查保持）。测试：
  聚合纯函数（多数票/平票→not_comparable）单元测试；盲评复测 live 排队。
- **A1**：读 rank.ts 持久化，验证崩溃恢复不重复计数；若缺防护补确定性 match-key 去重+测试。

**北极星映射**：F2→rediscovery-mean-f1（离线校准数字+live 排队）；F1→同上（失败模式量化
+未来 run 受益）+retrieval-verified-rate 不回退（合并保留 identifier 最全者，verification
语义不变）；F3→mlr-bench-overall（render-only 离线验+live 排队）；F4→rediscovery-mean-f1
（live 排队）；F5→relation-blind-agreement（live 排队）。**收口时账本更新规则：离线可测
的写实测值，live 门控的记 BLOCKED+机制已落地证据，不冒充。**

## 5. Fusion execution evidence (COMPLETE 2026-08-22)

- 前提实测（Marginal Value Gate，全离线零 API）：F2 REJECTED（金标 0/104 含引文噪声）；
  F1→DEFER（46 runs 仅 3 对近重复，探针留存）；F4 GO（重复率 136/455=30%，37/40 runs）；
  A1 AUDIT PASS（rank.ts 整赛复用幂等 + W8 checkpoint 在飞）。
- 融合落地：F4（hypotheses.ts 负向条件化+四算子）、F5（falsify.ts 锚定带+独立链接审计
  applyLinkAudit；evidence.ts 跨关系锚定带）、F3（mlr-bench 适配器 question 保真+渲染补齐
  +judge 一致性上下文，口径变化已披露 D-050）。
- 验证：tsc 0；pipeline-hypotheses **32/32**（含 4 个新测试）；build 0；全量 470/474
  （4 红=Wave-6 会话在飞的 W6/F4、W6/F5 审计修复测试，非本 Wave 面）；dry-run +
  render-only exit 0。
- 对抗审计（子 Agent 红审 + mutation 检查）：1×P1 + 2×P2 + 2×P3 → P1/P2/P2-test/P3-test
  已根治修复并加回归测试（跨极性重标签的对象图同步 + 提出侧 rationale 保留）；P3×2 记档
  （checkpoint 键未绑 payload → Wave-8 移交；unfenced 注入 → 有界，同现行惯例）。
- 详见 `evidence/W5A/fusion-evidence.md`；决策 D-049/D-050。
- **Live 验证队列（D-036 门控，UNVERIFIED-live 如实）**：rediscovery F1 复跑 / 盲判一致率
  复测 / mlr-bench 新口径复跑——任一模型路由恢复即执行。
