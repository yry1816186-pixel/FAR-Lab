import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { cx } from './cx.ts';

export interface TabItem {
  readonly id: string;
  readonly label: ReactNode;
}

/**
 * Accessible tab bar (WAI-ARIA tabs pattern): role=tablist/tab, arrow-key
 * navigation with roving selection, aria-selected wiring. Used for the
 * mission workspace views and assay instruments.
 */
export function Tabs({
  items,
  active,
  onChange,
  ariaLabel,
  className,
}: {
  readonly items: readonly TabItem[];
  readonly active: string;
  readonly onChange: (id: string) => void;
  readonly ariaLabel: string;
  readonly className?: string;
}) {
  const refs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const onKeyDown = (evt: KeyboardEvent<HTMLDivElement>): void => {
    if (evt.key !== 'ArrowLeft' && evt.key !== 'ArrowRight' && evt.key !== 'Home' && evt.key !== 'End') return;
    evt.preventDefault();
    const ids = items.map((item) => item.id);
    const current = ids.indexOf(active);
    let next = current;
    if (evt.key === 'ArrowRight') next = (current + 1) % ids.length;
    if (evt.key === 'ArrowLeft') next = (current - 1 + ids.length) % ids.length;
    if (evt.key === 'Home') next = 0;
    if (evt.key === 'End') next = ids.length - 1;
    const id = ids[next];
    if (id !== undefined) {
      onChange(id);
      refs.current.get(id)?.focus();
    }
  };

  return (
    <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className={cx('flex flex-wrap gap-1 border-b border-border', className)}>
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            ref={(el) => {
              if (el !== null) refs.current.set(item.id, el);
              else refs.current.delete(item.id);
            }}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`tabpanel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cx(
              'rounded-t px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
              selected ? 'border-b-2 border-accent text-ink' : 'text-ink2 hover:bg-surface2 hover:text-ink',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, active, children }: { readonly id: string; readonly active: string; readonly children: ReactNode }) {
  if (id !== active) return null;
  return (
    <div role="tabpanel" id={`tabpanel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0} className="pt-4 focus-visible:outline-none">
      {children}
    </div>
  );
}
