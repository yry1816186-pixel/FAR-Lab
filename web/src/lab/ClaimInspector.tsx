import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { TimeAgo } from '../components/common';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import {
  annotateClaim, connectClaim, excludeClaim, pinClaim, reinstateClaim, reclassifyClaim, unpinClaim,
  type ClaimClassification,
} from '../api/endpoints';
import type { HypothesisCandidate, ResearchRun, ScientificClaim, SourceDocument } from '../api/types';
import { bindingKey } from '../tones';
import { zhFirst, decodeEntities } from './bilingual';

/**
 * Claim side of the study-map inspector — the §15 researcher judgement
 * surface: pin / reclassify / annotate / exclude (reason required) /
 * reinstate, plus the disclosed researcher-layer state. Every op rides the
 * real claim-ops contract; exclusion silently reorders NOTHING — the
 * adjusted ACH projection band on the map discloses its effect.
 */
export function ClaimInspector({ claim, run, hyps, balances, sourceById, busy, op, onError }: {
  claim: ScientificClaim;
  run: ResearchRun;
  hyps: HypothesisCandidate[];
  balances: Map<string, { supports: number; counters: number }>;
  /** Source lookup: the inspector renders each locator's DOCUMENT (title,
   *  year, DOI link) so the quote is verifiable at the source. */
  sourceById: Map<string, SourceDocument>;
  busy: boolean;
  op: (act: () => Promise<unknown>) => Promise<void>;
  onError: (e: ApiError | null) => void;
}): JSX.Element {
  const { t, lang } = useI18n();
  const [linkHypId, setLinkHypId] = useState('');
  const [linkDir, setLinkDir] = useState<'supports' | 'counters'>('supports');
  const [excludeArmed, setExcludeArmed] = useState(false);
  const [excludeReason, setExcludeReason] = useState('');
  const [annotation, setAnnotation] = useState('');
  const layer = claim.researcher;
  const excluded = layer?.excluded === true;

  useEffect(() => {
    setLinkHypId('');
    setLinkDir('supports');
    setExcludeArmed(false);
    setExcludeReason('');
    setAnnotation('');
    onError(null);
  }, [claim.id, onError]);

  return (
    <>
      <h3>{t('map.inspClaim')}</h3>
      <p className="insp-body">{claim.text}</p>
      {claim.locators.slice(0, 2).map((loc, i) => {
        const src = sourceById.get(loc.sourceDocumentId);
        const doi = src?.identifiers.find((id) => id.kind === 'doi')?.value;
        return (
          <div key={i} className="insp-source">
            <blockquote className="insp-quote">“{loc.quote}”</blockquote>
            {src !== undefined && (
              <p className="insp-source-meta">
                {t('map.inspSourcePrefix')}
                {src.verification?.retractionStatus !== undefined && (
                  /* Retraction outranks the title (review 2026-09-02). */
                  <span className="map-src-flag">⚠ {t(`library.retraction.${src.verification.retractionStatus}` as DictKey)} · </span>
                )}
                <span className="insp-source-title" title={decodeEntities(src.title)}>{decodeEntities(src.title)}</span>
                {src.publicationYear !== undefined && ` · ${src.publicationYear}`}
                {doi !== undefined && (
                  <>
                    {' · '}
                    <a href={`https://doi.org/${doi}`} target="_blank" rel="noreferrer">DOI {doi}</a>
                  </>
                )}
              </p>
            )}
          </div>
        );
      })}
      <p className="insp-meta">
        {t('map.inspBinding', { status: lang === 'zh' ? t(`binding.${claim.bindingStatus}.zh` as DictKey) : t(bindingKey(claim.bindingStatus)) })}
        {claim.gradeCertainty !== undefined && t('map.inspCertainty', { n: claim.gradeCertainty })}
        {balances.get(claim.id) !== undefined && t('map.inspImpact', {
          s: balances.get(claim.id)!.supports, c: balances.get(claim.id)!.counters,
        })}
      </p>

      {excluded && (
        <div className="insp-excluded" role="status">
          <p className="insp-excluded-title">{t('map.claimExcludedTitle')}</p>
          <p className="insp-excluded-why">{layer?.excludedReason ?? t('map.partialNoReason')}</p>
          <p className="insp-excluded-note">{t('map.claimExcludedNote')}</p>
          <button type="button" className="mb-act mb-act--primary" disabled={busy} onClick={() => { void op(() => reinstateClaim(run.id, claim.id)); }}>
            {t('map.claimReinstate')}
          </button>
        </div>
      )}

      <div className="insp-ops">
        <p className="insp-ops-title">{t('map.claimOpsTitle')}</p>
        <div className="insp-ops-row">
          {layer?.pinned === true
            ? <button type="button" className="mb-act" disabled={busy || excluded} onClick={() => { void op(() => unpinClaim(run.id, claim.id)); }}>{t('map.claimUnpin')}</button>
            : <button type="button" className="mb-act" disabled={busy || excluded} onClick={() => { void op(() => pinClaim(run.id, claim.id)); }}>{t('map.claimPin')}</button>}
          <label className="sr-only" htmlFor="insp-reclassify">{t('map.claimReclassifyLabel')}</label>
          <select
            id="insp-reclassify"
            className="insp-reclassify"
            value={layer?.classification ?? ''}
            disabled={busy || excluded}
            onChange={(e) => {
              const v = e.target.value;
              if (v.length > 0) { void op(() => reclassifyClaim(run.id, claim.id, v as ClaimClassification)); }
            }}
          >
            <option value="">{t('map.claimReclassifyPick')}</option>
            <option value="core-evidence">{t('map.class.core-evidence')}</option>
            <option value="counter-evidence">{t('map.class.counter-evidence')}</option>
            <option value="background">{t('map.class.background')}</option>
            <option value="methodological-concern">{t('map.class.methodological-concern')}</option>
          </select>
        </div>
        {layer?.classification !== undefined && !excluded && (
          <p className="insp-ops-hint">{t('map.claimClassifiedAs', { cls: t(`map.class.${layer.classification}` as DictKey) })}</p>
        )}

        {!excluded && (
          excludeArmed ? (
            <div className="insp-edit">
              <label htmlFor="insp-exclude-reason">{t('map.claimExcludeReason')}</label>
              <textarea
                id="insp-exclude-reason"
                rows={2}
                placeholder={t('map.claimExcludeReasonHint')}
                value={excludeReason}
                onChange={(e) => setExcludeReason(e.target.value)}
              />
              <div className="insp-edit-acts">
                <button
                  type="button"
                  className="mb-act mb-act--danger"
                  disabled={busy || excludeReason.trim().length === 0}
                  onClick={() => {
                    void op(() => excludeClaim(run.id, claim.id, excludeReason.trim()).then(() => { setExcludeArmed(false); setExcludeReason(''); }));
                  }}
                >
                  {t('map.claimExcludeConfirm')}
                </button>
                <button type="button" className="mb-act" onClick={() => setExcludeArmed(false)}>{t('map.cancelBack')}</button>
              </div>
              <p className="insp-edit-note">{t('map.claimExcludeSemantics')}</p>
            </div>
          ) : (
            <button type="button" className="mb-act mb-act--danger" disabled={busy} onClick={() => setExcludeArmed(true)}>
              {t('map.claimExclude')}
            </button>
          )
        )}

        <div className="insp-annotate">
          <label htmlFor="insp-annotate">{t('map.claimAnnotateLabel')}</label>
          <textarea
            id="insp-annotate"
            rows={2}
            value={annotation}
            disabled={excluded}
            placeholder={t('map.claimAnnotateHint')}
            onChange={(e) => setAnnotation(e.target.value)}
          />
          <button
            type="button"
            className="mb-act"
            disabled={busy || excluded || annotation.trim().length === 0}
            onClick={() => {
              void op(() => annotateClaim(run.id, claim.id, annotation.trim()).then(() => setAnnotation('')));
            }}
          >
            {t('map.claimAnnotateAdd')}
          </button>
        </div>
        {(layer?.annotations ?? []).length > 0 && (
          <ul className="insp-annotations">
            {layer!.annotations.slice(-4).reverse().map((a, i) => (
              <li key={`${a.at}-${i}`}>
                <span className="insp-annotation-text">{a.text}</span>
                <span className="insp-annotation-at"><TimeAgo iso={a.at} /></span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hyps.length > 0 && !excluded && (
        <div className="insp-link">
          <p className="insp-link-title">{t('map.linkClaimTitle')}</p>
          <select aria-label={t('map.linkHypLabel')} value={linkHypId} onChange={(e) => setLinkHypId(e.target.value)}>
            <option value="">{t('map.linkPickHyp')}</option>
            {hyps.map((h) => <option key={h.id} value={h.id}>{zhFirst(h.statement, h.statementZh, lang).slice(0, 70)}</option>)}
          </select>
          <select aria-label={t('map.linkDirLabel')} value={linkDir} onChange={(e) => setLinkDir(e.target.value as 'supports' | 'counters')}>
            <option value="supports">{t('map.linkDirSupports')}</option>
            <option value="counters">{t('map.linkDirCounters')}</option>
          </select>
          <button
            type="button"
            className="mb-act mb-act--primary"
            disabled={busy || linkHypId.length === 0}
            onClick={() => { void op(() => connectClaim(run.id, linkHypId, claim.id, linkDir)); }}
          >
            {t('map.linkApply')}
          </button>
        </div>
      )}
    </>
  );
}
