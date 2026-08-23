# Meta-Math 模块：OSS 复用评估 + 金标准数据集（只读调研）

> 触发：`statistical-experiment-type-scout.md`（W-F）确定"判定数学纯 TS 手写在 zod-only 核心内"方向后的两项支撑调研。
> 方法：全部结论基于 2026-08-23 实际抓取（npm registry search API、GitHub repo search API、metafor/metadat 官方文档站、Viechtbauer `meta_analysis_books` 重现页全文下载解析、CRAN 包页、JSS v036i03 PDF 下载全文检索）。每个数字标注来源；无凭记忆的数字。
> 本文件是该调研唯一产出文件；未改动任何其他文件。

**TLDR**
- **A 结论：BUILD（手写 ~300 行纯 TS），不 vendor 任何 JS 库。** JS/TS 生态不存在 metafor 级别的通用 meta-analysis 统计库——npm 无通用包、GitHub JS 项目全是应用/工具而非统计库、mathjs/stdlib 均无此功能。唯一沾边的 `raremetal.js`（MIT）是遗传学 score 协方差聚合，无 DL/I²/Egger，不可 copy-in。搜索证据见 §A.2。
- **B 结论：收到 4 个主数据集 + 3 个辅助数据集，全部带逐数字可追溯来源**：dat.bcg（13 研究 log RR，FE+DL+REML+逐研究 yi/vi 全套）、Borenstein Table 14.1（SMD，6 研究）、Borenstein Table 14.4（OR，6 研究）、dat.egger2001（Egger 检验完整输出）；辅助 cannon2006/lau1992/hackshaw1998 与 Ch.4 单研究 escalc 单元级金标准。覆盖 FE/DL 合并、Q、I²、H²、τ²（含 CI）、Egger（lm+rma 两版）、fsn/trimfill。缺口见 §B.6。

---

## Part A — OSS 复用评估（vendoring copy-in vs 手写）

### A.1 决策词汇（oss-due-diligence 协议）

**BUILD**。手写 log 尺度 FE + DL 随机效应 + Q/I²/H²/τ² + Egger 回归检验（约 300 行纯 TS），用本文 Part B 金标准数据做离线确定性单测。

### A.2 搜索证据（发现 → 一手查证）

| # | 渠道 | 查证内容 | 结果 |
|---|---|---|---|
| 1 | npm registry search API（`registry.npmjs.org/-/v1/search?text=meta-analysis`，2026-08-23 实抓） | "meta-analysis" 关键词包 | **无任何通用统计 meta-analysis 包**。前排包：`tsmeta`（TS 代码结构分析，与统计学无关）、`module-meta-analysis`（JS 模块分析）、`raremetal.js`（见 A.3）、其余为正则/AST 分析类无关包 |
| 2 | GitHub repo search API（`q=meta-analysis+language:javascript` 按 star 排序） | JS 生态实现 | 全部是应用/工具，无统计库：TIGMINT（OSINT 工具，MIT）、TwoRavens（数据探索 web app，Apache-2.0，2021 停更）、gemtc-web（R 包的 web 前端，GPL-3）、MetaReview/MetaAnaly（网页平台，无 npm 库形态） |
| 3 | GitHub repo search（`q=DerSimonian`，全语言） | DL 实现移植 | 结果全为 R/Python（aedl、课程材料、Python 工具脚本），**零 JavaScript 实现** |
| 4 | mathjs 官网 + 函数参考（mathjs.org/docs/reference/functions.html） | 是否有 meta-analysis util | 无。mathjs 是通用数学库（矩阵/复数/表达式解析），无统计推断、无效应量合并 |
| 5 | stdlib（@stdlib/stats* 包系列） | 同上 | 有 t-test、ANOVA、分布函数等积木，无 meta-analysis 合并例程 |
| 6 | Web 搜索（多查询族） | metafor/statsmodels 的 JS 移植 | 不存在已知移植。R metafor（GPL-2\|GPL-3，CRAN 一手确认）与 Python statsmodels 均无对应 JS 生态产物 |

