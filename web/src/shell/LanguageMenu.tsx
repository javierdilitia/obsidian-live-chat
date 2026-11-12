/* The language cell, the ledger's first (mockup/index.html `#langBtn`: the code and the currency,
   "EN · €"), and its menu: a `LedgerMenu` of the two languages, each named in itself.

   Picking the other language stores it for the shopper (`prefs.set_language`, from the shell's
   `language-menu`); on the server's yes the whole app switches at once, without a reload: every
   fixed string, price and date, and the open page's buttons and stock lines (its prose keeps the
   language it was written in until it is edited). While the request is out the items rest; a
   refusal or an unreachable server says so in the language still current, and the menu stays. */
import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { LANGUAGES, LANGUAGE_NAMES, asLanguage, type Language } from "../i18n/i18n";
import { setLanguagePref } from "../lib/session";
import { LedgerMenu } from "./LedgerMenu";

export function LanguageMenu({ onNotice }: { onNotice: (text: string) => void }) {
  const { t, language, setLanguage } = useI18n();
  /** The language being switched to, while the server answers. */
  const [pending, setPending] = useState<Language | null>(null);

  async function pick(id: string): Promise<boolean> {
    const next = asLanguage(id);
    setPending(next);
    let stored: Language | null = null;
    try {
      const result = await setLanguagePref(next);
      if (result.ok && result.user) stored = asLanguage(result.user.language);
      if (result.error) console.warn(`prefs.set_language: ${result.error.message}`);
    } catch {
      // the server could not be reached: the language stays as it was
    }
    setPending(null);
    if (stored === null) {
      onNotice(t("language.failed"));
      return false;
    }
    setLanguage(stored);
    return true;
  }

  return (
    <LedgerMenu
      menuId="language-menu"
      cellLabel={t("language.cell", { name: LANGUAGE_NAMES[language] })}
      menuLabel={t("language.menu")}
      cell={
        <span className="fact">
          <span>{language.toUpperCase()}</span>
          <span className="wide"> · €</span>
        </span>
      }
      items={LANGUAGES.map((code) => ({
        id: code,
        label: LANGUAGE_NAMES[code],
        checked: code === language,
      }))}
      busy={pending}
      onPick={pick}
    />
  );
}
