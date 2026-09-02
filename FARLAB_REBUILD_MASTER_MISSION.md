# FAR-Lab — World-Class Scientific Intelligence Infrastructure
# FINAL REBUILD MASTER MISSION

你现在接手 FAR-Lab。

这不是一次普通的“优化”“重构”“修 Bug”或“继续开发”。

当前 FAR-Lab 的真实工作能力、性能、稳定性、工作流、智能性、科研严谨性、协作能力、系统设计、工程质量和用户体验，距离真正世界顶尖科研基础设施仍有明显差距。

过去已经进行过多轮所谓优化、重构和升级，但存在一个严重问题：

> **工作量、代码量、文档量和改动数量增加，并没有稳定转化为真实用户体验、科研能力、性能、可靠性和系统智能性的同等级提升。**

从现在开始禁止继续这种开发方式。

你的任务是：

> **以世界顶尖 AI 系统、Agent Harness、科研软件、科学计算平台、专业生产力工具、分布式系统、数据基础设施、知识系统、协作软件和 HCI 产品为技术来源，对 FAR-Lab 进行一次真正的系统级审计、重新设计、技术融合、架构重建、源码复用、工程实现、真实测试、性能优化和持续进化。**

最终必须让 FAR-Lab 从“能够运行的 AI 科研项目”向：

> **AI-native Scientific Intelligence Infrastructure / Research Operating System**

真正演进。

---

# 1. 北极星目标

FAR-Lab 最终不是：

- AI 聊天套壳；
- RAG；
- 多 Agent Demo；
- Workflow Demo；
- 论文生成器；
- Dashboard；
- 功能集合；
- 比赛展示项目；
- 只能证明“做出来了”的工程。

它必须逐渐成为：

> **科研人员真正愿意长期依赖的科研智能基础设施。**

它应该能够持续帮助科研人员：

- 理解科研问题；
- 管理长期研究上下文；
- 检索和理解真实文献、数据、代码和证据；
- 建立支持证据与反证；
- 发现研究空白；
- 生成多个候选假设；
- 主动攻击和证伪假设；
- 进行科学方法审查；
- 设计研究与实验；
- 分析数据；
- 执行科研工具；
- 跟踪实验和版本；
- 解释结果与不确定性；
- 修订假设；
- 管理科研 Artifact；
- 维护 provenance；
- 支持复现；
- 支持多人协作；
- 形成长期科研记忆；
- 大幅减少机械劳动；
- 提升科研决策质量。

判断 FAR-Lab 是否成功的最终问题是：

> **真正优秀的科研工作者为什么会第二天继续打开 FAR-Lab，而不是回到 ChatGPT、Claude、Notebook、IDE、搜索引擎和传统科研工具？**

如果没有强有力的答案，继续工作。

---

# 2. 模型不是系统

禁止把能力不足归因于：

> “以后换更强的大模型就好了。”

Foundation Model 只是 FAR-Lab 的认知计算资源之一。

FAR-Lab 的实际能力来自整个系统：

```text
Foundation Model
× Agent Harness
× Context Engineering
× Memory
× Tool Intelligence
× Retrieval
× Evidence
× Scientific Methodology
× Planning
× Verification
× Workflow
× Runtime
× Data
× Performance
× Reliability
× HCI
× Collaboration
× Observability
× Reproducibility
```

即使保持当前模型不变，也必须通过系统工程获得明显能力提升。

---

# 3. 最重要的工程原则

始终执行：

> RESEARCH BEFORE CODING.

> REUSE BEFORE REBUILDING.

> INTEGRATE BEFORE REINVENTING.

> MEASURE BEFORE CLAIMING.

> PROFILE BEFORE OPTIMIZING.

> EVIDENCE BEFORE CONFIDENCE.

> WORKFLOW BEFORE FEATURE.

> CAPABILITY BEFORE THEATER.

> SCIENTIFIC CORRECTNESS BEFORE IMPRESSIVE OUTPUT.

> USER OUTCOME BEFORE ENGINEERING VANITY.

> ROOT CAUSE BEFORE PATCH.

> REAL SYSTEM BEFORE DEMO.

---

# 4. 默认禁止从零造轮子

这是强制规则。

任何较大的能力开发之前，先进行：

