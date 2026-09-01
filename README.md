# Barahlo — учёт корпоративной техники

Внутреннее веб-приложение для учёта корпоративного оборудования (ноутбуки, мониторы, док-станции, периферия). Один пользователь (руководитель), русский интерфейс, SQLite.

## Стек

Next.js 16 (App Router, proxy.ts, Server Actions) · SQLite + better-sqlite3 + Drizzle ORM · Tailwind CSS 4 · jose-сессии · bcryptjs

## Quickstart (локальная разработка)

Требуется Node 22+ (LTS).

```bash
npm install

# 1. Настройки окружения
cp .env.example .env
# сгенерируйте секрет для подписи сессий и впишите его в .env (AUTH_SECRET):
openssl rand -base64 32

# 2. Примените схему БД (создаёт ./data/app.db — каталог data/ должен существовать)
mkdir -p data
npx drizzle-kit migrate

# 3. Создайте единственную учётку (CLI, веб-экрана создания нет)
node scripts/create-admin.mjs

# 4. Запуск
npm run dev
```

Откройте http://localhost:3000 — без входа любой адрес ведёт на страницу `/login`.

## Структура

- `app/` — маршруты (App Router); `app/login/` — вход; `app/(app)/` — защищённая зона
- `db/schema.ts` — схема SQLite (7 таблиц); `db/index.ts` — единственная точка подключения к БД
- `drizzle/` — миграции (только `generate` + `migrate`, не `push`)
- `lib/` — серверные утилиты (сессия, rate-limit, auth-guard)
- `scripts/` — CLI (`.mjs`): создание учётки, бэкапы
- `tests/` — vitest

## Проверки

```bash
npx vitest run     # тесты (схема, сессия, rate-limit, периметр)
npm run build      # prod-сборка (standalone)
```

## Проверка периметра

Приложение default-deny: без валидной сессии любой адрес ведёт на `/login` — включая `/api/*` и несуществующие пути. Проверка (на собранном проде: `npm run build && npm start`):

```bash
# Без cookie:
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/             # → 307 (redirect на /login)
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health   # → 307
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login-fake   # → 307 (соседний путь закрыт)
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login        # → 200

# С валидной сессией (Cookie: session=<jose-HS256-токен>):
curl -s -o /dev/null -w '%{http_code}' -H "Cookie: session=$TOKEN" http://localhost:3000/   # → 200
```

Это же — чек-лист приёмки фазы: без сессии ни один путь не отдаёт контент (307), с сессией защищённый каркас доступен (200). Ручная проверка в браузере: открыть `/` → редирект на `/login`; войти → каркас-экран с кнопкой «Выйти»; перезапустить браузер → сессия жива (cookie на 30 дней).

## Бэкапы и восстановление

### Что и куда складывается

Ночной бэкап (`node scripts/backup.mjs`) кладёт консистентный снимок в `<DATA_DIR>/backups/YYYY-MM-DD/` — внутри `app.db` (через online-_backup API `db.backup()`, безопасно под WAL) и копия `uploads/`. Хранится ровно 30 дневных копий, более старые удаляются при каждом запуске. По умолчанию `DATA_DIR=./data`.

### Ночной запуск (cron)

Строка cron (server-local время; ставится автоматически скриптом `deploy.sh`, см. «Деплой на сервер»):

```
0 2 * * * cd /путь/к/barahlo && docker compose exec -T app node scripts/backup.mjs
```

Бэкап выполняется внутри контейнера (scripts/ и better-sqlite3 есть в образе), `DATA_DIR=/app/data` берётся из `.env`. Ручная альтернатива без контейнера — host-node: `0 2 * * * cd /путь/к/barahlo && DATA_DIR=./data node scripts/backup.mjs >> data/backups/backup.log 2>&1` (требует `node_modules` на хосте).

Конвенция времени (одна на весь проект): **час 02:00 локального времени сервера; имя папки бэкапа = локальная дата сервера** (`YYYY-MM-DD`, не UTC). Повторный запуск в тот же день — идемпотентен (exit 0, ничего не пересоздаёт).

### Целостность

Каждая копия проверяется `PRAGMA integrity_check` сразу после создания: результат не `ok` → процесс завершается кодом 1 с сообщением в stderr. Брак не молчит: при exit 1 смотрите вывод cron / `docker logs`. Битая копия никогда не становится «новым оригиналом» — ротация её не спасает, смотрите предыдущий день.

### Восстановление (пошагово)

Выполнять только при остановленном контейнере:

1. Остановить контейнер: `docker compose down`
2. Отставить текущие данные в сторону: `mv data data.broken-$(date +%Y-%m-%d)`
3. Создать чистый каталог: `mkdir data`
4. Вернуть снимок целиком (app.db + uploads/): `cp -R data.broken-$(date +%Y-%m-%d)/backups/<день>/. data/`
5. Запустить снова: `docker compose up -d`
6. Проверить целостность поднятой базы: `node -e "const db=require('better-sqlite3')('data/app.db',{readonly:true});console.log(db.pragma('integrity_check',{simple:true}))"` — должно вывести `ok`
7. Выборочно проверить известную запись (например, `SELECT count(*) FROM devices;` или строку `users`)
8. Проверить вход в браузере

