# SCIENTIFIC_TRUTH.md — 科研正确性细则

> 读取时机：科研推理、引用、证据链、可证伪性、研究方案设计、假设评分、反馈修订、溯源导出。Kernel 在根 AGENTS.md；本文件定义科研维度的独立验证纪律。

## 1. 软件真相 ≠ 科研真相

- Build Green / Tests Green / UI Works 不等于 Scientific Result Correct。
- 独立验证清单：Citation、Claim、Evidence、Counter-Evidence、Uncertainty、Falsifiability、Research Plan、Revision、Provenance、Reproducibility。
- 科研声明必须标注证据强度；"模型这样说"永远不是来源。

## 2. 来源与引用纪律

- 引用必须有可解析的原始出处（DOI/arXiv ID/官方页面/已核验 PDF），记忆中的引用不算。
- 引用 fail-closed：无法解析的引用必须标记失败并降级说明，不得静默保留。
- 二手转述可作线索，不得作权威；一手来源优先。
- 引用对齐检查：被引文献确实支持所引论断（防"引用存在但内容不符"）。

## 3. 证据与反证

- 每个关键论断同时维护：支持证据、反证、冲突证据、未知边界。
- 主动搜索 counter-evidence / failed replication / negative result / alternative theory / methodological criticism——禁止只找支持材料。
- 证据强度分级：发现 → 来源/规范 → 执行 → 对比证明；弱证据不得表述为确定性。

## 4. 可证伪性与可测试性

- 每条候选假设必须有 FalsificationSpec：什么观测会推翻它？阈值是什么？
- 假设须有可操作的测试路径（数据可得、指标可算、环境可复现）。
- 无法证伪的表述不是科研输出，是观点；如实标注。

## 5. 研究方案可执行性

- 方案必须包含：变量（自变量/因变量/控制变量）、对照组/基线、数据来源、方法、指标、预注册阈值、停止条件、资源、风险、审批/评审点。
- 方案执行前做可执行性检查：每一步的输入输出、失败模式、时间成本（事实估算，非 deadline 话术）。

## 6. 反馈与修订

- 反馈必须因果地改变下一版：上一轮的证据 → 修订了什么 → 为什么。
- 版本比较保留 diff（revision chain）；"改了但说不清改了什么" = 未完成修订。
- 迭代停止条件预定义（收敛、资源上限、专家介入），不无限迭代。

## 7. 溯源与可复现

- 每个输出带 ProvenanceReceipt：输入 → 过程（检索/模型/工具/版本/参数）→ 中间产物 → 输出。
- ReproducibilityBundle：脚本、数据、环境、种子、版本锁定，独立环境可复现。
- 工具运行、模型调用、检索快照全部记录；不可复现的步骤显式标注。

## 8. 科学基准与专家评估

- 基准：任务定义 → 数据集（真实/合成须标注）→ baseline → 指标 → 误差 → 复现。
- 需要专家判断时记录评审者资格、独立性、样本、rubric 与分歧；不可获得合格专家时如实降低证据等级，不虚构人数或共识。
- 基准结果不挑选；异常值解释或报告，不删除。

## 9. 禁止清单

- 虚构 DOI / 论文 / 统计量 / 实验 / 数据集 / 观察 / p 值 / 专家共识。
- memory-as-source：以模型记忆冒充文献。
- weak evidence as certainty：把弱证据写成确定结论。
- unsupported novelty：无对比的"创新"声明。
- fake provenance：伪造来源链。
- 合成/测试数据静默替代实时证据——必须显式标注。
- 为演示美化而裁剪反证或不确定性。

## 10. 与产品验收的映射

- 涉及来源/证据/假设/证伪/计划/修订/provenance/reproducibility 的验收项以本文件为科研验证标准；具体 ID 以当前 `project-spec/ACCEPTANCE.md` 为准。
- 状态词汇与 `.control/ACCEPTANCE_STATUS.json` 一致；科研验证未完成 = 对应项不得超过 tested/live_verified 语义，证据必须绑定实际产物。
