import { useCallback, useMemo } from 'react';
import { getEvents, getHypotheses, getRevisions } from '../../api/endpoints';
import type { ResearchRun } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import { Badge, EmptyState, ErrorBox, IdText, Skeleton, TimeText } from '../common';
import type { RevisionsBundle } from '../../api/normalize';
import { qualityKey } from '../../i18n/keys';
import { DiffText } from '../../utils/diffview';
import { qualitySequence } from '../../viz/cross-viz';
import { InlineIdRefs, buildHypLabels, buildOrdinalLabels } from './InlineIdRefs';
import { deriveDecisions, hypStatusLabel, STATUS_CHANGE_LABEL_KEY } from './revision-decisions';
import type { ResearcherDecision } from './revision-decisions';

/**
 * Causal revision chain (mission §33/§34, report §10): every revision MUST link
 * back to the feedback that triggered it, with operations, quality delta and a
 * version diff. Missing links render as visible "missing" — never dropped.
 * HX4c: the chain reads in human terms (反馈 N · 假设 №N); raw ids stay one
 * hover away — this is an audit surface, ids remain reachable, never dominant.
 * Human inspector decisions are projected via revision-decisions.ts.
 */
export function RevisionsTab({ run }: { run: ResearchRun }): JSX.Element {
  const fetcher = useCallback((signal: AbortSignal) => getRevisions(run.id, signal), [run.id]);
  const res = useResource(fetcher, [run.id], `${run.updatedAt}:${run.status}`);
  // Hypothesis labels for operation/diff object ids (best-effort; ids render
  // verbatim when the fetch fails — never silently renumbered).
  const hypFetcher = useCallback((signal: AbortSignal) => getHypotheses(run.id, signal), [run.id]);
  const hypRes = useResource(hypFetcher, [run.id], `${run.updatedAt}`);
  const hypLabels = hypRes.data !== null
    ? buildHypLabels(hypRes.data.scorecards, new Map(hypRes.data.hypotheses.map((h) => [h.id, h.statement] as const)))
    : undefined;
  const evFetcher = useCallback((signal: AbortSignal) => getEvents(run.id, 0, signal), [run.id]);
  const evRes = useResource(evFetcher, [run.id], `${run.updatedAt}:${run.status}`);
  const decisions = useMemo(() => deriveDecisions(evRes.data ?? []), [evRes.data]);

  const feedbackCount = res.data?.feedbacks.length ?? 0;
  return (
    <>
      {res.loading ? (
        <Skeleton lines={4} />
      ) : res.error !== null ? (
        <ErrorBox error={res.error} onRetry={res.retry} />
      ) : res.data === null ? null : feedbackCount === 0 && decisions.length === 0 ? (
        <EmptyState titleKey="rev.empty" />
      ) : (
        <div>
          {decisions.length > 0 && <DecisionList decisions={decisions} hypLabels={hypLabels} />}
          {feedbackCount > 0 && <RevisionChain data={res.data} hypLabels={hypLabels} />}
        </div>
      )}
    </>
  );
}

