# Pitfalls Research — v1.1 «Скорость и удобство» (5 new features on the existing app)

**Domain:** Adding employee live search, ⌘K palette, full-context CSV report, device cloning and bulk issue/return to a production Next.js 16 App Router RSC + server-actions app with better-sqlite3/drizzle (single-writer, WAL), Cyrillic data, one operator, Docker on Ubuntu amd64
**Researched:** 2026-09-15
**Confidence:** HIGH for codebase-grounded items (verified against the actual source: `db/schema.ts`, `db/queries/*.ts`, `app/(app)/devices/actions.ts`, `lib/csv.ts`, `search-box.tsx`, `proxy.ts`); MEDIUM for web-corroborated integration items; HIGH where pinned to official docs of the exact installed versions (Next 16.3.3 local docs, better-sqlite3 api.md)

**Already solved in v1.0 — do not re-litigate, but every new code path must REUSE the fix:** React 19 form reset → echo-values-in-state; Base UI combobox items-on-Root + value=display-string; search debounce races → lastSynced + inFlight echo absorption; LIKE → ESCAPE + 100-char cap; UTC vs Moscow → DISPLAY_TZ / formatWarrantyDate; drizzle-kit push → generate+migrate; module-level SQLite → lazy db singleton; CSV → BOM + «;» + esc() CWE-1236 guard; pagination → server-side page clamp.

---

## Critical Pitfalls

### Pitfall 1: ⌘K hotkey bound to `event.key` — dead on the Russian keyboard layout **[⌘K]**

**What goes wrong:**
The palette listener checks `e.key === 'k'`. On the ЙЦУКЕН layout the physical K key produces `event.key === 'л'`, so ⌘K does nothing for an operator who — in a Russian-language app — spends most of the day in the Russian layout. The feature reads as broken; it works only after switching to the Latin layout, which the user will do twice and then stop using the palette.

**Why it happens:**
`event.key` is the produced character, not the physical key. Every demo is recorded on a Latin layout, so the bug is invisible in development.

**How to avoid:**
Match on `event.code === 'KeyK'` together with `e.metaKey || e.ctrlKey` — `code` is the physical key identity and is layout-independent (MDN KeyboardEvent.code; ComfyUI frontend issue #5252 documents this exact Cyrillic failure; Microsoft's hotkey guidance for non-Latin locales says the same). The displayed hint can still say «⌘K». Ignore the event when a dialog/input owns it unless the palette is meant to stack (see Pitfall 2). Add a UAT step: enable Russian layout, press ⌘K.

**Warning signs:**
The keydown handler references `e.key` (or `e.key.toLowerCase()`) for the shortcut letter; no test with a non-Latin layout.

**Phase to address:**
⌘K palette phase — one-line decision at implementation time; discovered later it is a support ticket, not a bug report.

---

### Pitfall 2: Palette as a second dialog over the movement/employee dialogs — Escape, scroll-lock and focus stack conflicts **[⌘K]**

**What goes wrong:**
The app already ships Base UI dialogs (`components/ui/dialog.tsx` — Backdrop + Popup, both `z-50`). The palette is another dialog. When ⌘K fires while a «Выдать» dialog (with its employee combobox) is open, the classic stacked-modal failures appear: Escape closes both layers or the wrong one; each dialog applies its own body scroll lock and the lock clears when the *first* (not last) closes; focus is trapped into the palette and returns to a closed dialog's trigger; the palette autofocus steals from the combobox mid-typing.

**Why it happens:**
Independent dialogs each listen for Escape and each toggle the scroll lock with no stack discipline — the documented jQuery-UI / HeadlessUI #2324 / Drupal body_scroll_lock failure class.

**How to avoid:**
Simplest robust rule for a single-operator tool: **while any other dialog is open, the ⌘K hotkey is inert** (a module-level "dialog open" flag set by the existing dialog wrappers, or checking `document.querySelector('[data-slot="dialog-content"]')`). This keeps the single-layer invariant the app was designed around. If true stacking is wanted, use Base UI's native nesting (render the palette inside the open dialog's tree) and verify three behaviors in UAT: Escape closes only the top layer; body scroll stays locked until the last layer closes; closing the palette returns focus into the still-open dialog, not to `document.body`.

**Warning signs:**
The palette's `open` state and the hotkey listener live entirely in a layout-level island with no knowledge of other dialogs; no UAT step opens a movement dialog first.

**Phase to address:**
⌘K palette phase — define the stacking rule in the plan before the island is written.

---

### Pitfall 3: Palette search data path — stale results, auth leakage, layout-level hydration cost **[⌘K]**

