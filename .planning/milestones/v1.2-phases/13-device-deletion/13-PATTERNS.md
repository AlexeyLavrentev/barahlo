# Phase 13: Удаление устройств - Pattern Map

**Mapped:** 2026-09-28
**Files analyzed:** 7 (2 new, 5 modified)
**Analogs found:** 7 / 7 — every new/modified file has an exact in-repo precedent

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `db/queries/devices.ts` (+ `deleteDevice`) | model (query layer, pure sync) | CRUD batch + file-I/O | `db/queries/attachments.ts` `deleteAttachment` (136-181) + in-file `cloneDevices` tx shape | exact |
| `app/(app)/devices/actions.ts` (+ `deleteDeviceAction`) | controller (Server Action) | request-response | same file: `deleteMovementAction` (755-772), `cloneDeviceAction` (370-405) | exact |
| `app/(app)/devices/device-delete-dialog.tsx` (NEW) | component (client island) | event-driven (dialog session) | `app/(app)/employees/archive-confirm-dialog.tsx` (wrapper-island shape) + `MovementDeleteConfirmDialog` red register | exact |
| `app/(app)/(card)/devices/[id]/page.tsx` (render island + counts) | controller (RSC page) | request-response (server → island props) | itself: disposed conditional at 246-268, snapshot pattern `dialogDeviceOf` (67-87) | exact |
| `lib/device-schema.ts` (+ `deviceDeleteSchema`) | config (validation keystone) | transform | `lib/movement-schema.ts` `deleteMovementSchema` (218-221) | exact |
| `lib/ru.ts` (+ plural form table) | utility | transform | in-file `pluralEmployees`/`pluralDevices` recipe (5-37) | exact |
| `tests/device-delete.test.ts` (NEW) | test (unit + source gates) | batch | `tests/movement-edit.test.ts` (bootstrap + source gates) + `tests/attachments-queries.test.ts` (UPLOADS_DIR + seeding) | exact |

**Read surfaces (parity D-06): ZERO new code, ZERO modifications.** Verified by reading every consumer — all derive from the `devices` row through shared predicates:
- `deviceWhere` — `db/queries/devices.ts:228-259` — drives `listDevices` (372), `exportDevices` (468), `searchPaletteDevices` (515). Row gone ⇒ gone from реестр, substring search, ⌘K, both CSVs.
- Dashboard counters — `deviceCountByType` (279) / `deviceCountByStatus` (290) / `totalDeviceCount` (299) — group-by over `devices` directly.
- Feed — `listRecentMovements` — `db/queries/movements.ts:770` `innerJoin(devices, ...)` (movements deleted in same tx, no orphans).
- «Выданное» — `listIssuedByEmployee` — `db/queries/movements.ts:782-800` — `WHERE devices.currentEmployeeId = ?`; row gone ⇒ gone.

## Pattern Assignments

### `db/queries/devices.ts` (+ `deleteDevice`) — model, CRUD batch + file-I/O

**Analog:** `db/queries/attachments.ts` `deleteAttachment` (lines 131-181) — the single-photo precedent this phase generalizes to device scope. Secondary in-file analog: `cloneDevices` (627-665) for the one-tx shape inside THIS file.

**File header contract** (attachments.ts:7-10 — the module convention `deleteDevice` inherits; devices.ts:23-25 states the same):
```typescript
// Attachment data-access (REG-05, D-05). Pure sync functions over the
// module-level db — no framework imports at all: the route handlers add
// session + zod on top, vitest imports this module directly against a temp
// database and temp UPLOADS_DIR.
```

**Core pattern — snapshot inside tx → delete → post-commit unlink** (attachments.ts:136-181):
```typescript
export function deleteAttachment(deviceId: number, attachmentId: number): void {
  let storageKey: string | undefined
  db.transaction((tx) => {
    const row = tx
      .select({ storageKey: attachments.storageKey })
      // ... .get()
    if (!row) throw { code: 'ATTACHMENT_NOT_FOUND' }
    // ... guards ...
    tx.delete(attachments).where(...).run()
    storageKey = row.storageKey          // snapshot BEFORE the row vanishes (D-04)
  })
  if (storageKey === undefined) return   // unreachable: throw paths exit above
  for (const key of [storageKey, thumbKeyOf(storageKey)]) {
    try {
      // Synchronous unlink: ... fire-and-forget fs/promises raced the test's
      // existsSync and could lose the file deletion entirely if the process
      // exits before the threadpool flushes. Two small files = microseconds.
      unlinkSync(resolveUploadPath(key))
    } catch {
      // ENOENT / containment violation of a tampered key — row is already
      // gone, the file stays an unreachable orphan (harmless direction)
    }
  }
}
```
For `deleteDevice`: the tx body becomes (1) SELECT all `attachments.storageKey` for the device, (2) `DELETE movements WHERE device_id` , (3) `DELETE attachments WHERE device_id`, (4) `DELETE devices WHERE id` with the guard. The post-commit loop is the same `[key, thumbKeyOf(key)]` unlink per snapshot key. Closure-variable surfacing (not tx return) is the established style.

