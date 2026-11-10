---
name: OBSIDIAN
description: A black flagship electronics store (Halden) with a shopping assistant by Obsidian and no chat log — every answer is built as a page and filed into its own tab, and the products stand lit on black glass.
colors:
  bg: "#0A0A0B"
  bg-panel: "#0D0E11"
  bg-raise: "#111318"
  line: "rgba(255,255,255,.08)"
  line-strong: "rgba(255,255,255,.16)"
  tx: "#EDF1F6"
  tx-2: "rgba(237,241,246,.62)"
  tx-3: "rgba(237,241,246,.48)"
  frost: "#D6E6F5"
  steel: "#9CBEE0"
  deep: "#6E9BD1"
  ink: "#06090F"
  ember: "#F2B27A"
typography:
  hero:
    fontFamily: "Supreme, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(32px, 4vw, 50px)"
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: "-0.025em"
  offer:
    fontFamily: "Supreme, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(20px, 2.1vw, 24px)"
    fontWeight: 700
    lineHeight: 1.2
  price:
    fontFamily: "Supreme, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "-0.015em"
  price-lg:
    fontFamily: "Supreme, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "30px"
    fontWeight: 700
  price-sm:
    fontFamily: "Supreme, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 700
  store:
    fontFamily: "Supreme, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    letterSpacing: "-0.02em"
  product:
    fontFamily: "Supreme, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 700
  input:
    fontFamily: "Supreme, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
  display:
    fontFamily: "Supreme, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(21px, 2.4vw, 27px)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Supreme, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Supreme, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Supreme, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "Supreme, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
  label:
    fontFamily: "Supreme, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: ".14em"
  data:
    fontFamily: "Spline Sans Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  hair: "2px"
  focus: "4px"
  nest: "8px"
  ctl: "10px"
  strip: "12px"
  pop: "14px"
  panel: "16px"
  artifact: "20px"
  modal: "22px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "28px"
  container: "1120px"
components:
  button-primary:
    backgroundColor: "{colors.steel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.ctl}"
    height: "40px"
    padding: "0 18px"
    typography: "{typography.control}"
  button-primary-hover:
    backgroundColor: "{colors.frost}"
    textColor: "{colors.ink}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.tx-2}"
    rounded: "{rounded.ctl}"
    height: "40px"
    padding: "0 18px"
    typography: "{typography.control}"
  chip:
    backgroundColor: "rgba(255,255,255,.02)"
    textColor: "{colors.tx-2}"
    rounded: "{rounded.pill}"
    padding: "9px 16px"
    typography: "{typography.control}"
  capsule:
    backgroundColor: "rgba(255,255,255,.035)"
    rounded: "{rounded.pill}"
    height: "58px"
    padding: "0 10px 0 20px"
  tab:
    backgroundColor: "{colors.bg-panel}"
    textColor: "{colors.tx}"
    rounded: "12px 12px 0 0"
    height: "36px"
    padding: "0 6px 0 12px"
  toolbar:
    backgroundColor: "{colors.bg-panel}"
    padding: "10px 0"
  ledger-cell:
    textColor: "{colors.tx}"
    height: "56px"
    padding: "0 18px"
    typography: "{typography.control}"
  artifact:
    backgroundColor: "{colors.bg-panel}"
    rounded: "{rounded.artifact}"
  status-pill:
    textColor: "{colors.steel}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
    typography: "{typography.label}"
  deal-pill:
    textColor: "{colors.ember}"
    backgroundColor: "rgba(242,178,122,.12)"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  offer-cut:
    backgroundColor: "{colors.ember}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "4px 11px"
  toast:
    backgroundColor: "{colors.bg-raise}"
    textColor: "{colors.tx}"
    rounded: "{rounded.pill}"
    padding: "11px 18px"
---

# Design System: OBSIDIAN

## Overview

**Creative North Star: "A Black Flagship Store"**

The store leads: Halden, a fictional electronics retailer, names the shell, and its products stand lit on black glass like objects in a flagship window — each drawn in code as a 3/4 studio view with its own finish, a glowing screen, a floor shadow and a faint reflection. Obsidian is the assistant inside the store ("assistant by Obsidian"), and its paradigm is the hook:

