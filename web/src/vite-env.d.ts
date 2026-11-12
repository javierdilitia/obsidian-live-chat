/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which cartridge to build; optional while only one is installed. */
  readonly VITE_OBSIDIAN_CARTRIDGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
