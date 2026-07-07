# Open Science → FAR-Chain 融合设计（设计阶段 · 不动代码）

> **状态标签（诚实）**：本文档全部建议均为 **DESIGN_PROPOSED**，非当前完成态。任何条目落地须经 `scripts/depth_gate.mjs` W1-W7/L1/L2 门 + keystone evidence bot CI 双跑写回 `WIRED_GREEN`，agent 不得手填。
>
> **本文件不动代码**（用户指令 2026-07-05）。它是把 `guanxiaol/open-science`（已镜像至 `<REPOSITORY_ROOT>/../_reference_repos/open-science-mirror/`）的优秀工程模式融合进 FAR-Chain 设计阶段的产出，由 11-agent workflow（`open-science-fusion-research`，787K tokens / 214 工具调用 / 0 错误）的证据驱动。
>
> **层级定性先行**（§1）：Open Science 是**执行层 AI 研究工作区**（实为 Claude Code 分支再品牌化），FAR-Chain 是**验证层声明级裁决内核**。两者在「反剧场 / provenance 不可自填」上高度同构，但在「谁来裁决」上本质不同（OS=LLM-reviewer；FAR-Chain=确定性 R0-R9 内核）。**融合 = 把 OS 的工程范式（如何强制不可自填、如何 fail-closed、如何缩窄伪造窗口）迁过来，绝不迁移 OS 的 LLM-裁决语义。**
>
> **不动红线**：本文档所有建议遵守 FAR-Chain 五值裁决枚举固定（禁第六值）、LLM 永不作最终裁决者、反剧场（sentinel/proof artifact 必须由系统持有事实重导出）、禁手填裸统计数字、状态标签诚实。

---

## 0. TL;DR

| 维度 | 结论 |
|------|------|
| **方向印证** | FAR-Chain 的反剧场红线、FEC 强制门、自排除 canonical-hash、确定性内核、GV 跨语言三轴 **均已被 OS 以不同实现独立抵达**——方向正确，6 处收敛点（§3）证明 FAR-Chain 不是在重发明，而是在验证层补齐 OS 在执行层用到的同一批工程不变式。 |
| **最大活体缺口** | FAR-Chain 自己的反剧场检测器（20 个 detector + `runAntiTheaterLint`）**已写好但完全没接进实时 seal/verdict 路径**——`orchestrator.ts:199` 把 `antiTheaterFindings` 硬编码为 `[]`，导致 `verdict_kernel_v2.ts` 的 R-anti-theater-fail / seed-cherry / R8-warn **永不触发**。这是 FAR-Chain 当前最大的反剧场张力点，与 OS 无关，但 OS 的 fail-closed 服务门范式（§4.1）提供了「如何把离线检查接进实时路径」的模板。 |
| **HIGH 转移缺口** | 14 条（§4）。最高杠杆 4 条：① sandbox 进程组 kill（防 Python 子孙成孤儿）② sandbox seal 时序缩窄伪造窗口 ③ verifier AST 结构门 ④ LLM 输出不得自证 provenance（OS `data_vid=None` + harness 注入 forged marker 的逐字同构）。 |
| **LOW/NONE 转移** | universal-llm 翻译网关、Skills progressive disclosure、MCP stdio 工具服务、Drizzle 迁移集、metadata.yaml agent 定义——**FAR-Chain 不是 agent 工作区，这些转移性低或为零**（§5 诚实说明）。 |
| **OS 的诚实局限** | OS 没有确定性裁决内核（reviewer 是 LLM）、没有 verdict 落库哈希链、没有 cross-lang golden vector、没有「writetrace」（该术语在 OS 仓库 0 命中，是误称）。FAR-Chain 在这些维度反而更成熟，**不可向 OS 看齐而退化**。 |

---

## 1. 层级定性：为什么这不是「抄」

### 1.1 Open Science 是什么

`guanxiaol/open-science` 是一个**本地优先、模型无关的 macOS 生物信息 AI 研究工作区**。证据链：

- `app/backend/src/universal-llm.mjs`（48907 字节）的 `sanitize-runtime.mjs` 做长字节替换：`CLAUDE→SCIENC` / `Claude→Scienc` / `claude→scienc`——**这是 Claude Code 的分支再品牌化**。
- 内部模型槽位 `science-sonnet-4-6` / `science-opus-4-6` / `science-haiku-4-5-20251001` 实为 `claude-*` 模型 ID 的再品牌包装。
- 内部走 Anthropic Messages API：`/v1/messages`、`tool_use`/`tool_result`、`message_start`/`text_delta`/`message_stop` SSE——`universal-llm.mjs` 是一个 Anthropic↔OpenAI 双向翻译网关，让外部 OpenAI-compatible 上游（DashScope 等）能喂进内部 Anthropic 协议。
- `runtime/BUILD.json`：`{"flavor":"release","platform":"darwin-arm64"}`——macOS-only 发行。

它的核心是 **agent 工作区**：long-lived Python 内核（`kernel_worker.py` 1335 行）+ skills 系统（`runtime/skills/*`）+ 内置 agent（`runtime/agents/<name>/metadata.yaml`）+ 本地 MCP 工具服务器（`runtime/mcp-servers/bio-tools`）+ 批计算沙箱（`wrapper.sh.tmpl` + `gitScanWorker.js`）。

### 1.2 FAR-Chain 是什么

FAR-Chain 是 **AI4S 科学声明的声明级验证层**——可独立复算、防篡改、反剧场的验证内核（非测试套件、非 agent 工作区）。裁决由确定性 R0-R9 cascade 纯函数给出，**LLM 永不作最终裁决者**（`verdict_kernel_v2.ts` 类型层零 LLM 输入路径，import 段无任何 LLM 模块）。

### 1.3 融合的边界

| 层 | OS | FAR-Chain | 融合方向 |
|----|----|-----------|----------|
| **裁决者** | LLM-reviewer（prompt 约束） | 确定性 R0-R9 内核（类型层排除 LLM） | **不融合**（FAR-Chain 更严，向 OS 看齐 = 退化） |
| **provenance 不可自填** | harness 隐式持有 + reviewer 三级 trust + `data_vid=None` 回填 | canonicalHash/proofHash/fecHash 自排除重算 + verifier recompute 白名单 | **双向收敛**（§3.1） |
| **fail-closed 强制门** | `gate.py apply_gate_tier1` 服务期强制 / 构造期 pristine | FEC mandatory gate + ASK-9 sealer + DB trigger | **双向收敛**（§3.2） |
| **沙箱隔离** | bind-mount（macOS）+ setsid 进程组 + sentinel 重导出 | 用户态 Node spawn（自承非物理隔离，07_RISK_REGISTER §188） | **OS → FAR-Chain 单向补强**（§4.2-4.4） |
| **执行模型** | long-lived Python namespace 复用 + bash watchdog | 一次性 venv spawn（cold-start per claim） | **可选借鉴**（§4.7 执行指纹优先） |
| **工具调用** | MCP stdio + skills progressive disclosure | 无（确定性内核不需要「agent 选工具」循环） | **不融合**（§5） |

**一句话**：把 OS 当作「执行层如何强制反剧场不变式」的工程范式库来读，而不是当功能模板来抄。

---

## 2. 融合矩阵总览

