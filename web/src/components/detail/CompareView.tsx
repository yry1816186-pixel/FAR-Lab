import type { ReactNode } from 'react';
import type { Assumption, HypothesisCandidate, HypothesisScorecard, ScoreDimension, ScientificClaim } from '../../api/types';
import { useI18n } from '../../i18n/LanguageContext';
import { Badge } from '../common';
import { noveltyKey, noveltyTone, testabilityKey, testabilityTone } from '../../tones';

/**
 * Side-by-side competing-hypothesis comparison (CPP-3). This is the product's
 * verified-differentiator surface: no mainstream science tool lets a researcher
 * align competing hypotheses by mechanism / assumptions / predictions /
 * falsification / evidence balance. All cells come from structured run data —
 * no invented aggregations (the composite number lives only in the uncalibrated
 * overallRationale text, so we show dimensions, which ARE structured).
 * Score dimension rows carry an inline "uncalibrated" marker: hover-only
 * calibration hints are lost on touch and in print (scientific-critique F5).
 *
 * ACH evidence analysis (S3): claim rows marked SHARED (bound to 2+ compared
 * hypotheses — cannot discriminate between them) vs DISCRIMINATING (bound to
 * exactly one). Rendered ONLY from real hypothesis claim bindings; when the
 * pipeline produced no bindings, the honest empty state says so — never a
 * fabricated matrix (the binding sparsity itself is pipeline feedback).
 */
