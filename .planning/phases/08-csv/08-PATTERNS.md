# Phase 8: CSV-ведомость полного контекста - Pattern Map

**Mapped:** 2026-09-16
**Files analyzed:** 4 (3 modified/extended, 1 new)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/api/devices/export/route.ts` (EXTEND) | route controller (App Router GET handler) | request-response (CSV file download) | itself — self-extension; current HEADER + cells are the base | exact |
| `db/queries/devices.ts` — `exportDevices` + `DeviceExportRow` (EXTEND) | model/query layer | CRUD (read, full scan) | `getDevice()` in the same file — already selects all 4 config columns | exact |
| `lib/device-csv.ts` (NEW, recommended) | utility (pure lib module) | transform | `lib/warranty.ts` (pure-module discipline) + `lib/warranty-date.tsx` `STATE_CLASS` (state→label dictionary) | role-match (composite) |
| `tests/csv-export.test.ts` (EXTEND) | test (vitest unit + temp SQLite) | n/a | itself (harness + fixtures) + `tests/warranty.test.ts` (boundary cases) | exact |

## Pattern Assignments

### `app/api/devices/export/route.ts` (route controller, request-response)

**Analog:** itself — self-extension. The diff adds columns; the surrounding structure is frozen (CONTEXT: «requireSession-first и zero-drift-контракт не трогать»).

**Imports pattern** (lines 1-10) — the new module imports slot in here:
```typescript
import type { NextRequest } from 'next/server'
import { requireSession } from '@/lib/auth'
import { exportDevices } from '@/db/queries/devices'
import { deviceStatusLabel, deviceTypeName } from '@/lib/device-schema'
import { formatWarrantyDate } from '@/lib/warranty-date'
import { buildCsv, csvResponseHeaders } from '@/lib/csv'
import {
  parseDevicesSearchParams,
  toDeviceListFilters,
} from '@/app/(app)/devices/query-params'
```

**Frozen skeleton** (lines 55-66) — `requireSession()` MUST stay the literal first statement; parser/strip/export chain MUST not change:
```typescript
export async function GET(request: NextRequest) {
  await requireSession()
  const sp = Object.fromEntries(request.nextUrl.searchParams)
  const filters = parseDevicesSearchParams(sp)
  // Strip the URL-layer sentinels into the db-layer contract via the ONE
  // shared toDeviceListFilters (WR-01) — the exact mapping the page runs
  const listFilters = toDeviceListFilters(filters)
  const rows = exportDevices({ type: filters.type, filters: listFilters })
```

**HEADER array to extend** (lines 37-53) — 15 columns today → 20 (D-01/D-05 positions):
```typescript
const HEADER = [
  'Тип', 'Модель', 'Серийный номер', 'Инвентарный номер', 'Статус',
  'Держатель', 'Отдел', 'RAM, ГБ', 'RAM апгрейдена', 'SSD, ГБ',
  'Дата закупки', 'Стоимость', 'Поставщик', 'Гарантия до', 'Заметки',
]
```

**Cells mapping to extend** (lines 67-88) — the existing per-row array literal is the exact shape to grow; note the `null → empty cell` idiom and the boolean-to-text ternary at line 78 (the precedent for sparse pass-through):
```typescript
const cells = rows.map((r) => [
  deviceTypeName(r.typeKey),
  r.model,
  r.serialNumber,
  r.inventoryNumber,
  deviceStatusLabel(r.status),
  r.holder,
  r.departmentName,
  r.ramGb,
  // D-06 semantics as text: 1 = upgraded, 0 = explicitly not, null = empty
  r.ramUpgraded === null ? null : r.ramUpgraded === 1 ? 'да' : 'нет',
  r.ssdGb,
  r.purchaseDate ? formatWarrantyDate(r.purchaseDate) : null,  // ← becomes isoFileDate
  r.purchasePrice,
  r.supplier,
  r.warrantyUntil ? formatWarrantyDate(r.warrantyUntil) : null, // ← becomes isoFileDate
  r.notes,
])
```

**File assembly + response tail** (lines 92-94) — unchanged; note line 93, the in-repo ISO-date idiom the new file formatter mirrors:
```typescript
const body = buildCsv(HEADER, cells)
const isoDate = new Date().toISOString().slice(0, 10)
return new Response(body, { headers: csvResponseHeaders(isoDate) })
```

---

### `db/queries/devices.ts` — `exportDevices` + `DeviceExportRow` (model, CRUD full scan)

**Analog:** `getDevice()` in the same file — it already selects the 4 config columns; copy that select shape into `exportDevices`.

**`DeviceExportRow` to widen** (lines 85-102). `DeviceRow` (lines 54-67) already declares the target shape — same 4 fields, same nullability:
```typescript
// DeviceRow lines 60-67 — the exact fields/naming/nullability to add:
ramGb: number | null
ramUpgraded: number | null
ssdGb: number | null
screenDiagonal: number | null
panelType: string | null
portCount: number | null
peripheralKind: string | null
```

**The SELECT to extend** (lines 465-483). Add `screenDiagonal: devices.screenDiagonal` … `peripheralKind: devices.peripheralKind` exactly where `getDevice` has them (lines 510-513):
```typescript
export function exportDevices({ type, filters }: {
  type: DeviceListType
  filters?: DeviceListFilters
}): DeviceExportRow[] {
  return db
    .select({
      id: devices.id,
      typeKey: devices.typeKey,
      model: devices.model,
      serialNumber: devices.serialNumber,
      inventoryNumber: devices.inventoryNumber,
      status: devices.status,
      holder: employees.name,
      departmentName: departments.name,
      ramGb: devices.ramGb,
      ramUpgraded: devices.ramUpgraded,
      ssdGb: devices.ssdGb,
      // ← insert the 4 config columns here, mirroring getDevice() lines 510-513
      purchaseDate: devices.purchaseDate,
      ...
    })
    .from(devices)
    .leftJoin(employees, eq(devices.currentEmployeeId, employees.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(deviceWhere(type, filters))   // ← DO NOT TOUCH (SC 2 structural)
    .orderBy(ruSortKey, asc(devices.id)) // ← DO NOT TOUCH
    .all()
}
```

**getDevice select block — the copy source** (lines 494-514, the 4 lines at 510-513):
```typescript
screenDiagonal: devices.screenDiagonal,
panelType: devices.panelType,
portCount: devices.portCount,
peripheralKind: devices.peripheralKind,
```

**Schema confirmation** (`db/schema.ts` lines 87-90) — columns exist, zero migration:
```typescript
screenDiagonal: real('screen_diagonal'),
panelType: text('panel_type'),
portCount: integer('port_count'),
peripheralKind: text('peripheral_kind'),
```

**Sparseness is structural** — `createDevice` (lines 536-542) and `updateDevice` (574-580) write `?? null` for every config field, so a laptop row carries `screenDiagonal: null`; the cells mapping needs NO per-type branching:
```typescript
ramGb: input.ramGb ?? null,
...
screenDiagonal: input.screenDiagonal ?? null,
panelType: input.panelType ?? null,
portCount: input.portCount ?? null,
peripheralKind: input.peripheralKind ?? null,
```

---

### `lib/device-csv.ts` (NEW utility, transform — pure lib module)

**Analog (module discipline):** `lib/warranty.ts` — the canonical pure-module header. No framework imports, named exports only, injectable clock, vitest-importable:
```typescript
// lib/warranty.ts lines 1-7 (the discipline to copy):
// Pure named exports over Node built-ins only ... no framework imports, no
// side effects, safe to import from RSC, queries, client components and
// vitest alike. The clock is injectable (`now` parameter) so frozen-clock
// regression tests can pin every boundary
```

**Analog (state→label dictionary):** `lib/warranty-date.tsx` lines 33-38 — the exact `Record<WarrantyState, ...>` shape `WARRANTY_STATE_LABELS` copies (D-03/D-04):
```typescript
const STATE_CLASS: Record<WarrantyState, string | undefined> = {
  ok: 'text-warranty-ok',
  warn: 'text-warranty-warn',
  expired: 'text-destructive',
  none: undefined,
}
// → lib/device-csv.ts becomes:
// export const WARRANTY_STATE_LABELS: Record<WarrantyState, string> = {
//   ok: 'Действует', warn: 'Истекает', expired: 'Истекла', none: 'Без гарантии',
// }
```
Second dictionary precedent: `DEVICE_STATUS_LABELS` + `deviceStatusLabel` in `lib/device-schema.ts` lines 108-117 — same keyed-map + single accessor style.

**Analog (ISO formatter idiom):** `route.ts` line 93 — `new Date().toISOString().slice(0, 10)` is already in-repo and is exact for UTC-midnight operands (stored stamps are UTC-midnight: `actions.ts` writes `new Date('yyyy-mm-dd')`). DO NOT reuse or import `formatWarrantyDate` (`lib/warranty-date.tsx` lines 21-27, frozen dd.mm.yyyy site surface):
```typescript
// lib/warranty-date.tsx lines 21-27 — the SITE formatter. Reference only:
const dateFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC' })
export function formatWarrantyDate(value: Date): string {
  return dateFormat.format(value)
}
// → lib/device-csv.ts: export function isoFileDate(value: Date): string {
//     return value.toISOString().slice(0, 10)
//   }
```

**Analog (derive-by-key from the keystone):** `lib/device-schema.ts` — D-02 says HEADER labels come from `PER_TYPE_FIELDS` (lines 56-80). The block order (Диагональ/Матрица/Порты/Вид) is cross-type, so derive labels BY KEY. Existing derivation idioms to copy:
```typescript
// lib/device-schema.ts lines 101-103 — the .find() lookup style:
export function deviceTypeName(typeKey: string): string {
  return DEVICE_TYPES.find((t) => t.key === typeKey)?.name ?? typeKey
}
// lines 122-126 — the Object.keys(keystone-map) derivation style:
export type DeviceStatusKey = keyof typeof DEVICE_STATUS_LABELS
export const DEVICE_STATUS_KEYS: readonly DeviceStatusKey[] = Object.keys(
  DEVICE_STATUS_LABELS,
) as DeviceStatusKey[]
```
The keystone labels themselves (verbatim, note U+2033 ″ — `lib/device-schema.ts` lines 62-79):
```typescript
{ key: 'screenDiagonal', label: 'Диагональ, ″', type: 'number', ..., step: 0.1 },
{ key: 'panelType', label: 'Тип матрицы', type: 'text', ..., maxLength: 40 },
{ key: 'portCount', label: 'Количество портов', type: 'number', ..., step: 1 },
{ key: 'peripheralKind', label: 'Вид', type: 'select', ..., options: PERIPHERAL_KINDS },
```

---

### `tests/csv-export.test.ts` (test, vitest + temp SQLite)

**Analog:** itself — extend the existing harness. Plus `tests/warranty.test.ts` for status-parity boundary fixtures.

**Harness pattern — env BEFORE first `@/db` import, dynamic imports** (lines 12-21):
```typescript
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-csv-'))
process.env.DATABASE_PATH = join(tmpDir, 'csv.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const queries = await import('@/db/queries/devices')
const { createDevice, listDevices, exportDevices } = queries
const { esc, buildCsv, csvResponseHeaders } = await import('@/lib/csv')
const { addDaysUtc, displayTodayUtc } = await import('@/lib/warranty')
```
Cleanup (lines 23-26): `afterAll(() => { db.$client.close(); rmSync(tmpDir, { recursive: true, force: true }) })`.

**Date fixtures on a frozen clock** (lines 92-95) — the parity-test date idiom:
```typescript
const today = displayTodayUtc()
const warnDate = addDaysUtc(today, 30)
const farDate = addDaysUtc(today, 90)
const expiredDate = addDaysUtc(today, -1)
```

**Seeding helper** (lines 100-134) — `seedExport` wraps `createDevice` with `Partial<...>` overrides and raw `db.$client.prepare('UPDATE devices SET ...')` for custody fields. Extend the override type with `screenDiagonal / panelType / portCount / peripheralKind / purchaseDate` and add monitor/dock/peripheral seeds for the sparse matrix (existing type decoys at lines 191-200 show the `typeKey: 'monitor'` seeding pattern).

**Injection end-to-end pattern** (lines 277-294) — seed an injection-bearing row, pull it via `exportDevices`, assert through `buildCsv`. Extend with `panelType: '=1+1'` (the free-text vector):
```typescript
seedExport('EXP-INJ-M', {
  model: '=1+1;@cmd', ...
  inventoryNumber: '-42',
  supplier: 'ООО «;Поставщик»',
  notes: 'строка1\nстрока2',
})
...
const body = buildCsv([...], [[inj!.model, inj!.supplier, inj!.notes, inj!.inventoryNumber]])
expect(body).toContain('"\t=1+1;@cmd"')
```

**Status-parity boundary source:** `tests/warranty.test.ts` lines 54-88 — reuse these exact cases composed with the new dictionary:
```typescript
// wu == today → 'warn'; today+60 → 'warn'; today+61 → 'ok';
// today-1 → 'expired'; null → 'none'; WARRANTY_WARN_DAYS === 60 pinned
// → compose: WARRANTY_STATE_LABELS[warrantyState(wu, today)] →
//   Истекает / Истекает / Действует / Истекла / Без гарантии
```

**Standing guards not to break:** the no-CSV-dependency test (lines 317-332) reads `package.json` AND greps route imports — the new `lib/device-csv.ts` import inside route.ts is fine (regex only matches csv libraries).

## Shared Patterns

### Pure lib modules, zero framework imports
**Source:** `lib/csv.ts` lines 1-4, `lib/warranty.ts` lines 1-7
**Apply to:** `lib/device-csv.ts`
```typescript
// Pure ... No framework imports at all — vitest calls every function directly
```
This is why the status dictionary + ISO formatter go in a lib module, not `route.ts` — the route imports `lib/auth` → `next/headers` and is not vitest-importable (research Pitfall 7).

### Single-cell escaper covers every new column by construction
**Source:** `lib/csv.ts` lines 26-31
**Apply to:** all 5 new cells — no guard code, only test fixtures
```typescript
export function esc(v: string | number | null): string {
  let s = v === null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = '\t' + s
  if (/[";\n\r]/.test(s)) s = '"' + s.replaceAll('"', '""') + '"'
  return s
}
// buildCsv (lines 37-46) maps esc over header AND every data cell — there is
// no raw join path; new columns inherit CWE-1236 protection automatically.
```

### One state calculation — dictionary maps states, never re-derives
**Source:** `lib/warranty.ts` lines 44-57
**Apply to:** status column; the number 60 / `86_400_000` arithmetic must NOT appear in route.ts or the labels module
```typescript
export type WarrantyState = 'ok' | 'warn' | 'expired' | 'none'
export function warrantyState(warrantyUntil: Date | null, today: Date): WarrantyState {
  if (!warrantyUntil) return 'none'
  if (warrantyUntil.getTime() < today.getTime()) return 'expired'
  const days = Math.round((warrantyUntil.getTime() - today.getTime()) / 86_400_000)
  return days <= WARRANTY_WARN_DAYS ? 'warn' : 'ok'
}
```

### Request-scoped `today` — hoisted once per request, never per row
**Source:** `lib/warranty.ts` lines 24-33 (`displayTodayUtc`); per-render hoist discipline described at `lib/warranty-date.tsx` lines 5-7
**Apply to:** route.ts — `const today = displayTodayUtc()` once, then per row `WARRANTY_STATE_LABELS[warrantyState(r.warrantyUntil, today)]`

### UTC-only date rendering (CR-01 bug class — never reintroduce)
**Source:** `lib/warranty-date.tsx` lines 16-21 (comment + `timeZone: 'UTC'`); `lib/warranty.ts` lines 18-23
**Apply to:** `isoFileDate` — `toISOString().slice(0, 10)` is exact because stored `purchaseDate`/`warrantyUntil` are UTC-midnight stamps (form writes `new Date('yyyy-mm-dd')`, verified in `app/(app)/devices/actions.ts` lines 211/214 and zod `^\d{4}-\d{2}-\d{2}$` at `lib/device-schema.ts` line 176). No `new Date(y, m, d)` / local getters in new code.

### Zero-drift query contract (WR-01) — do-not-touch list
**Source:** `db/queries/devices.ts` lines 218-249 (`deviceWhere`), `route.ts` lines 57-66 (parser chain)
**Apply to:** every plan touching route.ts or queries. Frozen: `requireSession()` position, `parseDevicesSearchParams` → `toDeviceListFilters`, `deviceWhere`, `orderBy(ruSortKey, asc(devices.id))`, no limit/offset on `exportDevices`, `buildCsv`/`esc`/`csvResponseHeaders`.

## No Analog Found

| File / Concern | Role | Data Flow | Reason | Fallback |
|----------------|------|-----------|--------|----------|
| keystone label derivation for cross-type config block (`CONFIG_EXPORT_KEYS` + label lookup in `lib/device-csv.ts`) | utility | transform | The cross-type ORDER (Диагональ→Матрица→Порты→Вид) exists in no single per-type array — only the by-key lookup is new. Lookup idioms exist (`deviceTypeName`, lines 101-103) | RESEARCH.md Pattern 2 (lines 183-202) supplies the exact recipe |
| comma-decimal diagonal cell (`21,5`) | utility | transform | First fractional column in the file's history — every existing numeric column is an integer; no in-repo precedent | RESEARCH.md Pitfall 1: `String(v).replace('.', ',')`; integers unaffected; pin with a test; optionally `checkpoint:human-verify` (Open Question 1) |

## Metadata

**Analog search scope:** `app/api/devices/export/`, `db/queries/`, `db/`, `lib/`, `tests/`
**Files read in full:** `route.ts` (95), `lib/csv.ts` (63), `lib/warranty.ts` (57), `lib/warranty-date.tsx` (69), `lib/device-schema.ts` (204), `db/queries/devices.ts` (589), `tests/csv-export.test.ts` (332), `tests/helpers.ts` (65), `tests/warranty.test.ts` (88)
**Files read partially:** `db/schema.ts` (lines 60-104 — devices table config columns + timestamps)
**Pattern extraction date:** 2026-09-16

**Key takeaways for the planner:**
1. The whole diff is additive: 4 lines into `exportDevices`' SELECT (copy `getDevice` lines 510-513), 4 fields onto `DeviceExportRow` (copy `DeviceRow` lines 60-67 naming), 5 cells into the route's `cells` array at D-01/D-05 positions, HEADER 15 → 20.
2. One new pure module (`lib/device-csv.ts`) modeled on `lib/warranty.ts` discipline holds `isoFileDate`, `WARRANTY_STATE_LABELS`, and the ordered config-key list — keeps the route a thin composer and everything vitest-importable.
3. D-02 has two compliant mechanisms — programmatic label derivation from `PER_TYPE_FIELDS` OR literal HEADER labels + a verbatim parity test. Pick ONE (research Pattern 2); doing neither violates D-02.
4. Watch the two no-analog items: label derivation order and the RU-Excel comma-decimal diagonal (recommended `21,5`).
