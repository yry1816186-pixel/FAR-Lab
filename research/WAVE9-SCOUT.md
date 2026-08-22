# WAVE9-SCOUT — 评估科学与 Judge 校准源码远征（2026-08-22）

> Wave-9 侦察与融合决策记录。执行指令：`research/WAVE-PROMPTS/wave9-eval-judge.md`。
> 状态：主文档随侦察返回增量成稿；已落盘决策见 `.control/DECISIONS.jsonl` D-042/D-043。

## 0. 执行环境实录（诚实记录）

- 首轮 7 子 Agent 并发全灭：账户级速率限制（1302）。改 2-3 并发串行重发，本波实际并发上限由环境决定，非设计选择。
- 模型路由单探（wave-open 政策）：deepseek `/models` 200 **但真实 chat 调用 402 Insufficient Balance**（/models 不证明余额可消费——这个区分本身是本波运营发现）；zai 401 token expired；dashscope keyless。**一切 live 判分验证 BLOCKED**（D-036 不变），离线/确定性工作全速推进。

## 1. 统计横切线（COMPLETE，源码逐处核实）

侦察覆盖 7 类机制（HELM/EvalPlus/FastChat/lm-eval-harness/inspect_ai/openai-evals/statsforevals/Miller 论文/Bowyer 小样本立场/Perlitz 序贯），关键核实结论：

| 机制 | 最强实现（已读源码） | FAR-Lab 判定 |
|---|---|---|
| before/after 显著性 | Miller arXiv:2411.00640 Eq.7 配对差 z；statsforevals：N<15 只做探索性 | **已落地**：小 N 用穷举精确配对置换（零 RNG，更保守）`stats.mjs pairedPermutationTest` |
| 聚合指标 stderr | lm-eval `stderr_for_metric` 播种 bootstrap；inspect_ai cluster-robust SE（Miller Eq.4/8+C/(C-1)） | **已落地**：播种 bootstrap CI + 聚类 SE（任务=簇） |
| 播种纪律 | FastChat `default_rng(seed=0)`；lm-eval 每块 `random.Random(i)` | **已落地**：mulberry32 显式 seed 入结果 JSON；**反面教材记录**：openai/evals 与 inspect_ai 的 bootstrap 未播种（不可复现）——FAR-Lab 纪律更严 |
| 多重比较 | statsforevals 默认 BH；HELM/promptfoo 实测**无**任何校正代码 | **已落地**：BH step-up `stats.mjs benjaminiHochberg` |
| 决策门 | Miller Eq.9-10 MDE + statsforevals N<15 降级 | **已落地**：`decideDeltaReality`（REAL 需 CI 不含 0 ∧ \|Δ\|≥MDE；N<15 强制 exploratory 警告） |
| 比例 CI | Wilson 1927（覆盖 0.951） | **已落地** |
| Judge 一致性 | FastChat compute_agreement 是朴素一致率（非 kappa） | **已超过**：Cohen's kappa + miss 分解 |
| 方差缩减 | 配对=CRN 的统计化身；Bouthillier 方差分解 | **已实践**：同盲序/同 GT/固定 seed = CRN；multi-pass median |
| 序贯早停 / 贝叶斯 / 控制变量回归 | Perlitz DIoR / Bowyer bayes / FastChat style-control | **不采用**（本波）：N=5 收益不成比例/与零依赖冲突/矩阵求逆成本高——记录为后续扩展位 |
| "pap-lab" | 多路检索 NOT FOUND（疑为误记/内部代号） | 如实记录 |

统计层端到端演示（`node eval/stats-report.mjs`，双跑 bit-identical，sha256 同）：v1 均值 F1 0.582 [0.422, 0.802]；两遍未加固判分差被诚实判 **INSUFFICIENT_N**（n=2）——统计层拒绝在噪声上制造结论，这正是它的职责。

## 2. D-029 判分加固（offline COMPLETE，live BLOCKED）— D-042

三处结构性修复（详见 `evidence/W9/judge-variance-hardening.md`）：

1. **GT 分解固定**（`GT_REV=gt-fixed-2026-08-22`）：judge 不再重分解 GT——GT 侧方差从"每遍 LLM"降为 0。
2. **固定粒度协议**：agent 侧分解锚定 GT 粒度（±2），原子单元定义+排除方法论预测+粒度样例嵌入 prompt。
3. **金标零误校准**：D-037 的 0.55/0.15 以 v1 LLM 计数为参照（循环论证），金标 104 对实测两向失误（真对 0.124 被误杀/确定性层几乎从不判 yes）→ **0.40/0.12**（零金标误约束下的最大确定性份额 33%；等价带 0.34-0.50）。

