---
phase: 14-xlsx
plan: 03
subsystem: ui
tags: [xlsx, export-surfaces, filter-bar, command-palette, native-anchor, uat]

# Dependency graph
requires:
  - phase: 14-xlsx (plans 14-01/14-02)
    provides: /api/devices/export-xlsx (requireSession-first, RFC 5987 dual filename), финальная типизированная матрица deviceXlsxSheetData, standalone-спайк (бандлинг OK)
  - phase: 08-csv (EXP-01)
    provides: CSV-поверхности как аддитивные аналоги (якорь ml-auto в filter-bar, CSV-строка палитры с border-t)
  - phase: 11-find (⌘K-палитра)
    provides: нативная якорная семантика Autocomplete.Item render={<a href>} (Enter = DOM-клик по якорю)
provides:
  - Кнопка «Скачать XLSX» в filter-bar — серверный якорь /api/devices/export-xlsx + buildDevicesQuery(filters) (текущие фильтры), без второго ml-auto (Pitfall 14.5)
  - Строка «Скачать ведомость XLSX» в ⌘K-палитре — XLSX_ITEM ({ kind: 'xlsx' }) + Autocomplete.Item с render-якорем на /api/devices/export-xlsx (весь парк), без router.push/window.open (Pitfall 14.4)
  - UAT-чекпойнт (T2) — 8-шаговая приёмка в реальном RU-Excel (SC 1–4 фазы); пройдена оператором 2026-10-01, протокол .planning/phases/14-xlsx/14-UAT.md
affects: [14-xlsx verify-work (SC 2/3 human_judgment), phase-15-next]

# Tech tracking
tech-stack:
  added: [] # ни одной новой зависимости — только JSX-вставки поверх существующих поверхностей
  patterns: [additive-sibling export surface (вторичная кнопка без второго авто-маржина; вторая строка палитры без второго border-t)]

key-files:
  created:
    - .planning/phases/14-xlsx/14-03-SUMMARY.md
    - .planning/phases/14-xlsx/14-UAT.md
  modified:
    - app/(app)/devices/filter-bar.tsx
    - components/command-palette.tsx

key-decisions:
  - "ml-auto живёт ТОЛЬКО на CSV-якоре: свободное место бара забирается один раз, обе кнопки прижаты к правому краю одним блоком (второй ml-auto перевёрстывает бар и отрывает CSV — Pitfall 14.5)"
  - "XLSX-строка палитры — тот же нативный render={<a href>} паттерн, что CSV-строка (Enter диспетчит настоящий DOM-клик по якорю — скачивание с клавиатуры, фазовое решение 11); router.push/window.open не применялись (Pitfall 14.4)"
  - "border-t остаётся на CSV-строке — XLSX-строка сидит внутри того же блока; в палитре обе строки без query string (весь парк), на кнопке — buildDevicesQuery(filters)"

patterns-established:
  - "Additive sibling surface: второй экспорт рядом с первым копирует рецепт, но НЕ дублирует якорные декорации (авто-маржин кнопки, разделитель списка) — они принадлежат первому элементу блока"

requirements-completed: [] # EXP-02 уже помечен в 14-02 (серверная часть); финальный UAT-гейт T2 этого плана пройден 2026-10-01 (14-UAT.md)

