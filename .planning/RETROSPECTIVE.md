# Retrospective — Barahlo

## Milestone: v1.1 — «Скорость и удобство»

**Shipped:** 2026-09-18
**Phases:** 5 | **Plans:** 7 | **Tests:** 425/22 файлов (стартовали с 341)

### What Was Built

- Live-поиск сотрудников (?q= URL-driven, Ё/ё-фолд на Latin E через гомоглиф-карту) + общий debounce-хук useDebouncedSearchQuery — консюмеры: оба списка и ⌘K
- CSV-ведомость полного контекста: 20 колонок, конфиг-блок с деривацией меток из кейстоуна, статус гарантии в parity с сайтом, ISO-даты, запятая-десятичная для RU-Excel
- Клон устройства: 1..100 копий одной транзакцией, NULL-серийник (миграция 0001 через host-side runner — голый drizzle-kit migrate молча падает на заполненной базе), инкремент инвентарника с safe-integer гвардом
- Bulk-выдача/приём: чекбоксы страницы + плавающая панель, всё-или-ничего с in-tx превалидацией (union blockers), N событий с общим occurredAt
- ⌘K-палитра: GET /api/search поверх предикатов фаз 5/7, Base UI Dialog+Autocomplete (официальный рецепт), event.code-хоткей, оба долга WR-01 вехи закрыты с регрессионными тестами

### What Worked

- **Один run на фазу** (discuss→research→plan→execute→review→verify→UAT→security→transition): 4 фазы за 3 дня, ноль потерянного контекста между стадиями
- **Research-probe'ы ловили прод-мины до кода**: drizzle-kit migrate молча падает на заполненной базе (FK в BEGIN) — runner-рецепт родился в research, а не в деплой-ночи; Base UI рецепт палитры снял весь вопрос «как писать клавиатуру»
- **UAT оркестратором через Playwright MCP** — 10/10, 8/8, 10/10 за три фазы; оператор только sign-off'ил
- **Text-нумерованные списки вместо AskUserQuestion** — ноль зависаний за веху (в v1.0 флакало дважды)

### What Was Inefficient

- Planner/verifier 600s-стаблы (2 раза) — ретрай выручал, но съедал 10 минут на попытку
- Playwright run_code_unsafe с `networkidle`-ожиданиями и 30-секундным потолком MCP — три таймаута на фазу; лекарство: короткие вызовы + poll-циклы, сабмит-кнопки палитры звать по refs
- Локатор «thead» для tri-state шапки — список не в table; читать DOM снапшотом ДО написания селекторов

### Patterns Established

- Host-side migration runner (scripts/migrate.mjs): PRAGMA foreign_keys=OFF ДО BEGIN — единственный рычаг на better-sqlite3 13
- keystoneLabel: CSV/формы деривируют метки из одного кейстоуна — ноль параллельных словарей
- Числа в CSV: dot-decimal читается RU-Excel'ом как дата — запятая-десятичная по умолчанию для дробных
- In-tx SELECT-превалидация возвращает union {ok:false, blockers}, throw резервируется гонкам/in-batch дубликатам
- Диалоговая механика WR-01 split (wrapper open-state + useActionState inner) — третья фаза подряд без нареканий

### Key Lessons

- Nullable-колонка с обычным UNIQUE УЖЕ допускает множественные NULL — «проблема NULL-pair» была ложной; probe прежде миграции
- Хвост числа > 2^53 в строковом инкременте = самоколлизия или scientific-notation — Number.isSafeInteger гвард обязателен (WR-01, c4b2e2d)
- Улучшение UX раскладки-независимости: матчить event.code, не key — иначе хоткей мёртв на ЙЦУКЕН

### Cost Observations

- 118 коммитов за 4 дня (2026-09-15 → 2026-09-18); 256 файлов, +18.1k/−19.2k
- Тяжелейший проход: executor фазы 10 — 16.5М токенов/88 вызовов; researcher фазы 9 — 3.8М с probe-батареей
- UAT-гейты в планах (checkpoint:human-verify) — оператор тратит минуты, не часы

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
| v1.1 | 5 | 27/27 pass (10+8+10, включая UAT-пойманные гонки G-7-1; 1 code-review WR-01 фикс до UAT) | 27 threats, 0 open | Один run на фазу; 2 миграции ноль (runner), 1 миграция через runner |
