---
paths:
  - "apps/web/**"
  - "web/**"
  - "frontend/**"
  - "ui/**"
  - "**/*.{tsx,jsx,css,scss,html}"
---
# Frontend and UX rules

- Organize around complete user tasks, not page count.
- Visually distinguish observed facts, inference, model suggestions, deterministic verdicts, and unknown/blocked states.
- Never recalculate protected scientific rules in the UI; display results and explanations from the application/domain service.
- Design loading, partial success, timeout, cancellation, retry, resume, offline/cached/live/fixture state, and recovery before polishing the happy path.
- High-risk actions require impact preview and explicit confirmation; reversible actions should expose undo/rollback.
- Meet keyboard, focus, semantic labeling, non-color status, zoom/responsive, and text-equivalent requirements appropriate to WCAG AA targets.
- Localize dates, time zones, numbers, units, sorting, and text without changing canonical stored values.
- Test task completion and error recovery with production-like data and APIs.
