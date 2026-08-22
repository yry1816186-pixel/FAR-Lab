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

## 5. 框架深读结果（5 线全部返回，license 逐仓核验，file:line 实读）

### 5.1 横切结论（多源独立一致）

1. **FAR-Lab 播种统计层领先全部上游**：inspect_ai bootstrap 无 seed（`std.py:48` 裸 np.random.choice）、deepeval 仅 temp=0 无 seed、promptfoo 无任何统计/CI、openai/evals 未播种非配对。三家独立确认。**移植警示：上游统计代码不可照抄。**
2. **deepeval OSS 无人工-judge 一致性工具**（全库检索证实，为商业平台功能）；inspect_ai 无第一方 CI gating；lm-eval 核心无 token-F1 且 `combined_sample_stderr` 被上游自我废弃——**负发现防止找错搬运源**。
3. 高价值增量集中在 **judge 协议防御**（注入对抗、unscored 三态、解析率守门）与 **评估矩阵工程**（预测/评分分离、cell 复用、污染分层），不在统计层。

### 5.2 各仓 top 机制（完整清单见各侦察报告，落 `research/wave9-reports/`）

| 仓（license） | 核心机制（源位置） | 判定 |
|---|---|---|
| inspect_ai（MIT，已迁 UKGovernmentBEIS） | unscored 三态（`_metric.py:114-134`）；Grade last-match 防注入（`_model.py:213-230`）；at_least(k)/pass@k reducer（`_reducer/reducer.py:85-161`）；krippendorff ordinal α（`_metrics/krippendorff.py:84-210`）；eval_set 矩阵+cell 复用（`_eval/evalset.py:873-943`）；score() 存量重打分（`_eval/score.py:79-150`）；fail_on_error 错误预算（`task/error.py:23-60`） | **已融合**：at_least/mode reducer + krippendorff + unscored 计数；**DEFERRED（路由解锁后）**：异构 judge panel、eval_set 矩阵、重打分管线 |
| promptfoo（MIT） | 加权断言聚合+阈值覆盖（`assertionsResult.ts`）；namedScores 账本；renderedGradingPrompt 溯源（`rubric.ts`）；`--filter-failing` 回归重跑；注入优先级约定（`plugins/base.ts`）；无错误磁盘缓存+单飞 | **采思想**：renderedPrompt 溯源已由我们 per_vote 留档满足；filter-failing 是 live 恢复后的回归工作流件；**REJECT** 朴素 pass-rate 门控（我们按 CI 下限门控更强） |
| deepeval（Apache-2.0） | G-Eval 步骤编译器；**logprob 期望分**（`g_eval/utils.py calculate_weighted_summed_score`）；verdict 归一化+尾逗号抢救（`metrics/utils.py`）；idk 三态+penalize_ambiguous（faithfulness）；GEPA 播种进化 rubric 优化（`optimizer/algorithms/gepa`）；**示例分锚定最低档（负例警示）** | **DEFERRED（需 live/logprobs）**：logprob 期望分（±0.5 方差的正攻）、GEPA judge 校准；**already-have-by-construction**：verdict 归一化/JSON 抢救（strict-FC+四层容错已结构性消除该失败类）；**警示采纳**：judge prompt 示例分禁用固定低分 |
| lm-evaluation-harness（MIT） | pooled_sample_stderr；weight_by_size micro/macro；四种子纪律；repeats×maj@k 命名多管线（`filters/selection.py`）；doc/prompt/target 三哈希溯源；**do_sample 请求永不回放缓存**（`api/model.py` CachingLM）；任务版本纪律 | **已融合**：pooledStderr、maj@k/atLeast 命名归约；**已内建等价**：种子纪律（我们的 seed 全记录）；**纪律采纳**：温度>0 判定不得缓存回放（live judge 缓存实现时的硬规则）、GT_REV 即任务版本纪律 |
| open-compass（Apache-2.0，正确仓 `open-compass/opencompass`） | **预测/评分分离 + 幂等重评**（`tasks/openicl_eval.py`，存在即跳过）；分片合并长度守恒（`prediction_merger.py`）；污染分层评估（`AccContaminationEvaluator` 按 is_clean 分桶）；污染标注 row_id join；judge 换位 double 判（`partitioners/sub_naive.py`）；meta-judge 两段聚合；**解析率 <95% 硬告警**（`summarizers/subjective/utils.py`）；prompt-hash 溯源 | **已融合（等价物）**：judge-variance replay 即预测/评分分离的重放层；**DEFERRED**：污染分层（需先给 GT/语料标污染位——记为 W-P2 候选）、meta-judge、换位 double 判（live 后给 3-vote 升级）；**纪律采纳**：解析率守门（我们 votesFailed 显式计数等价）；prompt-hash 溯源（GT_REV+seed 已覆盖，judge prompt hash 在 live 重测时加入） |

### 5.3 融合执行记录（本波已落地代码）

| 融合件 | 来源 | 验证 |
|---|---|---|
| `eval/reducers.mjs`（median/mode/majAtK/atLeast/passAtK/namedReductions） | inspect_ai reducer 库 + lm-eval selection filter（均 MIT，算法级 TS 重写） | 6 测试组（pass@k 手算边界、tie-诚实-undefined、named reductions） |
| `krippendorffAlpha`（nominal+ordinal） | inspect_ai krippendorff.py（MIT）语义 TS 重写 | 手工验证 perfect=1/anti=-0.75/缺值剔除；独立测试组 |
| `pooledStderr` | lm-eval pooled_sample_stderr（MIT）公式 | 手算锁定（同组 4×→SE/2；发现并修复实现漏乘 n 的真缺陷） |
| 裁决投票走 atLeast(majority) + scored/unscored 计数 + per-item 票明细 | inspect_ai unscored 语义 + at_least | judge 测试（现 35/35）；adjudicationVotes 留档 |
| P0 审计修复：borderline 条目保留 bestIdx（裁决拿相似度最优候选，杜绝位置回退） | 对抗审计发现（首轮 REJECT） | 回归测试（无关 GT[0] 陷阱）+ mutation 注入红/还原绿闭环 |

