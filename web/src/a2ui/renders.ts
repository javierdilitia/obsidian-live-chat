/* eslint-disable @typescript-eslint/restrict-template-expressions -- the ported SVG templates interpolate coordinates */
/* Product renders, ported from mockup/js/renders.js: every product is drawn in code as a lit
   object on black glass — a 3/4 studio view, its finish, a glowing screen where it has one, a floor
   shadow and a faint reflection. Materials are defined once in a hidden sprite, so the same product
   always renders the same markup. The markup is built from this file's constants only: the product's
   look picks among them (unknown names fall back to a laptop, silver, dusk) and is never written
   into the SVG as it came. All products are fictional. */

import type { Look } from "../lib/products";

interface Finish {
  hi: string;
  mid: string;
  lo: string;
  edge: string;
  line: string;
  name: string;
}

interface Footage {
  c: [string, string, string];
  sun: string;
}

interface Body {
  mirror: number;
  shadow: [number, number, number, number];
  floor?: string;
  draw: (F: Finish, f: string, k: string) => string;
}

const FINISH: Record<string, Finish> = {
  silver: {
    hi: "#EEF1F5",
    mid: "#BCC3CC",
    lo: "#7E8692",
    edge: "#5B626C",
    line: "#FFFFFF",
    name: "Silver",
  },
  graphite: {
    hi: "#737A85",
    mid: "#474C55",
    lo: "#2A2E35",
    edge: "#191C21",
    line: "#A3AAB4",
    name: "Graphite",
  },
  midnight: {
    hi: "#56698A",
    mid: "#2F3D56",
    lo: "#1B2335",
    edge: "#101622",
    line: "#8AA2C6",
    name: "Midnight",
  },
  starlight: {
    hi: "#F4ECE0",
    mid: "#D5C9B7",
    lo: "#A29581",
    edge: "#776C5D",
    line: "#FFFAF2",
    name: "Starlight",
  },
  sage: {
    hi: "#B1C0B5",
    mid: "#80918A",
    lo: "#56645C",
    edge: "#3A443E",
    line: "#D3DFD6",
    name: "Sage",
  },
  white: {
    hi: "#FFFFFF",
    mid: "#E6E9EE",
    lo: "#B9BFC8",
    edge: "#959CA6",
    line: "#FFFFFF",
    name: "White",
  },
};
/* what is playing on each screen: a frame from an edit, in its own light */
const FOOTAGE: Record<string, Footage> = {
  dusk: { c: ["#1C2B4B", "#7B4B6C", "#F2B27A"], sun: "#FFE4BD" },
  sea: { c: ["#0E2A3B", "#1F5D74", "#94CADA"], sun: "#EAF7FB" },
  night: { c: ["#0B0C1C", "#2B2152", "#5E3D7C"], sun: "#F0CFE9" },
  dawn: { c: ["#3B3A5D", "#C98B9B", "#F6D3B9"], sun: "#FFF2E2" },
};
const DUSK: Footage = { c: ["#1C2B4B", "#7B4B6C", "#F2B27A"], sun: "#FFE4BD" };

const MATERIALS_ID = "obsidian-materials";

function materialsMarkup(): string {
  let s = "";
  for (const [k, f] of Object.entries(FINISH)) {
    s +=
      `<linearGradient id="fx-${k}-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${f.hi}"/><stop offset=".55" stop-color="${f.mid}"/><stop offset="1" stop-color="${f.lo}"/></linearGradient>` +
      `<linearGradient id="fx-${k}-edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${f.mid}"/><stop offset="1" stop-color="${f.edge}"/></linearGradient>` +
      `<linearGradient id="fx-${k}-side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${f.lo}"/><stop offset="1" stop-color="${f.edge}"/></linearGradient>`;
  }
  for (const [k, f] of Object.entries(FOOTAGE)) {
    s += `<linearGradient id="ft-${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${f.c[0]}"/><stop offset=".62" stop-color="${f.c[1]}"/><stop offset="1" stop-color="${f.c[2]}"/></linearGradient>`;
  }
  s +=
    `<radialGradient id="rx-shadow"><stop offset="0" stop-color="#000" stop-opacity=".8"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="rx-glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D6E6F5" stop-opacity=".2"/><stop offset=".7" stop-color="#D6E6F5" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="rx-gloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".09"/><stop offset=".5" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="rx-shade" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>` +
    `<linearGradient id="rx-fadeg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<mask id="rx-fade" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#rx-fadeg)"/></mask>`;
  return s;
}

