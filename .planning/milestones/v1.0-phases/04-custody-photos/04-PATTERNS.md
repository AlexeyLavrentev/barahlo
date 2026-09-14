# Phase 4: Custody & Photos - Pattern Map

**Mapped:** 2026-09-03
**Files analyzed:** 16 (12 new, 4 modified)
**Analogs found:** 16 / 16 (13 exact/role-match in codebase; sharp pipeline + client-resize mechanics have no in-repo analog — use RESEARCH.md Patterns C5 code, verified executed this session)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `db/queries/movements.ts` | model (queries module) | CRUD + transactional batch | `db/queries/employees.ts` | exact (tx pattern) |
| `db/queries/attachments.ts` | model (queries module) | CRUD | `db/queries/devices.ts` | exact |
| `lib/movement-schema.ts` | utility (keystone/schema) | transform | `lib/device-schema.ts` | exact |
| `lib/photos.ts` | utility | file-I/O + transform | `lib/ru.ts` (purity convention); sharp pipeline = RESEARCH C5 | role-match (sharp: no analog) |
| `app/(app)/devices/actions.ts` (MODIFY) | controller (Server Actions) | request-response | itself + `app/(app)/employees/actions.ts` | exact |
| `app/(app)/employees/actions.ts` (MODIFY) | controller (Server Actions) | request-response | itself + devices actions echo pattern | exact |
| `app/(app)/devices/(card)/devices/[id]/movement-dialogs.tsx` | component (client island) | form/event-driven | `app/(app)/employees/archive-confirm-dialog.tsx` + `devices/device-dialog.tsx` | exact |
| `app/(app)/devices/(card)/devices/[id]/timeline.tsx` | component (RSC) | read-only render | `app/(app)/(card)/devices/[id]/page.tsx` (FieldGroup recipe) | role-match |
| `app/(app)/devices/(card)/devices/[id]/photo-section.tsx` | component (client island) | file-I/O event-driven | `devices/device-dialog.tsx` (island/trigger shape); fetch+refresh = RESEARCH C5 | partial (upload loop: no analog) |
| `app/api/devices/[id]/photos/route.ts` | route handler | file-I/O | `app/api/health/route.ts` | role-match (only route handler in repo) |
| `app/api/devices/[id]/photos/[attachmentId]/route.ts` | route handler | file-I/O | `app/api/health/route.ts` | role-match |
| `app/(app)/(card)/devices/[id]/page.tsx` (MODIFY) | component (RSC page) | request-response | itself (placeholders at lines 273–278 are the mount points) | exact |
| `app/(app)/(card)/employees/[id]/page.tsx` (MODIFY) | component (RSC page) | request-response | itself + device card page | exact |
| `tests/movements-queries.test.ts` | test (vitest) | batch | `tests/devices-queries.test.ts` + `tests/helpers.ts` | exact |
| `tests/attachments-queries.test.ts` | test (vitest) | batch + file-I/O | `tests/devices-queries.test.ts` | role-match (sharp part: RESEARCH C5) |
| `scripts/smoke-custody.mjs` | test (e2e smoke) | request-response | `scripts/smoke-devices.mjs` | exact |

## Pattern Assignments

### `db/queries/movements.ts` (model, CRUD + transactional batch)

**Analog:** `db/queries/employees.ts` — the only module with the transaction + shared-tx-helper pattern; `db/queries/devices.ts` for the module header purity contract.

**Purity contract** (`db/queries/devices.ts` lines 1–9, same text in employees.ts):
```ts
import { asc, count, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { devices, employees } from '@/db/schema'

// Device data-access (REG-01/REG-02). Pure sync functions over the module-level
// db — no framework imports at all: Server Actions add session + zod on top,
// vitest imports this module directly against a temp database.
```
Copy this header verbatim (adapt the comment): NO `next/headers`, no `server-only` — vitest imports the module directly (research Wave-0 Pitfall: no framework imports in testable code).

