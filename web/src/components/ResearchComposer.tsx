import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp, BookMarked, Check, Link2, Loader2, Paperclip, RotateCcw, Settings, SlidersHorizontal, Sparkles, X,
} from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import { AttachIcon, DISPLAY_KIND, errorText, type AttachKind } from './common';
import { useConversationStart } from '../hooks/useConversationStart';
import { listModelConfigs } from '../api/endpoints';
import type { ModelConfigsResponse, ZoteroImportItem } from '../api/types';
import { ZoteroPanel } from './ZoteroPanel';
import { DictationButton } from './DictationButton';
import { insertAtCaret } from '../dictation/audio';
import {
  detectFileKind, detectPasteKind, extractFileText, parseCitation, parseCitationEntries,
  extractIdentifiers, readTextFile, MAX_BINARY_BYTES, MAX_SEEDS, type SeedInput,
} from '../utils/ingest';

interface Attachment {
  id: number;
  seed: SeedInput;
  kind: AttachKind;
  status: 'parsing' | 'ready' | 'failed';
  errorKey?: DictKey;
  sizeBytes?: number;
  /** Projection hit the 50k-char ceiling — shown honestly on the card. */
  truncated?: boolean;
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
 * Research Composer (HX2 v3, conversation-first) — single card in the
 * ChatGPT/LibreChat composer form: attachment row, auto-grow input, tool rail
 * (files / link / Zotero / model / round send). Submitting now OPENS a
 * brainstorming conversation (first message + materials); research runs are
 * launched from inside the conversation, not from here. Every attachment
 * state is a real parse state; nothing is decorative. Enter submits with the
 * IME triple guard; Shift+Enter newlines.
 */
export function ResearchComposer({
  onCreated,
  onOpenSettings,
}: {
  /** Receives the id of the conversation this composer just opened. */
  onCreated: (conversationId: string) => void;
  /** Opens the model-management dialog from the model picker's manage entry. */
  onOpenSettings: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const { text, setText, providerConfigId, setProviderConfigId,
    showValidationError, submitting, error, startConversation, setSeeds } = useConversationStart(onCreated);

  // ---- attachments: local authority, projected into the conversation machine ----
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  useEffect(() => {
    setSeeds(attachments.filter((a) => a.status === 'ready').map((a) => a.seed).slice(0, MAX_SEEDS));
    // setSeeds is a stable useState setter; projection only runs on tray changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments]);

  // TIS user commands: palette inserts land here when the welcome composer is
  // the mounted input surface (same DOM-event contract as ConversationView).
  // setText is a plain setter (no functional updates), so the listener re-arms
  // on every text change to always see the current value.
  useEffect(() => {
    const onInsert = (e: Event): void => {
      const detail = (e as CustomEvent<{ text?: unknown }>).detail;
      if (typeof detail?.text !== 'string' || detail.text.length === 0) return;
      setText(text.trim().length > 0 ? `${text}\n${detail.text}` : detail.text);
    };
    window.addEventListener('far:insert-text', onInsert);
    return () => window.removeEventListener('far:insert-text', onInsert);
  }, [setText, text]);

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
    const kind = detectFileKind(file.name);
    if (kind === null) { flashNote(t('ingest.unsupported')); return; }
    const display: AttachKind = kind === 'odf' && /\.odp$/i.test(file.name) ? 'SLIDES' : DISPLAY_KIND[kind];
    const binary = kind !== 'text' && kind !== 'ref' && kind !== 'html' && kind !== 'json';
    const id = ++attachSeq;
    setAttachments((prev) => [...prev, { id, seed: { title: file.name }, kind: display, status: 'parsing', sizeBytes: file.size }]);
    const run = async (): Promise<void> => {
      upsert(id, { status: 'parsing', retry: () => run() });
      try {
        if (kind === 'ref') {
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
        }
        if (binary && file.size > MAX_BINARY_BYTES) { upsert(id, { status: 'failed', errorKey: 'ingest.tooLarge' }); return; }
        if (kind === 'text') {
          if (file.size > 1_048_576) { upsert(id, { status: 'failed', errorKey: 'ingest.tooLarge' }); return; }
          const content = await readTextFile(file);
          if (content === null || content.trim().length === 0) { upsert(id, { status: 'failed', errorKey: 'ingest.extractFailed' }); return; }
          upsert(id, { status: 'ready', seed: { title: file.name, text: content } });
          return;
        }
        const extraction = await extractFileText(file, kind);
        if (extraction === null) {
          upsert(id, { status: 'failed', errorKey: kind === 'pdf' ? 'ingest.pdfFailed' : 'ingest.extractFailed' });
          return;
        }
        upsert(id, {
          status: 'ready',
          truncated: extraction.truncated,
          seed: { title: file.name.replace(/\.[^.]+$/, ''), text: extraction.text },
        });
      } catch {
        upsert(id, { status: 'failed', errorKey: 'ingest.extractFailed' });
      }
    };
    await run();
  };

  /** Append parsed citation entries as ready REF cards (cap-aware, returns added count). */
  const importCitationEntries = (entries: { title: string; year?: number; authors: string[]; doi?: string }[], fallbackTitle?: string): number => {
    const room = Math.max(0, MAX_SEEDS - attachments.length);
    const kept = entries.slice(0, room);
    if (entries.length > room) flashNote(t('composer.importTruncated', { kept: kept.length, total: entries.length, max: MAX_SEEDS }));
    if (kept.length === 0) return 0;
    setAttachments((prev) => [...prev, ...kept.map((entry) => ({
      id: ++attachSeq,
      kind: 'REF' as AttachKind,
      status: 'ready' as const,
      seed: {
        title: entry.title.length > 0 ? entry.title : (fallbackTitle ?? t('ingest.untitled')),
        ...(entry.doi !== undefined ? { identifiers: [{ kind: 'doi' as const, value: entry.doi }] } : {}),
        ...(entry.year !== undefined ? { year: entry.year } : {}),
        ...(entry.authors.length > 0 ? { authors: entry.authors } : {}),
      },
    }))]);
    return kept.length;
  };

  /** Batch identifier attach: adds every recognized DOI/arXiv/URL as its own card. */
  const addIdentifiers = (raw: string): { added: number; rest: string[] } => {
    const { found, rest } = extractIdentifiers(raw);
    if (found.length === 0) return { added: 0, rest };
    if (capReached) { flashNote(t('composer.capReached', { n: MAX_SEEDS })); return { added: 0, rest }; }
    const room = MAX_SEEDS - attachments.length;
    const kept = found.slice(0, room);
    if (found.length > room) flashNote(t('composer.capReached', { n: MAX_SEEDS }));
    if (kept.length > 0) {
      const kindOf: Record<(typeof kept)[number]['kind'], AttachKind> = { doi: 'DOI', arxiv: 'arXiv', url: 'URL' };
      setAttachments((prev) => [...prev, ...kept.map((id) => {
        const label = id.kind === 'doi' ? `DOI ${id.value}` : id.kind === 'arxiv' ? `arXiv:${id.value}` : id.value.slice(0, 80);
        return { id: ++attachSeq, kind: kindOf[id.kind], status: 'ready' as const, seed: { identifiers: [{ kind: id.kind, value: id.value }], title: label } };
      })]);
    }
    return { added: kept.length, rest };
  };

  /** Multi-link submit: recognize every DOI/arXiv/URL, keep unrecognized text for fixing. */
  const submitLinks = (): void => {
    const { added, rest } = addIdentifiers(linkInput);
    if (added > 0) {
      flashNote(t('composer.linksAdded', { n: added }) + (rest.length > 0 ? ` · ${t('composer.linksSkipped', { n: rest.length })}` : ''));
      setLinkInput(rest.join(' '));
    } else if (rest.length > 0 || linkInput.trim().length > 0) {
      flashNote(t('composer.invalidLink'));
    }
  };

  /**
   * Text-drop ingestion (external drags often carry no files at all — e.g.
   * dragging items out of the Zotero app delivers citation text/URIs only).
   */
  const ingestDroppedText = async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (trimmed.length === 0) { flashNote(t('composer.invalidLink')); return; }
    const kind = detectPasteKind(trimmed);
    if (kind === 'bibtex' || kind === 'ris') {
      const entries = await parseCitationEntries(trimmed);
      if (entries !== null && entries.length > 0) {
        importCitationEntries(entries);
        return;
      }
    }
    const { added } = addIdentifiers(trimmed);
    if (added === 0) flashNote(t('composer.invalidLink'));
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
    } else {
      // pure identifier paste (every fragment is a DOI/arXiv/URL): attach all
      const { found, rest } = extractIdentifiers(pasted);
      if (found.length > 0 && rest.length === 0) {
        ev.preventDefault();
        const { added } = addIdentifiers(pasted);
        if (added > 0) flashNote(t('composer.linksAdded', { n: added }));
      }
      // mixed prose+links stays in the question (no surprise attachments)
    }
  };

  // ---- Zotero picker (full-library search + relation graph; real local API via server bridge) ----
  const [zoteroOpen, setZoteroOpen] = useState(false);
  const importZotero = (imported: ZoteroImportItem[]): void => {
    const room = MAX_SEEDS - attachments.length;
    if (imported.length > room) flashNote(t('composer.capReached', { n: MAX_SEEDS }));
    const slice = imported.slice(0, Math.max(0, room));
    if (slice.length === 0) return;
    setAttachments((prev) => [...prev, ...slice.map((it) => {
      // Researcher annotations are critical-reading gold: they ride along as seed
      // text so hypothesis generation sees WHY the researcher flagged this paper.
      const notes = (it.annotations ?? [])
        .map((a, i) => {
          const parts = [a.text, a.comment].filter((x): x is string => x !== undefined);
          return parts.length > 0 ? `[研究者注释 ${i + 1}] ${parts.join(' — ')}` : '';
        })
        .filter((s) => s.length > 0)
        .join('\n');
      return {
        id: ++attachSeq,
        kind: 'REF' as AttachKind,
        status: 'ready' as const,
        seed: {
          title: it.title,
          ...(it.doi !== undefined ? { identifiers: [{ kind: 'doi' as const, value: it.doi }] }
            : it.url !== undefined ? { identifiers: [{ kind: 'url' as const, value: it.url }] } : {}),
          ...(it.year !== undefined ? { year: it.year } : {}),
          ...(it.creators.length > 0 ? { authors: it.creators } : {}),
          ...(notes.length > 0 ? { text: notes } : {}),
        },
      };
    })]);
  };

  const canSubmit = !submitting && text.trim().length > 0;

  return (
    <form
      className={`composer2${dragActive ? ' composer2--drag' : ''}`}
      onSubmit={(e) => { e.preventDefault(); void startConversation(); }}
      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragActive(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
          void Promise.all(files.map((f) => ingestFile(f)));
          return;
        }
        // OS/app drags without files (e.g. Zotero item drag) carry text/URIs
        const dropped = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
        if (dropped.trim().length > 0) void ingestDroppedText(dropped);
      }}
      noValidate
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.bib,.ris,.txt,.md,.docx,.xlsx,.xls,.csv,.tsv,.ods,.pptx,.odt,.odp,.html,.htm,.json,.epub"
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
                  <AttachIcon kind={a.kind} />
                </span>
                <span className="attach-body">
                  <span className="attach-title" title={a.seed.title ?? ''}>
                    {(a.seed.title ?? '').slice(0, 64) || t('ingest.untitled')}
                  </span>
                  <span className="attach-meta muted small">
                    {a.kind}
                    {a.sizeBytes !== undefined ? ` · ${formatBytes(a.sizeBytes)}` : ''}
                    {a.status === 'parsing' && ` · ${t('composer.parsing')}`}
                    {a.status === 'ready' && a.truncated && ` · ${t('ingest.truncated')}`}
                    {a.status === 'failed' && ` · ${t(a.errorKey ?? 'ingest.extractFailed')}`}
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
          <DictationButton
            onTranscribed={(fragment) => {
              const el = questionRef.current;
              const caret = el?.selectionStart ?? text.length;
              const next = insertAtCaret(text, fragment, caret);
              setText(next.value);
              requestAnimationFrame(() => {
                el?.focus();
                el?.setSelectionRange(next.caret, next.caret);
                autosize();
              });
            }}
            onError={flashNote}
          />
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
              submitLinks();
            }}
          />
          <button
            type="button"
            className="btn btn--sm"
            disabled={linkInput.trim().length === 0 || capReached}
            onClick={submitLinks}
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
