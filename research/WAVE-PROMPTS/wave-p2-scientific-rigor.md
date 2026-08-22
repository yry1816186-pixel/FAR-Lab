# Wave-P2 最高执行指令 · 科学严谨性深化（内部升级，承接全部调研 Wave 的科学面产出）

> 使用方式：整份作为 /goal 交给新窗口。共同基线见 `research/WAVE-PROMPTS/_COMMON-BASELINE.md`（粘贴时一并带上）。**建议在 Wave-5/6/9 之后执行**（本 Wave 是其科学面发现的落地载体，也可独立执行既有缓延项）。

## 〇、接续点

**开启 Wave-P2：把 FAR-Lab 的科学性从"诚实披露"推进到"量化可信"。已知科学面残差清单（全部有证据编号，先读对应文件防重做）：①supports/qualifies 粒度边界（盲判 ~62% 上界，relation-precision.md）；②novelty 诚实 hedging vs 呈现不足（mlr-bench.md 差距归因）；③阈值溯源多为 model-stipulated（决策阈值文献依据缺口）；④BT 排名无置信区间（swap 不一致率代理已有，量化未做）；⑤反证席"实质命中"无度量；⑥复现评估判分方差（D-029 缓延）。本 Wave 逐项：先量化现状 → 引入机制（可吸收 W5/W6/W9 的 SCOUT 产出）→ 前后对比 → 对抗审计。**

## 一、工作项（每项独立可验收；按期望值排序，允许依 SCOUT 产出重排）

| # | 工作项 | 现状证据 | 升级方向 | DoD |
|---|---|---|---|---|
| 1 | **证据-假设关系的语义校准** | supports ~62% 上界（粒度边界） | 引入关系判定的锚例集（少量人工标注基准）+ 判分协议收紧 + 复测；或 W5 发现的 citation-grounding 机制 | 盲判一致率提升量化 + 前后对比落盘 |
| 2 | **阈值溯源升级** | decisionRuleProvenance 多为 model-stipulated | 检索域标准阈值（query→领域指南/综述数字→绑定到 spec，provenance=evidence-derived 附来源）；W6 检索机制可复用 | live run 中 evidence-derived 占比提升实测 |
| 3 | **排名不确定性量化** | swap 不一致率已披露，BT 无 CI | bootstrap 置信区间（确定性重采样）入 scorecard/tournament；邻秩可换性从文字变数字 | CI 计算入产物+测试+一次 live 对照 |
| 4 | **反证质量度量** | 反证席存在性有、实质命中无 | 定义"实质反证命中"（judge 确认 top-K 反证关系为 contradicts/weakens 且主题相关）并纳入指标 | 指标定义+历史 runs 回填测量 |
| 5 | **novelty 呈现升级** | hedging 语言压低 judge 评分 | novelty 对象已有的 neighbors 数据渲染为 delta 表述（"相对近邻的增量差异"），产品/导出/eval 渲染三面同步 | mlr-bench 渲染 A/B 复测（同 run 两渲染对比） |
| 6 | **复现评估判分加固** | 同 run 重判 ±0.5（D-029） | 多遍判分取中位 + 固定分解粒度协议（或 W9 采纳的机制） | 重判方差任务级 F1 <0.15 实测 |

## 二、本 Wave 特有警戒
- **不得为指标变好而弱化诚实性**：每个度量升级必须保留原始判分明细与不确定性披露；禁止调 prompt 去"讨好"判分器（那是注水的变体）。
- 科学语义改动（关系判定、novelty 语义、阈值来源）触碰灵魂边界：机制可外取，语义裁定权留在 FAR-Lab 域模型内。
- 每项改动跑完整 live run 验证 + 回归全绿；涉及 eval 口径变化的，新旧口径并报一段过渡期（不静默换尺子）。

## 三、开场序列
| 步 | 动作 | DoD |
|---|---|---|
| 1 | 基线恢复序；status→IN_PROGRESS，phase=wave-p2-scientific-rigor；读六项残差证据文件 + W5/W6/W9 SCOUT（若已存在） | 残差-机制映射表 |
| 2 | 按表逐项执行（可两线并行：1/5/6 为判分线，2/3/4 为管线线） | 每项 DoD |
| 3 | 全量回归 + live 验证 + 对抗审计（重点：诚实性不减） | 审计 PASS |
| 4 | 收口（基线 DoD 全项；新旧口径并报写入证据） | 三处一致，提交成功 |
