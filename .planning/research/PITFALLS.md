# Pitfalls Research — v1.3 «Удобство и выгрузка» (XLSX export, lightbox zoom, manager-convenience features)

**Domain:** Adding XLSX export, photo-lightbox zoom/pan, and manager-convenience features (saved filters, печатный акт, QR-этикетки, quick actions, сводка) to an EXISTING production app (Barahlo — Next.js 16.3.3 pinned, React 19.2.8, Base UI 1.7.0, SQLite/better-sqlite3+drizzle, Base UI + shadcn base-nova, RU locale, RU-locale Excel consumers, Docker standalone on an internal server)
**Researched:** 2026-09-29
**Confidence:** HIGH for XLSX cell/Date/sheet behavior (source-verified against the published write-excel-file 4.1.1 modules and README), HIGH for Next.js claims (verified against the pinned `node_modules/next/dist/docs/`), HIGH for project-recurrence items (first-party decision log and source), MEDIUM for lightbox gesture/print/localStorage web material (multiple corroborating sources, no official spec pin).

**Already solved in v1.0–v1.2 — do not re-litigate, but every new code path must REUSE the fix:** CSV → BOM + «;» + comma-decimal «21,5» + ISO file dates + esc() CWE-1236 guard + RFC 5987 dual filename; search debounce races → lastSynced + inFlight echo absorption (frozen hook, D-07); UTC vs Moscow → `displayTodayUtc()` / DISPLAY_TZ (CR-01); React 19 form reset → echo-values-in-state; status → replay projection only (D-03); labels → keystone derivation (D-02); URL vocabulary → `buildDevicesQuery`/`parseDevicesSearchParams` (D-08). The **central v1.3 trap** is the inverse: the CSV tricks are CSV-format-specific — porting them INTO the XLSX creates new bugs (Pitfall 2/6), while NOT porting the underlying *discipline* (single vocabulary, shared predicates, requireSession-first) recreates old ones.

**Phase names below are topic-slugs** (Фаза XLSX, Фаза Лайтбокс, Фаза Сохранённые фильтры, Фаза Печатный акт, Фаза QR, Фаза Quick actions, Фаза Сводка) — the roadmap assigns numbers.

---

## Critical Pitfalls

### Pitfall 1: Inventory numbers / serials written as Number cells → scientific notation and stripped leading zeros

**What goes wrong:**
Excel displays a Number cell with >11 significant digits as `1,23457E+15` and silently rewrites the stored value to 15-digit precision; leading zeros (`0078-АЛ`) cannot exist in a Number cell at all. A long numeric inventory tail suffers exactly the `>2^53` self-collision/scientific-notation failure this project already hit once in the clone-increment (Key Decision, commit c4b2e2d, `Number.isSafeInteger` guard) — now reborn in the export layer, where the damage lands in the boss's spreadsheet.

**Why it happens:**
`db/schema.ts` stores `serialNumber` and `inventoryNumber` as **TEXT** — the DB is safe. The corruption happens on the way to the cell: a casual `Number(row.inventoryNumber)`, `+row.inventoryNumber`, or reuse of the inventory-increment helper converts the string to a JS number, and write-excel-file **infers the cell type from the JS value** (4.1.1 type table: `String | Number | Boolean | Date | Formula`; unsupported/empty → String). Its `cell.js` is strictly typed (`typeof value !== 'number'` → throw for Number cells), so stringy numbers crash loudly — but numbers that *should have been strings* silently mangle in Excel instead.

**How to avoid:**
- Pass DB strings **verbatim** into cells: `value: row.inventoryNumber` (a string) → a genuine XLSX string cell (`t="s"` shared string in the 4.1.1 serializer). Unlike CSV import, a real string cell is inert text — Excel never re-parses it, no green triangle, no date-mangle, leading zeros preserved.
- For codes that *look* numeric, set `type: String` explicitly and (per the official README recommendation) `format: '@'` so the cell is pinned as Text regardless of viewer.
- Pin it in vitest in the pure lib builder (same discipline as `device-csv.ts`): assert the produced XML marks serial/inventory cells as shared strings; stronger, open the generated buffer with `read-excel-file` (devDependency, test-only) and assert `'0042'` round-trips byte-exact.
- Code-review checklist line: no `Number(` / `+` coercion on `inventoryNumber`/`serialNumber` anywhere between the query row and the cell array.

**Warning signs:**
In the opened file: right-aligned numeric-looking inventory, `E+15` display, `0078` → `78`. In review: any numeric coercion in the builder.

**Phase to address:**
Фаза XLSX (builder task 1 + pinned tests; UAT step «открыть в реальном RU-Excel и глазами посмотреть инвентарники/серийники»).

---

### Pitfall 2: Porting CSV workarounds into XLSX — «21,5» comma-string and ISO text dates are wrong in a real XLSX

**What goes wrong:**
Two opposite failure modes. (a) Reusing `diagonalCell()` (the comma-decimal «21,5» from `lib/device-csv.ts`) in XLSX writes a **text** cell: left-aligned, excluded from SUM/AVERAGE, sorted as text. (b) Writing dates as ISO strings `2026-01-05` also produces text cells: «Гарантия до» cannot be filtered or sorted chronologically in Excel — losing the main advantage the XLSX format has over the existing CSV, and the RU boss expects a real date column.

**Why it happens:**
The CSV tricks (comma-decimal, ISO file dates, BOM, «;») exist to fight **CSV text import** into RU-Excel — the dot-decimal «21.5» read as «21.май» class of problems. XLSX is a typed format: those traps don't exist, and applying the same fixes *creates* new ones. XLSX Number and Date cells display per the **viewer's** locale: a real `21.5` Number cell renders as «21,5» in RU-Excel automatically — the locale problem is solved by the cell type, not by the data.

