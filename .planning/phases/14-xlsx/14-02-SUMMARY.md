---
phase: 14-xlsx
plan: 02
subsystem: api
tags: [xlsx, write-excel-file, export, typed-cells, vitest, tdd, ooxml]

# Dependency graph
requires:
  - phase: 14-xlsx (plan 14-01)
    provides: write-excel-file@4.1.1 exact pin, tracer lib/device-xlsx.ts (frozen signatures, sheet-level dateFormat, xlsxResponseHeaders), export-xlsx route, standalone-спайк (бандлинг OK)
  - phase: 08-csv (EXP-01)
    provides: keystone deviceCsvHeader()/CONFIG_EXPORT_KEYS/WARRANTY_STATE_LABELS (lib/device-csv.ts), exportDevices/totalDeviceCount, тест-harness csv-export.test.ts
provides:
  - Финальная пиннутая типизированная матрица deviceXlsxSheetData(rows, today) — 20 ячеек на строку, типы/форматы закреплены позиционно
  - tests/xlsx-export.test.ts (31 тест) — harness csv-export: матричный пин, header-parity, пин заголовков, row-count parity, MSK frozen-clock гарантийная матрица
  - Полный suite 514/514, lint 0 ошибок, build зелёный (export-xlsx в манифесте)
affects: [14-xlsx (plan 14-03 surfaces/UAT), verify-work (SC 2/3 UAT в реальном RU-Excel)]

# Tech tracking
tech-stack:
  added: [] # ни одной новой зависимости — write-excel-file@4.1.1 уже спиннут в 14-01
  patterns: [typed-cell matrix pin (TDD RED→GREEN как фаза 8), library-type omission cast (runtime null = пустая ячейка)]

key-files:
  created:
    - tests/xlsx-export.test.ts
  modified:
    - lib/device-xlsx.ts

key-decisions:
  - "Матрица: только 4 колонки несут явные объекты-ячейки (серийник/инвентарник {type:String, format:'@'}, диагональ {type:Number, format:'0.0'}, цена {type:Number, format:'#,##0'}) — остальные сырые значения с library-inference; пин множества типов {String,Number,Date} по всем строкам закрывает формульные ячейки (T-14-05) и тихий дрейф (T-14-08)"
  - "Даты — настоящие Date-ячейки без per-cell формата: листовой dateFormat 'dd.mm.yyyy' из buildDeviceXlsx (14-01) покрывает обе колонки; Date не реконструируется, null едет дословно (D-02)"
  - "Rule 3: return deviceXlsxSheetData типизирован library-типом SheetData с одним документированным кастом — CellObjectOfType<Value> write-excel-file опускает null из value, а рантайм пишет null как пустую ячейку; без каста TS сваливался на objects-оверлоуд и columns [{width}] не проходил"

patterns-established:
  - "RED→GREEN на пине матрицы: тест целевого контракта падает на трассере честно (5 fail / 26 pass), затем тело заменяется без изменения сигнатуры — дисциплина фазы 8 (c7e095a→51bb5c9)"
  - "Library-type omission cast: единственная точка, где тип библиотеки расходится с рантаймом, документируется комментарием на месте каста — значения при этом едут дословно"

requirements-completed: [EXP-02]

