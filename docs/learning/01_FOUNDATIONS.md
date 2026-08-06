# 01 · 问题域：为什么 AI4S 需要一个验证层

> 学习目标：说清楚 AI4S 可复现性危机的三个失败模式；用四个真实案例（Bem、OSC、
> LK-99、Theranos）理解"生成假设的模型不能同时当裁判"；理解 FAR-Lab 的定位。
> 前置：无。产出：能画出"失败模式 → 检测机制"映射表。

---

## 1.1 科学正在经历什么：可复现性危机

2015 年，Open Science Collaboration 在 *Science* 发表 Reproducibility Project：
对 100 篇已发表的心理学研究进行严格复制，只有 **36%** 得到统计显著的重现，
复制效应量平均只有原始研究的一半。

这不是心理学独有的问题：癌症生物学（2012 年 Amgen 只能重现 11%）、经济学、
临床医学都报告了类似比例。**发表 ≠ 可复现**。

可复现性危机的统计根源，正是 FAR-Lab 反剧场层逐条检测的东西：

| 统计陷阱 | 通俗说法 | FAR-Lab 检测器 |
|---|---|---|
| p-hacking | 一直分析直到 p<0.05 | `phack_alpha` / `phack_correction` / `phack_pcurve` |
| optional stopping | 边收集数据边看结果，显著就停 | `optional_stopping` / `stopping_rule` |
| HARKing | 先看结果再编假设 | `hark` |
| cherry-picking | 只报对自己有利的种子/样本 | `seed_cherry` |
| scope laundering | 结果不好就偷偷缩小范围 | `scope_launder` / `fake_degraded` |
| metric swap | 声明测 A，实际测 B | `metric_swap` |
| missing raw data | 只给结论不给原始数据 | `missing_raw` / `provenance_unbound` |

## 1.2 新变量：LLM 大规模生成科学内容

可复现性危机之后，AI 又给科学加了一个量级的新变量：

- **假设爆炸**：LLM 可以每分钟生成成百上千个"科学假设"。人类审稿人不可能逐一验证。
- **幻觉即内容**：LLM 生成的论文可以数据自洽但事实全错（参考 2024-2025 年多起
  LLM 生成论文污染学术数据库的报道）。
- **自我裁决悖论**：当同一个模型既生成假设、又评估假设时，验证毫无意义——
  生成器和裁判是同一个偏见源。

FAR-Lab 的核心论断（也是全项目最重要的一句话）：

> **生成假设的实体，不得同时担任裁决假设的实体。**
> LLM 负责提出（generate），确定性内核负责裁决（adjudicate）。

## 1.3 三个失败模式（FAR-Lab 的问题定义）

FAR-Lab 把"不可信的 AI4S 结论"拆成三个可检测的失败模式：

1. **Unfalsifiable（不可证伪）**——声称无法被任何实验推翻。
   例："该模型显著提升了科学发现效率"（没有 metric、没有阈值、没有对照组）。
   → FAR-Lab 的 FEC（Falsifiability Evidence Contract）在门口就拒绝：
   没有 metric + threshold + comparator 的 claim 无法通过编译。

2. **Irreproducible（不可复现）**——换个环境/种子/样本量结果就变。
   例：依赖特定 GPU 精度、未固定种子、数据集漂移。
   → 证据链 + 执行指纹（10x 资源轮廓发散 → DEGRADED_SCOPE）+ 跨语言
   字节一致哈希。

3. **Untraceable（不可追溯）**——结论和证据脱节，无法知道"这个结论凭什么成立"。
   例：报告 p<0.05 但没有原始数据、没有统计代码、没有分析计划。
   → 内容寻址证据链 + ProofEnvelope + 第三方独立重算。

## 1.4 四个真实案例（都是已发表、可验证的事件）

### Case 1 · Bem (2011) "Feeling the Future" — p-hacking 的教科书

Bem 报告 9 个实验显示"预知"效应，多个 p<.05。公开数据（Table 1）：
Exp1 N=100，双选命中率 53.1% vs 50%，t(99)=2.51，p=.014（单尾），d=0.25。

问题：10 个实验 × 多 DV，**没有多重比较校正**；使用单尾检验；效应量小但样本
恰好"显著"。用 FAR-Lab 逻辑重算：若做 Bonferroni 校正（α/9≈.0056），
Exp1 的 p=.014 不再显著 → 结论翻转。

