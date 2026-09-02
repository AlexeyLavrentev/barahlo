# Phase 3: Device Registry - Context

**Gathered:** 2026-09-02
**Status:** Ready for planning
**Mode:** --auto (все решения — recommended-дефолты, аудируются в DISCUSSION-LOG)

<domain>
## Phase Boundary

Реестр устройств: 4 фиксированных типа (ноутбук / монитор / док-станция / периферия) с пер-типовыми наборами полей через keystone-модуль `device_schema` (единый источник для форм, валидации и будущих фильтров), пагинированный список с фильтром по типу, карточка устройства. Прямое редактирование статуса и держателя — ЗАПРЕЩЕНО (roadmap): статус выдаётся фазой 4 (custody-действия), новый автомобиль... устройство создаётся «на складе». Фото — фаза 4, поиск/фильтры по полям — фаза 5. Сотрудники уже готовы (фаза 2).

</domain>

<decisions>
## Implementation Decisions

### Наборы полей по типам (device_schema keystone)
- **D-01:** Общие поля всех типов: модель*, серийник*, инвентарник (ручной, из 1С, опционален при создании — D-16), закупка (дата, цена ₽, поставщик), гарантия до, заметки. Пер-типовые: ноутбук — RAM ГБ, флаг «RAM апгрейдена», SSD ГБ; монитор — диагональ", тип матрицы; док-станция — кол-во портов; периферия — вид. [auto] → recommended (совпадает с typed-колонками схемы v1: ramGb/ramUpgraded/ssdGb/screenDiagonal/panelType/portCount/peripheralKind)
- **D-02:** `device_schema` — единственный источник: для каждого typeKey — список полей (ключ, label ru, тип, required, группа), из него генерятся форма и валидация; фильтры фазы 5 прочитают тот же модуль. Никаких параллельных списков полей в компонентах. [auto] → recommended

### Вид периферии
- **D-03:** peripheralKind — фиксированный список: мышь / клавиатура / гарнитура / веб-камера / прочее (select, не свободный текст) — фильтруемость важнее свободы. [auto] → recommended

### Обязательность серийника
- **D-04:** Серийник обязателен для всех типов (схема NOT NULL + UNIQUE на normalized; Core Value — поиск по серийнику). Конвенция для безсерийной периферии: вписывается инвентарный номер из 1С. [auto] → recommended (документируется в форме подсказкой)

### Список устройств
- **D-05:** Колонки: модель · тип · серийник · инвентарник · текущий держатель · статус. Фильтр по типу — dropdown (4 типа не влезают в сегмент красиво), пагинация как у сотрудников (20/стр, prev/next). Пустое состояние «Пока нет устройств» + CTA. [auto] → recommended (D-01 паттерны фазы 2)

### Карточка устройства
- **D-06:** Карточка показывает все поля типа группами (Основное / Закупка / Характеристики типа) + место под историю перемещений и фото (фаза 4). Редактирование — тот же диалог, что создание, в edit-режиме (паттерн фазы 2). Статус и держатель в форме ОТСУТСТВУЮТ — только просмотр. [auto] → recommended

### Claude's Discretion
- Точная группировка полей в карточке и порядок колонок списка
- Формат отображения даты/цены (ru-RU Intl)
- Подсказка про инвентарник-вместо-серийника у периферии (текст)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Дизайн и паттерны
- `/Users/aleksey/.zcode/skills/apple-design/SKILL.md` — визуальный язык (унаследован с фазы 2)
- `.planning/phases/02-employees/02-UI-SPEC.md` — действующий UI-контракт (токены, копи, состояния); фаза 3 расширяет его на устройства
- `.planning/phases/02-employees/02-PATTERNS.md` — list/detail/dialog/actions аналоги

### Схема и решения
- `db/schema.ts` — таблица devices: typed nullable колонки всех типов, UNIQUE на serialNormalized/inventoryNormalized, CHECK статусов, индексы — миграция есть, новых миграций НЕТ
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-16/D-17 (ручные инвентарники, UNIQUE нормализованных номеров)
- `lib/normalize.mjs` — нормализация номеров для записи serialNormalized/inventoryNormalized
- `.planning/REQUIREMENTS.md` — REG-01, REG-02, REG-03 (REG-04/REG-05 — фаза 4)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `db/queries/employees.ts` — паттерн queries-модуля (синхронный better-sqlite3, пагинация, RU-сортировка) → `db/queries/devices.ts`
- `app/(app)/employees/*` — list/card/dialog/actions/guard паттерны, сегмент+пагинация, пустые состояния
- `components/ui/*` — shadcn набор (select вместо combobox для фиксированных списков)
- `lib/normalize.mjs` + `lib/ru.ts` — нормализация номеров, плюрализация
- `scripts/seed.mjs` — 80 устройств в dev-базе (40 ноутов и др. по типам)

### Established Patterns
- Server Actions: requireSession() → zod → queries → refresh()
- default-deny периметр не трогаем; новые маршруты в app/(app)/devices/
- Русские строки инлайн; тесты vitest с temp-SQLite

### Integration Points
- `movements` (фаза 4) пишется при custody-действиях, реестр только читает currentEmployeeId
- `device_schema` из фазы 3 станет источником фильтров фазы 5 (FIND-02 «без апгрейда RAM»)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches (в рамках действующего UI-контракта)

</specifics>

<deferred>
## Deferred Ideas

- Фото устройства — Phase 4 (REG-05)
- Статусы в UI (в ремонт/списано действиями) — Phase 4 (REG-04)
- Поиск и фильтры по полям («без апгрейда RAM», гарантия) — Phase 5 (FIND-01..04, WAR-01)
- Клон устройства для массовой закупки — v1.x (V2-03)

</deferred>

---

*Phase: 3-device-registry*
*Context gathered: 2026-09-02*
