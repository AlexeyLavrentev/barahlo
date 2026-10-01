# Phase 14: XLSX-выгрузка ведомости - Context

**Gathered:** 2026-09-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Экспорт ведомости устройств (EXP-02): тот же файл, что CSV-ведомость EXP-01 — 20 колонок, тот же состав строк (паритет с текущими фильтрами; без фильтров = весь парк), те же поверхности — но в формате XLSX с типизированными ячейками, открывающийся в RU-Excel без «восстановить книгу». Библиотека `write-excel-file@4.1.1` (research, probe-verified). Никаких новых колонок, фильтров и поверхностей; CSV не трогаем и не убираем.

</domain>

<decisions>
## Implementation Decisions

### Оформление файла
- **D-01:** Минимал — ровно то, что уже зафиксировано в SC фазы: жирная шапка, закреплённая первая строка (freeze pane), ширины колонок по содержимому. Без границ, зебры и прочего украшательства. — **Reversibility:** reversible — локальные опции вызова библиотеки, один модуль.

### Типы ячеек
- **D-02:** Даты закупки и «Гарантия до» — настоящие Excel-даты (Date cells): Excel сам рисует дд.мм.гггг по локали, сортировка/фильтрация по дате в Excel работают нативно. ISO-текстовый форматтер `isoFileDate` (D-06 фазы 8) остаётся CSV-only — не переносится. Внимание: write-excel-file кидает на Date cell без `format` — формат отображения задать явно. — **Reversibility:** reversible — маппинг ячеек в одном pure-модуле.
- **D-03:** Числовые колонки — числа: RAM (ГБ), SSD (ГБ), Диагональ (REAL), Стоимость. Стоимость с форматом отображения «разделитель тысяч» (в ячейке 125000, выглядит «125 000»). Серийники/инвентарники — СТРОГО String cells (`type: String` + текстовый формат), никогда Number() — иначе scientific notation и потеря ведущих нулей (рецидив c4b2e2d в слое экспорта). — **Reversibility:** reversible.

### Унаследованные решения (research/roadmap, не переспрашивать)
- **D-04:** Библиотека `write-excel-file@4.1.1`, точный pin, server-only (импорт `write-excel-file/node`). exceljs/SheetJS отбракованы research (CVE/стагнация). Одна новая зависимость вехи.
- **D-05:** CSV-хаки в XLSX не переносятся: запятая-десятичная «21,5» (`diagonalCell`), ISO-текст-даты, BOM/«;»/esc() — CSV-format-specific. XLSX шарит МОДЕЛЬ колонок (метки из `deviceCsvHeader()` через keystone, словарь `WARRANTY_STATE_LABELS`), а не рендереры ячеек.
- **D-06:** Спайк standalone-Docker сборки (`next build` + standalone server + curl) — ПЕРВАЯ задача фазы: write-excel-file не в авто-external списке Next (в отличие от better-sqlite3/sharp); escape hatch — `serverExternalPackages`.
- **D-07:** Parity-цепочка CSV повторяется дословно: `requireSession()` первым стейтментом → `searchParamsRecord` → `parseDevicesSearchParams` → `toDeviceListFilters` → `exportDevices` → один `today = displayTodayUtc()` на запрос. Никакого второго парсера/сканирования.
- **D-08:** Поверхности: кнопка «Скачать XLSX» рядом с «Скачать CSV» в filter-bar; строка XLSX в ⌘K-палитре (нативный `<a href>`, как CSV-строка). RFC 5987 dual-filename + nosniff + no-store — новый xlsx-хелпер заголовков по образцу `csvResponseHeaders`.

### Claude's Discretion
- Имя листа (кандидат «Устройства» — однострочный probe при имплементации), лимит 31 символ.
- Имя файла: `устройства-ГГГГ-ММ-ДД.xlsx` + ASCII fallback `devices-YYYY-MM-DD.xlsx` (зеркало CSV).
- Пустой результат (0 строк): файл с шапкой без строк — как ведёт себя CSV.
- Заметки длиннее 32 767 символов (лимит ячейки XLSX): защитный slice.
- Автофильтр не эмулировать (в библиотеке нет, PR #19 не смёржжен) — пользователь жмёт «Данные → Фильтр» сам.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research вехи (решения и грабли)
- `.planning/research/STACK.md` — выбор write-excel-file@4.1.1, probe-свидетельства OOXML (freeze/styled/widths/typed/Cyrillic), световые пятна exceljs/SheetJS
- `.planning/research/PITFALLS.md` — инверсия CSV-хаков, cell-typing (String для номеров), Date-без-format throws, MIME/заголовки, спайк бандлинга, лимит ячейки 32767
- `.planning/research/ARCHITECTURE.md` — границы модулей (pure lib/device-xlsx.ts + thin route), форма Response из route handler, поверхности кнопок
- `.planning/research/SUMMARY.md` — консолидация

### Код-источники паритета
- `lib/device-csv.ts` — единственный источник 20 колонок: `deviceCsvHeader()` (метки), `CONFIG_EXPORT_KEYS` (порядок конфиг-блока), `WARRANTY_STATE_LABELS`, тип `DeviceExportRow` — импортировать, не дублировать (D-02 фазы 8)
- `app/api/devices/export/route.ts` — zero-drift цепочка CSV: точный образец для export-xlsx (комментарии WR-01/D-08)
- `lib/csv.ts` — `csvResponseHeaders` как образец хелпера заголовков (RFC 5987, nosniff, no-store); сам buildCsv для XLSX не используется
- `.planning/ROADMAP.md` §Phase 14 — 5 success criteria (гейт верификации)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `deviceCsvHeader()` / `keystoneLabel()` / `CONFIG_EXPORT_KEYS` — метки и порядок колонок XLSX выводятся из них (одна правка кейстоуна меняет форму, CSV и XLSX вместе)
- `WARRANTY_STATE_LABELS` + `warrantyState()` — статус гарантии в parity с цветом сайта
- `exportDevices()` — полный отфильтрованный скан без limit/offset
- `searchParamsRecord` / `parseDevicesSearchParams` / `toDeviceListFilters` — цепочка паритета фильтров (дублирование = WR-01-класс дрейфа)
- `displayTodayUtc()` — один today на запрос

### Established Patterns
- Pure lib-модуль + thin route composer: `buildDeviceXlsx` как async-обёртка над пиннутым vitest'ом `deviceXlsxSheetData` (роут не vitest-импортируем — прецедент lib/device-csv.ts)
- requireSession-first + hardcoded headers, ничего не эхо из инпута
- RFC 5987 dual filename, no-store, nosniff
- Кнопка — plain server-rendered `<a href>` (браузер сам даёт download UI; в палитре — `Autocomplete.Item` c `render={<a href>}`)

### Integration Points
- `app/(app)/devices/filter-bar.tsx` — соседняя ссылка рядом с «Скачать CSV»
- `components/command-palette.tsx` — соседняя строка XLSX после CSV-строки
- Новый роут `app/api/devices/export-xlsx/route.ts` рядом с существующим export

</code_context>

<specifics>
## Specific Ideas

Нет специфических референсов — файл «как CSV-ведомость, но Excel», решения выше.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 14-xlsx*
*Context gathered: 2026-09-29*
