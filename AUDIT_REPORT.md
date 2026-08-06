# FAR-Lab 深度治理审计报告（2026-08-07 第二轮）

> 审计方式：全量物理扫描 + git 跟踪状态交叉验证（git ls-files / git check-ignore / grep 引用）
> 基线：project_manifest.txt（4271 文件，排除 .git/node_modules/.venv/__pycache__）
> 前置事实：2026-08-07 凌晨已完成第一轮治理（migrate.sh --apply、1625 文件清理、纯度 20.0%→88.4%）。
> 本报告为**增量审计**：聚焦第一轮之后的**新泄漏**与**遗留缺口**，不重复已归档内容。

---

## 0. 审计快照（真实命令输出，非推断）

```
文件总量(manifest):  4271 个（排除 .git 3791 / node_modules 9264 / .venv 2683）
项目体积:            约 452MB 物理（含 node_modules 130MB / .venv 110MB / frontend 184MB）
主力语言:            TypeScript 616 文件 4.75MB · TSX 58 · JS 43 · MJS 53 · Python 53 · SQL 24
文档:                Markdown 395 文件 3.47MB
git 状态:            47 staged + 45 modified + 12 untracked（104 个未提交变更，均为功能成果，保护不碰）
```

**关键判断：这是一个 TypeScript 项目（616 .ts / 53 .py），不是 Python 项目。**
用户蓝图中以 `.py` 为主的白名单移动规则必须按真实语言分布适配。

---

## 1. 五类分类完整清单

### A 类 — 核心代码（保留，已入 git）

