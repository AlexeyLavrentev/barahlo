# Phase 6: Dashboard - Context

**Gathered:** 2026-09-14
**Status:** Ready for planning
**Mode:** --auto (все решения — recommended-дефолты, аудируются в DISCUSSION-LOG)

<domain>
## Phase Boundary

Сводный экран-дашборд — чистая read-модель над готовым ядром: количество устройств по типам и по статусам (DASH-01), блок гарантии с счётчиками по пресетам и списком истекающих/истёкших, ведущий в отфильтрованный список фазы 5 (DASH-02), лента недавних перемещений со ссылками на устройства и сотрудников (DASH-03). Никаких мутаций, никаких новых сущностей и миграций — только queries-агрегаты + один экран + навигация. Сотрудник-фильтр/поиск сотрудников — v2 (V2-02), гарантийный watchlist-тайл отдельным виджетом не нужен (V2-07 покрыт гарантийным блоком этого дашборда).

</domain>

<decisions>
## Implementation Decisions

### Адрес и навигация
- **D-01:** Дашборд живёт на `/` (текущий `app/(app)/page.tsx`-redirect на /devices убирается): один оператор открывает приложение и сразу видит картину. Nav становится: Дашборд · Устройства · Сотрудники (клиентский остров nav.tsx пополняется первым пунктом; active-правило уже умеет подытоживать). `/devices` остаётся как есть. [auto] → recommended

### Иерархия экрана
- **D-02:** Сверху — строка сводных тайлов по типам (Ноутбуки N · Мониторы N · Док-станции N · Периферия N) и вторым рядом по статусам (Используется · На складе · В ремонте · Списано); ниже — зона из двух блоков: «Гарантия» и «Последние перемещения». Точная сетка (2 колонки на десктопе со стеком на мобильном) — UI-SPEC. [auto] → recommended

### Кликабельность тайлов
- **D-03:** Каждый тайл — ссылка на /devices с готовым фильтром фазы 5 (`?type=laptop`, `?status=repair` и т.д.): deep-link в существующие URL-фильтры, ноль новой выборки, полный query-string паттерн сохраняется. Сумма «Всего: N» над тайлами — некликабельный заголовок. [auto] → recommended

### Гарантийный блок (DASH-02)
- **D-04:** Три счётчика-строки: «Истекает ≤ 30 дней: N», «Истекает ≤ 60 дней: M», «Истекла: K» — каждая ссылка на готовый гарантийный пресет фазы 5 (`/devices?warranty=w30` / `w60` / `expired`). Под счётчиками — список 5 устройств с ближайшей датой гарантии (только из пресетов ≤60: ещё живые; истёкшие видны кликом на свой счётчик): модель + цветная дата (переиспользуется WarrantyDate) + ссылка в карточку. Гарантийная математика — уже готовый `warrantyState`/`WARRANTY_WARN_DAYS` из фазы 5, фильтр-хит и цвет не могут разойтись. [auto] → recommended

### Лента перемещений (DASH-03)
- **D-05:** 10 последних событий из append-only `movements`: строка = событие-пилюля (deviceStatusLabel-словарь событий фазы 4: выдано/принято/передано/в ремонт/из ремонта/списано/поступление) · модель (серийник mono) · от → кому (или склад) · дата в DISPLAY_TZ ru-форматом. Строка кликабельна → карточка устройства; имена сотрудников — ссылки в карточки сотрудников. Дата не может быть в будущем — тривиально по append-only. [auto] → recommended

