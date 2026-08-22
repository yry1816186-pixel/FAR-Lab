# D3 尽调：预测校准与系统自我评估闭环（Prediction Ledger / 评分规则 / 校准报告 / 排序效度 / 元科学先例）

日期 2026-08-22。只读调研，一手来源经 WebSearch/WebFetch 核验；两处无法拉取全文的按 UNVERIFIED 标注（Wiley 403、ResearchGate 未抓）。贴地文件：`src/domain/hypothesis.ts`（`expectedRelation`/`uncertainty`）、`src/pipeline/stages/rank.ts`（`bradleyTerry`/ILSR/`btScore`/SCORE_DIMENSIONS）、`src/domain/experiment.ts`（`ExperimentVerdict = ['supports','weakens','falsifies','inconclusive']`——注意实际是 **4 类**且 `weakens` 当前保留给未来 multi-binding 聚合）、`src/domain/claim.ts`（`gradeClaimCertainty` 4 级）、`src/domain/scorecard.ts`、`src/pipeline/stages/falsify.ts`。
标注约定：【文献实据】= 来源直接陈述；【检索摘要级】= 搜索结果转述、未核全文；【映射提案】= 我的设计建议。

**现状缺口确认**：每 run 产出的前向断言——expectedRelation、VOI `expectedSeparation`、BT 排序+不确定度、judge N 票中位数+spread、GRADE 自评级、EEL 裁决——全部**一次性消费后丢弃**，无任何跨 run 结分/校准追踪。反馈环（实验反馈→因果修订→版本对比）改的是**假设内容**，从不回打**预测者的分数**。

---

## 1. 严格正当评分规则（选哪把尺子）

**① 一手来源**
- Gneiting T, Raftery AE. "Strictly Proper Scoring Rules, Prediction, and Estimation." *JASA* 2007;102(477):359–378, DOI 10.1198/016214506000001437（T&F 页面核验，被引 ~8900）。统一框架：log/球面/二次（Brier）家族 + CRPS。
- Brier GW. "Verification of forecasts expressed in terms of probability." *Monthly Weather Review* 1950;78(1):1–3（经典引文，本轮未重新拉取全文）。
- Murphy AH. "A New Vector Partition of the Probability Score." *J Applied Meteorology* 1973;12:595–600；简化与推广见 Siegert S. et al. *QJRMS* 2016, DOI 10.1002/qj.2985（摘要核验）。
- Machete RJ. "Contrasting probabilistic scoring rules." *JSPI* 2013（ScienceDirect 摘要核验）——Brier/log/球面敏感度对比。
- 有序类别→RPS：Wikipedia "Scoring rule"（RPS 唯一考虑类间距离，即类 1 错报成 2 比错报成 3 罚得轻）；RPS 是 CRPS 的离散对应（G&R 2007）。

**② 机制要点**【文献实据】
- **正当性**：proper = 期望分在说真话时最大化；strictly proper = 唯一最大化。log score 是唯一 local proper rule；Brier 是二次族，有界 [0,1]。
- **尾部敏感度**：log score 对极端概率错误**无界惩罚**（预测 0.99 错了灾难性扣分，且能区分 0.99 与 0.999）；Brier 有界、对极端错误"钝感"（0.99 错约 0.98）【文献实据，D'Ratings/MetricGate 实务陈述 + Machete 学术对比】。推论：**log score 对"自信的宽大偏置"更敏感，Brier 会掩盖中段系统性偏移**——两者都记，兼得钝感稳健与尾部警示。
- **有序类别用 RPS**：对 k 个累积切点取 (预测CDF−实际CDF)² 之和；对 4 级 GRADE 和 EEL 裁决这种有序结果，普通 multi-class Brier 把"high 误判 no_effect"与"low 误判 no_effect"同罚，RPS 按距离罚——正确选择。
- **Murphy 分解**：Brier = reliability（校准项）− resolution（判别项）+ uncertainty（环境项）。我们既有"校准"与"判别力"两个独立关切，分解后各看各的，避免一个总分掩盖两种病。

