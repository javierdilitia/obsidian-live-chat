import { pickCartridge, specInfo, type CartridgeUI } from "./cartridge";

function fake(id: string): CartridgeUI {
  return {
    id,
    storeName: id,
    disclaimer: { shell: "", footer: [] },
    specs: {},
  };
}

function modules(...ids: string[]): Record<string, { cartridge: CartridgeUI }> {
  return Object.fromEntries(
    ids.map((id) => [`./cartridges/${id}/index.ts`, { cartridge: fake(id) }]),
  );
}

describe("pickCartridge", () => {
  it("returns the only cartridge when none is named", () => {
    expect(pickCartridge(modules("halden"), undefined).id).toBe("halden");
  });

  it("needs a choice when several are installed", () => {
    expect(() => pickCartridge(modules("halden", "other"), undefined)).toThrow(
      /halden, other.*VITE_OBSIDIAN_CARTRIDGE/,
    );
  });

  it("names the installed cartridges when the wanted one is unknown", () => {
    expect(() => pickCartridge(modules("halden"), "haier")).toThrow(/haier.*halden/);
  });

  it("rejects a folder whose name differs from its cartridge ID", () => {
    const mismatched = { "./cartridges/halden/index.ts": { cartridge: fake("other") } };
    expect(() => pickCartridge(mismatched, undefined)).toThrow(/halden/);
  });

  it("fails when no cartridge is installed", () => {
    expect(() => pickCartridge({}, undefined)).toThrow(/No cartridge/);
  });
});

describe("specInfo", () => {
  it("reads the cartridge glossary", () => {
    expect(specInfo("hz")).toEqual({ label: "Refresh rate", better: "higher" });
  });

  it("makes a readable label for a key the glossary lacks", () => {
    expect(specInfo("warp_drive")).toEqual({ label: "Warp drive" });
  });
});
