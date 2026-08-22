import { useEffect, useRef } from 'react';

/**
 * Visibility-aware polling loop (PRODUCT_HCI §12, INTERFACES real-state rule):
 * - Runs `fn` immediately, then every `intervalMs`.
 * - The FIRST invocation after start always runs regardless of visibility: a
 *   page that just loaded (or a poll just re-enabled) needs its data once —
 *   the visibility gate exists to stop hidden-tab fetch churn, not to
 *   withhold the initial load (B1 P0: embedded webviews and background tabs
 *   keep visibilityState 'hidden' forever and got NO data at all).
 * - Skips subsequent ticks while `document.visibilityState !== 'visible'`
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
      let first = true;
      const step = async (): Promise<void> => {
        if (g !== generation) return;
        if (first || document.visibilityState === 'visible') {
          first = false;
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
