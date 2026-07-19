/**
 * Lightweight i18n: zh (default) + en, with a {var} interpolation and a useT()
 * hook that degrades to zh when no provider is mounted (so direct-render page
 * tests keep their exact zh strings without wrapping each in a provider).
 *
 * Locale is persisted in localStorage('far-lang') and mirrored to <html lang>.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { messages, type Locale, type MessageKey } from './messages';

export type { Locale, MessageKey };

const STORAGE_KEY = 'far-lang';
const DEFAULT_LOCALE: Locale = 'zh'; // no-provider fallback (direct-render unit tests keep canonical zh)
const APP_DEFAULT_LOCALE: Locale = 'en'; // real-app default — English-first for the international release

export const LOCALES: readonly Locale[] = ['zh', 'en'] as const;

function readStoredLocale(): Locale {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'zh' || v === 'en') return v;
  } catch {
    // localStorage may be unavailable (private mode / SSR) — fall through to default.
  }
  return APP_DEFAULT_LOCALE;
}

function writeStoredLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore persistence failures
  }
}

function interpolate(template: string, vars?: Readonly<Record<string, string | number>>): string {
  if (vars === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

export function translate(locale: Locale, key: MessageKey, vars?: Readonly<Record<string, string | number>>): string {
  const raw = messages[locale][key] ?? messages.zh[key] ?? key;
  return interpolate(raw, vars);
}

export interface I18nContextValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: (key: MessageKey, vars?: Readonly<Record<string, string | number>>) => string;
}

const FALLBACK_T: I18nContextValue['t'] = (key, vars) => translate(DEFAULT_LOCALE, key, vars);
const FALLBACK_VALUE: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => {
    // no-op when used without a provider
  },
  t: FALLBACK_T,
};

const I18nContext = createContext<I18nContextValue>(FALLBACK_VALUE);

export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStoredLocale(next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Returns the active i18n context. Outside an I18nProvider (e.g. direct page
 * renders in unit tests) it returns a zh-bound fallback, so pages render their
 * canonical zh text without each test having to mount a provider.
 */
export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

/** Convenience hook: returns the bound `t` function for the active locale. */
export function useT(): I18nContextValue['t'] {
  return useContext(I18nContext).t;
}