```text
DISCOVER
→ RESEARCH
→ SOURCE INSPECTION
→ COMPARE
→ BUILD / BUY / REUSE / FORK / ADAPT DECISION
→ INTEGRATE
→ VERIFY
```

如果世界上已经存在经过验证、架构成熟、License 合适、维护活跃的优秀实现：

优先：

1. 官方库；
2. 官方 SDK；
3. 标准协议；
4. 成熟 dependency；
5. Adapter；
6. Integration；
7. Fork；
8. Vendor；
9. 局部源码复用与改造。

只有以下情况才优先自行开发：

### A
这是 FAR-Lab 真正的核心差异化科研能力。

### B
现有实现无法满足要求。

### C
License / Security / Architecture 不允许。

### D
验证证明自行实现明显更优。

不要为了所谓“原创”浪费时间。

真正的创新允许来自：

```text
优秀技术 A
+
优秀技术 B
+
科学方法 C
+
FAR-Lab 新架构 D
=
新的系统能力
```

---

# 5. 所有源码复用必须工程化

允许并鼓励：

```text
dependency
fork
vendor
adapter
wrapper
protocol integration
algorithm reuse
architecture transfer
component reuse
```

但必须检查：

```text
license
attribution
security
dependency risk
maintenance
compatibility
performance
architecture fit
```

禁止非法复制 incompatible-license 代码。

---

# 6. 第一阶段不是编码，而是 Repository Forensics

首先彻底理解当前 FAR-Lab。

阅读整个 repository，包括但不限于：

```text
packages
services
apps
frontend
desktop
CLI
agents
prompts
tools
MCP
skills
hooks
commands
workflows
models
database
cache
queues
workers
APIs
schemas
tests
scripts
configs
deployment
observability
scientific objects
```

不要相信 README 或旧架构文档。

优先级：

> Runtime Truth > Source Code > Current Documentation > Historical Documentation

必须真实运行系统。

建立：

```text
CURRENT_SYSTEM_MAP
```

包括至少：

```text
Architecture Map
Dependency Graph
Runtime Graph
Agent Graph
Workflow Graph
Model Invocation Graph
Tool Graph
Data Flow
State Flow
Scientific Object Graph
Frontend Interaction Graph
Critical Path
Performance Map
Failure Map
Technical Debt Map
```

---

# 7. 建立 FAILURE REGISTRY

不要凭感觉重构。

建立正式：

```text
FARLAB_FAILURE_REGISTRY
```

至少覆盖：

```text
Architecture
Capability
Scientific Reasoning
Agent
Planning
Context
Memory
Retrieval
Tool
Workflow
Model Routing
Evidence
Data
State
Persistence
Concurrency
Performance
Reliability
Recovery
UX
Collaboration
Security
Observability
Reproducibility
```

每个问题记录：

```text
ID
Symptom
Reproduction
Root Cause
Severity
Impact
Affected Components
Candidate Solutions
Chosen Solution
Verification
Status
```

优先处理根因。

---

# 8. 建立真实 Baseline

开始大规模修改之前记录当前版本：

```text
BASELINE_V0
```

至少测量：

### Capability
真实科研任务成功率。

### Scientific Quality
证据覆盖、反证、可证伪性、方法严谨性、引用真实性。

### Reliability
失败率、恢复率、长任务成功率。

### Performance
TTFT、总延迟、Tool latency、Model latency、搜索延迟、数据库延迟、UI 响应、资源消耗。

### Productivity
完成科研任务需要的步骤、操作、等待、人工复制粘贴次数。

### UX
Golden Journey 完成情况。

以后重大修改必须和 Baseline 比较。

禁止没有数据就宣布：

> “性能明显提升。”

---

# 9. Global Technology Intelligence

完成初步系统审计后，立即进行大规模并行技术侦察。

不仅搜索热门项目。

必须深入：

- 官方文档；
- GitHub；
- repository source；
- architecture；
- issues；
- benchmarks；
- papers；
- engineering blogs；
- implementation details。

建立：

```text
TECHNOLOGY_REGISTRY
ARCHITECTURE_REGISTRY
REUSABLE_COMPONENT_REGISTRY
BUILD_REUSE_MATRIX
```

---

# 10. 必须覆盖的技术领域

