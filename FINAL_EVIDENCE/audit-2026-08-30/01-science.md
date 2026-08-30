# 科研能力平面审计（2026-08-30，只读源码级考古）

> 来源：终局接管第一轮并行审计（Explore 子代理，52 次工具调用）。载荷性结论（north-star 数字、counter-evidence 状态）已由主代理交叉抽验。
> 基线：project-spec/SCIENTIFIC_MODEL.md(186行)/EVALUATION.md(84行)；eval/north-star.json（防通胀规则：target 只能经 DECISIONS 显式上调）。

```
CAP-ID | 标题 | status | 当前实现(关键文件) | 真实缺口 | 风险 | 建议目标指标 | 验证方式 | 证据指针
CAP-1 | 科学问题建模 ProblemModel+MethodSelection | PASS | src/domain/problem-model.ts(382L,闭式zod+superRefine);src/pipeline/stages/scope.ts:118-243(scope阶段先于hypotheses形成,确定性id分配,checkMethodSelectionBinding跨对象校验) | 单次LLM提议无多草案对比；draft容忍短validationPlan由scope.ts确定性剥离 | 模型在闭式空间内仍可提弱形式化(如none_stated逃逸) | 问题模型覆盖率100%运行;selected家族100%带validationPlan | node dist/cli scope路径+vitest problem-model | tests/problem-model.test.ts,tests/problem-model-disclosure.test.ts
CAP-2 | 文献检索与全文理解 | PASS | src/pipeline/stages/retrieve.ts(1211L:openalex+europepmc+crossref+arxiv四族,counter优先,DOI/arXiv主键去重);src/pipeline/citation-chase.ts(向后引文追踪);快照进corpus版本化 | 全文理解以abstract为主,fullTextExcerpt非必得;OpenAlex每日预算硬限(实跑观察) | 单源预算耗尽时counter证据退化为crossref无摘要 | retrieval-verified-rate>=0.98(当前W4R实测1.0=72/72) | retrieval-known-answer/replay e2e | tests/retrieval-known-answer.test.ts,tests/sources-fulltext.test.ts,eval/results/metrics-w4-refresh.json
CAP-3 | claim extraction/binding | PASS | src/domain/claim.ts(verbatim ClaimLocator,CitationBindingStatus四态,GRADE-lite确定性阶梯gradeClaimCertainty/finalGradeCertainty);src/pipeline/stages/evidence.ts:427-442(checkQuoteAlignment确定性门,未对齐→resolved_unaligned永不充当verified) | 对齐检查是子串/相似度级,非语义级;GRIM只覆盖mean/n对 | 模型幻觉引文被fail-closed拦住但相近改写可过 | unaligned误标率0(设计不变量) | vitest claim forensics | tests/claim-match.test.ts,tests/stat-forensics.test.ts,evidence.ts:447-468(GRIM/range-guard/E-value)
CAP-4 | 矛盾与反证搜索 | PASS(从guidance升级为真实现) | retrieve.ts:enforceCounterEvidence(R-05拒绝无反证词查询)+buildTargets 3族counter席位+anchorCounterQueries确定性锚修复;src/server/counter-search.ts runCounterSearch(CLI far research counter-search+API);falsify.ts:377-400 topical gate+link audit | NextAction COUNTER_EVIDENCE_SEARCH(next-action.ts:302)本身仍是研究指引,非自治触发;闭环靠研究者CLI或retrieve内置 | 同族judge上界(glm判glm);n=30仅2题 | counter-evidence-substantive-hit>=0.7(当前0.867,exact-label披露更低) | node eval/counter-evidence-metric.mjs | src/domain/next-action.ts:302,src/server/counter-search.ts:69,eval/results/relation-precision-*-20260829.jsonl,tests/counter-search.test.ts
CAP-5 | 假设多样性/新颖性/去重/可证伪性 | PASS | src/pipeline/stages/hypotheses.ts(8策略+diversity supplement+跨策略负条件);hypothesis-dedup.ts(MinHash128perm并查集预合并,阈值0.9);hypothesis.ts FalsificationSpec+completenessCheck;D-017文献邻居新颖性 | noveltyLabel仍是单批LLM判断(默认mixed诚实);多样性下限触发supplement仅1轮 | 过合并毁多样性vs欠合并留重复,已选保守侧 | 去重后代表数>=下限无shortfall注记 | vitest dedup+falsify | tests/hypothesis-dedup.test.ts,tests/minhash.test.ts,tests/falsify-binding.test.ts,src/domain/minhash.ts
CAP-6 | 因果机制与修订链 | PASS | feedback.ts(审计事件+预测结算,无LLM)→revise.ts(causal revision,consumed-signal去重,checkpointed)→src/domain/artifact-diff.ts(RFC 6902 diff)+revision-predicates.ts(decisionRulePreservation/falsifiabilityRetention/scopeDelta纯函数) | revise.ts:159明示"W2无自动claim修订路径";修订谓词无LLM advisory消费层 | 反馈→claim级传播靠人工 | 每条feedback恰一revision;决策规则静默弱化检出率100% | vitest revision | tests/pipeline-revision.test.ts,tests/revision-predicates.test.ts,tests/artifact-diff.test.ts,tests/revision-quality-wiring.test.ts
CAP-7 | method selection→实验路由 | PASS | src/pipeline/stages/execute.ts:150-341(tabular ML/meta/theory_identity数值抽检/FEM收敛/protocol人类执行五腿,routeSkip按method_selection家族路由);executors:executor{,-meta,-theory,-fem,-simulation}.ts | theorem_proving明示系统内不可执行(problem-model.ts:213);optimization需sidecar | 路由错误把现象学题送FEM(有draft spec识别拦截) | 路由与selected家族一致率100% | vitest executor系列 | tests/executor-fem.test.ts,tests/executor-theory.test.ts,tests/executor-meta.test.ts,tests/cli-experiment.test.ts
CAP-8 | 实验设计语义 | PASS | src/domain/experiment.ts(mdeFloorFor可达性下限,impliedPowerFor,multipleTestingPolicy机械门);plan.ts:159-161多假设无multipleTestingPolicy→gate拒绝;结构化preregistration metricSpecs+完整性门(禁诺无执行器的统计) | 纯prose计划统计要素缺失仅warn不block(plan.ts:175-177);MDE下限仅[0,1]度量 | LLM诺无执行器的permutation/kappa会被preregistration-integrity gate拦 | plan-executability 5/5维持 | vitest mde/confirmatory | tests/experiment-mde-gate.test.ts,tests/experiment-confirmatory.test.ts,tests/plan-formal.test.ts,src/domain/protocol.ts(788L冻结注册)
CAP-9 | 不确定性与校准 | PASS(诚实internal-consistency披露) | src/domain/evidence-strength.ts(确定性relation strength,文献封顶moderate,unverified→unrated,crossRelationStrength弱端链);rank.ts:201 weightSensitivity(权重向量敏感性);prediction.ts ledger(RPS/Brier/skillVsUniform对无知基线);conformal.ts(alpha过小fail-closed) | ledger是系统内自洽信号非真校准;export.ts:604-612如实披露"样本不足分层标注证据不足" | 自洽被误读为外部校准(已文字披露防误读) | skillVsUniform>0的settled条目占比;weight敏感下排序稳定 | vitest ledger/rank | tests/prediction-ledger.test.ts,tests/science-rank-statistics.test.ts,export.ts:604-612
CAP-10 | abstention | PASS | evidence.ts:760-792(subject-coverage 2/2裁决,evidence-insufficient tag,gap-seek可撤销refusal);hypotheses.ts:462空verified基础拒生成;scientific-state kind=insufficient+premature守卫(:360);meta executor INSUFFICIENT_DATA机械下限 | gap-seek恢复依赖verified数增量,非覆盖质量回升 | 拒绝标签被当作终局(有resume affordance防premature) | 无假充足;insufficient态可恢复路径测试 | vitest debt-reopen | tests/evidence-debt-reopen.test.ts,src/domain/meta.ts:61,src/experiment/executor-meta.ts:218
CAP-11 | 复现/reproducibility bundle | PASS | src/app/verify.ts(VERIFY_CHECK_NAMES恒16检查同序,fail-closed不静默跳过,artifact sha256探针,lockfile上溯哈希,replayGuidance) | verify在bundle层,非全库重执行;证据等级declared非实测重放 | 环境漂移→degraded而非failed(仅check9) | 16/16且篡改必检出 | vitest verify(篡改用例) | tests/verify.test.ts:143-186,BUNDLE_MANIFEST.json,src/domain/provenance.ts
CAP-12 | 科研质量评估基础设施 | PARTIAL(内部强/外部薄) | eval/共20+脚本:rediscovery(FIRE-Bench机制自研,5任务)/judge-variance/ev1-judge-agreement/relation agreement/counter-evidence-metric/mlr-bench(官方rubric逐字,30条记录)/adjudication-accuracy(0.826)/baseline-direct+rag/retrieval-baseline;north-star.json防通胀账本 | 外部基准:AstaBench(2400+题11基准,公开)未接;ASI-Bench(60项目11领域)未接;FIRE-Bench官方repo无license→自研5任务种子(已披露);MLR-Bench仅n=5子样,judge与published锚非同模型(已披露);krippendorff alpha仅0.228(n=15) | 自评分无外部可比性;B-QWEN-LIVE-ROUTE凭证OPEN阻断竞赛live验证 | rediscovery F1 0.226→0.7;judge swing 0.267→0.15;relation agreement 0.61→0.8 | node eval/*.mjs(写eval/results/) | eval/north-star.json,eval/results/{rediscovery-v22-20260829,mlr-bench,ev1-judge-agreement,judge-variance-live-R3-v22-20260829}.json*,eval/results/adjudication-accuracy.json
```

