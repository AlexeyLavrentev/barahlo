---
phase: 04
plan: 02
subsystem: custody (repair + dispose) + device card matrix
tags: [custody, repair, dispose, guard-update, finality, disposed-view-only, destructive-red, status-matrix, echo-values, tdd, tracer]
requires:
  - "04-01: guard-UPDATE шаблон транзакций (RESEARCH C1), статусная матрица device-actions, диалоги WR-01 split с echo values, таймлайн-словарь 7 событий с route-строками (to_repair «от {держателя}»)"
  - "04-RESEARCH: C1 (guard-UPDATE по .changes), C2 (матрица 7 действий), D-03 (финальность disposed), D-04 (авто-приём держателя при «В ремонт»)"
  - "04-UI-SPEC: ремонт-диалоги (копи, pending), dispose-диалог (красная primary #D70015, обязательная причина, «Не списывать»), матрица 4 статусов, «Списано»-пилюля bg-destructive/10"
  - "Фаза 1: movements append-only триггеры, devices.status CHECK ('in_stock','assigned','repair','disposed')"
provides:
  - "lib/movement-schema.ts — repairSchema (deviceId + occurredAt? + comment? ≤500, strict — инъекция employeeId отвергается) и disposeSchema (comment ОБЯЗАТЕЛЕН: min(1).max(500) — без причины списания не существует); movementSchemas.repair/.dispose"
  - "db/queries/movements.ts — sendToRepair (in_stock|assigned → repair: guard-UPDATE с двух-статусным precondition; держатель авто-принимается — настоящий returned-событие + to_repair с from=держателя, обе в одной tx, обе с occurredAt/комментарием действия) и returnFromRepair (repair → in_stock, from_repair без персон) и disposeDevice (in_stock|assigned|repair → disposed: from=держатель если был, причина = comment события; precondition перечисляет ВСЕ не-disposed статусы — из disposed .changes===0 навсегда)"
  - "app/(app)/devices/actions.ts — sendToRepairDeviceAction/returnFromRepairDeviceAction/disposeDeviceAction (requireSession первой строкой → zod → tx → refresh); movementFieldErrorsOf получил commentCopy-параметр: пустая причина → inline «Укажите причину списания», тампер-комментарий в остальных действиях → прежний generic-fallback"
  - "app/(app)/devices/movement-dialogs.tsx — RepairDialog (direction to_repair|from_repair: «Отправить в ремонт» с хинтом «Устройство будет автоматически принято у {Имя}» при держателе / «Вернуть из ремонта» с «Устройство вернётся на склад»; pending «Отправляем…»/«Возвращаем…»; «Из ремонта» — accent-кнопка repair-карточки) и DisposeDialog (warning «Списание финально…», textarea «Причина списания» required maxLength 500 с placeholder «Например: сгорела после скачка питания», порядок причина→дата, primary «Списать» — единственная красная заливка #D70015, dismiss «Не списывать», pending «Списываем…»)"
  - "app/(app)/devices/device-actions.tsx — полная матрица 4 статусов: in_stock → Выдать(accent)·В ремонт·Списать; assigned → Принять·Передать·В ремонт·Списать (все secondary, D-08); repair → Из ремонта(accent)·Списать; disposed → null (defense-in-depth); «Списать» всегда последняя"
  - "app/(app)/(card)/devices/[id]/page.tsx — StatusPill («Списано» = bg-destructive/10 text-destructive — единственная tinted-пилюля, остальные три нейтральны; общая для мета-строки и строки «Статус»); вся строка действий (включая «Редактировать») не рендерится при disposed — D-03 view-only"
  - "tests/movements-queries.test.ts — +19 кейсов (154 итого): repair legal/illegal переходы, авто-приём (returned+to_repair в одной tx, backdated на обеих), запрет transfer из repair, dispose из трёх статусов (from=держатель), финальность (6 прямых переходов + return-all из disposed → ILLEGAL/no-op с нулевыми эффектами), история disposed читается, disposeSchema (пустая/отсутствующая причина reject, 500/501, strict), словарь 7 лейблов, source-гейты матрицы и scoping красного"
  - "scripts/smoke-custody.mjs — расширен: repair-устройство (SMOKE-CUST-3: «Из ремонта»+«Списать», событий «В ремонт» на таймлайне, без остальных кнопок) и disposed-устройство (SMOKE-CUST-4: 200 view-only — ни одной кнопки и без «Редактировать», «Списано»-пилюля bg-destructive/10, «Списание» с причиной читаются); in_stock/assigned дополнены «В ремонт»/«Списать»-ассертами и отсутствием bg-destructive на живых карточках"
