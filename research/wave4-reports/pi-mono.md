# Breadth report: badlogic/pi-mono (Wave-4, 2026-08-22)

Source: breadth subagent (Explore) over `.cache/repos/pi-mono` (MIT `LICENSE:1-20`, main-agent license-verified). Subagent delivered overview + Top-5 with verified file:line (full 24-entry table not retrievable from channel; Top-5 claims below are the load-bearing set — spot-verify before fusion).

## Repo overview

MIT. TS monorepo 1151 .ts。pi-ai（40+ provider 统一抽象）→ pi-agent-core（tool-calling + 状态机）→ pi-coding-agent（TUI + extensions）。

## Top mechanisms (subagent-reported, file:line)

| 组 | 机制 | file:line | 要点 | 成本 | FAR-Lab 对照 |
|---|---|---|---|---|---|
| B | 结构化压缩（迭代式 summary 更新） | `compaction.ts:424-498` | 跨压缩保留信息（同 hermes 迭代摘要族） | 中 | 缓延（无多轮会话） |
| G | 两层重试策略（错误分类） | `retry.ts:98-228` | transient vs quota 分层；可直接抄 | 低 | 相关（FAR-Lab W1 纪律已有分层；对照增量：jitter/Retry-After） |
| C | 双限截断+透明度元数据 | `truncate.ts:11-38` | 截断带透明标记（同行业约定族） | 低 | 相关（融合候选 F2 同族） |
| G | schema 化遥测 span 契约 | `telemetry.ts:42-118` | vendor-neutral 观测 | 中 | 部分（receipt 已覆盖核心） |
| E | JSON 可序列化断言（持久化防御） | `session.ts:42-60` | 持久化前断言可序列化，~60 行 | 低 | 部分（store 写入即 JSON 字段） |
| I | 40+ provider 统一抽象 + auth 解析链 | pi-ai 包 | FAR-Lab 已有 models.dev 目录（D-033） | 高 | 已覆盖 |
| J | vitest-evals 集成评估 | evals 包 | 对比集 | 中 | 已有（eval/ 更强） |

## 净结论

pi-mono 与 FAR-Lab 需求重叠最高的仍是 retry/truncation 两族（与 opencode/hermes/smolagents 收敛一致）。其余为 coding-agent 面或已覆盖。
