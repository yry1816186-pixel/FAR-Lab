---
description: Persist a compact truthful FAR-Lab checkpoint before interruption, compact, or a major phase transition.
---

Reconcile real workspace/Git/runtime first. Update only materially changed:

- `.control/EXECUTION_STATE.json` — current objective, critical problems, exact nextAction;
- `.control/ACCEPTANCE_STATUS.json` — only evidence-backed status changes;
- `.control/BLOCKERS.json` — genuine blockers;
- `.control/DECISIONS.jsonl` — consequential decisions/reversal triggers.

Then run:

```bash
node zcode-harness/scripts/control-doctor.mjs
```

Do not create a narrative progress diary.
