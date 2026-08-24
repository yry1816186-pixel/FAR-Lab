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
 * Token values + live re-resolution on theme change. 'auto' mode follows the
 * system preference, so both the app's broadcast event and the media query are
 * subscribed. Returns a stable object per resolved theme (state identity), safe
 * as an effect dependency for chart re-init.
 */
export function useChartTokens(): ChartInks {
  const [inks, setInks] = useState<ChartInks>(readInks);
  useEffect(() => {
    // 'far-theme-change' is state/theme.ts's broadcast (module-private const
    // there; this lane keeps the literal in sync rather than editing lane-01 files).
    const onTheme = (): void => setInks(readInks());
    window.addEventListener('far-theme-change', onTheme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', onTheme);
    return () => {
      window.removeEventListener('far-theme-change', onTheme);
      mq.removeEventListener('change', onTheme);
    };
  }, []);
  return inks;
}
