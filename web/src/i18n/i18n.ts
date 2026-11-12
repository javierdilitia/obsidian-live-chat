/* The shopper's two languages: the fixed strings of the shell and of every page, and how money,
   counts, ratings and dates read in each. Core copy lives in `en.json` and `es.json`, flat, one
   key per message; a plural message is a `.one`/`.other` pair. A cartridge's text (its glossary
   and disclaimer) lives in its own folder, in both languages. The server sends codes; the words
   come from here. */
import en from "./en.json";
import es from "./es.json";

export type Language = "en" | "es";

export const LANGUAGES: readonly Language[] = ["en", "es"];

/** Each language's own name for itself: the same in both bundles, so it lives here. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", es: "Español" };

/** The shop sells in euros: English reads as Ireland's, Spanish as Spain's. */
export const LOCALES: Record<Language, string> = { en: "en-IE", es: "es-ES" };

/** `en` or `es`; anything else is English. */
export function asLanguage(value: unknown): Language {
  return value === "es" ? "es" : "en";
}

type RawKey = keyof typeof en;
type WithoutPlural<K> = K extends `${infer Base}.one`
  ? Base
  : K extends `${infer Base}.other`
    ? Base
    : K;
/** A message in the bundles; a plural message is named without its `.one`/`.other`. */
export type MessageKey = WithoutPlural<RawKey>;

export type MessageParams = Record<string, string | number>;

const BUNDLES: Record<Language, Readonly<Record<string, string>>> = { en, es };

const PLACEHOLDER = /\{(\w+)\}/g;

/** True when `key` names a message (a plain one or a plural pair). */
export function hasMessage(key: string): key is MessageKey {
  return key in en || `${key}.other` in en;
}

/** The message `key` in `language`, its `{name}` placeholders filled from `params`. A plural
    message picks its form by `params.count`; numbers read as counts in that language. */
export function translate(language: Language, key: MessageKey, params: MessageParams = {}): string {
  const bundle = BUNDLES[language];
  let template = bundle[key];
  if (template === undefined) {
    const count = typeof params.count === "number" ? params.count : 0;
    const form = plurals(language).select(count);
    // Spanish has a `many` form the bundles do not use: `other` stands in for it.
    template = bundle[`${key}.${form}`] ?? bundle[`${key}.other`] ?? key;
  }
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === "number" ? formatCount(value, language) : value;
  });
}

function placeholders(message: string): string {
  return [...message.matchAll(PLACEHOLDER)]
    .map((match) => match[1])
    .sort()
    .join(",");
}

/** What is wrong between two bundles: a key in one only, placeholders that differ, an empty
    message, a `.one` without its `.other`. Empty when they agree. */
export function bundleProblems(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): string[] {
  const problems: string[] = [];
  for (const [mine, theirs, side] of [
    [a, b, "first"],
    [b, a, "second"],
  ] as const) {
    for (const [key, message] of Object.entries(mine)) {
      if (!(key in theirs)) problems.push(`${key}: only in the ${side} bundle`);
      if (!message.trim()) problems.push(`${key}: empty in the ${side} bundle`);
      if (key.endsWith(".one") && !(`${key.slice(0, -".one".length)}.other` in mine)) {
        problems.push(`${key}: no .other in the ${side} bundle`);
      }
    }
  }
  for (const [key, message] of Object.entries(a)) {
    const other = b[key];
    if (other !== undefined && placeholders(message) !== placeholders(other)) {
      problems.push(`${key}: the placeholders differ`);
    }
  }
  return problems;
}

// Intl objects are costly to build; one of each per language.
function cached<T>(build: (locale: string) => T): (language: Language) => T {
  const made = new Map<Language, T>();
  return (language) => {
    let value = made.get(language);
    if (value === undefined) {
      value = build(LOCALES[language]);
      made.set(language, value);
    }
    return value;
  };
}

const plurals = cached((locale) => new Intl.PluralRules(locale));
const euros = cached(
  (locale) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
      useGrouping: "always",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }),
);
const cents = cached(
  (locale) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
      useGrouping: "always",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
);
const counts = cached((locale) => new Intl.NumberFormat(locale, { useGrouping: "always" }));
const ratings = cached(
  (locale) => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
);
const dates = cached(
  (locale) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }),
);

/** Euros from cents: whole euros without decimals, else two (EN `€1,899`, ES `1.899 €`). */
export function formatMoney(amountCents: number, language: Language): string {
  const format = amountCents % 100 === 0 ? euros : cents;
  return format(language).format(amountCents / 100);
}

export function formatCount(n: number, language: Language): string {
  return counts(language).format(n);
}

/** A rating with one decimal (EN `4.5`, ES `4,5`). */
export function formatRating(value: number, language: Language): string {
  return ratings(language).format(value);
}

/** A day and short month (EN `12 Nov`, ES `12 nov`). */
export function formatDate(at: Date, language: Language): string {
  return dates(language).format(at);
}
