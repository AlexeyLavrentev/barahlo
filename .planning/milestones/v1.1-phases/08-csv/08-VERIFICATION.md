---
phase: 08-csv
verified: 2026-09-16T09:00:35Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  note: "Initial verification — no previous VERIFICATION.md existed"
human_verification:

  - test: "Открыть выгрузку /api/devices/export на dev-инстансе в RU-Excel/Numbers (или Numbers с RU-регионом): колонка «Диагональ, ″» со значением 21,5 должна читаться как ЧИСЛО 21,5, а не как дата «21.май»"
    expected: "«21,5» распознаётся числом; «23,8» аналогично; целые «27»/«3»/«11» без изменений; файл в целом (BOM, «;», CRLF, ISO-даты) открывается корректно"
    why_human: "Поведение локали Excel при открытии CSV не воспроизводимо в vitest (research Pitfall 1, 4 внешних источника, MEDIUM confidence); запятая-десятичная ячейка запинена unit-тестами (diagonalCell 21.5→'21,5'), но факт открытия проверяет оператор. Записано в .planning/WINDOWS.md #8 (unrun-verify, open) и 08-VALIDATION.md"

  - test: "РЕШЕНИЕ (Escalation Gate): подтвердить или отклонить отсрочку WR-01 (08-REVIEW) — route.ts «Object.fromEntries(searchParams)» схлопывает дублированные query-параметры, страница деградирует их в неактивные сентинелы; на malformed URL (напр. ?type=laptop&type=monitor) CSV ≠ страница"
    expected: "Осознанное решение разработчика: (а) принять отсрочку до Фазы 11 (как записано в .planning/phases/08-csv/deferred-items.md) — но тогда добавить фикс в скоуп Фазы 11 явно, поскольку SC Фазы 11 его не упоминают; или (б) закрыть сейчас однострочным шейпингом массивов перед parseDevicesSearchParams (фикс предложен в 08-REVIEW.md WR-01)"
    why_human: "Строка предсуществующая (фаза 5, git: route.ts:57 → :43 без изменения содержимого), фаза 8 была обязана её заморозить (D-18/WR-01); но это единственный найденный прокол контракта «файл = реестр» (SC 2) на malformed-входе — решение о сроках принимает разработчик, не верификатор"
---

# Phase 8: CSV-ведомость полного контекста — Verification Report

**Phase Goal:** Одна выгрузка отвечает на вопросы отчётности и аудита: у каждой единицы в файле видны владелец, отдел, конфигурация её типа, текстовый статус гарантии и стоимость.
**Verified:** 2026-09-16T09:00:35Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

Одна выгрузка теперь несёт полный контекст: 20 колонок, включая разреженный конфиг-блок своего типа и текстовый вердикт по гарантии. Все 8 must-have истин верифицированы кодом и поведенческими тестами; 1 ручная проверка (RU-Excel) и 1 решение по предсуществующему edge-дефекту переданы человеку.

### Observable Truths

Roadmap SC 1–4 отображены на истины плана: SC 1 → истины 1–4, SC 2 → истина 5, SC 3 → истина 6, SC 4 → истина 7; истина 8 — «сайт не тронут» (контекст D-01–D-06).

