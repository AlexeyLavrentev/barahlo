# Phase 10: Bulk-выдача и приём - Context

**Gathered:** 2026-09-17
**Status:** Ready for planning
**Mode:** --auto (решения — рекомендованные дефолты, лог в 10-DISCUSSION-LOG.md)

<domain>
## Phase Boundary

Массовые операции в списке устройств: чекбоксы в пределах страницы + tri-state «выбрать страницу», плавающая панель «Выбрано: N» с «Выдать»/«Принять»/«Снять выделение», один диалог на партию (один сотрудник для выдачи; общие дата и комментарий), всё-или-ничего с превалидацией статусов, отчёт по каждой единице, N movement-событий (по одному на единицу).

Не входит: cross-page «выбрать всё по фильтру» (Out of Scope REQUIREMENTS — дублирует «Вернуть всю технику» на карточке сотрудника), массовое клонирование, массовые ремонт/списание/передача, выбор разных сотрудников внутри одной выдачи.

</domain>

<decisions>
## Implementation Decisions

### Выделение
- **D-01:** Чекбокс на КАЖДОЙ строке страницы (включая заведомо неeligible — см. D-02) + tri-state чекбокс в шапке списка («выбрать страницу»/снять/частично). Selection живёт в client-острове страницы, строго в пределах текущей страницы: смена страницы, фильтра или поиска сбрасывает выделение (selection не переживает навигацию — Out of Scope запрещает cross-page, и стейт между серверными переходами всё равно не живёт).
- **D-02:** Eligibility определяется действием, не строкой: «Выдать» требует статус `in_stock`; «Принять» принимает `assigned` (событие returned) И `repair` (событие from_repair). Прочие комбинации (выдать assigned, принять in_stock, что угодно с disposed) — блокируют операцию целиком.

### Транзакция и превалидация
- **D-03:** Всё-или-ничего с превалидацией ВНУТРИ транзакции: один SELECT проверяет статусы всех выбранных единиц ДО записей; если хотя бы одна неeligible — ни одна запись не происходит, оператор видит, КАКАЯ единица и ПОЧЕМУ блокирует (модель + текущий статус). Паттерн — `returnAllDevices` (movements.ts, guard-UPDATE внутри tx) + композиция как в `cloneDevices`. Повторный клик не создаёт дублей: guard-условие в каждом UPDATE (status уже сменился → 0 rows → откат) + pending-disabled сабмит.
- **D-04:** Один диалог на партию: «Выдать» — один выбор сотрудника на все единицы (существующий combobox-паттерн movement-dialogs); «Принять» — без поля сотрудника. Общие для партии: одна дата `occurredAt` (дефолт «сегодня», DISPLAY_TZ-валидация «не в будущем» — как одиночные диалоги) и один опциональный комментарий.

### Отчёт и события
- **D-05:** Итог — success-вью диалога со списком КАЖДОЙ единицы (модель · инвентарник · результат: «выдано ФИО» / «принято на склад» / «возвращено из ремонта») — оператор точно знает, сколько записано (SC 2/3). Не тост, не редирект.
- **D-06:** Успех пишет по одному movement-событию на каждую единицу (assign / returned / from_repair — соответствующие типы), общие occurredAt и комментарий — таймлайны согласованы с одиночными операциями. Выделение сбрасывается ТОЛЬКО после подтверждённого успеха.

