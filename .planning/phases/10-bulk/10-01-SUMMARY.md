---
phase: 10-bulk
plan: 01
subsystem: ui
tags: [bulk, movements, selection, transactions]

# Dependency graph
requires:
  - phase: 04-custody
    provides: guard-UPDATE транзакционный паттерн movements (T-04-02), WR-01 split диалогов, EmployeePicker/OccurredAtField/CommentField рецепты
  - phase: 09-clone
    provides: транзакционная композиция (cloneDevices), прецедент отдельного файла диалога с FormState-данными (CloneFormState.created)
  - phase: 05-find
    provides: список /devices (page.tsx), query-params.ts buildDevicesQuery — key-reset выделения, PAGE_SIZE=20
provides:
  - Bulk-«Выдать»: выделение → панель → диалог партии → одна tx с in-tx превалидацией → refresh + отчёт «Записано: N»
  - Bulk-«Принять»: двух-статусный precondition (assigned|repair), returned от держателя из tx-снапшота + from_repair без лиц
  - Первый context-провайдер приложения: DeviceBulkProvider (Set<number>, key-reset по buildDevicesQuery), RowCheckbox, HeaderTriState, FloatingPanel
  - Tri-state чекбокс враппера (MinusIcon + data-indeterminate accent)
  - BulkFormState (blockers/results) — прецедент FormState-с-данными для будущих массовых операций
affects: [Phase 11 (⌘K — без жёсткой зависимости), deferred массовые ремонт/списание]

# Tech tracking
tech-stack:
  added: []  # ни одной новой зависимости (REQUIREMENTS Out of Scope)
  patterns:
    - "Context-provider остров с children-composition + key-reset (первый createContext в приложении)"
    - "In-tx SELECT-превалидация с union-возвратом blockers (не throw) — данные вместо кодов"
    - "Guard-UPDATE цикл в одной tx: .changes===0 → throw → полный откат партии (anti-double-write)"
    - "Диалог-отчёт: state.ok рендерит отчёт вместо полей, ok-эффект = единственная точка сброса выделения"

key-files:
  created:
    - app/(app)/devices/device-bulk.tsx
    - app/(app)/devices/bulk-dialogs.tsx
  modified:
    - lib/movement-schema.ts
    - db/queries/movements.ts
    - app/(app)/devices/actions.ts
    - components/ui/checkbox.tsx
    - app/(app)/devices/page.tsx
    - tests/movements-queries.test.ts
    - tests/movement-schema.test.ts

key-decisions:
  - "Диалоги партии смонтированы рядом с FloatingPanel (не внутри её size>0 блока): clear() в ok-эффекте опустошает Set — панель исчезает за открытым диалогом, отчёт «Записано: N» остаётся на экране (D-05)"
  - "EmployeePicker-копия в bulk-dialogs расширена опциональным onPick — ФИО success-отчёта берётся из клиентского выбора пикера (Open Question 3); механика скопирована дословно, не абстрагирована"
  - "bulk-функции возвращают discriminated union BulkOutcome вместо throw: blockers несут данные (модель/статус каждой блокирующей), { code }-throw зарезервирован за in-batch дубликатом id и гонками (guard-UPDATE .changes===0)"
  - "Дедупликация deviceIds (new Set) в экшене ДО zod-парсинга: повтор из formData не доходит до капа 20 и query; дубли в zod проходят намеренно (границы закреплены тестом)"
  - "Спейсер страницы — условный h-24 div внутри провайдера после children (клиентский эквивалент UI-SPEC pb-24: section серверный, остров не может трогать его классы)"

patterns-established:
  - "DeviceBulkProvider key={buildDevicesQuery(filters, current)}: любой переход меняет ключ → остров размонтируется → чистый Set (шаблон для будущих client-островов с URL-scoped стейтом)"
  - "BulkFormState { blockers?, results? } — продолжение FormState-семейства (DeviceFormState/MovementFormState/CloneFormState)"
  - "Тест-паттерн bulk-матрицы: prevalidation-first repeat-guard, in-batch дубликат → ILLEGAL_TRANSITION + movementsCount() без изменений"

requirements-completed: [MOVE-06]  # отметка в REQUIREMENTS.md — после UAT-гейта (Task 3)

