---
phase: 09-clone
plan: 01
subsystem: database
tags: [sqlite, drizzle, migration, clone, server-actions, react-19, better-sqlite3]

# Dependency graph
requires:
  - phase: 03-device-registry
    provides: devices schema с UNIQUE normalized-парами, inventoryPair/uniqueCodeOf, createDevice, device-dialog паттерны
  - phase: 04-custody
    provides: movements-транзакции (Tx-паттерн), dialog-семейство movement-dialogs, статусные инварианты ряда действий
  - phase: 08-csv
    provides: 370-тестовый suite как регрессионный периметр
provides:
  - Миграция 0001 serial → nullable (generated) + host-side раннер scripts/migrate.mjs (постоянный способ миграций проекта)
  - cloneDevices() — одна транзакция N вставок, всё-или-ничего (SC 1)
  - nextInventoryNumber() — pure «следующий по шаблону», клиент+сервер один источник (D-02)
  - cloneDeviceAction + CloneDialog + кнопка «Дублировать» в ряду действий карточки
  - NULL-серийники легальны у копий; ручная форма требует серийник как раньше (D-08)
affects: [10-bulk (переиспользует транзакционный паттерн и диалоговую механику), 11-search, деплой-приёмка (runner)]

# Tech tracking
tech-stack:
  added: [] # ни одной новой зависимости (Out of Scope REQUIREMENTS)
  patterns:
    - "Host-side migration runner: PRAGMA foreign_keys=OFF строго до BEGIN; hash=sha256 + created_at=journal.when — CLI-совместимый трекинг"
    - "cloneDevices: db.transaction + N × insert.returning, throw → авто-откат, uniqueCodeOf наружу"
    - "inventorySequence: N−1 свёрток nextInventoryNumber от отредактированного старта; нераспознанный старт → все NULL"

key-files:
  created:
    - drizzle/0001_cooing_wendell_rand.sql
    - drizzle/meta/0001_snapshot.json
    - scripts/migrate.mjs
    - lib/inventory-increment.ts
    - app/(app)/devices/clone-dialog.tsx
    - tests/inventory-increment.test.ts
    - tests/clone-queries.test.ts
    - tests/migrate-runner.test.ts
  modified:
    - db/schema.ts
    - drizzle/meta/_journal.json
    - db/queries/devices.ts
    - app/(app)/devices/actions.ts
    - app/(app)/(card)/devices/[id]/page.tsx
    - db/queries/movements.ts
    - app/(app)/devices/device-dialog.tsx
    - app/(app)/devices/page.tsx
    - app/(app)/page.tsx
    - app/(app)/(card)/employees/[id]/page.tsx
    - README.md
    - scripts/deploy.sh
    - tests/schema.test.ts
    - tests/dashboard-queries.test.ts
    - tests/devices-queries.test.ts

key-decisions:
  - "Механизм D-08 (checkpoint:decision, auto-режим): option-a — обычный UNIQUE на nullable-колонке остаётся, никакой partial/expression-индексации (probe research); применение — только через раннер (CLI молча падает на заполненной базе)"
  - "Раннер scripts/migrate.mjs — постоянный способ миграций проекта: npx drizzle-kit migrate заменён в README (5 мест) и deploy.sh (A4)"
  - "Серверная последовательность: первый экземпляр = отредактированный старт, далее N−1 свёрток nextInventoryNumber; пустой/нераспознанный старт → вся серия NULL (партия либо пронумерована, либо нет)"
  - "D-08 тип-рипл: serialNumber string|null в 5 view-типах (DeviceListItem/DeviceExportRow/IssuedDeviceView/RecentMovementView/DeviceDialogDevice) + «—» в 5 местах рендера по D-06; lib/device-schema.ts и device-actions.tsx не тронуты"

patterns-established:
  - "Pattern runner: любой будущий recreation-миграционный файл применяется только scripts/migrate.mjs (FK OFF до BEGIN), никогда CLI"
  - "Pattern серии: сервер сворачивает ту же pure-функцию, что клиентская подсказка (один источник, tamper-поверхность = один отредактированный старт)"