**`.changes === 0` existence guard** (movements.ts:664-684 — `deleteMovement`, phase-12 twin):
```typescript
export function deleteMovement(deviceId: number, movementId: number): void {
  db.transaction((tx) => {
    const del = tx
      .delete(movements)
      .where(and(eq(movements.id, movementId), eq(movements.deviceId, deviceId)))
      .run()
    if (del.changes === 0) throw { code: 'MOVEMENT_GONE' }
    // ...
  })
}
```
`deleteDevice` copies this verbatim: exactly ONE guard, on the `devices` delete — `{ code: 'DEVICE_GONE' }`. NO guard on the children deletes (they legitimately hit 0..N rows); NO status precondition (locked discretion — any status deletes). Contrast: `deleteAttachment` DOES have a `DISPOSED` guard (attachments.ts:156) — that guard is intentionally NOT copied (D-01: disposed devices are the main delete scenario).

**One-tx shape inside this file** (devices.ts:633-665, `cloneDevices`):
```typescript
  try {
    return db.transaction((tx) =>
      inventories.map((inventory) =>
        tx.insert(devices).values({...}).returning({ id: devices.id }).get()!.id,
      ),
    )
  } catch (e) {
    throw uniqueCodeOf(e)
  }
```

**FK RESTRICT facts** (`db/schema.ts:126-128, 146-148`):
```typescript
deviceId: integer('device_id')
  .notNull()
  .references(() => devices.id, { onDelete: 'restrict' }),
```
Both `movements.device_id` and `attachments.device_id` are RESTRICT — explicit child deletes before the parent are mandatory (direct parent DELETE throws `FOREIGN KEY constraint failed`, probe-verified in 13-RESEARCH).

**Imports to add** (devices.ts currently imports from drizzle/db/schema only — add `unlinkSync` from `node:fs` and `resolveUploadPath, thumbKeyOf` from `@/lib/photos`, mirroring attachments.ts:1-5).

---

### `app/(app)/devices/actions.ts` (+ `deleteDeviceAction`) — controller, request-response

**Analog:** same file, `deleteMovementAction` (755-772) — byte-parity contract; `cloneDeviceAction` (370-405) for the strictObject single-entity variant; `{code}`-mapper at 436-441.

**Contract banner** (actions.ts:40-44 — applies unchanged):
```typescript
// Server Actions are directly POST-able — the proxy perimeter does not cover
// them — so requireSession() is the FIRST line of every action (T-03-01).
// Inputs are whitelisted through zod (T-03-02): raw FormData is never spread
// into SQL values. Only the generic Russian failure string leaves the action
// (V7); field-level errors come from the UI-SPEC copy table.
```