export function CompareView({
  hypotheses,
  scorecards,
  claims,
  onRemove,
  onChallenge,
  onOpenClaim,
}: {
  hypotheses: HypothesisCandidate[];
  scorecards: HypothesisScorecard[];
  claims?: ScientificClaim[];
  onRemove: (id: string) => void;
  onChallenge: (id: string, label: string) => void;
  onOpenClaim?: (claimId: string) => void;
}): JSX.Element | null {
  const { t } = useI18n();
  if (hypotheses.length < 2) return null;
  const cardOf = new Map(scorecards.map((s) => [s.hypothesisId, s] as const));

  const dimensionUnion: ScoreDimension[] = [];
  for (const h of hypotheses) {
    for (const d of cardOf.get(h.id)?.dimensions ?? []) {
      if (!dimensionUnion.includes(d.dimension)) dimensionUnion.push(d.dimension);
    }
  }

  return (
    <div className="compare" role="region" aria-label={t('compare.title')}>
      <div className="table-scroll">
        <table className="data-table compare-table">
          <caption className="sr-only">{t('compare.title')}</caption>
          <thead>
            <tr>
              <th scope="col" className="compare-label-col">{t('compare.field')}</th>
              {hypotheses.map((h) => {
                const card = cardOf.get(h.id);
                return (
                  <th key={h.id} scope="col" className="compare-hyp-col">
                    <span className="compare-col-head">
                      {card !== undefined && (
                        <span className={`rank-medal${card.rank === 1 ? ' rank-medal--first' : ''}`} title={t('hyp.rankOf', { rank: card.rank })}>
                          №{card.rank}
                        </span>
                      )}
                      <span className="compare-col-statement" title={h.statement}>{h.statement}</span>
                      <span className="compare-col-actions">
                        <button type="button" className="link-button" onClick={() => onChallenge(h.id, h.statement)}>
                          {t('compare.challenge')}
                        </button>
                        <button type="button" className="link-button" onClick={() => onRemove(h.id)}>
                          {t('compare.remove')}
                        </button>
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <CompareRow label={t('hyp.mechanism')} cols={hypotheses.map((h) => h.mechanism)} />
            <CompareListRow
              label={t('compare.assumptions')}
              cols={hypotheses.map((h) => (h.assumptions ?? []).map((a) => `${t(assumptionKindKey(a.kind))} ${a.statement}${a.uncertainty !== undefined ? ` — ${a.uncertainty}` : ''}`))}
            />
            <CompareListRow label={t('hyp.predictions')} cols={hypotheses.map((h) => h.predictions ?? [])} />
            <CompareRow
              label={t('compare.falsificationObservable')}
              cols={hypotheses.map((h) => h.falsification?.observable ?? t('hyp.falsification.missing'))}
              missingWhen={t('hyp.falsification.missing')}
            />
            <CompareRow
              label={t('hyp.falsification.decisionRule')}
              cols={hypotheses.map((h) => h.falsification?.decisionRule ?? '')}
              missingWhen={t('hyp.falsification.missing')}
            />
            <CompareRow
              label={t('compare.verdictThresholds')}
              cols={hypotheses.map((h) => {
                const f = h.falsification;
                if (f === undefined) return '';
                const parts: string[] = [];
                if (f.supportCondition.trim().length > 0) parts.push(`${t('compare.verdictSupport')} ${f.supportCondition}`);
                if (f.weakeningCondition.trim().length > 0) parts.push(`${t('compare.verdictWeaken')} ${f.weakeningCondition}`);
                if (f.falsificationCondition.trim().length > 0) parts.push(`${t('compare.verdictFalsify')} ${f.falsificationCondition}`);
                return parts.join(' ｜ ');
              })}
              missingWhen={t('hyp.falsification.missing')}
            />
            <CompareCountRow
              label={t('compare.evidenceBalance')}
              cols={hypotheses.map((h) => ({
                support: h.supportingClaimIds?.length ?? 0,
                counter: h.counterClaimIds?.length ?? 0,
                openUncertainties: h.uncertainties?.length ?? 0,
              }))}
            />
            <CompareRow
              label={t('compare.testability')}
              cols={hypotheses.map((h) => t(testabilityKey(h.testability)))}
              render={(v, i) => <Badge tone={testabilityTone(hypotheses[i]!.testability)}>{v}</Badge>}
            />
            <CompareRow
              label={t('compare.novelty')}
              cols={hypotheses.map((h) => t(noveltyKey(h.noveltyLabel)))}
              render={(v, i) => <Badge tone={noveltyTone(hypotheses[i]!.noveltyLabel)}>{v}</Badge>}
            />
            {dimensionUnion.map((dim) => (
              <tr key={dim}>
                <th scope="row" className="mono small compare-label-col">
                  {dim} <span className="muted">· {t('compare.dimUncalibratedShort')}</span>
                </th>
                {hypotheses.map((h) => {
                  const d = cardOf.get(h.id)?.dimensions.find((x) => x.dimension === dim);
                  return (
                    <td key={h.id}>
                      {d === undefined || d.value === null ? (
                        <span className="muted">—</span>
                      ) : (
                        <span className="rank-cell" title={`${d.value.toFixed(2)} / 1.00 — ${t('compare.dimUncalibrated')}`}>
                          <span className="rank-bar" aria-hidden="true">
                            <span className="rank-fill" style={{ width: `${Math.round(d.value * 100)}%` }} />
                          </span>
                          <span className="mono">{d.value.toFixed(2)}</span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">{t('compare.disclaimer')}</p>
      <AchEvidence hypotheses={hypotheses} claims={claims} onOpenClaim={onOpenClaim} />
    </div>
  );
}

/**
 * ACH-style evidence discrimination over the REAL hypothesis↔claim bindings.
 * Shared claims (2+ hypotheses) cannot discriminate; unique bindings are where
 * the comparison is actually decided. Bindings are sparse today — the empty
 * state states that plainly instead of rendering an invented matrix.
 */
function AchEvidence({
  hypotheses,
  claims,
  onOpenClaim,
}: {
  hypotheses: HypothesisCandidate[];
  claims?: ScientificClaim[];
  onOpenClaim?: (claimId: string) => void;
}): JSX.Element | null {
  const { t } = useI18n();
  const byId = claims !== undefined ? new Map(claims.map((c) => [c.id, c] as const)) : null;

  // claimId -> { polarity per hypothesis }
  const matrix = new Map<string, { hypId: string; polarity: 'support' | 'counter' }[]>();
  for (const h of hypotheses) {
    for (const cid of h.supportingClaimIds ?? []) {
      const row = matrix.get(cid) ?? [];
      row.push({ hypId: h.id, polarity: 'support' });
      matrix.set(cid, row);
    }
    for (const cid of h.counterClaimIds ?? []) {
      const row = matrix.get(cid) ?? [];
      row.push({ hypId: h.id, polarity: 'counter' });
      matrix.set(cid, row);
    }
  }
  if (matrix.size === 0) return null; // no bindings at all: count row already says 0
  const shared = [...matrix.entries()].filter(([, rows]) => rows.length > 1);
  const discriminating = [...matrix.entries()].filter(([, rows]) => rows.length === 1);

  const renderRow = (claimId: string, rows: { hypId: string; polarity: 'support' | 'counter' }[]): JSX.Element => {
    const claim = byId?.get(claimId);
    const text = claim !== undefined ? (claim.text.length > 130 ? `${claim.text.slice(0, 130)}…` : claim.text) : claimId;
    return (
      <tr key={claimId}>
        <th scope="row" className="compare-label-col">
          <span className={rows.length > 1 ? 'muted' : undefined} title={claimId}>
            {rows.length > 1 ? t('compare.achShared') : t('compare.achDiscriminating')}
          </span>
        </th>
        <td colSpan={hypotheses.length}>
          <span className="compare-claim-row">
            <span className={`ev-glyph ev-glyph--${rows[0]!.polarity === 'support' ? 'verified' : 'refuted'}`} aria-hidden="true">
              {rows[0]!.polarity === 'support' ? '✓' : '✗'}
            </span>
            {onOpenClaim !== undefined && claim !== undefined ? (
              <button type="button" className="link-button compare-claim-text" onClick={() => onOpenClaim(claimId)} title={t('compare.openClaim')}>
                {text}
              </button>
            ) : (
              <span className="compare-claim-text">{text}</span>
            )}
            {rows.length > 1 && <span className="muted small"> — {t('compare.achSharedNote', { n: rows.length })}</span>}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <div className="ach-evidence">
      <h4 className="minor-title">{t('compare.achTitle')}</h4>
      <table className="data-table compare-table">
        <caption className="sr-only">{t('compare.achTitle')}</caption>
        <tbody>
          {discriminating.map(([cid, rows]) => renderRow(cid, rows))}
          {shared.map(([cid, rows]) => renderRow(cid, rows))}
        </tbody>
      </table>
      <p className="muted small">{t('compare.achNote')}</p>
    </div>
  );
}

/** Assumption kinds are domain enums; users get localized labels, not raw enum text (critique P1-6). */
function assumptionKindKey(kind: Assumption['kind']): Parameters<ReturnType<typeof useI18n>['t']>[0] {
  return `compare.assumption.${kind}`;
}

function CompareRow({
  label,
  cols,
  missingWhen,
  render,
}: {
  label: string;
  cols: string[];
  missingWhen?: string;
  render?: (value: string, index: number) => ReactNode;
}): JSX.Element {
  return (
    <tr>
      <th scope="row" className="compare-label-col">{label}</th>
      {cols.map((c, i) => (
        <td key={i} className={missingWhen !== undefined && c === missingWhen ? 'compare-cell--missing' : undefined}>
          {render !== undefined ? render(c, i) : (c.trim().length > 0 ? c : <span className="muted">—</span>)}
        </td>
      ))}
    </tr>
  );
}

function CompareListRow({ label, cols }: { label: string; cols: string[][] }): JSX.Element {
  return (
    <tr>
      <th scope="row" className="compare-label-col">{label}</th>
      {cols.map((items, i) => (
        <td key={i}>
          {items.length === 0 ? (
            <span className="muted">—</span>
          ) : (
            <ul className="compare-list">
              {items.map((item, j) => <li key={j}>{item}</li>)}
            </ul>
          )}
        </td>
      ))}
    </tr>
  );
}

/**
 * Evidence balance. support/counter count bound claims (supporting/counter
 * ClaimIds); the third number is the hypothesis's own OPEN UNCERTAINTY items,
 * not "unknown evidence" — the label says what it actually is (scientific-critique F1).
 */
function CompareCountRow({
  label,
  cols,
}: {
  label: string;
  cols: { support: number; counter: number; openUncertainties: number }[];
}): JSX.Element {
  const { t } = useI18n();
  return (
    <tr>
      <th scope="row" className="compare-label-col">{label}</th>
      {cols.map((c, i) => (
        <td key={i}>
          <span className="compare-counts">
            <span className="compare-count compare-count--support">{t('compare.supportN', { n: c.support })}</span>
            <span className="compare-count compare-count--counter">{t('compare.counterN', { n: c.counter })}</span>
            <span className="compare-count compare-count--unknown">{t('compare.openUncertaintiesN', { n: c.openUncertainties })}</span>
          </span>
        </td>
      ))}
    </tr>
  );
}
