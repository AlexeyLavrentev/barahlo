---
phase: 13-device-deletion
plan: 01
subsystem: database
tags: [better-sqlite3, drizzle-orm, hard-delete, cascade, one-tx, vitest, zod]

# Dependency graph
requires:
  - phase: 12-history-correction
    provides: миграция 0002_drop_movement_triggers (снят DELETE-триггер — каскад легален на уровне БД), прецедент one-tx + guard .changes (deleteMovement)
provides:
  - deleteDevice(deviceId: number): void в db/queries/devices.ts — единственная мутация жёсткого удаления: одна транзакция (снапшот storage_key → DELETE movements → DELETE attachments → DELETE devices с guardом .changes===0 → DEVICE_GONE) + post-commit unlink оригинала и thumb
  - deviceDeleteSchema в lib/device-schema.ts — keystone z.strictObject, единственный ключ deviceId (coerce positive int)
  - tests/device-delete.test.ts — матрица ножей: каскад с файлами на диске, клон-младенец, rollback/guard, parity-обход шести поверхностей, удаление ≠ списание, double delete
affects: [13-02 (deleteDeviceAction + dialog строятся на этом экспорте), verify-work (UAT SC2/SC3/SC4)]

# Tech tracking
tech-stack:
  added: [] # ноль новых пакетов (locked)
  patterns:
    - "one-tx дети→родитель + post-commit sync unlink по прецеденту deleteAttachment"
    - "перевёрнутый perimeter-gate: ровно один аудированный delete-путь вместо запрета удаления"

key-files:
  created:
    - tests/device-delete.test.ts
  modified:
    - db/queries/devices.ts
    - lib/device-schema.ts
    - db/queries/movements.ts
    - tests/devices-queries.test.ts

key-decisions:
  - "Guard одиночного фото (DISPOSED в deleteAttachment) сознательно НЕ перенесён в deleteDevice — D-01: удаляется любой статус; единственный guard — .changes===0 → DEVICE_GONE"
  - "SC4 «удаление не создаёт записей» проверен буквально: устройство без движений, счётчик movements всей базы до == после (устройство С движениями легитимно теряет собственные строки — это каскад, не создание)"
  - "Устаревший perimeter-gate «devices are never deleted» перевёрнут в «ровно один аудированный delete-путь» — прежняя посылка отменена зафиксированным владельцем D-03"

patterns-established:
  - "deleteDevice: снапшот storage_key из БД ВНУТРИ tx (никогда путь из deviceId) → дети → родитель → после COMMIT sync unlink пары [key, thumbKeyOf(key)] через resolveUploadPath, каждый fs-error глотается"
  - "Parity поверхностей как структурное свойство: тест обходит шесть потребителей независимо (реестр, CSV, ⌘K, лента, счётчики, «выданное») с контрольным устройством"

requirements-completed: [DEL-01, DEL-02]

