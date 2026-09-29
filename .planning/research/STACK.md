# Stack Research — v1.3 «Удобство и выгрузка» (milestone delta)

**Domain:** Stack additions for 3 new feature areas on the existing Barahlo app — XLSX export of the 20-column ведомость, photo lightbox, manager-convenience features (Next.js 16.3.3 / React 19 / Base UI / SQLite, internal, single user, RU locale)
**Researched:** 2026-09-29
**Confidence:** HIGH — XLSX decision is probe-verified against the actual pinned artifact (library installed, workbook generated, OOXML inspected); exceljs/SheetJS disqualifications are npm-registry + NVD primary-source verified; lightbox findings verified against the locally pinned `@base-ui/react` package

## Executive Verdict

**Exactly one new npm dependency this milestone: `write-excel-file@4.1.1` (exact pin), server-only.** The lightbox needs **zero** new dependencies — the already-pinned `@base-ui/react` Dialog plus ~100–150 lines of hand-rolled zoom covers it. Manager-convenience features (scoped in FEATURES research) are expected to ride the existing stack. The XLSX feature is a **composer**, not a subsystem: the new route reuses the CSV route's entire zero-drift chain, and the new `lib/device-xlsx.ts` reuses `lib/device-csv.ts`'s header/labels so the two files cannot diverge.

## Recommended Stack (delta by feature)

### 1. XLSX export — `write-excel-file@4.1.1`, the only new dependency

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `write-excel-file` | **4.1.1** (pin exact, not caret) | Generate the XLSX ведомость server-side in a GET route handler | Only candidate that is simultaneously: (a) **actively maintained** — 4.0.3→4.1.1 published Apr–Jun 2026, last publish 2026-06-08; (b) **tiny** — one runtime dep (`fflate`), `npm ls` verified 2 packages total, `engines: node>=18`; (c) **feature-sufficient** — bold/fill/border header styling, column widths, frozen first row all probe-verified in the emitted OOXML (table below); (d) **TypeScript types ship with the package**; (e) **Cyrillic probe-verified** (`Модель`, `ЁЁ` round-trip in `sharedStrings.xml` UTF-8); (f) v4 API is buffer/stream-native — `writeExcelFile(data, options).toBuffer()` maps directly onto a Web `Response` |

