# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static vanilla HTML/CSS/JS, no build step, no JS dependencies, split by concern (user request, Nov 2026): `index.html` holds markup only; `css/` holds base, chrome, home, artifacts and overlays; `js/data/` holds the synthetic catalog and the scripted questions; `js/` holds core, shop, artifacts, orb, home, agent and main. Scripts are plain deferred scripts sharing globals, not ES modules, so the page still opens offline by double-click. Typefaces (Satoshi, Spline Sans Mono) load from Fontshare/Google Fonts CDNs with system fallbacks. Vite+React only if an animation library becomes necessary — it has not.

## Users

Immediate audience: the internal company team — the mockup must sell the concept to colleagues first, then serve as a client-pitch artifact. Eventual end users of the real product: retail shoppers comparing considered purchases (e.g., laptops, electronics).

## Product Purpose

A concept mockup of a conversational retail assistant with **no chat log**: a single input bubble at the top and an AI workspace below, where the assistant builds visual, saveable artifacts — product comparisons with graphs, spec explainers, modals. Success: a teammate understands the paradigm in one viewing and wants it built.

## Positioning

Conversation is the command layer; documents are the answer. This inverts the chat-transcript convention every chatbot ships — the assistant's output is durable workspace material, not scrolling messages.

## Operating Context

Shown full-screen in a browser on desktop, presented live in meetings and screen shares. The scripted demo must look alive within ~10 seconds of opening.

## Capabilities and Constraints

- Mockup only: scripted, choreographed demo. No real AI, no backend, no persistence beyond the illusion.
- No chat transcript anywhere — that absence is the concept.
- Top bar must contain: shopping cart, user, previous orders, language selector. Nothing else prominent.
- AI workspace must demonstrate: comparison graphs (example given: 3 laptops), spec explainers ("so the consumer knows what we're talking about"), open modals, and saved pages the user can return to.
- All product data is synthetic demonstration data, authored at full fidelity with invented model names — never real products with fabricated prices.

## Brand Commitments

Black, very slick, minimalistic (user-pinned). These bind the visual world.

## Evidence on Hand

None. Every product, price, and spec in the mockup is authored illustrative material.

## Product Principles

1. **No transcript.** The conversation is a command line; the workspace is the answer.
2. **Artifacts over messages.** Every response is a durable, visual, saveable object.
3. **Minimal chrome.** The shell carries only cart, user, orders, language.
4. **The assistant is a builder.** Motion shows construction — elements being placed, drawn, saved — not typing indicators.
