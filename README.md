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

## Важные правила

- Схема БД меняется только миграциями: `npx drizzle-kit generate` → проверить SQL руками → `npx drizzle-kit migrate`. Никогда не использовать `drizzle-kit push`.
- История перемещений (`movements`) append-only: UPDATE/DELETE рвутся триггерами БД.
- Учётка — только через CLI (`scripts/create-admin.mjs`); повторное создание невозможно.
- Бэкап: `data/` — всё состояние системы (БД + uploads + backups).
