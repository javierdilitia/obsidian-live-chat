/* The language this browser showed last: the first render's guess while the session hasn't
   answered (#27). Per browser, a convenience only: storage can be missing or blocked, and then
   the guess is English. */
import { asLanguage, type Language } from "./i18n";

const KEY = "obsidian.language";

export function rememberedLanguage(): Language {
  try {
    return asLanguage(localStorage.getItem(KEY));
  } catch {
    return "en";
  }
}

export function rememberLanguage(language: Language): void {
  try {
    localStorage.setItem(KEY, language);
  } catch {
    // storage is blocked: the next visit guesses English
  }
}
