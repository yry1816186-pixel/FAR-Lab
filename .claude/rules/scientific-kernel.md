---
paths:
  - "**/*claim*"
  - "**/*fec*"
  - "**/*evidence*"
  - "**/*verdict*"
  - "**/*proof*"
  - "**/*provenance*"
  - "**/*canonical*"
  - "**/domain/**"
  - "**/contracts/**"
---
# Scientific trust-kernel rules

- State the epistemic property being enforced: integrity, provenance, reproducibility, rule conformance, statistical support, or scientific judgment are not interchangeable.
- All protected transitions require versioned deterministic rules and a single application/domain entrypoint.
- LLM output is evidence/proposal input, never an implicit final verdict.
- Specify identity, version, ownership, state machine, invariants, error model, migration, audit, and deletion/retention behavior.
- Canonicalization must define number, Unicode, ordering, locale, time zone, unit, missing value, and randomness behavior.
- Add tamper localization, replay, unknown-version, old-artifact, counterevidence, scope degradation, correction/retraction/supersession, and cross-implementation tests where relevant.
- Document what the artifact or mechanism cannot prove.