### 5.4 judge-calibration 研究代码线（第 6 线，2026-08-22 返回）

| 方法 | 仓库（license） | 判定 |
|---|---|---|
| EM Dawid-Skene + Beta-Bernoulli 闭式后验 judge 混淆矩阵校准 | yale-nlp/bay-calibration-llm-evaluators（Apache-2.0，源码全读） | **DEFERRED（高优）**：纯算术确定性可移植；从"测一致性"升级到"用金标校正/加权 judge 聚合"；需人类金标集+live |
| 长度控制胜率（CV 逻辑回归，非论文 GLMM——以代码为准） | tatsu-lab/alpaca_eval glm_winrate.py（Apache-2.0） | **DEFERRED**：补长度混杂轴（现有 swap 是位置轴）；HF 预计算向量不可达须自估/用 minimal 变体 |
| 锚点选择+BT（中等锚点最优，极强/极弱崩塌） | IBM/Anchor-Selection（Apache-2.0） | **DEFERRED**：锦标赛锚点设计规则+功效分析；BT-逻辑回归+自有 seeded bootstrap |
| JudgeBench 协议 / 双序概率归一化 / UDA | license null ×3 | **REJECT 代码**（无许可证不可复用）；UDA 另与 zod-only/确定性冲突；swap+3-vote 已覆盖一致性思想 |

三条 Apache-2.0 线均需 live 数据，触发器=路由解锁+人类金标集；完整报告 `research/wave9-reports/judge-calibration-research.md`。

## 6. 融合决策与准入判定（决策词汇强制）

**ADOPTED（本波落地，零运行时依赖）**：reducers（at_least/mode/maj@k/pass@k）、krippendorff α（nominal/ordinal）、pooled SE、unscored 三态计数、投票明细留档、防御性校验。准入依据 = 各消除一类已实证失败模式（装饰性测试、裁决静默吞败、跨域聚合无 SE）或升级测量能力，全部离线判别性测试锁定，零北极星回退（332→全量绿）。

**DEFERRED（证据门控，路由解锁即触发）**：
- 异构 judge panel + panel α（需 ≥2 条 live 路由）
- logprob 期望分数（需 provider logprobs；deepeval 证实是 ±0.5 方差正攻）
- GEPA 判官 rubric 进化校准（需 live 循环）
- eval_set 式矩阵 manifest + cell 复用、score() 存量重打分产品化（replay harness 已是雏形）
- open-compass 污染分层汇报（需先定义 GT/语料污染标注方案——W-P2 候选）
- judge 换位 double 判 + meta-judge 终裁（live 3-vote 升级路径）

**REJECTED（带理由）**：嵌入相似度匹配器（破 zod-only/隔离面；TF-IDF+裁决已覆盖语义带）；ROUGE（与 TF-IDF 同构）；inspect_ai/promptfoo/openai-evals 的未播种统计（反面教材）；promptfoo 朴素 pass-rate 门控（CI 下限门控更强）；序贯早停/贝叶斯/控制变量回归（N=5 不成比例、零依赖冲突）。

**纪律采纳（不成代码的规则）**：温度>0 的 judge 判定永不缓存回放（lm-eval CachingLM 纪律）；judge prompt 示例分禁锚定最低档（deepeval 负例）；解析率守门等价物（votesFailed）必须随结果输出。

## 7. 剩余开放项

- **BLOCKED（用户动作）**：live 方差重测（`node eval/judge-variance.mjs --live 3`）+ live counter-evidence 重测——等 D-036 任一路由充值；恢复后北极星 `rediscovery-judge-variance` 换实测值。
- W-P2 候选沉淀：污染分层评估（open-compass 模式）× counter-seat 定向检索联合提升 counter-evidence-substantive-hit（当前 0.143 → 目标 0.70）。

## 8. 离线增值（2026-08-22 晚，live 暂停期间）

### 8.1 EV1 judge 3-seed 一致性严格化（`eval/ev1-judge-agreement.mjs` → `evidence/W9/ev1-judge-seed-agreement.md`）

当年"±1-2pt 摆动"的描述性披露升级为 krippendorff 度量：**hypothesis_quality α=0.228**（低于 0.667 可靠门槛——该维单 seed 数字不可引用，seed-3 排序反转是固有噪声非孤立事件）；**counter_evidence_coverage α=0.605**（aggregate 级完全稳定：farlab 2.2 vs 1.6/1.6 每个 seed 成立，per-cell 仍方向性）。这为 W4-F4 多遍中位融合提供定量动机：live 恢复后 EV1 judge 建议默认 N≥3 并以 α 为运行级信度探头。测试锁定关键数字（36/36）。

### 8.2 counter-evidence empty-miss 逐例诊断（`evidence/W9/counter-evidence-miss-diagnosis.md`）

0.143 strict 的 7 个 miss 逐例归因：**5/7 empty = counter 席位内容与假设特异性的粒度错配**（同主题泛文献 vs 假设具体机制，非反断言）；1/7 inverted = falsify 标签方向错误（案例 6 实际支持假设）；1 真正例。改进设计 A/B/C 已细化：**A. counter-seat 定向检索（query 从 falsification observable 构造——主攻，治 5/7，检索面 W-P2 候选）**；B. falsify 方向校验（治 inverted，可离线设计 live 后用本 7 例回归）；C. qualifies 语义归位。
