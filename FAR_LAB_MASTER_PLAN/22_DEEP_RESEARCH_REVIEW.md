# 22_DEEP_RESEARCH_REVIEW.md — 前沿研究综述与技术启发

> **来源**：调研优化版 `03_DEEP_RESEARCH_REVIEW`，并入本主规划作为「前沿研究综述 / 技术启发 / 避免撞车」层。FAR_LAB_MASTER_PLAN 工程骨架不含此综述；它是 `24_PRODUCT_POSITIONING`（差异化）与 `04_PROOF_ENVELOPE_AND_VERIFIER`（PROV/RO-Crate 对齐）的研究依据。

本综述服务于 FAR-Chain 设计，不是链接清单。每个参考都被压缩成：问题、机制、吸收方式、差异化和不能照搬的边界。

## AI Scientist 系统

| 参考 | 解决什么 | 核心机制 | 本项目吸收/差异化 | 不能照搬 |
| --- | --- | --- | --- | --- |
| Google Research / Nature: AI co-scientist | 解决：多智能体科学假设生成与评审机制 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| Sakana AI Scientist-v2 | 解决：端到端 AI 论文/实验代理的能力与风险对比 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| FutureHouse Robin multi-agent scientific discovery | 解决：假设—实验—数据分析闭环对比 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| DeepMind AlphaEvolve | 解决：生成器 + 自动评测器 + 演化循环启发 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |

## Agent 框架与 runtime

| 参考 | 解决什么 | 核心机制 | 本项目吸收/差异化 | 不能照搬 |
| --- | --- | --- | --- | --- |
| OpenAI Agents SDK tracing | 解决：LLM、工具、handoff、guardrails、custom span tracing | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| OpenHands runtime architecture | 解决：sandbox/runtime/REST action observation 启发 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| SWE-agent | 解决：本地自动开发与可配置 agent 实验框架 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| Microsoft AutoGen Core | 解决：event-driven distributed multi-agent runtime | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| Claude Code subagents | 解决：上下文隔离、权限、并行子代理任务拆解 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| Claude Code hooks | 解决：PreToolUse/PostToolUse/Session hooks 对审计触发点启发 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| Model Context Protocol specification 2025-06-18 | 解决：tools/resources/prompts、JSON-RPC、capability negotiation | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| MCP security best practices | 解决：token passthrough/confused deputy/权限与审计风险 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |

## 可复现科研与开放科学

| 参考 | 解决什么 | 核心机制 | 本项目吸收/差异化 | 不能照搬 |
| --- | --- | --- | --- | --- |
| W3C PROV-O | 解决：Entity/Activity/Agent/wasGeneratedBy/used 映射 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| RO-Crate specification | 解决：开放科学研究对象打包 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| Workflow Run RO-Crate | 解决：workflow run provenance 打包 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| DVC | 解决：数据/模型版本控制启发 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| lakeFS | 解决：data lake Git-like versioning | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| Dolt | 解决：SQL 数据库 Git-like 版本控制 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| MLflow tracing/evaluation/tracking | 解决：run/metric/artifact/tracing 管理启发 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |

## Provenance / tracing

| 参考 | 解决什么 | 核心机制 | 本项目吸收/差异化 | 不能照搬 |
| --- | --- | --- | --- | --- |
| OpenTelemetry GenAI semantic conventions | 解决：model/tool spans 对齐 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| PROV-AGENT | 解决：agentic workflow provenance 对 W3C PROV/MCP 扩展 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| OpenAI Agents SDK tracing | 解决：LLM、工具、handoff、guardrails、custom span tracing | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| Model Context Protocol specification 2025-06-18 | 解决：tools/resources/prompts、JSON-RPC、capability negotiation | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |

## Benchmark 与可靠性

| 参考 | 解决什么 | 核心机制 | 本项目吸收/差异化 | 不能照搬 |
| --- | --- | --- | --- | --- |
| ScienceAgentBench | 解决：数据驱动科学发现 agent benchmark | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| CORE-Bench | 解决：可复现性任务 benchmark，困难级 accuracy 低说明可靠性缺口 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| MLR-Bench | 解决：科研 coding agent 伪造/无效实验风险 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| SocSci-Repro-Bench | 解决：复现实验和提示诱导确认性偏差风险 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |

