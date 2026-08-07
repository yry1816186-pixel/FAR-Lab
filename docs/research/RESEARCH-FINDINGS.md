# RESEARCH-FINDINGS — FAR-Lab Agent 系统全方位调研报告

> **调研时间**: 2026-08-07
> **调研对象**: `c:\Users\RichardYuan\Desktop\FAR-Lab`（FAR-Lab v1.1.0）
> **调研方法**: 只读探索（根目录文档精读 + code-explorer 架构侦察 + 实际文件清单核验 + git 状态实测）
> **调研目的**: 为「设计本项目专属 Agent 系统」提供证据基础，禁止照搬通用模板
> **证据标准**: 每条结论引用具体文件路径/行号/命令输出，无证据即标记 `UNVERIFIED`

---

## 3.1 项目全貌

### 3.1.1 项目定位与阶段

**定位**（`README.md:3-11`）：FAR-Lab 是 AI4S 结论的测谎仪——claim-level verification layer for AI4S scientific claims。核心机制：LLM 提假设，确定性 R0-R9 裁决核（非 LLM）裁决，内容寻址证据链保证可篡改检测，第三方可独立重算。

**当前阶段**（`PROGRESS.md:1-12`）：v1.1.0 已发布（`package.json:3`），开发路线图 Phase 1-4 全部 `completed`，Phase 5 `in_progress`（`DEVELOPMENT_ROADMAP.yaml:111`）。当前分支 `design/s0-safe-boot`，ahead of origin/main 30 commits（`PROGRESS.md:9`）。

**交付标准**（`GOAL.md:1-6`）：做出世界级交付物，经得起任何独立评审。西瓜（真正有价值）= 可复现性/诚实边界/真实证据/真实科学案例验证/发布与外部验证；芝麻（偏离目标）= 调整配置 hooks/写完美 prompt/修复不影响功能的风格问题。

**竞赛属性**（`AGENTS.md` 第 1 节）：国家级竞赛，标准是"世界级"而非"能用"，对手是 PhD 实验室。

### 3.1.2 已知技术债

`PROGRESS.md` 记录的技术债已大部分闭环，剩余开放项（`PROGRESS.md:421-433`）均需真实世界资源（非代码可闭合）：
- PS-01/03/08 发布：需人类推送 tag（`NEEDS_RELEASE_PUBLICATION`）
- PS-07 OS 沙箱：science runner 无强制隔离（需架构决策）
- PS-12 维护者：bus factor=1
- Phase 5 DR：backup/restore 演练需真实环境

**代码层面技术债**（`PROGRESS.md:99-108` 路线图剩余项）：
- C1: DEBT-06 V1/V2 proof_envelope 裁决（drop V2 dead schema，破坏性需确认）
- C2: 23 模块边界审计（待办）
- D1-D3: 更多论文/性能基准/LLM 接入（大工程，新方向）

### 3.1.3 基线实测（2026-08-07 调研时）

| 维度 | 命令 | 结果 | 证据 |
|------|------|------|------|
| typecheck | `pnpm run typecheck` | 0 errors | `PROGRESS.md:10`（typecheck 0）|
| lint | `pnpm run lint` | 0 errors（`--max-warnings 0`）| `package.json:65` |
| test | `pnpm test` | 2278 tests（2272 pass / 0 fail / 6 skip）| `PROGRESS.md:10` |
| branch coverage | coverage gate | 90.00% | `PROGRESS.md:10` |
| frontend | vitest | 219 tests 全绿 | `PROGRESS.md:10` |
| demo | `node src/cli/far.ts demo` | 14/14 golden vectors | `PROGRESS.md:10` |

> 6 个 skip 全是环境性（python axis / browser axis / POSIX chmod on win32 / DASHSCOPE_API_KEY unset），**fail=0 无回归**（`PROGRESS.md:196`）。

---

## 3.2 架构

### 3.2.1 仓库结构：单仓 + 前端子包

`pnpm-workspace.yaml` 存在但项目本质是**单仓 + frontend 子包**结构（非典型 monorepo）：
- 根 `package.json` 是后端主包（`package.json:2`，`far-lab` v1.1.0）
- `frontend/package.json` 是独立前端包（version 已对齐 1.0.0→1.1.0，见 `PROGRESS.md:247`）
- 根 `package.json:31-40` 的 `files` 字段明确打包范围：`src` / `schema` / `scripts` / `ci` / `repro` / `golden_vectors` / `frontend/public`

