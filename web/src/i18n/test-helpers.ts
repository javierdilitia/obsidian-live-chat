/* For tests: finds English left on a screen that should read in another language. */
import en from "./en.json";
import es from "./es.json";

/** The English bundle's words that a Spanish screen can never show: those that differ from the
 *  Spanish and have no placeholder (a filled-in message cannot be matched exactly). */
const ENGLISH_ONLY = new Set(
  Object.entries(en)
    .filter(([key, text]) => text !== (es as Record<string, string>)[key] && !text.includes("{"))
    .map(([, text]) => text),
);

/** Every English-only bundle value under `container`: an element's own text (its direct text
 *  nodes, trimmed), its `aria-label`, `placeholder` or `title`. */
export function englishLeft(container: Element): string[] {
  const found: string[] = [];
  for (const element of [container, ...container.querySelectorAll("*")]) {
    const own = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join("")
      .trim();
    const values = [
      own,
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder"),
      element.getAttribute("title"),
    ];
    for (const value of values) {
      const text = value?.trim();
      if (text && ENGLISH_ONLY.has(text)) found.push(text);
    }
  }
  return found;
}