## 天文与科学数据

| 参考 | 解决什么 | 核心机制 | 本项目吸收/差异化 | 不能照搬 |
| --- | --- | --- | --- | --- |
| MAST TESS mission archive | 解决：TESS light curve/TPF/FFI public data | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| Lightkurve | 解决：Kepler/TESS light curve analysis | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| NASA ADS API docs | 解决：文献锚点与引用核验 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |

## 形式化、完整性与篡改可检测

| 参考 | 解决什么 | 核心机制 | 本项目吸收/差异化 | 不能照搬 |
| --- | --- | --- | --- | --- |
| Proof-Carrying Code | 解决：proof-carrying 的机器可检验证据思路 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| RFC 6962 Certificate Transparency | 解决：append-only audit log / transparency log | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| IPFS Merkle DAG | 解决：内容寻址 DAG 与 Merkle root | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| TLA+ | 解决：状态机不变式与早期设计错误发现 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| Dafny reference | 解决：verification-aware programming roadmap | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |

## 统计、因果与测试

| 参考 | 解决什么 | 核心机制 | 本项目吸收/差异化 | 不能照搬 |
| --- | --- | --- | --- | --- |
| Hypothesis property-based testing | 解决：schema/kernel/property tests | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| Metamorphic testing survey | 解决：科学软件 oracle problem 测试策略 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |
| ASA Statement on p-values | 解决：统计显著性边界与 p-hacking 防线 | 机制：见官方/论文；抽象为接口或评测约束 | 本项目吸收：转化为模块、schema、trace 或 demo；不照搬其产品边界 | 限制：不能把对方能力说成本项目已具备；真实效果需复验 |

## 9. 交叉启发：本项目如何借鉴、超越、避免撞车

### 9.1 借鉴

- 从 Co-Scientist / Robin / AI Scientist-v2 借鉴“多阶段科研循环”，但把主贡献放在可信验证层。
- 从 OpenAI Agents SDK / Claude Code / OpenHands / AutoGen / MCP 借鉴 tracing、hooks、subagents、sandbox、permission、runtime event。
- 从 W3C PROV / RO-Crate / WRROC 借鉴开放科学对象与 workflow run provenance。
- 从 RFC6962 / Merkle DAG 借鉴 tamper-evident append-only 结构。
- 从 ScienceAgentBench / CORE-Bench / MLR-Bench 借鉴 benchmark 对 AI 科研 agent 的严苛评测。
- 从 Hypothesis/metamorphic testing/ASA p-value statement 借鉴工程测试与统计边界。

### 9.2 超越

FAR-Chain 的超越点不是比大厂系统更会提出假设，而是在 claim-level 形成 `FEC -> evidence -> verdict -> proof package -> replay` 的篡改可检测链路。它允许第三方推翻 AI claim，这是普通 AI Scientist 演示通常缺失的层。

### 9.3 避免撞车

- 不做通用 AI 论文生成器。
- 不和 Co-Scientist/Robin 比“生成新发现”。
- 不把 OpenTelemetry/PROV/RO-Crate 当 UI 可视化，而是作为 proof package 的可互操作导出。
- 不把 LLM judge 作为科学裁判。
- 不把 benchmark 分数包装成科学正确性。

## 10. 可转化为模块/协议/评测/Demo 的清单

| 来源方向 | 转化模块 | 进入 MVP? | 说明 |
|---|---|---|---|
| OpenAI/OTel tracing | TraceSpan / ModelCallRecord / ToolCallRecord | 是 | 必须记录模型、工具、prompt hash、latency、token、error |
| MCP security | Security/Permission Guard | 是 | 防 token passthrough、confused deputy、越权工具 |
| RO-Crate/WRROC/PROV | Export adapters | 部分 | MVP 先导出结构，外部 validator 路线图 |
| Merkle DAG/RFC6962 | Evidence Ledger | 是 | 本地 tamper-evident，不先做公网透明日志 |
| CORE-Bench/MLR-Bench | FAR-Bench | 是 | 评测可复现、伪结果、claim grounding |
| TESS/Lightkurve | Hero Demo | 是 | 公开数据、评委可理解、真实环境可验证 |
| TLA+/Dafny/Lean | Invariant specs | 路线图 | MVP 只写状态机不变式与 validator tests |

