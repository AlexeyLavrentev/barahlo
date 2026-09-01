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

Строка cron (server-local время; устанавливается автоматически скриптом `deploy.sh` при деплое — см. план 04):

```
0 2 * * * cd /путь/к/barahlo && DATA_DIR=./data node scripts/backup.mjs >> data/backups/backup.log 2>&1
```

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

> Репетиция этой процедуры — обязательный шаг приёмки фазы 1 (успех-критерий 4, выполняется в плане 05). На живом проде — только с остановленным контейнером (шаг 1 не опционален: SQLite под WAL не терпит подмены файла под живым процессом).

## Важные правила

- Схема БД меняется только миграциями: `npx drizzle-kit generate` → проверить SQL руками → `npx drizzle-kit migrate`. Никогда не использовать `drizzle-kit push`.
- История перемещений (`movements`) append-only: UPDATE/DELETE рвутся триггерами БД.
- Учётка — только через CLI (`scripts/create-admin.mjs`); повторное создание невозможно.
- Бэкап: `data/` — всё состояние системы (БД + uploads + backups).
