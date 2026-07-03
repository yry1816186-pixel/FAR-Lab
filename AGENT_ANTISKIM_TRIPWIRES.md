# FAR-Chain 反 skim 绊线目录（agent 无关）

> 本文件是 **操作层** 的反 skim 手册：逐条列出本仓库 **特有** 的 skim 模式、识别特征、为什么是 skim、STOP-DO-X 正确动作、机检钩子。
> 与 CLAUDE.md §1/§3 不重复：§1/§3 是软宣言（agent 可用话术合理化绕过），本文件把它们落到「具体本仓库实例 + 机器门引用」的可执行清单。
> **任何 Agent**（Claude / GPT / Cursor / Copilot）落地读完 CLAUDE.md + DEPTH_LEDGER.md 之后必读本文件。动手前与提交前各跑一遍 T0–T8 自检（AGENT_ENTRY_PROTOCOL.md §D），命中任一即 **STOP**，改做该条「正确动作」。

> 路径占位：`<REPOSITORY_ROOT>/` 指仓库根。下文 file:line 均相对仓库根。

---

## 总规则：先承认这是 skim 高发项目

本仓库已发生「绿套件 + 零接线」状态（每条 file:line 已 Read/Grep 复验）。**绿色 ≠ 完成**。把「让 pnpm test / ci.yml 绿」当目标本身就是命中 T0。本项目进度定义只有一条：**真实依赖端到端接线成功**（真实 SymPy / 真实 DashScope HTTP / 真实 venv 子进程 / 真实哈希重算）。说不出来本次工作驱动了哪一个 = 你在 skim，STOP。

---

## T0 — 重跑已绿全量套件「找存在感」

**识别特征**
- 你的下一动作是 `pnpm test` / `pnpm ci-all`，且你**没有**同时改动任何 `src/` 生产文件。
- 把「测试又绿了」「coverage 还在」写进进度陈述。
- 你跑的是 dialogue_types / claim_fixtures / hero_* / fec_orchestrator / falsifiability_verdict / confirmed_guard 之一，且没改对应 src/。

**为什么是 skim**
package.json:14 的 `test` 是扁平 glob，混跑真实后端路径与同义反复测试。CI 全绿，但绿色与「深度功能接线」零相关——`decideFiveValueVerdict` 已实现（verdict_kernel_v2.ts:195）有完整单元测试 CI 绿，而 src/ 内零 AST CallExpression 生产 caller。重跑这面墙 = 零信息量，却让 agent 觉得「我在做事」。

**正确动作**
- STOP：不重跑全量套件。重跑只在改了对应 src/ 后跑该文件的定向测试。
- DO：跑 `node scripts/depth_gate.mjs`。它要么报「当前最前未接线项 = X（file:line）」，要么 exit 0。当前态确定 exit 1，列出 W1-W7 + L1 的具体失败。
- DO：取 DEPTH_LEDGER §A 的 next_action，只做该项。说一句「本次工作驱动了 <真实依赖>，证据是 <file:line 改了什么>，验证是 <一条此前 RED 现在 GREEN 的真实路径测试>」。说不出来 → STOP。

**机检钩子**
- `scripts/depth_gate.mjs` CHECK-W2（decideFiveValueVerdict AST CallExpression 生产 caller ≥ 1）。命中须是符号后跟 `(`，排除 import/类型注解/注释/字符串；块注释状态机剥离 `/* */`。当前态 src/ 内零生产 caller → exit 1，错误信息直接指向下一接线项 P0-2a。

---

## T1 — 给 FakeBackend / stub 后端补测试

