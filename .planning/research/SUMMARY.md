# Project Research Summary

**Project:** Barahlo — учёт корпоративной техники · milestone **v1.1 «Скорость и удобство»**
**Domain:** Milestone delta on an existing production app: five velocity/UX features (employee live search, ⌘K global palette, full-context CSV inventory report, device cloning, bulk issue/return) added to a Next.js 16 App Router RSC + better-sqlite3/drizzle single-operator device registry (Russian UI, 50–200 employees, hundreds of devices, LAN Docker deploy)
**Researched:** 2026-09-15
**Confidence:** HIGH overall — Stack / Architecture / Pitfalls verified against the actual codebase, installed node_modules and the npm registry on 2026-09-15; Features (UX conventions) MEDIUM — cross-checked across ≥2 independent sources per load-bearing claim

> This summary covers the **v1.1 milestone delta** and replaces the v1.0 research summary. v1.0 outcomes (D-16 «инвентарник назначается вручную из 1С», D-17 UNIQUE normalized codes, D-18 zero-drift export, append-only movements with triggers, T-03-01 `requireSession()`-first perimeter, G-5-1/G-5-2 debounce scars, echo-values discipline) are shipped code and standing invariants. They are not re-litigated here — but every new code path must **reuse** their fixes.

## Executive Summary

v1.1 adds five speed features to an app that already works, and the research converges on an unusual headline: **zero new npm dependencies for the entire milestone**. Every feature is a composition of already-installed, UAT-proven capabilities — the devices search-island pattern (300 ms debounce + lastSynced/inFlight echo reconciliation that survived two keystroke-loss UAT bugs), the Base UI dialog/combobox wrappers in `components/ui/`, the hand-rolled CSV route with its CWE-1236 injection guard, and transactional movement helpers with guard-UPDATE semantics. The one genuinely contentious call — whether the ⌘K palette needs `cmdk` — resolves firmly against it: cmdk hard-depends on four `@radix-ui/*` packages, dragging a second overlay/focus stack into a Base UI-only app (~+15 kB, duplicated a11y) for functionality the existing combobox + dialog composition already ships; even shadcn's "base" Command is cmdk-backed underneath. This milestone buys *code*, not *packages*; the Docker image and its source-built sharp are untouched.

The recommended approach is a five-slice build order with one hard dependency and deliberate risk isolation: **(1) employee live search first** — it produces the shared pieces the palette composes (`employeeSearchPredicate` with the Ё/ё fold, `employees/query-params.ts`, the debounce hook extracted behavior-preservingly from `DeviceSearchBox`); **(2) the CSV full-context report** — independent, smallest diff (four per-type columns added to the *existing* export route; never a second route, per D-18); **(3) device clone** — independent, but carries the milestone's only possible schema touch (nullable serial via the proven NULL-pair migration), a decision that must be made at planning, before build; **(4) bulk issue/return** — the largest UI refactor (row restructure so checkboxes live outside the row `<Link>`, plus a children-as-props selection island); **(5) the ⌘K palette last** — pure additive UI plus one authenticated search surface, delivering the headline UX once both search backends exist. Every new server surface starts with `requireSession()`; every search composes the existing `norm()`/`searchPredicate` machinery rather than re-spelling a LIKE.

The risks are not scale (hundreds of rows, one synchronous writer, queries measured at 0.76 ms @ 600 rows) but **drift and Cyrillic/UX edge cases**, all cheap to prevent in the right phase and annoying if discovered late: ⌘K bound to `event.key` is dead on the ЙЦУКЕН layout (match `event.code === 'KeyK'`); a palette that caches results goes stale after every movement action, and a second hand-rolled LIKE path diverges from the registry — «палитра находит, список — нет» is the cardinal bug of this milestone; cloning trips the UNIQUE serial constraint and collides with D-16 inventory governance unless the clone copies no identity fields and inventory auto-increment ships as an *editable suggestion computed in-transaction*, not a write policy; bulk actions need all-or-nothing semantics with up-front validation, or the operator cannot tell whether 0, 7 or 20 devices were written; and every new CSV cell must flow through `buildCsv`/`esc`, or formula injection returns through the new columns. PITFALLS.md maps all 13 pitfalls to phases with concrete UAT checks, including a «looks done but isn't» checklist the roadmapper should treat as acceptance-criteria seeds.