function DecisionList({ decisions, hypLabels }: { decisions: ResearcherDecision[]; hypLabels?: Map<string, string> }): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="revision-chain">
      <h3 className="minor-title">{t('rev.decisionsTitle')}（{decisions.length}）</h3>
      <p className="muted small">{t('rev.decisionsHint')}</p>
      {decisions.map(({ event, labelKey }) => {
        const detail = (event.detail ?? {}) as {
          hypothesisId?: unknown; claimId?: unknown;
          from?: unknown; to?: unknown;
          excludedReason?: unknown;
        };
        const isStatusChange = labelKey === STATUS_CHANGE_LABEL_KEY;
        return (
          <div key={event.seq} className="chain-node chain-node--feedback">
            <div className="chain-node-head">
              <strong>{t(labelKey)}</strong>
              <TimeText iso={event.at} />
              <span className="muted small mono">#{event.seq}</span>
            </div>
            <p className="chain-content">
              {typeof detail.hypothesisId === 'string' && (
                <InlineIdRefs text={detail.hypothesisId} hypLabels={hypLabels} />
              )}
              {typeof detail.claimId === 'string' && <IdText value={detail.claimId} />}
              {typeof detail.from === 'string' && typeof detail.to === 'string' && (
                <span className="muted">
                  {' '}
                  {t('rev.decisionFromTo', {
                    from: isStatusChange ? hypStatusLabel(detail.from, t) : detail.from,
                    to: isStatusChange ? hypStatusLabel(detail.to, t) : detail.to,
                  })}
                </span>
              )}
              {typeof detail.excludedReason === 'string' && (
                <span className="muted small"> — {detail.excludedReason}</span>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function qualityTone(status: string): 'ok' | 'warn' | 'err' | 'muted' {
  switch (status) {
    case 'improved': return 'ok';
    case 'worse': return 'err';
    case 'neutral': return 'muted';
    default: return 'warn'; // inconclusive
  }
}

/**
 * VIZ V6: quality-delta sequence across the revision chain — one colored step
 * per revision that HAS a qualityDelta (missing judgment is not a step). A
 * numeric trend line would invent a scale the data doesn't have; categorical
 * steps are the honest encoding. Renders only with 2+ steps.
 */
function QualityTrend({ revisions }: { revisions: { qualityDelta?: { status: string } }[] }): JSX.Element | null {
  const { t } = useI18n();
  const seq = qualitySequence(revisions);
  if (seq.length < 2) return null;
  return (
    <div className="quality-trend" role="img" aria-label={`${t('rev.qualityTrend')} — ${seq.map((s) => t(qualityKey(s))).join(' → ')}`}>
      <span className="muted small">{t('rev.qualityTrend')}：</span>
      {seq.map((s, i) => (
        <span key={i} className={`quality-step tone-${qualityTone(s)}`}>
          {i > 0 && <span className="muted" aria-hidden="true"> → </span>}
          {t(qualityKey(s))}
        </span>
      ))}
    </div>
  );
}

function RevisionChain({ data, hypLabels }: { data: RevisionsBundle; hypLabels?: Map<string, string> }): JSX.Element {
  const { t } = useI18n();
  const feedbackById = new Map(data.feedbacks.map((f) => [f.id, f] as const));
  const revisionByTrigger = new Map(data.revisions.map((r) => [r.triggerFeedbackId, r] as const));
  const diffByRevision = new Map(data.diffs.map((d) => [d.revisionId, d] as const));
  const orphanRevisions = data.revisions.filter((r) => !feedbackById.has(r.triggerFeedbackId));
  // HX4c: 反馈 N by chain order — the same discipline as 主张 N / 假设 №N.
  const feedbackLabels = buildOrdinalLabels(data.feedbacks.map((f) => f.id), t('idref.feedback'));

  return (
    <div className="revision-chain">
      <QualityTrend revisions={data.revisions} />
      {data.feedbacks.map((f) => {
        const revision = revisionByTrigger.get(f.id);
        const diff = revision !== undefined ? diffByRevision.get(revision.id) : undefined;
        const feedbackLabel = feedbackLabels.get(f.id) ?? f.id;
        return (
          <div key={f.id} className="chain-block">
            <div className="chain-node chain-node--feedback">
              <div className="chain-node-head">
                <strong title={f.id}>{feedbackLabel}</strong>
                <Badge tone="info">{f.source}</Badge>
                <TimeText iso={f.receivedAt} />
                <IdText value={f.id} />
              </div>
              <p className="chain-content">{f.content}</p>
              <p className="muted small">
                {t('rev.provenance')}: {f.provenance}
                {f.target !== undefined && (
                  <span> · {t('rev.target')}:{' '}
                    <InlineIdRefs text={f.target.id} hypLabels={hypLabels} feedbackLabels={feedbackLabels} />
                    <span className="muted small"> ({f.target.kind})</span>
                  </span>
                )}
              </p>
            </div>
            <div className="chain-arrow" aria-hidden="true">↓</div>
            {revision === undefined ? (
              <div className="chain-node chain-node--missing">
                <p className="muted">{t('rev.noRevisionYet')}</p>
              </div>
            ) : (
              <div className="chain-node chain-node--revision">
                <div className="chain-node-head">
                  <strong>{t('rev.revision', { from: revision.fromVersionLabel, to: revision.toVersionLabel })}</strong>
                  <Badge tone={qualityTone(revision.qualityDelta.status)}>{t(qualityKey(revision.qualityDelta.status))}</Badge>
                  <TimeText iso={revision.createdAt} />
                </div>
                <p className="muted small">
                  {t('rev.triggeredBy')}: <span className="id-ref" title={revision.triggerFeedbackId}>{feedbackLabels.get(revision.triggerFeedbackId) ?? revision.triggerFeedbackId}</span>
                </p>
                <p>
                  <strong>{t('rev.causalReason')}:</strong>{' '}
                  <InlineIdRefs text={revision.causalReason} hypLabels={hypLabels} feedbackLabels={feedbackLabels} />
                </p>
                <div className="chain-ops">
                  <h4 className="minor-title">{t('rev.operations')} ({revision.operations.length})</h4>
                  <ul>
                    {revision.operations.map((op, i) => (
                      <li key={`${op.objectId}-${i}`}>
                        <span className="mono">[{op.objectType}/{op.operation}]</span>{' '}
                        <InlineIdRefs text={op.objectId} hypLabels={hypLabels} feedbackLabels={feedbackLabels} />
                        <div className="op-diff">
                          {op.before !== undefined && <div><span className="muted">before:</span> <span className="mono">{truncate(op.before)}</span></div>}
                          {op.after !== undefined && <div><span className="muted">after:</span> <span className="mono">{truncate(op.after)}</span></div>}
                          <div className="muted small">{op.reason}</div>
                          {(op.before !== undefined || op.after !== undefined) && (
                            /* B3-7 version compare (R3 upgrade): when BOTH sides
                               exist, the two raw <pre> blocks become ONE word-level
                               jsdiff view (green added / red removed, both readable);
                               single-sided operations keep the raw pre — a diff
                               against nothing would be noise, not information. */
                            <details className="op-compare">
                              <summary className="muted small">{t('rev.compareFull')}</summary>
                              {op.before !== undefined && op.after !== undefined ? (
                                <div>
                                  <div className="muted small">{t('rev.diffLegend')}</div>
                                  <pre className="op-compare-text mono">
                                    <DiffText before={op.before} after={op.after} />
                                  </pre>
                                </div>
                              ) : (
                                <div className="op-compare-grid">
                                  {op.before !== undefined && (
                                    <div>
                                      <span className="muted small">{t('rev.before')}（{revision.fromVersionLabel}）</span>
                                      <pre className="op-compare-text mono">{op.before}</pre>
                                    </div>
                                  )}
                                  {op.after !== undefined && (
                                    <div>
                                      <span className="muted small">{t('rev.after')}（{revision.toVersionLabel}）</span>
                                      <pre className="op-compare-text mono">{op.after}</pre>
                                    </div>
                                  )}
                                </div>
                              )}
                            </details>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="quality-delta">
                  <strong>{t('rev.quality')}:</strong> {t(qualityKey(revision.qualityDelta.status))} — {revision.qualityDelta.claim}
                </p>
                <div className="chain-arrow" aria-hidden="true">↓</div>
                {diff === undefined ? (
                  <p className="muted small">{t('rev.diffMissing')}</p>
                ) : (
                  <div className="chain-node chain-node--diff">
                    <h4 className="minor-title">{t('rev.diff')}</h4>
                    <p><strong>{t('rev.semantic')}:</strong>{' '}
                      <InlineIdRefs text={diff.semanticSummary} hypLabels={hypLabels} feedbackLabels={feedbackLabels} />
                    </p>
                    <ul>
                      {diff.entries.map((e, i) => (
                        <li key={`${e.objectId}-${i}`}>
                          <span className="mono">[{e.objectType}]</span>{' '}
                          <InlineIdRefs text={e.objectId} hypLabels={hypLabels} feedbackLabels={feedbackLabels} />:{' '}
                          <InlineIdRefs text={e.summary} hypLabels={hypLabels} feedbackLabels={feedbackLabels} />
                          {(e.changedFields ?? []).length > 0 && (
                            <span className="muted small"> · {t('rev.changedFields')}: {(e.changedFields ?? []).join(', ')}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {(diff.remainingUncertainties ?? []).length > 0 && (
                      <p className="muted small">
                        <strong>{t('rev.remaining')}:</strong> {(diff.remainingUncertainties ?? []).join('；')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {orphanRevisions.length > 0 && (
        <div className="chain-block">
          <div className="chain-node chain-node--missing">
            <h4 className="minor-title">{t('rev.triggeredBy')} — {t('evidence.claimMissing', { id: 'feedback' })}</h4>
            {orphanRevisions.map((r) => (
              <p key={r.id} className="muted small mono">
                {r.id} ← {r.triggerFeedbackId}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function truncate(text: string, max = 120): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
