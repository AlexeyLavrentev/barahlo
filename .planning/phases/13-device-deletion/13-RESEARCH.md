# Phase 13: Удаление устройств - Research

**Researched:** 2026-09-28
**Domain:** Hard-delete of a device row + cascaded history/attachments (Next.js Server Actions, better-sqlite3/Drizzle one-tx mutations, photo files on disk, structural UI parity)
**Confidence:** HIGH — every load-bearing mechanic was either read directly from the codebase or probe-verified against the installed stack (better-sqlite3 13.0.3, drizzle-orm 0.45.2, next 16.3.3). No training-data claims below are load-bearing.

## Summary

Phase 13 adds ONE server mutation (hard device delete), ONE confirm dialog, and ONE new query function plus tests. The critical discovery is that the phase is mostly **already wired by design**: every read surface (registry, substring search, ⌘K, dashboard counters, dashboard feed, both CSVs, employee «выданное») already derives from the `devices` table through shared predicates — `deviceWhere` (registry/CSV/⌘K), `innerJoin devices` (feed), `currentEmployeeId` filter (issued list). Deleting the `devices` row removes the device from every surface with ZERO query changes (D-06 structural parity is a property of the existing code, not something to build). The ONLY new write-side work is the explicit children-then-parent delete order imposed by `ON DELETE RESTRICT` on `movements.device_id` and `attachments.device_id`.