**What goes wrong:**
Three related mistakes when wiring palette results:
1. **Stale cache:** results fetched on first open are kept in module-level or context state. The palette is mounted in `app/(app)/layout.tsx`, which survives every navigation — after a movement action changes a holder, the palette keeps suggesting yesterday's state.
2. **Auth leakage:** the search runs through a route handler (GET) or an action without `requireSession()` first. Server actions are directly POST-able — the proxy perimeter does not cover them (the T-03-01 rule already established in this codebase); a GET search route additionally risks intermediary/static caching of results.
3. **Hydration cost:** the palette island hydrates a full result list, icons and item tree into *every* page because it lives at the layout level.

**Why it happens:**
The layout is the natural mount point for a global hotkey, and the natural mistake is to treat it like a normal page component with persistent data.

**How to avoid:**
- Mount only a tiny hotkey + closed-shell island in the layout; render the result UI exclusively while open. Fetch on every open and on debounced keystrokes (200–300 ms) via a server action; never persist results across close.
- `requireSession()` is the FIRST line of the search action (mirror `app/(app)/devices/actions.ts`); if a route handler is used instead, it must be `no-store`.
- Server side: one combined query that **composes the existing `searchPredicate`** for the devices half (escape, 100-char cap, homoglyph fold, norm() UDF — all already solved). A second hand-rolled LIKE path in the palette will drift from the registry search within one milestone.
- Results limited (e.g. 8 devices + 8 employees), navigated **by id** — employee names are deliberately non-unique (D-04); render department next to the name to disambiguate.
- The «показать все в реестре» fallback link must be built with `buildDevicesQuery` (the ONE query builder) — a hand-built `?q=` string is the drift path.

**Warning signs:**
A `useEffect` fetching results into module scope; a new `/api/search` route; the palette component tree rendered unconditionally in the layout; results keyed by name instead of id.

**Phase to address:**
⌘K palette phase — the data-path contract (action + limits + no persistence) belongs in the plan.

---

### Pitfall 4: Employee search misses Ё/ё because `norm()` does not fold it **[Employee search]**

**What goes wrong:**
`normalizeNumber` (lib/normalize.mjs) upper-cases and maps Cyrillic→Latin homoglyphs, but has no Ё→Е fold: `norm('Ёлкин')` → `'ЁЛКИН'`, while the operator who never types the diaeresis (most real-world Russian text omits it — Wikimedia folds ё→е in search for exactly this reason) searches `'ЕЛКИН'` and gets «ничего не найдено». The codebase *sorts* correctly (ruSortKey folds Ё in ORDER BY) but *matches* not at all. The gap hits employee names far harder than serials: surnames like Ёлкин, Ёжиков, Алёшин are common, and department names are user-entered.

**Why it happens:**
The fold was designed for serial/inventory numbers, where Ё never occurs; the fixture guard pins HOMOGLYPHS, so nobody re-examined the matching path when the search target became human names.

**How to avoid:**
Fold at **search time on both sides**, leaving stored data and `normalizeNumber` untouched: wrap the SQL side as `norm(replace(replace(name,'Ё','Е'),'ё','е')) like <pattern>` and apply the same JS replace to the query before normalizing it. This mirrors the existing ruSortKey recipe and changes no UNIQUE-indexed column, so no migration and no fixture-guard churn. Do **not** add Ё→Е into HOMOGLYPHS — that map is Cyrillic→Latin for serials and guarded by a fixture test.

**Warning signs:**
The employee search predicate is `norm(name) like …` copied from `searchPredicate` verbatim; the typing test never includes a Ё surname; a tester named «Алёша» is unfindable as «Алеша».

**Phase to address:**
Employee search phase — and the fold recipe must be shared with the palette's employee half (Pitfall 3), not implemented twice.

---

### Pitfall 5: Search + pagination interplay — query without a shared count, zero-page renders, and pagination links that drop `q` **[Employee search]**

**What goes wrong:**
`listEmployees` currently takes only filter/page/pageSize. Bolting `q` onto the rows query but not the count query (or vice versa) makes totals lie; a search that matches 3 rows while `?page=7` is in the URL renders an empty page or an out-of-range OFFSET; and pagination links built as `?page=2&filter=active` (the existing `buildQuery(filter, page)` signature has no `q`) silently discard the search the moment the operator pages.

**Why it happens:**
The existing helper predates search; extending the rows query feels like "the feature" and the count/links feel like plumbing.