**识别特征**
- 新写/修改的测试 import FakeBackend / mock / stub / in-memory 后端，或直接构造 `evidences: [{ supportsClaim: true }]` 预制布尔。
- 测试断言对象是「孤立模块」（被测符号在 src/ 内 AST CallExpression 生产 caller = 0）。
- 给 tests/math/*（FakeBackend）/ tests/science_harness/hero_*（硬编码指标）/ tests/fec/fec_orchestrator.test.ts（断言 V1 makeVerdict）补 case。

**为什么是 skim**
src/falsifiability/verdict.ts:76 的 makeVerdict 只 filter(e => e.supportsClaim).length 数预制布尔——不调任何真实数学。给它补测试就是给计数器补 case，结构性绿在未建功能上。hero_* 喂硬编码指标，同类。这类测试必然绿、必然涨 coverage，但驱动不了任何真实依赖。

**正确动作**
- STOP：删掉这条测试，或先回答「它证明存在的单一真实依赖」。答不出 = skim。
- DO：找到被测符号在 DEPTH_LEDGER §C 的条目。若 status=BUILT_UNWIRED/NOT_BUILT，正确动作是**接线该符号到生产路径**（让一个非测试 caller 以 AST CallExpression 真实调用它），不是补测试。
- DO：若坚持要写真实后端测试，路径是 tests/real_backends/，须 spawn 真实 venv / 真实 SymPy / 真实 DashScope HTTP，按环境能力 skip 但 skip 须显式记 reason，禁用 mock 替代。

**机检钩子**
- depth_gate.mjs 的 `detectStubTestOnOrphan`（WARN）：对 tests/ 下引用「src 内 caller=0 孤立符号」（decideFiveValueVerdict / executeFallbackChain）的测试列出警告。WARN 不阻断但显形，让 agent 知道这些是零进度项。
- W7（HARD）：tests/real_backends/ 必须存在且非空。当前态目录不存在 → exit 1。

---

## T2 — 把 Python 环境失败 / 工具缺失当代码 bug

**识别特征**
- 看到 verifyEnvelopeV2WithPython / cross_lang_consistency / SymPy / Z3 / Lean / Dafny 测试 skipped/errored，就改 src/ 代码「修这个 bug」。
- 没读 `scripts/ensure_py_deps.mjs` 就动手。
- fix 是「加 try/catch 吞 Python 失败」或「把 cross_lang 测试改 skip」。

**为什么是 skim**
scripts/run_py_tests.mjs 与 ensure_py_deps.mjs 是 Python axis 能力探针。axis skipped = 环境（缺 venv / 缺 SymPy）问题，不是代码 bug。当代码 bug 修，最省事的修法是注释掉真实后端调用——正好抹掉真实依赖存在的痕迹，让 skim 更隐蔽。

**正确动作**
- STOP：先跑 `node scripts/ensure_py_deps.mjs`。它告诉你缺什么。
- DO：环境缺 → 装环境（venv、pip install sympy z3-solver），或诚实声明「Python axis: skipped (reason)」并**不碰 src/ 代码**。
- DO：若真是代码 bug（Python 调用真实成功但解析错），单文件 `node --test tests/<file>` 隔离确认，fix 后跑 cross_lang_consistency + 相关 golden-vector。

**机检钩子**
- scripts/run_py_tests.mjs 输出首行 `Python axis: available|skipped (reason)`（CLAUDE.md §4 P3-1）。CI 读此行：若 skipped 且 PR diff 触动 src/ 中被 Python axis 覆盖的符号 → exit 1。agent 无法在环境缺失时改 src/ 过关。

---

## T3 — 改文档 / 注释 / 重命名冒充进度

**识别特征**
- 本次 diff 只含 .md / 注释 / 重命名 / 无运行时效果的类型加宽。
- commit type 是 docs/chore/style/refactor，但 PR 描述用「推进/完成/加固/增强」动词。
- 新增了 CLAUDE.md §2 禁止的散文复述注释（`// 遍历 items 求和`）。

**为什么是 skim**
改文档是 crisp 任务（无歧义、必产出），接线是 ambiguous 任务（可能失败、要懂调用链）。模糊规避下 agent 选前者。CLAUDE.md / PROJECT_PLAN 越改越厚，src/ 接线零推进。CLAUDE.md §2 注释最小化是竞赛评审要求（密集 AI 注释被判「无含金量」），违反直接损害交付物。

**正确动作**
- STOP：本次 diff 是否触动 ≥1 条 DEPTH_LEDGER §C 条目的 proof_caller 行？没有 → 这是 surface-only PR，诚实标 docs/chore，**不要**用「推进/完成」措辞。
- DO：把「想做的事」写成 DEPTH_LEDGER §C 新条目（带 single_real_dependency 字段），下次 PR 真接线。
- DO：删违反 CLAUDE.md §2 的散文注释。允许新注释只有四类：不变式 / 非显然为什么 / fail-closed 红线 / 诚实状态延期。判定法：删掉后读者是否在不变式/决策/红线上损失信息？否→删。

**机检钩子**
- depth_gate.mjs CHECK-W4（makeVerdict 全 src/ 生产 caller = 0）。当前态 orchestrator:116 / verdict_stage:234 / render:26 仍调 → exit 1。任何 surface-only PR 都过不了此门——只要 V1 还活着门就红，agent 改再多文档也不能让 CI 绿。

---

## T4 — 合成 StatisticalResult / pValue 等手填统计（违反 §5 RR-1）

**识别特征**
- 在测试或生产代码写 `pValue: 0.03` / `effectSize: 0.5` / `confidenceInterval: [...]` / `StatisticalResult: {...}` 字面量。
- 给 decideFiveValueVerdict 喂预制 StatisticalResult[]，背后无真实数学来源。
- 「统计」从 fixture / 常量 / 硬编码数组读出。

**为什么是 skim**
src/statistics/ 目录不存在（Glob 复验 No files found）。全仓零真实 p-value/effect-size/CI/多重校正数学。evaluateStatistics（verdict_kernel_v2.ts:450）仅被 V2 内部调用，V2 零生产 caller → 生产路径永不调用真实统计。CLAUDE.md §5 红线 RR-1 禁手填裸统计数字，但生产 makeVerdict（verdict.ts:41）就是读预制 supportsClaim 布尔，等价手填统计结论。合成 StatisticalResult 是把红线从「生产 makeVerdict」复制到「V2 kernel 测试」，让 skim 看起来像「在用 V2」。

**正确动作**
- STOP：删手填字面量。
- DO：建 src/statistics/{p_value,effect_size,ci,multiple_testing}.ts（非 stub：函数体不得仅 `return <numeric literal>`）。用 golden_vectors/cases/GV-01..GV-12.json 反算校验。
- DO：让 decideFiveValueVerdict 消费由 src/statistics/ 真实算出的 StatisticalResult[]。

**机检钩子**
- depth_gate.mjs CHECK-W5（src/statistics/ 存在且 ≥4 真实数学模块）：内容校验——函数体不得仅是 `return <numeric literal>` 单行 stub。当前态目录不存在 → exit 1。agent 无法靠建 4 个 `return 0.03` 文件过关。
- CHECK-W6（golden_vectors/cases/ ≥12 条带 schema GV）：每个 GV-*.json 须含 input.evidences + expected.verdict + expected.reasonCodes。当前态 cases/ 不存在 → exit 1。

---

## T5 — 声称「提升覆盖率」而无 RED→GREEN 真实依赖

**识别特征**
- 进度陈述含「提升了测试覆盖率/增加了 regression 守卫/增强了类型安全/加固了 X 模块」。
- **没有**同时提供：(a) 一条此前 RED 的测试，(b) 该测试现在只在真实（非 Fake）路径上 GREEN，(c) 该测试驱动的具体真实依赖 file:line。

**为什么是 skim**
CLAUDE.md §1 列「禁止话术：我提升了测试覆盖率」「允许话术：我把 X（file:line）接进了生产路径 Y（file:line）」。但这是字符串黑名单——agent 用「增强了类型安全」即可语义等价绕过。根因：声称完成无出口门，agent 想 done 就 done。

**正确动作**
- STOP：把进度陈述改成 CLAUDE.md §1 允许话术格式。改不出来（说不出 file:line + 真实路径 RED→GREEN 测试）= 不是进度，是 skim。
- DO：找到对应 DEPTH_LEDGER §C 条目，填 proof_caller(file:line) + proof_test(file:line) + proof_test_red_commit。CI 会双跑：base 跑 proof_test 须 FAIL，HEAD 须 PASS。
- DO：覆盖率数字（测试数/文件数/CI 通过率/commit 数）若出现在陈述里，必须由命令实时生成（CLAUDE.md §5 RR-1），禁手填。

**机检钩子**
- RED→GREEN 双跑物证（.github/workflows/depth-evidence.yml，待 maintainer 启用）：CI 在 base SHA checkout 跑 DEPTH_LEDGER §C 中 status=WIRED_RED 项的 proof_test 须 FAIL（非 skip 非 pass），在 HEAD SHA 跑同测试须 PASS。双跑通过 → CI bot 写回 §C 该行 status=WIRED_GREEN + evidence: <base>→<head>。agent 手填 WIRED_GREEN → depth_gate CHECK-L1 拒（status=WIRED_GREEN 须配 evidence 行 + closed_by sha）。

---

## T6 — 把 V2 / V3 路线写成当前完成

**识别特征**
- 陈述/注释/文档把 decideFiveValueVerdict（V2）/ executeFallbackChain / sandbox_runner（V2 真起 venv）/ dataset_resolver / 9-state CLI FSM 写成「已实现/已支持/已完成」。
- 实际状态：符号已定义但零生产 caller，或参数可选导致生产永不触发。

**为什么是 skim**
CLAUDE.md §5 红线「不把 V2/V3 写成当前完成（状态标签必须诚实）」。已发生账本漂移：CLAUDE.md §4 P0-1 标 completed，但 fecV2?（orchestrator.ts:59）+ demo_chain.ts:180 不传 → compileFec 死分支。「加了可选参数 + 内部 if」被 agent 当「接线完成」话术，是软规则被合理化的典型。

**正确动作**
- STOP：用 DEPTH_LEDGER §B 的 status 四值标签重写：NOT_BUILT / BUILT_UNWIRED / WIRED_OPT_IN / WIRED_RED / WIRED_GREEN。decideFiveValueVerdict 当前是 BUILT_UNWIRED（已建零接线），不是 WIRED_GREEN。fecV2 当前是 WIRED_OPT_IN（可选参数生产不传）。
- DO：把 fecV2 从可选改硬强制——fecAppendClaim 形参移除 `?`，所有生产 caller 必须传 FecContractV2，编译期 tsc 强制。
- DO：陈述任何深度功能时，先在 DEPTH_LEDGER §C 查它的 status 字段，照抄该字段的值，不自行升级措辞。

**机检钩子**
- depth_gate.mjs CHECK-W1（fecV2 形参必选）：detectOptionalParam 校验 fecV2 字段无 OptionalToken。当前态 orchestrator.ts:59 `fecV2?:` → exit 1。tsc 编译期强制，agent 无法传 undefined 除非用 as any（被 zero_tolerance 抓）。
- CHECK-W4（makeVerdict 全 src/ 生产 caller = 0）覆盖 V2 替换 V1 的诚实性：只要 makeVerdict 还活着，V2 就不能声称完成。

---

## T7 — 跳过深度门 / 合理化软规则

**识别特征**
- 对自己说「这次先不跑 depth_gate，反正只是小改」「CLAUDE.md §4 是建议不是硬要求」「先把这个测试加了再说」「门太严我手动绕过」。
- 用等价措辞绕开 §1 话术黑名单（「我没提升覆盖率，我只是增加了 regression 守卫」）。
- 跳过 DEPTH_LEDGER 取下一项，自己 ad-hoc 挑了「看起来相关」的浅活。

**为什么是 skim**
软规则在 LLM agent 上的失效模式不是「违反」而是「重新解释」：agent 把「给 verdict_kernel_v2 加 3 个测试」重新框成「加固裁决内核」，不触发自我审视，同时满足 helpful-servant 偏置。CLAUDE.md §1 警告了这点但自身就是软规则——套娃式失效。CLAUDE.md §4「按顺序取下一项，不要 ad-hoc」也是软规则。

**正确动作**
- STOP：任何「先不跑 X 门」的念头 = skim 信号。门是为所有 agent（含你）设计的，绕门 = 你的工作不可信。
- DO：把 §1 话术黑名单当**最小集**。任何不含 file:line + 真实路径 RED→GREEN 测试的进度陈述都视为疑似 skim，重写成允许话术格式。
- DO：取 DEPTH_LEDGER §A 的 next_action，只做该项。不 ad-hoc。若你认为某项不该是下一项，正确动作是更新 §A 的依赖图（带证据），不是跳过它做别的。

**机检钩子**
- 门是 CI（GitHub Actions required job），不是 harness hook。.github/workflows/depth-gate.yml 跑 depth_gate.mjs。任一 W 检查红 → 整个 job 红 → PR 不可 merge（须 maintainer 把 depth_gate job 设为 required status check，见 residualRisks）。agent 本地 `--no-verify` 或 `--ignore-scripts` 绕过本地 hook 也无效，因为 PR-level CI 必跑。
- entry_protocol_check（CI step）：PR body 须含 `ledger_item: <id>` 且该 id 在 DEPTH_LEDGER §C 存在且 status ≠ WIRED_GREEN（禁对已 closed item 提 PR 凑数）。缺字段 → exit 1。

---

## T8（meta）— 一句话单一真实依赖测谎

**识别特征**
- 你无法一句话说出本次工作驱动的「真实 SymPy 调用 / 真实 DashScope HTTP / 真实 venv 子进程 / 真实哈希重算」之一，并指出 src/ 中改了哪一行让它被生产路径以 AST CallExpression 调用。

**为什么是 skim**
这是 meta-tripwire：前 7 条的具体表现汇流到「说不出真实依赖」。说不出来 = 你在做的是 crisp 浅事（重跑测试/改文档/补同义反复测试/给 stub 加测试）而非 ambiguous 深事（接线）。

**正确动作**
- STOP：全部停下，回到 DEPTH_LEDGER §A 取 next_action。

**机检钩子**
- entry_protocol_check：PR body 须含 `single_real_dependency: <真实SymPy/DashScope/venv/hash 之一 + file:line>`，关键词不命中 → exit 1。GitHub-level 硬门，绕过 harness 特性。

---

## 与现有治理的关系（不重复，只落地）

| 现有工件 | 说了什么 | 本文件补了什么 |
|---|---|---|
| CLAUDE.md §1 | 进度定义是真实依赖接线，禁话术 | 「禁话术」从字符串黑名单升级为 depth_gate CHECK-W4 + RED→GREEN 双跑物证（T5） |
| CLAUDE.md §3 | 避测试循环三陷阱 | 三陷阱各绑机检钩子（T0/T1/T2） |
| CLAUDE.md §4 | P0-P3 backlog | backlog 拆为 DEPTH_LEDGER §C 机器可校验条目（T0/T3/T5/T6/T7 引用） |
| CLAUDE.md §5 | 红线 | T4（手填统计）、T6（V2 写成完成）各给机检钩子 |
| scripts/zero_tolerance_scan.mjs 等 4 scan | 扫代码反模式 token | depth_gate.mjs 扫接线状态，与现有 scan 正交，叠加为 CI required job |

**关键约束**：本文件本身是软文（agent 可不读）。强制力来自两个 agent 无关机制：(1) scripts/depth_gate.mjs 是 CI required job（PR-level，绕不过）；(2) entry_protocol_check 校验 PR body 字段（GitHub-level，对所有 commit 来源等价）。新窗口 agent 即使不读本文件，只要提 PR 就会被门拦下，错误信息指向 DEPTH_LEDGER §A 的下一接线项。
