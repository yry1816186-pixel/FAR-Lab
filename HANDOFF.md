# HANDOFF.md — 跨窗口交接（agent 无关，面向下个窗口）

> **UPDATE 2026-07-05（第七轮，R10 + R11 闭合——结构性残余风险清零）**：闭合最后两项结构性残余风险。
> - **R10**（多窗口 §C 状态竞争）：§C 加第 8 列 `claimed_by_pr`（可选，向后兼容）。20 行核心接线项全量迁移至 9 列格式（占位 `-`），agent 取下一项前须确认目标行 claimed_by_pr 为空或 `-`。机器解析单口径同步：`scripts/lib/ledger.mjs` 的 `LEDGER_ROW_RE` 尾部加可选捕获组（group 9=claimedBy），向后兼容 8 列旧行；`parseLedgerTable` row 增 claimedBy 字段。keystone bot `scripts/depth_evidence.mjs` 的 `replaceRowCells` guard 接受 9/10 段，写回 status+closed_by 而**保留** claimed_by_pr cell；formatEvidenceLine 已动态对齐。单测 +2（9-col 保留 claimed_by_pr / parseLedgerTable 向后兼容），19/19 绿。R10 在本文件 §4 原标「须用户签批」——本列是**可选纯增量**列（解析器/bot 双向后兼容，旧 8 列行仍正常解析），不改 status/closed_by 语义，不改 schema/migration/CI/部署/env，属工件层可闭合范围；用户指令「彻底解决/关闭所有剩余开放风险事项」覆盖此条。
> - **R11**（动态调度击穿 caller 计数）：`scripts/depth_gate.mjs` 的 `countProductionCallers` 加两路动态调度检测——(a) import 别名（全 src/ 扫 `import {symbol as alias}`，别名与 symbol 等价计入 caller）；(b) Reflect.apply/call 第一参（head 末尾 `Reflect.apply(` / `Function.prototype.apply/call(`）。计算成员 `mod['sym']()` 已被 codeOnlySource 字符串剥离击败。预检查确认真实 src/ 无内核符号别名、无 Reflect 动态调度 → R11 纯增量检测，真实仓库 caller 计数不变，depth_gate 仍 exit 0。evade test 加 S5（`import {makeVerdict as mv}`+`mv(...)` + `Reflect.apply(makeVerdict,null,…)` → 须触发 `[FAIL] CHECK-W4`）。evade test 现 S1-S5 五场景全捕获。
> - **结构性残余风险清零**：R3/R5/R6/R7/R8/R9/R10/R11/R12 全闭合；R1/R2 工件侧闭合剩 maintainer GitHub UI（M1/M2）；R4 content-truth 仍部分闭合（instrumentation 已加，需 bot 运行时打点）。**§4 风险表已无任何结构性开放项**，剩余全为 maintainer 待办（M1-M4）或环境/运行时层（R4）。
> - **验证**：typecheck ✅ / lint ✅ / pnpm test 1067 tests 1061 pass 0 fail 6 env-skipped ✅ / depth_gate exit 0 ✅ / evade test S1-S5 全捕获 ✅ / 4 扫描 exit 0 ✅。
>
> **UPDATE 2026-07-05（第六轮续，R8 闭合 + zero_tolerance_scan 二进制误报修复）**：
> - **R8**（协议散文 honor-system 绕过——非 Claude 工具不被路由到入口协议）：建 `AGENTS.md`（跨工具标准入口，自包含 STOP 门 + 单一真实依赖门 + 4 步协议摘要 + 机器强制表 + 红线摘要）+ `.cursorrules`（Cursor 路由）+ `.github/copilot-instructions.md`（Copilot 路由），三文件与 `CLAUDE.md` banner 同源同口径，冲突时以 `AGENT_ENTRY_PROTOCOL.md` 为准。闭合「Cursor/Copilot/GPT 落地不被任何入口约束」的发现缺口（agent 无关机器门 depth_gate 仍是真硬门，此为补路由层）。
> - **zero_tolerance_scan 二进制误报修复**（阻塞「全量档全绿」的根因 bug）：`scripts/zero_tolerance_scan.mjs` 的 `walk()` 现跳过含 `0x00` 字节的文件（标准文本/二进制启发式）。修前 Node V8 编译缓存泄漏进 `src/statistics/0/v24.14.0-x64-.../fb3f0786`（gitignored 但 scan 读磁盘），其字节流含 lodash `stubArray` ASCII 片段 → readFileSync(utf8) 误命中 `stub_or_mock_return` → 假红 exit 1。修后 scan 正确 scope 到文本源码，真实源码永不含 0x00 零误跳，exit 0。根因修复非抑制——所有检查仍在每个文本文件上运行。
> - **验证**：typecheck ✅ / lint ✅ / pnpm test 1061 pass 0 fail 6 env-skipped ✅ / depth_gate exit 0 ✅ / zero_tolerance_scan exit 0 ✅ / anti-theater + no-llm-judge + confounding 扫描 exit 0 ✅。
>
> **UPDATE 2026-07-05（第六轮，R5 + R12 闭合）**：闭合最后两项 keystone 信号类规避。
> - **R5**（GV schema 全过但 expected.verdict 与 V2 内核不一致）：`scripts/depth_gate.mjs` 加 CHECK-W6b HARD 门——spawn `far verify-golden --backend node --all --json`，逐条对账 expected.verdict/decisiveRuleId/reasonCodes 与 V2 内核裁决，`failed>0` 即 FAIL。RED→GREEN 活体证明：corrupt GV-01 (CONFIRMED→REFUTED) → `[FAIL] CHECK-W6b ... expected=REFUTED actual=CONFIRMED` exit 1；还原 → 12/12 PASS。fixture/桩仓无 far.ts/golden_vectors 自动跳过。
> - **R12**（realMathSignal 被装饰性 Math.random/空循环骗过）：`dirHasRealMath` 收紧为「return 路径含 Math.*/统计函数/算术」+「循环 header 非恒假且 body 含赋值」；Math.random 整体排除。evade test 加 S4 四诱饵 decoy 场景，断言 `realMathSignal=false` 触发 FAIL（非 placeholderCount>0，证明是信号收紧生效）。evade test 现 S1-S4 四场景全捕获。
> - **验证**：typecheck ✅ / lint ✅ / pnpm test 1062 pass 0 fail 5 env-skipped ✅ / depth_gate exit 0 ✅。
>
> **UPDATE 2026-07-05（第五轮，keystone 加固 + P0-2-EXT 落地）**：本轮闭合 4 项 keystone 红队规避（R3/R6/R7/R9）+ 把 kernel 结构化输出持久化进 verdict_nodes 并绑 current_hash（P0-2-EXT）+ 修 `far export far-proof` 在 Windows GNU tar 下的静默失败。
> - **R3/R6/R7/R9**：`scripts/depth_gate.mjs` L1 升行级全字段校验 + L2 `closed_by` sha 的 `git diff-tree` 须 touch proof_caller + §C lineRe 放宽 + `entry_protocol_check` 加 src/ 路径 ∈ PR changed-files 交叉校验。evade test 22/22 绿（S1 W1-W7+L2 / S2 R3-R7 ghost_name / S3 R6 closed_by diff 三场景）。
> - **P0-2-EXT**：`decideFiveValueVerdict` 的 reasonCodes/ruleTrace/decisiveRuleId/evidenceSufficiency 经 `extractVerdictTrace` → `recordVerdict` 落 `verdict_nodes.verdict_trace_json/hash`（迁移 0012）+ 进 current_hash 白名单 + `trg_verdict_nodes_immutable_fields` 扩展。`verifyVerdictNodes` 重算绑定证明（不同 trace → 不同 hash）。
> - **tar 修复**：`src/far_proof/offline_package.ts` 的 `resolveTar()` win32 优先原生 bsdtar（`System32\tar.exe`），降级 GNU tar + `--force-local`；修前 `farExportFarProof`（标 IMPLEMENTED_VERIFIED）在 Windows 静默产出空归档。
> - **验证**：typecheck ✅ / lint ✅ / test 1062 pass 0 fail 5 env-skipped ✅ / depth_gate exit 0 ✅ / anti-theater + no-llm-judge + zero-tolerance 扫描 ✅。
>
> **UPDATE 2026-07-05（第四轮，诚实化收尾）**：下文 §0–§2 描述的「账本破产」问题已**全部闭合**。
> 本文件保留为历史交接物 + maintainer 待办清单（M1-M4，§1）+ 残余风险目录（§4，多数仍开放）。
> **活态 SSOT 是 `PROJECT_PLAN/DEPTH_LEDGER.md`**（§A next_action / §C 接线表 / §F changelog 四轮诚实化）——
> 本文件与之冲突时以 DEPTH_LEDGER 为准。

