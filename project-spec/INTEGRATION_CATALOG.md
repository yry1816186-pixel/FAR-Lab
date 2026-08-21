# INTEGRATION_CATALOG.md — Current Integration Decisions / Candidate Boundaries

This is not a shopping list. `ADOPT/ADAPT` means evidence already makes the capability/boundary preferred; `CANDIDATE (W0)` means it is only a concrete route to compare/spike before adoption. Exact package/version must be revalidated at implementation time. Anything absent is **undecided**, not automatically rejected.

| Capability | Current decision | Boundary / reason |
| --- | --- | --- |
| Officially required model route | ADOPT (R1 hard path) | competition compliance + real model receipt; behind the model-agnostic interface, without hiding the required path |
| TypeScript/Node core | CANDIDATE (W0) | concrete one-stack route to compare; W0 must prove ecosystem/runtime fit before adoption |
| React Web workbench | CANDIDATE (W0) | common mature route, but task/IA design and current alternatives must justify it before lock-in |
| SQLite transactional state | CANDIDATE (W0) | simple single-machine hypothesis; W0 must prove ownership/recovery/concurrency and compare viable alternatives |
| Filesystem/object-style immutable artifacts | CANDIDATE (W0) | likely simple source snapshots/exports/repro boundary; implementation/storage choice still requires W0 proof |
| OpenAlex/Crossref/arXiv | CANDIDATE source adapters | useful scholarly discovery/metadata seeds; recheck APIs/coverage/license/fit and do not assume abstracts are sufficient |
| Full-text/domain-content adapters | BUILD/ADAPT as required | claims may only use content actually retrieved; use legal OA/full-text/data routes when evidence requires it |
| Deterministic schema/validation boundary | ADOPT requirement; implementation undecided | structured model outputs, state/contracts and scientific gates need deterministic validation; choose the smallest proven mechanism in W0 |
| External workflow engines (Temporal/DBOS/Restate etc.) | DEFER pending measured need | current R1 can start with explicit persisted stage machine; adopt only if recovery/concurrency complexity proves internal route insufficient |
| Graph database | DEFER | evidence relations can begin relationally; adopt only when query/scale evidence requires it |
| Vector database | DEFER | hybrid retrieval need must be measured; do not add because “AI app” |
| General agent framework | DEFER/REJECT for R1 unless proven | orchestrator/domain state should not be framework-owned; model roles are not a reason for agent theater |
| Python scientific adapter | ADAPT when required | out-of-process/isolated scientific tool boundary, not dual-stack core by default |
| RO-Crate / OpenLineage / Sigstore / similar provenance standards | WATCH/ADAPT selectively | useful interoperability ideas; adopt only the smallest subset that materially improves R1 reproducibility |
| Desktop/HPC/collaboration stacks | DEFER | later horizon unless a real user/release requirement makes them critical |

## Integration rule

For any consequential external dependency: verify source/version/license/security -> run relevant workload when needed -> define ownership/error/provenance boundary -> integrate real caller -> remove duplicate path -> record reversal/exit strategy.

The large `research/reference/FARLAB_PRE_RESEARCH_INTELLIGENCE_BASELINE.md` is a cold discovery corpus. It expands candidate search but grants no integration authority.