**Replay 实测**（记录数据重放，零 API）：跨分解 swing 保守口径 max **0.091 < 0.15 目标**；匹配层方差 0（构造性）。语义重叠区 [0.124, 0.331] 是 D-038 在干净标签上的复证——**词法相似度对科学语义有结构性天花板，中间带属于多数裁决层**。Live 重判（`judge-variance.mjs --live 3`）就绪，等路由（单笔充值三选一即解锁）。

## 3. counter-evidence-substantive-hit（DEFINED + BACKFILLED）— D-043

- **定义**：strict = 管线 counter 标签关系（contradicts/weakens）盲判存活率；limiting = +qualifies；miss 三分解（inverted/empty/qualifies-only）；Wilson 强制。
- **回填**：pre-fix 0.308 strict / 0.615 limiting（n=13）；**post-fix（当前管线）0.143 strict [0.026, 0.513]**（n=7）——诚实远低 0.70 目标。miss 主体为 **EMPTY**（unrelated 5/7）而非 inverted（1/7）：D-023/D-024 已止住反转，残差是"counter 席位绑定到主题相邻但不反断言的 claim"的语义问题。
- **改进路线**（记录未宣称）：judge-v2 裁决层 + counter 席位定向检索，live 重测随路由解锁。

## 4. FAR-Lab 评估矩阵升级方案（三级，本波核心交付）

**设计原则**：评估是辅助面——只增评估基础设施，不反向污染主路径（zod-only 不变量、主路径零新依赖全保）。三级各自有确定性边界声明。

### Tier 1 — 确定性指标（无 LLM，同输入同输出）

| 指标 | 状态 | 变更 |
|---|---|---|
| source-verification-rate / claim-binding / falsification-completeness / plan-executability | 已有（metrics.mjs，dist 检查器） | 不变 |
| rediscovery TF-IDF 匹配层 | 已有 → **金标校准 0.40/0.12** | 零误约束+回归锁定 |
| GT claims | 每遍重分解 → **固定（GT_REV 版本化）** | 口径变化已披露（跨 GT_REV 不可比） |
| 判别力证明 | 金标 104 对：detYes 精度 4/4=1.0（构造保证）+ 重叠区披露 | 已满足准入线 |

### Tier 2 — Judge 指标（LLM 参与，方差有预算）

| 组件 | 协议 | 方差预算 |
|---|---|---|
| 分解 | 3 遍取中位 + 固定粒度协议 + 固定 GT | 残差=agent 侧分解漂移（live 实测待路由） |
| 匹配 | 确定性层决定两端；中间带 3 票多数裁决 | 两端 0；中间带由多数票压制 |
| EV1 judge | 盲序 + FARLAB_JUDGE_VOTES 中位数+spread（W4-F4） | spread 全量留档，分歧永不隐藏 |
| counter-evidence | 盲重判存活率（strict/limiting/miss 分解） | Wilson CI 强制 |
| judge 噪声探头 | pass-vs-pass kappa、swap-agreement（D-027 已有） | 每次评估运行输出 |

### Tier 3 — 统计层（全部确定性，同 seed 同结果）

`eval/stats.mjs`（播种 bootstrap CI / 精确配对置换 / Wilson / kappa / BH / 聚类 SE / MDE 决策门）+ `stats-report.mjs`（对已录数据端到端，双跑 bit-identical 实证）。**规则**：任何 before/after 达标宣称必须带 `decideDeltaReality` 判决（REAL/NOT_SIGNIFICANT/INSUFFICIENT_N）；N<15 自动降级 exploratory；seed 入 JSON。

### 升级后北极星测量能力

判分方差（replay 已 <0.15 保守口径，live 待测）+ counter-evidence 指标（0.143 诚实基线）+ 统计判决层 = 后续所有 Wave 的达标宣称均经此复核（Wave 提示词 §五第 3 条兑现）。

## 5. 框架深读结果

（inspect_ai / promptfoo / deepeval / lm-evaluation-harness / open-compass / judge-calibration 研究代码——随侦察返回填写）

## 6. 融合决策与准入判定

（待 §5 补齐后统一排序；已定：统计层 A-H 全采纳=已实现；序贯/贝叶斯/控制变量回归本波不采用）

## 7. 剩余开放项

- live 方差重测 + live counter-evidence 重测（等 D-036 任一路由解锁）
- judge-calibration 研究代码线（swap/anchor/BT-anchor 开源实现核证）重发
- 框架侦察补齐（lm-eval-harness / open-compass）
