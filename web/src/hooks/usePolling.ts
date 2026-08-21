import { useEffect, useRef } from 'react';

/**
 * Visibility-aware polling loop (PRODUCT_HCI §12, INTERFACES real-state rule):
 * - Runs `fn` immediately, then every `intervalMs`.
 * - Skips ticks while `document.visibilityState !== 'visible'` (no hidden-tab fetch churn)
 *   and fires an immediate catch-up tick when the page becomes visible again.
 * - Sequential (next tick scheduled only after the previous settles) — no overlapping calls.
 * - Generation counter prevents duplicate chains after visibility restarts or rekey.
 * - Callback errors must be handled by the consumer (fn never throws out).
 */
export function usePolling(fn: () => Promise<void>, intervalMs: number, enabled: boolean): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let generation = 0;
    let timer: number | undefined;

    const start = (): void => {
      generation += 1;
      const g = generation;
      if (timer !== undefined) window.clearTimeout(timer);
      const step = async (): Promise<void> => {
        if (g !== generation) return;
        if (document.visibilityState === 'visible') {
          try {
            await fnRef.current();
          } catch {
            // consumer-visible error handling; never break the loop
          }
        }
        if (g !== generation) return;
        timer = window.setTimeout(() => void step(), intervalMs);
      };
      void step();
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') start();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      generation += 1;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, enabled]);
}
