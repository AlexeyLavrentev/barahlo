# Architecture Research — v1.3 Integration (XLSX export, photo lightbox, manager conveniences)

**Domain:** Integration architecture for new features on an existing production app (учёт корпоративной техники)
**Researched:** 2026-09-29
**Confidence:** HIGH (all integration points verified by reading the actual production code this run; library facts source-verified against npm registry and library source; mobile gesture guidance MEDIUM — see Sources)

## Standard Architecture

### System Overview — the seam the features plug into

The app already has a rigid five-layer shape. Every v1.3 feature is an *insertion into an existing layer*, never a new layer:

```
┌──────────────────────────────────────────────────────────────────────┐
│ SURFACES (RSC pages + thin server components)                        │
│  devices/page.tsx · (card)/devices/[id]/page.tsx · (app)/page.tsx    │
│  filter-bar.tsx («Скачать CSV» <a>) · command-palette.tsx (CSV row)  │
├──────────────────────────────────────────────────────────────────────┤
│ CLIENT ISLANDS ('use client', flat serializable props only)          │
│  photo-grid.tsx (lightbox Dialog + delete confirm) · filter islands  │
│  command-palette.tsx (Base UI Dialog+Autocomplete, GET /api/search)  │
├──────────────────────────────────────────────────────────────────────┤
│ ROUTES / ACTIONS (thin composers, requireSession() FIRST)            │
│  /api/devices/export (CSV) · /api/attachments/[id] (photo bytes)     │
│  /api/devices/[id]/photos · /api/search · app/(app)/**/actions.ts    │
├──────────────────────────────────────────────────────────────────────┤
│ PURE LIB (no framework imports, vitest-importable)                   │
│  device-csv.ts · csv.ts · photos.ts · warranty.ts · device-schema.ts │
│  query-params.ts (buildDevicesQuery — the ONE URL builder)           │
├──────────────────────────────────────────────────────────────────────┤
│ QUERY LAYER db/queries/*.ts (pure sync fns over module db, no fw)    │
│  devices.ts: deviceWhere · warrantyPredicate · exportDevices ·       │
│  searchPaletteDevices · dashboard counters (co-located by mandate)   │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (new components in **bold**)

| Component | Responsibility | Integration with existing |
|-----------|----------------|---------------------------|
| **lib/device-xlsx.ts** | The XLSX file's pure layer: sheetData builder + async buffer builder + response headers. Mirrors lib/device-csv.ts discipline verbatim | Imports `deviceCsvHeader()` and `WARRANTY_STATE_LABELS` from lib/device-csv.ts; consumes `DeviceExportRow[]` from db/queries/devices.ts |
| **/api/devices/export-xlsx/route.ts** | Thin composer: session → parse → strip → exportDevices → build → Response | Calls the EXACT same chain as /api/devices/export/route.ts (one parser, one predicate — the D-18 zero-drift contract) |
| **filter-bar.tsx (edit)** | Second `<a>` «Скачать Excel» beside «Скачать CSV» | `href={`/api/devices/export-xlsx${buildDevicesQuery(filters)}`}` — zero new state, no island |
| **command-palette.tsx (edit)** | Second native-anchor row «Скачать ведомость Excel» | Sibling of the CSV_ITEM precedent (native `<a>` render, Enter downloads, handler only closes the palette) |
| **lib/zoom-math.ts** | Pure gesture math: scale clamp, pinch→transform, pan clamp. Vitest-pinnable without DOM | Consumed by the zoom stage island; same pure-lib discipline as lib/csv.ts |
| **photo-zoom-stage.tsx** | 'use client' Pointer-Events zoom/pan stage wrapping the full image | Rendered INSIDE the existing lightbox DialogContent in photo-grid.tsx — Dialog shell, delete confirm and a11y stay untouched |
| **db/queries/devices.ts additions** | Any new manager-convenience counters/lists | CO-LOCATED beside deviceWhere/warrantyPredicate — the file's own header mandates this (a separate dashboard module would force exporting predicate terms = the drift path) |

## Recommended Project Structure

Only additions; nothing moves.

```
lib/
├── device-csv.ts          # EXISTS — labels / warranty dictionary become shared imports
├── device-xlsx.ts         # NEW — deviceXlsxSheetData + buildDeviceXlsx + xlsxResponseHeaders
├── zoom-math.ts           # NEW — pure pinch/pan/clamp math (vitest-pinned)
app/api/devices/
├── export/route.ts        # EXISTS (CSV) — optionally put on a shared 1-liner (below)
├── export-xlsx/route.ts   # NEW — thin composer mirroring export/route.ts
app/(app)/devices/
├── filter-bar.tsx         # EDIT — one more <a> sibling
app/(app)/(card)/devices/[id]/
├── photo-grid.tsx         # EDIT — DialogContent renders PhotoZoomStage instead of bare <img>
├── photo-zoom-stage.tsx   # NEW — 'use client' gesture island
components/
├── command-palette.tsx    # EDIT — one more native-anchor Autocomplete.Item
tests/
├── xlsx-export.test.ts    # NEW — pins the sheetData matrix (mirror of csv-export.test.ts)
├── zoom-math.test.ts      # NEW — pins scale/pan math
```

### Structure Rationale

- **lib/device-xlsx.ts separate from the route:** route.ts is not vitest-importable (imports lib/auth → next/headers), and the 20-column layout must stay positionally pinned by vitest — the exact reason device-csv.ts exists. Shared pieces (header labels, warranty dictionary) are IMPORTED, never duplicated.
- **export-xlsx as a sibling route, not `?format=xlsx` on the existing route:** the CSV route is a production path pinned by tests; a second thin route keeps it untouched and gives a clean URL (`/api/devices/export-xlsx${buildDevicesQuery(filters)}` — appending `&format=xlsx` to the builder output would technically work but is ugly and pollutes either the ONE builder or the link markup). The zero-drift contract is upheld at the FUNCTION level: both routes call the same `searchParamsRecord` → `parseDevicesSearchParams` → `toDeviceListFilters` → `exportDevices` chain — there is no second parse implementation anywhere, which is what the D-18 comment actually mandates ("one parser, one predicate, one sentinel-strip").
- **photo-zoom-stage.tsx co-located in [id]/:** sibling of photo-grid.tsx / timeline.tsx (the established co-location spot for card islands; non-special files in app/ never become routes).

## Architectural Patterns

### Pattern 1: Pure lib file-builder + thin route composer (the device-csv pattern, applied to XLSX)

**What:** the file's bytes are built in a pure, framework-free lib module; the route only composes session + parse + query + builder + headers.
**When to use:** any new file-export surface.
**Trade-offs:** one more file vs. the only alternative (untestable route logic) — not a real trade-off; the project already decided this (D-02, WR-01).

**Key design for lib/device-xlsx.ts — split the library boundary from the pinned core.** The vitest-pinned artifact is the sheetData matrix (like buildDeviceCsv's cells); the write-excel-file call is a 1-line async wrapper, so tests never need an XLSX reader:

```typescript
// lib/device-xlsx.ts — pure; imports ONLY device-schema, warranty,
// device-csv (shared labels), and write-excel-file/node
import writeExcelFile from 'write-excel-file/node'
import { deviceCsvHeader, WARRANTY_STATE_LABELS } from '@/lib/device-csv'
import { warrantyState } from '@/lib/warranty'

