# W-F Scout — 统计/元分析型实验（statistical_meta）最小可行形态设计

> 触发：PLAN-gap-closeout P1-G5（医学文献型假设无法走 实验→机械判定→反馈→修订 闭环）。
> 产出：设计文档 → 用户批准门后实施。本文档是 W-F 唯一交付物。
> 代码接地：2026-08-23 实读 `src/domain/experiment.ts`、`src/domain/feedback.ts`、`src/domain/evidence.ts`、`src/domain/claim.ts`、`src/domain/formal.ts`、`src/domain/ach.ts`、`src/domain/prediction.ts`、`src/experiment/{executor,spec-from-plan,gateway,remote-executor}.ts`、`src/pipeline/stages/feedback.ts`、`experiment-runtime/`（`__main__.py`/`ops.py`/`pyproject.toml`）。
> 外部查证：statsmodels/jstat/Cochrane/Egger/Higgins 均一手来源核对（见 §6/§7 与文末引用）。统计公式属公共数学（教科书级），非实现拷贝。

**TLDR 推荐**：新增 `experimentType: 'statistical_meta'`（ExperimentSpec 改 discriminated union），最小集 = log 尺度逆方差固定+DerSimonian-Laird 随机效应合并（OR/RR/SMD 三种效应量）、Q/I² 异质性、leave-one-out、Egger（k≥10 才计算）；**判定数学纯 TS 手写在 zod-only 核心内**（约 300 行，公式量级小，教科书 fixture 金标准离线验证；且 `.planning/PLAN-gap-closeout.md` 硬约束"Node 端 zod-only"直接封死 npm 依赖路线）；sidecar 不参与 meta 生产路径（statsmodels 仅可作为可选的对拍测试依赖，须用户拍板）。数字不足输出 `INSUFFICIENT_DATA` 判定，绝不硬凑。

---

## 1. 判定语义：最小集进什么、明确不做什么

### 1.1 现有不变量（必须延续，出处实读）

- `src/domain/experiment.ts:10-16`：分析在执行前预注册；判定 supports/falsifies/inconclusive 由决策规则对 CI **机械推导**，LLM 永不产生判定。
- `mechanicalVerdict`（experiment.ts:552-561）：CI 整体越过 threshold → supports；整体反向 → falsifies；跨阈值 → inconclusive。`weakens` 从不发射（预留多绑定聚合）。
- spec hash 绑执行（`experimentSpecHash`，executor.ts:49-53）；D-085 绑定审批（BindingApproval）；D-086-7 序贯分析降级为 exploratory。

**设计结论**：meta 判定 = 在 log 尺度上复用同一 `mechanicalVerdict` 语义。合并产出 pooled 点估计 + 95%CI，对预注册阈值（通常 H0: ln(OR)=0）机械判定。判定内核零改动，这是本方案最大杠杆。

### 1.2 最小集（进）

| 组件 | 语义 | 备注 |
|---|---|---|
| 逆方差固定效应（FE） | wᵢ=1/vᵢ, θ̂=Σwθ/Σw, SE=√(1/Σw), CI=θ̂±z_{α/2}·SE | log 尺度执行，报告时 exp 回原尺度 |
| 随机效应（DL） | τ² = max(0, (Q−(k−1))/(Σw−Σw²/Σw))（DerSimonian-Laird 1986 一步法）；wᵢ*=1/(vᵢ+τ²) | k=1 时 τ² 无定义 → 只有 FE 或直接 INSUFFICIENT_DATA |
| 异质性 Q / I² / τ² | Q=Σw(θ−θ̂_FE)², df=k−1；I²=max(0,(Q−df)/Q) | Higgins 2003 暂定 25/50/75% = 低/中/高，仅作展示标签，新版 Cochrane 手册强调情境优先于刚性切点 → **I² 不进判定规则**，只进披露 |
| leave-one-out 稳健性 | 逐个剔除研究重算合并（k 次，确定性），报告方向/显著性是否翻转 | 与既有 removalSensitivity（ach.ts:123-142）同构：脆弱性是展示的，不是隐藏的 |
| Egger 检验 | θᵢ = β₀+β₁·SEᵢ 的逆方差加权回归（等价于 Egger 1997 原始 SND-on-precision 参数化），检验 β₁=0 | **k<10 不计算**，输出 UNREPORTED(k<10, low power)（Cochrane Handbook Ch.13：漏斗图不对称检验 <10 研究是最常见误用） |
| 效应量类型 | `log_or`、`log_rr`、`smd`（连续结局，Hedges g 小样本校正） | 三类覆盖文献型主流；RD（风险差）不进最小集 |

