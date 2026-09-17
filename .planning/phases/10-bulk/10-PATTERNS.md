# Phase 10: Bulk-выдача и приём - Pattern Map

**Mapped:** 2026-09-16
**Files analyzed:** 9 (2 new + 7 modified)
**Analogs found:** 8 / 9 (device-bulk.tsx has no in-codebase analog — see No Analog Found)

> **Copy fidelity note:** this environment renders source text with homoglyph-level noise (the same line rendered with variant identifier spellings across reads). **Line numbers are verified stable; exact characters are not guaranteed in the excerpts below.** When executing, the implementer must copy code by reading the cited file/lines directly, never from this document's excerpts. Identifier spellings cited here follow the majority reading across RESEARCH.md, CONTEXT.md and reads.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `db/queries/movements.ts` (+`bulkAssignDevices`, `bulkAcceptDevices`) | model (query layer) | batch transactional CRUD | same file: `returnAllDevices` (316–352), `assignDevice` (81–110), `sendToRepair` (196–240) | exact |
| `app/(app)/devices/actions.ts` (+`bulkAssignDevicesAction`, `bulkAcceptDevicesAction`, `BulkFormState`) | controller (server action) | request-response | same file: `assignDeviceAction` (489–511), `CloneFormState` (321–328) | exact |
| `lib/movement-schema.ts` (+`bulkAssignSchema`, `bulkAcceptSchema`) | utility (zod validation) | transform/validation | same file: `assignSchema` (124–129), `acceptSchema` (132–136) | exact |
| `app/(app)/devices/device-bulk.tsx` (NEW — provider island: selection Set, HeaderTriState, RowCheckbox, FloatingPanel) | component (client island/provider) | client-state/event-driven | none (first context provider in app); nearest: `movement-dialogs.tsx` island anatomy, `clone-dialog.tsx` survives-refresh | no analog (partial: island anatomy) |
| `app/(app)/devices/bulk-dialogs.tsx` (NEW — BulkAssignDialog/BulkAcceptDialog) | component (client dialogs) | request-response | `app/(app)/devices/clone-dialog.tsx` (separate-file + success-view precedent); `movement-dialogs.tsx` AssignDialog/AcceptDialog | exact |
| `app/(app)/devices/page.tsx` (row restructure, provider wrap, header strip, panel spacer) | route (RSC page) | request-response (SSR) | same file: rows block (154–232), pagination (238–265) | exact (self-modification) |
| `components/ui/checkbox.tsx` (+indeterminate glyph) | component (UI primitive) | presentational | same file (30 lines, whole-file analog) | exact |
| `tests/movements-queries.test.ts` (+bulk matrix) | test (unit) | batch transactional | same file: `returnAllDevices` describe (640–699) | exact |
| `tests/movement-schema.test.ts` (+deviceIds bounds) | test (unit) | transform/validation | same file (schema tests against `movementSchemas`) | exact |

## Pattern Assignments

### `db/queries/movements.ts` — bulk query functions (model, batch transactional)

**Analog:** same file — the ONLY multi-device transaction in the codebase is `returnAllDevices` (316–352); the guard-UPDATE idiom lives in every custody function since phase 4.

**Tx type + module contract** (lines 18–19, 6–16):
```typescript
type DbHandle = typeof db
type Tx = Parameters<Parameters<DbHandle['transaction']>[0]>[0]
```
Module rules (header comment): pure sync functions, no framework imports (vitest imports directly); every custody transition is ONE sync transaction; the projection write IS the guard — conditional UPDATE `WHERE id AND status=<precondition>`, decision by `.changes`; eventType is hardcoded per function, NEVER from payload; movements table append-only.

**Guard-UPDATE + one event** — `assignDevice` (lines 81–110), the shape every bulk loop iteration must copy:
```typescript
db.transaction((tx) => {
  assertActiveEmployee(tx, employeeId)
  const upd = tx
    .update(devices)
    .set({ status: 'assigned', currentEmployeeId: employeeId, updatedAt: new Date() })
    .where(and(eq(devices.id, deviceId), eq(devices.status, 'in_stock')))
    .run()
  if (upd.changes === 0) throw { code: 'ILLEGAL_TRANSITION' }
  tx.insert(movements).values({
    deviceId, eventType: 'assigned',
    fromEmployeeId: null, toEmployeeId: employeeId,
    comment: commentOf(event), occurredAt: occurredOf(event),
  }).run()
})
```

