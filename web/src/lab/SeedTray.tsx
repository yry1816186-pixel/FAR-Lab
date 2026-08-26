import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { AttachIcon, DISPLAY_KIND, type AttachKind } from '../components/common';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import {
  detectFileKind, detectPasteKind, extractFileText, parseCitation, parseCitationEntries,
  extractIdentifiers, readTextFile, MAX_BINARY_BYTES, MAX_SEEDS, type SeedInput,
} from '../utils/ingest';
import type { ZoteroImportItem } from '../api/types';

/**
 * SeedTray — the ONE ingestion state machine (HX §9.2 unification).
 * Extracted verbatim-semantics from the ResearchComposer attachment machine
 * (parse routes, caps, failure states, retry, Zotero import, paste routing)
 * so every creation surface shares it instead of growing per-surface copies.
 * The tray is honest by construction: every card is a real parse state.
 */

export interface SeedCard {
  id: number;
  seed: SeedInput;
  kind: AttachKind;
  status: 'parsing' | 'ready' | 'failed';
  errorKey?: DictKey;
  sizeBytes?: number;
  /** Projection hit the 50k-char ceiling — shown honestly on the card. */
  truncated?: boolean;
  /** Client-only text parse (no server SDM route for this format). */
  clientParse?: boolean;
  /** Re-runnable parse source so a failed card can retry without re-dropping. */
  retry?: () => Promise<void>;
}

