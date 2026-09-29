# Phase 12: Правка и удаление записей истории - Pattern Map

**Mapped:** 2026-09-28
**Files analyzed:** 9 (3 new, 6 modified)
**Analogs found:** 9 / 9 (all files have in-repo analogs; replay-matrix logic itself is new — see No Analog Found)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `drizzle/0002_drop_movement_triggers.sql` (new) | migration | batch (DDL) | `drizzle/0000_amusing_talon.sql` (the triggers being dropped, lines 94–102) + `drizzle/meta/_journal.json` | exact (content) |
| `lib/movement-schema.ts` — + `editMovementSchema` (modify) | utility (validation schema) | transform | self: `assignSchema`/`disposeSchema` (lines 122–154) | exact (self) |
| `db/queries/movements.ts` — + `replayChain`/`editMovement`/`deleteMovement` (modify) | service (query layer) | CRUD + transform (replay projection) | self: `assignDevice`/`disposeDevice` one-tx guard-UPDATE (lines 78–110, 269–309) | exact (self) |
| `app/(app)/devices/actions.ts` — + `editMovementAction`/`deleteMovementAction` (modify) | controller (Server Actions) | request-response | self: `disposeDeviceAction` contract (lines 619–650) | exact (self) |
| `app/(app)/(card)/devices/[id]/timeline.tsx` (modify: server component → client island) | component | request-response | self (render) + `app/(app)/devices/device-actions.tsx` (island fed with `employees` from RSC) | role-match |
| `app/(app)/(card)/devices/[id]/movement-edit-dialogs.tsx` (new) | component (dialogs) | request-response | `app/(app)/devices/movement-dialogs.tsx` + `bulk-dialogs.tsx` (onPick picker) + `employees/archive-confirm-dialog.tsx` (delete confirm) | exact / role-match |
| `app/(app)/(card)/devices/[id]/page.tsx` (modify) | controller (RSC page) | request-response | self: `dialogDeviceOf` serialization (lines 62–85) + `listActiveEmployees()` feed (line 263) | exact (self) |
| `tests/movement-edit.test.ts` (new) | test | batch | `tests/movements-queries.test.ts` (bootstrap lines 1–104) + `tests/movement-schema.test.ts` (frozen clock) | exact |
| Code comments: `db/schema.ts`, `db/queries/movements.ts` header, `db/queries/devices.ts` `disposeDevice` doc (modify) | docs-in-code | — | — | no analog (Pitfall 8 checklist item) |

## Pattern Assignments

### `drizzle/0002_drop_movement_triggers.sql` (migration, batch DDL)

**Analog:** `drizzle/0000_amusing_talon.sql` lines 94–102 — the exact triggers being dropped:

```sql
-- Append-only guards for movements (drizzle-kit does not generate triggers — added by hand)
CREATE TRIGGER movements_no_update BEFORE UPDATE ON movements
BEGIN
  SELECT RAISE(ABORT, 'movements is append-only: UPDATE denied');
END;--> statement-breakpoint
CREATE TRIGGER movements_no_delete BEFORE DELETE ON movements
BEGIN
  SELECT RAISE(ABORT, 'movements is append-only: DELETE denied');
END;--> statement-breakpoint
```

**New file content (research Pattern 5, probe-verified):**
```sql
DROP TRIGGER IF EXISTS movements_no_update;--> statement-breakpoint
DROP TRIGGER IF EXISTS movements_no_delete;
```
Do NOT hand-write the file: create it with `npx drizzle-kit generate --custom --name=drop_movement_triggers` so `drizzle/meta/_journal.json` gets entry `{idx: 2, version: "6", when: <now>, tag: "0002_drop_movement_triggers", breakpoints: true}` and `drizzle/meta/0002_snapshot.json` is produced (manual journal edits cause "No snapshot was found"). Current journal has exactly entries idx 0 (`0000_amusing_talon`) and idx 1 (`0001_cooing_wendell_rand`).

**Apply mechanism** (no new code): `scripts/migrate.mjs` `runMigrations()` (lines 46–95) — reads journal, applies pending in one BEGIN, hash = sha256 of file. Tests pick the migration up automatically: `tests/helpers.ts` `applyMigrations` (lines 26–46) applies ALL `drizzle/*.sql` lexicographically with `--> statement-breakpoint` splitting.

