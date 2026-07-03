# DEPTH_LEDGER — 跨窗口深度接线账本（agent 无关 SSOT）

> **本文件是 git-tracked 的机器可读 SSOT，不是散文 backlog。**
> 任何 agent（Claude / GPT / Cursor / Copilot / 其他）落地本仓库，先读本文件 §A（取 next_action）+ §C（机器门），再读 <REPOSITORY_ROOT>/AGENT_ENTRY_PROTOCOL.md 与 <REPOSITORY_ROOT>/AGENT_ANTISKIM_TRIPWIRES.md。
>
> **更新规则**：一项只能由「真实接线」推进，不能由「跑绿测试」「改文档」「加注释」推进。每项推进必须更新 §C 表的 status + closed_by + proof_caller + proof_test_red_commit。
>
> **机器校验**：`node scripts/depth_gate.mjs`（见 §D）实时校验本文件 §C 声明的接线与代码一致，校验口径与深度门主检查**完全相同**（AST CallExpression 计数 + 块注释剥离 + 同一文件读），不存在「主门剥注释、ledger 校验不剥注释」的双口径逃逸。该脚本是 CI 必过 job（见 residualRisks：须 maintainer 在 GitHub repo settings 把 ci.yml 的 `depth_gate` job 设为 required status check）。
>
> **生成时间**：2026-07-03，由 recon 一次性填充初始状态（所有 SURFACE-ONLY 由本轮 Read/Grep 实据核实）。

---

## §A. next_action（依赖序 topo，权威，agent 取此字段不要 ad-hoc）

```
next_action = P0-2a
```

理由：
- P0-1（compileFec 接 fecAppendClaim）的代码分支真实存在于 `src/fec/orchestrator.ts:91-98`，但 `fecV2` 仍是**可选**形参（`readonly fecV2?:` at orchestrator.ts:59），唯一生产 caller `src/far_proof/demo_chain.ts:180` 的 `fecAppendClaim({...})` 实参对象（180-226 行）**未含 fecV2 字段**（已 Read 复验）→ compileFec 的 fail-closed 分支在生产永不触发。故 P0-1 在 §C 标 `WIRED_OPT_IN`（接线是死分支），不算完成。
- 深度门 §D 的 CHECK-W1（fecV2 必选 + 实参非空）当前 RED，正是要修的项之一。先做 P0-2a，因为它解锁 P0-3/P0-4/P1-4/P1-5 全部下游。

---

## §B. status 枚举（机器读取的合法值）

- `NOT_BUILT` — 模块/目录/文件不存在。
- `BUILT_UNWIRED` — 已实现 + 有单元测试（CI 绿），但 src/ 内零真实生产 caller（AST CallExpression 计数 = 0，排除 import / 类型注解 / 注释 / barrel re-export）。
- `WIRED_OPT_IN` — 接线是可选参数或死分支，生产 caller 永不触发真实效果。
- `WIRED_RED` — 生产 caller 存在但证明测试仍 RED（未达完成）。
- `WIRED_GREEN` — 真实生产 caller（AST CallExpression）+ CI 双跑物证（base FAIL / HEAD PASS）。**唯一完成态**。

---

## §C. 深度模块接线表（机器解析，schema 严格）

> **机器解析约定**（depth_gate.mjs 解析本表）：每行格式严格为
> `| <id> | <single_real_dependency> | <proof_caller_file>:<line> | <proof_test_path>::<test_name> | <proof_test_red_commit> | <status> | <closed_by_sha> |`
> 任一列缺失或 status 不是 §B 枚举值 → CHECK-L1 失败。
> `closed_by_sha` 仅 status=WIRED_GREEN 时必填；CI 双跑物证（base FAIL/HEAD PASS）由 .github/workflows/depth-evidence.yml 写回本列下方「`evidence: <base_run_id>→<head_run_id>`」行（**禁止 agent 手填 WIRED_GREEN**，见 §D CHECK-L2）。

### 核心接线项（依赖序硬约束，禁止跳过）