coverage:
  - id: D1
    description: "bulkAssignDevices — одна tx: SELECT-превалидация, blockers-union без записей, guard-UPDATE откат, N событий с общими occurredAt/comment"
    requirement: MOVE-06
    verification:
      - kind: unit
        ref: "tests/movements-queries.test.ts#bulkAssignDevices — партия всё-или-ничего (7 тестов, вкл. rollback-ассерты movementsCount())"
        status: pass
    human_judgment: false
  - id: D2
    description: "bulkAcceptDevices — двух-статусный precondition (assigned|repair): returned от держателя снапшота, from_repair без лиц, общий occurredAt"
    requirement: MOVE-06
    verification:
      - kind: unit
        ref: "tests/movements-queries.test.ts#bulkAcceptDevices — партия на склад (4 теста: смешанная партия, in_stock-blocker, repeat-guard, strictObject)"
        status: pass
    human_judgment: false
  - id: D3
    description: "bulk-схемы: deviceIds 1..20 (0/21/мусор/дубли), employeeId-инъекция в accept отклонена, дата «не в будущем»"
    requirement: MOVE-06
    verification:
      - kind: unit
        ref: "tests/movement-schema.test.ts#bulk schemas — deviceIds bounds + whitelist (6 тестов)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Bulk-экшены: requireSession первым, дедуп Set, один occurredAtFromDate, blockers union'ом, BulkFormState"
    requirement: MOVE-06
    verification:
      - kind: other
        ref: "npx tsc --noEmit && npm run build (контракт-типизация; серверное поведение через D1/D2)"
        status: pass
    human_judgment: true
    rationale: "Экшены не юнит-тестятся в проекте (server-only, компонентного/экшен-раннера нет — прецедент фаз 2/7); сквозное поведение проверяет UAT-гейт Task 3 (Playwright MCP), на момент записи SUMMARY — pending"
  - id: D5
    description: "UI выделения: чекбоксы строк (сиблинг Link), tri-state шапка, панель «Выбрано: N» с h-24 спейсером, key-reset при навигации"
    requirement: MOVE-06
    verification: []
    human_judgment: true
    rationale: "Компонентного раннера нет (прецедент фаз 2/7) — data-иглы data-device-select/data-bulk-panel/data-bulk-count оставлены для UAT-гейта Task 3 (Playwright MCP), pending"
  - id: D6
    description: "Диалоги партии: blocker-отчёт «какая единица и почему», success-отчёт «Записано: N», сброс выделения только после успеха"
    requirement: MOVE-06
    verification: []
    human_judgment: true
    rationale: "Визуальное/интеракционное поведение (SC 1–4) — предмет UAT-гейта Task 3, pending на момент записи SUMMARY"

# Metrics
duration: 23 min
completed: 2026-09-17
status: partial  # T1–T2 выполнены и закоммичены; T3 = блокирующий UAT-гейт, ожидает оркестратора
---

# Phase 10 Plan 01: Bulk-выдача и приём Summary

**Bulk-выдача/приём (MOVE-06): чекбоксы строк + tri-state «выбрать страницу», панель «Выбрано: N», диалоги партии, транзакция всё-или-ничего с in-tx превалидацией и отчётом по каждой единице**

## Performance

- **Duration:** 23 min (Tasks 1–2; Task 3 = UAT-гейт, вне автоматической части)
- **Started:** 2026-09-17T10:25:02Z
- **Completed (T1–T2):** 2026-09-17T10:48:17Z
- **Tasks:** 2 of 3 (Task 3 — checkpoint:human-verify, returned to orchestrator)
- **Files modified:** 9 (2 new + 7 modified, ровно как в files_modified плана)

## Accomplishments

- Обе bulk-операции на одном паттерне: «Выдать» (один сотрудник на партию, только in_stock) и «Принять» (assigned+repair, без поля сотрудника); каждая единица даёт ровно одно movement-событие с общими occurredAt и комментарием
- Всё-или-ничего с превалидацией ВНУТРИ tx: неeligible единица блокирует всю операцию — ноль записей, отчёт называет каждую блокирующую («модель · инвентарник · статус»)
- Selection строго page-scoped: key-reset по buildDevicesQuery растворяет выделение при любой навигации; сброс в рантайме только после подтверждённого успеха (ok-эффект) и кнопкой «Снять выделение»
- Повторный клик не создаёт дублей: pending-disabled сабмит + guard-UPDATE (.changes===0 → throw → полный откат партии)
- Полная unit-матрица: 17 новых тестов (7 assign + 4 accept + 6 schema-границ), полный сьют 409/409 зелёный

## Task Commits

Каждая задача — TDD (RED → GREEN), атомарно:

1. **Task 1 RED: bulk-assign матрица** - `8ae36a2` (test)
2. **Task 1 GREEN: tracer «Выдать» сквозь все слои** - `62659f8` (feat)
3. **Task 2 RED: bulk-accept матрица + границы схем** - `0ba52a7` (test)
4. **Task 2 GREEN: bulk-«Принять» + полная матрица** - `b4984d5` (feat)

**Task 3** — checkpoint:human-verify (UAT-гейт SC 1–4 + backstop-проверки): возвращён оркестратору, НЕ выполнялся исполнителем (по постановке UAT прогоняет оркестратор через Playwright MCP).

## Files Created/Modified