// THE PINNED CORE — vitest asserts this matrix exactly like buildDeviceCsv's
// cells. TYPED cells, not CSV strings:
export function deviceXlsxSheetData(rows: DeviceExportRow[], today: Date) {
  return rows.map((r) => [
    deviceTypeName(r.typeKey),                     // string
    r.model, r.serialNumber, r.inventoryNumber,
    deviceStatusLabel(r.status), r.holder, r.departmentName,
    r.ramGb,                                       // number — NOT a string
    ramUpgradedCell(r.ramUpgraded),                // 'да'|'нет'|null (imported from device-csv)
    r.ssdGb,                                       // number
    // config block, contiguous, same CONFIG_EXPORT_KEYS order:
    r.screenDiagonal,                              // NUMBER. RU-Excel renders «21,5»
                                                   // via format '0.0' — diagonalCell()'s
                                                   // comma-string is a CSV-only hack
    r.panelType, r.portCount, r.peripheralKind,
    r.purchaseDate,                                // Date cell — a real serial number:
                                                   // sorts locale-independently (better
                                                   // than CSV's ISO string), format 'dd.mm.yyyy'
    r.purchasePrice, r.supplier,
    r.warrantyUntil,                               // Date cell
    WARRANTY_STATE_LABELS[warrantyState(r.warrantyUntil, today)], // WR-01 parity
    r.notes,
  ])
}