| ID | 缺口 / 收敛点 | OS 机制（证据） | FAR-Chain 现状 | 转移性 | §C 落点建议 |
|----|---------------|-----------------|----------------|--------|-------------|
| C-1 | 反剧场红线：provenance 不可自填 | `data_vid=None` 强制回填 + harness 注入 forged marker | canonicalHash 自排除 + verifier recompute 白名单 | **收敛** | — |
| C-2 | fail-closed 强制门 | `gate.py` 服务期 fail-closed / 构造期 pristine | FEC mandatory gate + ASK-9 + DB trigger | **收敛** | — |
| C-3 | LLM 不裁决 | reviewer `excluded_tools` 黑名单（工具层） | R0-R9 类型层零 LLM 输入路径 | **收敛**（FAR-Chain 更强） | — |
| C-4 | 自排除 canonical-hash | `content_snapshots` hash PK | proofHash/fecHash 自排除 | **收敛** | — |
| C-5 | 冻结契约 artifact | `schemas.json` verbatim 冻结 | 12 GV + W6b 运行时一致门 | **收敛** | — |
| C-6 | 名册从盘派生 | `run_server.py` 扫 `lib/` 派生可启动集 | depth_gate AST CallExpression 计数 | **收敛** | — |
| **F-1** | **anti-theater detector 未接实时路径** | OS 无对应（FAR-Chain 自身缺口） | `orchestrator.ts:199` 硬编码 `antiTheaterFindings: []` | **HIGH** | **FUSION-OS-1** |
| F-2 | sandbox 进程组 kill | `setsid timeout --foreground` + `kill -- -$pgid` | Node `spawn({timeout})` 只杀直系子进程 | **HIGH** | FUSION-OS-2 |
| F-3 | sandbox seal 时序缩窄伪造窗口 | sentinel 重导出在 tar 之后、.phase 之前 | offline_package 无时序约束 | **HIGH** | FUSION-OS-3 |
| F-4 | sandbox fs 预扫 | `gitScanWorker.js` O_NOFOLLOW + gitdir-cap + 容器检测 | workingDir 无预扫 | **HIGH** | FUSION-OS-4 |
| F-5 | verifier AST 结构门 | `kernel.py` AST 白名单（exec 前拒绝 class/顶层调用） | verifier 无加载期结构门 | **HIGH** | FUSION-OS-5 |
| F-6 | LLM 输出不得自证 provenance | `data_vid=None` + forged marker 注入 | LLM 摘要产物可自带 sourceAnchor | **HIGH** | FUSION-OS-6 |
| F-7 | 执行指纹（wall/cpu/peak_rss） | `kernel_worker.py:278-316` per-cell 三元组 | StatisticalResult 无执行指纹 | **HIGH** | FUSION-OS-7 |
| F-8 | secret 剥离 + dlopen 守卫 | `kernel_worker.py:170-266` | sandbox 无 secret 剥离 | **HIGH** | FUSION-OS-8 |
| F-9 | 内容寻址 blob CAS 表 | `content_snapshots` hash PK + 引用去重 | 有 hash 体系无统一 CAS 表 | **HIGH** | FUSION-OS-9 |
| F-10 | derivable 标记 | `host_call_log.derivable` 列 | evidence 行无 derivable 标记 | **HIGH** | FUSION-OS-10 |
| F-11 | DB CHECK 固化枚举 | `verification_checks.verdict` CHECK 约束 | 五值只在 TS 层强制 | **HIGH** | FUSION-OS-11 |
| F-12 | supersede 前向指针 | `memories.superseded_by` 自指 FK | verdict 无 supersede 链 | **HIGH** | FUSION-OS-12 |
| F-13 | literal vs derived form 校验 | reviewer "Agreement is not verification" | 只比对 supportsClaim 布尔 | **HIGH** | FUSION-OS-13 |
| F-14 | identifier 类声明 not-found 仍定罪 | reviewer fabricated-references EXCEPTION | R0-R9 无此确定性规则 | **HIGH** | FUSION-OS-14 |
| L-1 | universal-llm 翻译网关 | Anthropic↔OpenAI 双向翻译 | profile→adapter registry（Qwen 原生 OpenAI 兼容） | **LOW** | — |
| L-2 | Skills progressive disclosure | 三级加载 | FAR-Chain 非 agent 工作区 | **LOW** | — |
| L-3 | MCP stdio 工具服务 | Tier1Server 脚手架 | 确定性内核不需要 | **LOW**（仅 V2） | — |
| L-4 | Drizzle 迁移集 | 100+ 迁移幂等纪律 | better-sqlite3 + 数字前缀 | **MEDIUM**（借鉴纪律） | — |
| L-5 | metadata.yaml agent 定义 | 声明式 agent | FAR-Chain 无通用 agent | **LOW** | — |

---

## 3. 收敛点（方向印证，不迁移）

这 6 处证明 FAR-Chain 与 OS 在工程不变式上独立收敛。**记录它们是为了让评审看到方向一致性，不是为了「迁移」——它们已在 FAR-Chain 落地。**

### C-1 反剧场红线：provenance 不可自填

- **OS**：`figure-composer/kernel.py:derive_outline` 对每个 panel 强制 `p["data_vid"]=None`，注释「pixels cannot encode a workspace artifact id; fill those in yourself from the session's data refs」。reviewer system_prompt 收到的 payload 由 harness 预标记 citation 来源类型 `(pointer-grammar injection)` / `(agent-authored artifact — forged citation)` / `(user upload — unauthenticated citation)`，agent 自己改不了——forged marker 即使无真实 source 可 open 也直接 fail。
- **FAR-Chain**：`fec/compiler.ts:108-138` `computeFecHash` 显式排除 `fecHash` 自身（自引用规避）+ `integrityFlags`（derived）；`falsifiability/verifier.ts:42-54` `recomputeVerdictHash` 白名单含 `verdictTraceHash`，篡改 trace → hash 失配 → 捕获。
- **结论**：两边都把「sentinel/proof artifact 必须由系统持有的事实重导出」作为顶层不变式。FAR-Chain 在 hash 链层落地，OS 在 payload-tag 层落地。**FAR-Chain 的实现更彻底**（哈希重算 + DB trigger 物理兜底），不需向 OS 看齐。

### C-2 fail-closed 强制门

- **OS**：`gate.py apply_gate_tier1` 只在 server `main()` 里调（服务期），`build_server()` 不动（构造期 pristine 供测试）。门里出现 `domains.json` 不知道的名字 → `RuntimeError`；门把服务器掏空 → `RuntimeError('... this domain is not cleared to serve standalone')` 拒绝启动，**而不是端一个空工具列表**。
- **FAR-Chain**：`fec/orchestrator.ts:120-152` `compileFec → enforceFecMandatoryGate → assertFecGate`，HARD_FAIL → `fecGate.allowed=false` → `verdict=UNTESTED`（覆盖 kernel 结果）；`proof_envelope/sealer.ts:41-55` ASK-9 硬门 + `hasAntiTheaterViolation` 双 throw；`schema/migrations/0010` DB trigger 物理兜底。
- **结论**：同一范式——「服务期/生产期 fail-closed 强制红线，构造期/测试期 pristine 供全量验证」。FAR-Chain 双层保险（kernel R1 类型层 + orchestrator fecGate 运行时覆盖）比 OS 单层 gate 更强。

### C-3 LLM 不裁决（FAR-Chain 更强）

- **OS**：reviewer `excluded_tools: [python, bash, r, save_artifacts, edit_file, ...]` 是**工具层硬裁剪**（实测驱动：n=30 prod rounds 显示 python 占 41% 工具调用全是 rubric-forbidden 重算）。
- **FAR-Chain**：`verdict_kernel_v2.ts:25-33` import 段无任何 LLM 模块；`VerdictKernelInput`（12 字段）无「LLM 意见」入口——**编译期就不存在该路径**，比 OS 的运行时工具黑名单更强（OS 的 reviewer 仍是 LLM，只是禁了部分工具）。
- **结论**：FAR-Chain 在「LLM 不裁决」上严格优于 OS。**不可向 OS 看齐**。但 OS 的「实测驱动裁剪 + 量化理由写进注释」纪律可借鉴用于 §4.5 verifier 结构门的设计论证。

### C-4 自排除 canonical-hash

- **OS**：`content_snapshots` 表 PK 直接是 hash，`artifact_versions` 上 `lineage_snapshot_hash`/`env_snapshot_hash` 只存指针，同份内容按 hash 去重。
- **FAR-Chain**：`proof_envelope/proof_hash.ts:40-63`（V1）+ `v2/proof_hash.ts:47-91`（V2）+ `fec/compiler.ts computeFecHash`——三层自排除 + 嵌套 hash 互验（fecHash→proofHash）。
- **结论**：收敛。FAR-Chain 的嵌套 hash 互验（V2 `proof_hash.ts:49-54` 先断言 `envelope.fecHash === computeFecHash(envelope.fecSnapshot)`）比 OS 的单层 blob 引用更严。

### C-5 冻结契约 artifact

- **OS**：`tier1.py load_schemas` 用 `importlib.resources` 读包内 `schemas.json`（25KB 冻结快照），`list_tools` 把 `input_schema`/`output_schema` 原样塞进 `Tool(...)`——「期望输入/输出形状是冻结 artifact，不是生成出来的」。
- **FAR-Chain**：`golden_vectors/cases/GV-01..GV-12.json`（12 条落盘）+ `verify_golden.ts:176-237` 三轴（node/python/browser）+ `depth_gate.mjs:623-654` CHECK-W6b 运行时一致门。
- **结论**：收敛。FAR-Chain 的 W6b 把「静态 schema 通过 ≠ 判定一致」也堵死（spawn verify-golden 解析 dump.status），比 OS 的静态 schema 冻结更严。

