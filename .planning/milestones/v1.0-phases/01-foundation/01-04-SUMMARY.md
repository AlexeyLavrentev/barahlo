---
phase: 01
plan: 04
subsystem: foundation
tags: [docker, compose, deploy, standalone, better-sqlite3, volume, cron, backup]
requires: ["01-01 (standalone next.config.ts, схема, create-admin.mjs)", "01-03 (scripts/backup.mjs + cron-конвенция 0 2 * * *, README runbook)"]
provides:
  - "Dockerfile — официальный 3-стадийный standalone-паттерн (один ARG NODE_VERSION=24.13.0-slim, USER node, EXPOSE 3000, CMD node server.js) + 4 расширения для better-sqlite3: build-tools в deps, better-sqlite3+bcryptjs в runner, /app/data chown node, scripts/ в образе (D-08)"
  - "compose.yml — сервис app: 3000:3000 (D-09), env_file .env, том ./data:/app/data, restart unless-stopped"
  - ".dockerignore — контекст сборки без секретов/данных/planning (T-04-04, гигиена D-15)"
  - "scripts/deploy.sh — одна команда обновления: npm ci → git pull origin main → docker compose build → drizzle-kit migrate (host-side, пин ./data/app.db) → docker compose up -d + идемпотентный cron ночного бэкапа (D-10, D-07)"
  - "README «Деплой на сервер» — требования (host Node ≥ 20.9 + фолбэк A1/A6), шаги первого деплоя (uid 1000), контракт deploy.sh, post-deploy чек"
affects: ["01-05 (репетиция restore — стек уже поднимается/останавливается compose)", "фазы 2–6 (обновление той же командой deploy.sh)"]
tech-stack:
  added:
    - "docker compose (образ node:24.13.0-slim, standalone-рантайм)"
  patterns:
    - "Официальный with-docker паттерн + расширения для нативного модуля: один Node-мажор во всех стадиях, COPY нативного пакета поверх standalone"
    - "Всё состояние приложения — на bind-томе ./data:/app/data, не в образе"
    - "Host-side миграции (devDep drizzle-kit) с пином DATABASE_PATH=./data/app.db"
key-files:
  created:
    - Dockerfile
    - compose.yml
    - .dockerignore
    - scripts/deploy.sh
  modified:
    - .env.example
    - README.md
requirements-addressed: [ACC-02, ACC-03]
decisions:
  - "USER node (встроенный uid 1000 базового образа) вместо useradd nextjs из старой ревизии official-примера — совпадает с chown -R 1000:1000 data на сервере"
  - "deploy.sh пинит DATABASE_PATH=./data/app.db для host-side migrate: drizzle-kit подхватывает .env, а прод-.env содержит /app/data/app.db, которого на хосте нет (unpinned → exit 1 SQLITE_CANTOPEN — проверено в обе стороны)"
  - "crontab -l захватывается вне пайплайна (|| true): на свежем сервере crontab -l завершает кодом 1 и под set -o pipefail ронял бы скрипт на последнем шаге"
  - "cron-строка бэкапа — вариант docker compose exec -T app (бэкап внутри контейнера); README cron-раздел синхронизирован, host-node вариант оставлен ручной альтернативой"
deviations:
  - "[Rule 1] deploy.sh: голый `npx drizzle-kit migrate` из Pattern 6 ломался бы на сервере с прод-.env (пин пути добавлен)"
  - "[Rule 1] deploy.sh: пайплайн установки cron при пустом crontab ронял скрипт через set -o pipefail (захват + 3 ветви установки)"
  - "[minor] README cron-сниппет плана 03 приведён к фактически устанавливаемому deploy.sh варианту"
self-check: "see below"
---

# Phase 01 Plan 04: Docker-деплой одной командой Summary

Официальный standalone-образ с четырьмя расширениями под better-sqlite3, compose-стек с томом `./data:/app/data` и периметром, работающим внутри контейнера, плюс `scripts/deploy.sh` — обновление сервера сводится к `bash scripts/deploy.sh` (pull → build → migrate → up) с автоматической идемпотентной установкой ночного cron-бэкапа.

