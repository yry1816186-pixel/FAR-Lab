import { useCallback, useEffect, useState } from 'react';

/**
 * Manual theme control (craft-spec-v2 §5).
 * 'auto' (default) removes [data-theme] so the CSS media-query default applies;
 * 'light' | 'dark' pin the attribute and override the system preference.
 * Persisted in localStorage so the workbench keeps the choice across sessions.
 */
export type ThemeChoice = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'far-theme';

const readStored = (): ThemeChoice => {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : 'auto';
};

const apply = (choice: ThemeChoice): void => {
  if (choice === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', choice);
};

export function useTheme(): { theme: ThemeChoice; cycleTheme: () => void } {
  const [theme, setTheme] = useState<ThemeChoice>(readStored);

  useEffect(() => {
    apply(theme);
  }, [theme]);

  const cycleTheme = useCallback((): void => {
    setTheme((prev) => {
      const next: ThemeChoice = prev === 'auto' ? 'light' : prev === 'light' ? 'dark' : 'auto';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, cycleTheme };
}