let attachSeq = 0;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export interface SeedTrayApi {
  cards: SeedCard[];
  seeds: SeedInput[];
  note: string | null;
  flash: (msg: string) => void;
  addFiles: (files: File[]) => void;
  addDroppedText: (text: string) => void;
  onPaste: (ev: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  importZotero: (items: ZoteroImportItem[]) => void;
  remove: (id: number) => void;
  retryCard: (id: number) => void;
  clear: () => void;
}

export function useSeedTray(onQuestionSeed?: (title: string) => void): SeedTrayApi {
  const { t } = useI18n();
  const [cards, setCards] = useState<SeedCard[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<number | null>(null);

  const flashNote = useCallback((msg: string): void => {
    setNote(msg);
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 4000);
  }, []);

  useEffect(() => () => { if (noteTimer.current !== null) window.clearTimeout(noteTimer.current); }, []);

  const capReached = cards.length >= MAX_SEEDS;

  const upsert = (id: number, patch: Partial<SeedCard>): void => {
    setCards((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  /** Parse one dropped/selected file into a seed card with honest failure states. */
  const ingestFile = async (file: File): Promise<void> => {
    if (capReached) { flashNote(t('composer.capReached', { n: MAX_SEEDS })); return; }
    const kind = detectFileKind(file.name);
    if (kind === null) { flashNote(t('ingest.unsupported')); return; }
    const display: AttachKind = kind === 'odf' && /\.odp$/i.test(file.name) ? 'SLIDES' : DISPLAY_KIND[kind];
    const binary = kind !== 'text' && kind !== 'ref' && kind !== 'html' && kind !== 'json';
    const id = ++attachSeq;
    setCards((prev) => [...prev, { id, seed: { title: file.name }, kind: display, status: 'parsing', sizeBytes: file.size }]);
    const run = async (): Promise<void> => {
      upsert(id, { status: 'parsing', retry: () => run() });
      try {
        if (kind === 'ref') {
          const content = await readTextFile(file);
          // A dropped .bib/.ris may hold a WHOLE exported library — import every entry.
          const entries = content !== null ? await parseCitationEntries(content) : null;
          if (entries === null || entries.length === 0) { upsert(id, { status: 'failed', errorKey: 'ingest.citationFailed' }); return; }
          const room = Math.max(0, MAX_SEEDS - cards.length - 1); // placeholder occupies one slot
          const kept = entries.slice(0, room);
          if (entries.length > room) flashNote(t('composer.importTruncated', { kept: kept.length, total: entries.length, max: MAX_SEEDS }));
          if (kept.length === 0) { setCards((prev) => prev.filter((a) => a.id !== id)); return; }
          // one atomic swap: the parsing placeholder dissolves into per-entry cards
          setCards((prev) => [
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
          clientParse: extraction.origin === 'client-parse' && (kind === 'docx' || kind === 'slides' || kind === 'odf' || kind === 'epub'),
          seed: { title: file.name.replace(/\.[^.]+$/, ''), text: extraction.text },
        });
      } catch {
        upsert(id, { status: 'failed', errorKey: 'ingest.extractFailed' });
      }
    };
    await run();
  };

  /** Append parsed citation entries as ready REF cards (cap-aware). */
  const importCitationEntries = (entries: { title: string; year?: number; authors: string[]; doi?: string }[], fallbackTitle?: string): number => {
    const room = Math.max(0, MAX_SEEDS - cards.length);
    const kept = entries.slice(0, room);
    if (entries.length > room) flashNote(t('composer.importTruncated', { kept: kept.length, total: entries.length, max: MAX_SEEDS }));
    if (kept.length === 0) return 0;
    setCards((prev) => [...prev, ...kept.map((entry) => ({
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

  /** Batch identifier attach: every recognized DOI/arXiv/URL becomes its own card. */
  const addIdentifiers = (raw: string): { added: number; rest: string[] } => {
    const { found, rest } = extractIdentifiers(raw);
    if (found.length === 0) return { added: 0, rest };
    if (capReached) { flashNote(t('composer.capReached', { n: MAX_SEEDS })); return { added: 0, rest }; }
    const room = MAX_SEEDS - cards.length;
    const kept = found.slice(0, room);
    if (found.length > room) flashNote(t('composer.capReached', { n: MAX_SEEDS }));
    if (kept.length > 0) {
      const kindOf: Record<(typeof kept)[number]['kind'], AttachKind> = { doi: 'DOI', arxiv: 'arXiv', url: 'URL' };
      setCards((prev) => [...prev, ...kept.map((id) => {
        const label = id.kind === 'doi' ? `DOI ${id.value}` : id.kind === 'arxiv' ? `arXiv:${id.value}` : id.value.slice(0, 80);
        return { id: ++attachSeq, kind: kindOf[id.kind], status: 'ready' as const, seed: { identifiers: [{ kind: id.kind, value: id.value }], title: label } };
      })]);
    }
    return { added: kept.length, rest };
  };

  /** Text-drop ingestion (Zotero app drags deliver citation text/URIs, not files). */
  const addDroppedText = async (text: string): Promise<void> => {
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

  /** Paste routing: citations/identifiers become attachments; prose stays the question. */
  const onPaste = async (ev: React.ClipboardEvent<HTMLTextAreaElement>): Promise<void> => {
    const pasted = ev.clipboardData.getData('text/plain');
    if (pasted.trim().length === 0) return;
    const kind = detectPasteKind(pasted);
    if (kind === 'bibtex' || kind === 'ris') {
      ev.preventDefault();
      if (capReached) { flashNote(t('composer.capReached', { n: MAX_SEEDS })); return; }
      const id = ++attachSeq;
      setCards((prev) => [...prev, { id, kind: 'REF', status: 'parsing', seed: { title: '' } }]);
      const seed = await parseCitation(pasted);
      if (seed !== null) {
        upsert(id, { status: 'ready', seed });
        if (seed.title !== undefined) onQuestionSeed?.(seed.title.slice(0, 120));
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

  const importZotero = (imported: ZoteroImportItem[]): void => {
    const room = MAX_SEEDS - cards.length;
    if (imported.length > room) flashNote(t('composer.capReached', { n: MAX_SEEDS }));
    const slice = imported.slice(0, Math.max(0, room));
    if (slice.length === 0) return;
    setCards((prev) => [...prev, ...slice.map((it) => {
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

  const seeds = cards.filter((a) => a.status === 'ready').map((a) => a.seed).slice(0, MAX_SEEDS);

  return {
    cards,
    seeds,
    note,
    flash: flashNote,
    addFiles: (files) => { void Promise.all(files.map((f) => ingestFile(f))); },
    addDroppedText: (text) => { void addDroppedText(text); },
    onPaste: (ev) => { void onPaste(ev); },
    importZotero,
    remove: (id) => setCards((prev) => prev.filter((a) => a.id !== id)),
    retryCard: (id) => {
      const card = cards.find((a) => a.id === id);
      if (card?.retry !== undefined) void card.retry();
    },
    clear: () => setCards([]),
  };
}

/** Card row for a parsed seed — real parse states only, never decorative. */
export function SeedCardRow({ card, onRemove, onRetry }: { card: SeedCard; onRemove: (id: number) => void; onRetry: (id: number) => void }): JSX.Element {
  const { t } = useI18n();
  const title = card.seed.title ?? t('ingest.untitled');
  return (
    <div className={`seed-card st-${card.status}`}>
      <AttachIcon kind={card.kind} size={14} />
      <span className="seed-card-main">
        <span className="seed-card-title" title={title}>{title}</span>
        <span className="seed-card-meta">
          {card.status === 'parsing' && t('seed.parsing')}
          {card.status === 'ready' && (card.sizeBytes !== undefined ? formatBytes(card.sizeBytes) : t('seed.ready'))}
          {card.status === 'ready' && card.truncated === true && ` · ${t('seed.truncated')}`}
          {card.status === 'ready' && card.clientParse === true && ` · ${t('seed.clientParse')}`}
          {card.status === 'failed' && t(card.errorKey ?? 'ingest.extractFailed')}
        </span>
      </span>
      {card.status === 'failed'
        ? <button type="button" className="seed-card-x" onClick={() => onRetry(card.id)} aria-label={t('seed.retry')} title={t('seed.retry')}><RotateCcw size={12} aria-hidden="true" /></button>
        : null}
      <button type="button" className="seed-card-x" onClick={() => onRemove(card.id)} aria-label={t('seed.remove')} title={t('seed.remove')}><X size={12} aria-hidden="true" /></button>
    </div>
  );
}

export const TRAY_MAX_SEEDS = MAX_SEEDS;
