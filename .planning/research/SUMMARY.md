# Project Research Summary

**Project:** Barahlo — учёт корпоративной техники · milestone **v1.3 «Удобство и выгрузка»**
**Domain:** Milestone delta on an existing production app: XLSX export of the 20-column ведомость, photo-lightbox zoom, and manager-convenience features (saved views, печатный акт приёма-передачи, QR-этикетки, quick actions, сводка) added to a Next.js 16.3.3 / React 19.2.8 / @base-ui/react 1.7.0 / better-sqlite3+drizzle single-operator device registry (RU locale, RU-locale Excel consumers, LAN Docker standalone deploy)
**Researched:** 2026-09-29
**Confidence:** HIGH overall — Stack probe-verified against the actual pinned artifact (library installed, RU workbook generated, OOXML inspected); Architecture/Pitfalls verified by reading production code and pinned node_modules; Features MEDIUM (Snipe-IT landscape HIGH, RU act practice MEDIUM, SaaS blog claims LOW–MEDIUM)

> This summary covers the **v1.3 milestone delta** and replaces the v1.1 summary. v1.0–v1.2 outcomes (D-02 keystone labels, D-03 replay projection, D-04 co-located predicates, D-07 frozen debounce hook, D-08 one URL vocabulary, D-18 zero-drift export, WR-01 warranty parity, CR-01 `displayTodayUtc()`, T-03-01 `requireSession()`-first, G-5-1/G-5-2/G-7-1 search-echo scars) are shipped code and standing invariants. The **central v1.3 trap is the inverse** of re-litigating: the CSV workarounds (comma-decimal «21,5», ISO text dates, BOM, `esc()` CWE-1236 guard) are CSV-format-specific — porting them into XLSX *creates* new bugs — while NOT porting the underlying *discipline* (one parser, shared label dictionaries, one «today», session-first) recreates old ones.

## Executive Summary

v1.3 adds a file format, a gesture surface, and a convenience tier to an app that already works, and the stack research converges on a clean headline: **exactly one new npm dependency — `write-excel-file@4.1.1`, pinned exact, server-only** — probe-verified on this machine (RU/Ё workbook generated, OOXML inspected: styled bold header, column widths, frozen first row, real numeric cells, Cyrillic sharedStrings all confirmed; autofilter confirmed absent). The lightbox needs **zero** dependencies: the already-pinned Base UI Dialog plus ~100–150 lines of hand-rolled zoom (pure `lib/zoom-math.ts` + a thin client island) covers it — a third-party lightbox would *replace* the existing Dialog shell that the ⌘K probe attribute and the delete-photo flow depend on, not enhance it. The alternatives were disqualified on primary sources: exceljs carries four unfixed 2026 CVEs (one 9.4-critical prototype pollution) and has been dormant since 2023; SheetJS CE on npm is frozen at 0.18.5 with CVE fixes only in vendor-CDN tarballs and **cannot style cells at all** — a styled ведомость is impossible with it. The XLSX feature is a **composer, not a subsystem**: a sibling GET route reusing the CSV route's entire session→parse→strip→export chain, and a pure `lib/device-xlsx.ts` importing `deviceCsvHeader()`/`WARRANTY_STATE_LABELS` so the two files cannot diverge.

