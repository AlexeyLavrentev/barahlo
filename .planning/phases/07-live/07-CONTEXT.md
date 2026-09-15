# Phase 7: Live-поиск по сотрудникам - Context

**Gathered:** 2026-09-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Живой поиск в справочнике сотрудников (`/employees`) по имени и отделу с тем же фолдингом, что у устройств (Ё/ё, гомоглифы), URL-состояние `?q=` с пагинацией и пустым состоянием. Попутно извлекается общий debounce-хук из device search-box — его переиспользуют рефакторенный поиск устройств (SC 5) и ⌘K-палитра Phase 11.

Не входит: поиск устройств по имени держателя (отклонён в фазе 5), ⌘K-палитра и бейдж «в архиве» в результатах (Phase 11), CSV-выгрузка сотрудников (не запрошена).

</domain>

<decisions>
## Implementation Decisions

### Фолд и матчинг
- **D-01:** Ё/ё-фолд живёт в employee-предикате поиска (replace Ё/ё→Е/е поверх `norm()` на обеих сторонах LIKE). `lib/normalize.mjs` и `norm()`-UDF не меняются — поиск устройств остаётся байт-в-байт «как раньше» (SC 5 гарантирован структурно). Фаза 11 переиспользует employeeSearchPredicate целиком вместе с фолдом (роадмап это и предписывает). — **Reversibility:** reversible — фолд локален в предикате, перенос в normalizeNumber позже — правка одной функции + фикс-тест
- **D-02:** Гомоглифы в именах — та же карта 11 пар, что у устройств («на тех же правилах, что поиск устройств» — SC 2). Гомоглиф-фикстура (`tests/homoglyphs-fixture.ts`) не расширяется.
- **D-03:** Многословный запрос матчится AND-ом слов: каждый токен — substring с тем же фолдом (норм+гомоглифы+Ё/ё). «пётр ёлкин» находит «Ёлкин Пётр Сергеевич», «ёлкин п» — тоже. ~3 строки в предикате; палитра Phase 11 унаследует.
- **D-04:** q ищет по имени И по отделу (substring, тот же фолд) — SC 2. Строка с совпадением выводится один раз, без ранжирования (сортировка списка не меняется).
- **D-05:** q действует внутри текущего сегмента «Активные/Архив»; переключение сегмента переносит q (buildQuery несёт полный набор параметров). Новый запрос сбрасывает пагинацию на страницу 1; `?q=` + `?page=999` клампится — SC 3.

### Поведение при ожидании
- **D-06:** Без индикатора ожидания — как у устройств: transition держит список, блокировки инпута нет по построению (SC 4 «не блокирует набор» выполняется тривиально). Спиннер добавится по ощущению тормозов на UAT.
- **D-07:** Debounce-хук выносится из `app/(app)/devices/search-box.tsx` как есть: 300 мс, Enter-commitNow, maxLength 100, реконсиляция G-5-1/G-5-2 (lastSynced/inFlight, push-time stamp, trim-эхо) — логику НЕ переписывать. Device search-box рефакторится на хук в этой фазе, поведение не меняется (SC 5). — **Reversibility:** costly — хук становится общей зависимостью устройств, сотрудников и палитры Phase 11; смена его API = правки всех потребителей

### Пустой результат
- **D-08:** Каркас фазы 5 (D-04/D-05 фазы 5): заголовок «Ничего не найдено» + подсказка «Проверьте раскладку и Ё/ё: „елкин“ найдёт „Ёлкин“» + кнопка «Сбросить поиск». Кнопка чистит только q — сегмент не трогает (пагинация и так уже на page=1); инпут очищается через обычную clean-input адаптацию URL, фокус не прыгает. Подзаголовок «Найдено: N сотрудников» (`pluralEmployees` из `lib/ru`) показывается только при непустом q. Точные формулировки — копи-контракт ui-phase.

### Размещение и проверка
- **D-09:** Грубый каркас: поисковая строка под сегментом «Активные/Архив», над списком, на всю ширину колонки (тот же паттерн, что фильтр-бар устройств). Финальный дизайн — ui-phase.
- **D-10:** Автотесты (vitest + temp-SQLite) покрывают предикат (Ё/ё-фолд, гомоглифы, AND слов, escape LIKE, департамент), URL-валидацию (q cap 100/trim, сброс пагинации, кламп) и сортировку. Гонки инпута (сценарии SC 1, класс G-5-1/G-5-2) — браузерная проверка в UAT оркестратором с Playwright MCP, как в фазе 5. Новый UI-тест-раннер (RTL/jest) не вводить — новая npm-зависимость запрещена REQUIREMENTS (Out of Scope).

