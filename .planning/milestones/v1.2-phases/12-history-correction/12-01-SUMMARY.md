---
phase: 12-history-correction
plan: 01
subsystem: database
tags: [sqlite, drizzle-migrations, replay-engine, better-sqlite3, zod]

# Dependency graph
requires:
  - phase: 09-clone
    provides: миграция 0001 serial→nullable + runner scripts/migrate.mjs (прецедент применения)
  - phase: 04-custody
    provides: one-tx guard-UPDATE паттерн custody-действий, keystone lib/movement-schema.ts
provides:
  - миграция 0002_drop_movement_triggers — append-only снят в цепочке (SC5)
  - editMovementSchema/deleteMovementSchema/occurredAtDateIso в кейстоуне + movementSchemas.edit
  - replay-движок editMovement/deleteMovement с проекцией в одной транзакции (D-03/D-04)
  - listTimeline с fromId/toId (префилл диалогов плана 02)
affects: [12-02 (UI на экспортах), 13-delete-devices (каскад требует снятого DELETE-триггера)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Replay-projection: правка/удаление строки movements → полный replay цепочки в том же tx → UPDATE devices; throw в replay = полный откат, ноль записей (D-03/D-04)"
    - "Slot derivation by eventType: сервер выводит person-слоты из типа (locked UI-SPEC semantics), лишние → NULL"
    - "Compound WHERE id AND device_id на каждой мутации movements (.changes===0 → MOVEMENT_GONE) — Pitfall 1"

key-files:
  created:
    - drizzle/0002_drop_movement_triggers.sql
    - drizzle/meta/0002_snapshot.json
    - tests/movement-edit.test.ts
  modified:
    - drizzle/meta/_journal.json
    - lib/movement-schema.ts
    - db/queries/movements.ts
    - db/schema.ts
    - tests/movement-schema.test.ts
    - tests/schema.test.ts
    - tests/movements-queries.test.ts
    - tests/migrate-runner.test.ts
    - README.md

key-decisions:
  - "OQ1 принята: received в replay строго из in_stock, состояние не меняет (seed-семантика)"
  - "OQ2 принята: нетронутый слот (в т.ч. архивный id) сохраняется без отказа; смена слота — assertActiveEmployee"
  - "OQ3 принята: from-слоты НЕ кросс-валидируются против держателя"
  - "occurredAt в edit-схеме ОБЯЗАТЕЛЕН — очищенная дата падает на DATE_PATTERN, create-семантика «пусто = сейчас» недостижима (revise-фикс, SC4)"

patterns-established:
  - "Replay mirror: ORDER BY occurredAt ASC, id ASC == точное зеркало listTimeline DESC,DESC (id tiebreaker load-bearing для bulk-партий)"
  - "Perimeter-гейт фазы 12: модуль экспортирует только editMovement/deleteMovement как легальную поверхность мутаций"

requirements-completed: [HIST-01, HIST-02, HIST-03]

coverage:
  - id: D1
    description: "Миграция 0002 снимает триггеры movements_no_update/no_delete в цепочке; runner применяет идемпотентно"
    requirement: HIST-03
    verification:
      - kind: unit
        ref: "tests/schema.test.ts#drops the two append-only triggers (migration 0002)"
        status: pass
      - kind: unit
        ref: "tests/migrate-runner.test.ts#applies 0001 and 0002 to a filled base"
        status: pass
    human_judgment: false
  - id: D2
    description: "editMovementSchema/deleteMovementSchema с паритетом валидации создания (словарь, слоты по типу, DISPLAY_TZ, dispose-причина, occurredAt обязателен)"
    requirement: HIST-01
    verification:
      - kind: unit
        ref: "tests/movement-edit.test.ts#editMovementSchema — person slots by event type (D-01)"
        status: pass
      - kind: unit
        ref: "tests/movement-edit.test.ts#editMovementSchema — validation parity with create (D-02, SC4)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Replay-движок: editMovement/deleteMovement — one tx, device-scoped, невалидная цепочка = ноль записей, проекция = replay (D-03/D-04/D-05/D-06)"
    requirement: HIST-03
    verification:
      - kind: unit
        ref: "tests/movement-edit.test.ts#replay guard — invalid chain = zero writes (D-03)"
        status: pass
      - kind: unit
        ref: "tests/movement-edit.test.ts#deleting the disposed record un-disposes the device (D-06)"
        status: pass
      - kind: unit
        ref: "tests/movement-edit.test.ts#deleting the LAST assigned returns the device to in_stock (SC3)"
        status: pass
    human_judgment: false

# Metrics
duration: 75min (inline fallback после двух 600s-заглохов executor-агента)
completed: 2026-09-28
status: complete
---

# Plan 12-01 Summary

**Дата-ядро правки истории: миграция 0002 сняла append-only в цепочке (SC5), кейстоун получил edit-схемы с обязательной датой, query-слой — replay-движок editMovement/deleteMovement с проекцией статуса в одной транзакции (D-03/D-04)**

## Performance

- **Duration:** ~75 мин (inline fallback: executor-агент дважды заглох на 600s без единого коммита — spot-check показал ноль прогресса, выполнено оркестратором инлайн по прецеденту фаз 7–11)
- **Started:** 2026-09-28
- **Completed:** 2026-09-28
- **Tasks:** 3/3
- **Files modified:** 11

## Accomplishments

- Миграция `drizzle/0002_drop_movement_triggers.sql` создана инструментом (`drizzle-kit generate --custom`), содержит ровно два DROP TRIGGER IF EXISTS; применена раннером на dev-БД, повторный запуск — no-op; journal idx 2 + snapshot в цепочке
- Кейстоун: `editMovementSchema` (occurredAt ОБЯЗАТЕЛЕН — очищенная дата отклоняется; слоты по типу superRefine; dispose-паритет), `deleteMovementSchema`, `occurredAtDateIso` (en-CA в DISPLAY_TZ); `movementSchemas.edit`
- Replay-движок: `replayChain` (матрица из guard-предусловий шести действий, старт in_stock/null, occurredAt ASC + id ASC), `editMovement`/`deleteMovement` — one tx, составной WHERE, activity-parитет по CHANGED слотам (OQ2), проекция тем же tx (D-04); INVALID_CHAIN = полный откат (D-03)
- `listTimeline` отдаёт fromId/toId (parity RecentMovementView); Pitfall-8: правдивые комменты в movements.ts, schema.ts, movement-schema.ts, README
- Suite: 425 → **455 зелёных** (+30), tsc чист, eslint чист на тронутых файлах

## Task Commits

1. **Task 1: Миграция 0002 + инверсия тестов + README** - `2994c2f` (feat)
2. **Task 2 (tdd): RED матрица** - `532e579` (test) → **GREEN кейстоун** - `305358f` (feat)
3. **Task 3: Replay-движок** - `b65b07e` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] tests/migrate-runner.test.ts не был в files_modified плана**
- **Found during:** Task 1 (полный suite после инверсии)
- **Issue:** план не предвидел тесты раннера миграций: applied 1→2, хеш последней записи, триггер-ассерты
- **Fix:** тесты приведены к новой истине цепочки (applied=2, hash idx 2, триггеров нет, CHECK на месте)
- **Files modified:** tests/migrate-runner.test.ts
- **Verification:** полный suite зелёный
- **Committed in:** 2994c2f