### A.3 唯一认真候选：raremetal.js — REJECT

- 名称+URL：`raremetal.js`，https://github.com/statgen/raremetal.js （npm 同名，v1.3.2）
- license：MIT（npm registry 一手字段）
- 维护状态：最后发布 2021-02-04（npm `date` 字段），已停更
- 能力：罕见变异遗传学的 aggregation test（VT/SKAT 类 score 统计 + 协方差矩阵合并）。**不含**通用 DerSimonian-Laird 随机效应、不含 I²/Egger
- 代码量级/copy-in 可行性：领域特定（GWAS score 结构），其可复用部分只有少量数值代码；为取 ~50 行数值工具引入一个遗传学框架的语义，得不偿失
- 结论：REJECT（不是本任务需要的能力）

### A.4 为什么手写更优（BUILD 论证）

1. **无成熟替代**：A.2 六路独立搜索未发现任何可 vendor 的候选——这不是"选择困难"，是"不存在"。
2. **算法量级小**：FE 逆方差合并、DL 一步矩估计（τ² = max(0, (Q−df)/(Σw − Σw²/Σw))）、Q/I²/H²、Egger 加权回归都是教科书级公式（Borenstein 2009 全书展开讲解），核心 ~300 行内可实现，且 zod-only 运行时约束下没有 npm 依赖空间（scout 文档已定）。
3. **正确性可用金标准锁死**：Part B 的数据集提供逐研究效应量 + 发表合并值的完整对照（尤其 Borenstein 书中数字 = DL 方法、metafor 重现输出 = 机器精度对照），手写实现的每条公式路径都能离线确定性验证——这比 vendoring 一个无维护的小库并审计其全部代码更快更可靠。
4. **公式来源合规**：统计公式属公共数学；实现对照 R metafor 的**行为**（数字），不复制其 GPL 代码，无许可证污染。若未来 vendor：必须保留原项目 license notice（MIT 需保留 copyright 行；GPL 代码进 zod-only 核心则整体传染 GPL，不可行——本调研未发现值得走这条路的 GPL 候选）。

---

## Part B — 金标准数据集（离线确定性单测用，最重要交付）

> 使用规则：fixture 中逐研究数字来自下表；断言值与来源 URL 一并写入测试注释。Borenstein 书内数字存在人工舍入，Viechtbauer 重现页注明"minor discrepancies"，测试容差建议：合并估计 ±0.001（对 metafor 机器精度输出），对书内 2 位小数数字 ±0.005。

### B.1 数据集 1（主力）：dat.bcg — BCG 疫苗预防结核，13 研究，log RR

**原始数据（2×2 表）来源**：metadat 官方文档 https://wviechtb.github.io/metadat/reference/dat.bcg.html （原论文：Colditz GA et al. 1994, "Efficacy of BCG vaccine in the prevention of tuberculosis: Meta-analysis of the published literature", *JAMA* 271(9):698–702）。

| trial | author | year | tpos | tneg | cpos | cneg |
|---|---|---|---|---|---|---|
| 1 | Aronson | 1948 | 4 | 119 | 11 | 128 |
| 2 | Ferguson & Simes | 1949 | 6 | 300 | 29 | 274 |
| 3 | Rosenthal et al | 1960 | 3 | 228 | 11 | 209 |
| 4 | Hart & Sutherland | 1977 | 62 | 13536 | 248 | 12619 |
| 5 | Frimodt-Moller et al | 1973 | 33 | 5036 | 47 | 5761 |
| 6 | Stein & Aronson | 1953 | 180 | 1361 | 372 | 1079 |
| 7 | Vandiviere et al | 1973 | 8 | 2537 | 10 | 619 |
| 8 | TPT Madras | 1980 | 505 | 87886 | 499 | 87892 |
| 9 | Coetzee & Berjak | 1968 | 29 | 7470 | 45 | 7232 |
| 10 | Rosenthal et al | 1961 | 17 | 1699 | 65 | 1600 |
| 11 | Comstock et al | 1974 | 186 | 50448 | 141 | 27197 |
| 12 | Comstock & Webster | 1969 | 5 | 2493 | 3 | 2338 |
| 13 | Comstock et al | 1976 | 27 | 16886 | 29 | 17825 |

