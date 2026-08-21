# `.control/` — Durable execution state

This directory stores only compact dynamic truth needed to recover long-horizon work:

- `EXECUTION_STATE.json` — current mission/phase/critical problem/next action;
- `ACCEPTANCE_STATUS.json` — live product acceptance status and evidence;
- `BLOCKERS.json` — genuine blockers only;
- `DECISIONS.jsonl` — consequential decisions/reversal triggers.

Static rules/specifications belong in `AGENTS.md` / `project-spec/`. Do not turn `.control/` into a progress diary. After compact/interruption, reconcile these records with actual workspace/Git/runtime before trusting them.
