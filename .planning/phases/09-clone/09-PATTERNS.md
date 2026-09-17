# Phase 9: Клон устройства - Pattern Map

**Mapped:** 2026-09-16
**Files analyzed:** 13 (6 new, 5 modified, 2 explicitly unchanged but binding)
**Analogs found:** 13 / 13 (2 partial — runner logic and generated migration have no full in-repo precedent; RESEARCH.md Patterns 1–2 are authoritative there)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `db/schema.ts` (modify: −`.notNull()` ×2) | model | CRUD | itself — `inventoryNumber`/`inventoryNormalized` nullable pair, lines 70–72 | exact (in-file) |
| `drizzle/0001_*.sql` + `drizzle/meta/*` (new, GENERATED — не править руками) | migration | schema | `drizzle/0000_amusing_talon.sql` + `drizzle/meta/_journal.json` | generated-artifact (content = drizzle-kit generate; RESEARCH Pattern 1) |
| `scripts/migrate.mjs` (new) | utility (host-side script) | file-I/O | `scripts/backup.mjs` (script conventions) + `tests/helpers.ts` §applyMigrations | role-match (FK-OFF-before-BEGIN logic — RESEARCH Pattern 2, no full in-repo precedent) |
| `db/queries/devices.ts` (modify: +`cloneDevices`) | service (query layer) | CRUD / batch transaction | `db/queries/movements.ts` §returnAllDevices (N-writes-in-one-tx) + in-file `createDevice` | exact |
| `lib/inventory-increment.ts` (new) | utility (pure) | transform | `lib/normalize.mjs` (pure ESM lib) | exact |
| `app/(app)/devices/actions.ts` (modify: +`cloneDeviceAction`) | controller (server action) | request-response | in-file `createDeviceAction` (lines 232–258) + `uniqueFieldError` | exact |
| `app/(app)/devices/clone-dialog.tsx` (new) | component (client dialog) | request-response | `app/(app)/devices/movement-dialogs.tsx` (AssignDialog/AcceptDialogForm) | exact |
| `app/(app)/(card)/devices/[id]/page.tsx` (modify: кнопка в ряду действий) | controller (RSC page) | request-response | itself — action row, lines 243–257 | exact (in-file insertion point) |
| `tests/inventory-increment.test.ts` (new) | test (unit, pure) | transform | `tests/normalize.test.ts` | exact |
| `tests/clone-queries.test.ts` (new) | test (unit, temp db) | CRUD | `tests/devices-queries.test.ts` (setup) + `tests/helpers.ts` fixtures | exact |
| `tests/schema.test.ts` (modify: +nullable serial / NULL-пары) | test (migration) | schema | itself — «allows multiple NULL inventory_normalized…», lines 57–73 | exact (зеркало) |
| `README.md` + `scripts/deploy.sh` (modify: шаг миграции → runner; решает план) | config/docs | — | README.md:23,132,159,192 (текущий `npx drizzle-kit migrate`) | role-match |
| `lib/device-schema.ts` (**NO CHANGES**, D-08) | model (zod keystone) | — | — | reference only: `CommonFields.serialNumber min(1)` (line 174) остаётся для ручной формы |

---

## Pattern Assignments

### `db/queries/devices.ts` +`cloneDevices()` (service, batch CRUD transaction)

**Analog (transaction skeleton):** `db/queries/movements.ts`
**Analog (row shape + collision mapping):** `db/queries/devices.ts` in-file

**Tx type derivation** (movements.ts lines 18–19) — copy verbatim (или вынести в общий импорт, если план решит):
```ts
type DbHandle = typeof db
type Tx = Parameters<Parameters<DbHandle['transaction']>[0]>[0]
```

**Module contract header** (both query files open with this discipline — devices.ts lines 22–24):
```ts
// Device data-access (REG-01/REG-02). Pure sync functions over the module-level
// db — no framework imports at all: Server Actions add session + zod on top,
// vitest imports this module directly against a temp database.
```

