# FAR-Chain 开源发布审计报告（阶段 0 · 只读）

> 生成时间：2026-07-08 · 分支 `feature/improve-readme` · HEAD `b7d2fe7`
> 性质：**只读审计**，未改动任何源码。所有数字由 `git ls-files` / `find` 实时生成（项目红线 RR-1：禁手填裸统计数字）。
> 目的：在重构开源发布形态之前，确立「仓库真实现状」的事实基线，区分「已具备 / 缺失 / 需真实环境 / 需人类确认」。

---

## 1. 当前仓库文件树（节选 · tracked 文件 644 个）

```
FAR-Lab/
├── .agent/                     # Agent 入口协议（AGENT_ENTRY_PROTOCOL.md / ANTISKIM / AGENTS.md）
├── .github/
│   ├── CODEOWNERS              # ✓ 治理 keystone 文件 owner 锁
│   ├── copilot-instructions.md
│   └── workflows/              # 5 个 workflow（见 §8）
├── .pi/                        # pi coding-agent 工作区配置（非项目交付物）
├── src/                        # 245 个 tracked 文件 · TS 主源码（25 个子系统目录）
├── tests/                      # 175 个 tracked 测试文件
├── repro/                      # Python 确定性复算助手（far_chain_repro 包 · 34 个 .py tracked）
├── packages/cli/               # @far-chain/cli npm 包候选（bin/far.mjs 转发根 far.ts）
├── frontend/                   # React+Vite 独立 npm 工作区（独立 package-lock.json）
├── golden_vectors/cases/       # GV-01..GV-14.json（14 条 verdict golden vector）
├── schema/migrations/          # 0001..0017.sql（17 条 SQL migration）+ README.md
├── examples/fec/               # 唯一示例：sample_fec_contract.json + README.md
├── benchmark/ · ci/ · scripts/ # 基准夹具 / CI smoke 脚本 / 工程门脚本
├── FAR_LAB_MASTER_PLAN/        # 架构与设计文档（含 DEPTH_LEDGER.md 机器可读接线账本）
├── README.md · LICENSE · CONTRIBUTING.md · SECURITY.md · CHANGELOG.md
├── Makefile · package.json · pnpm-lock.yaml · pyproject.toml · tsconfig.json
└── .env.example
```

**仓库根存在未跟踪垃圾文件**（不进 git，但污染工作目录）：`$null`、`1111`、`0/`、`src/cli/0/`。`git ls-files` 确认均未 tracked，属本地 artifact，建议人工清理（**不**由本治理任务自动删除，避免误删）。

---

## 2. 语言栈

| 栈 | 角色 | 版本约束 | 证据 |
|----|------|----------|------|
| **TypeScript** | 主语言（CLI / API / 内核 / 哈希链） | Node ≥ 24（package.json `engines`），pnpm 10.29.3 | `package.json` bin → `src/cli/far.ts`；依赖 Node 24 原生 type-stripping（tsconfig `noEmit`，无 dist build） |
| **Python** | 科研确定性复算（SymPy / Z3 / numpy / 跨语言哈希一致性） | 3.11 / 3.12 | `pyproject.toml` `requires-python>=3.11`；`repro/far_chain_repro/` |
| **SQL** | append-only 证据链（SQLite，better-sqlite3） | — | `schema/migrations/0001..0017.sql` |
| **React/Vite** | Web 仪表盘（独立 npm 工作区） | — | `frontend/package.json` |
| Docker / Rust / Go | **无** | — | 根无 Dockerfile/Rust/Go 文件 |

**关键工程约束**：项目无 `dist` build，`bin` 直接指向 `.ts`，强依赖 Node 24 原生 type-stripping。任何「编译为 JS」的打包流程（npm 独立发布）需额外设计。

---

## 3. 当前真实入口命令

| 命令 | 实装位置 | offline? |
|------|----------|----------|
| `far` CLI（16 子命令） | `src/cli/far.ts` + `src/cli/commands/*.ts` | 多数 offline |
| `pnpm api` / `far api` | `src/cli/commands/api.ts`（Fastify 5，:3000） | offline（匿名 demo 模式） |
| `pnpm test` / `pnpm ci-all` | `package.json scripts` | offline（Python 轴按环境 skip） |
| Makefile | `bootstrap`/`verify`/`demo`/`test`/`test-py` | — |