coverage:
  - id: D1
    description: "deleteDevice — одна транзакция уносит movements + attachments + devices, осиротевших строк ноль; после возврата обоих файлов фото нет на диске; клон-младенец проходит как no-op"
    requirement: DEL-01
    verification:
      - kind: unit
        ref: "tests/device-delete.test.ts#device with children: movements + attachments + device row + BOTH files gone"
        status: pass
      - kind: unit
        ref: "tests/device-delete.test.ts#childless device (clone baby): no-op child deletes, empty unlink loop"
        status: pass
      - kind: unit
        ref: "tests/device-delete.test.ts#unknown id: DEVICE_GONE and ZERO writes — control device, rows and files untouched"
        status: pass
    human_judgment: false
  - id: D2
    description: "deviceDeleteSchema — keystone z.strictObject с единственным ключом deviceId; посторонние ключи режутся"
    requirement: DEL-01
    verification:
      - kind: unit
        ref: "tests/device-delete.test.ts#parses a coerced deviceId and cuts injected keys (tampering probe)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Parity-обход шести поверхностей: после удаления устройство отсутствует в реестре, CSV, ⌘K, ленте, счётчиках и «выданном» при нулевых правках read-кода; контрольное устройство нетронуто; double delete → DEVICE_GONE"
    requirement: DEL-02
    verification:
      - kind: unit
        ref: "tests/device-delete.test.ts#the deleted device disappears everywhere; the control does not drift"
        status: pass
      - kind: unit
        ref: "tests/device-delete.test.ts#the whole-DB movements count is identical before and after"
        status: pass
      - kind: unit
        ref: "tests/device-delete.test.ts#re-deleting is a cheap explicit DEVICE_GONE and no counter drifts"
        status: pass
      - kind: unit
        ref: "tests/devices-queries.test.ts#exposes exactly the audited phase-13 delete and no other destructive capability"
        status: pass
    human_judgment: false
  - id: D4
    description: "UAT SC2/SC3/SC4 в браузере: каскад с реальными фото, parity шести поверхностей на живом UI, удаление ≠ списание (кнопка «Списать» работает как раньше)"
    requirement: DEL-02
    verification: []
    human_judgment: true
    rationale: "План <human-check>: UAT проводится оркестратором через Playwright end-of-phase по 13-VALIDATION.md (workflow.human_verify_mode=end-of-phase); браузерная правда поверхностей — вне досягаемости unit-тестов"

# Metrics
duration: 13min
completed: 2026-09-28
status: complete
---

# Phase 13 Plan 01: Дата-ядро удаления устройств Summary

**`deleteDevice` — жёсткое удаление устройства одной транзакцией (movements → attachments → devices с guardом DEVICE_GONE) + post-commit unlink фото-пар, keystone `deviceDeleteSchema` и тест-матрица из 7 ножей, включая parity-обход шести поверхностей при нулевых правках read-кода**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-28T10:56:30Z
- **Completed:** 2026-09-28T11:09:34Z
- **Tasks:** 2 (Task 1 — TDD RED→GREEN, Task 2 — parity/ножи/коммент)
- **Files modified:** 5 (1 создан, 4 изменены)

## Accomplishments

- `deleteDevice(deviceId): void` в `db/queries/devices.ts`: одна транзакция — снапшот `storage_key` из БД → DELETE movements → DELETE attachments → DELETE devices; единственный guard `.changes===0 → { code: 'DEVICE_GONE' }` (throw внутри tx = полный откат, ноль записей); после COMMIT — синхронный unlink `[key, thumbKeyOf(key)]` через `resolveUploadPath` (containment), каждый fs-error глотается (D-03/D-04, T-13-03/05/07)
- `deviceDeleteSchema` в keystone `lib/device-schema.ts`: `z.strictObject` с единственным ключом `deviceId: z.coerce.number().int().positive()` — schema-тесты не импортируют 'use server' модули
- `tests/device-delete.test.ts` — 7 зелёных тестов: каскад с реальными файлами на диске (existsSync=false для обоих), клон-младенец no-op, неизвестный id → DEVICE_GONE при нуле записей, schema-матрица, parity-обход шести поверхностей с контрольным устройством, удаление ≠ списание (raw-SQL счётчик movements неизменен), double delete
- Никаких статус-предусловий (D-01: удаляется любой статус, включая disposed); ноль правок read-запросов (D-06); migrations/drizzle не тронуты

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: тест-матрица каскадного удаления** - `8173d8a` (test)
2. **Task 1 GREEN: deleteDevice + deviceDeleteSchema** - `200718f` (feat)
3. **Task 2: parity-обход + guard-ножи + коммент-рефреш ленты** - `043208d` (test)

_Note: Task 1 — tdd tracer, два коммита (RED → GREEN); tracer-гейт перепроверен end-to-end перед расширением._

## Files Created/Modified

