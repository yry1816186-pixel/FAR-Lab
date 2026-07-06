# AGENT_ENTRY_PROTOCOL — agent 无关入口协议

> **STOP. 写任何代码之前，按本文件 4 步执行。说不出单一真实依赖就 STOP。**
> 本文件由机器硬门 `scripts/depth_gate.mjs`（CI required job）+ 仓库文件（DEPTH_LEDGER.md / AGENT_ANTISKIM_TRIPWIRES.md / CLAUDE.md / README.md 顶部硬链接）共同强制。任何模型 / 任何窗口 / 任何 IDE 落地即被约束。
> 本文件 **不是建议**——违反会被 CI exit 1 拦在 PR 层（agent 无关），不依赖任何 LLM harness hook / .claude/ 配置。

---

## 为什么本文件存在（30 秒读完）

历史已实测：**所有 agent 接手都陷入「反复跑测试」循环，深度功能停在 DESIGN_LOCKED**。根因（已由 recon 逐条 file:line 证实，2026-07）：
- **绿套件 = 虚假完成信号**：`pnpm test` 全绿与「深度功能已接线」零相关。`decideFiveValueVerdict`（src/falsifiability/verdict_kernel_v2.ts:195）已实现 + 有完整单元测试，CI 全绿，但 src/ 内零 AST CallExpression 生产 caller（grep + AST 复验）。重跑这套件 = 零进度，但 CI 报绿。
- **声称完成无出口门**：任何 agent 写一行注释就能声称 P0-2 done，无机器反馈驳回。
- **去窗口化状态缺失**：每窗口重起 → 无机器可读接线账本 → agent 重新 skim → 选最浅的事（改文档 / 重跑测试 / 补同义反复测试 / 给 stub 加测试）。
- **fecV2 是死分支**：compileFec 在 src/fec/orchestrator.ts:91-98 真实接线，但 `fecV2?`（:59 可选）+ demo_chain.ts:180 不传 → 生产永不触发。TaskList 标 P0-1 completed 与「缺 FEC 不允许 CONFIRMED 在运行时生效」实际不符。

**修复方向不是「劝 agent 深入」，是「把深度项做成 agent 唯一能让 CI 转绿的事」。**

---

## 4 步协议（落地即执行，机械可操作）

### 步骤 1 — 读 DEPTH_LEDGER，定位 `next`

读 `PROJECT_PLAN/DEPTH_LEDGER.md` §A（next_action）+ §C（深度模块表）。取 §C 中第一个 `status ≠ WIRED_GREEN` 行的 `id`，记为本次 `next`。`next` 由依赖序拓扑决定，**禁止跳过**（跳过 = 下游建在空中楼阁 = 零进度）。

**不要读 18 个 PROJECT_PLAN 文件**（信息过载 → 你会 skim）。只读 DEPTH_LEDGER.md + AGENT_ANTISKIM_TRIPWIRES.md。

### 步骤 2 — 用一句话陈述「单一真实依赖」+「证明测试」，否则 STOP

开工前必须能填这两行：

```
single_real_dependency: <真实 SymPy 调用 | 真实 DashScope HTTP | 真实 venv 子进程 | 真实哈希重算 之一> @ <src/file:line>
proof_test: <RED→GREEN 测试文件路径 + 测试名 + 它断言的真实依赖（非 FakeBackend、非硬编码 metric）>
```

填不出 = 你在做浅事（重跑测试 / 改文档 / 补同义反复测试 / 给已绿桩加测试）= **违反协议，立即 STOP**。

判断依据（CLAUDE.md §1 SSOT）：
- **PROGRESS ≠ pnpm test 全绿**。当前套件已绿且约 25% 同义反复，再绿一次 = 零进度。
- **PROGRESS = 一个生产调用方（非测试）在真实输入上驱动了此前孤立的逻辑，AND 一条此前 RED、现在只在真实（非 Fake）路径上 GREEN 的端到端测试**。

### 步骤 3 — 只做 `next` 这一项，不扩散

- 改的每个 file:line 必须与 DEPTH_LEDGER §C 中 `next` 行的 `proof_caller` 相关。
- 「顺手发现的问题」记到 commit message 或 PROJECT_PLAN，**不顺手改**（最小变更，避免模糊扩散）。
- 改完跑**定向**测试（你写的那条 RED→GREEN + 触动到的具体测试），**不要**重跑全量套件找存在感（套件已绿，重跑无信息量；CI 的 depth_gate 才是真门）。

### 步骤 4 — 写「done」前自检（CI 会机器复核，撒谎被 exit 1）

完成 `next` 后，更新 DEPTH_LEDGER §C 该行：`status` 改 `WIRED_RED`（agent 只能写到 WIRED_RED，WIRED_GREEN 由 CI 双跑物证 bot 写回，见 DEPTH_LEDGER §D R7），`closed_by` 填本次 commit sha。

