---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Awaiting next milestone
stopped_at: Completed 06-02-PLAN.md (warranty block + Wave-0 fixtures + smoke-dashboard)
last_updated: "2026-09-14T10:41:41.121Z"
last_activity: 2026-09-14
last_activity_desc: Milestone v1.0 completed and archived
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 21
  completed_plans: 21
current_phase: 6
current_phase_name: Dashboard
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-31)

**Core value:** Мгновенный точный ответ: где конкретная единица техники, кто ею пользуется и какая конфигурация — за секунды, поиском или фильтром.
**Current focus:** Planning next milestone

## Current Position

Phase: Milestone v1.0 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-09-14 — Milestone v1.0 completed and archived

## Performance Metrics

**Velocity:**

- Total plans completed: 21
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | - | - |
| 02 | 3 | - | - |
| 03 | 2 | - | - |
| 04 | 3 | - | - |
| 5 | 6 | - | - |
| 6 | 2 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 23 min | 3 tasks | 30 files |
| Phase 01 P02 | 8 min | 2 tasks | 5 files |
| Phase 01 P04 | 12 min | 2 tasks | 6 files |
| Phase 01 P05 | 14min | 2 tasks | 1 files |
| Phase 02 P01 | 25 min | 2 tasks | 22 files |
| Phase 02 P02 | 14 min | 3 tasks | 5 files |
| Phase 02 P03 | 14 min | 3 tasks | 6 files |
| Phase 05 P01 | 17 min | 2 tasks | 10 files |
| Phase 05 P02 | 21 min | 3 tasks | 11 files |
| Phase 5 P03 | 15 min | 2 tasks | 8 files |
| Phase 05 P05 | 11min | 2 tasks | 2 files |
| Phase 05 P04 | 13 min | 2 tasks | 5 files |
| Phase 05 P06 | 12 min | 2 tasks | 3 files |
| Phase 06 P01 | 21min | 1 tasks | 5 files |
| Phase 6 P2 | 19min | 3 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Фото (REG-05) слиты в Фазу 4 (Custody) — одиночное требование, зависят только от реестра устройств; объявленная линия отреза при сдвиге сроков
- [Roadmap]: REG-04 (статус) и EMP-02 (выданная техника) доставляются в Фазе 4 — состояние меняется только действиями; в Фазах 2–3 строятся экраны-заготовки
- [Roadmap]: UI-01/UI-02 заякорены в Фазе 2 (первые полноценные экраны = дизайн-система), UI-03 проверяется в Фазе 5
- [Research]: append-only `movements` и нормализованные номера обязаны быть в первой миграции (Фаза 1); `device_schema.ts` — keystone-модуль Фазы 3
- [Phase ?]: Фаза 1/План 1: миграция только generate+migrate; плоский SQL-файл миграции SQLite; триггеры append-only добавлены вручную в 0000
- [Phase ?]: Фаза 1/План 1: matcher proxy исключает только ассеты, публичность /login — точным сравнением в обработчике; api и соседние пути за периметром
- [Phase ?]: Фаза 1/План 2: нормализация номеров живёт в lib/normalize.mjs (ESM, общий для скриптов и приложения); lib/normalize.ts — типизированный ре-экспорт; именованные обёртки normalizeSerial/normalizeInventory — задел для усиления правил в фазах 3/5
- [Phase ?]: Фаза 1/План 2: seed — детерминированный mulberry32(20260831) вместо faker (не прошёл legitimacy-гейт); двойной guard: NODE_ENV=production и непустая база → exit 1 (D-11)
- [Phase ?]: Фаза 1/План 2: reset-admin проверяет sqlite_master ДО промпта — пустая база даёт вежливый отказ «запустите create-admin» без стека; readline-паттерн create-admin (один line-listener) переиспользован
- [Phase ?]: Фаза 1/План 4: официальный with-docker базис + 4 расширения для better-sqlite3 (build-tools в deps; better-sqlite3+bcryptjs в runner; /app/data chown node uid 1000; scripts/ в образе); USER node вместо useradd nextjs
- [Phase ?]: Фаза 1/План 4: deploy.sh пинит DATABASE_PATH=./data/app.db для host-side migrate — drizzle-kit подхватывает .env, прод-.env указывает внутрь контейнера; crontab -l захватывается вне пайплайна (exit 1 на пустом crontab под pipefail)
- [Phase ?]: Фаза 1/План 4: cron ночного бэкапа — вариант docker compose exec (внутри контейнера), deploy.sh ставит идемпотентно; README cron-раздел синхронизирован
- [Phase ?]: Фаза 1/План 5: канонический remote перенесён с корпоративного GitLab (D-15) в приватный GitHub (github.com/AlexeyLavrentev/barahlo) — решение владельца 2026-09-01; приватность сохранена, README синхронизирован; серверные шаги приёмки (2)-(8) делегированы оператору на end-of-phase
- [Phase ?]: Фаза 2/План 1: shadcn init v4.19.1 требует именованный пресет при -b base — взят nova, все токены перекрыты UI-SPEC в globals.css (light-only сохранён)
- [Phase ?]: Фаза 2/План 1: нативный Base UI combobox подтверждён (--dry-run), фолбэк popover+command не понадобился; семантика shadcn (--primary/--ring/--accent) ретаргетнута на #0071E3
- [Phase ?]: Фаза 2/План 2: карточка /employees/[id] — валидация id zod'ом до any-SQL (мусор → notFound, не 500); detail-паттерн для фаз 3–6
- [Phase ?]: Фаза 2/План 2: edit-режим одним компонентом (employee?-проп, hidden id, updateEmployeeAction); unarchive — прямой form POST через inline server action (Promise<void>), без подтверждения
- [Phase ?]: Фаза 2/План 2: подтверждение архивации — дословный копи UI-SPEC, primary нейтральный bg-ink (не красный — архив обратим); TDD RED для UI-острова выражен smoke-ассертом data-employee-id (компонентного раннера в репо нет)
- [Phase ?]: Фаза 2/План 3: сегментный loading.tsx в этой версии Next стримит поддерево с дочерними сегментами и флешит 200 до notFound() — карточка /employees/[id] вынесена в route group (card), 404-матрица восстановлена; [id]-loading сознательно не создаётся
- [Phase ?]: Фаза 2/План 3: combobox отдела только записывает имя в hidden departmentName — создание делает серверный resolveDepartmentId в транзакции (гонка UNIQUE переиспользует существующий); закрепление «Создать „X“» байт-точное, как departments_name_uq
- [Phase ?]: Фаза 5/План 1: свёртка поиска = write-side normalizeNumber через norm() UDF в openDb (deterministic); LIKE-паттерны экранированы (ESCAPE '\'), q обрезан до 100 символов на сервере
- [Phase ?]: Фаза 5/План 1: query-params.ts — единственный парсер/билдер URL-фильтров /devices (D-08 связка ram/type живёт в билдере); db-слой получает undefined-for-inactive (сентинелы 'all'/null/false/'' стрипятся на странице)
- [Phase ?]: Фаза 5/План 1: живой поиск — controlled input вне <form> (React 19 reset), 300 мс дебаунс → router.replace(scroll:false) в startTransition; Enter коммитит сразу; value===q guard против гонки со «Сбросить фильтры»
- [Phase ?]: Фаза 5/План 2: единая инклюзивная граница гарантии WARRANTY_WARN_DAYS=60 — один константа для фильтра «≤ 60 дней» и будущей подсветки (попадание фильтра никогда не зелёное); displayTodayUtc — CR-01 рецепт (en-CA parts → Date.UTC)
- [Phase ?]: Фаза 5/План 2: D-07 предикат точно (type=laptop) AND (ram_upgraded IS NULL OR != 1) — self-limiting на сервере, враждебные URL инертны (T-05-06); count-запрос несёт тот же leftJoin employees, что и rows (общий where, Pitfall 5)
- [Phase ?]: Фаза 5/План 3: один WarrantyDate + один warrantyState (инклюзивная граница WARRANTY_WARN_DAYS=60) на все три места подсветки гарантии (строка реестра, карточка устройства, выданное у сотрудника) — попадание фильтра никогда не зелёное; токены #248A3D/#FF9500, «истекла» переиспользует #D70015 (один красный, D-17)
- [Phase ?]: Фаза 5/План 3: movement-schema датные тесты переведены на DISPLAY_TZ wall clock (c9c87bc) — host-local геттеры ломались на UTC+5 хосте каждые 00:00–02:00 локального времени (CR-01 класс в тестовой инфраструктуре)
- [Phase ?]: Фаза 5/План 5: UI-03 стал автоматическим трипваером — полный комбинированный фильтр (q+тип+статус+отдел+гарантия+RAM) на 600 строк в среднем 0.757 мс за 200 прогонов при щедром потолке 200 мс (A6); честность тайминга якорится raw SQL count по ТОЙ ЖЕ where-композиции + постраничный обход = total
- [Phase ?]: Фаза 5/План 5: seed масштабирован до 400 устройств (200/80/50/70), единственный нудж — ~5% NULL-гарантии («без гарантии», edge 9); все 4 состояния верифицированы live (175/20/180/25), mulberry32-детерминизм и двойной guard подтверждены; dev-база держит 80 устройств до ручного reseed в end-of-phase
- [Phase ?]: Фаза 5/План 4: CSV-экспорт — один парсер (parseDevicesSearchParams) и один предикат (deviceWhere, факторизован из listDevices) на страницу и выгрузку; exportDevices = полный отфильтрованный скан без limit/offset, дрейф не представим
- [Phase ?]: Фаза 5/План 4: CSV-письменник хенд-ролл в lib/csv.ts (запрет зависимостей T-05-SC): esc() с TAB-префикс-гвардом CWE-1236 (все ячейки проходят), BOM + «;» + CRLF, csvResponseHeaders — pure-хелпер с RFC 5987 двойным именем, nosniff, no-store
- [Phase ?]: Фаза 5/План 6: G-5-1 фикс — реконсиляция с локальным приоритетом: adopt q только при value === lastSynced.current; lastSynced штампуется в момент пуша (не при взводе); inFlight-реф (cap 4) абсорбирует собственные эхо (точное/trim-совпадение); commitNow регистрирует пуш так же; инвариант: return с value !== q без таймера запрещён
- [Phase ?]: Фаза 6/План 1: тайлы-ссылки = '/devices' + buildDevicesQuery(full DeviceFilters) — билдер отдаёт относительный query-string (?type=laptop), страница префиксует путь; query-string руками не собирается никогда (D-03/D-08)
- [Phase ?]: Фаза 6/План 1: агрегаты дашборда живут рядом с deviceWhere/warrantyPredicate (co-location = D-04); GROUP BY-тишина закрывается zero-default итерацией DEVICE_TYPES/DEVICE_STATUS_KEYS с Map.get ?? 0; лента — один 3-way join с id сотрудников в SELECT и tiebreaker desc(occurredAt)+desc(id)
- [Phase ?]: Фаза 6/План 1: роутная таблица ленты — один routeSegments() ({text, href}); из него и рендер, и title; timeline.tsx names-as-text остаётся анти-аналогом (D-05)
- [Phase ?]: Фаза 6/План 2: гарантийные счётчики и топ-5 составлены из тех же типизированных операторов, что warrantyPredicate (тот же модуль, один today на рендер); parity-тесты прикалывают счётчик к total listDevices — дрейф громко красный (D-04)
- [Phase ?]: Фаза 6/План 2: подписи счётчиков рендерятся одним шаблонным литералом (один текст-узел) — smoke-иглы непрерывны сквозь SSR-сплит; smoke-dashboard на :3119 сеет ноль устройств — Pitfall 8 стал ассертом

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: выбрать механизм сессии (исследование рекомендует jose signed cookie, не NextAuth)
- [Phase 3]: подтвердить с пользователем семантику флага `ram_upgraded` (явный булев флаг vs сравнение с базовой RAM) — ЗАКРЫТ контекстом фазы 5 (D-06: явный флаг ramUpgraded)
- ~~[Phase 5]: собрать typing-test фикстуру гомоглифов (С↔C, О↔O…)~~ — ЗАКРЫТ 05-01: tests/homoglyphs-fixture.ts (11 пар, обе стороны + completeness guard)

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v2 | V2-01..V2-07 (saved filters, ⌘K, clone, QR, bulk actions, акт приёма-передачи, warranty tile) | Tracked in REQUIREMENTS.md v2 | 2026-08-31 |

## Session Continuity

Last session: 2026-09-14T07:34:59.151Z
Stopped at: Completed 06-02-PLAN.md (warranty block + Wave-0 fixtures + smoke-dashboard)
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
