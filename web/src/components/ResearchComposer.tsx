import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp, BookMarked, FileText, Link2, Loader2, Paperclip, RotateCcw, X,
} from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import { errorText } from './common';
import { goalTypeKey } from '../i18n/keys';
import { useCreateRun } from '../hooks/useCreateRun';
import { listModelConfigs } from '../api/endpoints';
import type { ModelConfigsResponse, ScientificGoalType } from '../api/types';
import {
  detectPasteKind, parseCitation, extractPdfText, readTextFile,
  extractDoi, extractArxivId, fetchZoteroItems, type SeedInput, type ZoteroItem,
} from '../utils/ingest';

const GOAL_TYPES: ScientificGoalType[] = ['explanatory', 'predictive', 'interventional', 'methodological', 'exploratory'];
const MAX_SEEDS = 5;

type AttachKind = 'PDF' | 'TXT' | 'REF' | 'DOI' | 'arXiv' | 'URL';

interface Attachment {
  id: number;
  seed: SeedInput;
  kind: AttachKind;
  status: 'parsing' | 'ready' | 'failed';
  errorKey?: DictKey;
  sizeBytes?: number;
  /** Re-runnable parse source so a failed card can retry without re-dropping. */
  retry?: () => Promise<void>;
}

let attachSeq = 0;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Research Composer (HX2) — the single creation surface: question in natural
 * language + a real attachment tray (PDF/BibTeX/RIS/TXT/MD, DOI/arXiv/URL,
 * Zotero). Every card reflects a real parse state; nothing is decorative.
 * Interaction patterns adapted from LibreChat ChatForm (MIT: IME triple guard,
 * paste-as-attachment) and Dify chat-input (input affordances), per Scout A.
 */