// Header = deviceCsvHeader() verbatim (D-02: one edit to the keystone changes
// the form AND both files). Bold header + column widths via the columns option.
export async function buildDeviceXlsx(rows: DeviceExportRow[], today: Date) {
  return writeExcelFile(
    [deviceCsvHeader().map((label) => ({ value: label, fontWeight: 'bold' })),
     ...deviceXlsxSheetData(rows, today).map(toBeRowCells)],
    { columns: XLSX_COLUMN_WIDTHS },
  ).toBuffer()
}

export function xlsxResponseHeaders(isoDate: string): Record<string, string> {
  // Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  // + RFC 5987 dual filename (устройства-ГГГГ-ММ-ДД.xlsx) + nosniff + no-store
  // — mirror of csvResponseHeaders in lib/csv.ts
}
```

**Route — thin composer; `async GET` is the one shape difference from the CSV route:**

```typescript
// app/api/devices/export-xlsx/route.ts
export async function GET(request: NextRequest) {
  await requireSession()                               // FIRST statement (V3)
  const sp = searchParamsRecord(request.nextUrl.searchParams)
  const filters = parseDevicesSearchParams(sp)         // the ONE parser
  const listFilters = toDeviceListFilters(filters)     // the ONE strip
  const rows = exportDevices({ type: filters.type, filters: listFilters })
  const today = displayTodayUtc()                      // once per request (WR-01)
  const body = await buildDeviceXlsx(rows, today)      // the only await
  const isoDate = new Date().toISOString().slice(0, 10)
  return new Response(new Uint8Array(body), { headers: xlsxResponseHeaders(isoDate) })
}
```

Pinned-docs verified (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`): route handlers are Web `Request`/`Response`; `new Response(body, { headers })` is the exact shape the CSV route already uses — nothing new to learn, no Next-version caveat. **Streaming (ReadableStream) is deliberately NOT used:** hundreds of rows produce a small buffer, single user on LAN, and a Buffer gives `Content-Length` for free.

### Pattern 2: Enhance the existing lightbox Dialog in place (zoom stage island, not a lightbox library)

**What:** the v1.3 complaint («клик открывает картинку, слишком мелкую, чтобы разглядеть») is a gap in the EXISTING lightbox — photo-grid.tsx already has the full apparatus: Base UI `Dialog` (max-w-3xl), sr-only `DialogTitle`, «Удалить фото» button, sibling delete-confirm Dialog, `fullUrl()` serving the 1600px variant with `Cache-Control: private, immutable`. The feature = replace the bare `<img>` inside `DialogContent` with a zoom/pan stage. Do NOT introduce yet-another-react-lightbox / react-photo-view: they render their own portal and chrome, would fight the Dialog shell, evict the delete affordance, and go against both the Apple styling and the project's supply-chain discipline (lib/csv.ts is hand-rolled by design).
**When to use:** enhancing any dialog-embedded viewer.
**Trade-offs:** ~150 lines of gesture code vs. a dependency — mitigated by keeping the MATH pure (lib/zoom-math.ts, vitest-pinned) and the DOM thin.

