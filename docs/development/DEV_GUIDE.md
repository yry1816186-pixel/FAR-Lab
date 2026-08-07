# FAR-Lab 开发指南 (DEV_GUIDE)

> 面向贡献者的一站式开发手册。基于 2026-08-07 全量审计后的**已验证事实**编写。
> 文档导航唯一源: [docs/INDEX.md](docs/INDEX.md) · 代理契约: [AGENTS.md](AGENTS.md)

---

## 1. 仓库地图（审计后状态）

```
FAR-Lab/
├── src/               TypeScript 核心本体（25 CLI / R0-R9 裁决内核 / 22 反剧场检测器 / REST API / agent_loop）
├── tests/             Node test（2023 基线: 2017 pass / 0 fail / 6 skip）
├── frontend/          15 页 React+D3 前端（208 测试）· 独立 node_modules
├── repro/             Python 独立重算轴（Bem 2011 / far_chain_repro / science_harness / math_backends）
├── schema/            25 SQL 迁移 + 5 JSON schema
├── scripts/           51 个门禁/扫描/构建脚本（项目 CI 的强制执行层）
├── ci/                4 个冒烟测试
├── docs/              文档总线（INDEX.md 唯一导航源）
│   ├── learning/      13 章教学脊柱（核心资产 — 必须保持 git 追踪！）
│   ├── design/        33 个正式设计文档（00-32）
│   ├── archive/       历史归档（评委逼问系统、审计快照、agent 材料）
│   └── audits/        审计报告（含本周期 3 份）
├── golden_vectors/    跨语言字节级一致性锚点（TS/Python/浏览器）
├── .claude/           AI 代理治理配置（6 子代理 + 7 规则 + 5 skills）— 有意追踪
├── .pi/               Pi 代理配置（prompts/extensions）— 有意追踪
├── .far-design/       设计状态机（门禁脚本消费）
├── .far-implementation/ 实现状态机（adversarial/raw 过程产物已清理）
├── .far-master/       治理 YAML 状态
├── .far-release/      发布门禁证据
└── migrate.sh/.ps1    治理迁移脚本（dry-run 默认；--apply 执行）
```

## 2. 开发循环（每次会话的基线协议）

```bash
# 1. 验证基线（AGENTS.md 强制第一步）
pnpm run typecheck && pnpm run lint && pnpm test
node src/cli/far.ts demo

# 2. 读当前状态
cat PROGRESS.md docs/INDEX.md   # 注意: PROGRESS.md 是检查点，真实状态以 git status + 测试为准

# 3. 开发（TDD 铁律）
#    RED（先写失败测试）→ GREEN（最小实现）→ REFACTOR（保持绿）

# 4. 变更后必跑
pnpm run typecheck && pnpm run lint && pnpm test
```

## 3. 质量门禁（全部必须绿）

| 门禁 | 命令 | 期望 |
|---|---|---|
| TypeScript 严格 | `pnpm run typecheck` | exit 0（strict + noUnusedLocals/Parameters） |
| Lint | `pnpm run lint` | 0 errors, 0 warnings（--max-warnings 0） |
| 测试 | `pnpm test` | 2023 tests: 2017 pass / 0 fail / 6 skip |
| Python 静态 | `ruff check repro/` | All checks passed! |
| 供应链 | `pnpm audit` | 0 known vulnerabilities |
| 门禁脚本 | `node scripts/zero_tolerance_scan.mjs` 等 | 详见 scripts/ 清单 |

## 4. 代码规范（工程铁律）

1. **命名即意图**：类型名 = 名词，函数名 = 动词，检测器 = `detect_<攻击>`（如 `detect_phack_alpha`）
2. **函数 ≤ 40 行、单职责**；参数 ≤ 4（超出用 options 对象）
3. **无桩函数**：每个函数必须真实实现，或显式标注 TODO + 截止日期
4. **测试先行**：任何修复先写"旧行为失败、新行为通过"的测试
5. **证据 > 断言**：声称"测试通过"必须附命令与数字
6. **永不吞异常**；错误路径必须有测试
7. **3 次重复才抽象**；搜索复用后再新建 → 单一真相源

## 5. 信任内核红线（高风险的变更区）

涉及 Claim / FEC / Evidence / Verdict / Proof / provenance / signatures 的变更**必须**：
- 确定性行为（同一输入 → 同一输出，跨语言一致）
- 规范处理（canonical serialization）
- 负向/边界/篡改测试
- 声明该机制**不能证明什么**（机制边界透明）

参考: [docs/design/10_SCIENTIFIC_AUTHORITY...](docs/design/10_SCIENTIFIC_AUTHORITY_EPISTEMIC_MODEL_AND_ETHICS.md) 与 `src/anti_theater/` 的实现模式。

## 6. 文档纪律

- **docs/INDEX.md 是唯一导航源**；根目录 DOCS_INDEX.md 只是薄转发页
- 新增文档必须出现在 INDEX.md；**不允许孤儿文档**（2026-08-07 审计发现并修复了 ULTIMATE_DESIGN.md 孤儿）
- **docs/learning/ 13 章教学脊柱是核心交付物**，任何涉及系统行为的变更都要同步对应章节
- 文档不得含占位符（`待补充`/`TODO`/`TBD`）——scripts/design_lint.mjs 会自动扫描
- 变更后运行 `node scripts/doc_command_check.mjs` 验证文档中的命令真实可用

## 7. 常见任务速查

| 任务 | 路径/命令 |
|---|---|
| 新增反剧场检测器 | `src/anti_theater/detectors/<name>.ts` + 注册进 `index.ts` + `trap_taxonomy.ts` + golden vector |
| 新增 benchmark 种子 | `scripts/generate_benchmark.ts` + golden_vectors/cases/ |
| 新增 CLI 子命令 | `src/cli/commands/<name>.ts` + 注册 + 测试 |
| 跑 Python 重算轴 | `cd repro && python -m pytest`（或 `uv run`） |
| 跑前端 | `cd frontend && pnpm dev` |
| 治理迁移（dry-run） | `bash migrate.sh` / `powershell -ExecutionPolicy Bypass -File migrate.ps1` |
| 死代码检查 | `pnpm run typecheck`（TS）+ `ruff check repro/`（Python） |

## 8. 已知环境约定

- **Windows**: 终端为 git-bash（MSYS）。路径注意 MSYS `/c/...` 与原生 Windows Node 的兼容（见 memory: spawnSync('sh') 需 cygpath 转换）。
- **Python**: python3=3.14.3（系统）/ python=3.11.15；`.venv` 为项目环境（gitignored）。
- **包管理**: pnpm（Node 侧）+ uv（Python 侧）；锁文件 pnpm-lock.yaml / uv.lock 必须提交。
- **Node 编译缓存泄漏**: 如发现根目录或子目录出现 `0/v<版本>-x<哈希>/` 目录，直接删除（已全局 gitignore）。

## 9. 提交与发布

1. 提交信息遵循 Conventional Commits（`feat:` / `fix:` / `docs:` / `chore:` / `test:`）
2. 发布前过 .far-release 门禁（`scripts/verify_release_checksums.mjs` 等）
3. 大变更更新 CHANGELOG.md
4. 未经授权不 push / 不合并 PR / 不发布 release（AGENTS.md §5）

---
**本指南由 2026-08-07 治理审计校准。若与仓库实际状态冲突，以 `git status` + 测试输出为准。**