**N-writes-in-one-transaction pattern** (movements.ts `returnAllDevices` lines 315–351 — ближайший «много записей, всё или ничего» прецедент):
```ts
export function returnAllDevices(employeeId: number, event: EventInput = {}): number {
  return db.transaction((tx) => {
    const rows = tx.select({ id: devices.id }).from(devices).where(...).orderBy(asc(devices.id)).all()
    for (const d of rows) {
      tx.insert(movements).values({...}).run()
      tx.update(devices).set({...}).where(...).run()
    }
    return rows.length
  })
}
```
`cloneDevices` — тот же каркас, но `tx.insert(devices)` ×N через `.map(...)` и `.returning({ id: devices.id }).get()!.id` (как в `createDevice`, строки 557–558).

**Row creation + NULL-pair + collision mapping** (devices.ts `createDevice` lines 534–562):
```ts
export function createDevice(input: { typeKey: DeviceTypeKey } & DeviceInput): number {
  try {
    return db.insert(devices).values({
      typeKey: input.typeKey,
      model: input.model,
      serialNumber: input.serialNumber,
      serialNormalized: normalizeSerial(input.serialNumber),
      ...inventoryPair(input.inventoryNumber),   // ← клон переиспользует; для клонов serial-пара = null/null напрямую
      purchaseDate: input.purchaseDate, purchasePrice: input.purchasePrice,
      supplier: input.supplier, warrantyUntil: input.warrantyUntil, notes: input.notes,
      ramGb: input.ramGb ?? null, ramUpgraded: input.ramUpgraded ?? null, ssdGb: input.ssdGb ?? null,
      screenDiagonal: input.screenDiagonal ?? null, panelType: input.panelType ?? null,
      portCount: input.portCount ?? null, peripheralKind: input.peripheralKind ?? null,
    }).returning({ id: devices.id }).get()!.id
  } catch (e) { throw uniqueCodeOf(e) }
}
```

**`inventoryPair` — falsy → NULL/NULL** (devices.ts lines 159–166; Pitfall 5 фазы 3; клон обязан вызывать ЕГО, не собирать значения вручную):
```ts
function inventoryPair(inventoryNumber: string | null) {
  return {
    inventoryNumber,
    inventoryNormalized: inventoryNumber ? normalizeInventory(inventoryNumber) : null,
  }
}
```

**`uniqueCodeOf` — SQLITE_CONSTRAINT_UNIQUE → { code }** (devices.ts lines 140–154):
```ts
function uniqueCodeOf(e: unknown): unknown {
  if (e !== null && typeof e === 'object' &&
      (e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
    const message = e instanceof Error ? e.message : ''
    return {
      code: message.includes('inventory_normalized') ? 'inventoryNormalized' : 'serialNormalized',
    }
  }
  return e
}
```
В клоне: `try { … } catch (e) { throw uniqueCodeOf(e) }` — откат транзакции происходит автоматически при throw внутри `db.transaction` (better-sqlite3 sync).

**Status/holder — никогда из payload** (прецедент T-04-02; movements.ts guard-комментарии, строки 10–16; клон хардкодит `status: 'in_stock'`, `currentEmployeeId` не пишет):
```ts
// Every custody transition is ONE sync transaction (RESEARCH C1): … eventType is hardcoded
// per function, never taken from a caller-supplied payload …
```

---

### `lib/inventory-increment.ts` (new utility, pure transform)

**Analog:** `lib/normalize.mjs` (весь файл — 31 строка) + `lib/ru.ts` header convention

