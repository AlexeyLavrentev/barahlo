# Phase 7: Live-поиск по сотрудникам - Research

**Researched:** 2026-09-15
**Domain:** Next.js 16 App Router URL-driven live search (RSC + client island), SQLite LIKE-поиск с norm()-UDF фолдом, extraction of a shared client debounce hook
**Confidence:** HIGH — почти вся база уже отгружена в v1.0 (фаза 5: тот же live-search механизм с UAT-отловленными и закрытыми гонками G-5-1/G-5-2); фаза применяет готовые паттерны к новой сущности

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Фолд и матчинг**
- **D-01:** Ё/ё-фолд живёт в employee-предикате поиска (replace Ё/ё→Е/е поверх `norm()` на обеих сторонах LIKE). `lib/normalize.mjs` и `norm()`-UDF не меняются — поиск устройств остаётся байт-в-байт «как раньше» (SC 5 гарантирован структурно). Фаза 11 переиспользует employeeSearchPredicate целиком вместе с фолдом.
- **D-02:** Гомоглифы в именах — та же карта 11 пар, что у устройств. Гомоглиф-фикстура (`tests/homoglyphs-fixture.ts`) не расширяется.
- **D-03:** Многословный запрос матчится AND-ом слов: каждый токен — substring с тем же фолдом (норм+гомоглифы+Ё/ё). «пётр ёлкин» находит «Ёлкин Пётр Сергеевич», «ёлкин п» — тоже.
- **D-04:** q ищет по имени И по отделу (substring, тот же фолд). Строка с совпадением выводится один раз, без ранжирования (сортировка списка не меняется).
- **D-05:** q действует внутри текущего сегмента «Активные/Архив»; переключение сегмента переносит q (buildQuery несёт полный набор параметров). Новый запрос сбрасывает пагинацию на страницу 1; `?q=` + `?page=999` клампится.

**Поведение при ожидании**
- **D-06:** Без индикатора ожидания — как у устройств: transition держит список, блокировки инпута нет по построению. Спиннер добавится по ощущению тормозов на UAT.
- **D-07:** Debounce-хук выносится из `app/(app)/devices/search-box.tsx` как есть: 300 мс, Enter-commitNow, maxLength 100, реконсиляция G-5-1/G-5-2 (lastSynced/inFlight, push-time stamp, trim-эхо) — логику НЕ переписывать. Device search-box рефакторится на хук в этой фазе, поведение не меняется (SC 5).

**Пустой результат**
- **D-08:** Каркас фазы 5: заголовок «Ничего не найдено» + подсказка «Проверьте раскладку и Ё/ё: „елкин“ найдёт „Ёлкин“» + кнопка «Сбросить поиск». Кнопка чистит только q — сегмент не трогает; инпут очищается через обычную clean-input адаптацию URL, фокус не прыгает. Подзаголовок «Найдено: N сотрудников» (`pluralEmployees`) только при непустом q. Точные формулировки — копи-контракт ui-phase.

**Размещение и проверка**
- **D-09:** Поисковая строка под сегментом «Активные/Архив», над списком, на всю ширину колонки (тот же паттерн, что фильтр-бар устройств). Финальный дизайн — ui-phase.
- **D-10:** Автотесты (vitest + temp-SQLite) покрывают предикат (Ё/ё-фолд, гомоглифы, AND слов, escape LIKE, департамент), URL-валидацию (q cap 100/trim, сброс пагинации, кламп) и сортировку. Гонки инпута — браузерная проверка в UAT оркестратором с Playwright MCP. Новый UI-тест-раннер (RTL/jest) не вводить — новая npm-зависимость запрещена REQUIREMENTS (Out of Scope).

### Claude's Discretion
- API, имя и расположение общего debounce-хука (например `lib/`); сигнатура хука — под потребителей: employees, devices, палитра Phase 11
- Имя URL-параметра (`q`, как у устройств), серверная валидация (trim, cap 100, экранирование LIKE `%_` с `ESCAPE '\'`)
- Сортировка результатов = `listEmployees` ruSortKey без изменений; поиск по подстроке отдела — через тот же join
- Формулировки копи (контракт ui-phase), placeholder строки («Имя или отдел»), aria-label
- Фикстуры тестов: имена с Ё («Ёлкин»), гомоглифами, двойными фамилиями, одинаковые имена в разных отделах

