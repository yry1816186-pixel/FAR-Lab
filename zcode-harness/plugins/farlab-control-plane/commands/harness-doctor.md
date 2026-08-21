---
description: Validate the FAR-Lab local ZCode Harness files and protocol scripts, then report what still requires real ZCode UI/runtime verification.
---

From the Workspace root run:

```bash
node zcode-harness/scripts/harness-doctor.mjs
node zcode-harness/scripts/test-hooks.mjs
```

Inspect the output. Fix any bundle/schema/script failure rather than ignoring it. Then distinguish offline validation from ZCode runtime proof: confirm the local Marketplace plugin, Skills, Commands, Subagents and Hooks are visible/enabled in the installed ZCode client and test them in a **new session**. Do not claim runtime verification if only the Node scripts passed.
