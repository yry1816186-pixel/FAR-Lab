# Workstream Ownership — Parallel Round (2026-08-24)

Seven lanes. Each lane gets ONE branch + ONE worktree created from the BASE
SHA in `BASELINE.md`. Write ownership below is exclusive: a lane that needs a
change outside its lanes files opens a handoff record instead of editing.

## Lanes and primary write ownership

### HX — Human Experience
- `web/src/**` (components, i18n, hooks, utils, styles)
- `web/index.html`, `web/vite.config.ts`, `web/tsconfig.json`, `web/package.json` (dep changes need PLATFORM sign-off via handoff)
- `packages/tui/**`
- Do NOT touch: `src/server/api.ts` route semantics (request via PLATFORM), research/science logic.

### DESIGN — Product/Visual Design & HCI
- `web/src/**/*.css`, design tokens, `web/src/components/common/**` primitives
- `.planning/PLAN-hx-reconstruction.md` design sections, `project-spec/policies/PRODUCT_HCI.md`
- UX evidence artifacts under `evidence/hx/`
- Do NOT touch: component business logic (request via HX handoff).

### SCIENCE — Scientific Algorithms
- `src/pipeline/**` (retrieve, verify, evidence, hypotheses, critique, rank, plan)
- `src/app/evaluators.ts`, `src/app/quality-gate.ts`, `src/app/iteration.ts`
- `src/sources/**` (OpenAlex/citation retrieval normalization)
- `eval/**` (offline deterministic benchmarks)
- Do NOT touch: web rendering of results (handoff to HX).

### AGENT — Agent Runtime & Memory/Context
- `src/agent/**`, `src/server/conversation-agent.ts`, `src/server/automations.ts`
- `src/app/memory.ts`, `src/app/supervisor.ts`, `src/app/orchestrator.ts` (orchestrator stage semantics co-owned with SCIENCE — coordinate via handoff)
- Do NOT touch: provider transport (`src/providers`) — PLATFORM owns.

### EXECUTION — Experiment Runtime
- `src/experiment/**`, `experiment-runtime/**` (uv sidecar, sklearn builders, SSH target)
- `src/app/lineage.ts` experiment-feedback linkage
- `tests/experiment*.test.ts`, `tests/scheduler.test.ts`, `tests/gateway.test.ts`, `tests/remote-executor.test.ts`
- Do NOT touch: statistical decision semantics inside `src/pipeline` (SCIENCE).

### PLATFORM — Providers, Persistence, API, Infrastructure
- `src/providers/**`, `src/app/provider-resolver.ts`, `src/app/usage-ledger.ts`, `src/app/spend-limit.ts`, `src/app/run-budget.ts`
- `src/persistence/**`, `src/server/api.ts`, `src/server/actions.ts`, `src/app/composition.ts`
- `scripts/**`, `.github/workflows/**`, root `package.json` / lockfiles, `zcode-harness/**`
- Do NOT touch: stage logic inside `src/pipeline` (SCIENCE), UI (HX).

### GOVERNANCE — Security, Evaluation, Spec, Technology Intelligence
- `project-spec/**`, `AGENTS.md` constitution-level edits (user approval required)
- `zcode-harness/scripts/secret-scan.mjs`, `path-hygiene.mjs`, `completion-gate.mjs`
- `research/**` (evidence index, OSS due diligence, tech intel)
- `docs/**`, `submission/**`
- Do NOT touch: runtime code except via security-blocker handoff (must document the vulnerability).

## Shared, read-for-all

`src/domain/**` (domain model), `src/shared/**`, `tests/**` outside a lane's
list (edit only the tests for behavior you changed), `.planning/concurrency/**`
(GOVERNANCE maintains, all read).

`src/domain/**` changes require a handoff note in the changing lane's
integration report — domain model shifts are cross-lane by definition.

## Handoff record format

`.planning/concurrency/handoffs/<date>-<from>-<to>-<slug>.md` with: requested
change, reason, files, urgency, proposed patch (optional). The owning lane
schedules it; the requesting lane never applies it directly.