### C-6 名册从盘派生（禁第二份名册）

- **OS**：`run_server.py` 合法 server 列表由 `lib/` 目录扫描派生（`p.name.startswith("mcp_") and (p/"server.py").is_file()`），不在代码里再抄一份 roster。
- **FAR-Chain**：`depth_gate.mjs:174-249` `countProductionCallers` walk `src/` 对每个符号做 AST CallExpression 计数（非字面 grep），排除定义自身 / re-export / tests/ / barrel / 死分支。
- **结论**：收敛。FAR-Chain 的 AST 计数比 OS 的目录扫描更严（防 ghost-import 与字符串字面量伪装 caller）。

---

## 4. HIGH 转移缺口（14 条，每条映射 §C 落点）

> 每条给出：① OS 机制 + 证据 ② FAR-Chain 现状 ③ 单一真实依赖（满足 CLAUDE.md §1）④ 落点 file:line ⑤ §C 行建议 ⑥ 验收（RED→GREEN）。所有 status 标 `NOT_BUILT`（诚实），待 keystone bot 写回。

### F-1 / FUSION-OS-1：anti-theater detector 接进实时 seal/verdict 路径（最高杠杆）

**这是 FAR-Chain 自身最大的反剧场缺口，OS 无对应物，但 OS 的 fail-closed 服务门范式（C-2）提供了「如何接」的模板。**

- **现状（workflow far:sandbox+fec agent 实证）**：
  - `src/anti_theater/lint.ts:39-81` `runAntiTheaterLint` 按 `DETECTORS` 冻结顺序遍历 **20 个确定性 detector**（fake_pass/label_only/judge_override/posthoc_threshold/metric_swap/dataset_drift/data_hash_fake/scope_launder/missing_raw/seed_cherry/workflow_digest/report_mismatch/phack_alpha/phack_correction/hark/stopping_rule/optional_stopping/dep_float_drift/overfit/fake_degraded），产 `DetectorFinding[]` → `computeAntiTheaterScore`（7 桶去重扣分）+ `applyVerdictConstraint`（取严 forcedVerdict）+ `canSealConfirmed` 三重条件。
  - **唯一生产 caller 是 `src/cli/commands/verify.ts:412`（离线 verify/replay 路径）**。
  - `src/fec/orchestrator.ts:199` `buildVerdictKernelInput` 构造 kernel 输入时 `antiTheaterFindings: []` **硬编码空数组**。
  - 后果：`verdict_kernel_v2.ts:296`（R-anti-theater-fail → UNTESTED）、`:397`（seed-cherry-picking 检测）、`:490`（R8 warn）**在实时生产路径永不触发**。`legacy_kernel_adapter.ts:52` 同样硬编码 `[]`。
- **单一真实依赖**：`runAntiTheaterLint` 的 20-detector 产出投影成 `KernelAntiTheaterFinding[]` 注入 `buildVerdictKernelInput`（真实 detector 执行，非空数组）。
- **落点**：
  - `src/fec/orchestrator.ts:199`（替换 `antiTheaterFindings: []`）
  - `src/agent_loop/verdict_stage.ts`（同步，agent_loop 路径也要喂料）
  - `src/falsifiability/legacy_kernel_adapter.ts:52`
- **§C 行建议**：
  ```
  FUSION-OS-1 | runAntiTheaterLint(fec,sandbox,statistics)→KernelAntiTheaterFinding[] | src/fec/orchestrator.ts:199 | tests/fec/anti_theater_wired.test.ts::seal_path_consumes_anti_theater_findings | (red TBD) | NOT_BUILT | — | —
  ```
- **验收（RED→GREEN）**：
  - RED：构造一个 seed-cherry-picking 攻击语料（`golden_vectors/attacks/seed_cherry.json`），当前实时 seal 路径产出 `CONFIRMED`（detector 没喂料）。
  - GREEN：接线后实时路径产出 `UNTESTED` + `decisiveRuleId='R-anti-theater-fail'` + `reasonCodes` 含 seed-cherry 命中。
  - **反剧场自检**：detector 产出必须从 `runAntiTheaterLint` 单源投影（呼应 F-13），禁止 caller 手填 `antiTheaterFindings`。
- **风险**：20 detector 全跑有性能成本。OS 范式启示：detector 应在 FEC compile 后、verdict kernel 前的固定 stage 跑一次，结果随 `KernelAntiTheaterFinding[]` 注入，不在 kernel 内重复执行。
- **依赖**：无（detector 已写好，纯接线）。

### F-2 / FUSION-OS-2：sandbox 进程组 kill（防 Python 子孙成孤儿）

- **OS 机制**：`wrapper.sh.tmpl` `setsid timeout --foreground --kill-after="$OPW_GRACE" "$OPW_JOB_TIMEOUT" bash run.sh &; wpid=$!` —— setsid 让 workload 进自己的 session，`--foreground` 让 timeout/run.sh/所有后台子孙共用同一个进程组 `$wpid`，看门狗 `kill -TERM -- -$wpid`（负号=组播）精确命中 workload 全员，wrapper 自己永不在 blast radius 内。
- **FAR-Chain 现状**：`src/science_harness/sandbox_runner.ts:259-377` `spawnVenv` 用 `child_process.spawn(pythonCmd, [SANDBOX_RUNNER_PY], {env, stdio, timeout})`——Node 的 `spawn({timeout})` **只杀直接子进程**，Python 子孙（numpy/OpenBLAS/MKL 线程池、torchrun、gfortran/MPI）可成孤儿继续消耗资源，甚至写出后续被 manifest 收割的 artifact（反剧场风险）。
- **单一真实依赖**：venv 子进程以独立进程组启动 + 超时按进程组 kill（`process.kill(-pgid)`）。
- **落点**：`src/science_harness/sandbox_runner.ts:284`（spawn 行）+ 超时处理块。
- **§C 行建议**：
  ```
  FUSION-OS-2 | spawn detached=true + process.kill(-pgid) 组播清理 | src/science_harness/sandbox_runner.ts:284 | tests/science_harness/sandbox_pgroup_kill.test.ts::timeout_kills_python_grandchildren | (red TBD) | NOT_BUILT | — | —
  ```
- **验收**：RED——sandbox 脚本 `import subprocess; subprocess.Popen(["sleep","300"])` + timeout=2s，当前 sleep 子进程存活（pgid 不被杀）；GREEN——接线后子进程随主进程组被 kill（用 `pgrep -P` 或读取 `/proc` 验证）。
- **跨平台**：Windows 无 setsid/pgid 等价物，退化到 `taskkill /T`（tree kill）。须在 `sandbox_runner.ts` 内平台分支，**不可硬编码 POSIX**（违反零容忍 #7）。

### F-3 / FUSION-OS-3：sandbox seal 时序缩窄伪造窗口

- **OS 机制**：`wrapper.sh.tmpl` 的关键时序——tar 收割（可能跑数分钟）→ **sentinel 重导出**（从 wrapper 持有的 rc/wall/deadline 重算 `.job_timeout_fired`/`.deadline_fired`）→ `.phase` 写入。注释明写「Deriving immediately before the .phase write shrinks the forgeable window from minutes to the two adjacent statements below」。任何 `.phase` 之后写入的 sentinel 因 newer-than-`.phase` 被 probe 丢弃。
- **FAR-Chain 现状**：`src/far_proof/offline_package.ts` `packageFarProofBundle` 有预飞 + 写后自检双门（`verifyFarProofBundle` 打包前 + `verifyFarProofPackageIntegrity` 写后重算 integrityHash），但**没有「seal 写入必须是收割后最后一步，且后续 workload 写入因 newer 被 stale」的时序约束**。
- **单一真实依赖**：proofHash/integrityHash 的计算与写入发生在所有 workload 可写输入收割完毕之后的**最后一条语句**，且 seal 时间戳锚定使后续 workload 写入可被判 stale。
- **落点**：`src/far_proof/offline_package.ts:129-146`（preflight 块）+ `packageFarProofBundle` 末段 seal 写入。
- **§C 行建议**：
  ```
  FUSION-OS-3 | seal 写入在收割后最后一步 + newer-than-seal 判 stale | src/far_proof/offline_package.ts:packageFarProofBundle | tests/far_proof/seal_window.test.ts::post_seal_write_detected_as_stale | (red TBD) | NOT_BUILT | — | —
  ```