## What Was Built

- **Задача 1 (контейнер):** `Dockerfile` — официальный базис `examples/with-docker`, скачанный живьём с vercel/next.js canary и сохранённый дословно (3 стадии от одного `ARG NODE_VERSION=24.13.0-slim`, npm ci с cache-mounts, standalone/static/public копии, `USER node`, `EXPOSE 3000`, `ENV HOSTNAME=0.0.0.0`, `CMD ["node","server.js"]`) + ровно 4 расширения: (1) `python3 make g++` в deps до npm ci; (2) `COPY --from=builder --chown=node:node` для `node_modules/better-sqlite3` И `node_modules/bcryptjs` в runner после standalone; (3) `mkdir -p /app/data && chown node:node`; (4) `COPY scripts ./scripts`. `compose.yml` — сервис app дословно из PATTERNS (порт D-09, env_file, том, restart). `.dockerignore` — node_modules/.next/.git/data/.env/.planning/.claude/tests/*.md. `.env.example` дополнен прод-комментарием (`/app/data/...`, `openssl rand -base64 32`). README — раздел «Деплой на сервер»: требования (Docker+compose; host Node ≥ 20.9 для мигратора с документированным фолбэком A1/A6 — разовый compose-сервис миграции), первый деплой по шагам (`mkdir -p data && sudo chown -R 1000:1000 data` — Pitfall 4), контракт deploy.sh, post-deploy curl-чек.
- **Локальное контейнерное доказательство (verify):** `docker compose build` — зелёный; `npx drizzle-kit migrate` — exit 0; `.env` перезаписан прод-значениями по плану; `docker compose up -d` — контейнер слушает :3000; curl-матрица ВНУТРИ контейнера: `/login` 200, `/` 307, `/api/health` 307 (периметр не привязан к хосту — ACC-02, T-04-01); `create-admin.mjs` выполнен в контейнере — корректный отказ «Пользователь уже существует» (контейнер видит ./data/app.db через том — ветка отказа из акцептанса); после `docker compose restart` host-side чек `users==1` → `volume-persists` (критерий 5). Дополнительно: контейнер работает под `uid=1000(node)` (T-04-03), `.planning`/`.env` в образе отсутствуют (T-04-04), `grep -c "USER node" Dockerfile` = 1, один Node-мажор во всех стадиях, без Alpine.
- **Задача 2 (deploy.sh):** `set -euo pipefail`; шаги в порядке npm ci → git pull origin main → docker compose build → drizzle-kit migrate → docker compose up -d; идемпотентная установка host-cron строки `0 2 * * * cd <проект> && docker compose exec -T app node scripts/backup.mjs` (guard по `grep -F "scripts/backup.mjs"`); `chmod +x`. При отсутствии origin — предупреждение в stderr и продолжение (первый деплой до настройки D-15).
- **Проверка deploy.sh:** `bash -n` валиден; greps-акцептанс (npm ci / git pull / build / migrate / up — по порядку; `drizzle-kit push` = 0); плюс прогон с мок-бинарниками (npm/npx/docker/git/crontab в PATH) — дважды: порядок вызовов подтверждён, warning-ветка без origin отработала, сценарии пустого crontab / повторного запуска / постороннего crontab — без дублей и с сохранением чужих строк.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Голый `npx drizzle-kit migrate` из Pattern 6 ломался бы на сервере с прод-.env**
- **Found during:** Task 2 (пре-проверка перед написанием deploy.sh)
- **Issue:** drizzle-kit подхватывает `.env`; прод-.env (предписанный планом) содержит `DATABASE_PATH=/app/data/app.db` — путь, существующий только внутри контейнера. Host-side миграция уходила бы в несуществующий файл: проверено эмпирически — unpinned `npx drizzle-kit migrate` → exit 1, SQLITE_CANTOPEN; pinned `DATABASE_PATH=./data/app.db npx drizzle-kit migrate` → exit 0.
- **Fix:** шаг миграции в deploy.sh — `DATABASE_PATH=./data/app.db npx drizzle-kit migrate` (инлайн-переменная перекрывает .env), что и является семантикой плана «host-side против ./data/app.db через том».
- **Files modified:** scripts/deploy.sh
- **Commit:** b7981ec

**2. [Rule 1 - Bug] Установка cron-строки роняла скрипт на свежем сервере (set -o pipefail)**
- **Found during:** Task 2 (мок-прогон deploy.sh)
- **Issue:** `(crontab -l 2>/dev/null; echo …) | crontab -` при отсутствии crontab: `crontab -l` завершается кодом 1, pipefail делает пайплайн упавшим, `set -e` убивает скрипт после успешного деплоя; повторный запуск брал ветку «уже установлена» мимо фактической установки.
- **Fix:** `EXISTING_CRONTAB="$(crontab -l 2>/dev/null || true)"` + три ветви (уже есть → пропуск; пусто → установка; есть чужие → добавление с сохранением). Мок-прогон: пустой crontab → exit 0 + строка установлена; повтор → «пропускаю», дублей нет; посторонний crontab → чужая строка сохранена.
- **Files modified:** scripts/deploy.sh
- **Commit:** b7981ec

### Minor deviation
- README cron-сниппет из плана 03 (host-node `DATA_DIR=./data node scripts/backup.mjs`) приведён к варианту, фактически устанавливаемому deploy.sh (`docker compose exec -T app node scripts/backup.mjs` — предписан ключ-линком плана 04); host-node вариант оставлен в README как ручная альтернатива. Файл README.md и так в файлах задачи 1 — документация синхронна с поведением скрипта.

## Verification Results

- `docker compose build` → зелёный (образ barahlo-app, 3 стадии, базис вербатим с canary vercel/next.js)
- Периметр в контейнере: `/login` 200, `/` 307, `/api/health` 307 (все ассертированы)
- Том: create-admin в контейнере → «Пользователь уже существует» (корректная ветка при users=1 из плана 01); после `docker compose restart` → `volume-persists` (users==1)
- Образ: `USER node` ×1, uid=1000 в контейнере, без Alpine, один ARG/мажор; `.planning`/`.env`/`data` в образе отсутствуют; `.dockerignore` содержит data, .env, .planning, .claude
- `scripts/deploy.sh`: `bash -n` ok; greps ≥1 (npm ci, git pull origin main, docker compose build, drizzle-kit migrate, docker compose up -d, backup.mjs), `drizzle-kit push` = 0, порядок шагов подтверждён мок-прогоном; cron идемпотентен (3 сценария)
- `npx vitest run` → 36/36 зелёных (регрессии нет); стек после плана оставлен запущенным (`docker compose up -d`; остановить: `docker compose down`)

## Known Stubs

Нет. Код приложения не менялся — только деплой-обвязка и документация.

## Authentication Gates

Не встречались.

## Deferred Issues

- `.planning/config.json` (modified) и незафиксированные артефакты планировщика (`.planning/phases/01-foundation/01-PATTERNS.md`, `.planning/research/.cache/*`) — как и в 01-01/01-03, вне скоупа плана, остаются оркестратору фазы.
- Локальное доказательство собрано на linux/arm64 (Apple Silicon); серверная сборка возьмёт архитектуру сервера — в Dockerfile платформенных допущений нет. Реальный первый деплой зафиксирует профиль сервера (см. README).
- `.env` на этой машине теперь содержит прод-пути (`/app/data/...`) — состояние verify по плану; для локальной разработки вернуть локальные значения из `.env.example`. Host-side команды после плана 04 путь берут из пинов/дефолтов (deploy.sh пинит migrate), но `npm run dev` при таком `.env` будет искать БД в /app/data.

## Self-Check: PASSED

- Файлы: Dockerfile, compose.yml, .dockerignore, scripts/deploy.sh (созданы); .env.example, README.md (дополнены) — FOUND
- Коммиты: 8f6d0bd (task 1), b7981ec (task 2) — FOUND в git log