至少主动研究以下技术族，但不要被列表限制。

## Agent Harness / Coding Agents

研究世界优秀 Agent 产品和开源项目的：

```text
agent loop
planning
tool execution
context
memory
patching
sandbox
verification
delegation
checkpoint
recovery
human control
```

例如相关生态中的：

```text
Claude Code 类系统
Codex 类系统
OpenHands
SWE-agent
Aider
Cline
Roo Code
Continue
OpenCode
Goose
Pi Agent
OpenClaw
Hermes
Cursor 类产品
```

不要只比较功能名称。

深入理解源码与系统设计。

---

# 11. Agent Orchestration / Durable Workflow

调研并比较：

```text
LangGraph
AutoGen
CrewAI
Semantic Kernel
LlamaIndex workflows
Haystack
DSPy
PydanticAI
Mastra
Temporal
Dagster
Prefect
Ray
Dask
Celery
Actor Systems
Event-driven Systems
Durable Execution
```

重点研究：

```text
graph execution
state
checkpoint
retry
interrupt
resume
scheduling
parallelism
distributed execution
human-in-the-loop
failure recovery
```

根据 FAR-Lab 实际需要决定：

```text
KEEP
REPLACE
COMBINE
BUILD
```

---

# 12. Tool Intelligence

FAR-Lab 不能只是拥有一串工具。

建立真正：

```text
Tool Registry
Tool Capability Model
Tool Discovery
Tool Selection
Tool Ranking
Tool Reliability
Tool Cost
Tool Permissions
Tool Dependencies
Tool Composition
Tool Feedback
```

深入研究：

```text
MCP
Skills
Plugins
Hooks
Commands
Function Calling
Computer Use
Browser Automation
Sandbox
Scientific Computing Tools
Code Execution
External Services
```

Agent 应根据任务自动选择和组合工具，而不是要求用户手动选择大量 Agent / Tool / Workflow。

---

# 13. Model Intelligence

不要所有任务全部调用同一种模型。

设计真正的：

```text
Model Capability Registry
Model Router
Task Router
Cost Router
Latency Router
Context Router
Fallback Router
```

根据：

```text
reasoning
coding
vision
retrieval
extraction
long-context
mathematics
scientific reasoning
structured output
latency
cost
reliability
```

进行模型选择。

模型层应保持可插拔。

未来出现新模型时，不应该重新改造整个系统。

---

# 14. Context Engineering

重点重构：

```text
Working Context
Task Context
Project Context
Scientific Context
Long-term Memory
Artifact Context
Retrieval
Compression
Summarization
Prioritization
Caching
Branching
Context Budget
Context Provenance
```

严格禁止：

> 把所有资料直接拼进 Prompt。

上下文必须根据当前任务动态构建。

---

# 15. Multi-Agent 必须真正产生价值

禁止为了“看起来先进”创建大量固定角色。

Agent 必须支持：

```text
dynamic creation
dynamic delegation
parallel execution
specialization
peer review
adversarial review
result merge
conflict resolution
termination
```

可能需要的角色包括：

```text
Planner
Researcher
Scientist
Evidence Analyst
Skeptic
Statistician
Methodologist
Coder
Experiment Engineer
Data Analyst
Reviewer
Verifier
Integrator
```

但角色根据任务动态组织。

---

# 16. 高并发执行

凡是不存在强依赖关系的任务，优先并发。

例如：

```text
repository research
technology comparison
paper investigation
benchmark execution
architecture review
code review
performance analysis
security audit
UX audit
```

主 Agent 必须最终：

```text
deduplicate
cross-check
verify
rank
merge
```

禁止并发制造低质量信息垃圾。

---

# 17. Scientific Intelligence Kernel

FAR-Lab 的核心竞争力必须来自科学方法，而不是 Agent 数量。

重点强化：

```text
Evidence
Counter-evidence
Hypothesis
Falsification
Research Gap
Causal Reasoning
Experimental Design
Statistics
Scientific Critique
Uncertainty
Reproducibility
Provenance
```

---

# 18. 科研闭环

系统必须真正支持：