**逐研究 log RR (yi) 与方差 (vi)**（`escalc(measure="RR")`，无连续性校正——13 研究无零格子）。来源：Viechtbauer "R Code Corresponding to the Book Introduction to Meta-Analysis by Borenstein et al. (2009)"，https://wviechtb.github.io/meta_analysis_books/borenstein2009.html （2023-10-01 版，全文已实抓）：

| trial | yi | vi |
|---|---|---|
| 1 | -0.8893 | 0.3256 |
| 2 | -1.5854 | 0.1946 |
| 3 | -1.3481 | 0.4154 |
| 4 | -1.4416 | 0.0200 |
| 5 | -0.2175 | 0.0512 |
| 6 | -0.7861 | 0.0069 |
| 7 | -1.6209 | 0.2230 |
| 8 | 0.0120 | 0.0040 |
| 9 | -0.4694 | 0.0564 |
| 10 | -1.3713 | 0.0730 |
| 11 | -0.3394 | 0.0124 |
| 12 | 0.4459 | 0.5325 |
| 13 | -0.0173 | 0.0714 |

**发表合并值（三条独立路径，来源不同页面）：**

1. **FE（equal-effects）**，`rma(yi, vi, method="EE")`，来源：borenstein2009 重现页（Borenstein 书 Ch.20/21 区段）
   - estimate **-0.4303**, se 0.0405, zval -10.6247, pval <.0001, 95%CI **[-0.5097, -0.3509]**
   - Q(df=12) = **152.2330**, p < .0001；I² = **92.12%**；H² = 12.69
2. **RE with DL**（`rma(yi, vi, method="DL")`），来源：同页两处输出块
   - estimate **-0.7141**, se **0.1787**（z 检验版，permutest 输出块所引用的原模型），95%CI **[-1.0644, -0.3638]**
   - Knapp-Hartung 版（同页 `test="knha"` 输出）：se 0.1807, tval -3.9520, df 12, p 0.0019, CI [-1.1078, -0.3204]
   - τ² = **0.3088**（SE 0.2299）, τ = 0.5557, I² = 92.12%, H² = 12.69, Q(df=12)=152.2330, p<.0001
3. **RE with REML**（`rma(yi, vi)` 默认），来源：metadat dat.bcg 文档页
   - estimate -0.7145（log RR）; `predict(transf=exp)`: **RR 0.4894, 95%CI [0.3441, 0.6962]**, PI [0.1546, 1.5490]
   - τ² = 0.3132, I² = 92.22%（该页文本值）

注：metafor-project.org 的 `analyses:berkey1995` 页也用 BCG 数据，但其为 Berkey 1995 论文方法（**改写了 vi**（用均值修正）+ EB 估计器：estimate -0.5429, τ²=0.2682, I²=87.49%, Q=85.8625）——**不要**用作标准 escalc vi + DL 路径的金标准，仅可作方法变体参考。

### B.2 数据集 2：Borenstein Table 14.1 Dataset 1 — SMD（连续变量，6 研究）

**原始数据（均值/SD/n）**：Borenstein et al. 2009《Introduction to Meta-Analysis》Ch.14 Worked Examples Table 14.1（书中虚构教学数据集，被无数课件转载）。下表来源：Viechtbauer 重现页逐字 `read.table` 块（https://wviechtb.github.io/meta_analysis_books/borenstein2009.html ）。

| study | mean1 | sd1 | n1 | mean2 | sd2 | n2 |
|---|---|---|---|---|---|---|
| Carroll | 94 | 22 | 60 | 92 | 20 | 60 |
| Grant | 98 | 21 | 65 | 92 | 22 | 65 |
| Peck | 98 | 28 | 40 | 88 | 26 | 40 |
| Donat | 94 | 19 | 200 | 82 | 17 | 200 |
| Stewart | 98 | 21 | 50 | 88 | 22 | 45 |
| Young | 96 | 21 | 85 | 92 | 22 | 85 |

