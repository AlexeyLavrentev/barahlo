# Phase 1: Foundation - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Развёрнутый на внутреннем сервере каркас приложения: полная схема SQLite v1 (устройства, сотрудники, append-only `movements`, вложения, нормализованные серийные/инвентарные номера), единый вход (одна учётка), авторизация на каждом маршруте, автоматические бэкапы с отрепетированным восстановлением, работа одним Docker-контейнером с volume. UI этой фазы — только страница входа. Сотрудники/устройства/перемещения как экраны — фазы 2–4.

</domain>

<decisions>
## Implementation Decisions

### Аутентификация и сессия
- **D-01:** Сессия живёт 30 дней («запомнить меня»): залогинился раз, месяц не трогают. Риск минимален — личный инструмент в доверенной LAN.
- **D-02:** Восстановление при забытом пароле — CLI-команда на сервере (скрипт вида `node scripts/reset-admin.mjs`), задаёт новый пароль. Без email-восстановления, без env-пароля в открытом виде.
- **D-03:** Ограничение перебора на странице логина — обязательно (locking success criterion), механика на усмотрение планировщика.

### Сеть / TLS
- **D-04:** Plain HTTP в офисной LAN, без reverse proxy перед приложением. Cookie `Secure` flag не ставится (http). Самоподписанные сертификаты и internal CA — не нужны.

### Бэкапы
- **D-05:** Копии складываются на тот же сервер (volume вне контейнера, отдельная папка). NAS/вторая локация — не сейчас.
- **D-06:** Хранить 30 дневных копий, старше — удалять.
- **D-07:** Частота — раз в сутки (ночью). Потеря максимум за день приемлема: база меняется пару раз в день.

### Деплой
- **D-08:** Docker на сервере есть — основной путь деплоя: один контейнер + volume (docker compose), по официальному standalone-паттерну Next.js.
- **D-09:** Приложение слушает порт 3000, доступ `http://<server>:3000`.
- **D-10:** Обновление — git pull + скрипт деплоя одной командой на сервере (пересборка + перезапуск). CI/CD не нужен.

### Разработка
- **D-11:** Seed-скрипт с реалистичными фейками (30–50 сотрудников, ~80 устройств с моделями/серийниками) для локальной разработки — в прод не попадает, фазы 2–6 разрабатываются на живых данных.
- **D-12:** Разработка локально на маке (`npm run dev`, локальный SQLite-файл); Docker — только для прода.

### Claude's Discretion
- Механизм rate-limit (fixed window в памяти достаточен для одного пользователя)
- Форма и имя CLI-команды сброса пароля
- Планировщик бэкапа: cron внутри контейнера vs host-cron — на выбор планировщика
- Детальная схема БД — по `.planning/research/ARCHITECTURE.md` (six tables, hybrid movements pattern)
- bcrypt cost, размер cookie, прочие секьюрити-параметры по умолчанию

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Стек и версии
- `.planning/research/STACK.md` — зафиксированный стек: Next.js 16 (proxy.ts, async `cookies()`), better-sqlite3 13, Drizzle 0.45, jose-сессия, Tailwind 4; deployment-паттерн Docker standalone; what-NOT-to-use (NextAuth, Postgres, Alpine)

### Архитектура и схема
- `.planning/research/ARCHITECTURE.md` — модель данных (six tables), wide-table с typed nullable columns + `device_schema` модуль, hybrid append-only `movements` + проекция текущего держателя в одной транзакции, нормализованные серийники, build order

### Грабли фазы
- `.planning/research/PITFALLS.md` — обязательное для Phase 1: movements-таблица с первой миграции, нормализованные серийники с UNIQUE-индексами, auth-middleware на всё включая uploads, бэкап-рутина, гомоглифы

### Требования
- `.planning/REQUIREMENTS.md` — секция «Доступ и данные» (ACC-01..03)
- `.planning/ROADMAP.md` §Phase 1 — success criteria (5 штук)

</canonical_refs>

<code_context>
## Existing Code Insights

Greenfield — кода нет, репозиторий пуст (только `.planning/` и `.claude/CLAUDE.md`). Reusable-ассетов и установившихся паттернов не существует; данная фаза их создаёт.

### Reusable Assets
- None — greenfield

### Established Patterns
- None — greenfield; фаза 1 задаёт паттерны (auth-guard, DB-доступ, структура routes) для фаз 2–6

### Integration Points
- Новый код ни с чем не интегрируется; будущие фазы будут строиться на схеме БД и auth-guard из этой фазы

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 1-Foundation*
*Context gathered: 2026-08-31*
