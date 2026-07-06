# copilot-instructions.md — GitHub Copilot agent 入口路由（agent 无关，机器强制）

> 本文件是 GitHub Copilot Chat / Copilot Workspace 的入口路由。权威源是仓库根的 `AGENTS.md` + `AGENT_ENTRY_PROTOCOL.md`。
> 三者（CLAUDE.md / AGENTS.md / 本文件）指向**同一套**协议与机器门，无并行口径。冲突时以 `AGENT_ENTRY_PROTOCOL.md` 为准。

## ⛔ STOP — 写任何代码前

1. 读 `<REPOSITORY_ROOT>/AGENT_ENTRY_PROTOCOL.md`（4 步入口协议 + T0-T8 自检）
2. 读 `<REPOSITORY_ROOT>/PROJECT_PLAN/DEPTH_LEDGER.md` §A（next_action）+ §C（机器可读深度接线表）
3. 读 `<REPOSITORY_ROOT>/AGENT_ANTISKIM_TRIPWIRES.md`（逐条 skim 模式 + 机检钩子）

## 单一真实依赖门

开工前必须能填：

```
single_real_dependency: <真实 SymPy 调用 | 真实 DashScope HTTP | 真实 venv 子进程 | 真实哈希重算 之一> @ <src/file:line>
proof_test: <RED→GREEN 测试文件路径 + 测试名 + 它断言的真实依赖（非 FakeBackend、非硬编码 metric）>
```

填不出 = 你在做浅事（重跑测试 / 改文档 / 补同义反复测试 / 给已绿桩加测试）= STOP。

**PROGRESS ≠ `pnpm test` 全绿**（套件已绿且约 25% 同义反复，再绿 = 零进度）。
**PROGRESS = 一个生产调用方在真实输入上驱动了此前孤立的逻辑 + 一条此前 RED、现在只在真实路径上 GREEN 的端到端测试。**

## 机器强制（不依赖 Copilot 配置）

- `scripts/depth_gate.mjs` 是 CI required job —— 任何不带真实深度接线的 PR 都 exit 1，与 IDE / agent 无关。本地复跑：`node scripts/depth_gate.mjs`（须 exit 0）。
- depth_gate 在 CI 复跑：proof_caller 行真被改、proof_test 存在且测试名匹配、RED→GREEN 双跑物证（base 须 FAIL，HEAD 须 PASS）。撒谎 = PR exit 1。
- §C `status` agent 只能写到 `WIRED_RED`，`WIRED_GREEN` 由 CI 双跑物证 bot 写回。禁手填 WIRED_GREEN。

完整协议、T0-T8 自检、项目红线见 `AGENTS.md` + `AGENT_ENTRY_PROTOCOL.md` + `CLAUDE.md`。
