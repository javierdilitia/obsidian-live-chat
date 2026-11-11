# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

The product: a React 19.2 + Vite + TypeScript web app (`web/`) rendering A2UI v1.0 surfaces with our own component catalog, and a Python 3.12 backend (`backend/`, FastAPI, uv workspace) that routes requests, generates UI with models on Azure AI Foundry (a small fast router model, a top-tier UI model) and reads catalog data through the `CatalogSource` contract. See `docs/ARCHITECTURE.md`. The original concept mockup (static vanilla HTML/CSS/JS, opens by double-click) is kept unchanged in `mockup/` as the visual and motion reference.

## Users

**Shoppers** making considered electronics purchases: laptops, monitors, audio and accessories. They weigh several options over days rather than minutes, want specs explained in plain words, and come back: to the tabs the assistant built for them (kept automatically, closed ones in their history), to products they looked at, and to their orders.

Three seeded shoppers stand in until real login (milestone 5):
- **Javier**: returning, English, has past orders and one on its way.
- **Ana**: Spanish-speaking, a couple of orders.
- **Sam**: first visit, no history, so the first-run path is always one click away.

**Watching it presented:** the internal team, then client prospects in pitches. They see the product driven live, so the scripted moments (a comparison, an in-place edit, a guide in its own tab, order tracking) must work every time.

## Product Purpose

A conversational retail assistant with **no chat log**: a single command bar at the top and a workspace of agent-filed tabs below, where the assistant builds visual, saveable artifacts (product comparisons with graphs, spec explainers, product pages, order history and tracking, modals) and edits them in place as the shopper refines the request. Buttons inside those artifacts act on real data: save, add to cart, buy, track an order, later ask for a refund. Success: shoppers reach a confident decision faster than with filters or a chatbot, and come back to the tabs they saved.

## Positioning

Conversation is the command layer; documents are the answer. This inverts the chat-transcript convention every chatbot ships — the assistant's output is durable workspace material, not scrolling messages.

## Operating Context

- **Desktop browser first**, full-screen; responsive down to phone width using `DESIGN.md`'s breakpoints.
- **Presented live** in meetings and screen shares. It must look alive within ~10 seconds of opening: the home page renders instantly, the agent's For-you section streams in after. A replay mode (recorded model output) keeps live demos from stalling or varying.
- **Sessions span days.** Tabs persist and come back on reload; closed tabs go to history; prices are always today's.
- **English and Spanish**, switched from the shell's language menu. Money is EUR.
- **No login yet:** seeded shoppers picked from the user menu, until real authentication arrives with deployment to Azure (milestone 5).
- **Synthetic data** until the teammate's data agent is connected.
- **Reduced motion** is honoured everywhere: at rest, nothing is hidden.

## Capabilities and Constraints

- Real models (Azure AI Foundry) generate the UI; a real backend serves catalog, order and commerce data. Tabs, history, cart, saved items and orders persist in Postgres (built in milestone 3; see `docs/superpowers/specs/2026-11-11-product-spec-design.md`).
- No chat transcript anywhere — that absence is the concept.
- Top bar must contain: shopping cart, user, previous orders, language selector. Nothing else prominent.
- The workspace must support: comparison graphs (e.g. 3 laptops), spec explainers ("so the consumer knows what we're talking about"), modals, and saved tabs the user can return to.
- The model composes only our registered components and places buttons by ID; it never sets prices or amounts. Buy and refund are validated server-side.
- Until the teammate's data agent is connected, all product and order data is synthetic demonstration data with invented model names — never real products with fabricated prices.

## Brand Commitments

Black, very slick, minimalistic (user-pinned). These bind the visual world.

## Evidence on Hand

None. Every product, price, and spec in the mockup is authored illustrative material.

## Product Principles

1. **No transcript.** The conversation is a command line; the workspace is the answer.
2. **Artifacts over messages.** Every response is a durable, visual, saveable object.
3. **Minimal chrome.** The shell carries only cart, user, orders, language.
4. **The assistant is a builder.** Motion shows construction — elements being placed, drawn, saved — not typing indicators.