**Pure-lib conventions** (normalize.mjs lines 1–4):
```js
// Single source of number normalization (Pitfall 5: normalize on write AND on
// search). Plain ESM (.mjs) so both the app and scripts/*.mjs import it without
// a build step.
```
lib/ru.ts lines 1–3 (клиент-безопасный вариант):
```ts
// Russian UI text helpers (UI-01). Pure named exports over Node built-ins
// only — same convention as lib/normalize.ts: no framework imports, no side
// effects, safe to import from RSC, client components and vitest alike.
```
Новая функция должна быть **client-safe** (UI-SPEC: клиент считает префилл из пропса) и **server-authoritative** (сервер сворачивает последовательность N−1 раз — RESEARCH Pitfall 7). Тело функции — RESEARCH Pattern 4 (probe-верифицированный код в 09-RESEARCH.md §Pattern 4); файл кладётся в `lib/` как чистая функция на RAW-значении (не normalized — Pitfall 4).

**Plural-хелпер для линии успеха** (lib/ru.ts lines 34–37, уже существует — реюз, не писать новый):
```ts
export function pluralDevices(n: number): string {
  const word = DEVICE_FORMS[pluralRules.select(n)]
  return `${n} ${word}`
}
```

---

### `app/(app)/devices/actions.ts` +`cloneDeviceAction` (controller, request-response)

**Analog:** in-file `createDeviceAction` (lines 232–258) и инфраструктура того же файла

**Action header contract** (lines 30–38 — комментировать новый экшен теми же терминами T-03-01/T-03-02):
```ts
// Server Actions are directly POST-able — the proxy perimeter does not cover
// them — so requireSession() is the FIRST line of every action (T-03-01).
// Inputs are whitelisted through zod (T-03-02): raw FormData is never spread
// into SQL values. Only the generic Russian failure string leaves the action
// (V7); field-level errors come from the UI-SPEC copy table.
```

**Полный контракт экшена** (createDeviceAction lines 232–258 — cloneDeviceAction повторяет: requireSession → echo → safeParse → try/query → catch uniqueFieldError → refresh → ok):
```ts
export async function createDeviceAction(
  _prev: unknown,
  formData: FormData,
): Promise<DeviceFormState> {
  await requireSession()
  const typeKeyRaw = formData.get('typeKey')
  const typeKey = typeof typeKeyRaw === 'string' ? typeKeyRaw : ''
  const values = echoValues(formData)
  if (!isDeviceTypeKey(typeKey)) {
    return { fieldErrors: { typeKey: 'Выберите тип устройства' }, values }
  }
  const parsed = deviceSaveSchema(typeKey).safeParse({
    ...commonPayload(formData),
    ...typedPayload(typeKey, formData),
  })
  if (!parsed.success) return { ...fieldErrorsOf(parsed.error), values }
  try {
    createDevice({ typeKey, ...deviceInputOf(parsed.data) })
  } catch (e) {
    return { ...uniqueFieldError(e), values }
  }
  // Without refresh() the route is NOT re-rendered in the action response
  // (Pitfall 1) — the new device would not appear until a manual reload.
  refresh()
  return { ok: true }
}
```

**id-coercion schema** (line 42; для `deviceId` клона):
```ts
const IdSchema = z.coerce.number().int().positive()
```

**Unique collision → field copy** (`uniqueFieldError` lines 107–124; клон-коллизия мапится в inventoryNumber-ветку, копия байт-в-байт):
```ts
function uniqueFieldError(e: unknown): DeviceFormState {
  const code = (e as { code?: string } | undefined)?.code
  if (code === 'serialNormalized') {
    return { fieldErrors: { serialNumber: 'Устройство с таким серийным номером уже есть' } }
  }
  if (code === 'inventoryNormalized') {
    return { fieldErrors: { inventoryNumber: 'Устройство с таким инвентарным номером уже есть' } }
  }
  return { error: SAVE_ERROR }
}
```

**'' → undefined до query-слоя** (`commonPayload` lines 161–178, ключевые строки 162/171 — Pitfall 5 этой фазы):
```ts
function commonPayload(formData: FormData) {
  const inventory = textOf(formData, 'inventoryNumber')
  …
  return {
    …
    inventoryNumber: inventory === '' ? undefined : inventory,
    …
  }
}
```

