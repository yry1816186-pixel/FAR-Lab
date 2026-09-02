import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../../i18n/LanguageContext';
import type { DictKey } from '../../i18n/dict';
import { ApiError } from '../../api/client';
import { postResearchAction } from '../../api/endpoints';
import { withTimeout } from '../../api/client';
import type { ResearchActionName, ResearchActionResponse, ResearchActionTargetType } from '../../api/types';

/**
 * B4 object-level AI research actions — the thinking-collision surface. Every
 * entry maps one REAL server capability (POST /runs/:id/actions: grounded
 * adversarial analysis over the run's own evidence). The result is always
 * labeled MODEL OUTPUT with its provenance (provider/model/latency, grounding
 * claim count); promoting a point into the causal revision chain is a
 * separate deliberate act (转为反馈 -> the feedback drawer).
 */

const ACTIONS: { name: ResearchActionName; key: DictKey }[] = [
  { name: 'challenge', key: 'actions.challenge' },
  { name: 'weakest_assumption', key: 'actions.weakestAssumption' },
  { name: 'falsify_probe', key: 'actions.falsifyProbe' },
  { name: 'counter_evidence', key: 'actions.counterEvidence' },
  { name: 'what_next', key: 'actions.whatNext' },
];

const POINT_GLYPH: Record<string, string> = { argument: '▸', evidence_link: '⇗', caveat: '⚠', gap: '◌' };

export function ResearchActions({
  runId,
  targetType,
  targetId,
  targetLabel,
  onOpenClaim,
  onToFeedback,
}: {
  runId: string;
  targetType: ResearchActionTargetType;
  targetId: string;
  /** Statement/text snippet used when promoting an analysis into feedback. */
  targetLabel: string;
  onOpenClaim: (claimId: string) => void;
  onToFeedback: (content: string) => void;
}): ReactNode {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [askText, setAskText] = useState('');
  const [loading, setLoading] = useState<ResearchActionName | null>(null);
  const [result, setResult] = useState<ResearchActionResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close the menu on outside click / Escape (lightweight, no modal semantics).
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const runAction = (action: ResearchActionName, question?: string): void => {
    setOpen(false);
    setError(null);
    setLoading(action);
    setResult(null);
    const controller = new AbortController();
    postResearchAction(runId, { action, targetType, targetId, ...(question !== undefined ? { question } : {}) }, withTimeout(controller.signal, 90_000))
      .then((r) => { setResult(r); setLoading(null); })
      .catch((e: unknown) => {
        setLoading(null);
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
      });
  };

  const promoteToFeedback = (): void => {
    if (result === null) return;
    const points = result.analysis.points.map((p) => `[${p.kind}] ${p.text}${p.claimId !== undefined ? ` (${p.claimId})` : ''}`).join('\n');
    onToFeedback(
      t('actions.promoteHead', { action: result.action, model: `${result.model.provider}/${result.model.modelId}`, label: targetLabel }) + `\n${result.analysis.headline}\n${points}` +
      (result.analysis.uncertainties.length > 0 ? `\n${t('actions.promoteUncertainties', { items: result.analysis.uncertainties.join(lang === 'zh' ? '；' : '; ') })}` : '') +
      (result.analysis.nextStep !== undefined ? `\n${t('actions.promoteNextStep', { step: result.analysis.nextStep })}` : ''),
    );
  };

  return (
    <div className="research-actions" ref={rootRef}>
      <button
        type="button"
        className="link-button"
        aria-expanded={open}
        onClick={() => { setOpen((v) => !v); setResult(null); setError(null); }}
        title={t('actions.titleHint')}
      >
        ✦ {t('actions.title')}
      </button>
      {open && (
        <div className="research-actions-menu" role="menu" aria-label={t('actions.title')}>
          {ACTIONS.map((a) => (
            <button key={a.name} type="button" role="menuitem" className="research-actions-item" onClick={() => runAction(a.name)}>
              {t(a.key)}
            </button>
          ))}
          <div className="research-actions-ask">
            <input
              type="text"
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              placeholder={t('actions.askPlaceholder')}
              aria-label={t('actions.askPlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && askText.trim().length > 0) runAction('ask', askText.trim());
              }}
            />
            <button
              type="button"
              className="btn btn--sm"
              disabled={askText.trim().length === 0}
              onClick={() => runAction('ask', askText.trim())}
            >
              {t('actions.ask')}
            </button>
          </div>
        </div>
      )}
      {loading !== null && (
        <p className="research-actions-loading muted small" role="status">
          {t('actions.loading', { action: t(ACTIONS.find((a) => a.name === loading)?.key ?? 'actions.title') })}
        </p>
      )}
      {error !== null && (
        <p className="field-error small" role="alert">
          {t('actions.failed')}：{error.message}
        </p>
      )}
      {result !== null && (
        <div className="research-actions-result" role="article">
          <div className="research-actions-head">
            <strong>{result.analysis.headline}</strong>
            <button type="button" className="link-button" onClick={() => setResult(null)} aria-label={t('actions.close')}>
              ✕
            </button>
          </div>
          <ul className="research-actions-points">
            {result.analysis.points.map((p, i) => (
              <li key={i} className={`research-actions-point research-actions-point--${p.kind}`}>
                <span aria-hidden="true">{POINT_GLYPH[p.kind] ?? '·'}</span>
                <span>
                  {p.text}
                  {p.claimId !== undefined && (
                    <>
                      {' '}
                      <button type="button" className="link-button mono small" onClick={() => onOpenClaim(p.claimId!)}>
                        {p.claimId}
                      </button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {result.analysis.uncertainties.length > 0 && (
            <details className="claim-uncertainties">
              <summary>{t('hyp.uncertainties')} ({result.analysis.uncertainties.length})</summary>
              <ul>{result.analysis.uncertainties.map((u, i) => <li key={i}>{u}</li>)}</ul>
            </details>
          )}
          {result.analysis.nextStep !== undefined && (
            <p className="callout callout--info small">{t('actions.nextStep')}：{result.analysis.nextStep}</p>
          )}
          {result.droppedRefs.length > 0 && (
            <p className="callout callout--warn small">{t('actions.droppedRefs', { n: result.droppedRefs.length })}</p>
          )}
          <p className="muted small">
            {t('actions.meta', { model: `${result.model.provider}/${result.model.modelId}`, ms: result.model.latencyMs, n: result.groundingClaims })}
            {' · '}
            {t('actions.disclaimer')}
          </p>
          <button type="button" className="btn btn--sm" onClick={promoteToFeedback}>
            {t('actions.toFeedback')}
          </button>
        </div>
      )}
    </div>
  );
}
