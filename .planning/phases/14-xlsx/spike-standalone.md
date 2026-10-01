# Спайк standalone-сборки (D-06, SC 5) — план 14-01, Task 3

**Дата:** 2026-10-01
**Вопрос:** попадает ли `write-excel-file@4.1.1` в standalone-бандл Next 16.3.3 (`output: "standalone"`) без `serverExternalPackages`?

## Процедура и результаты

| Шаг | Команда | Результат |
|-----|---------|-----------|
| 1. Сборка | `npm run build` | exit 0; `/api/devices/export-xlsx` присутствует в манифесте (ƒ Dynamic) |
| 2. Копия БД | `better-sqlite3().backup('/tmp/xlsx-spike/app.db')` от `DATABASE_PATH=./data/app.db` | ok (консистентный снапшот, не cp живых файлов) |
| 3. Сервер | `PORT=3120 AUTH_SECRET=<из .env> DATABASE_PATH=/tmp/xlsx-spike/app.db node .next/standalone/server.js` | Ready; standalone .env не подхватывает — переменные переданы явно |
| 4. Без сессии | `curl -s -o /dev/null -w '%{http_code}' http://localhost:3120/api/devices/export-xlsx` | **307** (redirect на /login от периметра) — не 5xx, не 200 ✓ |
| 5. С сессией | HS256-cookie (`SignJWT { userId: 1 }`, secret из .env, форма lib/session.ts) → `curl -D headers.txt -o out.xlsx` | **200 OK** ✓ |

## Заголовки авторизованного ответа (фактические)

```
HTTP/1.1 200 OK
cache-control: no-store
content-disposition: attachment; filename="devices-2026-10-01.xlsx"; filename*=UTF-8''%D1%83%D1%81%D1%82%D1%80%D0%BE%D0%B9%D1%81%D1%82%D0%B2%D0%B0-2026-10-01.xlsx
content-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
x-content-type-options: nosniff
```

## Файл

- Размер: **37 090 байт** (заметно больше килобайта)
- Первые байты: `504b` = **"PK"** (валидный ZIP/OOXML) ✓
- Структура: `[Content_Types].xml`, `xl/workbook.xml`, `xl/worksheets/sheet1.xml` (188 924 байта распакованных), `xl/sharedStrings.xml`, `xl/styles.xml` — полная книга

## ВЕРДИКТ

**Бандлинг ОК — `next.config.ts` НЕ трогаем.** write-excel-file (pure JS + fflate) собирается в
standalone-бандл штатно: маршрут загрузился (307 без сессии = модуль импортировался и requireSession
отработал), авторизованный ответ отдал валидную книгу. Escape hatch `serverExternalPackages`
не нужен — research-ожидание подтвердилось, осознанного долга нет.

## Гигиена

Сервер погашен (порт 3120 закрыт), `/tmp/xlsx-spike` удалён — свидетельство живёт в этом файле.
Секреты в файл не попали: AUTH_SECRET читался из .env в переменную, в лог не печатался.