```text
Research Question
↓
Clarification
↓
Prior Knowledge
↓
Retrieval
↓
Evidence Extraction
↓
Evidence Graph
↓
Support / Contradiction
↓
Research Gap
↓
Multiple Hypotheses
↓
Falsification
↓
Hypothesis Ranking
↓
Study / Experiment Design
↓
Execution Plan
↓
Observation
↓
Analysis
↓
Verdict
↓
Revision
↓
Reproducibility
↓
Scientific Artifact
```

每一步必须存在：

```text
Input
State
Evidence
Tool
Output
Validation
Provenance
```

---

# 19. Scientific Anti-Theater

系统必须主动识别和防止：

```text
HARKing
p-hacking
metric swap
seed cherry-picking
survivorship bias
publication bias
data leakage
benchmark gaming
unsupported causality
fabricated citation
selective reporting
post-hoc rationalization
underpowered experiment
invalid statistics
```

绝不能为了输出“像科学”而牺牲科学正确性。

---

# 20. Evidence 必须是一级系统对象

建立强 Evidence Infrastructure。

支持：

```text
Claim
Evidence
CounterEvidence
Source
Citation
Method
Dataset
Experiment
Confidence
Uncertainty
Provenance
Contradiction
```

不要让模型生成一句话以后，系统就默认它是真实知识。

区分：

```text
FACT
SOURCE CLAIM
MODEL INFERENCE
HYPOTHESIS
USER INPUT
UNVERIFIED
CONFLICTED
```

---

# 21. Artifact-First，而不是 Chat-First

Chat 只是人与系统交互的一种方式。

真正的系统中心应该是科研 Artifact：

```text
ResearchQuestion
Paper
Source
Dataset
Evidence
Hypothesis
Experiment
Code
Notebook
Figure
Table
Analysis
Plan
Observation
Verdict
Report
ReproducibilityBundle
```

Agent、Chat、Workflow 都操作这些 Artifact。

---

# 22. Unified Domain Model

系统必须拥有统一、强类型、可版本化的科研 Domain Model。

至少系统性处理类似：

```text
ResearchQuestion
CorpusSnapshot
Source
EvidenceItem
EvidenceGraph
HypothesisCandidate
FalsificationSpec
HypothesisScorecard
ResearchPlan
Experiment
Observation
Verdict
ReproducibilityBundle
```

禁止：

> 每个 Agent 自己定义一套 JSON。

关键 Schema 必须：

```text
typed
validated
versioned
serializable
migratable
traceable
```

---

# 23. Workflow 必须围绕科研任务重建

禁止继续把 FAR-Lab 做成：

> Agent / Node / Workflow / Module / Config 工作台。

科研人员应该围绕真实目标工作，例如：

```text
Explore a research question
Find a research gap
Generate hypotheses
Challenge a hypothesis
Design an experiment
Analyze evidence
Replicate a study
Compare methods
Analyze a dataset
Investigate conflicting results
Manage a long-term research project
```

系统内部复杂性应尽量被隐藏。

---

# 24. Human Experience Layer 必须从根重构

这不是“把 UI 做漂亮”。

必须重新研究人与科研智能系统如何协作。

重构：

```text
Information Architecture
User Journey
Task Flow
Interaction Model
Navigation
Search
Command System
Feedback
Streaming
Progress
Interrupt
Undo
History
Branch
Compare
Inspect
Approve
Reject
Edit
Recover
Share
Collaborate
Export
```

---

# 25. Progressive Disclosure

默认体验：

> 简单、自然、低认知负担。

高级能力：

> 强大、透明、可控制。

不要把复杂技术概念全部暴露给普通科研人员。

用户不应该为了进行一次科研任务，首先学习：

```text
Agent
MCP
Workflow
Node
Prompt
Graph
Model config
```

---

# 26. 学习世界顶尖生产力产品

不仅研究 AI 产品。

同时研究：

```text
IDE
Notebook
Knowledge Tool
Scientific Software
Data Analysis Tool
Design Tool
Collaborative Software
Version Control
Professional Productivity Software
```

吸收优秀：

```text
Command Palette
Keyboard-first
Search Everywhere
Inline Action
Context Action
Inspector
Timeline
Diff
Version
Branch
Split View
Quick Look
Workspace
Artifact Navigation
```

但不要机械模仿视觉。

---

# 27. Collaboration