### Deferred Ideas (OUT OF SCOPE)
- Бейдж «в архиве» в результатах поиска — Phase 11
- Поиск устройств по имени держателя — отклонён в фазе 5
- CSV-выгрузка справочника сотрудников — не запрошена
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FIND-05 | Оператор находит сотрудника live-поиском по имени или отделу — с фолдом Ё/ё и гомоглифов, как у устройств | Employee-предикат: `norm()`-UDF + локальный Ё/ё-replace (D-01), гомоглифы через ту же карту HOMOGLYPHS (D-02), AND токенов (D-03), name OR department через существующий innerJoin (D-04); live-механика = вынесенный device search-box hook (D-07); URL-состояние по образцу `devices/query-params.ts` (SC 3) |
</phase_requirements>

## Summary

Фаза 7 — это не новая технология, а **вторая инсталляция уже отгруженного механизма**. Живой поиск устройств (фаза 5 v1.0) прошёл полный цикл: реализация, два UAT-пойманных бага гонок (G-5-1 потеря символов, G-5-2 съеденный пробел), фиксы (74eb0d9, 42ebf57), задокументированная реконсиляция. Фаза переносит этот механизм на `/employees` и попутно выделяет его в общий хук. Критическое ограничение D-07: код реконсиляции переносится **дословно**, не переписывается — его корректность куплена двумя раундами UAT.

