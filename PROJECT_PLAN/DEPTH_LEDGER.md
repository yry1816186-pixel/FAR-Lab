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
next_action = KEYSTONE_DEPTH_EVIDENCE_BOT
```

理由：
- 核心 P0 + STAT-1 + P1-4 + P1-5a/b/c + P1-6a/b 接线代码已落地（W1-W7 全 PASS：decideFiveValueVerdict 3 生产 caller @ verdict_stage:245/render:37/orchestrator:117 / compileFec 2 caller @ orchestrator:99+kernel:230 / fecV2 必选形参 / FEC-mandatory gate 运行时强制 orchestrator:103-128 / src/statistics 4 真实数学模块经 3 hero pipeline 成生产 caller / 12 GV + verify-golden CLI / venvSandboxAdapter 真起 python 子进程 + fetchOnlineDataset 真起 dataset_fetch.py）。
- 但 §C 接线行 status 维持 WIRED_RED —— 物证（base-FAIL/head-PASS 双跑）须由 `scripts/depth_evidence.mjs` keystone bot 在 CI 写回，agent 不得手填。前序窗口 9 行自指 evidence `depth_gate.ok → depth_gate.ok` + closed_by 全指向 dca79ce6（纯治理 commit，零 src/ diff）已实测为手填伪造，本轮清除并降级 WIRED_RED。
- bot 落地前唯一诚实态 = WIRED_RED。P1-5/P1-6 已接线落地（本轮），不再属 backlog；剩余 V2 深度窗口 = 真 OS 级隔离（07_RISK_REGISTER §188 自承做不到）+ maintainer M1-M4（GitHub branch protection / Actions write / CODEOWNERS，超 agent 能力）。

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
| P0-1 | compileFec 经 fecAppendClaim 进生产 verdict（fecV2 形参必选 + 实参非空 FecContractV2） | src/fec/orchestrator.ts:99 | tests/fec/fec_mandatory_e2e.test.ts::missing_or_bad_fec_blocks_confirmed | (待 CI 双跑) | WIRED_RED | — |
| P0-2a | decideFiveValueVerdict 替换 fec/orchestrator.ts 的 makeVerdict（CallExpression 真实调用，返回值流入 recordVerdict/seal） | src/fec/orchestrator.ts:117 | tests/fec/orchestrator_v2_wired.test.ts::verdict_uses_v2_kernel | (待 CI 双跑) | WIRED_RED | — |
| P0-2b | decideFiveValueVerdict 替换 verdict_stage.ts 的 makeVerdict | src/agent_loop/verdict_stage.ts:245 | tests/agent_loop/verdict_stage_v2_wired.test.ts::stage_emits_reasonCodes_ruleTrace | (待 CI 双跑) | WIRED_RED | — |
| P0-2c | demo_chain 经 fecAppendClaim（:181）间接驱动 V2 kernel —— fecAppendClaim 内部调 decideFiveValueVerdict，kernelOutput.reasonCodes/decisiveRuleId 流入 machineVerdict（架构上 demo_chain 从未直接调 makeVerdict，间接驱动是真实路径，非直接 caller） | src/far_proof/demo_chain.ts:181 | tests/far_proof/demo_chain_replay_v2.test.ts::demo_chain_seals_with_five_value_verdict | (待 CI 双跑) | WIRED_RED | — |
| P0-2d | decideFiveValueVerdict 替换 render.ts 的 makeVerdict | src/falsifiability/render.ts:37 | tests/falsifiability/render_v2_wired.test.ts::render_emits_evidenceSufficiency | (待 CI 双跑) | WIRED_RED | — |
| P0-3 | orchestrator fecAppendClaim 内 !fecGate.allowed 分支（:119-128）强制缺/坏 FEC claim verdict≠CONFIRMED → UNTESTED；demo_chain 经此路径 | src/fec/orchestrator.ts:119 | tests/far_proof/fec_mandatory_e2e.test.ts::missing_fec_blocks_confirmed_on_real_path | (待 CI 双跑) | WIRED_RED | — |
| P0-4 | decideFiveValueVerdict 消费 compileFec Plan，替换 isFrozenAndCompilable 的内联 4 字段浅检查 | src/falsifiability/verdict_kernel_v2.ts:230 | tests/falsifiability/kernel_v2_consumes_fec_plan.test.ts::R1_fires_same_condition_as_compileFec | (待 CI 双跑) | WIRED_RED | — |
| STAT-1 | src/statistics/ 真实数学（z-test/Cohen's d/置信区间/Bonferroni·Holm·BH-FDR 多重校正），statistics_math.test.ts GREEN；**3 真实生产 caller 经 P1-5a/b/c**——hero_a_pipeline 调 oneSampleZTest、hero_b_pipeline/c_astro_pipeline 调 twoSampleWelchZTest/adjustPValues（经 fecAppendClaim(statistics?) 注入 V2 kernel 消费真实统计量，不再零 caller） | src/science_harness/hero_a_pipeline.ts:138 | tests/science_harness/hero_a_pipeline.test.ts::hero_a_pipeline: real src/statistics drives R7 CONFIRMED -> ASK-9 INCONCLUSIVE seal (P1-5 Phase 2) | (待 CI 双跑) | WIRED_RED | — |
| P1-2 | executeFallbackChain 接 loop_runner / qwen_vl_adapter，真实 429/5xx/timeout 穿透 | src/llm_gateway/adapters/aliyun_qwen_vl/qwen_vl_adapter.ts:340 | tests/llm_gateway/fallback_real_http.test.ts::real_429穿透_fallback_chain | (待 CI 双跑) | WIRED_RED | — |
| P1-4 | 12 条 GV 落盘 golden_vectors/cases/GV-01..GV-12.json（含 input.evidences/expected.verdict/expected.reasonCodes schema）+ far verify-golden 真调 decideFiveValueVerdict（非硬编码旁路） | src/cli/commands/verify_golden.ts:122 | tests/cli/verify_golden_cross_lang.test.ts::node_python_browser_agree_on_GV | (待 CI 双跑) | WIRED_RED | — |
| P2-1 | tests/real_backends/ 真实 spawn SymPy/Z3/Dafny/Lean（非 mock，按环境 skip 但 skip 须显式记录 reason） | tests/real_backends/sympy_real.test.ts:9 | tests/real_backends/sympy_real.test.ts::SymPy real backend verifies and refutes expanded polynomial identities | (待 CI 双跑) | WIRED_RED | — |
| P1-1 | far fec compile / far fec freeze CLI 真实调 compileFec + computeFecHash（非 mock，非 stub） | src/cli/commands/fec.ts:89 | tests/cli/fec_compile_freeze.test.ts::runFecCompile drives real compileFec + computeFecHash; runFecFreeze verifies and detects tampering | (待 CI 双跑) | WIRED_RED | — |
| P1-3 | createQwenAdapter 真实调 openai SDK chat.completions.create 穿透 DashScope HTTP | src/llm_gateway/adapters/aliyun_qwen/qwen_adapter.ts:73 | tests/llm_gateway/qwen_adapter_fallback.test.ts::qwen_adapter: primary success → no fallback, no degradedFrom | (待 CI 双跑) | WIRED_RED | — |
| P2-2 | 9-state CLI 协议 FSM + computeStageReceipt 真实 sha256 哈希链 | src/cli/stage_receipt.ts:22 | tests/cli/state_machine.test.ts::verifyStageReceiptChain: end-to-end via runFsmAdvance (real CLI entry, real sha256) | (待 CI 双跑) | WIRED_RED | — |
| P3-1 | suite 起跑时 probePythonAxis 真实 spawnSync python3 + sympy/z3 import 探针 | scripts/run_py_tests.mjs:14 | scripts/run_py_tests.mjs::Python axis: available|skipped 首行输出 | (待 CI 双跑) | WIRED_RED | — |
| P1-5a | hero-A pipeline 真实 src/statistics/ 接线：oneSampleZTest + meanConfidenceInterval + cohensDOneSample + adjustPValues 经 fecAppendClaim(statistics?) 注入 V2 kernel → R7 CONFIRMED → ASK-9 INCONCLUSIVE seal（STAT-1 首个真实生产 caller·反同义反复） | src/science_harness/hero_a_pipeline.ts:138 | tests/science_harness/hero_a_pipeline.test.ts::hero_a_pipeline: real src/statistics drives R7 CONFIRMED -> ASK-9 INCONCLUSIVE seal (P1-5 Phase 2) | (待 CI 双跑) | WIRED_RED | — |
| P1-5b | hero-B pipeline 真实 src/statistics/（twoSampleWelchZTest/effectSize/CI/adjustPValues）+ adjudicateConfounding（d-separation·F6）→ fecAppendClaim(claimType='causal' + confoundingGateResult) 驱动 kernel R-causal 门 → DEGRADED_SCOPE（单层·F2 优先级·无重复降级） | src/science_harness/hero_b_pipeline.ts:148 | tests/science_harness/hero_b_pipeline.test.ts::hero_b_pipeline: real two-sample stats + ConfoundingGate FAIL -> R-causal DEGRADED_SCOPE (single layer) (P1-5 Phase 3) | (待 CI 双跑) | WIRED_RED | — |
| P1-5c | C-ASTRO pipeline 经 venvSandboxAdapter.executeAsync 真起 python BLS（numpy 周期搜索）+ 真实 twoSampleWelchZTest(in/out fluxes) → R4 DEGRADED_SCOPE（cached_fixture scope 诚实缩窄·02 F1 合成 fixture 不升 CONFIRMED）→ seal（P1-6 基建的端到端消费方） | src/science_harness/c_astro_pipeline.ts:160 | tests/science_harness/c_astro_pipeline.test.ts::c_astro_pipeline: real venv BLS + real two-sample z-test -> R4 DEGRADED_SCOPE (cached_fixture honest scope) -> seal (Phase 5) | (待 CI 双跑) | WIRED_RED | — |
| P1-6a | venvSandboxAdapter.executeAsync 真起 python 子进程：spawn sandbox_runner.py + threadpoolctl(1) + random.seed + sha256 artifact manifest（V1 类型层 → 真实 spawn；P1-5c 消费方） | src/science_harness/sandbox_runner.ts:381 | tests/science_harness/sandbox_real.test.ts::venv sandbox: real spawn executes deterministic script + computes sha256 hash anchors (P1-6) | (待 CI 双跑) | WIRED_RED | — |
| P1-6b | fetchOnlineDataset 真起 dataset_fetch.py：TS 侧 host 白名单预检（fail-closed 不 spawn）+ Python 侧 lightkurve/astroquery 惰性 import + sha256 content（host 白名单 + 不伪造降级·02 F1） | src/science_harness/dataset_resolver.ts:174 | tests/science_harness/dataset_real.test.ts::fetchOnlineDataset: whitelisted host returns null-or-result honestly (never throws, never fabricates) | (待 CI 双跑) | WIRED_RED | — |

> **当前 next = KEYSTONE_DEPTH_EVIDENCE_BOT**（见 §A）。§C 全部接线行维持 WIRED_RED（接线代码已落地，W1-W7 PASS 证实符号级 caller 真实存在，「base-FAIL/head-PASS 双跑物证」须由 `scripts/depth_evidence.mjs` keystone bot 在 CI 写回，agent 不得手填 WIRED_GREEN）。本轮 P1-5a/b/c（hero-A/B/C-ASTRO 真实 pipeline 接 src/statistics/）+ P1-6a/b（venvSandboxAdapter/fetchOnlineDataset 真起 python 子进程）接线落地，STAT-1 由 BUILT_UNWIRED 升至 WIRED_RED（src/statistics/ 经 3 个 hero pipeline 成真实生产 caller，不再零 caller）。WIRED_GREEN 仍只由 keystone bot CI 双写。

---

## §D. 机器门（CI 必过 job，agent 无关）

脚本：`scripts/depth_gate.mjs`（已落盘）。CI 集成：`.github/workflows/depth-gate.yml`（独立 job，与 ci.yml 并列，须由 maintainer 设为 required status check）。

门分两类：
- **HARD**（失败 → exit 1，阻断 PR）：接线门 + 账本诚实门。
- **WARN**（失败 → console.warn，不阻断）：同义反复 / stub-on-orphan。

门随 backlog 推进**只收紧不放宽**（W1-W7 已 GREEN：核心 P0 + STAT-1 + P1-4 接线完成；断言保留防回归，禁止删除）。

抗博弈口径（红队修补并入）：
1. **AST CallExpression 计数**而非字面 grep——区分 `decideFiveValueVerdict({...})`（真调用）与 `import { decideFiveValueVerdict }` / `const _ = decideFiveValueVerdict` / 类型注解 `: ReturnType<typeof decideFiveValueVerdict>` / 字符串字面量提及。命中须是「符号后紧跟 `(`」（容忍空白与 `<` 泛型）。
2. **块注释 + 字符串 + 模板字面量状态机**——逐字符扫描，进入 `/* */` 块、`//` 行、`'...'`/`"..."` 字符串、`` `...` `` 模板后，token 不计入命中。**不依赖 tsconfig noUnusedLocals**（当前 tsconfig 未开，agent 加 ghost-import 不报错；门用 AST 兜底）。
3. **fecV2 形参必选校验（R4 + 红队 decoy 修补）**——读 orchestrator.ts 全文，遍历 `fecV2` 字段**全部**匹配（不只首匹配），任一带 `?` 或 `| undefined` 联合 → fail。防顶部 decoy `const fecV2: unknown` 掩盖真实 `fecV2?`（红队曾用 exec 首匹配绕过）。
4. **caller 须在可达语句路径（红队扩展）**——精确死分支探测：同行 `if(false)/while(false)/恒假数值比较(1>2)` 出现在符号前、或上行以开放 `if()/while()` 死条件结尾、或上行 `return/throw;/字面量&&` 结尾 → 排除。防「prev 行完整 while(false){...} 污染下一行」误排（精确版替代旧行级 ctx）。
5. **目录内容非占位（R5 + realMathSignal）**——src/statistics/ 的 .ts 不得是 `export function F():number{return X;}` / `export const F=()=>literal;` / `return literal op literal;` 任一占位形态；且须含 realMathSignal（`Math.*`/统计库函数/`for|while` 循环）。GV JSON 须 `expected.verdict∈冻结五值` + `expected.reasonCodes` 非空数组 + `input.evidences` 非空（UNTESTED 允许空证据）。
6. **CallExpression 形态扩展（R4' parens/反射修补）**——`(symbol)(...)` parens 包裹 / `symbol.call|apply|bind(...)` 反射调用 也计为 caller。防 V1 `makeVerdict` 用 parens 包裹躲过 `[<(]` 计数。
7. **WIRED_GREEN evidence 格式（R7 收紧）**——`evidence: <base>→<head>` 须 base≠head + 每侧为 40-hex SHA 或纯数字 run-ID。拒绝 `depth_gate.ok → depth_gate.ok`（base=head 自指 + 非 SHA 格式）这类手填伪造。由 **CHECK-L2** 强制。
8. **proof_test 文件须存在（R8）**——§C WIRED_GREEN/RED 行的 proof_test 路径（`::` 前部分）须 existsSync。防账本指向幽灵测试文件。由 **CHECK-L1** 强制。
9. **closed_by sha 须真实（R9）**——WIRED_GREEN 行 closed_by 须 `git cat-file -t` 返回 `commit`（非 git 目录跳过，不误判桩仓）。防账本编造 sha。由 **CHECK-L1** 强制。

**inherent_limits（诚实声明，不可省）**：静态门能证「符号被生产路径引用」「文件非占位」「账本不指幽灵/不伪造 evidence 格式」，但**不能**证：(a) 运行时真执行到 caller（死分支探测是保守启发式）；(b) caller 传真实数据非预制常量；(c) closed_by sha 真含接线 diff（sha 存在 ≠ sha 接线）；(d) RED→GREEN 双跑物证（须 depth-evidence bot 在 CI 实跑 base/head）。完整保证 = 本静态门 + depth-evidence bot + CODEOWNERS 护本文件 + write-restricted token。bot 未实现前，WIRED_GREEN 可被「正确格式 + 真实 sha + 真实测试文件」组合骗过——故 §C 明确：bot 写回前只允许 WIRED_RED。

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

截至 2026-07-04：核心 P0 + STAT-1 + P1-4 + P1-5a/b/c + P1-6a/b 接线代码已落地（depth_gate W1-W7 全 PASS 证实符号级生产 caller 真实存在），但 §C 接线行 status 维持 WIRED_RED —— 物证（base-FAIL/head-PASS 双跑）须由 `scripts/depth_evidence.mjs` keystone bot 在 CI 写回，agent 不得手填。
- P0-1 / P0-3: 接线态 = compileFec 经 fecAppendClaim 进生产 verdict（orchestrator:99 CallExpression + fecV2 必选形参 + enforceFecMandatoryGate 运行时强制 orchestrator:103-128，缺/坏 FEC → UNTESTED 永不 CONFIRMED）
- P0-2a/b/d: decideFiveValueVerdict 3 生产 caller（orchestrator:117 / verdict_stage:245 / render:37，替换 V1 makeVerdict）；P0-2c: demo_chain 经 fecAppendClaim:181 间接驱动 V2 kernel（架构上从未直接调 makeVerdict）
- P0-4: decideFiveValueVerdict 消费 compileFec Plan（kernel:230 R1 内联 compileFec，替换浅检查）
- STAT-1: WIRED_RED（src/statistics/{p_value,effect_size,ci,multiple_testing}.ts 真实数学 + statistics_math.test.ts GREEN + **3 真实生产 caller**——hero_a_pipeline:138 oneSampleZTest / hero_b_pipeline:148 + c_astro_pipeline:212 twoSampleWelchZTest，经 fecAppendClaim(statistics?) 注入 V2 kernel 消费真实统计量；本轮 BUILT_UNWIRED→WIRED_RED 闭合）
- P1-4: golden_vectors/cases/GV-01..GV-12.json 落盘 + far verify-golden runVerifyGolden(:122) 真调 decideFiveValueVerdict（非硬编码旁路）
- **诚实警示**：前序窗口曾把上述 9 行手填为 WIRED_GREEN + 伪造自指 evidence `depth_gate.ok → depth_gate.ok` + closed_by 全指向 dca79ce6（经 `git show --stat` 复验为纯治理 commit，零 src/ diff）—— 即 §D inherent_limits (c) 的活体实例（sha 存在 ≠ sha 含接线 diff）。本轮清除伪造 evidence 并降级回 WIRED_RED，bot 落地前不得回升。

P1-5 / P1-6 本轮接线落地（WIRED_RED，待 keystone bot CI 双写 WIRED_GREEN）：
- P1-5a/b/c: hero-A/B/C-ASTRO 3 个 pipeline 全走 Pipeline B（fecAppendClaim(statistics?)→decideFiveValueVerdict→machineSealableConclusion→sealProofEnvelope），用 src/statistics/ 真实统计替换硬编码指标。hero-A 真实 oneSampleZTest→R7 CONFIRMED→ASK-9 INCONCLUSIVE seal；hero-B 真实 twoSampleWelchZTest+adjudicateConfounding（d-separation·F6）→R-causal DEGRADED_SCOPE（单层）；C-ASTRO 经 venv sandbox 真起 python BLS+真实 z-test→R4 DEGRADED_SCOPE（cached_fixture 合成 LC scope 诚实缩窄·02 F1 不升 CONFIRMED）。
- P1-6a: venvSandboxAdapter.executeAsync 真起 python 子进程（spawn sandbox_runner.py + threadpoolctl(1) + random.seed + sha256 artifact manifest），V1 类型层→真实 spawn。
- P1-6b: fetchOnlineDataset 真起 dataset_fetch.py（TS 侧 host 白名单预检 fail-closed + Python 侧 lightkurve/astroquery 惰性 import + sha256 content）。

诚实边界（仍 V2 路线，未达 WIRED_GREEN）：真 OS 级网络/cpu/mem 隔离做不到（07_RISK_REGISTER §188 自承），P1-6 仅 Python 侧 best-effort + 诚实声明，绝不宣称运行时隔离；C-ASTRO 在线真实 TESS 路径需 lightkurve+MAST（多数环境 skip），cached_fixture 是合成 LC（baseline_exempt，R4 DEGRADED_SCOPE 不升 CONFIRMED）；hero-A/B fixture 是预登记样本（非实时取数）。

2026-07-04 账本诚实化更新：
- P1-1 / P1-2 / P1-3 / P2-1 / P2-2 / P3-1 由 BUILT_UNWIRED / NOT_BUILT 推进至 WIRED_RED（agent 完成接线 + 端到端 GREEN，待 CI 双跑物证 bot 写回 WIRED_GREEN）
- P2-3 同义反复测试 dialogue_types.test.ts 已删除（断言 src 常量 == 测试内硬编码副本，双向同源零信息量）
- W0 PARTIAL 残留文件 $null 已清理
- §A next_action 从 P1-1 推进至 V2_ROADMAP_NO_NEXT
- 2026-07-04 第二轮诚实化：§C 9 行（P0-1/P0-2a-d/P0-3/P0-4/STAT-1/P1-4）WIRED_GREEN→WIRED_RED（接线早于测试，无法诚实演示基本失败，须 bot 双跑写回）；删除 9 行自指伪造 evidence；proof_caller 行号系统性修正（orchestrator:91→99/:116→117、verdict_stage:234→245、render:26→37、kernel:526→230、demo_chain 改指 fecAppendClaim:181、P0-3 改指 orchestrator:119、STAT-1 改 src/statistics/p_value.ts:1 闭合 R7、P1-4 改单一 src/cli/commands/verify_golden.ts:122 闭合 R7）；§A next_action 改 KEYSTONE_DEPTH_EVIDENCE_BOT；§F 删「核心 P0 全栈已 WIRED_GREEN」叙事
- 2026-07-04 P1-5/P1-6 接线落地（第三轮）：§C 新增 P1-5a/b/c（hero-A/B/C-ASTRO 真实 pipeline）+ P1-6a/b（venvSandboxAdapter/fetchOnlineDataset 真起 python 子进程）5 行 WIRED_RED；STAT-1 由 BUILT_UNWIRED 升 WIRED_RED（src/statistics/ 经 3 个 hero pipeline 成真实生产 caller，反同义反复）。新增端到端真实依赖：hero_a/b_pipeline.test.ts（真实 z-test 驱动 R7/R-causal）、c_astro_pipeline.test.ts（venv sandbox 真起 numpy BLS + 真实 twoSampleWelchZTest → R4 DEGRADED_SCOPE cached_fixture 诚实 scope）、sandbox_real.test.ts（真 spawn + sha256 anchor）、dataset_real.test.ts（host 白名单 + 不伪造降级）。**全 WIRED_RED，无手填 WIRED_GREEN**；物证仍须 keystone bot CI 双跑写回。

本文件是治理数据源，不建功能；功能由其他窗口 agent 在本账本 + AGENT_ENTRY_PROTOCOL.md + AGENT_ANTISKIM_TRIPWIRES.md 约束下构造。