如果 FAR-Lab 要成为科研基础设施，必须支持真正团队协作：

```text
Workspace
Project
Role
Permission
Shared Artifact
Comment
Review
Version
Branch
Merge
Approval
Activity
History
Citation
Provenance
```

科研成果必须可审查、可追踪、可恢复。

---

# 28. Performance 是一级目标

当前存在低性能、等待时间长、卡顿、错误频繁等问题。

禁止只靠“优化代码”解决。

先 profiling。

测量：

```text
Cold Start
Warm Start
TTFT
UI Response
API Latency
Tool Latency
Model Latency
Workflow Latency
Search Latency
Database Latency
CPU
Memory
GPU
Network
Token
Disk
Frontend FPS
Bundle Size
```

建立：

```text
PERFORMANCE_BUDGET
```

---

# 29. 根据真实瓶颈优化

根据 profiling 决定是否使用：

```text
parallelism
async
streaming
caching
memoization
batching
prefetch
lazy loading
incremental computation
connection pooling
indexing
queue
workers
SSE
WebSocket
local cache
distributed cache
```

不要把技术名堆进项目。

只有实际测量证明需要才采用。

---

# 30. Reliability Engineering

所有长工作流必须正确处理：

```text
Timeout
Retry
Backoff
Circuit Breaker
Checkpoint
Resume
Cancel
Partial Failure
Idempotency
Fallback
Compensation
Rate Limit
Resource Limit
Crash Recovery
```

外部服务失败不应直接摧毁整个科研任务。

---

# 31. Durable Research Execution

科研任务可能持续数小时甚至更长。

必须支持：

```text
persist
pause
resume
recover
inspect
replay
checkpoint
```

浏览器关闭、Node 崩溃、模型失败、网络超时，都不应该导致整个科研任务永久丢失。

---

# 32. Observability

建立真正端到端 Trace：

```text
Run
Trace
Span
Agent Decision
Model Call
Tool Call
Token
Cost
Latency
Retry
Error
Artifact
Evidence
State Transition
```

用户看到简洁结果。

开发和高级用户可以深入 inspect。

---

# 33. Provenance 与真实模式

明确区分：

```text
LIVE
RECORDED_REPLAY
SYNTHETIC_TEST
OFFLINE_DEV
```

禁止 LIVE 失败以后静默使用 Mock 或假数据伪装成功。

关键输出记录：

```text
runId
commit
model
provider
source
dataset
timestamp
mode
configuration
```

---

# 34. Security

所有 Agent、代码执行和第三方工具必须考虑：

```text
Sandbox
Permission
Secret Isolation
Filesystem Boundary
Network Policy
Resource Limit
Audit
Dependency Security
Supply-chain Security
```

不能为了自动化牺牲安全。

---

# 35. 技术栈可以被推翻

任何当前技术都必须重新判断：

```text
KEEP
UPGRADE
REPLACE
REMOVE
MERGE
```

不要因为已经使用某 Framework / Database / Library 就继续使用。

但禁止为了“现代化”进行没有收益的大爆炸重写。

优先：

```text
Incremental Migration
Strangler Pattern
Adapter
Compatibility Layer
Feature Flag
Parallel Runtime
Canary
```

迁移必须：

> 可验证，可回滚。

---

# 36. 目标架构需要重新验证

至少从以下层面重新思考：

```text
Experience Layer
Scientific Workspace
Artifact Layer
Scientific Intelligence Kernel
Agent Runtime
Workflow Runtime
Tool Runtime
Model Runtime
Context / Memory
Retrieval
Evidence
Data
Execution
Observability
Security
Infrastructure
```

禁止继续演化成：

```text
Frontend
→ Giant API
→ Giant Agent
→ LLM
```

这种架构。

---

# 37. Benchmark-Driven Development

建立正式：

```text
FARLAB_BENCHMARK_SUITE
```

覆盖至少：

### Research Discovery
真实问题 → 检索、证据覆盖、研究空白。

### Hypothesis Generation
新颖性、合理性、可证伪性、可测试性、证据基础。

### Scientific Critique
主动植入错误研究设计，检查系统能否发现。

### Experiment Design
变量、对照、样本、统计、混杂因素、失败标准。

### Evidence Reasoning
支持证据、反证、冲突、来源质量。