Серверная часть — employee-вариант `searchPredicate` из `db/queries/devices.ts`: SQL-сторона `replace(replace(norm(колонка),'Ё','Е'),'ё','е') like <pattern> escape '\'` на `employees.name` и `departments.name` (ride существующего innerJoin), JS-сторона строит паттерны фолдом `normalizeNumber` + Ё/ё→Е/е, экранирует `%_\`, токенизирует по пробелам после norm (norm уже схлопывает пробелы) и AND-ит токены. `lib/normalize.mjs` и UDF не трогаются (D-01) — SC 5 («устройства как раньше») гарантируется структурно.

Единственная нетривиальная инженерная задача — **API хука при выносе без изменения поведения** (D-07). Эффект в search-box зависит от `[value, q, current, router]`; хук должен получать те же зависимости семантически: q-проп, данные (target без q) и стабильную ссылку на билдер, импортированную самим островом (функции не пересекают RSC-границу — bилдер вызывается клиентским замыканием, но ссылка на модульную функцию стабильна). Альтернативные формы API (push-колбэк из замыкания рендера) меняют идентичности зависимостей и тайминг re-arm — риск регрессии без причины.

**Primary recommendation:** Копия-перенос: (1) `useDebouncedSearchQuery`-хук = дословный вынос тела `DeviceSearchBox` (router/refs/timer/commitNow), island'ы передают `{ q, target, buildQuery }`; (2) `EmployeeSearchBox` и рефакторенный `DeviceSearchBox` — тонкие обёртки над хуком; (3) `app/(app)/employees/query-params.ts` по образцу devices (parse q trim/cap 100, buildQuery с полным набором параметров, page опущен при 1); (4) employee-предикат в `db/queries/employees.ts`, где count-запрос несёт тот же join+where, что и rows; (5) новый `tests/employee-search.test.ts` по образцу `tests/device-search.test.ts` (тот же харнесс: DATABASE_PATH до импорта @/db → norm-UDF зарегистрирован openDb на том же соединении).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Живой ввод поиска (debounce, Enter, реконсиляция) | Browser/Client | — | Инпут — единственный клиентский остров страницы; контролируемый state вне формы (React 19 reset, 4886f6a) |
| URL-состояние `?q=` (валидация, билдер ссылок) | Frontend Server (RSC) | Browser/Client | Page читает `searchParams` Promise и валидирует серверно; билдер — чистый модуль, импортируемый и сервером, и островом |
| Поисковый предикат (фолд, гомоглифы, AND токенов) | Database/Storage | — | SQL LIKE с `norm()`-UDF + replace Ё/ё на колонках; drizzle биндит паттерн (T-05-01) |
| Сегмент «Активные/Архив», пагинация, empty states | Frontend Server (RSC) | — | Серверные `<Link>` с полным query string; никакого клиентского состояния |
| Общий debounce-хук | Browser/Client | — | React-хук (импортирует react) — общий для employees/devices/палитры Phase 11 |
| Отмена/фолдинг между поиском устройств и сотрудников | Database/Storage | — | Один `norm()`-UDF на соединении; employee-фолд строго надстройка в предикате (D-01) |

## Standard Stack

**Новых пакетов нет.** REQUIREMENTS §Out of Scope: «FTS5, cmdk/Radix, любые новые npm-зависимости» запрещены. Всё уже в `package.json`:

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.3 | App Router: searchParams prop, router.replace(scroll:false), Link | Отгружено в v1.0; паттерн live-поиска фазы 5 работает на нём [VERIFIED: package.json] |
| react | 19.2.8 | useTransition, контролируемый инпут | Отгружено; React 19 reset uncontrolled-форм — известный грабль, обойдённый [VERIFIED: package.json + commit 4886f6a] |
| drizzle-orm + better-sqlite3 | ^0.45.2 / ^13.0.3 | Типизированный where, sync-драйвер, UDF | Отгружено; norm-UDF регистрируется в openDb [VERIFIED: db/index.ts] |
| vitest | ^4.1.11 | Автотесты предиката и URL-парсера | Отгружено; 20 тест-файлов уже используют temp-SQLite харнесс [VERIFIED: tests/] |
| playwright | ^1.62.1 (devDep) | UAT браузерные гонки (оркестратор, Playwright MCP) | Установлен; приёмка гонок — установленный паттерн фазы 5 [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Общий хук в lib/ | Дублирование search-box в employees | Дублирование реконсиляции = два места фиксов гонок; явно против D-07 |
| FTS5 / cmdk | — | Запрещено REQUIREMENTS (Out of Scope); 50–200 записей — LIKE-скан миллисекунды [VERIFIED: REQUIREMENTS.md] |
| useSearchParams() в острове | q как проп с сервера | Локальные доки Next рекомендуют читать searchParams prop на странице и передавать валидированные значения пропсами; useSearchParams тянет Suspense-нюансы [CITED: node_modules/next/dist/docs/.../use-search-params.md] |

## Package Legitimacy Audit

**Фаза не устанавливает ни одного нового пакета** (запрещено REQUIREMENTS §Out of Scope; подтверждено D-10). Gate не запускался — проверять нечего. Все используемые пакеты уже в lockfile и отгружены в проде v1.0.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Клавиатура оператора
      │ keystrokes
      ▼
┌────────────────────────────── Browser/Client ──────────────────────────────┐
│ EmployeeSearchBox (клиентский остров, контролируемый input вне формы)      │
│   └─ useDebouncedSearchQuery({ q, target, buildQuery })                    │
│        300 мс debounce / Enter → commitNow                                 │
│        реконсиляция: lastSynced (stamp на пуш), inFlight-эхо (cap 4),      │
│        clean-input adoption (G-5-1/G-5-2)                                  │
│        └─ startTransition → router.replace(buildQuery({…target, q}),       │
│                    { scroll: false })                                      │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ URL ?filter=&page=&q=
                               ▼
┌──────────────────────────── Frontend Server (RSC) ─────────────────────────┐
│ /employees page.tsx: await searchParams → parseEmployeesSearchParams (q:   │
│ trim, cap 100; page: integer guard) → buildEmployeesQuery для сегментов,   │
│ пагинации, empty-state «Сбросить поиск» (полный query string)              │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ валидированные аргументы
                               ▼
┌──────────────────────────── Database/Storage ──────────────────────────────┐
│ listEmployees({ filter, page, pageSize, q }):                              │
│   ONE where (join departments):                                            │
│     isActive = сегмент                                                     │
│     AND каждый токен q: replace(replace(norm(name),'Ё','Е'),'ё','е')       │
│                        like %tok% escape '\'                               │
│                     OR same on departments.name                            │
│   count + rows несут ОДИН where (clamp [1, pages])                         │
│   sort: ruSortKey + id tiebreaker (без изменений, без ранжирования)        │
│ norm() — deterministic UDF из lib/normalize.mjs (НЕ меняется, D-01)        │
└─────────────────────────────────────────────────────────────────────────────┘
```

Первичный сценарий трассируется: keystroke → island state → (300 мс) router.replace → сервер парсит URL → SQL фильтрует → RSC-свап в transition (список остаётся смонтирован) → эхо q возвращается пропсом и поглощается inFlight-реконсиляцией.

### Recommended Project Structure

```
app/(app)/employees/
├── page.tsx               # +q в parse; сегменты/пагинация несут q; третий empty state
├── query-params.ts        # НОВЫЙ: parseEmployeesSearchParams + buildEmployeesQuery (образец: devices/query-params.ts)
├── search-box.tsx         # НОВЫЙ: EmployeeSearchBox — тонкая обёртка над хуком
├── employee-dialog.tsx    # без изменений
└── [id]/, card/           # без изменений
app/(app)/devices/
├── search-box.tsx         # РЕФАКТОР: тело эффекта уезжает в хук дословно (D-07), обёртка
├── query-params.ts        # без изменений (SC 5)
└── …                      # без изменений
lib/
└── use-search-param.ts    # НОВЫЙ: useDebouncedSearchQuery — дословная реконсиляция (имя/путь — discretion)
db/queries/
└── employees.ts           # +q в listEmployees: employeeSearchPredicate (факторизован для Phase 11)
tests/
├── employee-search.test.ts  # НОВЫЙ: предикат + URL по образцу device-search.test.ts
└── device-search.test.ts    # остаётся зелёным после рефакторинга (SC 5, db-уровень не затронут)
```