---

### `lib/movement-schema.ts` — editMovementSchema (utility, transform)

**Analog:** self. The edit schema is the FIRST user-supplied `eventType` in the project — build it from the keystone pieces, never parallel copies.

**Field-schema constructors to reuse** (lines 111–120):
```typescript
const occurredAtSchema = z
  .string()
  .regex(DATE_PATTERN)
  // Arrow wrapper: isNotFutureDate's second parameter is the injectable
  // clock — a bare refine reference could forward a zod context into it.
  .refine((iso) => isNotFutureDate(iso), {
    message: 'Дата не может быть в будущем',
  })

const commentSchema = z.string().max(500)
```

**Event vocabulary — single source** (lines 18–28):
```typescript
const MOVEMENT_EVENT_LABELS = {
  received: 'Поступление',
  assigned: 'Выдача',
  transferred: 'Передача',
  returned: 'Возврат',
  to_repair: 'В ремонт',
  from_repair: 'Из ремонта',
  disposed: 'Списание',
} as const

export type MovementEventType = keyof typeof MOVEMENT_EVENT_LABELS
```
Derive `z.enum` keys from this dict (or type the enum as `MovementEventType`) — a parallel literal list would drift (anti-pattern: "Дублирование словаря событий/меток в edit-диалоге").

**strictObject per action** (lines 124–129):
```typescript
export const assignSchema = z.strictObject({
  deviceId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
  occurredAt: occurredAtSchema.optional(),
  comment: commentSchema.optional(),
})
```

**Dispose parity — required comment** (lines 150–154): `editMovementSchema` must require `comment` (min 1) when `eventType === 'disposed'`, mirroring:
```typescript
export const disposeSchema = z.strictObject({
  deviceId: z.coerce.number().int().positive(),
  occurredAt: occurredAtSchema.optional(),
  comment: z.string().min(1).max(500),
})
```

**New schema shape (research Pattern 2 sketch):** `deviceId` + `movementId` (both `z.coerce.number().int().positive()`), `eventType: z.enum([...MovementEventType keys])`, optional `employeeId` («кому») / `fromEmployeeId` («от кого») — slot validity per type enforced by refine or server branch: assigned → employeeId required; transferred → both; returned → fromEmployeeId; received/to_repair/from_repair/disposed → no person slots (extra slots = NULL). Register in `movementSchemas` dict (lines 202–210).

**New TZ helper slot (Pitfall 4):** add `occurredAtDateIso(date)` next to the existing `zonedParts` machine (lines 45–66) — recipe from `lib/warranty.ts` lines 24–33:
```typescript
export function displayTodayUtc(now: Date = new Date()): Date {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
```
`DISPLAY_TZ` itself lives in `lib/ru.ts` line 47 (`export const DISPLAY_TZ = 'Europe/Moscow'`), with `occurredAtFormat` (lines 52–59) for display.

---

### `db/queries/movements.ts` — replayChain + editMovement + deleteMovement (service, CRUD + transform)

**Analog:** self. Module contract header (lines 1–19) — the new functions must update it (append-only claim becomes false, Pitfall 8):
```typescript
type DbHandle = typeof db
type Tx = Parameters<Parameters<DbHandle['transaction']>[0]>[0]
```

**One-tx + conditional guard-UPDATE + `.changes` decision — the atomicity template** (`assignDevice`, lines 86–109):
```typescript
db.transaction((tx) => {
  assertActiveEmployee(tx, employeeId)
  const upd = tx
    .update(devices)
    .set({
      status: 'assigned',
      currentEmployeeId: employeeId,
      updatedAt: new Date(),
    })
    .where(and(eq(devices.id, deviceId), eq(devices.status, 'in_stock')))
    .run()
  if (upd.changes === 0) throw { code: 'ILLEGAL_TRANSITION' }
  tx.insert(movements).values({ ... }).run()
})
```
For edit/delete the mutation target is `movements` (new: UPDATE/DELETE now legal after migration) with a **composite WHERE** (Pitfall 1):
```typescript
const upd = tx.update(movements)
  .set({ eventType, fromEmployeeId, toEmployeeId, comment, occurredAt })
  .where(and(eq(movements.id, movementId), eq(movements.deviceId, deviceId)))
  .run()
if (upd.changes === 0) throw { code: 'MOVEMENT_GONE' }
const final = replayChain(tx, deviceId)   // AFTER mutation — must be valid
tx.update(devices)
  .set({ ...final, updatedAt: new Date() })
  .where(eq(devices.id, deviceId))
  .run()
```
Delete mirrors with `tx.delete(movements).where(and(...))`. `.changes === 0` → throw → full rollback = zero writes (D-03).

