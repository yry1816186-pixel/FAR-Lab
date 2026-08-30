# Held-out cross-domain problem set（封存答案版）

> FA-SCI-04（终局审计：全部评估资产 100% 集中生物医学，EVALUATION.md L7 禁止由窄集声称通用性）。
> 本文件入 git：问题 + 协议 + **封存摘要（salted sha256）**。**答案本身不入 git**（存 `.control/held-out-answers.md`，workspace-only）——评测前任何 agent（含作者会话）不可读答案文本。
> 执行状态：**DRAFTED + SEALED，未执行**（评估波次运行时按本协议跑，产物入 eval/results/ + north-star 台账）。

## Salt

```
salt: farlab-heldout-v1-2026-08-30
```

封存公式：`sha256(salt + "\n" + canonical(answerSummary))`，answerSummary 为定稿时冻结的判定摘要（每题 3-6 句：既定发现、主要反证带、应得的科学状态判定）。评测后开封对照，防"先看答案再跑"。

## 协议（预声明，跑前不可改）

- 每题跑一次完整管线（live 路线，seed/route/prompt version/receipts 全留档，与 W4R 同纪律）。
- 指标（结构与 W4R 一致，跨域可比）：claim 引用可验证率（target 1.0）、反证实质命中（>=0.7）、假设机制可区分数（>=4）、INSUFFICIENT-EVIDENCE 诚实性（凡文献不足以裁决处必须拒绝裁决）、封存答案覆盖度（开封后人工评）。
- 禁止：针对本集修改 prompt/参数（任何改动须先过 prompt-regression 快照并留 DECISIONS 记录）；把本集题目混入开发迭代。

## 问题集（3 非 bio 域 × 2）

| # | 域 | 问题 | 类型 | seal |
|---|---|---|---|---|
| H1 | 材料物理 | Does hydrogen embrittlement of high-strength pipeline steels proceed primarily via the HELP mechanism (hydrogen-enhanced localized plasticity) or HEDE (hydrogen-enhanced decohesion), per the current experimental literature? | contested / mechanism | `sha256:42fafc0afc42c8e856051338321f6e4ede4058573d18de6bf9274a0e1fa3ca11` |
| H2 | 天体物理 | Are repeating fast radio bursts best explained by magnetar flares, and what does the 2020 SGR 1935+2154 concurrent X-ray burst establish or fail to establish about the FRB-magnetar association? | rediscovery / association | `sha256:a89d1c34b5d4405acf9a1b4f3aec657c3d53a397b3a202dba20b468c988a0f32` |
| H3 | 电化学/催化 | In NiFe oxyhydroxide oxygen-evolution electrocatalysts, does the current experimental consensus place the active site at Fe sites, Ni sites, or dynamic Fe/Ni edge sites — and which evidence classes discriminate? | contested / active-site | `sha256:bb36af19c9c7bf88521d31f16431904804a3182a2e9be11cba8b1cba4ff52e48` |
| H4 | 计算化学 | Do machine-learned interatomic potentials trained on ambient water generalize to supercooled and stretched water, and what failure signatures are documented? | boundary-of-validity | `sha256:261d8179b98ee7fb413461765bda3d208aa5eafd739ddb4df953381a0d2abb60` |
| H5 | 劳动经济学 | Does the post-2010 minimum-wage employment literature support monopsony-model predictions over the competitive-model prediction, and on which identification strategies does that conclusion rest? | contested / synthesis | `sha256:7d246525223097e0556cfbaffd14a3e8c3a24c88ff176110c632031cdedd17de` |
| H6 | 能源系统 | Has grid-scale battery deployment in CAISO causally reduced natural-gas peaker utilization, and which quasi-experimental/market evidence carries that inference? | rediscovery / causal | `sha256:d520fbd52fdc11e5f77401d89dccf2fe6f51666b1cd280a8eb54294d04a6cd49` |

## 完成判据（FA-SCI-04 翻 PASS 的条件）

6 题全跑 + 原始产物齐（seed/route/receipts）+ 指标达标或如实未达标披露 + 封存对照开封记录。在此之前本项保持 PARTIAL（软件侧完成，执行待评估波）。
