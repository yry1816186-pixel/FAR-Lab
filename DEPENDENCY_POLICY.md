# Dependency Policy

## Policy

**This project's runtime dependency set is exactly `{ zod }` — the zod-only invariant.** The
`dependencies` field of `package.json` contains `zod` and nothing else, and must stay that
way. Everything needed only at development time (TypeScript, Vitest, ESLint, Vite) lives in
`devDependencies`. The shipped product runs on Node.js built-ins plus the single recorded
exception (`zod`, schema contracts — a standing decision recorded in `.control/DECISIONS.jsonl`).

## Rationale

- Supply-chain security: no transitive dependency surface for an tool that reads secrets and
  calls external APIs.
- Reproducibility: the dependency-lock hash inside every reproducibility bundle stays
  meaningful because the runtime surface is (near-)empty.
- Installability and startup cost.

## Exceptions process

1. Type-only imports that erase at compile time are allowed in `devDependencies`.
2. Any ADDITIONAL runtime dependency requires an explicit DECISIONS entry with: the need that
   cannot be met by Node built-ins or a source-level extraction (the preferred route — see
   the jsonrepair EXTRACT precedent), the alternatives compared, and the maintenance/licensing
   review. One exception exists today: `zod`.

## Enforcement

- Review gate: PRs adding to `dependencies` without a linked decision are rejected.
- `npm ls --prod --depth=0` must list exactly `zod@^3` (and nothing else).

(This wording follows the public zero-dependency governance pattern; see
`evidence/W-G/code-review/` and `research/WAVE-G-SCOUT.md` for provenance.)
