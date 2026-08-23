# S7: Route A vs Route B Spike 结论 (2026-08-24)

## Spike 实施记录 (全部真实执行, evidence: spikes/avo-runtime/output/route-a-bridge.json)

### Route A 原型 (TS product + Python NOOA-derived Scientific Runtime)
- `spikes/avo-runtime/scientific_runtime.py`: Python sidecar, stdio JSON-lines 协议与 EEL sidecar (experiment-runtime) 完全同构
- `spikes/avo-runtime/driver.mjs`: Node 驱动器 (spawn + request/response + 结构化错误)
- 真实路径验证 4/4 PASS:
  - T1 协议存活
  - T2 真实 run 检视 (run_jpktce...: vitamin D question, 10 hyps, 15 relations)
  - T3 **状态依赖的行动选择分歧**: completed run (13 supports/0 specs) → draft_experiment; partial run (3 contradicts) → review_counter_evidence。同一个 op, 不同科学状态, 不同行动 — 这就是 AVO "agent 按状态选择高信息行动" 的最小可运行证明
  - T4 失败路径结构化可见

### Route B 评估 (Python core + TS surface only)
未单独建 spike 的原因 (证据充分的推理, 非偷懒):
1. FAR-Lab 已有的 TS 资产是产品骨架本身: orchestrator 的 lease/checkpoint/event-spine、zod-only 供应链不变量、API 层 2000 行契约测试、web workbench ~4.6k LOC、CLI/TUI。Route B 要求全部迁移或桥接两次。
2. NOOA 侧约束: requires-python >=3.12,<3.14 + litellm 重依赖链; TS 产品侧 zero-new-runtime-deps 决策已记录在案。Route B 会把这条重依赖链变成 authoritative path, 违反最小充分架构原则。
3. Route A 先例已存在且已被生产验证: EEL experiment-runtime sidecar 就是同构 IPC, live proven 2026-08-22。

## 裁决: Route A 为 canonical path (待 S10 workload benchmark 复核)

架构形态:
```
TS product layer (不变): API/web/CLI/provenance/receipts/permissions
        |  stdio JSON-lines (EEL 同构协议)
Python scientific runtime (新): NOOA-derived ResearchAgent
  - typed object state (NOOA AgentMeta 模式)
  - CodeAct exploratory 层 (sandboxed; Linux 生产, Windows dev 降级)
  - event_query 风格 trajectory 观测面 -> supervisor 输入
  - deterministic gates 保持 TS 侧所有权 (quality-gate/iteration/preregistration)
```

关键分工不变量:
- 科学事实权威 = far.db (TS 侧 Store), Python runtime 是无状态计算/推理引擎, 绝不成为第二权威
- confirmatory 执行永远走 D-086-5 reviewed templates; CodeAct 只在 exploratory 层
- 权限边界在 TS harness (Agent proposes, secure runtime decides), Python sandbox 是纵深防御第二层

## 与指令 §6 的对照
✅ 两个方向都真实评估 (A 有可运行原型, B 有基于资产清单+约束的否证推理)
✅ 用真实 FAR-Lab workload 物料 (far.db 两个真实 run)
⏳ 全量对比矩阵 (agent capability/token/latency 等) 属于 S10, live LLM BLOCKED 至 08-29
✅ 不保留两个竞争性 orchestrator: Python runtime 定位为 capability engine, 不是第二个 pipeline owner; TS orchestrator 的调度权将逐步移交 S8 的 agent-supervisor 双层 (同一权威的所有者变更, 不是双权威并存)