- **验收**：RED——在 integrityHash 写入后、tar 压缩前注入一个新 artifact 文件，当前自检可能因排序未捕获；GREEN——seal 时间戳锚定后，新写入被 `mtime > seal_time` 判 stale 并 throw。
- **关联**：与 F-6（LLM 不得自证 provenance）同源——都是「系统持有事实重导出，缩窄 workload 自填窗口」。

### F-4 / FUSION-OS-4：sandbox fs 预扫（gitScanWorker 模式）

- **OS 机制**：`app/backend/src/sandbox/gitScanWorker.js` 沙箱启动前扫描授予写权限的根目录：
  - `.git` 洪水防护：`O1=1000`（gitdir-cap）/`_1=4096`（probe-budget）/`l1=200000`（全局 visited）/`u1=512`（每容器子项），任一触发即抛错拒绝启动。
  - 容器检测：`U3()` 检 `/.dockerenv` / `/run/.containerenv` / `/proc/1/cgroup` 含 docker/lxc/kubepods。
  - 符号链接攻击防御：`openDirNofollowUnder` 用 `O_DIRECTORY|O_NOFOLLOW` 打开父目录 + `readlink('/proc/self/fd/${fd}')` 验证指向 + 逐组件下钻拒绝 `..`。
  - DNS 死路：`M3` resolv.conf 不写 nameserver，强制走宿主 SOCKS5h 代理。
- **FAR-Chain 现状**：`sandbox_runner.ts` `workingDir` 无 `.git`/符号链接/容器预扫；`dataset_resolver`（P1-6 host 白名单）未实现。`offline_package.ts:274-279` 已有「symlink not allowed in offline bundle」单点检查，但不在 sandbox 启动期。
- **单一真实依赖**：sandbox 启动期对 `workingDir` 做预算上限扫描（.git 洪水 + 符号链接逃逸 + 容器检测），违例 fail-closed 拒绝启动。
- **落点**：`src/science_harness/sandbox_runner.ts` 新增 `preflightWorkingDir(workingDir)` 阶段（spawn 前）+ `src/science_harness/dataset_resolver.ts`（host 白名单）。
- **§C 行建议**：
  ```
  FUSION-OS-4 | preflightWorkingDir 预算扫描(.git-cap/symlink/container) | src/science_harness/sandbox_runner.ts:spawnVenv 前 | tests/science_harness/preflight.test.ts::git_flood_and_symlink_escape_rejected | (red TBD) | NOT_BUILT | — | —
  ```
- **验收**：RED——`workingDir` 含 1001 个 `.git` 目录或 `→ ~/.ssh` 符号链接，当前 sandbox 正常 spawn；GREEN——预扫抛错拒绝启动。
- **降级声明**：FAR-Chain 用户态沙箱弱于 OS bind-mount 模型，符号链接防御是「降级版」（无 mount namespace 隔离），须在注释诚实声明（呼应 `sandbox_runner.ts:7-9` 已有诚实边界）。

### F-5 / FUSION-OS-5：verifier AST 结构门（kernel.py 模式）

- **OS 机制**：`customize/SKILL.md` + `skill-creator/SKILL.md`「Kernel sidecars」——sidecar 在 exec `kernel.py` 前过结构校验。顶层只允许：(a) `def`/`async def`（禁装饰器）(b) `import`/`from...import`（禁 `*`）(c) 字面量常量赋值。拒绝：`class`、顶层调用、`if`/`for`、非字面量赋值、`_` 前缀名、非字面量默认参数。门在两处跑：`edit()` 时返回 `sidecar_gate:{ok,error?}` 预览；`publish()` 时 structural reject 直接拒绝发布。
- **FAR-Chain 现状**：`src/fec/compiler.ts` `compileFec` 是确定性 10-check 编译器，但**没有「verifier 插件加载期结构门」**——任何挂在 verdict 路径上的 verifier 目前靠 `contracts.ts` 的 `compiledBy:'deterministic_compiler'` 字面量类型约束，无 AST 级强制。
- **单一真实依赖**：verifier 插件加载期过 AST 结构门，禁顶层网络/IO/LLM 调用（与 C-3「LLM 不裁决」类型层排除同源，但作用在插件加载而非 kernel import）。
- **落点**：新建 `src/falsifiability/verifier_structural_gate.ts` + 接进 verifier registry 加载路径。
- **§C 行建议**：
  ```
  FUSION-OS-5 | verifier AST 结构门(禁顶层 network/IO/LLM call) | src/falsifiability/verifier_structural_gate.ts:loadVerifier | tests/falsifiability/verifier_gate.test.ts::verifier_with_top_level_fetch_rejected | (red TBD) | NOT_BUILT | — | —
  ```
- **验收**：RED——一个含顶层 `fetch('http://...')` 的 verifier 文件当前可被 registry 加载；GREEN——加载期 structural reject。
- **降级**：FAR-Chain verifier 是 TS 不是 Python，结构门用 TS Compiler API（`scripts/lib/code_analysis.mjs` 已有 `tokenize`/`codeOnlySource` 基础设施，depth_gate 已在用）。

### F-6 / FUSION-OS-6：LLM 输出不得自证 provenance

- **OS 机制**：figure-composer `derive_outline()` 从现有 PNG 反推 outline 时，对每个 panel 强制 `p["data_vid"]=None`（「pixels cannot encode a workspace artifact id」）。reviewer payload 由 harness 预标记 `(agent-authored artifact — forged citation)`——reviewer 看到 forged marker 即使无真实 source 可 open 也直接 fail（「This is misconduct, not domain recall」）。reviewer 三级 provenance trust：(1) Session source docs（唯一 trust-granting，harness provenance-verified）(2) Attachments（agent work products，不携带 provenance 保证）(3) assistant prose（仅 flag 会误导 acting 的）。
- **FAR-Chain 现状**：LLM 摘要/翻译产物（如 `agent_loop/verdict_stage.ts` 的 evidence 收集、`qwen_vl_adapter` 的图表解读）**可自带 `sourceAnchor` 字段**——没有「LLM 产出不得自带 sourceAnchor，必须由系统哈希重算绑定」的强制。
- **单一真实依赖**：LLM 产出的所有 provenance 字段（sourceAnchor/sourceId/citationId）强制留空（`null`），由系统侧 `canonicalHash` 重算绑定（与 `verifier.ts recomputeVerdictHash` 同条件）。
- **落点**：
  - `src/falsifiability/external_facts.ts`（外部事实源）
  - `src/far_proof/offline_package.ts`（provenance anchor）
  - `src/agent_loop/verdict_stage.ts`（evidence 收集产物）
  - 新增 provenance-class tag：`system-derived` / `llm-asserted`（forged class）/ `user-uploaded`（unauthenticated）
- **§C 行建议**：
  ```
  FUSION-OS-6 | LLM 产出 provenance 字段强制 null + 系统 hash 重算绑定 | src/falsifiability/external_facts.ts:bindProvenance | tests/falsifiability/llm_provenance.test.ts::llm_asserted_anchor_flagged_forged | (red TBD) | NOT_BUILT | — | —
  ```
- **验收**：RED——LLM 产出带自填 `sourceAnchor='doi:10.1/abc'`，当前直接进 evidence；GREEN——强制 null + 系统 hash 重算，`provenanceClass='llm-asserted'` 时 verifier 直接降级（不计入 CONFIRMED 路径）。
- **关联红线**：这是 FAR-Chain 反剧场红线「sentinel/proof artifact/provenance anchor 必须由系统持有的事实重导出，不可由 workload/agent/被验证方自填」的**可执行化**——目前是泛化原则，落地缺强制点。

### F-7 / FUSION-OS-7：执行指纹（wall/cpu/peak_rss 三元组）