### 3.2.2 后端架构（`src/` 24 子目录）

通过 code-explorer 侦察 + 文件清单核验，`src/` 分三层（单向依赖，高层→低层）：

**Trust Kernel 层**（`AGENTS.md` §7 高风险模块，trust kernel 改动 ADDITIVE ONLY）：
| 模块 | 职责 | 关键导出 |
|------|------|---------|
| `falsifiability/` | 核心裁决内核，五值确定性裁决（`verdict_kernel_v2.ts` 46KB） | `decideFiveValueVerdict`, `falsifiabilityGate`, `recordVerdict`, `VerdictKernelInput/Output` |
| `evidence_log/` | 证据链密码学基石——canonical JSON 哈希、链式 append-only、Merkle root、FTS | `appendRecord`, `canonicalHash`, `computeChainMerkleRoot`, `verifyChainHead` |
| `fec/` | Falsification Evidence Contract V1+V2，编译→FalsificationPlan | `compileFec`, `enforceFecMandatoryGate`, `computeFecHash` |
| `far_proof/` | .far-proof 便携验证包导出（九分量：RO-Crate/PROV-O/OTel/claim_graph） | `exportFarProof`, `packageFarProofBundle`, `verifyFarProofPackageIntegrity` |
| `proof_envelope/` | Proof Envelope V1+V2，proof hash 计算/验证/密封/跨语言 | `computeProofHash`, `sealProofEnvelope`, `validateProofEnvelopeV2` |
| `anti_theater/` | 23 个确定性反剧场检测器（p-hacking/cherry-pick/HARK 等） | `runAntiTheaterLint`, `DETECTORS`, `applyVerdictConstraint` |
| `canonical/` | 跨语言 canonical JSON（TS/Python/browser 字节级一致） | （SSOT 哈希规范化）|
| `confounding_gate/` | 确定性因果混杂门（d-separation + 后门路径，纯图算法） | `adjudicateConfounding`, `dSeparation`, `findBackdoorPaths` |

**应用层**：
| 模块 | 职责 |
|------|------|
| `agent_loop/` | 六阶段 FSM 主循环（stage1_understanding→stage6_feedback），科研 agent 执行引擎 |
| `api/` | Fastify 5 REST API，11 路由 + 9 内部服务（`routes/` + `internal/`）|
| `cli/` | `far.ts` CLI 入口（43KB），`commands/` 下 29 子命令 |
| `llm_gateway/` | 模型中立 LLM 网关，`adapters/aliyun_qwen/` + `adapters/offline_replay/` + `fallback_chain/` |
| `benchmark/` | Science-125 完整性套件（30 problems / 28 科学域）|
| `report/` | 报告生成 + Markdown/HTML 渲染 |
| `math/` | 数学验证层（CAS/SMT/Formal/Numerical/Dafny 多后端）|
| `evidence_quality/` | GRADE/Cochrane RoB 透明度标注 |

**基础层**：
| 模块 | 职责 |
|------|------|
| `db/` | better-sqlite3 封装 + 迁移执行器（contiguous 编号校验）+ WAL + integrity_check fail-closed |
| `cas/` | 内容寻址 Blob 存储（sha256 去重）|
| `schema/` | 枚举 SSOT（`enums.ts`：Verdict/PayloadKind/PurposeTag/EdgeKind）|
| `demo_seeds/` | 31 科学域 demo 种子 + `registry.ts` |
| `statistics/` | 统计计算（p-value/effect-size，无硬编码字面量）|

**依赖方向**：应用层 → Trust Kernel → 基础层；`src/api/` 零 CLI 依赖（`DEVELOPMENT_ROADMAP.yaml:59`，ask_runner 上提后实证）；0 circular dependencies（madge 复核，`DEVELOPMENT_ROADMAP.yaml:58`）。

### 3.2.3 前端（`frontend/src/`）

