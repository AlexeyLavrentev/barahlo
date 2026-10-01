---
phase: 14-xlsx
verified: 2026-10-01T05:08:38Z
status: passed
score: 6/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
prohibitions:
  - statement: "MUST NOT изменять существующий CSV-экспорт (app/api/devices/export/route.ts, lib/csv.ts, рендереры lib/device-csv.ts)"
    status: resolved
    verification: judgment
    evidence: "git show --name-only over all 10 phase-14 commits (6027305..0716df4): ни один не трогает CSV-контур; tests/csv-export.test.ts 55/55 зелёный в прогоне верификации; на CSV-роуте нет ?format=xlsx ветки"
  - statement: "MUST NOT создавать параллельную модель колонок (второй массив 20 меток / копия словаря гарантии)"
    status: resolved
    verification: judgment
    evidence: "lib/device-xlsx.ts:20-24 — метки только через deviceCsvHeader(), словарь только импорт WARRANTY_STATE_LABELS; grep по файлу не находит второго массива меток (только комментарии ширин); header-parity тест байт-точно прикалывает метки к кейстоуну (tests/xlsx-export.test.ts:198)"
---

# Phase 14: XLSX-выгрузка ведомости — Verification Report

**Phase Goal:** Руководитель отдаёт начальству ведомость устройств файлом Excel, который открывается сразу и правильно — без настройки разделителей, без «числа как текст», без развалившихся номеров: те же 20 колонок и тот же состав строк, что CSV-ведомость (EXP-01), но с настоящими типами ячеек.
**Verified:** 2026-10-01T05:08:38Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

