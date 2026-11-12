import "@testing-library/jest-dom/vitest";

// Lit (used by @a2ui/web_core) announces its dev build in every test file. Its documented opt-out
// is to mark the warning's code as already issued.
(globalThis as { litIssuedWarnings?: Set<string> }).litIssuedWarnings = new Set(["dev-mode"]);

// jsdom has no canvas: its `getContext` reports "not implemented" on the console. The dot globe
// draws nothing without a context, as it would in a browser that has none.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;