**The phase-12 delete action to copy** (actions.ts:755-772):
```typescript
export async function deleteMovementAction(
  _prev: unknown,
  formData: FormData,
): Promise<MovementFormState> {
  await requireSession()
  const parsed = deleteMovementSchema.safeParse({
    deviceId: formData.get('deviceId'),
    movementId: formData.get('movementId'),
  })
  if (!parsed.success) return { error: DELETE_ERROR }
  try {
    deleteMovement(parsed.data.deviceId, parsed.data.movementId)
  } catch (error) {
    return { error: movementMutationErrorOf(error, DELETE_ERROR) }
  }
  refresh()
  return { ok: true }
}
```
Differences for `deleteDeviceAction`: (a) success path ends with `redirect('/devices', { type: 'replace' })` INSTEAD of `refresh()` + `{ ok: true }` — and `redirect` MUST sit OUTSIDE the try/catch (NEXT_REDIRECT is thrown control flow; see login precedent `app/login/actions.ts:59`); (b) error copy family extends the existing block at actions.ts:423-432 (`DELETE_ERROR` const precedent at 426, `{code}`-mapper `movementMutationErrorOf` at 436-441) — add a `DEVICE_DELETE_ERROR` const + `DEVICE_GONE_COPY` mapping in the same register:
```typescript
// actions.ts:426, 436-441 — the register to extend
const DELETE_ERROR = 'Не удалось удалить запись. Попробуйте ещё раз.'
const MOVEMENT_GONE_COPY = 'Запись уже изменена или удалена. Обновите страницу.'
function movementMutationErrorOf(error: unknown, fallback: string): string {
  const code = (error as { code?: string } | undefined)?.code
  if (code === 'INVALID_CHAIN') return INVALID_CHAIN_COPY
  if (code === 'MOVEMENT_GONE') return MOVEMENT_GONE_COPY
  return fallback
}
```
(c) `import { redirect } from 'next/navigation'` — currently the file imports only `refresh` from `next/cache` (actions.ts:4). Byte-exact copy strings are the planner's 13-UI-SPEC call (A2 in 13-RESEARCH).

---

### `app/(app)/devices/device-delete-dialog.tsx` (NEW) — component, event-driven

**Analog:** `app/(app)/employees/archive-confirm-dialog.tsx` (whole file, 107 lines) — the standalone wrapper-island shape. Red register from `movement-edit-dialogs.tsx` `MovementDeleteForm` (386-445).

**WR-01 split rationale to copy verbatim** (archive-confirm-dialog.tsx:24-28):
```typescript
// WR-01: the wrapper below stays mounted (it owns the trigger and the open
// state), so `useActionState` must NOT live there — it would keep a failed
// submit's role=alert alive across close/reopen. This inner component owns
// the form + action state; the dialog portal unmounts its children once the
// close animation finishes, so every open session starts from a clean state.
```

**Wrapper island shape** (archive-confirm-dialog.tsx:76-107):
```typescript
export function ArchiveConfirmDialog({
  employeeId,
  employeeName,
}: {
  employeeId: number
  employeeName: string
}) {
  const [open, setOpen] = useState(false)
  // Stable identity so the form's ok-effect keyed on [state, onDone] fires
  // per action response, not per parent render.
  const close = useCallback(() => setOpen(false), [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="xl" />}>
        Архивировать
      </DialogTrigger>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>Архивировать сотрудника?</DialogTitle>
        </DialogHeader>
        <p className="text-base text-ink">{employeeName} ...</p>
        <ArchiveConfirmForm employeeId={employeeId} onDone={close} />
      </DialogContent>
    </Dialog>
  )
}
```

**Inner form with useActionState + error + hidden id** (archive-confirm-dialog.tsx:29-73; `useCloseOnOk` helper at movement-edit-dialogs.tsx:68-72):
```typescript
function ArchiveConfirmForm({ employeeId, onDone }: { employeeId: number; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(setEmployeeArchivedAction, {})
  useEffect(() => { if (state.ok) onDone() }, [state, onDone])
  return (
    <>
      {state.error ? (
        <p className="text-sm text-[#D70015]" role="alert">{state.error}</p>
      ) : null}
      <form action={formAction}>
        <input type="hidden" name="id" value={employeeId} />
        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>Не архивировать</DialogClose>
          <Button type="submit" disabled={pending}
            className="bg-ink font-semibold text-white hover:bg-ink/90">
            {pending ? 'Архивирование…' : 'Архивировать'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
```

**Red destructive register — byte-exact from phase 12** (movement-edit-dialogs.tsx:427-441):
```typescript
        <DialogFooter>
          {/* Mirrored negative on purpose (dispose precedent). */}
          <DialogClose render={<Button variant="secondary" />}>
            Не удалять
          </DialogClose>
          {/* The second red solid fill in the UI (UI-SPEC color table): the
              irreversible destruction joins the «Списать» family. */}
          <Button
            type="submit"
            disabled={pending}
            className="bg-destructive font-semibold text-white hover:bg-destructive/90"
          >
            {pending ? 'Удаляем…' : 'Удалить'}
          </Button>
        </DialogFooter>
```
Also copy: title-question pattern «Удалить запись?» (movement-edit-dialogs.tsx:462) → «Удалить устройство?»; neutral-ink content, red only on the button (comment at 401-402); `max-w-md p-6` DialogContent (460). Note: `useCloseOnOk`/`onDone` is unreachable on success here (redirect unmounts the page) — keep the hook for the error-only lifecycle, per the archive precedent.