**逐研究 SMD（yi=Hedges' g, vi），`escalc("SMD", vtype="LS2")`**（vtype 说明见 B.7 注意事项）：

| study | yi | vi |
|---|---|---|
| Carroll | 0.0945 | 0.0329 |
| Grant | 0.2774 | 0.0307 |
| Peck | 0.3665 | 0.0499 |
| Donat | 0.6644 | 0.0105 |
| Stewart | 0.4618 | 0.0427 |
| Young | 0.1852 | 0.0234 |

**发表合并值**（来源：同一重现页，与书中 Ch.13/14 的数字对应，书内为 2 位小数 0.41/0.36）：
- FE（`method="EE", digits=2`）：estimate **0.41**, se 0.06, 95%CI **[0.29, 0.54]**, Q(df=5)=12.00, p=0.03, I²=58.34%
- RE DL（`method="DL"`）：estimate **0.3582**, se 0.1052, zval 3.4038, p 0.0007, 95%CI **[0.1520, 0.5645]**；τ² = **0.0373**（SE 0.0420）, I² = **58.34%**, H² = 2.40, Q(df=5) = **12.0033**, p = 0.0347
- τ² 95%CI（`confint(type="HT")`）：τ² [0.0000, 0.1312]，I²(%) [0.0000, 83.1242]

### B.3 数据集 3：Borenstein Table 14.4 Dataset 2 — 二分类 OR（6 研究）

**原始数据（事件数/样本量）**：同书 Ch.14 Table 14.4（来源：同重现页逐字数据块）。

| study | events1 | n1 | events2 | n2 |
|---|---|---|---|---|
| Saint | 12 | 65 | 16 | 65 |
| Kelly | 8 | 40 | 10 | 40 |
| Pilbeam | 14 | 80 | 19 | 80 |
| Lane | 25 | 400 | 80 | 400 |
| Wright | 8 | 40 | 11 | 40 |
| Day | 16 | 65 | 18 | 65 |

**逐研究 log OR (yi) 与 vi**（`escalc("OR")`，无零格子，无连续性校正）：

| study | yi | vi |
|---|---|---|
| Saint | -0.3662 | 0.1851 |
| Kelly | -0.2877 | 0.2896 |
| Pilbeam | -0.3842 | 0.1556 |
| Lane | -1.3218 | 0.0583 |
| Wright | -0.4169 | 0.2816 |
| Day | -0.1595 | 0.1597 |

**发表合并值**（RE DL，来源同页）：
- estimate **-0.5663**（log OR）, se 0.2388, zval -2.3711, p 0.0177, 95%CI **[-1.0344, -0.0982]**
- τ² = **0.1729**（SE 0.2148）, I² = **52.61%**, H² = 2.11, Q(df=5) = **10.5512**, p = 0.0610
- OR 尺度（`predict(transf=exp)`）：**OR 0.5676, 95%CI [0.3554, 0.9065]**, PI [0.1499, 2.1492]

### B.4 数据集 4：dat.egger2001 — 镁剂治疗心梗死亡率，Egger 检验金标准

**原始数据（16 试验，死亡数/患者数）**：metadat `dat.egger2001`，https://wviechtb.github.io/metadat/reference/dat.egger2001.html （数据出处：Egger, Davey Smith & Altman (eds.) 2001, *Systematic Reviews in Health Care*, 2nd ed., BMJ Books, Table 18.2；经典"小试验汇总有效、ISIS-4 大试验推翻"的发表偏倚教学案例）。