### 1.3 明确不做（防 scope creep，逐项列出）

- **贝叶斯分层全家桶**（BUGS/Stan 风格先验+MCMC）：不进。理由：非确定性采样破坏 (spec,seed)⇒同结果 不变量；先验选择引入 LLM 可争议自由度；计算归属复杂化。
- Paule-Mandel/REML τ² 估计、Hartung-Knapp 校正：不进最小集（DL 是最广引用的一步法；HK 可作 P1 敏感性补充）。
- 网络元分析（多臂/间接比较）、剂量反应合并、meta 回归（亚组分析）：不进。
- trim-and-fill 等偏倚**校正**：不进（Egger 只检测不校正——校正假设过强，最小集只如实披露）。
- GRADE 评级自动化：不进判定路径（GRADE-lite 已在 claim 层存在，claim.ts:61-70，两层不重复）。
- 个体患者数据（IPD）meta、效应量从 p 值反推：不做。

## 2. 输入数字从哪来（EffectEstimate 抽取 + 诚实降级）

### 2.1 现状（实读）

`ScientificClaim`（claim.ts:26-43）只有 `text` + `locators`（verbatim quote + charStart/charEnd）+ GRADE-lite 确定性；**无结构化数值字段**。evidence.ts:380 的 `quantitative` 只是正则启发式（GRADE 代理），不是数字抽取。结论：效应估计抽取层**不存在**，是本方案的主要新面。

### 2.2 提案：结构化 EffectEstimate（claim 的 optional 伴生对象）

```
EffectEstimate = {
  claimId, sourceDocumentId,
  measure: 'or'|'rr'|'smd',
  point, ciLow, ciHigh, ciLevel (default 0.95),
  scale: 'raw'|'log',            // 统一在抽取落库时归一到 log（OR/RR）
  // 可选的 2×2 重建路径（CI 未报告但事件数报告时）：
  twoByTwo?: { a, b, c, d },
  nTotal?,                       // 样本量（Egger/展示用，非必需）
  extractionModelRef,            // 抽取模型 provenance（同 ScientificClaim 惯例）
  locator 继承自 claim 的 verbatim quote
}
```

- **LLM 抽取、确定性校验**（同 spec-from-plan 的分工惯例，spec-from-plan.ts:10-14）：抽取可由模型做，但每个数字必须过纯 TS 不变量校验，任何一条不过 → 丢弃该估计并计数披露（fail-closed，不静默降级）：
  - ciLow < point < ciHigh（原尺度）；log 化后 ln(ciLow) < ln(point) < ln(ciHigh)
  - OR/RR 点估计与 CI 均 > 0；反演一致性：|SE_derived − SE_from_2×2| 若两者都有，量级差 >3× → 标记冲突丢弃
  - SE = (ln(U)−ln(L)) / (2·z_{1−α/2})（95%CI 时 z=1.959964）
  - 2×2 路径：SE(lnOR)=√(1/a+1/b+1/c+1/d)；SE(lnRR)=√(1/a−1/(a+b)+1/c−1/(c+d))；零格子加 0.5 校正（**披露为约定**）
  - SMD：Hedges g = J·(m̄₁−m̄₂)/s_pooled，J=1−3/(4df−1)；SE 由组内 n/SD 公式
- **同质合并约束**：一次 meta spec 只接受同一 `measure` 的估计；OR 与 RR 不可混池（最小集不做 measure 转换）。
- **研究去重**：同一 trial 二次报告 → 按 sourceDocumentId + locator 不同但数字相同做保守去重（数字完全相同才折叠），重叠 cohort 检测**不做**（开放问题 Q5）。

### 2.3 诚实降级：INSUFFICIENT_DATA（判定语义的一部分）

数字不足的三级诚实降级，全部是**机械判定**而非运行失败：

1. 合格研究 k = 0 → 判定 `INSUFFICIENT_DATA`，原因："无通过校验的效应估计"；
2. k = 1 → `INSUFFICIENT_DATA`（单研究无法合并；如实说"单研究，无合并"）；
3. k = 2 → 允许合并但 verdict 强制附 `low_k` 披露标签（合并数学上成立，统计上脆弱——披露而非拒绝）；
4. 全部估计缺 CI 且无法 2×2 重建 → 该研究不入池，`INSUFFICIENT_DATA` + 逐研究缺什么。