**Props = flat server-serialized snapshot** (D-02 counters): `deviceId: number`, `model: string`, `serialNumber: string`, `inventoryNumber: string`, `historyCount: number`, `photoCount: number` — same discipline as `dialogDeviceOf` (page.tsx:64-87, "flat serializable snapshot ... no Date objects, no query rows").

---

### `app/(app)/(card)/devices/[id]/page.tsx` (render zone + pass counts) — controller RSC, request-response

**Analog:** itself. Three exact insertion points already in context:

**1. The disposed conditional the zone must sit OUTSIDE of** (page.tsx:246-268):
```typescript
      {device.status !== 'disposed' ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <DeviceDialog label="Редактировать" ... />
          <CloneDialog deviceId={device.id} inventoryNumber={device.inventoryNumber} />
          <DeviceActions deviceId={device.id} status={device.status} ... />
        </div>
      ) : null}
```
The `<DeviceDeleteDialog .../>` renders AFTER this ternary as its own element (recommended: card bottom after `<PhotoGrid .../>` at 355-363). NEVER inside `device-actions.tsx` — that component `return null`s for disposed (device-actions.tsx:72-73).

**2. Counts are FREE — both queries are already called** (page.tsx:336 and 357):
```typescript
          events={listTimeline(device.id).map((event) => ({ ... }))}   // line 336 — .length = historyCount
        photos={listByDevice(device.id).map((attachment) => ({ ... }))} // line 357 — .length = photoCount
```
Hoist the two calls into local `const`s before the JSX and pass `.length` — no new queries.

**3. Snapshot discipline** (page.tsx:64-67):
```typescript
// The client edit island gets a flat serializable snapshot (vercel
// server-serialization): Dates become yyyy-mm-dd strings, no Date objects, no
// query rows.
```
**4. 404 contract — untouched** (page.tsx:199-204): `requireSession()` → `IdSchema.safeParse(id)` → `getDevice()` → `if (!device) notFound()`. Deleted device ⇒ `getDevice` undefined ⇒ 404 automatically (D-05 second half is already wired).

---

### `lib/device-schema.ts` (+ `deviceDeleteSchema`) — config keystone, transform

**Analog:** `lib/movement-schema.ts:216-221` — the minimal strict delete schema:
```typescript
// Удаление записи истории (HIST-02): минимальный strictObject — только адрес
// записи; всё остальное режется (injected payload keys are a tampering probe).
export const deleteMovementSchema = z.strictObject({
  deviceId: z.coerce.number().int().positive(),
  movementId: z.coerce.number().int().positive(),
})
```
`deviceDeleteSchema` = same shape with `deviceId` only. Keystone rationale (movement-schema.ts:11-13, applies to device-schema.ts too): "Pure and immutable: no framework imports, no module-level mutable state — safe to import from RSC, actions and vitest alike." The keystone home (NOT inline in actions.ts) is required because schema matrix tests cannot import `'use server'` modules — same reason `deleteMovementSchema` lives here. `coerce` handles the string hidden input.

---

### `lib/ru.ts` (+ movement-record plural forms) — utility, transform

**Analog:** in-file recipe, lines 5-37:
```typescript
const pluralRules = new Intl.PluralRules('ru')

// Russian plural categories: one → 1, 21, 101…; few → 2–4, 22–24…;
// many → 0, 5–20, 11, 111…
const EMPLOYEE_FORMS: Record<Intl.LDMLPluralRule, string> = {
  zero: 'сотрудников',
  one: 'сотрудник',
  two: 'сотрудника',
  few: 'сотрудника',
  many: 'сотрудников',
  other: 'сотрудников',
}

export function pluralEmployees(n: number): string {
  const word = EMPLOYEE_FORMS[pluralRules.select(n)]
  return `${n} ${word}`
}
```
`pluralDevices` (25-37) is the second precedent. New export follows byte-for-byte: a `Record<Intl.LDMLPluralRule, string>` table for «запись/записи/записей» (one: 'запись', two/few: 'записи', zero/many/other: 'записей') + a `pluralMovementRecords(n)`-style fn. Never inline `n === 1 ? ...` ternaries (Pitfall 7: 21/22/111 break them). Final wording → planner's 13-UI-SPEC (A2/A3).