### Claude's Discretion
- API, имя и расположение общего debounce-хука (например `lib/`); сигнатура хука — под потребителей: employees, devices, палитра Phase 11
- Имя URL-параметра (`q`, как у устройств), серверная валидация (trim, cap 100, экранирование LIKE `%_` с `ESCAPE '\'`)
- Сортировка результатов = `listEmployees` ruSortKey без изменений; поиск по подстроке отдела — через тот же join
- Формулировки копи (контракт ui-phase), placeholder строки («Имя или отдел»), aria-label
- Фикстуры тестов: имена с Ё («Ёлкин»), гомоглифами, двойными фамилиями, одинаковые имена в разных отделах (имена не уникальны — D-04 фазы 2)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Требования и решения
- `.planning/ROADMAP.md` §Phase 7 — цель, 5 success criteria (SC 1–5), зависимость Phase 7 → 11
- `.planning/REQUIREMENTS.md` — FIND-05; §Out of Scope (без новых npm-зависимостей, без fuzzy-поиска)
- `.planning/PROJECT.md` §Key Decisions — norm()-UDF, Search-box локальные правки приоритетнее URL (G-5-1/G-5-2), React 19 reset uncontrolled-форм
- `.planning/STATE.md` §Accumulated Context — Фаза 5/План 1 (живой поиск 300 мс → router.replace в startTransition), Фаза 5/План 6 (G-5-1 фикс: push-time stamp, inFlight cap 4, trim-адопция)

### Prior phases
- `.planning/milestones/v1.0-phases/05-search-filters/05-CONTEXT.md` — D-01 (live с первого символа), D-04/D-05 (пустое состояние, счётчик), D-13 (Select вместо Base UI combobox), D-18
- `.planning/milestones/v1.0-phases/02-employees/02-CONTEXT.md` — справочник: имена не уникальны (D-04), segmented control, employee-dialog

### Код — точка расширения
- `app/(app)/employees/page.tsx` — точка расширения: buildQuery(filter, page) обрастает q; сегмент, empty states, пагинация
- `app/(app)/devices/search-box.tsx` — источник общего хука: реконсиляция lastSynced/inFlight выносится как есть
- `app/(app)/devices/query-params.ts` — образец парсера/билдера URL-параметров (trim, cap, sentinels)
- `db/queries/employees.ts` — listEmployees (нет q — добавляется), ruSortKey, join departments
- `db/queries/devices.ts` §deviceWhere — образец факторизованного предиката (страница + экспорт делят where)
- `lib/normalize.mjs` + `db/index.ts` (norm UDF, deterministic) — фолд upper+trim+гомоглифы; Ё/ё НЕТ (D-01: не добавлять)
- `tests/homoglyphs-fixture.ts` — 11 пар + completeness guard

### Паттерны и дизайн
- `.planning/milestones/v1.0-phases/05-search-filters/05-UI-SPEC.md` — каркас фильтр-бара, копи-контракт
- `/Users/aleksey/.zcode/skills/vercel-react-best-practices/SKILL.md` — server-serialization, server-cache-react: инпут — единственный клиентский остров страницы
- `/Users/aleksey/.zcode/skills/apple-design/SKILL.md` — визуальный язык

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/(app)/devices/search-box.tsx` — отлаженная реконсиляция (G-5-1/G-5-2): источник debounce-хука, выносится без переписывания логики
- `norm()` UDF (`db/index.ts:25` + `lib/normalize.mjs`) — upper+trim+гомоглифы на SQL-стороне; employee-предикат добивает Ё/ё replace'ом
- `db/queries/employees.ts:listEmployees` — where уже фильтрует по isActive (сегмент), сортировка ruSortKey + id-тайбрейкер
- `app/(app)/devices/query-params.ts` — паттерн парсинга searchParams (валидация, sentinels, билдер полного query string)
- `lib/ru.ts:pluralEmployees` — «Найдено: N сотрудников» уже существует (используется в шапке страницы)
- `tests/employees-queries.test.ts` + helpers (temp-SQLite) — база для тестов предиката

### Established Patterns
- URL-driven состояние: сервер валидирует searchParams, ссылки несут полный query string, смена параметра → page=1, кламп в [1, pages] (Pitfall 4)
- Client-острова только для контролов; controlled input вне формы (React 19 reset — 4886f6a); router.replace(scroll:false) в startTransition
- Русские строки инлайн; RU-сортировка `replace(replace(...'Ё'...'ё'...))` + id tiebreaker
- Приёмка гонок UI — браузерная UAT-проверка оркестратором (Playwright MCP), не автотесты

### Integration Points
- `employees/page.tsx`: buildQuery расширяется q; пустое состояние дополняется третьим вариантом «поиск без результатов» (нынешние два — «нет сотрудников» / «архив пуст» — остаются)
- `devices/search-box.tsx` — рефакторинг на общий хук (SC 5): поведение зафиксировать regression-сравнением сценариев SC
- Phase 11 (⌘K): потребитель employeeSearchPredicate и debounce-хука — API хука проектировать с прицелом на неё (роадмап: жёсткая зависимость)

</code_context>

<specifics>
## Specific Ideas

- Подсказка пустого состояния с примером «елкин» → «Ёлкин» — прямо из SC 2 роадмапа
- «Устройства как раньше» — жёсткий якорь: нормализатор номеров и поведение device-поиска не трогаются ни в чём (D-01/D-07)
- Пагинация живёт с поиском: «Страница X из Y» и ссылки «Назад/Далее» несут q (SC 3)

</specifics>

<deferred>
## Deferred Ideas

- Бейдж «в архиве» в результатах поиска — фича ⌘K-палитры, Phase 11 (SC 3 роадмапа 11)
- Поиск устройств по имени держателя («Иванов» → его техника) — отклонён в фазе 5, не возвращался
- CSV-выгрузка справочника сотрудников — не запрошена, ни разу не поднималась

None из обсуждения Phase 7 — обсуждение осталось в границах фазы.

</deferred>

---

*Phase: 07-live*
*Context gathered: 2026-09-15*