## 关键数字快照（eval/north-star.json，全部标注测量日期与证据指针）

rediscovery mean F1 **0.226**（target 0.7）、judge variance **0.267**（target 0.15）、relation blind agreement **0.61**（target 0.8）、MLR-Bench overall **7**（target idea 7.4/proposal 7）、structured-output failure **0.011**（target 0.005）、retrieval verified **1.0**（72/72，W4R）、counter-evidence substantive hit **0.867**（polarity-retention 口径）。

## 本域 top3 最高杠杆改进

1. **Rediscovery 产品级机制对齐（0.226→0.7）**：测量层已校准到位（judge v2.2 修了真 bug），剩余缺口是产品级问题——2/5 任务 top hypothesis 提出与既定发现不同的机制（novelty-vs-rediscovery 张力）。这是"系统能否重新发现既定科学"的核心能力主张。
2. **外部基准接入（AstaBench 优先）**：AstaBench 公开（allenai.org/asta/bench，2400+ 题、可复现评测框架、HF leaderboard），MLR-Bench 已在仓内半接入（eval/mlr-bench.mjs 官方 rubric 逐字提取，升 SAMPLE_N 是机械活），ASI-Bench 覆盖自主执行段。接入后把"自评分"变成外部可比较数字。
3. **Judge 方差与 relation agreement 治理（0.267→0.15；0.61→0.8）**：测量噪声目前超过部分信号（EV1 krippendorff α=0.228, n=15）。v2.3 的 5-pass-median 分解已起步，relation agreement 的 contradicts 结构性消除（0/21 post-fix）证明确定性门有效，剩余 supports 带（11/18）是下一目标。