- **OS 机制**：`kernel_worker.py:278-316` 每 cell 前 `_reset_peak_rss()` 写 `5` 到 `/proc/self/clear_refs` 复位 VmHWM，结束后 `_read_peak_rss_kb()` 读 VmHWM 得本 cell 峰值；`_cpu_seconds()`=`RUSAGE_SELF`+`RUSAGE_CHILDREN` 的 utime+stime；wall 用 `time.perf_counter()`。三元组 `{wall_s, cpu_s, peak_rss_kb}` 随响应返回。**注意**：OS 没有确定性 seeding（`grep` 确认无 `random.seed`/`PYTHONHASHSEED`），「复算」仅靠指纹比对 + 错误归因，**不是 bit-exact replay**。
- **FAR-Chain 现状**：`StatisticalResult` 无执行指纹——「可独立复算」当前缺轻量复算指纹，复算时若结果数值一致但执行资源量级差异巨大（如本该跑 30s 的 SyPy 验证复算只跑 0.01s），无法暴露「剧场复算」（声明方预存结果假装复算）。
- **单一真实依赖**：sandbox 每次执行采集 `{wall_s, cpu_s, peak_rss_kb}` 三元组，随 `StatisticalResult` 持久化，复算时比对量级（非 bit-exact，但廉价可比）。
- **落点**：`src/science_harness/sandbox_runner.ts` 输出收集层（Python 侧 `sandbox_runner.py` 已有 `wallClockMs`，扩展加 cpu/peak_rss）+ `src/falsifiability/types.ts` `StatisticalResult` 加 `executionFingerprint?` 字段。
- **§C 行建议**：
  ```
  FUSION-OS-7 | sandbox 采集 wall/cpu/peak_rss 三元组随 StatisticalResult 持久化 | src/science_harness/sandbox_runner.ts:collectResult | tests/science_harness/exec_fingerprint.test.ts::recompute_magnitude_mismatch_flagged | (red TBD) | NOT_BUILT | — | —
  ```
- **验收**：RED——一个预存结果的「剧场复算」（wall=0.01s，原跑 wall=30s），当前数值一致即过；GREEN——指纹量级差异 >10x 触发 `DEGRADED_SCOPE` + reasonCode `exec_fingerprint_mismatch`。
- **降级声明**：指纹非 bit-exact，须诚实声明（不可声称「完全可复现」，触禁用词红线）。Windows 退化到 `getrusage`（无 clear_refs，peak_rss 不准）。

### F-8 / FUSION-OS-8：secret 剥离 + dlopen 守卫

- **OS 机制**：`kernel_worker.py:170-177` 任何用户代码执行前，从 `OPERON_SECRET_VARS` 读名单逐个 `os.environ.pop`——即使 host 侧已清洗也不依赖。`:179-266` `sys.addaudithook` 监听 `ctypes.dlopen`，`OPERON_WRITABLE_ROOTS` 下的路径拒绝加载（攻击者写的 `.so`），裸 soname 与 `OPERON_DLOPEN_EXEMPT`（venv/R-libs + sys.prefix）放行。**关键反 monkeypatch**：hook 所需函数全部作 keyword-default 在 def 时捕获（`os.path.realpath`/`posixpath.normpath`/`posix.getcwd`），用户后续改 `os.readlink` 无法绕过。
- **FAR-Chain 现状**：`sandbox_runner.ts` 无 secret 剥离——若 sandbox 跑声明方提交的复算脚本，声明方脚本可 `os.environ['DASHSCOPE_API_KEY']` exfil。无 dlopen 守卫——声明方可塞恶意 `.so` 影响复算结果。
- **单一真实依赖**：sandbox spawn 前从 env 剥离 secret 白名单 + Python 侧 `addaudithook` 拒绝从 workingDir 加载原生模块。
- **落点**：`src/science_harness/sandbox_runner.ts` spawn env 构造块（剥离 `*_API_KEY`/`*_SECRET`/`*_TOKEN`）+ `repro/science_harness/sandbox_runner.py` 加 audithook。
- **§C 行建议**：
  ```
  FUSION-OS-8 | spawn env 剥离 secret + Python audithook 拒绝可写目录 dlopen | src/science_harness/sandbox_runner.ts:buildEnv | tests/science_harness/secret_strip.test.ts::api_key_not_in_sandbox_env | (red TBD) | NOT_BUILT | — | —
  ```
- **验收**：RED——声明方脚本 `print(os.environ.get('DASHSCOPE_API_KEY'))`，当前 leak；GREEN——剥离后 sandbox env 不含 key（白名单外全剥，最小权限）。

### F-9 / FUSION-OS-9：内容寻址 blob CAS 表

- **OS 机制**：`0004_content_snapshots.sql` `content_snapshots(hash text(64) PRIMARY KEY, content text, size_bytes, created_at)`，`artifact_versions.lineage_snapshot_hash`/`env_snapshot_hash` 只存指针，同份内容按 hash 去重。
- **FAR-Chain 现状**：已有 canonicalHash/proofHash/fecHash 哈希体系，但**缺一个统一的 blob CAS 表**——evidence payload、environment snapshot、kernel trace、FEC Plan 散落在各表，无去重 + 无「hash 即承诺」统一引用。
- **单一真实依赖**：新建 `far_blob_store(hash PK, bytes/ref, size)` 表，evidence/FEC Plan/kernel trace 按 hash 引用。
- **落点**：`schema/migrations/0013_far_blob_store.sql`（新建）+ `src/far_proof/offline_package.ts` 引用层。
- **§C 行建议**：
  ```
  FUSION-OS-9 | far_blob_store(hash PK) 统一 CAS + evidence/plan/trace 按 hash 引用 | schema/migrations/0013_far_blob_store.sql | tests/schema/blob_store.test.ts::same_content_deduped_and_tamper_detected | (red TBD) | NOT_BUILT | — | —
  ```
- **验收**：RED——同一份 FEC Plan 存两次 + 篡改其中一份，当前无统一检测；GREEN——CAS 去重（同 hash 一行）+ 篡改触发 hash 失配。
- **依赖**：append-only migration 铁律（落点约束 #8），0013 不可改 0001-0012。

### F-10 / FUSION-OS-10：derivable 标记（evidence 行）

- **OS 机制**：`0006_host_call_log.sql` `derivable integer DEFAULT 0 NOT NULL`——`derivable=1` 表示输出可由 args 重算（不存字节），`derivable=0` 才把结果存进 `data_inline`（小）或 `data_ref`（大，外部引用）。
- **FAR-Chain 现状**：evidence 行无 `derivable` 标记——评审/复算时无法区分「这个 evidence 可由系统 canonical 输入重算」vs「这个 evidence 是不可重算的外部观测」。
- **单一真实依赖**：每个 evidence/proof artifact 行带 `derivable` 标记，声明能否由系统持有的 canonical 输入重算；`derivable=1` 的工件评审时可重算验证（anti-theater：不信任 workload 自填字节）。
- **落点**：`schema/migrations/0014_evidence_derivable.sql`（加列）+ `src/falsifiability/repository.ts` 证据行 + canonical-hash 重算路径。
- **§C 行建议**：
  ```
  FUSION-OS-10 | evidence 行 derivable 标记 + derivable=1 强制重算验证 | src/falsifiability/repository.ts:recordEvidence | tests/falsifiability/derivable.test.ts::derivable_evidence_recomputed_on_verify | (red TBD) | NOT_BUILT | — | —
  ```
- **验收**：RED——`derivable=1` 的 evidence 字节被篡改，当前无重算验证；GREEN——verify 时重算 hash 失配 → 标 tampered。
- **关联**：与 F-3（seal 时序）、F-6（provenance 不可自填）同属反剧场「系统持有事实重导出」家族。

### F-11 / FUSION-OS-11：DB CHECK 固化五值枚举

- **OS 机制**：`0029_verification.sql` `verdict text NOT NULL CHECK (verdict IN ('pass','warn','fail','inconclusive'))`——枚举值在 DB 层强制，INSERT/UPDATE 越界直接被 DB 拒绝，不依赖 app 层自律。
- **FAR-Chain 现状**：五值裁决枚举（CONFIRMED/REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED）目前只在 TS app 层 + `depth_gate.mjs:161` `FROZEN_VERDICTS` Set + GV 校验强制，**DB 落库表无 CHECK 约束**。`0010_proof_envelopes_v2.sql:24-27` 有 `conclusion` 的 CHECK，但 verdict_nodes 表的 verdict 列无。

  > ⚠️ **erratum（2026-07-06 FUSION-OS-11 落地时纠正）**：本段「verdict_nodes 表的 verdict 列无 CHECK 约束」**与现实不符**——`0001_initial.sql:105-108` 已有列级 `CHECK (verdict IN ('CONFIRMED','REFUTED','INCONCLUSIVE','DEGRADED_SCOPE','UNTESTED'))`，`0004:22-24`（proof_envelopes.conclusion）+ `0010:24-27`（proof_envelopes_v2.conclusion）同有 CHECK。OS-11 验收 RED（INSERT `verdict='SUPER_CONFIRMED'` 当前 DB 接受）**基线即 GREEN**（0001 已拒绝）。OS-11 实际落地为**纵深防御 trigger**（`0013_verdict_enum_guard.sql`：BEFORE INSERT/UPDATE 第二层守卫，与列级 CHECK 正交——防 future migration DROP TABLE 重建漏带 CHECK 即丢失），非「首次加 CHECK」。