### Pattern 1: Employee search predicate (фолд поверх norm, D-01/D-03/D-04)
**What:** Токенизированный AND-предикат: каждый токен — LIKE по фолднутым name ИЛИ department; фолд = norm (upper+trim+homoglyphs) + локальный Ё/ё→Е/е.
**When to use:** Единственный предикат поиска сотрудников; Phase 11 импортирует его целиком.
**Example:**
```typescript
// Эскиз по образцу searchPredicate (db/queries/devices.ts:171, VERIFIED in-repo).
// JS-сторона: фолд запроса. norm схлопывает \s+ в ' ' и тримит — сплитить ПОСЛЕ norm.
function foldQuery(raw: string): string[] {
  const folded = normalizeNumber(raw).replaceAll('Ё', 'Е') // norm уже upper: 'ё' невозможен, replace безвреден
  return folded.split(' ').filter(Boolean).slice(0, 20) // санитарный потолок токенов
}
const escapeLike = (tok: string) => `%${tok.replace(/[\\%_]/g, (m) => `\\${m}`)}%`

// SQL-сторона (внутрь and(...) where):
// and(...tokens.map(t => or(
//   sql`replace(replace(norm(${employees.name}),'Ё','Е'),'ё','е') like ${escapeLike(t)} escape '\\'`,
//   sql`replace(replace(norm(${departments.name}),'Ё','Е'),'ё','е') like ${escapeLike(t)} escape '\\'`,
// )))
// — departments ride СУЩЕСТВУЮЩИЙ innerJoin listEmployees (данных за join не нужно).
```
**Ключевые свойства (все VERIFIED in-repo):** drizzle биндит паттерн параметром (T-05-01 — инъекция невозможна); `escape '\\'` делает «%» и «_» буквальными (SC 5: «%» ищется буквально); пустой/whitespace q → предикат возвращает undefined (нет условия).

### Pattern 2: Общий debounce-хук без смены поведения (D-07)
**What:** Хук владеет router, value-state, lastSynced/inFlight/timer refs, debounce-эффектом и commitNow; остров — только рендер input.
**When to use:** EmployeeSearchBox, рефакторенный DeviceSearchBox, ⌘K-палитра Phase 11.
**Example:**
```typescript
// Эскиз API (дискрешен), семантика зависимостей = как у DeviceSearchBox сегодня:
export function useDebouncedSearchQuery<Q extends { q: string }>(args: {
  q: string                    // эхо с сервера (проп страницы)
  target: Omit<Q, 'q'>         // данные билдера БЕЗ q (у devices — current-фильтры; у employees — {filter})
  buildQuery: (f: Q) => string // СТАБИЛЬНАЯ модульная ссылка — импортирует остров, не проп (не сериализуемо через RSC)
}): { value: string; setValue: (v: string) => void; commitNow: () => void }
// ВАЖНО: deps эффекта в хуке [value, q, target, buildQuery] — та же форма, что
// [value, q, current, router] сейчас. Push-колбэк-замыкание из рендера меняло бы
// идентичность каждый рендер и сбрасывало 300 мс окно — НЕ так.
```

### Pattern 3: URL-параметры справочника (SC 3)
**What:** Мини-версия `devices/query-params.ts`: парсер (q: `trim().slice(0,100)`, отсутствие → ''), билдер (filter всегда, q опущен при '', page опущен при 1).
**When to use:** Сегменты (переносят q — D-05), пагинация (несёт q), остров (push), «Сбросить поиск» (чистит только q, filter остаётся — D-08).
**Verified base:** devices-версия [VERIFIED: app/(app)/devices/query-params.ts]; employees/page.tsx:21 уже несёт полный query string в buildQuery [VERIFIED].

### Pattern 4: Reset пагинации новым запросом — by omission
**What:** Остров пушит buildQuery({...target, q}) БЕЗ page → URL теряет page → сервер дефолтит page=1; кламп в [1,pages] остаётся в listEmployees (Pitfall 4).
**When to use:** Любой новый поисковый запрос. Switch сегмента тоже ведёт на page=1 (уже так, employees/page.tsx:70/81).