- `app/(app)/devices/device-bulk.tsx` (NEW) — первый context-провайдер: Set<number>, RowCheckbox (сиблинг Link, data-device-select), HeaderTriState (controlled tri-state), FloatingPanel (data-bulk-panel/count), h-24 спейсер
- `app/(app)/devices/bulk-dialogs.tsx` (NEW) — BulkAssignDialog/BulkAcceptDialog (WR-01 split): hidden deviceIds×N, blocker-вью, success-отчёт «Записано: N», ok-эффект → provider.clear()
- `db/queries/movements.ts` — BulkBlocker/BulkOutcome union, bulkAssignDevices/bulkAcceptDevices (одна tx, SELECT-превалидация, guard-UPDATE, asc(id))
- `lib/movement-schema.ts` — deviceIdsSchema (1..20), bulkAssignSchema/bulkAcceptSchema (strictObject) в movementSchemas
- `app/(app)/devices/actions.ts` — BulkFormState (blockers/results), bulkPayload с дедупом, bulkAssignDevicesAction/bulkAcceptDevicesAction, BULK_*_ERROR копи
- `components/ui/checkbox.tsx` — условный глиф (MinusIcon при indeterminate) + data-indeterminate accent-классы
- `app/(app)/devices/page.tsx` — строки [RowCheckbox][Link flex-1], header-strip в карточке, provider key-wrap; пагинация/пустые состояния не тронуты
- `tests/movements-queries.test.ts` — bulk-матрица assign+accept (превалидация, откат, N событий, repeat-guard, EMPLOYEE_INACTIVE, смешанный accept)
- `tests/movement-schema.test.ts` — границы deviceIds (0/21/дубли/мусор), strictObject employeeId-гейт, будущая дата

## Decisions Made

- Диалоги смонтированы рядом с панелью, не внутри её size>0 блока — clear() в ok-эффекте гасит панель за открытым диалогом, отчёт остаётся (D-05 без «исчезнувшего» окна)
- EmployeePicker-копия расширена onPick-колбэком для ФИО отчёта (клиентский выбор пикера — Open Question 3); остальная механика скопирована дословно
- Blockers едут union'ом как данные; throw {code} — только in-batch дубликат id / гонка (guard-UPDATE), после catch-преобразования в копи-таблицу (V7)
- В Task 1 кнопка «Принять» панели рендерилась без диалога (его слот — Task 2 по плану); промежуточное состояние закрыто в `b4984d5`, UAT-гейт стоит после Task 2 — до пользователя interim не доехал

## Deviations from Plan

None - план выполнен как написан (структура файлов, копи, data-иглы, копирайт-контракт — дословно; 9/9 files_modified совпадают).

## Issues Encountered

- Transient: при сборке Task 1 остаточная ссылка acceptOpen (артефакт поэтапного редактирования) поймана tsc до коммита и убрана — в коммиты не попала.
- lint: 0 ошибок; 6 warnings — pre-existing (page.tsx корня, use-search-param.ts, два тест-файла), файлы фазой не трогались — out of scope.

## Verification (phase gate перед Task 3)

- `npx vitest run` — 409/409 зелёный (существующие не сломаны, +17 bulk)
- `npx tsc --noEmit` — чистый
- `npm run build` — зелёный
- `npm run lint` — 0 ошибок (6 pre-existing warnings в нетронутых файлах)

## Remaining (Task 3 — UAT-гейт, checkpoint:human-verify)

Сценарии для оркестратора (Playwright MCP, `npm run dev`, /devices; нужны статусы in_stock/assigned/repair — seed содержит все):

1. SC 1: чекбокс строки → панель «Выбрано: 1»; частичное выделение → ДЕФИС на акцентном фоне в шапке; «Выбрать страницу» → все строки; «Снять выделение» → панель исчезла
2. Спейсер: панель не перекрывает пагинацию; после снятия выделения отступ схлопнулся
3. SC 2/4: выдать 2 складских → отчёт «Записано: 2» (модель · инвентарник · выдано ФИО), выделение сброшено, в таймлайнах по «Выдаче» с одинаковым временем/комментарием
4. SC 3: складское + выданное → «Выдать» → красное «Операция не выполнена: ничего не записано.» + строка блокера; выделение на месте, таймлайны не изменились
5. Принять: «Используется» + «В ремонте» → диалог без поля сотрудника → «принято на склад» / «возвращено из ремонта»; статусы стали «На складе»
6. Backstop: навигация (пагинация/фильтр/поиск) растворяет выделение
7. Backstop: дата из будущего → «Дата не может быть в будущем», echo, выделение на месте
8. Backstop: двойной сабмит → одна запись на единицу
9. Backstop: комментарий ~500 символов; длинное ФИО в отчёте обрезается

После approval: отметить MOVE-06, довести STATE/ROADMAP до complete, финализировать SUMMARY.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- MOVE-06 функционально готов; блокер один — UAT-гейт Task 3 (по прецеденту фаз 7/9: оркестратор + Playwright MCP)
- actions.ts churn завершён (роадмап): Phase 11 (⌘K) не зависит от фазы; задел для deferred массовых ремонт/списание — BulkOutcome-прецедент

---
*Phase: 10-bulk*
*Completed: 2026-09-17 (T1–T2; T3 awaiting UAT)*

## Self-Check: PASSED

- Files on disk: device-bulk.tsx, bulk-dialogs.tsx, 10-01-SUMMARY.md — FOUND
- Commits in log: 8ae36a2, 62659f8, 0ba52a7, b4984d5, 97e95b9 — FOUND
- Smoke needles: data-device-select/panel/count (остров) + data-bulk-blockers/report (диалоги) — все на месте
- Phase gate перед Task 3: vitest 409/409, tsc clean, build green, lint 0 ошибок