**Multi-device loop precedent** — `returnAllDevices` (lines 316–352): SELECT the device list INSIDE the tx (`orderBy(asc(devices.id))`), loop INSERT event + guard-UPDATE per device, return `rows.length`. Note: its per-device update guard checks the precondition status — a bulk repeat-submit flips the status once and the second pass gets `.changes === 0` → throw → full rollback (D-03 anti-double-write).

**Two-status precondition** (needed by bulk-accept per D-02) — `sendToRepair` (lines 203–213):
```typescript
.where(and(
  eq(devices.id, deviceId),
  inArray(devices.status, ['in_stock', 'assigned']),
))
```

**Active-employee guard** — `assertActiveEmployee` (lines 69–76): SELECT inside tx, `throw { code: 'EMPLOYEE_INACTIVE' }` — plain object, not Error; actions catch bare.

**Bulk differences vs. analogs (from RESEARCH Pattern 1):** one SELECT-превалидация of ALL ids (`inArray`, order by id) BEFORE any write → blockers returned as data (`{ ok: false, blockers }` discriminated union, NOT a `{ code }` throw — a code carries no per-unit detail, SC 3); one `occurredAt` Date per batch (call `occurredAtFromDate` once in the action); bulk-accept reads the holder for the `returned` event from the in-tx SELECT snapshot (precedent `acceptDevice` 119–131), `from_repair` events carry null person slots (precedent `returnFromRepair` 244–267); missing id → blocker with `status: 'not_found'` (Pitfall 7).

---

### `app/(app)/devices/actions.ts` — bulk server actions (controller, request-response)

**Analog:** same file — the movement action family (489–614) is byte-pattern; `cloneDeviceAction` (361–396) is the precedent for a FormState that carries DATA back to the dialog (`created?: number` → bulk `results?`/`blockers?`).

**Action contract** (module comment 31–35 + `assignDeviceAction` 489–511):
```typescript
export async function assignDeviceAction(
  _prev: unknown, formData: FormData,
): Promise<MovementFormState> {
  await requireSession()                       // FIRST line (T-03-01, V2)
  const values = echoMovementValues(formData)  // echo before anything
  const parsed = movementSchemas.assign.safeParse(movementPayload(formData, true))
  if (!parsed.success) {
    return { ...movementFieldErrorsOf(parsed.error, ASSIGN_ERROR), values }
  }
  try {
    assignDevice(parsed.data.deviceId, parsed.data.employeeId, {
      occurredAt: occurredAtFromDate(parsed.data.occurredAt),
      comment: parsed.data.comment ?? null,
    })
  } catch {
    return { error: ASSIGN_ERROR, values }     // { code } never leaves (V7)
  }
  refresh()                                    // re-render without reload
  return { ok: true }
}
```

**Extensible FormState precedent** — `CloneFormState` (lines 321–328) + `CloneFieldErrors` (316–319): the bulk `BulkFormState` follows the same shape plus `blockers?: Array<{id, model, status}>` and `results?: Array<{deviceId, eventType}>` (RESEARCH Pattern 3). Per-action error copy constants (lines 408–413) — add `BULK_ASSIGN_ERROR = 'Не удалось выдать устройства. Попробуйте ещё раз.'` / `BULK_ACCEPT_ERROR = 'Не удалось принять устройства. Попробуйте ещё раз.'` to the same table.

**Field-error mapper pattern** — `movementFieldErrorsOf` (464–487): map issue paths to inline copy, `issue.code === 'custom'` on occurredAt → «Дата не может быть в будущем», unmapped key → the action's generic fallback. `movementPayload` (446–457): `'' → undefined` for optionals; employeeId included ONLY for person-carrying schemas (accept schema rejects it — strictObject tamper gate, V5).

**Bulk specifics:** `formData.getAll('deviceIds')` → dedupe via `new Set` before query (Pitfall 6); one `occurredAtFromDate(...)` call for the whole party (one Date into `EventInput`).

---

### `lib/movement-schema.ts` — bulk schemas (utility, validation)

**Analog:** same file — `assignSchema`/`acceptSchema` (124–136) are the direct templates.