`INSUFFICIENT_DATA` 作为 ExperimentVerdict 的新枚举值加入（或映射到现有 `inconclusive` + 结构化区分——开放问题 Q6）。它**必须能走完 FeedbackSignal 闭环**（"该假设当前证据体不足以机械检验"本身就是修订输入：指向检索缺口而非假设修改）。

## 3. ExperimentSpec 扩展方案

### 3.1 结构：discriminated union（推荐）vs 平行对象类型

推荐把 `ExperimentSpec` 改为 `z.discriminatedUnion('experimentType', [...])`：

```
experimentType: 'ml_tabular'        // 现有 schema 原样搬入，字段不变
experimentType: 'statistical_meta'  // 新分支
```

meta 分支字段设计（延续既有纪律逐条对应）：

| 字段 | 对应的现有纪律 | 设计 |
|---|---|---|
| `studies` | `datasets`（数据来源必须可解析+血统） | 不内嵌数字！存 **EffectEstimateId 引用列表 + preregistered 纳入/排除标准文本**。执行时从 store 解引用并重校验（数字变动可检测，同 dataset contentRef 思路） |
| `effectMeasure` | `metricKey`（封闭枚举） | `'log_or' \| 'log_rr' \| 'smd'`，封闭枚举 |
| `metaModel` | `statistics.test`（预注册） | `'fixed' \| 'random_dl'`——**判定用哪个模型必须预注册**，两者都算，未选中者作敏感性披露（禁止"看 I² 再选"的事后切换，Cochrane 反对按 I² 机械切换模型） |
| `comparisons` | 现有 Comparison | 复用 `direction`+`threshold`（**log 尺度**，OR/RR 的天然 H0=0 即 ln 1）+ `thresholdProvenance` + `hypothesisId` + BindingApproval 审批门——原样复用，零新发明 |
| `statistics` | StatisticsPlan | `alpha`、`ciLevel` 复用；`test` 枚举扩展或 meta 分支自带 `pooling: 'iv_fixed' \| 'iv_random_dl'`；`analysisSeed` 保留（leave-one-out 顺序等确定性用途） |
| MDE 对应物 | 现有两阶段门（spec 时声明、acquisition 后查可达性，experiment.ts:480-517） | 完美同构：spec 时声明 `minStudies`（如 ≥3）与 `minTotalInformation`（如 Σw* ≥ 40，即 pooled CI 半宽可分辨 ln(OR)=0.1 量级）；**抽取完成后**（k 与 Σw 已知）复核可达性，不达标 fail-closed。两阶段纪律原样平移 |

不进 meta 分支的：`models`、`compute.maxParallel`（无训练）、`datasets`、ML `metrics`。

### 3.2 判定不变量（重申）

判定流水线与 ML 路径完全同构：preregistered spec → specHash 绑定 → 确定性合并（纯 TS）→ pooled CI → `mechanicalVerdict(comparison, ci_log)` → StatReport.verdict + verdictDerivation（"rule: ln(OR) 上界 < 0 即 OR<1 ⇒ 低于阈值 ⇒ supports/falsifies…"全链可审计文本）。LLM 在此路径的职能边界：①抽取 EffectEstimate（数字被确定性校验）；②起草 spec 草案（被 checkExperimentSpec fail-closed 校验）；③消费 FeedbackSignal 做因果修订。**判定本身无 LLM。**

### 3.3 受影响的现有代码面（grep 实读，非臆测）

- `src/domain/experiment.ts`：ExperimentSpec → union；`StatReport.metricKey` 与 `test.kind` 需扩展（meta 报告的"指标"是效应量而非 accuracy——建议 StatReport 同步 union 化或把 metricKey 放宽为 string+effect.kind 已有先例，见 StatReport.effect 字段）；
- `src/experiment/executor.ts`：新增 meta 执行路径（无 sidecar、无 dataset acquisition、无 train；studies 解引用→校验→合并→StatReport→buildFeedback 原样复用 executor.ts:147-170）；
- `src/experiment/spec-from-plan.ts`：新增 `draftMetaSpecFromPlan` 姊妹函数（计划声明文献型数据需求 → meta 草案；不可行时诚实 skip）；
- `checkExperimentSpec`：meta 分支的平行校验器（approvals/MDE/探索性声明门逻辑复用）；
- 反序列化兼容：union 化后所有 `spec.datasets` 直接访问点需 narrow（.control/EXECUTION_STATE 已有 run 数据的兼容性是 Q1 拍板点）。

