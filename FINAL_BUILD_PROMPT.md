# FINAL_BUILD_PROMPT — Formal Construction Controller

This file anchors what "formal construction" means in this workspace. The supreme directive
is `FAR-LAB_DEVELOPMENT_MISSION.md`; canonical contracts live in `project-spec/`; live state
lives in `.control/`. When this file and `.control/EXECUTION_STATE.json` disagree on phase,
the `.control` file wins (it is updated as work progresses; this file is the standing order).

## Standing orders during construction

1. Truth over appearance: every claimed capability carries command-level evidence; truthful
   states are `UNKNOWN / UNVERIFIED / BLOCKED / FAILED` when that is the reality.
2. Vertical slices end-to-end over horizontal module farming; a stage is done only when it
   runs on the real path (real question, live retrieval, live model route, persisted state).
3. Acceptance floor: `project-spec/ACCEPTANCE.md` ACC-01..ACC-20 all at target level with
   evidence; `node zcode-harness/scripts/completion-gate.mjs` exit 0 is necessary, not sufficient.
4. After the floor: Independent adversarial audit + Frontier Opportunity Sweep before any
   completion claim (mission §90-§91).
5. `.control/` is runtime memory: update EXECUTION_STATE / DECISIONS / BLOCKERS at meaningful
   checkpoints; keep the critical problem set at 3-7 ranked items.
6. Security red lines: no secrets in repo/logs/prompts; no destructive git operations; no
   weakened tests or guardrails.
7. Model route truth: DeepSeek is the verified live route today; Qwen live path is BLOCKED
   (see `.control/BLOCKERS.json` B-QWEN-LIVE-ROUTE) — never fabricate live evidence.

## Completion output

When the mission completes, the workspace root must contain `final_delivery.md` summarizing
task_plan.md execution, all acceptance results with evidence links, audit report links and
the residual risk list.
