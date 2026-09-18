# Phase 9: Клон устройства - Context

**Gathered:** 2026-09-16
**Status:** Ready for planning
**Mode:** --auto (решения — рекомендованные дефолты, лог в 09-DISCUSSION-LOG.md)

<domain>
## Phase Boundary

«Дублировать» на карточке устройства: диалог с количеством (1..100), одна транзакция создаёт N копий — всё или ничего. Копии наследуют закупочный блок и конфигурацию типа, рождаются «на складе» с пустым серийником, чистой историей и редактируемой автоподсказкой инвентарного номера. Единственная миграция схемы вехи: serial → nullable.

Не входит: bulk-выдача/приём (Phase 10), cross-page «выбрать всё» (Out of Scope REQUIREMENTS), копирование между типами, шаблоны устройств («сохранить как пресет» — не запрошено).

</domain>

<decisions>
## Implementation Decisions

### Диалог и автоподсказка инвентарника
- **D-01:** Кнопка «Дублировать» на карточке устройства (рядом с custody-действиями `device-actions.tsx`) открывает отдельный клон-диалог — НЕ реюз create/edit формы `device-dialog.tsx`. Поля диалога: количество (1..100, дефолт 1) и одно редактируемое поле «Инвентарный номер» с автоподсказкой. — **Reversibility:** reversible — отдельный компонент, существующие формы не тронуты
- **D-02:** Автоподсказка инвентарника: префилл = «следующий по шаблону оригинала» с сохранением нулевого паддинга (`AB-001` → `AB-002`; `INV 007` → `INV 008`). Поле редактируемое — оператор правит стартовое значение. При N копий каждая следующая инкрементится от предыдущей (`AB-002`, `AB-003`, …). Если шаблон не распознан (нет хвостового числа) — поле пустое и ничего не дописывается молча (SC 3); копии с пустыми инвентарниками легальны (NULL/NULL-пара, D-17 фазы 3). Распознавание шаблона и инкремент — чистая функция в lib (vitest-покрытие: паддинг, многозначные хвосты, не-числовые хвосты, пустой инвентарник оригинала).
- **D-03:** Верхняя граница N = 100 (масштаб проекта — сотни устройств; покупка партии > 100 за раз нереалистична, а неограниченный N — DoS-поверхность на транзакцию).

### Наследование и чистота копий
- **D-04:** Наследуется: тип, модель, дата закупки, стоимость, поставщик, гарантия (SC 4 «поля одной закупки» — поставщик входит) + конфиг-поля своего типа (RAM/SSD/ramUpgraded, диагональ/матрица, порты, вид — копия «готова к выдаче» той же конфигурации).
- **D-05:** Никогда не копируются: серийник (пустой — миграция nullable), инвентарник (своя подсказка/ручной ввод), заметки notes (контекст конкретной единицы), фото, история перемещений, владелец (SC 2). Копии создаются status=in_stock, currentEmployeeId=null.

### Движения и транзакция
- **D-06:** Ни одного movement-события при клонировании: создание устройства не является перемещением (movements append-only про смену custody, D-08 фазы 4); таймлайн копий рождается чистым. Сбой в середине пакета не оставляет «половину» копий — одна транзакция (SC 1); UNIQUE-коллизия инвентарника внутри пакета откатывает всё и мапится в существующий `uniqueFieldError`-паттерн.
- **D-07:** После успеха остаёмся на карточке оригинала; подтверждение — сообщение «Создано N копий» (перенавигация на копию не нужна: копии видны в реестре, «на складе»).

### Миграция serial → nullable
- **D-08:** Семантика (механизм — решает план фазы, STATE blocker [Phase 9] «research: NULL-pair рецепт; decision-heavy»): устройства могут существовать без серийника; множественные NULL-пары (serial=NULL, serial_normalized=NULL) легальны и не конфликтуют по UNIQUE; непустые серийники уникальны как раньше. Миграция только generate+migrate (никогда push — Key Decision). После миграции: форма create/edit принимает пустой серийник? — НЕТ, вне скоупа: пустой серийник легален только у копий (REG-06); обязательность в обычной форме не меняется (zod `min(1)` в CommonFields остаётся для ручного создания/редактирования; клон-путь пишет NULL напрямую через query-слой, минуя эту валидацию). — **Reversibility:** one-way — миграция схемы SQLite (пересоздание таблицы); но семантически обратима (NOT NULL можно вернуть миграцией при пустых копиях — данных не теряется)

