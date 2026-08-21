import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { dictionaries } from './dict';
import type { DictKey, Lang } from './dict';

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
  formatTime: (iso: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

const STORAGE_KEY = 'farlab.web.lang';

function readInitialLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {
    // localStorage unavailable (private mode etc.) — fall back to default
  }
  return 'zh';
}

export function LanguageProvider({ children }: { children: ReactNode }): JSX.Element {
  const [lang, setLangState] = useState<Lang>(readInitialLang);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // non-fatal: language still applies for this session
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);

  const t = useCallback(
    (key: DictKey, vars?: Record<string, string | number>): string => {
      let text: string = dictionaries[lang][key] ?? dictionaries.zh[key] ?? key;
      if (vars !== undefined) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.split(`{${name}}`).join(String(value));
        }
      }
      return text;
    },
    [lang],
  );

  const formatTime = useCallback(
    (iso: string): string => {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return iso; // render raw value when not parseable — never blank
      return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(date);
    },
    [lang],
  );

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t, formatTime }), [lang, setLang, t, formatTime]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx === null) throw new Error('useI18n must be used within LanguageProvider');
  return ctx;
}
