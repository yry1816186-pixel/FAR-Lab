import { useEffect } from 'react';

/**
 * B14 field performance (PLAN-reuse-adoption R6): GoogleChrome web-vitals@6
 * attribution build. Values land on console.info under a stable prefix so a
 * devtools session (or any future collector) can read LCP/INP/CLS/TTFB with
 * their attribution (element, interaction target, load state). Pure
 * observation — no behavior change, no sends.
 */
export function useWebVitals(): void {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let cancelled = false;
    void (async () => {
      try {
        const { onLCP, onINP, onCLS, onTTFB } = await import('web-vitals/attribution');
        const report = (name: string) => (metric: { value: number; rating?: string; attribution?: unknown }): void => {
          if (!cancelled) {
            // eslint-disable-next-line no-console -- the dev-only field console IS the collector
            console.info(`[vitals] ${name}: ${metric.value.toFixed(1)} (${metric.rating ?? '?'})`, metric.attribution ?? '');
          }
        };
        onLCP(report('LCP'));
        onINP(report('INP'));
        onCLS(report('CLS'));
        onTTFB(report('TTFB'));
      } catch {
        // Library unavailable (offline install drift) — metrics are advisory.
      }
    })();
    return () => { cancelled = true; };
  }, []);
}