| id | study | year | ai | n1i | ci | n2i |
|---|---|---|---|---|---|---|
| 1 | Morton | 1984 | 1 | 40 | 2 | 36 |
| 2 | Rasmussen | 1986 | 9 | 135 | 23 | 135 |
| 3 | Smith | 1986 | 2 | 200 | 7 | 200 |
| 4 | Abraham | 1987 | 1 | 48 | 1 | 46 |
| 5 | Feldstedt | 1988 | 10 | 150 | 8 | 148 |
| 6 | Shechter | 1989 | 1 | 59 | 9 | 56 |
| 7 | Ceremuzynski | 1989 | 1 | 25 | 3 | 23 |
| 8 | Bertschat | 1989 | 0 | 22 | 1 | 21 |
| 9 | Singh | 1990 | 6 | 76 | 11 | 75 |
| 10 | Pereira | 1990 | 1 | 27 | 7 | 27 |
| 11 | Shechter | 1991 | 2 | 89 | 12 | 80 |
| 12 | Golf | 1991 | 5 | 23 | 13 | 33 |
| 13 | Thogersen | 1991 | 4 | 130 | 8 | 122 |
| 14 | LIMIT-2 | 1992 | 90 | 1159 | 118 | 1157 |
| 15 | Shechter | 1995 | 4 | 107 | 17 | 108 |
| 16 | ISIS-4 | 1995 | 2216 | 29011 | 2103 | 29039 |

**Egger 检验发表值**（metafor `regtest()` 官方文档示例，剔除 trial 16 后 k=15，log OR 尺度；来源：https://wviechtb.github.io/metafor/reference/regtest.html ，数字逐条照录）：
- 基础模型（`rma(yi, vi, data=dat)`，REML）：estimate -0.8745, se 0.2080, zval -4.2049, p <.0001, 95%CI [-1.2822, -0.4669]；τ²=0.1911（SE 0.2106）, I²=38.19%, H²=1.62, Q(df=14)=20.9184, p=0.1037
- **经典 Egger 检验（`model="lm"`）**：t = **-3.1783**, df = 13, p = **0.0073**；limit estimate b = -0.1512, CI [-0.5130, 0.2106]
- 随机效应版（`model="rma"`，默认）：z = **-2.8062**, p = **0.0050**；b = -0.1639, CI [-0.5681, 0.2402]
- 变体（同页）：`predictor="ni"` lm 版 t=2.8955, p=0.0125；`predictor="ninv"` lm 版 t=-2.3230, p=0.0370
- 注意（实现对照用）：regtest 默认 predictor 为 `sei`。Egger 1997 原始参数化（SND on precision）与"效应量对 SE 回归"在检验上等价（scout 文档的 β₁=0 检验），写测试时按 metafor 该输出的参数化对齐断言。

### B.5 辅助数据集（同一重现页/metadat 已核，扩充覆盖）

| 数据集 | k | 效应量 | 发表值（全部来自 borenstein2009 重现页或 metadat 文档，DL/EE） | 用途 |
|---|---|---|---|---|
| dat.cannon2006（Ch.1） | 4 | log RR | DL：estimate -0.1634, se 0.0393, CI [-0.2404,-0.0865]，**τ²=0（同质，Q(df=3)=1.2425, p=0.7428）**，I²=0%；RR 0.85 [0.79, 0.92]。逐研究 yi/vi 在页面内（-0.1744/0.0117 等 4 行） | τ²=0 截断路径、k=4 小样本 |
| dat.lau1992（Ch.2/3） | 33 | log RR | DL：estimate -0.2312, se 0.0468, CI [-0.3230,-0.1394]，τ²=0.0077, I²=16.87%, H²=1.20, Q(df=32)=38.4942, p=0.1991。**含零事件研究**（Baroffio 0/29——escalc 对零格子的处理见 B.7） | 中等异质性、零格子行为 |
| dat.hackshaw1998（Ch.30 发表偏倚） | 37 | log OR | EE：estimate 0.1858, se 0.0373, CI [0.1126,0.2589]，Q(df=36)=47.4979, p=0.0952, I²=24.21%；OR 1.204 [1.119,1.295]。发表偏倚配套：Rosenthal fsn=393；Orwin fsn=104（target=ln1.05）；trim-fill 补 7 研究后 estimate 0.1556 [0.0842,0.2270]。逐研究 or/or.lb/or.ub + yi/vi 37 行在页面内 | OR 尺度 FE 大 k；fsn/trimfill 若实现可测 |

