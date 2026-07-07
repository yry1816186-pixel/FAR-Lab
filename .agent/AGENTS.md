# AGENTS.md — 跨工具 agent 入口（agent 无关，机器强制）

> 本文件是跨工具标准入口（Cursor / Copilot / GPT / 任意 CLI agent 的统一发现点）。
> Claude 读 `CLAUDE.md`；其他工具读本文件。两者指向**同一套**协议与机器门，无并行口径。
> **权威源是 `AGENT_ENTRY_PROTOCOL.md`（95 行完整 4 步协议 + T0-T8 自检）——本文件是其可发现路由 + 最小 STOP 门，二者冲突时以 `AGENT_ENTRY_PROTOCOL.md` 为准。**

---

## ⛔ STOP — 写任何代码前必读三件套

任何 agent（Claude / GPT / Cursor / Copilot / 其他）落地即被约束。写代码前必读：

1. `<REPOSITORY_ROOT>/AGENT_ENTRY_PROTOCOL.md`（4 步入口协议 + T0-T8 自检）
2. `<REPOSITORY_ROOT>/FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md` §A（next_action）+ §C（机器可读深度接线表）
3. `<REPOSITORY_ROOT>/AGENT_ANTISKIM_TRIPWIRES.md`（逐条 skim 模式 + 机检钩子）

三重硬门由 `scripts/depth_gate.mjs`（CI required job）+ 仓库文件强制。**当前态深度功能未全接线，depth_gate 对任何不带真实接线的 PR 都 exit 1——与你是哪个 agent / 哪个 IDE 无关。** 说不出本次工作驱动的**单一真实依赖**（真实 SymPy / DashScope HTTP / venv 子进程 / 哈希重算 之一）就 STOP，不要动手。

---

## 单一真实依赖门（开工前必填，填不出 = STOP）

```
single_real_dependency: <真实 SymPy 调用 | 真实 DashScope HTTP | 真实 venv 子进程 | 真实哈希重算 之一> @ <src/file:line>
proof_test: <RED→GREEN 测试文件路径 + 测试名 + 它断言的真实依赖（非 FakeBackend、非硬编码 metric）>
```

**PROGRESS ≠ `pnpm test` 全绿**。当前套件已绿且约 25% 同义反复（断言常量数组 / grep 缺词），再绿一次 = 零进度。
**PROGRESS = 一个生产调用方（非测试）在真实输入上驱动了此前孤立的逻辑，AND 一条此前 RED、现在只在真实（非 Fake）路径上 GREEN 的端到端测试。**

禁止话术：「我提升了测试覆盖率」/「测试全绿」/「改进了文档」。
允许话术：「我把 X（file:line）接进了生产路径 Y（file:line），这是 diff 与一条只在真实路径上 RED→GREEN 的测试」。

---

## 4 步协议（摘要，完整版见 AGENT_ENTRY_PROTOCOL.md）

1. **读 DEPTH_LEDGER 定位 `next`** —— 取 §C 中第一个 `status ≠ WIRED_GREEN` 行的 `id`，由依赖序拓扑决定，禁止跳过。不要读 18 个 FAR_LAB_MASTER_PLAN 文件（信息过载 → skim）。
2. **一句话陈述单一真实依赖 + proof_test** —— 填不出 = 你在做浅事（重跑测试 / 改文档 / 补同义反复测试 / 给已绿桩加测试）= 违反协议，立即 STOP。
3. **只做 `next` 这一项，不扩散** —— 改的每个 file:line 须与 §C 中 `next` 行的 `proof_caller` 相关；「顺手问题」记 commit message，不顺手改。改完跑**定向**测试，不重跑全量套件找存在感。
4. **写「done」前自检** —— 更新 §C 该行 `status=WIRED_RED`（agent 只能写到 WIRED_RED，WIRED_GREEN 由 CI 双跑物证 bot 写回）+ `closed_by=<本次 commit sha>`。depth_gate 会在 CI 复跑：proof_caller 行真被改、proof_test 文件存在且测试名匹配、RED→GREEN 双跑物证（base 须 FAIL，HEAD 须 PASS）。撒谎 = PR exit 1。