## 审计证伪掉的"声称已有"清单

- **历史 rediscovery "0.58"**：已被仓内自己证伪为 judge leniency，north-star.json 里保留双数字披露，当前真值 0.226。
- **"COUNTER_EVIDENCE_SEARCH 已闭环"**：NextAction 项本身仍是 guidance 投影（src/domain/next-action.ts:302），无自治执行器消费它；真实现是 retrieve 内置 counter 查询 + `far research counter-search`（研究者驱动）。
- **retrieval-verified-rate 0.9667**：已被仓内自我取代为 1.0（72/72，W4R），两数字并存易误引。
- **theorem_proving 方法家族**：枚举里存在但系统内不可执行（problem-model.ts:213 注释明示）。
- **"novelty 评分"**：非独立 LLM novelty 分；是 MinHash 去重 + 文献邻居接地之上的批式标签，缺省诚实为 mixed。
- **统计设计要素完备**：纯 prose 计划缺 power/样本量仅 warn 不 block（plan.ts:175-177）——"计划必带统计设计"过强。
- **prediction ledger "校准"**：是 internal-consistency 信号，不是外部真值校准；export 报告有诚实披露行（export.ts:604-612）。

外部基准查证：AstaBench (allenai.org/asta/bench)、MLR-Bench (arXiv 2505.19955, github.com/chchenhui/mlrbench)、ASI-Bench (arXiv 2608.17271, github.com/apexin-ai/ASI-Bench)。