| id | single_real_dependency | proof_caller | proof_test | proof_test_red_commit | status | closed_by_sha |
|----|------------------------|--------------|------------|-----------------------|--------|---------------|
| P0-1 | compileFec 经 fecAppendClaim 进生产 verdict（fecV2 形参必选 + 实参非空 FecContractV2） | src/fec/orchestrator.ts:91 | tests/fec/fec_mandatory_e2e.test.ts::missing_or_bad_fec_blocks_confirmed | (待 CI 双跑) | WIRED_OPT_IN | — |
| P0-2a | decideFiveValueVerdict 替换 fec/orchestrator.ts 的 makeVerdict（CallExpression 真实调用，返回值流入 recordVerdict/seal） | src/fec/orchestrator.ts:116 | tests/fec/orchestrator_v2_wired.test.ts::verdict_uses_v2_kernel | (待 CI 双跑) | BUILT_UNWIRED | — |
| P0-2b | decideFiveValueVerdict 替换 verdict_stage.ts 的 makeVerdict | src/agent_loop/verdict_stage.ts:234 | tests/agent_loop/verdict_stage_v2_wired.test.ts::stage_emits_reasonCodes_ruleTrace | (待 CI 双跑) | BUILT_UNWIRED | — |
| P0-2c | decideFiveValueVerdict 替换 demo_chain.ts 的 makeVerdict | src/far_proof/demo_chain.ts:215 | tests/far_proof/demo_chain_replay_v2.test.ts::demo_chain_seals_with_five_value_verdict | (待 CI 双跑) | BUILT_UNWIRED | — |
| P0-2d | decideFiveValueVerdict 替换 render.ts 的 makeVerdict | src/falsifiability/render.ts:26 | tests/falsifiability/render_v2_wired.test.ts::render_emits_evidenceSufficiency | (待 CI 双跑) | BUILT_UNWIRED | — |
| P0-3 | 真实 demo_chain 路径（非 FakeBackend）下无/坏 FEC 的 claim 无法封 CONFIRMED | src/far_proof/demo_chain.ts:180 | tests/far_proof/fec_mandatory_e2e.test.ts::missing_fec_blocks_confirmed_on_real_path | (待 CI 双跑) | BUILT_UNWIRED | — |
| P0-4 | decideFiveValueVerdict 消费 compileFec Plan，替换 isFrozenAndCompilable 的内联 4 字段浅检查 | src/falsifiability/verdict_kernel_v2.ts:526 | tests/falsifiability/kernel_v2_consumes_fec_plan.test.ts::R1_fires_same_condition_as_compileFec | (待 CI 双跑) | BUILT_UNWIRED | — |
| STAT-1 | src/statistics/ 真实 p-value/effect-size/CI/多重校正（非字面量返回） | src/statistics/index.ts | tests/statistics/gv_regression.test.ts::GV-01..GV-12_golden_vector_recompute | (待 CI 双跑) | NOT_BUILT | — |
| P1-2 | executeFallbackChain 接 loop_runner / qwen_vl_adapter，真实 429/5xx/timeout 穿透 | src/llm_gateway/adapters/aliyun_qwen_vl/qwen_vl_adapter.ts | tests/llm_gateway/fallback_real_http.test.ts::real_429穿透_fallback_chain | (待 CI 双跑) | BUILT_UNWIRED | — |
| P1-4 | 12 条 GV 落盘 golden_vectors/cases/GV-01..GV-12.json（含 input.evidences/expected.verdict/expected.reasonCodes schema）+ far verify-golden 真调 decideFiveValueVerdict（非硬编码旁路） | golden_vectors/cases/GV-01.json + src/cli/commands/verify_golden.ts | tests/cli/verify_golden_cross_lang.test.ts::node_python_browser_agree_on_GV | (待 CI 双跑) | NOT_BUILT | — |
| P2-1 | tests/real_backends/ 真实 spawn SymPy/Z3/Dafny/Lean（非 mock，按环境 skip 但 skip 须显式记录 reason） | tests/real_backends/sympy_real.test.ts | (self) | (待 CI 双跑) | NOT_BUILT | — |

> **当前 next = P0-2a**（依赖序拓扑最前的非 WIRED_GREEN 项）。在 P0-2a 完成前，**禁止**取 P0-2b/STAT-1/P1-x（依赖序硬约束；下游建在空中楼阁）。

---

## §D. 机器门（CI 必过 job，agent 无关）

脚本：`scripts/depth_gate.mjs`（已落盘）。CI 集成：`.github/workflows/depth-gate.yml`（独立 job，与 ci.yml 并列，须由 maintainer 设为 required status check）。

门分两类：
- **HARD**（失败 → exit 1，阻断 PR）：接线门 + 账本诚实门。
- **WARN**（失败 → console.warn，不阻断）：同义反复 / stub-on-orphan。

