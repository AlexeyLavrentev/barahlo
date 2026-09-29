---
phase: 12-history-correction
plan: 02
subsystem: ui
tags: [react, client-island, server-actions, base-ui, playwright]

# Dependency graph
requires:
  - phase: 12-01
    provides: editMovement/deleteMovement (replay-движок), editMovementSchema/deleteMovementSchema, occurredAtDateIso, listTimeline fromId/toId
  - phase: 10-bulk
    provides: EmployeePicker onPick-вариант, контролируемый Dialog-без-trigger паттерн
provides:
  - Клиентский остров Timeline с триггерами «Исправить»/«Удалить» на каждой записи (D-07)
  - MovementEditDialog (тип/слоты/дата/комментарий, dispose-textarea) + MovementDeleteConfirmDialog
  - editMovementAction/deleteMovementAction (requireSession-first, {code}→русские копии)
  - Source-gates: machine-коды не покидают сервер, нативных confirm нет
affects: [13-delete-devices (паттерн подтверждений деструктива), verify-work UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Island keyed open-state {movementId, mode}: один открытый диалог максимум, вместо 2N wrapper'ов"
    - "Тип = мастер-поле: смена типа перекраивает слоты (empty pickers) и reshapes comment → textarea (D-01)"
    - "occurredAt как есть: пустая строка доходит до zod DATE_PATTERN («Введите корректную дату»), никогда не мапится в undefined (revise-фикс)"

key-files:
  created:
    - app/(app)/(card)/devices/[id]/movement-edit-dialogs.tsx
  modified:
    - app/(app)/devices/actions.ts
    - app/(app)/(card)/devices/[id]/timeline.tsx
    - app/(app)/(card)/devices/[id]/page.tsx
    - tests/movement-edit.test.ts

key-decisions:
  - "EDIT_ERROR не создан — edit реюзит SAVE_ERROR байт-точный; delete имеет DELETE_ERROR (canonical row в UI-SPEC)"
  - "Один остров владеет обоими диалогами через keyed state; диалоги — верхнеуровневые компоненты (rerender-no-inline-components)"
  - "IMPORTS через @/app/(app)/devices/actions — относительный путь ломался на route group (card)"

patterns-established:
  - "break-words + *:min-w-0 на диалогах — 500-симв. без пробелов не рвут grid (backstop UAT)"

requirements-completed: [HIST-01, HIST-02, HIST-03]

coverage:
  - id: D4
    description: "Триггеры «Исправить»/«Удалить» на каждой записи таймлайна (D-05/D-06/D-07)"
    requirement: HIST-01
    verification:
      - kind: unit
        ref: "tests/movement-edit.test.ts#timeline rows carry both needles"
        status: pass
      - kind: e2e
        ref: "playwright: devices/7 — триггеры на Выдаче, Поступлении, у disposed"
        status: pass
    human_judgment: true
    rationale: "Визуальная тихость триггеров и отсутствие дрейфа рельсы — глазная истина, остаётся в юзерском UAT"
  - id: D5
    description: "Правка записи: префилл записи, слоты по типу, DISPLAY_TZ-дата, сохранение через replay"
    requirement: HIST-01
    verification:
      - kind: e2e
        ref: "playwright: devices/7 — правка Выдачи (Елена, 20.09) мгновенно обновила держателя и таймлайн"
        status: pass
    human_judgment: true
    rationale: "Браузерная истина — прецедент UAT фаз 7/10: юзер подтверждает сценарии сам"
  - id: D6
    description: "Удаление записи с подтверждением, показывающим текст записи; статус пересчитывается"
    requirement: HIST-02
    verification:
      - kind: e2e
        ref: "playwright: devices/7 — удаление записи Списания вернуло устройство на склад (D-06)"
        status: pass
    human_judgment: true
    rationale: "Деструктивный поток — юзерский sign-off обязателен"
  - id: D7
    description: "Невалидная правка отклоняется байт-точной копией, весь ввод сохранён, ноль записей"
    requirement: HIST-03
    verification:
      - kind: unit
        ref: "tests/movement-edit.test.ts#machine {code} literals never return to the client (V7)"
        status: pass
      - kind: e2e
        ref: "playwright: INVALID_CHAIN role=alert + echo intact; очищенная дата → «Введите корректную дату»"
        status: pass
    human_judgment: false

# Metrics
duration: 65min (inline fallback)
completed: 2026-09-28
status: complete
---

# Plan 12-02 Summary

**UI-поверхность правки истории: клиентский остров таймлайна с «Исправить»/«Удалить» на каждой записи, диалоги по паттерну movement-dialogs, два Server Actions с requireSession-first и {code}→русские копии; UAT оркестратора 9/9 + backstop-фикс переноса 500-символьного комментария**

## Performance

- **Duration:** ~65 мин (inline fallback)
- **Started:** 2026-09-28
- **Completed:** 2026-09-28
- **Tasks:** 2/2 impl + UAT checkpoint (юзерский sign-off остаётся)
- **Files modified:** 5

## Accomplishments

- Остров Timeline: плоский снапшот (occurredAtDisplay/occurredAtDate строками — server-serialization), employees один раз, deviceId пропом; keyed open-state {movementId, mode}; тихие триггеры с ≥44px хит-зонами; empty state без триггеров
- MovementEditDialog: контекстная строка, select типа из кейстоуна (7 опций), слоты по D-01 с OQ2-префиллом (архивный id сохраняется, новый выбор — активные), дата = день записи (occurredAtDateIso), dispose-textarea паритет; «Отмена»/«Сохранить изменения» (pending «Сохраняем…»)
- MovementDeleteConfirmDialog: текст записи нейтрально, hint про пересчёт статуса, «Не удалять»/красная «Удалить» (bg-destructive, pending «Удаляем…»)
- editMovementAction/deleteMovementAction: requireSession-first, editPayload (occurredAt как есть — revise-фикс; comment ?? null), INVALID_CHAIN/MOVEMENT_GONE → байт-точные русские копии, refresh() до ok
- Source-gates: requireSession-first, ноль formData-чтений проекции, ноль машинных кодов в возвратах, ноль window.confirm
- UAT Playwright оркестратора 9/9 сценариев плана + backstop-находка: 500 «П» без пробелов рвали grid карточки и диалогов → break-words + *:min-w-0 (664d38e), перепроверено — ноль overflow
- Suite 460/460, build зелёный, lint чист

## Task Commits

1. **Task 1: остров + edit-диалог + editMovementAction** - `b676448` (feat)
2. **Task 2: deleteMovementAction + ConfirmDialog + source-gates** - `5be9248` (test/feat)
3. **Backstop-фикс (UAT находка)** - `664d38e` (fix)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Относительный импорт actions ломался на route group**
- **Found during:** Task 1 (tsc)
- **Issue:** `../../devices/actions` не резолвится из (card)-группы — 19 TS-ошибок
- **Fix:** импорт через alias `@/app/(app)/devices/actions`
- **Verification:** tsc чист, build зелёный
- **Committed in:** b676448

**2. [Rule 1 - Bug] 500-симв. комментарий (без пробелов) давал горизонтальный overflow**
- **Found during:** Task 3 (UAT backstop-проба 9)
- **Issue:** длинное слово раздувало grid-трек карточки и диалогов
- **Fix:** break-words на абзацах комментария (строка таймлайна, контекстная строка, delete-блок) + *:min-w-0 на DialogContent
- **Verification:** playwright-пробы — pageOverflowX/deleteDialogOverflowX/editDialogOverflowX == false
- **Committed in:** 664d38e

---

**Total deviations:** 2 auto-fixed (2 бага)
**Impact on plan:** инфраструктурные фиксы, скоуп не расширен.

## Issues Encountered

- Executor-агент снова недоступен (лимит конкурентности) — план выполнен инлайн оркестратором

## Next Phase Readiness

- UAT-файл 12-UAT.md создан: юзерский sign-off — финальный гейт плана (blocking-human)
- После sign-off: verify-work / verifier → secure-phase → phase.complete

---
*Phase: 12-history-correction*
*Completed: 2026-09-28*
