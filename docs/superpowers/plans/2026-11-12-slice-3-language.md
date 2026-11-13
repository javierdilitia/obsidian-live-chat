# Slice 3 — Language: English and Spanish: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in one session (the user's choice for this repo: no implementer subagents). Steps use checkbox (`- [ ]`) syntax for tracking. After Task 7, one Sonnet reviewer reads the branch against this plan; the reviewer runs no tests.

**Goal:** The shopper picks English or Spanish from a language menu. Every fixed string in the shell and on every page switches at once, without a reload; money and dates follow the language; the agent writes new pages, and every edit, in the shopper's language; a tab keeps its language until it is edited; `ana` starts in Spanish.

**Architecture:** Core web gets an i18n module (`web/src/i18n/`): two flat bundles `en.json` and `es.json`, a `translate` function with `{name}` placeholders and `Intl.PluralRules` plurals, `Intl` formatters for money, counts, ratings and dates, and a React provider every component reads through `useI18n()`. The cartridge's glossary and disclaimer gain their Spanish. The server stops sending shopper-facing copy: run errors and action errors carry codes (and, for `out_of_stock`, a reason and its numbers), and the web picks the words. The store keeps the shopper's language (`users.language`, now set by `prefs.set_language` through the checked action path) and stamps a tab's language when a run saves it; the page agent gets the language in its input, and an edit that changes a page's language must redefine every section.

**Tech Stack:** Python 3.12, FastAPI, Pydantic 2, SQLAlchemy 2 async (the existing `obsidian_store`), pytest; React 19.2, TypeScript 6, zod, Vitest; `Intl` (no i18n library).

**Spec:** [`docs/superpowers/specs/2026-11-11-product-spec-design.md`](../specs/2026-11-11-product-spec-design.md): §12 (Language, all of it), §7.1 (fixed strings from the EN/ES bundle; the spec glossary is cartridge content), §8.1 (shell buttons, the action response), §8.2 (`prefs.set_language`), §10.2 (`users.language`, `tabs.language`), §13 (direct action errors take their copy from the bundle), §6.2 (For you is cached per language: only what slice 3 leaves ready). Slice definition: [`2026-11-12-milestone-3-slices.md`](2026-11-12-milestone-3-slices.md), Slice 3; GitHub issue #16.

## Global Constraints

- Branch `feat/language` from an up-to-date `main`; one PR to `main` whose body says `Closes #16`, in milestone "3 — Build, slice by slice"; Conventional Commits, one per task; only the `javierdilitia` account pushes; ask the user before pushing.
- **Core** (`obsidian_data_contract`, `obsidian_agent`, `obsidian_store`, `web/src/` outside `web/src/cartridges/`) never imports a cartridge or names Halden data. Halden's Spanish glossary and Spanish disclaimer live in `web/src/cartridges/halden/`. The guard tests (`web/src/boundary.test.ts`, `backend/packages/agent/tests/test_cartridges.py`, `test_prompt.py`) stay green.
- Languages: exactly `en` and `es`. `Intl` locales: `en` → `en-IE`, `es` → `es-ES` (the shop sells in euros; `currency` is already EUR in the contract, a known seam).
- **Spanish is Spain's Spanish (es-ES), addressing the shopper as *tú*; "cart" is *cesta*.** Decided by the user on 2026-11-12. The copy in Tasks 4 and 5 is the reviewed copy: the build uses it as written.
- **Money:** whole euros without decimals, cents with two: EN `€1,899`, `€18.50`; ES `1.899 €`, `18,50 €` (`Intl.NumberFormat("es-ES", {style: "currency", currency: "EUR", useGrouping: "always"})`; the space before `€` is the no-break space U+00A0 that `Intl` writes). Counts and ratings group and use the language's decimal mark the same way (`1.240`, `4,5`). Dates: `{day: "numeric", month: "short"}` → EN `12 Nov`, ES `12 nov`. Decided by the user on 2026-11-12; written into spec §12 with this plan.
- The shell's language menu sends `prefs.set_language{language}` with `surfaceId: "shell"`, `sourceComponentId: "language-menu"`, and a `requestId`, through `POST /api/actions` (checked against `actions.json` like every direct action).
- The page agent's system prompt stays one fixed text (Azure prompt caching): the language goes in the run's input, never in `SYSTEM_PROMPT`.
- No live model calls: tests use `ScriptedModel`. No screenshots or headless-browser tests. Checking the model's Spanish prose needs a live run: that is in the by-eye checklist, marked "ask first".
- pyright strict, ruff, Prettier and ESLint clean. Per task, run only the named tests; run `python scripts/check.py backend web` once, in Task 7, with Postgres up and `OBSIDIAN_TEST_DATABASE_URL` set.
- No new dependencies.

## Decisions this plan makes (the spec is silent or had to change; each is in the PR description for the user)