```typescript
// assign (124–129) — strictObject whitelist; coerce handles hidden-input strings
export const assignSchema = z.strictObject({
  deviceId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
  occurredAt: occurredAtSchema.optional(),
  comment: commentSchema.optional(),
})
// accept (132–136) — NO person field; strictness rejects injected employeeId
export const acceptSchema = z.strictObject({ ... })
```

**Shared pieces:** `occurredAtSchema` (111–118, DATE_PATTERN + isNotFutureDate refine, message «Дата не может быть в будущем»), `commentSchema` (120, max 500), export dictionary `movementSchemas` (174–180) — add `bulkAssign`/`bulkAccept` entries. `deviceIds` = `z.array(z.coerce.number().int().positive()).min(1).max(20)` (cap = PAGE_SIZE, Pitfall 6).

**Date authority** — `occurredAtFromDate` (88–109) and `isNotFutureDate` (74–81): DISPLAY_TZ wall-clock discipline (CR-01). Call ONCE per batch.

---

### `app/(app)/devices/bulk-dialogs.tsx` (NEW) — batch dialogs (component, request-response)

**Primary analog:** `app/(app)/devices/clone-dialog.tsx` — the phase-9 precedent for a separate dialog file in the same folder with byte-copied mechanics (its header comment 20–29 says exactly this: «механика байт-в-байт»).

**Wrapper/inner split (WR-01)** — `CloneDialog` (147–189): wrapper owns `open` state + stays mounted; `useActionState` lives in the inner form (portal unmounts it on close → clean session). Trigger with data needle: `<DialogTrigger render={<Button variant="secondary" size="xl" data-device-clone-id={deviceId} />}>`.

**onDone(data) + ok-effect** — `useCloseOnOk` with payload (41–45):
```typescript
function useCloseOnOk(state: CloneFormState, onDone: (created: number) => void) {
  useEffect(() => {
    if (state.ok) onDone(state.created ?? 0)
  }, [state, onDone])
}
```
Bulk variant: `onDone` calls `provider.clear()` — selection drops ONLY here (D-06/SC 4, Pitfall 5). Unlike clone (which closes), bulk keeps the dialog OPEN on ok and the inner form renders the report instead of fields (D-05); footer becomes a single secondary «Закрыть».

