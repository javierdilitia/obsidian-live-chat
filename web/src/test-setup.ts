import "@testing-library/jest-dom/vitest";

// Lit (used by @a2ui/web_core) announces its dev build in every test file. Its documented opt-out
// is to mark the warning's code as already issued.
(globalThis as { litIssuedWarnings?: Set<string> }).litIssuedWarnings = new Set(["dev-mode"]);