**单元级（单研究效应量计算）金标准**——Borenstein 书 Ch.4 示例，`escalc` 输出（来源同重现页）：

| 度量 | 输入 | yi | vi | sei | 95%CI |
|---|---|---|---|---|---|
| MD | m1=103,m2=100,sd1=5.5,sd2=4.5,n=50/50 | 3.0000 | 1.0100 | 1.0050 | [1.0303, 4.9697] |
| SMD (vtype="LS2") | 同上 | 0.5924 | 0.0411 | 0.2028 | [0.1949, 0.9900] |
| RR | a=5,n1=100,c=10,n2=100 | -0.6931 | 0.2800 | 0.5292 | [-1.7303, 0.3440] |
| OR | 同上 | -0.7472 | 0.3216 | 0.5671 | [-1.8588, 0.3643] |
| RD | 同上 | -0.0500 | 0.0014 | 0.0371 | [-0.1227, 0.0227] |

（公式自查锚点：RR 的 vi=1/a−1/(a+b)+1/c−1/(c+d)=0.2−0.01+0.1−0.01=0.28 ✓；OR 的 vi=1/a+1/b+1/c+1/d=0.3216 ✓；yi 无连续性校正时为裸 log 比 ✓——已对上表数字验算。）

### B.6 覆盖矩阵与缺口

**已覆盖**（可直接断言发表值的路径）：
- FE（equal-effects）合并 + CI：BCG、SMD、OR、hackshaw
- DL 随机效应合并 + CI（z 版）：BCG、SMD、OR、cannon、lau
- Q 统计量 + Q 检验 p 值：全部 7 个数据集
- I² / H²：同上（含 τ²=0 → I²=0 截断案例 cannon2006）
- τ² 点估计 + HT 型 CI（BCG/SMD/OR 有 confint 输出）
- Egger 检验（lm 与 rma 两种模型版 + ni/ninv predictor 变体）：egger2001
- Knapp-Hartung 修正版（如实现）：BCG
- REML 对照值（如实现 REML）：BCG（-0.7145/τ²=0.3132）、egger2001（τ²=0.1911）
- 逐研究效应量单元计算：MD/SMD/RR/OR/RD（Borenstein Ch.4）

**缺口（诚实清单）**：
1. **log RR 尺度的 Egger 检验发表值没有**——egger2001 是 log OR。若需 RR 尺度 Egger 对照，需另跑或放宽（实现上一致，风险低）。标注 UNVERIFIED 直至补数。
2. **Cochrane Handbook 数值 worked example 未收**——线上 Handbook 以方法学为主，无 metafor 文档这种集中的机器精度输出；本调研的 3 个独立来源（metadat 文档、borenstein2009 重现页、regtest 文档）已构成交叉验证，Handbook 属锦上添花，可作为后续补充而非阻塞项。
3. **REML 的完整 SE/CI 机器精度输出**只有 metadat 文档的文本值（RR 0.4894 [0.3441, 0.6962] + estimate -0.7145 + τ²/I²），缺 zval/pval 明细——若模块实现 REML，建议补抓或与本地 scipy/metafor 对拍。
4. **零事件研究的 escalc 连续性校正精确规则未单独验证**（lau1992 的 Baroffio 行 yi=-2.5322 暗示对零格子加了 0.5 校正，但该行 vi=2.0883 的校正公式未在文档页明文核对）——实现时若支持零格子，以 lau1992 输出为断言来源并注明推断性质。
5. Borenstein 书**页码**未提供（重现页只给 Table/Figure 编号：Table 14.1/14.4、Figure 14.1/18.1/20.1/30.1 等）；不编造页码，引用以 Table 编号 + 书章节名为准。

### B.7 实现对照注意事项（从证据直接提取）

