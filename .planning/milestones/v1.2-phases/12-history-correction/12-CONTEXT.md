# Phase 12: Правка и удаление записей истории - Context

**Gathered:** 2026-09-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Оператор исправляет собственные ошибки ввода в истории устройства: правит любую запись таймлайна (сотрудник, дата, тип действия, комментарий — прямая правка) или удаляет её с подтверждением. Текущее состояние устройства (статус, держатель) остаётся честным: после каждой правки/удаления оно пересчитывается из исправленной истории. Append-only инвариант `movements` снимается миграцией в цепочке проекта — не обходом триггеров и не ручной правкой базы. Правка **полей** устройства (updateDeviceAction) и фаза 13 (удаление устройств) — вне этой фазы.

</domain>

<decisions>
## Implementation Decisions

### Объём правки
- **D-01:** Тип действия у записи редактируем; person-слоты подстраиваются под новый тип (у «Выдачи» — только «кому», у «Возврата» — только «от кого», у «Передачи» — оба). Полный арсенал исправления на месте; неверный тип события правится, а не удаляется с пересозданием.
- **D-02:** Редактируемые поля записи: тип действия, сотрудник (по слотам типа), дата, комментарий. Валидация полей — паритет с созданием: даты через DISPLAY_TZ-контракт (`isNotFutureDate`/`occurredAtFromDate`), сотрудник только из активных (паритет `assertActiveEmployee`), комментарий ≤ 500.

### Валидация цепочки
- **D-03:** Строгий replay-контроль: после правки/удаления вся цепочка движений устройства проигрывается по `occurredAt`; невалидный итог (две «Выдачи» подряд, «Возврат» без выдачи, …) → правка отклоняется с внятной ошибкой, ноль записей. Статус устройства всегда честный — SC3 фазы буквально.
- **D-04:** Статус/держатель после правки пересчитываются replay'ем всей цепочки (проекция), а не инкрементальным патчем — статус в БД это проекция, которую сегодня пишут действия (`db/queries/movements.ts` guard-UPDATE); правка истории ломает эту модель, единственный честный пересчёт — полный replay в одной транзакции.

### Крайние случаи
- **D-05:** Удаление самой первой записи «Поступление» разрешено; цепочка без поступления валидна (replay стартует из `in_stock` — устройство «уже есть»). Единая семантика без особых случаев.
- **D-06:** Правка/удаление записей у списанного устройства разрешены наравне со всеми. Побочный эффект принят осознанно: удаление записи «Списание» = **отмена списания** (replay вернёт устройство на склад) — закрывает существующую дыру «отмены списания нет вовсе» без отдельной фичи. Это осознанный разворот коммента v1.0 в `disposeDevice` («no code path leads back») — финальность остаётся для ДЕЙСТВИЙ (кнопки «Списать» нет из disposed), снимается только правкой истории.

### Поверхность правки
- **D-07:** «Исправить» и «Удалить» живут на каждой записи таймлайна карточки устройства. Диалоги — реюз паттерна movement-dialogs (Server Action + zod + {code}-ошибки с русским текстом); удаление — с подтверждением, показывающим текст удаляемой записи. Отдельного режима редактирования нет.

### Claude's Discretion
- После правки/удаления остаёмся на карточке устройства (прецедент клона)
- Стартовое состояние replay — `in_stock`; отсутствующее «Поступление» не делает цепочку невалидной
- Сортировка таймлайна не меняется (occurredAt DESC, id tiebreaker — backdated события живут своей датой)
- Аудит правок не ведётся (прямая правка решена владельцем на старте вехи; корректирующие записи отклонены)
- Миграция: DROP триггеров append-only (`drizzle/0000`: movements UPDATE/DELETE → ABORT) новой миграцией в цепочке, применение через `scripts/migrate.mjs` (прецедент serial→nullable фазы 9) — это SC12#5 из роадмапа, не discretion
- EmployeePicker для правки сотрудника — реюз onPick-варианта из bulk-dialogs

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Планирование и требования
- `.planning/ROADMAP.md` §Phase 12 — Success criteria 1–5 (включая SC5: миграция снимает триггеры в цепочке)
- `.planning/REQUIREMENTS.md` §HIST — HIST-01..03 дословно
- `.planning/PROJECT.md` §Key Decisions — DISPLAY_TZ, keystone movement-schema, действие-валидация, D-05 names-as-text, migration-only через runner

### Код — слои, которые фаза трогает
- `db/queries/movements.ts` — один-tx guard-UPDATE паттерн, проекция статуса, listTimeline/listIssuedByEmployee (issuedAt = max(occurred_at) assigned-событий — replay сохранит parity)
- `lib/movement-schema.ts` — keystone словаря событий + русские метки + DISPLAY_TZ-хелперы (isNotFutureDate, occurredAtFromDate) — переиспользовать, не дублировать
- `lib/ru.ts` — DISPLAY_TZ=Europe/Moscow
- `app/(app)/devices/movement-dialogs.tsx` — паттерн диалогов действий (D-07)
- `app/(app)/devices/actions.ts` — Server Actions: zod → query-слой → revalidate; {code}-throw → русский текст
- `drizzle/0000_*.sql` (строки ~97–101) — триггеры append-only, которые снимает миграция
- `scripts/migrate.mjs` — раннер миграций (прецедент фазы 9; голый drizzle-kit migrate молча падает на заполненной базе)
- `db/schema.ts` — devices.status CHECK-констрейнт и проекционные колонки

### Гайды
- `/Users/aleksey/.zcode/skills/vercel-react-best-practices/SKILL.md` — USER MANDATE: соблюдать в research/планах/коде и проверять на ревью (проводится с фазы 3)
- Гайды apple-design — Apple-эстетика диалогов (прецедент карточек/диалогов v1.0–v1.1)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- EmployeePicker (bulk-dialogs, onPick-расширение) — выбор сотрудника в диалоге правки
- movement-schema хелперы (DATE_PATTERN, isNotFutureDate, occurredAtFromDate, словарь меток) — валидация и лейблы правки без дублирования
- ruSortKey (Ё/ё-фолд ORDER BY) — если правка порождает новые списки
- Паттерн подтверждений диалогов (dispose/unarchive) — текст подтверждения удаления записи

### Established Patterns
- Один-tx + условный guard-UPDATE + .changes-решение — правка истории наследует атомарность, но guard переосмысляется: replay в той же транзакции решает валидность (D-03/D-04), reject = ноль записей
- zod strictObject на каждый экшен; eventType никогда из payload — для правки eventType ПОЛЬЗОВАТЕЛЬСКИЙ (впервые) — схема правки валидирует его по словарю keystone
- {code}-throw union → русский текст ошибки в диалоге; blockers-as-data для батчей (здесь одиночные записи — throw достаточно)
- D-05: таймлайн рендерит имена текстом; ids для правки тянет новый query (listTimeline сейчас отдаёт только имена)

### Integration Points
- Карточка устройства: таймлайн (listTimeline) получает кнопки правки/удаления (D-07)
- После правки: revalidate карточки + строки реестра + карточки сотрудника (статус/держатель изменились) — те же поверхности, что и после действий
- listIssuedByEmployee («выдано {дата}») продолжает считаться от assigned-событий — replay сохраняет parity автоматически
- Миграция 0002: DROP TRIGGER append-only → UPDATE/DELETE movements легальны ТОЛЬКО через серверный слой (actions), не напрямую

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-Правка и удаление записей истории*
*Context gathered: 2026-09-28*
