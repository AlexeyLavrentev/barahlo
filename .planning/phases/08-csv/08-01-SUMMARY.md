---
phase: 08-csv
plan: 01
subsystem: api
tags: [csv, export, excel, cwe-1236, formula-injection, vitest, drizzle, sqlite, warranty]

# Dependency graph
requires:
  - phase: 05-search-filters
    provides: "CSV-каркас фазы 5 (buildCsv/esc/csvResponseHeaders, exportDevices через общий deviceWhere), lib/warranty.ts (warrantyState/displayTodayUtc/WARRANTY_WARN_DAYS), кейстоун lib/device-schema.ts (PER_TYPE_FIELDS)"
provides:
  - "20-колоночная CSV-ведомость: конфиг-блок D-01 (Диагональ, ″ / Тип матрицы / Количество портов / Вид), «Статус гарантии» после «Гарантия до» (D-05), ISO-даты (D-06)"
  - "lib/device-csv.ts — pure-модуль: CONFIG_EXPORT_KEYS, keystoneLabel (D-02 деривация из кейстоуна), WARRANTY_STATE_LABELS, isoFileDate, diagonalCell (запятая-десятичная), deviceCsvHeader, buildDeviceCsv"
  - "exportDevices/DeviceExportRow + 4 nullable конфиг-поля (deviceWhere/orderBy/limit-отсутствие не тронуты)"
  - "route.ts — thin composer: requireSession-first, today = displayTodayUtc() один на запрос"
  - "Тест-матрица 55 тестов: header-позиции, sparse 4 типов, parity границ, ISO, инъекция через новые колонки, row-count pin"
affects: [phase 11 (⌘K «Скачать ведомость» — контракт роута не менять), verify-work phase 8]

# Tech tracking
tech-stack:
  added: []  # ноль новых зависимостей (REQUIREMENTS §Out of Scope)
  patterns: [keystone label derivation (D-02), state→label dictionary поверх warrantyState (WR-01 parity), comma-decimal ячейка для RU-Excel, thin-composer route + vitest-импортируемый pure-модуль]

key-files:
  created: [lib/device-csv.ts]
  modified: [db/queries/devices.ts, app/api/devices/export/route.ts, tests/csv-export.test.ts]

key-decisions:
  - "D-02 механизм: программная деривация меток конфиг-колонок из кейстоуна (keystoneLabel по CONFIG_EXPORT_KEYS через DEVICE_TYPES) — одна правка метки в PER_TYPE_FIELDS меняет и форму, и файл; параллельный CSV-словарь не заведён"
  - "Диагональ — запятая-десятичная («21,5»): dot-decimal RU-Excel читает как дату «21.мая» (research Pitfall 1); целые не тронуты; pinned тестами, ручная RU-Excel проверка отложена на end-of-phase (WINDOWS.md)"
  - "Маппинг файла переехал из route.ts в pure lib/device-csv.ts: роут не vitest-импортируем (next/headers), только так 20-колоночный layout пинится позиционно; роут остался thin composer"

patterns-established:
  - "keystoneLabel: метки CSV-колонок деривируются из PER_TYPE_FIELDS по ключу — никогда не дублируются"
  - "WARRANTY_STATE_LABELS: словарь отображает СОСТОЯНИЯ warrantyState и никогда их не пере-выводит; 86_400_000 и граница живут только в lib/warranty.ts (grep-критерий зелёный)"
  - "parseFile()-хелпер тестов: BOM-strip → CRLF → «;» — позиционный разбор собранного файла без HTTP-харнесса"

requirements-completed: [EXP-01]