1. **Spanish money is `1.899 €`, not the spec's `€1.899`** (the user's choice, 2026-11-12): Spain puts the sign after the amount, and plain `Intl` for `es-ES` would print `1899 €` (Spain's style rule leaves four-digit numbers ungrouped), so grouping is forced on. Spec §12 is updated in this plan's commit, with the register (Spain, *tú*) and the cart word (*cesta*).
2. **The server sends codes, the web owns the words.** `RUN_ERROR.message` and `error.message` stay, in English, for logs and the console; the shopper sees the bundle's copy for the code. `out_of_stock` gains `error.params = {reason: "sold_out" | "all_in_cart" | "only", name, count}` so the web can say what the server knew. An unknown code shows a generic line, never a key. Spec §8.1's response shape gains `params?` in this plan's commit.
3. **The language menu is a third shell source**, `language-menu` (spec §8.1 lists the shell sources; updated in this plan's commit). `prefs.set_language` answers `{ok, user, cart}`; unlike `session.switch_user`, it never sets the cookie.
4. **Seeding no longer resets a chosen language.** `Store.upsert_users` updates a user's name only; a restart keeps the language the shopper picked.
5. **A run writes in the shopper's language at the time it starts, and saving the run stamps the tab with it.** A failed run changes nothing, so the tab keeps its language.
6. **Replaced after review (the user, 2026-11-14): a tab keeps its language for good; an edit writes in the tab's language, and the rewrite below was removed. A "Translate this page" button is [#30](https://github.com/javierdilitia/obsidian-live-chat/issues/30).** As first built: **an edit that changes a page's language redefines every section.** The spec says "an edit rewrites the page in the current language"; Express edits redefine only changed sections, so the run's input tells the model to redefine every section in the new language, and the page agent rejects (one retry, with feedback naming the sections) a reply that leaves any section of `Page.children` undefined. The model's translation quality is checked by eye (ask first). The cost (kept by the user, 2026-11-13, option A): a language switch makes no model call and touches no tab; the rewrite happens per tab, only when that tab is edited, never for all tabs at once, and doubles roughly that one edit's output (the whole page instead of the change). A new tab is written in the new language at normal cost; a tab restored from history (slice 6) comes back in its stored language with no model call.
7. **Fixed strings follow the shopper, prose follows the tab.** After a switch, an English page shows Spanish buttons, stock lines and prices around its English prose until it is edited. This is the spec's rule ("existing tabs keep their language until edited"), stated here because the mixed page looks like a bug.
8. **The language is known before the first render.** `main.tsx` reads `GET /api/session` before mounting the app (falls back to `en` if it fails), so `ana` never sees an English flash; `<html lang>` follows the language.
9. **Language names are endonyms** ("English", "Español"), the same in both bundles, so they live in code (`LANGUAGE_NAMES`), not in the bundles.
10. **The glossary splits text from facts.** `specs.{en,es}.json` hold the labels (slice 4 adds explainers beside them); which way is better (`better`) is not language, so it moves to the cartridge's `index.ts`.
11. **The two shell menus share one component.** The user menu's cell, portal, placement and keys become `shell/LedgerMenu.tsx`; `UserMenu` and the new `LanguageMenu` use it, so the language menu is the mockup's menu by construction.
12. **Out of this slice:** the router's `reason` and chips in the language (slice 5, which builds the router); template pages from the bundle (slice 7); For you per language (slice 8: its cache is keyed `(user_id, language)` on `users.language`, and `prefs.set_language` is where slice 8 marks it stale; that makes a switch to a language without a fresh cached For you cost one background model call, a cost slice 8's plan must state); spec values and product names in Spanish (data language, Haier intake question J, milestone H; Halden's data stays English).

## Review Focus

1. A restart after Ana picks English: she is still in English (the seed must not reset it). (Task 1 contract test; Task 2 API test.)
2. A Spanish shopper edits an English page and the model redefines only the changed section: rejected and retried with the missing sections named, never saved as a half-English page marked `es`. (Task 3.)
3. An edit that fails, or times out, after the shopper switched language: the tab keeps its old language and page. (Task 3.)
4. A run error or action error code the web has no copy for (a new server code, a `price_changed` before slice 7): a generic line in the current language, never a raw key or the server's English. (Task 5.)
5. `prefs.set_language` fails (server down, or `invalid`): the language stays as it was, the failure toast is in the current language, and the menu stays open. (Task 6.)

---

### Task 1: The store keeps the shopper's language and stamps each saved tab

**Files:**
- Modify: `backend/packages/store/src/obsidian_store/{store,memory,postgres,contract_tests}.py`
- Modify: `backend/packages/agent/src/obsidian_agent/app.py` (the one `save_tab` call passes `language=tab.language`; Task 3 changes it to the run's language)

**Interfaces:**
- Produces in `Store` (and both implementations):
  ```python
  async def set_user_language(self, user_id: str, language: str) -> User | None: ...  # None: no such user
  async def save_tab(self, tab_id: str, *, card, snapshot, product_facts, run_id: str,
                     language: str) -> TabRecord: ...   # sets tabs.language with the page
  ```
  `upsert_users` docstring and behaviour: "Adds the users, or updates the name of those that exist; never changes a language." Postgres: `on_conflict_do_update(set_={"name": …})`; `set_user_language` is one `UPDATE … RETURNING`; `save_tab` sets `language` in the same update as the snapshot. No migration: the columns exist since 0001.

- [ ] **Step 1: Write the failing contract tests** in `contract_tests.py`, and pass `language=` in every existing `save_tab` call there:
  - `test_set_user_language`: seed the three users; `set_user_language("ana", "en")` returns `User("ana", "Ana", "en")`, `get_user("ana").language == "en"`; `set_user_language("ghost", "en") is None`.
  - `test_upsert_keeps_a_chosen_language`: seed, `set_user_language("ana", "en")`, seed again with `User("ana", "Ana M.", "es")` → `get_user("ana") == User("ana", "Ana M.", "en")`.
  - `test_save_tab_sets_the_language`: a tab created with `language="en"`; `save_tab(…, language="es")` → the returned record and `open_tabs(user)[0]` have `language == "es"`.
  - Change `test_users_upsert_updates_name` only if it asserted a language change (it does not today).
- [ ] **Step 2: Run** `uv run --directory backend pytest packages/store -q --no-cov` → FAIL (`set_user_language` missing; `save_tab` has no `language`).
- [ ] **Step 3: Implement** the protocol methods, `MemoryStore`, `PostgresStore`, and the app's call site.
- [ ] **Step 4: Run** `uv run --directory backend pytest packages/store packages/agent -q --no-cov` → PASS (the Postgres run is skipped without `OBSIDIAN_TEST_DATABASE_URL`; Task 7 runs it).
- [ ] **Step 5: Commit** `feat(store): keep the shopper's language and stamp it on each saved tab`.

### Task 2: `prefs.set_language`, and action errors the web can word

**Files:**
- Create: `backend/packages/agent/src/obsidian_agent/language.py`, `backend/packages/agent/tests/test_language.py`
- Modify: `obsidian_agent/catalog/actions.json`, `obsidian_agent/app.py`
- Test: `backend/packages/agent/tests/test_actions.py`

**Interfaces:**
- Produces in `language.py`: `LANGUAGES: dict[str, str] = {"en": "English", "es": "Spanish"}` (the codes and the names the prompt uses) and `def is_language(value: object) -> TypeGuard[str]`.
- `actions.json` gains `"prefs.set_language": { "kind": "direct", "sources": ["shell:language-menu"] }`.
- Handler: `context["language"]` not in `LANGUAGES` → `invalid`, message `"prefs.set_language needs a language: en or es."`; else `store.set_user_language(user.id, language)` and answer `{"ok": True, "user": _user_json(updated), "cart": [...]}`.
- `set_session(response, name, result)` sets the cookie only when `name == "session.switch_user"` (also on a replayed answer).
- `out_of_stock` answers carry `error.params`: `{"reason": "sold_out", "name", "count": 0}` when nothing is left; `{"reason": "all_in_cart", "name", "count": <qty in cart>}` when the cart already holds every unit; `{"reason": "only", "name", "count": <stock>}` when `cart.set_qty` asked for more than the stock. The English `message` stays as today. `action_error(user_id, code, message, params: dict[str, Any] | None = None)` adds `params` only when given.

- [ ] **Step 1: Write the failing tests** in `test_language.py` (helpers as in `test_persistence.py`: one `MemoryStore`, `_app`, `_as`; `_set_language(client, language, *, source="language-menu", request_id=None)` posts the action from `shell`):
  - `test_ana_starts_in_spanish`: as `ana`, `GET /api/session` → `language == "es"`; as `demo-user` → `"en"`.
  - `test_set_language_stores_it_and_answers_the_user`: as `ana`, set `en` → `ok`, `user == {"id": "ana", "name": "Ana", "language": "en"}`, a `cart` list; `/api/session` → `"en"`.
  - `test_set_language_rejects_an_unknown_language`: `"fr"`, `""`, `None` and a missing `language` → `invalid`; `/api/session` still `"es"`.
  - `test_set_language_only_from_the_language_menu`: from `shell`/`user-menu`, and from `shell`/`cart-drawer` → `invalid`.
  - `test_set_language_leaves_the_cookie_alone`: the response has no `set-cookie` header.
  - `test_chosen_language_survives_a_restart`: app 1 sets `ana` to `en`; app 2 on the same store (it seeds again) → `/api/session` as `ana` is `"en"`.
  - In `test_actions.py`, `test_out_of_stock_says_why`: stock 1, two adds → the second's `error == {"code": "out_of_stock", "message": …, "params": {"reason": "all_in_cart", "name": <name>, "count": 1}}`; a stock-0 product → `reason "sold_out"`, `count 0`; `cart.set_qty` to 5 with stock 3 → `reason "only"`, `count 3`.
- [ ] **Step 2: Run** `uv run --directory backend pytest packages/agent/tests/test_language.py packages/agent/tests/test_actions.py -q --no-cov` → FAIL.
- [ ] **Step 3: Implement** `language.py`, the registry entry, the handler, `set_session`'s name check, and the `out_of_stock` params.
- [ ] **Step 4: Run** `uv run --directory backend pytest packages/agent -q --no-cov` → PASS.
- [ ] **Step 5: Commit** `feat(agent): set the shopper's language through the action path; say why an add is refused`.

### Task 3: A run carries the language; an edit rewrites the page in it

**Files:**
- Modify: `backend/packages/agent/src/obsidian_agent/page_agent.py`, `obsidian_agent/prompts/page.md`, `obsidian_agent/app.py`
- Test: `backend/packages/agent/tests/{test_page_agent,test_prompt,test_language}.py`, and the existing `build_page` calls in tests (pass `language="en", page_language=None`)

**Interfaces:**
- Consumes: `LANGUAGES` (Task 2); `save_tab(…, language=)` (Task 1).
- Produces: `build_page(model, source, *, tools, surface_id, command, current, language: str, page_language: str | None) -> BuildResult` (`page_language`: the tab's stored language; `None` for a new page).
- `_request(command, current, *, language, page_language) -> str`: every request ends with the line `Write every text on the page in {LANGUAGES[language]}.` When `current` is not `None` and `page_language != language`, it adds before that line: `This page is written in {LANGUAGES[page_language]}; the shopper now reads {LANGUAGES[language]}. Define every section in root's children again, with its text in {LANGUAGES[language]}, as well as making the change.`
- `_accept(…, rewrite_all: bool)`: when `rewrite_all`, every ID in the new snapshot's `Page.children` must have a component in the reply's `updateComponents`; otherwise `_Rejected` with `Define every section again in {name}; these were left out: {ids}.` (IDs comma-separated, in page order). `build_page` passes `rewrite_all = current is not None and page_language != language`.
- `page.md`: "Write short, plain English." becomes a **Language** section: write all text (titles, kickers, verdicts, tags, chart titles, notes) in the language the request names; Spanish is Spain's Spanish, addressing the shopper as *tú*, with Spain's number style in prose ("1.899 €" is never written: prices come from the catalog); when the request says the page's language changed, define every section again in the new language, the one time an unchanged section is repeated. Keep the existing rule "Never repeat an unchanged section" and add "unless the request says the page's language changed".
- In `app.py` `run_steps`: `language = user.language` at the start of the run; `build_page(…, language=language, page_language=tab.language if current is not None else None)`; `save_tab(…, language=language)`.

- [ ] **Step 1: Write the failing tests:**
  - `test_page_agent.py::test_build_names_the_language`: `language="es"` → the first call's input ends with `Write every text on the page in Spanish.`; the system prompt is still `SYSTEM_PROMPT`.
  - `test_page_agent.py::test_edit_in_the_same_language_asks_only_for_the_change`: `current=_built()`, `language="en"`, `page_language="en"` → the input has no `Define every section`.
  - `test_page_agent.py::test_edit_in_a_new_language_must_redefine_every_section`: `language="es"`, `page_language="en"`, scripted replies: the `edit_add_colour.a2ui` block (defines only `colour`), then the `build.a2ui` block with `surface(update=true)` inserted after `<a2ui>` (defines every section) → `result.ok`, `attempts == 2`, the second call's input holds `these were left out: verdict, shelf, specs, charts`.
  - `test_page_agent.py::test_language_change_that_never_redefines_fails`: two `edit_add_colour` replies → `ok is False`, the snapshot is the current page.
  - `test_prompt.py::test_prompt_states_the_language_rules`: `PAGE_PROMPT` contains `the language the request names`, `Spain`, `tú`, and `unless the request says the page's language changed`; it no longer contains `plain English`.
  - `test_language.py::test_a_run_writes_in_the_shoppers_language`: as `ana`, a build → the model input names `Spanish`; the stored tab's `language == "es"`.
  - `test_language.py::test_switching_language_leaves_the_tab_alone`: `demo-user` builds (`en`), sets `es` → the tab's `language` is `"en"` and its snapshot unchanged.
  - `test_language.py::test_an_edit_takes_the_current_language`: then an edit whose scripted reply redefines every section → the tab's `language == "es"`, the model input holds `Define every section`.
  - `test_language.py::test_a_failed_edit_keeps_the_tab_language`: build in `en`, set `es`, an edit with two unusable replies → `edit_failed`; the tab is still `en` with the built snapshot. Same with the run timeout (monkeypatch `RUN_TIMEOUT_S` as `test_api.py::test_run_timeout_keeps_the_page` does).
- [ ] **Step 2: Run** `uv run --directory backend pytest packages/agent/tests/test_page_agent.py packages/agent/tests/test_prompt.py packages/agent/tests/test_language.py -q --no-cov` → FAIL.
- [ ] **Step 3: Implement** `build_page`'s parameters, `_request`, the `rewrite_all` check, `page.md`, and the app's run.
- [ ] **Step 4: Run** `uv run --directory backend pytest packages/agent -q --no-cov` → PASS.
- [ ] **Step 5: Commit** `feat(agent): write each run in the shopper's language; an edit rewrites the page in it`.

### Task 4: The web i18n module: bundles, plurals, `Intl` formatting, the provider

**Files:**
- Create: `web/src/i18n/en.json`, `web/src/i18n/es.json`, `web/src/i18n/i18n.ts`, `web/src/i18n/I18nProvider.tsx`, `web/src/i18n/i18n.test.ts`
- Modify: `web/tsconfig.json` (`lib` gains `"ES2023.Intl"` for `useGrouping: "always"`)

**Interfaces:**
- Produces in `i18n.ts`:
  - `type Language = "en" | "es"`; `LANGUAGES: readonly Language[] = ["en", "es"]`; `LANGUAGE_NAMES: Record<Language, string> = {en: "English", es: "Español"}`; `LOCALES: Record<Language, string> = {en: "en-IE", es: "es-ES"}`; `asLanguage(value: unknown): Language` (`en` for anything else).
  - `type MessageKey`: the keys of `en.json`, with a plural key's `.one`/`.other` suffix removed.
  - `translate(language: Language, key: MessageKey, params?: Record<string, string | number>): string`. A plural key is chosen with `new Intl.PluralRules(LOCALES[language]).select(params.count)`, falling back to `.other` (Spanish has a `many` category the bundles do not use). `{name}` placeholders are replaced from `params`; numbers in params are formatted with `formatCount`.
  - `hasMessage(key: string): key is MessageKey`.
  - `bundleProblems(a: Record<string, string>, b: Record<string, string>): string[]` (keys in one and not the other, placeholder sets that differ, empty values, a `.one` without its `.other`), used by the tests on the real and on fake bundles.
  - `formatMoney(cents: number, language: Language): string` (no decimals when `cents % 100 === 0`, else two; `useGrouping: "always"`), `formatCount(n, language)`, `formatRating(value: number, language)` (one decimal), `formatDate(at: Date, language)` (`{day: "numeric", month: "short"}`).
- Produces in `I18nProvider.tsx`: `I18nProvider({ language, children })` (the initial language) and `useI18n(): { language: Language; setLanguage(next: Language): void; t: (key: MessageKey, params?) => string; money(cents): string; count(n): string; rating(v): string; date(at: Date): string }`. Without a provider the context is English (existing tests render without one). The provider sets `document.documentElement.lang` to the language.
- The bundles: flat JSON objects, the keys and copy of the table below, in this order. A `.one`/`.other` pair is one plural message.

| Key | en | es |
|---|---|---|
| `shell.assistantBy` | assistant by Obsidian | asistente de Obsidian |
| `shell.prompt` | What are you shopping for? | ¿Qué estás buscando? |
| `shell.heroLead` | Tell us what it’s for. | Cuéntanos para qué lo quieres. |
| `shell.heroRest` | We’ll build you the shortlist. | Te preparamos una selección. |
| `shell.tabs` | Pages the assistant built | Páginas que ha creado el asistente |
| `shell.workspace` | AI workspace | Espacio de trabajo del asistente |
| `shell.assistant` | Assistant | Asistente |
| `shell.send` | Send | Enviar |
| `run.building` | Building comparison… | Preparando la comparativa… |
| `run.updating` | Updating this page… | Actualizando esta página… |
| `run.built` | Built | Creada |
| `run.justNow` | just now | ahora mismo |
| `run.updated` | Updated | Actualizada |
| `run.sectionsAdded.one` / `.other` | {count} section added / {count} sections added | {count} sección añadida / {count} secciones añadidas |
| `run.partsChanged.one` / `.other` | {count} part changed / {count} parts changed | {count} parte cambiada / {count} partes cambiadas |
| `run.pageUpdated` | page updated | página actualizada |
| `runError.unreachable` | Couldn't reach the assistant. Try again. | No se ha podido contactar con el asistente. Inténtalo de nuevo. |
| `runError.refused` | The assistant couldn't take this command. | El asistente no ha podido atender esta petición. |
| `runError.build_failed` | Couldn't build this page. | No se ha podido crear esta página. |
| `runError.edit_failed` | Couldn't change this page. | No se ha podido cambiar esta página. |
| `runError.timeout` | This took too long. Try again. | Ha tardado demasiado. Inténtalo de nuevo. |
| `runError.model_unavailable` | The model is unavailable. Try again. | El modelo no está disponible. Inténtalo de nuevo. |
| `runError.not_configured` | The assistant isn't set up on this server. | El asistente no está configurado en este servidor. |
| `runError.unknown` | Something went wrong. Try again. | Algo ha fallado. Inténtalo de nuevo. |
| `page.notShown` | Couldn't show all of this page. | No se ha podido mostrar toda la página. |
| `page.error` | Couldn't show this page. | No se ha podido mostrar esta página. |
| `cart.label` | Cart | Cesta |
| `cart.empty` | empty | vacía |
| `cart.cellEmpty` | Cart, empty | Cesta, vacía |
| `cart.cell.one` / `.other` | Cart, {count} item, {total} / Cart, {count} items, {total} | Cesta, {count} artículo, {total} / Cesta, {count} artículos, {total} |
| `cart.added` | {name} added to your cart | Se ha añadido {name} a tu cesta |
| `cart.addedNoName` | Added to your cart | Se ha añadido a tu cesta |
| `cart.addFailed` | Couldn't add to cart. Try again. | No se ha podido añadir a la cesta. Inténtalo de nuevo. |
| `cart.changeFailed` | Couldn't change your cart. Try again. | No se ha podido cambiar tu cesta. Inténtalo de nuevo. |
| `drawer.label` | Shopping cart | Cesta de la compra |
| `drawer.close` | Close | Cerrar |
| `drawer.emptyTitle` | Your cart is empty. | Tu cesta está vacía. |
| `drawer.emptyHint` | Ask for a comparison, then add the one you want. | Pide una comparativa y añade el que quieras. |
| `drawer.lineTotal` | {total} for {count} | {total} por {count} |
| `drawer.fewer` | One fewer {name} | Una unidad menos de {name} |
| `drawer.more` | One more {name} | Una unidad más de {name} |
| `drawer.quantity` | Quantity | Cantidad |
| `drawer.remove` | Remove {name} | Quitar {name} |
| `drawer.total` | Total | Total |
| `actionError.out_of_stock.sold_out` | {name} is out of stock. | No quedan unidades de {name}. |
| `actionError.out_of_stock.all_in_cart.one` / `.other` | No more {name} in stock: the last one is in your cart. / No more {name} in stock: all {count} are in your cart. | No quedan más unidades de {name}: la última está en tu cesta. / No quedan más unidades de {name}: las {count} están en tu cesta. |
| `actionError.out_of_stock.only.one` / `.other` | Only {count} {name} in stock. / Only {count} {name} in stock. | Solo queda {count} unidad de {name}. / Solo quedan {count} unidades de {name}. |
| `actionError.not_found` | This product is no longer available. | Este producto ya no está disponible. |
| `actionError.unknown` | Something went wrong. Try again. | Algo ha fallado. Inténtalo de nuevo. |
| `user.cell` | Shopper: {name} | Cliente: {name} |
| `user.switch` | Switch shopper | Cambiar de cliente |
| `user.switching` | Switching to {name}… | Cambiando a {name}… |
| `user.failed` | Couldn't switch shopper. Try again. | No se ha podido cambiar de cliente. Inténtalo de nuevo. |
| `language.cell` | Language: {name} | Idioma: {name} |
| `language.menu` | Language | Idioma |
| `language.failed` | Couldn't change the language. Try again. | No se ha podido cambiar el idioma. Inténtalo de nuevo. |
| `product.gone` | No longer available | Ya no está disponible |
| `product.loadFailed` | Couldn't load | No se ha podido cargar |
| `product.pick` | The pick | Nuestra elección |
| `product.rating.one` / `.other` | Rated {rating} out of 5 from {count} review / Rated {rating} out of 5 from {count} reviews | Valoración de {rating} sobre 5, {count} opinión / Valoración de {rating} sobre 5, {count} opiniones |
| `product.was` | was | antes |
| `product.save` | Save {amount} | Ahorras {amount} |
| `stock.out` | Out of stock | Sin stock |
| `stock.few.one` / `.other` | Only {count} left / Only {count} left | Solo queda {count} / Solo quedan {count} |
| `stock.in` | In stock | En stock |
| `buy.add` | Add to cart | Añadir a la cesta |
| `buy.addNamed` | Add {name} | Añadir {name} |
| `buy.addAria` | Add {name} to cart | Añadir {name} a la cesta |
| `buy.inCart` | In cart · View | En la cesta · Ver |
| `buy.inCartAria` | In cart · View {name} | En la cesta · Ver {name} |
| `page.products` | Products | Productos |
| `page.specs` | Specs | Especificaciones |
| `page.specColumn` | Spec | Característica |

(The probe panel's "Mount probe" is a developer tool behind a flag, not shopper copy; it stays in code.)

- [ ] **Step 1: Write the failing tests** in `i18n.test.ts`:
  - `the core bundles agree`: `bundleProblems(en, es)` is `[]`.
  - `a key in one language only is a problem`: `bundleProblems({a: "A", b: "B"}, {a: "A"})` names `b`; reversed, it names `b` too.
  - `a placeholder must appear in both languages`: `{a: "{name} x"}` vs `{a: "x"}` → one problem naming `a`.
  - `an empty message or a lone plural form is a problem`: `{a: ""}`; `{"n.one": "x"}` without `n.other`.
  - `formats money per language`: `formatMoney(189900, "en") === "€1,899"`; `formatMoney(189900, "es") === "1.899 €"`; `formatMoney(1850, "en") === "€18.50"`; `formatMoney(1850, "es") === "18,50 €"`; ES `500` → `"5 €"`, `99900` → `"999 €"`, `1249900` → `"12.499 €"`.
  - `formats counts, ratings and dates per language`: `formatCount(1240, "es") === "1.240"`, EN `"1,240"`; `formatRating(4.5, "es") === "4,5"`, EN `"4.5"`; `formatDate(new Date(2026, 10, 12), "en") === "12 Nov"`, ES `"12 nov"`.
  - `plurals and placeholders`: `translate("es", "stock.few", {count: 1}) === "Solo queda 1"`; `{count: 3}` → `"Solo quedan 3"`; `translate("es", "cart.cell", {count: 2, total: "1.948 €"}) === "Cesta, 2 artículos, 1.948 €"`; ES count `1000000` (CLDR `many`) falls back to `.other`.
  - `asLanguage keeps en or es and falls back to en`: `"es"` → `"es"`; `"fr"`, `undefined`, `3` → `"en"`.
  - `useI18n switches without a remount`: render a probe component inside `I18nProvider language="en"` that shows `t("cart.label")` and keeps a mount counter; call `setLanguage("es")` → it shows "Cesta", mounted once, `document.documentElement.lang === "es"`.
- [ ] **Step 2: Run** `pnpm --dir web exec vitest run src/i18n/i18n.test.ts` → FAIL.
- [ ] **Step 3: Implement** the bundles (copy exactly as in the table), `i18n.ts`, `I18nProvider.tsx`, the `lib` entry.
- [ ] **Step 4: Run** `pnpm --dir web exec vitest run src/i18n/i18n.test.ts` and `pnpm --dir web typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(web): add the EN/ES bundles, plurals and Intl formatting`.

### Task 5: Every fixed string from the bundle; the cartridge in both languages

**Files:**
- Modify: `web/src/App.tsx`, `web/src/shell/CartDrawer.tsx`, `web/src/shell/UserMenu.tsx`, `web/src/a2ui/catalog.tsx` (`formatPrice` goes; components use `useI18n().money`), `web/src/lib/cart.ts`, `web/src/lib/sse.ts` (a 4xx is `refused` with no server text), `web/src/lib/actions.ts` (`ActionResult.error.params`), `web/src/motion/choreography.ts` (`state` carries keys), `web/src/cartridge.ts`, `web/src/cartridges/halden/index.ts`, `web/src/cartridges/halden/specs.en.json`
- Create: `web/src/cartridges/halden/specs.es.json`
- Test: `web/src/App.test.tsx`, `web/src/shell/CartDrawer.test.tsx`, `web/src/a2ui/catalog.test.tsx`, `web/src/motion/choreography.test.ts`, `web/src/cartridge.test.ts`, `web/src/boundary.test.ts`, `web/src/i18n/i18n.test.ts`

**Interfaces:**
- Consumes: `useI18n`, `translate`, `hasMessage`, `bundleProblems`, the formatters (Task 4); `error.params` (Task 2).
- `CartridgeUI` changes to: `disclaimer: Record<Language, { shell: string; footer: readonly string[] }>`; `specs: Record<Language, Readonly<Record<string, { label: string }>>>`; `better: Readonly<Record<string, "higher" | "lower">>`. `specInfo(key: string, language: Language): SpecInfo` (the label in that language, else the English one, else the readable key; `better` from `cartridge.better`).
- `planRun(...).state` becomes `{ lead: "run.built" | "run.updated"; detail: { key: "run.justNow" | "run.sectionsAdded" | "run.partsChanged" | "run.pageUpdated"; count?: number } }`; `App`'s `Status.done` stores those and `StateText` translates at render, so a switch re-words a state field already showing.
- Copy by code: a `RUN_ERROR` shows `runError.<code>` when `hasMessage` says it exists, else `runError.unknown`. An action error shows `actionError.out_of_stock.<params.reason>` (with `name` and `count`) or `actionError.<code>`, else `actionError.unknown`; the user menu shows `user.failed` for any refusal. The server's `message` goes to `console.warn`.
- Halden: `specs.en.json` keeps only labels; `better` moves to `index.ts` (`hz`, `batt`, `p3`: higher; `de`: lower). Spanish disclaimer: shell `Demo conceptual · todos los productos, precios, valoraciones y pedidos son ficticios`; footer `["demo conceptual", "productos, precios y valoraciones ficticios"]`. `specs.es.json`:

| key | es | key | es | key | es |
|---|---|---|---|---|---|
| `display` | Pantalla | `p3` | Gama de color | `codecs` | Códecs |
| `hz` | Frecuencia de refresco | `de` | Error de color | `water` | Resistencia al agua |
| `cpu` | Procesador | `panel` | Panel | `switches` | Tipo de switch |
| `gpu` | Gráficos | `refresh_rate` | Frecuencia de refresco | `layout` | Distribución |
| `ram` | Memoria | `colour` | Color | `connection` | Conexión |
| `ssd` | Almacenamiento | `inputs` | Entradas | `capacity` | Capacidad |
| `batt` | Batería | `stand` | Soporte | `speed` | Velocidad |
| `weight` | Peso | `noise_cancelling` | Cancelación de ruido | `power_pass_through` | Carga pass-through |
| `ports` | Puertos | `battery` | Batería | `cable` | Cable |

- [ ] **Step 1: Write the failing tests:**
  - `i18n.test.ts::every installed cartridge has its glossary and disclaimer in both languages`: for each module of `import.meta.glob("../cartridges/*/index.ts", {eager: true})`, the `en` and `es` glossaries have the same keys and no empty label; both disclaimers have a non-empty `shell` and footers of equal length; every key in `better` is in the glossary.
  - `cartridge.test.ts`: `specInfo("hz", "es")` → `{label: "Frecuencia de refresco", better: "higher"}`; `specInfo("hz", "en")` → `{label: "Refresh rate", better: "higher"}`; `specInfo("warp_drive", "es")` → `{label: "Warp drive"}`.
  - `boundary.test.ts`: the names no core source may contain include both languages' disclaimers.
  - `choreography.test.ts`: the existing state expectations become keys, e.g. `{lead: "run.updated", detail: {key: "run.sectionsAdded", count: 1}}`.
  - `catalog.test.tsx::renders the page's fixed strings in Spanish`: the build fixture inside `I18nProvider language="es"` → "Nuestra elección", "Añadir a la cesta", "En stock" or "Solo quedan …", the price as `1.899 €` style text, the spec column "Frecuencia de refresco"; the footer reads the Spanish disclaimer; no text node or `aria-label` equals an English-only bundle value (helper `englishLeft(container): string[]` in `web/src/i18n/test-helpers.ts`: every element's trimmed own text, `aria-label`, `placeholder` and `title`, matched exactly against the `en` values that differ from `es` and have no placeholder).
  - `CartDrawer.test.tsx::the drawer in Spanish`: an empty cart shows "Tu cesta está vacía."; a line of 2 shows `por 2` and the total as `… €`; `englishLeft` is empty.
  - `App.test.tsx::the shell in Spanish`: inside `I18nProvider language="es"`, the landing shows "¿Qué estás buscando?" as placeholder, the cart cell reads "Cesta, vacía"; `englishLeft` is empty.
  - `App.test.tsx::a run error shows the bundle's words`: a mocked run ending in `RUN_ERROR {code: "edit_failed", message: "Couldn't change this page."}` under `es` → "No se ha podido cambiar esta página."; code `"brand_new"` → "Algo ha fallado. Inténtalo de nuevo."
  - `App.test.tsx::a refused add says why, in the shopper's language`: `cart.add` answered with `out_of_stock` / `params {reason: "all_in_cart", name: "Aeris Studio 16", count: 2}` under `es` → toast "No quedan más unidades de Aeris Studio 16: las 2 están en tu cesta."; an error `{code: "price_changed"}` → "Algo ha fallado. Inténtalo de nuevo."
  - Existing English expectations in these files stay as they are (they render without a provider, so in English).
- [ ] **Step 2: Run** `pnpm --dir web exec vitest run src/i18n src/cartridge.test.ts src/boundary.test.ts src/motion/choreography.test.ts src/a2ui/catalog.test.tsx src/shell/CartDrawer.test.tsx src/App.test.tsx` → FAIL.
- [ ] **Step 3: Implement** the cartridge changes and `specs.es.json`, then move every string in the Task 4 table out of the components into `t(...)`, every `formatPrice` into `money(...)`, the review count and rating into `count`/`rating`, the choreography state into keys, and the error copy by code.
- [ ] **Step 4: Run** `pnpm --dir web test` and `pnpm --dir web typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(web): take every fixed string from the EN/ES bundle; Halden in Spanish`.

### Task 6: The language menu, the shared ledger menu, the language at boot

**Files:**
- Create: `web/src/shell/LedgerMenu.tsx`, `web/src/shell/LanguageMenu.tsx`, `web/src/shell/LanguageMenu.test.tsx`
- Modify: `web/src/shell/UserMenu.tsx` (built on `LedgerMenu`), `web/src/App.tsx` (the language cell first in the ledger, as in `mockup/index.html` `#langBtn`), `web/src/main.tsx`, `web/src/lib/session.ts`, `web/src/lib/actions.ts` (`DISPATCHED_ACTIONS` adds `"prefs.set_language"`), `web/src/styles/shell.css` (only if the language cell needs more than `.cell`)
- Test: `web/src/lib/actions.test.ts`, `web/src/App.test.tsx`

**Interfaces:**
- Consumes: `prefs.set_language` (Task 2); `useI18n`, `LANGUAGES`, `LANGUAGE_NAMES`, `asLanguage` (Task 4).
- Produces in `LedgerMenu.tsx`: `LedgerMenu({ cell, cellLabel, menuLabel, head?, items, busy, onPick })` — the ledger cell button (`aria-haspopup="menu"`, `aria-expanded`), the portal menu (`role="menu"`), one `menuitemradio` per item (`{id, label, aside?, checked}`), the tick, placement under the cell, and the keys of `mockup/js/core.js` `menuKeys` (arrows, Home, End, Esc gives focus back to the cell, Tab or a click outside closes). This is `UserMenu`'s current behaviour, moved, not changed.
- Produces in `lib/session.ts`: `setLanguagePref(language: Language): Promise<ActionResult>` (`surfaceId "shell"`, `sourceComponentId "language-menu"`, `context {language}`); `bootLanguage(): Promise<Language>` (`asLanguage((await readSession()).language)`, `"en"` when the read fails).
- `LanguageMenu({ onNotice })`: the cell shows the code and the currency, `EN · €` (as the mockup's `#langLabel` and `.wide`), labelled `t("language.cell", {name: LANGUAGE_NAMES[language]})`; the menu lists `English` and `Español`, the current one checked. Picking the other: items disabled while the request is out; `ok` → `setLanguage(result.user.language)`, the menu closes, focus returns to the cell; a refusal or a thrown request → `onNotice(t("language.failed"))` in the language still current, the menu stays open and unchanged. Picking the current one just closes.
- `main.tsx`: `void bootLanguage().then((language) => createRoot(root).render(<StrictMode><I18nProvider language={language}><App /></I18nProvider></StrictMode>))`.

- [ ] **Step 1: Write the failing tests:**
  - `actions.test.ts`: `prefs.set_language` is a `direct` entry with source `shell:language-menu`, and it is in `DISPATCHED_ACTIONS`.
  - `LanguageMenu.test.tsx::switches the shell without a reload`: mocked `fetch` answers `prefs.set_language` with `{ok: true, user: {id: "demo-user", name: "Javier", language: "es"}, cart: []}`; inside `I18nProvider language="en"`, open the cell, pick "Español" → the posted body is `{name: "prefs.set_language", surfaceId: "shell", sourceComponentId: "language-menu", context: {language: "es", requestId: <uuid>}}`; the cell now reads `ES`; `browser.reload` (stubbed) was not called.
  - `LanguageMenu.test.tsx::a failed switch keeps the language`: the answer is `{ok: false, error: {code: "invalid", message: "…"}}`, then a rejected `fetch` → each time the notice is "Couldn't change the language. Try again.", the menu is still open, the cell still reads `EN`.
  - `LanguageMenu.test.tsx::keys move between the two languages`: ArrowDown/Home/End move focus; Esc closes and focuses the cell.
  - `App.test.tsx::switching language re-words the open page`: with the build fixture shown and the run's "Built · just now" field showing, switch to `es` → "Nuestra elección" on the page, "Creada · ahora mismo" in the field, the page's prose (`Three laptops for video editing under €2,000`) unchanged, and no component of the page mounted again (`mountCounts()` from `a2ui/probe.ts` is unchanged).
  - `App.test.tsx::bootLanguage reads the session`: `/api/session` for `ana` → `"es"`; a 500 → `"en"`.
  - The existing `UserMenu` tests in `App.test.tsx` pass unchanged on `LedgerMenu`.
- [ ] **Step 2: Run** `pnpm --dir web exec vitest run src/shell/LanguageMenu.test.tsx src/lib/actions.test.ts src/App.test.tsx` → FAIL.
- [ ] **Step 3: Implement** `LedgerMenu` (moved out of `UserMenu`), `UserMenu` on top of it, `LanguageMenu`, the session helpers, `main.tsx`, and the language cell in the ledger. Reuse the mockup's `.cell` and `.menu` visuals and motion (`mockup/css/overlays.css`, `mockup/js/core.js`); use the impeccable skill's guidance for the menu's states (pending, failed).
- [ ] **Step 4: Run** `pnpm --dir web test` and `pnpm --dir web typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(web): a language menu that switches the shell and pages without a reload`.

### Task 7: Docs, every check once

**Files:**
- Modify: `docs/ARCHITECTURE.md` (the i18n module and its rule: core copy in `web/src/i18n/`, a cartridge's text in its own folder in both languages; the server sends codes, the web words them; the language on users and tabs), `README.md` (the language menu in "Run the demo"), `CHANGELOG.md`, `ROADMAP.md` and the slices plan (slice 3 status), issue #16's checkboxes (ask before editing the issue).

- [ ] **Step 1: Edit the documents.**
- [ ] **Step 2: Run every check once**, with `docker compose up -d --wait postgres` and `OBSIDIAN_TEST_DATABASE_URL` set: `python scripts/check.py backend web` → exits 0, and the output shows `TestPostgresStore` ran (not skipped).
- [ ] **Step 3: Commit** `docs: record the language switch`.
- [ ] **Step 4: Hand the user the by-eye checklist:**
  - Without a model call: `python scripts/dev.py`; the ledger shows `EN · €` before the cart; switch to Español: the prompt, hero, cart cell and drawer read Spanish at once, no reload; prices read `1.899 €`; the menu looks and moves like the user menu and the mockup's; switch shopper to Ana: the app opens in Spanish with no English flash; set Ana to English, restart `dev.py`, reload: still English.
  - **Ask first (live model run):** as Ana, build a comparison: the title, verdict, tags and chart titles are Spain's Spanish, *tú*; as Javier, build in English, switch to Español: the page's prose stays English while its buttons, stock lines and prices turn Spanish; ask for one change: every section comes back in Spanish, and the state field says what changed.
