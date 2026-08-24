# Workstream Ownership — Parallel Round R2 (2026-08-24)

Fifteen specialist lanes replacing the seven-lane R1 contract. Each lane gets
ONE branch + ONE worktree created from the R2 BASE tag in `BASELINE.md`.
Write ownership is exclusive: a lane that needs a change outside its files
opens a handoff record instead of editing.

Lane ID format `NN-slug`; branch `ws/r2/<nn>-<slug>`; report
`.planning/concurrency/reports/r2/<nn>-<slug>-report.md`.

Where a file mixes multiple concerns, the lists below name the ONE
authoritative semantic owner; everything else reaches it by handoff/port —
never by a second implementation.

## Lanes and primary write ownership

### 01 hx-web-product — Web product logic
- `web/src/**` except lane-02 files: `api/**`, `hooks/**`, `state/**`,
  `types/**`, `utils/**`, `dictation/**`, `i18n/**`, `stubs/**`,
  `components/**` (except `common.tsx`, `ui/**`), `App.tsx`, `main.tsx`
- `web/index.html`, `web/vite.config.ts`, `web/tsconfig.json`,
  `web/package.json` (dependency changes need 15 sign-off via handoff)
- `web/src/utils/ingest.ts` is the client-side ingest stopgap; lane 05 owns
  the authoritative server-side boundary and ports it via a 05→01 handoff.
- Do NOT touch: `src/server/api.ts` route semantics (handoff to 12), science
  logic, visual tokens/primitives (02).

### 02 visual-design — Visual tokens, styles, common primitives, viz
- `web/src/styles.css`, `web/src/tones.ts`, `web/src/components/common.tsx`,
  `web/src/components/ui/**`, `web/src/viz/**`
- UX evidence artifacts under `evidence/hx/`; semantic authority for
  `project-spec/policies/PRODUCT_HCI.md` (file owned by 15, edits via handoff)
- Do NOT touch: component business logic (handoff to 01).

### 03 terminal-desktop — CLI, TUI, Desktop
- `src/cli/**` (CLI surface; `gc.ts` storage-lifecycle semantics are decided
  by 13, surface by 03), `packages/tui/**`, `desktop/**`
- Do NOT touch: engine code behind CLI flags — handoff to the semantic owner.

### 04 retrieval-evidence — External retrieval, source adapters, retrieval/evidence/screening semantics
- `src/sources/{arxiv,crossref,europepmc,openalex,http,json,response-cache,error,index}.ts`
- `src/pipeline/{screening,screening-types}.ts`,
  `src/pipeline/stages/{retrieve,align,title-normalize,evidence}.ts`
- `src/server/screening.ts`, `src/server/zotero.ts` (semantics; route
  registration changes go through 12)
- Do NOT touch: parsing/normalization inside sources (05), hypothesis-side
  use of evidence (06), `src/domain/**` beyond handoff-noted semantic edits.