`far` 子命令清单（`src/cli/far.ts` 命令分发）：`demo` `status` `api` `verify` `verify-golden` `export`(receipt/far-proof) `bench` `fec`(compile/freeze) `fsm advance` `ask` `stream` `repl` `replay` `court` `arena` `init`。

---

## 4. 当前是否已有 CLI

**是。** `package.json` 声明 `"bin": { "far": "src/cli/far.ts" }`，`packages/cli/package.json` 声明 `@far-chain/cli@0.1.0`（`bin/far.mjs` 转发根 `far.ts`）。CLI 实装度高（16 子命令 + 详尽 HELP_TEXT）。

**任务要求但当前缺失的 CLI 能力**：
- `far doctor`（环境诊断）— **缺失**
- `far version`（版本号）— **缺失**（`package.json` version=`0.0.0`，`packages/cli`=`0.1.0`，不一致）
- `far --help` 别名 — 当前 `far`（无参数）打印 HELP_TEXT，但 `far --help` 未显式路由
- `far demo tess-offline`（demo 不接受子参数，是固定三阶段演示）
- `far verify <path>` 位置参数 — 现为 `far verify --bundle <path>`

---

## 5. 当前是否已有 README

**是**（`README.md`，7KB，中文）。质量较好：含定位、核心能力、五值裁决、架构图、快速开始、Science-125 示例、工程治理、已知边界。但**不符合任务规定的开源 README 16 段结构**（缺 30 秒安装、Offline demo 独立段、Docker 段、Badges 实化、双语、文档导航分层）。无 `README.zh-CN.md`（当前 README 即中文，需补英文版或重命名）。

---

## 6. 当前是否已有 install 脚本

**否。** 无 `scripts/install.sh` / `scripts/install.ps1`。安装方式仅「开发者向」：`git clone` + `pnpm install` + `node scripts/ensure_py_deps.mjs`。无终端用户一键安装路径。

---

## 7. 当前是否已有 Dockerfile / docker-compose

**否。** 根无 `Dockerfile` / `docker-compose.yml` / `.dockerignore`。项目适合 Docker（Fastify + Python repro + frontend 三栈），但需新建。

---

## 8. 当前是否已有 CI

**是，且相当成熟。** `.github/workflows/` 5 个 workflow：

| workflow | 职责 |
|----------|------|
| `ci.yml` | 12 步串行 gate（lint/typecheck/test_ts/test_py/cross_lang/migration/zero-tolerance/anti-theater/depth-gate/competition_qwen_smoke 条件门/snapshot 存活监控）+ frontend 独立 gate |
| `build-integrity.yml` | 构建完整性 |
| `depth-evidence.yml` | 深度接线物证 bot（keystone） |
| `depth-gate.yml` | 深度接线门（AST caller 校验） |
| `entry-protocol-check.yml` | Agent 入口协议校验 |

**缺失**：`release.yml`（tag 触发的 release assets 构建）/ `publish-*` workflow（PyPI/npm/GHCR 发布）。**默认分支是 `feature/initial-project-setup`**（ci.yml 注释明确），当前工作分支 `feature/improve-readme`。

---

## 9. 当前是否已有测试

**是，规模可观。** `tests/` 175 个 tracked 文件，覆盖 api/audit/llm_gateway/schema/evidence_log/evidence_graph/falsifiability/fec/math/statistics/golden_vectors/real_backends/dialogue/demo_seeds/benchmark/far_proof/science_harness/confounding_gate/proof_envelope/report/trace/cli/anti_theater/scripts/agent_loop/ci。Python 测试在 `repro/tests`（`pnpm test:py`）。前端 `frontend/` 有 vitest。

**诚实边界**（CLAUDE.md §1 / §3）：套件已绿，但约 25% 是同义反复（断言常量 / grep 缺词 / FakeBackend），绿 ≠ 深度功能接线完成。真实后端轴（SymPy/Z3/Dafny/Lean）按环境 skip。