### Claude's Discretion
- Механизм миграции (partial unique index `WHERE serial_normalized IS NOT NULL` vs expression index) — план фазы, STATE blocker [Phase 9]
- Расположение чистой функции шаблона/инкремента (lib/), имя клон-экшена и диалога
- Копи диалога (заголовок «Дублировать устройство», подпись поля количества) — ui-контракт в планах, Apple-стиль
- Тест-матрица vitest: транзакционность (сбой середины пакета), шаблон/паддинг/инкремент, NULL-пары, наследование полей, граница N=100, collision-откат

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Требования и решения
- `.planning/ROADMAP.md` §Phase 9 — цель, 4 success criteria (SC 1–4)
- `.planning/REQUIREMENTS.md` — REG-06; §Out of Scope (cross-page bulk — анти-фича, без новых npm)
- `.planning/PROJECT.md` §Key Decisions — Pitfall 5 (пустой инвентарник = NULL/NULL-пара), strict zod whitelist (T-03-02), React 19 echo-values (4886f6a), generate+migrate никогда push
- `.planning/STATE.md` §Accumulated Context — Blockers [Phase 9]: миграция serial → nullable, NULL-pair рецепт research; уникальные коллизии как { code } (uniqueCodeOf)

### Prior phases
- `.planning/milestones/v1.0-phases/03-device-registry/03-CONTEXT.md` — кейстоун device-schema, normalized UNIQUE-пары, FIELD_COPY-паттерн ошибок
- `.planning/phases/08-csv/08-CONTEXT.md` — соседний образец формата решений; D-02-дисциплина «один источник меток»

### Код — точки расширения
- `app/(app)/devices/actions.ts` — паттерн экшена: requireSession первый, zod-белый список, echo-values, uniqueFieldError, refresh(); клон-экшен рядом
- `db/queries/devices.ts` §createDevice + inventoryPair + uniqueCodeOf — создание строки и NULL-пара; клон-функция (транзакция N insert'ов) рядом
- `lib/device-schema.ts` §CommonFields — serial zod min(1) (остаётся для ручной формы); миграция меняет db/schema.ts, не этот контракт
- `db/schema.ts` — serial NOT NULL + UNIQUE normalized — точка миграции (план решает механизм NULL-пар)
- `app/(app)/devices/device-dialog.tsx` — механика диалога (не реюзнуть, но паттерн useActionState + Dialog)
- `app/(app)/devices/device-actions.tsx` — ряд кнопок карточки, куда встаёт «Дублировать»
- `lib/normalize.mjs` — normalizeSerial/normalizeInventory (для NULL-пар и проверки шаблона)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createDevice` + `inventoryPair` (`db/queries/devices.ts`) — прямое создание с NULL-парой уже работает; клон = N вызовов в одной транзакции (better-sqlite3 transaction)
- `uniqueCodeOf`/`uniqueFieldError` — коллизии как бизнес-ошибка с русской копией; клон-откат переиспользует
- Паттерн DeviceDialog/useActionState/echo-values — механика формы для клон-диалога
- `normalizeInventory` — нормализация для сравнения «следующего» номера

### Established Patterns
- requireSession() первым действием каждого server action (T-03-01)
- Строгий zod-белый список, extrakeys = tampering → reject (T-03-02)
- React 19: uncontrolled-формы сбрасываются → echo values в state при ошибке (4886f6a)
- refresh() после мутации, иначе список не перерисуется (Pitfall 1 фазы 3)
- Статус/holder никогда из payload — только query-слой (T-04-02)

### Integration Points
- Карточка `devices/[id]/page.tsx` + `device-actions.tsx` — кнопка «Дублировать»
- `db/schema.ts` + generate+migrate — единственная миграция вехи (serial nullable)
- Phase 10 (bulk) переиспользует транзакционный паттерн клон-экшена и, возможно, диалоговую механику

</code_context>

<specifics>
## Specific Ideas

- «Копия готова к выдаче сразу после подтверждения инвентарника» (SC 4) — наследование конфигурации обязательно
- «Если шаблон не распознан, поле пустое и ничего не дописывается молча» (SC 3) — без автогенерации «AB-002» из «ABC»
- Копии «на складе» — не «как оригинал»: даже если оригинал выдан/в ремонте/списан (SC 2)

</specifics>

<deferred>
## Deferred Ideas

- Пустой серийник в обычной форме создания/редактирования — вне скоупа REG-06 (D-08); если понадобится — отдельное решение
- Шаблоны устройств («сохранить как пресет») — не запрошено
- Печать этикеток на копии — V2-04 QR, future

Auto-режим: scope creep не прилетал (юзер-ввода не было, все зоны закрыты рекомендациями).

</deferred>

---

*Phase: 09-clone*
*Context gathered: 2026-09-16*
