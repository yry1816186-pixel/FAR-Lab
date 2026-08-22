# 评估统计横切线侦察报告（Wave-9，2026-08-22）

来源（实读）：Miller arXiv:2411.00640（HTML 全文）、statsforevals.com、lm-sys/FastChat `rating_systems.py`/`elo_analysis.py`/`compute_agreement.py`、lm-eval-harness `api/metrics.py`、inspect_ai `scorer/_metrics/std.py`、openai/evals `evals/metrics.py`、dubzzz/pure-rand、Bowyer arXiv:2503.01747、Perlitz arXiv:2308.11696、Bouthillier arXiv:2103.03098、Wilson 1927、Dietterich 1998（McNemar）。UNVERIFIED/NOT FOUND 清单见尾。

## 核实结论

| 机制 | 最强实现 | FAR-Lab 判定 |
|---|---|---|
| before/after 显著性 | Miller Eq.7 配对差 z（HTML v1 无 McNemar、无控制变量——修正搜索印象）；statsforevals：配对默认 Wilcoxon 符号秩，N<15 只做探索性并警告 | 落地：小 N 穷举精确配对置换（零 RNG，更保守） |
| 聚合 stderr | lm-eval `stderr_for_metric` 分派（mean 闭式 / 白名单 bootstrap 每块 `random.Random(i)` 播种；注释承认无 Bessel 修正）；inspect_ai CLT stderr + cluster-robust SE（Miller Eq.4/8 + C/(C-1)） | 落地：播种 bootstrap + 聚类 SE |
| 播种纪律 | FastChat `default_rng(seed=0)`、全局 `np.random.seed(42)`；lm-eval 每块播种 | 落地：mulberry32 显式 seed 入 JSON；**反面教材**：openai/evals（1000 次无放回抽一半、未播种、非配对）与 inspect_ai bootstrap 未播种 |
| 多重比较 | statsforevals 默认 BH（fdr_bh）、安全场景 Holm、联立 CI 用 max-T；**HELM 主分支+v0.2.2 与 promptfoo 均无任何校正代码（实测）** | 落地：BH step-up |
| 方差缩减 | 配对=CRN 统计化身（Var(paired)=Var(unpaired)−2Cov/n）；Bouthillier 方差分解+randomize-then-average；FastChat style-control（长度/标题协变量入 BT logistic） | 实践：同盲序/同 GT/固定 seed；multi-pass median；style-control 暂不做（矩阵求逆成本） |
| 决策门 | Miller Eq.9-10 样本量/MDE 反解；promptfoo 纯阈值无噪声模型 | 落地：decideDeltaReality（CI 不含 0 ∧ |Δ|≥MDE；N<15 降级 exploratory） |
| RNG 纪律 | pure-rand（MIT，xoroshiro，纯函数式 API）；seedrandom（LICENSE 404，慎用） | 落地：mulberry32（足够小且良理解）；禁 Math.random；整数≤2^53；均匀整数用拒绝采样 |

## 最小统计层建议 A-H（侦察产出）vs FAR-Lab 实现状态

A 播种 RNG ✓ / B 精确配对置换 ✓ / C 播种 bootstrap CI ✓ / D Wilson ✓ / E kappa（+krippendorff，超建议）✓ / F 聚类 SE ✓ / G BH ✓ / H MDE 决策门+报告块 ✓ —— **全部实现并有判别性测试**（`eval/stats.mjs` + `stats-report.mjs` 双跑 bit-identical）。

## 不采用（含理由）

序贯早停（需 IRT/经验分辨率曲线，N=5 无收益）；贝叶斯（与零依赖冲突，Wilson/置换保守性足够）；控制变量回归（~100 行矩阵求逆暂不值）；McNemar（二元配对由置换覆盖）；Wilcoxon 精确分布（穷举置换已覆盖且更保守）。

## UNVERIFIED / NOT FOUND（如实）

HELM v1 论文的 paired bootstrap + Holm 表述（论文抓取超时；代码层确认无）；"pap-lab" 公开渠道不存在（NOT FOUND，疑误记）；REEval 停止准则细节；seedrandom LICENSE 文件 404；huggingface.co 全程不可达。