### Claude's Discretion
- Плавающая панель: позиция/стиль (fixed bottom, Apple-эстетика), точные копи кнопок — ui-phase
- Имена: bulk-экшены в `actions.ts`, query-функция в movements.ts (рядом с returnAllDevices), остров selection
- Механика tri-state чекбокса (Base UI Checkbox с state='indeterminate')
- Тест-матрица: превалидация (смесь eligible/неeligible → откат), N событий с общим occurredAt, guard против повторного сабмита, границы N=страница (20), DISPLAY_TZ occurredAt

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Требования и решения
- `.planning/ROADMAP.md` §Phase 10 — цель, 4 success criteria (SC 1–4)
- `.planning/REQUIREMENTS.md` — MOVE-06; §Out of Scope (cross-page «выбрать всё» — анти-фича)
- `.planning/PROJECT.md` §Key Decisions — React 19 echo-values, строгий zod, T-04-02 (статус/holder только через guard-UPDATE query-слоя), TZ дней occurredAt (DISPLAY_TZ)
- `.planning/STATE.md` §Accumulated Context — Фаза 4 (movement-экшены: guard внутри транзакции), Фаза 9 (cloneDevices — транзакционная композиция; research: «bulk после клона — churn actions.ts двумя обозримыми шагами»)

### Prior phases
- `.planning/phases/09-clone/09-CONTEXT.md` — транзакционный all-or-nothing паттерн (D-03/D-06 фазы 9), диалоговая свежая механика
- `.planning/milestones/v1.0-phases/04-custody/04-CONTEXT.md` — семантика movement-действий и guard-UPDATE (D-08)

### Код — точки расширения
- `app/(app)/devices/page.tsx` — список (строки `<li><Link>`): чекбоксы + остров selection + панель; rows уже несут status (pill)
- `app/(app)/devices/movement-dialogs.tsx` — WR-01 split диалогов (wrapper open-state + useActionState + useCloseOnOk), combobox сотрудника — реюз механики
- `app/(app)/devices/actions.ts` — паттерн экшена (requireSession → zod → query → refresh); bulk-экшены рядом
- `db/queries/movements.ts` §returnAllDevices + Tx — транзакционный multi-device прецедент; bulk-функция рядом
- `lib/movement-schema.ts` — occurredAtFromDate + DISPLAY_TZ «не в будущем»; movement-типы событий
- `app/(app)/devices/query-params.ts` — парсер/билдер (не расширяется selection'ом — он client-only)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `returnAllDevices` (movements.ts) — единственный существующий multi-device транзакционный прецедент (возврат всей техники сотрудника): Tx-тип, guard-UPDATE, откат
- movement-dialogs.tsx — WR-01 split (wrapper/inner), useCloseOnOk, combobox сотрудника, echo-values, pending — вся диалоговая механика
- Строки списка уже несут `row.status` (pill) — eligibility-проверка на клиенте для дизейбла триггеров не нужна (D-01: чекбоксы везде)
- `lib/movement-schema.ts` — валидация даты/комментария, словарь событий

### Established Patterns
- requireSession первым действием экшена; строгий zod-белый список
- Guard-UPDATE внутри транзакции решает состояние (T-04-02) — payload не верит
- React 19: echo-values при ошибке; pending из useActionState против двойного сабмита
- refresh() после мутации; URL-driven фильтры через один парсер/билдер

### Integration Points
- `devices/page.tsx`: строки обрастают чекбоксами (Link + чекбокс в li — кликабельность строки сохранить), панель под списком
- Phase 11 (⌘K) не зависит от этой фазы; churn actions.ts завершён этим шагом (роадмап)

</code_context>

<specifics>
## Specific Ideas

- SC 3 буквально: «оператору видно, какая единица и почему заблокировала» — блокер-отчёт с моделью и текущим статусом
- SC 4: «выделение сбрасывается только после подтверждённого успеха» — ошибка валидации НЕ сбрасывает выделение (оператор правит действие, не перенос уживает заново)

</specifics>

<deferred>
## Deferred Ideas

- Массовые ремонт/списание/передача — не в MOVE-06 (только Выдать/Принять); отдельное решение если всплывёт
- Cross-page выбор — Out of Scope (анти-фича REQUIREMENTS)
- Сканер штрихкодов для выделения — не запрошено (родня V2-04 QR)

Auto-режим: scope creep не прилетал.

</deferred>

---

*Phase: 10-bulk*
*Context gathered: 2026-09-17*
