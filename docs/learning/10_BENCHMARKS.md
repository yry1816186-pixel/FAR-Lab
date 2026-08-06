# 10 · Benchmark：30 个科学问题种子解剖

> 学习目标：理解 benchmark 种子（demo seed）的完整结构——从 raw input
> 到 verdict 的六阶段；掌握 30 个种子的领域/verdict 分布；学会解剖一个新种子；
> 理解"工程完整性广度"与"真实科学裁决"的诚实边界。
> 前置：03, 04。产出：能读懂任意一个种子的全过程并解释它的 verdict。
> 代码：`src/demo_seeds/`（30 个种子 + helpers + registry）。

---

## 10.1 什么是 demo seed？

一个 demo seed = **一个真实科学问题的端到端演示**：真实的问题陈述（raw input）、
真实的证据来源（SourceCard，带 DOI/arXiv）、真实的统计/裁决路径、一个确定性的
verdict。它们不是虚构玩具——每个都对应真实科学事件或真实研究问题。

诚实边界（registry 注释原话）：verdict 由 offline fixture 产出，
**不是真实科学裁决**；但 verdict 多样性本身即证据——不是"全 CONFIRMED"
的剧场，而是 supports/refutes/inconclusive/degraded-scope/untested 的真实混合。

## 10.2 30 个种子全景（2026-08-06 实测）

registry 实际注册 **30 个**（文件头注释写 16 是过时数字——见 B2 修复）。

### 按领域分（~28 个科学领域）

| 前缀 | 领域 | 例子 |
|---|---|---|
| A | 天文/天体物理 | A2 暗能量、A4 行星轨道衰减、A8 黑洞信息悖论、A11 SMBH 并合、A16 脉冲星制动 |
| B | 生物/基因组 | B2 iPSC 重编程、B3 CRISPR 脱靶、B5 肠道菌群-抑郁、B7 蛋白质折叠 |
| C | 化学/能源 | C2 CO₂ 还原、C3 催化剂活性、C8 人造光合作用、C10 NISQ 量子优势 |
| D | 宇宙学 | D9 暗物质直接探测 |
| E | 生态/气候 | E2 碳通量、E3 全球碳汇、E5 气候敏感度 ECS、E8 海洋酸化-珊瑚 |
| G | 地球科学 | G2 通用流感疫苗、G5 地震前兆 |
| H | 生命起源 | H1 RNA 世界、H3 手性起源 |
| M | 医学/神经 | M2 SGLT2 心衰、M3 端粒-衰老、M7 阿尔茨海默 Aβ |
| N | 神经科学 | N3 神经退行蛋白聚集 |
| P | 物理 | P1 室温超导（LK-99）、P3 时间之箭、P6 量子生物学 |
| T | 意识科学 | T1 NCC 意识相关神经相关物 |

### 按 verdict 分（真实混合，非全 CONFIRMED）

| verdict | 例子 |
|---|---|
| CONFIRMED | A8 黑洞信息、A16 脉冲星、E2 碳通量、M2 SGLT2 |
| REFUTED | B7 蛋白质折叠、E5 气候敏感度、P1 LK-99 室温超导 |
| INCONCLUSIVE | A4 轨道衰减、B3 CRISPR、D9 暗物质、H1 RNA 世界 |
| DEGRADED_SCOPE | C3 催化剂、C8 光合作用、M7 Aβ 假说、N3 蛋白聚集 |
| UNTESTED | G5 地震前兆 |

## 10.3 解剖一个种子：P1 室温超导（LK-99）

`src/demo_seeds/p1_room_temp_superconductor.ts`（369 行）是标准解剖标本：

```
① RAW_INPUT      真实问题陈述（含关键 confound：Cu₂S 杂质 385K 相变）
② SOURCE_CARD   证据来源：DOI 10.1038/s41586-023-06674-2（Nature 独立复现）
③ Understanding  问题理解 payload（problemStatement + scope + keyTerms）
④ 六阶段 FSM    understanding → evidence → statistics → verdict → seal → report
⑤ VerdictNode   REFUTED（阈值 spec: gt 300K；实测全部 < 300K）
⑥ reproHash     复现哈希锚定
```

关键设计（P1 注释 L7-12）：
- FEC 阈值：`semantics='gt' value=300`（Tc ≥ 300K）
- 所有复现证据 metricValue < 300（电阻非零、无迈斯纳）→ 全 refutes → **REFUTED**
- 诚实展示：正确驳斥"室温常压超导"过度声称（实际是 Cu₂S 杂质电阻跳变）

**为什么 REFUTED 而不是 UNTESTED？** 因为种子提供了完整的 FEC（预注册阈值）
+ 统计证据（复现失败）→ R6 PRIMARY_TEST_REFUTES 正常触发。对比 demo ②
（C-ASTRO-0001，无统计注入）→ UNTESTED。**同一个内核，输入决定输出。**

## 10.4 registry 与 benchmark 聚合器

- `registry.ts`：30 个种子的元数据（problemId/title/domain/tag）+ run 函数绑定，
  按 problemId 升序（确定性叶序）。
- `src/benchmark/aggregator.ts`：串行消费 registry，跑 `far bench run`。
- `src/benchmark/types.ts` + `report_schema.ts`：输出结构化 benchmark 报告。

## 10.5 动手练习

1. 跑 `node src/cli/far.ts bench run`（或看 `bench --help`），观察聚合输出。
2. 读 `p1_room_temp_superconductor.ts` 的六阶段 payload 定义，画出数据流。
3. 选一个 INCONCLUSIVE 种子（如 A4 行星轨道衰减），找出它为什么是
   INCONCLUSIVE（哪个规则触发，什么统计缺失）。
4. （进阶）解剖一个 CONFIRMED 种子（如 M2 SGLT2 心衰），对比它和
   INCONCLUSIVE 种子的统计输入差异——什么让内核走到了 R7？
5. （进阶）`far court` / `far arena`：法庭质询和多引擎对打，看它们如何
   消费这些种子。

## 自测

- [ ] 能说出 30 个种子覆盖多少个领域、5 种 verdict 是否都有
- [ ] 能解剖任意种子的六阶段（raw → source → understanding → FSM → verdict → hash）
- [ ] 能解释 P1 为什么 REFUTED（阈值 spec + 复现证据）
- [ ] 知道 registry 与 aggregator 的关系
- [ ] 能说出 demo seed 的诚实边界（fixture ≠ 真实裁决）

→ 下一步：[11 生产化](11_PRODUCTION.md) —— Docker、安全、CI、供应链。