**echo-values (React 19 reset, 4886f6a)** (state shape lines 63–71, echo-хелпер lines 131–156; для клона — 2 ключа `count`, `inventoryNumber`):
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

**Unknown-id guard → generic error** (`updateDeviceAction` lines 265–268; для клона `getDevice` без результата = CLONE_ERROR, не 500):
```ts
const idParsed = IdSchema.safeParse(formData.get('id'))
if (!idParsed.success) return { error: SAVE_ERROR }
const existing = getDevice(idParsed.data)
if (!existing) return { error: SAVE_ERROR, values: echoValues(formData) }
```

**zod-белый список клона** — 3 поля (deviceId int+, count int 1..100 — D-03, inventoryNumber ≤80 optional); строгий `z.strictObject`-дисциплин из `lib/device-schema.ts` lines 187–192:
```ts
export function deviceSaveSchema(typeKey: DeviceTypeKey) {
  return z.strictObject({
    ...CommonFields,
    ...buildZodSchema(typeKey).shape,
  })
}
```
(lib/device-schema.ts line 174 `serialNumber: z.string().min(1).max(100)` НЕ ослабляется — D-08; схема клона живёт в actions.ts, там же где `movementSchemas` подключены к movement-экшенам.)

---

### `app/(app)/devices/clone-dialog.tsx` (new component, client dialog)

**Analog:** `app/(app)/devices/movement-dialogs.tsx` — третий «дIALOG-family installation», механика байт-в-байт

**Imports + class constants** (lines 1–16, 55–57):
```tsx
'use client'
import { useActionState, useCallback, useEffect, useState } from 'react'
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
…
const CONTROL_CLASS = 'h-10 px-3 text-base md:text-base'
const ERROR_CLASS = 'text-sm text-[#D70015]'
const HINT_CLASS = 'text-sm text-ink-secondary'
```

**WR-01 split: useCloseOnOk** (lines 232–236 — сигнатура для клона меняется на `(state, onDone(created))`, UI-SPEC Default 12):
```tsx
// Stable ok-effect shared by every dialog form (device-dialog precedent).
function useCloseOnOk(state: MovementFormState, onDone: () => void) {
  useEffect(() => {
    if (state.ok) onDone()
  }, [state, onDone])
}
```

**Footer: dismiss + pending-aware primary** (`DialogActions` lines 212–229):
```tsx
function DialogActions({ pendingCopy, label, pending }: { pendingCopy: string; label: string; pending: boolean }) {
  return (
    <DialogFooter>
      <DialogClose render={<Button variant="secondary" />}>Отмена</DialogClose>
      <Button type="submit" disabled={pending}>
        {pending ? pendingCopy : label}
      </Button>
    </DialogFooter>
  )
}
```

**Форма: hidden id + hint + field errors + form error** (`AcceptDialogForm` lines 304–331; hint-прецедент line 316 — «Устройство вернётся на склад.» = паттерн для transparency-hint клона):
```tsx
function AcceptDialogForm({ deviceId, onDone }: { deviceId: number; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(acceptDeviceAction, {})
  useCloseOnOk(state, onDone)
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="deviceId" value={deviceId} />
      <p className={HINT_CLASS}>Устройство вернётся на склад.</p>
      …
      {state.error ? (
        <p className={ERROR_CLASS} role="alert">{state.error}</p>
      ) : null}
      <DialogActions pendingCopy="Приём…" label="Принять" pending={pending} />
    </form>
  )
}
```

