---
paths:
  - "tests/**"
  - "test/**"
  - "**/*.{test,spec}.{py,ts,tsx,js,jsx}"
  - "**/fixtures/**"
---
# Test rules

- Test requirements and invariants, not implementation trivia.
- A regression test should reproduce the original defect or violated contract when feasible.
- Include normal, boundary, invalid, adversarial, partial-failure, cancellation, recovery, and compatibility behavior appropriate to risk.
- Do not update snapshots/goldens without explaining and reviewing the semantic change.
- Mark mocks, fixtures, replay, cached, and live tests clearly; never present fixture success as live capability.
- Keep tests deterministic or explicitly measure/report variance.
- Avoid sleeps when a controllable clock/event/condition can be used.
- Preserve production paths: tests may inject adapters, but must not create a separate evaluator or rule implementation.