### Данные и свежесть
- **D-06:** Дашборд — server component без клиентского стейта: каждый заход показывает живые данные (серверные queries-агрегаты GROUP BY по типу/статусу; count'ы пресетов гарантии; последние 10 движений). Ни клиентских островов, ни кэша, ни автообновления — одиночный оператор, F5 не нужен: навигация всегда перезапрашивает. [auto] → recommended

### Claude's Discretion
- Форма queries-агрегатов (GROUP BY в devices-queries vs отдельный dashboard-queries модуль) — researcher/planner по образцу существующих queries-модулей
- Состав полей ленты в SQL (join devices/employees раз vs N+1) — по PATTERNS/RESEARCH
- Пустые состояния блоков («Нет техники с истекающей гарантией» — приятный случай)
- Точная копия тайлов/строк — копи-контракт UI-SPEC
- loading.tsx для `/` (скелетон по образцу списков)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Требования и решения
- `.planning/REQUIREMENTS.md` — DASH-01, DASH-02, DASH-03 (+ v2: V2-07 warranty-tile — покрыт D-04, не отдельный виджет)
- `.planning/ROADMAP.md` §Phase 6 — цель и success criteria
- `.planning/phases/05-search-filters/05-CONTEXT.md` — D-15/D-16/D-17 (пресеты гарантии, цветная дата, один красный), URL-фильтры как дип-линки
- `.planning/phases/04-custody-photos/04-CONTEXT.md` — словарь событий movements (eventType), append-only семантика

### Код — точка расширения
- `app/(app)/page.tsx` — сейчас redirect на /devices, здесь строится дашборд (D-01)
- `app/(app)/nav.tsx` — клиентский остров навигации, паттерн active-состояния
- `db/queries/devices.ts` — listDevices/deviceWhere: гарантийные пресеты w30/w60/expired и тайловые агрегаты
- `db/queries/movements.ts` — паттерн ленты (listIssuedByEmployee ~:389 — join-образец; append-only таблица)
- `lib/warranty.ts` + `lib/warranty-date.tsx` — единственный источник гарантийного состояния и цвета (фильтр ≠ цвет невозможен)
- `app/(app)/devices/page.tsx` + `type-filter.tsx` — URL-паттерн, дип-линк-формат тайлов

### Дизайн и паттерны
- `.planning/phases/05-search-filters/05-UI-SPEC.md` + `03-UI-SPEC.md` — токены, пилюли, копи-контракт, destructive-резерв
- `/Users/aleksey/.zcode/skills/vercel-react-best-practices/SKILL.md` — server-serialization, RSC-паттерны (дашборд — чистый RSC)
- `/Users/aleksey/.zcode/skills/apple-design/SKILL.md` — визуальный язык

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `db/queries/devices.ts` — deviceWhere с гарантийными пресетами: счётчики дашборда = те же предикаты + count()
- `db/queries/movements.ts` — образец join devices/employees для ленты; append-only events уже в схеме
- `lib/warranty.ts` (warrantyState, WARRANTY_WARN_DAYS=60) + `lib/warranty-date.tsx` — цветная дата в списке блока гарантии
- `lib/ru.ts` — плюрализация («N устройств», «N событий»)
- `lib/device-schema.ts` — лейблы типов/статусов для тайлов
- nav.tsx — готовый клиентский остров, добавить один пункт

### Established Patterns
- URL-driven фильтры: тайлы ссылаются на существующие параметр-наборы, сервер ревалидирует
- Server Components: requireSession → queries → render; клиентские острова только там, где нужен pathname
- Русские строки инлайн; статусы-пилюли; сортировка с ru-коллацией
- vitest + temp-SQLite; smoke-паттерн для живой проверки

### Integration Points
- `/` за requireSession (proxy default-deny + in-app guard) — как все (app) маршруты
- movements: только чтение; события append-only, таймлайн-словарь фазы 4
- Гарантийные счётчики обязаны использовать те же предикаты, что фильтры фазы 5 (единый источник, иначе блок дашборра разойдётся со списком)

</code_context>

<specifics>
## Specific Ideas

- Success criteria роадмапа сформулированы как read-модель: «сколько единиц, у кого что, что на ремонте/списано, что истекает, что двигалось» — счётчики+лента покрывают; «у кого что» = карточка сотрудника (ссылки из ленты), отдельного блока не нужно
- V2-07 (warranty watchlist tile) помечен в REQUIREMENTS как «дешёвый, добавляется первым при наличии дашборда» — покрыт самим гарантийным блоком D-04

</specifics>

<deferred>
## Deferred Ideas

- Поиск по имени сотрудника / глобальный ⌘K — V2-02 (v1.x)
- Сохранённые смарт-фильтры — V2-01
- Автообновление дашборда (polling/SSE) — не нужно одному оператору на LAN; пересмотр при появлении второго пользователя
- Графики/история закупок по месяцам — вне v1 (реестр про факт, не аналитику)

</deferred>

---

*Phase: 6-dashboard*
*Context gathered: 2026-09-14*