**Обёртка: open state + trigger render + data-needle + DialogContent** (`AcceptDialog` lines 333–349; secondary-вариант триггера line 338; `data-device-accept-id` = прецедент smoke-иглы для `data-device-clone-id`):
```tsx
export function AcceptDialog({ deviceId }: { deviceId: number }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="xl" data-device-accept-id={deviceId} />}>
        Принять
      </DialogTrigger>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>Принять на склад</DialogTitle>
        </DialogHeader>
        {/* Portal-mounted: WR-01 clean state per dialog session. */}
        <AcceptDialogForm deviceId={deviceId} onDone={close} />
      </DialogContent>
    </Dialog>
  )
}
```
Единственные управляемые отличия клона: (1) триггер-текст «Дублировать» и `data-device-clone-id`; (2) `onDone(created: number)` прокидывает count наверх — обёртка держит линию успеха `mt-2 text-sm text-ink` + `data-clone-created={n}` под рядом (линия принадлежит обёртке, т.к. она остаётся смонтированной); (3) очистка линии при следующем открытии (в `setOpen(true)`-ветке `onOpenChange`).

**Инвентарный input: mono + maxLength 80 + placeholder** (`device-dialog.tsx` lines 384–400 — байт-паритет для поля клона, плюс `defaultValue={suggested}` вместо echo):
```tsx
<Label htmlFor="device-inventoryNumber">Инвентарный номер</Label>
<Input
  id="device-inventoryNumber"
  name="inventoryNumber"
  type="text"
  autoComplete="off"
  maxLength={80}
  placeholder="Из 1С, если присвоен"
  defaultValue={echo('inventoryNumber', device?.inventoryNumber)}
  className={`${CONTROL_CLASS} font-mono`}
  aria-invalid={state.fieldErrors?.inventoryNumber ? true : undefined}
/>
```

**Количество input: числовой рецепт** (`device-dialog.tsx` «Стоимость» lines 453–470 + `max`/`w-24` из UI-SPEC Default 5):
```tsx
<Input
  id="device-purchasePrice"
  name="purchasePrice"
  type="number"
  inputMode="numeric"
  min={0}
  step={1}
  autoComplete="off"
  defaultValue={…}
  className={CONTROL_CLASS}
/>
```

---

### `app/(app)/(card)/devices/[id]/page.tsx` (modify — кнопка в ряду действий)

