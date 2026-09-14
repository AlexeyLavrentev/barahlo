---
phase: 04
plan: 01
subsystem: custody (movements) + device/employee cards
tags: [custody, movements, guard-update, transactions, append-only, timeline, issued-list, return-all, status-matrix, echo-values, tdd, tracer]
requires:
  - "Фаза 1: movements (append-only триггеры RAISE(ABORT), movements_device_occurred_idx) и attachments в миграции 0000; devices.status CHECK"
  - "Фаза 2: queries-конвенция (чистые модули, Tx-тип), requireSession-первой-строкой, карточка сотрудника с плейсхолдером «Техника», Combobox (Base UI)"
  - "Фаза 3: echo-values паттерн 4886f6a в devices/actions.ts, (card) route group, карточка устройства с плейсхолдерами «История перемещений»/«Фото»"
  - "04-RESEARCH: executed паттерны C1 (guard-UPDATE+INSERT), C2 (матрица переходов), C3 (return-all атомарность), C4 (alias double-join + occurredAt DESC, id DESC), C6 (батчевый max(occurred_at)), C7 (occurredAt: день + текущее время, DISPLAY_TZ)"
provides:
  - "lib/movement-schema.ts — keystone custody: 7 event-лейблов (movementEventLabel), assignSchema/acceptSchema/transferSchema(holder-аргумент) strictObject, occurredAt regex + «не в будущем» (isNotFutureDate против начала завтрашнего дня server TZ), occurredAtFromDate (C7: день + текущее время), комментарий ≤500; eventType никогда не приходит из payload"
  - "db/queries/movements.ts — assignDevice/acceptDevice/transferDevice/returnAllDevices (каждый — одна sync-транзакция: условный guard-UPDATE решает по .changes, INSERT события в той же tx; ILLEGAL_TRANSITION/EMPLOYEE_INACTIVE как {code}), listTimeline (alias double-join имён, incl. архивных, orderBy desc(occurredAt),desc(id)), listIssuedByEmployee (батчево: assigned-устройства + max(occurred_at) per device), listActiveEmployees (пикеры), getDeviceHolder; ни одного UPDATE/DELETE movements"
  - "app/(app)/devices/actions.ts — assignDeviceAction/acceptDeviceAction/transferDeviceAction: requireSession первой строкой → zod-whitelist (status/currentEmployeeId из payload не читаются — grep=0) → tx → refresh; MovementFormState с echo values; field-copy «Выберите сотрудника»/«Дата не может быть в будущем»/«Введите корректную дату»; guard-отказ → копия действия «Не удалось …»"
  - "app/(app)/devices/{device-actions,movement-dialogs}.tsx — статусная матрица (in_stock: Выдать-accent; assigned: Принять+Передать, «Выдать» скрыта — D-08; repair/disposed — пусто до планов 02/03) и 3 диалога + ReturnAllDialog: WR-01 wrapper/inner split, порядок полей сотрудник→дата→комментарий, date prefill сегодня (локальный yyyy-mm-dd, не toISOString), echo values, Combobox активных сотрудников без create-опции, pending-копии и role=alert по копи-таблице 04-UI-SPEC"
  - "app/(app)/(card)/devices/[id]/timeline.tsx + page.tsx — вертикальная лента (dot-rail, первый dot bg-ink-secondary, коннектор hairline, лейблы 14/600, маршрут по таблице событий: «→ кому»/«от → кому»/«← от кого», комментарий при наличии), empty-state «История появится после первого действия с устройством.» (без синтетических received); плейсхолдер «История» заменён, «Фото» ждёт план 03"
  - "app/(app)/(card)/employees/[id]/page.tsx — секция «Техника»: выданные устройства (модель 16px + серийник mono + «выдано {дата}» + pluralDevices-счётчик + chevron-link) и «Вернуть всю технику» (confirm-диалог, neutral bg-ink primary, копия с pluralDevices, D-07 атомарность в копи ошибки)"
  - "app/(app)/employees/actions.ts — returnAllDevicesAction (одна tx, N returned-событий) + echo-values фикс известного issue фазы 3 (EmployeeFormState.values + echoValues, employee-dialog подставляет в name)"
  - "lib/ru.ts — occurredAtFormat («03.09.2026, 15:53») и occurredDateFormat («03.09.2026») с DISPLAY_TZ='Europe/Moscow' — host-UTC в Docker не сдвигает времена"
  - "tests/movements-queries.test.ts — 33 кейса: guards (assign/accept/transfer с нулевыми эффектами), EMPLOYEE_INACTIVE, adjacency, атомарность return-all (инжектированный сбой триггером → ROLLBACK всего), D-01 границы схем (будущее/вчера/500), таймлайн (backdated-порядок + id-tiebreak + архивные имена), issued (только текущие + max assigned-дата + Ё-сортировка), append-only периметр, source-гейты"
  - "scripts/smoke-custody.mjs — E2E: 307-периметр карточки, in_stock-карточка («Выдать»+пустой таймлайн, без «Принять»/«Передать»), assigned-карточка («Принять»/«Передать»+событие «Выдача», D-08 «Выдать» нет), карточка сотрудника (выданный список + «выдано» + «1 устройство» + «Вернуть всю технику»), пустая карточка, 404"