**Active-employee parity** (`assertActiveEmployee`, lines 69–76) — reuse verbatim for edit when the employee slot is being CHANGED:
```typescript
function assertActiveEmployee(tx: Tx, employeeId: number): void {
  const row = tx
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.isActive, 1)))
    .get()
  if (!row) throw { code: 'EMPLOYEE_INACTIVE' }
}
```

**Replay ordering — mirror the timeline exactly (Pitfall 2):** `listTimeline` (lines 513–531) orders `desc(movements.occurredAt), desc(movements.id)`; replay must order `asc(movements.occurredAt), asc(movements.id)` over `WHERE eq(movements.deviceId, deviceId)`.

**Projection shape:** replay returns `{ status: string; currentEmployeeId: number | null }` written to `devices` — same columns every existing action writes (see `assignDevice` set above; devices CHECK constraint in `db/schema.ts` is satisfied by the transition matrix).

**Transition matrix source:** the replay matrix MIRRORS the guard preconditions of the six existing actions: `assignDevice` (in_stock), `acceptDevice` (assigned), `transferDevice` (assigned), `sendToRepair` (in_stock|assigned), `returnFromRepair` (repair), `disposeDevice` (in_stock|assigned|repair — lines 289–294). Read each precondition in the analog function bodies (lines 78–309) when writing the switch. Start state: `status='in_stock', holder=null` (D-05).

**Comment to update (Pitfall 8):** `disposeDevice` doc comment (lines 269–274) says "no code path leads back (an erroneous record is corrected by registering a new device, never by editing this one)" — D-06 reverses this for history edits; reword to "finality for ACTIONS, lifted by history edit". Same for the module header (lines 9–16, "the movements table stays append-only") and `listRecentMovements` comment ("Read-only by construction", lines 559–560), and `db/schema.ts` movements-table comment.

---

### `app/(app)/devices/actions.ts` — editMovementAction + deleteMovementAction (controller, request-response)

**Analog:** self — the movement-action contract (lines 401–411 comment + consts):
```typescript
const ASSIGN_ERROR = 'Не удалось выдать. Попробуйте ещё раз.'
```
New: `EDIT_ERROR = 'Не удалось сохранить правку. Попробуйте ещё раз.'`-style consts; INVALID_CHAIN copy candidate: «Такая правка делает историю невозможной (проверьте порядок выдач и возвратов)»; MOVEMENT_GONE: «Запись уже изменена или удалена. Обновите страницу.»

**FormState + echo pattern** (lines 425–443) — reuse `MovementFormState` (add echo keys for the new inputs: eventType, movementId, fromEmployeeId):
```typescript
export type MovementFormState = {
  ok?: boolean
  error?: string
  fieldErrors?: MovementFieldErrors
  values?: Record<string, string>  // Echo of the submitted strings — same rationale as DeviceFormState.values.
}

function echoMovementValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {}
  for (const key of ['employeeId', 'occurredAt', 'comment']) {
    const raw = formData.get(key)
    if (typeof raw === 'string' && raw !== '') values[key] = raw
  }
  return values
}
```

**Field-error mapper** (`movementFieldErrorsOf`, lines 467–490) — extend for `eventType` key; copy style:
```typescript
if (key === 'employeeId') {
  fieldErrors.employeeId = 'Выберите сотрудника'
} else if (key === 'occurredAt') {
  fieldErrors.occurredAt =
    issue.code === 'custom'
      ? 'Дата не может быть в будущем'
      : 'Введите корректную дату'
}
```

