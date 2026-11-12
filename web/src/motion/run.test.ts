/* A run holds the page while it plays (`data-motion`, the thinking globe, stepped-back parts). It
   lets all of it go whatever way it ends. */
import { MessageProcessor } from "@a2ui/web_core/v1_0";
import type { ReactCatalogComponent } from "@a2ui/react";
import { shopCatalog } from "../a2ui/catalog";
import build from "../a2ui/fixtures/build.json";
import type { DotGlobe } from "./globe";
import { playMessages, type Stage } from "./run";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

test("a throw after the change is applied lets the page go and stops the globe", async () => {
  // frames and timers collapse; the page is not rendered, so nothing waits on it
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 0));
  vi.stubGlobal("matchMedia", () => ({ matches: false }));

  const workspace = document.createElement("section");
  document.body.append(workspace);
  const fade = vi.fn();
  const globe = {
    age: () => 10_000,
    fade,
    // the dots fail to land, after the run has applied its change and set `data-motion`
    land: () => Promise.reject(new Error("the dots could not land")),
  } as unknown as DotGlobe;
  const stage: Stage = { workspace, chrome: null, globe, seam: () => undefined };
  const processor = new MessageProcessor<ReactCatalogComponent>([shopCatalog]);

  await expect(playMessages(stage, processor, build, null)).rejects.toThrow(
    "the dots could not land",
  );

  expect(workspace).not.toHaveAttribute("data-motion");
  expect(fade).toHaveBeenCalled();
});
