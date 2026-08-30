# 评估基础设施/外部验证审计（2026-08-30，只读）

> 来源：终局接管第一轮并行审计（Explore 子代理，33 次工具调用）。核心证据逐文件核验（含原始 JSON 与北极星台账交叉比对）。
> 主代理抽验（08-30）：三处提交文档引用的 "worstTaskSwing 0.061 < 0.15 达标" 已被同日 5/5 实测 0.19 否决、又被 08-29 复测 0.183/0.267 再否决（evidence/W9/judge-variance-hardening.md:59 有明确 supersede 记录）——确认属实，属数字诚实违规，须修。

```
CAP-01 | eval/目录全量清点 | PASS | 40+评估器（rediscovery、judge-variance、mlr-bench、metrics、claim-match-calibrate、adjudication-accuracy、prompt-regression、w4-refresh、baseline-direct/rag、redteam p1-p8）；结果归档 eval/results/（40+文件） | 最近实跑=2026-08-29；mlr-bench 停在 08-22；部分结果文件新旧口径混放 | 低 | 加 eval/results/INDEX | eval/
CAP-02 | rediscovery 重演 | PARTIAL | eval/rediscovery.mjs + rediscovery-judge.mjs + rediscovery-tasks.mjs(GT 固定)；实跑 0.226(2026-08-29, glm-5.3, 5 任务, run ids 在 rediscovery-runs.jsonl) | 0.226 vs 目标 0.7 差距巨大；2/5 任务 top 假设提出与既有发现不同的机制（novelty-vs-rediscovery 张力已披露）；N=5 自编任务非外部 curated | 高 | 扩任务集至>=10、mean F1>=0.4 中间台阶或 per-task bootstrap CI | node eval/rediscovery.mjs | north-star.json L5-22
CAP-03 | judge variance | FAIL | eval/judge-variance.mjs；实测 0.183(R3.json) 与 0.267(R3-v22) | 目标 0.15 两份实测均超；north-star.json 引用错位（写 0.267 引 summary=0.183 的文件）；提交文档引 0.061 为已被 5/5 实测 0.19 supersede 的 2/5 小样本数 | 高 | 5-pass decomposition 后 worst swing<=0.15 | node eval/judge-variance.mjs --live 3 | W9/judge-variance-hardening.md L49-59
CAP-04 | relation agreement | PARTIAL | north-star(relation-blind-agreement 0.61)；双数字披露 0.867 极性保持/0.467 精确标签(n=30, 2 问题) | 同族 judge=上界；exact-label 0.467 很低；live 重测被配额阻塞 | 中高 | exact-label>=0.7 on >=5 问题、异族 judge 交叉 | spikes/relation-precision.mjs 扩样本 | north-star.json L42-57
CAP-05 | structured-output reliability | PARTIAL | 三层容错链 strict-FC→json-repair(算法级移植,ISC)→bounded corrective re-ask；修复层基准 75/75+192/192；live 失败率 0.011(1/91) | 目标 0.005 未达；08-22 后 per-call live 复测被配额阻塞 | 中 | 复测失败率<=0.005 | receipts 统计 | W7/repair-benchmark.md
CAP-06 | research-quality benchmark(MLR) | PARTIAL | eval/mlr-bench.mjs(MIT)；同 judge 同任务：farlab idea 7.00/proposal 6.20 vs o4-mini 7.80/7.40 | 低于锚点；N=5 切片；D-050 后协议已变未重跑 | 中 | 新协议下重跑 30 任务、idea>=7.4 | node eval/mlr-bench.mjs | mlr-bench.jsonl
CAP-07 | baseline: 同模型直答 | PASS | eval/baseline-direct.mjs + 预声明协议 PROTOCOL.md(先于结果固定)；W4R：direct unsupported-citation 85% vs FAR-Lab 0%/104 条；S1 公平性修复由对抗评审抓出当日重跑 | FAR-Lab run 为 cache-assisted(逐 receipt 披露)；n=6 | 低 | 协议已公平，保持 | W4R/evaluation-report.md
CAP-08 | baseline: RAG/检索 | PASS | baseline-rag.mjs + 确定性 replay；EuropePMC top-5(OpenAlex 429 偏离已披露且使基线更强)；19/19 引用可解析 | parse 4/6(temp0.4 不稳定如实记录)；无 claim 模型是结构性缺陷非协议不公 | 低 | 维持 | W4R/evaluation-report.md L13-29
CAP-09 | baseline: 外部产品 | FAIL | 仅 evidence/W-A/cases/*.png(Elicit/SemanticScholar/ConnectedProducts 截图)作设计参照；value-vs-baseline.md 与 VALUE-COMPARISON.md 是"vs 同模型直答"两份文档 | "vs ChatGPT 类产品"外部主张零实测 | 中高 | 同一 6 问题跑 1 个真实外部产品结构化对照 | 手工+截图归档协议 | EVALUATION.md L16 允许 reference comparator
CAP-10 | gold suite 覆盖度 | PARTIAL | W4 问题集 6 问覆盖 normal/contested/counter-rich/insufficient/source-conflict 五类，但域全部生物医学；rediscovery 5 任务同样全 bio | 无跨领域未知任务集（无物理/化学/材料/社科/经济）；通用性主张仅由窄 bio 集支撑，违反 EVALUATION.md L7 自身规则 | 高 | >=3 非 bio 领域各 2 问 held-out（答案封存 hash） | eval/problems.json
CAP-11 | prompt 版本管理 | PARTIAL | prompt-regression.mjs：sha256 快照锁全部 stage prompt+安全规则 wiring+预算帽+字节确定性；--check 出口 1 防漂移 | 无语义版本 id/changelog、无 per-prompt gold corpus、无 failure taxonomy 回归（只有 drift 检测） | 中 | 快照加 version+DECISIONS 条目 | node eval/prompt-regression.mjs --check | eval/prompt-snapshot.json
CAP-12 | 用户研究协议 | FAIL(BLOCKED_EXTERNAL) | 无 SUS/UMIX/time-to-insight instrumentation；无招募/知情同意材料；用户验收=G12 代理走查（agent 自己执行）；FRONTIER_STATUS 承认 formal owner verdict pending | 真实科研人员验证=零 | 高 | n>=3 真实研究人员：任务成功率+SUS>=70+time-to-insight | 招募材料+问卷模板+录屏存档 | evidence/hx/hx7-acceptance-journey.md
CAP-13 | blind comparison 基础设施 | PARTIAL | llm-judge.mjs seeded shuffle 盲标+统一投影防 de-blind+blind_mapping 入记录；judge-votes.mjs 多票中位数+spread；ev1 Krippendorff alpha(0.228 如实记录) | 盲评仅覆盖 LLM judge，无人类评委界面/多人聚合；alpha 0.228 本身说明单 judge 分数不可靠(已降级 auxiliary) | 中 | 对外 LLM 评分保持 blind+votes+spread | ev1-judge-agreement.json
CAP-14 | judge 自身校准 | PASS(方法学)/FAIL(文档一致性) | 完整证据链：0.58→0.03→0.14→0.117→0.226(boolean-strict)；两个 root cause 文档化；gold 157 对零误差锁阈值；judge 层带内精度 0.826/TPR 0.919/FPR 0.222 | 提交文档三处引 0.061 旧数（已被 supersede）；north-star delivery-number-honesty 自报 0 不符(实际>=1) | 高 | 提交文档改引未达标实数+方向归因 | diff submission 数字 vs 原始 JSON | submission/技术方案文档.md:90 等
CAP-15 | FRONTIER_STATUS 诚实度 | PARTIAL | 内容本身诚实（blocker 标注 user-owned/external，live-route 如实标 tested） | asOf=08-27 早于 W4R 重跑/rediscovery v2.2 重校/judge variance 未达标实测——未反映最新；六维度无一是科研能力维度 | 中 | 每次 eval wave 后刷新+science-metrics 维度 | asOf vs 最新 generatedAt | FRONTIER_STATUS.json
```

