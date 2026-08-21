---
description: Verify one FAR-Lab requirement/slice against the strongest available real evidence, including a meaningful failure path and scientific/domain validation when applicable, then update only truthful acceptance/control state.
argument-hint: "[requirement/scope]"
skills: verification-audit,scientific-method-and-competition
---

Verify: `$ARGUMENTS`

Identify the exact claim, authority and required evidence level. Exercise the strongest relevant real path, a meaningful failure/edge path when practical, project-native checks, and scientific/domain validation proportional to the claim.

Do not infer production correctness from compile/tests alone; do not infer scientific correctness from software execution alone. Mocks/fixtures/replays prove only their simulated surface.

Update `.control/ACCEPTANCE_STATUS.json` or the current canonical verification record only to the strongest level actually proven, with concrete evidence locations/commands/results. If unproven, keep the lower/blocked/failed state and feed the repair into the Critical Problem Set.