The exact delete mechanics were **probe-verified** against the installed stack on a temp DB with real migrations (this project's own "probe-verified" discipline): a throw inside `db.transaction` rolls back ALL deletes; explicit `DELETE movements → DELETE attachments → DELETE devices WHERE id` in one tx succeeds; `.changes===0` on the devices delete reliably detects an unknown/already-deleted device (the `DEVICE_GONE` guard); a childless device (clone baby) sails through with no-op child deletes and an empty file list. The in-repo precedent for the tx-then-unlink file pattern is `deleteAttachment` in `db/queries/attachments.ts:136` — it already does exactly D-03+D-04 for a single photo: snapshot `storage_key` inside the tx, commit rows, then `unlinkSync` both `storageKey` and `thumbKeyOf(storageKey)` after commit, tolerating every fs error.

The UI side reuses two proven dialog recipes. Because there is exactly ONE delete per card, the right shape is the **standalone wrapper island** (`archive-confirm-dialog.tsx` precedent: wrapper owns trigger + open state, inner form owns `useActionState`), NOT the keyed-state island of the timeline (that exists for N dialogs). The zone must render OUTSIDE the `device.status !== 'disposed'` conditional in `page.tsx` (D-01 — visible for all statuses). Dialog counts («N записей истории, M фото») are free: `listTimeline(device.id)` and `listByDevice(device.id)` are ALREADY computed in the card page — pass `.length`s. Russian plural forms for «N записей» need a new form table in `lib/ru.ts` (established `Intl.PluralRules('ru')` recipe) — a literal «N записей» would break for N=1.

**Primary recommendation:** One-tx `deleteDevice` in `db/queries/devices.ts` (children → devices, `.changes===0 → DEVICE_GONE`, storage-key snapshot returned from the tx) + post-commit per-key `unlinkSync` of original+thumb; `deleteDeviceAction` in `app/(app)/devices/actions.ts` following the phase-12 contract (`requireSession` first, `deviceDeleteSchema` strictObject in `lib/device-schema.ts`, `{code}`→copy before return, `redirect('/devices')` on success — OUTSIDE any try/catch); standalone destructive confirm island on the card outside the disposed conditional; zero changes to any query/read surface; parity + knife tests in a new `tests/device-delete.test.ts`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Кнопка «Удалить» живёт на карточке устройства и доступна для **всех** статусов, включая disposed. У disposed-карточки custody-ряд остаётся скрытым (D-03 фазы 4), кнопка удаления — отдельная тихая зона вне этого ряда (главный сценарий фазы: «списал по ошибке» / «добавил по ошибке» при любом статусе).
- **D-02:** Подтверждение — красный диалог по прецеденту «Удалить запись?» (фаза 12): модель + серийник/инвентарник устройства, счётчики «N записей истории, M фото будут удалены безвозвратно», кнопки «Не удалять» / «Удалить» (bg-destructive, pending). Нативные confirm запрещены; type-to-confirm НЕ вводится — один оператор.
- **D-03:** Жёсткое удаление в ОДНОЙ транзакции: строки `movements` и `attachments` удаляются явно (FK RESTRICT не даст иначе), затем строка `devices` — `WHERE id` + `.changes===0 → DEVICE_GONE` (гонка/повторное удаление — дешёвый явный отказ).
- **D-04:** Файлы фото (оригинал + thumb из lib/photos) удаляются с диска (`data/uploads/`) вместе с БД-строками; удаление файлов — после успешного COMMIT (сбой диска не должен откатывать честную транзакцию БД; осиротевший файл — не осиротевшая запись). storage_key берётся из БД до удаления строк.
- **D-05:** После успеха — redirect на `/devices` (карточки больше нет); повторный заход на старый URL отвечает 404 через существующий notFound() контракт фазы 2.
- **D-06:** Parity поверхностей структурный: удаление строки devices само выводит устройство из общего `deviceWhere` (реестр, substring-поиск, CSV), ⌘K (тот же предикат), счётчиков дашборда (zero-default итерация), ленты (innerJoin devices), «выданного» у сотрудника (currentEmployeeId-фильтр). Никаких «списков исключений» — отдельный тест-parity.

### Claude's Discretion
- Тексты диалога/ошибок — по копирайт-контракту нового UI-SPEC (DELETE_ERROR-семейство фазы 12 байт-точное)
- SERVER guard: удаление не требует статуса-предусловия (удаляется любой статус, включая assigned — владелец понимает, что техника «у сотрудника» исчезает из его карточки)
- Ноль новых пакетов; кинжал-тесты: cascade-полнота (ноль сирот movements/attachments), parity-тест «устройства нет нигде»
- Дашборд-счётчики/лента продолжают работать после удаления (тест на пустой/непустой базе)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEL-01 | Оператор может удалить устройство целиком одним действием с явным подтверждением | One-tx `deleteDevice` (probe-verified rollback/.changes mechanics, §Pattern 1); red confirm dialog from two in-repo recipes (§Pattern 3); `redirect('/devices')` semantics verified from bundled Next 16 docs (§Pitfall 1); 404 contract already enforced by `(card)` route group + `notFound()` in `page.tsx` |
| DEL-02 | Удалённое устройство исчезает из реестра, поиска, ⌘K, дашборда и CSV-экспорта; его история удаляется вместе с ним | Structural parity verified by reading every consumer: `deviceWhere` (devices.ts:228) drives listDevices/exportDevices/searchPaletteDevices; feed = `innerJoin devices` (movements.ts:753); counters = group-by over devices; issued = currentEmployeeId filter (movements.ts:782). Zero query changes; parity test design in §Validation Architecture |
</phase_requirements>

## Project Constraints (from CLAUDE.md / AGENTS.md)

- **AGENTS.md mandate:** "This is NOT the Next.js you know" — read the bundled docs in `node_modules/next/dist/docs/` before writing Next code. Done for this phase: `refresh.md` and `redirect.md` were read and are cited below. Heed deprecation notices.
- **USER MANDATE (since phase 3):** `/Users/aleksey/.zcode/skills/vercel-react-best-practices/SKILL.md` applies to research/plans/code. Rules that bind this phase: `server-auth-actions` (requireSession = first line of every action — already the project contract), `server-serialization` (flat snapshot props to the client island — strings/numbers, no Dates), `rerender-no-inline-components` (dialog forms as top-level components — WR-01 split), `js-early-exit`, `server-dedup-props`.
- **GSD workflow enforcement:** repo edits only inside a GSD workflow (CLAUDE.md directive) — planner/executor flow already satisfies this.
- **UI-SPEC discipline:** Apple aesthetics, `#D70015` destructive family, copy verbatim from a UI-SPEC contract. Phase 13 needs its own 13-UI-SPEC copy table (planner produces it); the phase-12 family (`DELETE_ERROR`, «Удаляем…», «Не удалять», `bg-destructive hover:bg-destructive/90`) is the byte-exact register to extend.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cascade delete (movements+attachments+devices, one tx) | API/Backend (query layer `db/queries/devices.ts`) | — | Pure sync fn over module-level db — every mutation in this app lives there; vitest-importable (module contract headers) |
| Photo file unlink after COMMIT | API/Backend (same query fn, post-tx) | Database/Storage (disk `data/uploads/`) | Files are derived state of DB rows; DB is the truth (D-04: orphan file is the harmless direction) |
| `deleteDeviceAction` (session, zod, {code}→copy, redirect) | API/Backend (Server Action in `app/(app)/devices/actions.ts`) | — | Server Actions are direct-POST-able; requireSession-first is the security boundary |
| Confirm dialog (model+serial+counters, red destructive) | Browser/Client (new client island on card) | Frontend Server (page serializes props) | Dialog needs client state; props are a flat server-serialized snapshot |
| 404 on stale URL | Frontend Server (card page `notFound()`) | — | Existing phase-2 contract: `(card)` route group, no loading.tsx beside it |
| Parity of all read surfaces | Database/Storage (row delete) | — | Every surface derives from `devices` through shared predicates — deletion propagates structurally (D-06) |

## Standard Stack

**No new packages** (locked: ноль новых пакетов). Everything below is installed and pinned in `package.json` — versions read from the lockfile source of truth today.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.3 | Server Action + `redirect`/`refresh` from `next/cache` | Project runtime; `redirect()` in Server Actions = client-side navigation, `refresh()` documented Server-Actions-only [VERIFIED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/{redirect,refresh}.md] |
| better-sqlite3 | 13.0.3 | Sync transactions, FK enforcement | `foreign_keys = ON` pragma per connection (db/index.ts:17); RESTRICT enforced at runtime [VERIFIED: db/index.ts + empirical probe] |
| drizzle-orm | 0.45.2 | Typed deletes; `run()` → `RunResult.changes` | `.delete().where().run().changes` probe-verified (1 on hit, 0 on miss) [VERIFIED: empirical probe on temp DB with migrations 0000-0002] |
| zod | 4.5.4 | `deviceDeleteSchema` strictObject whitelist | Existing keystone schema pattern (`deleteMovementSchema` lib/movement-schema.ts:218) [VERIFIED: codebase] |
| vitest | 4.1.11 | Knife tests + source gates | 460/460 green baseline verified 2026-09-28 [VERIFIED: suite run] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/photos.ts` helpers | (in-repo) | `thumbKeyOf`, `resolveUploadPath`, `assertInsideUploads` | Deriving thumb path + containment-checked disk access for the unlinks — the ONE derivation each (Pitfall 8 of REG-05) |
| `lib/ru.ts` | (in-repo) | `Intl.PluralRules('ru')` form tables | New «запись/записи/записей» forms for the dialog count line (recipe at ru.ts:5-37) |
| playwright | 1.62.1 (devDep) | UAT scenarios (orchestrator-run) | SC1–SC5 browser truth, precedent phases 7/10/12 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Explicit in-tx `DELETE movements`/`DELETE attachments` | `ON DELETE CASCADE` migration | LOCKED OUT by D-03 (explicit in-tx deletes; no schema migration expected this phase). RESTRICT + explicit order also keeps the delete deliberate and probe-friendly |
| Per-key `unlinkSync` from DB snapshot | `rmSync` of the whole `<deviceId>/` directory | Directory rm is one syscall and would sweep orphans too, but DB-key-derived unlinks keep the deletion tied to DB truth and reuse the `deleteAttachment` containment precedent. Directory rm only viable as a follow-up hygiene task — not this phase |
| `redirect('/devices')` | `refresh()` + client-side `router.push` from the island | Action-level redirect is simpler, works without JS (303), and needs no island navigation logic. Login action already redirects under `useActionState` [VERIFIED: app/login/actions.ts:59] |
| `async unlink` (fs/promises) after commit | `unlinkSync` | `deleteAttachment` comment documents the choice: fire-and-forget async raced the test's `existsSync` and could lose deletions at process exit; two small files = microseconds [VERIFIED: attachments.ts:171-175] |

**Installation:** none — zero new packages.

**Version verification:** `package.json` read 2026-09-28; suite run green (460 tests); node v22.23.0; vitest 4.1.11; next 16.3.3; drizzle-orm 0.45.2; better-sqlite3 13.0.3.

## Package Legitimacy Audit

Not applicable — this phase installs **zero new packages** (locked decision). The stack above is the shipped project dependency set already vetted in phases 1–12.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 Operator on card /devices/[id]
        │  click «Удалить» (quiet zone, ALL statuses, D-01)
        ▼
 [Confirm dialog island]  «Удалить устройство?»
   model · serial/inventory · «N записей истории, M фото будут удалены безвозвратно»
   «Не удалять» (secondary) │ «Удалить» (bg-destructive, pending «Удаляем…»)
        │  form POST (Server Action, useActionState)
        ▼
 deleteDeviceAction  ── requireSession() FIRST (direct-POST-able)
        │  deviceDeleteSchema (zod strictObject: deviceId only)
        ▼
 deleteDevice (db/queries/devices.ts) — ONE transaction
   1. SELECT storage_key FROM attachments WHERE device_id   (snapshot, D-04)
   2. DELETE FROM movements   WHERE device_id               (RESTRICT child)
   3. DELETE FROM attachments WHERE device_id               (RESTRICT child)
   4. DELETE FROM devices     WHERE id = ?
        └─ .changes === 0 → throw { code: 'DEVICE_GONE' }  → full rollback (probe-verified)
        │ COMMIT
        ▼
 POST-COMMIT (same action call): for each snapshot key →
   unlinkSync(resolveUploadPath(key)); unlinkSync(resolveUploadPath(thumbKeyOf(key)))
   every fs error tolerated (orphan file = harmless direction, D-04)
        │ success
        ▼
 redirect('/devices')   (throws NEXT_REDIRECT — MUST be outside try/catch)
   stale /devices/[id] URL → getDevice() undefined → notFound() → 404 (phase-2 contract)
        │
        ▼
 READ SURFACES (zero code changes — structural parity, D-06):
   реестр/фильтры ── deviceWhere ──┐
   substring-поиск ─ deviceWhere ──┤
   ⌘K /api/search ── deviceWhere ──┼── row gone ⇒ device gone everywhere
   обе CSV ───────── deviceWhere ──┘
   дашборд-счётчики ── group-by over devices (zero-default iteration)
   лента дашборда ──── innerJoin devices (movements deleted too)
   «выданное» ──────── devices WHERE current_employee_id (row gone)
```

### Recommended Project Structure

```
app/(app)/devices/actions.ts                      # + deleteDeviceAction (contract: requireSession → zod → tx → redirect)
app/(app)/devices/device-delete-dialog.tsx        # NEW client island: trigger + red confirm (archive-confirm-dialog shape)
app/(app)/(card)/devices/[id]/page.tsx            # + island render OUTSIDE the status!=='disposed' conditional; pass counts
db/queries/devices.ts                             # + deleteDevice(id): one-tx children→parent + post-commit unlinkSync
lib/device-schema.ts                              # + deviceDeleteSchema (keystone — tests import it, never 'use server' actions)
lib/ru.ts                                         # + movement-record plural forms (Intl.PluralRules recipe)
tests/device-delete.test.ts                       # NEW: knife-tests + parity + files-on-disk + source gates
```

No changes: `db/queries/movements.ts`, `db/queries/attachments.ts` (its `deleteAttachment` stays as-is for single-photo delete), `db/schema.ts`, all read routes, `drizzle/` (no migration).

### Pattern 1: One-tx children→parent delete with post-commit file unlink
**What:** The whole delete is ONE sync transaction; files unlink only after the tx function returns (commit succeeded).
**When to use:** Any destructive delete whose rows carry FK-RESTRICT children and disk-backed blobs.
**Example:**
```typescript
// Source: deleteAttachment precedent db/queries/attachments.ts:136-181 +
// probe-verified mechanics (tests/_probe-delete probe, 2026-09-28)
import { unlinkSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { attachments, devices, movements } from '@/db/schema'
import { resolveUploadPath, thumbKeyOf } from '@/lib/photos'

export function deleteDevice(deviceId: number): void {
  let storageKeys: string[] = []
  db.transaction((tx) => {
    // 1. Snapshot BEFORE rows vanish (D-04: storage_key из БД до удаления строк)
    storageKeys = tx
      .select({ storageKey: attachments.storageKey })
      .from(attachments)
      .where(eq(attachments.deviceId, deviceId))
      .all()
      .map((r) => r.storageKey)
    // 2-3. Children first — RESTRICT rejects the parent otherwise (probe: FOREIGN KEY constraint failed)
    tx.delete(movements).where(eq(movements.deviceId, deviceId)).run()
    tx.delete(attachments).where(eq(attachments.deviceId, deviceId)).run()
    // 4. Parent last; .changes is the ONLY guard (no status precondition — locked discretion)
    const del = tx.delete(devices).where(eq(devices.id, deviceId)).run()
    if (del.changes === 0) throw { code: 'DEVICE_GONE' }
  })
  // Post-COMMIT (D-04): sync unlinks, all errors tolerated — orphan file is
  // the harmless direction; row-less files break nothing. Empty keys array
  // (clone babies) = natural no-op loop.
  for (const key of storageKeys) {
    for (const k of [key, thumbKeyOf(key)]) {
      try {
        unlinkSync(resolveUploadPath(k)) // containment guard: PATH_ESCAPE throws → tolerated
      } catch {
        // ENOENT / tampered key — rows are gone, files unreachable either way
      }
    }
  }
}
```
Probe results pinned by this pattern (all verified on temp DB + migrations):
- Direct `DELETE devices` with children throws `FOREIGN KEY constraint failed` → explicit order is mandatory.
- A throw mid-tx rolls back ALL three deletes (children AND device survive) — `DEVICE_GONE` on step 4 leaves zero writes.
- Unknown id: child deletes are no-ops, `.changes===0` fires → cheap explicit rejection (double-delete/race).
- Childless device: two no-op deletes, success. Empty `storageKeys` → zero unlinks.

### Pattern 2: Server Action contract for the delete (phase-12 byte parity)
**What:** `requireSession()` first line → zod strictObject → query in try/catch → `{code}` mapped to Russian copy BEFORE return → success path `redirect('/devices')`.
**When to use:** every new mutation action.
**Example:**
```typescript
// Source: actions.ts contract (lines 40-48, 755-772) + login redirect precedent
// + bundled Next docs: redirect throws NEXT_REDIRECT, must sit OUTSIDE try/catch
export async function deleteDeviceAction(
  _prev: unknown,
  formData: FormData,
): Promise<DeviceDeleteFormState> {
  await requireSession()                                  // T-03-01: direct-POST-able
  const parsed = deviceDeleteSchema.safeParse({           // T-03-02: id-only whitelist
    deviceId: formData.get('deviceId'),
  })
  if (!parsed.success) return { error: DEVICE_DELETE_ERROR }
  try {
    deleteDevice(parsed.data.deviceId)                    // one-tx + files
  } catch (error) {
    const code = (error as { code?: string } | undefined)?.code
    if (code === 'DEVICE_GONE') return { error: DEVICE_GONE_COPY }   // V7: mapped before return
    return { error: DEVICE_DELETE_ERROR }
  }
  // redirect THROWS NEXT_REDIRECT — outside the try/catch on purpose (bundled
  // Next 16 docs redirect.md:51-53). D-05: the card is gone, navigate away.
  // type 'replace' keeps the dead card out of the back stack (docs: actions
  // default to 'push').
  redirect('/devices', { type: 'replace' })
}
```
Note: with a redirect on success the island never sees `{ ok: true }` — `useCloseOnOk` is not needed here; the dialog unmounts with the page. Error path keeps the dialog open with `role="alert"`.

### Pattern 3: Confirm dialog — standalone wrapper island (one delete per card)
**What:** `archive-confirm-dialog.tsx` shape: wrapper owns `DialogTrigger` + `open` state, inner `*Form` component owns `useActionState` (WR-01 — the portal unmounts children after close, resetting action state per session). NOT the timeline's keyed-state island — that exists to multiplex N dialogs; here there is exactly one.
**When to use:** a single confirm action on a page.
**Example:**
```typescript
// Source: archive-confirm-dialog.tsx:29-107 + MovementDeleteConfirmDialog
// (movement-edit-dialogs.tsx:447-472) — red destructive register, byte-exact:
// «Удаляем…» pending, bg-destructive hover:bg-destructive/90, role=alert.
function DeviceDeleteForm({ deviceId, onDone }: { deviceId: number; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(deleteDeviceAction, {})
  useEffect(() => { if (state.ok) onDone() }, [state, onDone]) // unreachable on success (redirect) — harmless
  return (
    <>
      {state.error ? <p className="text-sm text-[#D70015]" role="alert">{state.error}</p> : null}
      <form action={formAction}>
        <input type="hidden" name="deviceId" value={deviceId} />
        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>Не удалять</DialogClose>
          <Button type="submit" disabled={pending}
            className="bg-destructive font-semibold text-white hover:bg-destructive/90">
            {pending ? 'Удаляем…' : 'Удалить'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
```
Props for the wrapper (flat server-serialized snapshot — `server-serialization` rule): `deviceId`, `model`, `serialNumber`, `inventoryNumber`, `historyCount`, `photoCount` — all plain strings/numbers. The counts are FREE in `page.tsx`: `listTimeline(device.id).length` (already called at page.tsx:336) and `listByDevice(device.id).length` (already called at page.tsx:357). No new queries.

### Pattern 4: Quiet zone placement on the card (D-01)
**What:** The delete island renders OUTSIDE the custody-row conditional in `page.tsx` so it shows for every status, disposed included.
**Where exactly:** `page.tsx:246` — `{device.status !== 'disposed' ? (<div className="mt-6 flex flex-wrap gap-2">…) : null}` guards Редактировать/Дублировать/custody matrix. The delete zone goes AFTER this conditional as its own element (recommended: a hairline-separated footer zone at the card bottom, after PhotoGrid — the standard Apple "danger zone" position; exact placement/copy is planner's 13-UI-SPEC call). Inside `device-actions.tsx` (`return null` for disposed) is the WRONG home — that whole component is bypassed for disposed.

### Anti-Patterns to Avoid
- **redirect() inside try/catch:** NEXT_REDIRECT would be swallowed and mapped into the error copy — the operator sees a fake failure and never leaves the dead card. Docs are explicit: call it outside try blocks [CITED: node_modules/next/dist/docs/.../redirect.md:51-53].
- **Unlinking files inside the tx (before commit):** a later throw rolls rows BACK but files are already gone → live rows pointing at missing files (breaks photo serving). Post-commit unlink inverts this to the harmless direction [VERIFIED: attachments.ts:134-136 rationale + D-04].
- **Reconstructing paths from `deviceId` instead of DB keys:** storage keys must come from the row snapshot; disk state is derived from DB truth, and `resolveUploadPath`+`assertInsideUploads` are the containment gate for anything that touches the filesystem (PATH_ESCAPE guard, T-04-09).
- **Deleting thumb separately or guessing its name:** `thumbKeyOf(storageKey)` is the ONE derivation (lib/photos.ts:40) — never hand-build `<uuid>.thumb.jpg`.
- **Status preconditions on the delete:** locked discretion says ANY status deletes. The only guard is existence (`.changes===0 → DEVICE_GONE`). Adding an `ILLEGAL_TRANSITION`-style check would contradict D-01.
- **A «lists of exceptions» parity approach:** D-06 forbids editing each read query to filter out deleted ids — if any query needs a change for parity, the design is wrong; the parity test exists to prove the structural property.
- **Query logic in the action file:** the tx lives in `db/queries/*` (pure sync, vitest-importable — module contract headers). `actions.ts` stays session/zod/copy only. Also: never import a `'use server'` module from vitest — source-gates read it as text instead (movement-edit.test.ts:577).
- **Literal «N записей» copy:** Russian plurals (1 запись / 2-4 записи / 5+ записей). Use the `lib/ru.ts` `Intl.PluralRules('ru')` form-table recipe (new MOVEMENT_RECORD_FORMS), or a plural-neutral «Записей истории: N · Фото: M» layout — decide in the UI-SPEC.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Transactional multi-row delete | Manual BEGIN/COMMIT via raw sqlite, or sequential non-tx deletes | `db.transaction((tx) => …)` | Probe-verified: throw = full rollback; drizzle tx is the established project shape (cloneDevices, editMovement…) |
| Existence/race guard | SELECT-then-DELETE, or checking child counts first | `.run().changes === 0 → DEVICE_GONE` on the devices delete | One conditional decides; zero window; cheap double-delete rejection (probe-verified) |
| Photo file path derivation | String-concatenating `.<uuid>.thumb.jpg` or absolute paths | `thumbKeyOf` + `resolveUploadPath` + `assertInsideUploads` | Containment guard (T-04-09) already handles traversal/tampered keys as PATH_ESCAPE |
| Temp-file-safe unlink | Async fire-and-forget unlink with promise tracking | `unlinkSync` in try/catch after commit | `deleteAttachment` documented the async race loss (process exit before threadpool flush); 2 small files are microseconds |
| Confirm-dialog a11y/state | Custom modal, window.confirm, type-to-confirm | Existing `Dialog` (Base UI) + WR-01 split recipes | Native confirm forbidden (D-02); type-to-confirm rejected (one operator); recipes already proven in phases 2/4/12 |
| Russian plural words | Ad-hoc `n === 1 ? 'запись' : 'записей'` | `Intl.PluralRules('ru')` + full LDML form table (lib/ru.ts recipe) | Handles 21/22/111/… correctly; two precedents exist (pluralEmployees, pluralDevices) |
| FK cascade order reasoning | Hoping CASCADE/SET NULL exists | Explicit child deletes before parent | Schema has RESTRICT on both children (db/schema.ts:127-131, 146-149) — probe confirmed the constraint fires |

**Key insight:** this codebase has already solved every sub-problem of this phase for a SINGLE photo (deleteAttachment) and a SINGLE history row (deleteMovement + .changes guard). Phase 13 is their composition at device scope — the risk is not invention, it is skipping one of the three deletes or one of the two file variants.

## Common Pitfalls

### Pitfall 1: redirect() swallowed by try/catch
**What goes wrong:** `redirect('/devices')` placed inside the action's try block (or inside a catch-all) throws NEXT_REDIRECT, gets caught, and mapped to the generic error copy — the operator stays on a now-deleted card.
**Why it happens:** redirect is implemented as a thrown control-flow error; the existing action pattern wraps queries in try/catch, so muscle memory puts the redirect inside.
**How to avoid:** query call alone inside try/catch; redirect as the last statement of the function (bundled docs redirect.md:51; login action precedent).
**Warning signs:** UAT — after confirm, dialog shows an error but the device was actually deleted (refresh reveals it).

### Pitfall 2: File deletion racing/preceding the DB truth
**What goes wrong:** (a) unlink before tx → tx throws (e.g. DEVICE_GONE) → rows live, photos broken; (b) async unlinks fire-and-forget → can be lost on process exit; (c) forgetting the thumb → orphaned thumb or half-broken grid.
**Why it happens:** treating disk as primary instead of derived state.
**How to avoid:** D-04 order exactly — snapshot keys INSIDE tx → commit → sync unlink `[key, thumbKeyOf(key)]`, all fs errors tolerated. It is deleteAttachment verbatim.
**Warning signs:** knife test asserts `existsSync` right after `deleteDevice` returns — must already be false (sync, not async).

### Pitfall 3: Checking .changes on the wrong statement
**What goes wrong:** guarding the children deletes (they legitimately hit 0..N rows) or guarding via a prior SELECT (race window).
**Why it happens:** copying the bulk-blockers prevalidation shape.
**How to avoid:** exactly ONE guard — the devices delete's `.changes===0 → DEVICE_GONE` (D-03). Children deletes are unconditional no-op-or-delete.
**Warning signs:** a code review seeing `if (delMovements.changes === 0) throw …` — wrong.

### Pitfall 4: Delete zone rendered inside the disposed-hidden row
**What goes wrong:** button disappears for disposed devices — the main scenario («списал по ошибке») breaks.
**Why it happens:** tucking the island into `device-actions.tsx` or inside the `status !== 'disposed'` ternary (page.tsx:246), both of which are hidden for disposed.
**How to avoid:** separate island rendered after the conditional; source-gate can pin `data-device-delete` presence in page.tsx outside that block.
**Warning signs:** UAT scenario SC-with-disposed (D-01).

### Pitfall 5: Test bootstrap order (module-level db singleton)
**What goes wrong:** importing `@/db` before setting `DATABASE_PATH`/`UPLOADS_DIR` opens the dev DB inside tests (the lazy Proxy opens on first property access).
**Why it happens:** static imports hoist before env assignment.
**How to avoid:** copy `tests/movement-edit.test.ts` bootstrap exactly: `mkdtempSync` → set env → `await import('@/db')` → `applyMigrations(db.$client)` → dynamic-import query modules; `UPLOADS_DIR` temp per `attachments-queries.test.ts`.
**Warning signs:** tests touching `./data/app.db`, or flaky UNIQUE collisions from real data.

### Pitfall 6: Parity holes in READ surfaces that don't all go through deviceWhere
**What goes wrong:** assuming deviceWhere covers everything and missing that the feed joins `movements` (not devices), the counters group-by `devices`, and «выданное» filters devices by holder.
**Why it happens:** over-generalizing «parity через deviceWhere».
**How to avoid:** parity test walks each surface independently (feed, counters, issued, palette, CSV, registry) — see Validation Architecture map. (All six were read-verified to be structurally device-row-driven; the test pins the property forever.)
**Warning signs:** any future feature adding a devices-adjacent read that bypasses the row's FK graph.

### Pitfall 7: Russian plural copy in the confirm dialog
**What goes wrong:** «1 записей истории, 0 фото» — grammatically wrong for N=1/2-4 (the D-02 copy is canonical and operator-facing).
**Why it happens:** the CONTEXT copy sketch «N записей истории, M фото» is the semantic contract, not a literal template.
**How to avoid:** new form table via the `Intl.PluralRules('ru')` recipe (lib/ru.ts:5-37) or a colon-counter layout; final wording belongs to the 13-UI-SPEC copy table.
**Warning signs:** dialog text review with N=1, N=2, N=5.

## Code Examples

Verified patterns from installed-version docs and the codebase:

### Drizzle sync delete + RunResult (probe-verified)
```typescript
// Source: empirical probe on temp DB + migrations, 2026-09-28 (vitest run)
const del = tx.delete(devices).where(eq(devices.id, id)).run()
del.changes // 1 when the row existed; 0 when unknown/already deleted
// Direct parent delete with RESTRICT children:
// SqliteError: FOREIGN KEY constraint failed
```

### redirect in Server Actions (installed Next 16.3.3)
```typescript
// Source: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md
// - "In a Server Action, redirect performs a client-side navigation when
//    JavaScript is available" (303 for progressive enhancement)
// - "redirect should be called outside the try block when using try/catch"
// - type: 'push' (default in Server Actions) | 'replace'
redirect('/devices', { type: 'replace' })
```

### The single-photo precedent this phase generalizes
```typescript
// Source: db/queries/attachments.ts:136-181 (deleteAttachment) — read in full
db.transaction((tx) => { /* snapshot storageKey → guards → delete row */ })
// AFTER the tx: unlinkSync(resolveUploadPath(key)) for [key, thumbKeyOf(key)],
// each in try/catch swallowing ENOENT/PATH_ESCAPE.
```

### Dialog red-destructive register (byte-exact CSS from phase 12)
```typescript
// Source: movement-edit-dialogs.tsx:434-440
<Button type="submit" disabled={pending}
  className="bg-destructive font-semibold text-white hover:bg-destructive/90">
  {pending ? 'Удаляем…' : 'Удалить'}
</Button>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `movements` append-only enforced by DB triggers (0000) | Triggers dropped by migration `0002_drop_movement_triggers.sql`; server-layer mutations with replay | Phase 12 (2026-09-28) | Device delete is legal at the DB level — the hard 12→13 dependency is already satisfied |
| Device deletion impossible (feed comment: "nothing in the app deletes devices", movements.ts:746) | This phase adds the ONLY deleteDevice | Phase 13 | `listRecentMovements` innerJoin stays safe — it never sees an orphan because movements are deleted in the same tx |
| Cascade via ON DELETE CASCADE considered (STATE.md blocker) | Explicit in-tx child deletes (D-03) | Locked in 13-CONTEXT | No schema migration this phase |

**Deprecated/outdated:**
- Nothing in this phase's domain. `middleware.ts` → `proxy.ts` note remains from the stack doc (untouched here).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `redirect('/devices', { type: 'replace' })` — the `type` option shape on the installed Next version follows the bundled docs table; the codebase has no `type` usage yet to copy | Pattern 2 / Pitfall 1 | Cosmetic: falls back to push (dead card in back stack, 404 on revisit — still contract-correct). If tsc rejects the second arg, plain `redirect('/devices')` is the fallback |
| A2 | Exact Russian copy strings shown («Не удалось удалить устройство. Попробуйте ещё раз.», DEVICE_GONE copy) are proposals in the phase-12 register; canonical wording comes from the planner's 13-UI-SPEC copy table | Pattern 2 / Standard Stack | None structural — action maps whatever copy the UI-SPEC fixes |
| A3 | 13-UI-SPEC.md (like 12-UI-SPEC.md) will be authored during planning and owns dialog title/zone placement/wording | Pattern 4 / Project Constraints | None — positions research recommends, UI-SPEC disposes |
| A4 | The storage-key snapshot is taken via SELECT inside the tx and surfaced through the tx callback return (probe-verified) or a closure variable (deleteAttachment's style) — both work identically | Pattern 1 | None — implementation detail |

**The seam's `classify-confidence` returned LOW for custom provider ids** (`empirical-probe`, `next-bundled-docs`) — it only recognizes its built-in provider list. Tiers above were assigned by the source hierarchy instead: probes executed against the installed stack + bundled official docs + multiple in-repo cross-checks are HIGH; they are strictly stronger evidence than an unrecognized-id lookup. Recorded here for honesty.

## Open Questions

1. **Delete-zone placement and styling on the card**
   - What we know: must render for ALL statuses, outside the custody-row conditional; Apple aesthetics suggest a bottom hairline "danger zone"; quiet register (ROW_ACTION_CLASS-like or secondary Button).
   - What's unclear: exact position (after actions row vs card bottom) and trigger styling.
   - Recommendation: card bottom, after PhotoGrid, quiet text-style destructive trigger in the `#D70015` family; final call → 13-UI-SPEC.
2. **Dialog title and count-line wording**
   - What we know: D-02 fixes the semantic content (model + serial/inventory + counters + «безвозвратно» + «Не удалять»/«Удалить»).
   - What's unclear: exact title («Удалить устройство?» by analogy) and plural handling.
   - Recommendation: «Удалить устройство?» title; counts via new `lib/ru.ts` form table; planner's UI-SPEC fixes byte-exact strings.
3. **deviceDeleteSchema home**
   - What we know: two precedents — keystone (deleteMovementSchema in lib/movement-schema.ts, testable) vs inline in actions.ts (cloneSchema).
   - What's unclear: none material.
   - Recommendation: `lib/device-schema.ts` keystone — schema matrix tests cannot import `'use server'` modules; keystone placement is the phase-12 pattern.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | v22.23.0 | — |
| vitest | knife-tests, parity, source gates | ✓ | 4.1.11 | — |
| next dev/build (Turbopack) | build gate, UAT server | ✓ | 16.3.3 | — |
| drizzle-kit | NOT needed this phase (no migration) | ✓ (0.31.10) | — | — |
| better-sqlite3 | one-tx delete, FK RESTRICT | ✓ | 13.0.3 | — |
| Playwright | UAT scenarios (orchestrator) | ✓ | 1.62.1 (devDep) | — |
| data/uploads on dev machine | file-unlink tests use temp UPLOADS_DIR | ✓ (temp dir pattern) | — | tests never touch real uploads |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 (node environment) |
| Config file | vitest.config.ts (`@` alias + server-only stub) |
| Quick run command | `npx vitest run tests/device-delete.test.ts` |
| Full suite command | `npx vitest run` (460/460 green baseline, verified 2026-09-28, ~1.5s) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEL-01 | one-tx cascade: children+device deleted, throw rolls back all, `.changes===0 → DEVICE_GONE` | unit (temp DB + applyMigrations) | `npx vitest run tests/device-delete.test.ts` | ❌ Wave 0 |
| DEL-01 | files: both `storageKey` + `thumbKeyOf(key)` gone from disk after `deleteDevice` returns; zero-photo device = no-op | unit (temp UPLOADS_DIR, seeded fake files) | same | ❌ Wave 0 |
| DEL-01 | card island: red confirm exists, no window.confirm, requireSession-first action, machine `{code}` never returned | source-gates (readFileSync) | same | ❌ Wave 0 |
| DEL-02 | parity: registry total −1, `exportDevices` excludes, `searchPaletteDevices(q)` empty, feed lacks device, counters drop, `listIssuedByEmployee` lacks device, control devices untouched | unit parity walk (D-06) | same | ❌ Wave 0 |
| DEL-01 | double-delete → `{code:'DEVICE_GONE'}`, zero writes | unit | same | ❌ Wave 0 |

Test bootstrap is copy-exact from `tests/movement-edit.test.ts` (env BEFORE dynamic `import('@/db')`, `applyMigrations(db.$client)` — migrations 0000-0002 ride along) plus `process.env.UPLOADS_DIR` from `tests/attachments-queries.test.ts`. Seeding: `createDevice` + custody query fns + direct SQL for attachments rows (fake keys, no sharp needed — precedent attachments-queries.test.ts:98).

### Sampling Rate
- **Per task commit:** `npx vitest run tests/device-delete.test.ts`
- **Per wave merge:** `npx vitest run` (full suite) + `npx next build` + `npx eslint` on touched files
- **Phase gate:** full suite green + build green + UAT before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/device-delete.test.ts` — covers DEL-01/DEL-02 map above (single new file; helpers.ts already provides `applyMigrations`; no framework install needed)
- [ ] Source-gate needles decided by planner: `data-device-delete` trigger attr, island filename, action name

*(Only one gap: the new test file. Everything else — vitest config, stubs, helpers, 460-test baseline — exists.)*

### UAT coverage for SC1–SC5 (orchestrator via Playwright, precedent phases 7/10/12; user sign-off end-of-phase)
| SC | Scenario |
|----|----------|
| SC1 | Card → Удалить → red dialog (model+serial+counts) → «Удалить» → lands on /devices; old URL → 404 page |
| SC2 | Device with history+photos: after delete, feed clean, photo files gone; re-confirm impossible |
| SC3 | Device absent from реестр/фильтры, substring search, ⌘K, counters, both CSVs |
| SC4 | «Списать» still works on another device; delete created no movements anywhere |
| SC5 | Employee card: deleted device gone from «выданное», siblings and counts intact; disposed card shows the delete zone with no custody row |

## Security Domain

`security_enforcement: true`, ASVS level 1 (config.json). Phase touches a destructive mutation and the filesystem.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | existing jose session |
| V3 Session Management | no (unchanged) | existing HttpOnly cookie + proxy |
| V4 Access Control | **yes** | `requireSession()` first line of `deleteDeviceAction` (Server Actions are direct-POST-able; proxy perimeter does not cover them — T-03-01) |
| V5 Input Validation | **yes** | `deviceDeleteSchema` `z.strictObject({ deviceId: positive int })` — id-only whitelist, injected keys rejected (tamper gate, T-03-02) |
| V6 Cryptography | no | n/a |
| V14/V7 Error handling (project numbering) | **yes** | `{code:'DEVICE_GONE'}` mapped to Russian copy BEFORE return; machine literals never leave the action; no internals in any error path |
| Path traversal (file deletion) | **yes** | all disk access through `resolveUploadPath` + `assertInsideUploads` — a tampered/stale storage key resolves outside the root → PATH_ESCAPE → tolerated like ENOENT |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Crafted POST to deleteDeviceAction without session | Spoofing/Elevation | requireSession-first (defense-in-depth over proxy default-deny) |
| Double-submit / race (two tabs) | Tampering | pending-disabled submit (UX) + `.changes===0 → DEVICE_GONE` (server authority, probe-verified rollback) |
| storage_key tampering → arbitrary file delete | Tampering/Elevation | DB-derived keys only + containment guard (T-04-09); never trust client input for paths |
| CSRF on Server Action | Tampering | Next Server Action origin checks (framework built-in) + single-operator LAN app |
| Over-destructive delete (history lost by accident) | Repudiation | D-02 red confirm with model+serial+counters; nightly `VACUUM INTO` backup is the last resort (documented in REQUIREMENTS Out-of-Scope: корзина отклонена владельцем) |

## Sources

### Primary (HIGH confidence)
- Codebase (read in full this session): `db/schema.ts`, `db/index.ts`, `db/queries/{devices,movements,attachments}.ts`, `lib/photos.ts`, `lib/movement-schema.ts`, `lib/ru.ts`, `lib/device-schema.ts` (exports), `app/(app)/devices/actions.ts`, `app/(app)/devices/device-actions.tsx`, `app/(app)/(card)/devices/[id]/{page,timeline,movement-edit-dialogs}.tsx`, `app/(app)/employees/archive-confirm-dialog.tsx`, `app/api/search/route.ts`, `app/api/devices/export/route.ts`, `app/api/devices/[id]/photos/route.ts`, `tests/{movement-edit,attachments-queries,helpers}.ts`, `package.json`, `vitest.config.ts`, `.planning/config.json`
- Empirical probes (2026-09-28, temp DB + real migrations, deleted after run): FK RESTRICT behavior, tx rollback, `.changes`, childless-device path, unlinkSync ENOENT, tx-then-unlink ordering
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/{redirect,refresh}.md` — installed Next 16.3.3 official docs (AGENTS.md mandate honored)

### Secondary (MEDIUM confidence)
- `.planning/phases/12-history-correction/12-{UI-SPEC,01-SUMMARY,02-SUMMARY}.md` — copy contract and fresh signatures
- `better-sqlite3` README (installed copy — transaction mechanics probed empirically instead)

### Tertiary (LOW confidence)
- None — no web-only claims survive in this document

## Metadata

**Confidence breakdown:**
- Delete mechanics (tx/rollback/.changes/FK/files): HIGH — probe-verified against installed versions, cross-checked with `deleteAttachment` precedent
- Structural parity of read surfaces: HIGH — every consumer read directly (`deviceWhere`, innerJoin, group-by, currentEmployeeId)
- UI patterns (dialog/zone/action contract): HIGH — three in-repo precedents read in full; copy wording itself is planner/UI-SPEC discretion (A2/A3)
- redirect `{type:'replace'}` option: MEDIUM — bundled docs, no in-repo usage yet (A1)

**Research date:** 2026-09-28
**Valid until:** 2026-10-28 (stable: no dependency changes expected; suite baseline re-checked today)
