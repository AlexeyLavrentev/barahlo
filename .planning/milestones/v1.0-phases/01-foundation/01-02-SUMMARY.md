---
phase: 01
plan: 02
subsystem: foundation
tags: [cli, seed, normalization, sqlite, dev-experience]
requires: ["01-01 (схема devices/employees/movements/users, миграция 0000, паттерн scripts/*.mjs с прагмами)"]
provides:
  - "normalizeNumber/normalizeSerial/normalizeInventory — единый источник нормализации номеров (lib/normalize.mjs + типизированный ре-экспорт lib/normalize.ts)"
  - "CLI scripts/reset-admin.mjs — восстановление пароля единственного аккаунта (D-02)"
  - "CLI scripts/seed.mjs — реалистичные dev-фикстуры: 5 отделов, 40 сотрудников, 80 устройств, движения received/assigned (D-11)"
  - "tests/normalize.test.ts — 6 unit-кейсов регистра/пробелов/11 гомоглифов (задел FIND-04 фазы 5)"
affects: ["01-03", "01-04", "01-05", "phases 2-6 (все записи номеров идут через normalize*)"]
tech-stack:
  added: []
  patterns:
    - "Нормализация на записи: serial_normalized/inventory_normalized всегда через lib/normalize.mjs (D-17)"
    - "CLI-скрипты: только better-sqlite3 (+bcryptjs где нужен хеш), три прагмы, ошибки → stderr + ненулевой exit"
    - "Детерминированный PRNG (mulberry32, фиксированный сид) вместо faker для воспроизводимых фикстур"
key-files:
  created:
    - lib/normalize.mjs
    - lib/normalize.ts
    - tests/normalize.test.ts
    - scripts/reset-admin.mjs
    - scripts/seed.mjs
  modified: []
decisions:
  - "Нормализация — обычный ESM (.mjs), чтобы скрипты и приложение импортировали один модуль без сборки; normalize.ts — тонкий типизированный ре-экспорт"
  - "Именованные обёртки normalizeSerial/normalizeInventory — синонимы сегодня; фазы 3/5 усиливают правила по-колоночно без смены вызовов"
  - "reset-admin: guard sqlite_master ДО readline-промпта — пустая база даёт вежливый отказ без стека; readline-паттерн create-admin (один line-listener с буфером) переиспользован"
  - "seed: детерминированный mulberry32(20260831) — @faker-js/faker не добавлялся (не прошёл legitimacy-гейт); серийники SN-XXXXNN уникальны по построению, инвентарники ИБ-0000NNN с ~20% NULL (D-16)"
  - "Движения seed-а в одной транзакции: received у каждого, assigned (+UPDATE projection) у ~62% выданных — append-only триггеры действуют и на seed"
metrics:
  duration: "8 min"
  completed: 2026-08-31
  tasks: 2
  files: 5
status: complete
---

# Phase 01 Plan 02: CLI-утилиты и нормализация — Summary

Единый модуль нормализации номеров (11 кириллических гомоглифов, пробелы, регистр) с типизированным ре-экспортом и 6 зелёными тестами, CLI сброса пароля с bcrypt cost 12 и вежливым отказом на пустой базе, детерминированный seed на 80 устройств / 40 сотрудников / 130 движений с двойным guard-ом (production, непустая база).

## What Was Built

- **Задача 1:** `lib/normalize.mjs` — единственный источник нормализации: trim → схлопывание пробелов → верхний регистр → замена 11 гомоглифов (А→A, В→B, С→C, Е→E, Н→H, К→K, М→M, О→O, Р→P, Т→T, Х→X); именованные обёртки `normalizeSerial`/`normalizeInventory` — задел для по-колоночных правил фаз 3/5. `lib/normalize.ts` — типизированный ре-экспорт `(input: string) => string` для кода приложения. `tests/normalize.test.ts` — 6 кейсов через ре-экспорт (проверяет и проводку, и логику). `scripts/reset-admin.mjs` (D-02) — readline-промпт «Новый пароль:» (минимум 8 символов, bcrypt cost 12), guard `sqlite_master` ДО промпта, `UPDATE users SET password_hash = ? WHERE id = 1`; пароль нигде не печатается (grep = 0).
- **Задача 2:** `scripts/seed.mjs` (D-11) — guard 1: `NODE_ENV=production` → exit 1; guard 2: непустая `devices` → «База не пуста — seed пропущен» exit 1. Детерминированный mulberry32(сид 20260831): 5 отделов, 40 сотрудников (гендерно-согласованные русские имена, отделы по кругу), 80 устройств (40 ноутбуков / 15 мониторов / 10 док-станций / 15 периферии) с типизированными полями (ram_gb/ram_upgraded ~30%/ssd_gb; diagonal 24/27/32 + IPS; port_count 6–12; peripheral_kind по модели), серийники SN-XXXXNN (уникальны по построению), инвентарники ИБ-0000NNN (~20% NULL, D-16), нормализованные колонки строго через импорт из lib/normalize.mjs. Статусы и история в одной транзакции: received у всех (occurred_at = purchase_date), assigned у ~62% (occurred_at позже, to = сотрудник) + UPDATE projection; остальные in_stock. Финальная сводка печатает счётчики по типам.

## Deviations from Plan

None — план исполнен как написан. Мелкая механическая адаптация: тест импортирует `@/lib/normalize` без расширения `.ts` (tsconfig без `allowImportingTsExtensions`; конвенция существующих тестов) — тот же модуль, что и в плане.

## Verification Results

- `npx vitest run tests/normalize.test.ts` → 6/6; полный набор `npx vitest run` → **29/29 зелёные**
- reset-admin на копии `./data/app.db` → «Пароль обновлён», `bcrypt.compareSync('NewPass-2026-x', hash)` = true
- `DATABASE_PATH=/tmp/empty.db node scripts/reset-admin.mjs` → «Пользователь не найден — запустите create-admin», exit 1
- `grep -c "console.log(.*password" scripts/reset-admin.mjs` = 0
- seed на temp-БД после `drizzle-kit migrate`: exit 0, сводка «отделов 5, сотрудников 40, устройств 80 (40/15/10/15), движений 130 (received 80, assigned 50)»; employees 40 ∈ [30,50], devices 80 ∈ [75,85], movements 130 ≥ 80
- Консистентность: дубликатов serial_normalized = 0; assigned → ровно 2 движения и корректный current_employee_id; in_stock → ровно received; у ноутбуков ram/ram_upgraded/ssd заполнены; инвентарных дублей = 0
- Guards: `NODE_ENV=production` → «Seed запрещён в production» exit 1; повторный запуск → «База не пуста — seed пропущен» exit 1; повторный прогон на свежей базе даёт идентичную сводку (детерминизм)
- `npx eslint` на всех 5 новых файлах → чисто

## Known Stubs

Нет.

## Authentication Gates

Не встречались.

## Deferred Issues

- `./data/app.db` остаётся пустым (seed запускается разработчиком вручную против `DATABASE_PATH=./data/app.db node scripts/seed.mjs` при необходимости) — осознанный выбор: рабочая база не засоряется тестовыми данными без спроса.

## Self-Check: PASSED

- Файлы: lib/normalize.mjs, lib/normalize.ts, tests/normalize.test.ts, scripts/reset-admin.mjs, scripts/seed.mjs — FOUND
- Коммиты: 3f1b0f7, 6de320b — FOUND в git log
