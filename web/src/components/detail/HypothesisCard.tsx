import { useState } from 'react';
import type { EvidenceBody, HypothesisCandidate } from '../../api/types';
import { useI18n } from '../../i18n/LanguageContext';
import { Badge, IdText } from '../common';
import { checkTone, litNoveltyKey, litNoveltyTone, noveltyKey, noveltyTone, testabilityKey, testabilityTone } from '../../tones';
import { WithMath } from '../../utils/math';
import { EvidenceBalance } from './EvidenceBalance';

/**
 * B5 lifecycle operations, wired by the owning tab (HypothesesTab owns the
 * POST calls + refetch + busy/error state — the card stays presentational).
 * `busy` disables the whole row while any op for THIS card is in flight
 * (clean degrade when the endpoint is missing: buttons disable, never fake success).
 */
export interface HypothesisCardOps {
  busy: boolean;
  /** The run's claims, for the inline connect picker; absent/empty -> honest hint. */
  claims?: { id: string; text: string }[];
  /** Whether this card's connect picker is open (state lives in the tab). */
  connectOpen: boolean;
  onConnectToggle: () => void;
  onPromote: () => void;
  onReject: () => void;
  onFork: () => void;
  onConnect: (claimId: string, direction: 'supports' | 'counters') => void;
  /** BP-2 direct edit: whether this card's edit form is open (state lives in the tab). */
  editOpen: boolean;
  onEditToggle: () => void;
  /** Submit the correction; the tab owns the POST + refetch + error surface. */
  onEditSubmit: (fields: { statement: string; mechanism: string; note: string }) => void;
}

