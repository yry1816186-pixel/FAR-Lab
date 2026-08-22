# Wave-9 · counter-evidence empty-miss 案例诊断（0.143 的 miss 逐例归因）

**Date:** 2026-08-22 · **Data:** `spikes/output/relation-precision-fullfix.jsonl`（当前管线 7 个 counter 标签关系的盲判 justification 逐例精读，零 API 调用）

## 逐例归因（7 例）

| # | relationId | pipeline→judge | conf | 失败环节 |
|---|---|---|---|---|
| 1 | ev_tc2g… | weakens→unrelated | 0.95 | **席位绑定语义**：claim=T790M 临床时间线，假设=ecDNA 异质性——同主题（EGFR 耐药）不同机制，非反断言 |
| 2 | ev_9dqv… | weakens→unrelated | 0.95 | 同上：AKT3 上调 vs IGF/IGF1R+HSP90-Met 旁路 |
| 3 | ev_7en… | weakens→unrelated | 0.95 | 同上：T790M 发生率统计 vs ecDNA 假设 |
| 4 | ev_51d… | weakens→unrelated | 0.90 | **边界案例**：claim=双耐药克隆无 T790M/Met（替代机制）——与"非突变机制驱动"假设**同方向**但未触及假设的具体机制（ecDNA）；语义上更近 qualifies |
| 5 | ev_5sn… | weakens→unrelated | 0.90 | 席位绑定语义：VEGFR2 协同 vs AKT3/PI3K 假设 |
| 6 | ev_h7v… | **contradicts→supports** | 0.70 | **falsify 标签方向错误**：claim（耐药经替代机制而非特异突变）实际支持"亚克隆多样性"假设，管线标反 |
| 7 | ev_ya6… | contradicts→contradicts ✓ | 0.90 | 真正例：AKT3 敲除不恢复敏感性直接反驳假设 |

## 结构性结论

1. **empty（5/7）的根因是 counter 席位内容与假设特异性的粒度错配**：counter-origin 检索按问题主题取到"同领域文献"，其 claims 与该 run 假设的具体机制不构成反断言。不是检索彻底失败（文献领域正确），是**假设特异反证 vs 主题泛文献的错配**。
2. **inverted（1/7）是 falsify 标签方向错误**——正是 judge-v2 裁决层（3-vote 多数）设计要拦的失败类。
3. 案例 4 属 D-038 语义残差家族（qualifies vs unrelated 边界）。

## 可执行改进设计（counter-evidence-substantive-hit 0.143 → 0.70 路线，W-P2 候选细化）

| 改进 | 面与归属 | 预期作用 | 验证 |
|---|---|---|---|
| **A. counter-seat 定向检索**：检索 query 从假设的 falsification observable/measurement 构造（而非问题主题），让席位文献直接针对假设的可证伪点 | 检索面（retrieve.ts，Wave-6 落地带） | 直接治 empty（5/7 的根因）——席位内容与假设机制对齐 | live 后重跑 relation-precision 盲判，strict ≥0.70 北极星 |
| **B. falsify 方向校验**：contradicts/weakens 断言必须包含与假设预期方向相反的显式陈述（schema 或裁决层约束） | 评估/falsify 面（judge-v2 adjudication 已有基建） | 治 inverted（案例 6 类） | 用本 7 例做回归集（离线即可设计，live 后验证） |
| **C. qualifies 语义归位**：同方向但不触及机制的 claim 归 qualifies 而非 counter | falsify 标签协议 | 减少"假 counter"标签产生 | 同上回归集 |

**诚实边界**：A 需要检索面改动（Wave-6 会话落地带，非本 Wave 权限）与 live 重测；B/C 可离线设计、live 后用本 7 例回归。0.70 目标的主攻是 A。