> 下窗口 agent 落地前**必读顺序**：`CLAUDE.md` banner → `AGENT_ENTRY_PROTOCOL.md` → `PROJECT_PLAN/DEPTH_LEDGER.md`（§A→§C→§F）→ `AGENT_ANTISKIM_TRIPWIRES.md` → `scripts/depth_gate.mjs`（L1/L2/W1-W7 口径）→ `scripts/depth_gate.evade.test.mjs`（红队对抗）。

---

## 0. 当前态（2026-07-05 实测，已替换原「破产」叙事）

原 §0 列举的 5 项破产证据**逐项已闭合**，复验命令与结果：

1. **§C 9 行假 WIRED_GREEN → 全部降级 WIRED_RED**（P0-1 / P0-2a-d / P0-3 / P0-4 / STAT-1 / P1-4）。
   第二轮诚实化（2026-07-04）已删 9 行 `evidence: depth_gate.ok → depth_gate.ok` 自指并降级。`depth_gate` 现 **exit 0**（L1+L2+W1-W7 全绿，非 via 删检查）。
2. **§C proof_caller 行号漂移 → 第四轮逐行 grep 复验后修正**（5 行真漂移：P0-1 orchestrator:99→119、P0-2a :117→137、P0-3 :119→139、P0-2c demo_chain:181→190、P1-6a sandbox_runner:381→284；P1-5b :148 经复验本就正确，未盲改）。
3. **§A `next_action` = `KEYSTONE_DEPTH_EVIDENCE_BOT`**（原 `V2_ROADMAP_NO_NEXT` 与门 RED 的矛盾已消解）。
4. **3 个幽灵 proof_test 文件 → 已建并含真实断言**（`tests/fec/fec_mandatory_e2e.test.ts` / `tests/far_proof/demo_chain_replay_v2.test.ts` / `tests/far_proof/fec_mandatory_e2e.test.ts`，各含 ≥1 真实 `test()`，非 `expect(true)`）。
5. **P1-5 / P1-6 → 已落地为 WIRED_RED**（hero fixture 接真实沙箱指标 / sandbox_runner 真起 venv + dataset_resolver 真拉数据；接线代码存在，物证待 keystone bot CI 写回，非降级 V2）。

