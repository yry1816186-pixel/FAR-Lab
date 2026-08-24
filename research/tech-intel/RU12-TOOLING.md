# RU-12 TOOLING — Research Packet (2026-08-24, SEARCH_SATURATED)

Main-Agent direct research. Status: SOURCE_VERIFIED at registry/repo level
(GitHub API had transient 504s this session; license facts re-verified via
raw.githubusercontent + npm registry which stayed reliable).

## Problem
Developer-tooling plane for researchers: A8.5 structured diff + three-way
merge for domain artifacts (JSON artifacts make line-diffs meaningless; feeds
B4.3 branching) · B13.3 trajectory inspection with debugger semantics
(breakpoints at stage boundaries, watch state, rewind-edit-replay from
checkpoints) · C5.2 session attach/detach (tmux model: long runs outlive UI
process) · A11.5 literate computational documents (Quarto-class).

## Search vocabulary run
`nbdime notebook semantic diff three-way merge`,
`json semantic diff typescript library`, `domain specific artifact diff merge`,
`LangGraph Studio time travel checkpoint rewind`, `agent trajectory debugger
breakpoints`, `session attach detach tmux model long running process reattach`,
`jupyter mcp server kernel integration agent`, `quarto literate programming
computational documents cache execution`, `observable notebooks reactive`,
`marimo notebook reactive`

## Candidate table (SR=read, SC=probed)
| Candidate | Org | License | Maturity | Solves | Family | Tag |
|---|---|---|---|---|---|---|
| nbdime | Jupyter | BSD-3-Clause (LICENSE.md read) | established standard | semantic diff/merge FOR NOTEBOOKS specifically — cell-aware, output-aware; the MERGE ALGORITHM pattern (base/local/remote → conflict classes) is the transferable part | semantic diff/merge | SR(license)+PR(algorithm paper) |
| json-diff / deep-diff (npm) | community | MIT both | json-diff stale 2023 / deep-diff active 2026-01 | generic JSON structural diffs | leaf-level ops list | SC |
| fast-json-patch (RFC 6902) | community | MIT widely | standard | standardized JSON Patch op format = portable diff representation | patch standard | PR(RFC) |
| LangGraph Studio time-travel | LangChain | product (docs reachable) | production UX precedent | breakpoints on node boundaries + rewind-to-checkpoint + edit-state-and-resume | debugger semantics | PR(docs 200) |
| Node inspector (--inspect + CDP) | Node stdlib | n/a | built-in | real debugger protocol available for TS-side stepping IF we ever wire it | debug transport | FACT(runtime) |
| tmux attach/detach model | tmux | doc | canonical | session outlives client; multiple clients; read-only watchers | session lifecycle | PR(man 200) |
| jupyter-mcp-server | Datalayer | BSD-3-Clause (LICENSE read) | active 2025+ | kernel-as-MCP: execute cells in a live Jupyter kernel from an agent | notebook integration (overlaps RU-12/D5.1 boundary) | SR(license) |
| Quarto | Posit | MIT (README license section read) | industry standard | literate docs: markdown + cached executable code cells + multi-format render | literate computing | SR |
| marimo | marimo-team | Apache-2.0 (community-known; verify file at adoption) | rising 2025-26 | reactive notebooks (cells as DAG, auto-rerun) | literate/reactive | KEEP-watch |

## Source-level findings
1. **Domain-artifact diff (A8.5)**: our artifacts are zod-typed JSON with
   stable id anchors (hypothesis_id, claim_id, decision_rule ids). The right
   mechanism is NOT generic json-diff but ID-ANCHORED STRUCTURAL DIFF:
   walk two versions of a typed artifact via its zod schema, emit ops keyed
   by object identity {op: added|removed|changed, path: id-chain, field,
   old, new}; changed decision_rules and falsification thresholds get
   SEMANTIC flags (rule-modified, threshold-tightened, prediction-added).
   Three-way merge follows nbdime's conflict classification: non-overlapping
   subtrees auto-merge; same-object edits = conflict requiring human choice
   (feeds revision chain, not git). Representation = RFC-6902-shaped internal
   ops (portable, no dependency needed to emit). This makes VersionDiff
   explainable per-field — directly upgrades A8.1/A8.4 evidence quality.
2. **Debugger semantics (B13.3)**: LangGraph Studio validates the UX pattern;
   our event spine + step_fingerprints already store everything needed.
   BUILD mapping: breakpoint = stage-boundary predicate (pause before stage X
   when condition); watch = projected state view (existing GET projections);
   rewind-edit-replay = fork writer (RU-2 c7cfc91) + fingerprint family hits
   reproduce unchanged steps free (already proven W8/OAOO). So B13.3 is a
   THIN UX/orchestration layer over existing primitives — no new engine.
   Node CDP only relevant if we later debug the TS runtime itself (out of scope).