### Anti-Patterns to Avoid
- **Переписать реконсиляцию «на умнее»:** D-07 прямо запрещает; логика куплена двумя UAT-раундами (G-5-1/G-5-2). Перенос — дословный.
- **Добавить Ё/ё в `lib/normalize.mjs`/UDF:** D-01 — это изменило бы device-поиск и запись normalized-колонок (write-side fold); фолд строго в employee-предикате.
- **`<form action>` вокруг поиска:** React 19 сбрасывает uncontrolled-формы после каждого action (4886f6a) — контролируемый инпут вне формы [VERIFIED: in-repo comment + PROJECT.md].
- **page=N в push нового запроса:** стёр бы SC 3 (сброс на 1) — page просто опускается.
- **Count без join при поиске по отделу:** count-запрос обязан нести тот же innerJoin+where, что rows (Pitfall 5-класс устройств; deviceWhere-комментарий это фиксирует) — иначе total дрейфует от списка.
- **loading.tsx для поиска:** D-06 — transition держит список; (app)-level loading ломал 404-матрицу (прецедент фазы 2).
- **Токенизация до norm():** norm тримит и схлопывает пробелы — сплит до norm даст пустые/двойные токены; сплитить после фолда.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Дебаунс + URL-реконсиляция | Новый debounce-хук с нуля | Дословный вынос DeviceSearchBox (D-07) | Реконсиляция lastSynced/inFlight/trim-эхо — два UAT-бага уже пойманы и закрыты; новая реализация их воспроизведёт |
| Фолд Ё/ё+гомоглифы | Новый нормализатор имён | `normalizeNumber` + локальный replace в предикате | Карта HOMOGLYPHS и фикстура уже существуют и гвардятся тестом (D-02) |
| URL-парсер/билдер | Ручная сборка query string по месту | employees/query-params.ts по образцу devices | «Query-string руками не собирается никогда» — установленное правило (STATE фаза 6, D-03) |
| Русская сортировка найденного | Ранжирование/релевантность | Существующий ruSortKey + id | D-04: без ранжирования; stability уже решена |
| Плюрализация «Найдено: N сотрудников» | Своя форма слов | `pluralEmployees` из lib/ru | Уже существует и используется в шапке [VERIFIED: lib/ru.ts] |

**Key insight:** вся ценность фазы — в аккуратном переносе уже работающего, а не в новом дизайне.

## Runtime State Inventory

> Фаза содержит рефакторинг (вынос хука, SC 5). Пройдены все 5 категорий.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — фаза не меняет схему, миграций нет; normalized-колонки устройств не затрагиваются (D-01) | None — verified by D-01 + отсутствием миграционных файлов в скоупе |
| Live service config | None — приложение self-hosted, внешних сервисов с конфигом вне git нет | None — verified by PROJECT.md Constraints |
| OS-registered state | None — ни pm2/launchd/Task Scheduler; деплой = docker compose (Dockerfile/compose в git) | None — verified by deploy-скриптов фазы 1 |
| Secrets/env vars | None — DATABASE_PATH/AUTH_* не переименовываются; новых env нет | None |
| Build artifacts | None — хук это исходник в app/, Next пересобирает; .next устаревает автоматически при dev/build | None |

## Common Pitfalls

### Pitfall 1: Count/rows дрейф при поиске по отделу
**What goes wrong:** total посчитан без join (или с другим where) → «Страница 1 из 2», а строк больше/меньше.
**Why it happens:** поиск по departments.name требует join, а старый count listEmployees его не несёт.
**How to avoid:** один where-объект для count и rows (паттерн listDevices:379); count несёт innerJoin departments всегда (он и так нужен для rows).
**Warning signs:** parity-тест: сумма обхода страниц == total.

### Pitfall 2: «%» перестал быть буквальным
**What goes wrong:** запрос «100%» интерпретирует % как wildcard.
**Why it happens:** забыт `escape '\\'` или экранирование не в первом pass.
**How to avoid:** тот же `.replace(/[\\%_]/g, m => '\\'+m)` + `escape '\\'` на каждом LIKE (_devices searchPredicate:174).
**Warning signs:** device-тест «% ищется буквально» существует (device-search.test.ts) — зеркальный employee-тест обязателен (D-10).

### Pitfall 3: Ё/ё-фолд только на одной стороне LIKE
**What goes wrong:** «елкин» не находит «Ёлкин», если фолднули запрос, но не колонку (или наоборот).
**Why it happens:** norm() НЕ фолдит Ё/ё (двухсимвольная пара вне HOMOGLYPHS — map только гомоглифы).
**How to avoid:** replace Ё/ё→Е/е на ОБЕИХ сторонах (D-01): JS-фолд паттерна + SQL-replace над norm(колонка). Внимание: после norm() (JS toUpperCase) колонка содержит только заглавную 'Ё' — нижний 'ё'-replace в SQL безвреден и симметричен ruSortKey-рецепту.
**Warning signs:** employee-тест «елкин → Ёлкин» (фикстура с Ё-именем).

