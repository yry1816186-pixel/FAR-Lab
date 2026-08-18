import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Theme state. The blocking pre-paint script in index.html applies the
 * initial .dark class before first paint (no flash); this provider owns
 * runtime toggling and persists the choice under the SAME key ('far-theme').
 */

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'far-theme';

function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

interface ThemeContextValue {
  readonly theme: Theme;
  readonly toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', toggle: () => undefined });

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (typeof document === 'undefined' ? 'light' : currentTheme()));

  useEffect(() => {
    // Keep state in sync if the pre-paint script chose dark before hydration.
    setTheme(currentTheme());
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      const meta = document.querySelector('meta[name="theme-color"]');
      meta?.setAttribute('content', next === 'dark' ? '#101113' : '#fafaf8');
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // storage unavailable — theme stays session-scoped
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