affects: [04-02 (ремонт/списание расширяют матрицу device-actions и добавляют диалоги в movement-dialogs), 04-03 (фото заменят плейсхолдер «Фото» на карточке; таймлайн не трогают), фаза 5 (фильтры по статусу/держателю читают те же queries)]
tech-stack:
  added: []
  patterns:
    - "guard-UPDATE как проекция: условный UPDATE `WHERE id AND status=<ожидание>` решает по .changes внутри tx — Illegal-переход отбрасывается с нулевыми эффектами, окна read-then-write нет (RESEARCH C1)"
    - "return-all: N единиц — N returned-событий в ОДНОЙ db.transaction; инжектированный сбой (тестовый триггер RAISE(ABORT) на втором INSERT) откатывает все события и проекции (RESEARCH C3)"
    - "status/currentEmployeeId никогда не читаются из payload: только из строки БД внутри tx (source-тест + grep-гейт)"
    - "occurredAt: input[type=date] prefill локальным yyyy-mm-dd (не toISOString), серверный refine против начала завтрашнего дня; хранение — день + текущее время (C7); отображение — Intl с DISPLAY_TZ='Europe/Moscow'"
    - "echo-values (4886f6a) на всех новых формах + закрыт известный issue фазы 3 в employees actions/dialog"
    - "WR-01 wrapper/inner split во всех диалогах: useActionState в portal-обёртке, каждый сеанс диалога с чистого состояния"
key-files:
  created:
    - lib/movement-schema.ts
    - db/queries/movements.ts
    - "app/(app)/devices/device-actions.tsx"
    - "app/(app)/devices/movement-dialogs.tsx"
    - "app/(app)/(card)/devices/[id]/timeline.tsx"
    - tests/movements-queries.test.ts
    - scripts/smoke-custody.mjs
  modified:
    - "app/(app)/devices/actions.ts"
    - "app/(app)/(card)/devices/[id]/page.tsx"
    - "app/(app)/(card)/employees/[id]/page.tsx"
    - "app/(app)/employees/actions.ts"
    - "app/(app)/employees/employee-dialog.tsx"
    - lib/ru.ts
    - scripts/smoke-devices.mjs
requirements-addressed: [MOVE-01, MOVE-02, MOVE-03, MOVE-04, MOVE-05, EMP-02]
decisions:
  - "listActiveEmployees() размещён в db/queries/movements.ts (а не employees.ts): пикеры выдачи/передачи — часть custody-периметра, а files_modified плана не включает db/queries/employees.ts; контракту «активные сотрудники» (UI-SPEC Default 20) это не противоречит"
  - "ReturnAllDialog живёт в devices/movement-dialogs.tsx рядом с остальными movement-диалогами (монтируется карточкой сотрудника): files_modified плана не предполагает нового файла в employees/, а диалог — четвёртый movement-диалог плана"
  - "«Плюралы событий» из артефакт-описания lib/ru.ts не введены: ни одна копи-строка 04-UI-SPEC v1 их не использует (тело return-all использует существующий pluralDevices); добавлены только occurredAt-форматтеры с DISPLAY_TZ — реальный фикс Docker-UTC (RESEARCH C7/A1)"
  - "Копия refine «себе самому» («Нельзя передать устройство текущему держателю») не из копи-таблицы UI-SPEC (там её нет): adjacency-отказ доступен только при прямом выборе держателя в пикере; путь держится на inline field-error, не на generic alert"
  - "Матрица в этом плане покрывает только legal-переходы планов 01 (in_stock: Выдать; assigned: Принять/Передать); «В ремонт»/«Списать»/«Из ремонта» НЕ рендерятся вовсе (не disabled-заглушки) — по прямому указанию задачи, матрицу расширит план 02"
  - "Маппинг ошибок occurredAt различает refine (issue.code==='custom' → «Дата не может быть в будущем») и regex (→ «Введите корректную дату») — обе копии UI-SPEC достижимы"
deviations:
  - "Нет функциональных отклонений от плана; переносы listActiveEmployees/ReturnAllDialog между файлами (см. decisions) продиктованы составом files_modified и зафиксированы"
