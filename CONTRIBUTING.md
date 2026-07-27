# Contributing to FAR-Lab

Thank you for contributing. This guide covers environment setup, the PR
workflow, and the quality gates every change must pass.

## Prerequisites

- **Node.js** 24.x
- **Python** 3.11 or 3.12
- **pnpm** 10.x (run `corepack enable` after installing Node)
- **pip** (for the Python verification axis: SymPy / Z3)

## Setup

```bash
git clone https://github.com/yry1816186-pixel/FAR-Lab.git
cd FAR-Lab
pnpm install
node scripts/ensure_py_deps.mjs   # probes the Python axis; reports what is missing
node src/cli/far.ts doctor        # environment self-diagnosis (no API key needed)
pnpm test                          # full regression suite
```

All gates must pass on a clean clone before you start.

## Pull Request Workflow

1. Branch from the default branch: `git checkout -b feat/<short-slug>`.
2. Make your change. One branch = one logical change.
3. Add or update tests that exercise the real code path (not fixtures or
   stubs — see *Writing meaningful tests* below).
4. Run the gate pipeline:

   ```bash
   pnpm typecheck
   pnpm lint            # eslint src --max-warnings 0
   pnpm test
   pnpm run test:py     # Python axis (SymPy / Z3 · skips gracefully if absent)
   ```

5. Commit with Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`,
   `test:`, `chore:`, `ci:`). Subject ≤ 72 chars.
6. Open a PR. The PR body must state the **single real dependency** the change
   drives (real SymPy / DashScope HTTP / venv subprocess / hash recomputation)
   and the real production caller it wires.

## Quality Gates

| Gate | Command | What it enforces |
|------|---------|------------------|
| TypeScript | `pnpm typecheck` | Strict-mode type check (`tsc --noEmit`) |
| Lint | `pnpm lint` | ESLint flat config, zero warnings |
| Tests | `pnpm test` | Full node:test regression |
| Agent loop | `pnpm test:agent_loop` | 6-stage FSM + anti-hallucination |
| Python axis | `pnpm run test:py` | SymPy / Z3 verification (skips if absent) |
| Cross-lang | `node --test tests/evidence_log/cross_lang_consistency.test.ts` | TS canonicalHash === Python byte-equal |

## Zero-Tolerance Rules

These patterns are forbidden in committed code. ESLint and code review block
any PR containing them:

| # | Forbidden | Use instead |
|---|-----------|-------------|
| 1 | `: any` | `unknown` + type guard |
| 2 | `@ts-ignore` / `@ts-nocheck` | Fix the type at its source |
| 3 | `as unknown as X` | Proper type narrowing |
| 4 | Empty `catch {}` | Handle, re-throw, or log |
| 5 | Hardcoded secrets | Read from `env` |
| 6 | `innerHTML` / `dangerouslySetInnerHTML` | Safe alternatives |
| 7 | Mutating parameters | Immutable operations |
| 8 | Hardcoded URLs | Config / env lookup |
| 9 | Test expectations changed to pass | Fix the implementation |
| 10 | Deleted parameters to fix arity | Fix the caller |
| 11 | Stubs replacing real implementations | Fix the implementation |
| 12 | `X-DashScope-Enable-Thinking` / `extra_body` outside the competition adapter | Keep model-specific knobs in the adapter boundary |

## Writing Meaningful Tests

FAR-Lab guards against *theater* — tests that look green but verify nothing.

- Tests must exercise the **real** code path (real statistics, real subprocess,
  real hash recomputation), not `FakeBackend` fixtures or precomputed metrics.
- Do not add tests for symbols that have **zero production callers** — wire the
  symbol into a production path first.

## Architecture Authority

- `src/falsifiability/verdict_kernel_v2.ts` is the single source of truth for the five-value verdict
  (CONFIRMED / REFUTED / INCONCLUSIVE / DEGRADED_SCOPE / UNTESTED).
- TypeScript in-memory fields use `camelCase`; SQLite physical columns use `snake_case`.

## Repository Configuration (maintainer)

These GitHub settings make the quality gates binding. They require repository
admin access and cannot be done from a local clone.

1. **Branch protection** — Settings → Branches → add a rule for the default
   branch. Enable *Require status checks* and add `ci`. Enable *Require pull
   request reviews*.
2. **Push restriction** — on the same rule, restrict who can push to matching
   branches so all changes go through a PR.
3. **Actions permissions** — Settings → Actions → General → set *Workflow
   permissions* as needed for the CI workflow.
4. **Code owners** — `.github/CODEOWNERS` lists keystone files (CI workflows,
   package.json, schema migrations, governance docs). Enable *Require review
   from Code Owners* on the branch rule.

Until these are set, the gates are advisory rather than blocking.

## Open-Source Release (v1.0.0)

This repo is being prepared for public open-source release. See:

- `docs/governance/OPEN_SOURCE_RELEASE_PLAN.md` — release-form decisions
- `docs/governance/release-process.md` — tagging / release workflow
- `docs/installation.md` — user / developer / Docker install
- Issue templates: `.github/ISSUE_TEMPLATE/` (bug / feature / reproducibility / docs)

Install scripts (`scripts/install.sh` / `install.ps1`) and `far doctor` never read or
write API keys (see `SECURITY.md` *Open-Source Install / Doctor Secret Boundary*).

## Need Help

- Discussions: https://github.com/yry1816186-pixel/FAR-Lab/discussions
- Vulnerabilities: `SECURITY.md`
- Overview: `README.md`