---

## 10. 当前是否已有 examples / demo

**部分。** `examples/fec/`（sample_fec_contract.json + README）是唯一持久化示例。**运行时 demo 强**：`far demo` 三阶段（14 GV + demo chain C-ASTRO-0001 + hero pipeline C-MMLU-A-0001），全程 offline。但**无持久化的 `examples/tess-offline/` demo 产物**（claim/evidence/verdict/.far-proof bundle），demo 是每次运行时即时生成。

---

## 11. 当前是否已有 schema / fixtures / .far-proof 样例

- **schema**：`schema/migrations/0001..0017.sql`（17 条）+ README，实装完整。
- **fixtures**：`golden_vectors/cases/GV-01..14.json`（14 条 verdict golden vector）；`benchmark/`、`tests/` 内大量夹具。
- **`.far-proof` 样例**：**无持久化 tracked 样例**。`.far-proof/` 被 gitignore（`.gitignore` 含 `.far-proof` 相关）。`far export far-proof --demo-chain` 运行时生成到 `./.far-proof/`。

---

## 12. 当前是否已有 LICENSE / SECURITY / CONTRIBUTING / CHANGELOG / CITATION

| 文件 | 状态 |
|------|------|
| `LICENSE` | **✓ MIT**（`Copyright (c) 2026 FAR-Chain Contributors`）— 已存在，无需 `NEEDS_HUMAN_LICENSE_DECISION`；若 maintainer 想变更协议须人类确认 |
| `SECURITY.md` | ✓ 存在（4.3KB，含漏洞报告与密钥策略） |
| `CONTRIBUTING.md` | ✓ 存在（5.6KB） |
| `CHANGELOG.md` | ✓ 存在（Keep a Changelog 格式，含 `[Unreleased]` + `2026-07` 段） |
| `CITATION.cff` | **✗ 缺失** |

---

## 13. 当前哪些功能可本地离线运行（无需 API key）

- `far demo`（14 GV + demo chain + hero pipeline · 全 offline）
- `far verify-golden --all --backend node`（真实 R0-R9 内核）
- `far verify-golden --backend browser`（frontend/public 内联脚本）
- `far fec compile/freeze`（10 项编译检查 + fecHash 重算）
- `far export far-proof --demo-chain`（V1 self-verifiable bundle）
- `far verify --bundle <dir>`（第三方独立重算）
- `far status` / `far bench run` / `far fsm advance`
- `far ask "<q>"`（默认 `offline_replay` profile，零密钥 fixture 回放）
- `far api`（:3000，匿名 demo，自动种子 C-ASTRO-0001 UNTESTED）
- Python `pnpm test:py`（确定性复算）
- `pnpm ci-all`（完整 CI 流水线，Python 轴按环境 skip）

---

## 14. 当前哪些功能需要真实 API 或真实数据

| 功能 | 需要什么 | 现状标记 |
|------|----------|----------|
| competition_aliyun_qwen adapter（DashScope/百炼 Qwen） | `DASHSCOPE_API_KEY` | CI 条件门 skip（无 key 不 block） |
| `far ask/court/arena --profile competition_aliyun_qwen` | `DASHSCOPE_API_KEY` | 默认 offline_replay，真实推理需显式 profile + key |
| TESS live 数据下载 | lightkurve / astroquery（`pip install -e .[science]`） | **NEEDS_REAL_ENV**（dataset_fetch 缺失降级 cached_fixture，P1-6 路线） |
| 真实 SymPy/Z3/Dafny/Lean spawn | 真实工具链 + Python | `tests/real_backends/` 按环境 skip（P2-1） |
| 跨语言哈希 Python 轴 | Python + sympy/z3 | `scripts/ensure_py_deps.mjs` 探测，缺失则 skip |
| 真实 GPU / 比赛平台提交 | — | **NEEDS_GPU_VALIDATION / NEEDS_HUMAN_OPERATION**（路线图，未实装） |

---

## 15. 当前哪些 README 声称缺少证据

逐条核查（`README.md` 当前内容）：

