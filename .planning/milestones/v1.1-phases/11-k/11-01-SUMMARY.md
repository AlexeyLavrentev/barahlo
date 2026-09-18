---
phase: 11-k
plan: 01
subsystem: ui
tags: [command-palette, base-ui, autocomplete, dialog, search, hotkey, next-route-handler, sqlite, drizzle]

# Dependency graph
requires:
  - phase: 05-search-filters
    provides: deviceWhere/searchPredicate-предикаты поиска устройств (фолд, ESCAPE, cap 100) + buildDevicesQuery/parseDevicesSearchParams
  - phase: 07-live
    provides: employeeSearchPredicate (Ё/ё-фолд, гомоглифы, AND-токены) + useDebouncedSearchQuery (пуш-сайты для D-08 #2)
  - phase: 08-csv
    provides: /api/devices/export (прецедент роута, requireSession-first) + WR-01 патч шейпинга (D-08 #1)
  - phase: 02-design-system
    provides: Base UI Dialog/примитивы, токены, dialog.tsx/combobox.tsx рецепты (scrim, data-highlighted, data-slot)
provides:
  - GET /api/search — единый поиск устройств и сотрудников (requireSession-first, LIMIT 6+6, no-store)
  - components/command-palette.tsx — ⌘K-остров (event.code хоткей, группы, полная клавиатура, CSV-строка)
  - db/queries :: searchPaletteDevices / searchPaletteEmployees — компоновки существующих предикатов
  - lib/search-params-record.ts — pure-шейпинг URLSearchParams (дубликаты → массивы)
  - D-08 закрыт: шейпинг export-роута + три гварда dedup пушей debounce-хука
affects: [verify-work, uat, end-of-phase]

# Tech tracking
tech-stack:
  added: [] # НОЛЬ новых npm-зависимостей (locked constraint: cmdk/Radix запрещены)
  patterns:
    - "Single client island (кнопка + диалог в одном компоненте, общее состояние open)"
    - "event.code-хоткей: физическая клавиша независимо от раскладки; toggle-ветка ПЕРВАЯ, проба чужого диалога с self-exclusion data-command-palette"
    - "Компоновка предикатов вместо копии: «палитра находит то, что находит список» структурно (SC 2)"
    - "Reset-на-открытии вместо reset-на-закрытии (React 19 set-state-in-effect честно): открытие — единственная точка сброса"
    - "Нативный <a> через render-проп Autocomplete.Item: Enter диспетчит реальный DOM-клик → скачивание с клавиатуры"

key-files:
  created:
    - app/api/search/route.ts
    - components/command-palette.tsx
    - lib/search-params-record.ts
    - tests/palette-queries.test.ts
    - tests/search-params-record.test.ts
  modified:
    - db/queries/devices.ts
    - db/queries/employees.ts
    - app/(app)/layout.tsx
    - lib/use-search-param.ts
    - app/api/devices/export/route.ts

key-decisions:
  - "Reset состояния палитры перенесён с закрытия на открытие (openPalette): React 19 eslint-правило set-state-in-effect запрещает setState в эффекте; контракт D-03 не изменён — следующий open всегда начинает с пустого инпута и мгновенного фетча, попап не keepMounted"
  - "CSV-строка — Autocomplete.Item с render={<a href>}: верифицировано по исходникам Base UI (clickHighlightedItem → listItem.click(), useButton оставляет Enter на линках браузеру) — нативное скачивание работает и с клавиатуры, что закрывает D-07 без отказа от последней клавиатурной остановки"
  - "Поиск employees в палитре без isActive-члена: архивные находятся, бейдж кормится isActive из SELECT (Pitfall 2); innerJoin departments обязателен (Pitfall 1)"

patterns-established:
  - "data-command-palette self-exclusion: проба чужого диалога [data-slot=dialog-content][data-open]:not([data-command-palette]) — шаблон инертности хоткеев при открытых модалках"
  - "Smoke-иглы палитры: data-palette-input / data-palette-empty / data-palette-error (+ data-command-palette) — для Playwright-UAT"
  - "searchParamsRecord перед parseDevicesSearchParams — единственный шейпинг параметров в роутах (Object.fromEntries в роутах запрещён — WR-01)"

requirements-completed: [FIND-06]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Палитра находит то, что находит список: searchPaletteDevices/searchPaletteEmployees компонуют существующие предикаты (deviceWhere приватен, departments innerJoin, без isActive)"
    requirement: FIND-06
    verification:
      - kind: unit
        ref: "tests/palette-queries.test.ts#palette parity — «палитра находит то, что находит список» (SC 2)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Архивные сотрудники находятся палитрой, isActive в SELECT для бейджа «В архиве»"
    requirement: FIND-06
    verification:
      - kind: unit
        ref: "tests/palette-queries.test.ts#palette archived — archive is searched, badge data present (SC 2/3)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Серверные капы: группы ≤6+6 при >6 совпадениях, q капится 100"
    requirement: FIND-06
    verification:
      - kind: unit
        ref: "tests/palette-queries.test.ts#palette caps — server-side limits and the 100-char q cap"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/search: requireSession первым действием (без сессии — 307 /login), q trim+cap, обе группы, Cache-Control no-store"
    requirement: FIND-06
    verification:
      - kind: other
        ref: "curl -i http://localhost:3000/api/search?q=test → HTTP/1.1 307, location: /login (run during execution, dev server)"
        status: pass
      - kind: manual_procedural
        ref: ".planning/phases/11-k/11-UAT.md — сценарии 2/5/6 (Playwright MCP, orchestrator)"
        status: pass
    human_judgment: true
    rationale: "Сессионный JSON-контракт подтверждён UAT-гейтом Task 4 (10/10 pass, approval оператора); human_judgment оставлен true — живой контракт без автотеста."
  - id: D5
    description: "⌘K-остров: хоткей event.code (русская раскладка), кнопка «⌘K» левее «Выйти», группы «Устройства»/«Сотрудники», цикличная клавиатура, Enter → карточка и закрытие, инертность при открытом диалоге, свежее состояние при переоткрытии"
    requirement: FIND-06
    verification:
      - kind: manual_procedural
        ref: ".planning/phases/11-k/11-UAT.md — сценарии 1, 3, 5, 6 (SC 1/3/4; Playwright MCP, orchestrator)"
        status: pass
    human_judgment: true
    rationale: "Интерактивное UI-поведение подтверждено UAT-гейтом Task 4 (10/10 pass, approval оператора); автоматического компонентного раннера в репо нет (установленная дисциплина)."
  - id: D6
    description: "«Показать все» у обеих групп (URL только билдерами, сегмент active) и CSV-строка (нативный <a href=/api/devices/export>, последняя клавиатурная остановка, закрывает палитру)"
    requirement: FIND-06
    verification:
      - kind: other
        ref: "grep-needle audit: buildDevicesQuery/buildEmployeesQuery в command-palette.tsx:287,297; render={<a href=\"/api/devices/export\"/>} :458"
        status: pass
      - kind: manual_procedural
        ref: ".planning/phases/11-k/11-UAT.md — сценарии 7 и 8 (Playwright MCP, orchestrator)"
        status: pass
    human_judgment: true
    rationale: "Живые переходы/скачивание подтверждены UAT Task 4 (10/10 pass, approval оператора); статический аудит классов пройден при исполнении."
  - id: D7
    description: "D-08 #1: дублированные query-параметры export-роута шейпятся в массивы до parseDevicesSearchParams (CSV = странице на malformed URL)"
    verification:
      - kind: unit
        ref: "tests/search-params-record.test.ts#searchParamsRecord → parseDevicesSearchParams — CSV == page on any URL"
        status: pass
    human_judgment: false
  - id: D8
    description: "D-08 #2: debounce-хук не дублирует пуши (double-Enter, интерлив-эхо, trim-no-op — сценарии 07-REVIEW); существующие suite'ы фаз 5/7 зелёные"
    verification:
      - kind: unit
        ref: "npx vitest run tests/device-search.test.ts tests/employee-search.test.ts → 80/80 pass (регрессионная защита после патча хука)"
        status: pass
      - kind: manual_procedural
        ref: ".planning/phases/11-k/11-UAT.md — сценарий 10 (malformed-URL CSV == страница; быстрая печать/Enter без дубль-навигации)"
        status: pass
    human_judgment: true
    rationale: "Новых ассертов на гварды хука нет (компонентного раннера нет — установленная дисциплина); живая верификация выполнена в UAT-гейте Task 4 (10/10 pass, approval оператора)."

# Metrics
duration: 32min+UAT
completed: 2026-09-18
status: complete
---

# Phase 11 Plan 01: ⌘K глобальная палитра Summary

**⌘K-палитра поверх предикатов фаз 5/7: GET /api/search (requireSession-first, 6+6, no-store) + клиентский остров на Base UI Dialog+Autocomplete (event.code-хоткей, группы, полная клавиатура, CSV-строка); оба долга D-08 закрыты с регрессионными тестами**

## Performance

- **Duration:** 32 min + UAT
- **Started:** 2026-09-18T06:33:48Z
- **Completed:** 2026-09-18 (Tasks 1–3 исполнителем; Task 4 UAT — оркестратором через Playwright MCP, 10/10, approval получен)
- **Tasks:** 4 of 4
- **Files modified:** 10

## Plan Status

**ПЛАН ЗАВЕРШЁН.** Tasks 1–3 выполнены и закоммичены; Task 4 (UAT-гейт FIND-06 SC 1–4) исполнен оркестратором через Playwright MCP — **10/10 сценариев прошли, 0 issues**, результаты в `.planning/phases/11-k/11-UAT.md` (коммит `f6ba2e3`), оператор одобрил.

## Accomplishments
- Единый поиск: GET /api/search композирует deviceWhere и employeeSearchPredicate (D-01/D-02) — requireSession первым действием (зонд: 307 → /login), q trim+cap 100, LIMIT 6+6 на сервере, Cache-Control: no-store; parity-тест приколачивает «палитра находит то, что находит список»
- ⌘K-остров (single island в правой группе app-bar): хоткей по event.code='KeyK' — работает на ЙЦУКЕН; toggle-close первой веткой, инертность при открытом диалоге с self-exclusion; AbortController-фетч с content-type-гвардом; состояние умирает при закрытии; Enter/клик → карточка и закрытие
- Полный UI-SPEC контракт: группы «Устройства»/«Сотрудники» с «Показать все» (URL только билдерами, сегмент active), бейдж «В архиве» (рецепт карточки байт-точно), CSV-строка — нативный <a> (последняя клавиатурная остановка), «Ничего не найдено» и нейтральная error-строка
- D-08 закрыт: lib/search-params-record.ts (pure, vitest-импортируемый) + export-роут шейпит дубликаты массивами (CSV = странице на malformed URL); debounce-хук получил три гварда 07-REVIEW (double-Enter, интерлив-эхо, trim-no-op)

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — ⌘K → /api/search → карточка** - `9e51571` (feat)
2. **Task 2: D-08 — shaping + dedup пушей** - `e456cd9` (test, TDD RED) + `7be20df` (feat, TDD GREEN)
3. **Task 3: Полный контракт палитры по UI-SPEC** - `f221b71` (feat)
4. **Task 4: UAT-гейт** — checkpoint:human-verify → исполнен оркестратором (Playwright MCP, 10/10), результаты `f6ba2e3` в `.planning/phases/11-k/11-UAT.md`

## Files Created/Modified
- `app/api/search/route.ts` - GET-роут единого поиска (D-01): requireSession-first, обе группы, no-store
- `components/command-palette.tsx` - клиентский остров: хоткей, Dialog+Autocomplete (inline open mode="none"), abortable fetch, группы, клавиатура, CSV
- `lib/search-params-record.ts` - pure-шейпинг URLSearchParams → Record (дубликаты — массивы, D-08 #1)
- `db/queries/devices.ts` - + searchPaletteDevices: компоновка deviceWhere (предикат остался приватным), holder-join, RU-sort, LIMIT
- `db/queries/employees.ts` - + searchPaletteEmployees: компоновка employeeSearchPredicate без isActive-члена, обязательный innerJoin departments
- `app/(app)/layout.tsx` - остров смонтирован в правой группе app-bar перед формой logout
- `lib/use-search-param.ts` - три гварда dedup пушей (патч 07-REVIEW дословно)
- `app/api/devices/export/route.ts` - Object.fromEntries → searchParamsRecord (D-08 #1)
- `tests/palette-queries.test.ts` - parity/archived/limits матрица db-слоя (8 тестов)
- `tests/search-params-record.test.ts` - шейпинг-контракт + интеграция с parseDevicesSearchParams (8 тестов)

## Decisions Made
- Reset состояния палитры — на открытии (openPalette), не на закрытии: React 19 eslint set-state-in-effect; D-03 контракт сохранён (попап не keepMounted, следующий open = пустой инпут + мгновенный фетч)
- CSV-строка как Autocomplete.Item с render={<a href>}: проверено по исходникам установленного Base UI — Enter на подсвеченной строке диспетчит реальный DOM-клик (clickHighlightedItem → listItem.click()), useButton оставляет Enter на линках браузеру → нативное скачивание с клавиатуры (D-07 без отказа от клавиатурной остановки)
- Бейдж «В архиве» на подсвеченной строке добавлен group-data-highlighted:text-accent-foreground/80 поверх байт-точных классов карточки — консистентно с flipping всех secondary-текстов палитры
- Sequential sync-вызовы в роуте вместо Promise.all: db-слой синхронный (better-sqlite3) — компоуз без лишних обёрток (A5)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] react-hooks/set-state-in-effect (error) на close-reset эффекте палитры**
- **Found during:** Task 1 (tracer)
- **Issue:** Запланированный «эффект закрытия: abort + очистка q/результатов» нарушает React 19 eslint-правило (setState синхронно в теле эффекта) — коммит заблокирован бы
- **Fix:** Сброс перенесён в openPalette (event handler — единственная точка сброса перед каждым открытием); эффект закрытия оставлен только с abortRef.abort() (внешняя система, без setState). Контракт D-03 не изменён: ничего не переживает закрытие наблюдаемо (попап размонтируется, открытие всегда сбрасывает)
- **Files modified:** components/command-palette.tsx
- **Verification:** eslint 0 ошибок; UAT-сценарий 6 (свежее состояние при переоткрытии) остаётся ассертом гейта
- **Committed in:** 9e51571 (Task 1), финальная форма в f221b71 (Task 3)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Девиация не меняет поведение — только точку сброса состояния. Контракты D-03/SC 4 сохранены и остаются под ассертом UAT.

## Issues Encountered
- None. Все verify-гейты зелёные с первого прохода: Task 1 (vitest 8/8 + tsc), Task 2 (RED→GREEN, 80/80 по трём suite), Task 3 (tsc 0, build зелёный, полный suite 425/425, lint 0 новых ошибок — 6 предупреждений пре-существующие в нетронутых файлах + известный exhaustive-deps router, задокументированный 07-REVIEW IN-01).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- UAT-гейт Task 4 пройден: 10/10 сценариев SC 1–4 / D-07 / D-08 (Playwright MCP оркестратора), 0 issues, результаты в `.planning/phases/11-k/11-UAT.md` (коммит `f6ba2e3`), оператор одобрил
- Это последняя фаза v1.1 — план завершён, фаза готова к verify-work/end-of-phase
- D-08 долги вехи закрыты с регрессионными тестами — блокеры «до Фазы 11» из STATE/ROADMAP сняты

---
*Phase: 11-k*
*Completed: 2026-09-18 (Task 4 UAT: 10/10 pass, orchestrator + operator approval)*

## Self-Check: PASSED

- Все 10 key-files существуют на диске (10/10 FOUND)
- Все коммиты задач существуют в git: 9e51571, e456cd9, 7be20df, f221b71 (4/4 FOUND); UAT-результаты оркестратора: f6ba2e3
- Верификация плана: `npx vitest run` 425/425 (baseline 409+ расширен palette-queries ×8 и search-params-record ×8), `npx tsc --noEmit` 0, `npm run build` зелёный, lint 0 новых ошибок
- Parity-тест (SC 2) зелёный на живых предикатах
- UAT-гейт Task 4: ВЫПОЛНЕН оркестратором — 10/10 сценариев, 0 issues, approval получен («pass»)