coverage:
  - id: D1
    description: "Заголовок файла — ровно 20 колонок в порядке D-01/D-05: конфиг-блок одним куском после «SSD, ГБ», «Статус гарантии» сразу после «Гарантия до»; метки дословно из кейстоуна, включая U+2033 ″ (D-02)"
    requirement: EXP-01
    verification:
      - kind: unit
        ref: "tests/csv-export.test.ts#buildDeviceCsv — 20-колоночный файл (Phase 8 tracer)"
        status: pass
      - kind: unit
        ref: "tests/csv-export.test.ts#diagonalCell / isoFileDate / keystoneLabel — чистые единицы"
        status: pass
    human_judgment: false
  - id: D2
    description: "Разреженные конфиг-колонки: каждый из 4 типов DEVICE_TYPES заполняет только объявленные кейстоуном ключи, чужие ячейки пустые — без ветвлений в проде (pass-through nullable-полей)"
    requirement: EXP-01
    verification:
      - kind: unit
        ref: "tests/csv-export.test.ts#sparse-матрица — каждый тип заполняет только свои конфиг-колонки (SC 1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "«Статус гарантии» = parity с цветом сайта: словарь поверх warrantyState(warrantyUntil, today), today один на запрос; границы today/+59/+60 → «Истекает», +61 → «Действует», −1 → «Истекла», null → «Без гарантии» (D-03/D-04)"
    requirement: EXP-01
    verification:
      - kind: unit
        ref: "tests/csv-export.test.ts#parity статуса гарантии — файл = цвет сайта (SC 1, D-03/D-04, WR-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Даты файла ISO yyyy-mm-dd (D-06) через один UTC-форматтер; диагональ запятая-десятичная «21,5»/«23,8», целые «27» без изменений (RU-Excel Pitfall 1)"
    requirement: EXP-01
    verification:
      - kind: unit
        ref: "tests/csv-export.test.ts#ISO-даты файла (D-06, SC 3)"
        status: pass
      - kind: unit
        ref: "tests/csv-export.test.ts#diagonalCell / isoFileDate / keystoneLabel — чистые единицы"
        status: pass
    human_judgment: false
  - id: D5
    description: "Формула-инъекция через новые колонки невозможна: все 20 ячеек и заголовок идут через buildCsv/esc (TAB-префикс CWE-1236); panelType «=1+1» TAB-префиксован в теле (SC 3, T-08-01)"
    requirement: EXP-01
    verification:
      - kind: unit
        ref: "tests/csv-export.test.ts#инъекция через новые колонки (SC 3, T-08-01)"
        status: pass
      - kind: unit
        ref: "tests/csv-export.test.ts#buildDeviceCsv — 20-колоночный файл (Phase 8 tracer)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Файл = реестр: без фильтров exportDevices('all').length === totalDeviceCount(); с фильтрами — существующий parity-walk с listDevices остался зелёным (общий deviceWhere, SC 2)"
    requirement: EXP-01
    verification:
      - kind: unit
        ref: "tests/csv-export.test.ts#row-count pin — файл = реестр (SC 2)"
        status: pass
      - kind: unit
        ref: "tests/csv-export.test.ts#exportDevices — full-filter parity with listDevices (D-18 «полный результат», edge 6)"
        status: pass
    human_judgment: false
  - id: D7
    description: "SC 4: requireSession() — литерально первое действие GET; парсер-цепочка, deviceWhere, orderBy, csvResponseHeaders не тронуты; импорт сайт-форматтера dd.mm.yyyy удалён из роута (сайт не тронут)"
    requirement: EXP-01
    verification:
      - kind: other
        ref: "source assertion: grep -A1 'export async function GET' app/api/devices/export/route.ts → await requireSession() первой строкой; ! grep -qE 'formatWarrantyDate|@/lib/warranty-date' app/api/devices/export/route.ts — пусто"
        status: pass
      - kind: unit
        ref: "npx vitest run tests/csv-export.test.ts tests/warranty.test.ts tests/devices-queries.test.ts → 110 passed (замороженные поверхности)"
        status: pass
    human_judgment: false
  - id: D8
    description: "RU-Excel открывает файл корректно: «Диагональ, ″» со значением 21,5 читается числом, а не датой «21.мая» (ручная проверка end-of-phase из 08-VALIDATION)"
    requirement: EXP-01
    verification:
      - kind: manual_procedural
        ref: "08-VALIDATION.md manual-only check; записан в .planning/WINDOWS.md (unrun-verify, phase 08)"
        status: unknown
    human_judgment: true
    rationale: "Поведение локали Excel при открытии CSV не воспроизводится vitest (research Pitfall 1, MEDIUM confidence внешних источников); запятая-десятичная ячейка запинена unit-тестами (D4), но факт открытия в RU-Excel проверяет оператор на end-of-phase"

# Metrics
duration: 83 min
completed: 2026-09-16
status: complete
---

# Phase 8 Plan 1: CSV-ведомость полного контекста Summary

