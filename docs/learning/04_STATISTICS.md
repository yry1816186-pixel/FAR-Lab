# 04 · 统计引擎：p 值、效应量、多重比较——每个公式为什么

> 学习目标：理解 FAR-Lab 统计层每个函数的数学依据与实现选择；能手工复算
> 一个 z 检验 p 值；理解 Bonferroni/Holm/BH-FDR 的差别和适用场景；理解为什么
> 效应量 + 功效分析是 verdict 的一部分。
> 前置：03。产出：能对着 `src/statistics/` 每个文件讲出它解决什么问题。
> 代码：`src/statistics/`（9 个文件，纯函数，确定性，无 IO）。

---

## 4.1 为什么统计层必须是"自己算"而不是"抄结果"

FAR-Lab 的一条红线（README §Security）：**没有硬编码的原始统计量**。
p 值 / 效应量 / CI 全部由 `src/statistics/` 现场计算。原因：

1. **可审计**：每个 verdict 的统计量可以独立重算，不需要信任论文报告的
   数字（论文的 p 值可能是错的、可能是 p-hacked 的）。
2. **可复现**：同样的原始数据 → 同样的检验 → 同样的 p 值，字节级一致。
3. **反剧场**：如果统计量是抄进来的，`data_hash_fake` / `report_mismatch`
   检测器就会抓"声称的统计 ≠ 可重算的统计"。

## 4.2 模块地图（src/statistics/）

| 文件 | 内容 | 核心问题 |
|---|---|---|
| `effect_size.ts` | 均值/方差/标准差、Cohen's d、Hedges' g | 效应有多大？ |
| `p_value.ts` | erf、正态 CDF、z 检验 p 值 | 显著吗？ |
| `t_distribution.ts` | t 分布 CDF/生存/逆函数（不完全 Beta + Lentz 连分数） | 小样本怎么办？ |
| `multiple_testing.ts` | Bonferroni / Holm / BH-FDR 校正 | 测了很多次怎么办？ |
| `bootstrap_ci.ts` | 自助法置信区间 | 不假设分布怎么估 CI？ |
| `permutation_test.ts` | 置换检验 | 不假设分布怎么检验？ |
| `ks_test.ts` | Kolmogorov-Smirnov 检验 | 两个分布一样吗？ |
| `ci.ts` | 置信区间构造 | 估计的精度？ |

## 4.3 效应量（effect_size.ts）

### 为什么需要效应量？

p 值回答"是否显著"，但**不回答"效应多大"**。N=100000 时一个 d=0.01 的效应也
能 p<0.001。效应量回答"这个差异有多大"，且**不受样本量影响**（这是它和 p 值
的根本区别）。

### 公式与实现

- **样本方差（L27-49）**：`Σ(x-mean)² / (n-1)`——**Bessel 校正**。
  用 n-1 而不是 n，因为样本均值本身估计了总体均值，自由度少 1。
  这是初学者最常写错的细节，FAR-Lab 正确实现了它。

- **Cohen's d（单样本，L77-84）**：`(sampleMean - nullMean) / sampleSD`。
  用标准差做单位衡量"偏离零假设几个标准差"。

- **Hedges' g（两样本，L99-121）**：`cohensD × (1 - 3/(4·df - 1))`。
  这是**小样本校正**：Cohen's d 在小样本下有正偏（高估效应），Hedges 的
  校正因子把它拉回来。df = n₁ + n₂ - 2。这个细节很多统计库都省略，
  FAR-Lab 保留它——因为 FAR-Lab 要裁决的正是心理学/临床/神经科学论文，
  它们的小样本恰恰最需要校正。

### 教学点：d=0.25 意味着什么？

Bem (2011) Exp1 的 d=0.25。这是"小效应"（Cohen 的惯例：0.2 小 / 0.5 中 / 0.8 大）。
叠加 N=100 的小样本、单尾检验、无多重比较校正——**一个"显著"的 d=0.25 在
校正后根本不显著**。这就是 01 章那个练习的数学基础。

## 4.4 p 值（p_value.ts）

### 实现链路

```
z 统计量 → 正态 CDF（erf 近似）→ p 值
```

- **erf（L25-38）**：Abramowitz & Stegun 7.1.26 的有理多项式近似，
  精度 ~1.5e-7。这是数值计算的经典方法，不用查表。
- **正态 CDF（L43-46）**：`0.5 × (1 + erf(x/√2))`。
- **z 检验 p 值（L58-71）**：`less` = CDF(z)；`greater` = 1-CDF(z)；
  `two_sided` = 2 × (1-CDF(|z|))。注意双尾是"两倍单尾"——因为正态对称。
- **oneSampleZTest（L76-95）**：`z = (mean - nullMean) / (σ/√n)`。
  标准误 = 总体标准差 / √样本量。

### 教学点：为什么需要 t 分布？