self-check:
  - "npx vitest run: 135 passed / 135 (базлайн 102 + 33 новых); TDD: test(04-01) RED fa4c067 (падение на отсутствующих модулях) → feat(04-01) GREEN 2c70c9c (данные) → UI 1fffaac"
  - "npm run build: exit 0 (TypeScript clean, route table без изменений)"
  - "node scripts/smoke-custody.mjs: exit 0 (периметр 307; in_stock/assigned матрица; D-08; событие «Выдача» с именем; выданный список; return-all копия; 404)"
  - "node scripts/smoke-devices.mjs: exit 0 (needle «Здесь появится история…» заменён на «История появится после первого действия с устройством.» + «Выдать»/data-device-assign-id, «Принять»/«Передать» отсутствуют)"
  - "node scripts/smoke-employees.mjs: exit 0 (регрессии нет, «Пока ничего не выдано» на пустой карточке)"
  - "grep-гейты: formData.get('status'|'currentEmployeeId') в actions = 0 (плюс source-тест); UPDATE/DELETE movements в app/lib/db = 0; «Выдать» при assigned не рендерится (JSX-ветка + smoke-ассерт)"
  - "npx eslint на изменённых файлах: 0 ошибок, 0 предупреждений"
status: complete
---

# Phase 04 Plan 01: Tracer — movements core + статусная матрица + диалоги + таймлайн + карточка сотрудника Summary

Транзакционное ядро учёта: «Выдать» / «Принять» / «Передать» / «Вернуть всю технику» — каждое действие атомарно (guard-UPDATE проекции + append-only событие в одной транзакции), статус и держатель читаются только из строки БД; живой таймлайн на карточке устройства (backdated-порядок по occurredAt, имена держателей через alias-join, включая архивных), выданный список и массовый возврат на карточке сотрудника; echo-values фикс форм сотрудников. Доказано 135 тестами (33 новых, TDD RED→GREEN), продакшн-билдом и тремя smoke-скриптами.

## What Was Built