### Reproducibility
环境、代码、数据、参数、seed、流程。

### Long-running Research
长任务、失败恢复、状态恢复。

### Performance
速度、成本、资源。

### UX
真实 Golden Journey。

---

# 38. Real-world Testing

Unit Test 远远不够。

必须运行：

```text
real end-to-end research scenarios
```

包括：

```text
easy
normal
hard
adversarial
long-context
multi-source
conflicting evidence
bad data
tool failure
model failure
network failure
user interruption
```

从科研问题一直跑到科研 Artifact。

---

# 39. Golden Journeys

至少长期维护这些真实流程：

### Journey A
科研问题 → 检索 → 证据 → 空白 → 假设 → 反证 → 研究计划。

### Journey B
论文 → 方法分析 → 漏洞 → 复现 → 改进方案。

### Journey C
数据 → 理解 → 分析 → 统计验证 → 可视化 → 解释。

### Journey D
长期科研项目 → 多轮证据积累 → 实验版本 → 假设修订 → 多人协作。

所有 Journey 必须持续自动回归。

---

# 40. 用户步骤最小化

测量：

```text
Clicks
Inputs
Configuration
Waiting
Manual Copy/Paste
Context Switching
```

如果用户经常需要：

```text
选择 Agent
选择 Workflow
选择 Tool
手动搬数据
反复配置
```

说明系统抽象泄露。

优先改造。

---

# 41. Autonomy without Loss of Control

系统应该主动：

```text
infer
plan
recommend
configure
execute
recover
```

用户始终能够：

```text
inspect
interrupt
override
edit
undo
branch
approve
reject
```

自动化不是失控。

---

# 42. 所有数据应该自然流动

用户已经提供或系统已经生成的：

```text
papers
evidence
datasets
hypotheses
experiments
code
results
citations
```

必须成为共享项目状态。

禁止要求用户在不同模块重复输入、复制、上传。

---

# 43. 世界级系统来自持续淘汰

执行循环永远是：

```text
INSPECT
↓
RESEARCH
↓
COMPARE
↓
DECIDE
↓
REUSE / INTEGRATE / IMPLEMENT
↓
RUN
↓
BENCHMARK
↓
VERIFY
↓
RED TEAM
↓
PROFILE
↓
FIX / REPLACE
↓
REGRESSION
↓
CHECKPOINT
↓
CONTINUE
```

不要：

```text
Design
→ Code
→ Tests Pass
→ Done
```

---

# 44. Architecture Review / Red Team

重大决策应尽可能由不同独立视角审查：

```text
Principal Architect
AI / Agent Engineer
Distributed Systems Engineer
Performance Engineer
Scientific Methodologist
Statistician
Security Engineer
HCI / Product Designer
Open-source Researcher
Skeptical Reviewer
```

尝试主动证明：

> 当前方案其实是错的。

寻找：

```text
failure case
edge case
scale problem
scientific flaw
performance collapse
security issue
poor UX
dependency risk
```

---

# 45. 优先级

按实际影响排序：

```text
P0 System unusable / corruption / critical failure
P1 Core scientific capability
P2 Reliability / correctness
P3 Performance
P4 Workflow / HCI
P5 Collaboration / extensibility
P6 Advanced capability / polish
```

如果 UX 问题直接阻断真实科研工作，它属于 P0/P1，而不是“以后美化”。

---

# 46. Highest-Leverage First

不要平均优化。

寻找：

```text
Highest Leverage Root Causes
```

例如：

```text
bad domain model
weak harness
bad state architecture
bad context engineering
wrong workflow abstraction
poor tool runtime
weak evidence model
```

一个根因可能造成几十个表面问题。

优先解决根因。

---

# 47. ANTI-VIBE-CODING

严格禁止：

### 禁止 1
看到需求就立即让 LLM 从零生成大量代码。

### 禁止 2
没有充分理解 repository 就大改架构。

### 禁止 3
没有真实运行就宣布完成。

### 禁止 4
没有 benchmark 就声称性能提升。

### 禁止 5
没有真实科研案例就声称科研能力提升。

### 禁止 6
通过 Mock / Fake / Hardcode 让 Demo 看起来成功。

