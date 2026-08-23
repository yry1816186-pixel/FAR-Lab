import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp, BookMarked, Check, FileText, Link2, Loader2, Paperclip, RotateCcw, Settings, SlidersHorizontal, Sparkles, X,
} from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import { errorText } from './common';
import { useCreateRun } from '../hooks/useCreateRun';
import { listModelConfigs } from '../api/endpoints';
import type { ModelConfigsResponse, ZoteroLibItem } from '../api/types';
import { ZoteroPanel } from './ZoteroPanel';
import {
  detectPasteKind, parseCitation, parseCitationEntries, extractPdfText, readTextFile,
  extractDoi, extractArxivId, MAX_SEEDS, type SeedInput,
} from '../utils/ingest';

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
 * Research Composer (HX2 v2) — single card in the ChatGPT/LibreChat composer
 * form (Scout A): borderless auto-grow input inside one surface, attachment
 * row above it, tool rail at the bottom (add files / link / Zotero / model /
 * round send). Every attachment state is a real parse state; nothing is
 * decorative. Enter submits with the IME triple guard; Shift+Enter newlines.
 */
export function ResearchComposer({
  onCreated,
  onOpenSettings,
}: {
  onCreated: (runId: string) => void;
  /** Opens the model-management dialog from the model picker's manage entry. */
  onOpenSettings: () => void;
}): JSX.Element {
  const { t } = useI18n();
  // domain/goalType stay in the createRun machine (API capability for
  // CLI/advanced callers) but are deliberately NOT surfaced here — the scope
  // model decides them (decision allocation, user directive 2026-08-23).
  const { text, setText, providerConfigId, setProviderConfigId,
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

  // ---- model configs (fetched on mount + refreshed whenever the picker opens) ----
  const [modelConfigs, setModelConfigs] = useState<ModelConfigsResponse | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    listModelConfigs(controller.signal).then(setModelConfigs).catch(() => { /* stays on default */ });
    return () => controller.abort();
  }, [modelMenuOpen]);
  const selectedModel = providerConfigId !== ''
    ? modelConfigs?.configs.find((c) => c.id === providerConfigId)
    : undefined;
  const modelChip = selectedModel !== undefined
    ? `${selectedModel.label}`
    : modelConfigs?.envDefault != null
      ? `${modelConfigs.envDefault.name} · ${modelConfigs.envDefault.modelId}`
      : t('composer.modelDefault');

  // ---- model picker dismissal: outside click or Escape (selection closes inline) ----
  useEffect(() => {
    if (!modelMenuOpen) return undefined;
    const onDocClick = (ev: MouseEvent): void => {
      if (ev.target instanceof Element && ev.target.closest('.model-menu, .composer2-tool--model') === null) {
        setModelMenuOpen(false);
      }
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') setModelMenuOpen(false);
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [modelMenuOpen]);

  // ---- auto-grow question textarea ----
  const questionRef = useRef<HTMLTextAreaElement | null>(null);
  const autosize = (): void => {
    const el = questionRef.current;
    if (el === null) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  };

  // ---- drop-zone visual state (whole card is the target) ----
  const [dragActive, setDragActive] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
          // A dropped .bib/.ris may hold a WHOLE exported library — import every entry.
          const entries = content !== null ? await parseCitationEntries(content) : null;
          if (entries === null || entries.length === 0) { upsert(id, { status: 'failed', errorKey: 'ingest.citationFailed' }); return; }
          const room = Math.max(0, MAX_SEEDS - attachments.length - 1); // placeholder occupies one slot
          const kept = entries.slice(0, room);
          if (entries.length > room) flashNote(t('composer.importTruncated', { kept: kept.length, total: entries.length, max: MAX_SEEDS }));
          if (kept.length === 0) { setAttachments((prev) => prev.filter((a) => a.id !== id)); return; }
          // one atomic swap: the parsing placeholder dissolves into per-entry cards
          setAttachments((prev) => [
            ...prev.filter((a) => a.id !== id),
            ...kept.map((entry) => ({
              id: ++attachSeq,
              kind: 'REF' as AttachKind,
              status: 'ready' as const,
              sizeBytes: file.size,
              seed: {
                title: entry.title.length > 0 ? entry.title : file.name,
                ...(entry.doi !== undefined ? { identifiers: [{ kind: 'doi' as const, value: entry.doi }] } : {}),
                ...(entry.year !== undefined ? { year: entry.year } : {}),
                ...(entry.authors.length > 0 ? { authors: entry.authors } : {}),
              },
            })),
          ]);
          return;
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

  // ---- Zotero picker (full-library search + relation graph; real local API via server bridge) ----
  const [zoteroOpen, setZoteroOpen] = useState(false);
  const importZotero = (imported: ZoteroLibItem[]): void => {
    const room = MAX_SEEDS - attachments.length;
    if (imported.length > room) flashNote(t('composer.capReached', { n: MAX_SEEDS }));
    const slice = imported.slice(0, Math.max(0, room));
    if (slice.length === 0) return;
    setAttachments((prev) => [...prev, ...slice.map((it) => ({
      id: ++attachSeq,
      kind: 'REF' as AttachKind,
      status: 'ready' as const,
      seed: {
        title: it.title,
        ...(it.doi !== undefined ? { identifiers: [{ kind: 'doi' as const, value: it.doi }] }
          : it.url !== undefined ? { identifiers: [{ kind: 'url' as const, value: it.url }] } : {}),
        ...(it.year !== undefined ? { year: it.year } : {}),
        ...(it.creators.length > 0 ? { authors: it.creators } : {}),
      },
    }))]);
  };

  const canSubmit = !submitting && text.trim().length > 0;

  return (
    <form
      className={`composer2${dragActive ? ' composer2--drag' : ''}`}
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
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.bib,.ris,.txt,.md"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          void Promise.all(Array.from(e.target.files ?? []).map((f) => ingestFile(f)));
          e.target.value = '';
        }}
      />

      {dragActive && <p className="composer-drag-note" role="status">{t('composer.dropActive')}</p>}

      <div className="composer2-card">
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

        <textarea
          id="composer-question"
          ref={questionRef}
          className="composer2-input"
          value={text}
          rows={2}
          placeholder={t('form.questionPlaceholder')}
          aria-label={t('form.question')}
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

        <div className="composer2-tools">
          <button type="button" className="composer2-tool" onClick={() => fileInputRef.current?.click()} disabled={capReached} title={t('ingest.dropHint')}>
            <Paperclip size={15} aria-hidden="true" />
            <span>{t('composer.addFiles')}</span>
          </button>
          <button
            type="button"
            className={`composer2-tool${linkOpen ? ' composer2-tool--active' : ''}`}
            aria-expanded={linkOpen}
            onClick={() => setLinkOpen((v) => !v)}
          >
            <Link2 size={15} aria-hidden="true" />
            <span>{t('composer.addLink')}</span>
          </button>
          <button type="button" className="composer2-tool" onClick={() => setZoteroOpen(true)}>
            <BookMarked size={15} aria-hidden="true" />
            <span>Zotero</span>
          </button>
          <span className="composer2-spacer" />
          <button
            type="button"
            className={`composer2-tool composer2-tool--model${modelMenuOpen ? ' composer2-tool--active' : ''}`}
            aria-haspopup="menu"
            aria-expanded={modelMenuOpen}
            onClick={() => setModelMenuOpen((v) => !v)}
            title={t('composer.modelLabel')}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            <span className="mono">{modelChip}</span>
          </button>
          <button
            type="submit"
            className="composer2-send"
            disabled={!canSubmit}
            aria-label={t('composer.startResearch')}
            title={t('composer.enterHint')}
          >
            {submitting ? <Loader2 size={16} className="attach-spinner" aria-hidden="true" /> : <ArrowUp size={16} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {linkOpen && (
        <div className="link-add" role="group" aria-label={t('composer.addLink')}>
          <span className="link-add-icon" aria-hidden="true"><Link2 size={13} /></span>
          <input
            type="text"
            value={linkInput}
            placeholder={t('composer.addLinkPlaceholder')}
            aria-label={t('composer.addLink')}
            autoFocus
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
        </div>
      )}

      <ZoteroPanel
        open={zoteroOpen}
        onClose={() => setZoteroOpen(false)}
        onImport={importZotero}
        remaining={MAX_SEEDS - attachments.length}
      />

      {modelMenuOpen && (
        <div className="model-menu" role="menu" aria-label={t('composer.modelLabel')}>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={providerConfigId === ''}
            className={`model-option${providerConfigId === '' ? ' model-option--on' : ''}`}
            disabled={submitting}
            onClick={() => { setProviderConfigId(''); setModelMenuOpen(false); }}
          >
            <span className="model-option-glyph" aria-hidden="true">
              {providerConfigId === '' && <Check size={13} />}
            </span>
            <span className="model-option-main">
              <span className="model-option-name">{t('composer.modelDefault')}</span>
              {modelConfigs?.envDefault != null && (
                <span className="model-option-meta mono">{modelConfigs.envDefault.name} · {modelConfigs.envDefault.modelId}</span>
              )}
            </span>
            <span className="badge">{t('composer.modelEnvBadge')}</span>
          </button>
          {(modelConfigs?.configs ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitemradio"
              aria-checked={providerConfigId === c.id}
              className={`model-option${providerConfigId === c.id ? ' model-option--on' : ''}`}
              disabled={submitting}
              onClick={() => { setProviderConfigId(c.id); setModelMenuOpen(false); }}
            >
              <span className="model-option-glyph" aria-hidden="true">
                {providerConfigId === c.id && <Check size={13} />}
              </span>
              <span className="model-option-main">
                <span className="model-option-name">{c.label}</span>
                <span className="model-option-meta mono">{c.modelId}</span>
              </span>
              {!c.apiKeySet && <span className="badge badge--err">{t('settings.noKey')}</span>}
            </button>
          ))}
          {(modelConfigs?.configs ?? []).length === 0 && (
            <p className="model-menu-empty muted small">{t('composer.modelEmpty')}</p>
          )}
          <div className="model-menu-foot">
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => { setModelMenuOpen(false); onOpenSettings(); }}
            >
              <Settings size={12} aria-hidden="true" /> {t('composer.modelManage')}
            </button>
          </div>
        </div>
      )}

      {showValidationError && <p className="field-error" role="alert">{t('form.questionRequired')}</p>}
      {error !== null && (
        <p className="field-error" role="alert">
          {t('form.submitFailed')}：{errorText(error)}
          {error.retryable ? `（${t('common.retryable')}）` : ''}
        </p>
      )}
      {note !== null && <p className="muted small" role="status">{note}</p>}

      {/* Decision allocation (user directive 2026-08-23): domain and goal type
          are NOT user inputs — the scope stage's model analyzes the question
          and decides (verified: 84/84 real runs carry an inferred domain and
          goalType; prompt schema enforces both). The researcher sees the
          decision on the research page and can correct it through the
          feedback→revision chain, not through an intake form. */}
      <p className="muted small composer-auto-note">
        <Sparkles size={12} aria-hidden="true" /> {t('composer.autoScope')}
      </p>
      <p aria-live="polite" className="sr-only">{submitting ? t('form.submitting') : ''}</p>
    </form>
  );
}
