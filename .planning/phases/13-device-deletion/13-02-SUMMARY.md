---
phase: 13-device-deletion
plan: 02
subsystem: device-deletion-ui
tags: [server-actions, client-island, base-ui-dialog, intl-pluralrules, source-gates, vitest]

# Dependency graph
requires:
  - phase: 13-device-deletion (plan 01)
    provides: deleteDevice(deviceId): void (one-tx cascade + post-commit unlink, DEVICE_GONE guard) и deviceDeleteSchema (keystone z.strictObject); красный confirm-регистр фазы 12 («Удаляем…»/«Не удалять»/bg-destructive) и WR-01 split (archive-confirm-dialog)
provides:
  - deleteDeviceAction в app/(app)/devices/actions.ts — контракт фазы 12: requireSession → deviceDeleteSchema → try/catch только вокруг запроса → {code}→русские копии ДО возврата (V7) → redirect('/devices', 'replace') вне try/catch (D-05)
  - DeviceDeleteFormState + копии DEVICE_DELETE_ERROR / DEVICE_GONE_COPY в DELETE_ERROR-регистре
  - DeviceDeleteDialog (app/(app)/devices/device-delete-dialog.tsx) — третья инсталляция красного семейства: wrapper (тихий триггер data-device-delete + open state) + inner DeviceDeleteForm (useActionState), flat server-serialized snapshot
  - Тихая зона удаления на карточке — последний ребёнок section после PhotoGrid, вне disposed-ternary (D-01: все четыре статуса), счётчики из .length уже вычисленных запросов
  - pluralMovementRecords в lib/ru.ts (LDML-таблица «запись/записи/записей», «фото» несклоняемое)
  - tests/device-delete.test.ts — source-gates действия/острова/страницы/запросного слоя; tests/ru.test.ts — плюрал-матрица 0/1/2/5/21/22/111
affects: [verify-work (UAT SC1/SC4/SC5 по 13-VALIDATION.md), end-of-phase sign-off]

# Tech tracking
tech-stack:
  added: [] # ноль новых пакетов (locked)
  patterns:
    - "deleteDeviceAction: redirect как throw-control-flow ВНЕ try/catch (bundled Next docs; 'replace' убирает мёртвую карточку из back stack)"
    - "Тихий деструктивный триггер: text-destructive at rest + after:-inset hit-area ≥44px (рецепт ROW_ACTION_CLASS timeline.tsx, перекрашенный в красный — зона, не запись)"
    - "Source-gate позиционности: lastIndexOf disposed-условного — зона позже ДАЖЕ canMutate-условия PhotoGrid"

key-files:
  created:
    - app/(app)/devices/device-delete-dialog.tsx
  modified:
    - app/(app)/devices/actions.ts
    - app/(app)/(card)/devices/[id]/page.tsx
    - lib/ru.ts
    - tests/device-delete.test.ts
    - tests/ru.test.ts

key-decisions:
  - "redirect('/devices', 'replace') — строковый литерал вторым аргументом: установленная сигнатура redirect(url, type?: RedirectType), RedirectType = 'push' | 'replace'; объектная форма плана {type:'replace'} не типчекается — план сам назначил этот фолбэк (A1), семантика идентична (replace убирает мёртвую карточку из back stack)"
  - "Остров без ok-эффекта и useCloseOnOk: успех завершается redirect — остров никогда не видит ok-состояния (план/13-UI-SPEC Default 11); WR-01 split сбрасывает failed-submit alert между открытиями"
  - "Identity-блок нейтральным чернилом (модель 14/600, серийник/инвентарник font-mono, «—» без mono при null) — красный только на тихом триггере и кнопке-последствии (13-UI-SPEC destructive discipline)"

patterns-established:
  - "Source-gate input-контракта: regex матчит каждый открывающий input-тег острова и требует type=\"hidden\" — любые видимые поля роняют гейт (type-to-confirm отклонён D-02, hidden deviceId — единственное POST-поле)"
  - "Позиционный пин зоны удаления: index('<DeviceDeleteDialog') > lastIndexOf('status !== disposed') И > index('<PhotoGrid') — рендер для всех статусов закреплён навсегда"

