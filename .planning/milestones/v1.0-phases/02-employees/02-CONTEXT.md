# Phase 2: Employees - Context

**Gathered:** 2026-09-01
**Status:** Ready for planning
**Mode:** --auto (все решения — recommended-дефолты, аудируются в DISCUSSION-LOG)

<domain>
## Phase Boundary

Справочник сотрудников: создание/редактирование (имя + отдел из справочника), архивирование вместо удаления (EMP-01, EMP-03), список с пагинацией и фильтром активных/архивных. Первые полноценные экраны задают визуальный язык приложения: русский UI (UI-01) и Apple-эстетика (UI-02) по гайдам skill `apple-design`. Выдача техники сотрудникам — Phase 4; поиск/фильтры — Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Список сотрудников
- **D-01:** Список-строки (не карточки): имя + отдел в одной строке, плотный вертикальный ритм, server-side pagination — 50–200 сотрудников не должны грузиться целиком. [auto] Q: «таблица или карточки?» → «список-строки» (recommended default)

### Архивирование
- **D-02:** Кнопка «Архивировать» с подтверждением; жёсткого удаления нет вообще (EMP-03, D-18 из 01-CONTEXT). Фильтр «Активные / Архив» над списком, по умолчанию «Активные». Архивный сотрудника можно разархивировать. [auto] → recommended

### Справочник отделов
- **D-03:** Управление отделами — без отдельной страницы настроек: в форме сотрудника отдел выбирается из списка (combobox) с инлайн-созданием нового отдела по мере ввода (уникальность имени уже в схеме — departments_name_uq). Начальный список заводит пользователь (D-18 из 01-CONTEXT); в dev — сид. [auto] → recommended (YAGNI: отдельная admin-страница не нужна одному оператору)

### Дубли имён
- **D-04:** Уникальность имени сотрудника НЕ enforced — два «Иван Иванов» в разных отделах реальны; различаются отделом и id. [auto] → recommended

### Поиск в списке
- **D-05:** Поиск по имени в Phase 2 не строится — список и так пагинирован, осмысленный поиск (с гомоглифами) приходит в Phase 5 (FIND-01). Deferred idea зафиксирована. [auto] → recommended (YAGNI)

### Визуальный язык
- **D-06:** Все экраны фазы — по гайдам skill `apple-design` (user-level skill): типографика, воздух, минимализм; русский язык интерфейса (UI-01/UI-02 — якорятся здесь и наследуются фазами 3–6). [auto] → подтверждено PROJECT.md

### Claude's Discretion
- Точная форма инлайн-создания отдела (dropdown+кнопка vs combobox) — на выбор планировщика по apple-design гайдам
- Сортировка списка (по имени, asc — дефолт)
- Разметка пагинации (номера vs prev/next)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Дизайн
- `/Users/aleksey/.zcode/skills/apple-design/SKILL.md` — гайды Apple-эстетики для всех экранов фазы (UI-02); читать при планировании и исполнении

### Решения и схема
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-01..D-18 фазы 1 (сессия, деплой, D-18 справочник отделов) — незыблемы
- `.planning/phases/01-foundation/01-PATTERNS.md` — конвенции структуры app/, actions.ts, zod на входах, установленные фазой 1
- `db/schema.ts` — таблицы `employees` (name, departmentId restrict, isActive) и `departments` (name unique) уже в схеме v1, миграция есть
- `.planning/research/STACK.md` §UI — Tailwind 4 + shadcn/ui подход
- `.planning/REQUIREMENTS.md` — EMP-01, EMP-03, UI-01, UI-02

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `db/schema.ts`: `employees` + `departments` с констрейнтами (restrict, unique) — готовы, миграция 0000 применена
- `scripts/seed.mjs`: 40 сотрудников / 5 отделов — dev-данные для живого списка
- `app/(app)/` shell: защищённая зона с logout, layout от фазы 1
- `lib/auth.ts` / `requireSession()`: паттерн guard-а для новых страниц

### Established Patterns
- Server Actions + zod на входе (фаза 1)
- Русские строки инлайн, без i18n-библиотеки
- Тесты vitest рядом (`tests/`), `<automated>`-проверки на каждую задачу

### Integration Points
- Новые маршруты сядут в `app/(app)/employees/` за существующим периметром
- `movements.device_id`/`employees` FK (Phase 4) опирается на архивную семантику этой фазы

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches (в рамках apple-design гайдов)

</specifics>

<deferred>
## Deferred Ideas

- Поиск/фильтр по имени сотрудника — Phase 5 (FIND-01: substring + гомоглифы через lib/normalize)
- Печатная карточка сотрудника / акт выдачи — v1.x (V2-06, по триггеру от HR/бухгалтерии)

</deferred>

---

*Phase: 2-employees*
*Context gathered: 2026-09-01*