- **单一真实依赖**：verdict 落库表（verdict_nodes / proof_envelopes_v2）verdict 列加 `CHECK (verdict IN ('CONFIRMED','REFUTED','INCONCLUSIVE','DEGRADED_SCOPE','UNTESTED'))`。
- **落点**：`schema/migrations/0015_verdict_check.sql`（verdict_nodes 加 CHECK）+ 现有 trigger 重建纳入。
- **§C 行建议**：
  ```
  FUSION-OS-11 | verdict_nodes.verdict CHECK 固化五值枚举(禁第六值) | schema/migrations/0015_verdict_check.sql | tests/schema/verdict_check.test.ts::sixth_verdict_rejected_by_db | (red TBD) | NOT_BUILT | — | —
  ```
- **验收**：RED——`INSERT ... verdict='SUPER_CONFIRMED'`，当前 DB 接受；GREEN——DB 拒绝（CHECK 约束）。
- **关联红线**：五值裁决枚举固定（CLAUDE.md §5 最高红线）。注意 OS 是 4 值且语义含 warn/severity 正交维度，**只迁移 CHECK 机制，不搬具体值**。
- **依赖**：append-only + trigger 重建（落点约束 #8）——若 verdict_nodes 已有 immutable trigger，0015 须 DROP+CREATE 纳入新 CHECK。

### F-12 / FUSION-OS-12：supersede 前向指针（verdict 历史）

- **OS 机制**：`0026_memory.sql` `superseded_by text(36) REFERENCES memories(id) ON DELETE SET NULL` + 索引 `(user_id, superseded_by)`；`0045_artifacts_superseded_by.sql` 同构。旧行从不删除/不改正文，只写新行并在旧行设 `superseded_by` 指向新行。「活跃」行 = `superseded_by IS NULL`。
- **FAR-Chain 现状**：verdict / FEC Plan / proof envelope 需要历史保留（可复算、可审计），但当前 verdict_nodes 是 append-only 链式（prev_hash），无「同一 claim 的多次重评 supersede 关系」显式指针。
- **单一真实依赖**：verdict 行加 `superseded_by` 自指 FK，重评写新行 + 旧行设指针；查询当前有效裁决 = `WHERE superseded_by IS NULL`。
- **落点**：`schema/migrations/0016_verdict_supersede.sql` + `src/falsifiability/repository.ts` verdict 表 + `src/fec/orchestrator.ts` Plan 历史。
- **§C 行建议**：
  ```
  FUSION-OS-12 | verdict.superseded_by 自指FK + 重评写新行设指针 | schema/migrations/0016_verdict_supersede.sql | tests/falsifiability/supersede.test.ts::reverdict_supersedes_old_active_row | (red TBD) | NOT_BUILT | — | —
  ```
- **验收**：RED——同一 claim 重评后，当前无显式 supersede 关系（只能靠时间戳推断）；GREEN——重评写新行 + 旧行 `superseded_by` 指向新行，`WHERE superseded_by IS NULL` 返回唯一当前裁决。
- **注意**：FAR-Chain 已有 append-only 链式哈希（prev_hash），supersede 是**补充**语义层（同 claim 多次重评），不是替代。须在 migration 注释说明两者关系。

### F-13 / FUSION-OS-13：literal vs derived form 校验

- **OS 机制**：reviewer system_prompt 「Agreement is not verification」——`query_target_history` 检索结果带 `FORM:` 行时，值相等不够，区分 literal 常量 vs derived/formula/auto。「A silent change from a locked literal to a derived expression (or vice versa) is a warn-severity finding even when the resolved values are equal today」。
- **FAR-Chain 现状**：`agent_loop/verdict_stage.ts` 的「投票桥」（`legacy_kernel_adapter.ts:362-389` 注入 `pValue=0`/`effectSizeObserved=1`）只比对 `supportsClaim` 布尔——claim 声明「手填常数 effect=1.5」但内核算出是「公式导出 effect=1.5」，即使数值相等也应是不同 provenance class。
- **单一真实依赖**：`StatisticalResult` 加 `derivationForm: 'literal' | 'derived' | 'formula' | 'auto'`，kernel 比对时 form 不匹配即使数值相等也降级。
- **落点**：`src/falsifiability/types.ts` `StatisticalResult` + `src/falsifiability/verdict_kernel_v2.ts`（新规则或扩展现有 R-causal gate）。
- **§C 行建议**：
  ```
  FUSION-OS-13 | StatisticalResult.derivationForm + kernel form 不匹配降级 | src/falsifiability/verdict_kernel_v2.ts:evaluateStatistics | tests/falsifiability/form_mismatch.test.ts::literal_to_derived_silent_change_downgrades | (red TBD) | NOT_BUILT | — | —
  ```
- **验收**：RED——claim 声明 literal effect=1.5，内核算出 derived effect=1.5（form 不匹配），当前数值相等即 CONFIRMED；GREEN——form 不匹配触发 `INCONCLUSIVE` + reasonCode `derivation_form_mismatch`。
- **关联红线**：反剧场「sentinel 必须由系统重导出」的可执行化——不只比对值，比对值的 provenance form。

### F-14 / FUSION-OS-14：identifier 类声明 not-found 仍定罪

- **OS 机制**：reviewer fabricated-references EXCEPTION——总原则是「unsourced value 不 flag」（值可能来自窗口外），但唯一例外：外部引用类 checkable identifier（PMID/DOI/accession/`Author et al. YEAR`）若 drill 后追溯无果 = 仍是 finding。PRECEDENCE：一旦出现具体 identifier，此规则压倒一切 framing（hedging「I believe the PMID is...」不改判定）。
- **FAR-Chain 现状**：R0-R9 无此确定性规则——claim 带 DOI/dataset-accession 但无 harness-verified 来源，当前落 `UNTESTED`（宽松），而非 `REFUTED`（严）。
- **单一真实依赖**：R0-R9 cascade 加一条确定性规则（建议 R-identifier-fabrication，优先级在 R6 refutes 之前）：claim 声明带可校验 identifier（DOI/arXiv/accession）但系统侧无法 trace 到 harness-verified 来源 → 直接 `REFUTED`，而非 `UNTESTED`。
- **落点**：`src/falsifiability/verdict_kernel_v2.ts`（新规则，插在 R6 前）+ `src/falsifiability/external_facts.ts`（identifier 解析 + harness-verified 来源检查）。
- **§C 行建议**：
  ```
  FUSION-OS-14 | R-identifier-fabrication: 带 identifier 无 verified 来源→REFUTED | src/falsifiability/verdict_kernel_v2.ts:R-identifier-fabrication | tests/falsifiability/identifier_fabrication.test.ts::doi_with_no_verified_source_refuted | (red TBD) | NOT_BUILT | — | —
  ```
- **验收**：RED——claim 带 `doi:10.1/nonexistent` 无 verified 来源，当前 `UNTESTED`；GREEN——`REFUTED` + reasonCode `unverified_identifier`。
- **关联红线**：五值优先级（REFUTED > UNTESTED）。这条规则让「伪造引用」从「无法验证」（UNTESTED）升级为「证伪」（REFUTED），是反剧场的强姿态。
- **风险**：须区分「identifier 无法解析」（网络/数据库故障）vs「identifier 解析了但不支持 claim」。前者应 `UNTESTED`（环境问题，非伪造），后者才 `REFUTED`。OS 的「drill 追溯无果」语义须精确移植。

---

## 5. LOW/NONE 转移（诚实说明不抄）

### L-1 universal-llm 翻译网关（转移性 LOW）

