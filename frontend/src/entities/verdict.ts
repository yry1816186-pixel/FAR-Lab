/**
 * entities/verdict — the canonical 5-value machine verdict vocabulary.
 *
 * Authority: src/schema/enums.ts VERDICTS. A verdict is a machine decision
 * over evidence, produced by the deterministic R0-R9 kernel — never an LLM
 * judgment. The UI MUST NOT invent verdict values, and MUST render every
 * verdict with a text label (never color alone).
 */

export const VERDICT_VALUES = [
  'CONFIRMED',
  'REFUTED',
  'INCONCLUSIVE',
  'DEGRADED_SCOPE',
  'UNTESTED',
] as const;

export type VerdictValue = (typeof VERDICT_VALUES)[number];

export function isVerdictValue(value: unknown): value is VerdictValue {
  return typeof value === 'string' && (VERDICT_VALUES as readonly string[]).includes(value);
}

/** Visual tone per verdict (maps onto CSS variables; paired with text+icon). */
export const VERDICT_TONE: Readonly<Record<VerdictValue, string>> = {
  CONFIRMED: 'var(--v-confirmed)',
  REFUTED: 'var(--v-refuted)',
  INCONCLUSIVE: 'var(--v-inconclusive)',
  DEGRADED_SCOPE: 'var(--v-degraded)',
  UNTESTED: 'var(--v-untested)',
};

/**
 * Shape channel per verdict (dual encoding with the text label, WCAG 1.4.1).
 * Rendered as inline SVG by shared/ui/VerdictBadge.
 */
export const VERDICT_ICON: Readonly<Record<VerdictValue, 'check' | 'cross' | 'question' | 'half' | 'dash'>> = {
  CONFIRMED: 'check',
  REFUTED: 'cross',
  INCONCLUSIVE: 'question',
  DEGRADED_SCOPE: 'half',
  UNTESTED: 'dash',
};
