/**
 * shared/i18n — locale state + message lookup.
 *
 * zh-CN is the default locale (product audience), en the secondary. The
 * catalogue pair is type-bound (en: Record<MessageKey, string>), so key drift
 * is a compile-time failure. Interpolation is `{name}` replacement only —
 * no plural engine, no RTL support (declared gap, not silently absent).
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { en } from './en.ts';
import { zh, type MessageKey } from './zh.ts';

export type Locale = 'zh' | 'en';

const STORAGE_KEY = 'far-locale';
const catalogues: Readonly<Record<Locale, Record<MessageKey, string>>> = { zh, en };

function detectInitialLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {
    // storage unavailable → default
  }
  return 'zh';
}

function format(template: string, params?: Record<string, string | number>): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

interface I18nContextValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: (key: MessageKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable — locale stays session-scoped
    }
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  }, []);

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>): string =>
      format(catalogues[locale][key] ?? key, params),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (ctx === null) {
    // Outside a provider (unit tests of leaf components): read-only zh default.
    return { locale: 'zh', setLocale: () => undefined, t: (key, params) => format(zh[key] ?? key, params) };
  }
  return ctx;
}

export function useT(): (key: MessageKey, params?: Record<string, string | number>) => string {
  return useI18n().t;
}

export type { MessageKey };