| # | Truth | Status | Evidence |
| --- | ------- | ------ | -------- |
| 1 | Выгрузка содержит 20 колонок: конфиг-блок сплошным куском после «SSD, ГБ» (D-01), «Статус гарантии» после «Гарантия до» (D-05) | ✓ VERIFIED | `lib/device-csv.ts:93-113` deviceCsvHeader() — 20 колонок, spread `CONFIG_EXPORT_KEYS.map(keystoneLabel)` на позициях 10–13; тесты `tests/csv-export.test.ts:425-440` пинят header[9]='SSD, ГБ', [10]='Диагональ, ″', [11]='Тип матрицы', [12]='Количество портов', [13]='Вид', [17]='Гарантия до', [18]='Статус гарантии' — зелёные |
| 2 | Метки конфиг-колонок дословно равны меткам кейстоуна, включая U+2033 ″ (D-02); правка кейстоуна меняет и форму, и файл | ✓ VERIFIED | `keystoneLabel` (device-csv.ts:57-61) ищет label в `DEVICE_TYPES.flatMap(t => t.fields)`; device-schema.ts:83-86 — `fields: PER_TYPE_FIELDS.<type>` ПО ССЫЛКЕ, т.е. ровно те же массивы, что рендерит форма. U+2033 подтверждён побайтово (codepoint 2033 в метке «Диагональ, ″»). Throw на неизвестном ключе протестирован; тест header[10+i]===keystoneLabel(key) зелёный |
| 3 | Разреженность структурна: каждый тип заполняет только свои поля, без ветвлений по типу; «Статус гарантии» в каждой строке, включая «Без гарантии» (D-03/D-04) | ✓ VERIFIED | buildDeviceCsv (device-csv.ts:124-149) — pass-through nullable-полей, ни одного `if (typeKey)`; createDevice пишет `?? null` (db/queries/devices.ts:552-555). Sparse-матрица по всем 4 типам DEVICE_TYPES (тесты :505-553) — «своё заполнено / чужое пусто» по кейстоуну; null-warranty → «Без гарантии» (:566-568, :587-593) — зелёные |
| 4 | Статус гарантии = parity с цветом сайта: тот же warrantyState(warrantyUntil, today), today вычислен один раз на запрос (SC 1, WR-01) | ✓ VERIFIED | device-csv.ts:147 — единственный расчёт `WARRANTY_STATE_LABELS[warrantyState(r.warrantyUntil, today)]`; app/(app)/devices/page.tsx использует тот же warrantyState (комментарий :215 «one WarrantyDate, one warrantyState calculation»). route.ts:56 — `const today = displayTodayUtc()` один на GET. Parity-таблица 0/59/60→«Истекает», 61→«Действует», −1→«Истекла», null→«Без гарантии» (тесты :555-577) + end-to-end ячейка [18] на 4 состояниях — зелёные |
| 5 | Без фильтров — весь парк (export === totalDeviceCount()); с фильтрами — ровно отфильтрованный результат через общий deviceWhere (SC 2) | ✓ VERIFIED | Row-count pin (тесты :641-645) и parity-walk exportDevices = union страниц listDevices в каноническом порядке (:325-358) — зелёные; exportDevices композирует `.where(deviceWhere(type, filters))` (db/queries/devices.ts:499), deviceWhere/orderBy/limit-отсутствие не тронуты (git 51bb5c9: только DeviceExportRow + SELECT). Оговорка-предупреждение: на malformed URL с дублированным параметром route расходится со страницей — предсуществующая строка фазы 5, см. «Human Verification» #2 |
| 6 | Даты — ISO yyyy-mm-dd (D-06); диагональ «21,5» запятой, целые без изменений; BOM/«;»/CRLF; все 20 ячеек через esc() — инъекция через новые колонки невозможна (SC 3) | ✓ VERIFIED | isoFileDate = toISOString().slice(0,10) (UTC-midnight-safe, без Intl/локальных геттеров — grep пуст); diagonalCell replace('.','') → «21,5»/«23,8», целое 27 не тронуто (тесты :609-615); BOM/«;»/CRLF pinned; инъекция panelType «=1+1» → TAB-префикс в теле (:462-464, :596-600); единственный путь сборки `buildCsv(deviceCsvHeader(), cells)` (device-csv.ts:150), esc проходит и заголовок (lib/csv.ts:42) — всё зелёное |
| 7 | requireSession() — первое действие роута; без сессии данные не отдаются (SC 4) | ✓ VERIFIED | route.ts:42 — `await requireSession()` литерально первое действие GET (source assertion); requireSession (lib/auth.ts:10-15) → `if (!session) redirect('/login')` — redirect бросает до любого доступа к данным; verifySession fail-closed (invalid/expired/undefined → null) покрыт unit-тестами tests/session.test.ts. Инвариант порядка статически детерминирован (безусловный первый statement); режим верификации «source assertion + неизменность» заявлен планом и research (A4) — роут не vitest-импортируем |
| 8 | Сайт не тронут: dd.mm.yyyy-форматтер, ссылка «Скачать CSV», имя файла и csvResponseHeaders без изменений | ✓ VERIFIED | lib/warranty-date.tsx — последний коммит 991d122 (фаза 05-03), в diff фазы 8 отсутствует; filter-bar.tsx «Скачать CSV» (:48) не в diff фазы; csvResponseHeaders (lib/csv.ts:54-63) — та же фазовая-5 форма (dual filename RFC 5987, nosniff, no-store); импорт сайт-форматтера из роута удалён (grep formatWarrantyDate|warranty-date в route.ts — пуст) |

