# S6: FAR-Lab × AVO/NOOA 差距盘点 (2026-08-24, 源码级 FACT)

## FAR-Lab 现有资产 (全部来自本仓库源码阅读)

### 已有且必须保留的科学诚信层 (NOOA 也没有的)
1. **Deterministic iteration controller** (src/app/iteration.ts): 每轮 stage 机完成后确定性地决定 continue/stop；trigger 只认 named falsification-loop legs；stop 于 round_cap/budget/no_material_delta/no_actionable_work。拒绝 unbounded tree search 有记录在案 (data-dredging 论证)。
2. **Run lease** (orchestrator.ts): 跨进程执行所有权，TTL 续租，lost-lease worker 必须中止写入。
3. **Preregistered statistics** (domain/experiment.ts): 分析在 ExperimentSpec 中预注册，verdict 机械地从 decision rule 推导，LLM 永不产生 verdict。
4. **Receipt provenance**: 每个 model call 有 receipt；events 是 append-only audit spine；fail-closed grounding。
5. **Evidence 关系词汇** (domain/evidence.ts): 11 种关系类型含 counter-evidence/negative result ("no counter-evidence found" 必须精确表达为 scoped search record)。
6. **Causal revision chain**: RevisionOperation 带 before/after/reason；VersionDiff 可解释。
7. **Stage-boundary checkpoint/resume + step-level checkpoints** (db v3: family-scoped fingerprints)。

### 与 AVO 原则的核心差距 (按指令 §2-§8 映射)
| # | AVO 原则 | 现状 | 差距定级 |
|---|---|---|---|
| G1 | Agent 拥有探索/variation 调度权 | STAGE_ORDER 12 阶段固定顺序拥有最高调度权；agent loop 只在 stage 内被调用 (refine capability 等) | **P0 核心差距** |
| G2 | Supervisor (停滞/循环/漂移检测+重定向) | iteration controller 是 leg-based 确定性控制器，无停滞检测、无重复失败检测、无方向重定向 | **P0 核心差距** |
| G3 | Lineage = 可查询轨迹图 | parentRunId 线性 revision lineage；无 branch、无 rollback-to-branch、无 trajectory graph 查询 | P1 |
| G4 | CodeAct (受控 code-as-action) | D-086-5 明确禁止向 sidecar 传代码 (只许 JSON 参数)；agent loop 只能单工具 JSON 调用 | **P0 冲突需设计裁决** |
| G5 | Pass-by-reference / live handles | tool result 全量入 transcript 再 microcompact；artifact store 有引用但无 typed live handle | P1 |
| G6 | Tagged event query API + cache-friendly context | events 表存在但无 tag/query API 暴露给模型；transcript 是线性 JSON | P1 |
| G7 | Long-term research memory | 无跨 run 记忆 (会话记忆仅 conversation 级) | P1 |
| G8 | 多维 evaluators 家族 | quality-gate + rank scores 存在；无 information-gain/uncertainty-reduction 显式 evaluator | P2 |

### G4 冲突的设计裁决 (关键)
D-086-5 保护的语义: **confirmatory experiment execution** 必须确定性可复现 (preregistered spec, reviewed template registry)。这与 CodeAct 不冲突——正确的分层是:
- **Exploratory layer** (新引入 CodeAct): 读语料、写分析脚本、组合检索、探索性统计 → 产出 candidate claims/specs，全部带 provenance。
- **Confirmatory layer** (保持 D-086-5): 预注册 spec 只能由 exploratory layer 的产出经 deterministic gate 校验后生成；execution 仍走 reviewed templates。
即: agent 可以自由写探索代码，但不能把代码注入 confirmatory 执行路径。这同时满足 AVO 的 agent 自主性与 FAR-Lab 的统计诚信不变量。

### Route A/B spike 判据 (指令 §6)
- Route A = 现状演化: TS product + NOOA-derived Python scientific runtime (sidecar 协议, EEL 先例)。
- Route B = 重心迁移: Python scientific core + TS 仅作 product surface。
- 真实 workload 对比后才能定 canonical path；最终只允许一个 authoritative orchestrator。

## 结论
FAR-Lab 的科学诚信层是差异化优势 (比 NOOA demo 更严格)，重构目标是**把调度权从静态 stage 机移交给 agent-supervisor 双层结构**，而不是推倒重来。具体形态待 S7 spike 数据支持后定稿。