**Full action skeleton** (`disposeDeviceAction`, lines 624–650 — the closest match since it owns a required comment):
```typescript
export async function disposeDeviceAction(
  _prev: unknown,
  formData: FormData,
): Promise<MovementFormState> {
  await requireSession()
  const values = echoMovementValues(formData)
  const parsed = movementSchemas.dispose.safeParse(movementPayload(formData, false))
  if (!parsed.success) {
    return { ...movementFieldErrorsOf(parsed.error, DISPOSE_ERROR, 'Укажите причину списания'), values }
  }
  try {
    disposeDevice(parsed.data.deviceId, { ... })
  } catch {
    return { error: DISPOSE_ERROR, values }
  }
  refresh()
  return { ok: true }
}
```
Contract invariants: `await requireSession()` is ALWAYS the first line (line 35 comment: "Server Actions are directly POST-able — the proxy perimeter does not cover them"); `occurredAtFromDate(parsed.data.occurredAt)` converts the yyyy-mm-dd before the query call (line 504); `refresh()` before `{ ok: true }` (Pitfall 7); `{code}` details never leave the server (V7). Research sketch for `editMovementAction` (§Code Examples) follows exactly this shape.

---

### `app/(app)/(card)/devices/[id]/movement-edit-dialogs.tsx` (component, new)

**Primary analog:** `app/(app)/devices/movement-dialogs.tsx` — copy mechanics verbatim (bulk-dialogs header, lines 34–36: "механика копируется дословно (прецедент clone-dialog: отдельный файл, копия, не абстракция)").

**WR-01 split — wrapper owns open-state, inner form owns useActionState** (movement-dialogs.tsx lines 42–53 + 232–236 + 276–300):
```typescript
function useCloseOnOk(state: MovementFormState, onDone: () => void) {
  useEffect(() => { if (state.ok) onDone() }, [state, onDone])
}

export function AssignDialog({ deviceId, employees }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="xl" data-device-assign-id={deviceId} />}>Выдать</DialogTrigger>
      <DialogContent className="max-w-md p-6">
        <DialogHeader><DialogTitle>Выдать устройство</DialogTitle></DialogHeader>
        <AssignDialogForm deviceId={deviceId} employees={employees} onDone={close} />
      </DialogContent>
    </Dialog>
  )
}
```
The edit dialog has NO DialogTrigger — it opens from a Timeline row button, so use the **controlled wrapper without trigger** from bulk-dialogs.tsx lines 348–381:
```typescript
export function BulkAssignDialog({ open, onOpenChange, rows, employees, deviceIds, onOk }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6">...</DialogContent>
    </Dialog>
  )
}
```

