/* The shopper's language for the whole app. Every component reads its words and formats through
   `useI18n()`; a switch re-renders them in place, nothing mounts again. Without a provider (most
   tests) the app reads English. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
import { rememberLanguage } from "./remembered";

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

/** Holds the language, starting at `language`; sets `<html lang>` to follow it and remembers it
 *  for the next visit's first guess. `later` is the session's language when it answers after the
 *  first render: the provider switches to it, unless the shopper has switched already. */
export function I18nProvider({
  language: initial,
  later,
  children,
}: {
  language: Language;
  later?: Promise<Language | null>;
  children: ReactNode;
}) {
  // `chosen`: the shopper has switched, so a late session answer no longer applies
  const [{ language }, setState] = useState({ language: initial, chosen: false });
  const setLanguage = useCallback((next: Language) => {
    setState({ language: next, chosen: true });
  }, []);
  useEffect(() => {
    let live = true;
    void later?.then((answer) => {
      if (!live || !answer) return;
      setState((held) => (held.chosen ? held : { language: answer, chosen: false }));
    });
    return () => {
      live = false;
    };
  }, [later]);
  useEffect(() => {
    document.documentElement.lang = language;
    rememberLanguage(language);
  }, [language]);
  const value = useMemo(() => i18nFor(language, setLanguage), [language, setLanguage]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
