# Repo Hygiene Rule — 根目录卫生与产物放置规范

> 懒加载规则：当任务涉及**根目录新建/移动/删除文件**、**会话中间产物**、**运行时产物落盘**
> 时读取本规则。政策细节见 `docs/governance/ROOT-HYGIENE-POLICY.md`（SSOT）。
> 机器执行门禁：`scripts/repo_hygiene_gate.mjs`（CI blocking_gates 强制）。

## 1. 根目录白名单（ROOT_ALLOWLIST）

根目录只允许以下条目（文件按名、目录按前缀）。**根目录出现白名单外的 tracked/untracked 文件 = 门禁失败。**

```
README.md README.zh-CN.md LICENSE NOTICE CHANGELOG.md CONTRIBUTING.md
CODE_OF_CONDUCT.md SECURITY.md SUPPORT.md CITATION.cff GOVERNANCE.md AGENTS.md CLAUDE.md
package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json eslint.config.mjs
pyproject.toml uv.lock .npmrc .env.example Dockerfile docker-compose.yml Makefile
.gitignore .dockerignore .editorconfig .gitattributes .python-version
目录: docs/ frontend/ src/ scripts/ tests/ schema/ repro/ benchmark/ modules/ ci/
      agent/ golden_vectors/ templates/ .claude/ .github/ .far-design/ .far-implementation/
      .far-master/ .far-release/ .hermes/ .opencode/ .pi/ .zed/ .venv/ node_modules/
```

## 2. 会话产物放置规范（D2）

1. **会话中间产物**（调研报告 / 审计草稿 / 一次性脚本 / 分析输出）只允许放：
   - `.far-design/`（项目级决策与调研），或
   - `docs/research/`、`docs/audits/`、`docs/archive/`（按性质），或
   - 仓库外临时目录（`$env:TEMP`）
   - **禁止落根目录**。
2. **根目录只放「用户/评审者会读的」文件**（README / 契约 / 配置 / 索引）。
3. 新增根目录文件前先对照白名单；不在白名单 → 放进对应 docs 子目录或临时目录。
4. 运行时产物（coverage_output*、*.far-proof bundle、receipts.json、run_log.txt、
   审计中间日志）→ 立即在 `.gitignore` 追加规则，**绝不 git add**。
5. 会话记忆（`.codebuddy/`、`.pi/state/` 等）本地保留，不进仓库。
6. 一次性历史文档 → `docs/archive/`（只读，git 历史保留），并在 `docs/archive/README.md`
   登记；导航只经 `docs/INDEX.md`。

## 3. NODE_COMPILE_CACHE（D1）

Node ≥22 的 V8 compile cache 默认写在 **cwd 的 `0/` 目录**（`./0/v<ver>-x64-<hash>/`）。
修复：设置环境变量 `NODE_COMPILE_CACHE=<仓库外目录>`（用户级或 CI job env）。
CI 已在 `.github/workflows/ci.yml` 顶层 env 设置。验证：`git clean -ndX` 无 `0/`，
物理扫描 `Test-Path 0` 为 False。

## 4. 检查命令

```bash
node scripts/repo_hygiene_gate.mjs   # exit 0 = 卫生达标
git status --short                   # 无白名单外 untracked / 无 .far-implementation 污染
```