### Pitfall 4: Хук-рефакторинг меняет тайминг эффекта
**What goes wrong:** после выноса хука инпут начинает терять символы или зацикливаться — регрессия SC 1/SC 5.
**Why it happens:** push-колбэк как проп/аргумент меняет идентичность каждый рендер → cleanup re-arm сбрасывает 300 мс окно; или deps хука не совпадают семантически с [value, q, current, router].
**How to avoid:** дословный перенос; хук принимает данные (target) + стабильную модульную ссылку билдера (Pattern 2). Enter-commitNow возвращается хуком.
**Warning signs:** UAT-сценарии G-5-1/G-5-2 (быстрая печать, удаление) на ОБОИХ списках (D-10: employees новые, devices — регресс).

### Pitfall 5: Новый запрос сохранил page
**What goes wrong:** на странице 7 набираешь запрос → пустой список (page=7 из 1 страницы) вместо результата.
**Why it happens:** push унёс старый page или билдер всегда ставит page.
**How to avoid:** push без page (Pattern 4) + серверный кламп listEmployees (уже есть, employees.ts:54).
**Warning signs:** URL-тест `?q=елкин&page=999` → кламп к последней странице (SC 3).

### Pitfall 6: Сегмент потерял q
**What goes wrong:** переключение «Активные → Архив» сбрасывает поиск.
**Why it happens:** сегментные Link строят ?filter&page без q.
**How to avoid:** единый buildEmployeesQuery для сегментов/пагинации/острова (D-05).
**Warning signs:** тест билдера: buildQuery('archive', 1, 'елкин') содержит q.

### Pitfall 7: Layout не видит searchParams
**What goes wrong:** попытка читать q в layout даст stale/undefined.
**Why it happens:** layout не ре-рендерится при навигации — Next отдаёт searchParams только page [CITED: node_modules/next/dist/docs/.../use-search-params.md, «Layouts do not receive the searchParams prop»].
**How to avoid:** q читает только employees/page.tsx (уже структура).
**Warning signs:** n/a — не начинать.

### Pitfall 8: Инпут очищен эхом trim (G-5-2-класс)
**What goes wrong:** пробел в конце запроса съедается ~300 мс спустя.
**Why it happens:** сервер тримит q; наивный input синхронизируется с эхом.
**How to avoid:** уже решено в переносимой реконсиляции (trim-эхо absorption: `q === p.trim()`).
**Warning signs:** UAT «aspire 5»-аналог: «ёлкин п» с пробелом.

## Code Examples

### Эхо-реконсиляция — дословный источник для хука
```typescript
// Источник (VERIFIED): app/(app)/devices/search-box.tsx:51-140 — переносится 1:1 в хук.
// Ключевые инварианты (комментарии источника):
// 1. lastSynced штампуется В МОМЕНТ ПУША (не при взводе дебаунса) — G-5-1.
// 2. inFlight (cap 4) поглощает свои эхо: q === p || q === p.trim() — G-5-1/G-5-2.
// 3. Инпут НЕ переписывается на trim-форму: «aspire » — незавершённый текст.
// 4. Externally-changed q + clean input → adopt («Сбросить поиск», Back/Forward).
// 5. Инвариант: return с value.trim() !== q.trim() и без таймера запрещён.
```

### Тест-харнесс предиката
```typescript
// Источник (VERIFIED): tests/device-search.test.ts:14-26 — тот же приём:
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-employee-search-'))
process.env.DATABASE_PATH = join(tmpDir, 'employees.db')
const { db } = await import('@/db')        // openDb регистрирует norm-UDF на ЭТОМ соединении
applyMigrations(db.$client)
const { listEmployees, createEmployee } = await import('@/db/queries/employees')
// createEmployee даёт «имя + отдел» одной строкой — идеален для матрицы:
// Ё-имя «Ёлкин Пётр», гомоглифы «Семён С.» (С↔C, Н↔H…), одинаковые имена в разных
// отделах (D-04 фазы 2), двойные фамилии. assertFixtureCompleteness() — гвард D-02.
```

