import { useI18n } from '../../i18n/LanguageContext';
import type { EvidenceBody } from '../../api/types';

/**
 * Evidence balance (HX4 signature element). Two real data sources, never faked:
 *
 * 1. Base (always available): per-hypothesis relation counts — supporting vs
 *    counter relations from the run's evidence graph. Widths are proportional
 *    ink: each side's share of that hypothesis's OWN bound relations.
 * 2. Enhancement (Wave-S g8 body, when present): the signed log-likelihood
 *    ratio interval [low, high]. The interval straddling zero means the
 *    DIRECTION itself is undecided — shown, never hidden.
 *
 * Zero bound relations renders an honest empty state, not a decorative bar.
 */
export function EvidenceBalance({
  supports,
  counters,
  body,
  featured = false,
}: {
  supports: number;
  counters: number;
  body?: EvidenceBody;
  featured?: boolean;
}): JSX.Element | null {
  const { t } = useI18n();
  const total = supports + counters;
  if (body === undefined && total === 0) return null;

  const straddles = body !== undefined && body.sumLogLrLow < 0 && body.sumLogLrHigh > 0;
  const dominant = body !== undefined
    ? (body.sumLogLrLow + body.sumLogLrHigh > 0 ? 'support' : 'counter')
    : supports >= counters ? 'support' : 'counter';

  let supportW = 0;
  let counterW = 0;
  if (body !== undefined) {
    const span = Math.max(Math.abs(body.sumLogLrHigh), Math.abs(body.sumLogLrLow), 0.001);
    supportW = Math.min(Math.max(body.sumLogLrHigh, 0) / span, 1) * 50;
    counterW = Math.min(Math.max(-body.sumLogLrLow, 0) / span, 1) * 50;
  } else if (total > 0) {
    supportW = (supports / total) * 50;
    counterW = (counters / total) * 50;
  }

  return (
    <div
      className={`ev-balance${featured ? ' ev-balance--featured' : ''}`}
      role="img"
      aria-label={
        body !== undefined
          ? t('evb.aria', {
              hi: body.sumLogLrHigh.toFixed(2),
              lo: body.sumLogLrLow.toFixed(2),
              n: body.independentSources,
              std: t(`evb.standard.${body.proofStandard}`),
            })
          : t('evb.ariaCounts', { s: supports, c: counters })
      }
    >
      <span className="ev-balance-scale" aria-hidden="true">
        <span className="ev-balance-mid" />
        {counterW > 0.5 && (
          <span className="ev-balance-fill ev-balance-fill--counter" style={{ width: `${counterW}%` }} />
        )}
        {supportW > 0.5 && (
          <span className="ev-balance-fill ev-balance-fill--support" style={{ left: '50%', width: `${supportW}%` }} />
        )}
      </span>
      <span className="ev-balance-meta">
        <span className={`ev-balance-dir ev-balance-dir--${straddles ? 'uncertain' : dominant}`}>
          {straddles
            ? t('evb.uncertain')
            : dominant === 'support' ? t('evb.supports') : t('evb.counters')}
        </span>
        {body !== undefined ? (
          <span className="mono muted small">
            {body.sumLogLrLow.toFixed(2)} … {body.sumLogLrHigh.toFixed(2)} logLR
          </span>
        ) : (
          <span className="mono muted small">
            {t('evb.countsText', { s: supports, c: counters })}
          </span>
        )}
        {body !== undefined && <span className="muted small">· {t('evbody.sources', { n: body.independentSources })}</span>}
        {body !== undefined && <span className="muted small">· {t(`evb.standard.${body.proofStandard}`)}</span>}
        {body !== undefined && <span className="muted small" title={t('evb.bandTitle')}>· {t(`evb.band.${body.logLrBand}`)}</span>}
        {body !== undefined && <span className="muted small" title={t('evb.qbafTitle')}>· {t('evb.qbaf', { score: body.qbafScore.toFixed(2) })}</span>}
      </span>
    </div>
  );
}
