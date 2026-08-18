# FAR-Lab Human Surface Inventory

This document maps the human-facing product surfaces that must remain aligned with the same application services and scientific state. It is an architecture inventory, not evidence that a particular build, workflow, benchmark, or scientific claim passed. Current validation evidence comes from the exact commit's CI jobs and recorded executions.

## Browser application

The route registry in `frontend/src/components/layout/navigation.ts` is the information-architecture source of truth. Browser surfaces are organized around scientific work rather than chat sessions:

- **Mission and planning:** research workbench, planning, versions, live events, and reports.
- **Evidence and trust:** evidence visualization, integrity, receipt verification, audit trace, and honesty/limitations views.
- **Evaluation:** court, arena, benchmark/leaderboard, and ablation views.
- **Operations and orientation:** overview, guided verification, about, and explicit not-found recovery.

Every data-dependent surface must distinguish loading, empty, unavailable, partial, failed, replayed, and verified states. A pending mutation must never be rendered as persisted success. Navigation entries must resolve to real routes; unavailable capabilities are disabled with an explanation or omitted rather than simulated.

### Production data boundary

Production pages consume the same API/application-service paths used by CLI and integrations. Test fixtures, demo receipts, replay samples, and synthetic benchmark records must not become production loading prerequisites, success states, adoption evidence, or scientific evidence.

Receipt views may consume persisted receipt lists, receipt details, manifest members, stored verification results, uploaded envelopes, and explicit re-verification operations. A deterministic fixture endpoint may exist for tests only when it is not reachable as a production data fallback.

## CLI and terminal

`src/cli/far.ts` is the command registry source of truth; `far --help` is the authoritative command inventory. The terminal is a first-class product surface and must remain:

- scriptable through stable exit codes and machine-readable output where documented;
- explicit about credentials, live providers, replay mode, and unavailable capabilities;
- safe under non-TTY output and `NO_COLOR`;
- recoverable through actionable errors, doctor checks, cancellation, checkpoint, and resume;
- correct for Unicode/CJK display width;
- free of fabricated progress, percentages, completion, or scientific verdicts.

Historical `demo` or self-test commands are engineering checks only. Their output cannot be used as evidence that a live scientific mission, external provider call, or external validation succeeded.

## Generated human-readable artifacts

Human-readable exports are product surfaces and must be derived from structured state:

- Markdown, HTML, and LaTeX reports;
- research bundles and citation exports;
- `.far-proof` and receipt artifacts;
- campaign reports;
- planning, startup, stage, and verification receipts.

Renderers may change presentation but must not alter scientific facts, provenance, verdicts, limitations, or uncertainty. Long identifiers must remain inspectable. Tables and figures require accessible textual structure. Exported claims must retain their epistemic classification and source bindings.

## Operational feedback and errors

API errors, CLI stderr, Web alerts, logs, metrics, and event streams are all human surfaces. They must expose the real failure class and next action without leaking secrets. `NOT_SUPPORTED`, `NOT_AVAILABLE`, `REQUIRES_CONFIGURATION`, `BLOCKED_EXTERNAL`, and `INCONCLUSIVE` are valid outcomes and must not be converted into generic success.

## Native surfaces

FAR-Lab currently exposes browser and terminal surfaces. No Electron, Tauri, or native desktop layer should be claimed unless an actual maintained implementation exists.

## Maintenance contract

Changes to a human-facing capability must update the relevant source of truth and tests rather than a hand-maintained count or screenshot narrative. At minimum, reviewers should verify:

1. the route or CLI command reaches a real application service;
2. production execution cannot silently fall back to fixtures or synthetic science;
3. error, partial, replay, and unavailable states remain visible;
4. accessibility and machine-readable behavior are preserved;
5. documentation does not claim validation beyond the exact recorded evidence.

One-off visual QA reports, local agent canvases, repository-wiki generations, prompt files, run identifiers, and file manifests are local artifacts. They belong in ignored tool state, not in the product source tree.
