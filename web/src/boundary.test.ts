/* The cartridge boundary on the web side: core code never imports a cartridge folder and never
   names the cartridge's store or disclaimer. Core is everything in `web/src/` outside
   `web/src/cartridges/`, plus `index.html`. */
import indexHtml from "../index.html?raw";
import { cartridge } from "./cartridge";

const core = import.meta.glob<string>(
  ["./**/*.{ts,tsx}", "!./cartridges/**", "!./**/*.test.{ts,tsx}", "!./a2ui/test-helpers.tsx"],
  { query: "?raw", import: "default", eager: true },
);

const CARTRIDGE_IMPORT = /from\s+["'][^"']*cartridges\//;

test("the glob reads the core sources", () => {
  expect(Object.keys(core).length).toBeGreaterThanOrEqual(10);
});

test("no core source imports a cartridge folder", () => {
  const importing = Object.entries(core)
    .filter(([, text]) => CARTRIDGE_IMPORT.test(text))
    .map(([path]) => path);
  expect(importing).toEqual([]);
});

test("no core source names the cartridge's store or disclaimer", () => {
  const names = [cartridge.storeName, cartridge.disclaimer.shell, ...cartridge.disclaimer.footer];
  const sources = { ...core, "../index.html": indexHtml };
  const naming = Object.entries(sources).flatMap(([path, text]) =>
    names.filter((name) => text.includes(name)).map((name) => `${path}: ${name}`),
  );
  expect(naming).toEqual([]);
});