export function HypothesisCard({
  hypothesis,
  clusterSize,
  isRepresentative,
  rank,
  featured = false,
  onChallenge,
  compare,
  aiActions,
  ops,
  evidenceBody,
  balance,
}: {
  hypothesis: HypothesisCandidate;
  clusterSize: number;
  isRepresentative: boolean;
  rank?: number;
  /** HX4: rank-1 card renders large — the study's leading hypothesis leads the page. */
  featured?: boolean;
  onChallenge?: (id: string, label: string) => void;
  compare?: { selected: boolean; onToggle: () => void; disabled?: boolean };
  /** B4: grounded AI research actions (challenge/weakest-assumption/falsify/…). */
  aiActions?: React.ReactNode;
  /** B5: researcher lifecycle operations (promote/reject/fork/connect). */
  ops?: HypothesisCardOps;
  /** Wave-S g8: deterministic evidence-body rating (floor/sources/band/promotion); tooltip = full disclosure. */
  evidenceBody?: EvidenceBody;
  /** HX4: per-hypothesis bound-relation counts (supporting vs counter) from the evidence graph. */
  balance?: { supports: number; counters: number };
}): JSX.Element {
  const { t } = useI18n();
  const [specOpen, setSpecOpen] = useState(false);
  const [connectClaimId, setConnectClaimId] = useState('');
  const [connectDirection, setConnectDirection] = useState<'supports' | 'counters'>('supports');
  const [editStatement, setEditStatement] = useState(hypothesis.statement);
  const [editMechanism, setEditMechanism] = useState(hypothesis.mechanism);
  const [editNote, setEditNote] = useState('');
  const f = hypothesis.falsification;
  const completeness = f?.completenessCheck;
  const status = hypothesis.status ?? 'active';
  const claims = ops?.claims;

  return (
    <article
      id={`hyp-${hypothesis.id}`}
      className={`hyp-card${isRepresentative ? '' : ' hyp-card--extra'}${compare?.selected ? ' hyp-card--compare' : ''}${featured ? ' hyp-card--featured' : ''}`}
    >
      <header className="hyp-head">
        <div className="hyp-head-main">
          {rank !== undefined && (
            <span className={`rank-medal${rank === 1 ? ' rank-medal--first' : ''}`} title={t('hyp.rankOf', { rank })}>
              №{rank}
            </span>
          )}
          {/* B5 triage outcome — visible only once decided; 'active' is the unmarked default */}
          {status === 'promoted' && <Badge tone="ok">{t('hyp.statusPromoted')}</Badge>}
          {status === 'rejected' && <Badge tone="err">{t('hyp.statusRejected')}</Badge>}
          <Badge tone={testabilityTone(hypothesis.testability)}>{t(testabilityKey(hypothesis.testability))}</Badge>
          <span className="hyp-actions">
            {compare !== undefined && (
              <button
                type="button"
                className={`btn btn--small${compare.selected ? ' btn--primary' : ''}`}
                aria-pressed={compare.selected}
                disabled={compare.disabled && !compare.selected}
                onClick={compare.onToggle}
                title={compare.disabled && !compare.selected ? t('compare.limitReached') : undefined}
              >
                {compare.selected ? t('compare.selected') : t('compare.add')}
              </button>
            )}
            {onChallenge !== undefined && (
              <button
                type="button"
                className="btn btn--small"
                onClick={() => onChallenge(hypothesis.id, hypothesis.statement)}
                title={t('compare.challengeHint')}
              >
                {t('compare.challenge')}
              </button>
            )}
            {aiActions}
            {ops !== undefined && (
              /* B5 ops row: promote/reject only while active (a decided hypothesis
                 is fork-able but not re-decidable without a revision); fork always. */
              <span className="hyp-ops">
                {status === 'active' && (
                  <>
                    <button type="button" className="btn btn--small" disabled={ops.busy} onClick={ops.onPromote}>
                      {t('hyp.promote')}
                    </button>
                    <button type="button" className="btn btn--small" disabled={ops.busy} onClick={ops.onReject}>
                      {t('hyp.reject')}
                    </button>
                  </>
                )}
                <button type="button" className="btn btn--small" disabled={ops.busy} onClick={ops.onFork}>
                  {t('hyp.fork')}
                </button>
                <button
                  type="button"
                  className="btn btn--small"
                  disabled={ops.busy}
                  aria-expanded={ops.connectOpen}
                  onClick={ops.onConnectToggle}
                >
                  {t('hyp.connect')}
                </button>
                <button
                  type="button"
                  className="btn btn--small"
                  disabled={ops.busy}
                  aria-expanded={ops.editOpen}
                  onClick={ops.onEditToggle}
                  title={t('hyp.editHint')}
                >
                  {t('hyp.edit')}
                </button>
              </span>
            )}
          </span>
        </div>
        {/* Quiet metadata row (HX4 de-badging): identity + qualifiers stay
            reachable but stop competing with the statement for attention. */}
        <div className="hyp-head-meta muted small">
          <IdText value={hypothesis.id} />
          <span>{t('hyp.version', { n: hypothesis.version })}</span>
          {clusterSize > 1 && <span>{t('hyp.clusterOf', { n: clusterSize })}</span>}
          <Badge tone={noveltyTone(hypothesis.noveltyLabel)}>{t(noveltyKey(hypothesis.noveltyLabel))}</Badge>
          {/* W5/S4: noveltyLabel is corpus-relative — the qualifier is mandatory wherever the label is shown */}
          <span className="novelty-qualifier">{t('novelty.qualifier')}</span>
          {/* Wave-S g8 evidence body — deterministic rating; the disclosure tooltip carries
              the full derivation (capped sources, excluded relations, band, proof standard). */}
          {evidenceBody !== undefined && (
            <>
              <Badge
                tone={evidenceBody.promotion === 'orthogonal' ? 'ok' : evidenceBody.promotion === 'none' ? 'muted' : 'warn'}
                title={evidenceBody.disclosure}
              >
                {t(`evbody.promotion.${evidenceBody.promotion}`)}
              </Badge>
              {evidenceBody.floorCertainty !== undefined && (
                <Badge tone="muted" title={evidenceBody.disclosure}>
                  {t('evbody.floor', { level: evidenceBody.floorCertainty })}
                </Badge>
              )}
              {evidenceBody.experimentalAxes > 0 && (
                <Badge tone="muted" title={evidenceBody.disclosure}>
                  {t('hyp.expAxes', { n: evidenceBody.experimentalAxes })}
                </Badge>
              )}
            </>
          )}
          {completeness !== undefined ? (
            completeness.passed ? (
              <Badge tone="ok">{t('completeness.passed')}</Badge>
            ) : (
              <Badge tone="err" title={(completeness.missing ?? []).join('；')}>
                {t('completeness.failed')}
                {(completeness.missing ?? []).length > 0 && ` (${completeness.missing!.length})`}
              </Badge>
            )
          ) : (
            <Badge tone="muted">{t('completeness.unchecked')}</Badge>
          )}
        </div>
      </header>

      {ops?.connectOpen === true && (
        <div className="hyp-connect" role="group" aria-label={t('hyp.connectPrompt')}>
          {(claims?.length ?? 0) === 0 ? (
            <span className="muted small">{t('hyp.connectNoClaims')}</span>
          ) : (
            <>
              <label className="small">
                <span className="muted small">{t('hyp.connectClaimLabel')}</span>{' '}
                <select
                  value={connectClaimId}
                  onChange={(e) => setConnectClaimId(e.target.value)}
                >
                  <option value="">—</option>
                  {claims!.map((c) => (
                    <option key={c.id} value={c.id}>{c.text}</option>
                  ))}
                </select>
              </label>
              <label className="small">
                <span className="muted small">{t('hyp.connectDirectionLabel')}</span>{' '}
                <select
                  value={connectDirection}
                  onChange={(e) => setConnectDirection(e.target.value === 'counters' ? 'counters' : 'supports')}
                >
                  <option value="supports">{t('hyp.connectSupports')}</option>
                  <option value="counters">{t('hyp.connectCounters')}</option>
                </select>
              </label>
              <button
                type="button"
                className="btn btn--small hyp-connect-confirm"
                disabled={ops.busy || connectClaimId.length === 0}
                onClick={() => ops.onConnect(connectClaimId, connectDirection)}
              >
                {t('hyp.connectConfirm')}
              </button>
            </>
          )}
        </div>
      )}

      {ops?.editOpen === true && (
        <div className="hyp-connect" role="group" aria-label={t('hyp.edit')}>
          <p className="muted small">{t('hyp.editHint')}</p>
          <label className="edit-field">
            <span className="muted small">{t('hyp.editStatement')}</span>
            <textarea
              rows={3}
              value={editStatement}
              onChange={(e) => setEditStatement(e.target.value)}
              disabled={ops.busy}
            />
          </label>
          <label className="edit-field">
            <span className="muted small">{t('hyp.editMechanism')}</span>
            <textarea
              rows={4}
              value={editMechanism}
              onChange={(e) => setEditMechanism(e.target.value)}
              disabled={ops.busy}
            />
          </label>
          <label className="edit-field">
            <span className="muted small">{t('hyp.editNote')}</span>
            <input
              type="text"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              disabled={ops.busy}
            />
          </label>
          <span className="hyp-connect-confirm">
            <button
              type="button"
              className="btn btn--small btn--primary"
              disabled={ops.busy || editNote.trim().length < 3 || editStatement.trim().length < 20}
              onClick={() => ops.onEditSubmit({ statement: editStatement, mechanism: editMechanism, note: editNote.trim() })}
            >
              {t('hyp.editSubmit')}
            </button>
            <button type="button" className="btn btn--small" disabled={ops.busy} onClick={ops.onEditToggle}>
              {t('hyp.editCancel')}
            </button>
          </span>
        </div>
      )}

      {completeness !== undefined && !completeness.passed && (completeness.missing ?? []).length > 0 && (
        <p className="callout callout--err small">
          {t('completeness.missing', { items: completeness.missing!.join('；') })}
        </p>
      )}

      <dl className="fieldlist">
        <div className="fieldlist-row">
          <dt>{t('hyp.statement')}</dt>
          <dd className={`hyp-statement${featured ? ' hyp-statement--featured' : ''}`}><WithMath text={hypothesis.statement} /></dd>
        </div>
        {hypothesis.mechanism.trim().length > 0 && (
          <div className="fieldlist-row">
            <dt>{t('hyp.mechanism')}</dt>
            <dd><WithMath text={hypothesis.mechanism} /></dd>
          </div>
        )}
      </dl>

      {/* HX4 signature element: signed evidence scale — QBAF logLR interval
          when the evidence body exists, honest relation counts otherwise.
          Zero evidence is an EXPLICIT state (R2-01): absence must not read
          as "unknown/hidden" — the top-ranked hypothesis with no bindings
          says so, so the reader knows the gap is real, not a UI omission. */}
      {(balance !== undefined || evidenceBody !== undefined) ? (
        <EvidenceBalance
          supports={balance?.supports ?? 0}
          counters={balance?.counters ?? 0}
          body={evidenceBody}
          featured={featured}
        />
      ) : (
        <p className="muted small hyp-no-evidence">{t('hyp.noEvidence')}</p>
      )}

      {hypothesis.assumptions !== undefined && hypothesis.assumptions.length > 0 && (
        <div className="hyp-block">
          <h4 className="minor-title">{t('hyp.assumptions')}</h4>
          <ul className="assumptions">
            {hypothesis.assumptions.map((a) => (
              <li key={a.id}>
                <span className="mono assumption-kind">[{a.kind}]</span> {a.statement}
                {a.uncertainty !== undefined && <span className="muted small"> — {a.uncertainty}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hypothesis.predictions !== undefined && hypothesis.predictions.length > 0 && (
        <div className="hyp-block">
          <h4 className="minor-title">{t('hyp.predictions')}</h4>
          <ul>
            {hypothesis.predictions.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      <div className="hyp-block">
        <h4 className="minor-title">
          <button
            type="button"
            className="link-button"
            aria-expanded={specOpen}
            onClick={() => setSpecOpen((v) => !v)}
          >
            {specOpen ? t('common.collapse') : t('common.expand')} · {t('hyp.falsification')}
          </button>
        </h4>
        {f === undefined ? (
          <p className="callout callout--err small">{t('hyp.falsification.missing')}</p>
        ) : specOpen ? (
          <FalsificationSpecView spec={f} />
        ) : (
          <p className="muted small">
            {f.observable.length > 160 ? `${f.observable.slice(0, 160)}…` : f.observable}
          </p>
        )}
      </div>

      {hypothesis.literatureNovelty !== undefined && (
        <div className="hyp-block">
          <h4 className="minor-title">{t('litNovelty.title')}</h4>
          <p>
            <Badge tone={litNoveltyTone(hypothesis.literatureNovelty.verdict)}>
              {t(litNoveltyKey(hypothesis.literatureNovelty.verdict))}
            </Badge>{' '}
            {hypothesis.literatureNovelty.neighbors.length > 0 ? (
              <span className="muted small">
                {t('litNovelty.neighbors', { n: hypothesis.literatureNovelty.neighbors.length })}
              </span>
            ) : (
              <span className="muted small">{t('litNovelty.noNeighbors')}</span>
            )}
          </p>
          <p className="muted small">{hypothesis.literatureNovelty.justification}</p>
          {hypothesis.literatureNovelty.neighbors.length > 0 && (
            <details className="hyp-details">
              <summary>{t('litNovelty.neighbors', { n: hypothesis.literatureNovelty.neighbors.length })}</summary>
              <ul>
                {hypothesis.literatureNovelty.neighbors.map((nb, i) => (
                  <li key={`${nb.contentHash}-${i}`}>
                    {nb.title}
                    {nb.year !== undefined ? ` (${nb.year})` : ''}
                    {nb.venue !== undefined ? ` — ${nb.venue}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <footer className="hyp-foot">
        {hypothesis.clusterKey !== undefined ? (
          <span className="muted small mono" title={hypothesis.clusterKey}>
            {t('hyp.cluster', { key: hypothesis.clusterKey.slice(0, 10), n: clusterSize })}
          </span>
        ) : (
          <span className="muted small">{t('hyp.clusterNone')}</span>
        )}
        {(hypothesis.supportingClaimIds?.length ?? 0) > 0 && (
          <span className="muted small">{t('hyp.supportingClaims', { n: hypothesis.supportingClaimIds!.length })}</span>
        )}
        {(hypothesis.counterClaimIds?.length ?? 0) > 0 && (
          <span className="muted small">{t('hyp.counterClaims', { n: hypothesis.counterClaimIds!.length })}</span>
        )}
      </footer>

      {(hypothesis.uncertainties !== undefined && hypothesis.uncertainties.length > 0) || hypothesis.distinctnessRationale !== undefined ? (
        <details className="hyp-details">
          <summary>
            {t('hyp.uncertainties')}
            {hypothesis.uncertainties !== undefined ? ` (${hypothesis.uncertainties.length})` : ''}
          </summary>
          {hypothesis.uncertainties !== undefined && hypothesis.uncertainties.length > 0 && (
            <ul>
              {hypothesis.uncertainties.map((u, i) => <li key={i}>{u}</li>)}
            </ul>
          )}
          {hypothesis.distinctnessRationale !== undefined && (
            <p className="muted small">
              <strong>{t('hyp.distinctness')}:</strong> {hypothesis.distinctnessRationale}
            </p>
          )}
          <p className="muted small mono">
            {t('hyp.derivation')} · {t('hyp.derivation.strategy', { strategy: hypothesis.derivation.strategy })}
            {hypothesis.derivation.modelRef !== undefined ? ` · ${hypothesis.derivation.modelRef}` : ''}
          </p>
        </details>
      ) : null}
    </article>
  );
}

function FalsificationSpecView({ spec }: { spec: NonNullable<HypothesisCandidate['falsification']> }): JSX.Element {
  const { t } = useI18n();
  const rows: [label: string, value: string][] = [
    [t('hyp.falsification.observable'), spec.observable],
    [t('hyp.falsification.measurement'), spec.measurement],
    [t('hyp.falsification.expectedRelation'), spec.expectedRelation],
    [t('hyp.falsification.decisionRule'), spec.decisionRule],
    [t('hyp.falsification.support'), spec.supportCondition],
    [t('hyp.falsification.weakening'), spec.weakeningCondition],
    [t('hyp.falsification.falsify'), spec.falsificationCondition],
    [t('hyp.falsification.method'), spec.method],
    [t('hyp.falsification.failureInterpretation'), spec.failureInterpretation],
  ];
  const listRows: [label: string, items: string[]][] = [
    [t('hyp.falsification.confounders'), spec.confounders ?? []],
    [t('hyp.falsification.altExplanations'), spec.alternativeExplanations ?? []],
    [t('hyp.falsification.dataReq'), spec.dataRequirements ?? []],
  ];
  return (
    <div className="falsification-spec">
      <dl className="fieldlist">
        {rows
          .filter(([, value]) => value.trim().length > 0)
          .map(([label, value]) => (
            <div className="fieldlist-row" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        {listRows
          .filter(([, items]) => items.length > 0)
          .map(([label, items]) => (
            <div className="fieldlist-row" key={label}>
              <dt>{label}</dt>
              <dd>
                <ul>
                  {items.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </dd>
            </div>
          ))}
      </dl>
      {spec.completenessCheck !== undefined && (
        <p>
          <Badge tone={checkTone(spec.completenessCheck.passed)}>
            {spec.completenessCheck.passed ? t('completeness.passed') : t('completeness.failed')}
          </Badge>
          {!spec.completenessCheck.passed && (spec.completenessCheck.missing ?? []).length > 0 && (
            <span className="muted small">
              {' '}
              {t('completeness.missing', { items: (spec.completenessCheck.missing ?? []).join('；') })}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