requirements-completed: [REG-06]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Миграция 0001 serial → nullable применена раннером: обе колонки notnull=0, NULL-пары легальны, дубли отклонены, данные/триггеры/CHECK целы, повторный запуск — no-op"
    requirement: REG-06
    verification:
      - kind: unit
        ref: "tests/schema.test.ts#migration 0001 — serial nullable (D-08, REG-06)"
        status: pass
      - kind: unit
        ref: "tests/migrate-runner.test.ts#scripts/migrate.mjs — host-side runner (Pattern 2)"
        status: pass
      - kind: other
        ref: "node scripts/migrate.mjs на dev-базе (400 устройств) → «применено миграций: 1»; pragma-ассерт serial% notnull=0; повтор — no-op"
        status: pass
    human_judgment: false
  - id: D2
    description: "nextInventoryNumber: паддинг (AB-001→AB-002, INV 007→INV 008), перенос (AB-099→AB-100), RAW-регистр сохранён, не-числовой хвост/пустой оригинал → '' молча (SC 3)"
    requirement: REG-06
    verification:
      - kind: unit
        ref: "tests/inventory-increment.test.ts#nextInventoryNumber"
        status: pass
    human_judgment: false
  - id: D3
    description: "cloneDevices: ровно N строк одной транзакцией; mid-batch UNIQUE-коллизия → 0 новых строк и {code:'inventoryNormalized'}; копии in_stock без holder/notes/movements/attachments; NULL/NULL-пары; наследование закупочного блока и конфига своего типа"
    requirement: REG-06
    verification:
      - kind: unit
        ref: "tests/clone-queries.test.ts#cloneDevices"
        status: pass
    human_judgment: false
  - id: D4
    description: "cloneDeviceAction: requireSession первым, zod strictObject 3 поля (count 1..100 — D-03), ''→null до query-слоя, эхо значений, коллизия → байт-точная «уже есть» под полем, refresh()"
    requirement: REG-06
    verification:
      - kind: other
        ref: "npm run build (typecheck green) + копи-таблица сверена с UI-SPEC Copywriting Contract; логика коллизии покрыта tests/clone-queries.test.ts на query-слое"
        status: pass
    human_judgment: true
    rationale: "Server action не покрывается автотестом напрямую (компонентного/action-раннера в репо нет — прецедент фаз 2–8); поведенческая приёмка контракта — UAT оркестратора"
  - id: D5
    description: "Кнопка «Дублировать» (secondary, data-device-clone-id) в ряду «Редактировать → Дублировать → custody → Списать»; диалог по UI-SPEC (2 поля, подсказка, transparency-hint); линия успеха «Создано {pluralDevices(n)}» с data-clone-created, тихий ink; disposed — ряд скрыт"
    requirement: REG-06
    verification: []
    human_judgment: true
    rationale: "Визуальный рендер и UAT-сценарии — Manual-Only по 09-VALIDATION (компонентного раннера в репо нет); backstop-пункты must_haves проверяются оркестратором через Playwright MCP; записано в WINDOWS.md (unrun-verify)"

# Metrics
duration: 26 min
completed: 2026-09-17
status: complete
---

# Phase 9 Plan 1: Клон устройства Summary

**Клон-контур REG-06: «Дублировать» → диалог (1..100 + подсказка инвентарника) → одна транзакция N копий с наследованием закупки/конфига и NULL-серийником; единственная миграция вехи serial→nullable применена host-side раннером вместо молча падающего CLI**

## Performance

- **Duration:** 26 min
- **Started:** 2026-09-17T04:58:27Z
- **Completed:** 2026-09-17T05:24:05Z
- **Tasks:** 3 (checkpoint:decision + 2 auto)
- **Files modified:** 18

## Accomplishments
- Миграция 0001 (serial → nullable) сгенерирована drizzle-kit'ом без ручных правок и применяется раннером scripts/migrate.mjs — единственным рабочим путём для recreation-миграций на заполненной базе (FK OFF строго до BEGIN); CLI-шаг заменён в README и deploy.sh; dev-база (400 устройств) уже мигрирована, pragma-ассерт зелёный, повторный запуск — no-op
- Ядро клона: pure nextInventoryNumber (паддинг/перенос/RAW-регистр, «''» молча) + cloneDevices — одна db.transaction, всё-или-ничего, NULL/NULL-пары, наследование закупочного блока и конфиг-полей своего типа, ноль movement-событий, статус/владелец только query-слоем
- UI-остров по approved UI-SPEC: CloneDialog (третий installation семейства movement-dialogs, WR-01, эхо-значения, pending-сабмит), кнопка «Дублировать» между «Редактировать» и custody-матрицей, линия успеха «Создано {pluralDevices(n)}» с data-clone-created
- Полный suite вырос 370 → 391 и зелёный; build зелёный; lint — 0 ошибок

## Task Commits

Each task was committed atomically:

1. **Task 1: Миграция 0001 + host-side runner** - `62c8e50` (feat)
2. **Task 2: Ядро клона — nextInventoryNumber + cloneDevices** - `f826926` (feat)
3. **Task 3: cloneDeviceAction + CloneDialog + кнопка на карточке** - `b6c1fda` (feat)