**③ FAR-Lab 落点**【映射提案】
- 评分菜单（确定性代码，零模型调用，进 W9 统计层）：
  - EEL 裁决（4 类有序，按"证据不利于假设的程度"排序 `supports < inconclusive < weakens < falsifies`——`weakens` 语义为轻度不利，`inconclusive` 居中，此排序为设计决策需在 schema 注明）：**RPS 主分** + 逐类 Brier + clamp 后 log（p 下限如 0.02，防单条灾难性支配均值）。
  - GRADE 4 级自评 vs 后续证据触发重评：RPS。
  - 二值预测（"该假设会被 EEL 支持？"）：Brier + log 双记。
  - VOI `expectedSeparation`（数值）：CRPS 或区间评分（G&R 2007 interval score）——依赖数值化 outcome，见 P3。
- judge 宽大偏置的对症：偏置=概率质量系统性移向 `supports`/高 GRADE → 在 reliability diagram 上表现为整体上凸偏离对角线，Brier/log/RPS 都会捕捉；**log 对"高置信宽大"额外重罚**。分层见 §3。
- 优先级 **P1**。

## 2. 复制预测市场/预报研究（基线锚 + 聚合启发）

**① 一手来源**
- Dreber A, Pfeiffer T, Almenberg J, et al. "Using prediction markets to estimate the reproducibility of scientific research." *PNAS* 2015, DOI 10.1073/pnas.1516179112（官网核验）。
- Camerer CF, et al. "Evaluating the replicability of social science experiments in Nature and Science between 2010 and 2015." *Nature Human Behaviour* 2018;2(9):637–644（nature.com 核验）。
- Gordon M, et al. "Predicting replicability—Analysis of survey and prediction market data from four studies." PMC8046229（标题核验）；Replication Markets 项目"市场 73% vs 调查 66%"为【检索摘要级】。
- Feldman G, Forscher PS, et al. "Using prediction markets and forecasting surveys to predict 28 replication outcomes of classic articles..." *Royal Society Open Science* 2026;13(1):250377（文章页核验）：**预测 70% vs 实际复制 57%——对经典老发现人群系统性过乐观**。
- Metaculus：FAQ（官网核验）community prediction = **recency-weighted median**；AI track record notebook（WebFetch 核验）：64 个已解决 AI 问题，Community Prediction Brier **0.207**、Metaculus Prediction **0.182**、无知基线（恒报 50%）**0.25**。
- ForecastBench（Karger E, et al. arXiv:2409.19839 + forecastbench.org，核验）：动态无污染预报基准；超级预报员 Brier **0.093** vs 最佳 LLM ~**0.111**（初期数据，后续 AI 追至 ~0.101）。

**② 机制要点**【文献实据】
- 预测科学复制结果，人群可达 **~71–73% 二值准确率**（Dreber/Camerer/Replication Markets 一致），且**市场聚合 > 个体调查**；但对"经典"文献聚合预测过乐观（70% vs 57%）——**领域先验会污染聚合**。
- 聚合机制实证：recency-weighted median 是 Metaculus 的稳健默认（对异常值鲁棒）；参与人数边际收益递减。
- Metaculus 官方立场值得抄：**对 Community Prediction"不声称完美校准，但无证据反对"**，并做 50% 置信带模拟校准检验——诚实披露的姿态本身是可复用的报告模式。

**③ FAR-Lab 落点**【映射提案】
- 基线三件套（结分时必算并存进 ledger）：(a) 无知基线（二值 0.25；多类 1−max(p_base)）；(b) 本 run/run 池无条件基率（如实际 `supports` 占比）；(c) 上一 run 同类基率。报告 **Brier skill score**（相对基线的改善），不给裸分。
- 聚合启发：judge N 票已有中位数+spread；补一档"**票数聚合体作为预测者**"也入账打分（等权中位数，无 recency 概念），单 judge 与聚合体分开出校准曲线——直接检验"聚合>个体"是否在我们体系成立。
- 外部参照写入报告脚注：人类专家市场 71–73%、Metaculus AI 域 0.207 vs 0.25——**我们系统预测自身 EEL 结果若长期低于无知基线，是必须如实展示的失败信号**，不是要藏的噪声。
- 优先级 **P1**（基线计算零成本，前提是 §6 ledger 存在）。