- **OS**：`app/backend/src/universal-llm.mjs`（48907 字节）是 Anthropic Messages↔OpenAI Chat Completions 双向翻译网关——因为 OS 内部走 Anthropic 协议（Claude Code fork），外部上游是 OpenAI-compatible（DashScope 等），需要翻译层。
- **FAR-Chain**：`src/llm_gateway/gateway.ts:21-27` 是 profile→adapter registry dispatch（4 个固定 profile 枚举），**不做协议翻译**。竞赛 profile `competition_aliyun_qwen` 经 `openai` SDK 直连 DashScope（`qwen_adapter.ts:73-79` `new OpenAI({apiKey, baseURL, timeout})`）——**Qwen 原生暴露 OpenAI 兼容接口，无需翻译层**。
- **结论**：**不迁移**。FAR-Chain 没有 Anthropic-style 内部协议，引入 universal 网关 = 引入 FAR-Chain 不需要的复杂度。OS 的 fallback 触发矩阵分类（`error_classifier.ts:79-105` 区分可恢复 vs 致命）+ `attempts[]` 留痕纪律可借鉴，但 FAR-Chain `executeFallbackChain`（`fallback_chain.ts:78-156`）已有等价实现且更严（F11 绝不静默换模型 + chainExhausted 结构化返回）。

### L-2 Skills progressive disclosure（转移性 LOW）

- **OS**：三级加载（metadata 永驻 → SKILL.md body 触发时载入 → scripts/assets 按需）。
- **FAR-Chain**：不是 agent 工作区，没有「agent 选 skill」循环。但 verifier/evidence-collector 注册表 + golden_vectors（P1-4）+ real_backends（P2-1）**可套用 tiering 思路**：manifest 永驻（name + when-to-trigger）→ verifier 主体仅在对应 R 规则触发时载入 → golden vector 仅在具体分支用到时按需读。
- **结论**：仅作为 verifier registry（FUSION-OS-5 的配套）的设计灵感，不单独立项。

### L-3 MCP stdio 工具服务（转移性 LOW，仅 V2）

- **OS**：`runtime/mcp-servers/bio-tools` Python stdio 子进程 + Tier1Server 脚手架。
- **FAR-Chain**：确定性内核不需要「agent 选工具」循环——LLM 又禁裁决，没有 MCP 驱动的 agent loop。
- **结论**：仅 V2 external-API 路线（把 `recompute_canonical_hash`/`verify_golden_vector`/`compile_fec` 暴露给外部消费者）可参考此 stdio 形状。当前 P0/P1 不需要。

### L-4 Drizzle 迁移集（转移性 MEDIUM，借鉴纪律）

- **OS**：100+ Drizzle 迁移，模式高度一致：`IF NOT EXISTS` 可重跑 + `when-槽` 毫秒级时间戳作不可变去重键（多 PR 并发不撞序号）+ FK 子侧显式索引 + 分级 cascade 策略。
- **FAR-Chain**：`better-sqlite3` + 纯数字前缀（0010/0011/0012），多 agent 并发改 `schema/migrations/` 必撞序号。
- **结论**：**借鉴纪律，不引入 Drizzle**。具体可借鉴：① `IF NOT EXISTS`/`IF EXISTS` 让迁移可重跑（CI 重试无副作用）② FK 子侧列显式建索引（SQLite cascade 性能）③ 分级 cascade（claim 强拥有 evidence→CASCADE；proof↔artifact 互引→SET NULL）。`when-槽` 去重键需评估是否值得改编号体系（与现有 0001-0008 锁死纪律冲突，**不建议改**）。

### L-5 metadata.yaml agent 定义（转移性 LOW）

- **OS**：`runtime/agents/<name>/metadata.yaml` 声明式 agent（identity_prompt/working_style_prompt/excluded_tools/skills_locked）。
- **FAR-Chain**：无通用 agent。但「内核行为=声明式数据而非硬编码」可借鉴用于 R0-R9 内核——把规则开关/能力闸门做成 metadata 而非散落 if-else。
- **结论**：仅作为 `verdict_kernel_v2.ts` 重构的设计灵感，不单独立项。

### L-6 long-lived Python namespace 复用（转移性 MEDIUM）

- **OS**：`kernel_worker.py` long-lived Python 子进程 + JSON-per-line stdio 协议跨 cell 复用 namespace dict，避免 cold-spawn。
- **FAR-Chain**：`venvSandboxAdapter` 是一次性 spawn（每声明 cold-spawn）。
- **结论**：可选借鉴（性能优化），但优先级低于 F-7（执行指纹）和 F-2（进程组 kill）。常驻内核会引入状态污染风险（OS 自己也有 `__file__` 未设问题），须配套隔离设计。

### L-7 OS 沙箱 bind-mount 模型（转移性 NONE）

- **OS**：macOS bind-mount + `gitScanWorker` .git 分级 mask。
- **FAR-Chain**：用户态 Node spawn，自承非物理隔离（`sandbox_runner.ts:7-9` + 07_RISK_REGISTER §188）。
- **结论**：**不迁移**（平台不同 + 诚实声明不可包装成物理隔离）。FAR-Chain 须保持「best-effort 用户态隔离」的诚实降级声明，不可声称「物理隔离/strong isolation/tamper-proof」（触禁用词红线）。F-4 预扫是降级版补偿。

---

## 6. 落点约束（融合建议须过 12 条门）

> 源自 `far:plan+schema+gate` agent 实证。任何 FUSION-OS-* 建议落地须满足：

| # | 约束 | 来源 |
|---|------|------|
| 1 | 任何融合建议必须映射成 DEPTH_LEDGER §C 一行（id + single_real_dependency + proof_caller:line + proof_test），否则不可推进。不可把「加测试/改文档」冒充接线。 | `DEPTH_LEDGER.md §C` |
| 2 | 「接某模块进生产」验收口径 = `src/` 内 AST CallExpression 计数 ≥1（`countProductionCallers`），非测试引用、非 import、非字符串字面量。grep 命中不算。 | `depth_gate.mjs:174-249` |
| 3 | mandatory gate 类建议须在类型层强制必选形参（如 `fecV2`），不能靠运行时 if 检查（opt-in 死分支可被绕过）。`detectOptionalParam` 全匹配校验。 | `depth_gate.mjs:274-332` CHECK-W1 |
| 4 | 「完成」判据不可由实现方自填，须 CI 双跑物证（base-FAIL/head-PASS，base≠head，每侧 40-hex SHA 或纯数字 run-ID）。`verifyWiredGreenEvidence` CHECK-L2。 | `depth_gate.mjs:497-535` |
| 5 | 声称「本 commit 闭合某接线」，commit diff 须真 touch proof_caller 文件。`git diff-tree` 校验，防「大 commit 含一行真改动 + 大量无关改动」。 | `depth_gate.mjs:137-149,473-480` R6 |
| 6 | 引入新 verdict 规则或改判定优先级，须同步更新 12 条 GV + 过 W6b 运行时门（spawn verify-golden 解析 dump.status）。静态 schema 通过 ≠ 判定一致。 | `depth_gate.mjs:623-654` CHECK-W6b |
| 7 | 涉及「真实数学/统计」模块，验收不是「文件存在 + 有 Math 关键字」，而是 realMathSignal 在 return 路径（`dirHasRealMath` R12 收紧）。 | `depth_gate.mjs:345-382` CHECK-W5 |
| 8 | 加篡改检测列或改 AntiTheater 字段形态，须同步重建守护 trigger 把新列/新字段纳入 WHEN 守卫（DROP IF EXISTS + CREATE）。append-only 铁律不可破。 | `0011/0012_*.sql` |
| 9 | anti-theater 检查不能只靠应用层 verifier，须有 DB trigger 物理兜底（`trg_proof_envelopes_v2_anti_theater` F1）。 | `0010_proof_envelopes_v2.sql:57-64` |
| 10 | 扩展 verdict-critical 字段（reasonCodes/decisiveRuleId），须同时 (a) 加持久化列 (b) 纳入 proofHash/current_hash 白名单 (c) 双 verifier 重算对齐。三步缺一则篡改静默通过。 | `0012_verdict_trace_persist.sql` |
| 11 | **最高红线**：绝对不可引入第 6 个 verdict 值，不可让 LLM 给 verdict，不可改优先级序（DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED）。DB CHECK + GV + `FROZEN_VERDICTS` Set 三重锁。 | `depth_gate.mjs:161` |
| 12 | 进度判据不是 `pnpm test` 全绿（套件已绿且 25% 同义反复），而是「生产 caller 在真实输入上驱动了此前孤立逻辑 + 一条此前 RED 现只在真实路径 GREEN 的端到端测试」。重跑绿套件 = 零进度。 | `DEPTH_LEDGER.md §1` |

