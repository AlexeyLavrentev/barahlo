---
phase: 01
plan: 03
subsystem: foundation
tags: [backup, sqlite, wal, integrity, rotation, runbook]
requires: ["01-01 (db/index.ts с прагмами, схема, drizzle-миграции, паттерн scripts/*.mjs)"]
provides:
  - "CLI scripts/backup.mjs (экспорт runBackup({dataDir, now}) + checkIntegrity) — ночной бэкап через better-sqlite3 db.backup() online API, PRAGMA integrity_check копии, копия uploads/, ротация ровно 30 дневных папок YYYY-MM-DD (D-05/06/07/14)"
  - "tests/backup.test.ts — 7 интеграционных кейсов: консистентность снимка под WAL, integrity_check, uploads рекурсивно, отсутствие uploads не роняет, идемпотентность дня, ротация 30, бракованная копия = exit 1 + stderr"
  - "README.md раздел «Бэкапы и восстановление» — runbook восстановления по шагам, cron-строка 0 2 * * * (server-local), конвенция «дата папки = локальная дата сервера»"
affects: ["01-04 (deploy.sh ставит cron-строку из README)", "01-05 (репетиция restore по runbook README)"]
tech-stack:
  added: []
  patterns:
    - "db.backup(destination) — единственный безопасный путь снимка под WAL (Pitfall 2); никакого копирования файлов app.db/-wal/-shm"
key-files:
  created:
    - scripts/backup.mjs
    - tests/backup.test.ts
  modified:
    - README.md
requirements-addressed: [ACC-03]
decisions: []
deviations:
  - "Задача 1 (RED d856e09 + GREEN fba734b) выполнена субагентом до 10-минутного таймаута неактивности; остаток плана (задача 2 README, SUMMARY, tracking) довершён оркестратором инлайн (stall-recovery по execute-phase.md) — содержание и критерии не менялись"
self-check: "see below"
---

# Plan 01-03 Summary: Ночной бэкап + runbook восстановления

## What Was Built

Ночная резервная копия одной командой: `node scripts/backup.mjs` делает консистентный снимок живой БД через `db.backup()` (online backup API — безопасен под WAL, запись не останавливает), копирует `uploads/`, проверяет КОПИЮ `PRAGMA integrity_check` (не `ok` → exit 1 + stderr, D-14), складывает в `<DATA_DIR>/backups/YYYY-MM-DD/` (локальная дата сервера, D-07/Pitfall 9) и держит ровно 30 дневных копий (D-06). Повторный запуск в тот же день идемпотентен. README дополнен разделом «Бэкапы и восстановление»: cron-строка `0 2 * * *` server-local, конвенция дат в одном месте, пошаговый runbook восстановления (down → отставить data → вернуть снимок → up → integrity_check → выборочная проверка → вход), пометка что репетиция — обязательный шаг приёмки фазы (успех-критерий 4).

## Tasks Completed

| Task | Name | Verification |
|------|------|--------------|
| 1 | Ночной бэкап: db.backup() + integrity_check + uploads + ротация 30 | `npx vitest run tests/backup.test.ts` — 7/7; CLI-прогон на /tmp/bk-cli: снимок создан, integrity ok, повтор — идемпотентен; `grep -cE "\bcp\(" scripts/backup.mjs` = 0; `db.backup(` ≥ 1; `KEEP_DAYS = 30` |
| 2 | Runbook восстановления + cron-конвенция в README | greps: `backups/` ×3, `integrity_check` ×2, `docker compose down` ×1, `0 2` ×1 — все > 0; шаги восстановления соответствуют структуре backups/<день>/{app.db,uploads/} |

## Verification

- `npx vitest run` — 36/36 зелёных (включая 7 backup-кейсов), exit 0
- CLI: `DATA_DIR=/tmp/bk-cli node scripts/backup.mjs` → «backup ok: …/2026-09-01»; повторный запуск → «уже есть», exit 0

## Self-Check: PASSED

Все acceptance criteria обоих задач подтверждены командами выше; запреты плана соблюдены (нет копирования файлов БД; ошибка целостности не молчит).

## Defer

- Установка cron-строки на сервере — план 04 (deploy.sh), здесь только документация.
- Репетиция восстановления — план 05 (успех-критерий 4 фазы).
- Pre-existing uncommitted planning artifacts (.planning/config.json, 01-PATTERNS.md, research cache) — остаются оркестратору (унаследовано от 01-01).