## 3. 校准报告与去偏（小样本诚实做法 + 反馈效应强度）

**① 一手来源**
- Van Calster B, et al. "Calibration: the Achilles heel of predictive analytics." *BMC Medicine* 2019（PubMed 31842878 核验）——小样本/低事件数导致过拟合→预测过端（too extreme）。
- Roelofs R, et al. "Mitigating Bias in Calibration Error Estimation." NeurIPS 2022（OpenReview NgZKCRKaY3J 核验）——**ECE 估计量系统性向上偏**，偏差依赖分箱方案与箱数；给出 debiased 估计器。
- "Understanding Model Calibration" ICLR 2025 blog / arXiv:2501.19047（核验）——**equal-frequency（等频）分箱偏差低于固定宽度分箱**，小样本首选。
- 实务经验值：稳定 reliability diagram 常需 **500+ 样本**（MetricGate 文档，【检索摘要级】实务指导，非一手）。
- 反馈去偏实证：Mellers E, et al. "Psychological strategies for winning a geopolitical forecasting tournament." *Psych Science* 2014（PubMed 24659192 核验）——GJP RCT：training/teaming/tracking 提升准确率，training 同时改善校准与分辨率，**效应量温和**（每年约几个百分点 Brier 改善）；"Rethinking the Role of Teams and Training" *Psych Science* 2024（DOI 10.1177/09567976241266481）：**响应策略效应 > training 本身**；Stone D, et al. *JBDM* 2023（DOI 10.1002/bdm.2334）：自动化校准训练在真实任务有效。**反证**："Calibration Feedback With the Practical Scoring Rule Does Not [Improve]..."（Wiley DOI 10.1002/ffo2.199，标题来自检索摘要，全文 403 **UNVERIFIED-fulltext**）——校准反馈不必然改善，条件敏感。

**② 机制要点**【文献实据】
- reliability diagram：按预测概率分箱，画观测频率 vs 预测概率；ECE = 箱内 |置信−命中| 的样本加权均值。**箱数是小样本的死穴**：多箱→方差爆炸，少箱→偏置上升。
- 小样本诚实做法组合拳：**等频分箱 + 少箱（3–5）+ bootstrap/Wilson 置信带 + 跨 run 池化**；ECE 报告须声明分箱方案（Roelofs：不声明箱数的 ECE 不可比）。
- "feedback improves forecasting"的实证结论是**真实但温和且条件依赖**：选择效应（追踪顶尖）> 培训效应；且存在校准反馈无效的对照报告。不可对外宣称"自动去偏"。

**③ FAR-Lab 落点**【映射提案】
- 我们的量级是每 run 数十条 → **单 run 永不画校准曲线**，只出"本 run 预测已入账 N 条、待结算 M 条"；曲线一律跨 run 池化。
- 分层规则（fail-closed 显示）：`judge × model × stage` 三维分层，**任一层 n<30 时该格显示 "insufficient evidence (n=k)"** 而非画图；n≥30 才出等频 5 箱曲线 + bootstrap 95% 带。
- 反馈环（P2，定位为"披露的实验"而非功能承诺）：每模型定期生成 calibration report card（Brier skill / ECE / 偏置方向），注入后续 run 的系统提示；**因文献效应温和+有反例，对外话术必须是"我们在测量反馈是否改善校准"，不是"反馈使我们更准"**——这本身构成一个带预注册色彩的内部实验。
- 优先级：报告 **P1**；prompt 反馈环 **P2**。

## 4. 排序预测的评估（BT 排序的稳定性与预测性效度）