**Transaction helper type + shared-tx function** (`db/queries/employees.ts` lines 28–29, 102–125):
```ts
type DbHandle = typeof db
type Tx = Parameters<Parameters<DbHandle['transaction']>[0]>[0]

export function resolveDepartmentId(tx: Tx, name: string): number {
  const existing = tx
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.name, name))
    .get()
  ...
}
```
Use the `Tx` type alias verbatim for a shared `transition(tx, {...})` core that all 7 actions call — the per-action differences are only the guard status, event type, and projection values (RESEARCH Pattern C2 matrix).

**One-sync-transaction shape** (`db/queries/employees.ts` lines 130–149):
```ts
export function createEmployee({ name, departmentName }: {...}) {
  return db.transaction((tx) => {
    const departmentId = resolveDepartmentId(tx, departmentName)
    return tx
      .insert(employees)
      .values({ name, departmentId })
      .returning({ id: employees.id, ... })
      .get()!
  })
}
```
This is the exact shape for `assignDevice` / `returnDevice` / etc. (RESEARCH Pattern C1 adds the conditional-UPDATE guard `.where(and(eq(devices.id, id), eq(devices.status, precondition)))` with `if (upd.changes === 0) throw new MovementGuardError()` — there is no read-then-write anywhere in this codebase, keep it that way) and for `returnAllDevices` (C3: loop of event+projection pairs inside ONE `db.transaction`, returns count).

**RU sort key** (`db/queries/devices.ts` line 64; employees.ts line 34):
```ts
const ruSortKey = sql`replace(replace(${devices.model}, 'Ё', 'Е'), 'ё', 'е')`
```
Reuse for the issued-devices list ordering and for a new `listActiveEmployees()` (id, name) needed by the assign/transfer pickers.

**Timeline query** — no analog uses `alias()` yet; RESEARCH Pattern C4 is the verified recipe (`alias(employees, 'from_emp')` double leftJoin, `orderBy(desc(occurredAt), desc(id))`). Table columns to select against are at `db/schema.ts` lines 113–133 (movements: `deviceId, eventType, fromEmployeeId, toEmployeeId, comment, occurredAt, createdAt`).

---

### `db/queries/attachments.ts` (model, CRUD)

**Analog:** `db/queries/devices.ts` — plain list/get/insert/delete-over-`db` functions, plain rethrown business errors.

**Query shape** (`db/queries/devices.ts` lines 115–131): `.select({...}).from(devices).leftJoin(...).where(...).orderBy(...).limit().offset().all()` and `.get()` for single rows. For attachments: `count` via `.select({ value: count() }).from(attachments).where(eq(attachments.deviceId, id)).get()!.value` (same as `listDevices` line 107–111), list by device ordered `asc(attachments.id)`, insert returning id (lines 164–192 shape), delete `.run()`.

**Batched second query per page** — RESEARCH Pattern C6 (verified): one grouped `max(occurredAt)` query for «выдано {дата}»; thumbnail/count grouping in JS over `inArray(attachments.deviceId, pageIds)` (no index on `attachments.device_id`, no migrations allowed — batching keeps it to one scan per page).

**Error convention** (`db/queries/devices.ts` lines 69–83 `uniqueCodeOf`): business conditions are rethrown as plain `{ code: '…' }` objects, mapped to Russian copy in the action. `MovementGuardError` / cap rejection follow the same spirit.

---

### `lib/movement-schema.ts` (utility keystone: event vocabulary + labels + zod)

**Analog:** `lib/device-schema.ts` — the established keystone: vocabulary, RU labels, and zod pieces in ONE pure module, imported by dialogs, actions, and tests.

**Label vocabulary pattern** (`lib/device-schema.ts` lines 108–117):
```ts
const DEVICE_STATUS_LABELS = {
  in_stock: 'На складе',
  assigned: 'Используется',
  repair: 'В ремонте',
  disposed: 'Списано',
} as const

export function deviceStatusLabel(status: string): string {
  return DEVICE_STATUS_LABELS[status as keyof typeof DEVICE_STATUS_LABELS] ?? status
}
```
Copy for the 7 `eventType` labels (`received/assigned/transferred/returned/to_repair/from_repair/disposed` → «Поступление/Выдача/Передача/Возврат/В ремонт/Из ремонта/Списание» per 04-UI-SPEC) — timeline and dialogs must not keep parallel maps.