requirements-completed: [DEL-01, DEL-02]

coverage:
  - id: U1
    description: "deleteDeviceAction — requireSession-first (T-13-01), zod-белый список (T-13-02), {code}→русские копии до любого return (V7, T-13-06), redirect вне try/catch (D-05, Pitfall 1)"
    requirement: DEL-01
    verification:
      - kind: unit
        ref: "tests/device-delete.test.ts#deleteDeviceAction starts with requireSession (directly POST-able, T-13-01)"
        status: pass
      - kind: unit
        ref: "tests/device-delete.test.ts#machine {code} literals never return to the client (V7, T-13-06)"
        status: pass
      - kind: unit
        ref: "tests/device-delete.test.ts#redirect('/devices') sits AFTER the closing catch — outside try/catch (Pitfall 1, D-05)"
        status: pass
    human_judgment: false
  - id: U2
    description: "DeviceDeleteDialog — красный регистр байт-точен (заголовок-вопрос, «Не удалять»/«Удаляем…», bg-destructive, role=alert, «будут удалены безвозвратно.»); ноль нативных confirm; единственный input — скрытый deviceId (D-02)"
    requirement: DEL-01
    verification:
      - kind: unit
        ref: "tests/device-delete.test.ts#carries every byte-exact needle of the 13-UI-SPEC register"
        status: pass
      - kind: unit
        ref: "tests/device-delete.test.ts#no native browser confirmation anywhere in the island"
        status: pass
      - kind: unit
        ref: "tests/device-delete.test.ts#the only form field is the hidden deviceId — no visible inputs, no type-to-confirm (D-02)"
        status: pass
    human_judgment: false
  - id: U3
    description: "Тихая зона на карточке — вне disposed-условных (включая canMutate PhotoGrid), после PhotoGrid, счётчики historyCount/photoCount из .length уже вычисленных запросов; deleteDevice без статус-предусловий (D-01 пин)"
    requirement: DEL-01
    verification:
      - kind: unit
        ref: "tests/device-delete.test.ts#the delete zone renders after the disposed ternary AND after PhotoGrid — every status"
        status: pass
      - kind: unit
        ref: "tests/device-delete.test.ts#deleteDevice carries no status precondition — existence is the only guard"
        status: pass
    human_judgment: false
  - id: U4
    description: "Плюрал-матрица счётчиков байт-точна: 0→«0 записей», 1→«1 запись», 2→«2 записи», 5→«5 записей», 21→«21 запись», 22→«22 записи», 111→«111 записей» (Pitfall 7: 11-оконечные — many)"
    requirement: DEL-02
    verification:
      - kind: unit
        ref: "tests/ru.test.ts#pluralMovementRecords — Intl.PluralRules(\"ru\") (13-UI-SPEC counters)"
        status: pass
    human_judgment: false
  - id: U5
    description: "UAT SC1/SC4/SC5 + 4 backstop-строки (overflow identity, dead URL/404, failed-delete-open, disposed-зона) — браузерная правда поверх source-gates"
    requirement: DEL-02
    verification: []
    human_judgment: true
    rationale: "План <human-check>: UAT проводится оркестратором через Playwright end-of-phase по 13-VALIDATION.md (workflow.human_verify_mode=end-of-phase); визуальный регистр и навигация — вне досягаемости unit-тестов"

# Metrics
duration: 13min
completed: 2026-09-28
status: complete
---

# Phase 13 Plan 02: UI-поверхность удаления устройств Summary

**`deleteDeviceAction` (requireSession-first, {code}→русские копии, redirect вне try/catch) + красный `DeviceDeleteDialog` — третья инсталляция деструктивного семейства — + тихая зона `data-device-delete` на карточке вне disposed-условного + `pluralMovementRecords`; контракт прикреплён source-gates**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-28T11:17:11Z
- **Completed:** 2026-09-28T11:30:00Z
- **Tasks:** 2 (Task 1 — tracer: action + остров + зона + плюрализация; Task 2 — source-gates + плюрал-матрица)
- **Files modified:** 6 (1 создан, 5 изменены)