**自检（`scripts/depth_gate.mjs` 会在 CI 复跑，撒谎 = PR exit 1）**：
1. `next` 行的 `proof_caller`（如 `src/fec/orchestrator.ts:116`）在本次 diff 中**确实被改**（CI 会 AST 校验该行的 makeVerdict CallExpression 已被 decideFiveValueVerdict CallExpression 替换）。
2. `proof_test` 指向的测试文件**确实存在**且测试名匹配。
3. 没有把 `proof_test` 写成重跑已绿套件（depth_gate 会校验测试体不含 FakeBackend / 硬编码 metric 字面量，孤立符号补测试会被 WARN）。
4. **RED→GREEN 双跑物证**：CI 在 base commit 跑 proof_test 须 FAIL（非 skip 非 pass），在 HEAD 须 PASS。agent **不能**仅靠测试命名含 `RED_to_GREEN` 标记过关——base 真失败才是物证。

任一自检失败 = 你没有真完成 = **不要写 done**。诚实状态（WIRED_RED / NOT_BUILT）比假 done 更有价值（项目红线：不把 V2/V3 路线写成当前完成）。

---

## §D. 反 skim 自检清单（动手前 + 提交前各勾一次）

- [ ] **T0** 我没有在重跑已绿全量套件找存在感；本次工作驱动了 DEPTH_LEDGER §C 一个具体 id。
- [ ] **T1** 我新写的测试不依赖 FakeBackend / 预制布尔 / 孤立模块（src 内 caller=0 的符号）；被测符号在生产 caller 中以 AST CallExpression 真实出现。
- [ ] **T2** 我没有把 Python/工具缺失环境失败当代码 bug 修；先跑了 `node scripts/ensure_py_deps.mjs`。
- [ ] **T3** 本次 diff 触动了 ≥1 条 DEPTH_LEDGER §C 条目的 `proof_caller` 行；不是纯文档/注释/重命名冒充进度。
- [ ] **T4** 我没有手填 pValue / effectSize / StatisticalResult 字面量；统计由 src/statistics/ 真实算出（不是 `return 0.03` stub）。
- [ ] **T5** 我的进度陈述是 CLAUDE.md §1 允许话术格式（file:line + 真实路径 RED→GREEN 测试），不是「提升覆盖率」类话术。
- [ ] **T6** 我用 DEPTH_LEDGER §B 的 status 四值标签描述功能，没有把 V2/V3 路线写成当前完成（WIRED_GREEN 仅由 CI 双跑物证写回）。
- [ ] **T7** 我没有跳过任何深度门或合理化软规则；本地 `node scripts/depth_gate.mjs` 已跑且我理解它的 exit 1 是 CI 的同款门。
- [ ] **T8（meta）** 我能一句话说出本次工作驱动的单一真实依赖（真实 SymPy / DashScope / venv / hash 之一），并指出 src/ 中改了哪一行让它被生产路径以 CallExpression 调用。说不出来 → 全部 STOP。

逐条的 skim 识别特征 + 正确动作见 `AGENT_ANTISKIM_TRIPWIRES.md`。

---

## §E. 与现有规则的关系

| 工件 | 角色 | 强制力来源 |
|---|---|---|
| CLAUDE.md §0-§5 | 项目铁律（背景/红线/注释最小化/验证策略） | 文件（Claude 默认读；非 Claude agent 经本文件 + README 横幅引导） |
| PROJECT_PLAN/DEPTH_LEDGER.md | 深度接线 SSOT（机器解析） | scripts/depth_gate.mjs（CI required）+ 文件（去窗口化状态） |
| AGENT_ENTRY_PROTOCOL.md（本文件） | 入口协议 + 自检清单 | 文件 + CI depth_gate + 横幅三锚 |
| AGENT_ANTISKIM_TRIPWIRES.md | 反 skim 操作手册（T0-T8 详释） | 文件 + CI depth_gate 的 WARN 检查 |
| scripts/zero_tolerance_scan.mjs 等 4 个 | 扫代码反模式（:any / secret / overclaim） | CI（package.json zero-tolerance） |
| scripts/depth_gate.mjs | 扫接线状态（深度功能 caller / V1 残留 / opt-in 死分支 / GV schema / ledger 诚实） | CI required job（branch protection） |

本文件 agent 无关：不依赖 Claude harness / hook / settings.json。GPT / Cursor / Copilot / 任意 CLI agent 落地即被 CI + 文件约束。

---

*本文件由 16-agent 深度审计（2026-07）+ 三视角治理审计 + 红队三 agent 逃生通道分析落地。修改本文件须经 review，因为 DEPTH_LEDGER.md §C 被脚本解析。*