**① 一手来源**
- BT 排序稳健性实务：bootstrap 重采样比较数据→重估 BT 系数→rank 稳定分（部署先例：ClinicalArena leaderboard "Robustness Score"，机制为业界标准做法，官网核验）。
- "Dropping Just a Handful of Preferences Can Change Top Rankings." arXiv:2508.11847（2025，核验）——**删极少量偏好即可翻转头部排序**，提出 worst-case 鲁棒性评估。
- 预测性效度范式：ForecastBench（§2）——排序/预测最终以**未来已结算事件**检验；Metaculus track record 同理。rank correlation（Kendall τ）需要"真值排序"，我们没有——文献路线是以结果结算定义效度。

**② 机制要点**【文献实据+综合】
- 无真值排序时两条正交轴：(a) **稳定性**（bootstrap rank CI / leave-k-out 最坏翻转检验——我们已有 BT+uncertainty 字段，天然可做）；(b) **预测效度**（top-k vs bottom-k 的后续结算结局差异，本质是判别度/concordance 而非相关性）。
- 效度指标建议：top 四分位 vs bottom 四分位的 `supports` 结算率差 + Wilson CI（复用 W9 既有 Wilson）；BT 分数与"被支持概率"的秩相关作辅助。头尾对比优于全序列 τ，因为锦标赛的用途就是选头部。

**③ FAR-Lab 落点**【映射提案】
- (a) 每 run 出 bootstrap rank-stability（确定性、种子固定，成本 = 重估 ILSR ~百次，纯 CPU）；(b) ledger 结算累积后出"**排序有没有预测力**"图：按 BT 分位分桶的 EEL 支持率，这是对锦标赛最有杀伤力的诚实检验。
- 优先级 **P2**（(a) 随时可做；(b) 依赖结算量累积，先挂账）。

## 5. 元科学闭环先例（差异化空间核验）

**① 一手来源**
- Sakana AI "The AI Scientist"（Nature 版，sakana.ai/ai-scientist-nature + github.com/SakanaAI/AI-Scientist，核验）：Automated Reviewer 对人审评分 balanced accuracy ~69%——审稿器以**外部基准**评估，**无跨 run 自我预测台账/持续校准曲线**（此为检索+官方页层面确认；负面主张按"未发现证据"表述）。
- ForecastBench（§2）：LLM 预报能力的**外部基准**，非 agent 内生闭环。
- 人工台账先例（artifact 有先例，系统无）：Metaculus track record 页、State of AI Report Predictions（2018 起每条预测公开计分，stateof.ai/predictions 核验）、Replication Markets（人押科学结果）。
- "The Calibration Turn in AI-Assisted Research"（ResearchGate 403，**UNVERIFIED-primary**）：检索摘要显示为概念框架（evidence-licensed claims + 校准），未见部署系统。

**② 机制要点/结论**【如实】
- **公开预测台账 + 校准曲线**作为元科学 artifact 成熟（Metaculus/stateof.ai）；**AI 科研系统对自身前向科学预测持续记账并公开分层校准曲线**——未找到已验证先例。AI-Scientist 是最近邻（审稿器打分），但它评的是论文、不是自己的前瞻预测，且无跨 run 校准追踪。差异化空间真实，表述用 "no verified precedent found (absence of evidence, 非证明不存在)"。

**③ FAR-Lab 落点**【映射提案】
- PredictionLedger 为一等领域对象（append-only 账本），CalibrationReport 为派生投影（cache，非权威）；对外可展示"系统预测自己的实验结局并公布按 judge×模型×阶段 分层的校准曲线"——对竞赛叙事是独有卖点，且每一分都有结算背书。
- 优先级：schema+结算钩子 **P1**；公开校准页/导出 **P2**。

---

## 6. PredictionLedger schema 草案【映射提案】