### 05 multimodal-ingest — Scientific ingestion/parsing, multimodal artifact understanding
- `src/ingest/**` — the ONE authoritative server-side ingest boundary; move
  scattered parsing here (consolidation is this lane's mandate)
- `src/sources/{fulltext,text,snapshot}.ts` (parse/normalize/extract)
- Porting target for `web/src/utils/ingest.ts` (01 hands off; the client copy
  shrinks to an API call)
- Incoming residue: in-flight `src/ingest/**` + `tests/ingest-*.test.ts` on
  `build/hx-reconstruction` (see BASELINE.md residue table) — port/fuse, do
  not reimplement.
- Do NOT touch: retrieval query/citation semantics (04), web upload UX (01).

### 06 scientific-reasoning — Hypothesis/falsification/ranking/planning/revision methodology
- `src/pipeline/stages/{scope,verify,hypotheses,hypothesis-dedup,falsify,rank,plan,plan-formal,revise,guard,shared,execute,feedback}.ts`
  (`execute.ts`/`feedback.ts` runtime semantics co-signed by 10 via handoff)
- `src/pipeline/{llm,types}.ts`
- `src/app/{evaluators,quality-gate,iteration,verify}.ts`
- Semantic edits to `src/domain/{iteration,formal,stat-forensics,conformal,revision-predicates,hypothesis,plan,prediction,scorecard}.ts`
  (handoff note required; 12 stewards structure)
- Do NOT touch: orchestrator stage order (08 co-owns, handoff), experiment
  runtime (10), model transport (11).

### 07 scientific-communication — Manuscript/report/export/reproducibility production
- `src/pipeline/paper-outline.ts`, `src/pipeline/stages/export.ts`,
  `scripts/export-public.mjs`
- New manuscript/report/reproducibility-export production code (create under
  this lane, e.g. `src/report/**`)
- Do NOT touch: web rendering of exports (handoff to 01), submission
  packaging (15).

### 08 agent-kernel — Agent lifecycle, memory/context, supervisor, long-horizon control
- `src/agent/{loop,rollout,compaction,subagents,budget,permissions,protocol,research-query,exploratory-codeact,exploration-runner,telemetry}.ts`
- `src/server/{conversation-agent,conversations,automations}.ts`
- `src/app/{memory,supervisor,orchestrator}.ts` (orchestrator stage ORDER
  co-decided with 06 via handoff)
- Do NOT touch: tool/MCP/skill capability plane (09), provider transport (11).

### 09 capability-ecosystem — Tools/MCP/Skills/hooks/plugins/capability registry/domain packs
- `src/agent/{tool,mcp,mcp-http,mcp-manager,skills,hooks,hooks-compose}.ts`,
  `src/agent/capabilities/**`
- `src/plugins/**`, `skills/**`
- Do NOT touch: agent loop/control flow (08), provider transport (11).

### 10 scientific-execution — Experiment execution and scientific compute runtime
- `src/experiment/**`, `experiment-runtime/**` (uv sidecar, sklearn builders,
  SSH target)
- `src/server/experiment-ops.ts`, `src/app/lineage.ts`
- `tests/{experiment*,scheduler,gateway,remote-executor}*.test.ts`
- Do NOT touch: statistical decision semantics in `src/pipeline` (06); the
  `execute.ts`/`feedback.ts` stage FILES are 06's — coordinate via handoff.

### 11 model-plane — Provider/model transport, routing, structured output, usage/cost accounting
- `src/providers/**`, `src/model-plane/**` (incoming via residue fusion —
  port from the residue branch, do not rebuild)
- `src/app/{provider-resolver,usage-ledger,spend-limit,run-budget}.ts`
- Do NOT touch: prompt/scoring semantics in stages (06), generic server
  config (12).

### 12 platform-data-api — Generic platform, domain stewardship, persistence, events/artifacts, generic server/API
- `src/persistence/**`, `src/platform/**`,
  `src/server/{api,actions,main}.ts`, `src/app/composition.ts`
- `src/domain/**` stewardship: structural integrity, `index.ts`, `ids.ts`,
  no duplicate concepts. Semantic lanes may edit their domain files only with
  a handoff note in their integration report.
- Root `package.json` / lockfiles, `tsconfig.json`, `eslint.config.js`,
  `vitest.config.ts`, `scripts/**` (runtime tooling)
- Do NOT touch: stage logic (06), UI (01/02), provider internals (11).

### 13 reliability-security — Reliability/security/observability/performance infrastructure, red-team handoffs
- Reliability/security/observability/performance infrastructure modules:
  `src/app/observability.ts` (incoming residue), recovery/checkpoint state
  modules, GC storage-lifecycle semantics (co-signed with 03)
- Cross-lane red-team handoffs: file vulnerability/reliability reports; the
  owning lane applies the fix. 13 may hot-patch another lane's files only for
  a security blocker, recorded as a deviation in its report.
- Do NOT touch: feature semantics.

### 14 evaluation-redteam — Independent eval/** and benchmark/acceptance evidence
- `eval/**` (offline deterministic benchmarks, gold sets, judge scripts)
- Production code is read-mostly: report divergence, never tune production
  code to please an eval. Test-infrastructure fixes go via handoff.
- Feeds acceptance evidence to 15; never self-certifies.

### 15 governance-release — Specs/docs/repository governance/licensing/CI-release/submission/competition evidence
- `project-spec/**`, `AGENTS.md` constitution-level edits (user approval
  required), `docs/**`, `submission/**`, `research/**`
- `zcode-harness/**`, `.github/workflows/**`, `LICENSE`, `NOTICE`,
  `DEPENDENCY_POLICY.md`, CI-release policy
- `.planning/concurrency/**` maintenance (all lanes read)
- Dependency-policy sign-offs for root/web `package.json` changes
- Do NOT touch: runtime code except via security-blocker handoff.

## Shared, read-for-all

`src/shared/**`, `tests/**` outside a lane's list (edit only the tests for
behavior you changed), `.planning/**` planning records. Unlisted top-level
generated outputs (`artifacts/`, `build/`, `dist/`, `evidence/` outside lane
evidence dirs) are never hand-edited.

## Handoff record format

`.planning/concurrency/handoffs/r2-<date>-<from-nn>-<to-nn>-<slug>.md` with:
requested change, reason, files, urgency, proposed patch (optional). The
owning lane schedules it; the requesting lane never applies it directly.

**Port-vs-duplicate rule:** when the needed capability already exists
anywhere — including the out-of-lineage residue branches listed in
BASELINE.md — the handoff must reference that implementation and the owner
ports or fuses it. Duplicate implementations are forbidden.
