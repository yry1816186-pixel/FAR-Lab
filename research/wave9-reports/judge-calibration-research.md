# Judge 校准研究代码侦察报告（Wave-9，2026-08-22）

来源：GitHub API（gh api 许可证+文件树）+ raw 源码直读（zread 全程 repo-not-found，网页抓取超时——gh api 全成功）。仅含实读内容；未读标 UNVERIFIED。

## 方法清单（license 逐仓核验）

1. **长度控制胜率（AlpacaEval 2.0）** `tatsu-lab/alpaca_eval src/alpaca_eval/metrics/glm_winrate.py`（Apache-2.0）——现行实现非论文 GLMM：固定效应逻辑回归+5 折 CV（`LogisticRegressionCV`）；patsy 公式 `tanh(std_delta_len)+instruction_difficulty+not_gamed_baseline-1`；`regularize_to_baseline_lambda=0.2` 样本权重拉回基线；LC 胜率=长度差置零的直接效应；`get_is_extreme_changes` 告警。注意 `instruction_difficulty` 是 HF hub 预计算向量（不可达——须自估或用 minimal 变体）；论文与代码不一致处以代码为准。
2. **贝叶斯/EM Dawid-Skene + Beta-Bernoulli judge 校准（EMNLP 2024）** `yale-nlp/bay-calibration-llm-evaluators`（Apache-2.0）——`bayesian_dawid_skene.py`（PyMC：Dirichlet 先验+human gold 作 observed Categorical+MCMC）；`dawid_skene.py`（crowdkit EM，n_iter=10000, tol=1e-5, MajorityVote 初始化）；`q_beta_bernoulli.py`：**(llm_label×human_label) 计数 → Beta(1+s,1+n−s) 闭式后验混淆矩阵**（judge-vs-human 校准的确定性核心）；6 个带人类标签数据集加载器（SummEval/HANNA/LLMBar/MTBench/Meva）= judge-vs-human 协议参考。GLAD/BayesianOneCoin 在代码中 NotImplementedError（实锤）。
3. **锚点选择+BT** `IBM/Anchor-Selection utils/bradley_terry.py`（Apache-2.0）——BT 逻辑回归（±1 设计、tie=0.5）+bootstrap SE+kendalltau；22 锚点 90 万判决实验：**中等锚点最优，极强/极弱使区分度崩塌**；锚点选择效应量≈judge 选择量级；附功效分析。
4. **JudgeBench** `ScalerLab/JudgeBench`（**license null = 不可复用代码**）——双序判+flip 比对+n_inconsistent 不一致率；协议思想可自实现；数据在 HF（不可达）。
5. **双序概率归一化自偏好测量** `zhiyuanc2001/Self-Preference average_preference.py`（**license null**）——两序各判、`p1/(p1+p2)` 归一、同侧算术平均→位置去偏连续偏好强度；需 logprobs。
6. **UDA 去偏对齐（AAAI 2026）** `zhang360428/UDA_Debias`（**license null**；torch/BERT 训练）——与 zod-only/确定性冲突，不采用；"judge 自答 embedding 建模自偏好"思想可记。
7. **RankJudge** `layer6ai-labs/RankJudge`（MIT）——单缺陷注入配对会话构造金标签对+BT 给 judge 排名；README-only（代码 UNVERIFIED）；生成管线重（OpenRouter 依赖）。

## Top-3（证据×可行×增量）

1. **Yale EM-DS + Beta-Bernoulli 闭式后验**——纯算术确定性可移植；把 FAR-Lab 从"测 judge-human 一致性"（kappa/α）升级到"用金标估计 judge 混淆矩阵并校正/加权聚合"；跳过 PyMC 分量。
2. **AlpacaEval LC winrate**——补长度混杂控制整条缺失轴（FAR-Lab 有位置去偏、无长度控制）；TS 自实现 IRLS 逻辑回归（确定性），先 minimal 变体。
3. **IBM Anchor-Selection**——给锦标赛"锚点选中者、避极强/极弱"的可执行规则+功效分析依据；移植成本低（BT-逻辑回归+自有 seeded bootstrap）。

三者在 FAR-Lab 的落地全部需要 live judge/人类标注数据 → DEFERRED 带触发器（路由解锁+人类金标集建立）。

## 不采用（带理由）

UDA（license+架构冲突）；JudgeBench/Self-Preference 代码（无许可证——协议思想可自实现但非必需：swap+3-vote 已覆盖其一致性思想）；CALM 偏差数据集、9-策略对比 repo、fontezbrooks（均 license null 或无实现）。