/** Adds the materials sprite to the page once; every render refers to it by ID. */
export function installMaterials(): void {
  if (typeof document === "undefined" || document.getElementById(MATERIALS_ID)) return;
  const sprite = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  sprite.id = MATERIALS_ID;
  sprite.setAttribute("aria-hidden", "true");
  sprite.setAttribute("width", "0");
  sprite.setAttribute("height", "0");
  sprite.style.position = "absolute";
  sprite.innerHTML = `<defs>${materialsMarkup()}</defs>`;
  document.body.appendChild(sprite);
}

/* an editing suite on screen, drawn flat in a 150×88 box (the caller maps it onto the panel) */
function screenArt(k: string): string {
  const f = FOOTAGE[k] ?? DUSK,
    alt = k === "sea" ? "dusk" : "sea";
  return `
    <rect width="150" height="88" fill="#0B0E14"/>
    <rect x="34" y="6" width="82" height="46" fill="url(#ft-${k})"/>
    <circle cx="92" cy="33" r="6.5" fill="${f.sun}" opacity=".9"/>
    <path d="M34 44c12-8 22-4 32-7s20-6 32 1 12-2 18 1v13H34Z" fill="#06080C" opacity=".72"/>
    <rect x="6" y="6" width="22" height="12" rx="1" fill="url(#ft-${k})" opacity=".8"/>
    <rect x="6" y="21" width="22" height="12" rx="1" fill="url(#ft-${alt})" opacity=".6"/>
    <rect x="6" y="36" width="22" height="12" rx="1" fill="#1A2030"/>
    <path d="M122 8h22M122 13h16M122 18h19M122 26h22M122 31h12M122 36h17" stroke="#fff" stroke-opacity=".16" stroke-width="1.6"/>
    <rect x="6" y="57" width="138" height="27" rx="1.5" fill="#10141C"/>
    <rect x="8" y="60" width="38" height="6" rx="1" fill="${f.c[1]}"/>
    <rect x="47" y="60" width="52" height="6" rx="1" fill="${f.c[2]}" opacity=".85"/>
    <rect x="100" y="60" width="42" height="6" rx="1" fill="${f.c[1]}" opacity=".7"/>
    <path d="M8 72h134" stroke="#5C7EA8" stroke-width="5" stroke-dasharray="1.2 .8" opacity=".5"/>
    <rect x="8" y="78" width="60" height="4" rx="1" fill="#F2B27A" opacity=".5"/>
    <rect x="72" y="78" width="40" height="4" rx="1" fill="#9CBEE0" opacity=".45"/>
    <path d="M70 56v30" stroke="#fff" stroke-width=".8" opacity=".8"/>`;
}

/* ——— bodies, each in a 320×230 studio frame, all seen from one camera: the width runs down-right,
   the depth comes forward down-left (about −0.53, 0.85), so the right side shows.
   `mirror` is the floor line the reflection folds on; `floor` (cables) lies on the floor and isn't reflected ——— */