z 检验假设已知总体标准差 σ。现实里我们只有样本标准差 s。大样本（n>200）
时 s≈σ，z 足够好；但**小样本（n<30）用 z 会系统性高估显著性**
（anti-conservative）。这正是 t_distribution.ts 模块注释（L6-8）说的：
"covers most real psychology / clinical trial / neuroscience papers"。

t 检验用 `t = (mean - nullMean) / (s/√n)`，查 t 分布（自由度 n-1）——
尾部比正态更肥，小样本 p 值更大、更保守。**FAR-Lab 有完整 t 分布实现**
（不完全 Beta 函数 + Lentz 连分数，Numerical Recipes §6.4），这是
生产级统计库的深度，不是玩具。

## 4.5 多重比较校正（multiple_testing.ts）

### 问题

测 10 次，每次 α=0.05，至少一次假阳性的概率 = 1-(1-0.05)¹⁰ ≈ 40%。
不校正 = 系统性虚增显著性。Bem 的 9 个实验就是这么"显著"的。

### 三种校正（L23-71）

| 方法 | 规则 | 控制什么 | 严格度 |
|---|---|---|---|
| **Bonferroni** | p_adj = p × m（m=检验次数，封顶 1） | FWER（家族错误率） | 最保守 |
| **Holm** | 排序后逐步：p_(i) × (m-i+1)，取累计 max | FWER | 比 Bonferroni 温和（保留更多功效） |
| **BH-FDR** | 排序后反向：p_(i) × m/(i)，取累计 min | FDR（错误发现率） | 最宽松，适合大量检验 |

实现细节（值得学）：
- **Holm（L44-55）**：先排序，从最小 p 开始乘 (m-rank+1)，**runningMax**
  保证调整后 p 单调不减（Holm 的单调性要求）。
- **BH-FDR（L57-71）**：从最大 p 反向乘 m/(rank+1)，**runningMin** 保证
  调整后 p 单调不减。
- 所有调整值 clamp 到 [0,1]（L89），alpha 必须严格在 (0,1)（L106-110），
  输入 p 必须在 [0,1]（L112-120）——**fail-fast 输入校验**是项目风格。

### 教学点：什么时候用哪个？

- 检验次数少（<10），想保守 → Bonferroni（Bem 案例的正确选择，α/9≈0.0056）。
- 检验次数中等，想保留功效 → Holm（几乎免费地比 Bonferroni 好）。
- 检验次数多（成百上千，如基因组学/频率网格搜索）→ BH-FDR。

## 4.6 功效与 MDE：为什么 verdict 需要它

FAR-Lab 的 R7/R8 消费 `evidenceSufficiency.powerStatus`：

- **adequate**：FEC 声明了 minimum detectable effect（MDE），且样本量达到 → 可 CONFIRMED。
- **underpowered**：功效不足 → R8 INCONCLUSIVE。**哪怕 p<0.05**。
- **unknown**：FEC 没做功效分析 → effectSize 门跳过（诚实降级，见 03 章）。

这个设计直击可复现性危机的根源：**统计功效不足是已发表研究无法复现的
第一大原因**（OSC 2015 的核心发现之一）。一个小样本实验即使 p<0.05，
它的"显著"也很可能是运气。

## 4.7 动手练习

1. **手工复算 z 检验**：拿 demo ③ 的数据（oneSampleZTest），用公式
   `z = (mean-0.72)/(σ/√n)` 手算，对比代码输出的 p 值。
2. **跑多重比较**：写 3 行 Node 调 `adjustPValues`，输入
   `[0.014, 0.005, 0.03, 0.02, 0.01, 0.04, 0.006, 0.025, 0.015]`，
   分别用 bonferroni / holm / bh_fdr，观察拒绝集合差异。
3. **读 t 分布测试**：`tests/statistics/t_distribution.test.ts` 里有没有
   和已知表值（如 t₀.₀₂₅,₃₀=2.042）对照的断言？跑一遍看精度。
4. **（进阶）验证 Bem 案例**：用 `oneSampleZTest`（或 t 检验）复算
   Bem Exp1：命中率 53.1%，N=100，H0=50%，σ 未知用样本 SD——
   得到 p≈0.014（单尾）。再乘 9（Bonferroni）看它翻不翻车。

## 自测

- [ ] 能写出样本方差的公式并解释为什么除以 n-1
- [ ] 能解释 Cohen's d 和 p 值的区别（各回答什么问题）
- [ ] 能说出 Holm 和 BH-FDR 各控制什么错误率、什么时候用哪个
- [ ] 知道为什么小样本必须用 t 分布而不是 z
- [ ] 知道 underpowered 时 p<0.05 也不能 CONFIRMED

→ 下一步：[05 反剧场检测](05_ANTI_THEATER.md) —— 22 个检测器逐个拆解。