**How to avoid:**
- `screenDiagonal` (REAL) → real Number cell (`value: 21.5`); optional per-cell `format: '0.0'`.
- `purchaseDate` / `warrantyUntil` → **Date cells** with an explicit format. 4.1.1 facts (source-verified): (1) a Date cell **without a format throws at generation time** («You must provide a `format`»); (2) `convertDateToSerialNumber` is `getTime()/86400000 + 25569` — pure epoch math, so the project's **UTC-midnight stamps** (the form writes `new Date('yyyy-mm-dd')`) yield exact integer serials on any host timezone. Per-cell `format: 'dd/mm/yyyy'` (matches the site's display convention) or the sheet-level `dateFormat` option set once.
- `purchasePrice` (INTEGER rubles) → Number cell; optional thousands format.
- Keep the XLSX cell mapping in the pure lib module with a pinned test (col «Диагональ» is a number cell; date columns are date serials) so review can diff the CSV and XLSX builders side-by-side.

**Warning signs:**
A thrown «You must provide a format» on first dev run (caught immediately — good). In the opened file: left-aligned «21,5», left-aligned dates. In the builder: any call to `diagonalCell` / `isoFileDate`.

**Phase to address:**
Фаза XLSX (explicit plan rule: the XLSX builder shares the *column model* with the CSV, never the *cell renderers*).

---

### Pitfall 3: Response shape — wrong entry point, wrong MIME, Buffer/stream confusion, reused CSV headers

**What goes wrong:**
Three concrete failures. (1) Importing the wrong entry: the package default is the browser build, and the `universal` entry returns a **Blob** with no `toBuffer()` — a route handler importing either gets a build error or Blob-only output. (2) Streaming instead of buffering: the README is explicit that the fflate zip has **no length information in advance** («Cannot determine length»), so `Response(stream)` yields chunked encoding for zero benefit at ~hundreds of rows. (3) Reusing `csvResponseHeaders()` as-is: `Content-Type: text/csv` + `.csv` extension on ZIP bytes → Excel offers to "repair" the file or opens mojibake, and the browser may name the download `*.csv`.

**How to avoid:**
- Import from **`write-excel-file/node`** (4.1.1 exports `./node` with ESM + CJS; sole dependency `fflate ^0.8.2` — pure JS).
- Node shape (4.x API change from 3.x): `writeExcelFile(data, opts)` returns `{ toBuffer, toStream, toFile }`; use `const bytes = await out.toBuffer()` then `new Response(new Uint8Array(bytes), { headers })` — mirrors the attachments-route body pattern (`new Uint8Array(bytes)`), and `Content-Length` comes free.
- New pure `xlsxResponseHeaders(isoDate)` in `lib/`, vitest-pinned like `csvResponseHeaders`: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (hardcoded — V5 discipline, never echoed from input), `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` (auth'd персональные данные — holders' names ride along), and the same proven RFC 5987 dual filename with `.xlsx`: `attachment; filename="devices-ISO.xlsx"; filename*=UTF-8''<encoded «устройства-ГГГГ-ММ-ДД.xlsx»>`. The encoding form transfers unchanged — only extension and MIME differ.
- Keep the download a plain server-rendered `<a href="/api/devices/export.xlsx?…">` next to the CSV link (same filter-bar anchor) — no fetch/`createObjectURL` client plumbing; the browser-native download UI was a deliberate CSV-route choice.

**Warning signs:**
Blob-typed return at build; chunked `Transfer-Encoding` in devtools; download named `*.csv` or double-extension; Excel repair dialog.

**Phase to address:**
Фаза XLSX (route composition task; UAT on Windows Chrome/Edge + real Excel, not just devtools).

---

### Pitfall 4: `next build` bundling spike — write-excel-file is NOT auto-external, and the deploy is standalone Docker

**What goes wrong:**
The pinned Next 16.3.3 docs (`serverExternalPackages.md`) list `better-sqlite3` and `sharp` on the **default** auto-external list (why the current app builds clean); `write-excel-file` is not on it, so it gets **bundled** into the server build. For a pure-JS lib this is normally fine — but the spike must run before the route ships, because the deploy is `output: "standalone"` behind Docker (`compose.yml`): a bundling failure or an untraced dynamic `require` surfaces only in `next build` + the standalone server, never in `next dev`.

**Why it happens:**
The opt-out list protects native/Node-specific packages; devs assume «it worked in dev», and the standalone trace copy step is invisible until the container 500s.

**How to avoid:**
- **First task of Фаза XLSX is the spike:** import + minimal route + `next build` + `node .next/standalone/server.js` + curl the route → open the file in Excel. ~30 minutes, gates all builder work.
- Do **not** preemptively add `serverExternalPackages: ['write-excel-file']` — bundling is the better default for a pure-JS dep (traced and tree-shaken); add it only if the standalone build/runtime actually errors, and record the decision like the Key Decisions table does.
- Keep the builder in a pure `lib/` module (no `next/headers` transitive imports) so the 20-column layout stays vitest-pinnable without booting the route — the established `device-csv.ts` discipline (the route is not vitest-importable because `lib/auth → next/headers`).
- AGENTS.md mandate applies: read the pinned `node_modules/next/dist/docs/` guides before writing route code — Next 16 behavior is not training-data-safe.

**Warning signs:**
`next build` warnings about `fflate`/dynamic requires; standalone container 500s on the export route while `next start` works.