**20-колоночная CSV-ведомость: конфиг-блок своего типа (диагональ запятая-десятичная, матрица, порты, вид), текстовый статус гарантии в parity с цветом сайта через warrantyState, ISO-даты — всё через один pure-модуль lib/device-csv с деривацией меток из кейстоуна и esc-гвардом на каждой ячейке**

## Performance

- **Duration:** 83 min
- **Started:** 2026-09-16T07:10:13Z
- **Completed:** 2026-09-16T08:40:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- 20-колоночный файл выгрузки: 4 разреженные конфиг-колонки блоком после «SSD, ГБ» (D-01), «Статус гарантии» сразу после «Гарантия до» (D-05), метки деривируются из кейстоуна дословно с U+2033 ″ (D-02)
- Текстовый статус гарантии («Действует / Истекает / Истекла / Без гарантии») — словарь поверх warrantyState с today = displayTodayUtc() один на запрос: parity с цветом сайта по построению (D-03/D-04, WR-01)
- Даты файла → ISO yyyy-mm-dd одним UTC-форматтером (D-06); диагональ — первая дробная колонка файла — пишется запятая-десятичной против RU-Excel дат-коррупции (Pitfall 1)
- exportDevices/DeviceExportRow расширены 4 nullable конфиг-полями (зеркало getDevice); deviceWhere, orderBy, отсутствие limit/offset, requireSession-first, парсер-цепочка — не тронуты (SC 2/SC 4)
- Тест-матрица 26 → 55 тестов в csv-export.test.ts: header-позиции, sparse по всем 4 типам, parity границ 0/59/60/61/−1/null, ISO, инъекция через новые колонки, row-count pin

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): failing tracer tests for the 20-column file** - `c7e095a` (test)
2. **Task 1 (GREEN): tracer — 20-колоночная выгрузка сквозь все слои** - `51bb5c9` (feat)
3. **Task 2: матрица паритета и безопасности файла** - `7584bfc` (test)

**Plan metadata:** отдельный docs-коммит (SUMMARY + STATE + ROADMAP + REQUIREMENTS), см. git log `docs(08-01)`.

_Note: Task 1 — tracer с tdd="true": RED-коммит падающих тестов, затем GREEN-коммит реализации; tracer-гейт (повторный прогон verify) пройден перед Task 2._

## Verification

- `npx vitest run tests/csv-export.test.ts tests/warranty.test.ts tests/devices-queries.test.ts` → 110 passed (после каждого таск-коммита)
- `npx vitest run` (полный suite) → **370 passed, 20 файлов** (341+ на старте волны, +29)
- `npm run build` → green; `npm run lint` → 0 errors, exit 0
- `npx tsc --noEmit` → clean
- Source assertions SC 4: `await requireSession()` — первая строка GET; `! grep -qE "formatWarrantyDate|@/lib/warranty-date" app/api/devices/export/route.ts` — пусто
- Source assertions гигиены: `! grep -qE "from 'next" lib/device-csv.ts` — пусто; `! grep -qE "86_400_000|WARRANTY_WARN_DAYS" lib/device-csv.ts app/api/devices/export/route.ts` — пусто
- Manual-only (end-of-phase, из 08-VALIDATION.md): открыть выгрузку в RU-Excel/Numbers — «21,5» читается числом, не датой; записано в WINDOWS.md (unrun-verify)

## Files Created/Modified
- `lib/device-csv.ts` (NEW) — pure-модуль: CONFIG_EXPORT_KEYS, keystoneLabel, WARRANTY_STATE_LABELS, isoFileDate, diagonalCell, deviceCsvHeader, buildDeviceCsv; без фреймворк-импортов, vitest зовёт напрямую
- `db/queries/devices.ts` — DeviceExportRow + 4 nullable конфиг-поля; SELECT exportDevices + 4 колонки (зеркало getDevice); замороженные поверхности не тронуты
- `app/api/devices/export/route.ts` — thin composer: HEADER и cells-маппинг переехали в lib/device-csv; + today = displayTodayUtc() один на запрос; импорт сайт-форматтера удалён
- `tests/csv-export.test.ts` — seedExport расширен (purchaseDate, 4 конфиг-поля, dock/peripheral), tracer-фикстуры, sparse-матрица, parity-таблица, ISO, инъекция, row-count pin

