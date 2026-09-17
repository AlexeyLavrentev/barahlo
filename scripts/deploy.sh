#!/usr/bin/env bash
# Одно-командный деплой/обновление на внутреннем сервере (D-10):
#   git pull origin main → npm ci → docker compose build → node scripts/migrate.mjs → docker compose up -d
# + идемпотентная установка host-cron строки ночного бэкапа (D-07: 02:00 server-local).
# Требования: Docker + compose; host Node >= 22 (для раннера миграций, см. README «Деплой на сервер»).
# Запуск из корня проекта на сервере: bash scripts/deploy.sh
set -euo pipefail

# Абсолютный путь каталога проекта (нужен для cd в cron-строке)
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# Порядок принципиален (WR-02): сначала git pull, потом npm ci — иначе миграция
# (шаг 4) выполнялась бы новым кодом со старыми зависимостями (better-sqlite3
# предыдущего коммита), а свежий npm ci доставался бы только со следующего прогона.
echo "==> [1/6] git pull origin main (корпоративный GitLab, D-15)"
if git remote get-url origin >/dev/null 2>&1; then
  git pull origin main
else
  echo "предупреждение: git remote 'origin' не настроен — пропускаю git pull (настройте remote по D-15)" >&2
fi

echo "==> [2/6] npm ci (node_modules на хосте — better-sqlite3 для раннера миграций, уже по свежему lockfile)"
npm ci

echo "==> [3/6] docker compose build"
docker compose build

echo "==> [4/6] node scripts/migrate.mjs (host-side, против ./data/app.db через том; никогда push)"
# DATABASE_PATH пинится явно: .env на сервере содержит прод-путь /app/data/app.db (для
# контейнера) и без пина раннер ушёл бы в несуществующий на сервере путь (проверено:
# unpinned → exit 1 SQLITE_CANTOPEN). Раннер вместо drizzle-kit migrate: recreation-
# миграции (например 0001, serial → nullable) CLI молча роняет на заполненной базе —
# RESTRICT от дочерних строк внутри его BEGIN; раннер ставит foreign_keys=OFF ДО BEGIN.
DATABASE_PATH=./data/app.db node scripts/migrate.mjs

echo "==> [5/6] docker compose up -d"
docker compose up -d

echo "==> [6/6] host-cron ночного бэкапа (D-07) — идемпотентно"
# Дублей не плодим: строка с scripts/backup.mjs добавляется только при отсутствии.
# crontab -l при ПУСТОМ crontab завершается с кодом 1 — ловим его вне пайплайна
# (иначе set -o pipefail убивает скрипт на свежем сервере без crontab).
EXISTING_CRONTAB="$(crontab -l 2>/dev/null || true)"
CRON_LINE="0 2 * * * cd ${PROJECT_DIR} && docker compose exec -T app node scripts/backup.mjs"
if printf '%s\n' "${EXISTING_CRONTAB}" | grep -F "scripts/backup.mjs" >/dev/null 2>&1; then
  echo "cron-строка бэкапа уже установлена — пропускаю"
elif [ -z "${EXISTING_CRONTAB}" ]; then
  printf '%s\n' "${CRON_LINE}" | crontab -
  echo "cron-строка бэкапа установлена: ${CRON_LINE}"
else
  printf '%s\n%s\n' "${EXISTING_CRONTAB}" "${CRON_LINE}" | crontab -
  echo "cron-строка бэкапа установлена: ${CRON_LINE}"
fi

echo "Готово. Проверка периметра: curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login  # → 200"