Must-haves merged from ROADMAP §Phase 14 Success Criteria (SC1–SC5, contract) and PLAN frontmatter (14-01/14-02/14-03). Plan truths restating an SC are folded into it; the D-04 pin contract is kept as its own truth (not an SC wording). UAT-покрытые RU-Excel truths засчитаны по одобренной человеческой приёмке (14-UAT.md, 8/8 pass, оператор, 2026-10-01) — не маршрутизируются в human_needed повторно.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: «Скачать XLSX» рядом с «Скачать CSV» на обеих поверхностях (filter-bar + ⌘K-палитра); состав строк паритетен CSV — текущие фильтры на кнопке, весь парк в палитре, без фильтров = весь парк | ✓ VERIFIED | `filter-bar.tsx:50-61` — XLSX-якорь СРАЗУ после CSV-якоря, классы CSV минус ml-auto (grep-пробы: ml-auto только на CSV), href `/api/devices/export-xlsx${buildDevicesQuery(filters)}`; `command-palette.tsx:477-486` — строка «Скачать ведомость XLSX» после CSV-строки, `render={<a href="/api/devices/export-xlsx" />}`, onClick закрывает палитру, без border-t; row-count parity пиннут тестом «строк экспорта === totalDeviceCount()» (зелёный в прогоне 515/515); UAT шаги 2/3/8 — pass |
| 2 | SC2: файл открывается в реальном RU-Excel без «восстановить книгу»: те же 20 колонок в том же порядке, жирная шапка, закреплённая первая строка, заданные ширины | ✓ VERIFIED | UAT шаг 4а/4б — pass (реальный RU-Excel, одобрено оператором 2026-10-01); байт-уровень: в живой книге (проба 200) `<pane ySplit="1" topLeftCell="A2" state="frozen"/>`, ровно 20 `<col customWidth="1">` с ширинами === XLSX_COLUMN_WIDTHS, numFmt `@` на шапке (bold через styles), sheet name «Устройства»; header-parity тест: метки байт-точны deviceCsvHeader() с U+2033 ″ |
| 3 | SC3: ячейки типизированы — диагональ настоящее число («21,5» в RU-локали, SUM/сорт), даты настоящие Excel-даты, серийники/инвентарники текст без E+15 с ведущими нулями | ✓ VERIFIED | 32 теста xlsx-export зелёные (диагональ {Number,'0.0'}, цена {Number,'#,##0'}, серийник/инвентарник {String,'@'} с '0042', даты Date-ячейки дословно, пин множества типов {String,Number,Date}); XML живой книги: даты — числовые serials со стилем dd.mm.yyyy (s="4"), цена 228000 числом со стилем #,##0 (s="5"), серийник 'SN-XYQQ07'/инвентарник 'ИБ-0000106' в sharedStrings (s="2"/@), 0 `<f>` формул, 0 `t="b"`; UAT шаг 4в/4г/4д/4е — pass («21,5», «125 000», даты, нули, без E+15) |
| 4 | SC4: parity с сайтом и гигиена файла — «Статус гарантии» из общего словаря с цветом сайта; имя «устройства-ГГГГ-ММ-ДД.xlsx» из Windows Chrome/Edge (RFC 5987); без сессии выгрузка не отдаёт (requireSession-first) | ✓ VERIFIED | `device-xlsx.ts:120` — WARRANTY_STATE_LABELS[warrantyState(until, today)], словарь импортирован, today инжектится раз на запрос (route.ts:63); frozen-clock MSK тесты зелёные; UAT 4ж — pass; RFC 5987 dual-filename пиннут тестом и подтверждён живыми заголовками (`filename="devices-2026-10-01.xlsx"; filename*=UTF-8''%D1%83...`), UAT шаг 5 (Windows Chrome/Edge) — pass; гейт: `await requireSession()` — первый стейтмент GET (route.ts:42); живые пробы верификации: без cookie → 307, UAT шаг 7 (после диагностики валидного cookie) — pass, спайк: 307 без сессии |
| 5 | SC5: выгрузка работает на прод-способе деплоя — standalone-спайк подтверждает, что write-excel-file попадает в standalone-бандл | ✓ VERIFIED | spike-standalone.md: build exit 0, маршрут в манифесте, 307 неавторизованный / 200 + PK (37 090 байт) авторизованный; ВЕРДИКТ: бандлинг ОК — serverExternalPackages не нужен; next.config.ts содержит только `output: "standalone"` (конфиг не тронут — вердикт соблюдён); воспроизведено верификацией: `npm run build` зелёный, `/api/devices/export-xlsx` в манифесте (ƒ Dynamic) |
| 6 | D-04: write-excel-file закреплён точной версией 4.1.1 без caret, импорт только через вложенный путь write-excel-file/node | ✓ VERIFIED | package.json:28 `"write-excel-file": "4.1.1"` (точный пин), package-lock.json 4.1.1, node_modules фактически 4.1.1; единственный импорт библиотеки в серверном коде — `lib/device-xlsx.ts:20 from 'write-excel-file/node'`; файл pure: 0 импортов server-only/next/* (grep-проба) |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

### Prohibition Verification (14-02 must_haves.prohibitions, judgment-tier)

Оба prohibition'а имели статус `resolved` в PLAN frontmatter; верификация подтвердила их детерминированными свидетельствами (дифф + импорты + suite), оба засчитаны VERIFIED — в human_needed не маршрутируются (см. frontmatter `prohibitions` для evidence).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `package.json` | точный пин write-excel-file 4.1.1 | ✓ VERIFIED | строка 28, без ^/~ |
| `lib/device-xlsx.ts` | pure-модуль: XLSX_SHEET_NAME, 20 ширин, headerCells, пиннутая матрица, buildDeviceXlsx, xlsxResponseHeaders | ✓ VERIFIED | 166 строк, все 6 экспортов на месте, сигнатуры финальные |
| `app/api/devices/export-xlsx/route.ts` | GET-композер: requireSession-first + D-07 цепочка + Uint8Array-тело | ✓ VERIFIED | route.ts:41-74, цепочка дословно зеркалит CSV-роут |
| `tests/xlsx-export.test.ts` | матричный пин, header-parity, пин заголовков, row-count parity, frozen-clock, sparse-row (WR-01) | ✓ VERIFIED | 422 строки, 32 теста, harness csv-export |
| `.planning/phases/14-xlsx/spike-standalone.md` | свидетельство спайка D-06 + вердикт | ✓ VERIFIED | обе curl-команды с кодами, заголовки, PK, вердикт |
| `app/(app)/devices/filter-bar.tsx` | якорь «Скачать XLSX» после CSV, без второго ml-auto | ✓ VERIFIED | строки 56-61, grep-пробы pass |
| `components/command-palette.tsx` | XLSX_ITEM + строка палитры с render-якорем | ✓ VERIFIED | строки 89, 477-486, без border-t, без router.push/window.open в XLSX-блоке |

Все 8 артефактов трёх планов прошли `verify.artifacts` (exists + substantive, 0 issues). Level 3 (wired): все импортируемы и используются — key links ниже. Level 4 (data-flow): `exportDevices` — реальный `db.select` (db/queries/devices.ts:473+); живая книга содержит фактические данные БД (Ноутбук, SN-XYQQ07, ИБ-0000106, RAM 32, цена 228000) — FLOWING, не hollow.

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| app/api/devices/export-xlsx/route.ts | lib/device-xlsx.ts | import buildDeviceXlsx/xlsxResponseHeaders | ✓ WIRED | gsd-tools verify.key-links: pattern found |
| lib/device-xlsx.ts | lib/device-csv.ts | deviceCsvHeader + WARRANTY_STATE_LABELS (кейстоун) | ✓ WIRED | импорт строки 22, паритет-тест зелёный |
| lib/device-xlsx.ts | lib/warranty.ts | warrantyState(r.warrantyUntil, today) | ✓ WIRED | строка 120, parity с цветом сайта |
| tests/xlsx-export.test.ts | lib/device-xlsx.ts | прямой vitest-импорт всех функций | ✓ WIRED | 32 теста зелёные |
| app/(app)/devices/filter-bar.tsx | app/api/devices/export-xlsx/route.ts | href + buildDevicesQuery(filters) | ✓ WIRED | строка 57 |
| components/command-palette.tsx | app/api/devices/export-xlsx/route.ts | Autocomplete.Item render={<a href>} | ✓ WIRED | строка 479 |

7/7 key links verified (gsd-tools, все три плана).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Полный suite | `npx vitest run` | 515/515 (28 файлов; 32 xlsx; csv-export 55/55 — CSV жив) | ✓ PASS |
| Типчек | `npx tsc --noEmit` | 0 ошибок | ✓ PASS |
| Прод-сборка | `npm run build` | зелёная; export-xlsx в манифесте (ƒ Dynamic) | ✓ PASS |
| Гейт без сессии (live dev) | `curl -o /dev/null -w '%{http_code}' :3000/api/devices/export-xlsx` | 307 (redirect на /login) | ✓ PASS |
| Авторизованная выгрузка (live dev, HS256-cookie по форме lib/session.ts) | `curl -D - -H "Cookie: session=…"` | 200; Content-Type — spreadsheetml.sheet; RFC 5987 dual filename; nosniff; no-store; 39 621 байт с магией `50 4b` | ✓ PASS |
| Структура книги (unzip живого файла) | unzip + grep XML | freeze pane ySplit=1; numFmts @/0.0/dd.mm.yyyy/#,##0; 20 col widths === XLSX_COLUMN_WIDTHS; sheet «Устройства»; 0 формул; 0 boolean | ✓ PASS |
| Линт | `npm run lint` | 0 errors (6 предсуществующих warnings, фазы 6–7, вне скоупа — deferred-items.md) | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| (phase-объявленных probe-скриптов нет — find scripts/*/tests/probe-*.sh пуст; D-06 спайк был разовым таском с записанным свидетельством) | — | Свидетельство спайка (307/200+PK/вердикт) независимо воспроизведено live-пробами и повторной сборкой выше | N/A — покрыто spot-checks |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| EXP-02 | 14-01, 14-02, 14-03 (все три плана объявляют) | Ведомость устройств в XLSX: те же 20 колонок и состав строк, что CSV (EXP-01), те же поверхности; типизированные ячейки — числа числами, серийники/инвентарники строками без научной записи, даты настоящими Excel-датами | ✓ SATISFIED | SC1–SC5 все VERIFIED (таблица выше); REQUIREMENTS.md: EXP-02 → Phase 14 Complete; orphaned-требований нет — REQUIREMENTS.md мапит на Phase 14 только EXP-02 (PHOTO-01 → Phase 15) |