export function ResearchComposer({ onCreated }: { onCreated: (runId: string) => void }): JSX.Element {
  const { t } = useI18n();
  const { text, setText, domain, setDomain, goalType, setGoalType, providerConfigId, setProviderConfigId,
    showValidationError, submitting, error, submit, setSeeds } = useCreateRun(onCreated);

  // ---- attachments: local authority, projected into the createRun machine ----
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  useEffect(() => {
    setSeeds(attachments.filter((a) => a.status === 'ready').map((a) => a.seed).slice(0, MAX_SEEDS));
    // setSeeds is a stable useState setter; projection only runs on tray changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments]);

  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<number | null>(null);
  const flashNote = (msg: string): void => {
    setNote(msg);
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 4000);
  };

  // ---- model configs (fetched once; failure never blocks creation) ----
  const [modelConfigs, setModelConfigs] = useState<ModelConfigsResponse | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    listModelConfigs(controller.signal).then(setModelConfigs).catch(() => { /* stays on default */ });
    return () => controller.abort();
  }, []);

  // ---- auto-grow question textarea ----
  const questionRef = useRef<HTMLTextAreaElement | null>(null);
  const autosize = (): void => {
    const el = questionRef.current;
    if (el === null) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  };

  // ---- drop-zone visual state (whole composer is the target) ----
  const [dragActive, setDragActive] = useState(false);

  const capReached = attachments.length >= MAX_SEEDS;

  const upsert = (id: number, patch: Partial<Attachment>): void => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  /** Parse one dropped/selected file into a seed card with honest failure states. */
  const ingestFile = async (file: File): Promise<void> => {
    if (capReached) { flashNote(t('composer.capReached', { n: MAX_SEEDS })); return; }
    const name = file.name.toLowerCase();
    const kind: AttachKind | null = name.endsWith('.pdf') ? 'PDF'
      : name.endsWith('.txt') || name.endsWith('.md') ? 'TXT'
      : name.endsWith('.bib') || name.endsWith('.ris') ? 'REF' : null;
    if (kind === null) { flashNote(t('ingest.unsupported')); return; }
    const id = ++attachSeq;
    setAttachments((prev) => [...prev, { id, seed: { title: file.name }, kind, status: 'parsing', sizeBytes: file.size }]);
    const run = async (): Promise<void> => {
      upsert(id, { status: 'parsing', retry: () => run() });
      try {
        if (kind === 'PDF') {
          const extracted = await extractPdfText(file);
          if (extracted === null) { upsert(id, { status: 'failed', errorKey: 'ingest.pdfFailed' }); return; }
          upsert(id, { status: 'ready', seed: { title: file.name.replace(/\.pdf$/i, ''), text: extracted } });
        } else if (kind === 'REF') {
          const content = await readTextFile(file);
          const seed = content !== null ? await parseCitation(content) : null;
          if (seed === null) { upsert(id, { status: 'failed', errorKey: 'ingest.citationFailed' }); return; }
          upsert(id, { status: 'ready', seed, sizeBytes: file.size });
        } else {
          const content = await readTextFile(file);
          if (content === null) { upsert(id, { status: 'failed', errorKey: 'ingest.pdfFailed' }); return; }
          upsert(id, { status: 'ready', seed: { title: file.name, text: content } });
        }
      } catch {
        upsert(id, { status: 'failed', errorKey: 'ingest.pdfFailed' });
      }
    };
    await run();
  };

  const addIdentifier = (raw: string): boolean => {
    const value = raw.trim();
    if (value.length === 0) return false;
    if (capReached) { flashNote(t('composer.capReached', { n: MAX_SEEDS })); return false; }
    const doi = extractDoi(value);
    const arxiv = extractArxivId(value);
    if (doi !== null) {
      setAttachments((prev) => [...prev, { id: ++attachSeq, kind: 'DOI', status: 'ready', seed: { identifiers: [{ kind: 'doi', value: doi }], title: `DOI ${doi}` } }]);
      return true;
    }
    if (arxiv !== null) {
      setAttachments((prev) => [...prev, { id: ++attachSeq, kind: 'arXiv', status: 'ready', seed: { identifiers: [{ kind: 'arxiv', value: arxiv }], title: `arXiv:${arxiv}` } }]);
      return true;
    }
    if (/^https?:\/\/\S+$/i.test(value)) {
      setAttachments((prev) => [...prev, { id: ++attachSeq, kind: 'URL', status: 'ready', seed: { identifiers: [{ kind: 'url', value }], title: value.slice(0, 80) } }]);
      return true;
    }
    flashNote(t('composer.invalidLink'));
    return false;
  };

  /** Paste routing (LibreChat pattern): citations/identifiers become attachments; prose stays the question. */
  const onPaste = async (ev: React.ClipboardEvent<HTMLTextAreaElement>): Promise<void> => {
    const pasted = ev.clipboardData.getData('text/plain');
    if (pasted.trim().length === 0) return;
    const kind = detectPasteKind(pasted);
    if (kind === 'bibtex' || kind === 'ris') {
      ev.preventDefault();
      if (capReached) { flashNote(t('composer.capReached', { n: MAX_SEEDS })); return; }
      const id = ++attachSeq;
      setAttachments((prev) => [...prev, { id, kind: 'REF', status: 'parsing', seed: { title: '' } }]);
      const seed = await parseCitation(pasted);
      if (seed !== null) {
        upsert(id, { status: 'ready', seed });
        if (text.trim().length === 0 && seed.title !== undefined) {
          setText(t('ingest.questionFromCitation', { title: seed.title.slice(0, 120) }));
        }
      } else {
        upsert(id, { status: 'failed', errorKey: 'ingest.citationFailed' });
      }
    } else if (kind === 'doi' || kind === 'arxiv') {
      const ok = addIdentifier(pasted);
      if (ok) ev.preventDefault();
    }
  };

  // ---- Zotero picker (real local API; honest unavailable state) ----
  const [zotero, setZotero] = useState<{ open: boolean; status: 'loading' | 'unavailable' | 'ready'; items: ZoteroItem[] }>({ open: false, status: 'loading', items: [] });
  const openZotero = async (): Promise<void> => {
    setZotero({ open: true, status: 'loading', items: [] });
    const controller = new AbortController();
    const items = await fetchZoteroItems(controller.signal);
    setZotero(items === null ? { open: true, status: 'unavailable', items: [] } : { open: true, status: 'ready', items });
  };

  // ---- URL / DOI quick-add row ----
  const [linkInput, setLinkInput] = useState('');

  const canSubmit = !submitting && text.trim().length > 0;

  return (
    <form
      className={`composer${dragActive ? ' composer--drag' : ''}`}
      onSubmit={(e) => void submit(e)}
      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragActive(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        void Promise.all(Array.from(e.dataTransfer.files).map((f) => ingestFile(f)));
      }}
      noValidate
    >
      <label className="field-label" htmlFor="composer-question">
        {t('form.question')} <span aria-hidden="true" className="req">*</span>
      </label>
      <textarea
        id="composer-question"
        ref={questionRef}
        className="composer-input"
        value={text}
        rows={3}
        placeholder={t('form.questionPlaceholder')}
        aria-required="true"
        aria-invalid={showValidationError}
        disabled={submitting}
        autoFocus
        onChange={(e) => { setText(e.target.value); autosize(); }}
        onPaste={(e) => void onPaste(e)}
        onKeyDown={(e) => {
          // IME triple guard (LibreChat useTextarea): Enter submits, Shift+Enter
          // newlines — but never while a CJK IME composition is open.
          if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
          e.preventDefault();
          if (canSubmit) e.currentTarget.form?.requestSubmit();
        }}
      />

      {text.trim().length === 0 && attachments.length === 0 && (
        <div className="example-questions">
          <span className="muted small">{t('form.tryExamples')}</span>
          <div className="example-chips">
            {(['example.q1', 'example.q2', 'example.q3'] as const).map((k) => (
              <button key={k} type="button" className="example-chip" onClick={() => { setText(t(k)); requestAnimationFrame(autosize); }}>
                {t(k).length > 64 ? `${t(k).slice(0, 64)}…` : t(k)}
              </button>
            ))}
          </div>
        </div>
      )}

      {attachments.length > 0 && (
        <ul className="attach-tray" role="list" aria-label={t('composer.attachLabel')}>
          {attachments.map((a) => (
            <li key={a.id} className={`attach-card attach-card--${a.status}`}>
              <span className="attach-icon" aria-hidden="true">
                {a.kind === 'PDF' || a.kind === 'TXT' ? <FileText size={14} /> : a.kind === 'REF' ? <BookMarked size={14} /> : <Link2 size={14} />}
              </span>
              <span className="attach-body">
                <span className="attach-title" title={a.seed.title ?? ''}>
                  {(a.seed.title ?? '').slice(0, 64) || t('ingest.untitled')}
                </span>
                <span className="attach-meta muted small">
                  {a.kind}
                  {a.sizeBytes !== undefined ? ` · ${formatBytes(a.sizeBytes)}` : ''}
                  {a.status === 'parsing' && ` · ${t('composer.parsing')}`}
                  {a.status === 'failed' && ` · ${t(a.errorKey ?? 'ingest.pdfFailed')}`}
                </span>
              </span>
              {a.status === 'parsing' && <Loader2 size={14} className="attach-spinner" aria-hidden="true" />}
              {a.status === 'failed' && a.retry !== undefined && (
                <button type="button" className="attach-action" aria-label={t('composer.retry')} onClick={() => void a.retry?.()}>
                  <RotateCcw size={13} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className="attach-action"
                aria-label={t('composer.remove')}
                onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
          <li className="attach-cap muted small">{t('composer.capCount', { n: attachments.length, max: MAX_SEEDS })}</li>
        </ul>
      )}

      <div className="composer-tools">
        <label className="link-add">
          <span className="link-add-icon" aria-hidden="true"><Link2 size={13} /></span>
          <input
            type="text"
            value={linkInput}
            placeholder={t('composer.addLinkPlaceholder')}
            aria-label={t('composer.addLink')}
            onChange={(e) => setLinkInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (addIdentifier(linkInput)) setLinkInput('');
            }}
          />
          <button
            type="button"
            className="btn btn--sm"
            disabled={linkInput.trim().length === 0 || capReached}
            onClick={() => { if (addIdentifier(linkInput)) setLinkInput(''); }}
          >
            {t('composer.add')}
          </button>
        </label>
        <button type="button" className="btn btn--sm" onClick={() => void openZotero()}>
          <BookMarked size={12} aria-hidden="true" /> {t('ingest.zotero')}
        </button>
        <span className="muted small composer-drop-hint">
          <Paperclip size={12} aria-hidden="true" /> {t('ingest.dropHint')}
        </span>
      </div>
      {dragActive && <p className="composer-drag-note" role="status">{t('composer.dropActive')}</p>}

      {zotero.open && (
        <div className="zotero-picker" role="dialog" aria-label={t('ingest.zotero')}>
          {zotero.status === 'loading' ? (
            <p className="muted small" role="status">{t('ingest.zoteroConnecting')}</p>
          ) : zotero.status === 'unavailable' ? (
            <>
              <p className="muted small">{t('ingest.zoteroUnavailable')}</p>
              <button type="button" className="btn btn--sm" onClick={() => setZotero({ open: false, status: 'loading', items: [] })}>{t('ingest.zoteroClose')}</button>
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
                        if (capReached) { flashNote(t('composer.capReached', { n: MAX_SEEDS })); return; }
                        setAttachments((prev) => [...prev, {
                          id: ++attachSeq, kind: 'REF', status: 'ready',
                          seed: {
                            title: item.title,
                            ...(item.doi !== undefined ? { identifiers: [{ kind: 'doi', value: item.doi }] } : {}),
                            ...(item.year !== undefined ? { year: item.year } : {}),
                            ...(item.creators !== undefined ? { authors: item.creators } : {}),
                          },
                        }]);
                        setZotero({ open: false, status: 'loading', items: [] });
                      }}
                    >
                      <span className="zotero-item-title">{item.title.slice(0, 80)}</span>
                      {item.year !== undefined && <span className="muted small"> ({item.year})</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn--sm" onClick={() => setZotero({ open: false, status: 'loading', items: [] })}>{t('ingest.zoteroClose')}</button>
            </>
          )}
        </div>
      )}

      {showValidationError && <p className="field-error" role="alert">{t('form.questionRequired')}</p>}

      <details className="hero-advanced">
        <summary>{t('form.advanced')}</summary>
        <div className="hero-advanced-body">
          <label className="field-label" htmlFor="composer-domain">{t('form.domain')}</label>
          <input id="composer-domain" type="text" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={t('form.domainPlaceholder')} disabled={submitting} />
          <label className="field-label" htmlFor="composer-goaltype">{t('form.goalType')}</label>
          <select id="composer-goaltype" value={goalType} onChange={(e) => setGoalType(e.target.value)} disabled={submitting}>
            <option value="">{t('goalType.unset')}</option>
            {GOAL_TYPES.map((g) => <option key={g} value={g}>{t(goalTypeKey(g))}</option>)}
          </select>
          <label className="field-label" htmlFor="composer-model">{t('composer.modelLabel')}</label>
          <select id="composer-model" value={providerConfigId} onChange={(e) => setProviderConfigId(e.target.value)} disabled={submitting}>
            <option value="">
              {t('composer.modelDefault')}
              {modelConfigs?.envDefault != null ? `（${modelConfigs.envDefault.name} · ${modelConfigs.envDefault.modelId}）` : ''}
            </option>
            {(modelConfigs?.configs ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}（{c.modelId}）</option>)}
          </select>
        </div>
      </details>

      {error !== null && (
        <p className="field-error" role="alert">
          {t('form.submitFailed')}：{errorText(error)}
          {error.retryable ? `（${t('common.retryable')}）` : ''}
        </p>
      )}
      {note !== null && <p className="muted small" role="status">{note}</p>}

      <div className="composer-actions">
        <button type="submit" className="btn btn--primary composer-submit" disabled={!canSubmit}>
          {submitting ? t('form.submitting') : t('composer.startResearch')}
          {!submitting && <ArrowUp size={14} aria-hidden="true" />}
        </button>
        <span className="hero-hint muted small">{t('composer.enterHint')}</span>
      </div>
      <p aria-live="polite" className="sr-only">{submitting ? t('form.submitting') : ''}</p>
    </form>
  );
}

