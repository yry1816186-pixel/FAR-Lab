---
description: Run the deterministic guardrail checks — secret scan, path hygiene (env/fixture/demo-marker/state files), and harness structure doctor — and fix every error before proceeding.
---

From the Workspace root run:

```bash
node zcode-harness/scripts/secret-scan.mjs
node zcode-harness/scripts/path-hygiene.mjs
node zcode-harness/scripts/harness-doctor.mjs
```

Act on the output:

- `secret-scan` FAILED: HIGH findings (private keys, `.env`, known credential formats) must be removed/rotated before any further work; report honestly.
- `path-hygiene` FAILED: fix errors (required state files, invalid status vocabulary, `.env` present, fixtures/demo/mock markers inside production roots) — do not proceed with a dirty path.
- `harness-doctor` FAILED: repair the bundle structure before continuing.

Use `/completion-gate` separately before any completion claim. These scripts are the deterministic layer; semantic quality still belongs to the reviewers (`adversarial-auditor`, `architecture-critic`, `scientific-reviewer`).
