# Handoff 01 → 02: `health-strip--checking` tone has no style

- **From:** lane 01 (hx-web-product) — **To:** lane 02 (visual-design)
- **Date:** 2026-08-24 · **Urgency:** P2 (visual consistency) · **Status:** requested

`web/src/styles.css` (yours) defines `.health-strip--ok/--warn/--err`
(~line 315). Lane 01 added a `checking` tone (in-flight health probe renders
`工作台状态：检查中…` via `health-strip--checking` in `WelcomeView.tsx`,
`healthProjection` in `hooks/useHealth.ts`); it currently renders as
unstyled text. Please add the token-consistent rule (suggest: same neutral
treatment as `--warn` without the warning hue, e.g. muted dot + no bg, or
your call per the design system).
