# 24_PRODUCT_POSITIONING.md — 最终产品定位

> **来源**：调研优化版 `05_FINAL_PRODUCT_POSITIONING`，并入本主规划作为「多受众产品定位（评委 / 开源 / 论文 / 开发者）」层。命名权威以 `README.md` 最终命名表与 `APPENDIX_F_GLOSSARY.md` 为准；本文件提供面向不同受众的话术版本。

## 1. 最终推荐项目名

- 中文项目名：**真研 FAR-Lab**
- 英文核心系统：**FAR-Chain**
- 中文核心系统名：**可证伪科研证据链运行时**
- 英文副标题：**Proof-Carrying AI Scientist Runtime for Falsifiable Research**
- 缩写解释推荐：**FAR = Falsification-Anchored Research**

说明：当前上传文件已以 FAR-Chain 为最高一致命名；本次不再大改品牌。只把 acronym 解释从普通 “Facilitated/Auditable/Reproducible” 升级为更尖锐的 “Falsification-Anchored Research”。W0 需要统一 glossary，避免双解释混用。

## 2. 备选名称比较

| 候选 | 竞争力 | 可落地性 | 风险 | 最终处理 |
|---|---:|---:|---|---|
| FAR-Chain | 高 | 高 | 需解释不只是 hash chain | 采用 |
| 真研 FAR-Lab | 高 | 高 | 英文传播弱 | 中文品牌 |
| Proof-Carrying AI Scientist Runtime | 高 | 中 | 太长 | 副标题 |
| Scientific Agent Reliability Runtime | 中高 | 高 | 不够 AI4S | 技术报告用 |
| Open Science Proof Package Runtime | 中 | 中 | 过窄 | 第 9 阶段用 |
| Scientific IR Compiler | 中 | 高 | 少了证据链故事 | 模块定位 |

## 3. 一句话定位

**FAR-Chain 让 AI 生成的科研结论携带可审计、可复现、可证伪、可降级的 proof package。**

## 4. 三句话定位

AI Scientist 可以生成假设、代码、图表和论文，但它的科学 claim 往往缺少可验证证据边界。FAR-Chain 把 claim 编译成 FEC 证据契约，绑定数据、代码、运行、统计检验、反证路径和 provenance trace，产出 deterministic five-value verdict。最终第三方获得 `.far-proof` 包，可以在本机验证 hash、trace、verdict 和篡改差异。

## 5. 评委版定位

这是一个面向国产大模型 AI Scientist 的可信科研证据链系统：Qwen 负责生成候选科研假设与计划，FAR-Chain 负责把它们变成可证伪、可审计、可复现的结构化证据包。它把“AI 科研是否可靠”从口头展示变成第三方机器可验证的 proof package。

## 6. 开源社区版定位

FAR-Chain is an open reliability harness and proof package format for scientific agents. It provides SciIR schemas, falsification evidence contracts, provenance/trace adapters, a deterministic verdict kernel, anti-theater tests, and `.far-proof` export for reproducible AI-assisted research.

## 7. 论文版定位

We propose FAR-Chain, a proof-carrying research runtime that compiles AI-generated scientific claims into falsification-anchored evidence contracts and exports auditable research objects. The system unifies claim graphs, provenance events, model/tool traces, dataset/code/run snapshots, deterministic verdicts, and open-science package adapters.

## 8. 开发者版定位

给本地 Agent 的一句话：先别写 AI 科研助手；先实现 `schema -> FEC -> ledger -> verdict -> proof package -> validator` 的最小闭环。所有生成式能力都只能作为输入，不能越过 proof/verdict 层。

## 9. 它不是什么

- 不是普通 RAG。
- 不是普通多 Agent workflow。
- 不是论文生成器。
- 不是文献综述工具。
- 不是“AI 发现新科学”的炫技 demo。
- 不是 LLM-as-judge 科研裁判。
- 不是完整科研 OS。
- 不是保证科学结论为真的证明器。

## 10. 解决的真实痛点

| 痛点 | FAR 解决方式 |
|---|---|
| AI 编造结果 | raw artifact hash + anti-theater missing raw detection |
| 事后调阈值 | FEC/protocol freeze + posthoc threshold flag |
| 选择性报告 | failure/retraction/revision history 一等记录 |
| 证据与结论脱节 | ClaimGraph + EvidenceRecord + SourceAnchor |
| 第三方难复查 | `.far-proof` + validator + HTML/PDF audit report |
| 统计滥用 | StatisticalTestPlan + power/assumption/multiple comparison checks |
| 因果混杂 | CausalAssumption + negative controls + backdoor/path checks |
| API/模型调用不可审计 | ModelCallRecord + OTel-style TraceSpan |

## 11. 为什么是 AI4S

因为它不是通用办公自动化，而是围绕科学 claim、科学数据、实验计划、统计检验、可复现实验、开放科学对象和第三方审计构建。TESS/MAST demo 是真实科学数据场景，FEC 和 proof package 是科学方法的工程化表达。

## 12. 为什么有国家级比赛竞争力

- 与赛题“可验证科学研究假设自动生成”高度贴合。
- 使用 Qwen/百炼 competition profile，但保留模型中立 core。
- 主 demo 选 TESS 公开数据，与赛题天文方向天然匹配。
- 能现场展示“改一个字段，验证失败”的强冲击力。
- 诚实记录 `UNTESTED`/`INCONCLUSIVE`，避免 AI 伪科研。

## 13. 为什么有国际开源潜力

国际 AI Scientist 生态需要一个中立的 reliability/provenance/proof package layer。FAR-Chain 的 schema、validator、anti-theater fixtures 和 proof package 可以被不同 agent 框架、不同学科、不同模型复用。
