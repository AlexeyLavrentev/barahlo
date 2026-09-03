# Phase 4: Custody & Photos - Research

**Researched:** 2026-09-03
**Domain:** Transactional custody state machine (Next 16 Server Actions + Drizzle/SQLite) + photo pipeline (client resize → sharp re-encode → authorized route serving)
**Confidence:** HIGH — every data-layer pattern and the entire sharp pipeline were EXECUTED this session against the project's installed deps (drizzle-orm 0.45.2, better-sqlite3 13.0.3, sharp 0.35.4, migration 0000); browser-side specifics cited from MDN/web (MEDIUM).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **E-01:** Каждое перемещение несёт опциональную дату события (задним числом: «закупил вчера, выдал вчера») и опциональный комментарий (номер акта, примечание) — оба видны в таймлайне. Дефолт даты — «сейчас»; дата не может быть в будущем (валидация). [user: выбрано явно]
- **E-02:** Схема готова: `movements` (deviceId, eventType: received/assigned/transferred/returned/to_repair/from_repair/disposed, from/toEmployeeId, comment, occurredAt) + append-only триггеры уже в миграции 0000 — новых миграций нет.
- **E-03:** Списание ФИНАЛЬНО: подтверждение с обязательной причиной (комментарий), после — устройство только просматривается (статус disposed, история целая). Ошибка данных исправляется заводом нового устройства, не правкой. Кнопка красная (единственный destructive-контраст — #D70015 именно сюда). [user: выбрано явно]
- **E-04:** Два действия: «В ремонт» (устройство уходит от держателя — если был, автоматически «принимается» — и получает статус repair) → «Из ремонта» (на склад). Комментарии к обоим. Без событийного оформления — запрещено (дыра в истории). [user: выбрано явно]
- **E-05:** До 8 фото на устройство; удаление фото доступно (вложения — не история; случайное фото убирается). [user: выбрано явно]
- **E-06:** Пайплайн: клиентский ресайз до ~1600px → sharp re-encode (JPEG/WebP) → EXIF-strip → диск `data/uploads/<deviceId>/…` с DB-метаданными (attachments.storageKey, никогда не BLOB); миниатюры; раздача только через авторизованный route (не статика из public). Принимаются фото с телефона (input capture). [user: выбрано явно; research-паттерн]
- **E-07:** В карточке сотрудника действие «Вернуть всю технику»: одна операция, каждая единица — отдельное событие returned в одной транзакции (для увольнения/передачи дела). [user: выбрано явно]
- **E-08:** У устройства со статусом assigned кнопка «Выдать» скрыта (видны «Передать»/«Принять»); guard дублируется в action (выдача возможна только от in_stock/repair-возврата). [user: выбрано явно]

### Claude's Discretion
- Раскладка кнопок действий на карточке (по статусу устройства) — RESOLVED by approved 04-UI-SPEC matrix
- Формат таймлайна — RESOLVED: вертикальная лента, newest first (04-UI-SPEC)
- Механика «Вернуть всю технику» при частичном сбое — RESOLVED: вся транзакция атомарна, откат всего (04-UI-SPEC)
- Порядок полей в форме выдачи — RESOLVED: сотрудник → дата → комментарий (04-UI-SPEC)

### Deferred Ideas (OUT OF SCOPE)
- Печатный акт приёма-передачи — v1.x (V2-06, по запросу HR/бухгалтерии)
- Уведомления об истекающей гарантии — фаза 5-6 (подсветка)
- История по сотруднику (все события его техники на одной ленте) — по потребности

### UI Contract (binding)
`04-UI-SPEC.md` (status: approved, reviewed 2026-09-03): status-driven action matrix, 6 custody dialogs (field order, pending/error copy), vertical timeline (7 event types, route lines, «—» rule), photo grid 3/4 cols + lightbox + delete confirm, return-all dialog, disposed = view-only, a11y fallbacks, all copy byte-exact. This research supplies verified implementation mechanics for that contract and does not revisit it.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MOVE-01 | Выдать (assign) | Custody Pattern C1: guard UPDATE `WHERE id AND status='in_stock'` + INSERT assigned event in one tx (VERIFIED executed) |
| MOVE-02 | Принять (return to stock) | Same pattern, precondition `assigned`, projection → in_stock/NULL holder (VERIFIED) |
| MOVE-03 | Передать (transfer) | Same pattern, precondition `assigned`, to ≠ current & active; projection holder swap (VERIFIED) |
| MOVE-04 | Append-only event per action + timeline | movements INSERT-only (triggers RAISE ABORT — VERIFIED); timeline = alias double-join, `orderBy desc(occurredAt), desc(id)` (VERIFIED incl. backdated ordering) |
| MOVE-05 | Card/employee always show current holder; status+event atomic | Projection written in the SAME transaction as the event (rollback proven by injected failure — VERIFIED) |
| REG-04 | Status set only via actions; disposed stays in DB with history | Action matrix = exactly the legal transitions of `devices_status_ck`; no UI/code path writes status outside the 7 actions; disposed view-only (server guards too) |
| EMP-02 | Employee card with issued devices list | Two batched queries: assigned devices by holder + `max(occurred_at)` per device for «выдано {дата}» (VERIFIED single-query pattern) |
| REG-05 | Photos on card, thumbnails in lists | Photo pipeline (VERIFIED sharp execution); devices-list leading thumbnail via batched second query over the 20 page ids (VERIFIED) |
</phase_requirements>

## Project Constraints (from CLAUDE.md / AGENTS.md)

| Directive | Consequence for this phase |
|-----------|---------------------------|
| **Read `node_modules/next/dist/docs/` before writing Next code** (this Next differs from training data) | Done this session: route-handler `context.params` is a **Promise**; Server Actions have **1MB default bodySizeLimit**; `sharp` is in the **default `serverExternalPackages`** list; client refresh = `useRouter().refresh()` from `next/navigation` |
| **Новых миграций НЕТ** (E-02) | `drizzle-kit push/generate` forbidden; attachments has a single `storageKey` (no thumbPath column) → thumbnail path MUST be derived from storageKey by convention |
| Server Actions: `requireSession()` first line + zod whitelist | All 6 custody actions; Route Handlers are also directly POST-able → same guard first line |
| `refresh()` after every mutating action / `router.refresh()` after route-handler mutation | Without it the card/list stays stale (Next 16 behavior) |
| Russian inline strings, no i18n; `Intl.*('ru')` | Copy table of 04-UI-SPEC is byte-exact; `pluralDevices` already in `lib/ru.ts` |
| `data/` volume = entire state; backup already copies `uploads/` | Uploads root default `./data/uploads` (dir already exists; scripts/backup.mjs handles it) |
| React-19 form-reset echo pattern (4886f6a) | Applies to ALL 6 custody dialogs. NOTE: `app/(app)/employees/actions.ts` has NO echo yet (verified by grep) — CONTEXT says apply the fix «к формам сотрудников заодно» |

## Summary

Phase 4 is the transactional core: seven state-changing actions, each writing an append-only `movements` event and the `devices` projection **inside one `db.transaction`**, plus the photo subsystem (upload pipeline, authorized serving, deletion) and three read surfaces (timeline, issued-devices list, list thumbnails). The schema, append-only triggers, indexes (`movements_device_occurred_idx`), status CHECK, and UI placeholders all exist — this phase is pure feature code over a frozen migration.

The custody mechanics were verified by executing a scratch vitest suite against the real stack this session: conditional-update guards (`UPDATE … WHERE id AND status=<precondition>` → `.changes` decides) reject illegal transitions with zero side effects; a mid-flight injected failure inside `db.transaction` rolls back **both** the events and the projections (E-07 atomicity proven); the append-only triggers RAISE(ABORT) on any UPDATE/DELETE; the timeline sorts correctly for backdated events via `ORDER BY occurredAt DESC, id DESC`; and the batched `max(occurred_at)` / thumbnail group-by queries run as single statements per page.

The photo pipeline was verified by executing sharp 0.35.4 in a sandbox: the default output of a re-encode strips **all** EXIF/GPS/ICC metadata (E-06 satisfied by construction — no explicit stripping code needed), `.rotate()` with no argument applies the EXIF Orientation to pixels and removes the tag (portrait 1000×2000 + orientation 6 → landscape 1600×800), `fit:'inside'` + `withoutEnlargement:true` never upscales, and garbage input is rejected with a catchable error. Uploads must go through a **Route Handler, not a Server Action**: Server Actions cap request bodies at 1MB by default (bundled `serverActions.md`), Route Handlers have no such limit, and `sharp` is auto-externalized by Next (no config change).

**Primary recommendation:** one `db/queries/movements.ts` + one `db/queries/attachments.ts` (pure, vitest-testable), six thin Server Actions in `app/(app)/devices/actions.ts` + return-all in employees' actions, photo logic in `lib/photos.ts` (sharp pipeline + path derivation) behind `app/api/devices/[id]/photos/route.ts` (POST) and `…/[attachmentId]/route.ts` (GET serve, DELETE), client resize island on the device card ending in `router.refresh()`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Custody transitions (7 actions, guards, atomicity) | API/Backend (Server Actions) | Database (Drizzle tx) | Guards + event+projection must be one server-side transaction; client only opens dialogs |
| Timeline render (newest-first, names from/to) | Frontend Server (RSC) | Database | Server Component reads movements on the card; plain text, no client state |
| Issued-devices list + return-all trigger | Frontend Server (RSC) + API/Backend (action) | Database | RSC queries; return-all is a Server Action (atomic tx) |
| Photo upload (resize, re-encode, EXIF strip, store) | Browser (canvas resize) + API/Backend (route handler + sharp) | Database (metadata), Disk (bytes) | Client resize saves bandwidth; server re-encode is the trust boundary; bytes on disk per E-06 |
| Photo serving (auth, headers, cache) | API/Backend (Route Handler GET) | Disk | Never static files (E-06); per-request session check |
| Photo delete | API/Backend (Route Handler DELETE) | Database + Disk | Row delete + file unlink; explicitly NOT a history event (E-05) |
| Action dialogs (6), picker, lightbox, photo grid | Browser/Client (islands) | API/Backend | `useActionState` for the 6 dialogs; fetch + `router.refresh()` for photo operations |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.3 (installed) | Route Handlers (upload/serve/delete), Server Actions, RSC | Project runtime; route-handler shapes verified in bundled docs |
| react | 19.2.8 (installed) | `useActionState` dialogs; client photo island | Ships with Next 16 |
| drizzle-orm | 0.45.2 (installed) | Transactions, `alias()` double-join, batched aggregates | All patterns VERIFIED executed this session |
| better-sqlite3 | 13.0.3 (installed) | Sync driver; `db.transaction` rollback semantics | VERIFIED (mid-flight throw → full rollback) |
| **sharp** | **0.35.4 (install this phase)** | Re-encode, auto-orient, EXIF strip, thumbnails | Prescribed by STACK.md; pipeline VERIFIED executed at this exact version |
| zod | 4.5.4 (installed) | Action/route input whitelists | Established pattern |
| Web Canvas / `createImageBitmap` | browser built-in | Client-side downscale ≤1600px | Zero-dependency; orientation handled by spec default (MDN) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Intl.DateTimeFormat('ru-RU')` / `Intl.PluralRules('ru')` | Node built-in | Timeline meta «03.09.2026, 15:53» (VERIFIED format string); `pluralDevices` already exists | Timeline + employee card |
| `node:fs/promises` (`writeFile`, `unlink`, `mkdir`, `readFile`) | Node built-in | Photo bytes on disk | Upload/serve/delete handlers |
| `components/ui/combobox.tsx` | installed | Employee picker (re-parametrized, NO create-option) | Assign/transfer dialogs; `ComboboxEmpty` for the zero-employees hint |
| `crypto.randomUUID()` | Node/browser built-in | Storage filenames | Upload handler (both tiers have it) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Route Handler upload | Server Action + `bodySizeLimit: '5mb'` | SA needs a config bump, still buffers the whole body through the action encoder; route handler is the natural multipart path with no limit. Decision: **route handler** |
| Plain `<img>` for photos | `next/image` | Files are already sized at upload (1600px + 400px thumb); the optimizer would re-fetch/re-process through `/api` per request. Decision: **plain `<img>` + `loading="lazy"` + immutable private cache** |
| `canvas.toBlob` resize | `createImageBitmap` + `OffscreenCanvas.convertToBlob` | OffscreenCanvas lacks Safari `<16.x` polish; classic canvas is universally safe. Decision: classic canvas |
| WebP output | JPEG output | JPEG q80 is the universal default (HEIC sources, older LAN browsers); WebP saves ~20% but adds nothing here. Decision: **JPEG q80** for both full and thumb (mimeType column says `image/jpeg`) |
| SQLite bare-column `min(id)` trick for thumbnails | JS grouping of an `ORDER BY id` query over ≤20 device ids | Bare-column-with-min is a documented SQLite idiom but obscure; JS grouping is obvious. Either works — planner picks one, JS group recommended |

**Installation (the only new package this phase):**
```bash
npm install sharp@0.35.4
```

**Version verification (done this session):** `npm view sharp version` → 0.35.4 (modified 2026-08-26); `dist-tags.latest` = 0.35.4; `scripts.postinstall` → none.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| sharp | npm | release 2026-08-26 (churn) | 93.9M/wk | github.com/lovell/sharp | SUS (too-new) | Flagged — canonical package from its official repo, massive adoption, not deprecated, `postinstall: null` (seam signals verified). Prescribed by approved STACK.md. Planner inserts `checkpoint:human-verify` before install per protocol |

`sharp` [WARNING: flagged as suspicious — verify before using.] The flag is `too-new` release-churn noise (same nature as shadcn/lucide in phase 2), not a trust signal. Additionally verified by execution: `npm install sharp@0.35.4` in a sandbox installed prebuilt binaries in 3s and the full pipeline ran on Node 22.23.0.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** sharp — planner inserts checkpoint:human-verify before install

## Architecture Patterns

### System Architecture Diagram

```
┌─ Browser ──────────────────────────────────────────────────────────────┐
│ Device card RSC ── action row (status matrix) ── 6 custody dialogs      │
│      │ useActionState                   photo grid island:              │
│      ▼                                  add tile (file input) → canvas  │
│ POST Server Actions                     resize ≤1600 → JPEG blob        │
│   (assign/return/transfer/                │ fetch POST multipart         │
│    to_repair/from_repair/                 ▼                              │
│    dispose) ◄─ refresh()          /api/devices/[id]/photos  (POST)      │
│ Employee card ── return-all dialog ──► Server Action (one tx, N events) │
└──────────┬─────────────────────────────────────────────────────────────┘
           ▼
┌─ Next server (proxy.ts perimeter + requireSession everywhere) ─────────┐
│ Server Actions ──► db/queries/movements.ts                             │
│   db.transaction:                                                      │
│     1. guard UPDATE devices SET status,holder WHERE id AND status=P    │
│        (.changes===0 → reject: no event, no projection)                │
│     2. INSERT movements(eventType fixed per action, from/to, comment,  │
│        occurredAt ≤ now)                                               │
│   refresh()                                                            │
│                                                                        │
│ Photo POST route: requireSession → device exists, not disposed,        │
│   count<8 → sharp(.rotate().resize inside ≤1600/.jpeg q80) →           │
│   EXIF/GPS/ICC stripped → write data/uploads/<deviceId>/<uuid>.jpg     │
│   + .thumb.jpg (400px) → INSERT attachments → router.refresh() (client)│
│                                                                        │
│ Photo GET /api/devices/[id]/photos/[attachmentId]?variant=thumb:       │
│   requireSession → row(deviceId+attachmentId match) → path contained   │
│   under uploads root → readFile → 200 binary                           │
│   Cache-Control: private, max-age=31536000, immutable                  │
│ Photo DELETE: same guards → DELETE row → unlink both files             │
│   (NOT a movement event — E-05)                                        │
│                                                                        │
│ RSC reads: timeline (alias from/to join), attachments+count,           │
│   issued devices + latest assigned dates, list page thumbnails         │
└──────────┬─────────────────────────────────────────────────────────────┘
           ▼
   SQLite (WAL, FK ON) — movements (append-only triggers), attachments,
   devices (status CHECK)          data/uploads/<deviceId>/*.jpg on disk
```

### Recommended Project Structure
```
app/(app)/devices/
├── actions.ts                  # MODIFY: + assign/return/transfer/toRepair/fromRepair/dispose actions
├── device-dialog.tsx           # (existing, untouched)
└── (card)/devices/[id]/
    ├── page.tsx                # MODIFY: action row matrix, timeline group, photo section island,
    │                           #   dialog mounting (pickers need active-employees prop)
    ├── movement-dialogs.tsx    # NEW client: the 6 custody dialogs (useActionState, echo values)
    ├── timeline.tsx            # NEW server component (or inline section): vertical timeline
    └── photo-section.tsx       # NEW client: grid, add tile, lightbox, delete confirm, fetch+refresh
app/(app)/employees/
├── actions.ts                  # MODIFY: + returnAllDevicesAction (+ echo-values fix, known issue)
└── (card)/employees/[id]/page.tsx  # MODIFY: issued list + return-all confirm
app/api/devices/[id]/photos/
├── route.ts                    # NEW: POST (upload)
└── [attachmentId]/route.ts     # NEW: GET (serve ?variant=thumb|full), DELETE
db/queries/
├── movements.ts                # NEW: transition fns, timeline, issued list, return-all (pure, testable)
└── attachments.ts              # NEW: count, list by device, insert, delete, batch thumbs (pure)
lib/
├── photos.ts                   # NEW: UPLOADS_DIR resolution, storageKey/thumbKey derivation,
│                               #   sharp processPhoto(buffer) → {full, thumb, width, height}
└── movement-schema.ts          # NEW: eventType vocabulary + labels (ru) + zod pieces (comment ≤500,
                                #   occurredAt regex + not-future refine) — single source for dialogs & actions
tests/
├── movements-queries.test.ts   # NEW Wave 0
└── attachments-queries.test.ts # NEW Wave 0 (+ photo pipeline test, sharp in node env)
scripts/smoke-custody.mjs       # NEW (optional, follows smoke-devices.mjs: perimeter + photo route 401/200)
```

### Pattern C1: Custody transition = guard UPDATE + event INSERT in ONE transaction
**What:** The canonical ARCHITECTURE.md sketch, made defensive: the projection write IS the guard (conditional on the precondition status), and `.changes` decides — no read-then-write race window.
**When to use:** All 6 actions + each unit inside return-all.
**VERIFIED executed this session** (scratch vitest against installed deps):
```ts
// db/queries/movements.ts — VERIFIED: guard rejects with zero side effects
export function assignDevice(input: { deviceId: number; toEmployeeId: number;
  comment: string | null; occurredAt: Date }): void {
  db.transaction((tx) => {
    const upd = tx.update(devices)
      .set({ status: 'assigned', currentEmployeeId: input.toEmployeeId, updatedAt: new Date() })
      .where(and(eq(devices.id, input.deviceId), eq(devices.status, 'in_stock')))
      .run()
    if (upd.changes === 0) throw new MovementGuardError() // E-08 server side
    tx.insert(movements).values({
      deviceId: input.deviceId, eventType: 'assigned',
      toEmployeeId: input.toEmployeeId, comment: input.comment,
      occurredAt: input.occurredAt,                    // createdAt stays = now (append-only honesty)
    }).run()
  })
}
```
A mid-flight `throw` inside `db.transaction` rolled back ALL inserts and updates (VERIFIED) — the action maps `MovementGuardError` to the specific dialog error copy, everything else to «Не удалось …. Попробуйте ещё раз.»

### Pattern C2: The transition matrix (the single source of the 7 actions)

| Action (event) | Precondition (status) | fromEmployeeId | toEmployeeId | Post projection | Notes |
|---|---|---|---|---|---|
| Выдать (`assigned`) | `in_stock` | NULL | employeeId — active | `assigned`, holder=to | E-08: hidden on assigned, guard re-checks |
| Принять (`returned`) | `assigned` | current holder | NULL | `in_stock`, holder=NULL | |
| Передать (`transferred`) | `assigned` | current holder | new — active, ≠ current | `assigned`, holder=to | dialog shows «Сейчас у: {Имя}» |
| В ремонт (`to_repair`) | `in_stock` OR `assigned` | holder (nullable) | NULL | `repair`, holder=NULL | E-04: auto-accept from holder |
| Из ремонта (`from_repair`) | `repair` | NULL | NULL | `in_stock` | |
| Списать (`disposed`) | `in_stock` OR `assigned` OR `repair` | holder (nullable) | NULL | `disposed`, holder=NULL | reason = movements.comment; terminal (E-03) |
| Вернуть всю технику (`returned` ×N) | per device `assigned` AND holder=this employee | employeeId | NULL | per device `in_stock`, holder=NULL | one tx (Pattern C3) |

This matrix is exactly the 04-UI-SPEC button matrix; every status value written is inside `devices_status_ck`. `eventType` is NEVER read from the client — each action hardcodes its own.

### Pattern C3: «Вернуть всю технику» — one transaction, N events (E-07)
**VERIFIED executed:** with 2 assigned devices and an injected failure after the first unit, both devices stayed assigned and zero events survived.
```ts
export function returnAllDevices(employeeId: number, occurredAt: Date): number {
  return db.transaction((tx) => {
    const rows = tx.select({ id: devices.id }).from(devices)
      .where(and(eq(devices.currentEmployeeId, employeeId), eq(devices.status, 'assigned')))
      .all()
    for (const d of rows) {
      tx.insert(movements).values({ deviceId: d.id, eventType: 'returned',
        fromEmployeeId: employeeId, occurredAt }).run()
      tx.update(devices).set({ status: 'in_stock', currentEmployeeId: null })
        .where(eq(devices.id, d.id)).run()
    }
    return rows.length // action ends with refresh(); error copy promises atomic rollback
  })
}
```
Works for archived employees too (offboarding = archive + return-all); the button shows whenever count ≥ 1 (04-UI-SPEC does not gate it on `isActive`).

### Pattern C4: Timeline query — alias double-join, occurredAt order
**VERIFIED executed**, including tie-breaking and backdated ordering:
```ts
import { alias } from 'drizzle-orm/sqlite-core'
const fromEmp = alias(employees, 'from_emp')
const toEmp = alias(employees, 'to_emp')

export function listMovements(deviceId: number) {
  return db.select({
    id: movements.id, eventType: movements.eventType, comment: movements.comment,
    occurredAt: movements.occurredAt,
    fromName: fromEmp.name, toName: toEmp.name,        // archived employees render as text (UI-SPEC)
  }).from(movements)
    .leftJoin(fromEmp, eq(movements.fromEmployeeId, fromEmp.id))
    .leftJoin(toEmp, eq(movements.toEmployeeId, toEmp.id))
    .where(eq(movements.deviceId, deviceId))
    .orderBy(desc(movements.occurredAt), desc(movements.id))  // id breaks ties; NEVER order by id alone
    .all()
}
```
Backdated events sort by `occurredAt`, not insertion order — VERIFIED (assigned-yesterday inserted after received-today renders second). The newest item's dot gets `bg-ink-secondary` (first row of the result).

### Pattern C5: Photo pipeline (E-05/E-06)

**Client resize (photo-section island):**
```ts
// VERIFIED semantics per MDN/WHATWG: imageOrientation:'from-image' is the
// DEFAULT — EXIF orientation is baked into the bitmap on Chrome 81+,
// Safari 13.1+, Firefox 77+. Canvas output carries NO EXIF, so the server's
// autoOrient becomes a harmless no-op (double safety, not double rotation).
async function resizeToJpeg(file: File, maxEdge = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file)          // HEIC: iOS Safari picker
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.85))
}
```
Upload = `fetch(url, { method: 'POST', body: formData })` per file, sequential; success → `router.refresh()`; failure → «Не удалось загрузить фото. Попробуйте ещё раз.» with `role=alert`.

**Server pipeline (`lib/photos.ts`) — VERIFIED executed with sharp 0.35.4:**
```ts
// Source: sharp.pixelplumbing.com api-output ("By default all metadata will be
// removed, which includes EXIF-based orientation") + api-operation (rotate() no-arg
// = autoOrient: applies EXIF Orientation, then removes the tag) — all EXECUTED:
export async function processPhoto(input: Buffer) {
  const full = sharp(input).rotate()                                  // auto-orient + strip tag
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
  const thumb = sharp(input).rotate()
    .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
  return { full: await full.toBuffer(), thumb: await thumb.toBuffer() }
}
// EXECUTED results: 1000x2000+orient6 → 1600x800 landscape, orientation tag NONE,
// exif:false gps:false icc:false; 800x600 stayed 800x600 (no enlargement);
// 3000x2000 → 1600x1067; garbage buffer → thrown 'unsupported image format'
// (use sharp(input).metadata() up front as the magic-byte gate with a Russian 415 mapping).
```
Execution order in the POST handler (no broken rows ever; orphan-file direction is the harmless one):
1. `requireSession()` → parse `{id}` (positive int) → device exists AND `status !== 'disposed'` (E-03 server side)
2. `countAttachments(deviceId) >= 8` → reject («Не удалось загрузить фото…» or a dedicated copy if planner prefers; UI hides the tile at 8/8)
3. read body via `request.formData()`; size sanity ≤ ~10MB; `sharp(file).metadata()` gate
4. `processPhoto` → `mkdir uploads/<deviceId> recursive` → `writeFile(<uuid>.jpg, full)` + `<uuid>.thumb.jpg` (thumb) — `storageKey` stores the FULL path key; **thumb key = derive by suffix** (`<uuid>.thumb.jpg`) via one helper in `lib/photos.ts` (schema has a single `storageKey`, no migrations allowed)
5. `db.transaction`: cap re-check + INSERT attachments `{fileName: file.name, mimeType: 'image/jpeg', byteSize: full.length, kind: 'photo', storageKey}`
6. on ANY failure after step 4 → `unlink` both files, then map to the error copy

**Serving route (`[attachmentId]/route.ts` GET):** `requireSession()` → row must match BOTH `attachmentId` AND URL `deviceId` (IDOR) → resolve absolute path, then assert it is contained under `UPLOADS_DIR` (defense against a tampered `storageKey`) → `readFile` → respond:
```ts
new Response(new Uint8Array(buf), { headers: {
  'Content-Type': row.mimeType ?? 'image/jpeg',           // only ever image/jpeg we wrote
  'Content-Length': String(buf.length),
  'Cache-Control': 'private, max-age=31536000, immutable', // uuid names, content never changes; PRIVATE = behind auth
  'X-Content-Type-Options': 'nosniff',
  'Content-Disposition': 'inline',
} })
```
(`?variant=thumb` serves the derived thumb key; missing file → 404. TS nit: wrap the Node Buffer in `new Uint8Array(...)` for the `BodyInit` type.)

**DELETE:** same guards (device not disposed, row matches deviceId) → DELETE row → `unlink` full + thumb (`ENOENT` tolerated, never fails the request). Writes nothing to `movements` (E-05). Client `router.refresh()`.

### Pattern C6: Employee card issued list (EMP-02) + list thumbnails (REG-05)
**VERIFIED executed (batched, one query each):**
```ts
// 1. issued devices of one employee
const issued = db.select({ id: devices.id, model: devices.model, serialNumber: devices.serialNumber })
  .from(devices)
  .where(and(eq(devices.currentEmployeeId, employeeId), eq(devices.status, 'assigned')))
  .orderBy(ruSortKey).all()
// 2. «выдано {dd.mm.yyyy}» — latest assigned event per device, ONE grouped query
const latest = db.select({ deviceId: movements.deviceId,
    lastAt: sql<number>`max(${movements.occurredAt})` })   // returns raw unixepoch int
  .from(movements)
  .where(and(eq(movements.eventType, 'assigned'),
             inArray(movements.deviceId, issued.map((d) => d.id))))
  .groupBy(movements.deviceId).all()
// list thumbnails: same shape over the 20 page ids — count is implicit (presence)
// + first attachment per device (ORDER BY attachments.id, group in JS; ≤20 rows)
```
`attachments` has **no index on device_id** (and none can be added — no migrations). A grouped scan over a few thousand rows per page render is milliseconds at this scale; the batched-by-page pattern keeps it to one scan.

### Pattern C7: occurredAt (E-01) — date-only input, real moment stored
- zod: `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` (same shape as `purchaseDate`) + a server-side refine `occurred ≤ now` → inline copy «Дата не может быть в будущем» (client `max` attr is bypassable — server is authoritative).
- Construction: submitted today → `new Date()`; backdated → chosen y/m/d + **now's** h:m:s (`new Date(y, m-1, d, now.getHours(), …)`), so «выдано вчера» keeps a plausible time-of-day and ordering stays stable.
- `movements.createdAt` stays `= now` always — the row records when the correction was made, `occurredAt` when it happened (append-only honesty).
- Display: `new Intl.DateTimeFormat('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })` → VERIFIED «03.09.2026, 15:53» (exactly the UI-SPEC meta format). Date-only variant for «выдано {дата}».
- ⚠️ Formatter without `timeZone` reads the **host** TZ (UTC inside the Docker container). Decide once: either pass an explicit `timeZone` in one shared formatter, or set `TZ` (e.g. `Europe/Moscow`) in compose/.env. Existing card formatters use `timeZone: 'UTC'` for UTC-midnight date-only columns — do NOT reuse them for occurredAt (it would show 03:00 times).

### Pattern C8: The 6 dialogs follow the established mutation dialog shape
Same `useActionState` machinery as device/employee dialogs: `(prev, formData) → state`, zod whitelist per action (`deviceId`, `employeeId?`, `comment ≤500 optional` (dispose: required, it IS the comment), `occurredAt`), echo values on failure (React-19 form reset), `refresh()` on success, close on `ok`. Employee picker = existing combobox re-parametrized (`items` = active employees id+name, `filter` kept for search, NO pinned create row, `ComboboxEmpty` = «Нет активных сотрудников…»). Server needs `listActiveEmployees()` (id, name; SQL ru-sort like phase 2). Side-fix in scope per CONTEXT: `app/(app)/employees/actions.ts` currently has NO echo values (verified) — apply the 4886f6a pattern there too.

### Anti-Patterns to Avoid
- **Server Action for photo upload:** 1MB default `bodySizeLimit` (bundled serverActions.md) — use the Route Handler.
- **`ORDER BY id` on the timeline** (or trusting insertion order): backdating (E-01) makes `occurredAt` the only truth — `occurredAt DESC, id DESC`.
- **Writing the projection unconditionally then inserting the event:** the conditional UPDATE is the guard; an unconditional write corrupts state on any illegal invocation (direct POST).
- **Keeping EXIF handling client-only:** client checks are bypassable and non-WebKit browsers can't decode HEIC — sharp re-encode is the trust boundary and the EXIF guarantee.
- **`Cache-Control: public` on photo responses:** auth'd content — `private, immutable`.
- **Serving photos from `public/`:** bypasses auth entirely (E-06, ARCHITECTURE Anti-Pattern 5).
- **Photo delete writing a movement event:** attachments are not history (E-05).
- **`toISOString().slice(0,10)` for the date-input prefill:** that is the UTC date — wrong after 00:00 UTC±offset; build the local `yyyy-mm-dd` from local parts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image decode / resize / re-encode | Manual pixel loops, canvas-only server path | sharp 0.35.4 | libvips speed, format support, prebuilt binaries; pipeline VERIFIED |
| EXIF strip | Manual EXIF parser/scrubber | sharp default output | Metadata removal is the DEFAULT; manual stripping always misses ICC/XMP corners |
| EXIF orientation | Manual rotation matrices / exif libs | sharp `.rotate()` (autoOrient) + browser `from-image` default | Both sides apply-and-remove; documented + executed |
| Thumbnail generation | Second code path | Same sharp recipe at 400px | One pipeline, two sizes |
| Atomic multi-write | Application-level "undo" logic | `db.transaction` rollback | VERIFIED: mid-flight throw reverts everything |
| Illegal-transition protection | if-checks scattered in actions | Conditional UPDATE + `.changes` | One guard shape for all 7 actions |
| Append-only enforcement | App-code discipline alone | Existing DB triggers (RAISE ABORT) | Already in migration 0000; test exists in schema.test.ts |
| A11y dialog/lightbox/combobox | Custom focus management | shadcn dialog + combobox (Base UI) | Focus trap/return, ESC, aria — invisible in happy-path testing |
| RU dates/plurals | Custom formatters | `Intl.DateTimeFormat/PluralRules('ru')` (lib/ru.ts has pluralDevices) | «03.09.2026, 15:53» verified; 21/22/25 plurals handled |

**Key insight:** the genuinely hard parts of this phase — atomicity, immutability, orientation, metadata hygiene — are all already solved by existing primitives (transaction, triggers, sharp, browser defaults). Every hand-rolled alternative in this domain has a documented failure mode (double rotation, GPS leak, half-written custody state).

## Runtime State Inventory

Omitted: greenfield feature phase — no rename/refactor/migration. Schema is frozen (E-02, verified: `drizzle/` = 0000 only; `movements`/`attachments`/triggers/indexes all present; `data/uploads/` exists, empty, and is already covered by `scripts/backup.mjs` and the compose volume comment).

## Common Pitfalls

### Pitfall 1: Upload via Server Action hits the 1MB wall
**What goes wrong:** Photo POST through a Server Action fails (or silently truncates) for real phone photos after client resize is skipped for large images.
**Why:** Default `experimental.serverActions.bodySizeLimit = 1MB` — includes multipart overhead (bundled serverActions.md).
**Avoid:** Route Handler for upload; keep ~10MB server sanity cap.
**Warning signs:** 413/«Body exceeded 1 MB limit» in dev logs.

### Pitfall 2: Stale UI after photo upload/delete
**What goes wrong:** Files stored, row inserted — grid unchanged until reload.
**Why:** Route Handlers, unlike actions ending in `refresh()`, re-render nothing; the client must ask.
**Avoid:** `router.refresh()` from `next/navigation` after every successful fetch (VERIFIED semantics: re-renders Server Components, keeps client state).
**Warning signs:** manual F5 "fixes" the grid.

### Pitfall 3: Guard written as read-then-branch
**What goes wrong:** A crafted direct POST slips an illegal transition (e.g. Выдать on assigned) through a check-then-act window; event and projection disagree.
**Avoid:** the conditional UPDATE (Pattern C1) — `.changes === 0` rejects with zero writes; single SQL statement, no window.
**Warning signs:** any `SELECT status` followed by an unconditional `UPDATE` in a transition function.

### Pitfall 4: Timeline order breaks for backdated events (E-01)
**What goes wrong:** «Закупил вчера, выдал вчера» shows after today's events, or ties shuffle between renders.
**Avoid:** `orderBy(desc(occurredAt), desc(id))` — VERIFIED; never `desc(id)` alone.
**Warning signs:** timeline order differs from the dates printed on it.

### Pitfall 5: occurredAt validation only in the browser
**What goes wrong:** Future dates (or garbage) land in the timeline via direct POST.
**Avoid:** server zod refine `≤ now` + regex; inline copy «Дата не может быть в будущем» / «Введите корректную дату».
**Warning signs:** tests only covering the happy path.

### Pitfall 6: Path/ID confusion on photo routes (IDOR + traversal)
**What goes wrong:** `/api/devices/1/photos/7` serves or deletes another device's attachment; a tampered `storageKey` reads outside the uploads root.
**Avoid:** row must match BOTH path ids; assert the resolved absolute path stays under `UPLOADS_DIR`; never build paths from client data.
**Warning signs:** any handler that trusts `attachmentId` alone or interpolates `storageKey` without containment.

### Pitfall 7: 8-photo cap races or is client-only
**What goes wrong:** Two parallel uploads land 9 photos; or the hidden tile is the only limit.
**Avoid:** cap re-check + INSERT inside one `db.transaction` (Pattern C5 step 5); client hides the tile at 8/8 as UX only.
**Warning signs:** counter «9 из 8» in UAT.

### Pitfall 8: Thumb path drift
**What goes wrong:** Serve route and delete route derive the thumbnail filename differently → 404 thumbs or orphaned files.
**Why:** schema has a single `storageKey` (no migration possible).
**Avoid:** one `thumbKeyOf(storageKey)` helper in `lib/photos.ts`; convention `<uuid>.thumb.jpg` beside the full file.
**Warning signs:** `.thumb` logic duplicated anywhere.

### Pitfall 9: Server TZ leaks into times
**What goes wrong:** Container shows «15:53» as «12:53» (UTC) or the card mixes UTC-midnight date formatters with real-moment times.
**Avoid:** one shared occurredAt formatter family (Pattern C7) + explicit TZ decision (formatter `timeZone` or compose `TZ` env).
**Warning signs:** times that match nobody's wall clock in UAT.

### Pitfall 10: Disposed device accepts mutations
**What goes wrong:** Photo upload/delete or a custody action on a `disposed` device via direct POST, breaking E-03 view-only.
**Avoid:** every photo handler and custody action first reads the row and rejects `disposed` (custody actions reject via status guards anyway); UI hides all affordances.
**Warning signs:** any handler with no status awareness.

### Pitfall 11: HEIC from a non-Safari browser
**What goes wrong:** Chrome/Firefox cannot decode HEIC → `createImageBitmap` rejects → upload dies with an unexplained error.
**Why:** iOS Safari auto-transcodes HEIC→JPEG in the file picker (iOS 13+) and decodes HEIC natively; Chromium/Firefox never learned HEIC; sharp cannot decode it either (no libheif).
**Avoid:** map the client-resize failure AND the server magic-byte rejection to «Не удалось загрузить фото. Попробуйте ещё раз.»; known limitation, primary user is iPhone/Safari (PITFALLS Pitfall 7 reasoning).
**Warning signs:** testing the picker on desktop Chrome with a .heic file.

## Code Examples

See Patterns C1–C8 above — all executed this session against installed dependencies or verified against bundled Next docs / sharp official docs. Additional wiring shapes:

**Route handler skeleton (Next 16 — params is a Promise):**
```ts
// Source: node_modules/next/dist/docs/.../route.md (bundled, verified)
export async function GET(request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  await requireSession()
  const { id, attachmentId } = await params
  // z.coerce.number().int().positive() both; 404/400 mapping per card-page precedent
}
```

**Client island refresh:**
```ts
// Source: node_modules/next/dist/docs/.../use-router.md (bundled, verified)
const router = useRouter()
// after fetch ok:
router.refresh()
```

**Vitest executes sharp** (node env, no jsdom needed): synthesize input images with `sharp({ create: {...} }).jpeg().withMetadata({ orientation: 6 })` — done in this research's sandbox; same technique works in `tests/photo-process.test.ts`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Server Action for uploads (+ `bodySizeLimit` bump) | Route Handler POST (no limit, natural multipart) | documented Next 16 config | Upload lives under `/api/devices/[id]/photos` |
| `sharp().withMetadata()` to keep EXIF, manual strip to remove | Default output strips ALL metadata; `.rotate()` no-arg = autoOrient | sharp 0.33+ (autoOrient public API); 0.35.4 installed | EXIF/GPS strip is free; orientation one call |
| Manual EXIF-orientation JS libs (`blueimp-load-image`, `get-orientation`) | `createImageBitmap` default `imageOrientation:'from-image'` | Chrome 81 / Safari 13.1 / Firefox 77 (2020) | No orientation library; never hand-rotate |
| HEIC WASM decoders (libheif) for iPhone uploads | iOS picker auto-transcodes HEIC→JPEG; Safari decodes natively | iOS 13+ / Safari 17 | No decoder dependency; non-WebKit HEIC = clean error path |
| `next/image` for all images | Plain `<img>` for pre-sized auth'd files | this design | No optimizer hop; immutable private caching |
| `middleware.ts` gating | `proxy.ts` (already in place, covers `/api/*`) | Next 16 | Nothing to do — new routes inherit the perimeter |

**Deprecated/outdated to avoid:** `reset` prop on error boundaries (use `retry` — established phase 2); any `image-orientation` CSS workarounds (default behavior since 2020).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Timeline/display times may render in host TZ (UTC in Docker); planner picks formatter `timeZone` or compose `TZ=Europe/Moscow` | Pattern C7, Pitfall 9 | Cosmetic-but-visible: wrong times in UAT; one-line fix either way |
| A2 | Disposed devices reject photo upload/delete server-side (UI hides affordances; server guard assumed consistent with E-03 «только просматривается») | Pattern C5, Pitfall 10 | Low: extra rejection is defensive, never breaks legit flow |
| A3 | `Buffer` → `new Uint8Array(buf)` needed for `Response` body typing (TS DOM lib nit; runtime accepts Buffer directly) | Pattern C5 serving | Trivial: type cast alternative |
| A4 | Sequential per-file upload (no parallel Promise.all) is acceptable UX for ≤8 phone photos | Pattern C5 | Low: only affects upload duration |
| A5 | Single `attachments.device_id`-less scan per page render stays milliseconds at hundreds of devices (no index addable) | Pattern C6 | Low: revisit only at ~10K devices (out of project lifetime) |
| A6 | Return-all button visible for archived employees with issued devices (UI-SPEC gates on count only) | Pattern C3 | Low: narrower behavior would need a UI-SPEC change |

## Open Questions

1. **Display timezone for occurredAt (A1)**
   - What we know: existing formatters use `timeZone:'UTC'` for date-only columns; occurredAt carries a real time; container runs UTC unless `TZ` set.
   - What's unclear: user's expected wall-clock base (office presumably Moscow).
   - Recommendation: planner locks one option in the plan (shared formatter with explicit `timeZone` OR `TZ` env in compose/.env); either is a one-line decision documented next to Pattern C7.

2. **Dedicated copy for cap/format rejections vs the single «Не удалось загрузить фото…»**
   - What we know: UI-SPEC defines one upload error copy; the server can distinguish (cap, format, size).
   - What's unclear: whether distinct Russian copy is wanted.
   - Recommendation: ship the single UI-SPEC copy for v1 (contract compliance); distinct messages only if UAT asks.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | 22.23.0 (sharp 0.35.4 prebuilt loaded in sandbox on this Node) | — |
| sharp | photo pipeline | ✗ not installed yet — Wave 0 task | 0.35.4 (latest, verified on registry) | none (core to E-06); checkpoint:human-verify first |
| data/uploads/ | photo storage | ✓ (exists, empty; backup + compose volume already cover it) | — | — |
| next / drizzle / better-sqlite3 / zod / vitest | framework | ✓ | 16.3.3 / 0.45.2 / 13.0.3 / 4.5.4 / 4.1.11 (installed) | — |
| Web Canvas / createImageBitmap | client resize | ✓ (browser API; Chrome 81+/Safari 13.1+ per MDN) | — | error path (Pitfall 11) |
| Network | `npm install sharp` | ✓ (sandbox install succeeded this session) | — | offline blocks Wave 0 → install first |

**Missing dependencies with no fallback:** none blocking (sharp pending install with checkpoint).
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 (installed, node env, `@/` alias + server-only stub) |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npx vitest run tests/movements-queries.test.ts tests/attachments-queries.test.ts` |
| Full suite command | `npx vitest run && npm run build` |
| Fixtures | `tests/helpers.ts`: `createTempDb()` + `applyMigrations()` + `insertDevice()` — direct reuse; sharp synthesizes its own inputs |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MOVE-01/03 | assign: guard rejects non-in_stock (no event/projection); legal path writes event+projection | unit/integration | `npx vitest run tests/movements-queries.test.ts -t 'assign'` | ❌ Wave 0 |
| MOVE-02/04 | return/transfer write correct from/to; event+projection atomic; movements UPDATE/DELETE RAISE | unit/integration | `npx vitest run tests/movements-queries.test.ts -t 'return'` | ❌ Wave 0 (trigger test exists in schema.test.ts) |
| MOVE-04/E-01 | timeline order: occurredAt DESC, id tiebreak, backdated sorts by date; alias names resolve; archived names render | unit/integration | `npx vitest run tests/movements-queries.test.ts -t 'timeline'` | ❌ Wave 0 |
| MOVE-05/E-07 | return-all: N events in one tx; injected failure rolls back ALL | unit/integration | `npx vitest run tests/movements-queries.test.ts -t 'return-all'` | ❌ Wave 0 |
| EMP-02 | issued list: assigned-only by holder; latest assigned date per device (batched) | unit/integration | `npx vitest run tests/movements-queries.test.ts -t 'issued'` | ❌ Wave 0 |
| REG-05/E-05/E-06 | attachments: 8-cap count guard; batched per-page thumbnail + count queries; processPhoto: EXIF/GPS/ICC stripped, auto-orient applied, no enlargement, thumb 400px, garbage rejected | unit/integration (sharp in node) | `npx vitest run tests/attachments-queries.test.ts` | ❌ Wave 0 |
| REG-04/E-03 | disposed: all 7 transitions reject; upload/delete guard (queries-level precondition) | unit/integration | `npx vitest run tests/movements-queries.test.ts -t 'disposed'` | ❌ Wave 0 |
| E-01 | occurredAt schema: future rejected, backdated accepted, comment ≤500 | unit | `npx vitest run tests/movements-queries.test.ts -t 'occurredAt'` (zod part) | ❌ Wave 0 |
| ACC-02 | photo routes behind session: no cookie → redirect/401; with cookie → 200 jpeg | smoke (production build) | `node scripts/smoke-custody.mjs` (follows smoke-devices.mjs: temp DB, `next start`, minted cookie, curl asserts) | ❌ optional Wave 0 |
| UI-01/UI-02 + dialogs | Russian copy, echo values, lightbox, matrix buttons, disposed view-only | manual-only | — | Justification: visual/interactive; smoke ≠ UI (standing rule); UAT against 04-UI-SPEC |

### Sampling Rate
- **Per task commit:** `npx vitest run` (suite seconds-fast)
- **Per wave merge:** `npx vitest run && npm run build` (build catches RSC/client-boundary and route-typing mistakes)
- **Phase gate:** full suite green + build before `/gsd:verify-work`; visual/dialog checks at UAT against 04-UI-SPEC

### Wave 0 Gaps
- [ ] `npm install sharp@0.35.4` — after checkpoint:human-verify (SUS churn flag; official repo, no postinstall)
- [ ] `tests/movements-queries.test.ts` — MOVE-01..05, REG-04, EMP-02 (reuses `createTempDb`/`applyMigrations`; the research scratch suite already proved every assertion shape passes)
- [ ] `tests/attachments-queries.test.ts` — cap, batched thumbs, sharp pipeline
- [ ] `lib/movement-schema.ts` + `lib/photos.ts` extracted before tests (pure modules — Pitfall 7 of phase 2: no `next/headers` imports in testable code)
- [ ] No migration, no new framework config (sharp auto-externalized by Next)

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` (config.json). Phase 4 adds the first new untrusted-input surface since phase 1: binary upload/serve/delete routes.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | phase-1 session consumed everywhere |
| V3 Session Management | yes (extends) | `requireSession()` FIRST line of every route handler and action (route handlers are direct-POST-able like actions); `SameSite=Lax` cookie is the CSRF defense for photo POST/DELETE — cross-site requests carry no session |
| V4 Access Control | yes (IDOR focus) | attachment rows must match BOTH `{deviceId}` and `{attachmentId}` from the URL; storage paths containment-checked under `UPLOADS_DIR`; single-user app so no role logic |
| V5 Input Validation | yes | zod on every route/action input; sharp `metadata()` magic-byte gate (never trust `file.type`); ≤10MB raw cap; ≤8 count cap server-side; comment ≤500; occurredAt regex + not-future |
| V6 Cryptography | no | Nothing new to hash/encrypt |
| V7 Errors/Logging | yes | Generic Russian failure strings only (UI-SPEC copy); internal sharp/fs errors never echoed; console.error server-side |
| V14 Configuration | yes | `UPLOADS_DIR` env (default `./data/uploads`) consistent with `DATABASE_PATH`/`DATA_DIR` conventions; nothing added to proxy `PUBLIC_PATHS`; `Cache-Control: private` on auth'd binaries |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Photo EXIF GPS of company premises served to LAN | Information Disclosure | sharp default output strips EXIF/GPS/ICC — VERIFIED executed; never `.withMetadata()` on photo output |
| Unauthenticated `/api/*` fetch of device photos | Spoofing/Info Disclosure | proxy matcher already covers `api/*` + `requireSession()` inside each handler (defense-in-depth, ACC-02) |
| IDOR on attachment id | Elevation/Info Disclosure | deviceId+attachmentId composite check per request |
| Path traversal via `storageKey` | Tampering/Info Disclosure | resolve + `path.relative` containment assert against uploads root; DB values never trusted for path building |
| CSWF/CSRF on photo POST/DELETE | Spoofing | `SameSite=Lax` session cookie (cross-site POST carries no cookie → requireSession redirects); Server Actions additionally origin-checked by Next |
| Upload DoS (huge/decompression-bomb files) | DoS | ≤10MB pre-parse cap; client resize; sharp pixel-limit on decode; ≤8 per device; single-user LAN scope |
| Illegal state transitions via crafted action POSTs | Tampering/Elevation | conditional-UPDATE guards (Pattern C1) + eventType hardcoded per action + zod strict whitelists; append-only triggers preserve history integrity |
| XSS via comment/names in timeline | Tampering | React text escaping; no `dangerouslySetInnerHTML` anywhere |
| MIME confusion on serve | Info Disclosure | Content-Type written by us at upload (`image/jpeg` only), `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` |

## Sources

### Primary (HIGH confidence — executed/verified this session)
- Scratch vitest suite (10/10 green, then deleted) against installed drizzle-orm 0.45.2 + better-sqlite3 13.0.3 + migration 0000: conditional-update guards, transaction rollback (injected failure), append-only RAISE(ABORT), alias double-join timeline + occurredAt ordering, backdated ordering, batched max(occurred_at), batched thumbnails, 8-cap count
- sharp 0.35.4 sandbox execution (`/tmp/sharp-verify`): EXIF/GPS/ICC strip by default, autoOrient pixel rotation + tag removal (1000×2000 orient6 → 1600×800), fit inside + withoutEnlargement, jpeg/webp q80, 400px thumb, garbage rejection, prebuilt install on Node 22.23.0
- `node_modules/next/dist/docs/` (bundled, 16.3.3): `route.md` (params Promise, RouteContext, cookies), `serverActions.md` (bodySizeLimit 1MB default), `serverExternalPackages.md` (sharp in default list), `use-router.md` (`router.refresh()` semantics)
- Codebase: `db/schema.ts` (movements/attachments/triggers/CHECK/indexes), `drizzle/0000_*.sql` (triggers + type seeds), `db/queries/{employees,devices}.ts` (query/tx patterns), `app/(app)/(card)/devices/[id]/page.tsx` + `employees/[id]/page.tsx` (placeholders to replace), `app/(app)/devices/actions.ts` (echo-values pattern), `proxy.ts`, `lib/{auth,ru}.ts`, `components/ui/combobox.tsx`, `scripts/{backup,smoke-devices}.mjs`, `compose.yml`/`Dockerfile` (data volume), `package.json` (sharp absent), `tests/helpers.ts`
- `npm view sharp` — version 0.35.4, modified 2026-08-26, no postinstall
- Node runtime: `Intl.DateTimeFormat('ru-RU', {…})` → «03.09.2026, 15:53»

### Secondary (MEDIUM confidence — official/community docs cited)
- sharp.pixelplumbing.com `/api-output`, `/api-operation`, `/api-resize` — default metadata removal wording, autoOrient, fit/withoutEnlargement semantics, quality defaults
- MDN `createImageBitmap` (`imageOrientation: 'from-image'` default) + caniuse image-orientation; SO 61390195 (Safari 13.1 auto-rotate), SO 64093027 (iOS picker HEIC→JPEG transcode), crisp-oss/canvas-heic-to-jpeg (WebKit-native HEIC decode)

### Tertiary (LOW confidence)
- None — no claim rests on training data alone; browser-version specifics are flagged MEDIUM and degrade to the clean error path (Pitfall 11).

## Metadata

**Confidence breakdown:**
- Custody data layer: HIGH — every pattern executed against the project's actual installed deps this session
- Photo pipeline (server): HIGH — sharp 0.35.4 pipeline executed end-to-end in sandbox; official docs corroborate
- Photo pipeline (client/browser): MEDIUM — MDN/caniuse-cited; degrades safely to an error path
- Next 16 route/action mechanics: HIGH — bundled official docs read this session (params Promise, bodySizeLimit, refresh)
- UI contract details: N/A — binding 04-UI-SPEC (approved), not re-researched

**Research date:** 2026-09-03
**Valid until:** 2026-10-03 (stable: pinned deps, frozen schema; only sharp minor bumps could drift — pinned 0.35.4)
