import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Command, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { ALL_NAV_ITEMS } from '@/components/layout/navigation';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Keyboard-first command center. It intentionally exposes navigation only:
 * every result maps to an existing route, so no control can imply unsupported
 * mutations or backend capabilities.
 */
export function CommandCenter() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (needle.length === 0) return ALL_NAV_ITEMS;
    return ALL_NAV_ITEMS.filter((item) => {
      const translated = t(item.labelKey).toLocaleLowerCase();
      return translated.includes(needle) || item.keywords.some((keyword) => keyword.includes(needle));
    });
  }, [query, t]);

  useEffect(() => {
    function onGlobalKeyDown(event: globalThis.KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    document.addEventListener('keydown', onGlobalKeyDown);
    return () => document.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => triggerRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(results.length - 1, 0)));
  }, [results.length]);

  function go(path: string): void {
    setOpen(false);
    navigate(path);
  }

  function onDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Tab') {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable !== undefined && focusable.length > 0) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && active === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter' && results[activeIndex] !== undefined) {
      event.preventDefault();
      go(results[activeIndex].to);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="hidden min-h-9 items-center gap-2 rounded-md border bg-background px-2.5 text-xs text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground lg:inline-flex"
        aria-label={t('nav.commandCenter')}
        title={t('nav.commandCenter')}
        data-testid="command-center-trigger"
      >
        <Command className="h-4 w-4" aria-hidden="true" />
        <span>{t('nav.commandCenter')}</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘/Ctrl K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-foreground/20 px-4 pt-[12vh] backdrop-blur-[1px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-center-title"
            className="w-full max-w-xl overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
            onKeyDown={onDialogKeyDown}
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <label id="command-center-title" className="sr-only" htmlFor="command-center-search">
                {t('nav.commandCenter')}
              </label>
              <input
                ref={inputRef}
                id="command-center-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder={t('nav.commandPlaceholder')}
                role="combobox"
                aria-expanded="true"
                aria-controls="command-center-results"
                aria-activedescendant={results[activeIndex] !== undefined ? `command-option-${activeIndex}` : undefined}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('nav.closeCommandCenter')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div id="command-center-results" className="max-h-[min(60vh,28rem)] overflow-y-auto p-2" role="listbox" aria-label={t('nav.commandResults')}>
              {results.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t('nav.commandEmpty')}</p>
              ) : (
                results.map((item, index) => (
                  <button
                    key={item.to}
                    id={`command-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => go(item.to)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm',
                      index === activeIndex ? 'bg-accent text-accent-foreground' : 'text-foreground',
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1">{t(item.labelKey)}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{item.to}</span>
                  </button>
                ))
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              <span>↑↓ {t('nav.commandMove')}</span>
              <span>↵ {t('nav.commandOpen')}</span>
              <span>Esc {t('nav.commandClose')}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