```ts
type PredictionKind =
  | 'eel_verdict'        // 主断言：EEL 裁决分布（4 类有序）
  | 'grade_self'         // GRADE 自评 vs 证据触发重评（4 级有序）
  | 'expected_relation'  // 假设→observable 结构化关系
  | 'judge_vote'         // 单 judge 票 + 聚合体票（两份都记）
  | 'rank_topk'          // "top-k 假设将获 supports"（二值）
  | 'voi_separation'     // expectedSeparation（数值，P3）

interface PredictionEntry {
  id: string; runId: string
  stage: 'hypothesis' | 'voi' | 'rank' | 'judge' | 'grade' | 'eel_design'
  kind: PredictionKind
  subjectRef: string            // hypothesisId / claimId / experimentPlanId
  predictor: { model: string; judge?: string; aggregate?: boolean }
  assertion:
    | { type: 'categorical'; orderedClasses: string[]; probs: number[] } // 有序：['supports','inconclusive','weakens','falsifies']
    | { type: 'binary'; p: number }
    | { type: 'point'; value: number; interval?: [number, number] }
  issuedAt: string
  contextDigest: string         // prompt/pipeline 版本指纹，分层维度之一
}

interface Settlement {          // 结算：append，不改写原断言
  status: 'settled' | 'void'
  outcome: string | number
  settledBy: 'eel_verdict' | 'feedback' | 'regrade' | 'timeout_void'  // void 必须留痕
  settledAt: string; evidenceRef: string
  scores: { brier?: number; logClamped?: number; rps?: number; crps?: number }
  baselines: { ignorance: number; runPoolBaseRate: number }
  skill: number                 // 1 - score/baseline
}
```

- **记什么**：如上；judge 票与聚合票双记（§2 聚合检验）；contextDigest 使"prompt 版本"成为可分层维度。
- **何时结分**：EEL 裁决落地（机械导出，零额外模型调用）→ 结 `eel_verdict`/`rank_topk`/`expected_relation`；因果修订反馈到达 → 结受影响 claim 的 `grade_self`；超时（如 run 永无对应实验）→ `timeout_void` 留痕，不静默消失。
- **如何报告**：CalibrationReport（派生缓存）按 `judge × model × stage` 分层；等频 5 箱 + bootstrap 95% 带 + ECE（声明箱数）；n<30 格显示 "insufficient evidence"；一律附 ignorance/base-rate 基线与 skill score。

**优先级汇总**：P1 = ledger schema + EEL/grade 结分管道（RPS+Brier+clamped log + 基线三件套）+ 池化校准报告；P2 = bootstrap 排序稳定性、top-vs-bottom 效度图、judge/聚合分层卡、prompt 反馈环（披露式实验）、公开校准页；P3 = VOI 数值 CRPS（依赖数值 outcome 的可信量化，先不做）。

---

## 净结论

1. **机制全部现成、成本近零、是真缺口**【文献实据+代码确认】：proper scoring rules（RPS 对有序 4 类裁决是正确选择）+ Murphy 分解 + 等频分箱/小样本诚实报告 + 双基线，全是确定性数学，贴着 W9 统计层即可落，不新增模型调用——P1，且是本 wave 技术含量最高的诚实性升级。
2. **基线已由文献锚定**【文献实据】：人类专家市场预测复制 ~71–73%、Metaculus AI 域社区 Brier 0.207（vs 无知 0.25）、ForecastBench 超级预报员 0.093 vs 最佳 LLM ~0.111——我们系统预测自身 EEL 结局必须对照 ignorance/base-rate 出 skill score，低于无知基线时如实展示；对经典文献聚合过乐观（70% vs 57%）提示 base_rate 基线不可省。
3. **差异化空间真实但须克制表述**【如实】：未找到 AI 科研系统自带跨 run 自我预测台账+分层校准曲线的已验证先例（AI-Scientist 审稿器 69% 但无校准追踪；Metaculus/stateof.ai 是人工外部台账）——PredictionLedger 可作为独有卖点，话术用 "no verified precedent found"。
- **不可行者/明确不做**：单 run 数十条样本画校准曲线（只池化+n<30 免画）；模拟预测市场机制（无真实交易者，聚合只用等权中位数）；宣称校准反馈自动去偏（效应温和且有反例，Wiley 10.1002/ffo2.199 UNVERIFIED-fulltext）；VOI 连续量 CRPS 结分（数值 outcome 不可信前挂 P3）。
