# Adversarial Review — AVO Fusion 确定性模块 (2026-08-24)

审查方式：Santa 双审查者委派因子 agent 路由 402 余额不足失败（transcript 存档），改为主 Agent 自查 + 生产数据实证。覆盖 deleg_48e4a078/deleg_318a7f99 的全部提纲问题。

## 发现列表

**[P1] supervisor.ts:147 — unproductive_cycle 检测依赖 note.detail.fingerprint 字段，但生产代码从不写该字段**
实证：far.db 全历史 `note` 事件中含 fingerprint 的数量 = **0**；grep 全仓无任何生产写入点。
后果：该信号在生产中永不触发（死代码路径），测试通过是因为测试自己伪造了 fixture 字段。
修复建议：改为消费真实存在的信号源——iteration.ts 的 snapshot.fingerprint 已持久化于 iteration 对象与 meta 表（`iter:fp:<runId>`），或直接对比相邻两次 supervisor 观测间的 objects 计数变化。属漏报类缺陷（不崩溃但能力为空）。

**[P1] lineage.ts:70 — listRuns(1000) 硬上限会静默丢弃祖先/后代**
walkUp 从 root 向上找 parentRunId：若祖先不在前 1000 条内，family 集合缺节点且无任何告警——谱系图静默不完整，违反"谱系可查询可恢复"的承诺。
修复建议：沿 parentRunId 链逐级 getRun()（每跳一次索引查询），天然无上限且免全表扫描；或至少在截断发生时输出 truncated 标志。

**[P2] exploration-runner.ts:91 — inputHash = sha256(gate.codeHash) 是双重哈希**
gate.codeHash 已经是 sha256(code)；再哈希一次导致 receipt.inputHash 无法用 `sha256(code)` 直接核对（provenance.ts 的语义是输入原文哈希）。复核者需知道实现细节才能验真，削弱 receipt 可审计性。
修复建议：inputHash 直接取 gate.codeHash。

**[P2] supervisor.ts — msSinceLastEvent 用 Number.MAX_SAFE_INTEGER 表示"无事件"**
JSON 序列化安全（< 2^53），但 API/前端消费方拿到 9e15 需自行判断含义。
修复建议：可空字段 + lastEventType=null 已有，保持现状可接受；记录为已知约定。

## 明确无问题的项
- ✅ 循环保护：lineage walkUp/walkDown 均有 family.has 守卫，parentRunId 成环不会死循环（lineage.ts:82-93）
- ✅ 只读不变量：supervisor/evaluators/lineage 三模块 appendEvent/putObject 调用数为 0（grep 实证）；唯一写入在 orchestrator 的 observation note（447 行）
- ✅ 新 run 无误报风险升级：createRun 即写 run_created 事件，msSinceLastEvent=0，stalled_horizon 不触发；MAX_SAFE_INTEGER 仅在人为删除事件时出现
- ✅ repeated_failure 无漏报：signature 全不同时 dominant.count < 3 正确不触发；同 signature ≥3 正确触发（测试覆盖）
- ✅ evaluators 空状态：所有 evaluator 对 0 hypotheses/claims 显式 warn + 说明文案，不崩溃不误报 fail
- ✅ counter-evidence 一等事实：lineage counter_evidence 边独立成边类型；evaluators evidence_balance 对全 supporting 关系 warn（确认偏置守卫）

## 处置
P1×2 与 P2×1 修复列入下一批（TDD：先补失败测试再修）；P2 序列化约定记录即可。