**Phase to address:**
Фаза XLSX (spike task ordering written into the phase plan).

---

### Pitfall 5: 20-column header drift between CSV and XLSX + sheet-name limits

**What goes wrong:**
The CSV header is derived from the keystone (`keystoneLabel` over `PER_TYPE_FIELDS`, D-02 — one edit changes the form AND the file, byte-exact U+2033 ″). Hand-copying 20 Russian labels into the XLSX builder creates a **parallel dictionary**: the next label edit changes the form and the CSV but *not* the XLSX — the exact drift class D-02/D-08 exist to prevent. Separately, sheet names are constrained: 4.1.1's `validateSheetName` throws for empty names, names >31 chars, or names containing `: \ / ? * [ ]` — a dynamically composed sheet name (date suffix, «/» variant) throws or corrupts.

**How to avoid:**
- The XLSX header must call the same source as the CSV (`deviceCsvHeader()` or a shared `deviceColumnLabels()` it delegates to) — zero hand-copied labels; a pinned parity test asserts CSV header string-equals the XLSX header array.
- Sheet name: one hardcoded constant «Ведомость» (9 chars, all safe). Set the date `dateFormat` once at sheet level rather than repeating per Date cell.
- Cell cap awareness (LOW confidence — verify in phase): XLSX cells max 32,767 chars; `notes` is free text. Test a pathological note; slice defensively if the lib doesn't guard.

**Warning signs:**
A second 20-string array anywhere in review; repair prompt on open; a throw mentioning sheet-name validation.

**Phase to address:**
Фаза XLSX (builder refactor: one source of labels; pinned parity test).

---

### Pitfall 6: Do NOT port the CWE-1236 tab-prefix guard into XLSX — and never let a cell be typed Formula

**What goes wrong:**
Porting `esc()`'s tab-prefix writes a literal TAB character at the start of every `=+-@`-leading note/supplier/model in the XLSX — visible garbage in exactly the free-text cells the guard was protecting. Conversely, write-excel-file supports `type: 'Formula'` cells; if a notes/supplier string ever flows into a Formula-typed cell (a "smart" mapping, a copy-paste from a tutorial), the injection the CSV guard prevents becomes possible again in a stronger form — formulas execute on open.

**Why it happens:**
Over-generalizing «the CSV had an injection guard, XLSX needs the same». In a genuine XLSX, String cells are stored as shared strings and are **inert** — Excel does not evaluate text that looks like a formula. The risk surface moves from content to *cell typing*.

**How to avoid:**
- No content mangling in the XLSX builder — strings pass through verbatim; the guard stays in `buildCsv` untouched (the CSV export continues to work as today).
- No `type: 'Formula'` anywhere; a pinned test walks every cell of a fixture row and asserts type ∈ {String, Number, Date}.

**Warning signs:**
Notes in the XLSX starting with a tab/whitespace; the string `Formula` in the builder diff.

**Phase to address:**
Фаза XLSX (code-review checklist: «no esc(), no Formula»).

---

### Pitfall 7: Lightbox zoom gestures fighting the Base UI Dialog (wheel, pan-vs-close, touch capture, focus)

**What goes wrong:**
Four concrete conflicts when enhancing the existing Dialog island in place (which must NOT be replaced — the ⌘K hotkey probe and the delete flow depend on it):

1. **Ctrl+wheel / trackpad pinch zooms the whole browser page** while the dialog is open. Chrome/Firefox dispatch trackpad pinch as synthetic `wheel` events with `ctrlKey: true` — there is no separate gesture API. And in React, `onWheel={e => e.preventDefault()}` is a **no-op**: since React 17, `wheel`/`touchstart`/`touchmove` are registered **passively** at the root. The console warns «Unable to preventDefault inside passive event listener» and the page zooms anyway.
2. **Pan drag misread as outside-click close.** Dragging the zoomed image can release outside the panel; the Dialog's outside-click dismissal fires and the lightbox closes mid-pan. Conversely, without `touch-action: none` the browser takes over the touch gesture and fires `pointercancel`, killing `setPointerCapture` mid-pinch (W3C pointer-events behavior) — the pinch silently stops working on phones.
3. **ESC semantics.** Base UI Dialog closes on ESC by default. If zoom is active, users expect first ESC to reset zoom, second to close — but "swallowing" the first ESC means fighting the Dialog's own close path; a naive global `keydown` listener double-fires with the Dialog's handler.
4. **Focus trap and stacking.** Zoom state that conditionally unmounts or visually hides «Закрыть»/«Удалить фото» breaks Tab order inside the trap; a CSS `transform` on the image creates a new stacking context that can paint over the absolutely-positioned close button if z-layers aren't explicit. The nested delete-confirm Dialog (already a sibling portal — keep that structure) must stay above the transformed image.

**How to avoid:**
- Wheel: manual `ref.addEventListener('wheel', handler, { passive: false })` scoped to the lightbox content element (added in effect, removed in cleanup — never window-global), `preventDefault()` inside, scale from `deltaY` (treat `ctrlKey` as pinch-scale; plain wheel either zooms or does nothing — pick one and document it).
- Touch: `touch-action: none` on the image container; pointer-Map pattern (1 pointer = pan, 2 = pinch) per the MDN pinch-zoom guide; handle `pointercancel`/`lostpointercapture` to reset gesture state.
- Pan vs close: movement-threshold discrimination — treat as click/tap only if total pointer travel < ~5px; don't rely on click-outside dismissal for a panel the image fills.
- ESC: opinionated default — **don't fight it**: ESC closes the lightbox entirely; zoom resets via double-click/double-tap and on every photo switch. If product insists on ESC-resets-first, that needs Base UI 1.7's Dialog `onOpenChange` event-details interception — **verify the exact 1.7 API in phase research before planning** (flagged; MEDIUM confidence).
- Keep close/delete controls always mounted (opacity, not unmount) with explicit z-layering above the transformed image; reset transform when switching photos.