coverage:
  - id: D1
    description: "Типизированная матрица 20 ячеек: серийник/инвентарник String+'@' с ведущими нулями, RAM/SSD/порты Number, диагональ Number '0.0' (21.5), цена Number '#,##0' (125000), даты — Date-ячейки дословно, null → пустая ячейка"
    requirement: EXP-02
    verification:
      - kind: unit
        ref: "tests/xlsx-export.test.ts#deviceXlsxSheetData — серийник/инвентарник, числовые колонки, диагональ, стоимость, даты"
        status: pass
    human_judgment: false
  - id: D2
    description: "Шапка листа байт-точна deviceCsvHeader() (20 меток из кейстоуна, U+2033 ″ дословно), каждая ячейка fontWeight bold"
    requirement: EXP-02
    verification:
      - kind: unit
        ref: "tests/xlsx-export.test.ts#deviceXlsxHeaderCells — шапка из кейстоуна"
        status: pass
    human_judgment: false
  - id: D3
    description: "«Статус гарантии» = WARRANTY_STATE_LABELS[warrantyState(until, today)] — общий словарь с сайтом; frozen-clock MSK границы (Истекает/Действует/Истекла/Без гарантии)"
    requirement: EXP-02
    verification:
      - kind: unit
        ref: "tests/xlsx-export.test.ts#deviceXlsxSheetData — статус гарантии: словарь поверх warrantyState"
        status: pass
    human_judgment: false
  - id: D4
    description: "Состав строк паритетен CSV: exportDevices({type:'all'}).length === totalDeviceCount(); пустой парк → валидный файл из одной шапки; buildDeviceXlsx даёт Buffer с PK-магией"
    requirement: EXP-02
    verification:
      - kind: unit
        ref: "tests/xlsx-export.test.ts#row-count parity + buildDeviceXlsx — сборка книги"
        status: pass
    human_judgment: false
  - id: D5
    description: "xlsxResponseHeaders: жёсткий spreadsheetml MIME, RFC 5987 dual-filename .xlsx, nosniff, no-store (D-08)"
    requirement: EXP-02
    verification:
      - kind: unit
        ref: "tests/xlsx-export.test.ts#xlsxResponseHeaders — XLSX MIME, RFC 5987 dual filename, nosniff, no-store"
        status: pass
    human_judgment: false
  - id: D6
    description: "Множество типов ячеек {String, Number, Date} по всем строкам — формульных и Boolean нет; у каждой String-ячейки с форматом формат '@'"
    requirement: EXP-02
    verification:
      - kind: unit
        ref: "tests/xlsx-export.test.ts#deviceXlsxSheetData — множество типов ячеек (T-14-05/T-14-08)"
        status: pass
    human_judgment: false
  - id: D7
    description: "SC 2/3 фазы в реальном RU-Excel: файл открывается без «восстановить книгу», «21,5»/«125 000»/даты дд.мм.гггг рисуются numFmt-ами, freeze-pane и ширины видны"
    requirement: EXP-02
    verification: []
    human_judgment: true
    rationale: "Отображение passthrough numFmt-кодов (A1 research) проверяется только глазами в реальном RU-Excel — ни один раннер репозитория не эмулирует viewer-локаль; гейт план 14-03 UAT / end-of-phase verify-work"

# Metrics
duration: 12min
completed: 2026-10-01
status: complete
---

# Phase 14 Plan 02: Пиннутая типизированная матрица XLSX Summary