3. **Session attach/detach (C5.2)**: tmux semantics decompose to: server-side
   run ownership already exists (server process owns runs, leases survive);
   what's missing is CLIENT re-attach: any surface (CLI/web/desktop) can
   reconnect to a live run's SSE stream + issue steering/approvals.
   Current state: web already reattaches via SSE Last-Event-ID (D-094);
   CLI `far watch` exists but one-shot. Gap = unified "attach" verb across
   surfaces + detached-run notifications. Mostly PRODUCT wiring over existing
   streams; no new infrastructure. Windows console limitations documented
   (no raw tmux equivalent needed since server owns sessions).
4. **Literate documents (A11.5)**: Quarto is MIT but is an external
   toolchain (pandoc/deno runtime) — VENDORING violates minimal architecture.
   The FAR-Lab-native shape: export bundle already contains deterministic
   IMRaD projection + receipts + artifacts; add a QUARTO-COMPATIBLE EMITTER:
   generate .qmd files referencing our artifacts so a researcher can
   `quarto render` externally when they want publication-grade output.
   Zero runtime dep; interop without absorption. marimo reactive-DAG model
   noted as future influence on experiment iteration UI, no adoption now.

## Verdicts (main-Agent, closed vocab)
- Domain-artifact structural diff: **BUILD** (zod-schema-walking differ +
  RFC6902-shaped ops + semantic flags; single owner src/domain/artifact-diff.ts)
- Three-way merge: **BUILD** following nbdime conflict taxonomy (BSD pattern,
  clean-room implementation; human-resolution feeds revision chain)
- Generic json-diff/deep-diff libs: **REJECT** (no schema awareness; trivial to emit own ops)
- Trajectory debugger layer: **BUILD** thin (breakpoint predicates + attach UX
  over spine/fork/fingerprints; LangGraph Studio pattern ADAPT)
- Session attach verb: **BUILD** (unify CLI/web/desktop onto existing SSE+
  lease primitives; detached-notification rides automations engine)
- jupyter-mcp-server: **DEFER** (D5.1 notebook integration; trigger: user demand
  for live-kernel exploration; BSD-3 verified ready)
- Quarto: **ADAPT-interop** (emit .qmd from bundle; never absorb toolchain)
- marimo: **KEEP-watch** (reactive model may inform iteration UI later)

## Integration sketch (owners)
- src/domain/artifact-diff.ts: structural differ owner (pure functions over zod schemas)
- revise.ts + compare surfaces: consume semantic ops (replaces coarse line-diff views)
- fork flow (RU-2): merge/conflict resolution entry point before branch materialization
- CLI: `far attach <run>` verb; web/desktop reuse stream components
- export lane: qmd emitter alongside IMRaD markdown (EEL-lane coordination)

## Deterministic validation workload (offline)
- differ golden tests: paired artifact versions → exact expected op lists
  (including semantic flags rule-modified/threshold-tightened/prediction-added)
- three-way merge matrix: disjoint/subtree-conflict/same-field cases →
  auto-merged vs conflict classification matches nbdime semantics
- attach: simulated disconnect/reconnect preserves cursor + no event loss
  (extends SSE tracker suite)
- qmd emitter snapshot test: bundle → valid qmd front-matter + cell refs

## UNVERIFIED
- marimo LICENSE file text (registry knowledge only this session)
- nbdime merge algorithm edge-case completeness beyond published description
  (paper-level read; source deep-read deferred until merge impl wave)
- desktop attach UX feasibility details (tray/deep-link interplay — PEX lane)

## Addendum: parallel research-agent reconciliation (2026-08-24, main Agent)
An independent agent saturated the same RU-12 in parallel. Convergences:
tmux-attach = wiring not infrastructure (SSE Last-Event-ID equivalence);
LangGraph/Temporal replay maps to existing step_outputs+fingerprints+forkRun;
three-way merge waits for a merge-back caller. Agent corrections adopted:
deep-diff is DEPRECATED on npm (prior packet said active); marimo =
Apache-2.0 verified (closes UNVERIFIED); Quarto MIT>=1.4/GPL-2<=1.3 nuance.
Agent's GO ranking adopted as canonical (RFC6902 id-anchored diff first —
schema-aware walker, zero deps; then time-travel layer; far attach; qmd
emitter). Packet remains the single source for RU-12.