**Purity contract** (`lib/device-schema.ts` lines 8–12): «Pure and immutable: no framework imports, no module-level mutable state — safe to import from RSC, actions and vitest alike.»

**Zod field bounds pattern** (`lib/device-schema.ts` lines 156–165):
```ts
const CommonFields = {
  model: z.string().min(1).max(200),
  ...
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ...
}
```
Copy for movement fields: `comment: z.string().max(500).optional()` and `occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` + a server-side `.refine(d => !isFuture(d))` (E-01; copy «Дата не может быть в будущем»). `eventType` is NEVER in any client schema — each action hardcodes it (RESEARCH C2).

---

### `lib/photos.ts` (utility, file-I/O + transform)

**Analog (convention only):** `lib/ru.ts` lines 1–3 — «Pure named exports over Node built-ins only… no framework imports, no side effects, safe to import from RSC, client components and vitest alike.» `lib/photos.ts` follows this except it owns `node:fs/promises` + `sharp` (server-only by usage, but no `next/*` imports — keeps it vitest-runnable).

**No in-repo analog for the sharp pipeline.** Use RESEARCH Pattern C5 verbatim (verified executed against sharp 0.35.4): `processPhoto(input)` = `sharp(input).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:80})`, same at 400px for thumb; default output strips all EXIF/GPS/ICC; garbage input throws (map to Russian 415 copy). Also home here: `UPLOADS_DIR` resolution (env, default `./data/uploads` — match the `DATABASE_PATH`/`DATA_DIR` convention in `db/index.ts`), `storageKeyOf(deviceId, uuid)`, and the single `thumbKeyOf(storageKey)` helper (`<uuid>.thumb.jpg`; Pitfall 8 — derive in ONE place, schema has a single `storageKey` column and no migrations are possible).

---

### `app/(app)/devices/actions.ts` (MODIFY — controller, request-response)

**Analog:** itself (lines 1–33 are the contract to extend) + `app/(app)/employees/actions.ts` for the minimal single-purpose action shape.

**Imports + guard-first contract** (`app/(app)/devices/actions.ts` lines 1–33):
```ts
'use server'

import { z } from 'zod'
import { refresh } from 'next/cache'
import { requireSession } from '@/lib/auth'
import { createDevice, getDevice, updateDevice, ... } from '@/db/queries/devices'
import { deviceSaveSchema, ... } from '@/lib/device-schema'

// Server Actions are directly POST-able — the proxy perimeter does not cover
// them — so requireSession() is the FIRST line of every action (T-03-01).

const SAVE_ERROR = 'Не удалось сохранить. Попробуйте ещё раз.'
const IdSchema = z.coerce.number().int().positive()
```
The 6 new custody actions copy: `await requireSession()` first line → zod whitelist (`deviceId`, `employeeId?`, `comment ≤500`, `occurredAt`) → queries call in try/catch → `refresh()` → `{ ok: true }`. Guard rejection maps `MovementGuardError` to the dialog's specific copy (E-08), everything else to the generic string.

**Form state + echo values** (`app/(app)/devices/actions.ts` lines 53–61, 121–146):
```ts
export type DeviceFormState = {
  ok?: boolean
  error?: string
  fieldErrors?: DeviceFieldErrors
  // Echo of the submitted strings: React 19 resets an uncontrolled form after
  // every form action (success or failure), so failures carry the input back
  // to defaultValue — otherwise the user retypes everything on each error.
  values?: Record<string, string>
}
```
plus `echoValues(formData)` (lines 123–146) and `fieldErrorsOf` (lines 66–80, unmapped issue → generic error). All 6 custody dialogs reuse this `MovementFormState` shape (fields: comment/occurredAt/employeeId only).

**Minimal action skeleton** (`app/(app)/employees/actions.ts` lines 104–121 `setEmployeeArchivedAction`): requireSession → one zod schema (`ArchiveSchema` lines 32–36 shows enum-hidden-input handling) → try/catch → refresh → ok. This is the template for simple dialogs (from_repair needs only deviceId+comment+date).