1. **SMD 的 vi 公式有两个流派**：metafor `escalc("SMD")` 默认 vtype 与 Borenstein 书公式不同（书用 LS2）；要复现书中/上表数字必须用 `vtype="LS2"` 对应的方差公式（Viechtbauer 页面原文注明"by default, the sampling variance is computed in a slightly different way in the book ... by using vtype='LS2', the same equation as given in the book is used"，且书 4.5 节 SMCR 公式本身有笔误）。手写实现需选定一个并在测试注释声明对齐目标。
2. **DL 与 REML 数值不同**（BCG：DL τ²=0.3088/estimate -0.7141 vs REML τ²=0.3132/-0.7145）——fixture 必须按方法分别断言，不可混用。
3. **Borenstein 书内数字多为 2 位小数**（0.41/0.36/12.00），metafor 重现页给出机器精度（0.3582/12.0033）；测试断言用机器精度列，书值作粗对照。
4. metafor 术语：FE 输出标记为 "Equal-Effects Model"；I² 记 "total heterogeneity / total variability"。

---

## 引用清单（一手来源，2026-08-23 均实际访问）

1. metadat dat.bcg 文档（数据表 + REML 结果）：https://wviechtb.github.io/metadat/reference/dat.bcg.html
2. Viechtbauer, R Code for Borenstein et al. (2009)（BCG EE/DL、Table 14.1/14.4、Ch.4 单元示例、cannon2006、lau1992、hackshaw1998 全部输出）：https://wviechtb.github.io/meta_analysis_books/borenstein2009.html
3. metafor regtest() 文档（Egger 检验 k=15 完整输出）：https://wviechtb.github.io/metafor/reference/regtest.html
4. metadat dat.egger2001 文档（16 试验数据表）：https://wviechtb.github.io/metadat/reference/dat.egger2001.html
5. metafor analyses 索引（章节导航）：https://www.metafor-project.org/doku.php/analyses
6. metafor analyses:berkey1995（BCG 的 EB 变体，勿混用）：https://www.metafor-project.org/doku.php/analyses:berkey1995
7. CRAN metafor（license GPL-2|GPL-3 一手确认）：https://cran.r-project.org/package=metafor
8. CRAN metadat（license GPL-2|GPL-3 一手确认）：https://cran.r-project.org/package=metadat
9. Viechtbauer 2010, JSS 36(3)（论文全文 PDF 已下载检索；注意：**其示例不用 BCG 数据**，此前"JSS 论文含 BCG 输出"的假设不成立）：https://www.jstatsoft.org/article/view/v036i03
10. 原始论文：Colditz et al. 1994 JAMA 271(9):698-702（PubMed 8309034）；Egger, Davey Smith & Altman 2001 BMJ Books Table 18.2；Borenstein, Hedges, Higgins & Rothstein 2009《Introduction to Meta-Analysis》
11. A 部分搜索面：npm registry search API（meta-analysis 关键词，2026-08-23）；GitHub repo search（`meta-analysis language:javascript`、`DerSimonian`）；mathjs https://mathjs.org/docs/reference/functions.html ；statgen/raremetal.js https://github.com/statgen/raremetal.js

## 许可证与合规备忘

- **数据 vs 代码**：上述数据集的数字是事实数据（发表表格），fixture 引用 + 署名来源即可；GPL（metafor/metadat 的代码）不约束数字使用，约束的是**代码拷贝**——手写实现只对照行为/输出，不复制 GPL 代码，无传染。
- **borenstein2009.html 页面文字**（Viechtbauer 撰写）为 CC BY-NC-SA 4.0（页面页脚标注）：转载其**文字叙述**需遵守 NC/SA；引用其复现的统计输出数值（计算结果/事实）与 fixture 数据表照常引用来源即可。文档引用格式建议保留 URL + 访问日期。
- 若未来出现 vendor 需求（当前结论为无）：MIT 库需保留 copyright+license notice；GPL 代码不可进 zod-only 核心仓库边界。