## Files Created/Modified
- `db/schema.ts` - снят .notNull() у serialNumber/serialNormalized (индексы/CHECK не тронуты), комментарий D-08
- `drizzle/0001_cooing_wendell_rand.sql` + `drizzle/meta/*` - generated (не правились)
- `scripts/migrate.mjs` - host-side раннер: pending по created_at, statement-split, sha256+when (CLI-совместимо), FK OFF до BEGIN / ON после COMMIT
- `README.md`, `scripts/deploy.sh` - шаг миграции → `node scripts/migrate.mjs` (5 мест README + deploy)
- `lib/inventory-increment.ts` - pure, client-safe (без фреймворк-импортов)
- `db/queries/devices.ts` - cloneDevices + inventorySequence рядом с createDevice
- `app/(app)/devices/actions.ts` - cloneDeviceAction, CloneFormState, cloneSchema (strictObject, 3 поля), cloneFieldErrorsOf
- `app/(app)/devices/clone-dialog.tsx` - CloneDialog + CloneDialogForm (+ линия успеха в обёртке)
- `app/(app)/(card)/devices/[id]/page.tsx` - CloneDialog в ряду действий (disposed-ряд скрыт целиком — A1)
- `db/queries/movements.ts`, `app/(app)/devices/device-dialog.tsx`, `app/(app)/devices/page.tsx`, `app/(app)/page.tsx`, `app/(app)/(card)/employees/[id]/page.tsx` - D-08 тип-рипл: serialNumber string|null + «—» в рендере
- `tests/schema.test.ts`, `tests/migrate-runner.test.ts`, `tests/inventory-increment.test.ts`, `tests/clone-queries.test.ts` - миграционная и клон-матрицы (21 новый тест)
- `tests/dashboard-queries.test.ts`, `tests/devices-queries.test.ts` - тип-рипл хелперов ((string|null)[])

## Decisions Made
- **checkpoint:decision — option-a** (auto-режим, gate blocking): обычный UNIQUE на nullable-колонке (probe research: неограниченные NULL-пары легальны) + host-side runner; option-b (partial index) — лишний diff, option-c (CLI) — молча падает на проде (Pitfall 1)
- **Семантика серии:** первый экземпляр = отредактированный старт (подсказка уже «next of original»), далее N−1 свёрток; нераспознанный/пустой старт → вся серия NULL — партия либо пронумерована, либо нет (SC 3)
- **catch-маппинг экшена:** uniqueFieldError переиспользован для байт-точной копии «уже есть», но generic-фолбэк — собственный CLONE_ERROR клона (не «Не удалось сохранить»)
- **Линия успеха:** w-full внутри flex-ряда — единственный способ «под рядом» при wrapper-owned острове (PATTERNS-точка вставки сохранена)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] D-08 тип-рипл: nullable serial в view-типах и рендере**
- **Found during:** Task 3 (npm run build)
- **Issue:** Снятие .notNull() (Task 1, по плану) сделало schema-тип serialNumber string|null — 5 typecheck-ошибок в DeviceListItem/DeviceExportRow/IssuedDeviceView/RecentMovementView и далее в рендере (шаблонные строки печатали бы «null», join рвал сепараторы)
- **Fix:** serialNumber: string | null в 5 view-типах (+DeviceDialogDevice), `?? '—'` в 5 местах рендера по D-06-конвенции дэша; хелперы двух тестов переведены на (string|null)[]; CSV-путь не тронут (esc(null) → пустая ячейка уже поддержан)
- **Files modified:** db/queries/devices.ts, db/queries/movements.ts, app/(app)/devices/device-dialog.tsx, app/(app)/devices/page.tsx, app/(app)/page.tsx, app/(app)/(card)/employees/[id]/page.tsx, app/(app)/(card)/devices/[id]/page.tsx, tests/dashboard-queries.test.ts, tests/devices-queries.test.ts
- **Verification:** npx tsc --noEmit — 0 ошибок; npm run build зелёный; suite 391 зелёный
- **Committed in:** b6c1fda (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — прямое следствие запланированного schema-diff, всплывшее на тип-уровне)
**Impact on plan:** Фикс необходим для компиляции и честного рендера NULL-серийников; ни device-actions.tsx, ни lib/device-schema.ts, ни механика dialogs не изменены — D-01/D-08 соблюдены.

## Issues Encountered
- Тест раннера изначально собирал базу без строки трекинга 0000 в __drizzle_migrations — раннер (корректно) считал ВСЕ миграции pending; фикстура приведена к прод-состоянию «база после CLI» (trackJournalEntry)
- pragma_table_info: колонка notnull — зарезервированное слово, требует кавычек в SELECT

## User Setup Required

None - no external service configuration required. Прод-приёмка миграции — шаг деплоя оператора (pragma-ассерт `SELECT "notnull" FROM pragma_table_info('devices') WHERE name LIKE 'serial%'` → обе 0; runner идемпотентен, T-09-05).

## Next Phase Readiness
- REG-06 закрыт на уровне кода и ядра; UAT-сценарии (Manual-Only, 09-VALIDATION) — приёмка оркестратора через Playwright MCP; backstop-пункты записаны в WINDOWS.md (unrun-verify)
- Phase 10 (bulk) переиспользует транзакционный паттерн cloneDevices и механику клон-диалога; runner — обязательный путь для любых будущих recreation-миграций
- Блокеров не осталось; STATE-блокер «[Phase 9] решение о миграции» закрыт option-a

## Self-Check: PASSED

- Все 8 key-files.created существуют на диске
- Все 3 task-коммита найдены в git log (62c8e50, f826926, b6c1fda)
- Полный suite 391/391, npm run build зелёный, tsc 0 ошибок, lint 0 ошибок (6 предсуществующих предупреждений)
- Миграция применена к dev-базе раннером: pragma-ассерт serial% notnull=0, трекинг CLI-совместимый, повтор — no-op

---
*Phase: 09-clone*
*Completed: 2026-09-17*