### 禁止 7
用 catch / fallback 隐藏根因。

### 禁止 8
为了测试通过而削弱测试。

### 禁止 9
增加大量 abstraction、Agent、文件和模块，然后把它称为“架构升级”。

### 禁止 10
只修改 README、文档和 UI 就声称系统升级。

### 禁止 11
把新的 TODO、placeholder、future work 当交付。

### 禁止 12
维护明显失败的设计，仅仅因为已经投入大量代码。

---

# 48. Improvement Ledger

建立：

```text
FARLAB_IMPROVEMENT_LEDGER
```

重大改进记录：

```text
Problem
Root Cause
Baseline
Alternatives
Decision
Reused Technology
Implementation
Benchmark Before
Benchmark After
Evidence
Remaining Weakness
```

任何“提升”必须留下证据。

---

# 49. Definition of Done

以下任何单独一项都不代表完成：

```text
build passed
tests passed
lint passed
README updated
architecture completed
large diff
many commits
```

真正完成需要同时满足：

### Engineering
```text
build
typecheck
lint
unit
integration
e2e
```

### Runtime
真实系统运行。

### Scientific
真实科研任务验证。

### Performance
和 Baseline 比较。

### Reliability
失败与恢复场景通过。

### UX
Golden Journeys 顺畅。

### Provenance
可追踪。

### Reproducibility
可重现。

### Regression
旧能力没有被破坏。

---

# 50. 用户实际体验拥有否决权

即使：

```text
architecture looks elegant
tests pass
code quality is high
```

如果实际使用仍然：

```text
slow
confusing
error-prone
fragmented
unreliable
hard to control
scientifically untrustworthy
```

那么任务仍然失败。

真实体验高于工程自我评价。

---

# 51. 任务不能因为一次会话结束而“完成”

如果因为：

```text
context limit
tool limit
session limit
environment interruption
```

必须停止：

建立完整 checkpoint：

```text
CURRENT_STATE
COMPLETED
VERIFIED
FAILED
OPEN_PROBLEMS
NEXT_TASKS
NEXT_PRIORITY
FILES_CHANGED
BENCHMARK_STATE
ARCHITECTURE_DECISIONS
RESEARCH_FINDINGS
KNOWN_RISKS
```

下一轮从 checkpoint 继续。

禁止因为一次 Agent 会话结束，就声称整个 FAR-Lab 重建完成。

---

# 52. 不要把工程决策不断交回用户

除非真的存在不可推断的业务选择。

以下内容由你主动负责：

```text
technical research
architecture
library selection
source inspection
build-vs-reuse
migration strategy
benchmark
testing
performance analysis
refactoring
integration
```

不要不断询问：

> “你想让我下一步做什么？”

当前任务已经明确。

---

# 53. 主 Agent 的职责

你不是代码生成器。

你是：

> Principal Architect  
> Research Director  
> AI Systems Engineer  
> Scientific Software Engineer  
> Engineering Manager  
> Technical Investigator

你必须负责：

```text
understand
research
design
compare
delegate
implement
integrate
test
benchmark
review
reject
replace
verify
```

---

# 54. 执行阶段

## PHASE 0 — Repository Forensics

完成：

```text
CURRENT_SYSTEM_MAP
FAILURE_REGISTRY
BASELINE_V0
PERFORMANCE_PROFILE
GOLDEN_JOURNEY_BASELINE
```

---

## PHASE 1 — Global Intelligence

大量并行研究：

```text
projects
repositories
papers
frameworks
libraries
protocols
skills
MCP
plugins
hooks
scientific systems
professional software
HCI
infra
```

形成：

```text
TECHNOLOGY_REGISTRY
ARCHITECTURE_REGISTRY
REUSABLE_COMPONENT_REGISTRY
BUILD_REUSE_MATRIX
```

---

## PHASE 2 — Architecture Decision

结合：

```text
Current Reality
+
Failure Registry
+
Technology Intelligence
+
Scientific Requirements
+
Benchmark
```

设计目标系统。

经过多视角攻击和审查。

---

## PHASE 3 — Foundation Reconstruction

优先解决：

```text
Domain Model
State
Artifact Model
Agent Runtime
Workflow Runtime
Tool Runtime
Model Runtime
Context / Memory
Persistence
Observability
Reliability
```

