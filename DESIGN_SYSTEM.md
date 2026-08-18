# FAR-Lab Design System

## Product character

**Scientific Instrument × Developer Tool × Evidence Workspace**

The interface optimizes for evidence integrity, scanning speed, traceability, and calm operation. Decoration is subordinate to meaning. Scientific state is never communicated by color alone.

## Token architecture

Canonical browser tokens live in `frontend/src/index.css`; Tailwind semantic aliases live in `frontend/tailwind.config.ts`.

### Surfaces

- `background` — application canvas.
- `card` — bounded reading/data surface.
- `popover` — transient elevated surface.
- `border` / `input` — structural lines and input boundaries.
- Dark theme uses deep slate-blue rather than pure black.

### Text

- `foreground` — primary reading text.
- `muted-foreground` — secondary/supporting metadata.
- Monospace family is reserved for IDs, hashes, code, exact values and machine identifiers.
- Page titles use the display family; dense body/data copy uses sans.

### Action and focus

- `primary` / `primary-foreground` — primary action and selected navigation.
- `ring` — visible keyboard focus.
- Controls retain explicit hover, active, disabled and focus-visible states.

### Human-state semantics

New semantic tokens remove component-level dependence on Tailwind palette names:

- `info` — informational state.
- `success` — successful operational state.
- `warning` — warning/degradation state.
- `destructive` — failure/destructive state.
- `evidence` — evidence-domain accent.
- `provenance` — provenance-domain accent.

These colors supplement, never replace, text labels/icons/state names.

### Scientific verdict semantics

Verdict tokens remain separate from generic UI success/failure because scientific truth is not equivalent to UI success:

- `verdict-confirmed`
- `verdict-refuted`
- `verdict-inconclusive`
- `verdict-degraded`
- `verdict-untested`

Each verdict presentation must include a textual verdict label and, where compact, an icon/shape in addition to color.

## Typography

- Page title: `text-2xl` → `text-3xl` responsive, strong hierarchy without marketing-scale display type.
- Section title: typically `text-xl` / `text-2xl`.
- Body: default 1rem.
- Dense metadata / captions: `text-sm` / `text-xs`.
- Identifiers / hashes / timestamps where exact scanning matters: mono with wrapping or truncation + reveal.
- Numeric tables should use tabular numerals where applicable.

## Spacing and density

Use Tailwind's bounded scale; avoid one-off arbitrary spacing unless required for a real geometry constraint. Main content uses smaller phone gutters and scales to desktop gutters. Cards remain dense and restrained.

## Radius / border / elevation

- Radius baseline: 8px, with smaller 2–4px options for dense controls.
- Borders define most data boundaries.
- Shadows are restrained and primarily reserved for transient elevated surfaces.
- No glassmorphism or decorative blur as a product motif; the command-center scrim uses only a minimal 1px backdrop blur to preserve context.

## Motion

CSS variables:

- `--motion-instant: 0ms`
- `--motion-fast: 120ms`
- `--motion-normal: 200ms`
- `--motion-complex: 320ms`
- `--ease-standard`
- `--ease-emphasized`

`prefers-reduced-motion: reduce` collapses animations/transitions globally to near-instant and disables smooth scrolling behavior.

## Navigation

`frontend/src/components/layout/navigation.ts` is the information-architecture SSOT. The primary research loop remains inline: Research → Planning → Versions → Events → Report. Trust/verification capabilities remain reachable under Tools. Cmd/Ctrl+K searches this same registry and can only navigate to real routes.

## Dense tables

- Horizontal overflow is allowed where data cannot responsibly collapse.
- Shared table headers are sticky in scroll containers.
- Cell padding tightens on small screens.
- Terminal tables use display-cell width rather than UTF-16 string length, preventing CJK alignment drift.

## Forms and actions

- Inputs require programmatic labels or accessible names at call sites.
- Validation errors must describe the failure and next action.
- Pending mutation state must not imply completion.
- Scientific/evidence writes are not optimistically presented as persisted before the backend confirms them.
- Unsupported capabilities should be disabled with explanation or omitted, never rendered as inert affordances.

## Accessibility baseline

Target: WCAG 2.2 AA.

System rules:

- Semantic landmarks and heading hierarchy.
- Skip-to-main-content link.
- Visible focus and deterministic focus restoration.
- Keyboard operation for navigation, dialogs/disclosures and command center.
- Escape closes modal/disclosure surfaces.
- Reduced motion support.
- Light and dark token contrast managed centrally.
- Color independence for scientific states.
- Responsive zoom/text reflow without global horizontal page scrolling.
- Complex charts require textual/table alternatives where the underlying component provides them.

## Generated reports

Human-readable exports are part of the design system. HTML reports use semantic main/footer structure, scoped table headers, a table caption, responsive padding, long-ID wrapping and print rules. Export styling does not change deterministic report data.