---

### `tests/device-delete.test.ts` (NEW) — test, batch

**Analog bootstrap** (`tests/movement-edit.test.ts:1-36`) — copy exactly, ORDER IS LOAD-BEARING (Pitfall 5: env BEFORE dynamic `import('@/db')`):
```typescript
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll, afterEach, vi } from 'vitest'
import { applyMigrations } from './helpers'

const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-edit-'))
process.env.DATABASE_PATH = join(tmpDir, 'movement-edit.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const movementsQueries = await import('@/db/queries/movements')
const deviceQueries = await import('@/db/queries/devices')
const schemaModule = await import('@/lib/movement-schema')

afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})
```
**UPLOADS_DIR line** — add from `tests/attachments-queries.test.ts:18-20`:
```typescript
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-attachments-'))
process.env.DATABASE_PATH = join(tmpDir, 'attachments.db')
process.env.UPLOADS_DIR = join(tmpDir, 'uploads')
```
**Seeding helpers to copy:** `newDevice()` via `createDevice` (movement-edit.test.ts:248-261 or attachments-queries.test.ts:56-69); attachment rows with FAKE storage keys via `insertWithCapCheck` — "tests can seed rows without any disk content" (attachments-queries.test.ts:98-109); write real temp files with `mkdirSync`/`writeFile` under `uploadsDir()` when asserting `existsSync === false` after delete; direct SQL flip for non-default status (attachments-queries.test.ts:71-75 `setDeviceStatus`); `captureThrown` (movement-edit.test.ts:292-299) for `{ code }` assertions; raw SQL readers `rawDevice`/`rawMovements` (271-290) for orphan checks.

**Knife-test shapes to copy:** tx-rollback assertion `expect(rawMovements(dev)).toEqual(before)` after a thrown delete (movement-edit.test.ts:451-462); re-delete guard `expect(code).toBe('MOVEMENT_GONE')` (501-503); parity-walk style of `listIssuedByEmployee(emp).find(...)` (388).

**Source gates to copy** (movement-edit.test.ts:577-629) — readFileSync-as-text (NEVER import a `'use server'` module from vitest):
```typescript
const ACTIONS_SRC = readFileSync(
  join(process.cwd(), 'app/(app)/devices/actions.ts'),
  'utf8',
)
// requireSession-first gate:
const body = ACTIONS_SRC.slice(ACTIONS_SRC.indexOf(`async function ${name}`))
expect(body.slice(0, 400)).toContain('await requireSession()')
// machine {code} never returns:
expect(ACTIONS_SRC.match(/error:\s*\{\s*code/g) ?? []).toEqual([])
// no native confirm:
expect(SRC.includes('window.confirm')).toBe(false)
```
Planner picks the needles (suggested by research: `data-device-delete` attr, island filename, action name, `deleteDevice` presence in devices.ts, `unlinkSync` AFTER the tx close in the source order).

---

## Shared Patterns

### S1. `{code}` error discipline (V7) — typed throw in query layer, Russian copy in action
**Sources:** `db/queries/attachments.ts:88,149,156` (`{ code: 'CAP' | 'ATTACHMENT_NOT_FOUND' | 'DISPOSED' }`), `db/queries/movements.ts:645,672` (`MOVEMENT_GONE`), mapper `app/(app)/devices/actions.ts:436-441`.
**Apply to:** `deleteDevice` throws `{ code: 'DEVICE_GONE' }`; `deleteDeviceAction` maps it to `DEVICE_GONE_COPY` BEFORE any return. Never return machine literals.
```typescript
if (del.changes === 0) throw { code: 'DEVICE_GONE' }
```

### S2. requireSession-first action contract (T-03-01)
**Source:** `app/(app)/devices/actions.ts:40-48` (banner) + every action body (246, 274, 374, 759).
**Apply to:** `deleteDeviceAction` — first executable line, before any parse.

### S3. One-tx mutation, throw = full rollback
**Sources:** `cloneDevices` (`db/queries/devices.ts:634`), `deleteAttachment` (`db/queries/attachments.ts:138`), `deleteMovement` (`db/queries/movements.ts:665`). Probe-verified (13-RESEARCH): mid-tx throw rolls back ALL statements.
**Apply to:** `deleteDevice` — all three DELETEs inside one `db.transaction`; children (movements → attachments) before parent (devices).

