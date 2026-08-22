# Wave-9 · EV1 judge 3-seed agreement re-analysis（严格化当年披露）

**Date:** 2026-08-22 · **Command:** `node eval/ev1-judge-agreement.mjs`（零 API 调用，纯录得数据） · **Output:** `eval/results/ev1-judge-agreement.json`

## 背景

EV1 的 3-seed judge 研究（llm-judge-ev1{,-s2,-s3}.jsonl，D-022 审计修正）当时只做了描述性披露："identical-data seed swing ±1-2pts"、"aggregate 3-seed means …NOT per-cell dominance: farlab trails best baseline in 6/18 quality cells, seed-3 quality mean 3.80 < direct 4.20"。Wave-9 统计层（krippendorff ordinal + Wilson）把该披露升级为严格度量。

## 结果（raters=3 seeds，items=5 题×3 系统=15，P5 诚实跳过已排除并记录）

| 维度 | krippendorff α (ordinal) | 3-seed 精确一致 | seed 均值（farlab/direct/rag） |
|---|---|---|---|
| hypothesis_quality | **0.228**（45 对） | 3/15 [0.070, 0.452] | 4.067 / 3.733 / 3.333 |
| counter_evidence_coverage | **0.605**（45 对） | 7/15 [0.248, 0.699] | 2.2 / 1.6 / 1.6（每 seed 精确相同） |

## 解读（诚实）

1. **hypothesis_quality 的 judge 信度不足以支撑细粒度排序宣称**：α=0.228 远低于 Krippendorff 的 0.667 常规可靠门槛；seed-3 的 farlab(3.8) < direct(4.2) 反转不是孤立事件而是该维固有噪声的表现。EV1 的质量维结论只可在 **3-seed aggregate** 级引用（4.07 vs 3.73），任何单 seed 数字不可引用——与 D-022 披露一致，现在有定量背书。
2. **counter_evidence_coverage 是 EV1 最稳的判分维**：aggregate 级完全稳定（三个 seed 的系统均值逐个相同），farlab 的 counter 优势（2.2 vs 1.6）在每个 seed 上都成立；但 item 级仍有 8/15 非精确一致（α=0.605）——per-cell 数字仍应视为方向性。
3. **对 W4-F4（FARLAB_JUDGE_VOTES 多遍中位）的定量动机**：质量维 α=0.228 正是该融合要解决的问题——单遍判分在该维不可靠，N 遍中位 + spread 披露是正确对策；live 恢复后建议 EV1 judge 默认开 N≥3 并以 α 作为运行级信度探头（每次评估输出）。
4. 与 rediscovery 金标发现（lexical-semantic 分离区 [0.124,0.331]）同族：**判分噪声的结构性来源在语义层，不在工程层**——统计层能度量它、投票能压制它，但不能消除它。

## 方法学说明

α 用 ordinal 级（1-5 Likert 的正确等级）；raters=seeds 的语义是"同一 judge 协议的重复运行一致性"（信度），不是"judge-人类准确性"（效度）——后者仍是 D-052 deferred 的 Yale EM-DS 校准线。Wilson 区间因 n=15 而宽，如实呈现。