**COVERAGE.md flagged assumption resolution:** единственный «unclassified/unresolved» edge (EXP-02, spec-less probe) — разрешён настоящей верификацией: требование полностью покрыто SC1–SC5, каждый с TDD-пином и/или UAT-свидетельством. Допущение «EXP-02 покрыт 5 SC + картой ячеек» подтверждено; ручная ревизия, назначенная на end-of-phase verify-work, выполнена.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| lib/device-xlsx.ts | 91-123 | `as SheetData` cast для null-значений ячеек | ℹ️ Info | Задокументирован на месте каста (library type omission, рантайм пишет null как пустую ячейку); принят code-review (0 critical), значения едут дословно; sparse-row тест WR-01 закрепляет ветку (0716df4) |
| lib/device-xlsx.ts | 104 | Дубликат ramUpgraded-тернарника (vs device-csv.ts:135) | ℹ️ Info | Явно санкционирован research («zero production refactor»); зарегистрирован как IN-01 в 14-REVIEW.md с рецептом фикса при следующем касании файлов |
| lib/device-xlsx.ts | 33-54 | Позиционная связь XLSX_COLUMN_WIDTHS с кейстоуном без length-кросс-чека | ℹ️ Info | Header-parity тест прикалывает шапку на 20; IN-02 14-REVIEW.md предлагает one-line пин при следующем касании — не блокер |