**Score:** 8/8 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/device-csv.ts` | Pure-модуль: CONFIG_EXPORT_KEYS, keystoneLabel, WARRANTY_STATE_LABELS, isoFileDate, diagonalCell, deviceCsvHeader, buildDeviceCsv | ✓ VERIFIED | 151 строка, все 7 символов на месте; без фреймворк-импортов (grep `from 'next` пуст); DeviceExportRow type-only; WIRED — импортируется роутом и тестами |
| `db/queries/devices.ts` | exportDevices SELECT + DeviceExportRow +4 nullable конфиг-поля; deviceWhere/orderBy не тронуты | ✓ VERIFIED | SELECT :487-490 (зеркало getDevice :523-526), DeviceExportRow :100-103 с `| null`; замороженные поверхности не в diff (51bb5c9: +13 строк только) |
| `app/api/devices/export/route.ts` | Thin composer: requireSession-first + парсер-цепочка + today один раз + buildDeviceCsv | ✓ VERIFIED | 63 строки: requireSession (:42) → parseDevicesSearchParams → toDeviceListFilters → exportDevices → displayTodayUtc (:56) → buildDeviceCsv (:60); HEADER/cells из роута удалены |
| `tests/csv-export.test.ts` | Матрица: header-позиции, sparse 4 типов, parity границ, ISO, инъекция, row-count pin | ✓ VERIFIED | 55 тестов (26 → 55), все зелёные; parseFile()-хелпер позиционного разбора; seed'ы по кейстоуну declaredKeys() |

### Key Link Verification

gsd-tools verify.key-links вернул 0/4 только потому, что поля `from` в must_haves — описания, а не файловые пути (ограничение тулзы). Все 4 ссылки проверены вручную:

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| Колонка «Статус гарантии» (buildDeviceCsv) | lib/warranty.ts warrantyState + WARRANTY_STATE_LABELS | `WARRANTY_STATE_LABELS[warrantyState(r.warrantyUntil, today)]` | ✓ WIRED | Точная строка device-csv.ts:147; константы границы/дневная арифметика в device-csv/route отсутствуют (grep пуст) — parity по построению |
| deviceCsvHeader — конфиг-метки | lib/device-schema.ts PER_TYPE_FIELDS | keystoneLabel по CONFIG_EXPORT_KEYS | ✓ WIRED | DEVICE_TYPES несёт массивы PER_TYPE_FIELDS по ссылке (device-schema.ts:83-86); параллельного CSV-словаря меток нет |
| exportDevices WHERE | deviceWhere (общий со listDevices) | существующая композиция | ✓ WIRED | `.where(deviceWhere(type, filters))` (devices.ts:499); строка не менялась (git c7e095a^..51bb5c9) |
| Все 20 ячеек файла (включая заголовок) | lib/csv.ts buildCsv/esc | единственный путь сборки тела | ✓ WIRED | `return buildCsv(deviceCsvHeader(), cells)` — device-csv.ts:150; manual-join/.join(';') в device-csv и route — grep пуст; заголовок под тем же esc (csv.ts:42) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| buildDeviceCsv (cells) | rows: DeviceExportRow[] | exportDevices — drizzle select с 2×leftJoin + deviceWhere по devices | Да — тесты гоняют реальную temp-SQLite (applyMigrations), сеят 40+ строк и ассертят реальные значения в файле («21,5», «IPS», «Истекает», «2026-01-05») | ✓ FLOWING |
| route.ts (body) | rows / today | exportDevices(...) + displayTodayUtc() — из запроса, не заглушек | Да — тот же query-слой; парсер-цепочка общая со страницей | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Целевые файлы фазы (csv-export + warranty + devices-queries) | `npx vitest run tests/csv-export.test.ts tests/warranty.test.ts tests/devices-queries.test.ts` | 111 passed (55+14+42), 0 failed | ✓ PASS |
| Полный suite (один прогон) | `npx vitest run` | 370 passed, 20 files — совпадает с claim SUMMARY | ✓ PASS |
| 20-колоночный layout и parity-границы | покрыты именованными тестами внутри csv-export.test.ts (buildDeviceCsv — 20-колоночный файл; parity статуса; sparse-матрица; row-count pin) | все зелёные в прогоне выше | ✓ PASS |
| U+2033 в метке кейстоуна и в header | node-скрипт: codepoint-анализ device-schema.ts / device-csv.ts | 0x2033 присутствует в обоих | ✓ PASS |
| Source-ассерты запретов | grep: 86_400_000/WARRANTY_WARN_DAYS; toLocale*/Intl/getDay в device-csv; .join/manual-join в device-csv+route; `from 'next` в device-csv; formatWarrantyDate в route | все пусто (exit 1) | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | `find scripts -path '*/tests/probe-*.sh'` + grep probe- в PLAN/SUMMARY | ни конвенциональных, ни заявленных проб нет | SKIPPED (no probes declared) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| EXP-01 | 08-01-PLAN (requirements: [EXP-01]) | CSV-ведомость полного контекста: 4 типизированных конфиг-поля + текстовый статус гарантии; без фильтров = весь парк | ✓ SATISFIED | Истины 1–6; тесты зелёные; REQUIREMENTS.md:57 `EXP-01 | Phase 8 | Complete` |