**Analog:** in-file action row (lines 243–257) — точка вставки `CloneDialog` МЕЖДУ `DeviceDialog` и `DeviceActions` (UI-SPEC resolution #1: «Редактировать» → «Дублировать» → custody → «Списать» последним внутри матрицы):
```tsx
{device.status !== 'disposed' ? (
  <div className="mt-6 flex flex-wrap gap-2">
    <DeviceDialog
      label="Редактировать"
      typeConfigs={DEVICE_TYPES}
      device={dialogDeviceOf(device)}
    />
    {/* CloneDialog монтируется здесь — статус-независимо для всех не-disposed */}
    <DeviceActions
      deviceId={device.id}
      status={device.status}
      holderName={device.holder}
      employees={listActiveEmployees()}
    />
  </div>
) : null}
```
Весь ряд уже скрыт для `disposed` (line 243) — «Дублировать» наследует скрытие (A1), ноль новых условий.

**Flat-serializable-props паттерн** (`dialogDeviceOf` lines 64–84 — CloneDialog получает `deviceId: number` + `inventoryNumber: string | null` в том же духе; UI-SPEC: RAW, never normalized — Pitfall 4):
```tsx
// The client edit island gets a flat serializable snapshot (vercel
// server-serialization): Dates become yyyy-mm-dd strings, no Date objects, no
// query rows.
function dialogDeviceOf(device: DeviceRow): DeviceDialogDevice { … }
```

---

### `db/schema.ts` (modify — serial → nullable)

**Analog:** in-file nullable-pair прецедент `inventoryNumber`/`inventoryNormalized` (lines 70–72) + существующий UNIQUE (lines 96–98):
```ts
serialNumber: text('serial_number').notNull(),           // ← снять .notNull()
// D-17: normalized (upper case, collapsed spaces, homoglyphs mapped) — written by app code
serialNormalized: text('serial_normalized').notNull(),   // ← снять .notNull()
// D-16: inventory number is manual only, assigned by 1C — nullable until entered
inventoryNumber: text('inventory_number'),
inventoryNormalized: text('inventory_normalized'),
…
(t) => [
  uniqueIndex('devices_serial_norm_uq').on(t.serialNormalized), // D-17 — НЕ трогать:
  // обычный UNIQUE на nullable-колонке уже допускает N NULL-строк (RESEARCH Pattern 1, probe)
  uniqueIndex('devices_inventory_norm_uq').on(t.inventoryNormalized), // D-17
  …
]
```
Diff строго: две строки теряют `.notNull()`; индексы/CHECK/триггеры не трогаются.

---

### `drizzle/0001_*.sql` + `drizzle/meta/*` (new, GENERATED)

**Analog:** `drizzle/0000_amusing_talon.sql` + `drizzle/meta/_journal.json` (формат)
Journal entries shape (файл читает runner):
```json
{ "idx": 0, "version": "6", "when": 1788200628830, "tag": "0000_amusing_talon", "breakpoints": true }
```
Контент 0001 получает ТОЛЬКО `npx drizzle-kit generate` (файл не править — Key Decision; анти-паттерн: PRAGMA-жонглирование в сгенерированном файле, RESEARCH Pitfall 2). Statement-сплит по `--> statement-breakpoint` — конвенция, видимая в `tests/helpers.ts` lines 39–45.

---

### `scripts/migrate.mjs` (new utility, host-side file-I/O)

**Analog (script conventions):** `scripts/backup.mjs`

**Заголовок-документация на русском + библиотечная функция + CLI-хвост** (backup.mjs lines 1–7 и хвост файла):
```js
// Ночной бэкап: консистентный снимок живой БД через online backup API …
import Database from 'better-sqlite3'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
…
// CLI-хвост: импорт из тестов не запускает бэкап, прямой запуск — запускает.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBackup().then(
    (r) => console.log(…),
    (err) => { console.error(err?.message ?? String(err)); process.exit(1) },
  )
}
```
**Pragmas живого соединения** (`db/index.ts` `openDb` lines 14–18 — runner повторяет journal_mode/busy_timeout, но FK OFF):
```ts
const sqlite = new Database(file)
sqlite.pragma('journal_mode = WAL') // persistent per-DB file; README-recommended
sqlite.pragma('foreign_keys = ON')  // SQLite default is OFF — per connection!
sqlite.pragma('busy_timeout = 5000')
```
**Statement-split конвенция** (`tests/helpers.ts` lines 39–45):
```ts
for (const file of files) {
  const sql = readFileSync(file, 'utf8')
  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim()
    if (trimmed) sqlite.exec(trimmed)
  }
}
```
Сам алгоритм раннера (PRAGMA foreign_keys=OFF ДО BEGIN → стейтменты → INSERT в `__drizzle_migrations` с `created_at = journal.when` → COMMIT → FK ON) — **нет полного прецедента в репо**: источник истины 09-RESEARCH.md §Pattern 2 (probe-верифицирован, 13 post-проверок). Ключевой факт: `drizzle-kit migrate` молча падает на заполненной базе (RESEARCH Pitfall 1) — потому раннер существует.

---

### `tests/inventory-increment.test.ts` (new test, pure)

**Analog:** `tests/normalize.test.ts` (весь файл) — describe/it над чистым lib-экспортом, без фикстур:
```ts
import { describe, expect, it } from 'vitest'
import { normalizeInventory, normalizeNumber, normalizeSerial } from '@/lib/normalize'

describe('normalizeNumber', () => {
  it('trims surrounding whitespace and upper-cases', () => {
    expect(normalizeNumber(' c123 ')).toBe('C123')
  })
  …
})
```
Матрица кейсов — D-02: паддинг (`AB-001`→`AB-002`), многозначные хвосты, перенос (`AB-099`→`AB-100`), не-числовой хвост (`ABC`→`''`), пустой/null оригинал, последовательность N−1 свёрток.

### `tests/clone-queries.test.ts` (new test, temp db + queries)

**Analog:** `tests/devices-queries.test.ts` (setup lines 1–38, base-input lines 40–49) — DATABASE_PATH до импорта @/db, динамические импорты, raw-row ассерты:
```ts
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-devices-'))
process.env.DATABASE_PATH = join(tmpDir, 'devices.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const queries = await import('@/db/queries/devices')
const { createDevice, updateDevice, getDevice, listDevices } = queries
…
afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

function rawDevice(id: number) {
  return db.$client.prepare('SELECT * FROM devices WHERE id = ?').get(id) as { … }
}

// Common input with only the mandatory fields — individual tests override.
const base = { model: 'Тестовая модель', serialNumber: 'SN-001', … }
```
Кейс-прецедент «UNIQUE surfaces as {code}» (lines 58–63 + createDevice normalized write lines 52–57). Для миграционных кейсов — `tests/schema.test.ts` + `tests/helpers.ts` (`createTempDb` lines 8–18, `applyMigrations` 26–46, `insertDevice` 48–65).

### `tests/schema.test.ts` (extend — nullable serial)

**Analog:** in-file — зеркалируемый тест NULL-пар inventory (lines 57–73):
```ts
it('allows multiple NULL inventory_normalized but rejects a duplicate non-null one', () => {
  const d = db()
  insertDevice(d, { serialNormalized: 'NULL-INV-1', inventoryNormalized: null })
  insertDevice(d, { serialNormalized: 'NULL-INV-2', inventoryNormalized: null })
  expect(() => insertDevice(d, { serialNormalized: 'INV-DUP-1', inventoryNormalized: 'ИБ-0000146' })).not.toThrow()
  expect(() => insertDevice(d, { serialNormalized: 'INV-DUP-2', inventoryNormalized: 'ИБ-0000146' })).toThrow(/UNIQUE constraint failed/)
})
```
Новые кейсы: обе serial-колонки nullable (`pragma_table_info` notnull=0 — RESEARCH Pitfall 1 приёмка), NULL-пары serial легальны, дубль непустого serial отклонён, данные/триггеры/CHECK целы после 0001 (зеркало строк 111–118 для триггеров).

---

## Shared Patterns

### requireSession() первым стейтментом (T-03-01)
**Source:** `app/(app)/devices/actions.ts` lines 30–38, 236
**Apply to:** `cloneDeviceAction`
```ts
await requireSession()
```

### Строгий zod-белый список; лишние ключи = tampering → reject (T-03-02)
**Source:** `lib/device-schema.ts` lines 187–192 (`z.strictObject`); actions.ts line 42 (`IdSchema`)
**Apply to:** клон-схема — ровно 3 поля: deviceId, count (1..100, D-03), inventoryNumber (≤80, optional); status/currentEmployeeId в схеме отсутствуют как класс.

### Echo values при ошибке (React 19 reset, 4886f6a)
**Source:** `app/(app)/devices/actions.ts` lines 63–71 (state shape), 131–156 (echoValues); `movement-dialogs.tsx` (defaultValue={echoValue})
**Apply to:** cloneDeviceAction (`values: {count, inventoryNumber}`) + CloneDialogForm (`defaultValue={state.values?.count ?? 1}`, `defaultValue={state.values?.inventoryNumber ?? suggested}`).

### UNIQUE-коллизия как бизнес-ошибка { code } → русская копия поля
**Source:** `db/queries/devices.ts` lines 140–154 (`uniqueCodeOf`) + `actions.ts` lines 107–124 (`uniqueFieldError`)
**Apply to:** cloneDevices (throw uniqueCodeOf) + cloneDeviceAction (return uniqueFieldError); коллизия инвентарника клона байт-в-байт «Устройство с таким инвентарным номером уже есть».

### NULL/NULL-пара для пустых нормализуемых значений (Pitfall 5)
**Source:** `db/queries/devices.ts` lines 159–166 (`inventoryPair`); тест-прецедент `tests/schema.test.ts` lines 57–73
**Apply to:** клон-вставки — serial null/null напрямую; inventory через inventoryPair; экшен мапит '' → undefined/null ДО query-слоя.

### db.transaction + тип Tx; auto-rollback при throw
**Source:** `db/queries/movements.ts` lines 18–19 (Tx), 315–351 (returnAllDevices), 96 (throw внутри tx)
**Apply to:** `cloneDevices` — всё-или-ничего пакет N вставок (SC 1, D-06).

### Status/holder — только query-слой, никогда из payload (T-04-02)
**Source:** `db/queries/movements.ts` lines 10–16 (модульный контракт), `actions.ts` lines 296–304
**Apply to:** cloneDevices хардкодит `status: 'in_stock'`, не пишет currentEmployeeId; D-05.

### refresh() после успешной мутации (Pitfall 1 фазы 3)
**Source:** `app/(app)/devices/actions.ts` lines 254–257
**Apply to:** cloneDeviceAction — иначе карточка/реестр не перерисуются.

### Диалоговая механика WR-01: обёртка держит open-state, форма внутри портала
**Source:** `movement-dialogs.tsx` lines 276–300 (AssignDialog), 304–331 (форма), 232–236 (useCloseOnOk), 212–229 (DialogActions), 55–57 (CONTROL/ERROR/HINT_CLASS)
**Apply to:** CloneDialog/CloneDialogForm — байт-паритет; отличия: onDone(created: number), линия успеха во wrapper, count/inventory поля.

### Client-safe pure lib без фреймворк-импортов
**Source:** `lib/normalize.mjs` lines 1–4; `lib/ru.ts` lines 1–3
**Apply to:** `lib/inventory-increment.ts` — импортируется и клиентом (префилл), и сервером (последовательность), и vitest.

### Хост-скрипт: docstring-шапка, библиотечные экспорты, CLI-хвост с exit 1
**Source:** `scripts/backup.mjs` (шапка lines 1–7; CLI-хвост в конце файла)
**Apply to:** `scripts/migrate.mjs`; плюс pragmas из `db/index.ts` lines 14–18 и statement-split из `tests/helpers.ts` lines 39–45.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `scripts/migrate.mjs` (алгоритм FK-OFF-before-BEGIN) | utility | file-I/O | Репо применяет миграции только через drizzle-kit (README) и statement-at-a-time в тестах; раннер с PRAGMA до BEGIN — новый артефакт. Частичные аналоги есть (backup.mjs, helpers.ts); сам алгоритм — RESEARCH.md §Pattern 2 (probe-верифицирован) |
| `drizzle/0001_*.sql` (контент) | migration | schema | Генерируется drizzle-kit'ом, не пишется руками; аналогом служит формат 0000, но содержимое — вывод `npx drizzle-kit generate` после schema-diff. Семантика NULL-пар — RESEARCH.md §Pattern 1 |

---

## Metadata

**Analog search scope:** `db/`, `db/queries/`, `lib/`, `app/(app)/devices/`, `app/(app)/(card)/devices/[id]/`, `tests/`, `scripts/`, `drizzle/`
**Files read in full or targeted:** 14 (schema.ts, db/index.ts, drizzle.config.ts, queries/devices.ts, queries/movements.ts, actions.ts, movement-dialogs.tsx, device-actions.tsx, device-dialog.tsx [targeted], devices/[id]/page.tsx, device-schema.ts, normalize.mjs, ru.ts, helpers.ts, schema.test.ts, devices-queries.test.ts [head], normalize.test.ts [head], backup.mjs [head+tail], _journal.json)
**Pattern extraction date:** 2026-09-16
**Binding decisions honored:** D-01 (не реюзнать device-dialog.tsx как форму — только механика), D-02 (одна pure-функция клиент+сервер), D-03 (N≤100), D-05/D-06 (без movements, транзакция), D-08 (lib/device-schema.ts без изменений; NULL пишет только query-слой)
