---
plan: 14-01
phase: 14-xlsx
status: complete
completed: 2026-10-01
executed_by: orchestrator-inline (executor subagent stalled at 600s after T1 commit; T2 written by executor pre-stall, verified and committed inline; T3 executed inline)
---

# Plan 14-01: Пин write-excel-file + трассер + standalone-спайк

## What Was Built

Волновая единственная новая зависимость вехи и трассер сквозного среза, доказывающий до построения
фичи (D-06), что write-excel-file доезжает до прод-способа деплоя:

1. **T1 — пин (D-04):** `write-excel-file@4.1.1` exact в package.json (без caret), серверный код
   импортирует только вложенный вход `write-excel-file/node` (корень пакета резолвит браузерную
   сборку; /universal даёт Blob-only без toBuffer). Коммит 6027305.
2. **T2 — трассер (D-05/D-07/D-08):** pure `lib/device-xlsx.ts` (139 строк, дисциплина
   lib/device-csv.ts — ни server-only, ни next/*, vitest-импортируемый): метки колонок из
   `deviceCsvHeader()` (никакого второго словаря), словарь гарантии `WARRANTY_STATE_LABELS` из
   device-csv, `XLSX_SHEET_NAME='Устройства'`, 20 ширин, tracer-версия `deviceXlsxSheetData`
   (значения as-is; план 14-02 заменит тело типизированной матрицей, сигнатура заморожена),
   `buildDeviceXlsx` (stickyRowsCount: 1, sheet-level dateFormat 'dd.mm.yyyy'),
   `xlsxResponseHeaders` (XLSX MIME без charset, RFC 5987 dual filename, nosniff, no-store).
   Тонкий роут `app/api/devices/export-xlsx/route.ts` — дословное зеркало CSV-цепочки (D-07):
   requireSession первым стейтментом → searchParamsRecord → parseDevicesSearchParams →
   toDeviceListFilters → exportDevices → один displayTodayUtc() → Uint8Array-обёртка тела.
   Коммит 46052dd.
3. **T3 — спайк (SC 5):** standalone-сборка чистая (exit 0, роут в манифесте); база снята
   backup-API; на :3120 неавторизованный щуп = **307** (не 5xx — модуль загрузился), авторизованный
   = **200 OK**, XLSX MIME, RFC 5987-имя, файл 37 090 байт с PK-магией и полной OOXML-структурой.
   **Вердикт: бандлинг ОК — next.config.ts не тронут** (research-ожидание подтвердилось,
   serverExternalPackages не нужен). Свидетельство: spike-standalone.md. Коммит 229e684.

## Key Files

### Created
- `lib/device-xlsx.ts` — pure XLSX-слой: модель колонок из кейстоуна CSV, tracer-ячейки, сборка книги, заголовки ответа
- `app/api/devices/export-xlsx/route.ts` — тонкий компоузер, зеркало CSV-цепочки нулевого дрейфа
- `.planning/phases/14-xlsx/spike-standalone.md` — свидетельство спайка + вердикт

### Modified
- `package.json` / `package-lock.json` — +write-excel-file@4.1.1 exact (единственная новая зависимость вехи)

## Commits
- 6027305 — chore(14-01): pin write-excel-file 4.1.1 exact (D-04)
- 46052dd — feat(14-01): tracer slice — device-xlsx lib + export-xlsx route (D-05/D-07/D-08)
- 229e684 — test(14-01): standalone spike — bundling OK, no serverExternalPackages (D-06/SC 5)

## Verification

- `npx tsc --noEmit` — 0 ошибок
- План-verify T2: `npx tsc --noEmit && grep -n "await requireSession()" … && grep -n "buildDeviceXlsx" …` — OK
- План-verify T3: `grep -q "PK" spike-standalone.md && grep -Eq "200" spike-standalone.md` — spike-evidence-ok
- Спайк-щупы: 307 без сессии / 200 + PK + XLSX MIME с сессией (см. spike-standalone.md)

## Self-Check: PASSED

## Deviations

- **Executor subagent stalled at 600s** после коммита T1 (успел дописать T2-файлы до стэлла, не
  закоммитил). Файлы верифицированы против плана (структура полная, tsc чист) и закоммичены
  оркестратором; T3 исполнен оркестратором инлайн по шагам плана. Содержательной девиации нет —
  известный рантайм-квирк GSD (прецедент фаз 12).
- Отклонений от CONTEXT.md D-01..D-08 нет.
