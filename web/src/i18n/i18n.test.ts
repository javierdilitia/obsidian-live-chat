import { act, render, screen } from "@testing-library/react";
import { createElement, useEffect, useRef } from "react";
import { describe, expect, it } from "vitest";
import type { CartridgeUI } from "../cartridge";
import en from "./en.json";
import es from "./es.json";
import {
  asLanguage,
  bundleProblems,
  formatCount,
  formatDate,
  formatMoney,
  formatRating,
  translate,
} from "./i18n";
import { I18nProvider, useI18n } from "./I18nProvider";

describe("the bundles", () => {
  it("the core bundles agree", () => {
    expect(bundleProblems(en, es)).toEqual([]);
  });

  it("a key in one language only is a problem", () => {
    const one = bundleProblems({ a: "A", b: "B" }, { a: "A" });
    expect(one).toHaveLength(1);
    expect(one[0]).toContain("b");
    const other = bundleProblems({ a: "A" }, { a: "A", b: "B" });
    expect(other).toHaveLength(1);
    expect(other[0]).toContain("b");
  });

  it("a placeholder must appear in both languages", () => {
    const problems = bundleProblems({ a: "{name} x" }, { a: "x" });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("a");
  });

  it("an empty message or a lone plural form is a problem", () => {
    expect(bundleProblems({ a: "" }, { a: "" }).length).toBeGreaterThan(0);
    expect(bundleProblems({ "n.one": "x" }, { "n.one": "x" }).length).toBeGreaterThan(0);
  });
});

describe("formatting", () => {
  it("formats money per language", () => {
    expect(formatMoney(189900, "en")).toBe("€1,899");
    expect(formatMoney(189900, "es")).toBe("1.899 €");
    expect(formatMoney(1850, "en")).toBe("€18.50");
    expect(formatMoney(1850, "es")).toBe("18,50 €");
    expect(formatMoney(500, "es")).toBe("5 €");
    expect(formatMoney(99900, "es")).toBe("999 €");
    expect(formatMoney(1249900, "es")).toBe("12.499 €");
  });

  it("formats counts, ratings and dates per language", () => {
    expect(formatCount(1240, "es")).toBe("1.240");
    expect(formatCount(1240, "en")).toBe("1,240");
    expect(formatRating(4.5, "es")).toBe("4,5");
    expect(formatRating(4.5, "en")).toBe("4.5");
    expect(formatDate(new Date(2026, 10, 12), "en")).toBe("12 Nov");
    expect(formatDate(new Date(2026, 10, 12), "es")).toBe("12 nov");
  });

  it("plurals and placeholders", () => {
    expect(translate("es", "stock.few", { count: 1 })).toBe("Solo queda 1");
    expect(translate("es", "stock.few", { count: 3 })).toBe("Solo quedan 3");
    expect(translate("es", "cart.cell", { count: 2, total: "1.948 €" })).toBe(
      "Cesta, 2 artículos, 1.948 €",
    );
    // CLDR puts a million in Spanish's `many`; the bundles have only `one` and `other`.
    expect(translate("es", "stock.few", { count: 1000000 })).toBe("Solo quedan 1.000.000");
  });

  it("asLanguage keeps en or es and falls back to en", () => {
    expect(asLanguage("es")).toBe("es");
    expect(asLanguage("en")).toBe("en");
    expect(asLanguage("fr")).toBe("en");
    expect(asLanguage(undefined)).toBe("en");
    expect(asLanguage(3)).toBe("en");
  });
});

describe("useI18n", () => {
  it("useI18n switches without a remount", () => {
    let mounts = 0;
    let switchTo: ((next: "en" | "es") => void) | undefined;
    function Probe() {
      const { t, setLanguage } = useI18n();
      const counted = useRef(false);
      useEffect(() => {
        if (!counted.current) {
          counted.current = true;
          mounts += 1;
        }
      }, []);
      switchTo = setLanguage;
      return createElement("span", null, t("cart.label"));
    }
    render(createElement(I18nProvider, { language: "en", children: createElement(Probe) }));
    expect(screen.getByText("Cart")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");

    act(() => switchTo?.("es"));

    expect(screen.getByText("Cesta")).toBeInTheDocument();
    expect(mounts).toBe(1);
    expect(document.documentElement.lang).toBe("es");
  });
});

describe("the cartridges", () => {
  const installed = import.meta.glob<{ cartridge: CartridgeUI }>("../cartridges/*/index.ts", {
    eager: true,
  });

  it("every installed cartridge has its glossary and disclaimer in both languages", () => {
    expect(Object.keys(installed).length).toBeGreaterThan(0);
    for (const { cartridge } of Object.values(installed)) {
      const enKeys = Object.keys(cartridge.specs.en).sort();
      expect(Object.keys(cartridge.specs.es).sort()).toEqual(enKeys);
      for (const language of ["en", "es"] as const) {
        for (const [key, { label }] of Object.entries(cartridge.specs[language])) {
          expect({ key, language, label: label.trim() !== "" }).toEqual({
            key,
            language,
            label: true,
          });
        }
        expect(cartridge.disclaimer[language].shell.trim()).not.toBe("");
      }
      expect(cartridge.disclaimer.es.footer).toHaveLength(cartridge.disclaimer.en.footer.length);
      for (const key of Object.keys(cartridge.better)) expect(enKeys).toContain(key);
    }
  });
});
