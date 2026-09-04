---
phase: 05-search-filters
plan: 04
subsystem: csv-export
tags: [csv, rfc-4180, cwe-1236, formula-injection, rfc-5987, nextjs-route-handler, drizzle, zero-dependency]

# Dependency graph
requires:
  - phase: 05-search-filters
    plan: 01
    provides: "parseDevicesSearchParams/buildDevicesQuery (query-params.ts — the ONE parser/builder the route and the link reuse)"
  - phase: 05-search-filters
    plan: 02
    provides: "the composed listDevices where-builder (q+type+status+department+warranty+RAM) factored into deviceWhere; the FilterBar end slot (ml-auto)"
  - phase: 05-search-filters
    plan: 03
    provides: "formatWarrantyDate (module-level UTC dd.mm.yyyy formatter) reused for both date columns"
  - phase: 03-device-registry
    provides: "attachments-route precedent (requireSession-first, nosniff, typed headers); deviceTypeName/deviceStatusLabel"
provides:
  - "lib/csv.ts — pure RFC-4180 writer: esc() with the tab-prefix CWE-1236 guard, buildCsv (BOM + «;» + CRLF), csvResponseHeaders (hardcoded Content-Type, RFC 5987 dual filename, nosniff, no-store)"
  - "app/api/devices/export/route.ts — authenticated GET (requireSession-first), the page's exact parser, full filtered scan, 15-column superset of the list columns"
  - "deviceWhere — the ONE filter predicate assembly in db/queries/devices.ts consumed by listDevices AND exportDevices (one predicate, two callers — drift unrepresentable)"
  - "exportDevices({ type, filters }) — full filtered result, holder + holder's department joined, canonical RU-sort + id order, no limit/offset"
  - "«Скачать CSV» server-rendered <a> at the bar end (filters via buildDevicesQuery, page omitted)"
  - "tests/csv-export.test.ts — injection matrix, BOM/«;»/CRLF shape, export-vs-pages parity, header contract, zero-dependency negative assertions"
affects: [05-VALIDATION end-of-phase manual check (CSV open in Excel/Numbers), v2 export extensions]

# Tech tracking
tech-stack:
  added: [] # zero new packages (T-05-SC — the writer is hand-rolled by design)
  patterns:
    - "CSV cells: tab-prefix FIRST (leading = + - @ TAB CR), RFC-4180 quoting SECOND (only \";/LF/CR, inner quotes doubled) — the two guards compose ('=1;2' → \"\\t=1;2\")"
    - "One predicate, two callers: deviceWhere(type, filters) factored out of listDevices; exportDevices is literally the same WHERE — parity export == union of pages is exact-sequence equality"
    - "Pure vitest-callable header builder (csvResponseHeaders) pins the security-header contract without a server; the route doc comment carries the contract terms"
    - "Route reuses the page's parser + an identical 6-line sentinel strip; dates render through the ONE formatWarrantyDate UTC formatter (plan 05-03 reuse)"

key-files:
  created:
    - lib/csv.ts
    - app/api/devices/export/route.ts
    - tests/csv-export.test.ts
  modified:
    - db/queries/devices.ts
    - app/(app)/devices/filter-bar.tsx

key-decisions:
  - "Export is a BYPRODUCT of the registry (D-18 anti-«параллельная таблица»): the predicate assembly was factored into private deviceWhere(type, filters) consumed by both listDevices and exportDevices — a filter change can only land in one place"
  - "csvResponseHeaders(isoDate) lives in lib/csv.ts (per plan revision) — pure and vitest-callable, so Task 2 pins Content-Type/dual-filename/nosniff/no-store without booting a server; the route comment documents the contract it applies"
  - "CSV columns = the 15-field superset of the six list columns (RESEARCH Pattern 5 / A3): Тип, Модель, Серийный, Инвентарный, Статус, Держатель, Отдел, RAM ГБ, RAM апгрейдена (да/нет/пусто per D-06), SSD ГБ, Дата закупки, Стоимость, Поставщик, Гарантия до, Заметки"
  - "Date columns render via the ONE formatWarrantyDate UTC formatter (blessed by 05-03) — no second date formatter can disagree with the registry rows"
  - "Parity anchored by exact-sequence equality across a real multi-page walk (25 matching devices over pageSize 20) PLUS an independent correctness anchor (the expected serial set) — parity alone could not catch both queries drifting together"