Деб-маркеров (TBD/FIXME/XXX) в файлах фазы нет; «placeholder»-совпадения в command-palette.tsx — предсуществующие атрибуты input'а, не стабы. Stub-паттернов нет: все артефакты substantive и wired.

### Deferred Items

Нет — единственный потенциальный кандидат (6 предсуществующих lint-warnings фаз 6–7) не является failed must-have фазы 14; он задокументирован в deferred-items.md как уборка вне v1.3 и не матчится ни с одной позднейшей фазой вехи (Phase 15 = PHOTO-01, лайтбокс).

### Human Verification Required

Нет. Чекпойнт UAT (Task 2 плана 14-03, gate="blocking") пройден оператором 2026-10-01 — 8/8 шагов pass (14-UAT.md): реальный RU-Excel без «восстановить книгу», «21,5» числом, «125 000», даты дд.мм.гггг, серийники текстом с нулями, кириллическое имя из Windows Chrome/Edge, Enter в ⌘K-палитре, сессионный гейт (шаг 7 — диагностирован валидный session-cookie, НЕ дефект; гейт подтверждён живыми пробами 307), пустой результат = шапка без строк. Все behavior-зависимые истины фазы имеют либо зелёный поведенческий тест (row parity, sparse row, empty park, type set), либо live-пробу верификации (гейт, 200-путь, байты книги), либо одобренную человеческую приёмку (SC2/SC3-рендеринг).

### Gaps Summary

Гэпов нет. Фазовая цель достигнута и в коде, и в рантайме: единственная новая зависимость вехи запинена точно и бандлится в standalone без escape hatch; XLSX-маршрут зеркалит D-07-цепочку CSV с requireSession-first и жёсткими заголовками; 20-колоночная матрица пиннута 32 позиционными тестами с байт-точным кейстоун-паритетом; обе поверхности аддитивны, CSV-контур не тронут ни одним коммитом фазы (дифф-проверка) и 55/55 зелёный; живая книга демонстрирует настоящие Date/Number/String-ячейки, freeze pane и заданные ширины; UAT в реальном RU-Excel одобрен оператором.

Книжкепинг (не гэп, к оркестратору): чекбокс Phase 14 в ROADMAP.md (строка 51) и строка Progress («In Progress») обновятся на Complete штатно после этой верификации.

---

_Verified: 2026-10-01T05:08:38Z_
_Verifier: Claude (gsd-verifier)_