**FAR-Lab 会怎么判**：
- 无预注册假设 → FEC 无法封签 → **UNTESTED**
- 即使强行通过，`phack_correction` 检测器（缺多重比较校正）+ `optional_stopping`
  （数据窥探）→ **R3 CRITICAL_PROTOCOL_DEVIATION → UNTESTED**

> 想亲自动手？`src/statistics/multiple_testing.ts` 里 `adjustPValues` 实现了
> Bonferroni / Holm / BH-FDR。用 Bem 的 9 个 p 值跑一遍，看校正后还剩几个显著。

### Case 2 · OSC (2015) — 可复现性危机的元问题

100 项心理学研究只有 36% 可复现。FAR-Lab 把每个原始研究当一条 claim 处理：
预注册了吗？（多数没有 → UNTESTED）；复制效应量 vs 原始效应量（减半 →
INCONCLUSIVE / DEGRADED_SCOPE）；功效够吗？（多数不足 → R8）。

### Case 3 · LK-99 (2023) — 室温超导的过山车

Lee et al. 声称 LK-99 是室温常压超导体。几周内多实验室无法复现：
Cu₂S 杂质在 ~385K 的结构相变造成电阻骤降，被误读为超导转变。

**FAR-Lab 怎么判**：
- arXiv 预印本 ≠ 同行评议 → `identifierClaims` → **R_IDENTIFIER_FABRICATION**
- 单样本声称推广到整个材料类别 → **R4 SCOPE_MISMATCH**
- 复现实验全部阴性 → **R6 PRIMARY_TEST_REFUTES → REFUTED**

> 仓库里有完整的 LK-99 种子：`src/demo_seeds/p1_room_temp_superconductor.ts`，
> 从 raw input 到 REFUTED 六阶段全流程，是理解"真实问题如何变成 verdict"的最佳起点。

### Case 4 · Theranos (2014-2018) — 没有原始数据的一切

声称一滴血做 200+ 项检测，实际技术从未工作。这是"**缺失原始数据 + 无溯源**"
的极端形态——连可复现的输入都没有。

**FAR-Lab 怎么判**：`provenance_unbound`（结论无数据溯源）+ `missing_raw`
（只有最终数字没有原始测量）→ **ANTI_THEATER_FAIL → UNTESTED**。
系统拒绝在没有证据的情况下封签——**fail-closed（失败即关闭）** 是贯穿
全项目的设计哲学。

## 1.5 FAR-Lab 的定位（它不是什么）

- ✅ 一个**验证层**：吃进 claim + evidence，吐出确定性 verdict + 可重算证明。
- ❌ 不是"AI Scientist 全自动科研"——它不做假设生成、不做实验。
- ❌ 不是 LLM 裁判——R0-R9 内核是纯确定性规则树，LLM 只在生成侧。
- ❌ 不是万能的——它证明"证据与结论一致、过程未被篡改"，不证明"科学结论为真"。

## 1.6 动手练习

1. 读 `src/demo_seeds/p1_room_temp_superconductor.ts` 的前 60 行，找出
   FEC 的 metric/threshold/comparator 是什么。
2. 用 Node 跑 `node src/cli/far.ts demo`，观察 UNTESTED 的 claim 为什么被拒
   （找 `NO_DECISION_PATH` 的 reasonCode）。
3. （进阶）在 `src/statistics/multiple_testing.ts` 里用 Bem 的 9 个 p 值
   （0.014, 0.005, 0.03, 0.02, 0.01, 0.04, 0.006, 0.025, 0.015 为教学示意，
   真实值见 Bem Table 1）跑 Bonferroni 与 BH-FDR，比较拒绝集合。

## 自测

- [ ] 能说出 36% 这个数字来自哪项研究、意味着什么
- [ ] 能解释为什么 LLM 不能当自己的裁判
- [ ] 能把 Bem/LK-99/Theranos 各自映射到一个以上检测器
- [ ] 能解释 fail-closed 是什么意思，举一个项目内的例子

→ 下一步：[02 系统走查](02_SYSTEM_TOUR.md) —— 全系统数据流与 25 个命令全景。