patterns-established:
  - "File-output injection sink discipline: every cell passes esc() — leading-danger-char tab-prefix + conditional RFC-4180 quoting; no raw join path exists anywhere in the export"
  - "Auth'd download route shape: requireSession() first statement → shared parser → full scan → hardcoded header set from a pure builder; no error path echoes internals (parser degrades, never a 500)"
  - "Server-rendered download link: plain <a> to the api route with the ONE builder's query string (page omitted — pagination state is not a filter); browser-native download UI is the feedback"

requirements-completed: [FIND-03]

coverage:
  - id: D1
    description: "D-18 literal: «Скачать CSV» downloads the FULL result of the CURRENT filters — one parser (parseDevicesSearchParams), one predicate (deviceWhere), two callers; export == union of listDevices pages, exact order"
    requirement: FIND-03
    verification:
      - kind: unit
        ref: "tests/csv-export.test.ts#exportDevices — full-filter parity with listDevices > with q + type + status + department + warranty + RAM all active, the export equals the union of pages IN canonical order"
        status: pass
      - kind: grep
        ref: "route.ts imports parseDevicesSearchParams from '@/app/(app)/devices/query-params' (line 8) and calls it (line 55); devices.ts deviceWhere consumed by listDevices and exportDevices"
        status: pass
    human_judgment: false
  - id: D2
    description: "CWE-1236 structurally dead: every exported cell passes esc() — leading = + - @ TAB CR tab-prefixed, separator/quote/LF/CR quoted per RFC-4180 — proven by the matrix AND by real export data (model '=1+1;@cmd', supplier with «;», notes with LF, inventory '-42')"
    requirement: FIND-03
    verification:
      - kind: unit
        ref: "tests/csv-export.test.ts#esc — формула-injection matrix (T-05-10, CWE-1236) > опасное начало нейтрализуется / служебный символ внутри — кавычки"
        status: pass
    human_judgment: false
  - id: D3
    description: "V4/V5/V7: requireSession() is the route's FIRST statement; response carries hardcoded text/csv; charset=utf-8, nosniff, no-store, and the RFC 5987 dual filename (devices-YYYY-MM-DD.csv + «устройства-ГГГГ-ММ-ДД.csv»)"
    requirement: FIND-03
    verification:
      - kind: grep
        ref: "route.ts line 53: `await requireSession()` precedes every other statement; npx next build registers /api/devices/export as dynamic"
        status: pass
      - kind: unit
        ref: "tests/csv-export.test.ts#csvResponseHeaders — dual filename + security headers > exact Content-Disposition with encoded Cyrillic + nosniff/no-store"
        status: pass
    human_judgment: false
  - id: D4
    description: "(UI-SPEC backstop) the file opens in RU Excel/Numbers from the box — BOM/«;»/CRLF correct, Cyrillic intact, no formula execution"
    requirement: FIND-03
    verification:
      - kind: manual
        ref: "05-VALIDATION.md end-of-phase human check: download the CSV once on the seeded dev DB and open it in Excel/Numbers (RESEARCH Pitfall 7) — documented manual-only item, human_verify_mode: end-of-phase"
        status: pending
    human_judgment: true
    rationale: "BOM/«;»/CRLF/mojibake/formula behavior in a real spreadsheet app cannot be asserted from the vitest node environment; the automated layer (shape + matrix + headers) is fully proven — the one-time open is the documented end-of-phase check"

# Metrics
duration: 13min
completed: 2026-09-04
status: complete
---