完整 T0-T8 反 skim 自检清单见 `AGENT_ENTRY_PROTOCOL.md` §D。

---

## 机器强制（不依赖任何 LLM harness / hook / IDE 配置）

| 门 | 作用 | 强制力 |
|---|------|--------|
| `scripts/depth_gate.mjs` | 深度接线状态（生产 caller / V1 残留 / opt-in 死分支 / GV schema 与内核一致 / ledger 诚实 / realMathSignal） | CI required job（branch protection） |
| `scripts/zero_tolerance_scan.mjs` 等 4 个 | 代码反模式（`:any` / secret / overclaim / 空断言） | CI（package.json zero-tolerance） |
| `.github/workflows/entry-protocol-check.yml` | `single_real_dependency` 须含 src/ 路径 ∈ PR changed-files | CI |

本地复跑：`node scripts/depth_gate.mjs`（须 exit 0）。

---

## 项目红线（摘要，完整版见 CLAUDE.md §0-§5）

- 五值裁决枚举**固定**：CONFIRMED / REFUTED / INCONCLUSIVE / DEGRADED_SCOPE / UNTESTED，禁第六值；LLM 不得作最终裁决者。
- **禁手填裸统计数字**（测试数 / 文件数 / CI 通过率 / commit 数）—— 须由命令实时生成。
- **禁手填 WIRED_GREEN** —— §C 表头注释明确禁手填，depth_gate L2 拦自指 evidence；bot 写回前唯一诚实态是 WIRED_RED。
- 禁用词：证明科学真理 / 物理不可篡改 / 完全可复现 / 全自动科学家 / 通用 AI4S benchmark / 裸「第一唯一最新」。
- 不把 V2/V3 路线写成当前完成（状态标签必须诚实）。
- 路径写法用 `<REPOSITORY_ROOT>/` 占位。

---

## 融合织入（Open Science 工程范式迁移·DESIGN_PROPOSED·2026-07-05）

> 来源：`FAR_LAB_MASTER_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md` + `FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md` §C 末段。Open Science = Claude Code 分支重品牌化的执行层 agent 工作区；FAR-Chain = 验证层。迁移边界：只迁工程范式（反剧场 / fail-closed 服务门 / 收窄伪造窗口 / 内容寻址 CAS / derivable 标记 / 进程组 kill / AST 结构门），绝不迁 OS 的 LLM-裁决语义。下述条目全 NOT_BUILT，属未来 backlog，不抢当前 next_action。

### 与本文档（AGENTS）相关的融合缺口

- **融合设计入口**：迁移 Open Science（Claude Code 分支重品牌化的执行层 agent 工作区）工程范式时，必读 `FAR_LAB_MASTER_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md`（6 收敛点 C-1..C-6 + 14 高优先级缺口 FUSION-OS-1..14 + 12 落地约束）+ `FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md` §C 末段 FUSION-OS-1..14（机器可读接线表，全 NOT_BUILT）。
- **迁移边界红线**：只迁工程范式（反剧场 / fail-closed 服务门 / 收窄伪造窗口 / 内容寻址 CAS / derivable 标记 / 进程组 kill / AST 结构门），**绝不迁** OS 的 LLM-裁决语义（universal-llm 翻译网关 / LLM-审核者 / skills / MCP / metadata.yaml agent）—— FAR-Chain 红线「LLM 不作最终裁决者，确定性 R0-R9 内核」高于任何融合。
- **单一真实依赖门不变**：取任何 FUSION-OS-* 项前，仍须说出本次工作驱动的单一真实依赖（真实反剧场检测器调用 / 真实进程组 kill / 真实 AST 扫描 / 真实 hash 重算 之一），否则 STOP。

> 接线时升 WIRED_RED，物证由 keystone bot CI 双跑写回 WIRED_GREEN（见 DEPTH_LEDGER §D）。取序建议见 CLAUDE.md §4 P-FUSION。

---

*本文件是 AGENT_ENTRY_PROTOCOL.md 的跨工具可发现路由，非并行口径。修改须经 review（DEPTH_LEDGER §C 被脚本解析）。*
