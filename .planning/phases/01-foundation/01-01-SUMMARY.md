---
phase: 01
plan: 01
subsystem: foundation
tags: [auth, sqlite, schema, perimeter, nextjs, walking-skeleton]
requires: []
provides:
  - "Полная схема SQLite v1 (7 таблиц) первой миграцией 0000 с append-only триггерами и нормализованными UNIQUE-номерами"
  - "jose-сессия (30 дней, HttpOnly, SameSite=Lax, без Secure) — createSession/verifySession/destroySession/SESSION_COOKIE"
  - "Fixed-window rate-limit 5/15мин — checkRateLimit/recordFailure/resetFailures"
  - "requireSession() — второй слой обороны для страниц/действий/роутов"
  - "default-deny периметр proxy.ts (публичен только точный /login)"
  - "CLI scripts/create-admin.mjs — единственный способ создать учётку"
  - "Тестовый гарнитур vitest (23 теста) + README quickstart и чек-лист периметра"
affects: [01-02, 01-03, 01-04, 01-05, phases 2-6]
tech-stack:
  added:
    - "next 16.3.3 (App Router, proxy.ts, standalone)"
    - "better-sqlite3 13.0.3 + drizzle-orm 0.45.2 + drizzle-kit 0.31.10"
    - "jose 6.2.10, bcryptjs 3, zod 4, server-only"
    - "vitest 4.1.11"
  patterns:
    - "Server Action как единственный мутационный вход (zod → rate-limit → DB → bcrypt)"
    - "Единая точка подключения к БД с прагмами WAL/foreign_keys/busy_timeout"
    - "Defense-in-depth: proxy-периметр + requireSession в каждом entry-point"
key-files:
  created:
    - proxy.ts
    - db/schema.ts
    - db/index.ts
    - drizzle.config.ts
    - drizzle/0000_amusing_talon.sql
    - scripts/create-admin.mjs
    - lib/session.ts
    - lib/rate-limit.ts
    - lib/auth.ts
    - app/login/page.tsx
    - app/login/login-form.tsx
    - app/login/actions.ts
    - "app/(app)/page.tsx"
    - "app/(app)/actions.ts"
    - app/api/health/route.ts
    - vitest.config.ts
    - tests/helpers.ts
    - tests/stubs/server-only.ts
    - tests/schema.test.ts
    - tests/session.test.ts
    - tests/rate-limit.test.ts
    - tests/proxy-matcher.test.ts
    - .env.example
    - README.md
  modified:
    - next.config.ts
    - app/layout.tsx
    - .gitignore
decisions:
  - "generate+migrate (не push) — drizzle-kit push запрещён на SQLite (issue #6060); частичный WHERE-индекс сгенерировался корректно, ручной правки не потребовалось"
  - "Миграция — плоский файл drizzle/0000_amusing_talon.sql (sqlite-конвенция drizzle-kit), не папка 0000_*/migration.sql"
  - "Сессия: next/headers импортируется лениво внутри createSession/destroySession — модуль тестируем в vitest без запросного scope"
  - "Rate-limit — массив таймстампов + именованные константы MAX_FAILURES=5 / WINDOW_MS=15мин; сброс при рестарте задокументирован (D-03, T-01-07)"
  - "Matcher исключает только ассеты (_next/static, _next/image, favicon.ico); публичность /login решает обработчик точным сравнением"
metrics:
  duration: "23 min"
  completed: 2026-08-31
  tasks: 3
  files: 30
status: complete
---

# Phase 01 Plan 01: Walking Skeleton — фундамент Summary

Каркас Next.js 16 + полная схема SQLite v1 первой миграцией (7 таблиц, append-only триггеры, нормализованные UNIQUE) + CLI-аккаунт + вход с rate-limit + jose-сессия на 30 дней + default-deny периметр proxy.ts — весь срез доказан тестами (23 зелёных) и curl-матрицей (307/307/307/200/200).

## What Was Built

- **Задача 1 (tracer):** скаффолд create-next-app перенесён в корень репо (output: standalone, lang=ru); `db/schema.ts` — 7 таблиц с FK ON DELETE RESTRICT, CHECK `devices_status_ck`, UNIQUE на `serial_normalized`/`inventory_normalized`, частичный индекс по `warranty_until`; миграция 0000 дополнена вручную триггерами `movements_no_update`/`movements_no_delete` (RAISE ABORT) и 4 seed-строками `device_types`; применена к `./data/app.db` (`npx drizzle-kit migrate`, exit 0); `scripts/create-admin.mjs` создаёт единственного пользователя (bcrypt cost 12), повторный запуск отказывает; 8 интеграционных schema-тестов.
- **Задача 2 (TDD):** RED `0e1f485` → GREEN `064a8d7`. `lib/session.ts` (HS256, 30 дней, HttpOnly, sameSite=lax, path=/, без Secure — D-01/D-04; verifySession никогда не бросает), `lib/rate-limit.ts` (5 неудач / 15 мин в памяти процесса), `lib/auth.ts` (`requireSession()` через React cache), `app/login/` — русская форма на useActionState с фиксированным порядком проверок (zod → rate-limit ДО БД/bcrypt → select → compare, generic-ошибка без утечки существования логина). 8 unit-тестов.
- **Задача 3:** `proxy.ts` — default-deny, matcher исключает только ассеты, публичность `/login` — точным сравнением (соседние `/login-fake`, `/login/step` остаются за периметром); защищённый `app/(app)/page.tsx` с `requireSession()` и выходом; `app/api/health` за авторизацией; `tests/proxy-matcher.test.ts` (7 ассертов через `unstable_doesMiddlewareMatch` — A10-адаптация); README-раздел «Проверка периметра». Сквозная curl-матрица на prod-сборке: root 307 / health 307 / login-fake 307 / login 200 / root+cookie 200 (+ health+cookie 200).