- 框架：React + Vite + D3（`README.md:211` 提及 15 页面 React+D3）
- 结构（实测 `frontend/src/`）：`pages/`（15 tsx）、`components/`（18 tsx）、`lib/`（11 文件）、`__tests__/`（24 文件）、`App.tsx`、`main.tsx`
- 路由：`App.tsx` 集中路由（16 routes incl. 404，见 `AGENTS.md` §0）
- 状态管理：React Query（`PROGRESS.md:327` 提及 react-query signal）
- 测试：vitest，219 tests 全绿（`PROGRESS.md:10`）

### 3.2.4 数据层

- 数据库：SQLite via better-sqlite3（`package.json:78`），WAL 模式 + integrity_check fail-closed 启动（code-explorer 报告）
- 迁移：`schema/migrations/` 24 个 SQL 文件，contiguous 编号校验，forward-fix only（`AGENTS.md` §7 + pre-commit hook 阻止编辑现有 migration）
- 缓存：`src/api/internal/singleton_cache.ts` promise 单例 + benchmark mtime 失效（`PROGRESS.md:323`）
- 无 ORM（裸 better-sqlite3）、无消息队列、无向量库/图库（符合 `AGENTS.md` §6 约束）

### 3.2.5 服务间通信

- REST：Fastify 5（`package.json:80`），11 路由（health/evidence/verdict/hypothesize/report/integrity/benchmark/court/arena/v2_receipts）
- 鉴权：`@fastify/jwt`（`package.json:75`）+ `src/api/auth/jwt_middleware.ts`
- 限流：`@fastify/rate-limit`（`package.json:76`）
- 文档：`@fastify/swagger`（`package.json:77`）
- 无 gRPC/GraphQL/消息队列（符合 `AGENTS.md` §6）

### 3.2.6 可观测性

- 健康检查：`/health` + `/ready` 端点（`DEVELOPMENT_ROADMAP.yaml:119`）
- 链路追踪：9 OTel 引用（`DEVELOPMENT_ROADMAP.yaml:119`）
- 日志：evidence_log append-only hash chain（既是数据也是审计日志）
- 审计：`far audit` CLI + `far-trust-kernel-audit.log`

### 3.2.7 部署

- Docker：`Dockerfile` + `docker-compose.yml`（`far-demo` one-shot / `far-api` long-running，`README.md:194-200`）
- CI：`.github/workflows/` 6 workflows（ci.yml / build-integrity.yml / depth-*.yml / release.yml，`DEVELOPMENT_ROADMAP.yaml:36`）
- 发布：`release.yml` 就绪，`NEEDS_RELEASE_PUBLICATION`（待人类推送 tag，`PROGRESS.md:427`）
- 平台：Node ≥24（macOS/Linux/WSL 全支持，Windows PowerShell 7+ 支持，`README.md:205-215`）

---

## 3.3 现状与痛点

### 3.3.1 根目录报告堆积（P2 卫生问题）

实测 `git status --short` + `list_dir` 根目录，发现：
- **7 个 coverage_output*.txt untracked**（`coverage_output.txt` ~ `coverage_output7.txt`）—— 覆盖率报告重复堆积，无清理
- 根目录审计/报告文件密集：`AUDIT_REPORT.md` / `DEEP_AUDIT.md` / `CLEANUP_MANIFEST.md` / `CLEANUP_REPORT.txt` / `COMPETITION_STRATEGY.md` / `DEV_GUIDE.md` / `NEW_SESSION_PROMPT.md`
- `PACKAGE_MANIFEST.md` 已删除（`git status` 显示 `D PACKAGE_MANIFEST.md`）
- `scripts/gh_retry_monitor.sh` untracked（临时监控脚本残留）

> `PROGRESS.md:259` 曾评估"根目录 19 个 md 归档：均为活跃文件，归档破坏引用收益低 → 保留"。但 7 个 coverage_output 重复文件是明确的卫生债。

### 3.3.2 运行时产物高频 churn

`git status --short` 显示 12 个 `.far-implementation/walking-skeleton/` 文件 modified（`README_REPLAY.md` / `claim_graph.json` / `data_manifest.json` / `integrity.json` / `ro-crate-metadata.json` / `run_log.txt` / `skeleton_evidence.yaml`）—— 这是 walking-skeleton demo 运行时产物，高频 churn 但未 gitignore 干净（`PROGRESS.md:229-231` 曾用 `git rm --cached` 处理 896 个同类产物，但残流仍存）。

