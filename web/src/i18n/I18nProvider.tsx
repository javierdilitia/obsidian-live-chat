/* The shopper's language for the whole app. Every component reads its words and formats through
   `useI18n()`; a switch re-renders them in place, nothing mounts again. Without a provider (most
   tests) the app reads English. */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  formatCount,
  formatDate,
  formatMoney,
  formatRating,
  translate,
  type Language,
  type MessageKey,
  type MessageParams,
} from "./i18n";

export interface I18n {
  language: Language;
  setLanguage: (next: Language) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
  money: (amountCents: number) => string;
  count: (n: number) => string;
  rating: (value: number) => string;
  date: (at: Date) => string;
}

function i18nFor(language: Language, setLanguage: (next: Language) => void): I18n {
  return {
    language,
    setLanguage,
    t: (key, params) => translate(language, key, params),
    money: (amountCents) => formatMoney(amountCents, language),
    count: (n) => formatCount(n, language),
    rating: (value) => formatRating(value, language),
    date: (at) => formatDate(at, language),
  };
}

const I18nContext = createContext<I18n>(i18nFor("en", () => undefined));

/** Holds the language, starting at `language`; sets `<html lang>` to follow it. */
export function I18nProvider({
  language: initial,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  const [language, setLanguage] = useState<Language>(initial);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const value = useMemo(() => i18nFor(language, setLanguage), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