**deviceXlsxSheetData заменён с трассера на пиннутую типизированную матрицу (20 ячеек: String+'@' серийники, Number 0.0/#,##0 диагональ/цена, настоящие Date-ячейки, слайс заметок 32 767), закреплённую 31 тестом через RED→GREEN — полный suite 514/514, lint 0 ошибок, build зелёный**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-01T03:59:54Z
- **Completed:** 2026-10-01T04:12:10Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- T1 (RED): `tests/xlsx-export.test.ts` — зеркало harness csv-export (tmpdir DATABASE_PATH → динамические импорты → applyMigrations): матричный пин целевого контракта, header-parity с кейстоуном, пин заголовков, row-count parity, MSK frozen-clock гарантийная матрица. Первый прогон на трассере 14-01: **5 failed / 26 passed (31)** — упали ровно типизированные контракты (объекты серийника/инвентарника/диагонали/цены отсутствуют, заметки не слайсятся: 40000 ≠ 32767); инвертированный гейт `! npx vitest run` прошёл
- T2 (GREEN): тело `deviceXlsxSheetData` заменено на матрицу по Cell-Type Map research (§Cell-Type Map, колонка в колонку в порядке `deviceCsvHeader()`); сигнатура `(rows, today)` заморожена; 31/31 зелёные
- Пин множества типов {String, Number, Date} по всем строкам обоих парков — формульных/Boolean ячеек нет (T-14-05/T-14-08); строковая дисциплина: у каждой String-ячейки с форматом формат '@' (Pitfall 14.1)
- Одиночные источники соблюдены: метки только через `deviceCsvHeader()`, словарь гарантии только импорт `WARRANTY_STATE_LABELS`, параллельных словарей нет; CSV-контур нетронут (git diff чист по export route/lib/csv/lib/device-csv)

## Task Commits

1. **Task 1: RED — tests/xlsx-export.test.ts, пин матрицы до имплементации** - `f877241` (test)
2. **Task 2: GREEN — финальная типизированная матрица в lib/device-xlsx.ts** - `dd81c13` (feat)

**Plan metadata:** (docs-коммит добавляется следом)

_TDD Gate Compliance: RED-гейт `test(14-02)` f877241 → GREEN-гейт `feat(14-02)` dd81c13 — обе калитки в истории; REFACTOR не потребовался (чистка не нужна, suite зелёный)._

## Files Created/Modified

- `tests/xlsx-export.test.ts` (NEW, 394 строки, 31 тест) — harness csv-export.test.ts (barahlo-xlsx- префикс); фикс-устройство со ВСЕМИ полями (серийник '0042' с ведущим нулём, дробная диагональ 21.5, цена 125000, обе даты, notes-переросток 40 000) + синтетические rowFixture для frozen-clock/тернарника/null-кейсов
- `lib/device-xlsx.ts` — заменено тело deviceXlsxSheetData (трассер → типизированная матрица); deviceXlsxHeaderCells/XLSX_COLUMN_WIDTHS/buildDeviceXlsx/xlsxResponseHeaders/XLSX_SHEET_NAME не тронуты

## Decisions Made

- Только 4 колонки несут явные объекты-ячейки; остальные — сырые значения: inference библиотеки (string→String, number→Number, Date→Date) и есть контракт, пин тестом по всем строкам — это ровно та форма, что прописана в action плана и Cell-Type Map
- Даты без per-cell формата: листовой `dateFormat: 'dd.mm.yyyy'` (14-01) — единственное место формата (D-02, research рекомендация «set once»)
- Null-значения едут дословно (пустые ячейки), никаких `?? ''` — Pitfall 14.3 закрыт пином

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Тайпчек build падал на оверлоудах writeXlsxFile после типизации матрицы**
- **Found during:** Task 2 (npm run build)
- **Issue:** ячейки-объекты с `value: string | null` не проходят первый оверлоуд (`SheetData`: `CellObjectOfType<Value>` опускает null из `value`), TS сваливался на objects-оверлоуд, где `columns: [{width}]` не матчится с `Column<Object>[]` (требует `cell`) — сборка «Failed to type check»
- **Fix:** return `deviceXlsxSheetData` типизирован library-типом `SheetData` (import из `write-excel-file/node`) с одним `as SheetData` на выходе map + комментарий: рантайм библиотеки пишет null как пустую ячейку — каст документирует расхождение типов с рантаймом, значения не преобразуются; сигнатура (rows, today) не изменена
- **Files modified:** lib/device-xlsx.ts
- **Verification:** `npm run build` зелёный (route export-xlsx в манифесте), suite 514/514, lint 0 ошибок
- **Committed in:** dd81c13 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking, Rule 3)
**Impact on plan:** Всё в рамках задачи — тип-уровневая правка без изменения значений и сигнатуры. Scope creep нет.

## Issues Encountered

- 6 предсуществующих lint-предупреждений (tests/dashboard-queries.test.ts, tests/devices-queries.test.ts, app/(app)/page.tsx, lib/use-search-param.ts) — вне скоупа плана, не тронуты; записаны в deferred-items.md фазы
- Полный suite вырос 483 → 514 (31 новый тест), ни один прежний не сломан (csv-export 55/55 — CSV-контур жив)

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- План 14-03 (поверхности + UAT): lib/device-xlsx.ts в финальной форме — filter-bar кнопка и строка палитры ссылаются на уже работающий /api/devices/export-xlsx; для UAT остаются SC 2/3 (реальный RU-Excel: numFmt-рендеринг, freeze-pane, ширины — D7 выше, human_judgment)
- Флагнутое допущение плана (edge EXP-02 unclassified в coverage-probe) остаётся на end-of-phase verify-work — не auto-dismiss

---
*Phase: 14-xlsx*
*Completed: 2026-10-01*

## Self-Check: PASSED

- tests/xlsx-export.test.ts — FOUND; lib/device-xlsx.ts — FOUND; 14-02-SUMMARY.md — FOUND
- Коммиты: f877241 (test RED), dd81c13 (feat GREEN) — FOUND в git log
- Suite 514/514, lint 0 ошибок, build зелёный — воспроизведено последним прогоном