### 3.3.3 PROGRESS.md 历史堆积

`PROGRESS.md` 556 行，包含 9+ 轮历史 checkpoint（从 2026-08-05 到 2026-08-07），多轮治理会话记录叠加。虽是"活档案"但历史 checkpoint 已过期（如 2023 tests 旧数字 vs 2278 新数字），新会话首读成本高。

### 3.3.4 质量门禁现状（健康）

- 门禁可运行且全绿：typecheck 0 / lint 0 / test 2278（0 fail）/ coverage gate PASS / demo 14/14 GV
- 覆盖率：line 96.37% / branch 90.00%（gate 85/75，`DEVELOPMENT_ROADMAP.yaml:20` + `PROGRESS.md:10`）
- 安全：`pnpm audit --audit-level=high` 0 vulns（`DEVELOPMENT_ROADMAP.yaml:32`）
- 反剧场：23 detectors，`tests/anti_theater/` 16 测试文件，`src/` 零 `: any`/`@ts-ignore`/empty catch 集中（`PROGRESS.md:187-188`）

### 3.3.5 测试组织（健康）

`tests/` 27 子目录，与 `src/` 模块一一对应：`agent_loop`(19) / `anti_theater`(16) / `api`(24) / `cli`(20) / `evidence_log`(15) / `falsifiability`(29) / `far_proof`(11) / `fec`(13) / `llm_gateway`(16) / `math`(10) / `proof_envelope`(9) / `science_harness`(19) / `v2_domain`(26) 等。测试用 Node 原生 `node --test`（`package.json:46`），无 jest/vitest 依赖（前端用 vitest）。

---

## 3.4 已有 AI-Agent 工具链（关键发现：已高度成熟）

### 3.4.1 AGENTS.md — 项目级契约（已是高质量产物）

`AGENTS.md` 11 节，已体现设计思想库 2.x 的多数思想：
- §0 项目定义 + §1 竞赛目标 + §2 新会话首动作（基线验证 ritual）
- §3 指令优先级（安全>用户>AGENTS>repo事实>设计文档>模型假设）
- §4.1 证据>断言、§4.2 五层深化、§4.3 质量优先、§4.4 ANALYZE→PLAN→EXECUTE→VERIFY→REVIEW→REPORT 状态机
- §5 安全授权（不可逆操作 approval-gated）
- §6 变更纪律（最小 coherent change + 测试守护）
- §7 trust-kernel 约束（ADDITIVE ONLY + deterministic + tamper tests）
- §8 完成标准（typecheck+lint+tests 全绿 + 残留风险显式）
- §9 委托（objective/scope/inputs/output/evidence/budget/stop rule）
- §10 上下文持久化（PROGRESS.md session end 更新）
- §11 AI engine fusion（.claude SSOT + .opencode commands + 三引擎共享）

### 3.4.2 .claude/ 工具链（核心，三引擎共享 SSOT）

实测文件清单（核验 `AGENTS.md` §11 描述准确）：

**agents/（6 个）**—— 已覆盖侦察/实现/审查/红队/发布：
| Agent | 文件 | permissionMode | 角色映射 |
|-------|------|---------------|---------|
| `repository-architect` | `repository-architect.md` | `plan` | 侦察/设计（只读架构分析）|
| `implementation-engineer` | `implementation-engineer.md` | （待核）| 实现 |
| `verification-engineer` | `verification-engineer.md` | （待核）| 审查/验证 |
| `scientific-trust-reviewer` | `scientific-trust-reviewer.md` | （待核）| trust-kernel 审查 |
| `security-adversary` | `security-adversary.md` | （待核）| 红队对抗 |
| `release-engineer` | `release-engineer.md` | （待核）| 发布 |

> frontmatter 格式（`repository-architect.md:1-10`）：YAML `name`/`description`/`tools`/`model: inherit`/`permissionMode`/`maxTurns`/`effort`/`color` + 指令正文。

**rules/（8 个）**—— 路径触发 lazy-load（`AGENTS.md` §11 规则表）：
`typescript.md` / `python.md` / `tests.md` / `frontend.md` / `data-migrations.md` / `scientific-kernel.md` / `security-release.md` / `docs-and-config.md`