OBSIDIAN refuses the chat transcript. The command bar works like a browser's address bar, and the assistant's answer is a page that assembles itself in the workspace below. The agent files every page into a browser-style tab on its own; nothing is saved by hand. Every visual decision serves that inversion: there is no message list anywhere, so nothing on screen borrows chat furniture. The user's words live only in the command bar of the tab they built and in that tab's title.

The material is polished black glass over one quiet light source. A near-black ground (#0A0A0B) carries three panel tiers separated by 8% white hairlines; the stage has a single steel-tinted sheen from the top-left (`radial-gradient(1100px 520px at 18% -8%, rgba(156,190,224,.055), transparent 62%)`), and every floating panel carries an inset 1px top light plus a soft black offset — the read of a beveled glass edge, never a visible drop shadow. The interface carries two voices of colour: a three-step silver-blue family (frost / steel / deep) for assistant presence, data series and selection, and one warm ember (#F2B27A) for deals only. Everything else that is warm or colourful belongs to the products — their finishes and what plays on their screens.

Motion is construction, not typing. A slowly turning globe of fine dots thinks in the center of the workspace, where the page will appear; then its dots fly out and land on the page's outline, and the content fills in — elements place at a 45ms stagger (14px rise, 6px blur burning off), radar strokes draw themselves, bars cascade. Arrivals spring; teaching pulses once; switching tabs is instant and never replays the build. Nothing built is ever lost: each page stays in its tab until the tab is closed.

**Key Characteristics:**
- Black glass ground with a three-tier surface ladder: #0A0A0B ground → #0D0E11 panel → #111318 raise.
- Products are merchandise, not icons: lit renders on a studio plate, large on the shelf, the offer and the modal, never hidden on mobile.
- One silver-blue family (frost #D6E6F5 / steel #9CBEE0 / deep #6E9BD1) for the assistant, data and selection; ember #F2B27A for deals only.
- Supreme is the voice and the price; Spline Sans Mono is everything a machine measured.
- Every answer can end in a purchase: a price, a trust line, and an add-to-cart that says when it's done.
- Structure is drawn with 1px hairlines (8% white; 16% for overlay borders) — sections divide by line, not by gap or shadow.
- Pills are alive (capsule, chips, dots, toasts, bar tracks); rounded rectangles are material (tiles, popovers, artifacts, modals).
- Motion grammar: think (dot globe) → land (dots become the outline) → staged construction (place → draw → cascade); spring arrivals (--spring); reduced motion honored everywhere — at rest, nothing hidden.

## Colors

A blue-black neutral world carrying a single silver-blue accent ramp; depth comes from the surface ladder, not from hue.

### Primary
- **Steel** (#9CBEE0): the working accent — send button ready state, primary buttons, focus rings, the active tab icon and tab loading ring, follow-up chip icons, the live dot on the orders cell, the agent seam, selection background. The face of assistant presence.
- **Frost** (#D6E6F5): the light step — primary-button hover, the front of the dot globe, the lit facet of the shard mark, data series A. The brightest point the accent reaches.
- **Deep** (#6E9BD1): the dark step — data series C, the start of the seam's fill, the back of the dot globe, the shard's side facet.

### Neutral
- **Obsidian Ground** (#0A0A0B): page ground; also the shell bar's base (82% opaque + 14px blur).
- **Glass Panel** (#0D0E11): first panel tier — artifacts, the active tab and the command toolbar it joins, order cards.
- **Raised Glass** (#111318): overlay tier — popovers, menus, modals, drawers, toasts.
- **Frost White** (#EDF1F6): primary text, stepped down to 62% (tx-2) for secondary and 48% (tx-3) for captions.
- **Hairline** (rgba(255,255,255,.08)) and **Hairline Strong** (rgba(255,255,255,.16)): all structure. Strong is reserved for overlay borders (popover, menu, modal, drawer, toast).
- **Ink** (#06090F): the only text color permitted on accent surfaces — blue-black, never pure white on steel.

### Deal
- **Ember** (#F2B27A): savings ("Save €300"), the sale percentage pill (ember text on 12% ember, 30% ember border), the offer's "−€300" cut (ember fill, ink text). Nothing else — not errors, not warnings, not decoration.

### Named Rules
**The Two Voices Rule.** Frost/steel/deep speaks for the assistant — presence, data-series identity, selection, confirmations (a steel check). Ember speaks for the deal and only the deal. No third hue family enters the interface; product finishes and screen footage live inside the renders and are the product's own colour, not UI colour.

**The Ink Rule.** Text sitting on the accent is Ink #06090F. Never white-on-steel, never pure black.

## Typography

**Display Font:** Supreme — variable 100–800, embedded in `css/fonts.css` (source and licence in `fonts/`) (fallback: ui-sans-serif, system-ui, Segoe UI, sans-serif)
**Body Font:** Supreme (same stack)
**Data Font:** Spline Sans Mono (fallback: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)

**Character:** Supreme gives the assistant a crisp grotesk voice for everything it says; Spline Sans Mono marks everything a machine measured. The seam between them is the concept — prose speaks, data counts.

### Hierarchy
- **Hero** (700, clamp(32px–50px), 1.06, −0.025em): the landing line only — "Not a chatbot." at 48% over "The store answers you itself."
- **Display** (700, clamp(21px–27px), 1.2, −0.01em): artifact page titles, balanced wrapping.
- **Headline** (700, 22px, −0.01em): modal product titles.
- **Title** (700, 17px): drawer headings; 17px/700 for the home page heading and drawer headings alike; 13.5px/700 for in-artifact chart titles.
- **Body** (400, 15px, 1.5): base prose; lede paragraphs in artifacts run 16.5px/1.6.
- **Control** (500, 13.5px): buttons, chips, menu items, verdicts at 14.5px.
- **Label** (500, 11px, +0.04em): status pills. The shell's wordmark is the store — "Halden" at 19px/700, −0.02em — with "assistant by Obsidian" at 12px beside the shard; never spaced capitals. Tracking widens as size shrinks; large titles tighten to −0.01em.
- **Data** (400–500, mono, 12px nominal): a 10–13px ramp — badge 10px, footers and dates 11.5px, spec values 13px. Applied to specs, ids, the command bar state field ("Thinking" → "Built · just now"), tracking dates, delivery facts, the shell ledger facts (`EN · €`, `1 arriving Thu`, `2 · €1,948`).

### Commerce sizes
- **Price** (700, tabular figures, −0.015em): 22px on the shelf, 30px in the modal, 20px for the cart total, 17px on picks, 15px in sale rows. The was-price sits beside it, struck, 13.5px at 48%. Under it: "Save €X" (13px/700 ember) and "or €X/mo · 24 months" (12.5px at 48%).
- **Trust line** (12.5px): a frost star glyph, the rating at 62% bold, the review count at 48%. **Stock line** (12.5px at 62%): a steel check, "In stock · delivered Thu 12 Nov".
- **Store** (19px/700, −0.02em): the retailer's name in the shell. **Product** (16px/700): product names on the shelf.
- **Input** (16px): the command bar input — 16px stops mobile browsers zooming on focus.

### Named Rules
**The Voice/Data Rule.** Commerce speaks in Supreme: prices, savings, monthly payments, ratings, stock and delivery. Spline Sans Mono is kept for what a machine measured or keeps — specs, ids, dates in meta lines, machine state, the shell ledger's facts. Nothing switches families for emphasis.

## Layout

A fixed shell over a sticky browser chrome (tabs + command bar); one centered content column; hairline-divided sections inside artifacts.

- **Shell bar:** fixed top, 56px tall, 82%-opaque ground + 14px backdrop blur; its bottom edge is the agent seam. Wordmark left; the ledger right — language, orders, cart, user as full-height hairline-divided cells. Nothing else lives here.
- **Before the first question:** no tabs and no rail. Above the command bar sits the landing hero (`--lift: clamp(28px, 8vh − 16px, 64px)` of space, then the hero line left and the breathing globe right, 32px above the bar); the three starter chips under the bar, and the home page below. The hero folds away (grid rows 1fr→0fr, .55s) as the first tab opens and returns with the landing. Until tabs exist the chrome is not sticky: the command bar scrolls away with the home page, so nothing ever slides under a see-through bar. Once the first tab opens, the chrome sticks over the opaque toolbar.
- **Browser chrome:** sticky under the shell. A tab band (46px, ground at 92% + blur, hairline painted along its bottom) holds the tabs and a + button; under it the toolbar (panel tier, 10px padding, hairline bottom) holds the 48px command bar. The band opens on the first question (grid-rows 0fr→1fr, .55s) while the toolbar's top padding slides from `--lift` to 10px.
- **Content column:** `.col` — max-width 1120px centered, 24px side padding (16px under 520px). Suggestion chips sit 16px under the chrome; workspace padded 22–28px top, 72px bottom.
- **Artifact internals:** a 24–28px padding rhythm (header 26/28/20, cells 22–26/24–28, footer 14/28); internal sections (verdict, product trio, spec table, charts, footer) divide with hairlines, not margins.
- **Spec table:** `170px label + repeat(3, 1fr)` value columns; rows are hairline-divided; a head row names each column (series dash + product name, Supreme 12.5px/700). ≤860px the label takes its own line over the three values — no sideways scroll.
- **Overlays:** modal min(880px, 100%) ≤ 86vh; drawers min(420px, 92vw) from the right; popovers min(340px, 78vw); menus min-width 190px anchored to their control.
- **Breakpoints:** 1080px — charts stack to one column, spec label column narrows to 140px; 860px — tabs fix at 156px and the tab strip scrolls sideways, the product shelf scrolls sideways one laptop at a time (scroll-snap, 76% columns), the spec table stacks label-over-values, order cells stack, modal hero stacks, "assistant by Obsidian" hides; 520px — chips, artifact padding and side gutters tighten, the command bar state field hides.

## Elevation & Depth

Depth is tonal first: the three-tier ground→panel→raise ladder carries in-flow hierarchy, and hairlines draw structure. Shadows exist but are quiet ground anchors, not lifts — each is an inset 1px top light (4–6% white, the polished edge catching the room) plus a large, heavily-feathered black offset with no visible shape.

### Shadow Vocabulary
- **Panel rest** (`0 1px 0 rgba(255,255,255,.05) inset, 0 24px 50px -30px rgba(0,0,0,.9)`): resting artifacts.
- **Overlay** (`0 1px 0 rgba(255,255,255,.06) inset, 0 48px 100px -40px rgba(0,0,0,.95)`): modals, drawers, menus, popovers, toasts.
- **Capsule** (`0 1px 0 rgba(255,255,255,.04) inset, 0 18px 40px -28px rgba(0,0,0,.9)`): the command capsule at rest; focus adds `0 0 0 4px rgba(156,190,224,.10)`.
- **Scrim** (`rgba(4,6,10,.62)` + 10px blur): behind every overlay, one shared scrim.

### Named Rules
**The Glass Edge Rule.** Every floating surface shows the edge: an inset top light plus a feathered black offset. Never a tight, readable drop shadow; never a colored glow (the capsule's 4px steel ring at 10% is a focus state, not decoration).

## Shapes

Corners carry meaning: pills are alive, rounded rectangles are material, hairlines are structure. Radius ladder — 2px inset focus on the ledger cells, 4px focus outlines, 8px items nested in a 14px menu or panel (outer radius minus padding), 10px controls, 12px strips and glyphs, 14px tiles and popovers/menus, 16px inner panels and order cards, 20px artifacts, 22px modals, 999px for everything that breathes (capsule, chips, badges, dots, toasts, quantity steppers, bar tracks, swatch dashes). Tabs take 12px top corners and open at the bottom into the toolbar. Explainer triggers underline with a dotted steel hairline. The mark is a faceted obsidian shard: five angled facets shading from near-black (#141A23) to steel, the top facet lit frost, a 0.8px steel outline so the silhouette holds on black at 15–22px (wordmark 22px, toast 15px, favicon). Icons are one authored stroke grammar, 1.5px strokes at 17–20px (1.6–1.8px only for arrow/check/close marks), drawn in currentColor.

## Components

### Shell bar: the store, and the ledger (signature)
- Left: the store's name (19px/700, from `STORE.name` in js/data/catalog.js, swappable per client pitch), then a hairline and "assistant by Obsidian" (12px at 48%) beside the 14px shard. ≤860px only the store's name stays.
- The four controls are full-height cells (0 18px, the last 0 20px) divided by 1px hairlines that run the bar's height. Each pairs a 13px/500 label with its live fact in mono 12px at 48% (62% on hover): language `EN · €`; **Orders** with a 5px steel dot (3px 14% ring, the tracking page's "now" step in small) and `1 arriving Thu` from the order data; **Cart** `2 · €1,948` (count at full strength) or `empty`; **Javier** with a 12px chevron that turns over while the menu is open. Hover washes 3% white, press 5%, an open menu holds 4%; focus is the steel outline inset 3px. Button labels carry the full fact for screen readers ("Cart, 2 items, €1,948").
- The cart value rolls when it changes: the old value lifts 70% and blurs out (.34s), the new one rises in on --spring (.42s). The fly-to-cart dot lands on the cart value.
- ≤860px: labels, the long parts of facts and the chevron drop; orders and cart show their 16px icon beside `Thu` and `2`; the user cell shows its initial in a 24px circle with the strong hairline. ≤520px: the wordmark text and the orders fact hide.
- Icon controls (`.ctl`: 38px squares, 10px radius, 62% tint, 6% hover wash, press .96) remain only as the close buttons of the modal and drawers.

### Agent seam (signature)
- The shell's bottom hairline is the agent's line. On the landing a centred steel gradient on it brightens and dims with the globe's breath (driven per frame by the globe). While a page builds or a follow-up patches it, a deep→steel→frost fill grows from the left — 18% at Thinking, 55% at the build status, 85% when the dots land, 100% at Built — then fades (.5s) back to the plain hairline. Reduced motion: no breath, the fill jumps.

### Landing hero
- One line in the Hero size — "Tell us what it’s for." at 48% text over "We’ll build you the shortlist." — on the left (the placeholder under it asks "What are you shopping for?"), and the agent waiting on the right: the dot globe at rest on its own 220px canvas (160px ≤860, 96px ≤520), the same 300 Fibonacci dots and tilt as the thinking globe, breathing on a 5.6s cosine (radius ±7%, brightness .55–.85) with its latitude wave slowed. It leans in when the command bar takes focus (turns faster, brightens) and again when text is typed (the wave deepens). It draws only on the landing, on screen and in a visible tab; reduced motion holds one still frame.

### Command bar (signature)
- A pill on 3.5% white with hairline border and the capsule shadow; steel spark glyph left, input, mono state field, circular send button right. 58px before the first question, 48px once tabs exist. It is the active tab's address bar: it shows the question that built the tab, selects it on focus, and takes the next one. Focus-within shifts the border to 55% steel, lifts the fill to 5% white, and adds the 4px steel ring. The send button is a quiet ghost until the input holds new text, then fills steel (hover: frost).

### Tabs (signature)
- The agent opens them; the user never saves. Each tab: 36px tall, flex 0 1 214px (min 104px), kind icon (compare / guide / order) + 13px/500 title + 22px close ×. Inactive tabs are bare text at 48% with a 3.5% hover wash; the active tab takes the panel tier, hairline sides and top, an inset top light, and covers the band's bottom hairline so it joins the toolbar. While building, the icon becomes a 12px steel loading ring. Tabs enter on --spring (width grows from 0 with a 10px rise) and close by collapsing width. Keyboard: ←/→/Home/End move between tabs, Delete closes, middle-click closes. Closing the last tab returns to the landing: home page, empty command bar, starter chips, scrolled to the top.
- **Where an answer goes (the agent decides):** an empty + tab takes it; a follow-up on the same kind of page changes the current tab (a section is added, or products are swapped, in place); a question whose page already exists switches to that tab ("Already built · switched tabs"); a different kind of page — a guide asked from a comparison — opens its own tab so the comparison stays as it is. Before building, the command bar's state field names the decision and its reason ("This page · updating the comparison", "New tab · keeping the comparison as it is").

### Typed text the script doesn't know
- No dead-end toast: the chips row turns into "This demo is scripted — the closest I can build:" with up to two chips matched by keywords (laptop/school/budget → the comparison, burn/OLED → the guide, order/track/dock → tracking, colour/grading → the colour follow-up on an open comparison), and the state field reads "Not in the script · closest below".

### The one disclaimer
- A centred mono 11.5px line under the workspace — "Concept demo · every product, price, rating and order is fictional" — and each page's footer. Never beside a price, never in a modal tag.

### Suggestion chips
- Pills (9×16px padding) on 2% white, hairline border; hover lifts 1px and strengthens the border. Before any question, and on an empty + tab, they are the three starters with a 5px steel dot. On a built tab they become follow-ups whose 13px steel icon says what the agent will do: circular arrow updates or rebuilds this page, folder-plus opens a new tab, right arrow switches to its tab. They re-enter with a 50ms stagger (8px rise, 4px blur).

### Product renders (signature)
- js/renders.js draws every product as inline SVG in a 320×230 studio frame: laptops, monitors, earbuds, keyboards, SSDs and docks, in a consistent 3/4 view (the hinge falls to the right as the depth comes forward to the left, so the right side shows). Each has a finish (silver, graphite, midnight, starlight, sage, white: a lit top, a darker front edge, a side face, a 0.8px highlight on the near edge, a top rim light), and screens play a frame from an edit (dusk, sea, night, dawn footage over an editor timeline) under a gloss. A radial floor shadow and a 14% reflection folded on the floor line, faded by a mask, sit under every body.
- Materials are defined once in the page sprite at start-up (`fx-<finish>-top/edge/side`, `ft-<footage>`, `rx-*`), so renders carry no ids and the same product always renders the same markup — which keeps the in-place follow-up diff honest.
- Every render stands on a **studio plate** (`.shot`): one soft frost light from above (radial, 7.5% at 50% 34%). Hover lifts the render 2–4px on --ease.

### Home page
- What the landing and every new + tab open on, in place of an empty workspace: one panel-tier page (20px radius, panel shadow) divided by hairlines, never a grid of cards. Head row: "For you" (17px/700) and a mono meta line (date · from your orders and searches). Top row, 1.55fr / 1fr: the week's offer (headline 20–24px/700, 14px body, "From" + the price block with the struck was-price and "Save €300", mono terms, a primary button that asks the agent; beside it the offer laptop rendered large on its plate, a button to its details, with the ember `−€300` cut on it) beside "Pick up where you left off": recent searches as hairline-divided rows (clock icon, 14px query, mono when · page kind; hover turns the icon steel and slides in an arrow) that ask again, with a 12.5px note that asking again rebuilds with today's prices. Then "Shop the store" (six category tiles with renders and a model count; Laptops asks the agent, the rest open their featured product), "Picked for you" (four tiles: render, name, trust line, 17px price, a one-line reason tied to past orders) and "On sale this week" (two columns of rows: an 84×60 render tile, name and reason, 15px/700 price over struck was-price, the ember percentage pill). Tiles and rows divide by a 1px gap over the hairline colour; hover washes 2.5% white; every product opens the product modal. The page enters with the 18px rise and re-enters each time a new tab shows it; it fades and blurs out (.4s) when a build starts. 1080px: the offer render moves above its copy, categories go 3-up; 860px: top row stacks, picks go 2-up, sale goes 1-up; 520px: categories 2-up, the offer render stays (170px plate).

### Follow-up updates (signature)
- A follow-up on the open comparison changes the page in place instead of rebuilding it. The agent renders the page before and after the question and compares them part by part; only what differs moves. The parts about to change step back (opacity .1, 3px blur, 3px lift, .3s) while everything else stays put; a smaller globe (72% radius) thinks over the page; a new section opens its own room first (grid rows 0fr→1fr, .6s); then the dots land only on the outlines of the changed parts, those parts rise in at a 40ms stagger, and the ones that existed before glow once with a 9% steel wash (1.8s). Only the swapped series of the radar redraw, and only the changed bars refill. The page header's meta line adds `then "<latest question>"`, the title and verdict rewrite to fit, and the state field reports the change ("Updated · 1 section added", "Updated · 2 laptops swapped").
- Scripted follow-ups: "Add colour accuracy for grading" adds a colour section (DCI-P3 range and ΔE bars) under the products; "Only OLED screens" swaps the two non-OLED laptops; "Show every panel type" swaps them back.

### Dot globe (signature thinking state)
- 300 dots on a Fibonacci sphere drawn to a fixed canvas, centered in the visible workspace (radius 56–128px). It forms out of a point (.75s), turns slowly (about 0.42 rad/s, tilted −0.38 rad), and a 5-lobe LFO wave rolls across its latitudes. Front dots are larger and frost, back dots small and deep. When the page is ready it is laid out unseen, points are spaced along the outlines of its on-screen blocks, and every dot swings outward on a curve and lands on one (680–940ms, 0–260ms random delay, ease-out-expo). The page fades in under the landed dots, the dots fade (.52s), and the content cascades in. Reduced motion: the globe holds still, nothing flies, the page fades in.

### Artifacts (signature)
- Workspace pages, not cards: panel-tier surfaces (20px radius, panel shadow) composed of hairline-divided sections — header (display title + mono meta line with items divided by 3px dots; an optional ghost action such as "All orders"), verdict bar (steel check + one-sentence recommendation + the one primary button on the page, "Add <pick> · <price>"), the shelf (three columns divided by hairlines: the render on its plate with a steel "The pick" pill on the recommended one, the name as the details button, trust line, price block, 14×3px series dash + tag, stock line, a full-width ghost "Add to cart" at the column's foot), spec table (label column with dotted-underline explainer triggers; best values carry a 5px series dot and full-strength text), charts, dot-divided mono footer ("concept demo · fictional products, prices & ratings"). Hover on a product column washes 2% white and lifts its render.
- **Add to cart, everywhere:** every buy button names its product; once the product is in the cart every such button reads "In cart · View" (steel, 35–45% steel border) and opens the cart instead of adding again. Buttons resync whenever the cart changes and when a tab is shown.
- **Order confirmation page:** checking out asks the agent "Check out my cart"; it always files the confirmation in a new tab ("Order OB-89101"): title "Order placed — arriving Thu 12 Nov", a thank-you verdict, a four-step track at "Ordered", the items on render tiles, delivery facts, and the footer "concept demo · no payment taken". The cart empties and the order joins the orders drawer and the ledger.
- **Order tracking page:** five steps on a 2px hairline track (12px dots; done = steel fill, current = steel ring with a 4px 12% ring; the steel fill grows on 1.2s --ease), then two hairline-divided cells: the parcel contents and mono delivery facts.

### Spec explainer popovers
- Fixed-position min(340px, 78vw) raise-tier panels (14px radius, overlay shadow, strong hairline) with a steel 13px heading ("Refresh rate, in plain words") and 13px/1.55 body; they flip above the row when space below is short, and each trigger pulses once (peek-pulse, 1.6s) when the table first builds.

### Charts
- **Radar:** 340×290 viewBox, four concentric grid rings and spokes at 7% white, Supreme 11px axis labels at 55% text; each series is a 1.6px stroke polygon that draws itself (900ms dash-offset on --ease, 220ms per-series stagger) then fills to 9%, its vertex dots popping on --spring.
- **Bars:** 8px pill tracks on 6% white; fills carry the series color and grow on a 1s width transition, staggered 120ms per row.

### Buttons
- **Shape:** control radius (10px); 40px height, 0 18px padding, 13.5px/500.
- **Primary:** steel fill, ink text; hover frost; press scale .97.
- **Ghost:** hairline border, 62% text; hover strengthens border to 16% white and washes 4% white.
- Focus-visible is always the 2px steel outline, offset 2px — everywhere, including inside overlays.

### Overlays (modal, drawers, menus)
- One shared scrim; a single overlay stack with Esc-closes-top, focus trap, and focus return to the invoker. The modal enters on --spring (scale .95 + 14px rise + 8px blur burning off, .45s); drawers slide from the right on --ease (.5s); menus (14px radius, 6px padding, 9px-radius items) place 8px under their anchor with arrow/Home/End key support and a steel tick on the selected item. Order cards stack mono ids/dates over hairline-divided item lists (48px render, name, quantity, price) and a steel status pill ("Delivered", "Confirmed"). Cart lines carry a 72×52 render tile, name and price, a pill quantity stepper with 32px buttons, and a 36px remove ×; the cart foot sums subtotal, free delivery with its day, and the total (20px/700) over a 46px "Check out · €X".
- **Product modal:** the render large on its plate (finish named bottom-left with a swatch), then the buy box: name, trust line, the 30px price block, three promises (stock + free delivery, 30-day returns, 2-year warranty — steel 16px icons), the primary buy button beside "Back", then the spec sheet.

### Toasts & fly-to-cart
- Bottom-center pills (raise tier, strong hairline, overlay shadow) with the shard mark; in on --spring (.45s), out on --ease (.3s), 2.6s dwell. Adding to cart launches a 14px series-colored dot that flies to the cart value in the ledger (.65s, cubic-bezier(.3,.6,.3,1)) as the value rolls.

### The build (interaction grammar)
- Fire a chip → the query types into the command bar (14ms/char) → the agent picks a tab (first question: the tab band opens and the command bar rises from `--lift` into the toolbar) → the tab shows its loading ring and title → the old page steps back (scale .97, blur) or the home page fades → the dot globe thinks (~1.7s, state "Thinking") → the state names the build ("Building comparison") → dots land on the page outline → the page fades in, dots fade → elements place at a 45ms stagger → radar draws, bars and tracking fill → explainer triggers pulse once → state reads "Built · just now", the tab icon settles, follow-up chips re-enter. Switching tabs is instant and restores each tab's scroll position. Under `prefers-reduced-motion`, every animation clamps to .001s, stagger steps collapse to 10ms, and all content rests fully visible.

## Do's and Don'ts

### Do:
- **Do** keep the silver-blue family for assistant presence, data series and selection, and ember for deals only.
- **Do** show products as renders on a studio plate, with a price in Supreme, a trust line and a way to buy.
- **Do** convey depth with the surface ladder (#0A0A0B → #0D0E11 → #111318) and hairlines; overlays take the raise tier with the strong (16% white) hairline.
- **Do** render measured values — prices, specs, ids, state, telemetry — in Spline Sans Mono.
- **Do** build entrances as staged construction: 55ms stagger, 14px rise with blur burning off, on --ease; arrivals (tiles, badges, modals, toasts) on --spring.
- **Do** use pills for living things and 14–22px rounded rectangles for material things.
- **Do** keep tabs instant — switching never replays the build.
- **Do** let the agent file every answer; there is no Save action anywhere.
- **Do** ship the reduced-motion path in every new motion: at rest, nothing hidden.

### Don't:
- **Don't** render a chat transcript, message bubbles, or a typing cursor as a response — the command bar and the tab title are the only echo of the user's words.
- **Don't** bring back a side rail, a Save button or a "Saved" toast — tabs replace all three.
- **Don't** introduce a third hue family, or use ember for anything but a deal; confirmations stay neutral with steel glyphs.
- **Don't** set prices in mono, or put a disclaimer next to a price.
- **Don't** draw products as line icons — every product shown is a render.
- **Don't** lift surfaces with readable drop shadows or colored glows; only the glass-edge pair (inset top light + feathered black offset) and the focus ring exist.
- **Don't** set white or pure black on the accent — text on steel is Ink #06090F.
- **Don't** animate entrances with opacity alone; things move and de-blur.
- **Don't** add prominent controls to the shell bar beyond language, orders, cart, and user — and don't turn them back into a bare icon row; each cell says its fact.