## Decisions Made
- **D-02 механизм — деривация, не копия:** keystoneLabel ищет label по ключу во всех полях DEVICE_TYPES (PER_TYPE_FIELDS не экспортируется — DEVICE_TYPES несёт те же массивы; кейстоун остаётся единственным источником), throw на неизвестном ключе
- **Диагональ — запятая-десятичная:** рекомендация research (Pitfall 1) принята; integer-значения заменой точки не тронуты; D-01…D-06 executed дословно
- **Файл-слой в lib, а не в роуте:** роут не vitest-импортируем (Pitfall 7) — только вынос маппинга в pure-модуль дал позиционный пин 20 колонок; роут остался thin composer
- **TDD-ритуал Task 1:** RED-коммит (тесты падают на отсутствии lib/device-csv) → GREEN-коммит (реализация) → tracer-гейт повторным прогоном verify перед Task 2

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Hygiene] Комментарии lib/device-csv.ts упоминали запрещённые токены**
- **Found during:** Task 2 (проверка acceptance-критерия гигиены)
- **Issue:** комментарии модуля содержали literal `WARRANTY_WARN_DAYS` и `86_400_000` — критерий `! grep -qE "86_400_000|WARRANTY_WARN_DAYS" lib/device-csv.ts app/api/devices/export/route.ts` падал бы на собственных комментариях
- **Fix:** переформулированы комментарии (граница описана словами, токены убраны); арифметика и константа остались только в lib/warranty.ts
- **Files modified:** lib/device-csv.ts
- **Verification:** grep-критерий зелёный (пустой вывод)
- **Committed in:** 7584bfc (в составе Task 2)

**2. [Rule 3 - Blocking] Неиспользуемый импорт deviceCsvHeader в тесте — единственное новое lint-предупреждение**
- **Found during:** end-of-wave `npm run lint`
- **Issue:** deviceCsvHeader импортирован в тест, но не использован → `no-unused-vars` warning (0 errors, но грязный волной diff)
- **Fix:** предупреждение закрыто добавлением смыслового D-02-ассерта: deviceCsvHeader() — ровно 20 колонок, конфиг-метки на позициях 10+i = keystoneLabel(CONFIG_EXPORT_KEYS[i])
- **Files modified:** tests/csv-export.test.ts
- **Verification:** lint по файлу чист; 55/55 тестов зелёные
- **Committed in:** 7584bfc (amend Task 2)

---

**Total deviations:** 2 auto-fixed (2 × Rule 1/3 hygiene: комментарии-токены, неиспользуемый импорт)
**Impact on plan:** Оба фикса — гигиена, наведённая собственными критериями плана. Скоуп-крипа нет; замороженные поверхности (deviceWhere, парсер-цепочка, позиция requireSession, buildCsv/esc/csvResponseHeaders, сайт dd.mm.yyyy) — нетронуты, что подтверждено зелёным devices-queries/warranty-набором и source-ассертами.

## Issues Encountered
- 5 pre-existing unused-vars lint-предупреждений в файлах, фазой не тронутых (`app/(app)/page.tsx`, `tests/dashboard-queries.test.ts`, `tests/devices-queries.test.ts`; последние коммиты этих файлов — 2026-09-14 и ранее, до фазы 8) — вне скоупа по scope-boundary правилу, записаны в `.planning/phases/08-csv/deferred-items.md`; lint: 0 errors, exit 0

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 8 (1 план) выполнена: все 4 SC закрыты тестами/source-ассертами; D-01…D-06 дословно; EXP-01 complete
- Осталась ручная проверка end-of-phase: открыть CSV в RU-Excel/Numbers (WINDOWS.md, unrun-verify) — поведение локали Excel vitest не воспроизводит
- Phase 11 (⌘K «Скачать ведомость») может опираться на контракт роута: он не менялся (requireSession-first, csvResponseHeaders, имя файла, ссылка «Скачать CSV»)
- Полный suite 370/370, build green, lint 0 errors — готов к /gsd:verify-work

---
*Phase: 08-csv*
*Completed: 2026-09-16*

## Self-Check: PASSED

- Созданные/изменённые файлы существуют на диске (4/4) + SUMMARY.md
- Все коммиты задач найдены в git log: c7e095a (test RED), 51bb5c9 (feat GREEN), 7584bfc (test матрица), 5fae7cf (docs pattern map)
- Acceptance-критерии обеих задач перепроверены: 110/110 целевых тестов, 370/370 полный suite, build green, lint 0 errors, tsc clean, source-ассерты SC 4/гигиены зелёные