**skills/（5 个）**—— 任务生命周期工作流：
`far-design-freeze` / `far-implement` / `far-refactor` / `far-release` / `far-verify`（对应 `agent/README.md:38-56` 的 design→implement→verify→release 流程）

**hooks/**—— `policy_guard.py`（PreToolUse 守卫，Python3 实现）

**settings.json**（`c:\Users\RichardYuan\Desktop\FAR-Lab\.claude\settings.json`）—— 完整权限模型：
- `defaultMode: default`
- `ask`（不可逆操作需询问）：`git push *` / `git tag *` / `gh pr create *` / `gh pr merge *` / `docker push *` / `npm publish *` / `pypi publish *` / `twine upload *`
- `deny`（硬禁止）：`Read(./.env)` / `Read(./secrets/**)` / `Read(./**/*.pem)` / `Read(./**/*.key)` / `git reset --hard*` / `git clean -fd*` / `git push --force*`
- `disableBypassPermissionsMode: disable`（不允许绕过权限）
- `autoMemoryEnabled: true`
- `hooks.PreToolUse`：matcher `Bash|Edit|Write` → `policy_guard.py`

### 3.4.3 .opencode/ 工具链（opencode 独有概念，瘦补丁）

实测 `.opencode/commands/` 6 个命令（核验 `AGENTS.md` §11 描述准确）：
`far-baseline.md` / `far-demo.md` / `far-verify-proof.md` / `far-real-paper.md` / `far-bench.md` / `far-export.md`

> `.opencode/` 经第三轮"完美融合重构"（`PROGRESS.md:118-138`）从 26 文件/1418 行精简到 6 文件/~280 行——`.claude/` 作为三引擎共享 SSOT，`.opencode/` 只放 opencode 独有概念（commands），避免重复。

### 3.4.4 agent/ 目录（progressive disclosure 架构说明）

`agent/README.md` 描述 9 层 progressive disclosure 架构：`AGENTS.md` → `CLAUDE.md` → `.pi/APPEND_SYSTEM.md` → `.claude/rules/` → `.claude/skills/` → `.claude/agents/` → `.pi/prompts/` → `agent/contracts|policies|workflows/` → `.agent-state/`。

`agent/` 含 `contracts/` / `policies/` / `templates/`（9 文件）/ `workflows/` —— 权威详细参考（非日常加载）。

### 3.4.5 多引擎并存现状

`PROGRESS.md:31-43` 盘点 6 套 AI 配置：
- `.claude/` ACTIVE 备用（SSOT）
- `.pi/` RESTORED 备用（APPEND_SYSTEM + extensions + 20 prompts）
- `.hermes/` plan.md 单文件
- `.zcode/` `.zed/` 待查
- `.opencode/` 已融入（commands only）

> 决策（`PROGRESS.md:205`）：不删除 .claude/.pi/.hermes/.zcode/.zed，保留并存策略，`.claude/` 为 SSOT。

### 3.4.6 pre-commit hook（commit-time 防御）

`scripts/far-trust-kernel-precommit.ps1`（`AGENTS.md` §11）镜像 runtime 保护：BLOCK 现有 `schema/migrations/*.sql` 编辑（forward-fix only），WARN trust-kernel 路径改动无测试变更。安装见 `scripts/PRECOMMIT_HOOKS.md`。

---

## 关键发现：设计思想库 2.x 对照缺口分析

> **核心结论**：FAR-Lab 已有**高度成熟**的 agent 系统（AGENTS.md 11 节 + 6 agents + 8 rules + 5 skills + hooks + settings + pre-commit），已体现设计思想库 2.x 的**多数**思想。落地任务不是"从零建设"，而是"诊断缺口 + 增强补全"——禁止重写现有投资。

| 设计思想（§2.x） | 现状 | 缺口 | 落地优先级 |
|----------------|------|------|-----------|
| §2.1 分层单向依赖 | ✅ `src/` 三层 + 0 circular deps | — | — |
| §2.2 任务生命周期 | 🟡 skills 覆盖 design→implement→verify→release | 缺 SPEC/PLAN/REVIEW/INTEGRATE/DONE 明文定义文档；缺"阶段可压缩，工件不可缺席"OpenSpec 法则 | **P1** docs/AGENT-LIFECYCLE.md |
| §2.3 多 agent 编排 | 🟡 6 agents 存在（侦察/实现/审查/红队/发布） | 缺 fan-out/fan-in 编排模式定义；缺 handoff 协议三件套（Artifact+Context+Decision）明文规范；缺独立"集成"角色 | **P1** agent 编排协议增强 |
| §2.4 分层 prompt + 缓存边界 | ✅ AGENTS.md §11 progressive disclosure | — | — |
| §2.5 层级记忆 | 🟡 AGENTS.md(项目级) + CLAUDE.md(适配器) + autoMemoryEnabled | 缺 ADR/Landmine/候选规则的结构化记忆体系文档；`.far-design/DECISIONS/` 有 24 ADR 但无 agent 维护规范 | **P0** docs/AGENT-MEMORY.md |
| §2.6 权限安全模型 | ✅ settings.json ask/deny + policy_guard.py + disableBypass | 缺 P0-P4 风险分级表 + "模糊向上取整"明文规则 | **P2** AGENTS.md 增强 |
| §2.7 防幻觉验证 | 🟡 §4.1 证据>断言 + §8 完成标准 | 缺 Deep Audit 19 字段审计模板；缺对抗验证"≥1 counter-case"明文要求（"全正面审查是戏剧"法则）| **P0** 审计模板 + AGENTS.md 增强 |
| §2.8 上下文管理 | ✅ §4.4 ANALYZE→PLAN + §9 委托 budget | — | — |
| §2.9 风险分级 P0-P4 | 🟡 §5 不可逆操作 approval-gated | 缺 P0-P4 五级表 + "风险升级立即暂停重分级" + "模糊向上取整" | **P2** AGENTS.md 增强 |
| §2.10 工程纪律铁律 | 🟡 §4.4 ANALYZE→PLAN→EXECUTE + §8 完成标准 | 缺 TDD RED→GREEN→REFACTOR 明文铁律引用；缺 19 字段审计模板 | **P0/P3** 审计模板 + 测试策略 |

**缺口汇总**（4 个 P0-P2 落地点）：
1. **P0** `docs/AGENT-MEMORY.md`——结构化记忆体系（ADR 维护规范 + Landmine 教训记录模板 + 候选规则模板），让 agent 持续维护
2. **P0** 19 字段审计模板 + Deep Audit 对抗验证规范（融入 AGENTS.md 或独立文档）
3. **P1** `docs/AGENT-LIFECYCLE.md`——SPEC→PLAN→BUILD→REVIEW→INTEGRATE→DONE 明文定义 + 阶段工件门禁 + OpenSpec 法则
4. **P1** agent 编排协议增强——handoff 三件套规范 + fan-out/fan-in 模式 + 集成角色补全
5. **P2** AGENTS.md 增强——P0-P4 风险分级表 + TDD 铁律明文 + 编排模式引用
6. **P2** 根目录报告归档策略（7 coverage_output + 审计报告归档到 `docs/reports/`）

---

## 调研结论

FAR-Lab 是一个**工程纪律已达世界级水准**的项目（2278 tests 0 fail / 90% branch / 23 anti-theater detectors / 0 circular deps / 完整权限模型）。其 agent 系统已高度成熟，AGENTS.md 本身就是设计思想库 2.x 的优秀实践。

落地任务的本质是**增量增强而非推翻重写**：
- 保留：AGENTS.md 11 节骨架 + 6 agents + 8 rules + 5 skills + hooks + settings + pre-commit + progressive disclosure 架构
- 增强：补全生命周期明文定义、记忆体系文档、19 字段审计模板、编排协议、风险分级表
- 卫生：归档根目录报告堆积

所有落地产物必须引用 FAR-Lab 实际模块名（`src/falsifiability` / `src/evidence_log` / `src/fec` / `src/far_proof` / R0-R9 kernel / `.far-proof` 包 / 23 detectors）、实际技术栈（TypeScript ESM / Fastify 5 / better-sqlite3 / zod / React+Vite+D3 / Node ≥24）、实际文件路径——出现任何通用占位符即不合格。