const BODIES: Record<string, Body> = {
  laptop: {
    mirror: 170,
    shadow: [164, 168, 128, 8],
    draw: (F, f, k) => `
    <path d="M258 128 236 164v5l22-36Z" fill="url(#fx-${f}-side)"/>
    <path d="M70 154 236 164v5L70 159Z" fill="url(#fx-${f}-edge)"/>
    <g transform="matrix(1.0375 .0625 -.55 .9 92 118)">
      <rect width="160" height="40" rx="3" fill="url(#fx-${f}-top)"/>
      <rect width="160" height="40" rx="3" fill="url(#rx-glow)"/>
      <rect x="18" y="4" width="124" height="21" rx="1.5" fill="#000" opacity=".18"/>
      <path d="M21 7.2h118M21 11.2h118M21 15.2h118M21 19.2h118" stroke="#14171C" stroke-width="2.8" stroke-dasharray="6.4 1.3" opacity=".9"/>
      <path d="M21 23h29M52 23h52M106 23h33" stroke="#14171C" stroke-width="2.8" opacity=".9"/>
      <rect x="58" y="28.5" width="44" height="9" rx="1.5" fill="#fff" fill-opacity=".08" stroke="#000" stroke-opacity=".2" stroke-width=".5"/>
    </g>
    <path d="M70 154 236 164" stroke="${F.line}" stroke-width=".8" opacity=".7"/>
    <path d="M264 20 267 21.5 261 129 258 128Z" fill="${F.edge}"/>
    <g transform="matrix(1.0375 .0625 -.06 1.08 98 10)">
      <rect width="160" height="100" rx="5" fill="#090B0F" stroke="${F.mid}" stroke-width="1.4"/>
      <g transform="translate(5 5)">${screenArt(k)}</g>
      <circle cx="80" cy="2.6" r=".9" fill="#1E232B"/>
      <path d="M2 2h156L54 98H2Z" fill="url(#rx-gloss)"/>
    </g>
    <path d="M98 10 264 20" stroke="#fff" stroke-width=".7" opacity=".35"/>`,
  },

  monitor: {
    mirror: 160,
    shadow: [160, 158, 74, 7],
    draw: (F, f, k) => `
    <path d="M149 112h22l4 38h-30Z" fill="url(#fx-${f}-side)"/>
    <ellipse cx="160" cy="156" rx="50" ry="8" fill="${F.edge}"/>
    <ellipse cx="160" cy="153" rx="50" ry="8" fill="url(#fx-${f}-top)"/>
    <path d="M252 14 256 16 254 119 250 118Z" fill="${F.edge}"/>
    <g transform="matrix(1.15 .05 -.0217 1.1304 68 6)">
      <rect width="160" height="92" rx="3" fill="#090B0F" stroke="${F.mid}" stroke-width="1.2"/>
      <g transform="matrix(1.0267 0 0 .9318 3 3)">${screenArt(k)}</g>
      <path d="M2 2h156L60 90H2Z" fill="url(#rx-gloss)"/>
    </g>
    <path d="M68 6 252 14" stroke="#fff" stroke-width=".7" opacity=".3"/>`,
  },

  buds: {
    mirror: 160,
    shadow: [162, 159, 92, 7],
    draw: (F, f) => `
    <rect x="115" y="74" width="100" height="86" rx="36" fill="${F.edge}"/>
    <rect x="110" y="70" width="100" height="86" rx="36" fill="url(#fx-${f}-top)"/>
    <rect x="110" y="70" width="100" height="86" rx="36" fill="url(#rx-shade)"/>
    <path d="M113 102h94" stroke="#000" stroke-opacity=".16" stroke-width="1"/>
    <path d="M128 73c12-3 52-3 64 0" stroke="#fff" stroke-opacity=".8" stroke-width="1"/>
    <circle cx="160" cy="128" r="1.8" fill="#9CBEE0"/>
    ${[
      [236, 98, 14, 1],
      [84, 100, -14, -1],
    ]
      .map(
        ([x, y, r, m]) => `
    <g transform="translate(${x} ${y}) rotate(${r}) scale(${m} 1)">
      <rect x="-4" y="6" width="11" height="42" rx="5.5" fill="url(#fx-${f}-top)"/>
      <rect x="-4" y="6" width="11" height="42" rx="5.5" fill="url(#rx-shade)"/>
      <ellipse cx="0" cy="0" rx="15" ry="14" fill="url(#fx-${f}-top)"/>
      <ellipse cx="-6" cy="-1" rx="6.5" ry="6" fill="${F.lo}" opacity=".9"/>
      <circle cx="1.5" cy="44" r="2.6" fill="${F.lo}" opacity=".7"/>
    </g>`,
      )
      .join("")}`,
  },

  keys: {
    mirror: 144,
    shadow: [156, 140, 124, 8],
    draw: (F, f) => `
    <path d="M38 122 252 136v7L38 129Z" fill="url(#fx-${f}-edge)"/>
    <path d="M274 96 252 136v7l22-40Z" fill="url(#fx-${f}-side)"/>
    <g transform="matrix(1.3375 .0875 -.55 1 60 82)">
      <rect width="160" height="40" rx="3" fill="url(#fx-${f}-top)"/>
      <rect x="5" y="4" width="150" height="32" rx="2" fill="#000" opacity=".26"/>
      <path d="M8 8.5h144M8 14.5h144M8 20.5h144M8 26.5h144" stroke="${F.hi}" stroke-width="4.4" stroke-dasharray="8.2 1.6" opacity=".9"/>
      <path d="M8 32.5h22M32 32.5h8M42 32.5h66M110 32.5h8M120 32.5h32" stroke="${F.hi}" stroke-width="4.4" opacity=".9"/>
    </g>
    <path d="M38 122 252 136" stroke="${F.line}" stroke-width=".8" opacity=".6"/>`,
  },

  ssd: {
    mirror: 148,
    shadow: [150, 146, 82, 7],
    floor: `<path d="M206 118c26 4 40 22 64 30s30 2 36-4" fill="none" stroke="#15181C" stroke-width="3.2" stroke-linecap="round"/>`,
    draw: (F, f) => `
    <path d="M80 128 190 138v9L80 137Z" fill="url(#fx-${f}-edge)"/>
    <path d="M220 92 190 138v9l30-46Z" fill="url(#fx-${f}-side)"/>
    <g transform="matrix(1.1 .1 -.5 .7667 110 82)">
      <rect width="100" height="60" rx="3" fill="url(#fx-${f}-top)"/>
      <rect x="38" y="27" width="24" height="2.4" rx="1.2" fill="#fff" opacity=".22"/>
      <circle cx="88" cy="50" r="1.6" fill="#9CBEE0"/>
    </g>
    <path d="M80 128 190 138" stroke="${F.line}" stroke-width=".8" opacity=".6"/>`,
  },

  dock: {
    mirror: 142,
    shadow: [156, 140, 112, 7],
    floor: `<path d="M60 100c-22 0-34 12-30 30s20 26 44 28" fill="none" stroke="#15181C" stroke-width="3.2" stroke-linecap="round"/>`,
    draw: (F, f) => `
    <path d="M56 112 246 124v16L56 128Z" fill="url(#fx-${f}-edge)"/>
    <path d="M260 102 246 124v16l14-22Z" fill="url(#fx-${f}-side)"/>
    <g transform="matrix(1.1875 .075 0 1 56 112)">
      <rect x="14" y="5" width="16" height="6" rx="1" fill="#07090C"/>
      <rect x="38" y="5" width="12" height="6" rx=".6" fill="#07090C"/>
      <rect x="56" y="5" width="12" height="6" rx=".6" fill="#07090C"/>
      <rect x="74" y="5" width="12" height="6" rx=".6" fill="#07090C"/>
      <rect x="96" y="7" width="18" height="2.4" rx="1" fill="#07090C"/>
      <rect x="124" y="6" width="10" height="4" rx="2" fill="#07090C"/>
      <circle cx="148" cy="8" r=".9" fill="#9CBEE0"/>
    </g>
    <g transform="matrix(1.1875 .075 -.7 1.1 70 90)">
      <rect width="160" height="20" rx="4" fill="url(#fx-${f}-top)"/>
      <rect x="68" y="9" width="24" height="2" rx="1" fill="#fff" opacity=".2"/>
    </g>
    <path d="M56 112 246 124" stroke="${F.line}" stroke-width=".8" opacity=".6"/>`,
  },
};

/** The inner markup of a product's 320×230 render (the `<svg>` element is the caller's). */
export function renderMarkup(look: Look): string {
  const B = BODIES[look.glyph] ?? BODIES.laptop;
  const f = FINISH[look.finish] ? look.finish : "silver";
  const F = FINISH[f];
  if (!B || !F) return "";
  const k = look.screen && FOOTAGE[look.screen] ? look.screen : "dusk";
  const body = B.draw(F, f, k);
  const [cx, cy, rx, ry] = B.shadow;
  return `
    <g mask="url(#rx-fade)" opacity=".14"><g transform="matrix(1 0 0 -1 0 ${B.mirror * 2})">${body}</g></g>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#rx-shadow)"/>
    ${B.floor ?? ""}
    ${body}`;
}