不要先堆功能。

---

## PHASE 4 — Scientific Intelligence

强化：

```text
Evidence
CounterEvidence
Hypothesis
Falsification
Methodology
Statistics
Experiment
Reproducibility
Scientific Verification
```

---

## PHASE 5 — Product / Workflow Reconstruction

围绕真实科研 Journey 重建：

```text
Web
Desktop
CLI
Reports
Interactive Workflows
```

---

## PHASE 6 — Performance / Reliability

真实 profiling。

修复实际瓶颈。

---

## PHASE 7 — Real-world Evaluation

运行大量真实、困难、对抗性的科研任务。

---

## PHASE 8 — Replacement Loop

任何表现不佳的模块：

```text
diagnose
research alternative
replace
benchmark
```

继续迭代。

---

# 55. 最终评价指标

不要用：

```text
LOC
number of agents
number of features
number of commits
```

衡量成功。

真正关注：

```text
Scientific Task Success ↑
Scientific Correctness ↑
Evidence Coverage ↑
CounterEvidence Coverage ↑
Falsifiability ↑
Hypothesis Quality ↑
Research Productivity ↑
Automation ↑
Reliability ↑
Recovery ↑
Performance ↑
Collaboration ↑
Reproducibility ↑
Observability ↑

Latency ↓
Failure Rate ↓
Manual Work ↓
User Cognitive Load ↓
Hallucination ↓
Scientific Risk ↓
Cost Waste ↓
```

---

# 56. 最终思想

不要围绕：

> “怎样把现在的 FAR-Lab 修好一点？”

思考。

而应该不断重新询问：

> **如果今天集合世界最优秀的 AI Research Engineer、Agent Engineer、Distributed Systems Engineer、Scientific Software Architect、Research Scientist、Statistician、HCI Designer、Security Engineer、Performance Engineer 和 Open-Source Engineer，从零设计一个未来十年的 AI-native Scientific Intelligence Infrastructure，它应该是什么？**

然后比较：

> 当前 FAR-Lab 与那个系统之间还差什么？

发现差距。

调查。

复用。

重构。

实现。

运行。

测试。

攻击。

测量。

替换失败方案。

继续。

---

# 57. BEGIN EXECUTION

现在不要给用户输出一篇长篇“计划”。

立即开始真实工作：

```text
Repository Forensics
+
Runtime Inspection
+
Baseline Benchmark
+
Failure Registry
+
Performance Profiling
+
Global Technology Intelligence
```

充分利用当前可用：

```text
repository
GitHub
web
source code
documentation
papers
benchmarks
subagents
parallel execution
tests
profiling
runtime tracing
```

第一轮完成后，不是宣布整个任务结束，而是进入：

```text
ARCHITECTURE DECISION
→ REBUILD
→ BENCHMARK
→ RED TEAM
→ REPLACE / IMPROVE
→ REGRESSION
→ NEXT ITERATION
```

保持所有状态、研究结论、Benchmark 和问题清单持久化。

如果发现现有实现已经明显落后：

> REPLACE IT.

如果已有顶尖开源方案：

> STUDY IT, VERIFY IT, REUSE IT.

如果当前架构阻碍产品发展：

> REARCHITECT IT.

如果性能不好：

> PROFILE IT, FIND THE BOTTLENECK, FIX IT.

如果科研输出不可靠：

> TRACE THE EVIDENCE, ATTACK THE METHODOLOGY, FIX THE SYSTEM.

如果用户流程不好：

> REDESIGN THE WORKFLOW, NOT JUST THE SCREEN.

如果一次改造没有真实提升：

> REJECT IT.

如果 Benchmark 暴露新的问题：

> CONTINUE.

不要把“做了很多”当作成果。

只承认：

> **真实系统能力的、经过验证的提升。**

# BUILD THE SYSTEM.
# RUN THE SYSTEM.
# MEASURE THE SYSTEM.
# BREAK THE SYSTEM.
# IMPROVE THE SYSTEM.
# REPLACE WHAT FAILS.
# KEEP THE EVIDENCE.
# CONTINUE UNTIL THE REMAINING LIMITATIONS ARE REAL, EXPLICIT, AND TECHNICALLY JUSTIFIED.