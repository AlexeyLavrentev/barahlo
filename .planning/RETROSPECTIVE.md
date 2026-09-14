# Retrospective — Barahlo

## Milestone: v1.0 — MVP «учёт корпоративной техники»

**Shipped:** 2026-09-14
**Phases:** 6 | **Plans:** 21 (+2 gap-closure/review-fix sub-runs) | **Tests:** 295/19 файлов

### What Was Built

- Каркас: Next.js 16 (proxy default-deny, Server Actions) + better-sqlite3/Drizzle (generate+migrate only) + Docker standalone; ночная бэкап-рутина с отрепетированным восстановлением
- Справочник сотрудников (архив вместо удаления) и реестр устройств на keystone `device_schema` (поля на тип, нормализованные UNIQUE-номера)
- Транзакционное ядро: выдача/возврат/передача/ремонт/списание — guard-UPDATE + append-only movement в одной транзакции; таймлайн; фото (sharp, EXIF-strip, авторизованная раздача)
- Поиск: живой (~300 мс debounce, URL-driven), norm()-UDF свёртка — кириллические гомоглифы «С123» находят «C123»; фильтры тип/статус/отдел/гарантия/RAM комбинируются в одном where; CSV-экспорт (BOM/«;», CWE-1236 guard)
- Дашборд на `/`: тайлы-счётчики с parity-инвариантом (счётчик == список), гарантийный блок с deep-link, лента движений; UI-03 доказан тестом — 0.76 мс @ 600 строк

### What Worked

- **Фазовая дисциплина GSD**: каждый слой (схема → справочники → ядро → поиск → сводка) строился на замороженном фундаменте — ноль миграций после фазы 1
- **Трёхступенчатое качество**: plan-checker → code review → verifier ловили реальные баги до человека (CR-01 TZ, CR-01 search-box, WR-01 predicate composition)
- **UAT человеком** — два бага поиска (G-5-1 keystroke loss, G-5-2 съеденный пробел) нашёл только живой ввод на реальном билде
- **Playwright MCP как инструмент оркестратора** — браузерные баги верифицировались без гонок «пересобери и проверь»

### What Was Inefficient

- AskUserQuestion флакал (пустые ответы) — текстовые нумерованные списки надёжнее в этом окружении
- /tmp-тестовые базы чистятся системой — перерыв в 9 дней убил окружение и дал ложный «та же беда» на старом билде
- Ручной redo на стейле окружения стоил круга диагностики — первым вопросом всегда «какой билд тестируешь»

### Patterns Established

- normalizeNumber — единственный источник свёртки: запись И поиск (UDF norm())
- warrantyPredicate — композиция, не копия: счётчики/фильтры/цвет из одной функции (injectable today)
- query-params.ts — один парсер/билдер для страницы, островов и CSV-роута
- DISPLAY_TZ (Europe/Moscow) через lib/ru.ts во всех «сегодня»
- Segmented links для многоцелевых строк (без вложенных анкеров)

### Key Lessons

- `ram != 1` в SQL молча роняет NULL — NULL-safe формы только `IS NULL OR !=`
- Raw sql`` в drizzle не биндит Date — пределы считаем N маленькими count'ами из общих предикатов
- Fire-and-forget fs/promises в критическом контракте = флакующие тесты и потерянные удаления (bbffb92: sync unlink)
- Минификация убивает grep по бандлу — свежесть проверять BUILD_ID, не идентификаторы

### Cost Observations

- ~240 коммитов за 14 дней (2026-08-31 → 2026-09-14)
- Субагенты: researcher/planner/executor/checker/reviewer/verifier — тяжелейшие проходы 1–3.8М токенов; стабильные победы — ранняя поимка TZ-гонки, NULL-RAM, search-box reconciliation

## Cross-Milestone Trends

| Milestone | Phases | UAT issues → fixes | Security | Note |
|-----------|--------|--------------------|----------|------|
| v1.0 | 6 | 30/30 pass после 7 фиксов (picker, TZ, 2×search-box, attachments flake, RAM NULL, 404-матрица) | 63 threats, 0 open | Первый milestone |