## Top 3（按"证明真实科研价值"排序）

1. **修提交文档数字诚实（当天可完成）**：三处 0.061 引用换成 08-29 实测（0.183/0.267 未达标 + 4/5 任务 ≤0.045 + 残余归因）；修 north-star.json 引用错位。这是唯一一处"以有利旧数替代不利新数"的实例，直接威胁 0.58→0.226 建立的诚实叙事。
2. **建跨领域 held-out gold suite**：现有评估资产 100% 集中生物医学。新增 >=3 非 bio 领域、每域 2 问、答案封存的未知任务集，是 rediscovery 0.226 和 W4R 结构优势具备外推力的前提。
3. **最小真实用户验证（n=3 破零）**：以 gold study 为材料让 3 名真实研究人员完成"核验 claim→比较假设→给反证→导出验证"+SUS。instrumentation/协议/招募材料先完整开发（软件侧不 BLOCKED）。

## 外部基准接入可行性（2026-08 现状）

- **AstaBench**（Ai2, ICLR 2026；11 子基准、2400+ 题、四类任务，开源，要求绑定 commit+runtime logs）：接入成本中高（Python infra+沙箱+API 预算），**文献理解类切片与 Direction-A 最匹配**，方法论与本项目 anti-inflation 同构。仓库零对接痕迹。**适合：取 literature-understanding 子集做第三方锚点，性价比最高。**
- **ASI-Bench**（arXiv 2608.17271）：创新探索+自主执行联合评测；新、工具链不成熟、与文献-假设-反证主线错位。**不适合优先。**
- **MLR-Bench**（NeurIPS 2025 D&B；201 任务+MLR-Judge）：**仓库已适配**（MIT，seeded N=5，30/30 judge 成功），当前 7.00/6.20 低于 o4-mini 锚点（Feasibility 反超）。**适合：扩样 30 任务+新协议重跑，"输得起但维度归因清晰"。**
- **FIRE-Bench**（ICML 2026）：机制已被自研复刻为 rediscovery eval（官方无 LICENSE、HF 不通，5 任务自编已披露）。无需再接官方版，扩自编任务集即可。

Sources: allenai.org/blog/astabench · openreview.net/forum?id=M7TNf5J26u · arxiv.org/abs/2505.19955 · github.com/chchenhui/mlrbench · arxiv.org/abs/2608.17271