**FUSION-OS-1（最高杠杆）特别约束**：antiTheaterFindings 注入必须从 `runAntiTheaterLint` 单源投影（约束 #10），禁止 caller 手填——否则违反反剧场红线「proof artifact 不可自填」。

---

## 7. 推荐施工序（依赖序，非 ad-hoc）

> 遵守 CLAUDE.md §4「按顺序取下一项，不要 ad-hoc」。FUSION-OS-* 与现有 P0/P1/P2/P3 并列，**不可抢占 next_action=KEYSTONE_DEPTH_EVIDENCE_BOT**（§A 当前态）。

### 第一波：反剧场闭合（最高杠杆，无依赖）

1. **FUSION-OS-1**（anti-theater detector 接实时路径）——无依赖，detector 已写好，纯接线。这是当前最大反剧场缺口。
2. **FUSION-OS-6**（LLM 输出不得自证 provenance）——与 FUSION-OS-1 同源（反剧场「不可自填」家族），可并行设计。
3. **FUSION-OS-13**（literal vs derived form）——依赖 FUSION-OS-1（kernel 消费 antiTheaterFindings 后才好加 form 比对）。

### 第二波：sandbox 加固（依赖 P1-6 venv sandbox 真起，已 WIRED_RED）

4. **FUSION-OS-2**（进程组 kill）——P1-6 已落地，可直接加固。
5. **FUSION-OS-3**（seal 时序）——依赖 offline_package（已有）。
6. **FUSION-OS-4**（fs 预扫）——与 P1-6 dataset_resolver host 白名单协同。
7. **FUSION-OS-7**（执行指纹）——与 FUSION-OS-2 同落点（sandbox 输出收集）。
8. **FUSION-OS-8**（secret 剥离 + dlopen 守卫）——与 FUSION-OS-2 同落点。

### 第三波：schema 演进（append-only，可并行）

9. **FUSION-OS-11**（DB CHECK 五值枚举）——独立，最高红线加固。
10. **FUSION-OS-9**（blob CAS 表）——独立。
11. **FUSION-OS-10**（derivable 标记）——依赖 FUSION-OS-9（CAS 表）。
12. **FUSION-OS-12**（supersede 指针）——独立。

### 第四波：verifier 加固 + 内核规则

13. **FUSION-OS-5**（verifier AST 结构门）——独立，但配套 verifier registry tiering（L-2 借鉴）。
14. **FUSION-OS-14**（identifier fabrication REFUTED 规则）——依赖 FUSION-OS-6（harness-verified 来源标记）+ 同步 12 GV（约束 #6）。

### 不可阻塞

- **KEYSTONE_DEPTH_EVIDENCE_BOT**（§A next_action）——所有 §C 行（含 FUSION-OS-*）从 WIRED_RED → WIRED_GREEN 都依赖它接入 CI。这是 FAR-Chain 自证真实接线的最后一公里，**优先级高于所有 FUSION-OS-* 实施**。

---

## 8. Open Questions（workflow agent 留存，待 maintainer 确认）

1. **FUSION-OS-1 接线缺口 vs Verify-time-only 分层**：`runAntiTheaterLint` 是否设计上就只打算用于离线 verify（重算+diff），还是原本应该接进 seal 路径？`verdict_kernel_v2.ts:296` 的 antiTheaterFindings fail→UNTESTED 规则存在但实时路径永不喂料——需确认这是接线缺口还是有意的分层设计。（far:sandbox+fec agent open_question）
2. **V2 sealer 是否已消费 antiTheaterReport**：`proof_envelope/v2/sealer.ts` 与 V1 `sealer.ts` 是否双轨并存？V2 seal 路径是否已接 `runAntiTheaterLint`？若 V2 已接，FUSION-OS-1 落点应改为 V2 路径。（far:sandbox+fec agent open_question）
3. **keystone bot CI 状态**：`scripts/depth_evidence.mjs` 是否已在 `.github/workflows/depth-evidence.yml` 真实跑通？是否被设为 required status check？这是所有 §C 行 WIRED_RED→GREEN 的前置。（far:plan+schema+gate agent open_question，超 agent 能力，须 maintainer 配置）
4. **OS 加密钥管理**：OS 4 张 `encrypted_*` 凭证表的加密密钥（KEK）存哪？若钥与库同处则 in-DB 加密形同虚设。FUSION-OS-8 secret 剥离不涉及此，但若未来 FAR-Chain 凭证入库须先评估威胁模型。（os:schema agent open_question）
5. **OS sandbox bind-mount vs FAR-Chain 用户态**：FAR-Chain V2+ 路线是否真的不计划做 OS 级隔离，还是只是 V1 诚实声明？07_RISK_REGISTER §188 未取证原文。FUSION-OS-4 预扫是降级版，须明确 V2+ 是否升级。（far:sandbox+fec agent open_question）
6. **OS writetrace 术语来源**：`writetrace`/`write_trace`/`sha256`/`provenance` 四个词在 `repo:guanxiaol/open-science` 全部 0 命中（GitHub code search）。OS 实际 provenance 由 harness（9.3MB `science-engine.js` bundle）隐式持有，以 payload 字段喂给 reviewer。若任务方「writetrace」术语源自上游 Claude Code 内核，则与 FAR-Chain 无转移关系。（os:agents+writetrace agent open_question）

---

## 附录 A：OS 子系统机制清单（参考索引）

> 完整机制提取见 workflow journal：`<TEMP>/tasks/wlf4s4z36.output`（11 agent / 787K tokens）。本附录仅索引，不复述。

| OS 子系统 | 机制数 | HIGH 转移 | 镜像位置 |
|----------|--------|-----------|----------|
| Skills 系统（`runtime/skills/*`） | 8 | F-5, F-6 | `_reference_repos/open-science-mirror/runtime/skills/` |
| 持久 Python 内核（`kernel_worker.py`） | 16 | F-7, F-8 | 同上 `runtime/kernels/` |
| 沙箱执行（`wrapper.sh.tmpl` + `gitScanWorker.js`） | 14 | F-2, F-3, F-4 | 同上 `runtime/compute/` + `app/backend/src/sandbox/` |
| MCP 服务器（`runtime/mcp-servers/bio-tools`） | 8 | C-2, C-5（收敛） | 同上 `runtime/mcp-servers/` |
| SQLite/Drizzle（`runtime/drizzle/sqlite/`） | 12 | F-9, F-10, F-11, F-12 | 同上 `runtime/drizzle/sqlite/` |
| Agent 定义 + 反 confabulation（`runtime/agents/*`） | 10 | F-6, F-13, F-14 | 同上 `runtime/agents/` |

---

## 附录 B：诚实声明

1. **本文档全部建议为 DESIGN_PROPOSED，非当前完成态**。任何条目落地须经 depth_gate W1-W7/L1/L2 门 + keystone evidence bot CI 双跑写回 WIRED_GREEN，agent 不得手填。
2. **本文档不动代码**（用户指令 2026-07-05「先不要动当前的代码」）。所有落点 file:line 是建议，非已改。
3. **FAR-Chain 不向 OS 的 LLM-裁决语义看齐**——OS reviewer 是 LLM，FAR-Chain 裁决由确定性 R0-R9 内核给出（C-3）。融合的是 OS 的工程范式（反剧场/fail-closed/缩窄伪造窗口），不是 OS 的裁决模型。
4. **OS 的 writetrace 不存在**（术语误称，§8-Q6）。OS 的 provenance 由 harness 隐式持有，FAR-Chain 的对应物是 canonicalHash/proofHash/fecHash 哈希链（C-1/C-4）。
5. **FAR-Chain sandbox 是 best-effort 用户态隔离，非物理隔离**（07_RISK_REGISTER §188 自承）。F-2/F-3/F-4/F-7/F-8 是降级版补偿，不可包装成「物理隔离/strong isolation/tamper-proof」（触禁用词红线）。
6. **执行指纹（F-7）非 bit-exact replay**，仅量级比对。须诚实声明，不可声称「完全可复现」（触禁用词红线）。

---

**文档版本**：v1.0（2026-07-05，11-agent workflow 证据驱动）
**驱动 workflow**：`open-science-fusion-research`（`wlf4s4z36`，787114 tokens / 214 工具调用 / 11 agent / 0 错误）
**证据源**：`<REPOSITORY_ROOT>/../_reference_repos/open-science-mirror/`（OS 镜像）+ FAR-Chain `src/`/`schema/`/`FAR_LAB_MASTER_PLAN/` 全量扎根
