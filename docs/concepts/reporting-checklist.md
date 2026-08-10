# Reporting Checklist — PRISMA / CONSORT 自查表（阶段 7 1128 学术面）

> 依据：EG2-systematic-review.md（系统评价规范审查）+ EG4-reporting-guidelines.md +
> research-integrity.md §3。本自查表对标 PRISMA 2020 / CONSORT 2010 报告规范，
> 诚实标注每项条目的适用性（Applicable / N/A）+ FAR-Lab 等价物。

## 1. 核心定位（重申）

FAR-Lab 是 **claim 级验证层**（单研究验证），**非系统评价/临床试验工具**。
PRISMA 2020（系统评价）与 CONSORT 2010（随机对照试验）的大部分条目**不适用**——
FAR-Lab 既不做文献检索合成，也不做人体试验。适用条目以**等价物**呈现（验证方法
披露 / 证据分级 / 局限声明），见下表。

## 2. PRISMA 2020 自查表（27 条目）

| PRISMA 条目 | 要求 | 适用性 | FAR-Lab 等价物 / 理由 |
|------------|------|--------|----------------------|
| 1 标题 | 识别为系统评价 | **N/A** | FAR-Lab 非 SR——标题为"claim-level verification layer" |
| 2 摘要 | 结构构化摘要 | 部分 | docs/paper/paper.md Summary 节 |
| 3 理由 | 已知背景 | ✅ | paper.md Statement of need（三失败模式） |
| 4 目的 | 研究问题 | ✅ | paper.md "does evidence support this claim?" |
| 5 入排标准 | 纳入/排除 | **N/A** | 非 SR——无文献筛选 |
| 6 信息源 | 数据库/检索 | **N/A** | 证据由用户提供，非系统检索 |
| 7 检索策略 | 完整检索式 | **N/A** | 同上 |
| 8 选择过程 | 筛选流程 | **N/A** | 同上 |
| 9 数据提取 | 提取方法 | **N/A** | 同上 |
| 10 数据项 | 提取字段 | **N/A** | 同上 |
| 11 偏倚评估 | 研究偏倚 | ✅ 等价 | GRADE evidenceQualityTier + Cochrane RoB 7 维（evidence-grading.md） |
| 12 效应测量 | 指标定义 | ✅ 等价 | 五值 verdict（CONFIRMED/REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED）|
| 13 合成方法 | 荟萃分析 | **N/A** | 不做定量合成 |
| 14 异质性 | 统计学差异 | **N/A** | 同上 |
| 15 敏感性分析 | 稳健性 | ✅ 等价 | multiseed 重跑 + suiteIntegrityRoot 字节一致 |
| 16-19 结果 | 研究选择/特征/偏倚/个别研究 | **N/A** | 非 SR |
| 20 结果合成 | 荟萃结果 | **N/A** | 同上 |
| 21-22 异质性/敏感性结果 | | **N/A** | 同上 |
| 23-25 讨论/局限性/结论 | | ✅ 等价 | paper.md cannotProve + research-integrity §7 局限 |
| 26 注册 | PROSPERO | **N/A** | 非 SR |
| 27 支持 | 数据/代码可用性 | ✅ | .far-proof 可移植包 + 开源 MIT + CITATION.cff |

**适用条目（8/27）**：2/3/4/11/12/15/23-25/27——全部有等价物或已落地。
**N/A 条目（19/27）**：FAR-Lab 非 SR 工具，诚实标注。

## 3. CONSORT 2010 自查表（25 条目）

CONSORT 针对随机对照试验——FAR-Lab **完全 N/A**（非临床试验，无人体受试者）。
本表仅作对标完整性声明：所有 25 条目 N/A，理由同 §1 核心定位。

## 4. 等价物清单（FAR-Lab 的"报告规范"）

| 报告要求 | FAR-Lab 落地 | 证据 |
|---------|-------------|------|
| 验证方法披露 | R0-R9 规则路径 + 五值定义 | docs/concepts/verdict.md |
| 证据分级披露 | GRADE tier + Cochrane RoB | docs/concepts/evidence-grading.md |
| 局限声明 | cannotProve 边界 | paper.md §cannotProve + 10+ design docs |
| 可复现性 | 确定性内核 + suiteIntegrityRoot | determinism.md + 10 次重跑测试 |
| 评估报告卡 | benchmark 30 problems / 28 domains | EA3-evaluation-report-card.md |
| 数据/代码可用 | MIT 开源 + .far-proof 包 | LICENSE + CITATION.cff |

## 5. 本自查表不能证明什么

1. 不构成 SR/CONSORT 合规保证——FAR-Lab 非此类工具；
2. 等价物是**工程类比**，非 PRISMA/CONSORT 原始语义；
3. 期刊投稿时仍须按目标期刊要求复核（不同期刊对"验证工具"的报告要求各异）。

*完成时间: 2026-08-10 · 依据: EG2/EG4 findings + research-integrity.md §3*