coverage:
  - id: S1
    description: "Кнопка «Скачать XLSX» после CSV-якоря: href=/api/devices/export-xlsx + buildDevicesQuery(filters), классы CSV-якоря минус ml-auto; хвостовой комментарий покрывает оба экспорта"
    requirement: EXP-02
    verification:
      - kind: unit
        ref: "grep -c export-xlsx filter-bar.tsx = 2 (href + комментарий); grep -A4 «Скачать XLSX» | grep ml-auto → код 1 (нет); npx tsc --noEmit = 0"
        status: pass
    human_judgment: false
  - id: S2
    description: "Строка «Скачать ведомость XLSX» сразу после CSV-строки: XLSX_ITEM { kind: 'xlsx' }, render={<a href=\"/api/devices/export-xlsx\" />}, onClick закрывает палитру, без border-t, без router.push/window.open"
    requirement: EXP-02
    verification:
      - kind: unit
        ref: "исходник components/command-palette.tsx (XLSX_ITEM + Autocomplete.Item после CSV-строки); npx tsc --noEmit = 0; npm run build зелёный; suite 514/514"
        status: pass
    human_judgment: false
  - id: S3
    description: "UAT SC 1–4 в реальном RU-Excel: файл без «восстановить книгу», «21,5»/«125 000» numFmt-ами, даты дд.мм.гггг, серийники текстом без E+15, кириллическое имя из Windows-браузера, Enter в палитре скачивает, без сессии данные не отдаются, пустой результат = шапка без строк"
    requirement: EXP-02
    verification:
      - kind: uat
        ref: ".planning/phases/14-xlsx/14-UAT.md — 8/8 шагов result: pass, одобрено оператором 2026-10-01 (шаг 7 — диагностика валидного session-cookie, не дефект)"
        status: pass
    human_judgment: true
    rationale: "SC 1–4 фазы проверяются только глазами в реальном RU-Excel и живой палитре — ни один раннер репозитория не эмулирует viewer-локаль/клавиатуру/сессионный гейт (research §Test Map); гейт — чекпойнт T2 этого плана, пройден оператором 2026-10-01"

# Metrics
duration: ~10 min (T1) + human UAT (T2)
completed: 2026-10-01
status: complete # T1 committed 642bfa3; T2 UAT пройдена оператором 2026-10-01 (14-UAT.md, 8/8 pass)
---

# Phase 14 Plan 03: Поверхности XLSX + UAT Summary

**Обе поверхности экспорта доставлены аддитивно — кнопка «Скачать XLSX» рядом с «Скачать CSV» (тот же рецепт минус ml-auto) и строка «Скачать ведомость XLSX» в ⌘K-палитре (нативный render-якорь, без border-t); CSV-поверхности байт-нетронуты, tsc/build/suite 514/514 зелёные; UAT в реальном RU-Excel пройден оператором 2026-10-01 — 8/8 шагов, SC 1–4 закрыты**

## Performance

- **Duration:** ~10 min (T1) + human UAT (T2)
- **Started:** 2026-10-01T04:15:18Z
- **T1 committed:** 2026-10-01T04:22Z
- **T2 UAT approved:** 2026-10-01 (оператор; протокол 14-UAT.md)
- **Tasks:** 2 of 2 (T2 = checkpoint:human-verify — пройден и одобрен)

## Accomplishments