Orphaned requirements: нет — REQUIREMENTS.md отображает на Phase 8 ровно EXP-01, план декларирует [EXP-01]. Покрытие полное.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | TBD/FIXME/XXX/HACK/PLACEHOLDER/не-implementation-заглушки в 4 файлах фазы | — | не обнаружены (grep пуст) |
| app/api/devices/export/route.ts | 43 | Дублированные query-параметры схлопываются Object.fromEntries (CSV ≠ страница на malformed URL) | ⚠️ Warning | Предсуществующая строка фазы 5 (git: содержимое не менялось, фаза обязана была заморозить парсер-цепочку); задокументирована в 08-REVIEW.md (WR-01) и deferred-items.md; well-formed-входы parity-тестами покрыты |
| lib/device-csv.ts | 143-146 | Date-truthiness вместо `!== null` в null-гвардах дат | ℹ️ Info | 08-REVIEW.md IN-02; работает корректно для Date \| null, стиль |
| app/api/devices/export/route.ts | 61 | Имя файла по server-UTC, остальное по display-TZ | ℹ️ Info | 08-REVIEW.md IN-01; замороженная фаза-5 поверхность (A7), осознанно не тронуто |
| 5 файлов вне диффа фазы | — | 6 pre-existing lint-предупреждений (5 unused-vars + 1 exhaustive-deps) | ℹ️ Info | 0 errors, exit 0; все в файлах, фазой не тронутых; записаны в deferred-items.md и WINDOWS.md #7 |

### Human Verification Required

### 1. RU-Excel: «21,5» читается числом, а не датой «21.мая»

**Test:** Скачать `/api/devices/export` на dev-инстансе, открыть в RU-Excel/Numbers (RU-регион).
**Expected:** «Диагональ, ″» → 21,5 как число; «23,8» аналогично; целые 27/3/11 не изменены; BOM/«;»/CRLF/ISO-даты корректны.
**Why human:** Поведение локали Excel не воспроизводимо в vitest (research Pitfall 1). Запятая-десятичная ячейка запинена unit-тестами; факт открытия — за оператором. Уже записано: WINDOWS.md #8 (unrun-verify, open), 08-VALIDATION.md.

### 2. РЕШЕНИЕ: судьба WR-01 (dup-param parity edge)

**Test:** Принять или отклонить отсрочку WR-01 (см. 08-REVIEW.md): route.ts:43 `Object.fromEntries` берёт последнее значение дублированного параметра, страница деградирует массив в неактивный сентинел → на `?type=laptop&type=monitor` CSV = только мониторы, страница = все типы.
**Expected:** Осознанное решение: (а) отсрочка до Фазы 11 — тогда явно добавить фикс в скоуп Фазы 11 (сейчас SC Фазы 11 его не упоминают — риск потери); или (б) закрыть сейчас шейпингом массивов перед parseDevicesSearchParams (готовый фикс в 08-REVIEW.md).
**Why human:** Строка предсуществующая (фаза 5) и замороженная для этой фазы; well-formed-контракт SC 2 доказан тестами. Решение о сроках — за разработчиком (Escalation Gate).

### Gaps Summary

Gaps (блокирующих) не найдено: все 4 SC роадмапа и все 8 истин плана верифицированы — 20-колоночный файл с разреженным конфиг-блоком D-01 и статусом гарантии D-05 существует, собран единственным esc-гвард-путём, parity с цветом сайта через тот же warrantyState, файл = реестр (row-count pin), requireSession-first сохранён, сайт не тронут. Коммиты фазы (c7e095a RED → 51bb5c9 GREEN → 7584bfc матрица) трогают ровно 4 заявленных файла; полный suite 370/370, lint 0 errors.

Статус **human_needed** (не passed) по двум пунктам, ни один не является провалом must-have:

1. Ручная проверка RU-Excel — плановая end-of-phase проверка (WINDOWS.md #8), поведенческий слой SC 3, недоступный vitest.
2. Решение по WR-01 — предсуществующий edge фазы 5, всплывший в ревью; требует явного решения «отложить (с фиксацией в Фазе 11) или починить сейчас», чтобы не потеряться.

---

_Verified: 2026-09-16T09:00:35Z_
_Verifier: Claude (gsd-verifier)_
