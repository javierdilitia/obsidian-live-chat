/* Halden, the dev cartridge: a fictional electronics store. */
import { z } from "zod";
import type { CartridgeUI } from "../../cartridge";
import { installMaterials, renderMarkup } from "./renders";
import specs from "./specs.en.json";

const GlossarySchema = z.record(
  z.string(),
  z.object({ label: z.string(), better: z.enum(["higher", "lower"]).optional() }),
);

export const cartridge: CartridgeUI = {
  id: "halden",
  storeName: "Halden",
  disclaimer: {
    shell: "Concept demo · every product, price, rating and order is fictional",
    footer: ["concept demo", "fictional products, prices & ratings"],
  },
  specs: GlossarySchema.parse(specs),
  renderer: { install: installMaterials, markup: renderMarkup },
};