affects: ["04-03 (фото: disposed-precondition для uploads уже обеспечена guard'ами статуса — фото disposed-карточки читаются, add/delete скрываются)", "фаза 5 (фильтры по статусу 'disposed' читают те же queries)", "UAT (визуальная приёмка dispose-диалога и таймлайна по 04-UI-SPEC)"]
tech-stack:
  added: []
  patterns:
    - "dispose-финальность через precondition-перечисление: guard-UPDATE `WHERE id AND status IN ('in_stock','assigned','repair')` — статус disposed никогда не матчится, никакой payload не может ни ресуситировать, ни повторно списать устройство (T-04-05/T-04-06)"
    - "«В ремонт» с держателем = ДВА события в одной tx (returned авто-приём + to_repair с from=держателя, RESEARCH C2): держатель читается внутри tx ДО guard-UPDATE, окна read-then-write нет"
    - "красный #D70015 потрачен ровно в двух местах (source-gate + smoke-гейт): solid primary dispose-диалога (bg-destructive + hover:bg-destructive/90) и tinted «Списано»-пилюля (bg-destructive/10); инлайн-ошибки остаются text-семантикой #D70015 (ERROR_CLASS)"
    - "movementFieldErrorsOf(error, fallback, commentCopy?) — копия обязательного поля передаётся только действием-владельцем (dispose), остальные действия сохраняют generic-fallback на тампер-комментарий"
key-files:
  created: []
  modified:
    - lib/movement-schema.ts
    - db/queries/movements.ts
    - "app/(app)/devices/actions.ts"
    - "app/(app)/devices/device-actions.tsx"
    - "app/(app)/devices/movement-dialogs.tsx"
    - "app/(app)/(card)/devices/[id]/page.tsx"
    - tests/movements-queries.test.ts
    - scripts/smoke-custody.mjs
requirements-addressed: [REG-04, MOVE-04, D-03, D-04]
decisions:
  - "to_repair-событие несёт from=держателя (не NULL) в assigned-пути: must_haves плана требуют returned-событие + to_repair-событие, а RESEARCH C2 и UI-SPEC («от {держателя, если был}») отводят from-слот именно to_repair — оба события честно документируют передачу от держателя, route-строка «от {Имя}» в таймлайне оживает"
  - "dispose-триггер на карточке — secondary-вариант: матрица UI-SPEC маркирует «Списать (secondary)» в строке действий, красную solid-заливку цветовая таблица тратит только на confirm-кнопку ВНУТРИ диалога; красный на карточке появляется только как «Списано»-пилюля"
  - "Строка действий при disposed скрыта на уровне page.tsx (вся, с «Редактировать», Default 3 UI-SPEC) + DeviceActions возвращает null для неизвестного статуса — двойной барьер; echo MovementFormState охватывает comment, поэтому причина возвращается в textarea после отказа"
  - "Source-gate красного оформлен как однострочный grep ('.*bg-destructive.*$' gm → ровно 1 строка на файл): комментарии tsx не содержат литерала класса, чтобы гейт оставался хрупким в нужную сторону"
  - "timeline.tsx НЕ тронут: route-строки to_repair («от {держателя}»)/from_repair/disposed уже отгружены словарём 04-01 — новые события рендерятся существующим кодом"
deviations:
  - "Функциональных отклонений нет. Тестовые правки в GREEN-коммите задачи 1: два новых теста изначально забывали, что assignDevice пишет собственное событие (ожидали 2 события вместо 3), и C7-ассерт occurredAtFromDate (тест 04-01) сравнивал свежий Date() с ранее захваченным timestamp — гонка на границе миллисекунд, флаковала при прогоне; стабилизирован сравнением с уже захваченным before"
self-check:
  - "npx vitest run → 154 passed / 154 (базлайн 135 + 19 новых); TDD: test(04-02) RED d3293c3 (11 repair-падений) → feat(04-02) GREEN 544cf6c; test(04-02) RED 68a4ea8 (8 dispose-падений) → feat(04-02) GREEN 299239f"
  - "npm run build → exit 0, TypeScript clean, route table без изменений"
  - "node scripts/smoke-custody.mjs → exit 0 (307-периметр; in_stock: Выдать·В ремонт·Списать + пустой таймлайн; assigned: Принять·Передать·В ремонт·Списать + «Выдача», D-08; repair: Из ремонта·Списать + событие «В ремонт»; disposed view-only: ноль кнопок, без «Редактировать», «Списано» bg-destructive/10, «Списание» с причиной; карточки сотрудников; 404)"
  - "node scripts/smoke-devices.mjs → exit 0; node scripts/smoke-employees.mjs → exit 0 (регрессий нет)"
  - "Греп-гейты: bg-destructive в movement-dialogs.tsx — 1 строка (dispose primary), в page.tsx — 1 строка («Списано»-пилюля), в device-actions.tsx — 0; grep -c «Списать» movement-dialogs.tsx = 5; formData.get(status/currentEmployeeId) в actions = 0; npx eslint изменённых файлов — 0 ошибок/предупреждений"
  - "Матрица source-ассерты: «В ремонт» рендерится из in_stock и assigned (RepairDialog ×2 to_repair + ×1 from_repair = 3 вхождения), «Из ремонта» только у repair, DisposeDialog ×3 (последней в каждой живой строке)"