**2. [Rule 3 - Blocking] Happy-path тест самого себя строил невалидную цепочку**
- **Found during:** Task 3 (тест «timeline reorders by the new date»)
- **Issue:** перенос «Возврата» на дату ПОЗЖЕ второй «Выдачи» = две «Выдачи» подряд — INVALID_CHAIN (движок корректен, сценарий теста ошибочен)
- **Fix:** сценарий переписан на tiebreaker-кейс (редактируемая запись встаёт на общий occurred_at с возвратом, id DESC держит порядок валидным)
- **Files modified:** tests/movement-edit.test.ts
- **Verification:** 91 тест движка+периметра зелёный
- **Committed in:** b65b07e

---

**Total deviations:** 2 auto-fixed (1 баг плана, 1 блокер теста)
**Impact on plan:** оба фикса — корректность тестовой обвязки; прод-код следует плану дословно. No scope creep.

## Issues Encountered

- Executor-агент дважды упал «inactive 600000ms» (лимит конкурентности модели + known 600s stall) — выполнено инлайн-фоллбеком оркестратора, штатный путь проекта (прецедент gsd-runtime-quirks)

## Next Phase Readiness

- План 02 строит на экспортах: `editMovementSchema` (`movementSchemas.edit`), `editMovement`/`deleteMovement`, `occurredAtDateIso`, `listTimeline` ids
- Деплой-контракт: прод = git pull + `node scripts/migrate.mjs` (README синхронизирован)

---
*Phase: 12-history-correction*
*Completed: 2026-09-28*
