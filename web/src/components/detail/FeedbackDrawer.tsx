import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../../i18n/LanguageContext';
import type { ResearchRun } from '../../api/types';
import { FeedbackForm, type FeedbackTarget } from './FeedbackForm';

/**
 * Global feedback drawer (CPP-1): feedback is the entry to the causal revision
 * chain — the product's core differentiator — so it must be reachable from
 * every scientific object, not only the overview tab. Inline object actions
 * open this drawer with a pre-seeded target.
 *
 * A11y (critique P0-2): real modal semantics — Tab is trapped inside the
 * dialog, focus is restored to the invoking element on close, and the initial
 * focus happens exactly once per mount (P0-1: a re-render loop must never
 * steal focus while the researcher is typing). Esc / backdrop close confirm
 * when typed content would be lost (critique P1-1: the most expensive text in
 * the app must not vanish on a misclick).
 */
export function FeedbackDrawer({
  run,
  target,
  onClose,
  onSubmitted,
  onViewRevisions,
}: {
  run: ResearchRun;
  target?: FeedbackTarget;
  onClose: () => void;
  onSubmitted: () => void;
  onViewRevisions: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const dirtyRef = useRef(false);

  const requestClose = (): void => {
    if (dirtyRef.current && !window.confirm(t('feedback.discardConfirm'))) return;
    onClose();
  };

  // Stable across parent re-renders (polling refreshes RunDetail every few
  // seconds): callbacks live in refs so the effect below runs ONCE per mount.
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const focusables = getFocusables(panel);
    (focusables[0] ?? panel)?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      // focus trap: cycle within the dialog
      const items = getFocusables(panel);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const current = document.activeElement;
      if (e.shiftKey && (current === first || current === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      } else if (current !== null && !panel!.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      restoreFocusRef.current?.focus();
    };
  }, []);

  return (
    <div className="drawer-backdrop" onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div ref={panelRef} className="drawer drawer--feedback" role="dialog" aria-modal="true" aria-label={t('feedback.drawerTitle')} tabIndex={-1}>
        <header className="drawer-head">
          <h3 className="drawer-title">{t('feedback.drawerTitle')}</h3>
          <button type="button" className="btn btn--small" onClick={requestClose} aria-label={t('feedback.close')}>
            <X size={14} aria-hidden="true" />
          </button>
        </header>
        <div className="drawer-body">
          <FeedbackForm
            runId={run.id}
            onSubmitted={onSubmitted}
            initialTarget={target}
            onClose={onClose}
            onViewRevisions={onViewRevisions}
            onDirtyChange={(dirty) => { dirtyRef.current = dirty; }}
          />
        </div>
      </div>
    </div>
  );
}

function getFocusables(root: HTMLDivElement | null): HTMLElement[] {
  if (root === null) return [];
  return Array.from(root.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'))
    .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
}