The recommended approach is a five-plus-one phase build order that isolates risk and follows the value: **(1) XLSX first** — self-contained server surface, the highest visible value («выгрузка для начальства»), gated by a mandatory 30-minute bundling spike (`next build` + standalone Docker server — write-excel-file is NOT on Next's auto-external list, unlike better-sqlite3/sharp); **(2) the lightbox second** — fully independent client-only island, zero write-path risk, with the mobile-polish wave riding the same UI edits; **(3) saved views** — S-complexity daily win: a saved filter is just a *name + the existing `buildDevicesQuery()` string* in localStorage, restored via `router.replace` through the existing parser; **(4) печатный акт приёма-передачи** — the highest real-value RU-office differentiator, all data already present, built as a dedicated session-guarded print route (not in-place `@media print`, which fights the sticky bar, fixed bulk panel and dialog portals); **(5) QR-этикетки** — reusing the print-surface pattern from (4) plus the existing bulk selection. **(6) second echelon, owner's call at requirements:** row quick-actions and the печатная сводка. Every convenience candidate is S/M complexity and **none requires a DB migration** — the research's own detector for absence of scope creep.

The risks are drift, format typing, and one physical-world failure mode, all cheap to prevent in the right phase: XLSX inventory/serial numbers must stay **string cells** (a Number cell shows `1,23457E+15` and silently rewrites 16-digit serials — in the boss's spreadsheet); numbers and dates must be *typed* cells (the comma-decimal and ISO-string hacks are CSV-only — in XLSX they create left-aligned text that can't sort or SUM); response shape needs the `write-excel-file/node` entry, `.toBuffer()` + `new Uint8Array`, and a fresh pinned header helper (reusing CSV headers produces the Excel «repair» dialog); the QR pitfall is the one with **physical recovery cost** — a URL built from request headers surfaces the docker-internal hostname on hundreds of printed stickers, so `BASE_URL` env + SVG rendering are boot-time decisions; quick actions must remain thin UI over the existing movement server actions — a direct `UPDATE devices SET status` violates the D-03 replay invariant. PITFALLS.md maps all 13 pitfalls to phases with concrete UAT gates: real RU Excel, real paper in Chrome AND Safari, a phone scan over office Wi-Fi.

## Key Findings

### Recommended Stack

Full detail in [STACK.md](./STACK.md). **One install: `write-excel-file@4.1.1` (exact pin — the 3.x→4.x migration history argues against caret drift).** Everything else composes the installed stack. Import the **subpath export `write-excel-file/node`** server-side (the default is the browser build; `universal` returns a Blob with no `toBuffer()`); pure JS → no `serverExternalPackages` entry (unlike better-sqlite3/sharp); v4 API is `writeExcelFile(data, opts).toBuffer()`.

**Composition decisions (all argued against a named alternative):**
- **XLSX generation:** `write-excel-file@4.1.1` — the only candidate simultaneously maintained (Jun 2026 publish), tiny (1 dep: fflate), TypeScript-typed, and feature-sufficient (styling + widths + frozen row, probe-verified in emitted OOXML). Rejected: `exceljs` (4 unfixed 2026 CVEs, unmaintained, 21.8 MB), `xlsx` SheetJS (npm frozen at 0.18.5, CVE fixes only via vendor CDN, CE **cannot style cells**), `excel4node`/`xlsx-js-style`/`xlsx-populate`/`node-xlsx` (stale forks and CDN-tarball wrappers).
- **Known honest gap:** autofilter is **not supported** (open PR #19, unmerged). Workaround: management clicks Данные → Фильтр once. Re-check the PR at implementation; do NOT switch to SheetJS (loses styling, which IS a hard requirement).
- **Lightbox:** existing `components/ui/dialog.tsx` (Base UI 1.7 Dialog — ESC, focus trap, scroll-lock, a11y come free) + hand-rolled zoom state (~100–150 LOC) — **not** `yet-another-react-lightbox`/`react-photo-view` (they own the portal and chrome, evicting the delete affordance and the ⌘K `data-slot="dialog-content"` probe). Documented fallback: adopt `yet-another-react-lightbox@3.32.2` (zero runtime deps, React 19 peers) **only if** phone pinch-zoom becomes a scoped requirement.
- **CSV tricks stay CSV-only:** `diagonalCell()` comma-string, `isoFileDate()`, `esc()` tab-prefix — none port to XLSX. In XLSX, `screenDiagonal` is a real Number (RU-Excel renders «21,5» itself), dates are real Date cells (UTC-midnight stamps → exact serials; `getTime()/86400000 + 25569` is pure UTC math, source-verified), string cells are inert (no formula interpretation → no CWE-1236 surface), and **no `type: 'Formula'` anywhere**.
- **Manager conveniences:** expected zero new dependencies — whatever FEATURES scopes composes Base UI primitives, zod, drizzle, server actions, and the palette's predicate-reuse pattern. Any proposed npm install for this area needs explicit justification in the phase plan.

### Expected Features

Full detail in [FEATURES.md](./FEATURES.md). XLSX and the lightbox are already committed; this research scopes the manager-convenience tier. Complexity scale (honest, single-dev): all candidates are S (days) or M (a full phase with UAT); nothing L is recommended.

**Launch-with (P1 recommendation to the owner):**
- **Акт приёма-передачи (печатный)** — M. The strongest RU-office reality (2 экз., подписи; реквизиты confirmed across assistentus/glavbukh/e-kontur). Data is 100% in the app; what remains is layout. Printed HTML + print-CSS (browser makes the PDF; no PDF library). Two entries: single position (issue dialog + «распечатать акт») and batch «выдано сотруднику» (employee card). Org details: one-time input, localStorage. NOT a contract editor.
- **Сохранённые фильтры/виды** — S. Filters are already URL-synced; a saved view = name + query string in localStorage. Chips above the list + rename/delete/set-default. No DB migration.
- **QR-этикетки (простая версия)** — S–M. QR on card + printable A4 sheet from bulk checkbox selection (clones ×50 → labels ×50 in one pass). The phone's stock camera opens the URL — **no in-browser scanner** (anti-feature: getUserMedia requires HTTPS, blocked on the internal http server).

**Second echelon (add after validation):** row-level «Принять/Выдать» quick actions (S–M; thin reuse of existing bulk dialogs' server actions; the row-layout conflict with checkboxes must be resolved in UI-SPEC first); печатная «Сводка для руководства» (S–M; dashboard aggregates + print view; warranty forecast extends existing `warrantyPredicate` compositions); мобильная эргономика (S; responsive polish of card/lists/forms — one wave right behind the lightbox).

**Anti-features (actively argue against, offering the alternative):** email/push warranty reminders (SMTP+cron for one daily user — the dashboard block + saved view «Гарантия < 30 дн» already cover it); built-in QR scanner (L-complexity, camera API blocked without HTTPS); report builder (configurability kills single-user tools); depreciation/accounting (1С domain; XLSX already feeds бухгалтерия); kits as an entity (bulk issue + the act already cover it); expected return dates (new movements field → replay/validation ripple for weak signal); native mobile app; roles/self-service (contradicts stable project decisions).

### Architecture Approach

Full detail in [ARCHITECTURE.md](./ARCHITECTURE.md). Every v1.3 feature is an **insertion into an existing layer** of the rigid five-layer shape (surfaces / client islands / routes+actions / pure lib / query layer) — never a new layer. Only additions; nothing moves: `lib/device-xlsx.ts` (pure, imports labels + warranty dictionary from `lib/device-csv.ts`), `/api/devices/export-xlsx/route.ts` (thin composer, the EXACT 5-call chain of the CSV route — one parser, one predicate, one sentinel-strip), edits to `filter-bar.tsx` (second `<a>`) and `command-palette.tsx` (second native-anchor row), `lib/zoom-math.ts` + `photo-zoom-stage.tsx` rendered INSIDE the existing `DialogContent` in `photo-grid.tsx` (Dialog shell, delete flow and ⌘K probe untouched; panel widens to ~max-w-5xl), and any convenience counters **co-located in `db/queries/devices.ts`** beside `deviceWhere`/`warrantyPredicate` (a separate dashboard module would force exporting predicate terms — the drift path the file header forbids). Streaming is deliberately not used (hundreds of rows ≈ tens of KB; a Buffer gives Content-Length free). Deep-links for any new tile go through the ONE builder `buildDevicesQuery` with a full `DeviceFilters` object — hand-built filter URLs are forbidden.

**Major new components:**
1. **lib/device-xlsx.ts** — pure builder: `deviceXlsxSheetData(rows, today)` (the vitest-pinned matrix — typed cells, config-block order, warranty label parity) + `buildDeviceXlsx()` (1-line async wrapper over write-excel-file) + `xlsxResponseHeaders(isoDate)`. Splitting the pinned core from the library boundary means tests never need an XLSX reader.
2. **photo-zoom-stage.tsx + lib/zoom-math.ts** — Pointer-Events gesture island (refs + rAF transform writes, never per-move setState); touch-action on the stage element only; handle `pointercancel` (iOS fires it aggressively); scale ∈ [1,4]; reset on photo switch; delete button stays mounted and above the transformed image.
3. **Convenience query functions** in `db/queries/devices.ts` (DASH pattern) — compose the private predicates, injectable `today` defaulting to `displayTodayUtc()`, hoisted once per render by the caller.

### Critical Pitfalls

Full detail (13 pitfalls + tech-debt patterns + «looks done but isn't» checklist) in [PITFALLS.md](./PITFALLS.md). Top 5 plus the every-phase rule:

1. **Inventory/serials as Number cells → `E+15` and stripped leading zeros** — pass DB TEXT values verbatim as string cells (`format: '@'` for numeric-looking codes); pinned vitest asserts serial/inventory are shared strings; code-review line: no `Number(` coercion on identity fields. UAT: real RU Excel, `0078-АЛ` intact.
2. **Porting CSV workarounds into XLSX** — «21,5» comma-strings and ISO text dates create left-aligned text that can't sort/SUM/filter; a Date cell without `format` throws at generation. Rule: XLSX shares the CSV's *column model*, never its *cell renderers*. Dates as real Date cells with `dd/mm/yyyy` format.
3. **Response shape + bundling (standalone Docker)** — import from `write-excel-file/node`, `.toBuffer()` + `new Response(new Uint8Array(bytes))`, fresh pinned header helper (hardcoded xlsx MIME, nosniff, no-store, RFC 5987 dual filename `.xlsx`); **first task of the phase is the spike**: `next build` + `node .next/standalone/server.js` + curl → open in Excel. Add `serverExternalPackages` only on an actual error.
4. **QR stickers with dead URLs** — never build the QR URL from request headers (docker-internal hostname; discovered on paper weeks later with hundreds of stickers glued to hardware — the one HIGH-recovery-cost pitfall). Explicit validated `BASE_URL` env failing fast at boot; render QR as **SVG** (canvas prints blurry at printer DPI).
5. **Quick actions bypassing the replay** — a direct status UPDATE, a double-submit (two movements with identical `occurredAt`, `id` tie-break can flip custody), or an optimistic badge patch each re-opens a closed incident class. Quick actions are thin UI over the existing movement server actions; in-tx prevalidation with blocker reports; `useTransition` pending state, no optimistic writes; repeat-test double-submit.

**Every phase:** `requireSession()` is line one of every new route/action — печатный акт and QR routes included (the act contains employee names; T-03-01/V3 discipline, grep-verified). Plus the CR-01 rule restated: every «today» is `displayTodayUtc()`, hoisted once per request — never `new Date()` in a сводка/act/XLSX diff; frozen-clock MSK 02:00 boundary tests for every new today-consumer.

## Implications for Roadmap

Based on combined research, a **five-phase milestone plus an optional sixth** (second-echelon conveniences, scoped by the owner at requirements per PROJECT.md). The XLSX chain is strictly linear (lib → route → surfaces); the lightbox is fully independent and could parallel it; the convenience phases follow the print-pattern dependency and the validation-discipline gradient.

### Phase 1: XLSX-выгрузка ведомости
**Rationale:** Self-contained server surface with the highest visible user value; its spike gates everything; pitfalls 1–6 concentrate here and deserve the freshest attention. ARCHITECTURE build order: lib module → route → surfaces.
**Delivers:** «Скачать Excel» next to «Скачать CSV» (filter-bar + palette native-anchor row); styled 20-column ведомость (bold header from `deviceCsvHeader()`, column widths, frozen first row, sheet-name constant), typed cells (numbers as numbers — no «число как текст» triangles; Date cells `dd/mm/yyyy`), RFC 5987 dual filename «устройства-ГГГГ-ММ-ДД.xlsx», `no-store`, filter parity with the screen via the shared 5-call chain.
**Addresses:** Committed milestone feature (XLSX alongside CSV).
**Avoids:** Pitfalls 1–6 + 13 (displayTodayUtc hoist; «Статус гарантии» mapped through shared `WARRANTY_STATE_LABELS` — parity with site color by construction).
**Plan must include:** the 30-min bundling spike as task one; optional mechanical refactor extracting the shared parse-strip helper into query-params.ts (shrinks the CSV route too); pinned cell-type tests + CSV↔XLSX header parity test; review line «no `esc()`, no `Formula`, no `diagonalCell`»; UAT gate in real RU Excel (+ Numbers/Google Sheets), Windows Chrome/Edge filename check.

### Phase 2: Лайтбокс — zoom/pan + мобильная полировка
**Rationale:** Fully independent of Phase 1 (can run in parallel); client-only with zero write-path risk; the mobile-responsive polish (FEATURES table stakes) is logically the same UI wave — one pass of edits over the same surfaces.
**Delivers:** Zoom/pan stage inside the existing DialogContent (wheel at cursor, double-click toggle, pinch on touch, drag-to-pan, prev/next across ≤8 photos if scoped); wider panel; loading state via `img.decode()`/onLoad; zoom math pinned in `lib/zoom-math.test.ts`.
**Addresses:** Committed milestone feature (lightbox) + FEATURES table stakes (мобильная эргономика).
**Avoids:** Pitfalls 7 (passive-wheel no-op since React 17 → manual `addEventListener('wheel', h, {passive:false})` on a ref; pan-vs-outside-click threshold; ESC closes — don't fight the Dialog; explicit z-layering) and 8 (no eager preloading of all fulls; transform-only zoom; frozen smoke copies updated deliberately).
**Plan must include:** gesture UAT matrix (desktop wheel, trackpad pinch, iPhone Safari incl. pointercancel, ESC path, delete-from-lightbox, ⌘K while open, photo-switch reset); assertion that the `data-slot="dialog-content"` probe still matches.

### Phase 3: Сохранённые виды (saved filters)
**Rationale:** S-complexity, P1 daily value, zero infrastructure — generalizes the dashboard's existing deep-links. Data-shape decision is the whole architecture.
**Delivers:** Named chips over the list; save = `buildDevicesQuery(currentFilters)` string in a versioned localStorage envelope `{v, name, qs}`; restore = `router.replace(qs)` through the existing parser (invalid values degrade to inactive sentinels for free); set-default/rename/delete.
**Addresses:** FEATURES P1 table-stakes candidate.
**Avoids:** Pitfall 11 (a saved filter *object* is a second filter vocabulary that bypasses the D-07 echo machinery — never store values, store the query string; read localStorage in effects only — hydration; try/catch everything; D-07 hook untouched).
**Plan must include:** the data-shape rule verbatim; UAT: restore after dept archive, corrupt localStorage, Back/Forward after restore, search UAT script re-run with zero echo regressions.

### Phase 4: Печатный акт приёма-передачи
**Rationale:** The highest real-value RU-office differentiator (M); all data already in the app; the dedicated-print-route decision sidesteps every shell conflict (sticky bar, fixed bulk panel, dialog portals) and mirrors the export-route precedent of a thin surface over shared data.
**Delivers:** Session-guarded print-only route (no shell, no islands; `@page A4`, `print-color-adjust: exact` for verdict colors, `break-inside: avoid`, `thead` repetition); single-position act from the issue dialog + batch act from the employee card; org/руководитель details one-time input (localStorage); «Печать акта» navigation + `window.print()`.
**Addresses:** FEATURES P1 differentiator (акт).
**Avoids:** Pitfall 9 (in-place `@media print` is the fragile path — fixed elements repeat per page, backdrop-blur prints translucent, an open dialog prints instead of the card); pitfall 13 (act «Актуально на» stamp from `displayTodayUtc()`).
**Plan must include:** the architecture decision (dedicated route — recommended — vs in-place media-print) as the plan's first item; `requireSession()` on the print route («no shell» ≠ «no auth»); paper UAT in Chrome AND Safari, multi-page act, 401 when logged out.

### Phase 5: QR-этикетки
**Rationale:** S–M; directly reuses the Phase-4 print-surface pattern and the existing bulk checkbox selection (партия клонов → партия этикеток одним проходом); enhances mobile card viewing from Phase 2's polish.
**Delivers:** QR on the device card; printable A4 label sheet from selection (fixed grid, `qrcode` SVG); QR content = plain `/devices/{id}` deep link (no tokens; auth still guards the card).
**Addresses:** FEATURES P1–P2 differentiator (QR-этикетки, simple version).
**Avoids:** Pitfall 10 (URL from `BASE_URL` env validated at boot — never request headers; SVG not canvas; `@page` margins + `break-inside: avoid` so labels don't split; screen preview before paper).
**Plan must include:** BASE_URL + SVG-renderer decisions as first tasks; UAT: scan from an office phone over Wi-Fi → card opens; one full sheet prints without split labels; stock iOS camera reads it at arm's length.

### Phase 6 (optional, owner's call at requirements): Быстрые действия и/или печатная Сводка
**Rationale:** FEATURES second echelon. Quick actions touch the movement write-path — the strongest regression zone, freshly hardened in v1.2 — so they deserve the fullest validation discipline and come before any mass convenience. Сводка goes last: pure read composition over then-stabilized predicates.
**Delivers:** Row-level «Принять/Выдать» as thin UI over the EXISTING movement server actions (in-tx prevalidation, blocker reports, guard-UPDATE; `useTransition` pending, no optimistic badge); and/or dashboard aggregates («Сводка») composing `deviceWhere`/`warrantyPredicate` with once-per-render `today`, deep-links via the ONE builder, printable one-pager.
**Addresses:** FEATURES P2 candidates (quick actions, сводка).
**Avoids:** Pitfall 12 (direct status writes, double-submit, optimistic patches) and 13 (frozen-clock MSK-boundary tests; сводка↔deep-link parity).
**Plan must include:** the write-path decision as the phase's architecture core; repeat-test double-submit (bulk checker W1 precedent); grep-verified zero status writes outside the replay module; UI-SPEC resolution of the quick-action-vs-checkbox row layout before implementation.

### Phase Ordering Rationale

- **XLSX first** (pitfalls ordering + architecture build order agree): self-contained, spike-gated, highest visible value; its shared-helper refactor (parse-strip into query-params.ts) is mechanical and lands before anything else touches the routes.
- **Lightbox second** because it is fully independent (could parallel Phase 1) and carries the milestone's main *client* risk (gestures vs Dialog) — isolating it keeps reviews small. Mobile polish rides the same wave.
- **Saved views before Акт/QR** as the cheapest P1 win and a warm-up in localStorage discipline; **Акт before QR** because QR reuses the act's print-surface pattern and dedicated-route decision.
- **Quick actions after the print features**, not before: the write-path-adjacent work lands on top of a stabilized codebase and gets the fullest validation (repeat tests, grep audits); **Сводка last** so its aggregates compose predicates that have already survived four phases of consumers.
- **Scope gate:** Phases 3–6 all come from the conveniences tier that PROJECT.md defers to requirements scoping — the roadmapper should treat Phase 6 (and possibly 5) as owner-selected; the P1 core recommendation is Акт + Saved views + QR-simple.

### Research Flags

Phases likely needing deeper research or a resolved decision during planning (`/gsd:plan-phase --research-phase`):
- **Phase 2 (Lightbox):** gesture web material is MEDIUM confidence (no official spec pin); if ESC-resets-zoom is ever wanted, Base UI 1.7's `onOpenChange` event-details interception API must be verified in phase research before planning (recommended default: ESC closes, double-click resets — no interception needed). The bundling of wheel/pinch edge cases into a UAT matrix is the plan's job.
- **Phase 4 (Акт) + Phase 5 (QR):** print/web material MEDIUM confidence; the print-route-vs-media-print and BASE_URL/SVG decisions are planning decisions (research already recommends), but the act's exact реквизиты layout deserves a quick doc pass during phase planning.
- **Phase 6 (Quick actions):** decision-heavy rather than research-heavy — the write-path contract (reuse existing actions, transaction shape, blocker reports) is prescribed; what's needed is strict adherence plus repeat-tests, and the row-layout UI-SPEC.

Phases with standard patterns (skip research-phase):
- **Phase 1 (XLSX):** stack research is probe-verified against the pinned artifact; API shapes, entry points, header contract and test strategy are fully prescribed. The spike is an implementation *task* (first one), not research.
- **Phase 3 (Saved views):** the entire mechanism (query-string artifact, versioned envelope, restore-through-parser) is prescribed with UAT steps; composes proven in-repo machinery.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | XLSX decision probe-verified against the actual pinned 4.1.1 artifact on this machine (OOXML inspected); rejections verified against npm registry + NVD primary sources; lightbox findings verified against the locally pinned @base-ui/react 1.7.0 |
| Features | MEDIUM | Snipe-IT official features/docs HIGH (verified fetch); RU акт practice MEDIUM (multiple mutually corroborating sources); alerts/reports SaaS claims LOW–MEDIUM — adequate for scope selection, not for act-layout detail |
| Architecture | HIGH | Every integration point verified by reading production code this run; Next 16.3.3 claims from pinned bundled docs; write-excel-file date math verified from published source |
| Pitfalls | HIGH | XLSX cell/Date/sheet behavior source-verified against published 4.1.1 modules; Next claims verified against pinned docs; project-recurrence items verified against the decision log; gesture/print/localStorage material MEDIUM (multi-source corroborated, no spec pin) |

**Overall confidence:** HIGH for what to build and how it integrates; MEDIUM for web-gesture/print craft and RU-act document detail — the correct polarity, since implementation surfaces are artifact-verified while interaction/document polish is practitioner consensus.

### Gaps to Address

Decisions and verifications for planning (none block roadmap creation):

- **Autofilter support:** absent from write-excel-file (PR #19 unmerged). Workaround documented (Данные → Фильтр). Re-check the PR at Phase-1 implementation; do not switch libraries for it (styling is the hard requirement, SheetJS can't).
- **Sheet-name option name in write-excel-file v4:** one-line implementation-time probe («Устройства»/«Ведомость», ≤31 chars, no `: \ / ? * [ ]` — validation throws otherwise).
- **XLSX date display format:** real Date cells with `dd/mm/yyyy` (recommended — RU-readable, sorts by underlying serial) vs ISO-string cells for byte-parity with CSV. Confirm in Phase-1 planning.
- **XLSX styling depth:** bold header + widths (+ frozen row) recommended; borders/freeze are cheap differentiators — pick in planning.
- **`notes` 32,767-char cell cap:** LOW confidence on library guarding — test a pathological note; slice defensively if needed.
- **Lightbox extras (prev/next, swipe-between):** cheap (the array is already in photo-grid scope) but expand the gesture surface — in/out decision at Phase-2 planning; touch pinch on phones is the hand-rolled version's one genuine gap (`yet-another-react-lightbox@3.32.2` is the documented fallback if phone use becomes a real requirement).
- **Conveniences scope:** Phases 3–6 are the owner's selection at requirements (P1 recommendation: Акт + Saved views + QR-simple); quick actions additionally need the row-layout-vs-checkboxes UI-SPEC decision before any implementation.
- **Zoom feel (wheel sensitivity, double-click step):** UAT matter, deliberately not researched.

## Sources

Aggregated from the four research files; per-claim attributions live in each file.

### Primary (HIGH confidence)
- **Empirical probe (this machine, 2026-09-29):** `write-excel-file@4.1.1` installed in isolation; RU/Ё workbook generated; emitted OOXML inspected — frozen pane, column widths, style attrs, numeric cells, Cyrillic sharedStrings, autofilter absent
- write-excel-file 4.1.1 published source + README/CHANGELOG (jsDelivr/GitHub): export map, `convertDateToSerialNumber` (pure UTC), `validateSheetName`, cell.js strict typing, type table, `format: '@'`, Date-format requirement, `toBuffer/toStream/toFile`, «Cannot determine length»
- npm registry (queried directly 2026-09-29): exceljs 4.4.0 (publish 2024-12, 21.8 MB), write-excel-file 4.1.1 (2026-06, 1.8 MB), xlsx 0.18.5 stale; NVD: four unfixed 2026 exceljs CVEs (incl. CVE-2026-78207, 9.4)
- Local pinned artifacts: `node_modules/@base-ui/react@1.7.0` (Dialog parts, `modal` prop, no lightbox primitive), `node_modules/next/dist/docs/` (route handlers, serverExternalPackages default list incl. better-sqlite3/sharp)
- Codebase (read this run): `lib/device-csv.ts`, `lib/csv.ts`, `lib/photos.ts`, `lib/warranty.ts`, `db/queries/devices.ts`, `db/schema.ts` (serial/inventory TEXT), `app/api/devices/export/route.ts`, `app/api/attachments/[attachmentId]/route.ts`, `app/(app)/(card)/devices/[id]/photo-grid.tsx`, `app/(app)/devices/{filter-bar,query-params,device-bulk}.*`, `app/(app)/page.tsx`, `app/(app)/layout.tsx`, `components/command-palette.tsx`, `components/ui/dialog.tsx`, `next.config.ts` (`output: "standalone"`), `tests/csv-export.test.ts`
- First-party decision log (`.planning/PROJECT.md`): CR-01/1a31814, D-02, D-03/D-04, D-06, D-07, D-08, WR-01/a8c2bf7, c4b2e2d, G-5-1/G-5-2/G-7-1, 74eb0d9/42ebf57/10c3cee
- Snipe-IT official product features + Asset Labels docs (v8.6.3) — verified fetch

### Secondary (MEDIUM confidence)
- Акт приёма-передачи: assistentus.ru, glavbukh.ru, e-kontur.ru, consultant.ru (2 экз., реквизиты, ст. 241/244 ТК РФ)
- Gesture/web platform: MDN Pointer Events + `touch-action` + `pointercancel`; Chromium pinch-zoom preventDefault; danburzo.ro wheel/pinch; React ≥17 root-passive wheel listeners
- Print CSS: CSS-Tricks/SO (fixed repeats per page), `print-color-adjust`, `@page`, `thead { display: table-header-group }`
- URL-state/localStorage patterns: LogRocket useSearchParams, redux-persist versioned envelopes
- Saved views UX precedent: Oracle interactive reports, TanStack Router discussions
- ITAM reports/alerts practice: InvGate, Setyl, OfficeSpace, Oracle, AutoSist (alert fatigue, cost/department reports)

### Tertiary (LOW confidence, non-load-bearing)
- Asset Panda feature pages/help center (mobile scanning, saved searches) — search-level
- XLSX 32,767-char cell cap behavior in write-excel-file — single source; verify with a pathological-note test in phase

---
*Research completed: 2026-09-29*
*Ready for roadmap: yes*