## Accomplishments

- `deleteDeviceAction` в `app/(app)/devices/actions.ts`: `await requireSession()` первой исполняемой строкой (T-13-01), `deviceDeleteSchema.safeParse({ deviceId })` — при неудаче generic-копия; try/catch ТОЛЬКО вокруг `deleteDevice`; catch маппит `DEVICE_GONE` → «Устройство уже удалено. Обновите страницу.» до возврата (V7); последним выражением — `redirect('/devices', 'replace')` СНАРУЖИ try/catch (D-05; NEXT_REDIRECT не может быть проглочен в копию ошибки — Pitfall 1). Копии `DEVICE_DELETE_ERROR`/`DEVICE_GONE_COPY` рядом с DELETE_ERROR-блоком фазы 12
- `DeviceDeleteDialog` (новый остров, `app/(app)/devices/device-delete-dialog.tsx`): WR-01 split — wrapper владеет тихим триггером (`data-device-delete`, text-destructive at rest, ≥44px через after:-inset, копия «Удалить устройство») и open state; inner `DeviceDeleteForm` владеет `useActionState` — failed-submit alert не переживает закрытие. Identity-блок нейтральным чернилом: модель 14/600 break-words, серийник/инвентарник font-mono с break-words, «—» в text-ink-secondary без mono при null; hint `pluralMovementRecords(historyCount) истории и {photoCount} фото будут удалены безвозвратно.`; футер «Не удалять» (secondary) + «Удалить» (bg-destructive, pending-disabled, «Удаляем…»); error-абзац text-sm text-[#D70015] role=alert над формой
- Карточка (`page.tsx`): `listTimeline`/`listByDevice` хоистлены в const (ноль новых запросов); зона `mt-8 border-t border-hairline pt-4` — последний ребёнок section после PhotoGrid, ВНЕ disposed-ternary (D-01 — все четыре статуса); 404-контракт, custody-ряд и остальные острова не тронуты
- `lib/ru.ts`: `MOVEMENT_RECORD_FORMS` (LDML-таблица: one «запись», two/few «записи», zero/many/other «записей») + `pluralMovementRecords(n)` по рецепту pluralEmployees/pluralDevices; «фото» несклянное — таблица только для записей
- Source-gates (`tests/device-delete.test.ts`, readFileSync — 'use server' модуль никогда не импортируется из vitest): requireSession-first slice; ноль машинных `error: { code` возвратов во всём actions.ts; redirect позиционно после закрывающего catch; байт-иглы острова; ноль window.confirm; input-гейт (каждый input-тег обязан быть type="hidden", ровно один — deviceId); позиционный пин зоны после ПОСЛЕДНЕГО disposed-условного и после PhotoGrid; deleteDevice-slice без статус-guard (регрессионный пин D-01)
- Плюрал-матрица (`tests/ru.test.ts`): 0/1/2/5/21/22/111 байт-точные + live-пруф `Intl.PluralRules('ru').select(111) === 'many'`
- Гейты: tsc --noEmit чист; полный suite 483/483 (467 базовых + 16 новых); next build зелёный

## Task Commits

Each task was committed atomically:

1. **Task 1: deleteDeviceAction + DeviceDeleteDialog + тихая зона + плюрализация** - `0a74a45` (feat)
2. **Task 2: source-gates + плюрал-матрица** - `3c8893c` (test)

_Tracer-гейт: tsc + полный suite 467/467 + build перепроверены end-to-end сразу после коммита Task 1, до Task 2._

## Files Created/Modified

- `app/(app)/devices/device-delete-dialog.tsx` (NEW) — остров: ZONE_TRIGGER_CLASS (тихий красный триггер), DeviceDeleteForm (внутренний, useActionState), DeviceDeleteDialog (wrapper, flat snapshot-пропы)
- `app/(app)/devices/actions.ts` — +redirect из next/navigation, +deleteDevice в импорт queries, +deviceDeleteSchema в импорт keystone, +DEVICE_DELETE_ERROR/DEVICE_GONE_COPY, +DeviceDeleteFormState, +deleteDeviceAction после deleteMovementAction
- `app/(app)/(card)/devices/[id]/page.tsx` — +импорт DeviceDeleteDialog, хоист timelineEvents/photos, зона после PhotoGrid
- `lib/ru.ts` — +MOVEMENT_RECORD_FORMS + pluralMovementRecords
- `tests/device-delete.test.ts` — +readFileSync импорт, +4 describe source-gates (10 тестов)
- `tests/ru.test.ts` — +describe pluralMovementRecords (8 тестов: 7 матричных + live-пруф чекера)

## Decisions Made

- `redirect('/devices', 'replace')` строковым литералом: сигнатура установленного Next 16.3.3 — `redirect(url, type?: RedirectType)`, где `RedirectType = 'push' | 'replace'` (string union, не enum-объект); объектная форма плана не типчекается — план сам назначил этот путь фолбэком (A1), семантика та же (replace убирает мёртвую карточку из back stack, D-05)
- Остров без ok-эффекта/useCloseOnOk — по плану: успех завершается redirect, остров никогда не видит ok (13-UI-SPEC Default 11); «защитный» эффект был бы мёртвым кодом
- Комментарий над MOVEMENT_RECORD_FORMS называет `pluralMovementRecords` — needle-grep плана (≥2 вхождения «таблица+функция») выполнен осмысленной док-строкой в стиле соседних хелперов файла

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Форма второго аргумента redirect скорректирована под установленную сигнатуру**
- **Found during:** Task 1 (до первого tsc-прогона — сверка с bundled docs по мандату AGENTS.md)
- **Issue:** план предписывает `redirect('/devices', { type: 'replace' })`; фактическая сигнатура `redirect(url: string, type?: RedirectType)` принимает строку `'push' | 'replace'`, объектная форма отвергается tsc — план явно назначает фолбэк (A1: «если tsc отвергнет второй аргумент — plain redirect('/devices'), поведение не меняется»)
- **Fix:** `redirect('/devices', 'replace')` — сохраняет replace-семантику A1 (мёртвая карточка не воскресает по «назад»), а не деградирует до push
- **Files modified:** app/(app)/devices/actions.ts
- **Verification:** tsc чист; behavior-контракт D-05 не изменён
- **Committed in:** 0a74a45

---

**Total deviations:** 1 auto-fixed (1 plan-anticipated adaptation)
**Impact on plan:** Ноль — путь предусмотрен A1 плана; наблюдаемое поведение идентично контракту D-05. No scope creep.

## Issues Encountered

None — обе задачи легли по паттернам 13-PATTERNS с первого прогона (Task 1: tsc/467/build зелёные сразу; Task 2: гейты зелёные 31/31 в целевых файлах, 483/483 по suite).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Фаза 13 (2 плана из 2) закрыта кодом: UAT SC1/SC4/SC5 + 4 backstop-строки must_haves — оркестратору end-of-phase по 13-VALIDATION.md (Playwright; workflow.human_verify_mode=end-of-phase)
- Иглы для UAT: `data-device-delete` (триггер зоны), role="alert" в диалоге, redirect на /devices, 404 на старом URL
- Полный suite 483/483; tsc чист; build зелёный; drizzle/ не тронут; ноль новых пакетов

---
*Phase: 13-device-deletion*
*Completed: 2026-09-28*

## Self-Check: PASSED

- Files: 6/6 found (device-delete-dialog.tsx создан; actions.ts, page.tsx, lib/ru.ts, tests/device-delete.test.ts, tests/ru.test.ts изменены)
- Commits: 2/2 found (0a74a45, 3c8893c)
- Full suite: 483/483 green; tsc --noEmit clean; next build green
