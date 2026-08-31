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

## Важные правила

- Схема БД меняется только миграциями: `npx drizzle-kit generate` → проверить SQL руками → `npx drizzle-kit migrate`. Никогда не использовать `drizzle-kit push`.
- История перемещений (`movements`) append-only: UPDATE/DELETE рвутся триггерами БД.
- Учётка — только через CLI (`scripts/create-admin.mjs`); повторное создание невозможно.
- Бэкап: `data/` — всё состояние системы (БД + uploads + backups).