## 11. 来源

- **阿里云天池/挑战杯揭榜挂帅 XH-202619 官方赛题页**：<https://university.aliyun.com/action/tzbjbgs2026>
- **国家天文科学数据中心 XH-202619 赛题说明**：<https://nadc.china-vo.org/article/20250606145916>
- **Alibaba Cloud Model Studio: OpenAI compatibility of DashScope**：<https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope>
- **Alibaba Cloud Model Studio: First API call to Qwen**：<https://www.alibabacloud.com/help/en/model-studio/first-api-call-to-qwen>
- **Google Research / Nature: AI co-scientist**：<https://research.google/blog/accelerating-scientific-breakthroughs-with-an-ai-co-scientist/>
- **Sakana AI Scientist-v2**：<https://github.com/SakanaAI/AI-Scientist-v2>
- **FutureHouse Robin multi-agent scientific discovery**：<https://www.futurehouse.org/research/demonstrating-end-to-end-scientific-discovery-with-robin-a-multi-agent-system>
- **DeepMind AlphaEvolve**：<https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/>
- **ScienceAgentBench**：<https://osu-nlp-group.github.io/ScienceAgentBench/>
- **CORE-Bench**：<https://crab.cs.princeton.edu/core-website/>
- **MLR-Bench**：<https://arxiv.org/abs/2605.04677>
- **SocSci-Repro-Bench**：<https://github.com/malizad/SocSci-Repro-Bench>
- **OpenAI Agents SDK tracing**：<https://openai.github.io/openai-agents-python/tracing/>
- **OpenHands runtime architecture**：<https://docs.openhands.dev/openhands/usage/architecture/runtime>
- **SWE-agent**：<https://github.com/SWE-agent/SWE-agent>
- **Microsoft AutoGen Core**：<https://microsoft.github.io/autogen/dev/user-guide/core-user-guide/index.html>
- **Claude Code subagents**：<https://docs.anthropic.com/zh-CN/docs/claude-code/sub-agents>
- **Claude Code hooks**：<https://docs.anthropic.com/zh-CN/docs/claude-code/hooks>
- **Model Context Protocol specification 2025-06-18**：<https://modelcontextprotocol.io/specification/2025-06-18>
- **MCP security best practices**：<https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices>
- **PROV-AGENT**：<https://arxiv.org/abs/2510.14150>
- **W3C PROV-O**：<https://www.w3.org/TR/prov-o/>
- **RO-Crate specification**：<https://www.researchobject.org/ro-crate/specification>
- **Workflow Run RO-Crate**：<https://www.researchobject.org/workflow-run-crate/>
- **OpenTelemetry GenAI semantic conventions**：<https://github.com/open-telemetry/semantic-conventions-genai>
- **DVC**：<https://dvc.org/doc>
- **lakeFS**：<https://docs.lakefs.io/>
- **Dolt**：<https://www.dolthub.com/docs/sql-reference/version-control/>
- **MLflow tracing/evaluation/tracking**：<https://mlflow.org/docs/latest/ml/>
- **Proof-Carrying Code**：<https://www.cs.princeton.edu/~appel/fpcc.html>
- **RFC 6962 Certificate Transparency**：<https://www.rfc-editor.org/info/rfc6962>
- **IPFS Merkle DAG**：<https://docs.ipfs.tech/concepts/merkle-dag/>
- **TLA+**：<https://lamport.azurewebsites.net/tla/tla.html>
- **Dafny reference**：<https://dafny.org/latest/toc>
- **MAST TESS mission archive**：<https://archive.stsci.edu/missions-and-data/tess>
- **Lightkurve**：<https://lightkurve.github.io/lightkurve/>
- **NASA ADS API docs**：<https://ui.adsabs.harvard.edu/help/api/>
- **Hypothesis property-based testing**：<https://hypothesis.readthedocs.io/>
- **Metamorphic testing survey**：<https://dl.acm.org/doi/10.1145/3143561>
- **ASA Statement on p-values**：<https://www.tandfonline.com/doi/full/10.1080/00031305.2016.1154108>