### Пустое состояние «поиск без результатов»
```typescript
// Прецедент (VERIFIED): devices/page.tsx empty-state «Ничего не найдено» + Link.
// Employees: третий вариант поверх двух существующих; приоритет: q непуст → поиск-empty
// («Сбросить поиск» = buildQuery(filter, 1) БЕЗ q — сегмент сохраняется, D-08);
// q пуст, archive пуст → «Архив пуст»; q пуст, active пуст → «Пока нет сотрудников».
// Plain server Link: на возврате q='' ≠ lastSynced → хук адоптирует и чистит инпут
// (clean-input adoption — комментарий devices/page.tsx:127-129).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Debounce-инпут с локальным состоянием поиска | URL — единственное состояние поиска; инпут — производимое | Фаза 5 v1.0 | Back/Forward/шаринг/refresh бесплатны (SC 3) |
| lastSynced при взводе таймера | Push-time stamp + inFlight echo absorption | Фикс G-5-1 (74eb0d9), G-5-2 (42ebf57) | Реконсиляция верна при любой скорости печати — переносится как есть |
| LIKE по сырым колонкам | norm()-UDF write/query fold + normalized-колонки | Фаза 5 (FIND-01) | Кириллица ищется; employee-фолд — надстройка (D-01) |
| RTL/jest для инпутов | Приёмка UI-гонок браузером (Playwright MCP) оркестратором | Фаза 5, подтверждено D-10 | Ноль новых dev-зависимостей |

**Deprecated/outdated:** middleware.ts → proxy.ts (не затрагивается фазой); useSearchParams в острове — не рекомендуется, когда страница уже парсит searchParams серверно.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Семантика D-03×D-04: каждый токен матчится по (name OR department), токены AND-ятся — «Пётр Бухг» находит Петра из Бухгалтерии | Architecture Patterns / Pattern 1 | Если ожидался AND внутри одного поля — «Пётр Бухгалтерия» перестанет находить; правка — одна строка композиции + тест; проверить на UAT |
| A2 | Sanitize-потолок ~20 токенов в запросе (защита от сотни LIKE на токен) | Pattern 1 | Без потолка — только перф-шум на абсурдных URL; с потолка лишние токены игнорируются (невидимо) |
| A3 | q на employees использует то же имя параметра `q` (дискрешен CONTEXT это предполагает: «q, как у устройств») | Standard Stack | Нулевой — чисто именование |

Все прочие утверждения — [VERIFIED: in-repo code/docs] или [CITED: локальные доки Next 16.3.3].

## Open Questions (RESOLVED)

> Resolved by planner 2026-09-15 — see 07-01-PLAN.md / 07-UI-SPEC.md Default 9.

1. **A1 (композиция токен×поле)**
   - What we know: D-03 (AND слов) и D-04 (имя И отдел) по отдельности зафиксированы, их композиция не оговорена.
   - What's unclear: cross-field AND («Пётр Бухг») желателен или AND-в-пределах-поля?
   - Recommendation: per-token (name OR department) — покрывает оба примера D-03 и даёт «Пётр Бухг» бесплатно; зафиксировать тестом, сверить на UAT. — RESOLVED: per-token (name OR department) принят в 07-01-T1 с тестами + UAT-сценарий 4 (07-03), fallback оговорён.

2. **Имя/путь хука и точная сигнатура** — RESOLVED: Pattern 2 принят в 07-01 (данные + стабильная ссылка билдера), имя `useDebouncedSearchQuery`. Исходная рекомендация: Pattern 2 (данные + стабильная ссылка билдера); имя `useDebouncedSearchQuery`, `lib/use-search-param.ts`. Фаза 11 — консумер; API не менять послеDevices-рефакторинга (reversibility: costly по D-07).

3. ** employees/query-params.ts vs inline buildQuery** — RESOLVED: отдельный модуль `app/(app)/employees/query-params.ts` создан в 07-01. Исходная рекомендация: отдельный модуль по образцу devices (единственный парсер/билдер — установленный принцип фазы 5); но в модуле всего 2 параметра, инлайн тоже защитим. План решает.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | всё | ✓ | v22.23.0 | — |
| vitest | автотесты D-10 | ✓ | 4.1.11 | — |
| playwright | UAT гонок (оркестратор) | ✓ (devDep) | ^1.62.1 | — |
| next/react (локальные доки) | верификация паттернов | ✓ | 16.3.3 / 19.2.8 | — |
| SQLite temp-DB | тесты предиката | ✓ | better-sqlite3 13 | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none
(Step 2.6: внешних сервисов/CLI вне проекта фаза не требует.)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 |
| Config file | vitest.config.ts (существует) |
| Quick run command | `npx vitest run tests/employee-search.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIND-05 / SC 2 | Предикат: Ё/ё-фолд («елкин»→«Ёлкин»), гомоглифы С↔C (обе стороны, фикстура), AND токенов, департамент, escape %/_ | unit (temp-SQLite) | `npx vitest run tests/employee-search.test.ts` | ❌ Wave 0 |
| FIND-05 / SC 2 | Гвард: fixtures completeness не расширяется (D-02) | unit | `npx vitest run tests/device-search.test.ts` | ✅ |
| SC 3 | URL: q trim/cap 100, билдер полный набор, сброс page, кламп page=999, сегмент несёт q | unit (pure-модуль) | `npx vitest run tests/employee-search.test.ts` | ❌ Wave 0 |
| SC 3/SC 2 | Пагинация+поиск: total==обход страниц, sort стабильна (ruSortKey+id) | unit | `npx vitest run tests/employee-search.test.ts` | ❌ Wave 0 |
| SC 1 | Гонки инпута G-5-1/G-5-2 на employees и devices | manual-only (браузер, UAT оркестратором, Playwright MCP) | — | оправдание D-10: RTL/jest запрещён REQUIREMENTS; приёмка гонок — установленный UAT-паттерн фазы 5 |
| SC 5 | Device-поиск после рефакторинга: db-уровень не тронут, regression зелёный | unit | `npx vitest run tests/device-search.test.ts tests/devices-queries.test.ts` | ✅ |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/employee-search.test.ts tests/device-search.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** полный suite зелёный + UAT-браузерные сценарии SC 1/SC 5 до `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/employee-search.test.ts` — предикат + URL (FIND-05, SC 2/3)
- [ ] (фикстуры внутри теста: Ё-имена, гомоглифы, дубль-имена в разных отделах — дискрешен CONTEXT)