## 4. 实现归属：推荐纯 TS（Node zod-only 核心），理由与约束核对

### 4.1 推荐：纯 TS 手写，sidecar 不参与 meta 生产路径

| 维度 | 纯 TS（推荐） | Python sidecar（statsmodels） |
|---|---|---|
| 依赖 | **零新依赖**（正态 CDF/分位数已有：experiment.ts:213-251 手写 erf + Acklam 逆正态，模式先例已立） | statsmodels 0.14.6 拖 numpy+pandas+patsy+scipy 全树进 uv.lock（pyproject.toml 现仅 numpy/sklearn/scipy） |
| 政策约束 | `.planning/PLAN-gap-closeout.md` 硬约束"**Node 端 zod-only**"→ npm 统计库路线本就被封；手写是唯一合规路线 | 不违反，但 sidecar 环境膨胀 + 远程 SSH 复制路径（remote-executor）同步膨胀 |
| 公式量级 | FE+DL+I²+leave-one-out = O(k) 加权和；Egger = 2 参数 WLS 闭式解。合计 ~300 行含注释 | 调用 `combine_effects` ~10 行 |
| 需补的分布函数 | chi2 p 值（正则化不完全 gamma，~40 行）；Egger 用 z 检验（Egger 1997 原文即正态近似）则连 t 分布都不需要；或补不完全 beta（~50 行）做 t 检验 | scipy 现成 |
| 判定位置 | 合并数学与判定同层 → 判定链无跨界协议 | 判定必须在 TS（宪法 §10 语义），合并数学在 Python → 一条 JSON 边界横在"数字→判定"之间，故障面+审计面变大 |
| 确定性 | 纯函数天然确定 | 同样可以，但环境锁定（EnvInfo/lockfileHash）多一层 |
| 验证 | 教科书金标准 fixture（见 §4.2） | 同样需要 |

**决定性理由排序**：①zod-only 硬约束封死 npm 库，手写 TS 是 Node 侧唯一路线；②既然判定必须在 TS，把 ~300 行确定性数学也放 TS，让"数字→判定"零协议边界（单一权威，宪法 §5）；③meta 实验不需要 Python 环境 = 无 sidecar 依赖的实验类型，部署/远程/离线路径全部更简单；④statsmodels 若只为了 300 行公式引入 pandas+patsy 依赖树，复杂度不挣得其价值（宪法 §5 minimal sufficient）。

### 4.2 离线验证方案（无网络、确定性）

- 金标准 fixture：教科书公开示例数据。首选 Cochrane Handbook / Borenstein *Introduction to Meta-Analysis* (2009) 章节公开数据集（该书配套数据公开流传），或经典已发表 meta（如钙与维生素 D 补充的已知合并值文献）中**自行从论文表格键入**的 5-8 研究数字（数字本身是事实数据，非版权表达；fixture 文件注明出处与键入日期）。
- 断言：pooled 点估计/CI 与文献报告值在小数点后 2-3 位一致；τ²/Q/I² 一致；leave-one-out 集合逐一断言；Egger 与 R metafor 输出对拍值（**一次性人工对拍**，对拍结果固化为 fixture，不在 CI 里跑 R）。
- 边界用例：k=0/1/2、τ² clamp 到 0、零格子、CI 不含点估计的丢弃路径、k=9 时 Egger UNREPORTED。
- 可选 CI 对拍：sidecar 开发依赖加 statsmodels 做交叉验证（**改 uv.lock 需用户确认**，开放问题 Q8）。

### 4.3 license 核对（手写公式）

数学公式不受版权保护；实现参考仅看公式陈述（教科书/文献），**不拷贝任何源码**。本方案不需要引入任何第三方代码。若未来想参考 jstat 的 incomplete beta 实现，其 MIT 允许，但按仓库惯例应自写+注释公式出处（Numerical Recipes 算法是公有领域表述，但其书源码有版权——避开源码照抄）。

## 5. 反证语义：meta 判定 → FeedbackSignal → ACH 证据平衡

### 5.1 复用既有闭环（实读对齐）