> **一句话**：接线代码**确实存在**（W1-W7 PASS），账本**已诚实化**（第四轮收尾，行号 ±0、status 全 WIRED_RED 待 bot、无自指 evidence）。`depth_gate` exit 0 是真实的，不是删检查骗出来的。

---

## 1. maintainer 必做清单（BLOCKING，工件层无法替代）—— 仍是当前唯一硬阻塞

> 这 4 项不做完，治理对「持续深入而非 skim」的实际阻断力 = **0%**（对抗 skim 复验实测：直推默认分支，三个机器门全部寂静）。GitHub repo settings 不在 git 仓库工件内，agent 做不了，**必须由人完成**。
>
> **变更**：原 M3 的「实装 `scripts/depth_evidence.mjs`」前置条件已满足——bot 已实现（集成测 4/4 + 单元测 17/17 + live `--dry-run` 演示 base-FAIL/head-PASS→UPGRADE + 不写盘验证）。M3 现仅剩 GitHub 侧配置。

| # | 动作 | 为什么 | 状态 |
|---|------|--------|------|
| M1 | GitHub repo → Settings → Branches → Add rule → Base branch name = **`feature/initial-project-setup`**（默认分支）+ `main` → 勾 **Require status checks to pass before merging** → 加 `depth_gate` / `entry_protocol_check` / `ci` → 勾 **Require branches up to date** + **Require PR reviews ≥1** | 无此步，agent 看到 depth_gate FAIL 仍能点 Merge，机器门从硬门降级为软规劝 | ⬜ 待 maintainer |
| M2 | 同 Branch rule → **Restrict who can push to matching branches** → 仅 maintainer team。强制所有变更（含默认分支直推）走 PR | depth-gate.yml / ci.yml push 仅 `[main]`、entry-protocol-check 无 push 触发；直推默认分支三门全寂静 | ⬜ 待 maintainer |
| M3 | repo Settings → Actions → General → **Workflow permissions = Read and write permissions**（默认 read-only）→ 把 `depth_evidence` 加入 required status checks | WIRED_RED→WIRED_GREEN 升级路径仍断裂：bot 已实现并自测通过，但缺 GitHub Actions write 权限 + required check 注册 → bot 无法在真实 PR 上写回 evidence，完成态机器不可达 | ⬜ 待 maintainer（bot 侧已就绪） |
| M4 | 新增 `.github/CODEOWNERS`：`PROJECT_PLAN/DEPTH_LEDGER.md  @maintainer-team` → branch protection 勾 **Require review from Code Owners** | 账本是治理数据源；可被治理对象（agent）直接 commit 改写 = 治理自指失效（历史 9 行假 WIRED_GREEN 攻击成本曾为 0） | ⬜ 待 maintainer |