```typescript
// photo-zoom-stage.tsx ('use client') — thin DOM over pure math
// Stage div: touch-action: none; overflow: hidden; cursor zoom-in/grab/grabbing
// <img src={fullUrl(id)}> — the FULL variant only; the 400px thumb would
//   pixelate at zoom. Optional progressive touch: absolute thumb underneath
//   until full onLoad swaps in (cheap, nice even on LAN).
// Pointer Events (unified mouse/touch/pen — one code path):
//   pointers in a Map (pointerdown → setPointerCapture);
//   one pointer  = pan (only when scale > 1)
//   two pointers = pinch: scale *= distanceRatio, anchored at the midpoint
//   wheel        = zoom at cursor (desktop)
//   dblclick/dbltap = toggle 1x ↔ 2.5x
// pointercancel / lostpointercapture → full release (iOS Safari fires cancel often)
// Writes: transform: translate(...) scale(...) inside requestAnimationFrame;
// gesture state lives in refs, never per-move setState (60 fps, no re-render storm).
// Clamps: scale ∈ [1, 4]; pan clamped to the overflow; scale=1 ⇒ offset reset.
```

Keep in photo-grid.tsx, untouched: the `Dialog`/`DialogContent` shell (a11y, focus trap, Escape, and the `data-slot="dialog-content"` attribute the ⌘K hotkey's "another dialog owns the surface" probe matches on — build the stage INSIDE `DialogContent`, never a raw `DialogPrimitive.Popup`, or that probe silently breaks), the delete button (in the footer row as today; it must stay reachable at any zoom), and the sibling confirm Dialog. `DialogContent` gets a wider class (e.g. `max-w-5xl`, near-fullbleed on phone). **Zero server changes:** the full variant is already served and immutable-cached — zooming re-uses the bytes the browser already fetched.

### Pattern 3: Dashboard/convenience queries co-located with the predicates (the DASH pattern)

**What:** any manager-convenience feature that needs a new number or list gets a query function *in db/queries/devices.ts* (or movements.ts for feed-shaped data), composing the private `deviceWhere`/`warrantyPredicate`. The file's own header says it: co-location IS the D-04 invariant; a separate dashboard module would force exporting predicate terms — the drift path.
**When to use:** every new dashboard tile, counter or «список» row.
**Trade-offs:** devices.ts grows (already ~750 lines) — acceptable; split only if a second aggregate domain ever appears, never per-page.

```typescript
// New convenience counter — the exact shape of warrantyPresetCounts:
export function someNewCount(today: Date = displayTodayUtc()): number {
  return db.select({ value: count() }).from(devices)
    .where(/* compose deviceWhere terms, never re-spell them */)
    .get()!.value
}
// Page consumption: const today = displayTodayUtc() computed ONCE per render,
// handed to every consumer (counters + WarrantyDate) — the WR-01 discipline.
```

Deep-links for every new tile/row go through the ONE builder with a FULL `DeviceFilters` object, other dimensions at inactive sentinels — copy `typeTileHref` / `statusTileHref` / `warrantyCounterHref` in app/(app)/page.tsx verbatim; hand-built filter URLs are forbidden (phase-6 rule; D-08 coupling lives in the builder).

## Data Flow

### XLSX request flow (mirrors the CSV flow structurally, line for line)

```
«Скачать Excel» <a> / palette row (plain href; browser-native download UI is the feedback)
    ↓ GET /api/devices/export-xlsx?…(buildDevicesQuery output)
requireSession → searchParamsRecord → parseDevicesSearchParams → toDeviceListFilters
    ↓ (one parser, one strip, one sentinel rule — shared with the page and the CSV route)
exportDevices (deviceWhere + RU-sort + holder/dept joins) → DeviceExportRow[]
    ↓
buildDeviceXlsx(rows, displayTodayUtc()) → write-excel-file .toBuffer() → Uint8Array
    ↓
new Response(body, { headers: xlsxResponseHeaders(isoDate) })
```

### Lightbox zoom flow (client-only; zero server changes)

```
thumb click → setLightboxId (existing) → Dialog opens (existing)
    → PhotoZoomStage renders <img src=fullUrl(id)>  (immutable-cached; fetched once)
    → pointer/wheel/dbltap events → zoom-math (pure) → rAF transform write
    → «Удалить фото» (existing footer) → confirm Dialog (existing sibling)
    → DELETE /api/attachments/[id] (existing) → router.refresh() (existing)
```

### Key Data Flows

1. **Filter parity (XLSX):** the file MUST equal «что на экране» — guaranteed structurally by reusing parseDevicesSearchParams + toDeviceListFilters + exportDevices; any second parse path WILL drift (the CSV route's own header comment, WR-01).
2. **Warranty verdict parity:** the «Статус гарантии» cell composes `warrantyState(warrantyUntil, today)` through `WARRANTY_STATE_LABELS` — the same calculation behind the site color, so text and color cannot disagree (WR-01/D-03).
3. **Keystone parity (both files):** header labels come from `deviceCsvHeader()` / `keystoneLabel` — one edit to PER_TYPE_FIELDS changes the form AND both files (D-02).

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (1 user, hundreds of devices, ≤8 photos each @1600px) | In-memory XLSX buffer, no streaming, unpaginated file — all fine; phase-5 measured class 0.76 ms @ 600 rows |
| Thousands of devices | Still fine; write-excel-file has `.toStream()` as the drop-in upgrade — do not build it now |
| Never (out of scope per PROJECT.md) | Multi-user, roles, external cloud |

### Scaling Priorities

1. **First bottleneck (theoretical):** none of these features moves the needle — DB queries are single-digit ms and photos are disk-served with immutable private caching. Spend no effort here.

## Anti-Patterns

### Anti-Pattern 1: A second parse/strip path in the XLSX route
**What people do:** re-shaping search params or re-implementing sentinel-stripping «just for xlsx».
**Why it's wrong:** a malformed URL would make the XLSX diverge from the page view — the exact D-08 bug class the CSV route fixed in phase 11 (duplicate `?q=` values).
**Do this instead:** the 5-call shared chain verbatim. Optional hardening: extract `toDeviceListFilters(parseDevicesSearchParams(sp))` into one pure helper in query-params.ts consumed by BOTH export routes (vitest-importable, and it shrinks the CSV route too).

### Anti-Pattern 2: Reusing the CSV cell hacks in the XLSX
**What people do:** copying `diagonalCell()` («21,5» comma-string) and `isoFileDate()` strings into the xlsx builder.
**Why it's wrong:** typed number cells with format `'0.0'` make RU-Excel render «21,5» itself; Date cells sort numerically regardless of display format. String cells would break Excel sorting/filtering and re-create the «21.май» bug in reverse.
**Do this instead:** numbers stay numbers, dates stay Dates; the comma/ISO hacks remain CSV-only. (`esc()` is likewise CSV-only — XLSX string cells are not re-parsed as formulas, so CWE-1236 has no XLSX surface here; notes stay a plain string cell.)

### Anti-Pattern 3: Duplicating the 20 labels or the warranty dictionary in lib/device-xlsx.ts
**Why it's wrong:** parallel dictionaries drift (D-02).
**Do this instead:** import `deviceCsvHeader`/`WARRANTY_STATE_LABELS` from lib/device-csv.ts; extract the inline `да/нет` mapping into an exported `ramUpgradedCell()` there (one-line production refactor, already pinned by tests/csv-export.test.ts).

### Anti-Pattern 4: A third-party lightbox component
**What people do:** `yet-another-react-lightbox` (+ zoom plugin) or `react-photo-view`.
**Why it's wrong:** they own the portal, scrim and chrome — they REPLACE the existing Dialog (losing the delete affordance, confirm-dialog stacking, sr-only title, and the ⌘K probe attribute) instead of enhancing it; supply-chain surface for a solved problem.
**Do this instead:** zoom stage island inside the existing DialogContent; gesture math in pure lib/zoom-math.ts.

### Anti-Pattern 5: `touch-action: none` on the whole dialog, or setState per pointermove
**Why it's wrong:** kills all scrolling/interaction inside the panel; per-move re-renders jank the transform on phones.
**Do this instead:** touch-action only on the stage element; refs + requestAnimationFrame writes; handle `pointercancel` (iOS fires it aggressively).

### Anti-Pattern 6: A separate "dashboard-queries" module for convenience features
**Why it's wrong:** forces exporting deviceWhere/warrantyPredicate terms — the drift path the devices.ts header explicitly forbids.
**Do this instead:** add functions to db/queries/devices.ts beside the predicates; injectable `today` defaulting to displayTodayUtc().

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| lib/device-xlsx.ts ↔ lib/device-csv.ts | direct imports | Header labels, WARRANTY_STATE_LABELS, (optionally extracted) ramUpgradedCell — one source each |
| export-xlsx route ↔ query-params.ts | parse + strip + builder | Same trio the page and CSV route use; the XLSX link needs NO query-param changes (no new DeviceFilters field) |
| export-xlsx route ↔ db/queries/devices.ts | exportDevices() | Unchanged — the XLSX row set IS the CSV row set (same DeviceExportRow superset) |
| photo-zoom-stage ↔ photo-grid.tsx | props: src/alt (+ optional thumbSrc) | Dialog shell, delete flow, confirm sibling, router.refresh() all stay in photo-grid |
| Zoom stage ↔ /api/attachments/[id] | existing GET ?variant=full | Zero server changes; `Cache-Control: private, immutable` already correct |
| New convenience queries ↔ (app)/page.tsx | direct sync calls, once-per-render `today` | Deep-links only via buildDevicesQuery |
| New dialog features ↔ dialog families | components/ui/dialog.tsx recipes | Red destructive reserved («Списать», device delete — UI-SPEC Default 11); neutral ink primary for photo-delete-style confirms; React 19 echo-values-in-state on form error (4886f6a decision) |
| Palette extensions ↔ command-palette.tsx | Autocomplete.Group / native-anchor items | Downloads = native `<a>` anchors (CSV precedent, last keyboard stop; Enter dispatches a real DOM click); new entity kinds would extend /api/search + searchPaletteDevices (parity via deviceWhere is structural) |

### External Dependencies

| Dependency | Integration Pattern | Notes |
|------------|--------------------|-------|
| **write-excel-file ^4.1.1** (npm, active — Jun 2026 publish, 1.8 MB unpacked) | `import writeExcelFile from 'write-excel-file/node'`; `writeExcelFile(sheetData, { columns }).toBuffer()` | v4 API; per-cell `value/type/format/fontWeight/align`; `columns[].width` in characters; header styling explicit in v4 (no default bold). Date→serial conversion is `getTime()/86400000 + 25569` — pure UTC math, no local getters (source-verified), so the app's UTC-midnight stamps land on the exact calendar day with zero TZ drift — the CR-01 bug class is structurally absent. **Spike first:** if the route bundler chokes on the Node import, add `serverExternalPackages: ['write-excel-file']` to next.config.ts (the sharp precedent) |
| SheetJS (`xlsx` npm) — REJECTED | — | npm copy stale at 0.18.5 (known CVEs fixed only in vendor-CDN builds); real releases live on cdn.sheetjs.com, not npm — supply-chain smell for an internal app |
| exceljs — REJECTED | — | Richest styling API but 21.8 MB unpacked, last publish Dec 2024, explicit maintenance-inactivity concerns (GitHub issue #2884) |
| Lightbox libs — REJECTED | — | see Anti-Pattern 4 |

## Build Order (dependency-respecting)

| # | Slice | Why here |
|---|-------|----------|
| 1 | **XLSX lib module** | `npm i write-excel-file` + bundling spike → lib/device-xlsx.ts (`deviceXlsxSheetData` + `buildDeviceXlsx` + `xlsxResponseHeaders`) → tests/xlsx-export.test.ts pinning the matrix (labels byte-exact incl. U+2033 ″, sparse config block order, warranty text parity, 21.5 stays a number, UTC-midnight date → exact serial day). The module is independently testable — no route needed yet. |
| 2 | **XLSX route** | app/api/devices/export-xlsx/route.ts (thin composer). Optionally first extract the shared parse-strip helper into query-params.ts and put the CSV route on it — mechanical, test-pinned. Depends on 1. |
| 3 | **XLSX surfaces** | filter-bar.tsx second `<a>`; command-palette.tsx second native-anchor row. Depends on 2; zero new state anywhere. |
| 4 | **Lightbox** | Fully independent of 1–3, can run in parallel: lib/zoom-math.ts + tests → photo-zoom-stage.tsx → rewire photo-grid.tsx DialogContent (wider panel) → phone UAT (pinch, pointercancel, delete-button reachability at zoom, Escape still closes). |
| 5 | **Manager conveniences** | LAST — scope first (per PROJECT.md, «скоупятся на этапе требований»). Each plugs into the Pattern-3 / deep-link / dialog-family / palette extension points; no new infra. |

Slices 1–3 are one linear chain (lib → route → surfaces); 4 is an independent client island; 5 is query-layer + page work.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| XLSX route bundling | write-excel-file's Node import vs Next's route bundler | 30-min spike before planning the lib module; `serverExternalPackages` escape hatch (sharp precedent) |
| XLSX numFmt | `format: 'dd.mm.yyyy'` / `'0.0'` display quirks in RU Excel/Numbers | Pin sheetData in vitest; eyeball one real file in UAT on RU-locale Excel |
| Lightbox a11y | Escape must still close the Dialog (Base UI owns it); gestures must not swallow it; ⌘K must stay inert while open | Gestures pointer-only, Dialog root untouched; assert the `data-slot="dialog-content"` probe still matches |
| iOS Safari | pointercancel mid-pinch; double-tap page zoom | touch-action: none on the stage; handle pointercancel as full release; preventDefault on dbltap |
| Convenience filters (if scoped) | A new filter dimension must touch 2 files in lockstep: query-params.ts (DeviceFilters + parser + strip + builder) AND deviceWhere in db/queries/devices.ts | query-params.ts header says it: «a new DeviceFilters field must be added here too — in this single place»; parity tests follow the csv-export precedent |

## Open Questions for Planning

1. **write-excel-file bundling spike** — does the route handler bundle it cleanly, or is `serverExternalPackages` needed? Resolves slice 1's only unknown.
2. **XLSX date display format** — real Date cells with `dd.mm.yyyy` (recommended: RU-readable, sorts by underlying serial) vs ISO-string cells for byte-parity with the CSV? Recommend Date cells; confirm in scoping.
3. **Column widths / styling depth** — bold header + widths only (recommended), or borders/freeze-pane? Freeze header row is a cheap differentiator.
4. **Lightbox extras** — prev/next arrows and swipe-between photos are cheap (the array is already in scope in photo-grid) but expand gesture surface; in or out?
5. **Manager conveniences scope** — entirely deferred to requirements scoping; this research only maps the extension points they would plug into.

## Sources

- Codebase (HIGH, read this run): lib/device-csv.ts, lib/csv.ts, lib/photos.ts, db/queries/devices.ts, app/api/devices/export/route.ts, app/api/attachments/[attachmentId]/route.ts, app/(app)/(card)/devices/[id]/photo-grid.tsx, app/(app)/devices/filter-bar.tsx, app/(app)/devices/query-params.ts, app/(app)/page.tsx, components/command-palette.tsx, components/ui/dialog.tsx, package.json, tests/csv-export.test.ts
- Pinned Next.js 16.3.3 docs (HIGH): node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md — Web Request/Response handlers, streaming section
- npm registry (HIGH, queried directly 2026-09-29): exceljs 4.4.0 / publish 2024-12 / 21.8 MB; write-excel-file 4.1.1 / publish 2026-06 / 1.8 MB; xlsx 0.18.5 stale on npm
- write-excel-file README + source (HIGH): `source/xlsx/helpers/convertDateToSerialNumber.js` — `getTime()/day + daysBeforeUnixEpoch`, pure UTC; v4 `.toBuffer()` API; cell format/fontWeight/align; `columns[].width`
- Mobile gesture best practice (MEDIUM): MDN Pointer Events pinch-zoom guidance; LogRocket zoom/pan/pinch write-up; react-quick-pinch-zoom as reference gesture implementation
- Digests cached via research-store (keys 2950192d…, 52a19c64…, 1aa41b2e…, 984bd277…)

---
*Architecture research for: Barahlo v1.3 «Удобство и выгрузка»*
*Researched: 2026-09-29*