**Feature verification table** (empirical: installed the pinned version, generated a RU workbook, unzipped and read the OOXML):

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Styled header (bold, fill, borders, align, wrap) | ✅ | README documents `fontWeight: 'bold'`, `backgroundColor`, `textColor`, `borderColor`/`borderStyle`, `align`, `wrap`; probe header cells emitted `s="1"` + `styles.xml` |
| Column widths | ✅ | Probe emitted `<col min="1" max="1" width="12" customWidth="1"/>` per column |
| **Frozen first row** | ✅ | `stickyRowsCount: 1` emitted `<pane ySplit="1" xSplit="0" topLeftCell="A2" activePane="bottomRight" state="frozen"/>` |
| **Autofilter** | ❌ **not supported** | Absent from README and CHANGELOG; open PR [#19 "Support auto filter"](https://github.com/catamphetamine/write-excel-file/pull/19), unmerged. **Honest gap.** No maintained library offers autofilter *and* styling (exceljs: both, but 4 unfixed CVEs; SheetJS CE: autofilter, but **no styling**). Workaround: management clicks Данные → Фильтр once. Non-blocking; re-check PR #19 at implementation |
| Cyrillic content safety | ✅ | `Тип`, `Модель`, `Истекает`, `Действует`, `ЁЁ` round-tripped; strings are UTF-8 XML — no codepage machinery, unlike CSV |
| Numbers as numbers | ✅ | `type: Number` emitted `<c r="D2"><v>249900</v></c>` (no `t="s"`) — Excel sees a real number. **This kills the CSV `diagonalCell` «21,5» comma hack: in XLSX write `screenDiagonal` as a plain Number and RU-Excel renders «21,5» itself**; no «число как текст» green triangles |
| Streaming for hundreds of rows | Available, unnecessary | `.toStream()` exists; 20 cols × hundreds of rows ≈ 50–150KB (probe: 3 rows = 3.4KB). In-memory `.toBuffer()` is correct; streaming is YAGNI at this scale |
| Bundle/deps weight | ✅ | 1 dep; imported server-only — zero client bundle impact. Pure JS → **no `serverExternalPackages` entry** (unlike `better-sqlite3`) |

**Why not the alternatives** — this is the load-bearing comparison:

| Candidate | Verdict | Primary-source evidence |
|-----------|---------|------------------------|
| `exceljs` 4.4.0 | **Avoid** | npm `time` map: last stable release **2023-10-19** (only a 4.4.1-prerelease Dec 2024 since). NVD: **four unfixed 2026 CVEs through 4.4.0** — CVE-2026-78206 (DoS, 7.5), **CVE-2026-78207 (prototype pollution, 9.4 CRITICAL)**, CVE-2026-78208 (path traversal, 7.5), CVE-2026-78209 (formula injection/CWE-1236, 8.2). 9 runtime deps, 21.8MB unpacked; Snyk flags unmaintained |
| `xlsx` (SheetJS) | **Avoid** | npm registry frozen at **0.18.5 (2022-06)**; CVE-2023-30533 + CVE-2024-22363 fixed only in `cdn.sheetjs.com` 0.20.x tarballs — unfixable via a normal npm pin; Community Edition **cannot style cells on write** (pro-only) — a styled ведомость is impossible; parsing (its strength) is Out of Scope (PROJECT.md) |
| `excel4node` 1.8.2 | Avoid | Last publish 2023-05, 11 deps |
| `xlsx-js-style` 1.2.0 | Avoid | Stale 2022 fork of already-stale SheetJS 0.18 — inherits the CVE story |
| `xlsx-populate` / `node-xlsx` | Avoid | Dormant + lodash-bound / wraps the SheetJS CDN tarball (unfixable-from-npm dep) |

**Integration shape** (mirrors the CSV route exactly — the zero-drift contract in `app/api/devices/export/route.ts`):

```
requireSession() FIRST → searchParamsRecord() → parseDevicesSearchParams()
→ toDeviceListFilters() → exportDevices() → [NEW buildDeviceXlsx(rows, today)]
→ new Response(new Uint8Array(buffer), headers)
```

- New GET route `app/api/devices/export/xlsx/route.ts`; UI is a plain server-rendered `<a>` «Скачать Excel» next to «Скачать CSV» — browser-native download, no JS.
- New pure module `lib/device-xlsx.ts`: `buildDeviceXlsx(rows, today): Buffer` — vitest-pinnable (header parity with `deviceCsvHeader()`, number typing, `stickyRowsCount: 1`, CSV↔XLSX cell parity). Server surface only — never imported from client components.
- Headers mirror `csvResponseHeaders`: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, RFC 5987 dual filename («устройства-ГГГГ-ММ-ДД.xlsx» + ASCII fallback). Next 16 GET handlers are not cached by default (bundled docs), no-store kept anyway.
- Sheet name «Устройства» (Cyrillic safe, « 31 chars); the exact v4 option name is a one-line implementation-time probe (LOW impact).
- Pin exact `4.1.1`: the 3.x→4.x migration history argues against caret drift.

### 2. Photo lightbox — zero new dependencies (the decision that matters)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `components/ui/dialog.tsx` | @base-ui/react **1.7.0** (already pinned) | Modal shell | Local package verified: Dialog ships root/backdrop/trigger/title/description/close/popup/portal/viewport/store; `DialogRoot.modal` accepts `boolean \| 'trap-focus'`. ESC, focus trap, scroll-lock, a11y — the hard 20% — come free |
| Hand-rolled zoom state | in-repo client component, ~100–150 LOC | Zoom + pan | Wheel / double-click / ±-keys adjusting CSS `transform: scale() translate()`; drag-to-pan; prev/next across the device's ≤8 photos. Matches house discipline (hand-rolled `lib/csv.ts`, palette-without-cmdk); Apple aesthetic preserved through existing tokens |
| Existing attachments route | `/api/attachments/[attachmentId]` | Full-size image source | Photos are `[key, thumbKey]` file pairs in DB; lightbox requests the full-size `key` — **no DB, schema, or sharp changes** |
| `scroll-area` (optional thumbnails strip) | @base-ui/react 1.7.0 | Filmstrip | Already in the installed package |

**Base UI has no lightbox/zoom primitive** (grep-verified across the pinned 1.7.0 package; the drawer's incidental pinch handling is not a lightbox). Hand-rolling on Dialog is enough for a desktop-first single-user app.

**Documented fallback (not installed now):** `yet-another-react-lightbox@3.32.2` — zero runtime deps, active (published 2026-07-30), `peerDependencies` include `react ^19` (registry-verified), zoom plugin ships in the main package, 241KB unpacked. Adopt **only if** touch pinch-zoom on phones becomes a scoped requirement (photos upload from phones; management happens on desktop). Mature touch-gesture math is the one thing the hand-rolled version genuinely lacks.

### 3. Manager-convenience features — expected zero new dependencies

Whatever FEATURES research scopes (quick filters, favorites, print view, etc.) composes from the installed surface: Base UI primitives (popover/menu/dialog/toast/toolbar/tooltip/menubar all present in 1.7.0), zod 4, drizzle, server actions, the ⌘K palette's predicate-reuse pattern. Treat any proposed npm install for this area as requiring explicit justification in the phase plan.

## Installation

```bash
# The only new production dependency this milestone
npm install write-excel-file@4.1.1

# Nothing else. No dev dependencies beyond existing vitest/playwright.
```

## What NOT to Add (reuse contract)

| Do NOT add | Why | Reuse instead |
|------------|-----|---------------|
| `exceljs` / `xlsx` / `xlsx-js-style` / `xlsx-populate` / `node-xlsx` / `excel4node` | Maintenance/CVE/style findings above | `write-excel-file@4.1.1` |
| Client-side XLSX generation | Ships the library to the browser; duplicates the export; drifts from the CSV route's chain | Server-side generation in the GET route (CSV precedent) |
| A second 20-column mapping for XLSX | Two column dictionaries = drift (the D-02 keystone lesson) | `deviceCsvHeader()` + extract the per-row cells mapping from `buildDeviceCsv` into one pure function (e.g. `deviceExportCells(rows, today)`) consumed by BOTH builders — one edit changes both files |
| Porting the CSV «21,5» decimal-comma hack to XLSX | CSV-only artifact: CSV has no cell types; XLSX numeric cells render per viewer locale | `type: Number` for `screenDiagonal`/`purchasePrice`/`ramGb`/`ssdGb`/`portCount` |
| Porting `esc()`/CWE-1236 guard to XLSX | XLSX string cells are inert on open (no formula interpretation); the guard is a CSV-delimiter concern | `lib/csv.ts` untouched, stays CSV-only |
| Excel date serials | D-06: ISO `yyyy-mm-dd` text sorts lexicographically, locale-independent | Existing `isoFileDate` from `lib/device-csv.ts` |
| Changes to photos DB schema or sharp pipeline | `[key, thumbKey]` pairs + thumbnails already exist | Existing `/api/attachments/[attachmentId]` route |
| `cmdk`, Radix, ag-grid, any lightbox/table lib | Palette precedent (Base UI composition, no cmdk); house kit is Base UI + base-nova | Existing `@base-ui/react` primitives + hand-rolled composition |
| SheetJS for parsing/import | Import from spreadsheets is explicitly Out of Scope (PROJECT.md) | — |

**Keystone-derived reuse that must survive into XLSX:** config-block labels via `keystoneLabel` over `CONFIG_EXPORT_KEYS`; «Статус гарантии» via `WARRANTY_STATE_LABELS[warrantyState(until, today)]` — parity with the site color by construction (WR-01), `today` hoisted once per request.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `write-excel-file` 4.1.1 | `exceljs` 4.4.0 | Almost never for new code. Only if autofilter becomes a hard requirement AND a hardened/fixed exceljs release appears — not the case today |
| `write-excel-file` 4.1.1 | `xlsx` (SheetJS, CDN tarball) | Only for parsing arbitrary spreadsheets — not our case (no import feature) |
| Hand-rolled Dialog lightbox | `yet-another-react-lightbox` 3.32.2 | If pinch-zoom/complex touch gestures become a hard requirement |
| New GET route `…/export/xlsx` | Query param `?format=xlsx` on the existing export route | Prefer the separate route: distinct content-type/disposition/header-set logic stays per-route, matching the thin-composer style of `route.ts` |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `write-excel-file@4.1.1` | Node >=18 (`engines` verified); Next 16.3.3 route handlers (Node runtime) | Import the **subpath export** `write-excel-file/node` server-side; pure JS → no `serverExternalPackages` |
| `write-excel-file@4.1.1` | Web `Response` body | `.toBuffer()` returns a Buffer (Uint8Array subclass); wrap `new Uint8Array(buffer)` for clean `BodyInit` typings |
| Next 16.3.3 | GET route handlers | Bundled docs confirm Web `Request`/`Response` APIs; GET not cached by default — keep `no-store` (existing discipline) |
| `@base-ui/react@1.7.0` | React 19.2.8 | Already the validated pinned pair; `modal: boolean \| 'trap-focus'` available (local .d.ts verified) |
| `yet-another-react-lightbox@3.32.2` (fallback) | React ^16.8/17/18/19 peers | Zero runtime deps; CSS sideEffects only |

## Stack Patterns by Variant

**If management never asks for autofilter (expected):**
- Ship `write-excel-file` as recommended; mention Данные → Фильтр in the release note
- Because the file's value is styled readability + correct number types, not interactive filtering

**If autofilter later becomes a hard requirement:**
- Re-evaluate then: PR #19 may have merged; do NOT switch to SheetJS for it (loses styling, which IS a hard requirement), do NOT adopt exceljs forks for one feature

**If phone viewing of the lightbox matters in practice (user feedback):**
- Adopt `yet-another-react-lightbox@3.32.2` rather than hand-rolling pinch gesture math
- Because mature touch handling is the hand-rolled version's one genuine gap

## Open Verification Items (trivial, resolve at implementation)

- Exact v4 option name for the sheet name («Устройства») — one-line probe; LOW impact
- Whether PR #19 (autofilter) merged by implementation time — re-check; non-blocking
- Hand-rolled zoom feel (wheel sensitivity, double-click step) — UAT matter, not a stack matter

## Sources

- npm registry `time`/`dependencies`/`dist`/`engines` for all candidate packages, fetched 2026-09-29 — **HIGH**, primary
- NVD API `keywordSearch=exceljs` — four unfixed 2026 CVEs through 4.4.0 — **HIGH**, primary
- SheetJS npm-vs-CDN CVE gap (CVE-2023-30533, CVE-2024-22363) — registry facts primary-verified; community framing corroborated across multiple sources — **HIGH** for facts, **MEDIUM** for framing
- `write-excel-file` README (GitHub master, current), CHANGELOG, issue tracker (PR #19) — **HIGH**, official
- **Empirical probe** (this machine, 2026-09-29): `write-excel-file@4.1.1` installed in isolation; RU/Ё workbook generated; emitted OOXML inspected — frozen pane, column widths, style attrs, numeric cells, Cyrillic sharedStrings; autofilter absent — **HIGH**, primary artifact
- Local `node_modules/@base-ui/react@1.7.0` — Dialog parts, `modal` prop type, absence of any lightbox primitive — **HIGH**, pinned artifact
- Next.js bundled docs `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — **HIGH**, pinned artifact
- Project source: `app/api/devices/export/route.ts`, `lib/device-csv.ts`, `lib/csv.ts`, `package.json` — **HIGH**, pinned

---
*Stack research for: Barahlo v1.3 «Удобство и выгрузка» — XLSX export, photo lightbox, manager convenience*
*Researched: 2026-09-29*