# Phase 5 Plan 4: CSV Export of the Full Filtered Registry — D-18 Summary

**Authenticated `/api/devices/export` downloads the FULL result of the current filters through the page's exact parser and a shared factored predicate — string-built RFC-4180 CSV (UTF-8 BOM + «;» + CRLF) with a tab-prefix formula-injection guard and an RFC 5987 Cyrillic filename, zero new dependencies.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-04T19:44:36Z
- **Completed:** 2026-09-04T19:57:14Z
- **Tasks:** 2/2 (tracer + auto/tdd)
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- **D-18 end-to-end (tracer):** the bar now ends with «Скачать CSV» (`ml-auto`, secondary recipe, `h-10` 14/400, press rule) — a plain server `<a>` to `/api/devices/export` + `buildDevicesQuery(filters)` with page omitted. The route authenticates (`requireSession()` FIRST statement), parses with the page's EXACT `parseDevicesSearchParams`, strips sentinels identically to the page, scans the full filtered set via `exportDevices` (holder + holder's department joined, RU-sort + id, no limit/offset), and responds with BOM + «;» + CRLF CSV, the RFC 5987 dual filename and the nosniff/no-store header set.
- **Zero drift by construction:** the predicate assembly was factored out of `listDevices` into private `deviceWhere(type, filters)`; both the page's query and the export consume it — «полный результат текущих фильтров» is literally the same predicate, not a reimplementation.
- **CWE-1236 dead at the escaper (T-05-10):** every cell passes `esc()` — leading `= + - @` TAB CR is tab-prefixed (OWASP), separator/quote/LF/CR quoted per RFC-4180 with doubled inner quotes; the two guards compose. No raw join path exists.
- **The proof layer (Task 2, 26 tests):** injection matrix; BOM (`charCodeAt(0) === 0xFEFF`)/«;»/CRLF shape with column-count integrity; full-filter parity — with all six dimensions active the export equals the multi-page `listDevices` walk in exact canonical order (25 matching devices, decoys excluded per dimension, «Отдел» = D-09 holder's dept); the header contract pinned via the pure `csvResponseHeaders`; negative assertions that no CSV library exists in package.json or the imports.
- **Zero installs (T-05-SC):** the writer is ~40 hand-rolled lines in a pure module — the prohibition held; package.json untouched by this plan.

## Task Commits

1. **Task 1: End-to-end CSV export — route, shared predicate, «Скачать CSV» link (tracer)** - `8542a8a` (feat)
2. **Task 2: CSV proof layer — injection matrix, shape, parity, dual filename** - `f690355` (test — 26 tests; matrix discrimination additionally proven by a mutation probe against a guard-less escaper)

**Plan metadata:** (this commit) docs: complete plan

## Files Created/Modified
- `lib/csv.ts` — NEW pure module: `esc` (tab-prefix CWE-1236 guard + conditional RFC-4180 quoting), `buildCsv` (BOM `\uFEFF` + «;» + CRLF, header through the same esc), `csvResponseHeaders` (hardcoded Content-Type, dual-filename Content-Disposition, nosniff, no-store)
- `app/api/devices/export/route.ts` — NEW authenticated GET: requireSession-first, the shared parser + strip, `exportDevices`, 15-column header superset, UTC dd.mm.yyyy dates via `formatWarrantyDate`, RAM апгрейдена да/нет/'' (D-06)
- `db/queries/devices.ts` — `deviceWhere(type, filters)` factored out of `listDevices` (behavior unchanged: 42/42 devices-queries tests green on the refactor); `DeviceExportRow` type + `exportDevices({ type, filters })` with employees + departments leftJoins
- `app/(app)/devices/filter-bar.tsx` — «Скачать CSV» link appended as the LAST bar element (ml-auto), doc comment updated from «joins in plan 04» to the shipped contract
- `tests/csv-export.test.ts` — NEW 26-test suite (matrix, shape, parity+ordering+D-09, real-data escaping, headers, zero-dependency)

## Decisions Made
- **`exportDevices({ type, filters })` mirrors `listDevices`' contract minus pagination.** The plan's shorthand wrote `exportDevices(filters)`; the db-layer `DeviceListFilters` deliberately does not carry `type` (the page passes it separately), so the shared `deviceWhere(type, filters)` signature needs both — the one-predicate property is exactly what the signature preserves.
- **The 6-line sentinel strip lives inline in the route, identical to the page's block.** `page.tsx` is outside this plan's files_modified; the parser (the real anti-drift boundary) is single-sourced, the strip is presence-guard boilerplate, and its behavior is pinned by the parity test's contract.
- **Parity needs a correctness anchor, not just equality.** Both queries share `deviceWhere`, so a bug there would drift them TOGETHER — the test therefore also pins the exact expected serial set (25) and `pages > 1` so the walk is real.
- **Quoting stays strictly RFC-4180 (only `"` `;` LF CR).** A tab-prefixed cell like `-42` is not quoted — the leading TAB already forces text interpretation; quoting beyond the spec would add no safety.

## Deviations from Plan

### Documented interpretations (no code deviation)

1. **TDD RED gate (Task 2, tdd="true"):** a classic RED was structurally impossible — the Task-1 tracer already shipped every function/route/query the tests exercise (the plan itself notes «RED … is impossible — Task 1 wrote them»). The suite was committed as a single `test(...)` commit; its discriminating power was proven separately by a mutation probe: against a naive guard-less escaper, 5 of the injection matrix cases fail (injection survives), and the parity test pins a concrete 25-serial set that a drifted predicate would break.
2. **`filename*` grep in the route:** the dual-filename headers are built by the pure `csvResponseHeaders` in `lib/csv.ts` (per the plan's own revision aligning artifact list and task), so the route's doc comment carries the `filename*` contract term it applies — the structural check passes on accurate documentation of the composed header, not on duplicated logic.

**Total deviations:** 0 auto-fixed; 2 documented interpretations.
**Impact on plan:** none — both are the plan's own documented revisions/shorthands made concrete.

## Issues Encountered
- One test-authoring iteration: the real-data assertion initially expected quoting around the tab-prefixed `-42` cell; the plan's quoting rule (fire only on `"` `;` LF CR — cf. the '-2' matrix case) correctly leaves it unquoted. Fixed the expectation, not the code; 26/26 green after.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- **Phase 5 is now functionally complete** (plans 01–05 executed): search, combinable filters, RAM fast filter, warranty coloring, perf gate, and the D-18 CSV export are all in place; full suite **278 tests / 18 files** green (baseline after 05-05: 252/17), `tsc --noEmit` clean, `eslint` clean, `npx next build` green with `/api/devices/export` registered (dynamic).
- **End-of-phase human check (05-VALIDATION.md)** owns the CSV backstop: download once on the seeded dev DB and open in Excel/Numbers — Cyrillic intact (no mojibake), one column per field, no formula execution (RESEARCH Pitfall 7); plus the previously documented reseed + «мгновенно» + visual items.
- Plan 05's perf test documents an optional equivalent swap (raw-SQL count mirror → `exportDevices`); left as-is — the export refactor landed after the wave-3 gate and the mirror keeps the test self-contained.

---
*Phase: 05-search-filters*
*Completed: 2026-09-04*

## Self-Check: PASSED

- SUMMARY exists: .planning/phases/05-search-filters/05-04-SUMMARY.md
- All 5 task files exist on disk (3 created, 2 modified)
- Commits verified in git log: 8542a8a (Task 1 tracer), f690355 (Task 2 test layer)
- Structural proofs re-verified in source: requireSession-first (route line 53), shared parser import (line 8), `\uFEFF` in lib/csv.ts, «Скачать CSV» in filter-bar.tsx
- Full suite: 278 tests / 18 files green; `tsc --noEmit` clean; `npx next build` green (/api/devices/export registered)
