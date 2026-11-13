/* Halden, the dev cartridge: a fictional electronics store. */
import { z } from "zod";
import type { CartridgeUI } from "../../cartridge";
import { installMaterials, renderMarkup } from "./renders";
import specsEn from "./specs.en.json";
import specsEs from "./specs.es.json";

const GlossarySchema = z.record(z.string(), z.object({ label: z.string() }));

export const cartridge: CartridgeUI = {
  id: "halden",
  storeName: "Halden",
  disclaimer: {
    en: {
      shell: "Concept demo · every product, price, rating and order is fictional",
      footer: ["concept demo", "fictional products, prices & ratings"],
    },
    es: {
      shell: "Demo conceptual · todos los productos, precios, valoraciones y pedidos son ficticios",
      footer: ["demo conceptual", "productos, precios y valoraciones ficticios"],
    },
  },
  specs: { en: GlossarySchema.parse(specsEn), es: GlossarySchema.parse(specsEs) },
  better: { hz: "higher", batt: "higher", p3: "higher", de: "lower" },
  renderer: { install: installMaterials, markup: renderMarkup },
};