## Security Domain

### Applicable ASVS Categories (level 1, security_enforcement: on)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Сессия не меняется; requireSession остаётся первым действием страницы |
| V3 Session Management | no | Без изменений |
| V4 Access Control | yes (сохранить) | `await requireSession()` первым действием /employees (уже есть, page.tsx:33) |
| V5 Input Validation | yes | q: `trim().slice(0,100)` серверно; page: Number+integer guard; враждебные URL деградируют к дефолту, не 500 (T-03-04) |
| V6 Cryptography | no | — |

### Known Threat Patterns for этот стек

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL-инъекция через q | Tampering | Drizzle bind-параметр паттерна; q никогда не попадает в текст SQL (T-05-01, как в device searchPredicate) |
| LIKE-wildcard подмена семантики | Tampering/Spoofing | `escape '\\'` + экранирование `%_\` — «%» буквален (SC 5) |
| Инъекция в пустое состояние/атрибуты | Tampering | React-экранирование; копи — статические строки; href билдера — URLSearchParams |
| Abusive длинный q | DoS (минимальный) | cap 100 (input maxLength 100 + серверный slice) + потолок токенов (A2); 200 строк — скан миллисекунды |

## Sources

### Primary (HIGH confidence)
- `app/(app)/devices/search-box.tsx` — полная реконсиляция G-5-1/G-5-2, источник хука (in-repo, shipped)
- `app/(app)/devices/query-params.ts`, `db/queries/devices.ts` (searchPredicate:171, deviceWhere:218, listDevices:368) — паттерны URL и предиката
- `db/queries/employees.ts`, `app/(app)/employees/page.tsx`, `lib/normalize.mjs`, `db/index.ts`, `lib/ru.ts`, `tests/homoglyphs-fixture.ts`, `tests/device-search.test.ts`, `tests/employees-queries.test.ts`, `tests/helpers.ts` — точки интеграции
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md` — searchParams prop vs layout; `02-components/link.md` — replace/scroll; `03-file-conventions/page.md` — searchParams: Promise [VERIFIED: локальные доки точной версии 16.3.3]

### Secondary (MEDIUM confidence)
- gsd classify-confidence (context7 --verified) → MEDIUM: локальные доки Next использованы как первичный источник вместо context7 (MCP недоступен); эквивалентность по существу — это доки самого пакета

### Tertiary (LOW confidence)
- none

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — ноль новых зависимостей, всё отгружено и верифицировано in-repo
- Architecture: HIGH — перенос отгруженных паттернов фазы 5; единственный дизайн-вопрос — API хука (Pattern 2) с зафиксированным риском и стратегией (дословный перенос)
- Pitfalls: HIGH — все грабли уже отловлены в этом же репозитории (G-5-1/G-5-2, count-drift, React 19 reset, 404/loading) и закрыты кодом/тестами

**Research date:** 2026-09-15
**Valid until:** 2026-10-15 (stable: in-repo паттерны, ноль внешних зависимостей)