门随 backlog 推进**只收紧不放宽**（W1-W5 当前 RED，对应项接线后转 GREEN，断言不删除 → 防回归）。

抗博弈口径（红队修补并入）：
1. **AST CallExpression 计数**而非字面 grep——区分 `decideFiveValueVerdict({...})`（真调用）与 `import { decideFiveValueVerdict }` / `const _ = decideFiveValueVerdict` / 类型注解 `: ReturnType<typeof decideFiveValueVerdict>` / 字符串字面量提及。命中须是「符号后紧跟 `(`」（容忍空白与 `<` 泛型）。
2. **块注释 + 字符串 + 模板字面量状态机**——逐字符扫描，进入 `/* */` 块、`//` 行、`'...'`/`"..."` 字符串、`` `...` `` 模板后，token 不计入命中。**不依赖 tsconfig noUnusedLocals**（当前 tsconfig 未开，agent 加 ghost-import 不报错；门用 AST 兜底）。
3. **fecV2 形参必选校验**——读 orchestrator.ts，定位 `function fecAppendClaim`，解析其形参列表中 `fecV2` 字段；若仍带 `?`（OptionalToken）→ fail。tsc 编译期强制，agent 无法逃。
4. **caller 须在可达语句路径**——排除 `if (false)` / `0 &&` / `return;` 之后 / `throw` 之后的调用（保守的块内 dead-code 探测，红队「永远 false 分支」修补）。
5. **目录内容非占位**——src/statistics/ 的 .ts 文件不得全是 `return <numeric literal>` 单行 stub；GV JSON 须含 `expected.verdict` 字段。
6. **claim 双跑物证**——agent 手填 WIRED_GREEN 直接 exit 1（status=WIRED_GREEN 须配 `evidence: <base>→<head>` 行，由 CI bot 写回，agent 无写权限的 token）。由 **CHECK-L2** 强制（verifyWiredGreenEvidence：扫 §C，每行 WIRED_GREEN 后 6 行内须命中 `evidence: <base>→<head>`，否则 illegal）。

完整 check 清单（passes/fails/antiGaming）见主输出 §depthGateChecks。

---

## §E. 已知同义反复测试（重跑 = 零进度，agent 禁拿它们找存在感）

| 文件 | 同义反复类型 |
|---|---|
| tests/dialogue/dialogue_types.test.ts | 断言 src 常量 INTENT_LABELS == 测试内硬编码副本（双向同源） |
| tests/science_harness/claim_fixtures.test.ts | assert.equal(countDeliveredV1ClaimFixtures(), 3) 静态计数 |
| tests/science_harness/hero_*.test.ts | 喂硬编码 metric，stub 上结构性绿 |
| tests/fec/fec_orchestrator.test.ts / tests/falsifiability/falsifiability_verdict.test.ts / tests/falsifiability/confirmed_guard.test.ts | 断言 V1 makeVerdict，锁死 V1 路径 |

> 这些测试当前 GREEN，但 GREEN 不证明深度推进。depth_gate.mjs 的 WARN（非阻断）会列出引用「src/ 内 caller=0 孤立符号」的测试，提示先接线再补测试。

---

## §F. 诚实状态声明（红线：不把 V2/V3 写成当前完成）

截至 2026-07-03：§C 核心项**零项 WIRED_GREEN**。
- P0-1: WIRED_OPT_IN（fecV2 可选 + demo_chain 不传 → compileFec 死分支）
- P0-2a/b/c/d: BUILT_UNWIRED（decideFiveValueVerdict 已实现，src/ 内零 AST CallExpression 生产 caller）
- STAT-1: NOT_BUILT（src/statistics/ 目录不存在）
- P1-4: NOT_BUILT（golden_vectors/cases/ 子目录不存在；现有 golden_vectors/golden_vectors.json 是 hash 标签文件，非 verdict GV oracle）
- P2-1: NOT_BUILT（tests/real_backends/ 不存在）

当前套件 CI 全绿，但绿色与「深度功能接线」零相关（depth_gate.mjs 在当前态确定 FAIL，这是特性不是 bug）。

本文件是治理数据源，不建功能；功能由其他窗口 agent 在本账本 + AGENT_ENTRY_PROTOCOL.md + AGENT_ANTISKIM_TRIPWIRES.md 约束下构造。