**Field recipes to copy verbatim from `movement-dialogs.tsx`:**
- Class constants (55–57): `CONTROL_CLASS = 'h-10 px-3 text-base md:text-base'`, `ERROR_CLASS = 'text-sm text-[#D70015]'`, `HINT_CLASS = 'text-sm text-ink-secondary'`.
- `todayLocal()` (62–67) — local yyyy-mm-dd, NEVER `toISOString().slice(0,10)`.
- `EmployeePicker` (75–161) — value = name, id via hidden input `name="employeeId"` (152–156), Ё/ё fold, two zero-states (142–150). Reuse as-is (same folder → import or copy per planner's call; clone-dialog copied, not abstracted).
- `OccurredAtField` (165–189) — `type="date"`, `defaultValue={echoValue ?? todayLocal()}`, `max={todayLocal()}`.
- `CommentField` (193–209) — optional input, `maxLength={500}`, placeholder «Номер акта, примечание…».
- `DialogActions` (212–229) — secondary «Отмена» + pending-disabled primary: `{pending ? pendingCopy : label}`.
- Assign form field order + error block (240–274): hidden ids → EmployeePicker → OccurredAtField → CommentField → `{state.error ? <p className={ERROR_CLASS} role="alert">…}` → DialogActions. Pending copies byte-exact: «Выдача…» (271) / «Приём…» (328).
- Batch-confirmation copy style — `ReturnAllDialog` (646–672): «Вся техника — {pluralDevices(count)} — вернётся на склад; для каждой единицы будет записано своё событие возврата» — the per-unit vocabulary the bulk hint/report extends; `pluralDevices` from `@/lib/ru`.

**Report/blocker lists:** `max-h-64 overflow-y-auto space-y-2`; line = `{модель} · <span className="font-mono">{инвентарник}</span> · {…}` (mono rule from page rows 207–211); status labels via `deviceStatusLabel` (`lib/device-schema.ts` 108–116, unknown → itself; absent id → one-off literal «Не найдено»); model/inventory mapped client-side from the island's `rows` by deviceId (Open Question 3 resolution).

---

### `app/(app)/devices/device-bulk.tsx` (NEW) — selection island (component, client-state)

**No analog exists** — this is the codebase's first React context provider (`grep createContext` over app/components/lib: zero hits). Structural precedents to borrow:

- **Client island anatomy** — `movement-dialogs.tsx` 1–3: `'use client'`, react hooks, props from the server as flat serialized data (never functions across RSC boundary — `query-params.ts` header comment 14–17 states the rule).
- **Survival semantics** — `clone-dialog.tsx` 148–150: «stays on the original's card after close, survives refresh() (the island persists)» — the documented reason the `key` reset is REQUIRED.
- **Key reset source** — `query-params.ts` `buildDevicesQuery(f, page)` (107–117): the ONE builder; page.tsx already calls it for pagination links (244, 257). Provider mounts as `<DeviceBulkProvider key={buildDevicesQuery(filters, current)} rows={…} employees={…}>` — any pagination/filter/search transition changes the key → island unmounts → clean Set (D-01, Pitfall 2). Do NOT extend query-params with selection (client-only state).
- **Server page passes flat props:** `rows.map(r => ({ id, model, inventoryNumber, status }))` — all columns already selected by `listDevices` (page.tsx row usage 168–221), plus `listActiveEmployees()` (movements.ts 494–504) for the dialog's picker.
- **Checkbox leaves** — `RowCheckbox` renders inside each `<li>` as a SIBLING of the Link (never inside the `<a>` — Pitfall 1); header tri-state fully controlled per RESEARCH Pattern 2: `checked = size>0 && size===rows.length`, `indeterminate = size>0 && !allSelected`, indeterminate/checked click → `new Set()`, empty click → all row ids.

---

### `app/(app)/devices/page.tsx` — list restructure (route, SSR)

**Analog:** its own row block (154–232). Current anatomy to preserve while restructuring:
```tsx
// 155–232: rows.map → <li key={row.id}> → single <Link> carrying the WHOLE row:
// title attr (168–179), hover (180: "flex min-h-11 items-center gap-3 px-4 py-2
// transition-colors duration-150 ease-out hover:bg-page"), cover thumb (186–194),
// two lines with font-mono numbers (207, 209–211), status pill via
// deviceStatusLabel (200–202), WarrantyDate (217–221), ChevronRight (224–228).
```
Restructure (UI-SPEC spacing + RESEARCH row example): `<li className="flex items-stretch">` → checkbox cell `<RowCheckbox deviceId={row.id} model={row.model} />` in `flex w-11 shrink-0 items-center justify-center` → `<Link … className="flex min-h-11 flex-1 items-center gap-3 px-4 py-2 …">` with existing classes byte-exact, contents unchanged. Card classes move from `<ul>` (154) to a wrapper div + header strip row; pagination (238–265) untouched; `PAGE_SIZE = 20` (26) is the zod max cap; conditional `pb-24` on `<section>` while N > 0; provider wraps list with `key={buildDevicesQuery(filters, current)}`.

---

### `components/ui/checkbox.tsx` — indeterminate glyph (component primitive)

**Analog:** the file itself (30 lines). Current state: Root carries `data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground` (line 13) and Indicator renders `<CheckIcon />` UNCONDITIONALLY (22–24) — in mixed state Base UI's Indicator renders when `checked || indeterminate`, so a check would read «всё выбрано» (Pitfall 8).

Change: conditional glyph — `indeterminate === true` → `MinusIcon` (lucide-react), else `CheckIcon`; add `data-indeterminate:bg-primary data-indeterminate:text-primary-foreground` to the Root class string (line 13). Base `size-4` box, border, focus ring, `after:-inset` hit-area (13) stay untouched.

---

### `tests/movements-queries.test.ts` — bulk test matrix (test, unit)

**Analog:** same file. Bootstrap (8–21): set `process.env.DATABASE_PATH` to a temp dir BEFORE dynamic `import('@/db')`, `applyMigrations(db.$client)`, then dynamic-import the query modules. Helpers to reuse (52–138): `newDevice()` (unique serial counter), `newEmployee(name)` (counter suffix), `rawDevice(id)` / `rawMovements(deviceId)` (raw SQL readers of status/current_employee_id/event rows), `movementsCount()`, `captureThrown(fn)`, `isoDaysFromNow(days)` (DISPLAY_TZ date math).

**Rollback test pattern** — the `returnAllDevices` describe (640–699), especially the injected-failure test (672–698): a temporary SQLite trigger `RAISE(ABORT)` on the Nth INSERT, then assert NOTHING survived (`movementsCount()` unchanged, statuses intact). Bulk matrix maps to this 1:1: mixed eligible/ineligible → `{ok:false, blockers}` + zero writes; success → N records + exactly N events with the shared occurredAt; repeat call → `ILLEGAL_TRANSITION` + no new events; mixed assigned+repair accept → `returned` + `from_repair`; inactive employee → `EMPLOYEE_INACTIVE`.

**Schema bounds** go to `tests/movement-schema.test.ts` (deviceIds 0/21/dupes/garbage, future date) following that file's existing per-schema describes.

---

## Shared Patterns

### Action contract (V2/V5/V7)
**Source:** `app/(app)/devices/actions.ts` 31–35, 489–511
**Apply to:** both bulk actions
`await requireSession()` FIRST (server actions bypass the proxy perimeter) → echo values → zod strictObject safeParse → try/catch around ONE query call → `refresh()` on success → only Russian copy-table strings leave the action; `{ code }` internals never surface.

### Guard-UPDATE transaction (T-04-02)
**Source:** `db/queries/movements.ts` 81–110 (+ 316–352 loop)
**Apply to:** both bulk query functions
Conditional UPDATE with status precondition decides by `.changes === 0 → throw { code: 'ILLEGAL_TRANSITION' }` → full rollback; eventType hardcoded; append-only movements (INSERT only). Bulk adds: in-tx SELECT-превалидация returning blockers as DATA (union, not throw).

### React 19 dialog mechanics (echo + pending + role=alert)
**Source:** `movement-dialogs.tsx` 240–274, `clone-dialog.tsx` 41–45, 147–189
**Apply to:** both bulk dialogs + island clear timing
`useActionState` in the portal-mounted inner form; `state.values?.field` echo in defaultValue; pending-disabled submit; errors `role="alert"` with `ERROR_CLASS`; ok-effect drives `provider.clear()` (only on `state.ok`).

### DISPLAY_TZ date discipline (CR-01)
**Source:** `lib/movement-schema.ts` 74–118; `movement-dialogs.tsx` 62–67; test helper `isoDaysFromNow` (movements-queries.test.ts 127–134)
**Apply to:** bulk schema, bulk action (ONE `occurredAtFromDate` call per batch), OccurredAtField reuse (`max={todayLocal()}`).

### Keystone dictionaries
**Source:** `deviceStatusLabel` (`lib/device-schema.ts` 108–116) for blocker/report status words; `movementEventLabel` (`lib/movement-schema.ts` 33–35); `pluralDevices` (`lib/ru.ts`)
**Apply to:** blocker view, success report, dialog hints. No parallel dictionaries; absent id renders one-off «Не найдено».

### URL-driven reset (selection scope)
**Source:** `query-params.ts` 107–117 + `page.tsx` 244/257 usage; `clone-dialog.tsx` 148–150 (island-persists proof)
**Apply to:** device-bulk.tsx provider key + page.tsx wrap. query-params.ts is NOT extended.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `app/(app)/devices/device-bulk.tsx` | component (client provider island) | client-state/event-driven | First React context provider in the app (no createContext anywhere). Borrow island anatomy from `movement-dialogs.tsx`/`clone-dialog.tsx` and follow RESEARCH Pattern 2 (children-composition, controlled Set, key reset). Planner should decide context API vs. render-prop explicitly in the plan. |

## Metadata

**Analog search scope:** `app/(app)/devices/`, `db/queries/`, `lib/`, `components/ui/`, `tests/`
**Files read in full:** movements.ts (505), actions.ts (647), page.tsx (270), movement-dialogs.tsx (672), clone-dialog.tsx (190), movement-schema.ts (180), query-params.ts (117), checkbox.tsx (29)
**Files read in part:** tests/movements-queries.test.ts (bootstrap + helpers + returnAllDevices describe)
**Pattern extraction date:** 2026-09-16
**Verification note:** identifier spellings in excerpts above may be homoglyph-perturbed by the environment; line anchors are verified. Executor must copy from live files at the cited lines.