| 声称 | 证据 | 结论 |
|------|------|------|
| 「14 Golden Vector」 | `golden_vectors/cases/GV-01..14.json` 实存 14 | ✓ 属实 |
| 「跨语言 TS/Python/浏览器哈希字节一致」 | `tests/evidence_log/cross_lang_consistency.test.ts` + `repro/` mirror | ✓ 测试存在；Python 轴依赖环境（按能力 skip，非伪造） |
| 「20 项反剧场检测器」 | `src/anti_theater/` | 待 verify（数字未在 README 手填为精确运行结果，属设计声明） |
| 「`pnpm ci-all` 完整 CI 流水线」 | `package.json` ci-all script 实存 | ✓ 属实 |
| 「五值裁决由确定性内核给出，LLM 不参与」 | `pnpm no-llm-judge-scan` CI 强制 | ✓ 属实 |
| 「Science-125 示例覆盖五领域五裁决」 | `tests/demo_seeds/` + `far bench run` | ✓ 属实 |

**未发现夸大宣传**（如「证明科学真理」「全自动科学家」「物理不可篡改」均未出现，符合项目禁用词红线）。README 已显式声明「demo verdict 由 offline fixture 产出，非真实科学裁决」。

**需修正的不一致**：
- `packages/cli/package.json` 的 `repository.url` 写 `github.com/earendil-works/far-chain`，实际 git remote 是 `github.com/yry1816186-pixel/FAR-Lab`。
- `package.json` version `0.0.0` vs `packages/cli` version `0.1.0` 不一致。

---

## 16. 当前最小可发布 MVP

**核心可发布价值**（全部已实装 + offline 可跑）：

1. `far` CLI（16 子命令）— 确定性 R0-R9 裁决内核
2. `far demo` — 一键 offline 演示（14 GV + demo chain + 真实统计驱动裁决）
3. `far verify-golden --all` — 14 golden vector 重算
4. `far export far-proof --demo-chain` + `far verify --bundle` — 自验证证明包导出与第三方独立重算
5. `far fec compile/freeze` — FEC 冻结契约编译 + fecHash 篡改检测
6. Python `repro/` — 跨语言哈希一致性
7. `far api` + frontend — Web 仪表盘（offline demo 模式）

**MVP 发布还差**（开源工程形态，非功能）：install 脚本 / Docker / `far doctor` / `far version` / 持久化 tess-offline demo / issue+PR 模板 / release workflow / 双语 README / 文档分层。

---

## 17. 当前阻塞一键安装的原因

| # | 阻塞点 | 影响 |
|---|--------|------|
| 1 | 无 `install.sh` / `install.ps1` | 终端用户无法 curl 一键装 |
| 2 | 无 Dockerfile | 评委无法 `docker run` 一键看 demo |
| 3 | 无 `far doctor` | 安装失败无法自诊断 |
| 4 | `far` 需 `pnpm link --global` 才全局可用 | 普通用户门槛高 |
| 5 | README 安装段是「开发者向」（clone + pnpm），非「终端用户向」 | 陌生用户首条命令即卡 |
| 6 | Node ≥ 24 强依赖（type-stripping 跑 .ts，无 dist） | 低版本 Node 直接失败，且无友好报错 |
| 7 | `version` 0.0.0 / 0.1.0 不一致 + 无 `far version` | 发布形态不明确 |
| 8 | 无 release workflow / GitHub Release assets | curl install 链接无 release 可指向（须 `NEEDS_RELEASE_PUBLICATION`） |
| 9 | 工作目录垃圾文件（`$null`/`1111`/`0/`） | 仓库观感（未 tracked，影响小） |
| 10 | `repository.url` 与实际 remote 不一致 | npm 包元数据错误 |

---

## 审计结论

FAR-Chain **功能实装度高、工程治理门严格、诚实边界清晰**——不是一个「半成品等包装」的项目，而是一个「功能已就绪但开源发布形态未就绪」的项目。开源治理的核心工作是**补齐发布形态**（install/Docker/doctor/version/demo 持久化/模板/release workflow/文档分层），**不触碰科研功能内核**，全程保持 `NEEDS_*` 诚实标注，绝不伪造 CI/API/数据。