**Warning signs:**
Page (not image) zooms on ctrl+wheel; passive-listener console warning; lightbox closes mid-drag; iPhone pinch scrolls the background; close button unclickable when zoomed; stale zoom on the next photo.

**Phase to address:**
Фаза Лайтбокс (gesture layer task + UAT matrix: desktop wheel, trackpad pinch, iPhone Safari, ESC, delete-from-lightbox, ⌘K while open).

---

### Pitfall 8: Full-photo loading jank and regression of the byte-exact smoke surfaces

**What goes wrong:**
The `variant=full` image (up to 1600px, auth'd route, `private, max-age=31536000, immutable`) loads with real latency on first open. No loading state → an empty dialog flash; naive eager loading (preloading all 8 fulls) → an 8-large-image burst per card open, the read-side mirror of the sequential-upload discipline. Per zoom step, re-rendering the `<img>` (swapping width/height styles or `src`) remounts/repaints and janks. Independently, the photo-grid's smoke tests assert some UI copies **byte-exact** (SSR splits interpolated text nodes with `<!-- -->`) — incidental copy edits around the new zoom controls fail CI in confusing ways.

**How to avoid:**
- Keep the single `<img src={fullUrl(id)}>` swap-on-open; spinner/skeleton via `onLoad`, and `img.decode()` before reveal to avoid the half-decoded flash. Reserve the `max-h-[70svh]` box (already there) so layout doesn't shift on arrival.
- Zoom with CSS `transform: scale() translate()` on a wrapper — one composited layer (`will-change: transform` while interacting); never touch `src` or layout properties per frame.
- No neighbor-photo preloading in v1.3 (≤8 photos, LAN); if ever added, `next`/`prev` only, one at a time.
- Treat existing UI copies as frozen; new controls («Сбросить масштаб», counter changes) update the smoke tests deliberately in the same task.

**Warning signs:**
Empty dialog for 1–2 s; duplicated network requests per zoom step; layout shift when the image lands; failing smoke tests.

**Phase to address:**
Фаза Лайтбокс (loading/transform task; smoke-test checklist line in the phase plan).

---

### Pitfall 9: Печатный акт vs the app shell — sticky bar, fixed bulk panel, dialog portals, colors that don't print

**What goes wrong:**
`@media print` on the card page fights four shell elements: the **sticky** app bar (`sticky top-0 z-40 h-12 backdrop-blur` in `app/(app)/layout.tsx`), the **fixed** bulk panel (`fixed inset-x-0 bottom-4 z-40` in `device-bulk.tsx`) — `position: fixed` elements repeat on **every printed page** in Chrome — any open Base UI Dialog portal (Ctrl+P with a dialog open prints the overlay, not the card), and background-anchored styling: the `bg-white/70` bar prints translucent, and badge/verdict background colors are **stripped by default** — `print-color-adjust: exact` is required for the green/yellow/red warranty chips to survive on paper. Shells with `h-screen`/`overflow-hidden` clip printed content to one viewport.

**Why it happens:**
Screen CSS is written for a viewport; print re-lays-out the whole document, and fixed/sticky has print semantics (repeat-every-page) invisible while developing.

**How to avoid:**
- Prefer a **dedicated print surface** over shell-hiding: a print-only route (e.g. `/devices/[id]/act`) rendering ONLY the act document — no app shell, no islands — with `@page { size: A4; margin: … }` and a «Печать» button calling `window.print()`. This sidesteps every shell conflict and matches the project's thin-surface pattern (the export route is likewise a separate surface over shared data). Multi-page needs: `break-inside: avoid` on rows/sections; repeat the table header via `thead { display: table-header-group; }`.
- The print surface is still behind the session (the act contains employee names): `requireSession` discipline applies; «no shell» does NOT mean «no auth».
- `print-color-adjust: exact` (+ `-webkit-` prefix) for any colored verdict/status — but design the act ink-frugal (hairlines over fills; Apple aesthetic prints well).
- Force light styles in print (globals.css tokens may flip dark).

**Warning signs:**
Bulk bar printed three times; act printed from a page with an open dialog shows the dialog; гарантийный chip invisible on paper; Ctrl+P from the card produces the shell.

**Phase to address:**
Фаза Печатный акт (architecture decision is the plan's first item: print route vs in-place media-print; UAT = real paper, Chrome AND Safari, multi-page act).

---

### Pitfall 10: QR-этикетки encode a URL built from request headers → docker-internal hostname phones can't resolve

**What goes wrong:**
QR content built as `http://{request.host}/devices/{id}` behind `proxy.ts`/docker compose surfaces the internal service name or container port (`barahlo:3000`, `localhost:3000`) — every printed sticker then deep-links to a host nothing outside the server can resolve. Discovered on paper, weeks later, with hundreds of stickers glued to hardware: the one pitfall here with **physical-world recovery cost**. Two secondary traps: canvas-rendered QR prints blurry (canvas rasterizes at screen DPI; printers want 300+), and label sheets paginate badly without explicit print geometry.

**How to avoid:**
- QR base URL from an explicit validated env (`BASE_URL`, e.g. `http://barahlo.intra.local`) — fail fast at boot in the QR phase; never from request headers.
- Render QR as **SVG** (the `qrcode` npm package's string/SVG mode — pure JS, no serverExternalPackages concern), not canvas; canvas acceptable only for a screen preview.
- Label sheet: `@page { size: A4; margin: 0 }` + mm-sized label cells with `break-inside: avoid`; a screen-preview page so mispagination is caught before paper.
- Same print-surface discipline as Pitfall 9 (dedicated route, session-guarded).

**Warning signs:**
Test QR scanned from an office phone 404s; pixelated QR in print preview; label rows split across pages.

**Phase to address:**
Фаза QR (BASE_URL env decision + SVG renderer decision as the plan's first tasks; UAT = scan from an office phone, print one full sheet).

---

### Pitfall 11: Saved filters stored as VALUES create a second filter vocabulary — the D-02/D-08 drift, localStorage edition

**What goes wrong:**
Saving `{ type: 'laptop', status: 'issued', dept: 4, warranty: 'w60', ram: true }` as a JSON blob and restoring it by `setValue()`-ing islands directly bypasses everything the URL-builder discipline (D-08: `buildDevicesQuery`/`parseDevicesSearchParams` as the ONE vocabulary) provides: the search-box reconciliation (`lastSynced`/`inFlight` echo machinery in the frozen `useDebouncedSearchQuery` hook, D-07) never learns about the restore, so it fires — clobbered keystrokes (G-5-1), eaten trailing spaces (G-5-2), ping-pong `?q` loops (G-7-1). Independent additional traps: bare `JSON.parse` of corrupt data crashing the island; a saved `dept: 4` for a since-archived department silently matching nothing; **hydration mismatch** from reading localStorage during render; Safari private-mode/locked-down browsers throwing on `localStorage` access.

**How to avoid:**
- **Save = `buildDevicesQuery(currentFilters)`** — the query string is the artifact (derived, never hand-built). **Restore = `router.replace(savedQueryString)`** and let the existing parse → `deviceWhere` → render flow do everything. The URL stays canonical (shareable, Back/Forward-correct); localStorage holds only bookmarks of strings.
- Restore-side validation is free: restored strings go through `parseDevicesSearchParams`, which already degrades every invalid value (archived dept, stale enum) to its inactive sentinel — T-03-04 discipline reused, zero new validation code.
- Versioned envelope `{ v: 1, name, qs }`: unknown shapes dropped, not merged; a future vocabulary change bumps `v` and migrates or discards.
- Read localStorage in effects/handlers only (client island; never in render — hydration). Wrap every access in try/catch; failed read = feature quietly absent.
- Do not modify `useDebouncedSearchQuery` (frozen, D-07); the saved-filters island composes `buildDevicesQuery` from the same flat validated props the other islands receive and imports the builder itself (server-serialization rule: no functions across the RSC boundary).

**Warning signs:**
Restoring a filter rewrites the search input text; hydration-mismatch console output; a saved filter for an archived department yields a silently empty list; the literal string "undefined" in the menu.

**Phase to address:**
Фаза Сохранённые фильтры (data-shape decision first: query-string artifact, not a filter object; UAT = restore after dept archive, corrupt localStorage, Back/Forward after restore, search UAT script re-run).

---

### Pitfall 12: Quick actions bypassing the replay — direct status writes, double-submit, optimistic projection patches

**What goes wrong:**
Row-level «Выдать»/«Принять» buttons tempt three shortcuts, each a re-occurrence of a closed incident class:
1. **A direct `UPDATE devices SET status/holder`** violates the foundational invariant (status is a **projection recomputed by full movements replay**, D-03; custody changes only through movement events; the «клоны — ноль movement-событий» decision shows the inverse care). Timeline, employee card, and the next replay diverge from the visible status.
2. **Double-submit:** a fast double-click fires two server actions → two movements with identical `occurredAt`; replay orders by `(occurredAt ASC, id ASC)`, so the `id` tie-break can flip final custody to the wrong employee. The bulk flow already learned this: union-prevalidation + `guard-UPDATE` for in-batch races (checker W1).
3. **Optimistic client patch of the status badge**, then `router.refresh()` lands and the replay recomputes — the badge flashes back or ping-pongs: the search echo/ping-pong class (G-5-1/G-7-1) transplanted onto mutations.

**How to avoid:**
- Quick actions are thin UI over the **existing movement server actions** (phase-4 issuance/acceptance flows; phase-10 bulk for the multi-row case) — new buttons, zero new write paths. The action, not the button, owns validity.
- Server side: same transaction shape as bulk — in-tx SELECT prevalidation returning `{ ok: false, blockers }` (never throw for expected invalidity), `guard-UPDATE` for the racing duplicate; the client renders the blocker list (bulk-dialog precedent, including the throw-reserved-for-races separation pinned by repeat-tests).
- Client: `useTransition` pending state disables the row action through the whole round trip (also covers the RSC refresh — the transition keeps the old list mounted, the established no-flash pattern); **no optimistic status writes** — the row stays on the old projection until the refresh swaps it, exactly as search navigation behaves today.
- Preconditions mirror existing surfaces: disposed devices show no quick actions (тихая зона discipline), and the ⌘K parity rule («палитра находит то, что находит список») means `deviceWhere` must not change to accommodate quick actions.
- If quick actions include «Списание»: финальность живёт в ДЕЙСТВИЯХ (D-06) — disposal is a movement whose HIST-02 removal is the only exit; no separate «разсписать» quick action.

**Warning signs:**
Badge and timeline disagree after a quick action; two movements with the same second-level timestamp; badge flash-back after a refresh; `grep "UPDATE devices"` finds a status write outside the replay module.

**Phase to address:**
Фаза Quick actions (the write-path decision is the phase's architecture core; repeat-test double-submit like the bulk checker W1 did).

---

### Pitfall 13: CR-01 reborn in every new «today» — сводка/акт/этикетка date boundaries in a UTC container

**What goes wrong:**
Every new feature that says «сегодня» is a fresh instance of the CR-01 bug (the UTC container rejected «сегодня» during MSK 00:00–03:00; fixed via `displayTodayUtc()` + `DISPLAY_TZ=Europe/Moscow`, commit 1a31814): the сводка's «истекает в этом месяце» window computed from server-local `new Date()`; the печатный акт's «Актуально на ___» stamp; a new XLSX filename date diverging from the page's. The XLSX «Статус гарантии» column is safe **iff** it maps `warrantyState(until, displayTodayUtc())` output through the shared label dictionary — a re-derived boundary in the XLSX builder recreates the WR-01 filter-hit-renders-green class of bug.

**Why it happens:**
`new Date()` is correct on the dev laptop (MSK local) and wrong on the UTC container — invisible until deployed, then visible only 00:00–03:00 MSK.

**How to avoid:**
- One rule restated for v1.3: every «today» is `displayTodayUtc()` (injectable `now` for frozen-clock tests — the lib already supports it), hoisted once per request by the caller (the export route's per-render hoist discipline) — never `new Date()` at module level or in a component body.
- The XLSX warranty column **maps** `warrantyState` output through `WARRANTY_STATE_LABELS` (ideally moved to a shared module both CSV and XLSX builders import) — never re-derives.
- Сводка aggregates compose the existing predicates (`warrantyPredicate`, `deviceWhere` — the dashboard's «parity by construction» decision, a8c2bf7) with the injected `today`; a second independent SQL for «истекающие» in the сводка is the drift the dashboard already refused.
- Vitest: pin the MSK 02:00 UTC boundary for every new today-consumer (frozen-clock pattern exists).

**Warning signs:**
Any `new Date()` in a сводка/act/XLSX diff; a сводка tile and the filter it deep-links to disagreeing about counts; act printed at 01:00 MSK showing yesterday's date.

**Phase to address:**
Every feature phase (each plan gets the line «today = displayTodayUtc, injectable»); Фаза Сводка additionally for predicate-composition parity.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hand-copied 20-label array in the XLSX builder | 10 minutes saved | Header drift vs CSV/form on every keystone edit (D-02 violation) | Never — share the CSV header source |
| Storing filter objects (not query strings) in localStorage | Feels «typed» | Second filter vocabulary; bypasses the echo machinery; migration pain | Never — store `buildDevicesQuery` output |
| `serverExternalPackages: ['write-excel-file']` «just in case» | One line | Untraced dep in the standalone image; hides real bundling issues | Only after an actual standalone build/runtime error |
| In-place `@media print` hiding shell elements one by one | No new route | Fragile hide-list grows with every shell change; bulk-panel/dialog regressions resurface | Only if the act is single-surface AND the hide-list is pinned by a print test |
| Canvas-rendered QR | Familiar API | Blurry print at printer DPI; re-gluing stickers | Never for print; fine for a screen-only preview |
| Optimistic status badge on quick actions | Feels snappy | Flash-back/ping-pong; projection lies during the window | Never — transitions already give the no-flash pattern |
| Eager-preloading all full photos | Instant next-photo click | Multi-megabyte burst per card open | Defer entirely (≤8 photos, LAN — measure first) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| write-excel-file 4.x | Importing default/browser/`universal` entry server-side; `universal` is Blob-only | `import from 'write-excel-file/node'`; `await (await writeExcelFile(...)).toBuffer()` |
| write-excel-file Date cells | Omitting `format` (throws at generation); local-TZ math | Per-cell `format: 'dd/mm/yyyy'` or sheet `dateFormat`; UTC-midnight stamps → exact serials (`getTime()/86400000+25569`, source-verified) |
| XLSX HTTP response | `text/csv` headers reused; streaming for unknown length; client fetch plumbing | New pinned header helper: hardcoded xlsx MIME, nosniff, no-store, RFC 5987 dual filename `.xlsx`; `toBuffer` + plain `<a>` download |
| Next 16.3.3 standalone | Assuming dev ≡ build; trusting training-data config knowledge | Spike `next build` + standalone server first; read `node_modules/next/dist/docs/` (AGENTS.md mandate); `better-sqlite3`/`sharp` already auto-external, write-excel-file is not |
| Base UI Dialog 1.7 | React `onWheel` preventDefault (passive at root since React 17); fighting ESC via global listeners; unmounting controls when zoomed | Manual `addEventListener('wheel', h, { passive: false })` on a ref with effect cleanup; ESC = close, reset via double-click; controls stay mounted; verify `onOpenChange` event-details API in phase research if ESC-interception is required |
| Pointer events | Missing `touch-action: none` → browser fires `pointercancel` mid-gesture | `touch-action: none` on the zoomable container; handle `pointercancel`/`lostpointercapture` |
| Print | fixed/sticky shell elements; stripped background colors; dialog portals on paper | Dedicated print surface; `print-color-adjust: exact`; `@page` size/margins; `break-inside: avoid`; `thead` repetition |
| QR base URL | `request.headers.host` behind proxy/compose | Explicit validated `BASE_URL` env; SVG rendering |
| localStorage | Read during render (hydration mismatch); bare `JSON.parse`; unversioned blobs | Effects only; try/catch; `{ v, name, qs }` envelope; restore via URL replace through the existing parser |
| New actions/routes | Missing `requireSession()` first (proxy perimeter does not cover actions/routes it can't see) | `await requireSession()` is line one of every new handler — печатный акт and QR routes included (T-03-01/V3 discipline) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Streaming zip per request «for scale» | Complexity, chunked responses, no benefit | Buffer: hundreds of rows × 20 cols ≈ tens of KB, single-digit-ms build | Never at this scale |
| Eager full-photo loads (lightbox preloading variants) | Card open downloads megabytes | One full per open, `onLoad` states | Immediately on LAN/phone; grows with photo count |
| Сводка as N+1 per-tile queries | Dashboard slows | Compose one query set reusing `deviceWhere`/predicates (dashboard precedent: 0.76 ms @ 600 rows) | Only if written as independent per-tile scans |
| Zoom via layout properties (width/height per frame) | Janky zoom, repaint storms | One composited `transform` layer | Immediately on large photos |
| Print CSS `backdrop-blur`/heavy shadows on the act | Slow print rendering | Print surface uses flat hairline styling | Large/multi-page acts |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Echoed/generated `Content-Type` or filename from query params on the XLSX route | MIME confusion, header injection | Hardcoded xlsx MIME + constant RFC 5987 filename with only the injected ISO date (V5 discipline, mirrors `csvResponseHeaders`) |
| Печатный акт / QR routes without `requireSession()` first | Employee names and акт contents leak on the intranet | requireSession-first, every new handler (V3 defense-in-depth over the proxy perimeter) |
| Allowing `type: 'Formula'` cells (or porting esc() «for safety») | Executable formulas in the boss's Excel — or garbage tab-prefixed cells | No content mangling; pinned test: cell types ∈ {String, Number, Date}; CWE-1236 guard stays CSV-only |
| QR stickers encoding session-bearing or token-bearing URLs | Sticker leaks more than a device id | QR = plain `/devices/{id}` deep link (auth still required to view); no tokens in QR |
| localStorage drifting beyond filter query strings | Personal data accumulating in the browser | Contract: only `{ v, name, qs }` bookmarks; never row data |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| XLSX validated only in dev Chrome | «Работает» until the boss opens it in RU Excel — repair dialogs, mangled inventory, text dates | UAT gate: real RU Excel + Numbers + Google Sheets; leading zeros, «21,5» as a number, dd.mm.yyyy dates |
| Zoom without affordance/reset | User stuck zoomed; feature undiscoverable | Double-click/tap reset; explicit reset on photo switch; hint on first open |
| ESC ambiguity (close vs reset) | Unexpected dialog close mid-inspection | Opinionated: ESC closes (predictable), double-click resets; no hidden two-ESC scheme without a visible affordance |
| Print button Ctrl+P on the shell page | User prints nav + bulk bar garbage | «Печать акта» navigates to the print surface and prints only the document |
| Saved filter restored silently over current work | User's built filter replaced without warning | Restore is an explicit action; URL stays canonical so Back undoes it |
| Quick actions on disposed/archived rows | Invalid actions → error dialogs | Hide actions via the existing canMutate-style prop; blockers pattern for races |

## "Looks Done But Isn't" Checklist

- [ ] **XLSX export:** Opened in **real RU Excel** (not just LibreOffice on the dev machine) — «21,5» right-aligned number cell, `0078-АЛ`/16-digit inventory intact, dates as dd.mm.yyyy date cells, no repair dialog, Cyrillic filename lands on Windows Chrome + Edge, «Статус гарантии» matches the site color.
- [ ] **XLSX export:** Both filtered and full-park exports; `no-store` honored; logged-out tab gets 401; CSV link still works unchanged.
- [ ] **Lightbox:** Ctrl+wheel zooms image not page; trackpad pinch works; iPhone Safari pinch + pan; ESC path; «Удалить фото» still works from the lightbox; ⌘K opens while the lightbox is open; photo switch resets transform; spinner on slow first open; existing smoke copies green.
- [ ] **Печатный акт:** Real paper, Chrome AND Safari; multi-page act repeats its table header; no app bar/bulk panel/dialog remnants; verdict colors visible; act route 401s when logged out.
- [ ] **QR:** Scanned from an office phone over Wi-Fi resolves to the device card; one full A4 label sheet paginates without split labels; QR readable by the stock iOS camera at arm's length.
- [ ] **Saved filters:** Restore after department archived → silently degrades, no crash; corrupt localStorage → feature absent, no error; Back after restore returns previous filters; search UAT script re-run with zero echo regressions.
- [ ] **Quick actions:** Double-click safe (repeat-test); disposed rows show nothing; blocker list renders like bulk; timeline and badge agree after every action; grep confirms zero status writes outside replay.
- [ ] **Сводка:** At 00:30 MSK (frozen-clock test) tile counts match the filters they deep-link to; numbers equal a hand-run export of the same filter.
- [ ] **Every new server surface:** `requireSession()` is line one (grep-verified); zod whitelist on all inputs; `today` comes from `displayTodayUtc()`.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Mangled inventory/serials in a delivered XLSX | LOW | Fix cell typing in the builder → re-download (file is generated per request; no data repair) |
| Excel repair dialog on open | LOW | Almost always a cell-type/sheet-name issue — reproduce in vitest by opening the buffer with a reader; fix; re-export |
| Gesture layer unstable in lightbox | LOW | Ship click-to-zoom toggle + double-click reset without free pan; the Dialog island contract stays intact |
| Print act unusable via in-place media-print | MEDIUM | Pivot to the dedicated print route (architecture decision documented as reversible) |
| QR stickers with dead URLs | HIGH | Fix `BASE_URL`, regenerate + reprint every sticker — the one pitfall with physical-world cost |
| Duplicate movement from double-submit | MEDIUM | Delete the duplicate via the existing HIST-02 UI (append-only + replay makes the repair honest); add the missed guard + repeat-test |
| Saved-filter blob chaos | LOW | Discard `v`-mismatched entries; localStorage is disposable by design |
| Сводка numbers diverge from filters | MEDIUM | Re-point aggregates at the shared predicates (parity by construction), delete the second SQL |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Number-cell mangle of inventory/serials | Фаза XLSX | Pinned vitest: serial/inventory are string cells; UAT in real RU Excel (`0078` stays, no `E+15`) |
| 2. CSV workarounds ported (comma-decimal, ISO text dates) | Фаза XLSX | Review: no imports from `device-csv` renderers; vitest: diagonal col Number, date cols are date serials |
| 3. Response shape/MIME/filename | Фаза XLSX | Pinned header test (xlsx MIME, dual filename); curl + devtools: Content-Length, `no-store` |
| 4. Bundling/standalone spike | Фаза XLSX (first task) | `next build` + `node .next/standalone/server.js` + curl → opens in Excel |
| 5. Header drift + sheet name | Фаза XLSX | Parity test CSV header == XLSX header; sheet-name constant |
| 6. Injection-guard over-port / Formula cells | Фаза XLSX | Pinned test: cell types ∈ {String, Number, Date}; no `esc()` in builder |
| 7. Dialog/gesture conflicts | Фаза Лайтбокс | Gesture UAT matrix (wheel/trackpad/iPhone/ESC/delete/⌘K); zero passive-listener warnings |
| 8. Loading jank + smoke regressions | Фаза Лайтбокс | Throttled-network spinner check; smoke suite green; one request per open |
| 9. Print vs app shell | Фаза Печатный акт | Paper UAT Chrome+Safari, multi-page; print route 401s logged-out |
| 10. QR base URL + SVG print quality | Фаза QR | Scan-from-phone test; BASE_URL boot validation; full-sheet pagination |
| 11. localStorage drift vs URL | Фаза Сохранённые фильтры | Restore/degrade/corruption/Back-forward UAT; search UAT script re-run |
| 12. Quick actions bypass replay | Фаза Quick actions | Repeat-test double-submit; blocker-report parity with bulk; grep: no status writes outside replay |
| 13. «today»/TZ + predicate parity | Фаза Сводка + every phase plan | Frozen-clock MSK-boundary tests; сводка↔filter deep-link parity; shared warranty labels in XLSX |

**Ordering rationale for the roadmap:** Фаза XLSX first (self-contained server surface; the spike gates; highest visible user value — «выгрузка для начальства»). Фаза Лайтбокс second (client-only, zero write-path risk, independent). Convenience features follow: Сохранённые фильтры and Печатный акт before Quick actions (quick actions touch the movement write-path and deserve the fullest validation discipline); QR after Печатный акт (shares the print-surface pattern and the dedicated-route decision); Сводка last (pure read composition over then-stabilized predicates).

## Sources

- **write-excel-file 4.1.1 published source** (`package.json` export map; `modules/xlsx/helpers/convertDateToSerialNumber.js`; `modules/xlsx/validateSheetName.js`; `modules/xlsx/files/sheet.xml/cell.js` — via jsDelivr) + official README (type table, `format: '@'`, Date-format requirement, `toBuffer/toStream/toFile`, «Cannot determine length», sheet options) — HIGH, source-verified.
- **Next.js 16.3.3 pinned docs** (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md` — default list incl. `better-sqlite3`/`sharp`; `01-getting-started/15-route-handlers.md` — Response semantics, request-time execution) — HIGH.
- **[MEDIUM, cross-checked]** Chromium «document the ability to preventDefault() a pinch-zoom»; danburzo.ro «Pinch me, I'm zooming» — trackpad pinch = synthetic `wheel` with `ctrlKey`; MDN `touch-action`, Pointer Events pinch-zoom guide, `pointercancel` semantics — HIGH (official docs).
- **[MEDIUM-HIGH]** React ≥17 root-level passive `wheel`/`touchstart`/`touchmove` listeners (React 17 release notes / event system) — the onWheel-preventDefault no-op.
- **[MEDIUM]** CSS-Tricks/SO print positioning (fixed repeats every page), `print-color-adjust`, `@page`, `thead { display: table-header-group }`.
- **[MEDIUM]** URL-state vs localStorage patterns (LogRocket useSearchParams, Codebrahma/Hashnode hybrid guides; redux-persist versioned-envelope migrations).
- **First-party (HIGH):** `.planning/PROJECT.md` decision log (CR-01/1a31814, G-5-1/G-5-2/G-7-1, D-02, D-03/D-04, D-06, D-07, D-08, WR-01, c4b2e2d, a8c2bf7, 74eb0d9/42ebf57/10c3cee), `lib/device-csv.ts`, `lib/csv.ts`, `lib/use-search-param.ts`, `lib/warranty.ts`, `app/api/devices/export/route.ts`, `app/api/attachments/[attachmentId]/route.ts`, `app/(app)/(card)/devices/[id]/photo-grid.tsx`, `app/(app)/layout.tsx`, `app/(app)/devices/device-bulk.tsx`, `app/(app)/devices/query-params.ts`, `db/schema.ts` (serial/inventory TEXT), `next.config.ts` (`output: "standalone"`).

---
*Pitfalls research for: Barahlo v1.3 «Удобство и выгрузка» — XLSX export, lightbox zoom, manager-convenience features added to the existing production app*
*Researched: 2026-09-29*
