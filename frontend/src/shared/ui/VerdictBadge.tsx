import type { ReactNode } from 'react';

import { VERDICT_ICON, VERDICT_TONE, isVerdictValue, type VerdictValue } from '@/entities/verdict.ts';
import { useT, type MessageKey } from '@/shared/i18n/index.tsx';
import { cx } from './cx.ts';

const GLOSS_KEY: Readonly<Record<VerdictValue, MessageKey>> = {
  CONFIRMED: 'verdict.gloss.confirmed',
  REFUTED: 'verdict.gloss.refuted',
  INCONCLUSIVE: 'verdict.gloss.inconclusive',
  DEGRADED_SCOPE: 'verdict.gloss.degraded',
  UNTESTED: 'verdict.gloss.untested',
};

function VerdictIcon({ kind, color }: { readonly kind: 'check' | 'cross' | 'question' | 'half' | 'dash'; readonly color: string }) {
  // Shape channel: a distinct glyph per verdict (dual encoding, WCAG 1.4.1).
  const paths: Readonly<Record<'check' | 'cross' | 'question' | 'half' | 'dash', ReactNode>> = {
    check: <path d="M3.5 7.5 6 10l4.5-5" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    cross: (
      <>
        <path d="m4 4 6 6M10 4l-6 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
    question: (
      <text x="7" y="10.5" textAnchor="middle" fontSize="10" fontWeight="700" fill={color} fontFamily="inherit">
        ?
      </text>
    ),
    half: <path d="M7 2a5 5 0 0 1 0 10" fill={color} />,
    dash: <path d="M3.5 7h7" stroke={color} strokeWidth="1.8" strokeLinecap="round" />,
  };
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      <circle cx="7" cy="7" r="6" fill="none" stroke={color} strokeWidth="1.2" opacity="0.5" />
      {paths[kind]}
    </svg>
  );
}

/**
 * The one verdict renderer. Canonical token (never translated) + localized
 * gloss + shape icon + tone color. An unknown wire value renders verbatim
 * with the UNTESTED tone — never guessed into a known bucket.
 */
export function VerdictBadge({
  verdict,
  className,
  showGloss = true,
}: {
  readonly verdict: string;
  readonly className?: string;
  readonly showGloss?: boolean;
}) {
  const t = useT();
  const known: VerdictValue = isVerdictValue(verdict) ? verdict : 'UNTESTED';
  const color = VERDICT_TONE[known];
  return (
    <span
      className={cx('inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-xs font-semibold', className)}
      style={{ color, borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)` }}
      data-verdict={verdict}
    >
      <VerdictIcon kind={VERDICT_ICON[known]} color={color} />
      <span>{t('verdict.token', { raw: verdict })}</span>
      {showGloss && known === verdict ? (
        <span className="font-sans font-normal">{t(GLOSS_KEY[known])}</span>
      ) : null}
    </span>
  );
}