## TDD Gate Compliance

- `test(01-01)` RED-коммит `0e1f485` предшествует `feat(01-01)` GREEN `064a8d7` — ворота соблюдены.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] drizzle-kit migrate падал молча: 4 INSERT в одном statement-сегменте**
- **Found during:** Task 1 ([BLOCKING] schema push)
- **Issue:** drizzle-мигратор исполняет каждый сегмент между `--> statement-breakpoint` как один prepared statement; блок из 4 INSERT-ов в одном сегменте ронял migrate с exit 1 без сообщения (журнал оставался пустым).
- **Fix:** `--> statement-breakpoint` между INSERT-ами в `drizzle/0000_amusing_talon.sql` (до первого применения; journal не тронут).
- **Files modified:** drizzle/0000_amusing_talon.sql
- **Commit:** bf4e812

**2. [Rule 1 - Bug] tests/helpers.ts ожидал папочную миграцию drizzle/0000_*/migration.sql**
- **Found during:** Task 1
- **Issue:** drizzle-kit на SQLite генерирует плоский файл `drizzle/0000_amusing_talon.sql`; helper падал с ENOTDIR.
- **Fix:** applyMigrations поддерживает оба расклада (плоские *.sql и папки с migration.sql); заодно insertDevice проставляет created_at/updated_at ($defaultFn — ORM-уровень, не DB-default).
- **Files modified:** tests/helpers.ts
- **Commit:** bf4e812

**3. [Rule 1 - Bug] scripts/create-admin.mjs терял вторую строку при пайп-вводе**
- **Found during:** Task 1 (verify: `printf 'admin\n…\n' | node …`)
- **Issue:** последовательные `rl.question()` (readline/promises) на пайп-stdin теряют буферизованную строку — пароль не читался (exit 13, unsettled await).
- **Fix:** один слушатель 'line' с очередью (buffered/waiting) + собственные промпты «Логин:»/«Пароль:»; работает и в интерактиве, и в пайпе.
- **Files modified:** scripts/create-admin.mjs
- **Commit:** bf4e812

**4. [A10-адаптация] unstable_doesProxyMatch не существует в next 16.3.3**
- **Found during:** Task 3
- **Issue:** в установленной версии экспортирован прежний `unstable_doesMiddlewareMatch` (тот же матчер-эвалюатор), сигнатура `{ config: { matcher }, url }`.
- **Fix:** тест использует его вместо curl-фолбэка — те же 7 утверждений сохранены на unit-уровне; curl-матрица дополнительно доказана на живом prod-сервере.
- **Files modified:** tests/proxy-matcher.test.ts
- **Commit:** bedbe9d

### Minor path deviation
- Акцептанс-глоб `drizzle/0000_*/migration.sql` заменён фактическим путём `drizzle/0000_amusing_talon.sql` (плоский файл — sqlite-конвенция drizzle-kit 0.31); `grep -c "movements_no_update"` = 1. README quickstart дополнен `mkdir -p data` (better-sqlite3 не создаёт родительские каталоги).

## Verification Results

- `npx drizzle-kit migrate` → exit 0; в живой БД 7 таблиц, 2 триггера, 4 device_types, users=1
- `npx vitest run` → **23/23 зелёные** (schema 8, session 4, rate-limit 4, proxy-matcher 7)
- `npm run build` → зелёный (Turbopack, standalone, Proxy зарегистрирован)
- curl-матрица на `npm start`: root-no-cookie 307, health-no-cookie 307, login-fake 307, login 200, root+cookie 200, health+cookie 200 — все ассертированы
- Запреты: proxy.ts без слова "middleware" и без export runtime; matcher не исключает api/login; `secure:` отсутствует в lib/session.ts; checkRateLimit текстуально выше db.select

## Known Stubs

Нет. Экран `app/(app)/page.tsx` («Экраны появятся в фазах 2–6») — не стаб, а запланированная граница фазы (01-CONTEXT, ROADMAP Open Question 5): данные в этом плане не предусматривались.

## Authentication Gates

Не встречались.

## Deferred Issues

- `.planning/research/.cache/*` и `.planning/phases/01-foundation/01-PATTERNS.md` остались незафиксированными (артефакты планировщика вне скоупа плана) — поднять в финальном коммите фазы.
- Ручная браузерная проверка входа (вход → каркас → сессия переживает перезапуск браузера) — на приёмке фазы (`human_verify_mode: end-of-phase`).

## Self-Check: PASSED

- Файлы: proxy.ts, db/schema.ts, db/index.ts, lib/session.ts, lib/rate-limit.ts, lib/auth.ts, scripts/create-admin.mjs, tests/*, drizzle/0000_amusing_talon.sql — FOUND
- Коммиты: bf4e812, 0e1f485, 064a8d7, bedbe9d — FOUND в git log