**How to avoid:**
- One predicate shared by the count and the rows query — the exact `deviceWhere` pattern of `listDevices` (count and rows provably cannot drift).
- Keep the server-side clamp `current = min(max(1, page), pages)` — the zero-page-after-narrowing contract (known from v1.0) applies doubly when a search shrinks the result set under a stale `?page=`.
- Extend `buildQuery` to carry the full state (`filter`, `q`, `page`) and make every link rebuild the FULL query string — the v1.0 «bare ?page=2 drops the filter» lesson, now with one more param.
- Reuse the LIKE discipline: trim, `slice(0, 100)`, ESCAPE `\` for `%`/`_` — extract or copy the escape recipe from `searchPredicate`; a raw `%${q}%` without escape breaks on «100%» as a department/name fragment.

**Warning signs:**
Two different `where` objects for count and rows; `buildQuery` signature unchanged; a `?q=` param accepted without a length cap.

**Phase to address:**
Employee search phase — plan must name the count-with-search test (search + last page + next page).

---

### Pitfall 6: Rewriting the live-search island from scratch — reintroducing the G-5-1/G-5-2 debounce races **[Employee search]**

**What goes wrong:**
Employee live search needs exactly what `DeviceSearchBox` implements: local state, 300 ms debounce into `router.replace` inside `startTransition`, `lastSynced` stamped at push time, `inFlight` echo absorption. A "simpler" second island (naive `useEffect` on props adopting `q`, or a `<form action>` wrapper) re-loses keystrokes typed during flight (G-5-1) and eats trailing spaces mid-composition (G-5-2) — both were UAT-caught regressions in v1.0 with the scars recorded in Key Decisions.

**Why it happens:**
The existing component is heavily commented and looks over-engineered; the subtle invariants (push-time stamping, trim-aware echo absorption) look removable.

**How to avoid:**
Either extract the reconciliation logic into a shared hook/component parameterized by the query builder, or copy `DeviceSearchBox` verbatim and change only the builder (`?q=` for employees). Keep it a **controlled input outside any `<form>`** — React 19 resets uncontrolled forms after every action/navigation (the 4886f6a pattern). Accept external resets («Сбросить») only when the input is clean — the CR-01 rule.

**Warning signs:**
A new search component whose effect adopts the `q` prop unconditionally; `defaultValue` inputs; a debounce with no echo tracking.

**Phase to address:**
Employee search phase — and the extracted hook is then reused by the palette input (Pitfall 3).

---

### Pitfall 7: Full-context CSV — join fan-out duplicates devices with history, and drift from the registry page **[CSV report]**

**What goes wrong:**
Enriching the report with context (e.g. «последнее перемещение», «сколько раз выдавалась», photo count) by adding a JOIN onto `movements` or `attachments` multiplies rows: a device with 5 history entries becomes 5 CSV lines. The file then disagrees with the registry count, and audits stop trusting it. The second failure mode is column drift: a second export query (or a second route) that parses filters or strips sentinels slightly differently than `parseDevicesSearchParams` + `toDeviceListFilters` + `deviceWhere` — the exact drift the D-18 zero-drift contract was built to prevent (one parser, one predicate, one strip).

**Why it happens:**
"Full context" invites "just join the history table", and per-type config fields (screen, panel, ports, peripheral kind) tempt a purpose-built report query.

**How to avoid:**
- JOIN only along primary keys (`employees`, `departments` — cannot multiply, the existing `exportDevices` precedent). Any per-device aggregate comes from a **separate grouped query merged in JS** (the `listIssuedByEmployee` two-query pattern), never a join onto a one-to-many table.
- Extend the existing artifacts in place: new columns go into `DeviceExportRow` + the same `exportDevices` select + the same `HEADER` + the same route. Never a second route for the «ведомость».
- Sparse per-type columns: a monitor row has NULL ram/ssd/ports — render empty (the esc null → empty-field rule) and accept it; do not invent «—» or «нет» (which would conflict with the deliberate ramUpgraded three-state «да/нет/пусто» semantics).
- Assertion test for free: `CSV data-row count === count() over the same predicate` (already the v1.0 parity idea — keep it for the extended columns).

**Warning signs:**
A `leftJoin(movements…)` in the export query; a new `HEADER2`/route; a row-count mismatch in the first real export.

**Phase to address:**
CSV report phase — the plan should enumerate the exact new columns and their source tables up front.

---

### Pitfall 8: Formula injection returns through the NEW columns **[CSV report]**

**What goes wrong:**
The esc() guard (CWE-1236: leading `= + - @ TAB CR` → TAB prefix) lives in `buildCsv` and covers today's columns. The new report adds holder, department, config, cost columns — and any code that assembles the file with a raw `rows.map(r => [...]).join(';')` "just for the richer report" bypasses the guard. Employee names, department names, supplier and notes are free text entered by the user: a supplier named `@SUM(A1)` or a note beginning with `=HYPERLINK` becomes an executable formula when the file opens in Excel. A bypass also drops the BOM/CRLF/«;» contract that makes the file open correctly in RU Excel at all.

**Why it happens:**
The guard is one function in one module; the new feature's author reuses the *shape* of a CSV but not the *function*.

**How to avoid:**
Every cell of every column flows through `buildCsv`/`esc` — no raw join path exists, and a review rule makes that a blocker. New date columns render through `formatWarrantyDate` (UTC) only — a second formatter (`toISOString().slice(0,10)`) drifts after midnight in any non-UTC host (the known DISPLAY_TZ trap). Keep `purchasePrice` an integer cell — a decimal cost would break against the «;» list separator, and no totals row inside the data file (a «Итого» row corrupts machine-readability; totals live in the app).

**Warning signs:**
`.join(';')` or template-string CSV assembly anywhere outside lib/csv.ts; a new `Intl.DateTimeFormat` instance; a summary row appended to `cells`.

**Phase to address:**
CSV report phase — plus one vitest addition: injection matrix extended to the new columns.

---

### Pitfall 9: Clone trips the serial UNIQUE — and batch cloning multiplies it **[Clone]**

**What goes wrong:**
`serialNormalized` is UNIQUE and `serialNumber` is NOT NULL (db/schema.ts). Cloning copies the source row — including the serial — so the first clone of any device dies on `devices_serial_norm_uq` (or, in a batch of N clones with pasted-in serials, the k-th insert dies and, without a transaction, k−1 rows are already committed). `createDevice`'s `uniqueCodeOf` mapping exists but only helps if the action catches and echoes the field error.

**Why it happens:**
"Clone" is mentally "copy the row", and the unique columns are exactly the part that must NOT be copied.

**How to avoid:**
- Clone copies model, type, config, cost, supplier, warranty, notes — never serial, inventory, photos, movements, status/holder (status resets to `in_stock`, holder NULL).
- The clone form **requires a fresh serial per copy** (field required, dup → the existing «уже есть» field copy via `uniqueCodeOf`). For a batch of N: N serial inputs, with a JS pre-check for duplicates *within the batch* plus a zod refine — otherwise the mid-batch UNIQUE is the first detection.
- Wrap the whole batch in **one transaction** — better-sqlite3 rolls back everything on throw (verified against official api.md), which is the correct semantics: the operator cannot tell which of 5 partially-created rows exist. Map the caught failure to the offending copy's field error, all rows gone.
- Note: composing the existing `createDevice` (which opens its own transaction) inside an outer `db.transaction` works — nested calls become savepoints — but let the error propagate to the action for mapping.

**Warning signs:**
Clone form prefills the serial field; a batch loop of bare `createDevice` calls with no surrounding transaction; a catch that returns a generic error instead of the field copy.

**Phase to address:**
Clone phase — the "what is copied / what is reset" table belongs in the plan (it is also the UI copy).

---

### Pitfall 10: Inventory auto-increment — collisions, padding, and the conflict with D-16 **[Clone]**

**What goes wrong:**
The feature «автоприрост инвентарника» collides with three facts of the schema:
1. **D-16 says inventory numbers are manual, assigned by 1C.** A silent auto-assign creates numbers 1C will never agree with — a parallel numbering system, the exact «параллельная таблица» failure the project rejects elsewhere.
2. **Format fragility:** `Number('00041') + 1` → `42` (padding lost); non-numeric inventories (1C formats like `Б-001234`) make naive parsing produce garbage or crash.
3. **Collision handling:** "next = max + 1" computed outside the insert's transaction can propose a number that already exists (UNIQUE fires mid-batch).

**Why it happens:**
Auto-increment feels like a pure UI convenience, so the data-governance decision hides inside a form helper.

**How to avoid:**
Implement it as a **suggestion, not a write policy**: the clone form pre-fills «предложен: 00042» by parsing the numeric tail of the source's (or last device's) inventory — preserve zero-padding via string length, bail out to an empty field (NULL/NULL pair per `inventoryPair`) when the format isn't parseable — and the operator can edit or clear it before save. The UNIQUE index remains the backstop; a collision maps to the existing inventory field copy, never a 500. Compute the suggestion inside the same transaction as the insert (single sync writer makes this trivial and race-free).

**Warning signs:**
An UPDATE-free but *automatic* inventory number in the insert path; `Number()` on the inventory string; no edit affordance on the pre-filled value.

**Phase to address:**
Clone phase — plan must state "suggestion, editable, NULL when unparseable" and note the D-16 deviation explicitly in Key Decisions when it ships.

---

### Pitfall 11: Clone must not copy photos or movements — shared storage keys and falsified history **[Clone]**

**What goes wrong:**
Copying `attachments` rows to the clone makes two devices reference one `storage_key` on disk: deleting the photo on one device orphans (or double-deletes) the other's, and backups double-count. Copying `movements` rows is worse — it fabricates history («выдан Иванову 12.03» for a device that didn't exist then), violating the append-only audit contract that is the point of the movements table. Also note `movements.device_id` is FK-restrict: the copy would technically succeed only if re-pointed, and the DB triggers forbid ever correcting it.

**Why it happens:**
"Clone = copy everything" is the spreadsheet mental model; attachments/movements live in sibling tables and are easy to include "for completeness".

**How to avoid:**
Clone inserts **only a `devices` row** — exactly what `createDevice` does today (which also writes no «поступление» event; stay consistent with that precedent rather than inventing one for clones only). The clone's timeline starts empty and fills with its own real events. Photos are re-taken or re-uploaded per physical device — that is the domain reality (each box has its own sticker/scratch photos).

**Warning signs:**
`db.insert(attachments).values(source.photos.map(...))` or any `insert into movements` in the clone path; a clone card that shows the source's photos or timeline in staging.

**Phase to address:**
Clone phase — add "clone has empty timeline and zero photos" to the phase's UAT checklist.

---

### Pitfall 12: Bulk actions — partial failure semantics, selection loss, double-submit **[Bulk]**

**What goes wrong:**
The bulk issue/return action multiplies every single-device failure mode by the selection size:
1. **Partial batch failure:** one of 20 selected devices is already issued (guard-UPDATE `changes === 0` → `ILLEGAL_TRANSITION`, the D-08 server-side guard). Without a defined policy the operator gets a generic error and cannot tell whether 0, 7 or 20 devices were written.
2. **Selection state vs the RSC list:** selection lives in a client island over a server-rendered list. The search box fires `router.replace` 300 ms after every keystroke; any filter click re-renders the list — unchecked/phantom selection or selection referencing devices no longer visible.
3. **Optimistic clearing / double-submit:** clearing the selection before the action resolves destroys the retry path; a slow bulk action with no `isPending` guard lets a second click queue a duplicate batch (React 19 queues form actions; disabling the button alone is incomplete — Enter key still submits).

**Why it happens:**
Bulk is planned as "the single action in a loop" and the UI state around it (selection lifecycle, pending, failure report) is treated as trivial.

**How to avoid:**
- **All-or-nothing, with up-front validation.** Before the transaction, run one query: `select id from devices where id in (ids) and status <> <expected>` — if non-empty, return the offending devices («Ноутбук X уже выдан») and write nothing. Inside one transaction, loop calling the existing `assignDevice`/`acceptDevice` (nested transactions become savepoints — verified; a mid-loop throw rolls back everything). This matches the shipped `returnAllDevices` precedent and its error-copy promise. Per-item continue-with-report semantics are a v2 option only with an explicit per-item result UI.
- **One `movements` event per device** (never one merged event) — each device timeline must stand alone; same `occurredAt` and comment for the whole batch, mirroring `returnAllDevices`.
- **Input shape:** the action takes `ids: number[]` through zod (`z.array(IdSchema).max(~200)`), not per-device FormData — small payload (the Next server-action 1 MB body limit is irrelevant for ids; it becomes real only if files ever ride actions), bounded transaction.
- **Selection lifecycle:** scope selection to the current page; clear it whenever `q/type/status/dept/warranty/page` props change (an effect on the parsed filters, not on every render); keep it across the action's own revalidation (`refresh()` swaps rows, ids stable — restore ticks by id). Clear **only on confirmed success** — the echo-values discipline applied to selection.
- **Pending:** `useActionState`'s `isPending` disables the submit button *and* a guard ref ignores re-entrant submits; button copy «Выдаём…» while pending. One `refresh()` after the batch, not per device.

**Warning signs:**
A `for` loop of per-device server-action calls from the client (N round trips, N partial states); selection stored in URL params; optimistic `setSelection([])` before awaiting the action; no status pre-check query.

**Phase to address:**
Bulk phase — the failure-policy sentence ("all-or-nothing + pre-validation") must appear verbatim in the plan; it determines both the query and the UI copy.

---

### Pitfall 13: New action/route without the auth preamble — the perimeter regression class **[all features]**

**What goes wrong:**
Every new server surface this milestone (palette search action, bulk action, clone action, extended export route) is directly POST-able or GET-able; the proxy default-deny perimeter does not cover server actions. Any of them shipped without `requireSession()` as the first statement is callable by anything on the LAN (the v1.0 threat model: a hostile LAN host reaching the full hardware registry). A GET search route adds a second exposure: cacheable responses.

**Why it happens:**
The action is "just an internal endpoint for my own UI"; the auth line feels redundant next to the proxy.

**How to avoid:**
House rule already established (T-03-01): `requireSession()` first, zod whitelist second, in every action and route handler — copy the header comment pattern from `devices/actions.ts` and the export route. Palette search must not be a GET route if avoidable; if it is, `no-store`.

**Warning signs:**
A new `'use server'` export whose first line is not `await requireSession()`; a new `app/api/**/route.ts` without it; grep finds `export async function` actions without the session call.

**Phase to address:**
Every phase — one checklist line in each plan; verified once per phase by curl without a cookie.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hand-rolling a second, "simpler" live-search island instead of extracting the DeviceSearchBox reconciliation | An afternoon saved | Re-imports the G-5-1/G-5-2 keystroke-loss class into a second page; two debounce implementations to keep in sync | Never — extract the hook once; two pages already need it |
| A second CSV route/query for the «ведомость» instead of extending the export in place | Feels cleaner to "not touch" the old export | Filter parsing and predicate drift; two files that disagree with each other and the registry | Never — the D-18 zero-drift contract exists precisely for this |
| Palette results cached at module level across navigations | One fewer fetch | Stale holder/status suggestions after every movement action; the palette becomes a liar | Never — fetch per open; queries are single-digit ms at this scale |
| Optimistic selection clearing / optimistic inventory assignment | Snappier feel | Failed batch wipes the operator's selection; invented inventory numbers diverge from 1C | Never — confirm-then-mutate-state (the echo-values discipline) |
| Per-item "continue on error" bulk semantics without a result UI | No up-front validation query needed | Silent partial writes; the operator's mental model («выдал 5») diverges from the DB («выдало 3») | Only with an explicit per-device result list in the response — default to all-or-nothing |
| Adding a `name_normalized` column + migration "for search" | Feels like the devices pattern | A migration + backfill + fixture churn for a 200-row table scanned in <1 ms | Not now — the search-time Ё-fold over the UDF is enough; revisit only if employees hit thousands |
| FTS5/virtual table "since we're doing search" | Feels like the grown-up solution | A second index to maintain, tokenizer fights Cyrillic, no substring semantics by default | Never at hundreds of rows — LIKE + norm() UDF is measured fast (0.76 ms class) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Russian keyboard layout → global hotkey | Matching `event.key` for ⌘K | `event.code === 'KeyK'` + meta/ctrl (Pitfall 1); UAT with RU layout active |
| Base UI dialog + palette stacking | Assuming two independent Dialog Roots nest correctly | Suppress ⌘K while another dialog is open, or verify Escape-top-only, scroll-lock refcount, focus return (Pitfall 2) |
| Next.js server actions (16.3.3) | Assuming unlimited payloads | 1 MB default `serverActions.bodySizeLimit` (local docs); ids arrays are fine — never ship photos through actions |
| better-sqlite3 transactions | Treating bulk loop as "the DB handles it" | Exceptions roll back the whole tx (verified); nested `transaction()` calls become savepoints; never `async` inside `transaction()` |
| Excel opening the extended report | New columns assembled outside `buildCsv` | Every cell through `esc()`; BOM/«;»/CRLF only via `buildCsv`; dates only via `formatWarrantyDate` |
| React 19 + form actions | Button `disabled` as the only double-submit guard | `isPending` + re-entrant guard ref; Enter key bypasses a disabled button in some flows |
| Route-level loading states | Adding `loading.tsx` to a new segment (clone page, palette deep-links) and breaking the 404 contract | Keep the (card) route-group workaround; don't add segment loading around `notFound()` paths |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Palette search firing a server action per keystroke (no debounce) | Network log floods; janky typing | Reuse the 200–300 ms debounce + echo absorption pattern | Immediately with a fast typist |
| Unbounded palette results ("show everything") | Payload bloat, unusable list | LIMIT 8+8 rows, «показать все» deep-links into the registry with `q` | First test with a common letter («а») |
| Bulk action as N client-side server-action calls | N round trips, N loading states, partial writes | One action, one ids array, one transaction | At the first multi-device batch |
| Unbounded batch clone (N = «сколько угодно») | Giant form, giant tx, one bad serial kills all | Cap N in the UI and zod (e.g. ≤ 20) | First bulk purchase of 50 cables |
| COUNT over the search predicate per keystroke navigation | Fear, not fact | Fine at this scale — measured single-digit ms; do not cache counts | Only if data ever hits tens of thousands |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Palette search action without `requireSession()` | LAN-wide device+employee directory leak via direct POST | requireSession first — every action, every route (Pitfall 13) |
| GET search/export route without `no-store` | Results cached by intermediary/proxy; costs and holders leak | Server action preferred; `Cache-Control: no-store` if a route is unavoidable (the export route already sets it) |
| New CSV columns bypassing esc() | Formula execution in Excel from user-entered name/notes cells | Single buildCsv path (Pitfall 8); injection-matrix test extended |
| Bulk/clone actions trusting client-sent status/holder | Forged POST flips custody of arbitrary devices | Statuses never in the payload — guard-UPDATE decides from the row (existing C1 discipline); zod whitelist on ids |
| Error copy leaking internals (`ILLEGAL_TRANSITION`, SQL text) to the new UIs | Fingerprinting, confusion | The V7 rule: generic Russian copy only; per-device failure reports name devices, not error codes |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Palette results keyed/titled by name alone | Two «Иванов Иван» are indistinguishable (names are non-unique by D-04) | Show `имя · отдел` (and type/status/holder for devices); navigate by id |
| Employee search ignoring the active/archive segment | Operator searches «Активные», results silently include (or worse, exclude) archived people | `q` composes WITH the segment filter; archived hits (in palette/global search) are labeled «в архиве» |
| Clone dialog prefilling the serial | Operator saves without noticing → UNIQUE error loop, or worse a habit of "serial + 1" | Serial empty by design, placeholder «Серийный номер нового устройства»; inventory labeled «предложен» |
| Bulk bar silent about scope | «Выдать» clicked with 3 of 5 ticks actually applied, 2 invisible rows selected on another page | Bar shows «Выбрано 3 · Выдать»; selection is page-scoped and visibly cleared on filter change |
| Empty search state rendering as blank list | «Ничего не найдено» vs «Пока нет сотрудников» confusion | Echo the query in the empty state («Нет сотрудников по запросу „ёлк"») with a reset link |
| Inventory suggestion shown without provenance | Operator assumes the system now owns numbering (vs 1C) | Label «Предложен автоматически — проверьте с 1С» on the clone form |

## "Looks Done But Isn't" Checklist

- [ ] **⌘K:** opens with Russian layout active (`event.code` path); suppressed or correctly stacked while a movement dialog is open; Escape closes one layer; results fresh after a movement action (no stale cache)
- [ ] **⌘K auth:** search action answers 401/redirect via curl without a cookie; login page has no hotkey listener
- [ ] **Employee search:** «ёлк» finds «Ёлкин» and «Елкин» finds both; `?q=` + `?page=999` clamps; pagination links carry `q`+`filter`; «%» in the query matches literally
- [ ] **Employee search island:** typing «aspire 5 » (trailing space) through the debounce round trip loses nothing (G-5-2 rerun on the new page)
- [ ] **CSV report:** data-row count equals the registry's filtered count; every new column passes the injection matrix (`=SUM`, `@x`, `-1`, `+7` leading cells); sparse per-type cells render empty; dates dd.mm.yyyy
- [ ] **Clone:** duplicate serial → inline field error, zero rows written (check devices count); clone has empty timeline and no photos; zero-padded inventory suggestion keeps padding; unparseable inventory left empty
- [ ] **Bulk:** one already-issued device in the selection → nothing written and the message names it; two rapid clicks → one batch (isPending); selection survives `refresh()` revalidation but clears on filter change; timelines show one event per device
- [ ] **All new actions:** `requireSession()` is line one (grep-verified); zod whitelist on every input including `ids`

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| ⌘K shipped with `event.key` | LOW | One-line change to `event.code`; no data effects |
| Employee search shipped without the Ё fold | LOW | Add the replace() fold to the predicate (both sides); no migration — the fold is search-time |
| CSV fan-out discovered after real exports | MEDIUM | Fix the query; re-export; previously exported files are wrong on disk — notify the operator (single user) to discard them; no DB damage |
| Partial clone batch written (per-item semantics shipped) | LOW-MEDIUM | The incomplete rows have no movements — the one legitimate hard-delete case (v1.0 Pitfall 4 rule); delete via app path or rehearsed SQL, then fix semantics |
| Bulk partial writes already in history | MEDIUM | Append compensating `returned`/`assigned` events per affected device via the app — append-only log makes repair possible, never edit rows |
| Silent auto-assigned inventory numbers conflicting with 1C | MEDIUM | One-time reconciliation: edit numbers on affected devices to the 1C values (manual edit is the D-16 norm); switch the feature to suggestion mode |
| Palette stale cache shipped | LOW | Change to fetch-on-open; no data effects |

## Pitfall-to-Phase Mapping

Suggested v1.1 phase structure (roadmap will number; employee search precedes the palette because the palette reuses its predicate, fold and island):

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. ⌘K on RU layout | Palette phase (plan states `event.code`) | UAT: hotkey with RU layout active |
| 2. Dialog stacking | Palette phase (stacking rule chosen in plan) | UAT: ⌘K over movement dialog; Escape/focus/scroll-lock |
| 3. Palette data path | Palette phase (action + requireSession + limits in plan) | curl 401; stale-cache rerun after a movement; bundle: palette idle when closed |
| 4. Ё/ё fold | Employee search phase (shared fold helper) | «ёлк»/«Елкин» typing test; palette reuses the same helper |
| 5. Search + pagination | Employee search phase (count shares predicate; buildQuery carries q) | `?q=` + last-page + next-page test; links carry full state |
| 6. Island rewrite | Employee search phase (extract shared hook) | G-5-2 rerun (trailing space) on the employees page |
| 7. CSV fan-out/drift | CSV phase (columns enumerated; no new route) | Row-count parity test; grep: one export route |
| 8. Injection in new columns | CSV phase (buildCsv-only rule) | Injection matrix extended to new columns |
| 9. Clone serial UNIQUE | Clone phase (copy/reset table; one tx per batch) | Dup-serial → field error, row count unchanged |
| 10. Inventory auto-increment | Clone phase (suggestion policy; D-16 note) | Padding kept; unparseable → empty; collision → field copy |
| 11. Clone photos/movements | Clone phase (devices-row-only rule) | Clone card: empty timeline, zero photos |
| 12. Bulk semantics | Bulk phase (all-or-nothing + pre-validation sentence in plan) | Mixed-selection test writes nothing; double-click single batch; selection lifecycle |
| 13. Auth preamble | Every phase (plan checklist line) | Grep for requireSession-first; curl each new surface |

## Sources

- **Codebase-verified (HIGH):** `db/schema.ts` (UNIQUE serial/inventory, NOT NULL serial, non-unique employee names D-04, no name index, movements append-only + FK restrict), `db/queries/devices.ts` (`searchPredicate` escape/cap/fold, `deviceWhere` single predicate, `uniqueCodeOf`, `inventoryPair` NULL pair), `db/queries/movements.ts` (guard-UPDATE C1 pattern, `returnAllDevices` all-or-nothing precedent), `db/queries/employees.ts` (no q support today, page clamp, ruSortKey Ё-fold in ORDER BY only), `lib/normalize.mjs` (norm() has no Ё→Е fold; HOMOGLYPHS fixture guard), `app/(app)/devices/actions.ts` + `search-box.tsx` (echo-values, lastSynced/inFlight, G-5-1/G-5-2), `app/api/devices/export/route.ts` + `lib/csv.ts` (D-18 zero-drift, esc() CWE-1236, header set), `proxy.ts` default-deny + actions-not-covered comment (T-03-01), `components/ui/dialog.tsx` (z-50 Backdrop/Popup), `package.json` (Next 16.3.3, React 19.2.8, @base-ui/react 1.7, better-sqlite3 13)
- **Official docs of installed versions (HIGH):** Next.js 16.3.3 server actions — 1 MB default body limit, `serverActions.bodySizeLimit` (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`); better-sqlite3 api.md — exception rolls back transaction, nested transactions become savepoints, no async in `transaction()`
- **[MEDIUM, web-corroborated]** [MDN KeyboardEvent.code](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code), [ComfyUI #5252 — shortcuts fail on non-Latin layouts](https://github.com/Comfy-Org/ComfyUI_frontend/issues/5252), [MS global hotkey guidance](https://learn.microsoft.com/en-nz/answers/questions/5884314/), [kevinsimper — shortcuts in other keyboard languages](https://kevinsimper.medium.com/why-keyboard-shortcuts-and-accessibility-in-other-keyboard-languages-rarely-works-8638abc15e71) — event.code vs event.key
- **[MEDIUM]** [SO — ESC closes all stacked dialogs](https://stackoverflow.com/questions/4744070/single-esc-closes-all-modal-dialogs-in-jquery-ui-workarounds), [HeadlessUI #2324](https://github.com/tailwindlabs/headlessui/discussions/2324), [Drupal body_scroll_lock refcount bug](https://www.drupal.org/project/body_scroll_lock/issues/3123157), [MDN `<dialog>` multi-modal guidance](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog) — stacked-dialog stack/refcount failures
- **[MEDIUM]** [DEV — useActionState and why disabling the button is not enough](https://dev.to/shubhradev/react-19s-useactionstate-showed-me-why-disabling-my-submit-button-was-never-enough-53jd), [RHF #11832 — isPending vs isSubmitting](https://github.com/orgs/react-hook-form/discussions/11832), [LogRocket — useActionState guide](https://blog.logrocket.com/react-useactionstate/) — double-submit mechanics
- **[MEDIUM]** [Wikimedia — search normalization folds RU ё→е](https://wikimediafoundation.org/news/2018/09/13/anatomy-search-variation-under-nature/), [Mozilla Discourse — the Ё problem](https://discourse.mozilla.org/t/a-problem-of-the-russian-letter/102504), [SO — sorting Russian words with ё](https://stackoverflow.com/questions/79888813/sort-function-incorrect-sorting-russian-words-with-%D1%91-letter) — optional-diaeresis reality of Russian text

---
*Pitfalls research for: Barahlo v1.1 «Скорость и удобство» — employee search, ⌘K palette, full-context CSV, device cloning, bulk actions on the existing RSC/SQLite/Cyrillic app*
*Researched: 2026-09-15*