status: complete
---

# Phase 04 Plan 02: Ремонт и списание — финальность, обязательная причина, disposed view-only Summary

Цикл ремонта замкнут действиями («В ремонт» с авто-приёмом держателя → «Из ремонта»), списание финально с обязательной причиной и красной primary, disposed-устройство view-only. REG-04 закрыт: все 4 статуса ставятся только действиями, из disposed guard-UPDATE отвергает все 7 переходов с нулевыми эффектами. Доказано 154 тестами (TDD RED→GREEN обеими задачами), сборкой и расширенным smoke.

## What Was Built

- **TDD RED `d3293c3` (ремонт):** 11 падающих кейсов — sendToRepair из in_stock (одно to_repair-событие, holder NULL), из assigned (returned авто-приём + to_repair, обе в одной tx), repair→repair и disposed→repair с нулевыми эффектами, backdated-дата, returnFromRepair (repair → in_stock, from_repair без персон; не-repair источники отвергаются), запрет transfer из repair, repairSchema (strict против employeeId-инъекции, ≤500, будущее reject) + source-ассерт матрицы.
- **GREEN `544cf6c` (ремонт):** `lib/movement-schema.ts` — repairSchema; `db/queries/movements.ts` — sendToRepair (держатель читается внутри tx, guard-UPDATE с precondition `status IN ('in_stock','assigned')`, затем returned + to_repair с from=держателя) и returnFromRepair (guard `status='repair'`); `actions.ts` — два действия с копиями «Не удалось отправить в ремонт / вернуть из ремонта»; `movement-dialogs.tsx` — RepairDialog обеих направлений (хинт авто-приёма с именем держателя, pending «Отправляем…»/«Возвращаем…», «Из ремонта» — accent repair-карточки); `device-actions.tsx` — «В ремонт» в in_stock и assigned, «Из ремонта» в repair.
- **TDD RED `68a4ea8` (списание):** 8 падающих кейсов — dispose из in_stock/assigned/repair (from=держатель, причина в комментарии), финальность: 6 прямых переходов из disposed → ILLEGAL с нулевыми эффектами, 7-й путь (return-all) не трогает disposed-устройство, история читается, disposeSchema (пустая/отсутствующая причина reject, strict), source-гейты (скрытая строка при disposed, scoping красного).
- **GREEN `299239f` (списание):** `disposeSchema` (comment min(1).max(500)); `disposeDevice` (precondition перечисляет все не-disposed статусы — из disposed никогда не матчится); `disposeDeviceAction` с commentCopy «Укажите причину списания» (только у dispose); DisposeDialog (warning финальности, textarea причина обязательна, primary «Списать» solid #D70015, dismiss «Не списывать», pending «Списываем…»); матрица — «Списать» последней в трёх живых строках, disposed → null; карточка — StatusPill с tinted «Списано» и полным скрытием строки действий при disposed; smoke расширен repair/disposed-зондами и красными гейтами.

## TDD Gate Compliance

- test(04-02) RED `d3293c3` → feat(04-02) GREEN `544cf6c`; test(04-02) RED `68a4ea8` → feat(04-02) GREEN `299239f`. Ворота соблюдены: каждый RED-коммит падает только новыми кейсами (11 и 8), GREEN-коммиты делают полный набор зелёным.

## Verification Evidence

- `npx vitest run` → 154 passed / 154 (12 файлов; базлайн 135 + 19 новых).
- `npm run build` → exit 0, TypeScript clean; route table не изменилась.
- `node scripts/smoke-custody.mjs` → exit 0 — расширенная матрица 4 статусов, D-08, disposed view-only (нет data-device-*-id и «Редактировать», «Списано»-пилюля bg-destructive/10, «Списание» с причиной), отсутствие bg-destructive на живых карточках.
- `node scripts/smoke-devices.mjs` / `node scripts/smoke-employees.mjs` → exit 0 (регрессий нет).
- Греп-гейты: bg-destructive — ровно 2 строки суммарно в dialogs+page (dispose primary и «Списано»-пилюля), 0 в device-actions; `grep -c "Списать"` dialogs = 5; eslint изменённых файлов — чисто.

---

*Phase: 04-custody-photos*
*Plan: 04-02*
*Completed: 2026-09-04*
