# Contributing to FAR-Chain

Thank you for your interest in contributing! This guide gets you from clone to
PR in 30 minutes.

## Prerequisites

- **Node.js** 24.x
- **Python** 3.11 or 3.12
- **pnpm** 9.x (run `corepack enable` after installing Node)
- **uv** or **pip** (Python package manager)

## 3-Step PR Process

### Step 1: Setup (5 minutes)

```bash
git clone https://github.com/yry1816186-pixel/FAR-Lab.git
cd FAR-Lab
pnpm install
pip install -e ".[dev]"
pnpm ci-all        # zero-tolerance → typecheck → smoke-core → test:agent_loop → test:ci
```

All checks should pass before you start making changes.

### Step 2: Make Changes

1. Create a branch: `git checkout -b fix/my-fix`
2. Make your changes. Follow the **Zero Tolerance Rules** (see below).
3. Add tests for your changes.
4. Run the full check pipeline:

```bash
pnpm install && pnpm test && pnpm run typecheck && pnpm run zero-tolerance && pnpm run ci-all
```

5. Commit with sign-off:

```bash
git commit -s -m "fix(scope): short description"
```

### Step 3: Submit PR

1. Push: `git push origin fix/my-fix`
2. Open PR using the template (`.github/PULL_REQUEST_TEMPLATE.md`)
3. Fill in **all** sections — especially "Testing" and "Breaking changes"
4. Wait for CI to pass (12-step pipeline)
5. Address review feedback

---

## Zero Tolerance Rules

The following patterns are **strictly forbidden** in all committed code.
CI gate `zero-tolerance` (via `pnpm run zero-tolerance`) scans and blocks PRs
containing any of these:

| # | Forbidden | Required Instead |
|---|-----------|-----------------|
| 1 | `: any` | `unknown` + type guard |
| 2 | `@ts-ignore` / `@ts-nocheck` | Fix the type at its source |
| 3 | `as unknown as X` | Proper type narrowing |
| 4 | Empty `catch {}` block | Handle, re-throw, or `logger.error` |
| 5 | Hardcoded secrets / API keys | Read from `env` / config |
| 6 | `innerHTML` / `dangerouslySetInnerHTML` | Safe alternatives |
| 7 | Mutating function parameters | Immutable operations |
| 8 | Hardcoded URLs | Config / env lookup |
| 9 | Modified test expectations to pass | Fix the implementation |
| 10 | Deleted parameters to fix arity | Fix the caller |
| 11 | Stubs replacing real implementations | Fix the implementation |
| 12 | `X-DashScope-Enable-Thinking` / `extra_body` / `defaultHeaders.*Enable` in Core | Only in `competition_aliyun_qwen` adapter |

---

## Development Rules (Mandatory)

1. **Read before coding**: 本文件 §Zero Tolerance Rules（反幻觉与反回归护栏）
2. **Model neutrality**: Core (`src/llm_gateway/`) must NOT hard-code Qwen, Bailian, or DashScope.
   See `FAR_CHAIN_DEV_SPEC/16_阿里云参与边界与模型中立策略_ALIYUN_MODEL_NEUTRALITY.md`.
3. **Casing**: TypeScript/Python in-memory fields use `camelCase`; SQLite physical columns use `snake_case`.
4. **External facts**: Must be marked `[ref]` with a `SourceCard`; never assert without evidence.
5. **Auth order**: When specs conflict, follow `AGENTS.md` §1 authority order.

> **设计文档说明**：历史 `FAR_CHAIN_DEV_SPEC/` 工作目录已并入 `FINAL_PACKAGE/` 交付包（编号体系不同，不一一对应）；`FINAL_PACKAGE/` 为竞赛 PDF 提交层（git-ignored·git clone 不可见）。源码内 `Authority: FAR_CHAIN_DEV_SPEC/NN` 注释为 V1 设计溯源标注（非可执行路径），保留作历史来源记录；**运行时 SSOT 以源码 + 本 CONTRIBUTING 为准**。

---

## PR Slicing

Keep PRs small and focused. Recommended slice reference（V1 PR 切片，已落地为 `FINAL_PACKAGE/` 交付包）:

| PR | Scope | Max Size |
|----|-------|----------|
| PR-01 | Scaffold + CI skeleton | A/J-01 |
| PR-02 | Schema + enum sync | C epic |
| PR-03 | evidence_log + cross-lang hash + golden vectors | D epic |
| PR-04 | llm_gateway Core offline adapter + adapter skeleton | E-01~E-04 |
| PR-05 | Competition adapter + smoke | E-05~E-10 |
| PR-06 | evidence_graph + cycle guard | F epic |
| PR-07 | falsifiability_verdict | G epic |
| PR-08 | repro_deterministic | H epic |
| PR-09 | agent_loop stage schemas | I-01~I-04c |
| PR-10 | runAgentLoop + eval audit | I-05~I-07 |
| PR-11 | API + report artifacts | K-01/K-05 |
| PR-12 | Frontend ProofChainViz / HonestyWall | K-02/K-03 |
| PR-13 | Ablation + benchmark metrics | K-04 |
| PR-14 | Open-source docs + submission evidence | L epic |

One PR = one thing. No mixing schema changes with feature work.

---

## Required Commands (Before Every PR)

Run these **in order** before pushing:

```bash
# 1. Install dependencies
pnpm install

# 2. Run all tests
pnpm test

# 3. TypeScript type check
pnpm run typecheck

# 4. Zero tolerance scan
pnpm run zero-tolerance

# 5. Full CI gate
pnpm run ci-all
```

If any command fails, fix the issue before pushing. Do NOT skip steps.

### Additional Checks

```bash
# Python regression tests (Windows: run manually)
pnpm run test:py

# Agent loop tests
pnpm run test:agent_loop

# CI-specific tests
pnpm run test:ci

# Eval-ring audit
pnpm run eval-ring-audit
```

---

## Code Style

- **TypeScript**: Strict mode (`tsconfig.json`), no `any`, ESLint + Prettier
- **Python**: `ruff` (configured in `pyproject.toml`)
- **Commit messages**: [Conventional Commits](https://www.conventionalcommits.org/)
  - `feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:` / `perf:` / `style:` / `ci:` / `build:`
  - Subject ≤ 72 characters
  - One commit = one thing
- **Sign-off**: All commits must include `Signed-off-by` line (`git commit -s`)

## Testing

| Command | Scope |
|---------|-------|
| `pnpm test` | Full regression (audit, llm_gateway, schema, evidence_log, evidence_graph, falsifiability, fec, math, dialogue) |
| `pnpm run test:agent_loop` | Agent loop FSM + degradation + anti-hallucination + e2e smoke |
| `pnpm run test:ci` | CI tests (zero_tolerance, cross_lang, verify_chain_smoke, eval_ring_audit) |
| `pnpm run test:py` | Python regression (cross-lang hash byte-equal, repro, BLAS diagnostics) |
| `pnpm run test:math` | Math verification layer |
| `pnpm run test:dialogue` | Dialogue layer |

## Need Help?

- Open a Discussion: https://github.com/yry1816186-pixel/FAR-Lab/discussions
- Report a vulnerability: see `SECURITY.md`
- Read `README.md` for project overview
- Read `README.dev.md` for development-specific notes
