# Evidence Grading — GRADE 证据质量层（阶段 7 P0-11 接线 + EG1-1 文档化）

> 本文档是证据质量层（`src/evidence_quality/`）的权威说明：tier 定义、与五值 verdict 的关系、
> 升降级因子、以及本层**不能证明什么**（AGENTS.md §7 诚实边界）。

## 1. 这是什么

证据质量层是 **verdict 的透明元数据层**——借鉴 GRADE / Cochrane RoB 的确定性评分：

- `gradeEvidenceTier(studyDesign)`：研究设计 → 证据层级（tier 1-4，纯函数）
- `assessRoB(assessments)`：Cochrane RoB 7 维聚合（缺省维度按 unclear，fail-conservative）
- `gradeEvidenceQuality(studyDesign, robAssessments)`：tier 主轴 + RoB 修正 → overall 等级

**接线路径**（阶段 7 P0-11）：`orchestrator.fecAppendClaim` 接受可选 `studyDesign` / `robAssessments`
→ 透传 `buildVerdictKernelInput` → kernel 输出 `evidenceQualityTier` / `evidenceQualityNote`
→ 落 `verdict_trace_json`（verdict_trace_hash 自动绑定·篡改可检）→ report 的 Verdict nodes 段渲染。

## 2. Tier 定义（GRADE 借鉴·确定性映射）

| Tier | StudyDesign | 含义 | 例 |
|------|-------------|------|----|
| 1 | `rct` | high（随机对照试验） | 随机分组 + 盲法 + 预设终点 |
| 2 | `quasi_experimental` | moderate（准实验/队列） | 干预前后对比 / 队列研究 |
| 3 | `observational` | low（观察性/病例对照） | 横断面 / 病例对照 |
| 4 | `case_report` / `expert_opinion` / `unspecified` | very low（病例报告/专家意见/未声明） | 未声明设计一律 tier 4（fail-conservative） |

## 3. tier 与五值 verdict 的关系（关键·勿混淆）

```
证据质量层（tier/overall）  ≠  verdict（CONFIRMED/REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED）
```

- **tier 不进 verdict 判定**：R0-R9 决策树完全不读 tier——`CONFIRMED` 可能来自 tier 4 证据
  （如文献投票路径），`UNTESTED` 与 tier 1 证据可并存（如 FEC 编译失败）。
- **tier 不进 proofHash**：proofHash 白名单（VC 字段）不含质量元数据——proofHash 语义 = 裁决
  确定性可重放，不随证据质量标注变化。
- **关系是「并行展示」而非「因果」**：评委应同时读 verdict（裁决）+ tier（证据强度）+ note（RoB 摘要）
  三列；单看 verdict 会丢失证据强度信息，单看 tier 会丢失裁决方向信息。
- **可选透明层**：调用方不传 studyDesign → 输出与历史完全一致（零回归·向后兼容）。

## 4. 升降级因子（RoB 修正·确定性规则）

| Tier | 条件 | 结果 |
|------|------|------|
| 1 | 低风险 ≥5 维 | high |
| 1 | 高风险 ≥2 维 或 未明 ≥3 维 | low |
| 1 | 其余 | moderate |
| 2 | 低风险 ≥4 且无高风险 | moderate |
| 2 | 其余 | low |
| 3/4 | 高风险 ≥1 或 低风险 <3 | very_low |
| 3/4 | 其余 | low |

未评估维度一律计入 unclear（fail-conservative：缺数据按最差处理）。

## 5. 本层不能证明什么（cannotProve·AGENTS.md §7）

1. **不能证明证据真实**：tier 只评分「设计强度」——造假数据（theater）由 anti-theater 23 检测器
   与哈希链防篡改负责，不由本层负责。tier 4 且 overall=very_low 的 CONFIRMED 是诚实的
   「低强度证据下的有界支持」，不是「低强度=不可信」的暗含判定。
2. **不能做跨研究 meta 合成**：本层是单 claim 评分——多研究加权合成是 V2 项。
3. **不能替代专家评审**：tier 是机械规则（确定性）——领域专家对特定研究设计的判断
   （如某观测性研究因独特自然实验设计实际强度高）不在本层表达范围内。
4. **未声明设计 = tier 4（fail-conservative）**：调用方不提供 studyDesign 时质量标注不出现
   （不是 tier 4）——「没有标注」与「tier 4」语义不同：前者是未接线，后者是明确最差。

## 6. 调用约定

```ts
// 实验路径（orchestrator）
fecAppendClaim(db, { ..., studyDesign: 'rct', robAssessments: [{ domain: 'sequence_generation', risk: 'low' }] });
// 文献投票路径（agent_loop）：不传（文献非实验·无设计声明·诚实缺省）
```
