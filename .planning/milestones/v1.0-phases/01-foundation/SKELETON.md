# Walking Skeleton — Barahlo (учёт корпоративной техники)

**Phase:** 1
**Generated:** 2026-08-31

## Capability Proven End-to-End

> Один руководитель открывает `http://<server>:3000`, без сессии попадает на страницу входа с любого адреса, входит по логину+паролю (учётка создана CLI-скриптом из реальной базы SQLite с полной схемой v1) и видит защищённый каркас-экран — а ночной бэкап и рестарт контейнера не теряют ни одной строки.

Это ровно один вертикальный срез на всю глубину стека: HTTP-запрос → `proxy.ts` (default-deny) → страница/Server Action → rate-limit → Drizzle/better-sqlite3 → SQLite-файл на томе → jose-сессия → обратно в браузер.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.3.3 App Router (Turbopack, TypeScript, Tailwind v4) | Locked by STACK.md; Server Components + Server Actions = один код без отдельного REST-слоя; `proxy.ts` (Node runtime) даёт default-deny периметр |
| Data layer | SQLite + better-sqlite3 13 + Drizzle 0.45 (`generate`+`migrate`, никогда `push`) | Один файл на томе, один писатель; миграции с первого дня создают полную схему v1: 7 таблиц, append-only триггеры `movements`, UNIQUE на нормализованных номерах (D-16/D-17/D-18) |
| Auth | jose HS256 signed HttpOnly cookie, 30 дней, bcryptjs cost 12, один аккаунт через CLI | ~50-строчная сессия вместо NextAuth (STACK.md); 30 дней и без Secure-флага — решения D-01/D-04; перебор ограничен фиксированным окном в памяти (D-03) |
| Deployment target | Docker standalone (официальный паттерн `with-docker`, `node:24-slim`, `USER node`) + compose + volume `./data:/app/data`; host-cron для ночного бэкапа | D-08/D-09/D-10; всё состояние системы в одном томе; планировщик бэкапа — host-cron, ставится `deploy.sh` (решение планировщика в рамках дискреции CONTEXT) |
| Directory layout | `app/` (routes + colocated `actions.ts`), `lib/` (server-only утилиты), `db/` (клиент + схема), `scripts/` (операционные CLI, `.mjs`), `tests/` (vitest) | Паттерны, которые фазы 2–6 копируют (01-CONTEXT: «фаза 1 задаёт паттерны») |

## Stack Touched in Phase 1

- [x] Project scaffold (Next.js 16, Turbopack, ESLint, vitest, `output: "standalone"`)
- [x] Routing — `/login` (публичная), `/` (за периметром), `/api/health` (за периметром)
- [x] Database — реальная запись (`create-admin` пишет `users`) и реальное чтение (login-action выбирает пользователя по `login`)
- [x] UI — форма входа (`useActionState` → Server Action → cookie → редирект на защищённый экран)
- [x] Deployment — локальный полный прогон: `drizzle-kit migrate` → `npm run dev` (D-12) и Docker compose locally (план 04–05), серверный деплой — по `scripts/deploy.sh` (чек-лист приёмки)

## Out of Scope (Deferred to Later Slices)

- Экраны реестра устройств, справочника сотрудников и отделов — фазы 2–3 (граница фазы в 01-CONTEXT)
- Выдача/возврат/передача, таймлайн, фото — фаза 4 (движения в этой фазе — только таблица + append-only триггеры)
- Поиск, фильтры, гарантийная подсветка — фаза 5; дашборд — фаза 6
- Раздел departments-справочника UI — фаза 2 (сейчас только таблица схемы, D-18)
- Email-восстановление пароля, веб-экран setup, роли/мультипользователь — вне продукта (D-02/D-13, REQUIREMENTS Out of Scope)
- CSV-экспорт — кандидат на решение при планировании фазы 5 (заметка ROADMAP)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: Справочник сотрудников (имя + отдел, архив) на паттернах `app/` + `requireSession()` + Apple-эстетика (EMP-01, EMP-03, UI-01, UI-02)
- Phase 3: Реестр устройств 4 типов на keystone-модуле `device_schema.ts` + серверная пагинация (REG-01..03)
- Phase 4: Выдача/возврат/передача одной транзакцией (INSERT в `movements` + проекция держателя), таймлайн, фото (MOVE-01..05, REG-04/05, EMP-02)
- Phase 5: Поиск по нормализованным номерам (`lib/normalize.mjs` переиспользуется), фильтры по индексированным колонкам (FIND-01..04, WAR-01, UI-03)
- Phase 6: Дашборд — read-модель поверх ядра (DASH-01..03)