### S4. Disk is derived state — post-commit sync unlink, errors tolerated
**Source:** `db/queries/attachments.ts:166-180` (incl. the sync-vs-async rationale comment) + `lib/photos.ts:40-73` (`thumbKeyOf`, `resolveUploadPath` with `assertInsideUploads` PATH_ESCAPE containment).
**Apply to:** `deleteDevice` — snapshot `storageKey`s INSIDE the tx; after commit, `unlinkSync(resolveUploadPath(k))` for `[key, thumbKeyOf(key)]`, every fs error (ENOENT, PATH_ESCAPE) swallowed. Never path-build from deviceId; never guess the thumb name.

### S5. WR-01 dialog split + red destructive register (D-02)
**Sources:** `app/(app)/employees/archive-confirm-dialog.tsx:24-28,76-107` (split), `app/(app)/(card)/devices/[id]/movement-edit-dialogs.tsx:427-441` (bg-destructive, «Удаляем…», «Не удалять», role=alert).
**Apply to:** `device-delete-dialog.tsx` — wrapper owns trigger + `open` state; inner form owns `useActionState`; `max-w-md p-6`; NO window.confirm; NO type-to-confirm.

### S6. Flat snapshot serialization across the RSC boundary
**Source:** `app/(app)/(card)/devices/[id]/page.tsx:64-87` (`dialogDeviceOf`).
**Apply to:** DeviceDeleteDialog props — strings/numbers only (model, serial/inventory, counts), never Date/row objects.

### S7. Russian plurals via `Intl.PluralRules('ru')` form tables
**Source:** `lib/ru.ts:5-37`.
**Apply to:** the dialog's «N записей истории» line — new LDML-complete form table; covers 1/2-4/5+/21/22/111.

### S8. Test bootstrap: env → dynamic import → applyMigrations; source-gates read as text
**Sources:** `tests/movement-edit.test.ts:12-31` (bootstrap), `:577-629` (gates), `tests/attachments-queries.test.ts:18-20` (UPLOADS_DIR), `:101-109` (fake-key seeding).
**Apply to:** `tests/device-delete.test.ts` whole file.

## No Analog Found

None. Every file in scope has an exact, recently-shipped precedent (phase 12 shipped 2026-09-28; archive dialog phase 4). The only genuinely new lines are the composition: three DELETEs in one tx + a per-key unlink loop.

## Planner Notes

1. **Stale comment to refresh (optional, comment-only):** `db/queries/movements.ts:742-745` — `listRecentMovements` doc says "innerJoin(devices) is safe — the FK is NOT NULL + restrict and **nothing in the app deletes devices (device deletion is phase 13 scope)**". After this phase the parenthetical is false; a comment-only touch keeps the doc honest without violating D-06 (zero query changes). Planner decides whether it rides in this phase or a docs pass.
2. **Guard asymmetry is intentional:** `deleteAttachment` has a `DISPOSED` guard (attachments.ts:156) — do NOT copy it into `deleteDevice` (D-01/D-03: any status deletes; the only guard is existence).
3. **`redirect` import:** `actions.ts` currently imports only `refresh` from `next/cache` (line 4); add `redirect` from `next/navigation`. `redirect('/devices')` goes OUTSIDE the try/catch (Pitfall 1); `{ type: 'replace' }` option is MEDIUM confidence (A1) — plain `redirect('/devices')` is the fallback if tsc rejects it.
4. **UI-SPEC dependency:** dialog title, count-line wording, and zone placement are the planner's 13-UI-SPEC call; the excerpts above fix the STRUCTURE (register, split, classes), not the final copy.

## Metadata

**Analog search scope:** `db/queries/`, `db/`, `lib/`, `app/(app)/devices/`, `app/(app)/(card)/devices/[id]/`, `app/(app)/employees/`, `tests/`
**Files read in full or targeted:** 16 — `db/queries/{devices,attachments,movements}.ts`, `db/schema.ts`, `lib/{photos,ru,device-schema,movement-schema}.ts`, `app/(app)/devices/{actions,device-actions}.ts(x)`, `app/(app)/(card)/devices/[id]/{page,movement-edit-dialogs}.tsx`, `app/(app)/employees/archive-confirm-dialog.tsx`, `tests/{movement-edit,attachments-queries}.test.ts`, `CLAUDE.md` (→ AGENTS.md)
**Pattern extraction date:** 2026-09-28