- `tests/device-delete.test.ts` (NEW) — матрица ножей: bootstrap temp-DB + temp-UPLOADS_DIR (env до первого @/db import), хелперы rawDevice/rawMovements/rawAttachments/rawMovementCount/captureThrown/seedPhotoRow/seedPhotoFiles
- `db/queries/devices.ts` — +imports (unlinkSync, resolveUploadPath, thumbKeyOf, movements), +хедер-примечание о disk-I/O в регистре attachments.ts, +`deleteDevice` рядом с cloneDevices
- `lib/device-schema.ts` — +`deviceDeleteSchema` рядом с deviceUpdateSchema
- `db/queries/movements.ts` — comment-only рефреш док-комментария listRecentMovements (исполняемые строки не менялись, D-06; git diff — только строки комментариев)
- `tests/devices-queries.test.ts` — перевёрнут устаревший perimeter-gate (см. Deviations)

## Decisions Made

- Guard `DISPOSED` из `deleteAttachment` сознательно не перенесён (D-01, Planner Note 2 из 13-PATTERNS) — единственный guard: существование строки
- SC4-тест реализован буквально по плану: устройство **без** движений, счётчик movements всей базы до == после (устройство с движениями легитимно теряет собственные строки — это каскад, а не создание записей)
- Task 2 закоммичен типом `test`: содержательное изменение — тесты, правка movements.ts — только комментарий

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Устаревший perimeter-gate «devices are never deleted» блокировал зелёный suite**
- **Found during:** Task 1 (GREEN) — первый полный прогон после реализации
- **Issue:** `tests/devices-queries.test.ts:606` (периметр ранних фаз: «roadmap: no delete path») ассертирует, что модуль devices-queries не экспортирует ничего по /delete|remove|destroy/i — посылка отменена зафиксированным владельцем решением D-03 (13-CONTEXT) и требованием DEL-01, план предписывает `deleteDevice` именно здесь
- **Fix:** гейт перевёрнут в эквивалентную по духу фиксацию нового периметра: `Object.keys(queries).filter(/delete|remove|destroy/i)` === `['deleteDevice']` — ровно один аудированный delete-путь, никакие другие деструктивные экспорты невозможны
- **Files modified:** tests/devices-queries.test.ts
- **Verification:** полный suite зелёный 464/464 после GREEN; гейт остаётся loud-детектором любых новых delete-путей
- **Committed in:** 200718f (атомарно с реализацией — между коммитами репо не краснеет)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Единственный auto-fix вызван самой целью фазы (легализация удаления) и усиляет периметр, а не ослабляет. No scope creep.

## Issues Encountered

None beyond the deviation above — реализация легла по Pattern 1 из 13-RESEARCH с первого прогона (RED 4/4 fail → GREEN 4/4 pass).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- План 02 (wave 2) строит на `deleteDevice`: `deleteDeviceAction` (requireSession-first, `deviceDeleteSchema`, {code}→копия, `redirect('/devices')` вне try/catch), остров `device-delete-dialog.tsx`, тихая зона в карточке, `pluralMovementRecords` в lib/ru.ts
- Копия для action: `DEVICE_GONE` уже бросается запросным слоем — маппер в action обязан переводить код в русский текст до return (V7)
- UAT SC2/SC3/SC4 — оркестратор, end-of-phase, по 13-VALIDATION.md (human_judgment D4 в coverage)
- Полный suite 467/467 (базовая линия 460 + 7 новых), `npx tsc --noEmit` чист

---
*Phase: 13-device-deletion*
*Completed: 2026-09-28*

## Self-Check: PASSED

- Files: 5/5 found (tests/device-delete.test.ts, db/queries/devices.ts, lib/device-schema.ts, db/queries/movements.ts, tests/devices-queries.test.ts)
- Commits: 3/3 found (8173d8a, 200718f, 043208d)
- Full suite: 467/467 green; tsc --noEmit clean; drizzle/ untouched