## Key Findings

### Recommended Stack

Full detail in [STACK.md](./STACK.md). **Install nothing.** All five features are compositions of the installed stack (Next 16.3.3, React 19.2.8, @base-ui/react 1.7.0, better-sqlite3 13.0.3, drizzle 0.45.2). The optional @base-ui/react 1.7→1.8 bump should **not** ride along with this milestone.

**Composition decisions (all argued against a named alternative):**
- **⌘K palette:** existing `components/ui/dialog.tsx` + `components/ui/combobox.tsx` (Base UI 1.7) + a ~10-line `useEffect` hotkey listener — **not** cmdk 1.1.1 (drags Radix into a Base UI app) and **not** react-hotkeys-hook (one hotkey doesn't justify a dep).
- **Search:** LIKE over `norm()`-folded columns via the existing deterministic UDF — **not** FTS5 (token semantics lose substring matching, unicode61 folds differently from the homoglyph-aware `norm()`, migration weight for zero perceivable gain at this scale).
- **CSV:** `lib/csv.ts` unchanged (`buildCsv`/`esc`/`csvResponseHeaders` — BOM, «;», CRLF, CWE-1236 guard) — parsers (papaparse/json2csv/csv-stringify) remain prohibited; the injection guard must stay hand-rolled anyway.
- **Bulk selection:** one client island holding `Set<number>` on Base UI checkboxes — **not** TanStack Table or any selection library (20 server-rendered rows/page, URL-owned filters).
- **Transactions:** better-sqlite3 `db.transaction` — a throw propagating out rolls back the whole batch (verified from installed transaction.js); nested `transaction()` calls become savepoints; never async inside `transaction()`.

### Expected Features

Full detail in [FEATURES.md](./FEATURES.md). All five features are committed for v1.1; the question is per-feature scope and ordering.

**Must have (table stakes):**
- **Employee live search:** debounced input with instant echo, `?q=` URL-as-state, match on name AND department with norm-folding, reset to page 1, distinct «Ничего не найдено» empty state, pending indicator that never blocks typing.
- **⌘K palette:** hotkey **plus** a visible button with «⌘K» hint; grouped results («Устройства», «Сотрудники», «Переход», «Действия») that auto-hide when empty; ↑↓/Enter/Esc keyboard loop; non-empty default state; «Ничего не найдено»; per-group cap (~5–8) with a «Показать все» escape hatch deep-linking into the list with `?q=`; select → `router.push` → close — **no forms inside the palette**.
- **CSV ведомость:** superset column list (инвентарник, серийник, тип, модель, статус, сотрудник, отдел, per-type config columns, стоимость, даты, гарантия, заметки); **ignores current filters — always the full dump**; same export contract (requireSession-first, BOM/«;», esc); warranty status as TEXT from the same `warrantyPredicate` behind the colors (parity-by-construction, a8c2bf7); ISO dates; sparse per-type columns (NOT one merged «Конфигурация» text — breaks Excel pivots).
- **Clone:** «Дублировать» opens the regular create dialog prefilled from the source; **serial cleared** (physically unique); инвентарник auto-suggested, editable; **photos/timeline/owner never copied**; clone starts «на складе», unassigned, empty timeline; purchase date/cost/warranty copied (same procurement batch).
- **Bulk issue/return:** row checkboxes + tri-state header («выбрать страницу»); floating action bar «Выбрано: N · Выдать · Принять · Снять»; one dialog, one employee combobox for the whole batch (the real flow is a workplace set to ONE person); per-item server-side validation with all-or-nothing writes and a result report; selection clears only on confirmed success; no heavy «вы уверены» ceremony.

**Should have (v1.1.x polish):** clone N-batch («Количество: 20» — THE stated scenario, but single-shot works day one); palette recents (localStorage, pruned against archived/disposed); match highlighting in search results (only if a clean-match implementation holds up across norm-folding); «Добавлен» column and dashboard «Ведомость» button as cheap adds.

**Defer / anti-features (explicitly rejected by research):** cross-page «select all by filter» (redundant with «Вернуть всю технику» + filters); in-palette forms/multi-step flows (complexity trap); undo for bulk ops (inverse movements + timeline noise); XLSX/PDF/depreciation/fuzzy search/barcode printing (enterprise ITAM gravity, all Out of Scope); command-registry/plugin architecture (over-engineering for one operator).

### Architecture Approach

Full detail in [ARCHITECTURE.md](./ARCHITECTURE.md). Everything extends the existing app in place; the consolidated file map is 6 new files + 12 modified files, with `lib/csv.ts`, `filter-bar.tsx`, `proxy.ts` and `db/index.ts` untouched. Standing invariants every feature must respect: schema changes only via drizzle-kit generate + migrate (never push); movements is append-only (triggers enforce it); each list has exactly one pure query-params module its client islands import (functions never cross the RSC boundary); `deviceWhere`/`searchPredicate` stay co-located in `db/queries/devices.ts` and every consumer composes them; `requireSession()` is the first statement of every action and route (the proxy does not cover server actions); query modules stay pure/sync (vitest-importable), actions add session + zod + refresh.

**Major components:**
1. **Shared debounce engine** (`components/debounced-search.ts`, extracted from `DeviceSearchBox`) — the lastSynced/inFlight reconciliation as a hook parameterized by an imported query builder; reused by the employees search and the palette input.
2. **Search predicates** — `employeeSearchPredicate` (new, with a search-time Ё/ё fold on both SQL and JS sides) composes into `listEmployees` (count and rows share ONE predicate) and the palette's `searchEmployees`; `searchDevices` composes the existing module-private `searchPredicate`.
3. **Palette** (`app/(app)/command-palette.tsx` mounted in the (app) layout beside `nav.tsx`) + one new authenticated search surface; flat `PaletteItem[]`, one keyboard model, section headers derived at render; archived employees shown with an «архив» badge.
4. **Clone** (`cloneDevices` in `db/queries/devices.ts`) — one transaction for the whole batch, prefix-scoped max+1 inventory computed inside the tx (zero-padding preserved, NULL when unparseable), per-clone serials, status reset to in_stock.
5. **Bulk** (`selection.tsx` island as children-as-props provider + `bulkAssignDevices`/`bulkAcceptDevices` in `movements.ts`) — one tx per batch, guard-UPDATE per device (`changes===0 → ILLEGAL_TRANSITION`), one movement event per device with shared `occurredAt`/comment, zod-capped ids array (≤50), selection explicitly **not** in URL params.

### Critical Pitfalls

Full detail (13 pitfalls + tech-debt patterns + UAT checklist) in [PITFALLS.md](./PITFALLS.md). Top 5 plus the every-phase rule:

1. **⌘K dead on the Russian keyboard layout** — `event.key` is the produced character («л» on ЙЦУКЕН); match `event.code === 'KeyK'` + meta/ctrl. A one-line decision at implementation time; discovered later it's a support ticket. UAT with RU layout active.
2. **Palette data path — stale results, auth leakage, hydration cost** — fetch per open + on debounced keystrokes, never persist results across close/navigation; `requireSession()` first; compose the existing predicates (a second LIKE path diverges within one milestone); LIMIT-capped results navigated by id (names are non-unique, D-04).
3. **Palette as a second dialog** — while any other dialog is open, ⌘K is inert (the simplest robust rule for a single-operator tool); otherwise Escape-top-only / scroll-lock refcount / focus-return must be UAT-verified.
4. **`norm()` does not fold Ё/ё** — «Елкин» never finds «Ёлкин»; fold at search time on both sides (`replace()` in SQL + JS), leave stored data and the fixture-guarded `normalizeNumber` untouched; share the fold helper between list search and palette.
5. **Clone vs UNIQUE serial + D-16 inventory governance** — clone never copies serial/inventory/photos/movements; one tx per batch (a mid-batch throw rolls back everything); inventory auto-increment is an editable in-tx suggestion with NULL fallback, never a silent write policy (record the D-16 tension in Key Decisions when it ships).
6. **Every phase:** `requireSession()` is line one of every new action/route (server actions are directly POST-able; the proxy perimeter does not cover them) — grep-verified, plus one curl-without-cookie check per new surface.

Honorable mentions that shape plans: search + pagination interplay (count shares the predicate, page clamp, every link rebuilds the FULL query string); never rewrite the live-search island from scratch (re-imports G-5-1/G-5-2); CSV join fan-out (JOIN only along primary keys; per-device aggregates come from a separate grouped query merged in JS); double-submit (`isPending` + re-entrant guard ref — a disabled button alone is not enough).

## Implications for Roadmap

Based on combined research, a **five-phase milestone** (plus a named polish backlog). One hard dependency exists (Phase 1 → Phase 5); the rest is risk-isolation ordering chosen for review size and churn separation.

### Phase 1: Employee live search
**Rationale:** Foundation slice — produces `employeeSearchPredicate` (with the shared Ё/ё fold helper), `employees/query-params.ts`, and the extracted debounce hook. The palette composes all three; building it first removes rework. The behavior-preserving `DeviceSearchBox` refactor onto the hook is safest before any new UI piles on.
**Delivers:** Live name/department search on the employees page with URL state, page reset, empty states, pagination parity.
**Addresses:** FEATURES Category 1 table stakes (highlighting deferred to polish).
**Avoids:** Pitfalls 4 (Ё fold), 5 (search+pagination), 6 (island rewrite).
**Plan must include:** a manual UAT checklist for the extracted hook (no component tests exist): type-then-Back/Forward adopt, trailing space mid-composition (G-5-2 rerun), Enter commits immediately, «%» matches literally, `?q=` + `?page=999` clamps, links carry full state.

### Phase 2: CSV full-context ведомость
**Rationale:** Fully independent, smallest diff (2 files + tests), zero coupling with other phases — a clean warm-up that can even run parallel to Phase 1.
**Delivers:** The existing export route extended in place: per-type columns (диагональ, тип матрицы, порты, вид периферии) as sparse typed columns; warranty-status text column from `warrantyPredicate`; row-count parity with the registry.
**Addresses:** FEATURES Category 3 (table stakes + «Добавлен» column and dashboard button as cheap adds).
**Avoids:** Pitfalls 7 (fan-out/second-route drift), 8 (injection via new columns); auth-preamble checklist line.
**Plan must include:** exact column enumeration with source tables; injection-matrix test extension; no `leftJoin` onto one-to-many tables.

### Phase 3: Device clone (single, with N-batch as the extension)
**Rationale:** Independent of Phases 1–2, but decision-heavy: the serial-nullable migration is the milestone's **only schema touch** and must be resolved at planning and migrated FIRST if accepted. N-batch («Количество: N», cap ≤20) extends the same dialog/action in one transaction — fold it in here or hold it as the first polish item; research supports either.
**Delivers:** «Дублировать» on card (and optionally row menu), prefilled create dialog, serial blank by design, inventory suggestion computed in-tx (padding preserved, NULL fallback, «Предложен автоматически — проверьте с 1С» label), zero photos / empty timeline.
**Addresses:** FEATURES Category 4 table stakes (+ the N-batch differentiator).
**Avoids:** Pitfalls 9 (serial UNIQUE), 10 (inventory policy), 11 (copied relations).
**Plan must include:** the copy/reset table (it doubles as UI copy); the serial decision ((b) NULL-pair migration recommended vs (a) required-serials wart); the `received`-movement-on-clone decision.

### Phase 4: Bulk issue/return
**Rationale:** Independent at the query/action layer, but the largest UI refactor (row restructure: checkbox as sibling outside the `<Link>`; children-as-props selection island over the server-rendered list). Doing it after clone keeps `actions.ts`/`movement-schema.ts` churn in two reviewable steps.
**Delivers:** Page-scoped selection (resets on navigation — documented v1.1 scope), floating action bar with count, batch issue to one employee / batch accept, all-or-nothing with up-front status validation («Не удалось выдать: „Ноутбук X" уже выдан» — nothing written), one movement event per device, double-submit protection.
**Addresses:** FEATURES Category 5 table stakes (cross-page selection, undo, bulk attribute edit are anti-features).
**Avoids:** Pitfall 12 (partial failure / selection loss / double-submit) + 13.
**Plan must include:** the failure-policy sentence verbatim («all-or-nothing + up-front validation» — it determines both the query and the UI copy); verification of the selection-provider placement claim against the `(app)`/`(card)` route split (see Gaps); zod ids cap (50 recommended).

### Phase 5: ⌘K global palette
**Rationale:** Last by hard dependency — composes `searchDevices` (exists) + `searchEmployees` (Phase 1) behind one new authenticated search surface; pure additive UI otherwise. Delivers the headline UX once both backends exist. The «Скачать ведомость» action item lands free after Phase 2.
**Delivers:** Global hotkey (layout-independent) + visible button; grouped, capped results with «Показать все» escape hatch; navigation by id; static default state («Переход» + «Действия»); recents deferred to polish.
**Addresses:** FEATURES Category 2 (static default first, recents in polish).
**Avoids:** Pitfalls 1 (RU layout), 2 (dialog stacking rule), 3 (data path); auth-preamble checklist line.
**Plan must include:** the `event.code` decision; the stacking rule; the search-surface contract (requireSession first, LIMIT 8+8, per-open fetch, no persistence, composed predicates, `no-store` if a route).

### Phase Ordering Rationale

- **1 → 5 is the only hard dependency:** the palette's employee half and its input reuse the Phase-1 predicate, fold helper, and debounce hook; extracting them once avoids two implementations of the matching logic — the drift the research calls the cardinal bug of this milestone.
- **2 early because it is risk-free:** zero coupling, smallest diff, independent of list-page churn; also unblocks the palette's «Скачать ведомость» action.
- **3 before 4** so `actions.ts` churn arrives in two reviewable steps, and so the schema decision (if accepted) lands while the milestone is still early.
- **5 last** keeps the most pitfall-dense UI work (stacking, hotkey, data path) on top of stable backends.
- **Polish backlog (v1.1.x):** clone N-batch (if not folded into Phase 3), palette recents, match highlighting. **Never:** cross-page select-all, in-palette forms, bulk undo, XLSX/PDF/depreciation, fuzzy search.

### Research Flags

Phases likely needing deeper research or a resolved decision during planning (`/gsd:plan-phase --research-phase`):
- **Phase 3 (Clone):** decision-heavy rather than research-heavy — serial-nullable migration (accept/decline), `received` event on clone (and on plain create?), inventory-suggestion policy vs D-16. The mechanics are proven in-repo (`inventoryPair` NULL-pair recipe, `returnAllDevices` tx precedent); what's needed is a decision, then a migration.
- **Phase 4 (Bulk):** the App Router layout-persistence / provider-placement claim (FEATURES flagged it; ARCHITECTURE resolved it with page-scoped selection) is MEDIUM-confidence reasoning — verify against the actual route split during planning before committing the island design.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Employee search):** in-repo pattern proven by the devices page; pitfalls and UAT checklist fully enumerated.
- **Phase 2 (CSV):** D-18 contract documented and tested; column list enumerated by research.
- **Phase 5 (Palette):** Base UI dialog/combobox composition already in production (`movement-dialogs.tsx`, `employee-dialog.tsx`); the three palette pitfalls come with prescribed preventions and UAT steps.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every claim cross-checked against the actual codebase (`package.json`, `components/ui/*`, `db/queries/*`, `lib/csv.ts`, route handlers) and the npm registry on 2026-09-15; the zero-new-dependencies verdict is verified, not estimated |
| Features | MEDIUM | UX conventions cross-checked across ≥2 independent design-system/primary sources per claim; domain-internal claims (layout persistence) explicitly flagged for phase-level verification |
| Architecture | HIGH | Every existing-module claim verified by reading the source this run; better-sqlite3 tx semantics verified from installed node_modules; Next 16.3.3 claims from bundled local docs |
| Pitfalls | HIGH | Codebase-grounded pitfalls verified against actual source; integration pitfalls (event.code, dialog stacking, double-submit) MEDIUM but multi-source corroborated, with official-docs anchors for installed versions |

**Overall confidence:** HIGH for what to build and how it integrates; MEDIUM for UX-convention details — the correct polarity, since implementation surfaces are code-verified while interaction polish is practitioner consensus.

### Gaps to Address

Decisions and verifications for planning (none block roadmap creation):

- **Serial-nullable migration (Phase 3):** accept (b) NULL-pair migration (recommended — batch serial-less peripherals are a live data-corruption pressure today) or ship (a) required-serials wart. Decides whether the milestone has a schema touch at all. Decide BEFORE build.
- **Palette transport disagreement:** STACK leans server action (`searchAll(q)`); ARCHITECTURE prescribes GET `/api/search` (idempotent, no RSC payload waste, export-route precedent); PITFALLS prefers the action, allows a route with `no-store`. The **contract** is load-bearing, not the transport: `requireSession()` first, LIMIT-capped, per-open + debounced fetch, no persistence across close, composed predicates. Pick one in planning and move on.
- **Palette filtering location:** FEATURES suggested a client-side index filtered in JS; ARCHITECTURE/PITFALLS prescribe server-side filtering via the shared SQL predicates. **Recommendation: server-side** — one matching implementation (zero drift) and no stale-cache class; at hundreds of rows the debounced roundtrip is single-digit ms. Confirm in planning.
- **Inventory auto-increment vs D-16:** convergent recommendation across all four files — an editable suggestion computed inside the transaction (numeric-tail parse, padding preserved, NULL when unparseable, «предложен» label), never a silent write policy. Record the D-16 tension in Key Decisions when it ships.
- **`received` movement on clone (and plain create?):** timeline/feed consistency vs scope discipline — plain `createDevice` writes no event today; either accept the inconsistency or wire it in the same milestone.
- **Archived employees in the palette:** show with «архив» badge (recommended — an archived person's card is exactly what «кто это был?» needs) or active-only.
- **Bulk selection placement:** verify the children-as-props provider against the `(app)`/`(card)` route split during Phase-4 planning; page-scoped selection is accepted v1.1 scope, cross-page is a documented non-goal.
- **Search-box extraction has no component tests:** the Phase-1 plan must carry the manual UAT checklist (the hook is the most-reused new code in the milestone).

## Sources

Aggregated from the four research files; per-claim attributions live in each file.

### Primary (HIGH confidence)
- Codebase, read 2026-09-15: `db/schema.ts`, `db/queries/{devices,employees,movements}.ts`, `db/index.ts` (norm UDF), `drizzle/0000_amusing_talon.sql` (movements triggers), `app/(app)/devices/{page,filter-bar,search-box,query-params,actions}.*`, `app/(app)/employees/page.tsx`, `app/(app)/layout.tsx` + `nav.tsx`, `app/api/devices/export/route.ts`, `lib/{csv,normalize.mjs,device-schema,movement-schema}.ts`, `components/ui/{dialog,combobox,checkbox}.tsx`, `proxy.ts`, `tests/helpers.ts`, `package.json`
- better-sqlite3 v13 `transaction.js` from installed node_modules (rollback only on exception propagation; nested = savepoints)
- Next.js 16.3.3 bundled docs, `node_modules/next/dist/docs/` (proxy rename, server-actions body limit + refresh semantics, route handlers)
- npm registry, fetched 2026-09-15: @base-ui/react 1.8.0, cmdk 1.1.1 (+ manifest showing 4 @radix-ui deps), react-hotkeys-hook 5.3.3

### Secondary (MEDIUM confidence)
- Design systems / UX: PatternFly Bulk Selection; HashiCorp Helios Table Multi-Select; NN/g Bulk Actions guidelines; SaaS UI + Eleken bulk-action patterns; Solomon (ex-Linear) Designing Command Palettes; uxpatterns.dev Command Palette; shadcn/ui Command docs (base variant is cmdk-backed); Next.js Learn search + pagination; Aurora Scharff search-param filtering with useTransition
- Domain templates: AssetPrime, MapTrack, Kladana, FMX fixed-asset register column sets; shadcn.io duplicate-record block; Backpack clone operation; koder.ai layered duplicate defenses
- Platform specifics: MDN KeyboardEvent.code; ComfyUI #5252 + MS guidance (non-Latin hotkey failures); jQuery-UI / HeadlessUI #2324 / Drupal body_scroll_lock (stacked-dialog failures); React 19 useActionState double-submit mechanics; Wikimedia / Mozilla Discourse (Ё/ё search normalization)

### Tertiary (LOW confidence, non-load-bearing)
- cmdk ecosystem fragmentation around React 19 (cmdk-base, dip/cmdk, react-cmdk) — single source; supports the no-cmdk decision, which stands on local precedent alone
- FTS5-vs-LIKE scale crossover (~100k docs) — community consensus; irrelevant at hundreds of rows either way

---
*Research completed: 2026-09-15*
*Ready for roadmap: yes*