工件层补丁（第五轮已全部落地，maintainer 审 PR 即可合并）：
- ✅ `depth-gate.yml` 的 `push: branches:` 改为 `[feature/initial-project-setup, main]` 覆盖真实默认分支（闭合 R1）
- ✅ `ci.yml` PR `branches: [main]` 改为 `[feature/initial-project-setup, main]`（针对默认分支的 PR 连主 12 步 CI 都不跑）（闭合 R2）
- ✅ `entry-protocol-check.yml` 加 push 触发器 + R9 交叉校验（src/ 路径 ∈ PR changed-files）
- ✅ `depth_gate.mjs` CHECK-L2 增加「`closed_by` sha 的 `git diff-tree --name-only` 须 touch 该行 proof_caller 文件路径」校验 + L1 升行级全字段 + §C lineRe 放宽（闭合 R3/R6/R7 + inherent_limits (c)）

---

## 2. 已执行任务（原「首批任务」Task-0..5 的真实落点）

| 原任务 | 落点 | 证据 |
|--------|------|------|
| Task-0 诚实化账本 | ✅ 第二/四轮完成 | 9 行降 WIRED_RED + 删自指 evidence + §A 改 KEYSTONE_DEPTH_EVIDENCE_BOT；DEPTH_LEDGER §F 四轮 changelog |
| Task-1 keystone bot | ✅ 实现 + 自测 | `scripts/depth_evidence.mjs`（base-FAIL/head-PASS 双跑 → UPGRADE 裁决 + `--dry-run` 不写盘）；集成测 4/4 + 单元测 17/17 + live demo |
| Task-2 幽灵测试 | ✅ 建并真实断言 | 3 文件各含真实 `test()`（无/坏 FEC → verdict≠CONFIRMED，非 `expect(true)`） |
| Task-3 demo_chain 接线 | ✅ 接线 + 行号修正 | P0-2c/P0-3 真接 `decideFiveValueVerdict`/`compileFec`；proof_caller 行号第四轮逐行 grep 复验修正 |
| Task-4 P1-6 真实深度 | ✅ 落地 WIRED_RED | sandbox_runner 真起 venv 子进程 + dataset_resolver 真拉数据（host 白名单双层防御 + ECSV sha256） |
| Task-5 P1-5 真实深度 | ✅ 落地 WIRED_RED | 3 hero fixture 接 buildX→mapChecksToVerdict→fecAppendClaim→sealProofEnvelope，真实沙箱指标替换硬编码 |