---

### `app/(app)/employees/actions.ts` (MODIFY — controller)

**Analog:** itself + `app/(app)/devices/actions.ts`. Add `returnAllDevicesAction` (requireSession → zod `{id}` → `returnAllDevices(id, occurredAt)` → `refresh()` → ok; C3 returns count, action discards it) AND apply the echo-values fix: grep confirms this file has NO `values` echo today (its `EmployeeFormState`, lines 38–42, lacks `values`) while the known-issue fix is `app/(app)/devices/actions.ts` lines 53–61 + 121–146 — port `values?: Record<string, string>` + `echoValues()` onto the create/update actions.

---

### `app/(app)/devices/(card)/devices/[id]/movement-dialogs.tsx` (component, client island)

**Analog 1:** `app/(app)/employees/archive-confirm-dialog.tsx` — the confirm-dialog shape (dispose, and the WR-01 split). **Analog 2:** `app/(app)/devices/device-dialog.tsx` — the multi-field useActionState form.

**WR-01 wrapper/inner split** (`archive-confirm-dialog.tsx` lines 24–46):
```tsx
// WR-01: the wrapper below stays mounted (it owns the trigger and the open
// state), so `useActionState` must NOT live there — it would keep a failed
// submit's role=alert alive across close/reopen. This inner component owns
// the form + action state; the dialog portal unmounts its children once the
// close animation finishes, so every open session starts from a clean state.
function ArchiveConfirmForm({ employeeId, onDone }) {
  const [state, formAction, pending] = useActionState(setEmployeeArchivedAction, {})
  useEffect(() => { if (state.ok) onDone() }, [state, onDone])
```
Wrapper (lines 83–106): `const [open, setOpen] = useState(false)` + `const close = useCallback(() => setOpen(false), [])` + `DialogTrigger render={<Button …/>}`. ALL 6 movement dialogs follow this split. The dispose dialog additionally: red primary button — the only `#D70015` destructive context (E-03); note archive deliberately used neutral ink for a reversible action (lines 16–22 comment).

**Error copy rendering** (`archive-confirm-dialog.tsx` lines 50–54):
```tsx
{state.error ? (
  <p className="text-sm text-[#D70015]" role="alert">{state.error}</p>
) : null}
```

**Field + echo pattern** (`device-dialog.tsx` lines 106–130, 277–280, 430):
```tsx
<Input id={`device-${field.key}`} name={field.key} ... defaultValue={...}
  aria-invalid={error ? true : undefined} />
{error ? <p className={ERROR_CLASS}>{error}</p> : null}   // ERROR_CLASS = 'text-sm text-[#D70015]'
...
const valueFor = (key, fallback) => state.values?.[key] ?? (fallback ?? undefined)
```
`defaultValue={state.values?.comment ?? …}` on every controlled-by-echo input. Date input gets `max={todayLocal}` (client convenience; server refine is authoritative — RESEARCH C7 / Pitfall 5; build local `yyyy-mm-dd`, never `toISOString().slice(0,10)`).

**Employee picker (combobox re-parametrized)** (`employee-dialog.tsx` lines 124–168): `Combobox items={comboItems} filter={null} autoHighlight …` + `<input type="hidden" name="departmentName" value={query} />` carrying the value to the action + empty-list hint `<p className="px-3 py-2 text-sm text-ink-secondary">…</p>`. For assign/transfer: items = active employees `{id, name}`, NO pinned create row, `ComboboxEmpty`-equivalent copy «Нет активных сотрудников…» (04-UI-SPEC); hidden input carries `employeeId`.

---

### `app/(app)/devices/(card)/devices/[id]/timeline.tsx` (component, RSC)

**Analog:** `app/(app)/(card)/devices/[id]/page.tsx` card recipe — the section/row primitives to reuse.

