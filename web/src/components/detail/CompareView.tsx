import type { ReactNode } from 'react';
import { Download } from 'lucide-react';
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
      <div className="compare-export">
        <button
          type="button"
          className="btn btn--small"
          onClick={() => exportCompareMarkdown(hypotheses, scorecards, claims)}
        >
          <Download size={12} aria-hidden="true" /> {t('compare.exportMd')}
        </button>
      </div>
    </div>
  );
}

/**
 * Take the comparison with you (product-critique #5): a Markdown report of the
 * compared hypotheses — statements, mechanisms, assumptions, predictions,
 * falsification specs with verdict thresholds, evidence balance, dimension
 * scores and the ACH matrix — generated client-side from the same structured
 * data the table renders. Every line is real run data.
 */
function exportCompareMarkdown(
  hypotheses: HypothesisCandidate[],
  scorecards: HypothesisScorecard[],
  claims?: ScientificClaim[],
): void {
  const cardOf = new Map(scorecards.map((s) => [s.hypothesisId, s] as const));
  const claimOf = claims !== undefined ? new Map(claims.map((c) => [c.id, c] as const)) : null;
  const lines: string[] = [];
  lines.push(`# ${hypotheses[0]!.runId} — hypothesis comparison`);
  lines.push('');
  lines.push(`> Generated by FAR-Lab on ${new Date().toISOString()}. Dimension scores are uncalibrated LLM judgments (producer/calibration in the workbench), not objective probabilities.`);
  lines.push('');
  for (const h of hypotheses) {
    const card = cardOf.get(h.id);
    lines.push(`## ${card !== undefined ? `#${card.rank} ` : ''}${h.statement}`);
    lines.push('');
    lines.push(`- id: \`${h.id}\` (v${h.version})`);
    if (h.mechanism.trim().length > 0) lines.push(`- mechanism: ${h.mechanism}`);
    if ((h.assumptions ?? []).length > 0) {
      lines.push('- assumptions:');
      for (const a of h.assumptions!) lines.push(`  - [${a.kind}] ${a.statement}${a.uncertainty !== undefined ? ` — ${a.uncertainty}` : ''}`);
    }
    if ((h.predictions ?? []).length > 0) {
      lines.push('- predictions:');
      for (const p of h.predictions!) lines.push(`  - ${p}`);
    }
    const f = h.falsification;
    if (f !== undefined) {
      lines.push('- falsification:');
      if (f.observable.length > 0) lines.push(`  - observable: ${f.observable}`);
      if (f.decisionRule.length > 0) lines.push(`  - decision rule: ${f.decisionRule}`);
      if (f.supportCondition.length > 0) lines.push(`  - support: ${f.supportCondition}`);
      if (f.weakeningCondition.length > 0) lines.push(`  - weaken: ${f.weakeningCondition}`);
      if (f.falsificationCondition.length > 0) lines.push(`  - falsify: ${f.falsificationCondition}`);
    }
    lines.push(`- evidence: support ${h.supportingClaimIds?.length ?? 0} · counter ${h.counterClaimIds?.length ?? 0} · open uncertainties ${h.uncertainties?.length ?? 0}`);
    if (card !== undefined) {
      const dims = card.dimensions.filter((d) => d.value !== null);
      if (dims.length > 0) lines.push(`- dimensions (uncalibrated): ${dims.map((d) => `${d.dimension} ${d.value!.toFixed(2)}`).join(', ')}`);
    }
    lines.push('');
  }
  // ACH matrix in markdown table form
  const rank: Record<'input' | 'support' | 'counter', number> = { input: 1, support: 2, counter: 2 };
  const mark = { support: '✓', counter: '✗', input: '△' } as const;
  const matrix = new Map<string, Map<string, 'input' | 'support' | 'counter'>>();
  const bind = (cid: string, hypId: string, pol: 'input' | 'support' | 'counter'): void => {
    const row = matrix.get(cid) ?? new Map<string, 'input' | 'support' | 'counter'>();
    const prev = row.get(hypId);
    if (prev === undefined || rank[pol] > rank[prev]) row.set(hypId, pol);
    matrix.set(cid, row);
  };
  for (const h of hypotheses) {
    for (const cid of h.derivation.inputClaimIds ?? []) bind(cid, h.id, 'input');
    for (const cid of h.supportingClaimIds ?? []) bind(cid, h.id, 'support');
    for (const cid of h.counterClaimIds ?? []) bind(cid, h.id, 'counter');
  }
  if (matrix.size > 0) {
    lines.push('## Discriminating evidence matrix (ACH)');
    lines.push('');
    lines.push(`| claim | ${hypotheses.map((_, i) => `H${i + 1}`).join(' | ')} | verdict |`);
    lines.push(`|---|${hypotheses.map(() => ':-:').join('|')}|---|`);
    const ordered = [...matrix.entries()].sort((a, b) => a[1].size - b[1].size);
    for (const [cid, row] of ordered) {
      const text = (claimOf?.get(cid)?.text ?? cid).replace(/\|/g, '\\|').replace(/\n/g, ' ');
      const cells = hypotheses.map((h) => {
        const pol = row.get(h.id);
        return pol !== undefined ? mark[pol] : '·';
      });
      lines.push(`| ${text} | ${cells.join(' | ')} | ${row.size > 1 ? 'shared' : 'discriminating'} |`);
    }
    lines.push('');
    lines.push('Legend: ✓ explicit support binding · ✗ explicit counter binding · △ derivation input claim');
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${hypotheses[0]!.runId}-compare.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * ACH evidence matrix over the REAL hypothesis↔claim bindings, three sources:
 * derivation.inputClaimIds (the claims each hypothesis was DERIVED from —
 * 100% populated by the pipeline), supportingClaimIds and counterClaimIds
 * (explicit critique bindings — sparse today). A claim bound to exactly one
 * compared hypothesis is DISCRIMINATING (where the comparison is decided);
 * 2+ means shared and cannot discriminate. No invented cells.
 */
type AchPolarity = 'input' | 'support' | 'counter';

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

  // claimId -> Map<hypId, strongest polarity> (support/counter outrank input)
  const rank: Record<AchPolarity, number> = { input: 1, support: 2, counter: 2 };
  const matrix = new Map<string, Map<string, AchPolarity>>();
  const bind = (cid: string, hypId: string, pol: AchPolarity): void => {
    const row = matrix.get(cid) ?? new Map<string, AchPolarity>();
    const prev = row.get(hypId);
    if (prev === undefined || rank[pol] > rank[prev]) row.set(hypId, pol);
    matrix.set(cid, row);
  };
  for (const h of hypotheses) {
    for (const cid of h.derivation.inputClaimIds ?? []) bind(cid, h.id, 'input');
    for (const cid of h.supportingClaimIds ?? []) bind(cid, h.id, 'support');
    for (const cid of h.counterClaimIds ?? []) bind(cid, h.id, 'counter');
  }
  if (matrix.size === 0) return null;

  const ordered = [...matrix.entries()].sort((a, b) => a[1].size - b[1].size); // discriminating first
  const glyph = (pol: AchPolarity): { char: string; cls: string; title: string } =>
    pol === 'support'
      ? { char: '✓', cls: 'ev-glyph--verified', title: t('compare.achSupport') }
      : pol === 'counter'
        ? { char: '✗', cls: 'ev-glyph--refuted', title: t('compare.achCounter') }
        : { char: '△', cls: 'ev-glyph--unknown', title: t('compare.achInput') };

  return (
    <div className="ach-evidence">
      <h4 className="minor-title">{t('compare.achTitle')}</h4>
      <div className="table-scroll">
        <table className="data-table compare-table ach-table">
          <caption className="sr-only">{t('compare.achTitle')}</caption>
          <thead>
            <tr>
              <th scope="col" className="compare-label-col">{t('compare.achClaimCol')}</th>
              {hypotheses.map((h, i) => (
                <th key={h.id} scope="col" className="mono small" title={h.statement}>{t('compare.achHypCol', { n: i + 1 })}</th>
              ))}
              <th scope="col" className="mono small">{t('compare.achVerdictCol')}</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map(([cid, row]) => {
              const claim = byId?.get(cid);
              const text = claim !== undefined ? (claim.text.length > 120 ? `${claim.text.slice(0, 120)}…` : claim.text) : cid;
              return (
                <tr key={cid}>
                  <th scope="row" className="compare-ach-claim">
                    {onOpenClaim !== undefined && claim !== undefined ? (
                      <button type="button" className="link-button compare-claim-text" onClick={() => onOpenClaim(cid)} title={t('compare.openClaim')}>
                        {text}
                      </button>
                    ) : (
                      <span className="compare-claim-text" title={cid}>{text}</span>
                    )}
                  </th>
                  {hypotheses.map((h) => {
                    const pol = row.get(h.id);
                    const g = pol !== undefined ? glyph(pol) : null;
                    return (
                      <td key={h.id} className="ach-cell">
                        {g !== null
                          ? <span className={`ev-glyph ${g.cls}`} title={g.title} aria-label={g.title}>{g.char}</span>
                          : <span className="muted">·</span>}
                      </td>
                    );
                  })}
                  <td className={`small ${row.size > 1 ? 'muted' : ''}`}>
                    {row.size > 1 ? t('compare.achShared') : t('compare.achDiscriminating')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small ach-legend">
        <span className="ev-glyph ev-glyph--verified" aria-hidden="true">✓</span> {t('compare.achSupport')}
        <span className="ev-glyph ev-glyph--refuted" aria-hidden="true">✗</span> {t('compare.achCounter')}
        <span className="ev-glyph ev-glyph--unknown" aria-hidden="true">△</span> {t('compare.achInput')} — {t('compare.achNote')}
      </p>
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
