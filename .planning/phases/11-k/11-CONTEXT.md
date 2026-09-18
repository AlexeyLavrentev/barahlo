# Phase 11: ⌘K глобальная палитра - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning
**Mode:** --auto (решения — рекомендованные дефолты, лог в 11-DISCUSSION-LOG.md)

<domain>
## Phase Boundary

Глобальная палитра ⌘K: открывается с любой страницы по event.code (русская раскладка), один запрос ищет устройства и сотрудников одновременно с фолдингом списков (переиспользование предикатов фаз 5/7), результаты сгруппированы и лимитированы, полная клавиатурная навигация, переход на карточку; видимая кнопка-подсказка у навигации; пункт «Скачать ведомость»; данные не переживают закрытие. Плюс два отложенных фикса debounce-поиска, доставшихся вехе (D-08).

Не входит: любые новые npm-зависимости (cmdk/Radix — Out of Scope REQUIREMENTS), поиск по содержимому карточек (только модель/серийник/инвентарник/держатель и имя/отдел — те же поверхности, что списки), история запросов/персистентность, QR/этикетки.

</domain>

<decisions>
## Implementation Decisions

### Транспорт и контракт поиска
- **D-01:** Транспорт поисковой поверхности — **GET-роут** `/api/search` (закрывает STATE blocker [Phase 11]): requireSession() первым действием, GET-only, парсинг q через существующие правила (trim, cap 100, фолд), LIMIT-кап на сервере, `Cache-Control: no-store`, ответ — JSON обеих групп. Прецеденты: `/api/devices/export` и `/api/attachments` (роут-паттерн, requireSession-first, заголовки). Server action отвергнут: палитре нужен фетч с AbortController на каждый ввод и отсутствие интерактивных сайд-эффектов. — **Reversibility:** reversible — тонкий роут над существующими предикатами; транспорт меняется одной функцией-фетчем
- **D-02:** Один запрос ищет обе сущности: роут зовёт существующие listDevices-предикат и employeeSearchPredicate (фазы 5/7) — «палитра находит то, что находит список» (SC 2), без второго поискового движка. ФИО/модели через те же русские сортировки.
- **D-03:** Контракт данных (SC 4): палитра перезапрашивает при КАЖДОМ открытии и по мере ввода (AbortController отменяет предыдущий), результаты не переживают закрытие (стейт умирает с палитрой), никакой персистентности/недавних запросов.

### UI/UX палитры
- **D-04:** Открытие: keydown по `event.code === 'KeyK'` с cmd/ctrl — работает на русской раскладке (SC 1); повторное ⌘K закрывает (toggle). Видимая кнопка в nav с подсказкой «⌘K» (SC 1) — `app/(app)/nav.tsx`. Пока открыт другой диалог/модалка — ⌘K инертен (SC 4).
- **D-05:** Результаты сгруппированы «Устройства» / «Сотрудники», лимит **6+6** (хватает для 50–200 сущностей, выбор почти всегда в первых шести; «Показать все» у каждой группы → переход в соответствующий список с подставленным ?q= — SC 2). Архивные сотрудники находятся и несут бейдж «в архиве» (SC 2/3).
- **D-06:** Клавиатура (SC 3): ↑/↓ — циклическая навигация по плоскому списку результатов (с учётом групповых заголовков), Enter — переход на карточку по id и закрытие, Esc — закрытие без перехода. Мышь: клик по строке = Enter.
- **D-07:** Пункт «Скачать ведомость CSV» внизу палитры (мягкая зависимость Phase 8): ведёт на существующий `/api/devices/export` (весь парк, без фильтров — палитра глобальна), закрывает палитру. Клавиатурно достижим как последняя строка списка.

### Долги вехи — фиксируются в этой фазе
- **D-08:** Два deferred-фикса поиска входят в скоуп фазы отдельной задачей: (1) **WR-01 фазы 8** — `Object.fromEntries(request.nextUrl.searchParams)` в export-роуте схлопывает дублированные query-параметры (malformed URL `?type=laptop&type=monitor` → CSV ≠ страница): шейпить значения в массивы до `parseDevicesSearchParams` (патч в 08-REVIEW.md); (2) **WR-01 фазы 7** — dedup пушей debounce-хука: интерлив-эхо может дать дубль-навигацию и откатить «Сбросить поиск», double-Enter оставляет stale inFlight, гейтящий adopt (патч в 07-REVIEW.md, решение отложено «до Фазы 11» роадмапом). Палитра — новый консюмер хука, чинить до её подключения. — **Reversibility:** reversible — локальные фиксы поверх существующих тестов