- `buildFeedback`（executor.ts:147-170）已把 confirmatory、非 exploratory、非 secondary 的 StatReport 按假设聚成 FeedbackSignal（source: 'experiment'，structured: verdicts，target: hypothesis）——meta 路径**原样复用**，structured 扩展 `{ kind: 'statistical_meta', k, pooledLogOdds, ciLow, ciHigh, i2, tau2, egger }`。
- feedback stage（feedback.ts:47-75）用 verdict 结算 prediction ledger——`INSUFFICIENT_DATA` 若新增枚举，需决定它如何 settle（建议：结算为 inconclusive 类但带显式 reason，开放问题 Q6）。
- `VERDICT_CLASSES`（prediction.ts:14）= supports/inconclusive/weakens/falsifies——与 ExperimentVerdict 同源，天然对齐。

### 5.2 映射表（meta 判定 → 假设级反证）

| pooled CI（log 尺度）对预注册阈值 | ExperimentVerdict | revise 阶段建议的 RevisionOperation（LLM 提议、人可否决） |
|---|---|---|
| 整体越过阈值（如 lnOR 上界 < 0，即"降低风险"方向成立） | supports | hypothesis strengthen / 竞争假设 weaken |
| 整体反向 | falsifies | hypothesis weaken / invalidate；触发竞争假设 strengthen |
| 跨阈值 | inconclusive | refine（精确化假设或标注需更多证据） |
| k=0/1、全缺 CI | INSUFFICIENT_DATA | 不动假设本体；指向**检索/抽取缺口**（连回 W-A 证据层） |

关键纪律：**meta 数值强度不伪装进 log-LR 语言阶梯**。formal.ts:16-35 的 LADDER 是"关系语言→LR 区间"的映射提案；meta 的数值证据不应当折算成 `supports:strong` 塞进 `sumLogLr`——那是把连续数值压回粗语言、丢失信息。正确分层：

- **假设级**：meta verdict 走 FeedbackSignal → revise（RevisionOperation 是假设级因果修订）；
- **claim/证据级**：meta 结果可以作为一条新的 ScientificClaim（"对 N 研究的逆方差合并得到 OR=x [CI]"，locator 指向 meta 报告 artifact）进入证据体，由证据阶段的 LLM 提议为 EvidenceRelation，进入 ACH diagnosticity（ach.ts:69-86）——但这是证据层自己的语义判断，不是 meta 判定层直插。
- ACH 对齐点：leave-one-out 不稳定 ↔ removalSensitivity 脆弱性披露（同构概念，两个层面各自如实展示）；I² 高 ↔ 证据体矛盾信号（GRADE inconsistency 域）。

### 5.3 不确定性保留（宪法 §7）

I²/τ²、leave-one-out 翻转、Egger 显著（提示发表偏倚）、k 小、CI 来源是 2×2 重建而非报告值——全部进 StatReport 披露字段并**强制随 FeedbackSignal 携带**；revise 阶段的 LLM prompt 必须看到它们（防止"合并显著"被过度解读为"假设确认"）。Egger 显著不改变 verdict（偏倚是证据体属性，不是判定输入），但 structured 里标 `publicationBiasSuspected: true`。

## 6. 替代方案对比（现成统计库尽调）

| 库 | 语言 | license | 维护 | 离线 | 裁定 |
|---|---|---|---|---|---|
| **statsmodels.stats.meta_analysis**（combine_effects, 0.14.6） | Python | BSD-3-Clause（PyPI 已核） | 活跃 | 是 | 功能正中靶心（DL 一步法、FE+RE、test_homogeneity、conf_int 含 HK 变体）。**不采纳进生产路径**（依赖树+跨语言判定边界）；可作为 sidecar 开发对拍依赖（Q8 拍板） |
| R metafor | R | GPL-2 | 活跃（领域标杆） | 是 | REJECT：GPL+R runtime 均不符合 zod-only/零膨胀约束；仅作为**文献期望值来源**人工对拍 |
| jstat 1.9.6 | JS | MIT | 休眠（末版 2022-11；注意 npm 用小写 jstat，大写 jStat 已弃用） | 是 | 无元分析功能（只有分布函数）。若手写需要 incomplete beta/gamma 参考可看，但按 §4.3 惯例自写 |
| simple-statistics | JS | MIT | 活跃 | 是 | 无元分析、无 incomplete beta/gamma CDF，不覆盖需求 |
| @tpmjs/tools-effect-size-suite 等散装 effect-size 计算器 | JS | 各异 | 单人/低星 | 是 | REJECT：无合并/异质性/偏倚检验，不可作为依赖 |
| scipy（sidecar 已有） | Python | BSD | 活跃 | 是 | 数学够用（DL 手写也就 10 行 numpy），但没有现成 combine_effects 级封装；单为 meta 在 sidecar 手写则判定跨界问题同 §4.1 |
| PyMC/Stan 贝叶斯分层 | Python | Apache/MIT | 活跃 | 是 | REJECT（§1.3 不做贝叶斯） |