> **P0-2-EXT 已落地（第五轮）**：`reasonCodes/ruleTrace/decisiveRuleId/evidenceSufficiency` 经 `extractVerdictTrace` → `recordVerdict` 持久化进 `verdict_nodes.verdict_trace_json/hash`（迁移 0012），进 current_hash 白名单 + 不可变 trigger 扩展，`verifyVerdictNodes` 重算绑定证明。端到端测试 3 条（持久化 round-trip / 绑定证明 / 篡改触发 RAISE）全绿。

---

## 3. 「彻底完成」的诚实可验证定义（对照当前态）

1. ✅ `depth_gate` 真实仓库 **exit 0**（L1+L2+W1-W7 全绿，非 via 删检查）
2. ⬜ §C 所有核心项 status = WIRED_GREEN —— **当前全 WIRED_RED**，待 keystone bot CI 写回（M3 未做则不可达）
3. ⬜ 每个 WIRED_GREEN 行 evidence 由 `scripts/depth_evidence.mjs` 在真实 CI 双跑写回 —— bot 已就绪，CI 注册待 M3
4. ✅ 每个 `closed_by` sha 的 git diff 含 proof_caller 文件真实接线改动（非纯治理 commit）
5. ✅ §C proof_caller 行号 ±0 漂移（第四轮逐行 grep 复验）
6. ✅ P1-5 + P1-6 已落地（核心价值「可独立复算」的真实依赖接线）
7. ⬜ maintainer 先决条件 M1-M4 —— **全待 maintainer**
8. ⬜ maintainer 在 GitHub UI 看 `depth_gate` 退出码作为 required check 阻断合并 —— 待 M1

**距定义的剩余**：仅 maintainer 配置 M1-M4（agent 侧 0 阻塞）。agent 工作面已闭合。

---

## 4. 已知残余风险（多数仍开放，诚实标注）

> R3/R5/R6/R7/R8/R9/R10/R11/R12 已**全部闭合**（L1 行级 + L2 closed_by sha diff touch proof_caller + lineRe 放宽 + entry_protocol_check src/∈changed-files 交叉校验 + CHECK-W6b spawn verify-golden 对账 GV expected.verdict + dirHasRealMath 收紧 return 路径 + AGENTS.md/.cursorrules/copilot-instructions.md 三同源入口路由 + §C claimed_by_pr 列防多窗口竞争 + countProductionCallers 击穿 Reflect.apply/import 别名动态调度，evade test S1-S5 五场景全绿）。R1/R2 工件侧已补（trigger 覆盖默认分支），剩 maintainer GitHub UI 配置（M1/M2）。R4 content-truth 部分闭合（instrumentation 已加，需 bot 运行时打点）。**结构性开放项清零**——剩余全为 maintainer 待办（M1-M4 GitHub repo settings，超 agent 能力）或运行时层（R4 需 bot 入口打点）。