**FieldGroup / FieldRow / Value** (lines 110–144):
```tsx
function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
      <div className="mt-3 divide-y divide-hairline rounded-2xl bg-white shadow-sm ring-1 ring-hairline">
        {children}
      </div>
    </section>
  )
}
```
Timeline section replaces the placeholder `<FieldGroup title="История перемещений"><PlaceholderRow>…</PlaceholderRow></FieldGroup>` (lines 273–275). Missing values render as secondary-ink dash (lines 139–144 `Value` — the «—» rule of 04-UI-SPEC for absent from/to names and comments).

**RU datetime formatter** (lines 29–38): module-level `new Intl.DateTimeFormat('ru-RU', …)` — one instance per process. For occurredAt use the shared formatter family with an explicit `timeZone` decision (RESEARCH C7 / Pitfall 9 — do NOT reuse the card's `timeZone: 'UTC'` date formatter for real-moment times). Data comes from `listMovements(deviceId)` (C4); first row gets the highlighted dot (`bg-ink-secondary`).

---

### `app/(app)/devices/(card)/devices/[id]/photo-section.tsx` (component, client island, file-I/O)

**Analog (island shape):** `device-dialog.tsx` — `'use client'`, trigger + dialog from `@/components/ui/dialog`, module-level helper components, flat serializable props (page passes rows as plain snapshots, lines 50–73 `dialogDeviceOf`).

**No in-repo analog for fetch+resize+refresh.** Use RESEARCH Pattern C5 client code verbatim: `resizeToJpeg(file, 1600)` via `createImageBitmap` + canvas + `toBlob('image/jpeg', 0.85)`; sequential `fetch(url, { method:'POST', body: formData })` per file; success → `router.refresh()` (from `next/navigation` — Next-16-verified); failure → «Не удалось загрузить фото. Попробуйте ещё раз.» with `role=alert`. Lightbox + delete confirm reuse the Dialog primitives exactly as `archive-confirm-dialog.tsx` does; add-tile hidden at 8/8 (E-05; server re-checks the cap). Plain `<img loading="lazy">` (no `next/image` — RESEARCH decision).

---

### `app/api/devices/[id]/photos/route.ts` + `[attachmentId]/route.ts` (route handlers, file-I/O)

**Analog:** `app/api/health/route.ts` (the ONLY route handler in the repo — the whole convention):
```ts
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'

// Deliberately BEHIND the perimeter: exists as the curl target proving that
// api/* is gated like every other route (PITFALLS Pitfall 1).
export async function GET() {
  await requireSession()
  return NextResponse.json({ ok: true })
}
```
Take from it: `requireSession()` is the FIRST line of every exported method (route handlers are direct-POST-able like actions — research Project-Constraints row). Everything else is new — RESEARCH supplies the verified shapes: Next 16 `params` is a Promise (`{ params }: { params: Promise<{ id: string; attachmentId: string }> }`, `await params`, then `IdSchema.safeParse` → 404/400 exactly like the card pages' lines 27 + 173–177); POST pipeline order C5 steps 1–6 (device exists AND not disposed → cap re-check → formData ≤10MB → sharp metadata gate → write files → `db.transaction` INSERT; unlink both files on any later failure); GET serving response:
```ts
new Response(new Uint8Array(buf), { headers: {
  'Content-Type': row.mimeType ?? 'image/jpeg',
  'Content-Length': String(buf.length),
  'Cache-Control': 'private, max-age=31536000, immutable',
  'X-Content-Type-Options': 'nosniff',
  'Content-Disposition': 'inline',
} })
```
IDOR: row must match BOTH path ids; containment: resolved path asserted under `UPLOADS_DIR` via `path.relative`. DELETE = same guards → delete row → unlink full+thumb (ENOENT tolerated), NO movement event (E-05). Client does `router.refresh()` after both.

---

### `app/(app)/(card)/devices/[id]/page.tsx` (MODIFY — RSC page)

**Analog:** itself. Keep lines 27 (`IdSchema`), 172 (`await requireSession()` first), 174–177 (parse → notFound). Replace the two placeholders (lines 273–278) with: status-driven action row (E-08 matrix: hide «Выдать» when assigned; nothing but «Редактировать» when disposed) mounting `movement-dialogs.tsx`; timeline fed by `listMovements`; photo section fed by attachment list + count. New data (active employees for pickers) comes via props to client islands as flat serializable snapshots (lines 50–73 `dialogDeviceOf` is the recipe — Dates → strings, no rows).

### `app/(app)/(card)/employees/[id]/page.tsx` (MODIFY — RSC page)

**Analog:** itself. Existing pieces to reuse: inline server-action wrapper (lines 25–28 `async function unarchiveEmployee(formData) { 'use server'; … }` — same trick for any direct submit), action-row layout (lines 66–95), the issued-devices section shell (lines 97–106 — replace «Пока ничего не выдано» with the issued list from C6 queries + «Вернуть всю технику» confirm dialog shaped like `archive-confirm-dialog.tsx`; button visible when count ≥ 1, RESEARCH A6).

---

### `tests/movements-queries.test.ts` + `tests/attachments-queries.test.ts` (test)

**Analog:** `tests/devices-queries.test.ts` lines 12–25 — the temp-DB bootstrap is MANDATORY ordering:
```ts
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-devices-'))
process.env.DATABASE_PATH = join(tmpDir, 'devices.db')

const { db } = await import('@/db')          // dynamic import AFTER env is set
applyMigrations(db.$client)
const queries = await import('@/db/queries/devices')
```
plus `afterAll(() => { db.$client.close(); rmSync(tmpDir, { recursive: true, force: true }) })`. Assertion style: raw SQL reads via `db.$client.prepare('SELECT * …')` (lines 27–45), thrown-value capture `try { … } catch (e) { thrown = e }` + `expect(thrown).toEqual({ code: … })` (lines 67–76), module-perimeter assertions (lines 264–268: no delete path exposed). Reuse `tests/helpers.ts`: `createTempDb()` (lines 8–18, WAL/FK/busy_timeout pragmas), `applyMigrations()` (26–46), `insertDevice()` (48–65 — extend overrides for `status`/`currentEmployeeId` seeding). Append-only trigger test exists in `tests/schema.test.ts`. Sharp tests run in plain node env — synthesize inputs with `sharp({ create: {...} }).jpeg().withMetadata({ orientation: 6 })` (RESEARCH, verified technique); temp upload dirs via `mkdtempSync` and cleaned in `afterAll`.

### `scripts/smoke-custody.mjs` (optional, test)

**Analog:** `scripts/smoke-devices.mjs` (whole file is the template): temp DB + migration + probe rows (lines 60–74), one-shot `AUTH_SECRET` (77), `next start` spawn on a dedicated port (81–94), readiness poll of `/login` (96–113), no-cookie 307→/login perimeter assert (115–123), jose cookie minting identical to `lib/session.ts` (125–132), cookie'd fetch + HTML needle asserts (134–157), cleanup in `finally` with SIGTERM→SIGKILL (259–274). For phase 4: add photo-route asserts — `POST /api/devices/<id>/photos` without cookie → 401/redirect, with cookie → 200; card HTML needles replace the placeholder strings «Здесь появится история выдач и возвратов.» / «Здесь появятся фотографии устройства.» once this phase ships (smoke-devices.mjs lines 217–221 will need updating in the same phase or the smoke breaks).

## Shared Patterns

### Session guard (first line, everywhere)
**Source:** `lib/auth.ts` lines 10–15
```ts
export const requireSession = cache(async () => {
  const cookieStore = await cookies()
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value)
  if (!session) redirect('/login')
  return session
})
```
**Apply to:** all 6 custody actions, return-all action, all photo route handlers (GET/POST/DELETE), both card pages already have it.

### Error handling: generic Russian string leaves the server
**Source:** `app/(app)/devices/actions.ts` lines 30, 66–80, 97–114; `db/queries/devices.ts` lines 69–83
**Apply to:** every action and route handler. Actions return `{ error: SAVE_ERROR }` or `{ fieldErrors: … }`; queries rethrow `{ code: '…' }`-style markers (new: `MovementGuardError` → per-dialog copy); internal sharp/fs errors are never echoed (V7), `console.error` server-side only.

### Zod whitelist before any DB/disk access
**Source:** `lib/device-schema.ts` lines 156–188 (schema construction), `app/(app)/devices/actions.ts` lines 32, 254–272 (usage)
**Apply to:** all new actions + route handlers; URL ids via `z.coerce.number().int().positive()` then `notFound()`/400; `eventType` hardcoded per action, never parsed from input.

### Atomicity via db.transaction
**Source:** `db/queries/employees.ts` lines 28–29, 130–149
**Apply to:** every custody transition (guard UPDATE + event INSERT, RESEARCH C1), return-all (C3), photo cap re-check + attachments INSERT (C5 step 5).

### Post-mutation re-render
**Source:** `app/(app)/devices/actions.ts` line 246 (`refresh()`), RESEARCH verified `router.refresh()` from `next/navigation`
**Apply to:** actions end with `refresh()`; photo upload/delete fetches end with `router.refresh()` client-side. Without it the card/list stays stale.

### Purity boundaries
**Source:** `db/queries/devices.ts` lines 1–9, `lib/ru.ts` lines 1–3, `lib/device-schema.ts` lines 8–12
**Apply to:** `db/queries/movements.ts`, `db/queries/attachments.ts`, `lib/photos.ts`, `lib/movement-schema.ts` — zero framework imports so vitest runs them directly (Wave-0 requirement).

### Confirm-dialog + form-reset discipline
**Source:** `archive-confirm-dialog.tsx` (WR-01 split, lines 24–46), `device-dialog.tsx` echo (`state.values`), commit-4886f6a pattern
**Apply to:** all 6 custody dialogs, return-all dialog, photo delete confirm; also port echo values onto `app/(app)/employees/actions.ts` (known 03-UAT issue, in scope per CONTEXT).

### RU text conventions
**Source:** `lib/ru.ts` (`pluralDevices` lines 34–37, `ruCollator` line 41), `db/queries/employees.ts` line 34 (`ruSortKey`), card page line 33 (module-level Intl formatters)
**Apply to:** timeline meta («03.09.2026, 15:53»), «выдано {дата}», issued-list ordering, photo-count labels; one shared occurredAt formatter with explicit TZ decision (Pitfall 9).

## No Analog Found

| File | Role | Data Flow | Reason | Substitute |
|------|------|-----------|--------|------------|
| `lib/photos.ts` (sharp pipeline) | utility | file-I/O + transform | No image processing anywhere in repo | RESEARCH.md Pattern C5 (executed verbatim this session against sharp 0.35.4) |
| `photo-section.tsx` (resize + fetch + refresh loop) | component | file-I/O | No client binary-upload code exists | RESEARCH.md Pattern C5 client block (MDN-verified semantics) |
| `app/api/devices/[id]/photos/*` (serve/delete/binary Response) | route handler | file-I/O | `app/api/health/route.ts` is JSON-only; no binary/disk route exists | RESEARCH.md C5 serving/DELETE blocks + health route's guard-first convention |
| `db/queries/movements.ts` timeline (`alias()` double-join) | model | read | No query in repo uses `alias()` | RESEARCH.md Pattern C4 (verified executed) |

## Metadata

**Analog search scope:** `db/queries/`, `app/(app)/**`, `app/api/`, `lib/`, `components/ui/`, `tests/`, `scripts/`
**Files read in full or in part:** 16 (devices.ts, employees.ts, actions ×2, device-dialog.tsx, archive-confirm-dialog.tsx, employee-dialog.tsx, device-schema.ts, ru.ts, auth.ts, schema.ts, health/route.ts, card pages ×2, helpers.ts, devices-queries.test.ts, smoke-devices.mjs, combobox.tsx)
**Pattern extraction date:** 2026-09-03
**Binding contracts honored:** E-01…E-08 (04-CONTEXT.md), 04-UI-SPEC.md copy/matrix, frozen migration (no `drizzle-kit push/generate`), sharp 0.35.4 pending `checkpoint:human-verify`
