# Governance

> How decisions are made in the FAR-Chain project. For release operations see
> `docs/governance/`.

## 1. Project vision

FAR-Chain is a claim-level verification layer for AI4S scientific claims — a
fourth layer that orthogonally sits across the agent execution stack and
verifies (not produces) claims. See `README.md`.

## 2. Roles

| Role | Who | Authority |
|---|---|---|
| **Maintainer** | `@yry1816186-pixel` (lead; `NEEDS_MAINTAINER_ASSIGNMENT` for additional maintainers) | decisions + merge + release |
| **Committer** | nominated by Maintainer | drive PRs in a subsystem |
| **Contributor** | anyone | propose PRs |

## 3. Decision process

- **Routine changes**: PR → review → merge (see `CONTRIBUTING.md`).
- **Significant changes** (architecture / schema / red-line / evaluation
  threshold / release gate): open an issue or RFC → Maintainer review.
- **Trust-root changes are REJECTED**: the 0001 five-table DDL, the
  canonicalHash algorithm, and the five-value VerdictKind enum must never change.

## 4. Keystone files (CODEOWNERS-protected)

The following files require Maintainer review on every change (see `.github/CODEOWNERS`):

- all `.github/workflows/*.yml`
- `package.json`, `tsconfig.json`, `schema/migrations/`

## 5. Progress definition

"Done" = production callers drive real dependencies (SymPy / DashScope HTTP /
venv subprocess / hash recomputation) — **not** "tests are green". Re-running an
already-green suite is zero progress.

## 6. Succession

Contributor → Committer → Maintainer, by nomination + review by existing
Maintainers. `NEEDS_MAINTAINER_ASSIGNMENT`: bus factor is currently 1; the
succession path and a second maintainer are outstanding.

## 7. Security & conduct

- Vulnerability disclosure: `SECURITY.md` (private, **not** public issues).
- Conduct: `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1).

## 8. References

- Release operations: `docs/governance/release-process.md`
- Contribution guide: `CONTRIBUTING.md`
- Project overview: `README.md`
