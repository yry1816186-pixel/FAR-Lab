import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import type { SearchResponse } from '../api/types';

/**
 * Command palette (S5): the keyboard-first action hub — Linear/Raycast/VS Code
 * pattern, absent from the entire scientific-software category (competitive
 * research 2026-08-22). Every command maps to a REAL capability; dead entries
 * are forbidden (PRODUCT_HCI §2). Ctrl/Cmd+K opens, arrows navigate, Enter
 * runs, Esc closes.
 *
 * B2 universal search: queries of 2+ chars additionally hit
 * `GET /api/v1/search` (debounced) so the palette finds any run by its
 * question, any hypothesis by its statement, any claim by its text — across
 * the whole workspace, not just recent runs. Search failures render as a
 * single honest error line, never as silent emptiness.
 *
 * B2-critique hardening: focus is restored to the pre-dialog owner on close;
 * the listbox options are flat (group labels are presentational rows, no
 * nested interactive elements); Tab is contained inside the dialog; index
 * clamping happens inside the key handlers (no async-race double-steps).
 */

export interface Command {
  id: string;
  /** Static i18n label OR a dynamic label (e.g. a run's question text). */
  labelKey?: DictKey;
  label?: string;
  groupKey: DictKey;
  /** Extra match hints (e.g. english synonyms for zh labels). */
  keywords?: string;
  run: () => void;
}

export interface PaletteSearch {
  fetch: (q: string, signal: AbortSignal) => Promise<SearchResponse>;
  navigate: {
    run: (runId: string) => void;
    hypothesis: (runId: string) => void;
    claim: (runId: string, claimId: string) => void;
  };
}

interface Row {
  key: string;
  groupLabel: string;
  text: string;
  /** FTS snippet with «» markers (D-101) — rendered with hit emphasis. */
  snippet?: string;
  /** Secondary line (e.g. object id for search hits) — muted, never primary. */
  hint?: string;
  execute: () => void;
}

const SEARCH_DEBOUNCE_MS = 220;
const MAX_LABEL = 96;

export function CommandPalette({
  open,
  onClose,
  commands,
  search,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  search?: PaletteSearch;
}): JSX.Element | null {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [searchError, setSearchError] = useState(false);
  const listRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      setResults(null);
      setSearchError(false);
      // Focus must return to the element that owned it before the dialog
      // opened (WCAG 2.4.3); a modal dialog never strands keyboard users.
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // focus after paint so the input exists
      window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => {
        restoreFocusRef.current?.focus();
        restoreFocusRef.current = null;
      };
    }
    return undefined;
  }, [open]);

  // Debounced cross-run search (B2). Aborts the in-flight request on every
  // requery and on close; results older than the current query are dropped.
  useEffect(() => {
    const needle = query.trim();
    if (!open || search === undefined || needle.length < 2) {
      setResults(null);
      setSearchError(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      search.fetch(needle, controller.signal)
        .then((r) => { setResults(r); setSearchError(false); })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          setResults(null);
          setSearchError(true);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, search]);

  const labelOf = (c: Command): string => c.label ?? (c.labelKey !== undefined ? t(c.labelKey) : c.id);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return commands;
    return commands.filter((c) => {
      const hay = `${labelOf(c)} ${t(c.groupKey)} ${c.keywords ?? ''}`.toLowerCase();
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labelOf closes over t only
  }, [commands, query, t]);

  const clip = (s: string): string => (s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL)}…` : s);

  const rows = useMemo<Row[]>(() => {
    const cmdRows: Row[] = filtered.map((c) => ({
      key: c.id,
      groupLabel: t(c.groupKey),
      text: labelOf(c),
      execute: c.run,
    }));
    if (search === undefined || query.trim().length < 2) return cmdRows;
    const hitRows = (hits: SearchResponse['questions'], groupLabel: string, execute: (hit: SearchResponse['questions'][number]) => void): Row[] =>
      hits.map((h) => ({
        key: `${groupLabel}-${h.id}`, groupLabel,
        text: clip(h.text),
        ...(h.snippet !== undefined ? { snippet: clip(h.snippet) } : {}),
        hint: h.id,
        execute: () => execute(h),
      }));
    return [
      ...cmdRows,
      ...hitRows(results?.questions ?? [], t('palette.searchRuns'), (h) => search.navigate.run(h.runId)),
      ...hitRows(results?.hypotheses ?? [], t('palette.searchHypotheses'), (h) => search.navigate.hypothesis(h.runId)),
      ...hitRows(results?.claims ?? [], t('palette.searchClaims'), (h) => search.navigate.claim(h.runId, h.id)),
    ];
  }, [filtered, query, results, search, t]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  // Clamp inside the handlers themselves: async rows changes between
  // keystrokes must never let a stale index double-step or fall out of range.
  const move = (delta: number): void => {
    setIndex((i) => Math.max(0, Math.min(i + delta, rows.length - 1)));
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      // IME guard (ported from cmdk v1.1.1): while a Chinese/Japanese/Korean
      // composition is in progress, Enter confirms the composition — it must
      // NOT execute the highlighted row (the classic double-trigger bug).
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        move(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const row = rows[Math.min(index, rows.length - 1)];
        if (row !== undefined) {
          onClose();
          row.execute();
        }
      } else if (e.key === 'Tab') {
        // Modal containment: the input is the only tabbable element inside the
        // dialog; keep Tab from escaping onto browser chrome.
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, rows, index, onClose]);

  if (!open) return null;

  let lastGroup = '';

  const renderGroupLabel = (label: string): React.ReactNode => (
    <li key={`g-${label}`} role="presentation" className="palette-group muted small">{label}</li>
  );
  const renderRow = (row: Row, i: number): React.ReactNode => {
    const nodes: React.ReactNode[] = [];
    if (row.groupLabel !== lastGroup) {
      nodes.push(renderGroupLabel(row.groupLabel));
      lastGroup = row.groupLabel;
    }
    nodes.push(
      <li
        key={row.key}
        role="option"
        aria-selected={i === index}
        className={`palette-option${i === index ? ' palette-option--active' : ''}`}
        onMouseEnter={() => setIndex(i)}
        onClick={() => { onClose(); row.execute(); }}
      >
        <span className="palette-item-text">
          {row.snippet !== undefined
            ? row.snippet.split(/(«[^»]*»)/g).map((part, i) =>
                part.startsWith('«') && part.endsWith('»')
                  ? <mark key={i} className="palette-hit">{part.slice(1, -1)}</mark>
                  : <span key={i}>{part}</span>)
            : row.text}
        </span>
        {row.hint !== undefined && <span className="palette-item-hint muted small">{row.hint}</span>}
      </li>,
    );
    return nodes;
  };

  const searching = search !== undefined && query.trim().length >= 2;

  return (
    <div className="palette-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('palette.title')}>
        <input
          ref={inputRef}
          type="text"
          className="palette-input"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
          placeholder={t('palette.placeholder')}
          aria-label={t('palette.placeholder')}
          aria-controls="palette-listbox"
        />
        {rows.length === 0 ? (
          searching && searchError ? (
            <p className="palette-empty" role="alert">{t('palette.searchError')}</p>
          ) : searching ? (
            <p className="palette-empty muted">{t('palette.searchEmpty')}</p>
          ) : (
            <p className="palette-empty muted">{t('palette.empty')}</p>
          )
        ) : (
          <ul ref={listRef} id="palette-listbox" role="listbox" aria-label={t('palette.title')} className="palette-list">
            {rows.flatMap(renderRow)}
          </ul>
        )}
        <p className="palette-hint muted small">{t('palette.hint')}</p>
      </div>
    </div>
  );
}