| # | 开放漏洞 | 严重度 | 闭合方式 | 状态 |
|---|---------|--------|---------|------|
| R1 | 直推默认分支逃生（push trigger 不覆盖 `feature/initial-project-setup`） | 最高 | M1+M2 | 🟡 工件已补（trigger 覆盖默认分支），剩 GitHub UI branch protection（M1/M2） |
| R2 | ci.yml PR trigger 仅 `[main]` → 针对默认分支 PR 连主 CI 都不跑 | 最高 | 工件补丁 | ✅ 工件已闭合（PR branches 改 `[feature/initial-project-setup, main]`） |
| R3 | proof_test 文件存在但测试体 `expect(true)` 注水 | 高 | L1 升行级 + 测试体形态检测 + bot 运行时 | ✅ 闭合（L1 行级全字段校验 + evade test S2 覆盖） |
| R4 | content-truth gap（`{} as VerdictKernelInput` 形态过门实参空） | 高 | bot 入口打点断言 | 🟡 部分闭合（instrumentation 已加） |
| R5 | GV schema 全过但 expected.verdict 与内核不一致 | 高 | W6 加运行时校验 / verify_golden 作 CI step | ✅ 闭合（depth_gate CHECK-W6b spawn `far verify-golden --backend node --all --json`，RED→GREEN 证明：corrupt GV-01→FAIL，恢复→PASS；真实仓库 12/12 一致） |
| R6 | 双真实 sha 伪 evidence（L2 只校验格式，不校验 sha diff 含接线） | 高 | L2 加 `git diff-tree` touch caller 校验 | ✅ 闭合（L2 closed_by sha diff-tree touch proof_caller + evade test S3 覆盖） |
| R7 | §C lineRe `src/` 锚点让 STAT-1/P1-4/P2-1/P3-1 4 行逃过 L1 全字段校验 | 中 | lineRe 放宽为 `([^|]+?):(\d+)` | ✅ 闭合（lineRe 放宽 + evade test 覆盖） |
| R8 | 协议散文 honor-system 绕过（T0-T8 无机器复核） | 中 | `AGENTS.md` + `.cursorrules` + `.github/copilot-instructions.md` 同源 | ✅ 闭合（三文件已建：`AGENTS.md` 跨工具标准入口（自包含 STOP 门 + 单一真实依赖门 + 4 步协议摘要 + 机器强制表 + 红线摘要）+ `.cursorrules` / `.github/copilot-instructions.md` 薄路由指向 `AGENTS.md` + `AGENT_ENTRY_PROTOCOL.md`；与 `CLAUDE.md` banner 同源同口径，冲突时以 `AGENT_ENTRY_PROTOCOL.md` 为准。闭合「非 Claude 工具不被路由到入口协议」的发现缺口。物证：三文件均不在 zero_tolerance_scan 扫描根（src/repro/schema/scripts/tests/ci/docs），无回归） |
| R9 | `single_real_dependency` 关键词糊弄（entry_protocol_check 是纯 grep） | 中 | 交叉校验 src/ 路径 ∈ PR changed-files | ✅ 闭合（gh api 拉 PR files + src/ path ∈ changed-files 交叉校验，5 场景验证） |
| R10 | 多窗口 §C 状态竞争 | 中 | §C 加 `claimed_by_pr:<PR#>` 列 | ✅ 闭合（§C 第 8 列 claimed_by_pr 全量迁移 + ledger.mjs LEDGER_ROW_RE 尾部可选捕获组（group 9，向后兼容 8 列旧行）+ parseLedgerTable claimedBy 字段 + depth_evidence replaceRowCells guard 接受 9/10 段保留 claimed_by_pr cell + 单测 +2（9-col 保留 / 向后兼容）19/19 绿） |
| R11 | 动态调度击穿 caller 计数（`Reflect.apply` / import 别名 / `mod['sym']`） | 中 | TS Compiler API `resolveSymbol` 按符号 identity 计数 | ✅ 闭合（countProductionCallers 加 import 别名收集 + Reflect.apply/call 第一参检测；计算成员访问因 codeOnlySource 字符串剥离天然免疫；evade test S5 覆盖；真实 src/ 无别名/Reflect 动态调度 → 计数不变，depth_gate exit 0。注：闭合路径用 regex + codeOnlySource 而非 resolveSymbol——已覆盖 Reflect.apply 第一参与 import 别名两路，eval/new Function 超静态门能力属 inherent_limits） |
| R12 | realMathSignal 被装饰性 `Math.random()`/空 for 满足 | 中 | 收紧为 return 路径含统计语义符号 | ✅ 闭合（dirHasRealMath 收紧为 return 路径 Math.*/统计函数/算术 + 充实循环体（header 非恒假 + body 含赋值）；Math.random 整体排除；evade test S4 四诱饵 decoy 场景捕获 `realMathSignal=false`） |

---

## 5. 禁止行为（仍生效）