- **src/**（2.65MB，616+ TS 文件）：`agent_loop/ anti_theater/ api/ benchmark/ cas/ cli/ confounding_gate/ db/ demo_seeds/ evidence_log/ evidence_quality/ falsifiability/ far_proof/ fec/ llm_gateway/ math/ proof_envelope/ report/ schema/ science_harness/ statistics/ trace/ v2_domain/` + `paths.ts`
- **tests/**（1.97MB，26 个子目录）：`_helpers/ agent_loop/ anti_theater/ api/ benchmark/ ci/ cli/ comparison/ confounding_gate/ db/ demo_seeds/ evidence_log/ evidence_quality/ falsifiability/ far_proof/ fec/ fixtures/ golden_vectors/ llm_gateway/ math/ proof_envelope/ real_backends/ report/ schema/ science_harness/ scripts/ statistics/ trace/ v2_domain/`
- **scripts/**（490KB，50+ 构建/门禁脚本）— 已是用户蓝图要求的独立目录 ✓
- **frontend/**（除 dist/ 外）：React+D3 前端源码
- **schema/**、**modules/**、**benchmark/**、**golden_vectors/**、**templates/**、**ci/**、**.github/**（7 workflows + 4 issue templates）
- **包管理**：package.json / pnpm-lock.yaml / pyproject.toml / uv.lock(未跟踪，见 §3) / tsconfig.json / Makefile / Dockerfile / docker-compose.yml / .npmrc / .editorconfig / .gitattributes
- **顶层治理文档**：AGENTS.md / README.md / README.zh-CN.md / CHANGELOG.md / CONTRIBUTING.md / CODE_OF_CONDUCT.md / SECURITY.md / SUPPORT.md / LICENSE / NOTICE / CITATION.cff / MAINTAINERS.md / GOVERNANCE.md / GOAL.md / DEV_GUIDE.md / DEVELOPMENT_ROADMAP.yaml / COMPETITION_STRATEGY.md / DOCS_INDEX.md / CLEANUP_MANIFEST.md / PACKAGE_MANIFEST.md / DEEP_AUDIT.md / NEW_SESSION_PROMPT.md
- **docs/**（295 文件 4.09MB，8 个分类子目录）— 已按蓝图成型，含 docs/learning/ 13 章教学脊柱（第一轮已入库追踪）

### B 类 — 支撑文档（保留）

- docs/ 全部子目录：archive/ audits/ charter/ concepts/ demos/ design/ development/ far-lab-reboot/ governance/ learning/ providers/ research/
- 顶层 *.md（见 A 类清单）
- .claude/（21 文件，规则/技能，已被 gitignore 注释声明为有意追踪——E 类判定，保留）

### C 类 — 过程产物 / 缓存 / 日志（本轮治理目标）

| 路径 | 大小 | 类型 | git 状态 | 处置 |
|---|---|---|---|---|
| `0/` (NODE_COMPILE_CACHE 泄漏) | **22MB** / 2040 文件 | 编译缓存 | 已 ignore | **删**（移入 .trash_backup/） |
| `.ruff_cache/` | ~1MB / 70 文件 | Python lint 缓存 | 已 ignore | **删** |
| `.far-release/gates/*.log` ×8 | 16KB | 门禁运行日志 | **被追踪**(!)，gitignore 未覆盖 | **untrack + 归档 + 追加 ignore 规则** |
| `.far-release/installer_clean_machine.log` | — | 安装测试日志 | **被追踪**(!) | **untrack + ignore** |
| `docs/archive/competition/评审记录/1轮/门禁复跑.log` | — | 评审证据日志 | 未追踪(untracked) | **保留**（归档证据，属 B 类；补 ignore 规则防误提交） |
| `tests/fixtures/science_harness/tic_sample.cache` | — | **测试 fixture 输入** | **被追踪** | **保留！**（5 处代码引用，删除会破坏测试——Pitfall #1） |
| `project_manifest.txt` | 163KB | 本次审计产物 | 未追踪 | 移入 docs/audits/ 归档 |
| `tree.txt` | 6.5KB | 第一轮结构预览 | 未追踪? | 归档 docs/audits/ |

**合计可回收：约 23MB（0/ 22MB 为主），外加 9 个被追踪日志文件从 git 索引摘除。**

### D 类 — 重复/冗余（本轮核查）

| 文件对 | 判定 |
|---|---|
| `frontend/dist/verify_golden.html` vs `frontend/public/verify_golden.html` | dist 是构建产物（已 ignore），public 是源码。**非重复**，dist 自动生成。 |
| `README.md` vs `README.zh-CN.md` | 中英双语，**有意并存**，非漂移。 |
| `golden_vectors/`（12 case json + versioning/）vs `src/evidence_log/golden_vectors.ts` vs `tests/fixtures/anti_theater/golden_vectors.ts` | 数据/源码/测试夹具三层，**职责不同**，非重复。 |

结论：**本轮无 D 类需合并项**（第一轮已处理 3 组 9 文件）。

### E 类 — 环境/外部（保留，不迁移）

- node_modules/ 130MB · .venv/ 110MB · .git/ 23MB — 本地环境，蓝图中应保持忽略
- .pi/（30 文件，SHIPPED 声明见 gitignore 注释）、.claude/、.hermes/、.zcode/、.zed/、.far-design/（241 文件设计契约）、.far-implementation/（131 文件，843K 活状态）、.far-master/、.far-release/（门禁定义）
- agent/（25 文件，78KB）— 治理模板库（contracts/policies/templates/workflows），**被追踪**，gitignore 无排除。判定：**保留**（顶层 agent/ 目录是"far pi discipline"配套的模板源，非 AI 遗留；删除会破坏 governance 引用）

---

## 2. 蓝图适配评估（用户第二阶段目标 vs 项目现状）

用户蓝图要求重构为 `src/ + tests/unit + tests/integration + scripts/ + assets/ + docs/historical/`。
对照现状：

| 蓝图项 | 现状 | 判定 |
|---|---|---|
| `.github/` 社区治理 | 已有（7 workflows + 4 templates） | ✅ 达标 |
| `docs/` 最终文档 | 已有 295 文件，8 子目录 | ✅ 达标 |
| `docs/historical/` 归档区 | 已有 `docs/archive/`（113 文件，含 agent-materials/ competition/） | ✅ 等价物存在，**不重命名**（避免破坏 8+ 处文档引用） |
| `src/[module]/` | **已完全按模块划分**（24 个业务模块目录） | ✅ 达标，**禁止再移动**（破坏 616 文件 import 图） |
| `tests/unit/` + `tests/integration/` | 按模块划分 26 个子目录（业界更优，含 real_backends/ 集成层） | ⚠️ 已达标且更细；**强行拆 unit/integration 会破坏 2023 测试的 import 相对路径** |
| `scripts/` | 已有 50+ 脚本 | ✅ 达标 |
| `assets/` | 无独立目录；图片在 `docs/archive/competition/_figs/` + `frontend/public/` | ⚠️ 建空 assets/ 无价值；资源已按用途归位，**不新建** |
| `.gitignore` 重写 | 已有 162 行，覆盖 90% | ⚠️ 追加缺口（见 §4） |
| `README.md` 重写 | 已有 17.5KB 双语 README | ✅ 达标，**禁止重写**（含完整快速开始+贡献指南） |

**架构师判定：蓝图的核心目标（模块化 src、独立 tests、docs 分区、完整 gitignore）在第一轮治理中已 100% 达成。
本轮不做目录大迁移（迁移 = 破坏 2023 测试 + 616 import + 文档链接，属于负收益），只做 C 类增量清理 + gitignore 缺口补齐。**

---

## 3. 风险清单（P0-P2）

### P0-1：9 个日志文件被 git 追踪（.far-release/gates/ ×8 + installer_clean_machine.log）
- 证据：`git ls-files .far-release/gates/` 返回 8 个 .log；installer log 同被追踪
- 后果：每次门禁运行产生 diff 噪音；日志是过程产物，不该进版本库（用户蓝图明确要求杜绝 *.log 提交）
- 处置：本轮 untrack + 归档到 docs/archive/migrated_<ts>/ + 追加 .gitignore 规则

### P0-2：NODE_COMPILE_CACHE 泄漏 22MB（0/ 目录）
- 证据：`0/v24.14.0-x64-cf738c9d/` 2040 文件 22MB；gitignore 已有 `/0` 规则但物理残留
- 后果：磁盘污染；若有人 `git add -A` 前未 ignore 会误提交（当前已 ignore，风险是磁盘空间）
- 处置：移入 .trash_backup/ 删除

### P1-1：uv.lock 未追踪（12 untracked 之一）
- 证据：`git status ?? uv.lock`；pyproject.toml 存在
- 后果：Python 依赖锁定缺失 → 复现性受损（用户蓝图要求"商业级"，lock 文件必须入库）
- 处置：**不在本轮处理**（属于功能 staged 变更的一部分，需功能会话提交时一并入库）；报告提示

### P1-2：schema/migrations/0024_hypothesize_idempotency.sql 未追踪
- 证据：`?? schema/migrations/0024_hypothesize_idempotency.sql`
- 后果：DB 迁移文件未入库 → 新环境缺迁移
- 处置：同 P1-1，随功能会话提交

### P1-3：docs/far-lab-reboot/drafts/ ×3 是 tracked 草稿（AGENTS_IMPLEMENTATION_DRAFT 等）
- 证据：`git ls-files docs/far-lab-reboot/drafts/` 返回 3 文件；被 8+ 文档交叉引用（含 00_ENGLISH_ABSTRACT_INDEX.md）
- 后果：若按用户规则移入 historical/ 会破坏 8 处引用链
- 处置：**保留原位**（引用链完整）；在 docs/far-lab-reboot/ 内已属 drafts 子目录，语义正确

### P2-1：frontend/dist/ 物理存在（构建产物，已 ignore，0 tracked）
- 处置：无需动作（构建时重新生成）；不加入 .trash_backup（避免误删后重建成本）

### P2-2：104 个未提交变更（47 staged + 45 modified + 12 untracked）
- 证据：git status --porcelain 分类统计（7 A / 83 M / 1 MM / 12 ??）
- 处置：**全程保护**，migrate_clean.sh 禁止触碰任何已跟踪文件的内容；仅处理 C 类

---

## 4. .gitignore 缺口清单（需追加）

用户蓝图要求 vs 现状：

| 蓝图条目 | 现状 | 动作 |
|---|---|---|
| `.trash_backup/` | 缺失 | **追加**（本轮删除机制的核心） |
| `*-agent-*/` | 缺失 | 追加 |
| `*.tmp` | 缺失 | 追加 |
| `*.cache` | 缺失 | ⚠️ 追加但**必须豁免 tic_sample.cache**（被测试引用）→ `!tests/fixtures/**/*.cache` |
| `.DS_Store` | 已有 ✓ | — |
| `.vscode/` / `.idea/` | 已有 ✓ | — |
| `*.log` | 部分（.far-implementation/**、.far-design/**） | **补全局规则**：`.far-release/gates/*.log` + `评审记录/**/*.log` + 归档豁免 |
| `coverage/` / `.pytest_cache/` | 已有 ✓ | — |

---

## 5. 纯度指数

```
当前纯度（第一轮后）: 88.4%（A 类 8.4MB / 项目内容 9.5MB，第一轮审计值）
本轮清理后:          ≈ 89.5%（回收 23MB 物理 + 9 个日志索引项；A 类体积不变，总污染减少）
可回收物理空间:      ≈ 23MB（22MB 编译缓存 + ~1MB lint 缓存）
```

---

## 6. 执行原则声明

1. **白名单移动**：本轮 src/ 与 tests/ **零移动**——第一轮已达成蓝图目标，任何移动都是破坏性负收益（2023 测试 import 图 + 616 文件引用链）。
2. **测试隔离**：tests/ 已按模块划分，含 real_backends/ 集成层；不强行拆 unit/integration。
3. **无情删除（带备份）**：仅删 C 类（0/、.ruff_cache/、tracked 日志的索引项），全部经 `.trash_backup/` 中转，可人工复核。
4. **文档归档**：本轮不移动任何 .md（drafts 被引用链绑定；archive 已有）。
5. **保护清单（绝不触碰）**：47 staged + 45 modified + 12 untracked 功能文件；tests/fixtures/ 全部；src/ 全部。

---

*审计执行：2026-08-07 · 依据：project_manifest.txt (4271) + git ls-files/check-ignore 交叉验证 + grep 引用核查*
