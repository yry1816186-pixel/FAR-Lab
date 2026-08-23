import { useCallback, useEffect, useState } from 'react';

/**
 * Manual theme control (craft-spec-v2 §5).
 * 'auto' (default) removes [data-theme] so the CSS media-query default applies;
 * 'light' | 'dark' pin the attribute and override the system preference.
 * Persisted in localStorage so the workbench keeps the choice across sessions.
 */
export type ThemeChoice = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'far-theme';

/** Broadcast when any surface changes the choice (header/settings double entry). */
const THEME_CHANGE_EVENT = 'far-theme-change';

const readStored = (): ThemeChoice => {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : 'auto';
};

const apply = (choice: ThemeChoice): void => {
  if (choice === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', choice);
};

export function useTheme(): { theme: ThemeChoice; cycleTheme: () => void; setTheme: (next: ThemeChoice) => void } {
  const [theme, setThemeState] = useState<ThemeChoice>(readStored);

  useEffect(() => {
    apply(theme);
  }, [theme]);

  // Double entry point (header quick toggle + settings center): keep every
  // mounted useTheme instance on the same choice — persist + broadcast, and
  // adopt choices broadcast by other instances.
  useEffect(() => {
    const onChoice = (e: Event): void => {
      const detail = (e as CustomEvent<{ theme?: unknown }>).detail;
      if (detail?.theme === 'auto' || detail?.theme === 'light' || detail?.theme === 'dark') {
        setThemeState(detail.theme);
      }
    };
    window.addEventListener(THEME_CHANGE_EVENT, onChoice);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onChoice);
  }, []);

  const persist = useCallback((next: ThemeChoice): void => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: next } }));
  }, []);

  const cycleTheme = useCallback((): void => {
    setThemeState((prev) => {
      const next: ThemeChoice = prev === 'auto' ? 'light' : prev === 'light' ? 'dark' : 'auto';
      localStorage.setItem(STORAGE_KEY, next);
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: next } }));
      return next;
    });
  }, []);

  return { theme, cycleTheme, setTheme: persist };
}
