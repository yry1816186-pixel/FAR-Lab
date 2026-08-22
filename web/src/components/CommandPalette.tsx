import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';

/**
 * Command palette (S5): the keyboard-first action hub — Linear/Raycast/VS Code
 * pattern, absent from the entire scientific-software category (competitive
 * research 2026-08-22). Every command maps to a REAL capability; dead entries
 * are forbidden (PRODUCT_HCI §2). Ctrl/Cmd+K opens, arrows navigate, Enter
 * runs, Esc closes.
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

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}): JSX.Element | null {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      // focus after paint so the input exists
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

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

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[index];
        if (cmd !== undefined) {
          onClose();
          cmd.run();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, filtered, index, onClose]);

  if (!open) return null;

  let lastGroup = '';
  const renderRow = (cmd: Command, i: number): ReactNode => {
    const groupLabel = t(cmd.groupKey);
    const showGroup = groupLabel !== lastGroup;
    lastGroup = groupLabel;
    return (
      <li key={cmd.id} role="option" aria-selected={i === index}>
        {showGroup && <div className="palette-group muted small">{groupLabel}</div>}
        <button
          type="button"
          className={`palette-item${i === index ? ' palette-item--active' : ''}`}
          onMouseEnter={() => setIndex(i)}
          onClick={() => { onClose(); cmd.run(); }}
        >
          {labelOf(cmd)}
        </button>
      </li>
    );
  };

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
        />
        {filtered.length === 0 ? (
          <p className="palette-empty muted">{t('palette.empty')}</p>
        ) : (
          <ul ref={listRef} role="listbox" aria-label={t('palette.title')} className="palette-list">
            {filtered.map(renderRow)}
          </ul>
        )}
        <p className="palette-hint muted small">{t('palette.hint')}</p>
      </div>
    </div>
  );
}
