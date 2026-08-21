---
description: Persist a compact truthful FAR-Lab checkpoint before interruption, compact, handoff or a major phase transition without creating narrative progress diaries.
skills: mission-orchestration
---

Reconcile actual workspace/Git/runtime first. Update only materially changed state using the project's existing `.control` schema:

- `EXECUTION_STATE.json` — current objective/phase, Critical Problem Set, in-flight work and exact nextAction;
- `ACCEPTANCE_STATUS.json` — only evidence-backed status changes;
- `BLOCKERS.json` — genuine blockers and exact missing dependency;
- `DECISIONS.jsonl` — consequential decisions/reversal triggers;
- `DELEGATION_LEDGER.json` — only active/material delegation state;
- frontier status record, if the canonical project uses one and it materially changed.

Run project-native control/harness doctors if they exist. Preserve a recoverable Git state. Do not create a prose memory diary, do not promote unverified status, and do not rewrite stable project-spec merely to summarize progress.