- T1: `app/(app)/devices/filter-bar.tsx` — серверный якорь «Скачать XLSX» СРАЗУ после CSV-якоря: href `/api/devices/export-xlsx${buildDevicesQuery(filters)}` (те же фильтры, что у CSV), классы CSV-якоря БЕЗ ведущего ml-auto (Pitfall 14.5 — обе кнопки одним блоком у правого края); хвостовой комментарий блока обновлен и покрывает оба экспорта (ml-auto задокументирован как живущий только на CSV-якоре); заголовочный комментарий бара синхронизирован (бар заканчивается двумя экспорт-ссылками)
- T1: `components/command-palette.tsx` — `XLSX_ITEM = { kind: 'xlsx' } as const` рядом с CSV_ITEM (юнион PaletteItem не расширялся — оба item-константы живут вне групп, как CSV_ITEM) + `Autocomplete.Item` «Скачать ведомость XLSX» сразу после CSV-строки: `render={<a href="/api/devices/export-xlsx" />}` (нативный якорь — Enter с клавиатуры диспетчит настоящий DOM-клик и скачивает файл, палитра закрывается onClick'ом), без query string (весь парк, как CSV-строка), без border-t (разделитель остаётся на CSV-строке); router.push/window.open отсутствуют (Pitfall 14.4)
- CSV-поверхности байт-нетронуты: git diff удаляет только строки комментариев; CSV-якорь и CSV-строка Autocomplete.Item не изменены
- Верификация: `npx tsc --noEmit` код 0; `npm run build` зелёный (export-xlsx в манифесте); `npx vitest run` 514/514 (28 файлов); acceptance-greps плана — все PASS (ml-auto на XLSX-якоре отсутствует, на CSV присутствует)

## Task Commits

1. **Task 1: Поверхности — XLSX-якорь в filter-bar + XLSX-строка в ⌘K-палитре (D-08)** - `642bfa3` (feat)

**Task 2 (checkpoint:human-verify, gate="blocking"):** UAT в реальном RU-Excel — возвращён оркестратору как структурированный чекпойнт (НЕ одобрялся автоматически: человеческие глаза на реальный Excel не эмулируются). **Одобрен оператором 2026-10-01** — 8/8 шагов `result: pass`; протокол приёмки: `.planning/phases/14-xlsx/14-UAT.md` (шаг 7 — диагностика валидного session-cookie, не дефект).

## Files Created/Modified

- `app/(app)/devices/filter-bar.tsx` (MODIFIED) — +12 строк JSX (XLSX-якорь), комментарии хвостового и заголовочного блоков обновлены на «оба экспорта»
- `components/command-palette.tsx` (MODIFIED) — +21 строка (XLSX_ITEM + строка Autocomplete.Item с комментарием), ни одна существующая строка не изменена

## Decisions Made

- ml-auto — только на CSV-якоре (якорные декорации блока не дублируются на сиблингах)
- XLSX-строка палитры — точная копия нативного якорного паттерна CSV-строки (фазовое решение 11), только без border-t
- Заголовочный комментарий filter-bar («The bar ends…») синхронизирован с новой структурой — комментарий-документация, не CSV-поверхность (JSX CSV-якоря не тронут)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Doc-drift] Заголовочный комментарий filter-bar больше не описывал бар честно**
- **Found during:** Task 1
- **Issue:** комментарий «The bar ends (ml-auto) with the D-18 «Скачать CSV» link» становился ложным — бар теперь заканчивается XLSX-якорем
- **Fix:** одна фраза переписана на «экспорт-ссылки: CSV (ml-auto, план 04) + XLSX-сиблинг (план 14)»; JSX CSV-якоря не тронут
- **Files modified:** app/(app)/devices/filter-bar.tsx (комментарий)
- **Committed in:** 642bfa3 (в составе Task 1)

---

**Total deviations:** 1 auto-fixed (doc-drift, Rule 1)
**Impact on plan:** Нет — комментарий-точность. CSV-якорь и CSV-строка байт-нетронуты.

### UAT Note — шаг 7 (сессионный гейт): наблюдение в ходе приёмки, НЕ дефект

В ходе UAT пользователь сначала наблюдал скачивание XLSX в «приватном» окне (ожидание — redirect на логин). Диагноз: в браузере присутствовал **валидный session-cookie** (30-дневный JWT, D-01; Safari в приватном режиме разделяет cookies с основной сессией) — «приватное окно» не эмулирует отсутствие сессии. Оркестратор проверил гейт живьём на работающем dev-сервере: запрос без cookie → 307, с мусорным cookie → 307. RequireSession-first работает корректно; после объяснения пользователь одобрил шаг. Задокументировано в 14-UAT.md (шаг 7); в WINDOWS.md не записывалось (не дефект).

## Issues Encountered

None — tsc/build/suite зелёные с первого прогона, все acceptance-критерии T1 прошли.

## User Setup Required

None — no external service configuration required. Для T2 (UAT) нужен доступ к dev-инстансу и реальный RU-Excel (предпочтительно Windows; Numbers/Google Sheets — вторичное свидетельство).

## Next Phase Readiness

- План 14-03 закрыт (UAT одобрен 2026-10-01) — все 3 плана фазы 14 выполнены; фаза готова к end-of-phase verify-work
- D7-класс human_judgment (SC 2/3 в реальном RU-Excel) покрыт T2 (14-UAT.md); Windows-проверка кириллического имени (шаг 5) прошла в UAT

---
*Phase: 14-xlsx*
*Completed: 2026-10-01 (T1 `642bfa3`; T2 UAT approved 2026-10-01)*
