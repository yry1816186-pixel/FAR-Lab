import { useEffect, useState } from 'react';

/**
 * Chart infrastructure inks resolved from the v2 CSS tokens at render time.
 *
 * ECharts options are plain JS objects — CSS vars do not reach them — so canvas/
 * charts must resolve token values like this instead of hardcoding light-theme
 * grays (R2-02 audit D10: #c3c8d0 gridlines were near-invisible on the dark
 * surface). SVG-native components keep using `style` + var() directly; only
 * JS-built options need this module.
 *
 * Quantitative-identity series palettes (e.g. RadarCompare SERIES_COLORS) are a
 * separate concern and may stay literal BY DESIGN: series identity is not
 * epistemic state, so it must not borrow the verified/refuted/info semantics.
 */

export interface ChartInks {
  /** secondary text (axis names) — --v2-text-2 */
  text2: string;
  /** grid/axis lines — --v2-border */
  border: string;
  /** primary text — --v2-text-1 */
  text1: string;
  /** chart backdrop — --v2-surface */
  surface: string;
}

const readInks = (): ChartInks => {
  const cs = getComputedStyle(document.documentElement);
  const pick = (name: string): string => cs.getPropertyValue(name).trim() || '';
  return {
    text2: pick('--v2-text-2'),
    border: pick('--v2-border'),
    text1: pick('--v2-text-1'),
    surface: pick('--v2-surface'),
  };
};

/**
 * Token values + live re-resolution on theme change. The theme hook applies
 * its choice by mutating <html data-theme> AFTER broadcasting its event, so
 * listening to the event alone races and reads the PREVIOUS theme's values
 * (observed live: radar kept light gridlines on dark). A MutationObserver on
 * the attribute fires strictly after the DOM mutation — no race. 'auto' mode
 * has no attribute to mutate, so the system-preference media query is watched
 * too. Returns a stable object per resolved theme (state identity), safe as an
 * effect dependency for chart re-init.
 */
export function useChartTokens(): ChartInks {
  const [inks, setInks] = useState<ChartInks>(readInks);
  useEffect(() => {
    const observer = new MutationObserver(() => setInks(readInks()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = (): void => setInks(readInks());
    mq.addEventListener('change', onSystemChange);
    return () => {
      observer.disconnect();
      mq.removeEventListener('change', onSystemChange);
    };
  }, []);
  return inks;
}