### Claude's Discretion
- Компонентная структура палитры (client-остров в layout, портал/overlay), стилистика — ui-phase
- Точная сигнатура ответа `/api/search` (JSON-шейп групп)
- Тест-матрица: роут (requireSession, капы, фолд), предикаты переиспользованы (parity со списками), клавиатурная навигация — UAT Playwright
- Механика «инертен при открытом диалоге» (data-attr диалогов / document.activeElement)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Требования и решения
- `.planning/ROADMAP.md` §Phase 11 — цель, 4 success criteria (SC 1–4); зависимость 7→11 (жёсткая), 8→11 (мягкая)
- `.planning/REQUIREMENTS.md` — FIND-06; §Out of Scope (cmdk/Radix запрещены — палитра на существующих примитивах Base UI)
- `.planning/PROJECT.md` §Key Decisions — Search-box: локальные правки приоритетнее URL (G-5-1/G-5-2), Ё/ё-фолд в employee-предикате (фаза 7), norm()-UDF
- `.planning/STATE.md` §Blockers — [Phase 11]: транспорт поисковой поверхности (ЗАКРЫТ этим CONTEXT, D-01); §Accumulated — фаза 7 (хук useDebouncedSearchQuery, G-7-1 inFlight-гвард), фаза 8 (WR-01 export-роут)

### Prior phases (реюз поверхностей)
- `.planning/phases/07-live/07-CONTEXT.md` — debounce-хук (D-07), employeeSearchPredicate с Ё/ё (D-01..D-04), «Показать все»-семантика
- `.planning/phases/08-csv/08-REVIEW.md` — WR-01 export-роута (патч), D-08
- `.planning/phases/07-live/07-REVIEW.md` — WR-01 debounce-хука (патч), D-08
- `.planning/milestones/v1.0-phases/05-search-filters/05-CONTEXT.md` — парсер/билдер query-параметров, «?q=» контракт списков

### Код — точки расширения
- `db/queries/employees.ts` §employeeSearchPredicate (строка 58) — реюз напрямую
- `db/queries/devices.ts` §deviceWhere/searchPredicate — реюз напрямую
- `app/(app)/nav.tsx` — кнопка «⌘K» (42 строки, точка входа палитры)
- `lib/use-search-param.ts` / `app/(app)/devices/search-box.tsx` — debounce-хук (консюмер палитры; D-08 фикс №2)
- `app/api/devices/export/route.ts` — роут-прецедент (requireSession-first, заголовки) + D-08 фикс №1
- `app/(app)/layout.tsx` — точка монтирования палитры (глобальный остров)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `employeeSearchPredicate` + device-`searchPredicate`/`deviceWhere` — готовые фолд-предикаты; роут их КОМПОЗИРУЕТ, не переписывает
- `useDebouncedSearchQuery` — debounce-паттерн для инпута палитры (мгновенный первый запрос + дебаунс ввода)
- Роут-каркас export/attachments — requireSession-first, no-store, парсер
- Base UI Dialog/примитивы — каркас палитры без новых пакетов

### Established Patterns
- Парсер searchParams: trim/cap/sentinel-strip (T-03-04)
- requireSession первым действием каждого HTTP-входа
- Гонки ввода: lastSynced/inFlight реконсиляция (G-5-1/G-5-2/G-7-1) — паттерн для AbortController-фетча
- Smoke-иглы data-* атрибуты для Playwright-UAT

### Integration Points
- `nav.tsx`: кнопка + глобальный листенер ⌘K
- Списки устройств/сотрудников: «Показать все» → их ?q= URL (buildDevicesQuery/buildEmployeesQuery)
- Карточки: переход по Enter/клику (/devices/[id], /employees/[id])

</code_context>

<specifics>
## Specific Ideas

- «Палитра находит то, что находит список» — parity через РЕЮС предикатов, не копию (SC 2 — ключевой критерий)
- SC 4 «данные не протухают» — никакой инициализации стейта при открытии, всегда свежий запрос
- Бейдж «в архиве» — тот же, что в справочнике сотрудников

</specifics>

<deferred>
## Deferred Ideas

- Поиск по держателю из палитры («Иванов» → его техника) — дважды отклонён (фаза 5, фаза 7)
- Недавние запросы/история палитры — SC 4 прямо запрещает персистентность
- FTS5/рейтинг релевантности — Out of Scope (substring + фолд достаточны)

Auto-режим: scope creep не прилетал; единственное внешнее добавление — D-08 (deferred-долги вехи, чьё «до Фазы 11» зафиксировано роадмапом и STATE).

</deferred>

---

*Phase: 11-k*
*Context gathered: 2026-09-18*
