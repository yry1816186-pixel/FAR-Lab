import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/LanguageContext';
import { errorText } from './common';
import { goalTypeKey } from '../i18n/keys';
import { useCreateRun } from '../hooks/useCreateRun';
import { listModelConfigs } from '../api/endpoints';
import type { ModelConfigsResponse } from '../api/types';
import type { ScientificGoalType } from '../api/types';
import { detectPasteKind, parseCitation, extractPdfText, readTextFile, extractDoi, extractArxivId, fetchZoteroItems } from '../utils/ingest';

const GOAL_TYPES: ScientificGoalType[] = ['explanatory', 'predictive', 'interventional', 'methodological', 'exploratory'];

/**
 * Hero run-creation input (P-IA): the workbench's central way to start work —
 * a large question field with the primary action, advanced options collapsed
 * behind a details toggle. Same state machine as before via useCreateRun.
 */
export function NewRunForm({ onCreated }: { onCreated: (runId: string) => void }): JSX.Element {
  const { t } = useI18n();
  const { text, setText, domain, setDomain, goalType, setGoalType, providerConfigId, setProviderConfigId, seeds, setSeeds, showValidationError, submitting, error, submit } =
    useCreateRun(onCreated);
  const canSubmit = !submitting && text.trim().length > 0;
  // Model-route picker data (custom configs + the env default): fetched once per
  // mount; failures leave the picker at the env default (never block creation).
  const [modelConfigs, setModelConfigs] = useState<ModelConfigsResponse | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    listModelConfigs(controller.signal)
      .then((res) => { setModelConfigs(res); })
      .catch(() => { /* picker stays on the env default — creation must not depend on it */ });
    return () => controller.abort();
  }, []);

  // ---- R1 entry upgrade: paste/drop recognition + Zotero + seed chips ----
  const [ingestNote, setIngestNote] = useState<string | null>(null);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [zotero, setZotero] = useState<{ open: boolean; status: 'loading' | 'unavailable' | 'ready'; items: import('../utils/ingest').ZoteroItem[] }>({ open: false, status: 'loading', items: [] });

  const addSeed = (seed: import('../utils/ingest').SeedInput, note: string): void => {
    setSeeds([...seeds, seed].slice(0, 5));
    setIngestNote(note);
    window.setTimeout(() => setIngestNote(null), 4000);
  };

  /** Paste routing: DOI/arXiv/BibTeX/RIS become seeds; plain text stays the question. */
  const onPaste = async (ev: React.ClipboardEvent<HTMLTextAreaElement>): Promise<void> => {
    const pasted = ev.clipboardData.getData('text/plain');
    if (pasted.trim().length === 0) return;
    const kind = detectPasteKind(pasted);
    if (kind === 'bibtex' || kind === 'ris') {
      ev.preventDefault();
      const seed = await parseCitation(pasted);
      if (seed !== null) {
        addSeed(seed, t('ingest.citationAdded'));
        if (seed.title !== undefined && text.trim().length === 0) {
          setText(t('ingest.questionFromCitation', { title: seed.title.slice(0, 120) }));
        }
      } else {
        setIngestNote(t('ingest.citationFailed'));
      }
    } else if (kind === 'doi' || kind === 'arxiv') {
      // Keep the pasted text in the question AND register the identifier as a seed.
      const doi = kind === 'doi' ? extractDoi(pasted) : null;
      const arxiv = kind === 'arxiv' ? extractArxivId(pasted) : null;
      if (doi !== null) addSeed({ identifiers: [{ kind: 'doi', value: doi }], title: `DOI ${doi}` }, t('ingest.doiAdded'));
      else if (arxiv !== null) addSeed({ identifiers: [{ kind: 'arxiv', value: arxiv }], title: `arXiv:${arxiv}` }, t('ingest.arxivAdded'));
    }
  };

  /** Drop routing: .pdf extracts text (unpdf); .txt/.md/.bib/.ris read directly. */
  const onDrop = async (ev: React.DragEvent<HTMLFormElement>): Promise<void> => {
    ev.preventDefault();
    const file = ev.dataTransfer.files[0];
    if (file === undefined || ingestBusy) return;
    setIngestBusy(true);
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith('.pdf')) {
        const extracted = await extractPdfText(file);
        if (extracted !== null) {
          addSeed({ title: file.name.replace(/\.pdf$/i, ''), text: extracted }, t('ingest.pdfAdded'));
        } else {
          setIngestNote(t('ingest.pdfFailed'));
        }
      } else if (name.endsWith('.bib') || name.endsWith('.ris')) {
        const content = await readTextFile(file);
        if (content !== null) {
          const seed = await parseCitation(content);
          if (seed !== null) addSeed(seed, t('ingest.citationAdded'));
          else setIngestNote(t('ingest.citationFailed'));
        }
      } else if (name.endsWith('.txt') || name.endsWith('.md')) {
        const content = await readTextFile(file);
        if (content !== null) addSeed({ title: file.name, text: content }, t('ingest.textAdded'));
      } else {
        setIngestNote(t('ingest.unsupported'));
      }
    } finally {
      setIngestBusy(false);
      window.setTimeout(() => setIngestNote(null), 4000);
    }
  };

  const openZotero = async (): Promise<void> => {
    setZotero({ open: true, status: 'loading', items: [] });
    const controller = new AbortController();
    const items = await fetchZoteroItems(controller.signal);
    // null = Zotero not running / local API disabled — honest degradation.
    setZotero(items === null
      ? { open: true, status: 'unavailable', items: [] }
      : { open: true, status: 'ready', items });
  };

  return (
    <form
      className="hero-form"
      onSubmit={(e) => void submit(e)}
      onDrop={(e) => void onDrop(e)}
      onDragOver={(e) => e.preventDefault()}
      noValidate
    >
      <label className="field-label" htmlFor="newrun-question">
        {t('form.question')} <span aria-hidden="true" className="req">*</span>
      </label>
      <textarea
        id="newrun-question"
        className="hero-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => void onPaste(e)}
        placeholder={t('form.questionPlaceholder')}
        rows={3}
        aria-required="true"
        aria-invalid={showValidationError}
        disabled={submitting}
        // Quick capture (B2): landing on the welcome view puts the cursor in
        // the question box — idea → FAR-Lab friction ≈ 0 (also reached via `n`).
        autoFocus
      />
      {/* R1 ingestion surface: seed chips + status line + Zotero picker. */}
      {seeds.length > 0 && (
        <div className="seed-chips" role="list" aria-label={t('ingest.seedsLabel')}>
          {seeds.map((s, i) => (
            <span key={i} className="seed-chip" role="listitem">
              <span className="seed-chip-kind">{s.identifiers?.[0]?.kind === 'doi' ? 'DOI' : s.identifiers?.[0]?.kind === 'arxiv' ? 'arXiv' : s.text !== undefined ? (s.text.length > 5000 ? 'PDF' : 'TXT') : 'REF'}</span>
              <span className="seed-chip-title" title={s.title ?? ''}>{(s.title ?? '').slice(0, 60) || t('ingest.untitled')}</span>
              <button
                type="button"
                className="seed-chip-remove"
                aria-label={t('ingest.removeSeed')}
                onClick={() => setSeeds(seeds.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      {ingestNote !== null && <p className="muted small" role="status">{ingestNote}</p>}
      {ingestBusy && <p className="muted small" role="status">{t('ingest.busy')}</p>}
      <div className="ingest-row">
        <button type="button" className="btn btn--sm" onClick={() => void openZotero()}>
          {t('ingest.zotero')}
        </button>
        <span className="muted small">{t('ingest.dropHint')}</span>
      </div>
      {zotero.open && (
        <div className="zotero-picker" role="dialog" aria-label={t('ingest.zotero')}>
          {zotero.status === 'loading' ? (
            <p className="muted small" role="status">{t('ingest.zoteroConnecting')}</p>
          ) : zotero.status === 'unavailable' ? (
            <>
              <p className="muted small">{t('ingest.zoteroUnavailable')}</p>
              <button type="button" className="btn btn--sm" onClick={() => setZotero({ open: false, status: 'loading', items: [] })}>
                {t('ingest.zoteroClose')}
              </button>
            </>
          ) : zotero.items.length === 0 ? (
            <p className="muted small">{t('ingest.zoteroEmpty')}</p>
          ) : (
            <>
              <p className="muted small">{t('ingest.zoteroPick')}</p>
              <ul className="zotero-list">
                {zotero.items.slice(0, 10).map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      className="zotero-item"
                      onClick={() => {
                        addSeed(
                          {
                            title: item.title,
                            ...(item.doi !== undefined ? { identifiers: [{ kind: 'doi', value: item.doi }] } : {}),
                            ...(item.year !== undefined ? { year: item.year } : {}),
                            ...(item.creators !== undefined ? { authors: item.creators } : {}),
                          },
                          t('ingest.zoteroAdded'),
                        );
                        setZotero({ open: false, status: 'loading', items: [] });
                      }}
                    >
                      <span className="zotero-item-title">{item.title.slice(0, 80)}</span>
                      {item.year !== undefined && <span className="muted small"> ({item.year})</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn--sm" onClick={() => setZotero({ open: false, status: 'loading', items: [] })}>
                {t('ingest.zoteroClose')}
              </button>
            </>
          )}
        </div>
      )}
      {showValidationError && (
        <p className="field-error" role="alert">
          {t('form.questionRequired')}
        </p>
      )}

      <details className="hero-advanced">
        <summary>{t('form.advanced')}</summary>
        <div className="hero-advanced-body">
          <label className="field-label" htmlFor="newrun-domain">
            {t('form.domain')}
          </label>
          <input
            id="newrun-domain"
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder={t('form.domainPlaceholder')}
            disabled={submitting}
          />
          <label className="field-label" htmlFor="newrun-goaltype">
            {t('form.goalType')}
          </label>
          <select id="newrun-goaltype" value={goalType} onChange={(e) => setGoalType(e.target.value)} disabled={submitting}>
            <option value="">{t('goalType.unset')}</option>
            {GOAL_TYPES.map((g) => (
              <option key={g} value={g}>
                {t(goalTypeKey(g))}
              </option>
            ))}
          </select>
          <label className="field-label" htmlFor="newrun-model">
            {t('settings.modelRoute')}
          </label>
          <select id="newrun-model" value={providerConfigId} onChange={(e) => setProviderConfigId(e.target.value)} disabled={submitting}>
            <option value="">
              {t('settings.modelRouteEnvDefault')}
              {modelConfigs?.envDefault !== null && modelConfigs?.envDefault !== undefined
                ? `（${modelConfigs.envDefault.name} · ${modelConfigs.envDefault.modelId}）`
                : ''}
            </option>
            {(modelConfigs?.configs ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}（{c.modelId}）
              </option>
            ))}
          </select>
        </div>
      </details>

      {error !== null && (
        <p className="field-error" role="alert">
          {t('form.submitFailed')}：{errorText(error)}
          {error.retryable ? `（${t('common.retryable')}）` : ''}
        </p>
      )}

      <div className="hero-actions">
        <button type="submit" className="btn btn--primary btn--hero" disabled={!canSubmit}>
          {submitting ? t('form.submitting') : t('form.submit')}
        </button>
        <span className="hero-hint muted">{t('form.heroHint')}</span>
      </div>
      <p className="hero-hint muted small">{t('form.kbdHint')}</p>
      <p aria-live="polite" className="sr-only">
        {submitting ? t('form.submitting') : ''}
      </p>
    </form>
  );
}