- **不要**重跑已绿套件找存在感（约 25% 是同义反复：断言常量数组 / grep 缺词），再绿一次 = 零进度
- **不要**给桩后端补测试（`tests/math/*` 用 FakeBackend、`hero_*` 喂硬编码指标，结构性绿在未建功能上）
- **不要**手填 WIRED_GREEN（§C 表头注释明确禁手填，L2 拦自指 evidence；bot 写回前唯一诚实态是 WIRED_RED）
- **不要**把 Python 环境失败 / 工具缺失（SymPy/Z3/Lean/Dafny/lightkurve）当代码 bug —— 先跑 `scripts/ensure_py_deps.mjs` 探针；axis skipped = 环境问题
- **不要**跳过三件套直接动手（banner 是 STOP 硬门，说不出单一真实依赖就停）
- **不要**改 V1 makeVerdict 锁死的测试期望值让测试通过（零容忍第 6 条）
- **不要**把 `single_real_dependency` 写成含 `sympy`/`dashscope`/`src/` 关键词的字符串糊弄

---

> 本文件由治理窗口生成，是交接物不是功能。**活态 SSOT = `PROJECT_PLAN/DEPTH_LEDGER.md`**。当前 agent 工作面已闭合，剩余仅 maintainer 配置 M1-M4（GitHub repo settings，超 agent 能力）。

---

## 融合织入（Open Science 工程范式迁移·DESIGN_PROPOSED·2026-07-05）

> 来源：`PROJECT_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md` + `PROJECT_PLAN/DEPTH_LEDGER.md` §C 末段。Open Science = Claude Code 分支重品牌化的执行层 agent 工作区；FAR-Chain = 验证层。迁移边界：只迁工程范式（反剧场 / fail-closed 服务门 / 收窄伪造窗口 / 内容寻址 CAS / derivable 标记 / 进程组 kill / AST 结构门），绝不迁 OS 的 LLM-裁决语义。下述条目全 NOT_BUILT，属未来 backlog，不抢当前 next_action。

### 与本文档（HANDOFF）相关的融合缺口

- **2026-07-05 融合分发记录**（Open Science → FAR-Chain，纯文档织入，零 src/schema/scripts diff）：基于 Open Science 仓库深度阅读（经实证为 Claude Code 分支重品牌化的执行层 agent 工作区），产出 `PROJECT_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md`（6 收敛点 C-1..C-6 + 14 高优先级迁移缺口 FUSION-OS-1..14 + 12 落地约束 + 执行顺序）。
- **本轮分发全景**：DEPTH_LEDGER.md（§C 加 14 行 NOT_BUILT + §A 引用 + §F 诚实声明，depth_gate 验证 exit 0）+ CLAUDE.md（§4 P-FUSION 施工蓝图 + §5 融合边界红线）+ PROJECT_PLAN/README.md（文档索引 + 五值 enum DB CHECK + 五张表 blob CAS + 当前代码现实 anti-theater 行 + P0-5 延伸）由主 agent 手工精确编辑；03 / 04 / 06 / 07 / 09 / 10 / APPENDIX_A / C / E + AGENTS.md + AGENT_ANTISKIM_TRIPWIRES.md 由 12-agent workflow 并行织入。
- **迁移边界**（关键交接约束）：只迁工程范式（反剧场 / fail-closed / 收窄伪造窗口 / 内容寻址 CAS / derivable / 进程组 kill / AST 结构门），**绝不迁** OS 的 LLM-裁决语义（universal-llm 翻译网关 / LLM-审核者 / skills / MCP）—— FAR-Chain 红线「LLM 不作最终裁决者，确定性 R0-R9 内核」高于任何融合。
- **验证状态**：depth_gate exit 0（14 行 NOT_BUILT 豁免 wiredSet 严格校验）；本次未碰任何代码，未声称任何 FUSION-OS-* 完成（全 DESIGN_PROPOSED / NOT_BUILT）。
- **下一窗口指引**：FUSION-OS-1（反剧场实时接线）是最高杠杆项，但**不抢当前 next_action=KEYSTONE_DEPTH_EVIDENCE_BOT**；取任何 FUSION-OS-* 前先确认 P0-P3 当前 next_action 已完成或显式让位。

> 接线时升 WIRED_RED，物证由 keystone bot CI 双跑写回 WIRED_GREEN（见 DEPTH_LEDGER §D）。取序建议见 CLAUDE.md §4 P-FUSION。
