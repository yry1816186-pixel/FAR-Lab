import { useCallback } from 'react';
import { getRevisions } from '../../api/endpoints';
import type { ResearchRun } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import { Badge, EmptyState, ErrorBox, IdText, Skeleton, TimeText } from '../common';
import type { RevisionsBundle } from '../../api/normalize';
import { qualityKey } from '../../i18n/keys';
import { DiffText } from '../../utils/diffview';

/**
 * Causal revision chain (mission §33/§34, report §10): every revision MUST link
 * back to the feedback that triggered it, with operations, quality delta and a
 * version diff. Missing links render as visible "missing" — never dropped.
 */
export function RevisionsTab({ run }: { run: ResearchRun }): JSX.Element {
  const fetcher = useCallback((signal: AbortSignal) => getRevisions(run.id, signal), [run.id]);
  const res = useResource(fetcher, [run.id], `${run.updatedAt}:${run.status}`);

  return (
    <div className="tab-content">
      {res.loading ? (
        <Skeleton lines={4} />
      ) : res.error !== null ? (
        <ErrorBox error={res.error} onRetry={res.retry} />
      ) : res.data === null ? null : res.data.feedbacks.length === 0 ? (
        <EmptyState titleKey="rev.empty" />
      ) : (
        <RevisionChain data={res.data} />
      )}
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

function RevisionChain({ data }: { data: RevisionsBundle }): JSX.Element {
  const { t } = useI18n();
  const feedbackById = new Map(data.feedbacks.map((f) => [f.id, f] as const));
  const revisionByTrigger = new Map(data.revisions.map((r) => [r.triggerFeedbackId, r] as const));
  const diffByRevision = new Map(data.diffs.map((d) => [d.revisionId, d] as const));
  const orphanRevisions = data.revisions.filter((r) => !feedbackById.has(r.triggerFeedbackId));

  return (
    <div className="revision-chain">
      {data.feedbacks.map((f) => {
        const revision = revisionByTrigger.get(f.id);
        const diff = revision !== undefined ? diffByRevision.get(revision.id) : undefined;
        return (
          <div key={f.id} className="chain-block">
            <div className="chain-node chain-node--feedback">
              <div className="chain-node-head">
                <strong>{t('rev.feedback', { id: '' }).trim()} <IdText value={f.id} /></strong>
                <Badge tone="info">{f.source}</Badge>
                <TimeText iso={f.receivedAt} />
              </div>
              <p className="chain-content">{f.content}</p>
              <p className="muted small">
                {t('rev.provenance')}: {f.provenance}
                {f.target !== undefined && <span className="mono"> · target={f.target.kind}/{f.target.id}</span>}
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
                  {t('rev.triggeredBy')}: <IdText value={revision.triggerFeedbackId} />
                </p>
                <p>
                  <strong>{t('rev.causalReason')}:</strong> {revision.causalReason}
                </p>
                <div className="chain-ops">
                  <h4 className="minor-title">{t('rev.operations')} ({revision.operations.length})</h4>
                  <ul>
                    {revision.operations.map((op, i) => (
                      <li key={`${op.objectId}-${i}`}>
                        <span className="mono">[{op.objectType}/{op.operation}]</span> <IdText value={op.objectId} />
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
                    <p><strong>{t('rev.semantic')}:</strong> {diff.semanticSummary}</p>
                    <ul>
                      {diff.entries.map((e, i) => (
                        <li key={`${e.objectId}-${i}`}>
                          <span className="mono">[{e.objectType}]</span> <IdText value={e.objectId} />: {e.summary}
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