**手写 vs 复用总结**：JS 生态无可复用件（已尽调）；Python 有 statsmodels 但引入它的代价（依赖树+判定跨界+远程路径膨胀）大于 300 行确定数学的维护成本；zod-only 硬约束使 Node 侧复用本来就不可能。手写不是"NIH 造轮子"，是约束下的唯一路线，且数学面积极小、可金标准验证。

## 7. 开放问题清单（需用户拍板）

1. **Q1 兼容策略**：ExperimentSpec union 化是 schema 变更（变更确认线）——现有已落库 spec/run 的兼容读取谁负责（zod default `experimentType:'ml_tabular'` 的宽进 vs 严格窄化）？推荐 default 宽进 + 全量测试，但 schema 变更须确认。
2. **Q2 EffectEstimate 落点**：新对象类型（store 里独立 kind，如 'effect_estimate'）vs ScientificClaim 加 optional 字段？推荐独立对象（claim 不膨胀、抽取失败不污染 claim），但影响 store schema 演进。
3. **Q3 判定默认模型**：预注册强制二选一（fixed/random_dl）时，默认推荐哪个？本方案倾向 random_dl 为主判定+FE 作披露（医学文献异质性常态存在），需拍板。
4. **Q4 Egger 阈值**：k≥10 才算 vs k≥3 就算但标 low-power？本方案推荐 k≥10（Cochrane），k<10 输出 UNREPORTED。
5. **Q5 研究重叠**：最小集不做重叠 cohort/重复发表检测（只做保守数字去重）——接受此限制并披露，还是延后整块？
6. **Q6 INSUFFICIENT_DATA 的枚举位**：新增 ExperimentVerdict 值（动 VERDICT_CLASSES 与 ledger settle 语义）vs 复用 inconclusive+结构化原因？前者更诚实但改动 prediction settle 语义。
7. **Q7 阈值默认**：OR/RR 类判定 threshold 是否允许省略（默认 H0=0，即 ln 1）？现 ML 路径 threshold 必填+provenance 必填；meta 若默认 H0 应写死 provenance='null_boundary'。
8. **Q8 sidecar statsmodels 对拍**：是否允许开发依赖进 uv.lock（需确认）？或完全靠人工一次性对拍固化 fixture？
9. **Q9 fixture 数据版权口径**：Borenstein/Cochrane 示例数据键入自用+出处标注是否满足团队合规要求？

## 8. 实施切片建议（批准后，非本文档范围）

1. M1：meta 数学纯函数 + 金标准 fixture 测试（零 schema 改动，先行可验）
2. M2：EffectEstimate schema + 抽取校验器（evidence 阶段扩展）
3. M3：ExperimentSpec union + meta 校验器 + meta 执行路径（复用 buildFeedback/mechanicalVerdict）
4. M4：draftMetaSpecFromPlan + INSUFFICIENT_DATA 闭环 + revise 消费结构化 caveat

---

### 引用（外部查证，2026-08-23）

- statsmodels `combine_effects`（DerSimonian-Laird 一步法、FE+RE、HK 变体）：[官方 API 文档](https://www.statsmodels.org/devel/generated/statsmodels.stats.meta_analysis.combine_effects.html)、[示例 notebook](https://www.statsmodels.org/devel/examples/notebooks/generated/metaanalysis1.html)；[statsmodels PyPI（BSD-3-Clause, 0.14.6）](https://pypi.org/project/statsmodels/)
- Egger 检验（SND-on-precision 加权回归，截距≠0）：Eger, Davey Smith, Schneider & Minder 1997 BMJ；[Lin & Xu 2017 PMC 综述](https://pmc.ncbi.nlm.nih.gov/articles/PMC5953768/)；[metafor regtest 文档](https://wviechtb.github.io/metafor/reference/regtest.html)；<10 研究低功效：[Cochrane Handbook Ch.13](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-13)
- I² 阈值 25/50/75（低/中/高，tentative）：[Higgins et al. 2003 BMJ (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC192859/)；[Cochrane Handbook Ch.10](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-10)
- JS 生态无维护中的元分析库：jstat [MIT, 1.9.6, 2022-11 后休眠](https://github.com/jstat/jstat)（无元分析功能，仅分布函数）；npm 仅有散装 effect-size 计算器（如 @tpmjs/tools-effect-size-suite）