- **TDD RED `fa4c067`:** `tests/movements-queries.test.ts` — 33 кейса по RESEARCH test map: assign от in_stock пишет событие+проекцию (и backdated occurredAt с комментарием); assign/accept/transfer от нелегальных статусов → `{code:'ILLEGAL_TRANSITION'}` с нулевыми изменениями; EMPLOYEE_INACTIVE для архивного/неизвестного цели; accept пишет `returned from=держатель`; transfer пишет `transferred from→to` и меняет держателя, «себе самому» отвергается; схемы: будущее reject / вчера+сегодня ok / regex-malformed reject / комментарий 500 ok 501 reject / strict accept без employeeId / transfer-refine по аргументу-держателю; return-all: N событий + держатель пуст + чужие устройства не тронуты, no-op = 0, инжектированный сбой (триггер RAISE(ABORT) на втором returned-INSERT) откатывает ВСЁ; таймлайн: backdated сортируется по occurredAt с id-tiebreak, архивные имена резолвятся; issued: только текущие assigned, issuedAt = max(assigned occurredAt) (не createdAt), Ё-сортировка; listActiveEmployees только активные; периметр: нет update/delete-путей, UPDATE movements → ABORT; source-гейты: 0 formData.get(status/currentEmployeeId) в actions, матрица ветвится по статусу.
- **GREEN данные `2c70c9c`:** `lib/movement-schema.ts` — чистый keystone: 7 event-лейблов (`movementEventLabel`), `assignSchema`/`acceptSchema` (strictObject: deviceId/employeeId coerce, occurredAt regex+refine, comment ≤500), `transferSchema(holderId)` — adjacency-refine по аргументу из БД, `occurredAtFromDate` (C7: выбранный день + текущее время, без даты = сейчас), `isNotFutureDate` против начала завтрашнего дня server TZ. `db/queries/movements.ts` — Tx-тип как в employees.ts; assignDevice (guard `WHERE id AND status='in_stock'` → SET assigned/holder; INSERT assigned from NULL to employee), acceptDevice (читает держателя ВНУТРИ tx для from-слота; guard `status='assigned'` → in_stock/NULL; INSERT returned), transferDevice (read holder в tx → guard-UPDATE → INSERT transferred), returnAllDevices (SELECT держателя → цикл event+guard-UPDATE в одной tx → count), `getDeviceHolder`, `listTimeline` (alias double-join from_emp/to_emp, `orderBy(desc(occurredAt), desc(id))`), `listIssuedByEmployee` (два батчевых запроса: строки + `max(occurred_at)` per device через sql-фрагмент), `listActiveEmployees` (is_active=1, replace Ё/ё→Е/е).
- **GREEN UI `1fffaac`:** `devices/actions.ts` — три custody-действия: requireSession первой строкой → `movementPayload(formData, withEmployee)` (пустые строки → undefined; employeeId только для person-схем — strict accept отвергает инъекцию) → safeParse → query → refresh; `MovementFormState` с echo values (employeeId/occurredAt/comment); unmapped-issues → копия действия; transfer-действие берёт держателя из `getDeviceHolder` (из БД, не из payload) для refine-аргумента. `device-actions.tsx` — матрица по статусу: in_stock → AssignDialog (accent), assigned → Accept+Transfer (secondary, «Выдать» отсутствует — D-08), repair/disposed → null. `movement-dialogs.tsx` — AssignDialog/TransferDialog (Combobox активных сотрудников, без create-опции, hidden employeeId, подсказка пустого списка)/AcceptDialog + ReturnAllDialog (тело с pluralDevices, primary bg-ink, pending «Возвращаем…»): WR-01 split, порядок сотрудник→дата→комментарий, date prefill `todayLocal()` (локальные части) + `max`, echo в defaultValue, role=alert ошибки. `timeline.tsx` — вертикальная лента: первый dot `bg-ink-secondary`, коннектор `w-px bg-hairline`, лейбл 14/600, meta `occurredAtFormat` + маршрут по таблице событий («→ кому», «от → кому», «← от кого», «от {держателя}» для to_repair), комментарий только при наличии, empty-state копи UI-SPEC. `devices/[id]/page.tsx` — action-row `flex-wrap`, `<DeviceActions>`, «История перемещений» = `<Timeline events={listTimeline(...)}>` (плейсхолдер удалён). `employees/[id]/page.tsx` — `IssuedSection`: счётчик pluralDevices, строки-ссылки (модель / серийник mono · «выдано {дата}»), ReturnAllDialog при count ≥ 1, пустое состояние «Пока ничего не выдано» сохранено дословно. `employees/actions.ts` — `returnAllDevicesAction` + echo-values фикс (`values` в EmployeeFormState, возврат во всех ветках отказа create/update); `employee-dialog.tsx` — `defaultValue={state.values?.name ?? employee?.name}`. `lib/ru.ts` — `DISPLAY_TZ='Europe/Moscow'`, `occurredAtFormat`, `occurredDateFormat`.
- **Smoke `87451e0`:** `scripts/smoke-custody.mjs` (порт 3116) — temp-БД с миграцией, зонды: in_stock-устройство без событий, assigned-устройство с backdated «Выдачей», держатель и пустой сотрудник; ассерты: 307-периметр карточки, in_stock («Выдать»+`data-device-assign-id`, пустой таймлайн, НЕТ «Принять»/«Передать»), assigned («Принять»/«Передать»+`data-*-id`, событие «Выдача»+имя+комментарий, НЕТ «Выдать» — D-08), карточка держателя (модель, SMOKE-CUST-2 mono, «выдано », «1 устройство», «Вернуть всю технику», `data-return-all-id`), пустой сотрудник («Пока ничего не выдано», без кнопки), 404 на мусорный id. `scripts/smoke-devices.mjs` — history-needle переписан на новое empty-state копи + «Выдать»-ассерты (строки «Здесь появится история…» больше не существуют).

## TDD Gate Compliance

- `test(04-01)` RED `fa4c067` (suite падает на отсутствующих `@/lib/movement-schema`) предшествует `feat(04-01)` GREEN `2c70c9c` — ворота соблюдены; UI-слой `1fffaac` и smoke `87451e0` зафиксированы после зелёного полного набора (135/135).

## Verification Evidence

- `npx vitest run` → 135 passed / 135 (12 файлов; базлайн 102 + 33 новых, включая source-гейты плана).
- `npm run build` → exit 0, TypeScript clean; route table не изменилась.
- `node scripts/smoke-custody.mjs` → exit 0: «SMOKE OK: 307 → /login без cookie; in_stock-карточка: «Выдать» + пустой таймлайн, без «Принять»/«Передать»; assigned-карточка: «Принять»/«Передать» + событие «Выдача», D-08 («Выдать» нет); карточка сотрудника: выданный список + «выдано» + «1 устройство» + «Вернуть всю технику»; пустая карточка: «Пока ничего не выдано» без кнопки; 404 на /devices/abc».
- `node scripts/smoke-devices.mjs` → exit 0 (переписанный history-needle: таймлайн-пустое + «Выдать» (D-08) + edit-остров).
- `node scripts/smoke-employees.mjs` → exit 0 (сотрудники не регрессировали).
- Греп-гейты: `formData.get('status'|'currentEmployeeId')` в обоих actions = 0; UPDATE/DELETE movements в app/lib/db = 0 (только INSERT через drizzle в queries); D-08 source-assert (ветки `status === 'in_stock'` / `status === 'assigned'` в device-actions.tsx) + smoke-ассерт отсутствия «Выдать» на assigned-карточке.