> На живом проде — только с остановленным контейнером (шаг 1 не опционален: SQLite под WAL не терпит подмены файла под живым процессом).

### Репетиция восстановления — выполнена

**Отметка: репетиция выполнена 2026-09-01, шаги 1–9 пройдены** (успех-критерий 4, локально на контейнерной стопке из плана 04).

Подготовка: стопка поднята, учётка на месте; через `docker compose exec -T app node -e` в `devices` добавлена контрольная запись — **до** снятия снимка (снимок обязан её содержать). Нюанс для ручного INSERT: у таблицы `devices` нет DB-дефолтов `created_at`/`updated_at` (их ставит Drizzle на уровне приложения) — при записи через `node -e` передать `unixepoch()` явно.

Шаги репетиции:

1. Снимок: `docker compose exec -T app node scripts/backup.mjs` → `./data/backups/2026-09-01/` (app.db + uploads/); содержимое снимка проверено до замены тома: integrity `ok`, users = 1, контрольная запись на месте
2. `docker compose down`
3. `mv data data.broken-2026-09-01`
4. `mkdir data` и `cp -R data.broken-2026-09-01/backups/2026-09-01/. data/`
5. `docker compose up -d`
6. `http://localhost:3000/login` → 200 (периметр не пострадал: `/` без сессии → 307)
7. `PRAGMA integrity_check` поднятой базы → `ok`
8. Учётка и контрольная запись на месте: users = 1, devices = 1 (`REH-CTRL-0001`)
9. Переживание рестарта: `docker compose down && docker compose up -d` → `/login` снова 200, данные на месте (успех-критерий 5)

По завершении стопка остановлена (`docker compose down`), вспомогательный каталог `data.broken-2026-09-01` удалён.

## Деплой на сервер

Приложение живёт на внутреннем сервере компании одним контейнером (порт `3000`), всё состояние — в примонтированном томе `./data:/app/data` (БД + uploads + бэкапы). Обновление — `git pull` + одна команда (D-08/09/10).

### Требования к серверу

- **Docker + compose plugin** — основной путь деплоя (D-08). Docker не нужен на хосте для Node-кода: сборка и работа — в контейнере.
- **Host Node ≥ 20.9** — нужен только для шага миграции: `drizzle-kit` — devDependency, миграция выполняется на хосте против `./data/app.db` через том (standalone-образ devDeps не содержит).
  - *Фолбэк при отсутствии host-Node:* разовый compose-сервис миграции из deps-стадии (там есть devDeps) — задокументированная альтернатива; при деплое заменить шаг `npx drizzle-kit migrate` на `docker compose run --rm --no-deps migrate`. Встроенного такого сервиса в `compose.yml` нет — добавляется при необходимости.
- **Canonical remote** — корпоративный GitLab, приватный (D-15); `git pull` деплоя тянется оттуда.

### Первый деплой

```bash
git clone <gitlab-url>/barahlo.git && cd barahlo   # или git pull, если уже склонировано

# 1. Env: прод-пути + секрет сессий
cp .env.example .env
# впишите в .env:
#   DATABASE_PATH=/app/data/app.db
#   DATA_DIR=/app/data
openssl rand -base64 32   # результат — в .env как AUTH_SECRET=...

# 2. Права на каталог данных (в контейнере процесс работает под uid 1000 — user node)
mkdir -p data && sudo chown -R 1000:1000 data

# 3. Деплой одной командой
bash scripts/deploy.sh
```

### Что делает `scripts/deploy.sh`

1. `npm ci` — devDeps на хосте для мигратора (шаг 4)
2. `git pull origin main` — обновление кода (без настроенного origin — предупреждение и продолжение)
3. `docker compose build` — пересборка образа
4. `npx drizzle-kit migrate` — миграции на хосте против `./data/app.db` через том (никогда `push`)
5. `docker compose up -d` — перезапуск контейнера
6. Идемпотентная установка cron-строки ночного бэкапа (`0 2 * * *`, `docker compose exec -T app node scripts/backup.mjs`) — повторный запуск не плодит дублей

Повторный деплой/обновление — та же команда: `bash scripts/deploy.sh`. Данные на томе переживают пересборку и перезапуск: `./data` не участвует в образе, только монтируется.

### Проверка после деплоя

```bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login   # → 200
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/        # → 307 (redirect на /login)
```

`/api/health` и все остальные пути без сессии закрыты периметром так же, как на dev — см. «Проверка периметра».

## Важные правила

- Схема БД меняется только миграциями: `npx drizzle-kit generate` → проверить SQL руками → `npx drizzle-kit migrate`. Никогда не использовать `drizzle-kit push`.
- История перемещений (`movements`) append-only: UPDATE/DELETE рвутся триггерами БД.
- Учётка — только через CLI (`scripts/create-admin.mjs`); повторное создание невозможно.
- Бэкап: `data/` — всё состояние системы (БД + uploads + backups).