**EmployeePicker with onPick extension** (bulk-dialogs.tsx lines 73–155 — the D-discretion pick): identical to movement-dialogs EmployeePicker (Ё/ё fold, `value = имя`, hidden input `name="employeeId"` carrying the id, two zero-states) plus `onPick?: (employee: EmployeeOption) => void` called inside `onValueChange`. Field classes: `CONTROL_CLASS = 'h-10 px-3 text-base md:text-base'`, `ERROR_CLASS = 'text-sm text-[#D70015]'`. Gap to plan: current picker starts empty; edit dialog needs an initial selection (prefill the event's existing employee, including archived names from timeline data — research OQ2: unchanged employee keeps its id, new choice only from active list).

**Date field** (`OccurredAtField`, movement-dialogs.tsx lines 163–189) — edit variant prefills the EVENT's date (not today):
```typescript
<Input id={id} name="occurredAt" type="date"
  defaultValue={echoValue ?? todayLocal()} max={todayLocal()} ... />
```
Pitfall 4: the prefill value must be the event's yyyy-mm-dd in DISPLAY_TZ (new `occurredAtDateIso` helper), NEVER `toISOString().slice(0,10)` (movement-dialogs lines 59–67 document the anti-pattern).

**eventType selector analog:** `app/(app)/devices/device-dialog.tsx` lines 187–202 use `Select/SelectTrigger/SelectValue/SelectItem` from `@/components/ui/select` with `onValueChange` — the pattern for the «Тип действия» select fed by the keystone labels (`movementEventLabel` per `MovementEventType`).

**Delete confirmation — show the record text, never window.confirm.** Analog: `app/(app)/employees/archive-confirm-dialog.tsx` lines 88–107 (whole file is the template: question-title Dialog, body paragraph with the record's text, inner form with hidden ids, footer):
```typescript
<DialogHeader><DialogTitle>Архивировать сотрудника?</DialogTitle></DialogHeader>
<p className="text-base text-ink">{employeeName} исчезнет из рабочих списков, ...</p>
<ArchiveConfirmForm employeeId={employeeId} onDone={close} />
```
Footer style precedent: neutral ink primary `className="bg-ink font-semibold text-white hover:bg-ink/90"` (archive-confirm line 66) for reversible delete; red fill (`bg-destructive`) is reserved for dispose (movement-dialogs.tsx lines 568–583) — planner decides which family delete-record takes.

---

### `app/(app)/(card)/devices/[id]/timeline.tsx` (component, modify → client island)

**Analog:** self for rendering (routeLine switch, lines 17–33; dot rail, lines 45–77) plus `app/(app)/devices/device-actions.tsx` for the island shape — a `'use client'` component receiving `employees: EmployeeOption[]` straight from the RSC (lines 27–37):
```typescript
export function DeviceActions({ deviceId, status, holderName, employees }: {...}) {
```
The RSC feeds it at page.tsx line 263: `employees={listActiveEmployees()}`. Timeline becomes the same: `'use client'` top, props `events` + `employees` serialized ONCE (server-dedup-props — research: one island, not N per row). Add per-row «Исправить»/«Удалить» buttons next to each `<li>` (D-07) and own the edit/delete dialog state.

**Data-shape extension analog:** `MovementEventView` (movements.ts lines 23–30) currently has names only; extend with `fromId`/`toId` copying `RecentMovementView` (lines 537–549), which already selects both ids and names for exactly this reason ("a link needs the id, not just the label"). Update `listTimeline`'s select + LEFT JOIN aliases accordingly (archived employees keep rendering as text).

---

### `app/(app)/(card)/devices/[id]/page.tsx` (controller RSC, modify)

**Analog:** self. Serialization discipline for the island (lines 62–85):
```typescript
// The client edit island gets a flat serializable snapshot (vercel
// server-serialization): Dates become yyyy-mm-dd strings, no Date objects, no
// query rows.
```
`Timeline` prop `events` must be mapped to a flat snapshot the same way (occurredAt → ISO string, ids included). The page already imports `listActiveEmployees` + `listTimeline` (lines 9–12); the island mount site is the FieldGroup at lines 322–327:
```typescript
<FieldGroup title="История перемещений">
  <Timeline events={listTimeline(device.id)} />
</FieldGroup>
```

---

### `tests/movement-edit.test.ts` (test, new)

**Primary analog:** `tests/movements-queries.test.ts` lines 1–55 — bootstrap (temp DB BEFORE `@/db` import, real migrations incl. new 0002, dynamic imports):
```typescript
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-movements-'))
process.env.DATABASE_PATH = join(tmpDir, 'movements.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const movementsQueries = await import('@/db/queries/movements')
...
afterAll(() => { db.$client.close(); rmSync(tmpDir, { recursive: true, force: true }) })
```
Raw-row helpers for assertions (lines 85–104):
```typescript
function rawDevice(id: number) {
  return db.$client.prepare('SELECT * FROM devices WHERE id = ?').get(id) as {...}
}
function rawMovements(deviceId: number) {
  return db.$client.prepare('SELECT * FROM movements WHERE device_id = ? ORDER BY id').all(deviceId) as {...}
}
```
`.changes === 0` rejection test pattern: call `editMovement` with a foreign movementId, expect throw + `rawMovements()` unchanged.

**Frozen-clock schema tests analog:** `tests/movement-schema.test.ts` lines 18–41 — MSK-window probes with `vi.setSystemTime(MSK_0100)` and the `sv-SE` wall formatter; reuse for `occurredAtDateIso` regressions (prefill equals the displayed Moscow date).

## Shared Patterns

### Auth (requireSession-first)
**Source:** `app/(app)/devices/actions.ts` lines 34–38
**Apply to:** `editMovementAction`, `deleteMovementAction`
```typescript
// Server Actions are directly POST-able — the proxy perimeter does not cover
// them — so requireSession() is the FIRST line of every action (T-03-01).
```

### Error handling ({code}-throw → Russian copy, zero writes)
**Source:** `db/queries/movements.ts` lines 97, 275–296 (throw sites) + `actions.ts` lines 507–511 (catch → copy)
**Apply to:** query layer (`INVALID_CHAIN`, `MOVEMENT_GONE`, `EMPLOYEE_INACTIVE` reuses existing) and both actions (generic Russian copy only; details never leave the server — V7)
```typescript
if (upd.changes === 0) throw { code: 'ILLEGAL_TRANSITION' }
// ...action side:
} catch {
  return { error: ASSIGN_ERROR, values }
}
```

### One transaction = one atomic unit (mutate + replay + projection)
**Source:** `db/queries/movements.ts` — `assignDevice` lines 86–109 (guard shape), `bulkAssignDevices` lines 378–422 (throw = full rollback inside loop)
**Apply to:** `editMovement`, `deleteMovement` — mutation + `replayChain` + `UPDATE devices` in ONE `db.transaction`; invalid chain throws mid-tx → ROLLBACK → zero records (D-03/D-04)

### Validation whitelist (zod strictObject + keystone reuse)
**Source:** `lib/movement-schema.ts` lines 111–154 + `actions.ts` movementPayload lines 449–460
**Apply to:** edit schema + payload builder — same `occurredAtSchema`/`commentSchema` constructors (D-02 parity), `occurredAtFromDate` conversion in the action, empty-string → undefined mapping

### Dialog mechanics (WR-01 split, echo values, pending footer)
**Source:** `app/(app)/devices/movement-dialogs.tsx` lines 42–53, 212–236; `bulk-dialogs.tsx` lines 348–381 (controlled open)
**Apply to:** both new dialogs — inner form holds `useActionState`; `DialogActions` footer; `role="alert"` error paragraph; field order сотрудник → тип (edit only) → дата события → комментарий

### Server serialization (flat props, employees once)
**Source:** `app/(app)/(card)/devices/[id]/page.tsx` lines 62–85 (`dialogDeviceOf`) + `device-actions.tsx` lines 27–37
**Apply to:** page → Timeline island (events snapshot + employees serialized once; server-dedup-props)

### Test bootstrap
**Source:** `tests/movements-queries.test.ts` lines 1–55 + `tests/helpers.ts` lines 26–46
**Apply to:** `tests/movement-edit.test.ts` — temp DATABASE_PATH, `applyMigrations` picks up 0002 automatically, raw SQL helpers for row assertions

## No Analog Found

| File / Concern | Role | Data Flow | Reason |
|----------------|------|-----------|--------|
| `replayChain` transition matrix | service logic | transform | No event-replay exists in the codebase — the matrix mirrors the six guard-UPDATE preconditions (movements.ts lines 78–309) but is new logic; planner uses RESEARCH.md Pattern 1 matrix (received/assigned/transferred/returned/to_repair/from_repair/disposed), start state `in_stock`, throw `{code:'INVALID_CHAIN'}` on violation |
| Edit-dialog eventType select with per-type person slots | component | event-driven (dynamic fields) | No existing dialog swaps field sets on a select change; closest partial analogs: Select usage (device-dialog.tsx lines 187–202) + movement-dialogs field set; planner wires slot visibility from the chosen `MovementEventType` (D-01) |
| EmployeePicker with initial (prefilled) selection | component | — | Both existing pickers start empty (movement-dialogs.tsx line 87 `useState('')`); edit needs the event's current employee prefilled — extend with `initial?: EmployeeOption` prop; archived-employee prefill decision in RESEARCH OQ2 |

## Metadata

**Analog search scope:** `app/(app)/`, `db/queries/`, `db/`, `lib/`, `components/ui/`, `tests/`, `scripts/`, `drizzle/`
**Files read in full or targeted:** 20 (movements.ts, movement-schema.ts, actions.ts, movement-dialogs.tsx, bulk-dialogs.tsx, timeline.tsx, card page.tsx, device-actions.tsx, archive-confirm-dialog.tsx, helpers.ts, migrate.mjs, warranty.ts, ru.ts, journal.json, 0000 migration, 2 test files, schema.ts via excerpt targets, select/device-dialog greps)
**Pattern extraction date:** 2026-09-28
