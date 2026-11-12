/* The cartridge this build serves: one client's presentation config (store name, disclaimer, spec
   glossary, product renders). Core never imports a cartridge folder; this module finds them with
   `import.meta.glob`, so adding a client means adding `web/src/cartridges/<id>/`, never editing
   core. `VITE_OBSIDIAN_CARTRIDGE` picks one when several are installed. A cartridge's ID equals
   its folder name and the backend's `OBSIDIAN_CARTRIDGE`. */
import type { Look } from "./lib/products";

export interface SpecInfo {
  label: string;
  /** Which way is better, for numeric specs; the best value in a row is marked. */
  better?: "higher" | "lower";
}

export interface ProductRenderer {
  /** Installs whatever the markup needs once per document (shared materials, for example). */
  install(): void;
  /** The inner markup of a product's 320×230 render (the `<svg>` element is the caller's). */
  markup(look: Look): string;
}

export interface CartridgeUI {
  /** Equals its folder name under `web/src/cartridges/`. */
  id: string;
  /** The wordmark and the document title. */
  storeName: string;
  disclaimer: { shell: string; footer: readonly string[] };
  /** The spec glossary: a label per spec key, and which way is better. */
  specs: Readonly<Record<string, SpecInfo>>;
  /** Draws product renders; without one, a render is an empty plate. */
  renderer?: ProductRenderer;
}

const SETTING = "VITE_OBSIDIAN_CARTRIDGE";
const FOLDER = /\/cartridges\/([^/]+)\/index\.ts$/;

/** The cartridge `wanted` names, or the only one installed. Throws, naming the installed IDs. */
export function pickCartridge(
  modules: Record<string, { cartridge: CartridgeUI }>,
  wanted: string | undefined,
): CartridgeUI {
  const byId = new Map<string, CartridgeUI>();
  for (const [path, module] of Object.entries(modules)) {
    const folder = FOLDER.exec(path)?.[1] ?? path;
    if (module.cartridge.id !== folder) {
      throw new Error(
        `Cartridge folder '${folder}' exports the ID '${module.cartridge.id}'; they must match.`,
      );
    }
    byId.set(folder, module.cartridge);
  }
  const installed = [...byId.keys()].sort().join(", ");
  let choice = wanted?.trim() ?? "";
  if (!choice) {
    if (byId.size === 0) throw new Error("No cartridge is installed.");
    if (byId.size > 1) {
      throw new Error(
        `Several cartridges are installed (${installed}). Set ${SETTING} to one of them.`,
      );
    }
    choice = installed; // the one installed ID
  }
  const found = byId.get(choice);
  if (!found) throw new Error(`Unknown cartridge '${choice}'. Installed: ${installed || "none"}.`);
  return found;
}

export const cartridge: CartridgeUI = pickCartridge(
  import.meta.glob<{ cartridge: CartridgeUI }>("./cartridges/*/index.ts", { eager: true }),
  import.meta.env.VITE_OBSIDIAN_CARTRIDGE,
);

/** The glossary entry for a spec key; a key the glossary lacks gets a readable label. */
export function specInfo(key: string): SpecInfo {
  return (
    cartridge.specs[key] ?? {
      label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
    }
  );
}
