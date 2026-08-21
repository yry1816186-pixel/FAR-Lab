---
description: Verify the FAR-Lab Acceptance Floor against canonical critical acceptance, evidence, P0/P1 problems and blockers. Passing this gate means acceptance-ready only; it never by itself proves frontier mission completion.
skills: verification-audit
---

Evaluate the canonical acceptance truth from the Workspace root.

If a project-native deterministic gate exists (for example under `zcode-harness/scripts/`), run it and inspect its source/output rather than guessing. Otherwise map every critical obligation explicitly:

`Requirement -> target status -> implementation -> verification method -> concrete evidence -> current status`

Acceptance Floor requires:

- every canonical critical item at its real target state;
- non-empty, inspectable evidence for every promoted critical item;
- required project-native gates satisfied;
- no actionable P0/P1 Critical Problem;
- no unresolved critical blocker masquerading as success.

Return only `ACCEPTANCE_READY` or `NOT_READY` plus the decisive missing items. If `NOT_READY`, continue the highest-value executable repair path instead of declaring completion.

`ACCEPTANCE_READY` is a floor. Mission-level completion still requires independent adversarial audit and the Frontier Gate when the current mission contract requires them.
